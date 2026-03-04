import base64
import json
import logging
import os
import re
import subprocess
import time as _time
from pathlib import Path

import numpy as np
import cv2

from app.services.bedrock_marengo import (
    embed_image,
    embed_text,
    media_source_base64,
    start_video_embedding,
    get_async_invocation,
    load_video_embeddings_from_s3,
)
from app.services.bedrock_pegasus import analyze_video as pegasus_analyze_video
from app.services.s3_store import get_presigned_url, S3_BUCKET, S3_EMBEDDINGS_OUTPUT
from app.services.vector_store import (
    FIXED_INDEX_ID,
    add as index_add,
    search as index_search,
    list_entries as index_list,
    get_entry as index_get_entry,
    _save as vs_save,
    _index as vs_index,
)

log = logging.getLogger("app.utils.video_helpers")

_BACKEND_DIR = Path(__file__).resolve().parent.parent.parent
_INSIGHTS_CACHE_ROOT = _BACKEND_DIR / "data" / "videos"

_tasks: dict[str, dict] = {}
_video_list_cache: dict | None = None
_video_list_cache_ts: float = 0.0
_VIDEO_LIST_CACHE_TTL: float = 10.0


def get_insights_cache_dir(video_id: str) -> Path:
    """Local disk directory for cached insights (faces, object frames) for a video."""
    return _INSIGHTS_CACHE_ROOT / video_id


def save_face_to_disk(video_id: str, face_id: int, image_base64: str) -> str | None:
    """Save detected face image to data/videos/{video_id}/faces/face_{id}.png. Returns filename (e.g. face_0.png) or None."""
    if not image_base64:
        return None
    try:
        cache_dir = get_insights_cache_dir(video_id) / "faces"
        cache_dir.mkdir(parents=True, exist_ok=True)
        filename = f"face_{face_id}.png"
        path = cache_dir / filename
        path.write_bytes(base64.b64decode(image_base64))
        log.info("[CACHE] Saved face to %s", path)
        return filename
    except Exception as e:
        log.warning("[CACHE] Failed to save face %s for video %s: %s", face_id, video_id, e)
        return None


def load_face_from_disk(video_id: str, face_filename: str) -> str | None:
    """Load face image from disk; returns base64 string or None."""
    if not face_filename:
        return None
    try:
        path = get_insights_cache_dir(video_id) / "faces" / face_filename
        if not path.is_file():
            return None
        return base64.b64encode(path.read_bytes()).decode("utf-8")
    except Exception as e:
        log.warning("[CACHE] Failed to load face %s for video %s: %s", face_filename, video_id, e)
        return None


def save_object_frame_to_disk(video_id: str, object_label: str, timestamp: int | float, frame_bytes: bytes) -> str | None:
    """Save object frame to data/videos/{video_id}/objects/{slug}_{timestamp}.jpg. Returns filename or None."""
    if not frame_bytes:
        return None
    try:
        slug = re.sub(r"[^\w\-]", "-", (object_label or "object").strip().lower())[:50]
        slug = slug.strip("-") or "object"
        cache_dir = get_insights_cache_dir(video_id) / "objects"
        cache_dir.mkdir(parents=True, exist_ok=True)
        ts = int(timestamp) if isinstance(timestamp, (int, float)) else 0
        filename = f"{slug}_{ts}.jpg"
        path = cache_dir / filename
        path.write_bytes(frame_bytes)
        log.info("[CACHE] Saved object frame to %s", path)
        return filename
    except Exception as e:
        log.warning("[CACHE] Failed to save object frame for video %s: %s", video_id, e)
        return None


def load_object_frame_from_disk(video_id: str, filename: str) -> bytes | None:
    """Load object frame image from disk; returns bytes or None."""
    if not filename or ".." in filename or "/" in filename or "\\" in filename:
        return None
    try:
        path = get_insights_cache_dir(video_id) / "objects" / filename
        if not path.is_file():
            return None
        return path.read_bytes()
    except Exception as e:
        log.warning("[CACHE] Failed to load object frame %s for video %s: %s", filename, video_id, e)
        return None


def get_tasks():
    return _tasks


def invalidate_video_cache():
    global _video_list_cache
    _video_list_cache = None


def video_id_to_s3_uri(video_id: str) -> str | None:
    if not video_id:
        return None
    task = _tasks.get(video_id)
    if task and task.get("s3_uri"):
        return task["s3_uri"]
    entry = index_get_entry(video_id)
    if not entry:
        return None
    meta = entry.get("metadata") or {}
    s3_key = meta.get("s3_key")
    if s3_key and S3_BUCKET:
        return f"s3://{S3_BUCKET}/{s3_key}"
    stored_uri = meta.get("s3_uri")
    if stored_uri and isinstance(stored_uri, str) and stored_uri.startswith("s3://"):
        return stored_uri
    return None


VIDEO_ANALYSIS_PROMPT = """Analyze this video and respond with exactly one JSON object, no other text or markdown. Use this structure only:

{
  "title": "Short title for the video (e.g. Office Walkthrough — Building A, Floor 3)",
  "description": "One or two paragraph summary: what the video shows, context (e.g. compliance review, inspection), key areas covered, and who recorded it if evident.",
  "categories": ["Category1", "Category2", "Category3"],
  "topics": ["Topic1", "Topic2", "Topic3", "Topic4"],
  "riskLevel": "high" or "medium" or "low",
  "risks": [
    { "label": "Brief issue description", "severity": "high" or "medium" or "low", "timestamp": "M:SS" }
  ],
  "transcript": [
    { "time": "0:00", "text": "First words spoken at the start of the video" },
    { "time": "0:15", "text": "Next utterance..." },
    { "time": "1:30", "text": "Continue through to the end..." }
  ]
}

Rules:
- categories: 2–4 high-level labels (e.g. Workplace Safety, Facility Inspection, Compliance Audit).
- topics: 3–6 specific subjects covered (e.g. Fire safety equipment, Emergency exits, Workspace layout).
- riskLevel: overall risk for the video. risks: list every compliance or safety issue you notice. Each risk must have: label (short description), severity (high/medium/low), and timestamp (when in the video it occurs, in M:SS format, e.g. "0:00", "2:14", "1:05").
- transcript: produce a COMPLETE transcript for the ENTIRE video. CRITICAL: (1) The first segment MUST start at "0:00" (the very beginning). (2) The last segment MUST correspond to the end of the video—include speech right up to the final second. (3) Do not leave any time gaps: every part of the video from 0:00 to the end must be represented by transcript segments in chronological order. (4) Use verbatim or near-verbatim speech (word-for-word when possible). (5) Create a new segment every time the speaker changes or every 1–2 sentences; use timestamps in M:SS for the start of each segment. (6) For short videos use at least 15–20 segments; for longer videos use many more so the transcript is thorough. (7) Do not summarize, skip, or omit any part of the spoken content—transcribe what is said from beginning to end.
- Use only double quotes and valid JSON. No trailing commas."""


TRANSCRIPT_PROMPT = """Generate a COMPLETE, DETAILED transcript of this video. Transcribe ALL spoken words from start to finish with no gaps or summaries.

Requirements:
- Start at 0:00 and cover every second of speech until the end of the video.
- Use verbatim or near-verbatim wording. Include filler words (um, uh) and partial sentences if they are spoken.
- Create a new segment every time the speaker changes or every 1–2 sentences. Use timestamps in M:SS format (e.g. "0:00", "1:23", "12:05") for the start of each segment.
- For short videos provide at least 20–30 segments; for long videos provide many more so no speech is omitted.
- Include radio/phone dialogue, background conversations if audible, and any spoken instructions or announcements.
- Respond with ONLY a JSON array of segments, no other text. Example:
[{"time": "0:00", "text": "First words spoken."}, {"time": "0:12", "text": "Next sentence."}]
Use double quotes. "time" must be M:SS or M:MM:SS. "text" is the spoken content. No trailing commas."""


def parse_transcript_response(text: str) -> list[dict]:
    """Parse transcript-only API response into list of { time, text } segments."""
    if not text or not text.strip():
        return []
    raw = text.strip()
    m = re.search(r"\[[\s\S]*\]", raw)
    if not m:
        return []
    try:
        arr = json.loads(m.group(0))
    except json.JSONDecodeError:
        return []
    if not isinstance(arr, list):
        return []
    out = []
    for t in arr:
        if not isinstance(t, dict):
            continue
        time_str = str(t.get("time", t.get("timestamp", ""))).strip() or "0:00"
        text_str = str(t.get("text", t.get("content", ""))).strip()
        out.append({"time": time_str, "text": text_str})
    out.sort(key=lambda s: _timestamp_seconds_for_sort(s["time"]))
    return out


def _timestamp_seconds_for_sort(ts: str) -> float:
    parts = str(ts).strip().split(":")
    if not parts:
        return 0.0
    try:
        if len(parts) == 1:
            return float(parts[0])
        if len(parts) == 2:
            return float(parts[0]) * 60 + float(parts[1])
        return float(parts[0]) * 3600 + float(parts[1]) * 60 + float(parts[2])
    except (ValueError, IndexError):
        return 0.0


def parse_video_analysis_response(text: str) -> dict | None:
    if not text or not text.strip():
        return None
    raw = text.strip()
    m = re.search(r"```(?:json)?\s*([\s\S]*?)\s*```", raw)
    if m:
        raw = m.group(1).strip()
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        start = raw.find("{")
        if start >= 0:
            depth = 0
            for i in range(start, len(raw)):
                if raw[i] == "{":
                    depth += 1
                elif raw[i] == "}":
                    depth -= 1
                    if depth == 0:
                        try:
                            return json.loads(raw[start : i + 1])
                        except json.JSONDecodeError:
                            break
    return None


def normalize_video_analysis(data: dict) -> dict:
    title = data.get("title") or "Untitled"
    description = data.get("description") or ""
    categories = data.get("categories")
    if not isinstance(categories, list):
        categories = []
    categories = [str(c).strip() for c in categories if c]
    topics = data.get("topics")
    if not isinstance(topics, list):
        topics = []
    topics = [str(t).strip() for t in topics if t]
    risk_level = (data.get("riskLevel") or "medium").lower()
    if risk_level not in ("high", "medium", "low"):
        risk_level = "medium"
    risks = data.get("risks")
    if not isinstance(risks, list):
        risks = []
    out_risks = []
    for r in risks:
        if isinstance(r, dict) and r.get("label"):
            sev = (r.get("severity") or "medium").lower()
            if sev not in ("high", "medium", "low"):
                sev = "medium"
            ts = r.get("timestamp") or r.get("time")
            timestamp = str(ts).strip() if ts is not None and str(ts).strip() else None
            out_risks.append({
                "label": str(r["label"]).strip(),
                "severity": sev,
                "timestamp": timestamp,
            })
    transcript = data.get("transcript")
    if not isinstance(transcript, list):
        transcript = []
    out_transcript = []
    for t in transcript:
        if isinstance(t, dict) and (t.get("time") is not None or t.get("text")):
            out_transcript.append({
                "time": str(t.get("time", "")).strip() or "0:00",
                "text": str(t.get("text", "")).strip(),
            })

    def _timestamp_seconds(ts: str) -> float:
        """Parse M:SS or M:MM:SS to seconds for sorting."""
        parts = str(ts).strip().split(":")
        if not parts:
            return 0.0
        try:
            if len(parts) == 1:
                return float(parts[0])
            if len(parts) == 2:
                return float(parts[0]) * 60 + float(parts[1])
            return float(parts[0]) * 3600 + float(parts[1]) * 60 + float(parts[2])
        except (ValueError, IndexError):
            return 0.0

    out_transcript.sort(key=lambda seg: _timestamp_seconds(seg["time"]))

    return {
        "title": title,
        "description": description,
        "categories": categories,
        "topics": topics,
        "riskLevel": risk_level,
        "risks": out_risks,
        "transcript": out_transcript,
    }


def video_id_to_presigned_url(video_id: str) -> str | None:
    entry = index_get_entry(video_id)
    if not entry:
        return None
    meta = entry.get("metadata") or {}
    s3_key = meta.get("s3_key")
    if not s3_key:
        return None
    try:
        return get_presigned_url(s3_key)
    except Exception:
        return None


def extract_duration_and_thumbnail(video_bytes: bytes) -> tuple[float | None, bytes | None]:
    """Extract duration (seconds) and a mid-point thumbnail JPEG from raw video bytes in one FFprobe+FFmpeg pass."""
    import tempfile
    duration = None
    thumb = None
    tmp_path = None
    try:
        fd, tmp_path = tempfile.mkstemp(suffix=".mp4")
        os.write(fd, video_bytes)
        os.close(fd)
        probe = subprocess.run(
            ["ffprobe", "-v", "error", "-show_entries", "format=duration",
             "-of", "default=noprint_wrappers=1:nokey=1", tmp_path],
            capture_output=True, timeout=15, check=False,
        )
        if probe.returncode == 0 and probe.stdout.strip():
            try:
                duration = float(probe.stdout.strip())
            except ValueError:
                pass
        seek_t = (duration / 2) if duration and duration > 2 else 0
        thumb_result = subprocess.run(
            ["ffmpeg", "-y", "-loglevel", "error", "-ss", str(seek_t),
             "-i", tmp_path, "-vframes", "1",
             "-vf", "scale=480:-2", "-q:v", "5",
             "-f", "image2", "pipe:1"],
            capture_output=True, timeout=15, check=False,
        )
        if thumb_result.returncode == 0 and thumb_result.stdout:
            thumb = thumb_result.stdout
    except Exception as e:
        log.warning("extract_duration_and_thumbnail failed: %s", e)
    finally:
        if tmp_path:
            try:
                os.unlink(tmp_path)
            except OSError:
                pass
    return duration, thumb


def get_frame_bytes(video_id: str, t: float) -> bytes | None:
    url = video_id_to_presigned_url(video_id)
    if not url or t < 0:
        log.debug("get_frame_bytes: no url or invalid t=%.1f for video_id=%s", t, video_id)
        return None
    try:
        t0 = _time.perf_counter()
        result = subprocess.run(
            [
                "ffmpeg", "-y", "-loglevel", "error", "-ss", str(t),
                "-i", url, "-vframes", "1", "-f", "image2", "pipe:1",
            ],
            capture_output=True,
            timeout=30,
            check=False,
        )
        elapsed = _time.perf_counter() - t0
        if result.returncode == 0 and result.stdout:
            log.debug("Frame extracted: video_id=%s t=%.1f size=%d bytes (%.1fs)", video_id, t, len(result.stdout), elapsed)
            return result.stdout
        log.warning("ffmpeg failed for video_id=%s t=%.1f rc=%d stderr=%s", video_id, t, result.returncode, (result.stderr or b"")[:200])
    except subprocess.TimeoutExpired:
        log.warning("ffmpeg timed out for video_id=%s t=%.1f", video_id, t)
    except FileNotFoundError:
        log.error("ffmpeg not found on system PATH")
    return None


BLUR_VARIANCE_THRESHOLD = 150


def is_frame_blurred(frame_bytes: bytes, threshold: float = BLUR_VARIANCE_THRESHOLD) -> bool:
    if not frame_bytes:
        return True
    try:
        arr = np.frombuffer(frame_bytes, np.uint8)
        img = cv2.imdecode(arr, cv2.IMREAD_GRAYSCALE)
        if img is None:
            return True
        laplacian_var = cv2.Laplacian(img, cv2.CV_64F).var()
        return float(laplacian_var) < threshold
    except Exception:
        return True


def get_face_from_video_frames(video_id: str, clips: list[dict]) -> str | None:
    from app.utils.faces import detect_and_crop_faces
    if not clips:
        log.debug("get_face_from_video_frames: no clips for video_id=%s", video_id)
        return None
    timestamps_to_try: list[float] = []
    for clip in clips[:3]:
        start = float(clip.get("start", 0))
        end = float(clip.get("end", start + 1))
        duration = max(end - start, 0.5)
        for frac in (0.2, 0.5, 0.8):
            t = start + duration * frac
            timestamps_to_try.append(t)
    log.debug("get_face_from_video_frames: trying %d timestamps for video_id=%s", len(timestamps_to_try), video_id)
    for t in timestamps_to_try:
        frame_bytes = get_frame_bytes(video_id, t)
        if not frame_bytes:
            continue
        if is_frame_blurred(frame_bytes):
            log.debug("Skipping blurred frame at t=%.1f", t)
            continue
        try:
            faces = detect_and_crop_faces(frame_bytes, output_size=256)
            if faces:
                log.info("Face found in video frame at t=%.1f (confidence=%.4f)", t, faces[0]["confidence"])
                return faces[0].get("image_base64")
        except Exception as e:
            log.warning("Face detection failed at t=%.1f: %s", t, e)
            continue
    log.info("No face found in video_id=%s across %d timestamps", video_id, len(timestamps_to_try))
    return None


def normalize_label_for_match(label: str) -> str:
    return " ".join((label or "").lower().strip().split())


def labels_match(object_label: str, rek_label_name: str) -> bool:
    a = normalize_label_for_match(object_label)
    b = normalize_label_for_match(rek_label_name)
    if a == b:
        return True
    if a in b or b in a:
        return True
    a_words = set(a.split())
    b_words = set(b.split())
    return bool(a_words & b_words)


def get_object_bbox_from_frame(frame_bytes: bytes, object_label: str) -> dict | None:
    if not frame_bytes or not (object_label or "").strip():
        return None
    try:
        import boto3
        client = boto3.client("rekognition", region_name=os.environ.get("AWS_REGION", "us-east-1"))
        log.debug("Calling Rekognition detect_labels for '%s' (%d bytes)", object_label, len(frame_bytes))
        response = client.detect_labels(
            Image={"Bytes": frame_bytes},
            MaxLabels=50,
        )
    except Exception as e:
        log.warning("Rekognition detect_labels FAILED: %s", e)
        return None
    labels_found = [l.get("Name", "") for l in response.get("Labels", [])]
    log.debug("Rekognition labels: %s", labels_found[:15])
    for label_obj in response.get("Labels", []):
        name = (label_obj.get("Name") or "").strip()
        if not labels_match(object_label, name):
            continue
        instances = label_obj.get("Instances") or []
        if not instances:
            log.debug("Label '%s' matched but no instances with bbox", name)
            continue
        box = instances[0].get("BoundingBox")
        if not box:
            continue
        left = float(box.get("Left", 0))
        top = float(box.get("Top", 0))
        width = float(box.get("Width", 0))
        height = float(box.get("Height", 0))
        if width <= 0 or height <= 0:
            continue
        log.debug("BBox for '%s': left=%.3f top=%.3f w=%.3f h=%.3f", object_label, left, top, width, height)
        return {"left": left, "top": top, "width": width, "height": height}
    log.debug("No matching bbox for '%s' in Rekognition response", object_label)
    return None


DETECT_PROMPT = """Analyze this video carefully and return a single JSON object with two keys: "objects" and "face_keyframes".

1. "objects": List ALL objects relevant to safety, compliance, operations, and the scene that are clearly visible. Be COMPREHENSIVE—tag every notable item you see. Include (with timestamp in seconds when first clearly visible or most prominent):

   Safety & compliance: fire extinguisher, emergency exit, exit sign, first aid kit, defibrillator, AED, safety signage, hazard warning, caution tape, barrier, cone, cordon, PPE (helmet, hard hat, vest, high-vis, goggles, gloves, mask, respirator), emergency door, stairwell, fire alarm, smoke detector, sprinkler, extinguisher cabinet, emergency lighting, evacuation route sign, no-entry sign, safety equipment, eyewash station, safety shower, spill kit, MSDS area, hazardous materials label, chemical container, oxygen tank.

   Vehicles & transport: vehicle, car, truck, van, motorcycle, bicycle, patrol car, ambulance, police vehicle, dashboard, steering wheel, license plate, headlights, windshield.

   Buildings & infrastructure: door, gate, fence, window, stair, ramp, elevator, hallway, corridor, parking lot, road, intersection, traffic light, stop sign, crosswalk.

   Law enforcement / bodycam: body camera, radio, handcuffs, badge, uniform, weapon, holster, flashlight, baton, evidence bag, clipboard, ID card, document, phone, tablet, dashboard camera.

   General scene: person, people, crowd, building, street, sidewalk, interior, exterior, desk, table, chair (if in a compliance/safety context), whiteboard, monitor, screen, key, lock.

   List each object with a short, descriptive tag (e.g. "Fire extinguisher", "Patrol car", "Officer badge", "Emergency exit sign"). Use the timestamp in seconds. Do NOT list purely decorative items (vase, painting, potted plant) unless they are relevant to the scene. Aim for 15–40 object tags if the video shows that much; do not skip items.

2. "face_keyframes": Provide timestamps for UNIQUE, CLEAR faces only. Critical rules:
   - Identify each DISTINCT INDIVIDUAL in the video. For each person, choose ONE timestamp where that person's face is MOST CLEARLY visible: front-facing or near front-facing, full face (eyes, nose, mouth), well-lit, not blurred, not obscured. We need one best frame per unique person—do not list the same person multiple times at different angles (e.g. front and profile of the same officer count as one person; pick the timestamp where their face is clearest).
   - Include ONLY moments where the face is clearly identifiable: good lighting, face fills a reasonable part of the frame, looking at or toward the camera. Do NOT include: back of head, severe profile, face in shadow, face blocked by hands/mask/obstruction, person too far or blurry.
   - List up to 5 timestamps—one per distinct individual. If there are 2 people in the video, list 2 timestamps (their clearest moment each). If 5 people, list 5. Do not duplicate the same person; do not add weak or duplicate-angle shots.
   - Each entry: "timestamp" (seconds) and "description" (e.g. "Officer 1, face clear and front-facing").

Respond with ONLY a JSON object in this exact shape. CRITICAL: You MUST analyze the video and set every "timestamp" to the actual second (0, 1, 2, ... to end of video) when that object or face appears. Do NOT use the placeholder value -1—replace all -1 values with real timestamps from the video.

{
  "objects": [
    {"object": "Fire extinguisher", "timestamp": -1},
    {"object": "Emergency exit sign", "timestamp": -1}
  ],
  "face_keyframes": [
    {"timestamp": -1, "description": "Officer facing camera"},
    {"timestamp": -1, "description": "Second person face visible"}
  ]
}

Rules:
- Use only double quotes and valid JSON. No trailing commas.
- "timestamp" must be a number: the actual second (from 0 to video end) when that object or face appears in the video you are analyzing. Never use placeholder or example values.
- For objects: be thorough—list many tags (15–40+ if the video contains them). Each object appears once with its real timestamp from the video.
- For face_keyframes: one timestamp per UNIQUE person—the second when that person's face is clearest and most front-facing. Same person at different orientations = one entry (pick their best moment). Use real seconds from the video. Up to 5 entries (one per distinct individual)."""

CRUCIAL_OBJECT_KEYWORDS = frozenset([
    "fire", "extinguisher", "exit", "emergency", "sign", "safety", "first aid", "ppe", "helmet",
    "vest", "goggle", "alarm", "sprinkler", "hazard", "warning", "stair", "door", "gate",
    "vehicle", "car", "truck", "van", "motorcycle", "bicycle", "patrol", "ambulance", "dashboard",
    "equipment", "compliance", "evacuation", "oxygen", "defibrillator", "aed", "kit",
    "barrier", "cone", "tape", "cordon", "msds", "chemical", "spill", "eye wash", "shower",
    "badge", "uniform", "radio", "body", "camera", "handcuff", "weapon", "holster", "flashlight",
    "fence", "window", "ramp", "elevator", "hallway", "road", "traffic", "light", "stop", "crosswalk",
    "person", "people", "building", "street", "desk", "table", "monitor", "screen", "key", "lock",
    "document", "phone", "tablet", "evidence", "clipboard", "plate", "license", "headlight",
])


def is_crucial_object(label: str) -> bool:
    lower = label.lower().strip()
    return any(k in lower for k in CRUCIAL_OBJECT_KEYWORDS)


def parse_detect_response(text: str) -> dict:
    """
    Parse the combined detect prompt response.
    Returns {"objects": [...], "face_keyframes": [...]}.
    """
    raw = (text or "").strip()
    log.info("[DETECT_PARSE] Raw Pegasus response (%d chars):\n%s", len(raw), raw)

    # Try to extract JSON object from the response
    m = re.search(r"```(?:json)?\s*([\s\S]*?)\s*```", raw)
    if m:
        raw = m.group(1).strip()

    parsed = None
    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError:
        start = raw.find("{")
        if start >= 0:
            depth = 0
            for i in range(start, len(raw)):
                if raw[i] == "{":
                    depth += 1
                elif raw[i] == "}":
                    depth -= 1
                    if depth == 0:
                        try:
                            parsed = json.loads(raw[start : i + 1])
                        except json.JSONDecodeError:
                            pass
                        break

    if not parsed or not isinstance(parsed, dict):
        # Fallback: try to find a JSON array (old objects-only format)
        arr_match = re.search(r"\[[\s\S]*\]", (text or "").strip())
        if arr_match:
            try:
                arr = json.loads(arr_match.group(0))
                if isinstance(arr, list):
                    log.warning("[DETECT_PARSE] Got array instead of object; treating as objects-only")
                    return {"objects": arr, "face_keyframes": []}
            except json.JSONDecodeError:
                pass
        log.error("[DETECT_PARSE] Could not parse response as JSON")
        return {"objects": [], "face_keyframes": []}

    # Extract objects
    raw_objects = parsed.get("objects") or []
    objects = []
    if isinstance(raw_objects, list):
        for item in raw_objects:
            if not isinstance(item, dict):
                continue
            obj = item.get("object") or item.get("label") or item.get("name")
            ts = item.get("timestamp") or item.get("time")
            if obj and ts is not None:
                try:
                    t = int(ts) if isinstance(ts, int) else int(float(ts))
                    if t >= 0 and is_crucial_object(str(obj)):
                        objects.append({"object": str(obj).strip(), "timestamp": t})
                except (TypeError, ValueError):
                    pass

    # Extract face keyframes
    raw_kf = parsed.get("face_keyframes") or parsed.get("keyframes") or []
    face_keyframes = []
    if isinstance(raw_kf, list):
        for item in raw_kf:
            if not isinstance(item, dict):
                continue
            ts = item.get("timestamp") or item.get("time")
            desc = item.get("description") or item.get("desc") or ""
            if ts is not None:
                try:
                    t = float(ts)
                    if t >= 0:
                        face_keyframes.append({
                            "timestamp": round(t, 1),
                            "description": str(desc).strip(),
                        })
                except (TypeError, ValueError):
                    pass

    log.info("[DETECT_PARSE] Parsed: %d objects, %d face_keyframes", len(objects), len(face_keyframes))
    for o in objects:
        log.info("  [OBJ] %s at t=%ss", o["object"], o["timestamp"])
    for kf in face_keyframes:
        log.info("  [FACE_KF] t=%ss — %s", kf["timestamp"], kf["description"])

    return {"objects": objects, "face_keyframes": face_keyframes}


def _cosine(a, b):
    va = np.array(a, dtype=np.float64)
    vb = np.array(b, dtype=np.float64)
    na, nb = np.linalg.norm(va), np.linalg.norm(vb)
    if na == 0 or nb == 0:
        return 0.0
    return float(np.dot(va, vb) / (na * nb))


def _clip_list_for_face_search(all_clips: list[dict], visual_only: bool) -> list[dict]:
    """Filter to clip-scope embeddings; for face/entity search use only visual (not audio)."""
    clips = [c for c in all_clips if c.get("embeddingScope") == "clip"]
    if visual_only:
        clips = [c for c in clips if c.get("embeddingOption") in (None, "visual")]
    return clips


def clip_search(
    query_emb: list[float],
    output_s3_uri: str,
    top_n: int = 5,
    min_score: float | None = None,
    visual_only: bool = False,
) -> list[dict]:
    all_clips = load_video_embeddings_from_s3(output_s3_uri)
    clips = _clip_list_for_face_search(all_clips, visual_only)
    if not clips:
        return []
    scored = []
    for c in clips:
        sim = _cosine(query_emb, c["embedding"])
        if min_score is not None and sim < min_score:
            continue
        scored.append({
            "start": c.get("startSec", 0),
            "end": c.get("endSec", 0),
            "score": round(sim, 6),
            "type": c.get("embeddingOption", "visual"),
        })
    scored.sort(key=lambda x: -x["score"])
    if not scored:
        return []
    if top_n == 1:
        return [scored[0]]
    merged: list[dict] = []
    for s in scored:
        overlap = False
        for m in merged:
            if s["start"] < m["end"] + 3 and s["end"] > m["start"] - 3:
                m["start"] = min(m["start"], s["start"])
                m["end"] = max(m["end"], s["end"])
                m["score"] = max(m["score"], s["score"])
                overlap = True
                break
        if not overlap:
            merged.append(dict(s))
        if len(merged) >= top_n:
            break
    merged.sort(key=lambda x: -x["score"])
    return merged[:top_n]


def best_clip_score(
    query_emb: list[float], output_s3_uri: str, visual_only: bool = False
) -> float:
    all_clips = load_video_embeddings_from_s3(output_s3_uri)
    clips = _clip_list_for_face_search(all_clips, visual_only)
    if not clips:
        return 0.0
    best = 0.0
    for c in clips:
        sim = _cosine(query_emb, c["embedding"])
        if sim > best:
            best = sim
    return round(best, 6)


def _clip_timestamps_for_face_sampling(
    clips: list[dict],
    entity_emb: list[float],
    max_clips: int = 10,
    points_per_clip: int = 3,
    add_uniform_grid_sec: float | None = 6.0,
    max_grid_span_sec: float = 120.0,
) -> list[float]:
    """
    Get timestamps to sample for face matching. Score each clip by similarity to
    entity embedding, then sample from the TOP-SCORING clips at multiple points
    (start/mid/end). Also add a uniform time grid so we don't miss the person
    if they appear in a segment that had low clip-level score.
    """
    if not clips or not entity_emb:
        return []
    scored = []
    for c in clips:
        sim = _cosine(entity_emb, c["embedding"])
        start = float(c.get("startSec", 0))
        end = float(c.get("endSec", start + 1))
        scored.append({"start": start, "end": end, "score": sim})
    scored.sort(key=lambda x: -x["score"])
    timestamps = []
    seen_sec = set()
    for s in scored[:max_clips]:
        start, end = s["start"], s["end"]
        duration = max(end - start, 0.5)
        for i in range(points_per_clip):
            frac = (i + 1) / (points_per_clip + 1)
            t = start + duration * frac
            key = int(t)
            if key not in seen_sec:
                seen_sec.add(key)
                timestamps.append(t)
    if add_uniform_grid_sec and add_uniform_grid_sec > 0:
        video_end = max((c.get("endSec", 0) for c in clips), default=60.0)
        span = min(video_end, max_grid_span_sec)
        t = 0.0
        while t <= span:
            key = int(t)
            if key not in seen_sec:
                seen_sec.add(key)
                timestamps.append(t)
            t += add_uniform_grid_sec
    timestamps.sort()
    return timestamps


def face_match_score_in_video(
    entity_emb: list[float],
    video_id: str,
    output_s3_uri: str,
    max_frames: int = 24,
) -> tuple[float, list[dict]]:
    """
    Score how well an entity (face) matches this video by extracting frames at timestamps
    in the clips most similar to the entity, then detecting faces with ResNet10 SSD and
    comparing embeddings. Returns (best_score, matching segments).
    """
    from app.utils.faces import detect_and_crop_faces
    log.info("face_match_score_in_video: video_id=%s output=%s", video_id, output_s3_uri[:80])
    all_clips = load_video_embeddings_from_s3(output_s3_uri)
    clips = _clip_list_for_face_search(all_clips, visual_only=True)
    if not clips:
        log.warning("No visual clips found for video_id=%s", video_id)
        return 0.0, []
    timestamps = _clip_timestamps_for_face_sampling(
        clips, entity_emb, max_clips=12, points_per_clip=3
    )
    log.info("Sampling %d timestamps for face matching in video_id=%s", len(timestamps), video_id)
    best_score = 0.0
    matching_clips: list[dict] = []
    frames_checked = 0
    faces_compared = 0
    for t in timestamps:
        frame_bytes = get_frame_bytes(video_id, t)
        if not frame_bytes or is_frame_blurred(frame_bytes):
            continue
        frames_checked += 1
        try:
            faces = detect_and_crop_faces(frame_bytes, output_size=256, min_confidence=0.55)
            for face in faces:
                embed_b64 = face.get("embedding_crop_base64") or face.get("image_base64")
                if not embed_b64:
                    continue
                import base64
                face_bytes = base64.b64decode(embed_b64)
                media = media_source_base64(face_bytes)
                face_emb = embed_image(media)
                sim = _cosine(entity_emb, face_emb)
                faces_compared += 1
                log.debug("Face at t=%.1f: sim=%.4f conf=%.3f", t, sim, face["confidence"])
                if sim > best_score:
                    best_score = sim
                if sim >= ENTITY_CLIP_MIN_SCORE:
                    matching_clips.append({
                        "start": t - 2.0,
                        "end": t + 2.0,
                        "score": round(sim, 6),
                    })
        except Exception as e:
            log.warning("Face compare failed at t=%.1f: %s", t, e)
            continue
    matching_clips.sort(key=lambda x: -x["score"])
    merged = []
    for seg in matching_clips:
        overlap = False
        for m in merged:
            if seg["start"] < m["end"] + 3 and seg["end"] > m["start"] - 3:
                m["start"] = min(m["start"], seg["start"])
                m["end"] = max(m["end"], seg["end"])
                m["score"] = max(m["score"], seg["score"])
                overlap = True
                break
        if not overlap:
            merged.append(seg)
    log.info(
        "face_match done: video_id=%s best_score=%.4f frames_checked=%d faces_compared=%d merged_clips=%d",
        video_id, best_score, frames_checked, faces_compared, len(merged),
    )
    return round(best_score, 6), merged[:15]


# Minimum cosine similarity for a clip/face to count as "this person appears here".
# Face-to-face matching tends to be more discriminative; keep threshold so only clear matches count.
ENTITY_CLIP_MIN_SCORE = 0.48


def extract_unique_faces_from_video(
    video_id: str,
    output_s3_uri: str,
    max_sample_frames: int = 20,
    face_min_confidence: float = 0.60,
) -> list[dict]:
    """
    Sample frames uniformly across the video, detect all faces using ResNet10 SSD,
    embed each, then deduplicate by cosine similarity to get unique individuals.
    Returns a list of unique face records with timestamps where each was seen.
    """
    from app.utils.faces import detect_and_crop_faces, embed_face_crop, deduplicate_faces

    log.info("extract_unique_faces: video_id=%s max_frames=%d", video_id, max_sample_frames)

    try:
        all_clips = load_video_embeddings_from_s3(output_s3_uri)
        clip_list = [c for c in all_clips if c.get("embeddingScope") == "clip"]
        if clip_list:
            video_end = max(c.get("endSec", 0) for c in clip_list)
        else:
            video_end = 300.0
    except Exception as e:
        log.warning("Could not load clips for duration estimate: %s", e)
        video_end = 300.0

    if video_end <= 0:
        video_end = 300.0

    step = max(video_end / max_sample_frames, 3.0)
    timestamps = []
    t = 2.0
    while t < video_end and len(timestamps) < max_sample_frames:
        timestamps.append(round(t, 1))
        t += step
    log.info("Sampling %d timestamps (step=%.1fs, duration=%.1fs)", len(timestamps), step, video_end)

    all_face_records: list[dict] = []
    for t in timestamps:
        frame_bytes = get_frame_bytes(video_id, t)
        if not frame_bytes:
            continue
        if is_frame_blurred(frame_bytes):
            log.debug("Skipping blurred frame at t=%.1f", t)
            continue
        faces = detect_and_crop_faces(frame_bytes, output_size=256, min_confidence=face_min_confidence)
        log.debug("t=%.1f: detected %d faces", t, len(faces))
        for face in faces:
            emb = embed_face_crop(face)
            if emb is None:
                continue
            all_face_records.append({
                "embedding": emb,
                "confidence": face["confidence"],
                "image_base64": face.get("image_base64", ""),
                "bbox": face.get("bbox"),
                "timestamp": t,
            })

    log.info("Total face detections across all frames: %d", len(all_face_records))

    unique = deduplicate_faces(all_face_records)

    result = []
    for cluster in unique:
        result.append({
            "face_id": cluster["face_id"],
            "confidence": round(cluster["confidence"], 4),
            "image_base64": cluster["image_base64"],
            "bbox": cluster.get("bbox"),
            "timestamps": cluster["timestamps"],
            "appearance_count": cluster["count"],
        })

    log.info("Unique faces extracted: %d (from %d detections)", len(result), len(all_face_records))
    return result


def get_search_embedding_from_request(data: dict, request) -> tuple[list[float] | None, str | None, bool, str]:
    from app.utils.faces import embed_best_face_from_image
    query = (data.get("query") or data.get("text") or request.form.get("query") or "").strip()
    entity_ids = data.get("entity_ids")
    if entity_ids is None and data.get("entity_id"):
        entity_ids = [data.get("entity_id")]
    if not isinstance(entity_ids, list):
        entity_ids = []

    if entity_ids:
        entity_id = entity_ids[0]
        rec = index_get_entry(entity_id)
        if not rec:
            return None, None, False, f"Entity not found: {entity_id}"
        emb = rec.get("embedding")
        if not emb:
            return None, None, False, f"Entity has no embedding: {entity_id}"
        name = (rec.get("metadata") or {}).get("name") or entity_id
        return emb, f"Entity: {name}", True, None

    image_bytes = None
    if request.files and "image" in request.files:
        file = request.files["image"]
        if file.filename:
            image_bytes = file.read()
    if not image_bytes and data.get("image_base64"):
        try:
            import base64
            image_bytes = base64.b64decode(data["image_base64"])
        except Exception:
            pass
    if image_bytes:
        try:
            emb = embed_best_face_from_image(image_bytes)
            if emb is not None:
                return emb, "Image search (face)", True, None
            media = media_source_base64(image_bytes)
            emb = embed_image(media)
            return emb, "Image search", True, None
        except Exception as e:
            return None, None, False, str(e)

    if query:
        try:
            emb = embed_text(query)
            return emb, query, False, None
        except Exception as e:
            return None, None, False, str(e)

    return None, None, False, "Provide 'query', 'entity_id' / 'entity_ids', or 'image'."


def get_video_list_cache():
    global _video_list_cache, _video_list_cache_ts
    return _video_list_cache, _video_list_cache_ts, _VIDEO_LIST_CACHE_TTL


def set_video_list_cache(result):
    global _video_list_cache, _video_list_cache_ts
    _video_list_cache = result
    _video_list_cache_ts = _time.monotonic()

import json
import os
import re
import subprocess
import time as _time

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

# In-memory task and video list cache state
_tasks: dict[str, dict] = {}
_video_list_cache: dict | None = None
_video_list_cache_ts: float = 0.0
_VIDEO_LIST_CACHE_TTL: float = 10.0


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


def get_frame_bytes(video_id: str, t: float) -> bytes | None:
    url = video_id_to_presigned_url(video_id)
    if not url or t < 0:
        return None
    try:
        result = subprocess.run(
            [
                "ffmpeg", "-y", "-loglevel", "error", "-ss", str(t),
                "-i", url, "-vframes", "1", "-f", "image2", "pipe:1",
            ],
            capture_output=True,
            timeout=30,
            check=False,
        )
        if result.returncode == 0 and result.stdout:
            return result.stdout
    except (subprocess.TimeoutExpired, FileNotFoundError):
        pass
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
        return None
    timestamps_to_try: list[float] = []
    for clip in clips[:3]:
        start = float(clip.get("start", 0))
        end = float(clip.get("end", start + 1))
        duration = max(end - start, 0.5)
        for frac in (0.2, 0.5, 0.8):
            t = start + duration * frac
            timestamps_to_try.append(t)
    for t in timestamps_to_try:
        frame_bytes = get_frame_bytes(video_id, t)
        if not frame_bytes or is_frame_blurred(frame_bytes):
            continue
        try:
            faces = detect_and_crop_faces(frame_bytes, output_size=256)
            if faces:
                return faces[0].get("image_base64")
        except Exception:
            continue
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
        response = client.detect_labels(
            Image={"Bytes": frame_bytes},
            MaxLabels=50,
        )
    except Exception:
        return None
    for label_obj in response.get("Labels", []):
        name = (label_obj.get("Name") or "").strip()
        if not labels_match(object_label, name):
            continue
        instances = label_obj.get("Instances") or []
        if not instances:
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
        return {"left": left, "top": top, "width": width, "height": height}
    return None


OBJECTS_PROMPT = """Analyze this video and list only CRUCIAL objects relevant to safety, compliance, and operations. Include ONLY items such as: fire extinguisher, emergency exit, exit sign, first aid kit, safety signage, hazard warning, PPE (helmet, vest, goggles), emergency door, stairwell, fire alarm, sprinkler, safety equipment, vehicle (if relevant to scene), key doors or gates, hazardous materials or areas, compliance-related equipment. Do NOT list generic furniture or decor (e.g. chair, desk, lamp, bottle, plant, vase, book). For each object give the approximate timestamp in seconds when it is first clearly visible or most prominent. Respond with only a JSON array, no other text. Example:
[{"object": "Fire extinguisher", "timestamp": 45}, {"object": "Emergency exit sign", "timestamp": 12}, {"object": "Safety helmet", "timestamp": 90}]
Use double quotes. timestamp must be a number (seconds). List only objects that are clearly visible and crucial for safety or compliance."""

CRUCIAL_OBJECT_KEYWORDS = frozenset([
    "fire", "extinguisher", "exit", "emergency", "sign", "safety", "first aid", "ppe", "helmet",
    "vest", "goggle", "alarm", "sprinkler", "hazard", "warning", "stair", "door", "gate",
    "vehicle", "equipment", "compliance", "evacuation", "oxygen", "defibrillator", "kit",
    "barrier", "cone", "tape", "cordon", "msds", "chemical", "spill", "eye wash", "shower",
])


def is_crucial_object(label: str) -> bool:
    lower = label.lower().strip()
    return any(k in lower for k in CRUCIAL_OBJECT_KEYWORDS)


def parse_objects_response(text: str) -> list[dict]:
    raw = (text or "").strip()
    m = re.search(r"\[[\s\S]*\]", raw)
    if m:
        raw = m.group(0)
    try:
        arr = json.loads(raw)
        if not isinstance(arr, list):
            return []
        out = []
        for item in arr:
            if isinstance(item, dict):
                obj = item.get("object") or item.get("label") or item.get("name")
                ts = item.get("timestamp") or item.get("time")
                if obj and ts is not None:
                    try:
                        t = int(ts) if isinstance(ts, int) else int(float(ts))
                        if t >= 0 and is_crucial_object(str(obj)):
                            out.append({"object": str(obj).strip(), "timestamp": t})
                    except (TypeError, ValueError):
                        pass
        return out
    except json.JSONDecodeError:
        return []


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


# Minimum cosine similarity for a clip to count as "this person appears here".
# Raised from 0.38 so entity search returns only videos where that specific face is likely present.
ENTITY_CLIP_MIN_SCORE = 0.50


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

import base64
import json
import logging
import math
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
_VIDEO_LIST_CACHE_TTL: float = 300.0

# ---------------------------------------------------------------------------
# Background Bedrock job queue + auto-poller
# ---------------------------------------------------------------------------
import threading
import queue as _queue_mod

_bedrock_queue: _queue_mod.Queue = _queue_mod.Queue()
_poller_jobs: list[dict] = []
_poller_lock = threading.Lock()
_worker_started = False
_poller_started = False

_BEDROCK_INTER_JOB_DELAY = 5.0
_POLL_INTERVAL = 15.0
_POLL_MAX_WAIT = 1800.0


def enqueue_bedrock_start(task_id: str, s3_uri: str, output_uri: str, filename: str, meta: dict) -> None:
    """Queue a Bedrock embedding start to be processed in the background."""
    _bedrock_queue.put({
        "task_id": task_id,
        "s3_uri": s3_uri,
        "output_uri": output_uri,
        "filename": filename,
        "meta": meta,
    })
    _ensure_worker()
    _ensure_poller()


def _ensure_worker():
    global _worker_started
    if _worker_started:
        return
    _worker_started = True
    t = threading.Thread(target=_bedrock_worker, daemon=True, name="bedrock-worker")
    t.start()
    log.info("[QUEUE] Bedrock worker thread started")


def _ensure_poller():
    global _poller_started
    if _poller_started:
        return
    _poller_started = True
    t = threading.Thread(target=_bedrock_poller, daemon=True, name="bedrock-poller")
    t.start()
    log.info("[POLLER] Bedrock poller thread started")


def _bedrock_worker():
    """Drains the queue one job at a time, with a delay between jobs to avoid throttling."""
    import random
    max_retries = 7
    base_delay = 2.0
    max_delay = 90.0
    throttle_kw = ("Throttling", "Too many requests", "ThrottlingException", "Rate exceeded")

    while True:
        job = _bedrock_queue.get()
        task_id = job["task_id"]
        s3_uri = job["s3_uri"]
        output_uri = job["output_uri"]
        filename = job["filename"]
        meta = job["meta"]

        log.info("[QUEUE] Processing Bedrock start for %s (%s)", filename, task_id)
        success = False
        for attempt in range(1, max_retries + 1):
            try:
                result = start_video_embedding(s3_uri, output_uri)
                arn = result.get("invocation_arn", "")
                log.info("[QUEUE] Bedrock started: %s -> arn=%s", filename, arn[:80])

                _tasks[task_id]["status"] = "indexing"
                _tasks[task_id]["invocation_arn"] = arn
                _tasks[task_id]["output_s3_uri"] = output_uri

                for rec in vs_index():
                    if rec.get("id") == task_id:
                        rec.setdefault("metadata", {})["status"] = "indexing"
                        break
                vs_save()

                with _poller_lock:
                    _poller_jobs.append({
                        "task_id": task_id,
                        "invocation_arn": arn,
                        "output_s3_uri": output_uri,
                        "started_at": _time.monotonic(),
                    })
                success = True
                break
            except Exception as exc:
                msg = str(exc)
                is_throttle = any(kw in msg for kw in throttle_kw)
                if is_throttle and attempt < max_retries:
                    delay = min(max_delay, base_delay * (2 ** (attempt - 1))) + random.uniform(0, 1.5)
                    log.warning("[QUEUE] %s throttled (attempt %d/%d), retry in %.1fs", filename, attempt, max_retries, delay)
                    _time.sleep(delay)
                    continue
                log.error("[QUEUE] Bedrock start FAILED for %s: %s", filename, exc)
                _tasks[task_id]["status"] = "failed"
                _tasks[task_id]["error"] = msg
                for rec in vs_index():
                    if rec.get("id") == task_id:
                        rec.setdefault("metadata", {})["status"] = "failed"
                        rec["metadata"]["error"] = msg
                        break
                vs_save()
                invalidate_video_cache()
                break

        if success:
            _time.sleep(_BEDROCK_INTER_JOB_DELAY)

        _bedrock_queue.task_done()


def _bedrock_poller():
    """Periodically poll Bedrock for job completion and finalize videos."""
    while True:
        _time.sleep(_POLL_INTERVAL)
        with _poller_lock:
            jobs = list(_poller_jobs)
        if not jobs:
            continue

        done_ids = []
        for job in jobs:
            task_id = job["task_id"]
            arn = job["invocation_arn"]
            elapsed = _time.monotonic() - job["started_at"]
            try:
                inv = get_async_invocation(arn)
                status = inv.get("status", "unknown").lower()
                if status == "completed":
                    log.info("[POLLER] Bedrock completed: %s", task_id)
                    try:
                        embs = load_video_embeddings_from_s3(job["output_s3_uri"])
                        if embs:
                            asset_emb = None
                            for e in embs:
                                if e.get("embeddingScope") == "asset":
                                    asset_emb = e["embedding"]
                                    break
                            if not asset_emb:
                                asset_emb = embs[0]["embedding"]
                            if asset_emb:
                                for rec in vs_index():
                                    if rec.get("id") == task_id:
                                        rec["embedding"] = asset_emb
                                        rec.setdefault("metadata", {})["status"] = "ready"
                                        rec["metadata"]["clip_count"] = len(embs)
                                        rec["metadata"]["output_s3_uri"] = job["output_s3_uri"]
                                        break
                                vs_save()
                    except Exception as exc:
                        log.warning("[POLLER] Failed to load embeddings for %s: %s", task_id, exc)
                    if task_id in _tasks:
                        _tasks[task_id]["status"] = "ready"
                    invalidate_video_cache()
                    done_ids.append(task_id)
                elif status == "failed":
                    err = inv.get("error", "Unknown Bedrock error")
                    log.error("[POLLER] Bedrock failed: %s -> %s", task_id, err)
                    if task_id in _tasks:
                        _tasks[task_id]["status"] = "failed"
                        _tasks[task_id]["error"] = err
                    for rec in vs_index():
                        if rec.get("id") == task_id:
                            rec.setdefault("metadata", {})["status"] = "failed"
                            rec["metadata"]["error"] = err
                            break
                    vs_save()
                    invalidate_video_cache()
                    done_ids.append(task_id)
                elif elapsed > _POLL_MAX_WAIT:
                    log.warning("[POLLER] Timed out waiting for %s (%.0fs)", task_id, elapsed)
                    done_ids.append(task_id)
            except Exception as exc:
                log.debug("[POLLER] Error polling %s: %s", task_id, exc)

        if done_ids:
            with _poller_lock:
                _poller_jobs[:] = [j for j in _poller_jobs if j["task_id"] not in done_ids]


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


# Light compression for object thumbnails: max width and JPEG quality for faster load on Video Analysis page.
OBJECT_FRAME_MAX_WIDTH = 400
OBJECT_FRAME_JPEG_QUALITY = 82


def save_object_frame_to_disk(video_id: str, object_label: str, timestamp: int | float, frame_bytes: bytes) -> str | None:
    """Save object frame to data/videos/{video_id}/objects/{slug}_{timestamp}.jpg with light compression. Returns filename or None."""
    if not frame_bytes:
        return None
    try:
        from PIL import Image
        import io
        img = Image.open(io.BytesIO(frame_bytes))
        if img.mode not in ("RGB", "L"):
            img = img.convert("RGB")
        w, h = img.size
        if w > OBJECT_FRAME_MAX_WIDTH:
            ratio = OBJECT_FRAME_MAX_WIDTH / w
            new_h = max(1, int(h * ratio))
            img = img.resize((OBJECT_FRAME_MAX_WIDTH, new_h), Image.LANCZOS)
        buf = io.BytesIO()
        img.save(buf, "JPEG", quality=OBJECT_FRAME_JPEG_QUALITY, optimize=True)
        compressed = buf.getvalue()
        slug = re.sub(r"[^\w\-]", "-", (object_label or "object").strip().lower())[:50]
        slug = slug.strip("-") or "object"
        cache_dir = get_insights_cache_dir(video_id) / "objects"
        cache_dir.mkdir(parents=True, exist_ok=True)
        ts = int(timestamp) if isinstance(timestamp, (int, float)) else 0
        filename = f"{slug}_{ts}.jpg"
        path = cache_dir / filename
        path.write_bytes(compressed)
        log.info("[CACHE] Saved object frame to %s (%d bytes)", path, len(compressed))
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


_TINY_THUMB_WIDTH = 120


def make_tiny_thumbnail_b64(jpeg_bytes: bytes) -> str | None:
    """Resize a JPEG thumbnail to a tiny version and return as a base64 string."""
    if not jpeg_bytes:
        return None
    try:
        from PIL import Image
        import io as _io
        img = Image.open(_io.BytesIO(jpeg_bytes))
        if img.mode != "RGB":
            img = img.convert("RGB")
        w, h = img.size
        if w > _TINY_THUMB_WIDTH:
            ratio = _TINY_THUMB_WIDTH / w
            img = img.resize((_TINY_THUMB_WIDTH, max(1, int(h * ratio))), Image.LANCZOS)
        buf = _io.BytesIO()
        img.save(buf, format="JPEG", quality=40, optimize=True)
        return base64.b64encode(buf.getvalue()).decode("ascii")
    except Exception as e:
        log.debug("make_tiny_thumbnail_b64 failed: %s", e)
        return None


def get_tasks():
    return _tasks


def invalidate_video_cache():
    global _video_list_cache
    _video_list_cache = None


def compute_duration_seconds_from_embeddings(output_uri: str) -> float | None:
    """
    Best-effort duration from Bedrock video clip embeddings.
    Returns max(endSec) across clip embeddings, or None if unavailable.
    """
    if not output_uri:
        return None
    try:
        embs = load_video_embeddings_from_s3(output_uri) or []
        clip_list = [c for c in embs if c.get("embeddingScope") == "clip"]
        if not clip_list:
            return None
        dur = max(float(c.get("endSec") or 0.0) for c in clip_list)
        if not math.isfinite(dur) or dur <= 0:
            return None
        return dur
    except Exception:
        return None


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


# System instruction for Q&A (ask-video): model must include timestamps in a parseable tag format for any moment referenced.
# Frontend recognizes: [M:SS], [MM:SS], (M:SS), (MM:SS), "M:SS", "MM:SS", "at M:SS", "Ns", "N seconds (M:SS)", "M:SS to M:SS", etc.
ASK_VIDEO_SYSTEM_PROMPT = """You are answering questions about a video. For every answer:
- Always include timestamps for any moment in the video you reference (events, dialogue, objects, incidents, or quotes). Provide timestamps in every response—even when the user does not explicitly ask for them.
- Use the tagged timestamp format so timestamps are clickable. Both M:SS and MM:SS (zero-padded) are accepted:
  - [M:SS] or [MM:SS] for times under an hour (e.g. [0:00], [2:14], [02:14], [12:05]).
  - [H:MM:SS] for longer videos (e.g. [1:03:22]).
- When mentioning a specific time, include the tag in your sentence (e.g. "The officer speaks at [2:14]." or "At [02:14]...").
- For ranges use either "[M:SS] to [M:SS]" or "[M:SS]–[M:SS]".
- If you give a time in seconds, also add the tag (e.g. "at 134 seconds [2:14]").
Answer the user's question clearly and cite timestamps for every relevant moment."""


VIDEO_ANALYSIS_SCHEMA = {
    "type": "object",
    "properties": {
        "title": {"type": "string", "description": "Short title for the video"},
        "description": {"type": "string", "description": "One or two paragraph summary"},
        "categories": {
            "type": "array",
            "minItems": 4,
            "maxItems": 5,
            "items": {"type": "string"},
            "description": "4-5 high-level category labels",
        },
        "topics": {
            "type": "array",
            "items": {"type": "string"},
            "description": "3-6 specific subjects covered",
        },
        "people": {
            "type": "array",
            "items": {"type": "string"},
            "description": "Names of people identified in the video",
        },
        "riskLevel": {
            "type": "string",
            "enum": ["high", "medium", "low"],
        },
        "risks": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "label": {"type": "string"},
                    "severity": {"type": "string", "enum": ["high", "medium", "low"]},
                    "timestamp": {"type": "string"},
                },
                "required": ["label", "severity"],
            },
        },
        "transcript": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "time": {"type": "string"},
                    "text": {"type": "string"},
                },
                "required": ["time", "text"],
            },
        },
    },
    # Transcript is optional here because a separate endpoint can generate/complete
    # the full transcript later; this keeps analysis responses small and robust.
    "required": ["title", "description", "categories", "topics", "riskLevel", "risks"],
}

VIDEO_ANALYSIS_PROMPT = """Analyze this video and respond with ONLY a single JSON object. Do NOT include any text, explanation, or markdown before or after the JSON. Your entire response must be parseable by JSON.parse().

{
  "title": "Short title for the video",
  "description": "One or two paragraph summary of what the video shows.",
        "categories": ["Category1", "Category2", "Category3", "Category4"],
  "topics": ["Topic1", "Topic2", "Topic3"],
        "people": ["Name1", "Name2"],
        "riskLevel": "medium",
        "risks": [
    {"label": "Brief issue description", "severity": "high", "timestamp": "1:23"}
  ],
        "transcript": [
    {"time": "0:00", "text": "Key dialogue or event..."},
    {"time": "0:45", "text": "Next important utterance..."}
  ]
}

Rules:
       - **PRIORITY**: Always ensure "title", "description", "categories", "topics", "people", "riskLevel", and "risks" are present and well-formed. These fields are more important than the transcript.
- categories: 4–5 high-level labels (e.g. Workplace Safety, Facility Inspection, Compliance Audit).
- topics: 3–6 specific subjects covered (e.g. Fire safety equipment, Emergency exits, Workspace layout).
- people: optional array of distinct people identified in the video (names mentioned in speech, officer names, interviewees, etc.). Use empty array [] if none identified.
- riskLevel: must be exactly one of "high", "medium", or "low".
- risks: list every compliance or safety issue you notice. severity must be exactly one of "high", "medium", or "low". timestamp must use M:SS or MM:SS format (e.g. "0:00", "2:14", "12:05").
- transcript: include a SHORT "starter transcript" (not a complete word-for-word transcript). This is used for immediate UX while a separate endpoint can generate/complete the full transcript later.
  - MUST include at least 10 segments.
  - The first segment MUST start at "0:00".
  - Cover the beginning of the video densely (first 2–3 minutes), then include a few representative segments from the middle and end.
  - Keep segments short (1–2 sentences) so the response fits within length limits.
  - Max 30–40 segments total.
- CRITICAL: Use only double quotes. No trailing commas. No comments. Output ONLY the JSON object, nothing else."""


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


TRANSCRIPT_SCHEMA = {
    "type": "array",
    "items": {
        "type": "object",
        "properties": {
            "time": {"type": "string"},
            "text": {"type": "string"},
        },
        "required": ["time", "text"],
    },
}


def parse_transcript_response(text: str) -> list[dict]:
    """Parse transcript-only API response into list of { time, text } segments."""
    if not text or not text.strip():
        return []
    raw = text.strip()

    m = re.search(r"```(?:json)?\s*([\s\S]*?)\s*```", raw)
    if m:
        raw = m.group(1).strip()

    # 1) Direct JSON parse (preferred).
    try:
        parsed = json.loads(raw)
        if isinstance(parsed, list):
            arr = parsed
        elif isinstance(parsed, dict) and isinstance(parsed.get("transcript"), list):
            arr = parsed["transcript"]
        else:
            arr = None
    except json.JSONDecodeError:
        arr = None

    # 2) Extract an outermost array span if the response wrapped it in extra text.
    if arr is None:
        m2 = re.search(r"\[[\s\S]*\]", raw)
        if m2:
            candidate = m2.group(0)
            try:
                arr = json.loads(candidate)
            except json.JSONDecodeError:
                repaired = _repair_truncated_json_any(candidate)
                if repaired:
                    try:
                        arr = json.loads(repaired)
                    except json.JSONDecodeError:
                        arr = None

    # 3) Last resort: attempt truncation repair on the whole raw response (array or object).
    if arr is None:
        repaired = _repair_truncated_json_any(raw)
        if repaired:
            try:
                parsed = json.loads(repaired)
                if isinstance(parsed, list):
                    arr = parsed
                elif isinstance(parsed, dict) and isinstance(parsed.get("transcript"), list):
                    arr = parsed["transcript"]
            except json.JSONDecodeError:
                arr = None

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


def _repair_json_string(s: str) -> str:
    """Best-effort fixes for common LLM JSON mistakes."""
    s = re.sub(r",\s*([}\]])", r"\1", s)
    s = re.sub(r':\s*"([^"]*?)"\s+or\s+"[^"]*?"(?:\s+or\s+"[^"]*?")*', r': "\1"', s)
    s = s.replace("\\'", "'")
    return s


def _extract_outermost_json_object(text: str) -> str | None:
    """Find the outermost { ... } span, respecting strings so inner braces don't confuse depth."""
    start = text.find("{")
    if start < 0:
        return None
    depth = 0
    in_string = False
    escape = False
    for i in range(start, len(text)):
        ch = text[i]
        if escape:
            escape = False
            continue
        if ch == "\\":
            escape = True
            continue
        if ch == '"':
            in_string = not in_string
            continue
        if in_string:
            continue
        if ch == "{":
            depth += 1
        elif ch == "}":
            depth -= 1
            if depth == 0:
                return text[start : i + 1]
    return None


def _repair_truncated_json(text: str) -> str | None:
    """Best-effort repair for JSON truncated mid-stream (e.g. model hit output token limit).

    Walks the text tracking nesting depth and string state, then appends
    whatever closing characters are needed so ``json.loads`` can succeed.
    """
    start = text.find("{")
    if start < 0:
        return None

    s = text[start:]
    stack: list[str] = []  # tracks '{' and '['
    in_string = False
    escape = False

    for ch in s:
        if escape:
            escape = False
            continue
        if ch == "\\" and in_string:
            escape = True
            continue
        if ch == '"':
            in_string = not in_string
            continue
        if in_string:
            continue
        if ch == "{":
            stack.append("{")
        elif ch == "[":
            stack.append("[")
        elif ch == "}":
            if stack and stack[-1] == "{":
                stack.pop()
            if not stack:
                return s
        elif ch == "]":
            if stack and stack[-1] == "[":
                stack.pop()

    if not stack:
        return s

    repair = s
    if in_string:
        repair += '"'

    stripped = repair.rstrip()
    if stripped.endswith(":"):
        repair = stripped + "null"
    stripped = repair.rstrip()
    if stripped.endswith(","):
        repair = stripped[:-1]

    for bracket in reversed(stack):
        if bracket == "[":
            repair += "]"
        elif bracket == "{":
            repair += "}"

    return repair


def _repair_truncated_json_any(text: str) -> str | None:
    """Repair JSON truncated mid-stream for either an object or an array."""
    if not text:
        return None
    s = str(text)
    i_obj = s.find("{")
    i_arr = s.find("[")
    if i_obj < 0 and i_arr < 0:
        return None
    if i_obj < 0:
        start = i_arr
    elif i_arr < 0:
        start = i_obj
    else:
        start = min(i_obj, i_arr)

    s2 = s[start:]
    stack: list[str] = []
    in_string = False
    escape = False

    for ch in s2:
        if escape:
            escape = False
            continue
        if ch == "\\" and in_string:
            escape = True
            continue
        if ch == '"':
            in_string = not in_string
            continue
        if in_string:
            continue
        if ch == "{":
            stack.append("{")
        elif ch == "[":
            stack.append("[")
        elif ch == "}":
            if stack and stack[-1] == "{":
                stack.pop()
            if not stack:
                return s2
        elif ch == "]":
            if stack and stack[-1] == "[":
                stack.pop()
            if not stack:
                return s2

    if not stack:
        return s2

    repair = s2
    if in_string:
        repair += '"'

    stripped = repair.rstrip()
    if stripped.endswith(":"):
        repair = stripped + "null"
    stripped = repair.rstrip()
    if stripped.endswith(","):
        repair = stripped[:-1]

    for bracket in reversed(stack):
        repair += "]" if bracket == "[" else "}"
    return repair


_ANALYSIS_REQUIRED_KEYS = {"title", "description", "riskLevel"}


def parse_video_analysis_response(text: str) -> dict | None:
    if not text or not text.strip():
        return None
    raw = text.strip()

    m = re.search(r"```(?:json)?\s*([\s\S]*?)\s*```", raw)
    if m:
        raw = m.group(1).strip()

    strategies: list[tuple[str, str]] = [
        ("direct", raw),
        ("repaired", _repair_json_string(raw)),
    ]
    outer = _extract_outermost_json_object(raw)
    if outer and outer != raw:
        strategies.append(("outermost_obj", outer))
        strategies.append(("outermost_repaired", _repair_json_string(outer)))

    truncated = _repair_truncated_json(raw)
    if truncated and truncated != raw:
        strategies.append(("truncated_repair", truncated))
        strategies.append(("truncated_repaired", _repair_json_string(truncated)))

    for label, candidate in strategies:
        try:
            obj = json.loads(candidate)
            if isinstance(obj, dict):
                has_keys = _ANALYSIS_REQUIRED_KEYS.issubset(obj.keys())
                log.info("[PARSE] Strategy '%s' succeeded: keys=%s has_required=%s", label, list(obj.keys()), has_keys)
                if has_keys:
                    if "truncated" in label:
                        log.warning("[PARSE] Response was truncated; recovered partial data via '%s'", label)
                    return obj
                log.warning("[PARSE] Strategy '%s' parsed OK but missing required keys, trying next…", label)
        except json.JSONDecodeError as exc:
            log.debug("[PARSE] Strategy '%s' failed: %s", label, exc)

    for label, candidate in strategies:
        try:
            obj = json.loads(candidate)
            if isinstance(obj, dict):
                log.warning("[PARSE] Falling back to strategy '%s' (missing required keys)", label)
                return obj
        except json.JSONDecodeError:
            continue

    log.warning("[PARSE] All JSON extraction strategies failed for %d-char response", len(raw))
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

    # Optional: people (names/identifiers from analysis or transcript)
    people = data.get("people")
    if not isinstance(people, list):
        people = data.get("mentioned") if isinstance(data.get("mentioned"), list) else []
    people = [str(p).strip() for p in people if p]

    return {
        "title": title,
        "description": description,
        "categories": categories,
        "topics": topics,
        "people": people,
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
            timeout=120,
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

# For "people/faces" extraction we prefer recall over strict sharpness.
# Lower threshold means we accept blurrier (but still usable) frames.
FACE_BLUR_VARIANCE_THRESHOLD = 40


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
        if is_frame_blurred(frame_bytes, threshold=FACE_BLUR_VARIANCE_THRESHOLD):
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


DETECT_PROMPT = """Analyze this video carefully and return a single JSON object with two keys: "objects" and "face_keyframes".

1. "objects": List ALL objects relevant to safety, compliance, operations, and the scene that are clearly visible. Be COMPREHENSIVE—tag every notable item you see. Include (with timestamp in seconds when first clearly visible or most prominent):

   Safety & compliance: fire extinguisher, emergency exit, exit sign, first aid kit, defibrillator, AED, safety signage, hazard warning, caution tape, barrier, cone, cordon, PPE (helmet, hard hat, vest, high-vis, goggles, gloves, mask, respirator), emergency door, stairwell, fire alarm, smoke detector, sprinkler, extinguisher cabinet, emergency lighting, evacuation route sign, no-entry sign, safety equipment, eyewash station, safety shower, spill kit, MSDS area, hazardous materials label, chemical container, oxygen tank.

   Vehicles & transport: vehicle, car, truck, van, motorcycle, bicycle, patrol car, ambulance, police vehicle, dashboard, steering wheel, license plate, headlights, windshield.

   Buildings & infrastructure: door, gate, fence, window, stair, ramp, elevator, hallway, corridor, parking lot, road, intersection, traffic light, stop sign, crosswalk.

   Law enforcement / bodycam: body camera, radio, handcuffs, badge, uniform, weapon, holster, flashlight, baton, evidence bag, clipboard, ID card, document, phone, tablet, dashboard camera.

   General scene: person, people, crowd, building, street, sidewalk, interior, exterior, desk, table, chair (if in a compliance/safety context), whiteboard, monitor, screen, key, lock.

   List each object with a short, descriptive tag (e.g. "Fire extinguisher", "Patrol car", "Officer badge", "Emergency exit sign"). Use the timestamp in seconds. Do NOT list purely decorative items (vase, painting, potted plant) unless they are relevant to the scene. Aim for 15–40 object tags if the video shows that much; do not skip items.

2. "face_keyframes": Provide timestamps for UNIQUE, CLEAR faces that are IDEAL for downstream face detection and cropping. Critical rules:
   - Identify each DISTINCT INDIVIDUAL in the video.
   - For each person, choose ONE timestamp where that person's face is:
       * Front-facing or near front-facing (both eyes and mouth visible).
       * As large as possible in the frame (face occupies a good portion of the image).
       * In good, even lighting (not heavily shadowed, not blown out).
       * Minimally blurred (little motion blur, sharp facial features).
       * Not occluded (no major obstruction by hands, objects, other people, or UI overlays).
   - Prefer moments when the person is relatively still (e.g., speaking to the camera, standing/sitting facing the officer) rather than running or turning quickly.
   - Include ONLY moments where the face is clearly identifiable. Do NOT include: back of head, strong profile-only views, face in deep shadow, heavy motion blur, masks that hide most of the face, or faces that are very small in the frame.
   - List up to 5 timestamps—one per distinct individual. If there are 2 people in the video, list 2 timestamps (their clearest moment each). If 5 people, list 5. Do not duplicate the same person at multiple times; pick the single best frame for each person.
   - Each entry: "timestamp" (seconds) and "description" (e.g. "Officer 1, clear front-facing face", "Driver, frontal face near camera").

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
        outer = _extract_outermost_json_object(raw)
        if outer:
            try:
                parsed = json.loads(outer)
            except json.JSONDecodeError:
                pass
        if parsed is None:
            repaired = _repair_truncated_json(raw)
            if repaired:
                try:
                    parsed = json.loads(repaired)
                    log.warning("[DETECT_PARSE] Recovered truncated JSON via repair")
                except json.JSONDecodeError:
                    repaired2 = _repair_json_string(repaired)
                    try:
                        parsed = json.loads(repaired2)
                        log.warning("[DETECT_PARSE] Recovered truncated JSON via repair+fix")
                    except json.JSONDecodeError:
                        pass

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
    best, _, _ = best_clip_score_and_count(query_emb, output_s3_uri, None, visual_only)
    return best


def best_clip_score_and_count(
    query_emb: list[float],
    output_s3_uri: str,
    min_score: float | None,
    visual_only: bool = False,
    top_k: int = 5,
) -> tuple[float, int, float]:
    """
    One-pass over clip embeddings: return (best similarity, count above min_score,
    avg of top-k similarities). Used for entity ranking: consistency (high top-k
    avg) and multiplicity (count) favor the real entity video over one high outlier.
    """
    all_clips = load_video_embeddings_from_s3(output_s3_uri)
    clips = _clip_list_for_face_search(all_clips, visual_only)
    if not clips:
        return 0.0, 0, 0.0
    sims: list[float] = []
    count = 0
    for c in clips:
        sim = _cosine(query_emb, c["embedding"])
        sims.append(sim)
        if min_score is not None and sim >= min_score:
            count += 1
    best = max(sims) if sims else 0.0
    sims_desc = sorted(sims, reverse=True)
    take = min(top_k, len(sims_desc))
    top_k_avg = sum(sims_desc[:take]) / take if take else 0.0
    return round(best, 6), count, round(top_k_avg, 6)


def clips_above_threshold(
    query_emb: list[float],
    output_s3_uri: str,
    min_score: float,
    visual_only: bool = False,
    max_clips: int = 50,
) -> list[dict]:
    """
    Return all clip segments (start, end, score) where the query embedding
    scores above min_score, using only Marengo clip embeddings from S3.
    No FFmpeg or frame sampling — full coverage across the whole video.
    """
    all_clips = load_video_embeddings_from_s3(output_s3_uri)
    clips = _clip_list_for_face_search(all_clips, visual_only)
    if not clips:
        return []
    scored = []
    for c in clips:
        sim = _cosine(query_emb, c["embedding"])
        if sim < min_score:
            continue
        scored.append({
            "start": c.get("startSec", 0),
            "end": c.get("endSec", 0),
            "score": round(sim, 6),
            "type": c.get("embeddingOption", "visual"),
        })
    scored.sort(key=lambda x: -x["score"])
    return scored[:max_clips]


def _clip_timestamps_for_face_sampling(
    clips: list[dict],
    entity_emb: list[float],
    max_clips: int = 5,
    points_per_clip: int = 2,
    add_uniform_grid_sec: float | None = 10.0,
    max_grid_span_sec: float = 90.0,
    max_timestamps: int = 12,
) -> list[float]:
    """
    Get timestamps to sample for face matching. Score each clip by similarity to
    entity embedding, then sample from the TOP-SCORING clips. Capped at
    max_timestamps to keep entity search fast.
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
        if len(timestamps) >= max_timestamps:
            break
        start, end = s["start"], s["end"]
        duration = max(end - start, 0.5)
        for i in range(points_per_clip):
            if len(timestamps) >= max_timestamps:
                break
            frac = (i + 1) / (points_per_clip + 1)
            t = start + duration * frac
            key = int(t)
            if key not in seen_sec:
                seen_sec.add(key)
                timestamps.append(t)
    if len(timestamps) < max_timestamps and add_uniform_grid_sec and add_uniform_grid_sec > 0:
        video_end = max((c.get("endSec", 0) for c in clips), default=60.0)
        span = min(video_end, max_grid_span_sec)
        t = 0.0
        while t <= span and len(timestamps) < max_timestamps:
            key = int(t)
            if key not in seen_sec:
                seen_sec.add(key)
                timestamps.append(t)
            t += add_uniform_grid_sec
    timestamps.sort()
    return timestamps[:max_timestamps]


def face_match_score_in_video(
    entity_emb: list[float],
    video_id: str,
    output_s3_uri: str,
    max_frames: int = 6,
) -> tuple[float, list[dict]]:
    """
    Score how well an entity (face) matches this video by extracting frames at timestamps
    in the clips most similar to the entity, then detecting faces with ResNet10 SSD and
    comparing embeddings. Returns (best_score, matching segments).
    Limited to max_frames to keep search responsive.
    """
    from app.utils.faces import detect_and_crop_faces
    log.info("face_match_score_in_video: video_id=%s max_frames=%d", video_id, max_frames)
    all_clips = load_video_embeddings_from_s3(output_s3_uri)
    clips = _clip_list_for_face_search(all_clips, visual_only=True)
    if not clips:
        log.warning("No visual clips found for video_id=%s", video_id)
        return 0.0, []
    timestamps = _clip_timestamps_for_face_sampling(
        clips, entity_emb, max_clips=6, points_per_clip=2, max_timestamps=max_frames
    )
    if not timestamps:
        return 0.0, []
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
                # Early exit only on very strong match to avoid missing the entity
                if best_score >= 0.72 and len(matching_clips) >= 2:
                    break
        except Exception as e:
            log.warning("Face compare failed at t=%.1f: %s", t, e)
            continue
        if best_score >= 0.72 and len(matching_clips) >= 2:
            break
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



ENTITY_CLIP_MIN_SCORE = 0.48


ENTITY_RANK_TOP_K = 5  # number of top clip scores to average for consistency
ENTITY_RANK_BEST_WEIGHT = 0.2   # weight for single best clip (low - one outlier shouldn't win)
ENTITY_RANK_AVG_WEIGHT = 0.65  # weight for avg of top-k clips (consistency)
ENTITY_RANK_COUNT_WEIGHT = 0.015  # per-clip boost, cap 15 clips
ENTITY_RANK_COUNT_CAP = 15


def entity_ranking_score(
    best_score: float,
    count_above_threshold: int,
    top_k_avg: float,
) -> float:
    """
    Rank by consistency and multiplicity, not just peak. A video where the entity
    appears in many segments has high top_k_avg and count; a wrong video often
    has one high clip and rest low, so top_k_avg is lower. This puts the real
    entity video on top.
    """
    count_boost = ENTITY_RANK_COUNT_WEIGHT * min(count_above_threshold, ENTITY_RANK_COUNT_CAP)
    rank = (
        ENTITY_RANK_BEST_WEIGHT * best_score
        + ENTITY_RANK_AVG_WEIGHT * top_k_avg
        + count_boost
    )
    # Normalize so score stays in a similar range; avg term can be small if clips are few
    return round(rank, 6)


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


def get_search_embedding_from_request(
    data: dict,
    request=None,
    *,
    request_query: str | None = None,
    image_bytes: bytes | None = None,
) -> tuple[list[float] | None, str | None, bool, str]:
    """Resolve query/entity/image to a single embedding for video search.

    When entity_ids (or entity_id) are provided: returns the stored Marengo
    embedding from the index only. No ResNet, no face detection — used for
    similarity search against video clip embeddings.
    """
    if request_query is None and request is not None:
        request_query = request.form.get("query") or request.form.get("text") or ""
    query = (data.get("query") or data.get("text") or request_query or "").strip()
    entity_ids = data.get("entity_ids")
    if entity_ids is None and data.get("entity_id"):
        entity_ids = [data.get("entity_id")]
    if not isinstance(entity_ids, list):
        entity_ids = []

    if entity_ids:
        # Entity search: use stored embedding only (similarity search, no ResNet).
        entity_id = entity_ids[0]
        rec = index_get_entry(entity_id)
        if not rec:
            return None, None, False, f"Entity not found: {entity_id}"
        emb = rec.get("embedding")
        if not emb:
            return None, None, False, f"Entity has no embedding: {entity_id}"
        name = (rec.get("metadata") or {}).get("name") or entity_id
        return emb, str(name), True, None

    if image_bytes is None and request is not None and request.files and "image" in request.files:
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
            media = media_source_base64(image_bytes)
            emb = embed_image(media)
            return emb, "Image search", False, None
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

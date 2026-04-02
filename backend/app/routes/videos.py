import base64
import logging
import random
import subprocess
import math
import time
import threading

from flask import Blueprint, Response, jsonify, request

from app.services.bedrock_marengo import get_async_invocation, load_video_embeddings_from_s3
from app.services.s3_store import upload_video, upload_thumbnail, get_presigned_url, S3_EMBEDDINGS_OUTPUT
from app.services.vector_store import FIXED_INDEX_ID, add as index_add, get_entry as index_get_entry, save_index_store as vs_save, get_index_records as vs_index

from app.utils.faces import detect_and_crop_faces, deduplicate_faces, embed_face_crop, cosine_similarity as face_cosine_sim
from app.utils.video_helpers import (
    get_tasks,
    invalidate_video_cache,
    video_id_to_s3_uri,
    video_id_to_presigned_url,
    get_frame_bytes,
    extract_duration_and_thumbnail,
    make_tiny_thumbnail_b64,
    is_frame_blurred,
    FACE_BLUR_VARIANCE_THRESHOLD,
    get_video_list_cache,
    set_video_list_cache,
    enqueue_bedrock_start,
    VIDEO_ANALYSIS_PROMPT,
    VIDEO_ANALYSIS_SCHEMA,
    parse_video_analysis_response,
    normalize_video_analysis,
    TRANSCRIPT_PROMPT,
    TRANSCRIPT_SCHEMA,
    parse_transcript_response,
    timestamp_seconds_for_sort,
    DETECT_PROMPT,
    parse_detect_response,
    save_face_to_disk,
    load_face_from_disk,
    save_object_frame_to_disk,
    load_object_frame_from_disk,
    clips_above_threshold,
)
from app.services.bedrock_pegasus import analyze_video as pegasus_analyze_video

log = logging.getLogger("app.routes.videos")

THROTTLE_KEYWORDS = ("Throttling", "Too many requests", "ThrottlingException", "Rate exceeded")
MAX_RETRIES = 7
BASE_DELAY_SECONDS = 2.0
MAX_DELAY_SECONDS = 90.0


def retry_bedrock_call(fn, *, label: str = "bedrock_call"):
    """Call *fn* with exponential backoff on Bedrock throttling errors."""
    for attempt in range(1, MAX_RETRIES + 1):
        try:
            return fn()
        except Exception as exc:
            msg = str(exc)
            if not any(kw in msg for kw in THROTTLE_KEYWORDS) or attempt >= MAX_RETRIES:
                raise
            delay = min(MAX_DELAY_SECONDS, BASE_DELAY_SECONDS * (2 ** (attempt - 1))) + random.uniform(0.0, 1.5)
            log.warning(
                "%s throttled (attempt %d/%d). Retrying in %.1fs ...",
                label, attempt, MAX_RETRIES, delay,
            )
            time.sleep(delay)
    raise RuntimeError(f"{label}: exhausted {MAX_RETRIES} retries")


videos_bp = Blueprint("videos", __name__)
video_list_build_lock = threading.Lock()


@videos_bp.route("/upload", methods=["POST"])
def api_upload_video():
    if "video" not in request.files:
        log.warning("Upload rejected: no 'video' file in request")
        return jsonify({"error": "No 'video' file provided"}), 400
    file = request.files["video"]
    if not file.filename:
        log.warning("Upload rejected: empty filename")
        return jsonify({"error": "Empty filename"}), 400
    video_bytes = file.read()
    size_mb = len(video_bytes) / (1024 * 1024)
    log.info("Upload started: size=%.1fMB", size_mb)
    if len(video_bytes) > 300 * 1024 * 1024:
        log.warning("Upload rejected: file too large (%.1fMB)", size_mb)
        return jsonify({"error": "File exceeds 300 MB limit"}), 400
    tags_raw = request.form.get("tags", "").strip()
    tags = [t.strip() for t in tags_raw.split(",") if t.strip()]

    duration_seconds, thumb_bytes = extract_duration_and_thumbnail(video_bytes)
    log.info("Pre-upload probe: duration=%.1fs thumb=%s", duration_seconds or 0, "yes" if thumb_bytes else "no")

    try:
        info = upload_video(video_bytes, file.filename)
        log.info("S3 upload OK: video_id=%s", info["video_id"])
    except Exception as e:
        log.error("S3 upload failed during /upload (%s)", type(e).__name__)
        return jsonify({"error": "Internal server error"}), 500

    task_id = info["video_id"]
    thumbnail_s3_key = None
    if thumb_bytes:
        try:
            thumbnail_s3_key = upload_thumbnail(task_id, thumb_bytes)
            log.info("Thumbnail uploaded for video_id=%s", task_id)
        except Exception as e:
            log.warning("Thumbnail upload failed for video_id=%s (%s)", task_id, type(e).__name__)

    output_uri = f"{S3_EMBEDDINGS_OUTPUT}/{task_id}"
    meta = {
        "filename": file.filename,
        "s3_uri": info["s3_uri"],
        "s3_key": info["s3_key"],
        "uploaded_at": info["uploaded_at"],
        "status": "queued",
    }
    if duration_seconds is not None:
        meta["duration_seconds"] = duration_seconds
    if thumbnail_s3_key:
        meta["thumbnail_s3_key"] = thumbnail_s3_key
    if thumb_bytes:
        tiny_b64 = make_tiny_thumbnail_b64(thumb_bytes)
        if tiny_b64:
            meta["thumbnail_base64"] = tiny_b64
    if tags:
        meta["tags"] = tags
    index_add(id=task_id, embedding=[0.0] * 512, metadata=meta, type="video")

    tasks = get_tasks()
    tasks[task_id] = {
        "task_id": task_id,
        "filename": file.filename,
        "status": "queued",
        "s3_uri": info["s3_uri"],
        "s3_key": info["s3_key"],
        "output_s3_uri": output_uri,
        "uploaded_at": info["uploaded_at"],
    }

    enqueue_bedrock_start(task_id, info["s3_uri"], output_uri, file.filename, meta)

    invalidate_video_cache()
    log.info("Upload complete (queued for indexing): video_id=%s", task_id)
    return jsonify({
        "task_id": task_id,
        "filename": file.filename,
        "status": "queued",
        "s3_uri": info["s3_uri"],
        "indexId": FIXED_INDEX_ID,
    })


@videos_bp.route("/tasks", methods=["GET"])
def api_list_tasks():
    tasks = list(get_tasks().values())
    tasks.sort(key=lambda t: t.get("uploaded_at", ""), reverse=True)
    return jsonify({"tasks": tasks, "count": len(tasks)})


@videos_bp.route("/<video_id>/reindex", methods=["POST"])
def api_reindex_video(video_id: str):
    """Re-trigger Bedrock embedding for a video that is already in S3 (e.g. status=failed or stuck indexing)."""
    video_id = (video_id or "").strip()
    if not video_id:
        return jsonify({"error": "video_id is required"}), 400
    entry = index_get_entry(video_id)
    if not entry:
        return jsonify({"error": "Video not found in index", "video_id": video_id}), 404
    meta = entry.get("metadata") or {}
    s3_uri = video_id_to_s3_uri(video_id)
    if not s3_uri:
        return jsonify({
            "error": "Video has no S3 location (s3_key/s3_uri). Cannot reindex.",
            "video_id": video_id,
        }), 400
    output_uri = f"{S3_EMBEDDINGS_OUTPUT}/{video_id}"
    tasks = get_tasks()
    tasks[video_id] = {
        "task_id": video_id,
        "filename": meta.get("filename", video_id),
        "status": "queued",
        "s3_uri": s3_uri,
        "s3_key": meta.get("s3_key", ""),
        "output_s3_uri": output_uri,
        "uploaded_at": meta.get("uploaded_at", ""),
    }
    for rec in vs_index():
        if rec.get("id") == video_id:
            rec.setdefault("metadata", {})["status"] = "queued"
            rec["metadata"]["output_s3_uri"] = output_uri
            rec["metadata"].pop("error", None)
            break
    vs_save()
    enqueue_bedrock_start(video_id, s3_uri, output_uri, meta.get("filename", video_id), meta)
    invalidate_video_cache()
    log.info("Reindex queued: video_id=%s", video_id)
    return jsonify({
        "task_id": video_id,
        "filename": meta.get("filename", video_id),
        "status": "queued",
        "s3_uri": s3_uri,
        "indexId": FIXED_INDEX_ID,
    })


@videos_bp.route("/tasks/<task_id>", methods=["GET"])
def api_get_task(task_id: str):
    tasks = get_tasks()
    task = tasks.get(task_id)
    if not task:
        return jsonify({"error": "Task not found"}), 404
    if task["status"] == "indexing" and task.get("invocation_arn"):
        try:
            inv = get_async_invocation(task["invocation_arn"])
            bedrock_status = inv.get("status", "unknown").lower()
            if bedrock_status == "completed":
                task["status"] = "ready"
                invalidate_video_cache()
                try:
                    embs = load_video_embeddings_from_s3(task["output_s3_uri"])
                    if embs:
                        asset_emb = None
                        for e in embs:
                            if e.get("embeddingScope") == "asset":
                                asset_emb = e["embedding"]
                                break
                        if not asset_emb:
                            asset_emb = embs[0]["embedding"]
                        for rec in vs_index():
                            if rec["id"] == task_id:
                                rec["embedding"] = asset_emb
                                rec["metadata"]["status"] = "ready"
                                rec["metadata"]["clip_count"] = len(embs)
                                rec["metadata"]["output_s3_uri"] = task.get("output_s3_uri", "")
                                break
                        vs_save()
                except Exception:
                    pass
            elif bedrock_status == "failed":
                task["status"] = "failed"
                task["error"] = inv.get("error", "Unknown error")
                invalidate_video_cache()
            else:
                task["status"] = "indexing"
        except Exception:
            pass
    return jsonify(task)


@videos_bp.route("", methods=["GET"])
def api_list_videos():
    from app.services.vector_store import list_entries as index_list
    cache, cache_ts, ttl = get_video_list_cache()
    now = time.monotonic()
    if cache and (now - cache_ts) < ttl:
        return jsonify(cache)

    with video_list_build_lock:
        cache, cache_ts, ttl = get_video_list_cache()
        now = time.monotonic()
        if cache and (now - cache_ts) < ttl:
            return jsonify(cache)

        t0 = time.perf_counter()
        entries = index_list(type_filter="video")

        for entry in entries:
            meta = entry.get("metadata") or {}
            s3_key = meta.get("s3_key")
            if s3_key:
                try:
                    entry["stream_url"] = get_presigned_url(s3_key)
                except Exception:
                    entry["stream_url"] = None
            thumb_key = meta.get("thumbnail_s3_key")
            if thumb_key:
                try:
                    entry["thumbnail_url"] = get_presigned_url(thumb_key)
                except Exception:
                    entry["thumbnail_url"] = None
            entry["duration_seconds"] = meta.get("duration_seconds")
            tb64 = meta.get("thumbnail_base64")
            if tb64:
                entry["thumbnail_data_url"] = f"data:image/jpeg;base64,{tb64}"

        result = {"indexId": FIXED_INDEX_ID, "count": len(entries), "videos": entries}
        set_video_list_cache(result)
        log.info("Video list built in %.0fms (%d videos)", (time.perf_counter() - t0) * 1000, len(entries))
        return jsonify(result)


@videos_bp.route("/<video_id>/analysis", methods=["POST", "DELETE"])
def api_generate_video_analysis(video_id: str):
    video_id = (video_id or "").strip()
    if not video_id:
        return jsonify({"error": "video_id is required"}), 400
    log.info("[ANALYSIS] %s request for video_id=%s", request.method, video_id)
    entry = index_get_entry(video_id)
    if not entry:
        log.warning("[ANALYSIS] Video not found in index: video_id=%s", video_id)
        return jsonify({"error": "Video not found in index. Use a video ID from the videos list (e.g. from Uploads).", "video_id": video_id}), 404

    meta = entry.get("metadata") or {}

    # ── DELETE: remove stored analysis (description, categories, topics, risks, transcript) for this video only ──
    if request.method == "DELETE":
        if "video_analysis" in meta:
            meta.pop("video_analysis", None)

        # Persist metadata update back into the vector index
        idx = vs_index()
        for rec in idx:
            if rec.get("id") == video_id:
                rec["metadata"] = meta
                break
        vs_save()
        invalidate_video_cache()
        log.info("[ANALYSIS] Cleared video_analysis metadata for video_id=%s", video_id)
        return jsonify({"video_id": video_id, "cleared": True}), 200

    s3_uri = video_id_to_s3_uri(video_id)
    if not s3_uri:
        log.warning("[ANALYSIS] No S3 location for video_id=%s", video_id)
        return jsonify({
            "error": "Video has no S3 location. Ensure the video was uploaded successfully and S3_BUCKET is set, or that the record has s3_uri/s3_key in metadata.",
            "video_id": video_id,
        }), 400
    try:
        log.info("[ANALYSIS] Calling Pegasus for video_id=%s", video_id)
        t0 = time.perf_counter()
        raw_text = pegasus_analyze_video(
            s3_uri,
            VIDEO_ANALYSIS_PROMPT,
            temperature=0,
        )
        log.info("[ANALYSIS] Pegasus response received in %.1fs (len=%d)", time.perf_counter() - t0, len(raw_text or ""))
        analysis_dict = parse_video_analysis_response(raw_text)
        if not analysis_dict:
            log.error("[ANALYSIS] Failed to parse Pegasus response as JSON for video_id=%s", video_id)
            return jsonify({
                "error": "Could not parse analysis response as JSON",
                "video_id": video_id,
            }), 422
        log.info(
            "[ANALYSIS] Parsed dict keys=%s categories_type=%s risks_len=%s transcript_len=%s",
            list(analysis_dict.keys()),
            type(analysis_dict.get("categories")).__name__,
            len(analysis_dict.get("risks", [])) if isinstance(analysis_dict.get("risks"), list) else "N/A",
            len(analysis_dict.get("transcript", [])) if isinstance(analysis_dict.get("transcript"), list) else "N/A",
        )
        analysis = normalize_video_analysis(analysis_dict)
        log.info(
            "[ANALYSIS] Parsed OK: categories=%d topics=%d risks=%d transcript_segments=%d riskLevel=%s",
            len(analysis.get("categories", [])),
            len(analysis.get("topics", [])),
            len(analysis.get("risks", [])),
            len(analysis.get("transcript", [])),
            analysis.get("riskLevel", "?"),
        )
        idx = vs_index()
        for rec in idx:
            if rec.get("id") == video_id:
                rec.setdefault("metadata", {})["video_analysis"] = analysis
                break
        vs_save()
        invalidate_video_cache()
        return jsonify({"video_id": video_id, "analysis": analysis})
    except Exception as e:
        log.error("[ANALYSIS] Request failed for video_id=%s (%s)", video_id, type(e).__name__)
        return jsonify({"error": "Internal server error", "video_id": video_id}), 500


@videos_bp.route("/<video_id>/transcript", methods=["GET", "POST"])
def api_video_transcript(video_id: str):
    """
    GET: Return the stored transcript (from video_analysis) if present.
    POST: Generate a complete, detailed transcript via Pegasus, save to video_analysis, and return it.
    """
    video_id = (video_id or "").strip()
    if not video_id:
        return jsonify({"error": "video_id is required"}), 400
    entry = index_get_entry(video_id)
    if not entry:
        return jsonify({"error": "Video not found in index", "video_id": video_id}), 404
    meta = entry.get("metadata") or {}
    existing_analysis = meta.get("video_analysis") or {}
    existing_transcript = existing_analysis.get("transcript") or []

    if request.method == "GET":
        if not existing_transcript:
            return jsonify({"video_id": video_id, "transcript": None, "message": "No transcript yet. Use POST to generate."}), 200
        return jsonify({"video_id": video_id, "transcript": existing_transcript, "count": len(existing_transcript)})

    # POST: generate transcript (optionally append from a given timestamp)
    body = request.get_json(silent=True) or {}
    append_from_seconds = body.get("append_from_seconds")
    if append_from_seconds is not None:
        try:
            append_from_seconds = float(append_from_seconds)
            if append_from_seconds < 0:
                append_from_seconds = None
        except (TypeError, ValueError):
            append_from_seconds = None
    if append_from_seconds is not None and not existing_transcript:
        append_from_seconds = None  # no existing transcript to append to

    s3_uri = video_id_to_s3_uri(video_id)
    if not s3_uri:
        return jsonify({"error": "Video has no S3 location", "video_id": video_id}), 400
    log.info(
        "[TRANSCRIPT] Generating detailed transcript for video_id=%s%s",
        video_id,
        " (append from %.0fs)" % append_from_seconds if append_from_seconds is not None else "",
    )
    try:
        t0 = time.perf_counter()
        raw = pegasus_analyze_video(
            s3_uri,
            TRANSCRIPT_PROMPT,
            temperature=0,
            response_schema=TRANSCRIPT_SCHEMA,
        )
        log.info("[TRANSCRIPT] Pegasus response received in %.1fs (%d chars)", time.perf_counter() - t0, len(raw or ""))
        new_segments = parse_transcript_response(raw)
        if not new_segments:
            log.warning("[TRANSCRIPT] No segments parsed from response")
            return jsonify({
                "error": "Could not parse transcript from response",
                "video_id": video_id,
            }), 422
        log.info("[TRANSCRIPT] Parsed %d segments", len(new_segments))
        # If appending: keep existing segments before append_from_seconds, add new segments from that time onward
        if append_from_seconds is not None:
            kept = [s for s in existing_transcript if timestamp_seconds_for_sort(s.get("time") or "0:00") < append_from_seconds]
            appended = [s for s in new_segments if timestamp_seconds_for_sort(s.get("time") or "0:00") >= append_from_seconds]
            transcript = kept + appended
            transcript.sort(key=lambda s: timestamp_seconds_for_sort(s.get("time") or "0:00"))
            log.info("[TRANSCRIPT] Merged: %d kept + %d appended = %d total", len(kept), len(appended), len(transcript))
        else:
            transcript = new_segments
        # Merge into video_analysis
        updated_analysis = {**existing_analysis, "transcript": transcript}
        idx = vs_index()
        for rec in idx:
            if rec.get("id") == video_id:
                rec.setdefault("metadata", {})["video_analysis"] = updated_analysis
                break
        vs_save()
        invalidate_video_cache()
        return jsonify({"video_id": video_id, "transcript": transcript, "count": len(transcript)})
    except Exception as e:
        log.error("[TRANSCRIPT] Request failed for video_id=%s (%s)", video_id, type(e).__name__)
        return jsonify({"error": "Internal server error", "video_id": video_id}), 500


@videos_bp.route("/<video_id>/frame", methods=["GET"])
def api_video_frame(video_id: str):
    video_id = (video_id or "").strip()
    t = request.args.get("t", type=float)
    if t is None or t < 0:
        return jsonify({"error": "Query parameter 't' (seconds) is required and must be >= 0"}), 400
    w = request.args.get("w", type=int)
    if w is not None and (w < 1 or w > 2000):
        w = None
    url = video_id_to_presigned_url(video_id)
    if not url:
        return jsonify({"error": "Video not found or no stream URL", "video_id": video_id}), 404
    try:
        cmd = [
            "ffmpeg", "-y", "-loglevel", "error", "-ss", str(t),
            "-i", url, "-vframes", "1",
        ]
        if w:
            cmd.extend(["-vf", f"scale={w}:-2", "-q:v", "4"])
        cmd.extend(["-f", "image2", "pipe:1"])
        result = subprocess.run(
            cmd,
            capture_output=True,
            timeout=30,
            check=False,
        )
        if result.returncode != 0 or not result.stdout:
            return jsonify({"error": "Frame extraction failed (ffmpeg error or unsupported URL)"}), 503
        resp = Response(result.stdout, mimetype="image/jpeg")
        resp.headers["Cache-Control"] = "public, max-age=3600"
        return resp
    except subprocess.TimeoutExpired:
        return jsonify({"error": "Frame extraction timed out"}), 504
    except FileNotFoundError:
        return jsonify({"error": "ffmpeg not installed; install ffmpeg to use frame extraction"}), 503
    except Exception:
        return jsonify({"error": "Internal server error"}), 500


@videos_bp.route("/<video_id>/faces/<int:face_id>", methods=["GET"])
def api_video_face_cached(video_id: str, face_id: int):
    """Serve detected face image from local disk cache (data/videos/{video_id}/faces/face_{id}.png)."""
    import base64
    video_id = (video_id or "").strip()
    if not video_id or face_id < 0:
        return jsonify({"error": "Invalid video_id or face_id"}), 400
    filename = f"face_{face_id}.png"
    b64 = load_face_from_disk(video_id, filename)
    if not b64:
        return jsonify({"error": "Face image not found in cache", "video_id": video_id, "face_id": face_id}), 404
    return Response(base64.b64decode(b64), mimetype="image/png")


@videos_bp.route("/<video_id>/object-frames/<path:filename>", methods=["GET"])
def api_video_object_frame_cached(video_id: str, filename: str):
    """Serve object frame image from local disk cache (data/videos/{video_id}/objects/{filename})."""
    video_id = (video_id or "").strip()
    if not video_id or not filename or ".." in filename or "/" in filename or "\\" in filename:
        return jsonify({"error": "Invalid video_id or filename"}), 400
    data = load_object_frame_from_disk(video_id, filename)
    if not data:
        return jsonify({"error": "Object frame not found in cache", "video_id": video_id}), 404
    return Response(data, mimetype="image/jpeg")


@videos_bp.route("/<video_id>/insights", methods=["GET", "POST", "DELETE"])
def api_video_insights(video_id: str):
    video_id = (video_id or "").strip()
    if not video_id:
        return jsonify({"error": "video_id is required"}), 400
    log.info("[INSIGHTS] %s request for video_id=%s", request.method, video_id)
    entry = index_get_entry(video_id)
    if not entry:
        log.warning("[INSIGHTS] Video not found in index: %s", video_id)
        return jsonify({
            "error": "Video not found in index. Use a video ID from the videos list.",
            "video_id": video_id,
        }), 404
    meta = entry.get("metadata") or {}
    # ── DELETE: remove cached insights metadata for this video ──
    if request.method == "DELETE":
        # Remove insights and any derived face-presence cache from the index
        if "video_insights" in meta:
            meta.pop("video_insights", None)
        # Face presence is derived entirely from insights; clear so it can be recomputed later.
        if "face_presence" in meta:
            meta.pop("face_presence", None)

        # Persist changes back to the vector store
        idx = vs_index()
        for rec in idx:
            if rec.get("id") == video_id:
                rec["metadata"] = meta
                break
        vs_save()
        invalidate_video_cache()
        log.info("[INSIGHTS] Cleared insights metadata for video_id=%s", video_id)
        return jsonify({"video_id": video_id, "cleared": True}), 200

    s3_uri = video_id_to_s3_uri(video_id)
    output_uri = meta.get("output_s3_uri") or f"{S3_EMBEDDINGS_OUTPUT}/{video_id}"
    is_ready = meta.get("status") == "ready"

    # ── GET: return cached insights (load face images from disk when available) ──
    if request.method == "GET":
        raw_insights = meta.get("video_insights")
        if not raw_insights:
            log.info("[INSIGHTS] No cached insights for video_id=%s", video_id)
            return jsonify({"video_id": video_id, "insights": None})
        insights = dict(raw_insights)
        objects = list(insights.get("objects") or [])[:8]
        insights["objects"] = []
        for ob in objects:
            ob_copy = dict(ob)
            ts = ob_copy.get("timestamp")
            if not ob_copy.get("frame_base64") and ob_copy.get("frame_path"):
                frame_data = load_object_frame_from_disk(video_id, ob_copy["frame_path"])
                if frame_data:
                    ob_copy["frame_base64"] = base64.b64encode(frame_data).decode("utf-8")
            if ob_copy.get("frame_path"):
                ob_copy["frame_url"] = f"/api/videos/{video_id}/object-frames/{ob_copy['frame_path']}"
            elif ts is not None:
                ob_copy["frame_url"] = f"/api/videos/{video_id}/frame?t={ts}"
            insights["objects"].append(ob_copy)
        faces = list(insights.get("detected_faces") or [])
        insights["detected_faces"] = []
        for f in faces:
            f_copy = dict(f)
            if not f_copy.get("image_base64") and f_copy.get("face_path"):
                from_disk = load_face_from_disk(video_id, f_copy["face_path"])
                if from_disk:
                    f_copy["image_base64"] = from_disk
            insights["detected_faces"].append(f_copy)
        log.info(
            "[INSIGHTS] Returning cached from disk/index: objects=%d detected_faces=%d",
            len(insights["objects"]),
            len(insights["detected_faces"]),
        )
        return jsonify({"video_id": video_id, "insights": insights})

    # ── POST: generate or override insights ──
    body = request.get_json(silent=True) or {}
    mark_people_empty = bool(body.get("mark_people_empty"))
    mark_empty = bool(body.get("mark_empty"))
    if mark_people_empty:
        raw_insights = meta.get("video_insights") or {}
        objects = list(raw_insights.get("objects") or [])
        keyframes = list(raw_insights.get("keyframes") or [])
        video_duration_sec = 0.0
        try:
            video_duration_sec = float(raw_insights.get("video_duration_sec") or 0.0)
        except (TypeError, ValueError):
            video_duration_sec = 0.0
        if video_duration_sec <= 0:
            try:
                video_duration_sec = float(meta.get("duration_seconds") or 0.0)
            except (TypeError, ValueError):
                video_duration_sec = 0.0

        people_empty_insights = {
            "empty": False,
            "objects_empty": len(objects) == 0,
            "people_empty": True,
            "objects": objects,
            "detected_faces": [],
            "people": [],
            "mentioned": [],
            "link_data_by_entity": {},
            "keyframes": keyframes,
            "video_duration_sec": video_duration_sec,
        }
        idx = vs_index()
        for rec in idx:
            if rec.get("id") == video_id:
                m = rec.setdefault("metadata", {})
                m["video_insights"] = people_empty_insights
                m["insights_empty"] = False
                m.pop("face_presence", None)
                break
        vs_save()
        invalidate_video_cache()
        log.info("[INSIGHTS] Marked people empty for video_id=%s", video_id)
        return jsonify({"video_id": video_id, "insights": people_empty_insights, "status": "people_empty"}), 200

    if mark_empty:
        # Mark this video as analyzed-with-no-results so the frontend
        # treats insights as present but shows no people/objects.
        video_duration_sec = 0.0
        try:
            all_clips = load_video_embeddings_from_s3(output_uri)
            clip_list = [c for c in all_clips if c.get("embeddingScope") == "clip"]
            if clip_list:
                video_duration_sec = max(c.get("endSec", 0) for c in clip_list)
            log.info(
                "[INSIGHTS] (empty) Video duration=%.1fs (%d clips)",
                video_duration_sec,
                len(clip_list),
            )
        except Exception as e:
            log.warning("[INSIGHTS] Could not load clips for duration while marking empty (%s)", type(e).__name__)
        if video_duration_sec <= 0:
            try:
                video_duration_sec = float(meta.get("duration_seconds") or 0.0)
            except (TypeError, ValueError):
                video_duration_sec = 0.0

        empty_insights = {
            "empty": True,
            "objects_empty": True,
            "people_empty": True,
            "objects": [],
            "detected_faces": [],
            "people": [],
            "mentioned": [],
            "link_data_by_entity": {},
            "keyframes": [],
            "video_duration_sec": video_duration_sec,
        }
        idx = vs_index()
        for rec in idx:
            if rec.get("id") == video_id:
                m = rec.setdefault("metadata", {})
                m["video_insights"] = empty_insights
                m["insights_empty"] = True
                # Face presence is derived entirely from insights; clear so it can be recomputed later if needed.
                m.pop("face_presence", None)
                break
        vs_save()
        invalidate_video_cache()
        log.info("[INSIGHTS] Marked empty insights for video_id=%s", video_id)
        return jsonify({"video_id": video_id, "insights": empty_insights, "status": "empty"}), 200

    # ── POST: generate fresh insights ──
    if not s3_uri:
        log.warning("[INSIGHTS] No S3 URI for video_id=%s", video_id)
        return jsonify({"error": "Video has no S3 location", "video_id": video_id}), 400
    if not is_ready:
        log.warning("[INSIGHTS] Video not ready: video_id=%s status=%s", video_id, meta.get("status"))
        return jsonify({"error": "Video is not ready (indexing not complete). Wait for status 'ready'.", "video_id": video_id}), 400

    t_total_start = time.perf_counter()
    try:
        # ────────────────────────────────────────────────────
        # STEP 1 — Single Pegasus call: objects + face keyframes
        # ────────────────────────────────────────────────────
        log.info("[INSIGHTS] Calling Pegasus DETECT_PROMPT for video_id=%s", video_id)
        t0 = time.perf_counter()
        raw_response = pegasus_analyze_video(s3_uri, DETECT_PROMPT)
        log.info("[INSIGHTS] Pegasus response received in %.1fs (%d chars)", time.perf_counter() - t0, len(raw_response or ""))

        detect_data = parse_detect_response(raw_response)
        objects_raw = detect_data["objects"]
        face_keyframes = detect_data["face_keyframes"]

        # ────────────────────────────────────────────────────
        # STEP 2 — Process objects: extract frame + bbox
        # ────────────────────────────────────────────────────
        MAX_OBJECTS = 8
        seen = set()
        out_objects = []
        for ob in objects_raw:
            key = (ob["object"], ob["timestamp"])
            if key in seen:
                continue
            seen.add(key)
            if len(out_objects) >= MAX_OBJECTS:
                break
            ob_copy = dict(ob)
            ts = ob_copy["timestamp"]
            ob_copy["frame_url"] = f"/api/videos/{video_id}/frame?t={ts}"
            frame_bytes = get_frame_bytes(video_id, ts)
            if frame_bytes:
                frame_filename = save_object_frame_to_disk(video_id, ob_copy.get("object") or "object", ts, frame_bytes)
                if frame_filename:
                    ob_copy["frame_path"] = frame_filename
                    ob_copy["frame_url"] = f"/api/videos/{video_id}/object-frames/{frame_filename}"
                if is_frame_blurred(frame_bytes):
                    log.debug("[OBJECTS] Blurred frame at t=%s for %s", ts, ob_copy["object"])
            else:
                log.warning("[OBJECTS] Frame extraction FAILED for t=%s", ts)
            out_objects.append(ob_copy)

        log.info("[OBJECTS] Final unique objects: %d", len(out_objects))
        # ────────────────────────────────────────────────────
        # STEP 3 — Video duration from clip embeddings
        # ────────────────────────────────────────────────────
        video_duration_sec = 0.0
        try:
            all_clips = load_video_embeddings_from_s3(output_uri)
            clip_list = [c for c in all_clips if c.get("embeddingScope") == "clip"]
            if clip_list:
                video_duration_sec = max(c.get("endSec", 0) for c in clip_list)
            log.info("[INSIGHTS] Video duration=%.1fs (%d clips)", video_duration_sec, len(clip_list))
        except Exception as e:
            log.warning("[INSIGHTS] Could not load clips for duration (%s)", type(e).__name__)
        if video_duration_sec <= 0:
            video_duration_sec = 300.0
            log.info("[INSIGHTS] Using fallback duration=%.1fs", video_duration_sec)

        # ────────────────────────────────────────────────────
        # STEP 4 — Extract faces.
        #          Phase 1: Use Pegasus-provided face_keyframes (best per person).
        #          Phase 2 (fallback): ONLY if Phase 1 finds no faces, use uniform
        #          sampling across the video to catch missed people.
        #          ResNet10 SSD + Marengo embeddings, then deduplicate (same person
        #          at different orientations merges into one).
        # ────────────────────────────────────────────────────
        if not face_keyframes:
            log.warning("[FACES] Pegasus returned 0 face_keyframes; falling back to 5 evenly-spaced timestamps")
            n = 5
            step = video_duration_sec / (n + 1)
            face_keyframes = [
                {"timestamp": round(step * (i + 1), 1), "description": f"fallback keyframe {i+1}"}
                for i in range(n)
            ]

        keyframe_ts_set = {round(kf["timestamp"], 1) for kf in face_keyframes}
        # Phase 1: only Pegasus keyframes
        face_sample_timestamps: list[tuple[float, str]] = [
            (round(kf["timestamp"], 1), kf.get("description", ""))
            for kf in face_keyframes
        ]

        all_face_detections: list[dict] = []
        keyframes_info: list[dict] = []
        # Slightly lower confidence (0.50) to catch more faces (e.g. partial profile)
        face_min_conf = 0.50

        def detect_faces_at_times(timestamps: list[tuple[float, str]]):
            for t, desc in timestamps:
                log.info("[FACES] Extracting frame at t=%.1fs (%s)", t, desc)
                frame_bytes = get_frame_bytes(video_id, t)
                if not frame_bytes:
                    log.warning("[FACES] Could not extract frame at t=%.1f", t)
                    if t in keyframe_ts_set:
                        keyframes_info.append({
                            "timestamp": t, "description": desc,
                            "status": "extraction_failed", "faces_detected": 0,
                        })
                    continue
                if is_frame_blurred(frame_bytes, threshold=FACE_BLUR_VARIANCE_THRESHOLD):
                    log.info("[FACES] Frame at t=%.1f is blurred (thr=%s), skipping", t, FACE_BLUR_VARIANCE_THRESHOLD)
                    if t in keyframe_ts_set:
                        keyframes_info.append({
                            "timestamp": t, "description": desc,
                            "status": "blurred", "faces_detected": 0,
                        })
                    continue

                faces = detect_and_crop_faces(frame_bytes, output_size=256, min_confidence=face_min_conf)
                log.info("[FACES] t=%.1fs -> %d faces detected (ResNet10 SSD)", t, len(faces))
                for face in faces:
                    log.info(
                        "[FACES]   confidence=%.4f bbox=(%d,%d %dx%d)",
                        face["confidence"],
                        face["bbox"]["x"], face["bbox"]["y"],
                        face["bbox"]["w"], face["bbox"]["h"],
                    )

                if t in keyframe_ts_set:
                    keyframes_info.append({
                        "timestamp": t,
                        "description": desc,
                        "status": "ok",
                        "faces_detected": len(faces),
                        "frame_url": f"/api/videos/{video_id}/frame?t={t}",
                    })

                for face in faces:
                    emb = embed_face_crop(face)
                    if emb is None:
                        continue
                    all_face_detections.append({
                        "embedding": emb,
                        "confidence": face["confidence"],
                        "image_base64": face.get("image_base64", ""),
                        "bbox": face.get("bbox"),
                        "timestamp": t,
                    })

        log.info("[FACES] Phase 1 — using %d Pegasus keyframe(s) for face detection", len(face_sample_timestamps))
        for t, desc in face_sample_timestamps[:10]:
            log.info("  t=%.1fs — %s", t, desc)
        if len(face_sample_timestamps) > 10:
            log.info("  ... and %d more", len(face_sample_timestamps) - 10)

        detect_faces_at_times(face_sample_timestamps)

        # Phase 2 fallback: only if Pegasus keyframes did not yield any faces.
        if not all_face_detections:
            log.info("[FACES] No faces found from Pegasus keyframes; falling back to uniform sampling across video")
            n_uniform = 22
            step_sec = max(video_duration_sec / (n_uniform + 1), 2.0)
            uniform_timestamps = [round(step_sec * (i + 1), 1) for i in range(n_uniform)]
            fallback_samples: list[tuple[float, str]] = []
            for t in uniform_timestamps:
                # skip times that are too close to existing keyframes to avoid duplicate frames
                if any(abs(t - kt) < 2.5 for kt in keyframe_ts_set):
                    continue
                fallback_samples.append((t, f"uniform sample t={t}s"))

            log.info("[FACES] Phase 2 — using %d uniform timestamp(s) for face detection", len(fallback_samples))
            for t, desc in fallback_samples[:10]:
                log.info("  t=%.1fs — %s", t, desc)
            if len(fallback_samples) > 10:
                log.info("  ... and %d more", len(fallback_samples) - 10)

            detect_faces_at_times(fallback_samples)
            face_sample_timestamps.extend(fallback_samples)

        log.info("[FACES] Total raw face detections across %d frames: %d", len(face_sample_timestamps), len(all_face_detections))

        unique_clusters = deduplicate_faces(all_face_detections)
        detected_faces = []
        for cluster in unique_clusters:
            fid = cluster["face_id"]
            img_b64 = cluster["image_base64"]
            face_path = save_face_to_disk(video_id, fid, img_b64)
            detected_faces.append({
                "face_id": fid,
                "confidence": round(cluster["confidence"], 4),
                "image_base64": img_b64,
                "face_path": face_path,
                "bbox": cluster.get("bbox"),
                "timestamps": cluster["timestamps"],
                "appearance_count": cluster["count"],
            })

        log.info("[FACES] Unique faces after dedup: %d (from %d detections)", len(detected_faces), len(all_face_detections))
        # ────────────────────────────────────────────────────
        # Build and persist insights (save to index without large base64 when on disk)
        # ────────────────────────────────────────────────────
        objects_to_save = []
        for ob in out_objects:
            ob_save = dict(ob)
            if ob_save.get("frame_path"):
                frame_data = load_object_frame_from_disk(video_id, ob_save["frame_path"])
                if frame_data:
                    ob_save["frame_base64"] = base64.b64encode(frame_data).decode("utf-8")
            objects_to_save.append(ob_save)

        insights = {
            "empty": False,
            "objects_empty": len(objects_to_save) == 0,
            "people_empty": len(detected_faces) == 0,
            "objects": objects_to_save,
            "detected_faces": detected_faces,
            "keyframes": keyframes_info,
            "video_duration_sec": video_duration_sec,
        }
        insights_to_save = insights
        idx = vs_index()
        for rec in idx:
            if rec.get("id") == video_id:
                meta = rec.setdefault("metadata", {})
                meta["video_insights"] = insights_to_save
                meta["insights_empty"] = bool(insights_to_save.get("empty"))
                meta.pop("face_presence", None)  # force face-presence API to recompute with new faces
                break
        vs_save()
        invalidate_video_cache()

        total_elapsed = time.perf_counter() - t_total_start
        log.info(
            "[INSIGHTS] COMPLETE video_id=%s: objects=%d faces=%d keyframes=%d time=%.1fs",
            video_id, len(out_objects), len(detected_faces), len(keyframes_info), total_elapsed,
        )
        return jsonify({"video_id": video_id, "insights": insights})
    except Exception as e:
        log.error("[INSIGHTS] Request failed for video_id=%s (%s)", video_id, type(e).__name__)
        return jsonify({"error": "Internal server error", "video_id": video_id}), 500


# Minimum cosine similarity to consider a frame face as matching a known face (for presence timeline).
FACE_PRESENCE_MATCH_THRESHOLD = 0.60


@videos_bp.route("/<video_id>/face-presence", methods=["GET"])
def api_video_face_presence(video_id: str):
    """
    GET: Return per-face presence across the video timeline.
    Prefers Marengo clip embeddings when available: matches each detected face (Marengo image
    embed) to video clip embeddings for full coverage. Fallback: samples frames at segment
    midpoints and matches faces. Returns segment_presence (0/1 per segment) per face.
    Result is cached in metadata.face_presence.
    """
    video_id = (video_id or "").strip()
    if not video_id:
        return jsonify({"error": "video_id is required"}), 400
    entry = index_get_entry(video_id)
    if not entry:
        return jsonify({"error": "Video not found", "video_id": video_id}), 404
    meta = entry.get("metadata") or {}
    raw_insights = meta.get("video_insights") or {}
    detected_faces = list(raw_insights.get("detected_faces") or [])
    video_duration_sec = raw_insights.get("video_duration_sec") or 0.0

    if not detected_faces:
        return jsonify({
            "video_id": video_id,
            "duration_sec": video_duration_sec,
            "segments": 0,
            "presence": [],
            "message": "No detected faces. Generate insights first.",
        }), 200

    if video_duration_sec <= 0:
        try:
            output_uri = meta.get("output_s3_uri") or f"{S3_EMBEDDINGS_OUTPUT}/{video_id}"
            all_clips = load_video_embeddings_from_s3(output_uri)
            clip_list = [c for c in all_clips if c.get("embeddingScope") == "clip"]
            if clip_list:
                video_duration_sec = max(c.get("endSec", 0) for c in clip_list)
        except Exception:
            pass
        if video_duration_sec <= 0:
            video_duration_sec = 300.0

    # Return cached if present and face count matches
    cached = meta.get("face_presence")
    if (
        cached
        and isinstance(cached.get("presence"), list)
        and len(cached["presence"]) == len(detected_faces)
        and cached.get("duration_sec") == video_duration_sec
    ):
        log.info("[FACE_PRESENCE] Returning cached for video_id=%s", video_id)
        return jsonify({
            "video_id": video_id,
            "duration_sec": cached["duration_sec"],
            "segments": cached["segments"],
            "presence": cached["presence"],
        })

    # Build reference embeddings for each known face (Marengo image embed — same space as clip embeddings)
    face_embeddings: list[list[float]] = []
    for f in detected_faces:
        b64 = None
        if f.get("face_path"):
            b64 = load_face_from_disk(video_id, f["face_path"])
        if not b64 and f.get("image_base64"):
            b64 = f["image_base64"]
        if not b64:
            log.warning("[FACE_PRESENCE] No image for face_id=%s", f.get("face_id"))
            face_embeddings.append([])
            continue
        emb = embed_face_crop({"image_base64": b64})
        face_embeddings.append(emb if emb else [])

    output_uri = meta.get("output_s3_uri") or f"{S3_EMBEDDINGS_OUTPUT}/{video_id}"
    use_marengo = False
    try:
        all_clips = load_video_embeddings_from_s3(output_uri)
        clip_list = [c for c in all_clips if c.get("embeddingScope") == "clip"]
        if clip_list:
            video_duration_sec = max(c.get("endSec", 0) for c in clip_list)
            use_marengo = True
    except Exception as e:
        log.debug("[FACE_PRESENCE] Marengo clips not available for video_id=%s (%s)", video_id, type(e).__name__)

    n_segments = min(40, max(20, int(video_duration_sec / 3.0)))
    seg_dur = video_duration_sec / n_segments
    presence_by_face: list[dict] = [
        {"face_id": i, "segment_presence": [0] * n_segments}
        for i in range(len(detected_faces))
    ]

    if use_marengo:
        # Marengo-based presence: match each face embedding to clip embeddings (full video coverage)
        for j, emb in enumerate(face_embeddings):
            if not emb:
                continue
            clips = clips_above_threshold(
                emb,
                output_uri,
                min_score=FACE_PRESENCE_MATCH_THRESHOLD,
                visual_only=True,
                max_clips=50,
            )
            for clip in clips:
                c_start = float(clip.get("start", 0.0))
                c_end = float(clip.get("end", c_start + 0.5))
                for i in range(n_segments):
                    s0 = i * seg_dur
                    s1 = (i + 1) * seg_dur
                    if c_end > s0 and c_start < s1:
                        presence_by_face[j]["segment_presence"][i] = 1
        log.info("[FACE_PRESENCE] Used Marengo clip embeddings for video_id=%s", video_id)
    else:
        # Fallback: sample frames at segment midpoints and match faces
        for i in range(n_segments):
            t_mid = (i + 0.5) * seg_dur
            frame_bytes = get_frame_bytes(video_id, t_mid)
            if not frame_bytes or is_frame_blurred(frame_bytes):
                continue
            faces_in_frame = detect_and_crop_faces(frame_bytes, output_size=256, min_confidence=0.50)
            for face in faces_in_frame:
                emb = embed_face_crop(face)
                if not emb:
                    continue
                best_j = -1
                best_sim = -1.0
                for j, ref_emb in enumerate(face_embeddings):
                    if not ref_emb:
                        continue
                    sim = face_cosine_sim(emb, ref_emb)
                    if sim > best_sim:
                        best_sim = sim
                        best_j = j
                if best_j >= 0 and best_sim >= FACE_PRESENCE_MATCH_THRESHOLD:
                    presence_by_face[best_j]["segment_presence"][i] = 1

    result = {
        "duration_sec": video_duration_sec,
        "segments": n_segments,
        "presence": presence_by_face,
    }
    # Cache in index
    idx = vs_index()
    for rec in idx:
        if rec.get("id") == video_id:
            rec.setdefault("metadata", {})["face_presence"] = result
            break
    vs_save()
    invalidate_video_cache()

    log.info(
        "[FACE_PRESENCE] Computed for video_id=%s: %d faces, %d segments",
        video_id, len(presence_by_face), n_segments,
    )
    return jsonify({"video_id": video_id, **result})

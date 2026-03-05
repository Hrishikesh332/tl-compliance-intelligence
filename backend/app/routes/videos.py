import logging
import subprocess
import time as _time

from flask import Blueprint, Response, jsonify, request

from app.services.bedrock_marengo import get_async_invocation, load_video_embeddings_from_s3
from concurrent.futures import ThreadPoolExecutor
from app.services.s3_store import upload_video, upload_thumbnail, get_presigned_url, S3_EMBEDDINGS_OUTPUT
from app.services.vector_store import FIXED_INDEX_ID, add as index_add, get_entry as index_get_entry, _save as vs_save, _index as vs_index

from app.utils.faces import detect_and_crop_faces, deduplicate_faces, embed_face_crop
from app.utils.video_helpers import (
    get_tasks,
    invalidate_video_cache,
    video_id_to_s3_uri,
    video_id_to_presigned_url,
    get_frame_bytes,
    extract_duration_and_thumbnail,
    is_frame_blurred,
    get_video_list_cache,
    set_video_list_cache,
    VIDEO_ANALYSIS_PROMPT,
    parse_video_analysis_response,
    normalize_video_analysis,
    TRANSCRIPT_PROMPT,
    parse_transcript_response,
    _timestamp_seconds_for_sort,
    DETECT_PROMPT,
    parse_detect_response,
    save_face_to_disk,
    load_face_from_disk,
    save_object_frame_to_disk,
    load_object_frame_from_disk,
)
from app.services.bedrock_pegasus import analyze_video as pegasus_analyze_video

log = logging.getLogger("app.routes.videos")

videos_bp = Blueprint("videos", __name__)


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
    log.info("Upload started: filename=%s size=%.1fMB", file.filename, size_mb)
    if len(video_bytes) > 300 * 1024 * 1024:
        log.warning("Upload rejected: file too large (%.1fMB)", size_mb)
        return jsonify({"error": "File exceeds 300 MB limit"}), 400
    tags_raw = request.form.get("tags", "").strip()
    tags = [t.strip() for t in tags_raw.split(",") if t.strip()]

    duration_seconds, thumb_bytes = extract_duration_and_thumbnail(video_bytes)
    log.info("Pre-upload probe: duration=%.1fs thumb=%s", duration_seconds or 0, "yes" if thumb_bytes else "no")

    try:
        info = upload_video(video_bytes, file.filename)
        log.info("S3 upload OK: video_id=%s s3_uri=%s", info["video_id"], info["s3_uri"])
    except Exception as e:
        log.error("S3 upload FAILED for %s: %s", file.filename, e, exc_info=True)
        return jsonify({"error": str(e)}), 500

    task_id = info["video_id"]
    thumbnail_s3_key = None
    if thumb_bytes:
        try:
            thumbnail_s3_key = upload_thumbnail(task_id, thumb_bytes)
            log.info("Thumbnail uploaded: %s", thumbnail_s3_key)
        except Exception as e:
            log.warning("Thumbnail upload failed (non-fatal): %s", e)

    tasks = get_tasks()
    try:
        output_uri = f"{S3_EMBEDDINGS_OUTPUT}/{task_id}"
        from app.services.bedrock_marengo import start_video_embedding
        result = start_video_embedding(info["s3_uri"], output_uri)
        log.info("Embedding task started: video_id=%s arn=%s", task_id, result.get("invocation_arn", "")[:80])
        tasks[task_id] = {
            "task_id": task_id,
            "filename": file.filename,
            "status": "indexing",
            "s3_uri": info["s3_uri"],
            "s3_key": info["s3_key"],
            "invocation_arn": result["invocation_arn"],
            "output_s3_uri": output_uri,
            "uploaded_at": info["uploaded_at"],
        }
        meta = {
            "filename": file.filename,
            "s3_uri": info["s3_uri"],
            "s3_key": info["s3_key"],
            "uploaded_at": info["uploaded_at"],
            "status": "indexing",
        }
        if duration_seconds is not None:
            meta["duration_seconds"] = duration_seconds
        if thumbnail_s3_key:
            meta["thumbnail_s3_key"] = thumbnail_s3_key
        if tags:
            meta["tags"] = tags
        index_add(id=task_id, embedding=[0.0] * 512, metadata=meta, type="video")
    except Exception as e:
        log.error("Embedding start FAILED: video_id=%s error=%s", task_id, e, exc_info=True)
        tasks[task_id] = {
            "task_id": task_id,
            "filename": file.filename,
            "status": "failed",
            "error": str(e),
            "s3_uri": info["s3_uri"],
            "s3_key": info["s3_key"],
            "uploaded_at": info["uploaded_at"],
        }
        return jsonify({"error": str(e), "video_id": task_id, "s3_uri": info["s3_uri"]}), 500
    invalidate_video_cache()
    log.info("Upload complete: video_id=%s filename=%s", task_id, file.filename)
    return jsonify({
        "task_id": task_id,
        "filename": file.filename,
        "status": "indexing",
        "s3_uri": info["s3_uri"],
        "indexId": FIXED_INDEX_ID,
    })


@videos_bp.route("/tasks", methods=["GET"])
def api_list_tasks():
    tasks = list(get_tasks().values())
    tasks.sort(key=lambda t: t.get("uploaded_at", ""), reverse=True)
    return jsonify({"tasks": tasks, "count": len(tasks)})


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
    now = _time.monotonic()
    if cache and (now - cache_ts) < ttl:
        return jsonify(cache)
    entries = index_list(type_filter="video")

    def _resolve_urls(entry: dict) -> None:
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

    with ThreadPoolExecutor(max_workers=min(len(entries), 10)) as pool:
        list(pool.map(_resolve_urls, entries))

    result = {"indexId": FIXED_INDEX_ID, "count": len(entries), "videos": entries}
    set_video_list_cache(result)
    return jsonify(result)


@videos_bp.route("/<video_id>/analysis", methods=["POST"])
def api_generate_video_analysis(video_id: str):
    video_id = (video_id or "").strip()
    if not video_id:
        return jsonify({"error": "video_id is required"}), 400
    log.info("[ANALYSIS] Starting analysis for video_id=%s", video_id)
    entry = index_get_entry(video_id)
    if not entry:
        log.warning("[ANALYSIS] Video not found in index: video_id=%s", video_id)
        return jsonify({"error": "Video not found in index. Use a video ID from the videos list (e.g. from Uploads).", "video_id": video_id}), 404
    s3_uri = video_id_to_s3_uri(video_id)
    if not s3_uri:
        log.warning("[ANALYSIS] No S3 location for video_id=%s", video_id)
        return jsonify({
            "error": "Video has no S3 location. Ensure the video was uploaded successfully and S3_BUCKET is set, or that the record has s3_uri/s3_key in metadata.",
            "video_id": video_id,
        }), 400
    try:
        log.info("[ANALYSIS] Calling Pegasus for video_id=%s s3_uri=%s", video_id, s3_uri)
        t0 = _time.perf_counter()
        raw_text = pegasus_analyze_video(s3_uri, VIDEO_ANALYSIS_PROMPT)
        log.info("[ANALYSIS] Pegasus response received in %.1fs (len=%d)", _time.perf_counter() - t0, len(raw_text or ""))
        analysis_dict = parse_video_analysis_response(raw_text)
        if not analysis_dict:
            log.error("[ANALYSIS] Failed to parse Pegasus response as JSON for video_id=%s", video_id)
            return jsonify({
                "error": "Could not parse analysis response as JSON",
                "video_id": video_id,
                "raw_preview": (raw_text[:500] + "..." if len(raw_text) > 500 else raw_text),
            }), 422
        analysis = normalize_video_analysis(analysis_dict)
        log.info(
            "[ANALYSIS] Parsed OK: title=%r categories=%d topics=%d risks=%d transcript_segments=%d riskLevel=%s",
            analysis.get("title", "?")[:60],
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
        log.error("[ANALYSIS] FAILED for video_id=%s: %s", video_id, e, exc_info=True)
        return jsonify({"error": str(e), "video_id": video_id}), 500


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
        t0 = _time.perf_counter()
        raw = pegasus_analyze_video(s3_uri, TRANSCRIPT_PROMPT)
        log.info("[TRANSCRIPT] Pegasus response received in %.1fs (%d chars)", _time.perf_counter() - t0, len(raw or ""))
        new_segments = parse_transcript_response(raw)
        if not new_segments:
            log.warning("[TRANSCRIPT] No segments parsed from response")
            return jsonify({
                "error": "Could not parse transcript from response",
                "video_id": video_id,
                "raw_preview": (raw[:500] + "..." if raw and len(raw) > 500 else raw or ""),
            }), 422
        log.info("[TRANSCRIPT] Parsed %d segments", len(new_segments))
        # If appending: keep existing segments before append_from_seconds, add new segments from that time onward
        if append_from_seconds is not None:
            kept = [s for s in existing_transcript if _timestamp_seconds_for_sort(s.get("time") or "0:00") < append_from_seconds]
            appended = [s for s in new_segments if _timestamp_seconds_for_sort(s.get("time") or "0:00") >= append_from_seconds]
            transcript = kept + appended
            transcript.sort(key=lambda s: _timestamp_seconds_for_sort(s.get("time") or "0:00"))
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
        log.error("[TRANSCRIPT] FAILED for video_id=%s: %s", video_id, e, exc_info=True)
        return jsonify({"error": str(e), "video_id": video_id}), 500


@videos_bp.route("/<video_id>/frame", methods=["GET"])
def api_video_frame(video_id: str):
    video_id = (video_id or "").strip()
    t = request.args.get("t", type=float)
    if t is None or t < 0:
        return jsonify({"error": "Query parameter 't' (seconds) is required and must be >= 0"}), 400
    url = video_id_to_presigned_url(video_id)
    if not url:
        return jsonify({"error": "Video not found or no stream URL", "video_id": video_id}), 404
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
        if result.returncode != 0 or not result.stdout:
            return jsonify({"error": "Frame extraction failed (ffmpeg error or unsupported URL)"}), 503
        return Response(result.stdout, mimetype="image/jpeg")
    except subprocess.TimeoutExpired:
        return jsonify({"error": "Frame extraction timed out"}), 504
    except FileNotFoundError:
        return jsonify({"error": "ffmpeg not installed; install ffmpeg to use frame extraction"}), 503
    except Exception as e:
        return jsonify({"error": str(e)}), 500


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


@videos_bp.route("/<video_id>/insights", methods=["GET", "POST"])
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
        objects = list(insights.get("objects") or [])
        insights["objects"] = []
        for ob in objects:
            ob_copy = dict(ob)
            ts = ob_copy.get("timestamp")
            if ob_copy.get("frame_path"):
                ob_copy["frame_url"] = f"/api/videos/{video_id}/object-frames/{ob_copy['frame_path']}"
            elif ts is not None:
                ob_copy["frame_url"] = f"/api/videos/{video_id}/frame?t={ts}"
            insights["objects"].append(ob_copy)
        faces = list(insights.get("detected_faces") or [])
        insights["detected_faces"] = []
        for f in faces:
            f_copy = dict(f)
            if f_copy.get("face_path"):
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

    # ── POST: generate fresh insights ──
    if not s3_uri:
        log.warning("[INSIGHTS] No S3 URI for video_id=%s", video_id)
        return jsonify({"error": "Video has no S3 location", "video_id": video_id}), 400
    if not is_ready:
        log.warning("[INSIGHTS] Video not ready: video_id=%s status=%s", video_id, meta.get("status"))
        return jsonify({"error": "Video is not ready (indexing not complete). Wait for status 'ready'.", "video_id": video_id}), 400

    t_total_start = _time.perf_counter()
    try:
        # ────────────────────────────────────────────────────
        # STEP 1 — Single Pegasus call: objects + face keyframes
        # ────────────────────────────────────────────────────
        log.info("[INSIGHTS] Calling Pegasus DETECT_PROMPT for video_id=%s s3=%s", video_id, s3_uri)
        t0 = _time.perf_counter()
        raw_response = pegasus_analyze_video(s3_uri, DETECT_PROMPT)
        log.info("[INSIGHTS] Pegasus raw response received in %.1fs (%d chars)", _time.perf_counter() - t0, len(raw_response or ""))
        log.info("[INSIGHTS] ── RAW PEGASUS RESPONSE START ──")
        log.info("%s", raw_response)
        log.info("[INSIGHTS] ── RAW PEGASUS RESPONSE END ──")

        detect_data = parse_detect_response(raw_response)
        objects_raw = detect_data["objects"]
        face_keyframes = detect_data["face_keyframes"]

        # ────────────────────────────────────────────────────
        # STEP 2 — Process objects: extract frame + bbox
        # ────────────────────────────────────────────────────
        seen = set()
        out_objects = []
        for ob in objects_raw:
            key = (ob["object"], ob["timestamp"])
            if key in seen:
                continue
            seen.add(key)
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
        for ob in out_objects:
            log.info("  -> %s at t=%ss", ob["object"], ob["timestamp"])

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
            log.warning("[INSIGHTS] Could not load clips for duration: %s", e)
        if video_duration_sec <= 0:
            video_duration_sec = 300.0
            log.info("[INSIGHTS] Using fallback duration=%.1fs", video_duration_sec)

        # ────────────────────────────────────────────────────
        # STEP 4 — Extract faces: Pegasus keyframes + uniform sampling across video
        #          so we don't miss people who appear at times Pegasus didn't pick.
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
        # Add uniform samples across the video so faces at non-keyframe times are not missed
        n_uniform = 14
        step_sec = max(video_duration_sec / (n_uniform + 1), 2.0)
        uniform_timestamps = [round(step_sec * (i + 1), 1) for i in range(n_uniform)]
        # Only add uniform t if not already within 2.5s of a keyframe (avoid duplicate frames)
        face_sample_timestamps: list[tuple[float, str]] = [
            (round(kf["timestamp"], 1), kf.get("description", ""))
            for kf in face_keyframes
        ]
        for t in uniform_timestamps:
            if any(abs(t - kt) < 2.5 for kt in keyframe_ts_set):
                continue
            face_sample_timestamps.append((t, f"uniform sample t={t}s"))

        log.info("[FACES] Using %d frames for face detection (keyframes + uniform):", len(face_sample_timestamps))
        for t, desc in face_sample_timestamps[:10]:
            log.info("  t=%.1fs — %s", t, desc)
        if len(face_sample_timestamps) > 10:
            log.info("  ... and %d more", len(face_sample_timestamps) - 10)

        all_face_detections: list[dict] = []
        keyframes_info: list[dict] = []
        # Slightly lower confidence (0.50) to catch more faces (e.g. partial profile)
        face_min_conf = 0.50

        for t, desc in face_sample_timestamps:
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
            if is_frame_blurred(frame_bytes):
                log.info("[FACES] Frame at t=%.1f is blurred, skipping", t)
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
        for df in detected_faces:
            log.info(
                "  -> face#%s: conf=%.2f appearances=%d timestamps=%s",
                df["face_id"], df["confidence"], df["appearance_count"], df["timestamps"],
            )

        # ────────────────────────────────────────────────────
        # Build and persist insights (save to index without large base64 when on disk)
        # ────────────────────────────────────────────────────
        insights = {
            "objects": out_objects,
            "detected_faces": detected_faces,
            "keyframes": keyframes_info,
            "video_duration_sec": video_duration_sec,
        }
        insights_to_save = {
            "objects": out_objects,
            "detected_faces": [
                {**f, "image_base64": "" if f.get("face_path") else f.get("image_base64", "")}
                for f in detected_faces
            ],
            "keyframes": keyframes_info,
            "video_duration_sec": video_duration_sec,
        }
        idx = vs_index()
        for rec in idx:
            if rec.get("id") == video_id:
                rec.setdefault("metadata", {})["video_insights"] = insights_to_save
                break
        vs_save()
        invalidate_video_cache()

        total_elapsed = _time.perf_counter() - t_total_start
        log.info(
            "[INSIGHTS] COMPLETE video_id=%s: objects=%d faces=%d keyframes=%d time=%.1fs",
            video_id, len(out_objects), len(detected_faces), len(keyframes_info), total_elapsed,
        )
        return jsonify({"video_id": video_id, "insights": insights})
    except Exception as e:
        log.error("[INSIGHTS] FAILED for video_id=%s: %s", video_id, e, exc_info=True)
        return jsonify({"error": str(e), "video_id": video_id}), 500

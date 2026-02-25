import subprocess
import time as _time

from flask import Blueprint, Response, jsonify, request

from app.services.bedrock_marengo import get_async_invocation, load_video_embeddings_from_s3
from app.services.s3_store import upload_video, get_presigned_url, S3_EMBEDDINGS_OUTPUT
from app.services.vector_store import FIXED_INDEX_ID, add as index_add, get_entry as index_get_entry, _save as vs_save, _index as vs_index

from app.utils.faces import detect_and_crop_faces
from app.utils.video_helpers import (
    get_tasks,
    invalidate_video_cache,
    video_id_to_s3_uri,
    video_id_to_presigned_url,
    get_frame_bytes,
    is_frame_blurred,
    get_face_from_video_frames,
    get_object_bbox_from_frame,
    get_video_list_cache,
    set_video_list_cache,
    VIDEO_ANALYSIS_PROMPT,
    parse_video_analysis_response,
    normalize_video_analysis,
    OBJECTS_PROMPT,
    parse_objects_response,
    is_crucial_object,
    clip_search,
    best_clip_score,
    ENTITY_CLIP_MIN_SCORE,
)
from app.services.bedrock_pegasus import analyze_video as pegasus_analyze_video

videos_bp = Blueprint("videos", __name__)


@videos_bp.route("/upload", methods=["POST"])
def api_upload_video():
    if "video" not in request.files:
        return jsonify({"error": "No 'video' file provided"}), 400
    file = request.files["video"]
    if not file.filename:
        return jsonify({"error": "Empty filename"}), 400
    video_bytes = file.read()
    if len(video_bytes) > 300 * 1024 * 1024:
        return jsonify({"error": "File exceeds 300 MB limit"}), 400
    tags_raw = request.form.get("tags", "").strip()
    tags = [t.strip() for t in tags_raw.split(",") if t.strip()]
    try:
        info = upload_video(video_bytes, file.filename)
    except Exception as e:
        return jsonify({"error": str(e)}), 500
    task_id = info["video_id"]
    tasks = get_tasks()
    try:
        output_uri = f"{S3_EMBEDDINGS_OUTPUT}/{task_id}"
        from app.services.bedrock_marengo import start_video_embedding
        result = start_video_embedding(info["s3_uri"], output_uri)
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
        if tags:
            meta["tags"] = tags
        index_add(id=task_id, embedding=[0.0] * 512, metadata=meta, type="video")
    except Exception as e:
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
    for entry in entries:
        s3_key = entry.get("metadata", {}).get("s3_key")
        if s3_key:
            try:
                entry["stream_url"] = get_presigned_url(s3_key)
            except Exception:
                entry["stream_url"] = None
    result = {"indexId": FIXED_INDEX_ID, "count": len(entries), "videos": entries}
    set_video_list_cache(result)
    return jsonify(result)


@videos_bp.route("/<video_id>/analysis", methods=["POST"])
def api_generate_video_analysis(video_id: str):
    video_id = (video_id or "").strip()
    if not video_id:
        return jsonify({"error": "video_id is required"}), 400
    entry = index_get_entry(video_id)
    if not entry:
        return jsonify({"error": "Video not found in index. Use a video ID from the videos list (e.g. from Uploads).", "video_id": video_id}), 404
    s3_uri = video_id_to_s3_uri(video_id)
    if not s3_uri:
        return jsonify({
            "error": "Video has no S3 location. Ensure the video was uploaded successfully and S3_BUCKET is set, or that the record has s3_uri/s3_key in metadata.",
            "video_id": video_id,
        }), 400
    try:
        raw_text = pegasus_analyze_video(s3_uri, VIDEO_ANALYSIS_PROMPT)
        analysis_dict = parse_video_analysis_response(raw_text)
        if not analysis_dict:
            return jsonify({
                "error": "Could not parse analysis response as JSON",
                "video_id": video_id,
                "raw_preview": (raw_text[:500] + "..." if len(raw_text) > 500 else raw_text),
            }), 422
        analysis = normalize_video_analysis(analysis_dict)
        idx = vs_index()
        for rec in idx:
            if rec.get("id") == video_id:
                rec.setdefault("metadata", {})["video_analysis"] = analysis
                break
        vs_save()
        invalidate_video_cache()
        return jsonify({"video_id": video_id, "analysis": analysis})
    except Exception as e:
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


@videos_bp.route("/<video_id>/insights", methods=["GET", "POST"])
def api_video_insights(video_id: str):
    from app.services.vector_store import list_entries as index_list
    from app.services.vector_store import search as index_search

    video_id = (video_id or "").strip()
    if not video_id:
        return jsonify({"error": "video_id is required"}), 400
    entry = index_get_entry(video_id)
    if not entry:
        return jsonify({
            "error": "Video not found in index. Use a video ID from the videos list (e.g. from Uploads). Refresh the list or re-upload the video.",
            "video_id": video_id,
        }), 404
    meta = entry.get("metadata") or {}
    s3_uri = video_id_to_s3_uri(video_id)
    output_uri = meta.get("output_s3_uri") or f"{S3_EMBEDDINGS_OUTPUT}/{video_id}"
    is_ready = meta.get("status") == "ready"

    if request.method == "GET":
        raw_insights = meta.get("video_insights")
        if not raw_insights:
            return jsonify({"video_id": video_id, "insights": None})
        insights = dict(raw_insights)
        objects = list(insights.get("objects") or [])
        insights["objects"] = []
        for ob in objects:
            ob_copy = dict(ob)
            ts = ob_copy.get("timestamp")
            if ts is not None:
                ob_copy["frame_url"] = f"/api/videos/{video_id}/frame?t={ts}"
            insights["objects"].append(ob_copy)
        return jsonify({"video_id": video_id, "insights": insights})

    if not s3_uri:
        return jsonify({"error": "Video has no S3 location", "video_id": video_id}), 400
    if not is_ready:
        return jsonify({"error": "Video is not ready (indexing not complete). Wait for status 'ready'.", "video_id": video_id}), 400

    try:
        raw_objects = pegasus_analyze_video(s3_uri, OBJECTS_PROMPT)
        objects = parse_objects_response(raw_objects)
        seen = set()
        out_objects = []
        for ob in objects:
            key = (ob["object"], ob["timestamp"])
            if key in seen:
                continue
            seen.add(key)
            ob_copy = dict(ob)
            ob_copy["frame_url"] = f"/api/videos/{video_id}/frame?t={ob_copy['timestamp']}"
            frame_bytes = get_frame_bytes(video_id, ob_copy["timestamp"])
            if frame_bytes and not is_frame_blurred(frame_bytes):
                bbox = get_object_bbox_from_frame(frame_bytes, ob_copy.get("object") or "")
                if bbox:
                    ob_copy["bbox"] = bbox
            out_objects.append(ob_copy)

        video_duration_sec = 0.0
        try:
            all_clips = load_video_embeddings_from_s3(output_uri)
            clip_list = [c for c in all_clips if c.get("embeddingScope") == "clip"]
            if clip_list:
                video_duration_sec = max(c.get("endSec", 0) for c in clip_list)
        except Exception:
            pass
        if video_duration_sec <= 0:
            video_duration_sec = 300.0

        entities = index_list(type_filter="entity")
        people = []
        link_data_by_entity = {}
        for rec in entities:
            eid = rec.get("id")
            if not eid:
                continue
            full = index_get_entry(eid)
            if not full or not full.get("embedding"):
                continue
            emb = full["embedding"]
            try:
                best_sc = best_clip_score(emb, output_uri, visual_only=True)
            except Exception:
                best_sc = 0.0
            if best_sc < ENTITY_CLIP_MIN_SCORE:
                continue
            clips = clip_search(
                emb, output_uri, top_n=15, min_score=ENTITY_CLIP_MIN_SCORE, visual_only=True
            )
            total_sec = sum(c["end"] - c["start"] for c in clips)
            percent = round((total_sec / video_duration_sec) * 100, 2) if video_duration_sec else 0
            name = (full.get("metadata") or {}).get("name") or eid
            face_b64 = (full.get("metadata") or {}).get("face_snap_base64")
            initials = "".join((w[0] or "").upper() for w in name.split()[:2])[:2] or "?"
            face_from_video_b64 = get_face_from_video_frames(video_id, clips)
            people.append({
                "entity_id": eid,
                "name": name,
                "avatar": initials,
                "percent": percent,
                "face_snap_base64": face_b64,
                "face_from_video_base64": face_from_video_b64,
                "clips": [{"start": c["start"], "end": c["end"], "score": c["score"]} for c in clips],
            })
            video_results = index_search(emb, top_k=10, type_filter="video")
            linked_videos = [{"id": r["id"], "label": (r.get("metadata") or {}).get("filename") or r["id"], "type": "video"} for r in video_results if r.get("id") != video_id][:8]
            transcript = (meta.get("video_analysis") or {}).get("transcript") or []
            mentions = []
            for seg in transcript:
                text = (seg.get("text") or "").strip()
                time_str = seg.get("time") or "0:00"
                if name.lower() in text.lower():
                    mentions.append({"text": text, "timestamp": time_str, "address": "", "nodeId": ""})
            link_data_by_entity[eid] = {
                "personName": name,
                "personInitials": initials,
                "personFaceBase64": face_from_video_b64,
                "mentionCount": len(mentions),
                "mentions": mentions,
                "linkedNodes": linked_videos,
            }

        transcript = (meta.get("video_analysis") or {}).get("transcript") or []
        mentioned_set = set()
        for seg in transcript:
            for p in people:
                if p["name"].lower() in (seg.get("text") or "").lower():
                    mentioned_set.add(p["name"])
        mentioned = sorted(mentioned_set)

        insights = {
            "people": people,
            "mentioned": list(mentioned),
            "objects": out_objects,
            "link_data_by_entity": link_data_by_entity,
            "video_duration_sec": video_duration_sec,
        }
        idx = vs_index()
        for rec in idx:
            if rec.get("id") == video_id:
                rec.setdefault("metadata", {})["video_insights"] = insights
                break
        vs_save()
        invalidate_video_cache()
        return jsonify({"video_id": video_id, "insights": insights})
    except Exception as e:
        return jsonify({"error": str(e), "video_id": video_id}), 500

import logging

from flask import Blueprint, jsonify, request

from app.services.s3_store import get_presigned_url, S3_EMBEDDINGS_OUTPUT
from app.services.vector_store import FIXED_INDEX_ID, list_entries as index_list, search as index_search

from app.utils.video_helpers import (
    get_search_embedding_from_request,
    clip_search,
    best_clip_score,
    face_match_score_in_video,
    ENTITY_CLIP_MIN_SCORE,
)

log = logging.getLogger("app.routes.search")

search_bp = Blueprint("search", __name__)


@search_bp.route("/videos", methods=["POST"])
def api_search_videos():
    data = request.get_json(silent=True) or {}
    query_emb, display_query, is_entity_search, err = get_search_embedding_from_request(data, request)
    log.info("[SEARCH] type=%s query=%r", "entity" if is_entity_search else "text", display_query or "(none)")
    if err or not query_emb:
        log.warning("[SEARCH] Embedding error: %s", err)
        return jsonify({"error": err or "Could not get search embedding"}), 400
    default_top_k = 12 if is_entity_search else 24
    top_k = data.get("top_k") or request.args.get("top_k", type=int) or default_top_k
    top_k = max(1, min(100, top_k))
    clips_per_video = data.get("clips_per_video")
    if clips_per_video is None:
        clips_per_video = 1 if is_entity_search else 5
    clips_per_video = max(1, min(20, clips_per_video))
    metadata_filter = data.get("filter") or data.get("metadata_filter") or {}
    clip_min_score = ENTITY_CLIP_MIN_SCORE if is_entity_search else None

    try:
        if is_entity_search:
            all_videos = index_list(type_filter="video")
            candidates = []
            for rec in all_videos:
                meta = rec.get("metadata") or {}
                if meta.get("status") != "ready":
                    continue
                output_uri = meta.get("output_s3_uri") or f"{S3_EMBEDDINGS_OUTPUT}/{rec.get('id', '')}"
                if not output_uri or not rec.get("id"):
                    continue
                if metadata_filter and not all(meta.get(k) == v for k, v in metadata_filter.items()):
                    continue
                try:
                    best_sc = best_clip_score(query_emb, output_uri, visual_only=True)
                except Exception:
                    best_sc = 0.0
                if best_sc < ENTITY_CLIP_MIN_SCORE:
                    continue
                candidates.append({"id": rec["id"], "score": best_sc, "metadata": meta})
            candidates.sort(key=lambda x: -x["score"])
            # Re-rank by face-only matching: extract faces from video frames and compare to entity
            video_ids_to_rerank = [c["id"] for c in candidates[: max(top_k * 2, 20)]]
            face_scores_and_clips: dict[str, tuple[float, list]] = {}
            for vid in video_ids_to_rerank:
                rec = next((r for r in candidates if r["id"] == vid), None)
                if not rec:
                    continue
                output_uri = rec.get("metadata", {}).get("output_s3_uri") or f"{S3_EMBEDDINGS_OUTPUT}/{vid}"
                try:
                    face_score, face_clips = face_match_score_in_video(
                        query_emb, vid, output_uri, max_frames=10
                    )
                    face_scores_and_clips[vid] = (face_score, face_clips)
                except Exception:
                    face_scores_and_clips[vid] = (rec["score"], [])
            # Use face-match score when we have it; fall back to clip score
            def entity_score(c):
                vid = c["id"]
                face_score, _ = face_scores_and_clips.get(vid, (0.0, []))
                return face_score if face_score >= ENTITY_CLIP_MIN_SCORE else c["score"]
            candidates_reranked = sorted(
                [c for c in candidates if c["id"] in face_scores_and_clips],
                key=lambda x: -entity_score(x),
            )
            # Include any remaining candidates that weren’t re-scored (by original score)
            remaining = [c for c in candidates if c["id"] not in face_scores_and_clips]
            results = candidates_reranked + remaining
            results = results[:top_k]
            # Attach face score and face-matched clips to each result for response
            for c in results:
                vid = c["id"]
                face_score, face_clips = face_scores_and_clips.get(vid, (0.0, []))
                c["score"] = face_score if face_score >= ENTITY_CLIP_MIN_SCORE else c["score"]
                c["face_clips"] = face_clips if face_score >= ENTITY_CLIP_MIN_SCORE else []
        else:
            results = index_search(
                query_emb,
                top_k=top_k,
                type_filter="video",
                metadata_filter=metadata_filter or None,
            )

        out = []
        for r in results:
            meta = r.get("metadata", {})
            s3_key = meta.get("s3_key")
            stream_url = None
            if s3_key:
                try:
                    stream_url = get_presigned_url(s3_key)
                except Exception:
                    pass
            clips = []
            if is_entity_search and r.get("face_clips") is not None:
                clips = r["face_clips"][:clips_per_video]
            else:
                output_uri = meta.get("output_s3_uri") or (f"{S3_EMBEDDINGS_OUTPUT}/{r['id']}" if r.get("id") else None)
                if output_uri and meta.get("status") == "ready":
                    try:
                        clips = clip_search(
                            query_emb,
                            output_uri,
                            top_n=clips_per_video,
                            min_score=clip_min_score,
                            visual_only=is_entity_search,
                        )
                    except Exception:
                        pass
            out.append({
                "id": r["id"],
                "score": r["score"],
                "metadata": meta,
                "stream_url": stream_url,
                "clips": clips,
            })
        log.info("[SEARCH] Returning %d results for query=%r", len(out), display_query)
        return jsonify({
            "indexId": FIXED_INDEX_ID,
            "query": display_query,
            "count": len(out),
            "results": out,
        })
    except Exception as e:
        log.error("[SEARCH] FAILED: %s", e, exc_info=True)
        return jsonify({"error": str(e)}), 500


@search_bp.route("/entity", methods=["POST"])
def api_search_entity():
    data = request.get_json(silent=True) or {}
    query = data.get("query") or data.get("text") or request.form.get("query") or request.form.get("text") or ""
    if not query.strip():
        return jsonify({"error": "Missing or empty 'query' or 'text'"}), 400
    top_k = request.args.get("top_k", type=int) or data.get("top_k", 20)
    top_k = max(1, min(100, top_k))
    type_filter = request.args.get("type") or data.get("type")
    metadata_filter = data.get("filter") or data.get("metadata_filter") or {}
    try:
        from app.services.bedrock_marengo import embed_text
        embedding = embed_text(query.strip())
        results = index_search(embedding, top_k=top_k, type_filter=type_filter or "entity", metadata_filter=metadata_filter)
        return jsonify({"indexId": FIXED_INDEX_ID, "results": results})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@search_bp.route("/image", methods=["POST"])
def api_search_image():
    from app.services.bedrock_marengo import embed_image

    media = None
    if request.files and "image" in request.files:
        file = request.files["image"]
        if file.filename:
            from app.services.bedrock_marengo import media_source_base64
            media = media_source_base64(file.read())
    data = request.get_json(silent=True) or {}
    if not media:
        b64 = data.get("base64") or data.get("image_base64")
        if b64:
            media = {"base64String": b64}
        s3 = data.get("s3Location") or data.get("s3_uri")
        if s3:
            uri = s3.get("uri") if isinstance(s3, dict) else s3
            owner = s3.get("bucketOwner") if isinstance(s3, dict) else None
            media = {"s3Location": {"uri": uri, **({"bucketOwner": owner} if owner else {})}}
    if not media:
        return jsonify({"error": "Provide 'image' file or JSON with 'base64'/'s3Location'"}), 400
    top_k = request.args.get("top_k", type=int) or data.get("top_k", 20)
    top_k = max(1, min(100, top_k))
    type_filter = request.args.get("type") or data.get("type")
    metadata_filter = data.get("filter") or data.get("metadata_filter") or {}
    try:
        embedding = embed_image(media)
        results = index_search(embedding, top_k=top_k, type_filter=type_filter or None, metadata_filter=metadata_filter)
        return jsonify({"indexId": FIXED_INDEX_ID, "results": results})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

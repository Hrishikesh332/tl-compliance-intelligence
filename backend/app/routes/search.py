import logging
from concurrent.futures import ThreadPoolExecutor
import time as _time

from flask import Blueprint, jsonify, request

from app.services.s3_store import get_presigned_url, S3_EMBEDDINGS_OUTPUT
from app.services.vector_store import FIXED_INDEX_ID, list_entries as index_list, search as index_search

from app.utils.video_helpers import (
    get_search_embedding_from_request,
    clip_search,
    best_clip_score_and_count,
    clips_above_threshold,
    entity_ranking_score,
    ENTITY_CLIP_MIN_SCORE,
)

log = logging.getLogger("app.routes.search")

search_bp = Blueprint("search", __name__)


# ---------------------------------------------------------------------------
#  Shared video-search helper (used by /videos and /hybrid)
#  Entity search = search VIDEOS by entity - similarity only (Marengo embeddings),
# ---------------------------------------------------------------------------


def _run_video_search(
    data: dict,
    *,
    request_query: str = "",
    request_top_k: int | None = None,
    image_bytes: bytes | None = None,
) -> tuple[list[dict], str, str | None]:
    """Run the full video search pipeline and return (results, display_query, error).

    Entity search (when entity_id(s) are provided) - search VIDEOS only. 
    
    Uses precomputed Marengo embeddings - entity embedding vs video clip embeddings
    (cosine similarity)
    """
    query_emb, display_query, is_entity_search, err = get_search_embedding_from_request(
        data,
        request_query=request_query,
        image_bytes=image_bytes,
    )
    log.info("[SEARCH] type=%s", "entity" if is_entity_search else "text")
    if err or not query_emb:
        return [], display_query or "", err or "Could not get search embedding"

    default_top_k = 8 if is_entity_search else 16
    top_k = data.get("top_k") or request_top_k or default_top_k
    top_k = max(1, min(50, top_k))
    clips_per_video = data.get("clips_per_video")
    if clips_per_video is None:
        clips_per_video = 1 if is_entity_search else 5
    clips_per_video = max(1, min(20, clips_per_video))
    metadata_filter = data.get("filter") or data.get("metadata_filter") or {}
    clip_min_score = ENTITY_CLIP_MIN_SCORE if is_entity_search else None

    if is_entity_search:
        # Video-only - rank by similarity (entity emb vs precomputed clip embs). No ResNet.
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
                best_sc, match_count, top_k_avg = best_clip_score_and_count(
                    query_emb, output_uri, ENTITY_CLIP_MIN_SCORE, visual_only=True
                )
            except Exception:
                best_sc, match_count, top_k_avg = 0.0, 0, 0.0
            if best_sc < ENTITY_CLIP_MIN_SCORE:
                continue
            rank_score = entity_ranking_score(best_sc, match_count, top_k_avg)
            candidates.append({
                "id": rec["id"],
                "score": rank_score,
                "best_clip_score": best_sc,
                "metadata": meta,
                "output_uri": output_uri,
            })
        candidates.sort(key=lambda x: -x["score"])
        results = candidates[:top_k]
    else:
        results = index_search(
            query_emb,
            top_k=top_k,
            type_filter="video",
            metadata_filter=metadata_filter or None,
        )

    out: list[dict] = []
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
        if is_entity_search:
            output_uri = meta.get("output_s3_uri") or (f"{S3_EMBEDDINGS_OUTPUT}/{r['id']}" if r.get("id") else None)
            if output_uri and meta.get("status") == "ready":
                try:
                    clips = clips_above_threshold(
                        query_emb,
                        output_uri,
                        min_score=ENTITY_CLIP_MIN_SCORE,
                        visual_only=True,
                        max_clips=clips_per_video,
                    )
                except Exception:
                    pass
        if not clips:
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

    log.info("[SEARCH] Returning %d video results", len(out))
    return out, display_query, None


def _run_document_search(text_query: str, doc_top_k: int) -> list[dict]:
    from app.services.nemo_retriever import embed_query, search_docs

    t0 = _time.perf_counter()
    log.info("[DOC_SEARCH] Started doc search top_k=%d", doc_top_k)
    query_emb = embed_query(text_query)
    docs = search_docs(query_emb, top_k=doc_top_k)
    log.info(
        "[DOC_SEARCH] Completed %d doc results in %.1fms",
        len(docs),
        (_time.perf_counter() - t0) * 1000,
    )
    return docs


@search_bp.route("/videos", methods=["POST"])
def api_search_videos():
    data = request.get_json(silent=True) or {}
    request_query = (request.form.get("query") or request.form.get("text") or "").strip()
    request_top_k = request.args.get("top_k", type=int)
    image_bytes = None
    if request.files and "image" in request.files:
        file = request.files["image"]
        if file.filename:
            image_bytes = file.read()
    try:
        video_results, display_query, err = _run_video_search(
            data,
            request_query=request_query,
            request_top_k=request_top_k,
            image_bytes=image_bytes,
        )
        if err:
            log.warning("[SEARCH] Request rejected during embedding validation")
            return jsonify({"error": err}), 400
        return jsonify({
            "indexId": FIXED_INDEX_ID,
            "query": display_query,
            "count": len(video_results),
            "results": video_results,
        })
    except Exception as e:
        log.error("[SEARCH] Request failed (%s)", type(e).__name__)
        return jsonify({"error": "Internal server error"}), 500


# ---------------------------------------------------------------------------
#  Hybrid search - videos + NeMo document chunks in one response
# ---------------------------------------------------------------------------


@search_bp.route("/hybrid", methods=["POST"])
def api_search_hybrid():
    """Single endpoint that returns both video results and document chunks."""
    data = request.get_json(silent=True) or {}
    request_query = (request.form.get("query") or request.form.get("text") or "").strip()
    request_top_k = request.args.get("top_k", type=int)
    image_bytes = None
    if request.files and "image" in request.files:
        file = request.files["image"]
        if file.filename:
            image_bytes = file.read()
    text_query = (data.get("query") or data.get("text") or request_query or "").strip()
    doc_top_k = max(1, min(10, int(data.get("doc_top_k", 5))))

    video_results: list[dict] = []
    display_query = text_query
    video_error: str | None = None
    video_error_status = 400
    doc_results: list[dict] = []
    doc_error: str | None = None

    hybrid_t0 = _time.perf_counter()
    with ThreadPoolExecutor(max_workers=2) as pool:
        log.info("[HYBRID] Launching video search + doc search in parallel")
        video_future = pool.submit(
            _run_video_search,
            data,
            request_query=request_query,
            request_top_k=request_top_k,
            image_bytes=image_bytes,
        )
        doc_future = pool.submit(_run_document_search, text_query, doc_top_k) if text_query else None
        if doc_future is None:
            log.info("[HYBRID] Skipping doc search (empty text query)")

        try:
            video_results, display_query, video_error = video_future.result()
        except Exception as e:
            log.error("[HYBRID] Video search failed (%s)", type(e).__name__)
            video_error = "Video search failed"
            video_error_status = 500

        if doc_future is not None:
            try:
                doc_results = doc_future.result()
            except Exception as e:
                log.error("[HYBRID] Document search failed (%s)", type(e).__name__)
                doc_error = "Document search unavailable"

    if video_error:
        log.warning("[HYBRID] Video search returned an error without document impact")

    # If video search had an embedding error and there are no doc results
    # either, surface that error to the client.
    if video_error and not video_results and not doc_results:
        return jsonify({"error": video_error}), video_error_status

    resp: dict = {
        "query": display_query,
        "videoCount": len(video_results),
        "videoResults": video_results,
        "docCount": len(doc_results),
        "documents": doc_results,
    }
    if doc_error:
        resp["doc_error"] = doc_error

    log.info(
        "[HYBRID] Returning %d video(s) + %d doc(s) total=%.1fms",
        len(video_results), len(doc_results), (_time.perf_counter() - hybrid_t0) * 1000,
    )
    return jsonify(resp)


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
    except Exception:
        return jsonify({"error": "Internal server error"}), 500


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
    except Exception:
        return jsonify({"error": "Internal server error"}), 500

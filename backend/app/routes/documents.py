"""
Document upload, listing, and search endpoints.

Calls ONLY app.services.nemo_retriever — no imports from the video pipeline.
"""

import logging
import mimetypes
import os
import tempfile

from flask import Blueprint, Response, jsonify, request

from app.services.nemo_retriever import (
    ALLOWED_EXTENSIONS,
    MAX_DOC_SIZE,
    S3_BUCKET,
    S3_DOC_PREFIX,
    embed_query,
    ingest_document,
    list_docs,
    search_docs,
    upload_document,
)

log = logging.getLogger("app.routes.documents")

documents_bp = Blueprint("documents", __name__)


@documents_bp.route("/upload", methods=["POST"])
def api_upload_document():
    """Upload a document, store in S3, extract + embed via NeMo Retriever."""
    if "document" not in request.files:
        return jsonify({"error": "Missing 'document' file field"}), 400

    file = request.files["document"]
    if not file.filename:
        return jsonify({"error": "Empty filename"}), 400

    ext = os.path.splitext(file.filename)[1].lower()
    if ext not in ALLOWED_EXTENSIONS:
        return jsonify({
            "error": f"Unsupported file type '{ext}'. Allowed: {', '.join(sorted(ALLOWED_EXTENSIONS))}"
        }), 400

    file_bytes = file.read()
    if len(file_bytes) > MAX_DOC_SIZE:
        return jsonify({"error": f"File too large (max {MAX_DOC_SIZE // (1024*1024)} MB)"}), 400

    try:
        upload_info = upload_document(file_bytes, file.filename)
        doc_id = upload_info["doc_id"]
        log.info("Document %s uploaded to S3, starting ingestion", doc_id)

        with tempfile.NamedTemporaryFile(suffix=ext, delete=False) as tmp:
            tmp.write(file_bytes)
            tmp_path = tmp.name

        try:
            result = ingest_document(tmp_path, doc_id, file.filename)
        finally:
            try:
                os.unlink(tmp_path)
            except OSError:
                pass

        return jsonify({
            "doc_id": doc_id,
            "filename": file.filename,
            "chunks": result.get("chunks", 0),
            "status": result.get("status", "ready"),
        })

    except Exception as exc:
        log.error("Document upload/ingest failed: %s", exc, exc_info=True)
        return jsonify({"error": str(exc)}), 500


@documents_bp.route("", methods=["GET"])
def api_list_documents():
    """List all ingested documents with chunk counts."""
    try:
        docs = list_docs()
        return jsonify({"documents": docs})
    except Exception as exc:
        log.error("Failed to list documents: %s", exc, exc_info=True)
        return jsonify({"error": str(exc)}), 500


@documents_bp.route("/search", methods=["POST"])
def api_search_documents():
    """Semantic search over ingested documents."""
    data = request.get_json(silent=True) or {}
    query = data.get("query", "").strip()
    if not query:
        return jsonify({"error": "Missing or empty 'query'"}), 400

    top_k = data.get("top_k", 10)
    top_k = max(1, min(50, int(top_k)))

    try:
        query_emb = embed_query(query)
        results = search_docs(query_emb, top_k=top_k)

        return jsonify({
            "query": query,
            "count": len(results),
            "results": results,
        })
    except Exception as exc:
        log.error("Document search failed: %s", exc, exc_info=True)
        return jsonify({"error": str(exc)}), 500


@documents_bp.route("/file/<doc_id>/<path:filename>", methods=["GET"])
def api_serve_document(doc_id: str, filename: str):
    """Serve an uploaded document file back to the browser (PDF inline, others as download)."""
    doc_id = (doc_id or "").strip()
    if not doc_id or ".." in doc_id or "/" in doc_id:
        return jsonify({"error": "Invalid doc_id"}), 400

    ext = os.path.splitext(filename)[1].lower() or ".pdf"
    key = f"{S3_DOC_PREFIX}/{doc_id}{ext}"
    mime = mimetypes.guess_type(filename)[0] or "application/octet-stream"

    if S3_BUCKET:
        import boto3
        try:
            s3 = boto3.client("s3", region_name=os.environ.get("AWS_REGION", "us-east-1"))
            obj = s3.get_object(Bucket=S3_BUCKET, Key=key)
            body = obj["Body"].read()
            disposition = "inline" if ext == ".pdf" else f'attachment; filename="{filename}"'
            return Response(body, mimetype=mime, headers={"Content-Disposition": disposition})
        except Exception as exc:
            log.warning("Failed to fetch document from S3: %s", exc)
            return jsonify({"error": "Document file not found"}), 404
    else:
        from pathlib import Path
        local_path = Path(__file__).resolve().parent.parent.parent / "data" / S3_DOC_PREFIX / f"{doc_id}{ext}"
        if not local_path.exists():
            return jsonify({"error": "Document file not found"}), 404
        disposition = "inline" if ext == ".pdf" else f'attachment; filename="{filename}"'
        return Response(local_path.read_bytes(), mimetype=mime, headers={"Content-Disposition": disposition})

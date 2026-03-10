import json
import logging
import os
import time
import uuid
from pathlib import Path

import boto3
import numpy as np

log = logging.getLogger("app.services.nemo_retriever")

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

S3_BUCKET = os.environ.get("S3_BUCKET", "")
S3_DOC_PREFIX = "documents"
S3_DOC_INDEX_KEY = "document-index/nemo-docs.json"
NVIDIA_API_KEY = os.environ.get("NVIDIA_API_KEY", "")
EMBED_MODEL = "nvidia/nv-embedqa-e5-v5"
EMBED_DIM = 1024

ALLOWED_EXTENSIONS = {
    ".pdf", ".docx", ".pptx", ".html", ".txt", ".md",
    ".png", ".jpg", ".jpeg", ".bmp", ".tiff",
}

MAX_DOC_SIZE = 50 * 1024 * 1024  # 50 MB

# ---------------------------------------------------------------------------
# In-memory document index with S3 persistence
# ---------------------------------------------------------------------------

_doc_index: list[dict] = []
_doc_index_ts: float = 0.0
_DOC_INDEX_TTL: float = 30.0

_BACKEND_DIR = Path(__file__).resolve().parent.parent.parent
_LOCAL_DOC_INDEX = _BACKEND_DIR / "data" / "nemo-docs.json"


def _s3():
    return boto3.client("s3", region_name=os.environ.get("AWS_REGION", "us-east-1"))


def _use_s3() -> bool:
    return bool(S3_BUCKET)


def _load_doc_index() -> list[dict]:
    """Load the document index from S3 (or local fallback), with TTL cache."""
    global _doc_index, _doc_index_ts

    if time.monotonic() - _doc_index_ts < _DOC_INDEX_TTL:
        return _doc_index

    if _use_s3():
        try:
            resp = _s3().get_object(Bucket=S3_BUCKET, Key=S3_DOC_INDEX_KEY)
            _doc_index = json.loads(resp["Body"].read().decode("utf-8"))
            _doc_index_ts = time.monotonic()
            return _doc_index
        except Exception as exc:
            err_code = getattr(exc, "response", {}).get("Error", {}).get("Code", "")
            if err_code in ("NoSuchKey", "NoSuchBucket", "AccessDenied"):
                _doc_index = []
                _doc_index_ts = time.monotonic()
            else:
                log.warning("Failed to load doc index from S3: %s", exc)
            return _doc_index

    if _LOCAL_DOC_INDEX.exists():
        try:
            _doc_index = json.loads(_LOCAL_DOC_INDEX.read_text())
        except Exception:
            _doc_index = []
    _doc_index_ts = time.monotonic()
    return _doc_index


def _save_doc_index() -> None:
    """Persist the document index to S3 (or local fallback)."""
    global _doc_index_ts

    payload = json.dumps(_doc_index).encode("utf-8")

    if _use_s3():
        try:
            _s3().put_object(
                Bucket=S3_BUCKET,
                Key=S3_DOC_INDEX_KEY,
                Body=payload,
                ContentType="application/json",
            )
            _doc_index_ts = time.monotonic()
        except Exception as exc:
            log.error("Failed to save doc index to S3: %s", exc)
    else:
        _LOCAL_DOC_INDEX.parent.mkdir(parents=True, exist_ok=True)
        _LOCAL_DOC_INDEX.write_bytes(payload)
        _doc_index_ts = time.monotonic()


# Eagerly load on import so the index is ready
_load_doc_index()

# ---------------------------------------------------------------------------
# S3 document file upload (dedicated prefix)
# ---------------------------------------------------------------------------


def upload_document(file_bytes: bytes, filename: str) -> dict:
    """Upload a raw document file to S3 under the documents/ prefix."""
    doc_id = str(uuid.uuid4())
    ext = os.path.splitext(filename)[1] or ".pdf"
    key = f"{S3_DOC_PREFIX}/{doc_id}{ext}"

    if _use_s3():
        _s3().put_object(Bucket=S3_BUCKET, Key=key, Body=file_bytes)
        log.info("Uploaded document %s to s3://%s/%s", doc_id, S3_BUCKET, key)
    else:
        local_dir = _BACKEND_DIR / "data" / S3_DOC_PREFIX
        local_dir.mkdir(parents=True, exist_ok=True)
        (local_dir / f"{doc_id}{ext}").write_bytes(file_bytes)
        log.info("Saved document %s locally at %s", doc_id, local_dir / f"{doc_id}{ext}")

    return {"doc_id": doc_id, "s3_key": key, "filename": filename}


# ---------------------------------------------------------------------------
# NeMo Retriever extraction pipeline
# ---------------------------------------------------------------------------

_pipeline_started = False

# Set when nv-ingest is missing (e.g. on Render where ray has no wheels).
_NV_INGEST_UNAVAILABLE: str | None = None


def _check_nv_ingest() -> None:
    """Raise if nv-ingest stack is not installed (optional dependency)."""
    if _NV_INGEST_UNAVAILABLE:
        raise RuntimeError(_NV_INGEST_UNAVAILABLE)


def _ensure_pipeline() -> None:
    """Start the NeMo Retriever Ray pipeline subprocess (lazy, once)."""
    global _pipeline_started, _NV_INGEST_UNAVAILABLE
    _check_nv_ingest()
    if _pipeline_started:
        return
    try:
        from nv_ingest.framework.orchestration.ray.util.pipeline.pipeline_runners import (
            run_pipeline,
        )

        run_pipeline(
            block=False,
            disable_dynamic_scaling=True,
            run_in_subprocess=True,
        )
        _pipeline_started = True
        log.info("NeMo Retriever pipeline started")
    except ImportError as exc:
        global _NV_INGEST_UNAVAILABLE
        _NV_INGEST_UNAVAILABLE = (
            "Document extraction requires the optional nv-ingest stack (ray/nv-ingest), "
            "which is not installed on this environment. For cloud deploy use the main "
            "requirements.txt; for local doc ingestion install: pip install -r requirements-optional.txt"
        )
        log.warning("nv-ingest not available: %s", exc)
        raise RuntimeError(_NV_INGEST_UNAVAILABLE) from exc
    except Exception as exc:
        log.error("Failed to start NeMo pipeline: %s", exc)
        raise


def extract_document(file_path: str) -> list[str]:
    """
    Extract text chunks from a document using NeMo Retriever.

    Returns a list of text strings (one per page / content block).
    """
    _ensure_pipeline()

    try:
        from nv_ingest_client.client import Ingestor, NvIngestClient
        from nv_ingest_api.util.message_brokers.simple_message_broker import SimpleClient
        from nv_ingest_client.util.process_json_files import ingest_json_results_to_blob
    except ImportError as exc:
        global _NV_INGEST_UNAVAILABLE
        if _NV_INGEST_UNAVAILABLE is None:
            _NV_INGEST_UNAVAILABLE = (
                "Document extraction requires the optional nv-ingest stack (ray/nv-ingest), "
                "which is not installed on this environment. For cloud deploy use the main "
                "requirements.txt; for local doc ingestion install: pip install -r requirements-optional.txt"
            )
        raise RuntimeError(_NV_INGEST_UNAVAILABLE) from exc

    client = NvIngestClient(
        message_client_allocator=SimpleClient,
        message_client_port=7671,
        message_client_hostname="localhost",
    )
    ingestor = (
        Ingestor(client=client)
        .files(file_path)
        .extract(
            extract_text=True,
            extract_tables=True,
            extract_charts=True,
            extract_images=False,
            text_depth="page",
        )
    )

    results, failures = ingestor.ingest(return_failures=True)
    if failures:
        log.warning("NeMo extraction had %d failure(s)", len(failures))

    chunks: list[str] = []
    for r in results:
        try:
            text = ingest_json_results_to_blob(r) if r else ""
        except Exception:
            text = str(r) if r else ""
        if text.strip():
            chunks.append(text.strip())

    log.info("Extracted %d chunk(s) from %s", len(chunks), file_path)
    return chunks


# ---------------------------------------------------------------------------
# NVIDIA embedding (nv-embedqa-e5-v5 via build.nvidia.com — NOT Marengo)
# ---------------------------------------------------------------------------


def _embed_client():
    from openai import OpenAI

    return OpenAI(
        base_url="https://integrate.api.nvidia.com/v1",
        api_key=NVIDIA_API_KEY,
    )


def _embed_via_requests(texts: list[str], input_type: str) -> list[list[float]]:
    """Call NVIDIA embeddings API directly with requests to guarantee input_type is sent."""
    import requests as _req

    resp = _req.post(
        "https://integrate.api.nvidia.com/v1/embeddings",
        headers={
            "Authorization": f"Bearer {NVIDIA_API_KEY}",
            "Content-Type": "application/json",
        },
        json={
            "input": texts,
            "model": EMBED_MODEL,
            "encoding_format": "float",
            "input_type": input_type,
        },
        timeout=60,
    )
    resp.raise_for_status()
    data = resp.json()
    return [d["embedding"] for d in data["data"]]


def embed_texts(texts: list[str]) -> list[list[float]]:
    """Embed a batch of passage texts using NVIDIA nv-embedqa-e5-v5."""
    if not NVIDIA_API_KEY:
        raise RuntimeError("NVIDIA_API_KEY is not set — cannot embed documents")
    truncated = [t[:2048] for t in texts]
    return _embed_via_requests(truncated, "passage")


def embed_query(query: str) -> list[float]:
    """Embed a single search query."""
    if not NVIDIA_API_KEY:
        raise RuntimeError("NVIDIA_API_KEY is not set — cannot embed documents")
    return _embed_via_requests([query[:2048]], "query")[0]


# ---------------------------------------------------------------------------
# Document index operations
# ---------------------------------------------------------------------------


def add_chunks(
    doc_id: str,
    filename: str,
    chunks: list[str],
    embeddings: list[list[float]],
) -> int:
    """Add extracted & embedded document chunks to the index and persist."""
    _load_doc_index()

    added = 0
    for i, (text, emb) in enumerate(zip(chunks, embeddings)):
        _doc_index.append(
            {
                "id": f"{doc_id}_chunk_{i}",
                "doc_id": doc_id,
                "filename": filename,
                "chunk_index": i,
                "text": text[:5000],
                "embedding": emb,
            }
        )
        added += 1

    _save_doc_index()
    log.info("Stored %d chunk(s) for doc %s", added, doc_id)
    return added


def search_docs(query_embedding: list[float], top_k: int = 10) -> list[dict]:
    """Cosine-similarity search over the document index."""
    _load_doc_index()

    if not _doc_index:
        return []

    qv = np.array(query_embedding, dtype=np.float64)
    qn = np.linalg.norm(qv)
    if qn > 0:
        qv = qv / qn

    scored: list[dict] = []
    for rec in _doc_index:
        dv = np.array(rec["embedding"], dtype=np.float64)
        dn = np.linalg.norm(dv)
        if dn > 0:
            dv = dv / dn
        score = float(np.dot(qv, dv))
        scored.append(
            {
                "id": rec["id"],
                "score": round(score, 6),
                "doc_id": rec["doc_id"],
                "filename": rec["filename"],
                "chunk_index": rec["chunk_index"],
                "text": rec["text"],
            }
        )

    scored.sort(key=lambda x: -x["score"])
    return scored[:top_k]


def list_docs() -> list[dict]:
    """Return a deduplicated list of ingested documents with chunk counts."""
    _load_doc_index()

    seen: dict[str, dict] = {}
    for rec in _doc_index:
        did = rec["doc_id"]
        if did not in seen:
            seen[did] = {"doc_id": did, "filename": rec["filename"], "chunks": 0}
        seen[did]["chunks"] += 1
    return list(seen.values())


# ---------------------------------------------------------------------------
# Top-level ingest orchestrator
# ---------------------------------------------------------------------------


def ingest_document(file_path: str, doc_id: str, filename: str) -> dict:
    """
    Full ingestion: NeMo extraction -> NVIDIA embedding -> S3 index storage.
    """
    chunks = extract_document(file_path)
    if not chunks:
        log.warning("No content extracted from %s", filename)
        return {"doc_id": doc_id, "chunks": 0, "status": "empty"}

    embeddings = embed_texts([c[:2048] for c in chunks])
    add_chunks(doc_id, filename, chunks, embeddings)

    return {"doc_id": doc_id, "chunks": len(chunks), "status": "ready"}

import json
import logging
import os
import re
import time
import uuid
from pathlib import Path

import boto3
import numpy as np

log = logging.getLogger("app.services.nemo_retriever")

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

CHUNK_MAX_CHARS = 1200
CHUNK_OVERLAP_CHARS = 150
TRANSCRIPT_SEGS_PER_CHUNK = 5
TRANSCRIPT_SEG_OVERLAP = 1
EMBED_MAX_CHARS = 1200

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
                log.warning("Failed to load doc index from S3 (%s)", type(exc).__name__)
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
            log.error("Failed to save doc index to S3 (%s)", type(exc).__name__)
    else:
        _LOCAL_DOC_INDEX.parent.mkdir(parents=True, exist_ok=True)
        _LOCAL_DOC_INDEX.write_bytes(payload)
        _doc_index_ts = time.monotonic()


def delete_doc(doc_id: str) -> int:
    """Remove all chunks for a document from the index. Returns count removed."""
    _load_doc_index()
    before = len(_doc_index)
    _doc_index[:] = [r for r in _doc_index if r.get("doc_id") != doc_id]
    removed = before - len(_doc_index)
    if removed > 0:
        _save_doc_index()
        log.info("Deleted %d chunk(s) for doc %s", removed, doc_id)
    return removed


def clear_doc_index() -> int:
    """Delete the entire document index (all documents). Returns count removed."""
    _load_doc_index()
    removed = len(_doc_index)
    _doc_index.clear()
    _save_doc_index()
    log.info("Cleared document index: removed %d chunk(s)", removed)
    return removed


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
        log.info("Uploaded document %s to S3", doc_id)
    else:
        local_dir = _BACKEND_DIR / "data" / S3_DOC_PREFIX
        local_dir.mkdir(parents=True, exist_ok=True)
        (local_dir / f"{doc_id}{ext}").write_bytes(file_bytes)
        log.info("Saved document %s locally", doc_id)

    return {"doc_id": doc_id, "s3_key": key, "filename": filename}


def _store_pdf(file_path: str, doc_id: str) -> dict:
    """Persist the PDF to S3 (or local data dir) and return location info."""
    ext = os.path.splitext(file_path)[1] or ".pdf"
    key = f"{S3_DOC_PREFIX}/{doc_id}{ext}"
    file_bytes = Path(file_path).read_bytes()

    if _use_s3():
        _s3().put_object(Bucket=S3_BUCKET, Key=key, Body=file_bytes)
        log.info("Stored PDF %s to S3", doc_id)
        return {"pdf_s3_key": key, "pdf_s3_uri": f"s3://{S3_BUCKET}/{key}"}

    local_dir = _BACKEND_DIR / "data" / S3_DOC_PREFIX
    local_dir.mkdir(parents=True, exist_ok=True)
    dest = local_dir / f"{doc_id}{ext}"
    dest.write_bytes(file_bytes)
    log.info("Stored PDF %s locally", doc_id)
    return {"pdf_local_path": str(dest)}


def _match_video_for_doc(filename: str) -> dict | None:
    """Find a video in the index whose filename closely matches the document name."""
    from app.services.vector_store import list_entries as vs_list

    doc_base = os.path.splitext(filename)[0].strip().lower()
    if not doc_base:
        return None

    for v in vs_list(type_filter="video"):
        meta = v.get("metadata", {})
        vid_name = meta.get("filename", "")
        vid_base = os.path.splitext(vid_name)[0].strip().lower()
        if not vid_base:
            continue
        if doc_base == vid_base or doc_base in vid_base or vid_base in doc_base:
            return {
                "video_id": v["id"],
                "video_filename": vid_name,
                "video_s3_key": meta.get("s3_key", ""),
            }
    return None


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
        log.warning("nv-ingest not available (%s)", type(exc).__name__)
        raise RuntimeError(_NV_INGEST_UNAVAILABLE) from exc
    except Exception as exc:
        log.error("Failed to start NeMo pipeline (%s)", type(exc).__name__)
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
# Smart PDF extraction + semantic chunking
# ---------------------------------------------------------------------------

_REPORT_NOISE = [
    re.compile(r"^--\s*\d+\s+of\s+\d+\s*--$"),
    re.compile(r"^TwelveLabs\s*·.*Page\s+\d+\s+of\s+\d+"),
    re.compile(r"^TwelveLabs$"),
    re.compile(r"^REPORT$"),
    re.compile(r"^Compliance Intelligence Report\b"),
]

_SECTION_PATTERNS: list[tuple[re.Pattern, str]] = [
    (re.compile(r"(?i)^Executive\s+summary"), "executive_summary"),
    (re.compile(r"(?i)^Description$"), "description"),
    (re.compile(r"(?i)^Categories$"), "categories"),
    (re.compile(r"(?i)^Topics$"), "topics"),
    (re.compile(r"(?i)^Risk\s+assessment"), "risk_assessment"),
    (re.compile(r"(?i)^Key\s+findings"), "risk_assessment"),
    (re.compile(r"(?i)^Detected\s+faces"), "detected_faces"),
    (re.compile(r"(?i)^Detected\s+objects"), "detected_objects"),
    (re.compile(r"(?i)^Transcript"), "transcript"),
    (re.compile(r"(?i)^Level:\s"), "risk_assessment"),
]

_TS_LINE = re.compile(r"^\d{1,2}:\d{2}\b")


def _extract_pdf_text(file_path: str) -> str:
    """Extract full text from a PDF using the best available library."""
    errors: list[str] = []
    extractors = [
        ("PyMuPDF", _extract_fitz),
        ("pdfplumber", _extract_pdfplumber),
        ("PyPDF2", _extract_pypdf2),
    ]
    for lib_name, func in extractors:
        try:
            text = func(file_path)
            if text and text.strip():
                log.info("PDF extracted with %s (%d chars)", lib_name, len(text))
                return text
        except ImportError:
            errors.append(f"{lib_name} not installed")
        except Exception as exc:
            errors.append(f"{lib_name}: {exc}")
    raise RuntimeError(f"No PDF library could extract text: {'; '.join(errors)}")


def _extract_fitz(path: str) -> str:
    import fitz
    doc = fitz.open(path)
    pages = [page.get_text() for page in doc]
    doc.close()
    return "\n\n".join(pages)


def _extract_pdfplumber(path: str) -> str:
    import pdfplumber
    with pdfplumber.open(path) as pdf:
        return "\n\n".join(p.extract_text() or "" for p in pdf.pages)


def _extract_pypdf2(path: str) -> str:
    from PyPDF2 import PdfReader
    reader = PdfReader(path)
    return "\n\n".join(p.extract_text() or "" for p in reader.pages)


def _clean_lines(lines: list[str]) -> list[str]:
    """Remove report boilerplate headers / footers / page markers."""
    return [ln for ln in lines if not any(p.match(ln.strip()) for p in _REPORT_NOISE)]


def _detect_section(line: str) -> str | None:
    stripped = line.strip()
    for pattern, name in _SECTION_PATTERNS:
        if pattern.match(stripped):
            return name
    return None


def _parse_sections(text: str) -> list[tuple[str, str]]:
    """Split cleaned text into (section_name, section_text) pairs,
    merging adjacent tiny sections that belong together."""
    lines = _clean_lines(text.split("\n"))
    raw_sections: list[tuple[str, list[str]]] = []
    cur_name = "overview"
    cur_lines: list[str] = []

    for line in lines:
        sec = _detect_section(line.strip())
        if sec:
            if cur_lines:
                raw_sections.append((cur_name, cur_lines))
            cur_name = sec
            cur_lines = [line]
        else:
            cur_lines.append(line)
    if cur_lines:
        raw_sections.append((cur_name, cur_lines))

    merged: list[tuple[str, str]] = []
    for name, lns in raw_sections:
        block = "\n".join(lns).strip()
        if not block:
            continue
        if merged and name == merged[-1][0]:
            merged[-1] = (name, merged[-1][1] + "\n" + block)
        elif merged and len(merged[-1][1]) < 120 and "transcript" not in name:
            merged[-1] = (merged[-1][0] + "/" + name, merged[-1][1] + "\n" + block)
        else:
            merged.append((name, block))
    return merged


def _chunk_transcript(text: str) -> list[str]:
    """Split a transcript section into overlapping windows of segments."""
    lines = text.split("\n")
    segments: list[str] = []
    buf: list[str] = []
    for line in lines:
        if _TS_LINE.match(line.strip()) and buf:
            segments.append("\n".join(buf).strip())
            buf = [line]
        else:
            buf.append(line)
    if buf:
        joined = "\n".join(buf).strip()
        if joined:
            segments.append(joined)

    if segments and not _TS_LINE.match(segments[0].split("\n")[0].strip()):
        header = segments.pop(0)
        if segments:
            segments[0] = header + "\n" + segments[0]

    if not segments:
        return [text.strip()] if text.strip() else []

    chunks: list[str] = []
    step = max(1, TRANSCRIPT_SEGS_PER_CHUNK - TRANSCRIPT_SEG_OVERLAP)
    i = 0
    while i < len(segments):
        end = min(i + TRANSCRIPT_SEGS_PER_CHUNK, len(segments))
        chunks.append("\n".join(segments[i:end]))
        i += step
    return chunks


def _chunk_with_overlap(
    text: str,
    max_chars: int = CHUNK_MAX_CHARS,
    overlap: int = CHUNK_OVERLAP_CHARS,
) -> list[str]:
    """Split text at paragraph / sentence boundaries with overlap."""
    if len(text) <= max_chars:
        return [text]
    chunks: list[str] = []
    start = 0
    while start < len(text):
        end = min(start + max_chars, len(text))
        if end < len(text):
            brk = text.rfind("\n\n", start + max_chars // 2, end)
            if brk <= start:
                brk = text.rfind(". ", start + max_chars // 2, end)
                if brk > start:
                    brk += 1
            if brk > start:
                end = brk
        chunk = text[start:end].strip()
        if chunk:
            chunks.append(chunk)
        start = max(start + 1, end - overlap)
    return chunks


def _split_into_semantic_chunks(file_path: str) -> list[tuple[str, str]]:
    """Extract text from a PDF and return (section, text) chunk pairs."""
    raw = _extract_pdf_text(file_path)
    sections = _parse_sections(raw)

    result: list[tuple[str, str]] = []
    for section_name, section_text in sections:
        if "transcript" in section_name:
            for chunk in _chunk_transcript(section_text):
                result.append((section_name, chunk))
        elif len(section_text) > CHUNK_MAX_CHARS:
            for chunk in _chunk_with_overlap(section_text):
                result.append((section_name, chunk))
        else:
            result.append((section_name, section_text))

    if not result:
        for chunk in _chunk_with_overlap(raw):
            result.append(("content", chunk))

    return result



def _embed_client():
    from openai import OpenAI

    return OpenAI(
        base_url="https://integrate.api.nvidia.com/v1",
        api_key=NVIDIA_API_KEY,
    )


def _embed_via_requests(texts: list[str], input_type: str) -> list[list[float]]:
    """Call NVIDIA embeddings API directly with requests to guarantee input_type is sent."""
    import requests as _req

    t0 = time.perf_counter()
    log.info(
        "[NEMO_EMBED] Request start model=%s input_type=%s texts=%d",
        EMBED_MODEL,
        input_type,
        len(texts),
    )
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
    vectors = [d["embedding"] for d in data["data"]]
    first_dim = len(vectors[0]) if vectors else 0
    log.info(
        "[NEMO_EMBED] Request done model=%s input_type=%s vectors=%d dim=%d time=%.1fms",
        EMBED_MODEL,
        input_type,
        len(vectors),
        first_dim,
        (time.perf_counter() - t0) * 1000,
    )
    return vectors


def embed_texts(texts: list[str]) -> list[list[float]]:
    """Embed a batch of passage texts using NVIDIA nv-embedqa-e5-v5.
    Truncates to EMBED_MAX_CHARS to stay within the model's 512-token limit."""
    if not NVIDIA_API_KEY:
        raise RuntimeError("NVIDIA_API_KEY is not set — cannot embed documents")
    truncated = [t[:EMBED_MAX_CHARS] for t in texts]
    return _embed_via_requests(truncated, "passage")


def embed_query(query: str) -> list[float]:
    """Embed a single search query."""
    if not NVIDIA_API_KEY:
        raise RuntimeError("NVIDIA_API_KEY is not set — cannot embed documents")
    return _embed_via_requests([query[:EMBED_MAX_CHARS]], "query")[0]




def add_chunks(
    doc_id: str,
    filename: str,
    chunks: list[str],
    embeddings: list[list[float]],
    sections: list[str] | None = None,
    extra_metadata: dict | None = None,
) -> int:
    """Add extracted & embedded document chunks to the index and persist."""
    _load_doc_index()

    added = 0
    for i, (text, emb) in enumerate(zip(chunks, embeddings)):
        rec: dict = {
            "id": f"{doc_id}_chunk_{i}",
            "doc_id": doc_id,
            "filename": filename,
            "chunk_index": i,
            "text": text[:5000],
            "embedding": emb,
        }
        if sections and i < len(sections):
            rec["section"] = sections[i]
        if extra_metadata:
            rec.update(extra_metadata)
        _doc_index.append(rec)
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
        result = {k: v for k, v in rec.items() if k != "embedding"}
        result["score"] = round(score, 6)
        scored.append(result)

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



def ingest_document(file_path: str, doc_id: str, filename: str) -> dict:
    """
    Full ingestion:
      1. Persist the PDF to S3 / local storage
      2. Match a video by filename and link it
      3. NVIDIA embedding
      4. Store chunks with full metadata (PDF link + video link (if available))
    """

    extra: dict = {}
    try:
        pdf_info = _store_pdf(file_path, doc_id)
        extra.update(pdf_info)
    except Exception as exc:
        log.warning("Could not persist PDF for %s (%s)", doc_id, type(exc).__name__)

    try:
        video_match = _match_video_for_doc(filename)
        if video_match:
            extra.update(video_match)
            log.info("Linked doc %s to video %s (%s)", doc_id, video_match["video_id"], video_match["video_filename"])
        else:
            log.info("No matching video found for doc %s", doc_id)
    except Exception as exc:
        log.warning("Video matching failed for %s (%s)", doc_id, type(exc).__name__)

    ext = os.path.splitext(file_path)[1].lower()
    chunks: list[str] = []
    sections: list[str] = []

    if ext == ".pdf":
        try:
            pairs = _split_into_semantic_chunks(file_path)
            sections = [s for s, _ in pairs]
            chunks = [t for _, t in pairs]
            log.info("Smart PDF chunking produced %d chunks for doc %s", len(chunks), doc_id)
        except Exception as exc:
            log.warning("Smart PDF extraction failed for doc %s, falling back to NeMo (%s)", doc_id, type(exc).__name__)

    if not chunks:
        chunks = extract_document(file_path)

    if not chunks:
        log.warning("No content extracted for doc %s", doc_id)
        return {"doc_id": doc_id, "chunks": 0, "status": "empty"}

    embeddings = embed_texts(chunks)
    add_chunks(
        doc_id, filename, chunks, embeddings,
        sections=sections or None,
        extra_metadata=extra or None,
    )

    return {"doc_id": doc_id, "chunks": len(chunks), "status": "ready"}

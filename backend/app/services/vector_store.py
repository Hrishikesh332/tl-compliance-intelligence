import json
import os
import time as _time
import uuid
from pathlib import Path

import boto3
import numpy as np

FIXED_INDEX_ID = os.environ.get("MARENGO_INDEX_ID", "video-compliance-index")
S3_BUCKET = os.environ.get("S3_BUCKET", "")

_BACKEND_DIR = Path(__file__).resolve().parent.parent.parent
_DATA_DIR = _BACKEND_DIR / "data"
_LOCAL_PATH = _DATA_DIR / f"{FIXED_INDEX_ID}.json"

_store: dict[str, list[dict]] = {}
_use_s3: bool = False
_s3_cache_ts: float = 0.0
_S3_CACHE_TTL: float = 120.0

_cached_vs_s3 = None


def _s3_client():
    global _cached_vs_s3
    if _cached_vs_s3 is not None:
        return _cached_vs_s3
    _cached_vs_s3 = boto3.client("s3", region_name=os.environ.get("AWS_REGION", "us-east-1"))
    return _cached_vs_s3


def _s3_key() -> str:
    return f"indexes/{FIXED_INDEX_ID}.json"


def _probe_s3() -> bool:
    if not S3_BUCKET:
        return False
    try:
        _s3_client().head_bucket(Bucket=S3_BUCKET)
        return True
    except Exception:
        return False


def _save() -> None:
    global _s3_cache_ts
    payload = json.dumps(_store).encode("utf-8")
    if _use_s3:
        _s3_client().put_object(
            Bucket=S3_BUCKET,
            Key=_s3_key(),
            Body=payload,
            ContentType="application/json",
        )
        _s3_cache_ts = _time.monotonic()
    else:
        _DATA_DIR.mkdir(parents=True, exist_ok=True)
        _LOCAL_PATH.write_bytes(payload)


def _load() -> None:
    global _store, _use_s3
    _use_s3 = _probe_s3()
    if _use_s3:
        try:
            resp = _s3_client().get_object(Bucket=S3_BUCKET, Key=_s3_key())
            _store = json.loads(resp["Body"].read().decode("utf-8"))
            return
        except Exception:
            _store = {}
            return
    if _LOCAL_PATH.exists():
        _store = json.loads(_LOCAL_PATH.read_text())
    else:
        _store = {}


_load()


def _norm(v: list[float]) -> np.ndarray:
    a = np.array(v, dtype=np.float64)
    n = np.linalg.norm(a)
    return a / n if n > 0 else a


def _cosine_similarity(a: list[float], b: list[float]) -> float:
    va = _norm(a)
    vb = _norm(b)
    return float(np.dot(va, vb))


def _index() -> list[dict]:
    global _store, _s3_cache_ts
    if _use_s3 and (_time.monotonic() - _s3_cache_ts) > _S3_CACHE_TTL:
        try:
            resp = _s3_client().get_object(Bucket=S3_BUCKET, Key=_s3_key())
            _store = json.loads(resp["Body"].read().decode("utf-8"))
            _s3_cache_ts = _time.monotonic()
        except Exception:
            pass
    if FIXED_INDEX_ID not in _store:
        _store[FIXED_INDEX_ID] = []
    return _store[FIXED_INDEX_ID]


def add(id: str | None, embedding: list[float], metadata: dict, type: str = "entity") -> dict:
    idx = _index()
    rec = {
        "id": id or str(uuid.uuid4()),
        "embedding": embedding,
        "metadata": dict(metadata),
        "type": type,
    }
    idx.append(rec)
    _save()
    return {"id": rec["id"], "type": type}


def delete(id: str) -> bool:
    idx = _index()
    for i, rec in enumerate(idx):
        if rec.get("id") == id:
            idx.pop(i)
            _save()
            return True
    return False


def get_entry(id: str) -> dict | None:
    idx = _index()
    for rec in idx:
        if rec.get("id") == id:
            return dict(rec)
    return None


def search(
    embedding: list[float],
    top_k: int = 20,
    type_filter: str | None = None,
    metadata_filter: dict | None = None,
) -> list[dict]:
    idx = _index()
    if not idx:
        return []

    if metadata_filter is None:
        metadata_filter = {}

    scored = []
    for rec in idx:
        if type_filter and rec.get("type") != type_filter:
            continue
        if metadata_filter:
            meta = rec.get("metadata", {})
            if not all(meta.get(k) == v for k, v in metadata_filter.items()):
                continue
        sim = _cosine_similarity(embedding, rec["embedding"])
        scored.append({
            "id": rec["id"],
            "score": round(float(sim), 6),
            "metadata": rec.get("metadata", {}),
            "type": rec.get("type", "entity"),
        })

    scored.sort(key=lambda x: -x["score"])
    return scored[:top_k]


def list_entries(type_filter: str | None = None) -> list[dict]:
    idx = _index()
    out = []
    for rec in idx:
        if type_filter and rec.get("type") != type_filter:
            continue
        out.append({
            "id": rec["id"],
            "type": rec.get("type", "entity"),
            "metadata": rec.get("metadata", {}),
        })
    return out

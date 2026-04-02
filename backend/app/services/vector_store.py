import json
import os
import threading
import time
import uuid
from pathlib import Path

import boto3
import numpy as np
from botocore.config import Config

FIXED_INDEX_ID = os.environ.get("MARENGO_INDEX_ID", "video-compliance-index")
S3_BUCKET = os.environ.get("S3_BUCKET", "")

BACKEND_DIR = Path(__file__).resolve().parent.parent.parent
DATA_DIR = BACKEND_DIR / "data"
LOCAL_PATH = DATA_DIR / f"{FIXED_INDEX_ID}.json"

index_store: dict[str, list[dict]] = {}
use_s3_storage: bool = False
s3_cache_timestamp: float = 0.0
S3_CACHE_TTL: float = 120.0

cached_s3_client = None
index_store_lock = threading.Lock()


def get_s3_client():
    global cached_s3_client
    if cached_s3_client is not None:
        return cached_s3_client
    region = os.environ.get("AWS_REGION", "us-east-1")
    max_pool_connections = int(os.environ.get("AWS_MAX_POOL_CONNECTIONS", "50"))
    config = Config(region_name=region, max_pool_connections=max_pool_connections)
    cached_s3_client = boto3.client("s3", config=config)
    return cached_s3_client


def get_s3_index_key() -> str:
    return f"indexes/{FIXED_INDEX_ID}.json"


def can_use_s3_storage() -> bool:
    if not S3_BUCKET:
        return False
    try:
        get_s3_client().head_bucket(Bucket=S3_BUCKET)
        return True
    except Exception:
        return False


def save_index_store() -> None:
    global s3_cache_timestamp
    payload = json.dumps(index_store).encode("utf-8")
    if use_s3_storage:
        get_s3_client().put_object(
            Bucket=S3_BUCKET,
            Key=get_s3_index_key(),
            Body=payload,
            ContentType="application/json",
        )
        s3_cache_timestamp = time.monotonic()
    else:
        DATA_DIR.mkdir(parents=True, exist_ok=True)
        LOCAL_PATH.write_bytes(payload)


def load_index_store() -> None:
    global index_store, use_s3_storage, s3_cache_timestamp
    use_s3_storage = can_use_s3_storage()
    if use_s3_storage:
        try:
            resp = get_s3_client().get_object(Bucket=S3_BUCKET, Key=get_s3_index_key())
            index_store = json.loads(resp["Body"].read().decode("utf-8"))
            s3_cache_timestamp = time.monotonic()
            return
        except Exception:
            index_store = {}
            return
    if LOCAL_PATH.exists():
        index_store = json.loads(LOCAL_PATH.read_text())
        s3_cache_timestamp = time.monotonic()
    else:
        index_store = {}


load_index_store()


def normalize_vector(v: list[float]) -> np.ndarray:
    a = np.array(v, dtype=np.float64)
    n = np.linalg.norm(a)
    return a / n if n > 0 else a


def cosine_similarity(a: list[float], b: list[float]) -> float:
    va = normalize_vector(a)
    vb = normalize_vector(b)
    return float(np.dot(va, vb))


def get_index_records() -> list[dict]:
    global index_store, s3_cache_timestamp
    if use_s3_storage and (time.monotonic() - s3_cache_timestamp) > S3_CACHE_TTL:
        with index_store_lock:
            if use_s3_storage and (time.monotonic() - s3_cache_timestamp) > S3_CACHE_TTL:
                try:
                    resp = get_s3_client().get_object(Bucket=S3_BUCKET, Key=get_s3_index_key())
                    index_store = json.loads(resp["Body"].read().decode("utf-8"))
                    s3_cache_timestamp = time.monotonic()
                except Exception:
                    pass
    if FIXED_INDEX_ID not in index_store:
        index_store[FIXED_INDEX_ID] = []
    return index_store[FIXED_INDEX_ID]


def add(id: str | None, embedding: list[float], metadata: dict, type: str = "entity") -> dict:
    idx = get_index_records()
    rec = {
        "id": id or str(uuid.uuid4()),
        "embedding": embedding,
        "metadata": dict(metadata),
        "type": type,
    }
    idx.append(rec)
    save_index_store()
    return {"id": rec["id"], "type": type}


def delete(id: str) -> bool:
    idx = get_index_records()
    for i, rec in enumerate(idx):
        if rec.get("id") == id:
            idx.pop(i)
            save_index_store()
            return True
    return False


def get_entry(id: str) -> dict | None:
    idx = get_index_records()
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
    idx = get_index_records()
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
        sim = cosine_similarity(embedding, rec["embedding"])
        scored.append({
            "id": rec["id"],
            "score": round(float(sim), 6),
            "metadata": rec.get("metadata", {}),
            "type": rec.get("type", "entity"),
        })

    scored.sort(key=lambda x: -x["score"])
    return scored[:top_k]


def list_entries(type_filter: str | None = None) -> list[dict]:
    idx = get_index_records()
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

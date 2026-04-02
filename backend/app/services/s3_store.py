import os
import time
import uuid
import logging
import io
import threading
from datetime import datetime, timezone

import boto3
from botocore.config import Config
from boto3.s3.transfer import TransferConfig

S3_BUCKET = os.environ.get("S3_BUCKET", "video-compliance-store")
ACCOUNT_ID = os.environ.get("AWS_ACCOUNT_ID", "")
S3_EMBEDDINGS_OUTPUT = os.environ.get("S3_EMBEDDINGS_OUTPUT", f"s3://{S3_BUCKET}/bedrock-output")

PRESIGNED_URL_EXPIRES = 3600
PRESIGNED_CACHE_TTL = PRESIGNED_URL_EXPIRES - 600
presigned_url_cache: dict[str, tuple[str, float]] = {}

log = logging.getLogger("app.services.s3_store")

s3_client_lock = threading.Lock()
cached_s3_client = None
cached_s3_region: str | None = None


def get_s3_client():

    global cached_s3_client, cached_s3_region
    region = os.environ.get("AWS_REGION", "us-east-1")
    if cached_s3_client is not None and cached_s3_region == region:
        return cached_s3_client
    with s3_client_lock:
        if cached_s3_client is not None and cached_s3_region == region:
            return cached_s3_client
        connect_timeout = int(os.environ.get("AWS_CONNECT_TIMEOUT_SEC", "10"))
        read_timeout = int(os.environ.get("AWS_READ_TIMEOUT_SEC", "120"))
        max_attempts = int(os.environ.get("AWS_MAX_ATTEMPTS", "5"))
        max_pool_connections = int(os.environ.get("AWS_MAX_POOL_CONNECTIONS", "50"))
        cfg = Config(
            region_name=region,
            connect_timeout=connect_timeout,
            read_timeout=read_timeout,
            max_pool_connections=max_pool_connections,
            retries={"max_attempts": max_attempts, "mode": "adaptive"},
        )
        cached_s3_client = boto3.client("s3", config=cfg)
        cached_s3_region = region
        log.info("Created S3 client (region=%s, adaptive retries)", region)
        return cached_s3_client


class S3ProgressLogger:
    def __init__(self, label: str, total_bytes: int, interval_sec: float = 5.0):
        self.label = label
        self.total = max(int(total_bytes), 0)
        self.interval = float(interval_sec)
        self.last_log_time = 0.0
        self.bytes_sent = 0

    def __call__(self, bytes_amount: int) -> None:
        self.bytes_sent += int(bytes_amount or 0)
        now = time.monotonic()
        if now - self.last_log_time < self.interval:
            return
        self.last_log_time = now
        if self.total > 0:
            pct = (self.bytes_sent / self.total) * 100.0
            log.info("S3 upload progress %s: %.1f%% (%d/%d bytes)", self.label, pct, self.bytes_sent, self.total)
        else:
            log.info("S3 upload progress %s: %d bytes", self.label, self.bytes_sent)


def upload_video(file_bytes: bytes, filename: str) -> dict:
    video_id = str(uuid.uuid4())
    ext = os.path.splitext(filename)[1] or ".mp4"
    key = f"videos/{video_id}{ext}"
    content_type = "video/mp4"
    try:
        size = len(file_bytes)
        log.info("Uploading video to S3 (multipart): video_id=%s bytes=%d", video_id, size)
        multipart_mb = int(os.environ.get("S3_MULTIPART_MB", "16"))
        config = TransferConfig(
            multipart_threshold=multipart_mb * 1024 * 1024,
            multipart_chunksize=multipart_mb * 1024 * 1024,
            max_concurrency=int(os.environ.get("S3_MAX_CONCURRENCY", "10")),
            use_threads=True,
        )
        cb = S3ProgressLogger(label=video_id, total_bytes=size, interval_sec=float(os.environ.get("S3_PROGRESS_SEC", "5")))
        get_s3_client().upload_fileobj(
            Fileobj=io.BytesIO(file_bytes),
            Bucket=S3_BUCKET,
            Key=key,
            ExtraArgs={"ContentType": content_type},
            Config=config,
            Callback=cb,
        )
        log.info("Uploaded video to S3 OK: video_id=%s", video_id)
    except Exception as e:
        log.error("S3 upload failed for video_id=%s (%s)", video_id, type(e).__name__)
        raise
    s3_uri = f"s3://{S3_BUCKET}/{key}"
    return {
        "video_id": video_id,
        "s3_key": key,
        "s3_uri": s3_uri,
        "filename": filename,
        "uploaded_at": datetime.now(timezone.utc).isoformat(),
    }


def upload_thumbnail(video_id: str, thumb_bytes: bytes) -> str:
    key = f"thumbnails/{video_id}.jpg"
    get_s3_client().put_object(Bucket=S3_BUCKET, Key=key, Body=thumb_bytes, ContentType="image/jpeg",
                     CacheControl="public, max-age=31536000, immutable")
    return key


def upload_entity_image(file_bytes: bytes, entity_id: str) -> dict:
    key = f"entities/{entity_id}/face.png"
    get_s3_client().put_object(Bucket=S3_BUCKET, Key=key, Body=file_bytes, ContentType="image/png")
    return {"s3_key": key, "s3_uri": f"s3://{S3_BUCKET}/{key}"}


def get_presigned_url(key: str, expires: int = PRESIGNED_URL_EXPIRES) -> str:
    now = time.monotonic()
    cached = presigned_url_cache.get(key)
    if cached and (now - cached[1]) < PRESIGNED_CACHE_TTL:
        return cached[0]
    url = get_s3_client().generate_presigned_url(
        "get_object",
        Params={"Bucket": S3_BUCKET, "Key": key},
        ExpiresIn=expires,
    )
    presigned_url_cache[key] = (url, now)
    return url


def list_videos() -> list[dict]:
    resp = get_s3_client().list_objects_v2(Bucket=S3_BUCKET, Prefix="videos/")
    out = []
    for obj in resp.get("Contents", []):
        key = obj["Key"]
        if key.endswith("/"):
            continue
        out.append({
            "s3_key": key,
            "s3_uri": f"s3://{S3_BUCKET}/{key}",
            "size": obj["Size"],
            "last_modified": obj["LastModified"].isoformat(),
        })
    return out

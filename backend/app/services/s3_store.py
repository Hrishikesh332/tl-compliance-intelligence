import os
import time
import uuid
from datetime import datetime, timezone

import boto3

S3_BUCKET = os.environ.get("S3_BUCKET", "video-compliance-store")
ACCOUNT_ID = os.environ.get("AWS_ACCOUNT_ID", "")
S3_EMBEDDINGS_OUTPUT = os.environ.get("S3_EMBEDDINGS_OUTPUT", f"s3://{S3_BUCKET}/bedrock-output")

_PRESIGNED_URL_EXPIRES = 3600
_PRESIGNED_CACHE_TTL = _PRESIGNED_URL_EXPIRES - 600
_presigned_cache: dict[str, tuple[str, float]] = {}


def _s3():
    return boto3.client("s3", region_name=os.environ.get("AWS_REGION", "us-east-1"))


def upload_video(file_bytes: bytes, filename: str) -> dict:
    video_id = str(uuid.uuid4())
    ext = os.path.splitext(filename)[1] or ".mp4"
    key = f"videos/{video_id}{ext}"
    _s3().put_object(Bucket=S3_BUCKET, Key=key, Body=file_bytes, ContentType="video/mp4")
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
    _s3().put_object(Bucket=S3_BUCKET, Key=key, Body=thumb_bytes, ContentType="image/jpeg",
                     CacheControl="public, max-age=31536000, immutable")
    return key


def upload_entity_image(file_bytes: bytes, entity_id: str) -> dict:
    key = f"entities/{entity_id}/face.png"
    _s3().put_object(Bucket=S3_BUCKET, Key=key, Body=file_bytes, ContentType="image/png")
    return {"s3_key": key, "s3_uri": f"s3://{S3_BUCKET}/{key}"}


def get_presigned_url(key: str, expires: int = _PRESIGNED_URL_EXPIRES) -> str:
    now = time.monotonic()
    cached = _presigned_cache.get(key)
    if cached and (now - cached[1]) < _PRESIGNED_CACHE_TTL:
        return cached[0]
    url = _s3().generate_presigned_url(
        "get_object",
        Params={"Bucket": S3_BUCKET, "Key": key},
        ExpiresIn=expires,
    )
    _presigned_cache[key] = (url, now)
    return url


def list_videos() -> list[dict]:
    resp = _s3().list_objects_v2(Bucket=S3_BUCKET, Prefix="videos/")
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

import base64
import json
import logging
import os
import threading

import boto3
from botocore.config import Config

log = logging.getLogger("app.services.bedrock_marengo")

MARENGO_MODEL_ID = "twelvelabs.marengo-embed-3-0-v1:0"
REGION_PREFIX = {"us-east-1": "us", "eu-west-1": "eu", "ap-northeast-2": "ap"}

_client_lock = threading.Lock()
_cached_client = None
_cached_region: str | None = None


def _bedrock_client():
    global _cached_client, _cached_region
    region = os.environ.get("AWS_REGION", "us-east-1")
    if _cached_client is not None and _cached_region == region:
        return _cached_client
    with _client_lock:
        if _cached_client is not None and _cached_region == region:
            return _cached_client
        cfg = Config(
            region_name=region,
            connect_timeout=15,
            read_timeout=300,
            retries={"max_attempts": 5, "mode": "adaptive"},
        )
        _cached_client = boto3.client("bedrock-runtime", config=cfg)
        _cached_region = region
        log.info("Created bedrock-runtime client (region=%s, adaptive retries)", region)
        return _cached_client


def _inference_profile_id():
    region = os.environ.get("AWS_REGION", "us-east-1")
    prefix = REGION_PREFIX.get(region, "us")
    return f"{prefix}.{MARENGO_MODEL_ID}"


def _extract_embedding(response) -> list[float]:
    out = json.loads(response["body"].read().decode("utf-8"))
    data = out.get("data")
    if isinstance(data, list) and data:
        return data[0].get("embedding", [])
    if isinstance(data, dict):
        return data.get("embedding", [])
    return []


def _invoke(body: dict) -> list[float]:
    client = _bedrock_client()
    response = client.invoke_model(
        modelId=_inference_profile_id(),
        body=json.dumps(body),
        contentType="application/json",
        accept="application/json",
    )
    return _extract_embedding(response)


def embed_text(text: str) -> list[float]:
    return _invoke({
        "inputType": "text",
        "text": {"inputText": text[:500]},
    })


def embed_image(media_source: dict) -> list[float]:
    return _invoke({
        "inputType": "image",
        "image": {"mediaSource": media_source},
    })


def embed_text_image(input_text: str, media_source: dict) -> list[float]:
    return _invoke({
        "inputType": "text_image",
        "text_image": {
            "inputText": input_text[:500],
            "mediaSource": media_source,
        },
    })


def media_source_base64(image_bytes: bytes) -> dict:
    b64 = base64.b64encode(image_bytes).decode("utf-8")
    return {"base64String": b64}


def _get_account_id() -> str:
    acct = os.environ.get("AWS_ACCOUNT_ID", "")
    if acct:
        return acct
    sts = boto3.client("sts", region_name=os.environ.get("AWS_REGION", "us-east-1"))
    return sts.get_caller_identity()["Account"]


def media_source_s3(uri: str, bucket_owner: str | None = None) -> dict:
    loc = {"uri": uri}
    if bucket_owner:
        loc["bucketOwner"] = bucket_owner
    return {"s3Location": loc}


def start_video_embedding(
    s3_uri: str,
    output_s3_uri: str,
    bucket_owner: str | None = None,
) -> dict:
    client = _bedrock_client()
    owner = bucket_owner or _get_account_id()
    body = {
        "inputType": "video",
        "video": {
            "mediaSource": media_source_s3(s3_uri, owner),
            "embeddingOption": ["visual", "audio"],
            "embeddingScope": ["clip", "asset"],
        },
    }
    resp = client.start_async_invoke(
        modelId=MARENGO_MODEL_ID,
        modelInput=body,
        outputDataConfig={"s3OutputDataConfig": {"s3Uri": output_s3_uri}},
    )
    return {
        "invocation_arn": resp.get("invocationArn", ""),
        "status": "pending",
    }


def get_async_invocation(invocation_arn: str) -> dict:
    client = _bedrock_client()
    resp = client.get_async_invoke(invocationArn=invocation_arn)
    raw_status = resp.get("status", "unknown")
    result = {
        "invocation_arn": invocation_arn,
        "status": raw_status.lower() if isinstance(raw_status, str) else "unknown",
    }
    output_config = resp.get("outputDataConfig", {}).get("s3OutputDataConfig", {})
    if output_config:
        result["output_s3_uri"] = output_config.get("s3Uri", "")
    failure_msg = resp.get("failureMessage") or resp.get("failureReason")
    if failure_msg:
        result["error"] = str(failure_msg)
    return result


def load_video_embeddings_from_s3(output_s3_uri: str) -> list[dict]:
    s3 = boto3.client("s3", region_name=os.environ.get("AWS_REGION", "us-east-1"))
    parts = output_s3_uri.replace("s3://", "").split("/", 1)
    bucket = parts[0]
    prefix = parts[1] if len(parts) > 1 else ""
    resp = s3.list_objects_v2(Bucket=bucket, Prefix=prefix)
    embeddings = []
    for obj in resp.get("Contents", []):
        if obj["Key"].endswith(".json"):
            body = s3.get_object(Bucket=bucket, Key=obj["Key"])["Body"].read()
            data = json.loads(body)
            if isinstance(data, dict) and "data" in data:
                items = data["data"] if isinstance(data["data"], list) else [data["data"]]
                for item in items:
                    if "embedding" in item:
                        embeddings.append(item)
            elif isinstance(data, list):
                for item in data:
                    if isinstance(item, dict) and "embedding" in item:
                        embeddings.append(item)
    return embeddings

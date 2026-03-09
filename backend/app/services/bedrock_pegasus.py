import json
import logging
import os
import threading
import time

import boto3
from botocore.config import Config
from botocore.exceptions import ClientError
from dotenv import load_dotenv

load_dotenv()

log = logging.getLogger(__name__)

PEGASUS_MODEL_ID = "twelvelabs.pegasus-1-2-v1:0"
REGION_PREFIX = {
    "us-east-1": "us",
    "us-east-2": "us",
    "us-west-1": "us",
    "us-west-2": "us",
    "eu-west-1": "eu",
    "eu-central-1": "eu",
    "ap-northeast-1": "apac",
    "ap-northeast-2": "apac",
    "ap-southeast-1": "apac",
}

_BEDROCK_RETRY_CONFIG = Config(
    retries={"max_attempts": 10, "mode": "adaptive"},
    read_timeout=300,
    connect_timeout=10,
)

# Singleton client — keeps adaptive retry's token bucket alive across calls
_client_lock = threading.Lock()
_client_instance = None

# Serialize all Bedrock invocations so concurrent requests never compete
_invoke_lock = threading.Lock()


def _bedrock_client():
    global _client_instance
    if _client_instance is None:
        with _client_lock:
            if _client_instance is None:
                region = os.environ.get("AWS_REGION", "us-east-1")
                _client_instance = boto3.client(
                    "bedrock-runtime",
                    region_name=region,
                    config=_BEDROCK_RETRY_CONFIG,
                )
                log.info("[Pegasus] Created singleton Bedrock client (region=%s, adaptive retries)", region)
    return _client_instance


def _inference_profile_id():
    region = os.environ.get("AWS_REGION", "us-east-1")
    prefix = REGION_PREFIX.get(region, "us")
    return f"{prefix}.{PEGASUS_MODEL_ID}"


def _get_account_id() -> str:
    acct = os.environ.get("AWS_ACCOUNT_ID", "")
    if acct:
        return acct
    sts = boto3.client("sts", region_name=os.environ.get("AWS_REGION", "us-east-1"))
    return sts.get_caller_identity()["Account"]


def analyze_video(s3_uri: str, prompt: str, bucket_owner: str | None = None) -> str:
    client = _bedrock_client()
    owner = bucket_owner or _get_account_id()
    body = {
        "inputPrompt": prompt[:4000],
        "mediaSource": {
            "s3Location": {
                "uri": s3_uri,
                "bucketOwner": owner,
            }
        },
    }
    payload = json.dumps(body)
    model_id = _inference_profile_id()

    with _invoke_lock:
        t0 = time.perf_counter()
        log.info("[Pegasus] Acquired invoke lock, calling Bedrock …")
        try:
            response = client.invoke_model(
                modelId=model_id,
                body=payload,
                contentType="application/json",
                accept="application/json",
            )
        finally:
            log.info("[Pegasus] Bedrock call finished in %.1fs", time.perf_counter() - t0)

    out = json.loads(response["body"].read().decode("utf-8"))
    text = out.get("message") or out.get("output") or out.get("generatedText") or out.get("text") or ""
    if isinstance(text, list):
        text = "\n".join(str(t) for t in text)
    return str(text).strip() if text else "No response generated."

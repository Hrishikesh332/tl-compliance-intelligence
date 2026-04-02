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
REGION_PREFIX = {"us-east-1": "us"}

BEDROCK_RETRY_CONFIG = Config(
    retries={"max_attempts": 10, "mode": "adaptive"},
    read_timeout=300,
    connect_timeout=10,
)

# Singleton client — keeps adaptive retry's token bucket alive across calls
client_lock = threading.Lock()
client_instance = None

# Serialize all Bedrock invocations so concurrent requests never compete
invoke_lock = threading.Lock()


def get_bedrock_client():
    global client_instance
    if client_instance is None:
        with client_lock:
            if client_instance is None:
                region = os.environ.get("AWS_REGION", "us-east-1")
                client_instance = boto3.client(
                    "bedrock-runtime",
                    region_name=region,
                    config=BEDROCK_RETRY_CONFIG,
                )
                log.info("[Pegasus] Created singleton Bedrock client (region=%s, adaptive retries)", region)
    return client_instance


def get_inference_profile_id():
    region = os.environ.get("AWS_REGION", "us-east-1")
    prefix = REGION_PREFIX.get(region, "us")
    return f"{prefix}.{PEGASUS_MODEL_ID}"


def get_account_id() -> str:
    acct = os.environ.get("AWS_ACCOUNT_ID", "")
    if acct:
        return acct
    sts = boto3.client("sts", region_name=os.environ.get("AWS_REGION", "us-east-1"))
    return sts.get_caller_identity()["Account"]


def analyze_video(
    s3_uri: str,
    prompt: str,
    bucket_owner: str | None = None,
    *,
    temperature: float | None = None,
    response_schema: dict | None = None,
) -> str:
    client = get_bedrock_client()
    owner = bucket_owner or get_account_id()
    body: dict = {
        "inputPrompt": prompt[:4000],
        "mediaSource": {
            "s3Location": {
                "uri": s3_uri,
                "bucketOwner": owner,
            }
        },
    }
    if temperature is not None:
        body["temperature"] = temperature
    if response_schema is not None:
        body["responseFormat"] = {"jsonSchema": response_schema}
    payload = json.dumps(body)
    model_id = get_inference_profile_id()

    with invoke_lock:
        t0 = time.perf_counter()
        log.info("[Pegasus] Acquired invoke lock, calling Bedrock …")
        try:
            response = client.invoke_model(
                modelId=model_id,
                body=payload,
                contentType="application/json",
                accept="application/json",
            )
        except ClientError as e:
            err = e.response.get("Error", {}) if hasattr(e, "response") else {}
            code = err.get("Code", "")
            log.error("[Pegasus] Bedrock invoke failed (code=%s)", code or "unknown")
            raise
        finally:
            log.info("[Pegasus] Bedrock call finished in %.1fs", time.perf_counter() - t0)

    out = json.loads(response["body"].read().decode("utf-8"))
    text = out.get("message") or out.get("output") or out.get("generatedText") or out.get("text") or ""
    if isinstance(text, list):
        text = "\n".join(str(t) for t in text)
    return str(text).strip() if text else "No response generated."

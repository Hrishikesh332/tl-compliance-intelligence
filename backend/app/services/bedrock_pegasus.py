import json
import os

import boto3
from dotenv import load_dotenv

load_dotenv()

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


def _bedrock_client():
    region = os.environ.get("AWS_REGION", "us-east-1")
    return boto3.client("bedrock-runtime", region_name=region)


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
    response = client.invoke_model(
        modelId=_inference_profile_id(),
        body=json.dumps(body),
        contentType="application/json",
        accept="application/json",
    )
    out = json.loads(response["body"].read().decode("utf-8"))
    text = out.get("message") or out.get("output") or out.get("generatedText") or out.get("text") or ""
    if isinstance(text, list):
        text = "\n".join(str(t) for t in text)
    return str(text).strip() if text else "No response generated."

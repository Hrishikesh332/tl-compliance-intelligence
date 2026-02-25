from flask import Blueprint, jsonify, request

from app.services.bedrock_marengo import embed_text, embed_image, embed_text_image, media_source_base64
from app.services.vector_store import FIXED_INDEX_ID

embed_bp = Blueprint("embed", __name__)


@embed_bp.route("/text", methods=["POST"])
def api_embed_text():
    data = request.get_json(silent=True) or {}
    text = data.get("text") or request.form.get("text") or ""
    if not text.strip():
        return jsonify({"error": "Missing or empty 'text'"}), 400
    try:
        embedding = embed_text(text.strip())
        return jsonify({"embedding": embedding, "indexId": FIXED_INDEX_ID})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@embed_bp.route("/image", methods=["POST"])
def api_embed_image():
    media = None
    if request.files and "image" in request.files:
        file = request.files["image"]
        if file.filename:
            media = media_source_base64(file.read())
    if not media:
        data = request.get_json(silent=True) or {}
        b64 = data.get("base64") or data.get("image_base64")
        if b64:
            media = {"base64String": b64}
        s3 = data.get("s3Location") or data.get("s3_uri")
        if s3:
            uri = s3.get("uri") if isinstance(s3, dict) else s3
            owner = s3.get("bucketOwner") if isinstance(s3, dict) else None
            media = {"s3Location": {"uri": uri, **({"bucketOwner": owner} if owner else {})}}
    if not media:
        return jsonify({"error": "Provide 'image' file or JSON with 'base64'/'s3Location'"}), 400
    try:
        embedding = embed_image(media)
        return jsonify({"embedding": embedding, "indexId": FIXED_INDEX_ID})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@embed_bp.route("/text-image", methods=["POST"])
def api_embed_text_image():
    data = request.get_json(silent=True) or {}
    text = data.get("text") or request.form.get("text") or ""
    media = None
    if request.files and "image" in request.files:
        file = request.files["image"]
        if file.filename:
            media = media_source_base64(file.read())
    if not media:
        b64 = data.get("base64") or data.get("image_base64")
        if b64:
            media = {"base64String": b64}
        s3 = data.get("s3Location") or data.get("s3_uri")
        if s3:
            uri = s3.get("uri") if isinstance(s3, dict) else s3
            owner = s3.get("bucketOwner") if isinstance(s3, dict) else None
            media = {"s3Location": {"uri": uri, **({"bucketOwner": owner} if owner else {})}}
    if not text.strip() or not media:
        return jsonify({"error": "Provide 'text' and 'image' (file or base64/s3Location)"}), 400
    try:
        embedding = embed_text_image(text.strip(), media)
        return jsonify({"embedding": embedding, "indexId": FIXED_INDEX_ID})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

from flask import Blueprint, jsonify, request

from app.services.bedrock_pegasus import analyze_video as pegasus_analyze_video

from app.utils.video_helpers import video_id_to_s3_uri

ask_bp = Blueprint("ask", __name__)


@ask_bp.route("/ask-video", methods=["POST", "OPTIONS"])
def api_ask_video():
    if request.method == "OPTIONS":
        return "", 204
    data = request.get_json() or {}
    video_id = (data.get("video_id") or "").strip()
    message = (data.get("message") or "").strip()
    if not video_id:
        return jsonify({"error": "video_id is required"}), 400
    if not message:
        return jsonify({"error": "message is required"}), 400
    s3_uri = video_id_to_s3_uri(video_id)
    if not s3_uri:
        return jsonify({"error": "Video not found or S3 location unknown", "video_id": video_id}), 404
    try:
        answer = pegasus_analyze_video(s3_uri, message)
        return jsonify({"answer": answer, "video_id": video_id})
    except Exception as e:
        return jsonify({"error": str(e), "video_id": video_id}), 500

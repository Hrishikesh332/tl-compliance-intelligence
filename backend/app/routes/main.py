from flask import Blueprint, jsonify

main_bp = Blueprint("main", __name__)


@main_bp.route("/")
def index():
    return jsonify({"service": "video-compliance-api", "status": "ok"})


@main_bp.route("/health")
def health():
    return jsonify({"status": "healthy"})

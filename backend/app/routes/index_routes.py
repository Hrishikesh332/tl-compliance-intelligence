from flask import Blueprint, jsonify, request

from app.services.bedrock_marengo import embed_text
from app.services.vector_store import FIXED_INDEX_ID, add as index_add

index_bp = Blueprint("index", __name__)


@index_bp.route("/add", methods=["POST"])
def api_index_add():
    data = request.get_json(silent=True) or {}
    embedding = data.get("embedding")
    if not embedding:
        text = data.get("text")
        if text:
            try:
                embedding = embed_text(text)
            except Exception as e:
                return jsonify({"error": str(e)}), 500
        else:
            return jsonify({"error": "Provide 'embedding' or 'text'"}), 400
    id_ = data.get("id")
    metadata = data.get("metadata") or {}
    type_ = data.get("type", "entity")
    rec = index_add(id=id_, embedding=embedding, metadata=metadata, type=type_)
    return jsonify({"indexId": FIXED_INDEX_ID, **rec})

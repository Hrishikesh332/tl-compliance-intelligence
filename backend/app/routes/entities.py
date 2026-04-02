import logging

from flask import Blueprint, jsonify, request

from app.services.bedrock_marengo import embed_image, media_source_base64
from app.services.vector_store import (
    FIXED_INDEX_ID,
    add as index_add,
    delete as index_delete,
    get_index_records,
)

from app.utils.faces import detect_and_crop_faces, ENTITY_FACE_MIN_CONFIDENCE

log = logging.getLogger("app.routes.entities")

entities_bp = Blueprint("entities", __name__)


@entities_bp.route("/entities", methods=["GET"])
def api_list_entities():
    raw = get_index_records()
    entities = []
    for rec in raw:
        if rec.get("type") != "entity":
            continue
        entity_id = rec.get("id")
        if not entity_id or not rec.get("embedding"):
            continue
        meta = rec.get("metadata") or {}
        entities.append({
            "id": entity_id,
            "type": rec.get("type", "entity"),
            "metadata": meta,
        })
    log.info("[ENTITIES] Listed %d entities (from %d raw records)", len(entities), len(raw))
    return jsonify({"indexId": FIXED_INDEX_ID, "count": len(entities), "entities": entities})


@entities_bp.route("/entities/<entity_id>", methods=["DELETE"])
def api_delete_entity(entity_id: str):
    if not entity_id:
        return jsonify({"error": "Missing entity_id"}), 400
    ok = index_delete(entity_id)
    if not ok:
        log.info("[ENTITIES] Delete requested for missing entity id=%s", entity_id)
        return jsonify({"error": "Entity not found"}), 404
    log.info("[ENTITIES] Entity deleted id=%s", entity_id)
    return jsonify({"ok": True, "id": entity_id}), 200


@entities_bp.route("/entities/from-image", methods=["POST"])
def api_entities_from_image():
    if "image" not in request.files:
        log.warning("[ENTITIES] No 'image' file in request")
        return jsonify({"error": "No 'image' file provided"}), 400
    file = request.files["image"]
    if file.filename == "":
        log.warning("[ENTITIES] Empty filename in request")
        return jsonify({"error": "Empty filename"}), 400
    data = request.form or {}
    name = data.get("name") or (request.get_json(silent=True) or {}).get("name") or ""
    if not name.strip():
        log.warning("[ENTITIES] Missing 'name' in request")
        return jsonify({"error": "Missing 'name'"}), 400
    image_bytes = file.read()
    log.info("[ENTITIES] Creating entity from uploaded image (%d bytes)", len(image_bytes))
    faces = detect_and_crop_faces(image_bytes, min_confidence=ENTITY_FACE_MIN_CONFIDENCE)
    log.info("[ENTITIES] ResNet10 SSD detected %d faces (min_conf=%.2f)", len(faces), ENTITY_FACE_MIN_CONFIDENCE)
    if not faces:
        log.warning("[ENTITIES] No face detected in uploaded entity image")
        return jsonify({"error": "No face detected in image. Use a clear, front-facing photo with good lighting."}), 404
    best = faces[0]
    log.info("[ENTITIES] Selected best face (confidence=%.4f)", best["confidence"])
    face_b64 = best["image_base64"]
    embed_b64 = best.get("embedding_crop_base64") or face_b64
    import base64
    face_bytes = base64.b64decode(embed_b64)
    media = media_source_base64(face_bytes)
    try:
        embedding = embed_image(media)
        log.info("[ENTITIES] Embedding generated: dim=%d", len(embedding))
    except Exception as e:
        log.error("[ENTITIES] Embedding failed (%s)", type(e).__name__)
        return jsonify({"error": "Internal server error"}), 500
    entity_id = name.strip().lower().replace(" ", "-")
    rec = index_add(id=entity_id, embedding=embedding, metadata={"name": name.strip(), "face_snap_base64": face_b64}, type="entity")
    log.info("[ENTITIES] Entity created: id=%s", rec["id"])
    return jsonify({
        "indexId": FIXED_INDEX_ID,
        "entity": {"id": rec["id"], "name": name.strip()},
        "face_snap_base64": face_b64,
    })

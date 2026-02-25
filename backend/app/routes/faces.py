import io
import base64

from flask import Blueprint, jsonify, request, send_file

from app.utils.faces import detect_and_crop_faces

faces_bp = Blueprint("faces", __name__)


@faces_bp.route("/detect-faces", methods=["POST"])
def detect_faces():
    if "image" not in request.files:
        return jsonify({"error": "No 'image' file provided"}), 400
    file = request.files["image"]
    if file.filename == "":
        return jsonify({"error": "Empty filename"}), 400
    output_size = request.args.get("size", 256, type=int)
    output_size = max(64, min(output_size, 1024))
    faces = detect_and_crop_faces(file.read(), output_size=output_size)
    return jsonify({"count": len(faces), "faces": faces})


@faces_bp.route("/detect-faces/first", methods=["POST"])
def detect_first_face():
    if "image" not in request.files:
        return jsonify({"error": "No 'image' file provided"}), 400
    file = request.files["image"]
    output_size = request.args.get("size", 256, type=int)
    output_size = max(64, min(output_size, 1024))
    faces = detect_and_crop_faces(file.read(), output_size=output_size)
    if not faces:
        return jsonify({"error": "No faces detected"}), 404
    png_bytes = base64.b64decode(faces[0]["image_base64"])
    return send_file(io.BytesIO(png_bytes), mimetype="image/png", download_name="face.png")

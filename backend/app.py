import io
import os
import base64
from pathlib import Path

import cv2
import numpy as np
from PIL import Image, ImageDraw
from flask import Flask, jsonify, request, send_file
from flask_cors import CORS

app = Flask(__name__)
CORS(app)

MODEL_DIR = Path(__file__).resolve().parent / "models"
face_detector_net = cv2.dnn.readNetFromCaffe(
    str(MODEL_DIR / "deploy.prototxt"),
    str(MODEL_DIR / "res10_300x300_ssd_iter_140000.caffemodel"),
)
CONFIDENCE_THRESHOLD = 0.5


def detect_and_crop_faces(image_bytes: bytes, output_size: int = 256) -> list[dict]:
    np_arr = np.frombuffer(image_bytes, np.uint8)
    bgr = cv2.imdecode(np_arr, cv2.IMREAD_COLOR)
    if bgr is None:
        return []

    h, w = bgr.shape[:2]
    blob = cv2.dnn.blobFromImage(bgr, 1.0, (300, 300), (104.0, 177.0, 123.0))
    face_detector_net.setInput(blob)
    detections = face_detector_net.forward()

    faces: list[dict] = []
    idx = 0

    for i in range(detections.shape[2]):
        confidence = float(detections[0, 0, i, 2])
        if confidence < CONFIDENCE_THRESHOLD:
            continue

        x1 = int(max(detections[0, 0, i, 3] * w, 0))
        y1 = int(max(detections[0, 0, i, 4] * h, 0))
        x2 = int(min(detections[0, 0, i, 5] * w, w))
        y2 = int(min(detections[0, 0, i, 6] * h, h))

        box_w, box_h = x2 - x1, y2 - y1
        if box_w < 10 or box_h < 10:
            continue

        cx, cy = (x1 + x2) // 2, (y1 + y2) // 2
        side = int(max(box_w, box_h) * 1.62)
        half = side // 2
        cy_shift = int(box_h * 0.10)
        cy_crop = cy - cy_shift

        crop_x1 = max(cx - half, 0)
        crop_y1 = max(cy_crop - half, 0)
        crop_x2 = min(cx + half, w)
        crop_y2 = min(cy_crop + half, h)

        face_crop = bgr[crop_y1:crop_y2, crop_x1:crop_x2]
        if face_crop.size == 0:
            continue

        rgb_crop = cv2.cvtColor(face_crop, cv2.COLOR_BGR2RGB)
        pil_img = Image.fromarray(rgb_crop).resize(
            (output_size, output_size), Image.LANCZOS
        )

        mask = Image.new("L", (output_size, output_size), 0)
        ImageDraw.Draw(mask).ellipse((0, 0, output_size, output_size), fill=255)
        result_img = Image.new("RGBA", (output_size, output_size), (0, 0, 0, 0))
        result_img.paste(pil_img, mask=mask)

        buf = io.BytesIO()
        result_img.save(buf, format="PNG")
        buf.seek(0)
        b64 = base64.b64encode(buf.read()).decode()

        faces.append({
            "index": idx,
            "confidence": round(confidence, 4),
            "bbox": {"x": x1, "y": y1, "w": box_w, "h": box_h},
            "image_base64": b64,
        })
        idx += 1

    return faces


@app.route("/")
def index():
    return jsonify({"service": "video-compliance-api", "status": "ok"})


@app.route("/health")
def health():
    return jsonify({"status": "healthy"})


@app.route("/api/detect-faces", methods=["POST"])
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


@app.route("/api/detect-faces/first", methods=["POST"])
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


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    app.run(
        host="0.0.0.0",
        port=port,
        debug=os.environ.get("FLASK_DEBUG", "false").lower() == "true",
    )

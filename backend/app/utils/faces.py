import io
import base64
from pathlib import Path

import cv2
import numpy as np
from PIL import Image, ImageDraw

from app.services.bedrock_marengo import embed_image, media_source_base64

# Resolve models dir relative to backend (parent of app package)
_MODEL_DIR = Path(__file__).resolve().parent.parent.parent / "models"
face_detector_net = cv2.dnn.readNetFromCaffe(
    str(_MODEL_DIR / "deploy.prototxt"),
    str(_MODEL_DIR / "res10_300x300_ssd_iter_140000.caffemodel"),
)
CONFIDENCE_THRESHOLD = 0.65
MIN_FACE_SIZE = 50
EMBEDDING_CROP_SIZE = 384
EMBEDDING_CROP_PADDING = 1.4


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
        if box_w < MIN_FACE_SIZE or box_h < MIN_FACE_SIZE:
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

        pad_side = int(max(box_w, box_h) * EMBEDDING_CROP_PADDING)
        pad_half = max(pad_side // 2, half)
        ex1 = max(cx - pad_half, 0)
        ey1 = max(cy - pad_half, 0)
        ex2 = min(cx + pad_half, w)
        ey2 = min(cy + pad_half, h)
        embed_crop = bgr[ey1:ey2, ex1:ex2]
        if embed_crop.size > 0:
            rgb_embed = cv2.cvtColor(embed_crop, cv2.COLOR_BGR2RGB)
            pil_embed = Image.fromarray(rgb_embed).resize(
                (EMBEDDING_CROP_SIZE, EMBEDDING_CROP_SIZE), Image.LANCZOS
            )
            buf_embed = io.BytesIO()
            pil_embed.save(buf_embed, format="PNG")
            buf_embed.seek(0)
            embed_b64 = base64.b64encode(buf_embed.read()).decode()
        else:
            embed_b64 = b64

        faces.append({
            "index": idx,
            "confidence": round(confidence, 4),
            "bbox": {"x": x1, "y": y1, "w": box_w, "h": box_h},
            "image_base64": b64,
            "embedding_crop_base64": embed_b64,
        })
        idx += 1

    faces.sort(key=lambda f: (f["confidence"], f["bbox"]["w"] * f["bbox"]["h"]), reverse=True)
    return faces


def embed_best_face_from_image(image_bytes: bytes) -> list[float] | None:
    faces = detect_and_crop_faces(image_bytes)
    if not faces:
        return None
    best = faces[0]
    embed_b64 = best.get("embedding_crop_base64") or best["image_base64"]
    face_bytes = base64.b64decode(embed_b64)
    media = media_source_base64(face_bytes)
    return embed_image(media)

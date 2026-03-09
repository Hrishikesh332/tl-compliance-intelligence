#!/usr/bin/env python3
"""
Backfill face image_base64 and object frame_base64 into the vector store metadata
for all videos that have insights but are missing embedded image data.

This reads images from the local disk cache and writes them into the S3-backed
index so retrieval no longer depends on local files.

Usage:
    cd backend
    python -m scripts.backfill_image_metadata
"""
import base64
import sys
from pathlib import Path

from dotenv import load_dotenv
load_dotenv(Path(__file__).resolve().parent.parent / ".env")

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.services.vector_store import _index as vs_index, _save as vs_save
from app.utils.video_helpers import load_face_from_disk, load_object_frame_from_disk


def backfill():
    idx = vs_index()
    print(f"Index has {len(idx)} entries")
    updated_count = 0

    for rec in idx:
        video_id = rec.get("id", "")
        meta = rec.get("metadata") or {}
        insights = meta.get("video_insights")
        if not insights:
            continue

        changed = False

        faces = insights.get("detected_faces") or []
        for f in faces:
            if f.get("image_base64"):
                continue
            face_path = f.get("face_path")
            if not face_path:
                continue
            b64 = load_face_from_disk(video_id, face_path)
            if b64:
                f["image_base64"] = b64
                changed = True
                print(f"  [FACE] {video_id} -> {face_path} ({len(b64)} chars)")

        objects = insights.get("objects") or []
        for ob in objects:
            if ob.get("frame_base64"):
                continue
            frame_path = ob.get("frame_path")
            if not frame_path:
                continue
            frame_data = load_object_frame_from_disk(video_id, frame_path)
            if frame_data:
                ob["frame_base64"] = base64.b64encode(frame_data).decode("utf-8")
                changed = True
                print(f"  [OBJ]  {video_id} -> {frame_path} ({len(ob['frame_base64'])} chars)")

        if changed:
            updated_count += 1
            print(f"[OK] Updated video {video_id}")

    if updated_count > 0:
        vs_save()
        print(f"\nDone. Backfilled images for {updated_count} video(s) and saved to index.")
    else:
        print("\nNo videos needed backfilling — all images already in metadata (or no insights with disk images found).")


if __name__ == "__main__":
    backfill()

"""
Re-compress existing object frame images (data/videos/{video_id}/objects/*.jpg) in place.
Uses the same settings as save_object_frame_to_disk: max width 400px, JPEG quality 82.
Run from backend dir: python scripts/compress_existing_object_frames.py
"""
import io
import sys
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parent.parent
OBJECTS_ROOT = BACKEND_DIR / "data" / "videos"
MAX_WIDTH = 400
JPEG_QUALITY = 82


def main():
    sys.path.insert(0, str(BACKEND_DIR))

    from PIL import Image

    if not OBJECTS_ROOT.is_dir():
        print(f"No data/videos directory at {OBJECTS_ROOT}. Nothing to compress.")
        return

    total_files = 0
    total_before = 0
    total_after = 0
    errors = 0

    for video_dir in sorted(OBJECTS_ROOT.iterdir()):
        if not video_dir.is_dir():
            continue
        objects_dir = video_dir / "objects"
        if not objects_dir.is_dir():
            continue
        for path in sorted(objects_dir.glob("*.jpg")):
            try:
                raw = path.read_bytes()
                total_before += len(raw)
                img = Image.open(io.BytesIO(raw))
                if img.mode not in ("RGB", "L"):
                    img = img.convert("RGB")
                w, h = img.size
                if w > MAX_WIDTH:
                    ratio = MAX_WIDTH / w
                    new_h = max(1, int(h * ratio))
                    img = img.resize((MAX_WIDTH, new_h), Image.LANCZOS)
                buf = io.BytesIO()
                img.save(buf, "JPEG", quality=JPEG_QUALITY, optimize=True)
                compressed = buf.getvalue()
                total_after += len(compressed)
                path.write_bytes(compressed)
                total_files += 1
                print(f"  {video_dir.name}/objects/{path.name}: {len(raw)} -> {len(compressed)} bytes")
            except Exception as e:
                errors += 1
                print(f"  ERROR {path}: {e}", file=sys.stderr)

    print()
    print(f"Done. Compressed {total_files} file(s).")
    print(f"  Before: {total_before:,} bytes  ->  After: {total_after:,} bytes")
    if total_before > 0:
        print(f"  Saved: {total_before - total_after:,} bytes ({100 * (1 - total_after / total_before):.1f}% reduction)")
    if errors:
        print(f"  Errors: {errors}", file=sys.stderr)


if __name__ == "__main__":
    main()

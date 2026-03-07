
import os
import sys
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parent.parent
os.chdir(BACKEND_DIR)
sys.path.insert(0, str(BACKEND_DIR))

from dotenv import load_dotenv
load_dotenv()

from app.services.vector_store import _index


def is_placeholder_or_missing(embedding) -> bool:
    if embedding is None:
        return True
    if not isinstance(embedding, list) or len(embedding) == 0:
        return True
    try:
        if all(float(x) == 0.0 for x in embedding):
            return True
    except (TypeError, ValueError):
        return True
    return False


def main():
    idx = _index()
    videos = [rec for rec in idx if rec.get("type") == "video"]
    missing = []
    for rec in videos:
        emb = rec.get("embedding")
        if is_placeholder_or_missing(emb):
            missing.append(rec)

    print("Vector store: %d video(s) total" % len(videos))
    print("Without real embedding: %d\n" % len(missing))
    if not missing:
        return
    for rec in missing:
        vid_id = rec.get("id", "")
        meta = rec.get("metadata") or {}
        status = meta.get("status", "?")
        fname = meta.get("filename", vid_id)
        print("  %s  %s  status=%-10s" % (vid_id[:12], (fname or vid_id)[:50].ljust(50), status))
    print()


if __name__ == "__main__":
    main()

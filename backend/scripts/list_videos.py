import os
import sys
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parent.parent
os.chdir(BACKEND_DIR)
sys.path.insert(0, str(BACKEND_DIR))

from dotenv import load_dotenv
load_dotenv()

from app.services.vector_store import list_entries

def main():
    videos = list_entries(type_filter="video")
    print("Video index: %d video(s)\n" % len(videos))
    if not videos:
        return
    for v in videos:
        m = v.get("metadata") or {}
        vid = v.get("id", "")
        fn = m.get("filename", "")
        status = m.get("status", "?")
        tags = m.get("tags", [])
        tags_s = ", ".join(tags) if tags else "—"
        print("  %s  %s  status=%-10s  tags=[%s]" % (vid[:8], (fn or vid)[:40].ljust(40), status, tags_s))
    print()

if __name__ == "__main__":
    main()

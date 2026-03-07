"""
Re-trigger indexing for videos that are in the index with status=failed (or stuck indexing).
Requires the Flask server to be running (e.g. python app.py) so the new task is stored in memory
and can be polled via GET /api/videos/tasks/<id>.

Usage:
  python scripts/reindex_failed_videos.py [--base-url http://127.0.0.1:5000]
"""
import argparse
import sys
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BACKEND_DIR))

from dotenv import load_dotenv
load_dotenv(BACKEND_DIR / ".env")

from app.services.vector_store import list_entries


def main():
    p = argparse.ArgumentParser(description="Reindex failed/stuck videos via API")
    p.add_argument("--base-url", default="http://127.0.0.1:5000", help="Flask API base URL")
    args = p.parse_args()
    base = args.base_url.rstrip("/")
    try:
        import urllib.request
        req = urllib.request.Request(
            f"{base}/api/videos",
            method="GET",
            headers={"Accept": "application/json"},
        )
        urllib.request.urlopen(req, timeout=5)
    except Exception as e:
        print("Server not reachable at %s: %s" % (base, e))
        print("Start the server first: python app.py")
        sys.exit(1)

    videos = list_entries(type_filter="video")
    failed_or_indexing = [
        v for v in videos
        if (v.get("metadata") or {}).get("status") in ("failed", "indexing")
    ]
    if not failed_or_indexing:
        print("No failed or indexing videos to reindex.")
        return
    print("Reindexing %d video(s) via %s ...\n" % (len(failed_or_indexing), base))
    for v in failed_or_indexing:
        vid_id = v.get("id")
        meta = v.get("metadata") or {}
        fname = meta.get("filename", vid_id)
        status = meta.get("status", "?")
        print("  %s (status=%s)" % (fname, status))
        try:
            req = urllib.request.Request(
                f"{base}/api/videos/{vid_id}/reindex",
                data=b"",
                method="POST",
                headers={"Content-Type": "application/json", "Accept": "application/json"},
            )
            with urllib.request.urlopen(req, timeout=120) as resp:
                data = resp.read().decode()
                print("    -> started (status=indexing). Poll GET /api/videos/tasks/%s for completion." % vid_id)
        except urllib.error.HTTPError as e:
            body = e.read().decode() if e.fp else ""
            print("    -> FAILED: %s %s" % (e.code, body[:200]))
        except Exception as e:
            print("    -> ERROR: %s" % e)
    print("\nDone. Check dashboard or GET /api/videos/tasks to see indexing progress.")


if __name__ == "__main__":
    main()

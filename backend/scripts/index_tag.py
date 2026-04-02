import os
import sys
import time
import random
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parent.parent
PROJECT_ROOT = BACKEND_DIR.parent
DEFAULT_BODYCAM_DIR = PROJECT_ROOT / "bodycam"
VIDEO_EXTENSIONS = {".mp4", ".webm", ".mov", ".avi", ".mkv"}
# No enforced size limit; allow very large files.
MAX_SIZE_BYTES = None
POLL_INTERVAL_SEC = 30
POLL_MAX_WAIT_SEC = 3600 * 2


def main():
    os.chdir(BACKEND_DIR)
    sys.path.insert(0, str(BACKEND_DIR))

    from dotenv import load_dotenv
    load_dotenv()

    video_dir = Path(sys.argv[1]).resolve() if len(sys.argv) > 1 else DEFAULT_BODYCAM_DIR
    if not video_dir.is_dir():
        print("Video folder not found:", video_dir)
        print("Create it and add video files, or pass a path: python index_bodycam.py /path/to/videos")
        sys.exit(1)

    source_tag = (video_dir.name or "video").lower()

    from app.services.s3_store import upload_video, S3_EMBEDDINGS_OUTPUT
    from app.services.bedrock_marengo import start_video_embedding, get_async_invocation, load_video_embeddings_from_s3
    from app.services.vector_store import add as index_add, list_entries, get_index_records as vs_index, save_index_store as vs_save

    # Existing index entries: used to avoid duplicating the same local file on reruns.
    existing = list_entries(type_filter="video")
    existing_filenames = {
        (e.get("metadata") or {}).get("filename")
        for e in existing
        if (e.get("metadata") or {}).get("filename")
    }

    videos = sorted(
        p for p in video_dir.iterdir()
        if p.is_file() and p.suffix.lower() in VIDEO_EXTENSIONS
    )
    if not videos:
        print("No video files found in", video_dir)
        print("Supported extensions:", ", ".join(VIDEO_EXTENSIONS))
        sys.exit(0)

    # Force unbuffered-ish output even when not attached to a TTY
    def print_flush(*args):
        print(*args, flush=True)

    print_flush("Found", len(videos), "video(s) in", video_dir)
    queued = []
    for path in videos:
        size = path.stat().st_size
        if path.name in existing_filenames:
            print_flush("  Skip (already indexed by filename):", path.name)
            continue
        if MAX_SIZE_BYTES is not None and size > MAX_SIZE_BYTES:
            print_flush("  Skip (over size limit):", path.name)
            continue
        try:
            print_flush("  Reading:", path.name, "(%.1fMB)" % (size / (1024 * 1024)))
            video_bytes = path.read_bytes()
            print_flush("  Uploading:", path.name)
            info = upload_video(video_bytes, path.name)
            task_id = info["video_id"]
            output_uri = f"{S3_EMBEDDINGS_OUTPUT}/{task_id}"
            print_flush("  Starting Bedrock embedding:", path.name)
            # Bedrock is easy to throttle; retry with exponential backoff on throttling only.
            result = None
            for attempt in range(1, 8):
                try:
                    result = start_video_embedding(info["s3_uri"], output_uri)
                    break
                except Exception as e:
                    msg = str(e)
                    is_throttle = ("Throttling" in msg) or ("Too many requests" in msg) or ("ThrottlingException" in msg)
                    if not is_throttle or attempt >= 7:
                        raise
                    sleep_s = min(90.0, (2 ** (attempt - 1)) * 3.0) + random.uniform(0.0, 1.5)
                    print_flush(f"    Throttled by Bedrock (attempt {attempt}/7). Sleeping {sleep_s:.1f}s then retrying...")
                    time.sleep(sleep_s)
            if result is None:
                raise RuntimeError("Failed to start Bedrock embedding (no result)")
            invocation_arn = result.get("invocation_arn", "")
            index_add(
                id=task_id,
                embedding=[0.0] * 512,
                metadata={
                    "filename": path.name,
                    "s3_uri": info["s3_uri"],
                    "s3_key": info["s3_key"],
                    "uploaded_at": info["uploaded_at"],
                    "status": "indexing",
                    "tags": [source_tag],
                    "invocation_arn": invocation_arn,
                    "output_s3_uri": output_uri,
                },
                type="video",
            )
            queued.append({"task_id": task_id, "path_name": path.name})
            print_flush("  Queued:", path.name, "->", task_id)
            # Small spacing between requests reduces throttling likelihood.
            time.sleep(float(os.environ.get("BEDROCK_QUEUE_SLEEP_SEC", "1.5")))
        except Exception as e:
            print_flush("  Error", path.name, ":", e)

    if not queued:
        print_flush("Nothing to wait for.")
        return

    print_flush("\nWaiting for Bedrock embedding jobs (polling every %s s)..." % POLL_INTERVAL_SEC)
    start = time.time()
    while time.time() - start < POLL_MAX_WAIT_SEC:
        entries = list_entries(type_filter="video")
        indexing = [e for e in entries if (e.get("metadata") or {}).get("status") == "indexing"]
        if not indexing:
            print_flush("All jobs finished.")
            break
        for e in indexing:
            meta = e.get("metadata") or {}
            arn = meta.get("invocation_arn")
            output_uri = meta.get("output_s3_uri")
            task_id = e.get("id")
            if not arn or not output_uri:
                continue
            try:
                inv = get_async_invocation(arn)
                status = (inv.get("status") or "").lower()
                if status == "completed":
                    embs = load_video_embeddings_from_s3(output_uri)
                    if embs:
                        asset_emb = None
                        for x in embs:
                            if x.get("embeddingScope") == "asset":
                                asset_emb = x.get("embedding")
                                break
                        if not asset_emb and embs:
                            asset_emb = embs[0].get("embedding")
                        if asset_emb:
                            for rec in vs_index():
                                if rec.get("id") == task_id:
                                    rec["embedding"] = asset_emb
                                    rec.setdefault("metadata", {})["status"] = "ready"
                                    rec.setdefault("metadata", {})["clip_count"] = len(embs)
                                    break
                            vs_save()
                            print_flush("  Ready:", meta.get("filename", task_id))
                elif status == "failed":
                    for rec in vs_index():
                        if rec.get("id") == task_id:
                            rec.setdefault("metadata", {})["status"] = "failed"
                            rec.setdefault("metadata", {})["error"] = inv.get("error", "Unknown")
                            break
                    vs_save()
                    print_flush("  Failed:", meta.get("filename", task_id), inv.get("error", ""))
            except Exception as err:
                pass
        time.sleep(POLL_INTERVAL_SEC)
    else:
        print_flush("Stopped after max wait; some jobs may still be indexing.")


if __name__ == "__main__":
    main()

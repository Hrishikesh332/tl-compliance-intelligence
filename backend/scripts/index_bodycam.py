import os
import sys
import time
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parent.parent
PROJECT_ROOT = BACKEND_DIR.parent
DEFAULT_BODYCAM_DIR = PROJECT_ROOT / "bodycam"
VIDEO_EXTENSIONS = {".mp4", ".webm", ".mov", ".avi", ".mkv"}
MAX_SIZE_BYTES = 300 * 1024 * 1024
POLL_INTERVAL_SEC = 30
POLL_MAX_WAIT_SEC = 3600 * 2


def main():
    os.chdir(BACKEND_DIR)
    sys.path.insert(0, str(BACKEND_DIR))

    from dotenv import load_dotenv
    load_dotenv()

    bodycam_dir = Path(sys.argv[1]).resolve() if len(sys.argv) > 1 else DEFAULT_BODYCAM_DIR
    if not bodycam_dir.is_dir():
        print("Bodycam folder not found:", bodycam_dir)
        print("Create it and add video files, or pass a path: python index_bodycam.py /path/to/bodycam")
        sys.exit(1)

    from app.services.s3_store import upload_video, S3_EMBEDDINGS_OUTPUT
    from app.services.bedrock_marengo import start_video_embedding, get_async_invocation, load_video_embeddings_from_s3
    from app.services.vector_store import add as index_add, list_entries, _index as vs_index, _save as vs_save

    videos = sorted(
        p for p in bodycam_dir.iterdir()
        if p.is_file() and p.suffix.lower() in VIDEO_EXTENSIONS
    )
    if not videos:
        print("No video files found in", bodycam_dir)
        print("Supported extensions:", ", ".join(VIDEO_EXTENSIONS))
        sys.exit(0)

    print("Found", len(videos), "video(s) in", bodycam_dir)
    queued = []
    for path in videos:
        size = path.stat().st_size
        if size > MAX_SIZE_BYTES:
            print("  Skip (over 300 MB):", path.name)
            continue
        try:
            video_bytes = path.read_bytes()
            info = upload_video(video_bytes, path.name)
            task_id = info["video_id"]
            output_uri = f"{S3_EMBEDDINGS_OUTPUT}/{task_id}"
            result = start_video_embedding(info["s3_uri"], output_uri)
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
                    "tags": ["bodycam"],
                    "invocation_arn": invocation_arn,
                    "output_s3_uri": output_uri,
                },
                type="video",
            )
            queued.append({"task_id": task_id, "path_name": path.name})
            print("  Queued:", path.name, "->", task_id)
        except Exception as e:
            print("  Error", path.name, ":", e)

    if not queued:
        print("Nothing to wait for.")
        return

    print("\nWaiting for Bedrock embedding jobs (polling every %s s)..." % POLL_INTERVAL_SEC)
    start = time.time()
    while time.time() - start < POLL_MAX_WAIT_SEC:
        entries = list_entries(type_filter="video")
        indexing = [e for e in entries if (e.get("metadata") or {}).get("status") == "indexing"]
        if not indexing:
            print("All jobs finished.")
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
                            print("  Ready:", meta.get("filename", task_id))
                elif status == "failed":
                    for rec in vs_index():
                        if rec.get("id") == task_id:
                            rec.setdefault("metadata", {})["status"] = "failed"
                            rec.setdefault("metadata", {})["error"] = inv.get("error", "Unknown")
                            break
                    vs_save()
                    print("  Failed:", meta.get("filename", task_id), inv.get("error", ""))
            except Exception as err:
                pass
        time.sleep(POLL_INTERVAL_SEC)
    else:
        print("Stopped after max wait; some jobs may still be indexing.")


if __name__ == "__main__":
    main()

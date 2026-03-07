"""
Inspect videos stuck in 'indexing' and optionally fix them.

Usage:
  python scripts/inspect_indexing.py           # report only
  python scripts/inspect_indexing.py --fix     # mark stuck (no S3 embeddings) as failed; apply ready if embeddings exist
"""
import os
import sys
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parent.parent
os.chdir(BACKEND_DIR)
sys.path.insert(0, str(BACKEND_DIR))

from dotenv import load_dotenv
load_dotenv()

from app.services.vector_store import list_entries, _index, _save
from app.services.s3_store import S3_EMBEDDINGS_OUTPUT
from app.services.bedrock_marengo import load_video_embeddings_from_s3


def main():
    fix = "--fix" in sys.argv
    videos = list_entries(type_filter="video")
    indexing = [v for v in videos if (v.get("metadata") or {}).get("status") == "indexing"]
    if not indexing:
        print("No videos stuck in 'indexing'.")
        return
    print("Videos stuck in 'indexing': %d\n" % len(indexing))
    idx = _index()
    for v in indexing:
        vid_id = v.get("id")
        meta = v.get("metadata") or {}
        fname = meta.get("filename", vid_id)
        uploaded = meta.get("uploaded_at", "")
        out_uri = meta.get("output_s3_uri") or "%s/%s" % (S3_EMBEDDINGS_OUTPUT, vid_id)
        print("  ID: %s" % vid_id)
        print("  Filename: %s" % fname)
        print("  Uploaded: %s" % uploaded)
        embs = load_video_embeddings_from_s3(out_uri)
        has_embs = len(embs) > 0
        print("  S3 embeddings: %s (%d)" % ("yes" if has_embs else "NO", len(embs)))
        if fix:
            if has_embs:
                asset_emb = None
                for e in embs:
                    if e.get("embeddingScope") == "asset":
                        asset_emb = e["embedding"]
                        break
                if not asset_emb and embs:
                    asset_emb = embs[0]["embedding"]
                if asset_emb:
                    for rec in idx:
                        if rec.get("id") == vid_id:
                            rec["embedding"] = asset_emb
                            rec.setdefault("metadata", {})["status"] = "ready"
                            rec["metadata"]["clip_count"] = len(embs)
                            rec["metadata"]["output_s3_uri"] = out_uri
                            break
                    _save()
                    print("  -> Fixed: set status=ready and stored embedding.")
                else:
                    print("  -> Skip: could not get asset embedding.")
            else:
                for rec in idx:
                    if rec.get("id") == vid_id:
                        rec.setdefault("metadata", {})["status"] = "failed"
                        rec["metadata"]["error"] = "Indexing did not complete (no embeddings in S3). Re-upload to re-index."
                        break
                _save()
                print("  -> Marked as failed (no S3 embeddings).")
        else:
            if not has_embs:
                print("  -> Run with --fix to mark as failed.")
            else:
                print("  -> Run with --fix to set status=ready.")
        print()
    if fix:
        print("Vector store saved.")


if __name__ == "__main__":
    main()

import os
import sys
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parent.parent
os.chdir(BACKEND_DIR)
sys.path.insert(0, str(BACKEND_DIR))

from dotenv import load_dotenv  # type: ignore

load_dotenv()

from app.services.vector_store import _index as vs_index, _save as vs_save  # type: ignore


def main() -> None:
  if len(sys.argv) < 3:
    print("Usage: python update_video_tags.py <tag> <video_id> [<video_id> ...]")
    sys.exit(1)

  new_tag = sys.argv[1].strip()
  if not new_tag:
    print("Error: tag must be a non-empty string.")
    sys.exit(1)

  target_ids = {arg.strip() for arg in sys.argv[2:] if arg.strip()}
  if not target_ids:
    print("Error: at least one video_id is required.")
    sys.exit(1)

  idx = vs_index()
  updated = 0

  for rec in idx:
    rec_id = rec.get("id")
    if rec_id in target_ids:
      meta = rec.setdefault("metadata", {})
      tags = meta.get("tags") or []
      # Remove existing bodycam/dashcam markers to avoid duplicates/conflicts
      tags = [t for t in tags if t.lower() not in {"bodycam", "dashcam"}]
      # Prepend the new tag so it is the primary marker
      tags = [new_tag] + tags
      meta["tags"] = tags
      updated += 1

  if updated:
    vs_save()
    print(f"Updated {updated} video record(s) to tag '{new_tag}'.")
  else:
    print("No matching video records found for the provided IDs.")


if __name__ == "__main__":
  main()


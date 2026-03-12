import io
import os
import sys
from pathlib import Path

def main():
    backend = Path(__file__).resolve().parent.parent
    sys.path.insert(0, str(backend))
    os.chdir(backend)
    from dotenv import load_dotenv
    load_dotenv()
    from app import create_app
    app = create_app(enable_startup_tasks=False)

    image_path = Path(sys.argv[1]) if len(sys.argv) > 1 else backend.parent / "hrishi.png"
    name = sys.argv[2] if len(sys.argv) > 2 else "Hrishi"
    if not image_path.exists():
        print("Image not found:", image_path)
        sys.exit(1)
    with open(image_path, "rb") as f:
        img = f.read()
    with app.test_client() as c:
        r = c.post(
            "/api/entities/from-image",
            data={"name": name, "image": (io.BytesIO(img), image_path.name, "image/png")},
        )
    j = r.get_json()
    if r.status_code == 200:
        snap_len = len(j.pop("face_snap_base64", ""))
        print("Entity added:", j)
        if snap_len:
            print("Face snap size (base64 chars):", snap_len)
    else:
        print("Error", r.status_code, j)
        sys.exit(1)


if __name__ == "__main__":
    main()

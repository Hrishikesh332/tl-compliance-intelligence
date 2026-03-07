import logging
import os
import time
from pathlib import Path

from flask import Flask, g, request
from flask_cors import CORS

_LOG_FORMAT = "%(asctime)s [%(levelname)s] %(name)s: %(message)s"


def _setup_logging(app: Flask) -> None:
    level_name = os.environ.get("LOG_LEVEL", "INFO").upper()
    level = getattr(logging, level_name, logging.INFO)

    logging.basicConfig(format=_LOG_FORMAT, level=level, force=True)

    for name in ("app", "app.routes", "app.utils", "app.services"):
        logging.getLogger(name).setLevel(level)

    app.logger.setLevel(level)
    app.logger.info("Logging initialised at %s level", level_name)


def create_app():
    app = Flask(__name__)
    app.config["MODEL_DIR"] = Path(__file__).resolve().parent.parent / "models"

    _setup_logging(app)

    CORS(app, allow_headers=["Content-Type"])

    @app.before_request
    def handle_preflight():
        if request.method == "OPTIONS":
            from flask import Response
            r = Response("", status=204)
            r.headers["Access-Control-Allow-Origin"] = request.headers.get("Origin") or "*"
            r.headers["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS"
            r.headers["Access-Control-Allow-Headers"] = "Content-Type"
            r.headers["Access-Control-Max-Age"] = "86400"
            return r

    @app.before_request
    def log_request_start():
        g._req_start = time.perf_counter()

    @app.after_request
    def log_request_end(response):
        elapsed = (time.perf_counter() - getattr(g, "_req_start", time.perf_counter())) * 1000
        app.logger.info(
            "%s %s -> %s (%.1fms)",
            request.method,
            request.path,
            response.status_code,
            elapsed,
        )
        return response

    from app.routes import main_bp, faces_bp, videos_bp, ask_bp, entities_bp, search_bp, embed_bp, index_bp, documents_bp
    app.register_blueprint(main_bp)
    app.register_blueprint(faces_bp, url_prefix="/api")
    app.register_blueprint(videos_bp, url_prefix="/api/videos")
    app.register_blueprint(ask_bp, url_prefix="/api")
    app.register_blueprint(entities_bp, url_prefix="/api")
    app.register_blueprint(search_bp, url_prefix="/api/search")
    app.register_blueprint(embed_bp, url_prefix="/api/embed")
    app.register_blueprint(index_bp, url_prefix="/api/index")
    app.register_blueprint(documents_bp, url_prefix="/api/documents")

    _warmup_video_list(app)

    return app


def _warmup_video_list(app: Flask) -> None:
    """Pre-build the full video list (with inline base64 thumbnails) and set
    it in cache so the first GET /api/videos returns instantly with
    thumbnails embedded in the JSON (no extra image downloads needed)."""
    import subprocess
    with app.app_context():
        try:
            from concurrent.futures import ThreadPoolExecutor

            from app.services.vector_store import FIXED_INDEX_ID, list_entries, _index as vs_index, _save as vs_save
            from app.services.s3_store import get_presigned_url, S3_BUCKET, _s3 as get_s3, upload_thumbnail
            from app.utils.video_helpers import set_video_list_cache, make_tiny_thumbnail_b64

            entries = list_entries(type_filter="video")
            if not entries:
                app.logger.info("Warmup: no videos in index, skip")
                return

            needs_backfill = []
            for e in entries:
                meta = e.get("metadata") or {}
                if meta.get("status") not in ("ready", "indexing", "queued"):
                    continue
                if not meta.get("thumbnail_base64") or meta.get("duration_seconds") is None:
                    needs_backfill.append(e)

            if needs_backfill:
                app.logger.info("Warmup: backfilling %d videos (thumbnail + duration)", len(needs_backfill))
                s3 = get_s3()
                idx = vs_index()

                def _backfill(entry: dict) -> None:
                    import tempfile
                    meta = entry.get("metadata") or {}
                    vid_id = entry.get("id")
                    need_thumb = not meta.get("thumbnail_base64")
                    need_dur = meta.get("duration_seconds") is None

                    if need_thumb and not need_dur and meta.get("thumbnail_s3_key"):
                        try:
                            resp = s3.get_object(Bucket=S3_BUCKET, Key=meta["thumbnail_s3_key"])
                            thumb_bytes = resp["Body"].read()
                            b64 = make_tiny_thumbnail_b64(thumb_bytes)
                            if b64:
                                _update_index_meta(idx, vid_id, {"thumbnail_base64": b64})
                                meta["thumbnail_base64"] = b64
                            return
                        except Exception:
                            pass

                    s3_key = meta.get("s3_key")
                    if not s3_key:
                        return

                    tmp_path = None
                    try:
                        chunk_size = 10 * 1024 * 1024
                        resp = s3.get_object(Bucket=S3_BUCKET, Key=s3_key, Range=f"bytes=0-{chunk_size - 1}")
                        chunk = resp["Body"].read()

                        with tempfile.NamedTemporaryFile(suffix=".mp4", delete=False) as tmp:
                            tmp.write(chunk)
                            tmp_path = tmp.name

                        updates: dict = {}

                        if need_dur:
                            dur_result = subprocess.run(
                                ["ffprobe", "-v", "error", "-show_entries", "format=duration",
                                 "-of", "default=noprint_wrappers=1:nokey=1", tmp_path],
                                capture_output=True, timeout=10, check=False,
                            )
                            if dur_result.returncode == 0 and dur_result.stdout.strip():
                                try:
                                    updates["duration_seconds"] = float(dur_result.stdout.strip())
                                except ValueError:
                                    pass

                            if "duration_seconds" not in updates:
                                try:
                                    head = s3.head_object(Bucket=S3_BUCKET, Key=s3_key)
                                    total_size = head["ContentLength"]
                                    tail_size = min(2 * 1024 * 1024, total_size)
                                    tail_resp = s3.get_object(
                                        Bucket=S3_BUCKET, Key=s3_key,
                                        Range=f"bytes={total_size - tail_size}-{total_size - 1}",
                                    )
                                    tail_bytes = tail_resp["Body"].read()
                                    with tempfile.NamedTemporaryFile(suffix=".mp4", delete=False) as tail_tmp:
                                        tail_tmp.write(tail_bytes)
                                        tail_path = tail_tmp.name
                                    dur2 = subprocess.run(
                                        ["ffprobe", "-v", "error", "-show_entries", "format=duration",
                                         "-of", "default=noprint_wrappers=1:nokey=1", tail_path],
                                        capture_output=True, timeout=10, check=False,
                                    )
                                    os.remove(tail_path)
                                    if dur2.returncode == 0 and dur2.stdout.strip():
                                        updates["duration_seconds"] = float(dur2.stdout.strip())
                                except Exception:
                                    pass

                        if need_thumb:
                            thumb_result = subprocess.run(
                                ["ffmpeg", "-y", "-loglevel", "error",
                                 "-i", tmp_path, "-vframes", "1",
                                 "-vf", "scale=480:-2", "-q:v", "5",
                                 "-f", "image2", "pipe:1"],
                                capture_output=True, timeout=15, check=False,
                            )
                            thumb_bytes = thumb_result.stdout if thumb_result.returncode == 0 and thumb_result.stdout else None
                            if thumb_bytes:
                                try:
                                    thumb_key = upload_thumbnail(vid_id, thumb_bytes)
                                    updates["thumbnail_s3_key"] = thumb_key
                                except Exception:
                                    pass
                                b64 = make_tiny_thumbnail_b64(thumb_bytes)
                                if b64:
                                    updates["thumbnail_base64"] = b64

                        if updates:
                            _update_index_meta(idx, vid_id, updates)
                            meta.update(updates)
                            app.logger.info("Warmup backfill: %s -> duration=%s thumb=%s",
                                            meta.get("filename", vid_id),
                                            updates.get("duration_seconds", "skip"),
                                            "yes" if updates.get("thumbnail_base64") else "skip")
                    except Exception as exc:
                        app.logger.warning("Warmup backfill failed for %s: %s", meta.get("filename", vid_id), exc)
                    finally:
                        if tmp_path:
                            try:
                                os.remove(tmp_path)
                            except OSError:
                                pass

                with ThreadPoolExecutor(max_workers=min(len(needs_backfill), 4)) as pool:
                    list(pool.map(_backfill, needs_backfill))
                vs_save()
                entries = list_entries(type_filter="video")
                app.logger.info("Warmup: backfill complete, saved to index")

            def _resolve(entry: dict) -> None:
                meta = entry.get("metadata") or {}
                s3_key = meta.get("s3_key")
                if s3_key:
                    try:
                        entry["stream_url"] = get_presigned_url(s3_key)
                    except Exception:
                        entry["stream_url"] = None
                thumb_key = meta.get("thumbnail_s3_key")
                if thumb_key:
                    try:
                        entry["thumbnail_url"] = get_presigned_url(thumb_key)
                    except Exception:
                        entry["thumbnail_url"] = None
                entry["duration_seconds"] = meta.get("duration_seconds")
                tb64 = meta.get("thumbnail_base64")
                if tb64:
                    entry["thumbnail_data_url"] = f"data:image/jpeg;base64,{tb64}"

            with ThreadPoolExecutor(max_workers=min(len(entries), 20)) as pool:
                list(pool.map(_resolve, entries))

            result = {"indexId": FIXED_INDEX_ID, "count": len(entries), "videos": entries}
            set_video_list_cache(result)
            app.logger.info("Warmup: video list cache primed (%d videos)", len(entries))
        except Exception as exc:
            app.logger.debug("Warmup video list skipped: %s", exc)


def _update_index_meta(idx: list, vid_id: str, updates: dict) -> None:
    for rec in idx:
        if rec.get("id") == vid_id:
            meta = rec.setdefault("metadata", {})
            meta.update(updates)
            break

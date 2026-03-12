import atexit
import logging
import os
import threading
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path

import requests
from flask import Flask, g, request
from flask_cors import CORS
from dotenv import load_dotenv
from apscheduler.schedulers.background import BackgroundScheduler

_LOG_FORMAT = "%(asctime)s [%(levelname)s] %(name)s: %(message)s"
_self_ping_lock = threading.Lock()
_self_ping_scheduler: BackgroundScheduler | None = None

load_dotenv()


def _setup_logging(app: Flask) -> None:
    level_name = os.environ.get("LOG_LEVEL", "INFO").upper()
    level = getattr(logging, level_name, logging.INFO)

    logging.basicConfig(format=_LOG_FORMAT, level=level, force=True)

    for name in ("app", "app.routes", "app.utils", "app.services"):
        logging.getLogger(name).setLevel(level)

    app.logger.setLevel(level)
    app.logger.info("Logging initialised at %s level", level_name)


def create_app(*, enable_startup_tasks: bool = True):
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

    if enable_startup_tasks:
        _configure_self_ping_scheduler(app)

    warmup_enabled = os.environ.get("WARMUP_ON_STARTUP", "true").strip().lower() in ("1", "true", "yes", "on")
    if enable_startup_tasks and warmup_enabled:
        threading.Thread(target=_warmup_video_list, args=(app,), daemon=True).start()

    return app


def _is_truthy(value: str | None, *, default: bool = False) -> bool:
    if value is None:
        return default
    return value.strip().lower() in ("1", "true", "yes", "on")


def _get_self_ping_base_url() -> str:
    for env_var in ("SELF_PING_URL", "APP_URL", "RENDER_EXTERNAL_URL"):
        value = (os.getenv(env_var) or "").strip()
        if value:
            return value.rstrip("/")
    return ""


def _is_render_runtime() -> bool:
    return any(
        (os.getenv(env_var) or "").strip()
        for env_var in ("RENDER", "RENDER_SERVICE_ID", "RENDER_INSTANCE_ID")
    )


def _should_enable_self_ping() -> bool:
    if not _is_truthy(os.getenv("SELF_PING_ENABLED"), default=not _is_render_runtime()):
        return False

    app_url = _get_self_ping_base_url().lower()
    if not app_url:
        return False

    if _is_render_runtime() and not _is_truthy(os.getenv("ALLOW_RENDER_SELF_PING"), default=False):
        return False

    return all(local_host not in app_url for local_host in ("localhost", "127.0.0.1"))


def _self_ping_health(app: Flask, *, timeout_seconds: float) -> None:
    base_url = _get_self_ping_base_url()
    if not base_url:
        return

    health_url = f"{base_url}/health"
    try:
        response = requests.get(
            health_url,
            timeout=timeout_seconds,
            headers={"User-Agent": "video-compliance-self-ping/1.0"},
        )
        if response.ok:
            app.logger.info("Self-ping OK (%s)", response.status_code)
        else:
            app.logger.warning("Self-ping returned %s", response.status_code)
    except Exception as exc:
        app.logger.warning("Self-ping failed (%s)", type(exc).__name__)


def _configure_self_ping_scheduler(app: Flask) -> None:
    global _self_ping_scheduler

    if not _should_enable_self_ping():
        if _is_render_runtime():
            app.logger.info(
                "Self-ping scheduler disabled on Render by default; use an external uptime monitor or set ALLOW_RENDER_SELF_PING=true to override"
            )
        else:
            app.logger.info("Self-ping scheduler disabled (no public app URL or explicitly disabled)")
        return

    with _self_ping_lock:
        if _self_ping_scheduler and _self_ping_scheduler.running:
            return

        interval_minutes = max(float(os.getenv("SELF_PING_INTERVAL_MINUTES", "9")), 1.0)
        timeout_seconds = max(float(os.getenv("SELF_PING_TIMEOUT_SECONDS", "10")), 1.0)
        start_delay_seconds = max(float(os.getenv("SELF_PING_START_DELAY_SECONDS", "30")), 0.0)
        scheduler = BackgroundScheduler(timezone="UTC")
        scheduler.add_job(
            _self_ping_health,
            "interval",
            minutes=interval_minutes,
            id="self_ping_health",
            kwargs={"app": app, "timeout_seconds": timeout_seconds},
            next_run_time=datetime.now(timezone.utc) + timedelta(seconds=start_delay_seconds),
            replace_existing=True,
            max_instances=1,
            coalesce=True,
            misfire_grace_time=max(int(interval_minutes * 60), 60),
        )
        scheduler.start()
        atexit.register(lambda: scheduler.shutdown(wait=False))
        _self_ping_scheduler = scheduler

        app.logger.info("Self-ping scheduler started (every %.1f minutes)", interval_minutes)
        app.logger.info(
            "Note: in-process self-ping cannot wake a Render free instance after it has already spun down"
        )


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
                        app.logger.warning(
                            "Warmup backfill failed for %s (%s)",
                            meta.get("filename", vid_id),
                            type(exc).__name__,
                        )
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
            app.logger.debug("Warmup video list skipped (%s)", type(exc).__name__)


def _update_index_meta(idx: list, vid_id: str, updates: dict) -> None:
    for rec in idx:
        if rec.get("id") == vid_id:
            meta = rec.setdefault("metadata", {})
            meta.update(updates)
            break


# WSGI entry point: gunicorn app:app loads this attribute
app = create_app()

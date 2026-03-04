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

    from app.routes import main_bp, faces_bp, videos_bp, ask_bp, entities_bp, search_bp, embed_bp, index_bp
    app.register_blueprint(main_bp)
    app.register_blueprint(faces_bp, url_prefix="/api")
    app.register_blueprint(videos_bp, url_prefix="/api/videos")
    app.register_blueprint(ask_bp, url_prefix="/api")
    app.register_blueprint(entities_bp, url_prefix="/api")
    app.register_blueprint(search_bp, url_prefix="/api/search")
    app.register_blueprint(embed_bp, url_prefix="/api/embed")
    app.register_blueprint(index_bp, url_prefix="/api/index")

    return app

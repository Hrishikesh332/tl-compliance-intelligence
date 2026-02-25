import os
from pathlib import Path

from flask import Flask, request
from flask_cors import CORS


def create_app():
    app = Flask(__name__)
    app.config["MODEL_DIR"] = Path(__file__).resolve().parent.parent / "models"

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

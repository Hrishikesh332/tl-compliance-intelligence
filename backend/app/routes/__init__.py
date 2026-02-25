from app.routes.main import main_bp
from app.routes.faces import faces_bp
from app.routes.videos import videos_bp
from app.routes.ask import ask_bp
from app.routes.entities import entities_bp
from app.routes.search import search_bp
from app.routes.embed import embed_bp
from app.routes.index_routes import index_bp

__all__ = [
    "main_bp",
    "faces_bp",
    "videos_bp",
    "ask_bp",
    "entities_bp",
    "search_bp",
    "embed_bp",
    "index_bp",
]

# Video Compliance — Backend (Flask API)

Simple Flask API for the Video Compliance app.

## Setup

```bash
cd backend
python -m venv venv
source venv/bin/activate   # Windows: venv\Scripts\activate
pip install -r requirements.txt
```

## Run

```bash
python app.py
```

API runs at `http://127.0.0.1:5000`. Use the frontend’s proxy or set `VITE_API_URL` if needed.

## Endpoints

- `GET /` — service info
- `GET /health` — health check
- `GET /api/videos` — list videos (placeholder)

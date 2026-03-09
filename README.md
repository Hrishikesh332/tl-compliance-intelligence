##  Multi-Source Legal Evidence Investigator

It lets you ingest video from many sources (bodycams, CCTV, mobile, dashcams), index it with multimodal AI, and then -

- **Search with natural language** across video timelines.
- **Track people by face** across all indexed footage.
- **Generate per‑video analysis** (risk level, categories, transcript, objects).
- **Ask questions about a video** and jump to timestamped answers.
- **Surface compliance & safety risks** in a single dashboard.

The frontend is a Vite + React + Tailwind app. The backend is a Python/Flask API that orchestrates TwelveLabs Marengo/Pegasus via AWS Bedrock, S3 storage, vector indexing, and FFmpeg for frame extraction.

---

### Who this is for

- **Compliance officers**: Flag violations and generate audit‑ready reports with timestamped clips.
- **Security teams**: Track persons of interest across multiple camera feeds with entity (face) search.
- **Safety managers**: Detect missing PPE, blocked exits, and hazards across facilities.
- **Legal & insurance teams**: Quickly locate relevant evidence for claims, investigations, and disputes.

---

### Prerequisites

- **Python 3.x** for the backend (match `backend/requirements.txt`).
- **Node.js + npm** (recent LTS) for the frontend.
- Access to **AWS** (S3, Bedrock Runtime) and any other external services you wire into the backend `.env`.

---

### Running locally

#### 1. Backend (API)

From the repository root:

```bash
cd backend
cp .env.example .env  
python -m venv .venv  
source .venv/bin/activate  
pip install -r requirements.txt
python app.py
```

The API will be available at **`http://localhost:5000`** by default.

#### 2. Frontend (Web UI)

From the repository root:

```bash
cd frontend
npm install
npm run dev
```

The Vite dev server typically runs at **`http://localhost:5173`** and is configured to talk to the backend at `http://localhost:5000`.

---

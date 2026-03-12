# Multi-Source Legal Evidence Investigator

Ingest video from bodycams, CCTV, mobile, and dashcams to search timelines, track people, analyze footage, and surface compliance risks from a single intelligence layer.

Built for compliance, safety, legal, and security investigation workflows.

It lets you ingest video from many sources (bodycams, CCTV, mobile, dashcams), index it with multimodal AI, and then -

- **Search with natural language** across video timelines.
- **Track people by face** across all indexed footage.
- **Generate per‑video analysis** (risk level, categories, transcript, objects).
- **Ask questions about a video** and jump to timestamped answers.
- **Surface compliance & safety risks** in a single dashboard.

The frontend is a Vite + React + Tailwind app. The backend is a Python/Flask API that orchestrates TwelveLabs Marengo/Pegasus via AWS Bedrock, S3 storage, vector indexing, and FFmpeg for frame extraction.

---

## Features

Everything you need for video compliance on top of TwelveLabs:

- **Video indexing & embedding** — Upload video assets and generate multimodal embeddings (visual + audio) using TwelveLabs Marengo for semantic search.
- **Natural language search** — Search inside videos with plain English and get timestamped results ranked by relevance.
- **Face‑based entity matching** — Register a face as an entity and find every video and clip where that person appears.
- **Automated video analysis** — Per‑video reports including risk level, categories, detected objects, and transcript via TwelveLabs Pegasus.
- **Conversational video Q&A** — Ask questions about any video and get answers with clickable timestamps to the relevant moment.
- **Risk & compliance insights** — Surface safety hazards, violations, and risk scores, with people, objects, and transcript in a single dashboard.

---

## Powered by TwelveLabs via AWS

This app is built on TwelveLabs multimodal video understanding:

- **Marengo Embed** — Multimodal embeddings for visual + audio search.
- **Pegasus Generate** — AI summaries, transcripts, risk analysis, and object detection with timestamps.
- **Semantic search & face matching** — Natural language video search and person tracking via face embeddings.

Infrastructure and tooling:

- **AWS Bedrock Runtime** — Invokes TwelveLabs Marengo and Pegasus.
- **Amazon S3 + vector index** — Video asset storage and cosine‑similarity search over embeddings.
- **FFmpeg** — Frame extraction (thumbnails and faces) and video processing.

---

## Tech Stack

### Frontend

React
TypeScript
Vite
Tailwind_CSS

### Backend

Python
Flask

AWS
Amazon_S3
Amazon_Bedrock
FFmpeg

---

### Who this is for

- **Compliance officers** — Flag violations and generate audit‑ready reports with timestamped clips.
- **Security teams** — Track persons of interest across multiple camera feeds with entity (face) search.
- **Safety managers** — Detect missing PPE, blocked exits, and hazards across facilities.
- **Legal & insurance teams** — Quickly locate relevant evidence for claims, investigations, and disputes.

---

## Local Setup

1. **Clone the repository**

```bash
git clone https://github.com/Hrishikesh332/tl-compliance-intelligence.git
cd tl-compliance-intelligence
```

1. **For Frontend**

```bash
cd frontend
```

1. **Setup dependencies**

```bash
npm install --legacy-peer-deps
```

1. **Create `.env` file**

Create a `.env` file inside `frontend/` and add:

```bash
VITE_API_URL="http://localhost:5000"
```

Running the backend server is mandatory for usage.

1. **Run the app**

```bash
npm run dev
```

1. **Live At**

`http://localhost:5173`

1. **For Backend**

Check the `README.md` inside `backend/` for the complete backend setup. In a new terminal from the repository root, run:

```bash
cd backend
```

---

## Core Use Cases

Built for high‑stakes investigations where every second of footage contributes to the story

- **Traffic accident reconstruction** — Find a specific vehicle across multiple city cameras, dashcams, and doorbell footage to establish a complete incident timeline.
- **Workplace incident investigation** — Track a person’s movements through facility cameras to document events, verify witness statements, and surface safety violations.
- **Criminal defense verification** — Locate evidence of a client’s whereabouts across public cameras, business surveillance, and personal recordings to build a defensible timeline.
- **Insurance claims investigation** — Cross‑reference claimant statements with video from multiple sources to verify incident details and detect potential fraud.

---

## Impact – Who Benefits & How

Designed for teams that work with video evidence daily — from compliance audits to security investigations.

- **Compliance officers** — Instantly flag violations and generate audit‑ready PDF reports with timestamped evidence.
- **Security teams** — Track persons of interest across multiple camera feeds with face‑based entity search.
- **Safety managers** — Detect missing PPE, blocked exits, and hazard signs automatically across all footage.
- **Legal & insurance teams** — Quickly locate relevant clips for claims, investigations, and dispute resolution.

## Queries

For any doubts or help, you can reach out via `hrishikesh3321@gmail.com`.
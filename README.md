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

🧠 **Video indexing & embedding** — Upload video assets and generate multimodal embeddings (visual + audio) using TwelveLabs Marengo for semantic search.


🔍 **Natural language search** — Search inside videos with plain English and get timestamped results ranked by relevance.


🧑‍💼 **Face‑based entity matching** — Register a face as an entity and find every video and clip where that person appears.


📈 **Automated video analysis** — Per‑video reports including risk level, categories, detected objects, and transcript via TwelveLabs Pegasus.


💬 **Conversational video Q&A** — Ask questions about any video and get answers with clickable timestamps to the relevant moment.


🛡️ **Risk & compliance insights** — Surface safety hazards, violations, and risk scores, with people, objects, and transcript in a single dashboard.

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


![React](https://img.shields.io/badge/React-20232A?style=flat-square&logo=react&logoColor=61DAFB)
![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=flat-square&logo=typescript&logoColor=white)
![Vite](https://img.shields.io/badge/Vite-646CFF?style=flat-square&logo=vite&logoColor=white)
![Tailwind_CSS](https://img.shields.io/badge/Tailwind_CSS-06B6D4?style=flat-square&logo=tailwindcss&logoColor=white)

### Backend

![Python](https://img.shields.io/badge/Python-3776AB?style=flat-square&logo=python&logoColor=white)
![Flask](https://img.shields.io/badge/Flask-000000?style=flat-square&logo=flask&logoColor=white)
<img src="https://img.shields.io/badge/TwelveLabs-111111?style=flat-square" alt="TwelveLabs" />
![AWS](https://img.shields.io/badge/AWS-232F3E?style=flat-square&logo=amazonaws&logoColor=white)
![Amazon_S3](https://img.shields.io/badge/Amazon_S3-569A31?style=flat-square&logo=amazons3&logoColor=white)
![Amazon_Bedrock](https://img.shields.io/badge/Amazon_Bedrock-232F3E?style=flat-square&logo=amazonaws&logoColor=white)
![FFmpeg](https://img.shields.io/badge/FFmpeg-007808?style=flat-square&logo=ffmpeg&logoColor=white)


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
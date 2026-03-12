<h1 align="center">Multi-Source Legal Evidence Investigator</h1>

<p align="center">
  Ingest video from bodycams, CCTV, mobile, and dashcams to search timelines, track people, analyze footage, and surface compliance risks from a single intelligence layer.
</p>

<p align="center">
  Built for compliance, safety, legal, and security investigation workflows.
</p>

It lets you ingest video from many sources (bodycams, CCTV, mobile, dashcams), index it with multimodal AI, and then -

- **Search with natural language** across video timelines.
- **Track people by face** across all indexed footage.
- **Generate per‑video analysis** (risk level, categories, transcript, objects).
- **Ask questions about a video** and jump to timestamped answers.
- **Surface compliance & safety risks** in a single dashboard.

The frontend is a Vite + React + Tailwind app. The backend is a Python/Flask API that orchestrates TwelveLabs Marengo/Pegasus via AWS Bedrock, S3 storage, vector indexing, and FFmpeg for frame extraction.

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

- **Compliance officers**: Flag violations and generate audit‑ready reports with timestamped clips.
- **Security teams**: Track persons of interest across multiple camera feeds with entity (face) search.
- **Safety managers**: Detect missing PPE, blocked exits, and hazards across facilities.
- **Legal & insurance teams**: Quickly locate relevant evidence for claims, investigations, and disputes.

---

## ⚙️ Local Setup

1. **Clone the repository**

```bash
git clone https://github.com/Hrishikesh332/tl-compliance-intelligence.git
cd tl-compliance-intelligence
```

2. **For Frontend**

```bash
cd frontend
```

3. **Setup dependencies**

```bash
npm install --legacy-peer-deps
```

4. **Create `.env` file**

Create a `.env` file inside `frontend/` and add:

```bash
VITE_API_URL="http://localhost:5000"
```

Running the backend server is mandatory for usage.

5. **Run the app**

```bash
npm run dev
```

6. **Live At**

`http://localhost:5173`

7. **For Backend**

Check the `README.md` inside `backend/` for the complete backend setup. In a new terminal from the repository root, run:

```bash
cd backend
```

---

## Queries

For any doubts or help, you can reach out via `hrishikesh3321@gmail.com`.

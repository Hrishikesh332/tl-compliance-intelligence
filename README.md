# Video Compliance

Frontend app is in the **frontend** folder.

```bash
cd frontend && npm install && npm run dev
```

See **frontend/README.md** for full docs.

## Backend (deploy)

Use `backend/requirements.txt` for deployment (e.g. Render). Document extraction (NeMo Retriever / nv-ingest) is optional and depends on Ray, which is not available on all platforms. For local doc ingestion, install optional deps: `pip install -r backend/requirements-optional.txt`.

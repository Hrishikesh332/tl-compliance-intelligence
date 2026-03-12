## Multi-Source Legal Evidence Investigator API Reference

This backend is a Flask API for video ingestion, multimodal search, compliance analysis, chat over video, and entity matching.

- **Base URL**: `http://localhost:5000`
- **Main API prefix**: `/api`
- **Request types**: `application/json` and `multipart/form-data`
- **Async video states**: `queued`, `indexing`, `ready`, `failed`

Supporting utilities are listed after the main workflow.

---

## Health & Service Info


| Method | Path      | Purpose                                   |
| ------ | --------- | ----------------------------------------- |
| `GET`  | `/`       | Returns the API service name and status.  |
| `GET`  | `/health` | Simple health endpoint for uptime checks. |


Example responses:

```json
{
  "service": "video-compliance-api",
  "status": "ok"
}
```

```json
{
  "status": "healthy"
}
```

---

## Indexing and Ingestion

Use these endpoints to upload source material, track indexing, and list what is available for downstream search and analysis.

Initial Ingestion Workflow

### Video ingestion


| Method | Path                             | Purpose                                                                                    |
| ------ | -------------------------------- | ------------------------------------------------------------------------------------------ |
| `POST` | `/api/videos/upload`             | Upload a video, create a task, extract thumbnail and duration, and queue Bedrock indexing. |
| `GET`  | `/api/videos/tasks`              | List all known indexing tasks, newest first.                                               |
| `GET`  | `/api/videos/tasks/{task_id}`    | Fetch the latest status for a single task.                                                 |
| `POST` | `/api/videos/{video_id}/reindex` | Re-run indexing for a previously uploaded video.                                           |
| `GET`  | `/api/videos`                    | List indexed videos with metadata, stream URL, and thumbnail URL/data URL.                 |


Key request and behavior notes:

- `POST /api/videos/upload` requires a `video` file and accepts optional `tags` as a comma-separated string.
- Uploads above `300 MB` are rejected.
- `GET /api/videos/tasks/{task_id}` can advance a task from `indexing` to `ready` by polling the async Bedrock invocation.
- `GET /api/videos` returns only indexed video records and includes resolved playback URLs when available.

Typical upload response:

```json
{
  "task_id": "video-id",
  "filename": "bodycam.mp4",
  "status": "queued",
  "s3_uri": "s3://bucket/key",
  "indexId": "default"
}
```

### Document ingestion


| Method | Path                                      | Purpose                                                                           |
| ------ | ----------------------------------------- | --------------------------------------------------------------------------------- |
| `POST` | `/api/documents/upload`                   | Upload a document, store it, chunk it, and ingest it into the document retriever. |
| `GET`  | `/api/documents/file/{doc_id}/{filename}` | Serve the stored source file back to the browser.                                 |


Key request and behavior notes:

- `POST /api/documents/upload` requires a `document` file.
- File type must be in the backend allow-list and file size must stay within the configured document limit.
- `GET /api/documents/file/{doc_id}/{filename}` serves PDFs inline and other file types as downloads when found.

Typical document upload response:

```json
{
  "doc_id": "abcd1234",
  "filename": "policy.pdf",
  "chunks": 42,
  "status": "ready"
}
```

---

## Search

These endpoints retrieve relevant videos, clips, and document chunks after ingestion is complete.

Hybrid Search Workflow

### Video and hybrid search


| Method | Path                 | Purpose                                                                                     |
| ------ | -------------------- | ------------------------------------------------------------------------------------------- |
| `POST` | `/api/search/hybrid` | Run video search (text / entity / image) and document search together in a single response. |


`POST /api/search/hybrid` accepts three video-search modes:

- **Text search** with `query` or `text`
- **Entity-aware video search** with `entity_id` or `entity_ids`
- **Image search** with an uploaded `image` file or `image_base64`

Common request fields:

- `top_k`: max number of video results
- `clips_per_video`: max clip matches per video
- `filter` or `metadata_filter`: exact-match metadata filters
- `doc_top_k`: max number of document chunks to return (set to `0` to skip documents)

Typical video search response:

```json
{
  "indexId": "default",
  "query": "officer entering lobby",
  "count": 2,
  "results": [
    {
      "id": "video-id",
      "score": 0.91,
      "metadata": {},
      "stream_url": "https://...",
      "clips": [
        {
          "start": 10.0,
          "end": 15.0,
          "score": 0.88
        }
      ]
    }
  ]
}
```

Typical hybrid search response:

```json
{
  "query": "missing badge at entry point",
  "videoCount": 3,
  "videoResults": [],
  "docCount": 5,
  "documents": [],
  "doc_error": "optional"
}
```

---

## Analysis

These endpoints generate structured intelligence from a video after it is indexed.

Video Analysis Workflow

### Structured video analysis


| Method | Path                              | Purpose                                       |
| ------ | --------------------------------- | --------------------------------------------- |
| `POST` | `/api/videos/{video_id}/analysis` | Generate and store structured video analysis. |


Stored analysis includes fields such as:

- `title`
- `categories`
- `topics`
- `risks`
- `transcript`
- `riskLevel`

Typical analysis response:

```json
{
  "video_id": "video-id",
  "analysis": {
    "title": "...",
    "categories": [],
    "topics": [],
    "risks": [],
    "transcript": [],
    "riskLevel": "low"
  }
}
```

Transcript Workflow

### Transcript


| Method | Path                                | Purpose                                                 |
| ------ | ----------------------------------- | ------------------------------------------------------- |
| `GET`  | `/api/videos/{video_id}/transcript` | Return the stored transcript if one exists.             |
| `POST` | `/api/videos/{video_id}/transcript` | Generate a transcript and store it on the video record. |


Key request and behavior notes:

- `POST /api/videos/{video_id}/transcript` accepts optional `append_from_seconds`.
- If no transcript exists yet, `GET` returns `transcript: null` with a helpful message.

Insights & Face Presence Workflow

### Insights and face presence


| Method | Path                                   | Purpose                                                     |
| ------ | -------------------------------------- | ----------------------------------------------------------- |
| `GET`  | `/api/videos/{video_id}/insights`      | Return cached insights for a video.                         |
| `POST` | `/api/videos/{video_id}/insights`      | Generate fresh object and face insights.                    |
| `GET`  | `/api/videos/{video_id}/face-presence` | Return timeline presence by detected face across the video. |


Key request and behavior notes:

- Insight generation requires the video to exist and be in `ready` state.
- `POST /api/videos/{video_id}/insights` also supports `mark_empty` and `mark_people_empty` flags to persist explicit empty-result states.
- Face presence uses clip embeddings when available and falls back to frame sampling when needed.

Typical insights response:

```json
{
  "video_id": "video-id",
  "insights": {
    "objects": [],
    "detected_faces": [],
    "keyframes": [],
    "video_duration_sec": 600.0
  }
}
```

### Frames and cached media


| Method | Path                                              | Purpose                                             |
| ------ | ------------------------------------------------- | --------------------------------------------------- |
| `GET`  | `/api/videos/{video_id}/frame?t=12.5&w=640`       | Extract a frame from a video stream at a timestamp. |
| `GET`  | `/api/videos/{video_id}/faces/{face_id}`          | Return a cached PNG for a detected face.            |
| `GET`  | `/api/videos/{video_id}/object-frames/{filename}` | Return a cached JPEG for an extracted object frame. |


Key request and behavior notes:

- `frame` requires `t` in seconds and accepts optional `w` for output width.
- Cached face and object-frame endpoints return `404` if the local cache has not been created yet.

---

## Chat analysis

Use this endpoint to ask follow-up questions about a specific indexed video.

Chat Analysis Workflow


| Method | Path             | Purpose                                                                     |
| ------ | ---------------- | --------------------------------------------------------------------------- |
| `POST` | `/api/ask-video` | Ask a natural-language question about one video and get a generated answer. |


Request body:

```json
{
  "video_id": "video-id",
  "message": "Was the officer wearing a badge?"
}
```

Typical response:

```json
{
  "answer": "detailed natural-language answer",
  "video_id": "video-id"
}
```

Errors:

- `400` for missing `video_id` or `message`
- `404` when the video does not have a resolvable S3 location
- `500` for Pegasus execution failures

---

## Entity

These endpoints manage known people or other indexed entities and support entity-led search across videos.

Entity Ingestion Workflow

### Entity management


| Method   | Path                        | Purpose                                                                    |
| -------- | --------------------------- | -------------------------------------------------------------------------- |
| `GET`    | `/api/entities`             | List all stored entity records.                                            |
| `POST`   | `/api/entities/from-image`  | Detect the best face in an uploaded image, embed it, and create an entity. |
| `DELETE` | `/api/entities/{entity_id}` | Delete an entity from the vector index.                                    |


Key request and behavior notes:

- `POST /api/entities/from-image` requires an `image` file and a `name`.
- The best detected face is embedded and stored with `face_snap_base64`.
- The entity ID is derived from the provided name.

Typical create response:

```json
{
  "indexId": "default",
  "entity": {
    "id": "officer-jane-doe",
    "name": "Officer Jane Doe"
  },
  "face_snap_base64": "..."
}
```

Entity Search Workflow

In the UI, entities are primarily used in two places:

- To populate the **Entities** page (`GET /api/entities`)
- To search for videos **by entity** via the dashboard search, by passing `entity_ids` into `/api/search/hybrid`

### Face utilities


| Method | Path                | Purpose                                                               |
| ------ | ------------------- | --------------------------------------------------------------------- |
| `POST` | `/api/detect-faces` | Detect all faces in an uploaded image and return crops plus metadata. |


Accepted inputs:

- `image` as a multipart upload
- optional query param `size` from `64` to `1024`


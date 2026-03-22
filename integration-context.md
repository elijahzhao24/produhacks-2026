# Integration Context

## Purpose

This document is the frontend integration contract for the current backend.
It describes:

- system architecture
- required environment and services
- exact API inputs/outputs
- create/edit/save flow
- integration expectations for React frontend

## System Overview

The backend is a minimal sandbox + save pipeline.

- Sandbox generations are temporary and stored in Supabase Storage under `tmp/*`.
- Only saved assets are stored in Postgres (`saved_models` table).
- Frontend iterates by re-calling `/sandbox/generate` using a `context_token`.
- `/models/save` moves/copies generated GLB from `tmp/models/*` to `saved/models/*` and writes metadata to DB.

## Components

- API: FastAPI (`api_service/main.py`)
- Planner: Fetch agent (`agent_service/main.py`) optional
- Generation: Meshy APIs (text/image-to-image + image-to-3d)
- Storage + DB: Supabase (`assets` bucket + Postgres)

## Storage Layout

Bucket: `assets`

- `tmp/concepts/<uuid>.png`
- `tmp/models/<uuid>.glb`
- `saved/models/<uuid>-<original>.glb`

## Database

Table: `saved_models`

```sql
create table if not exists saved_models (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  object_url text not null
);
```

## Required Environment

Minimum required for real end-to-end flow:

- `DATABASE_URL`
- `CONTEXT_TOKEN_SECRET`
- `MESHY_API_KEY`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_BUCKET=assets`

Optional but recommended:

- `SUPABASE_TMP_PREFIX=tmp`
- `SUPABASE_SAVED_PREFIX=saved`
- `FETCH_AGENT_PLAN_URL` (if using external planner)

## Frontend Contract

### 1. Health check

`GET /health`

Response:

```json
{ "ok": true }
```

### 2. Generate or edit in sandbox

`POST /sandbox/generate`

Request body:

```json
{
  "prompt": "cute toy UFO duck",
  "sketch_url": "https://.../optional-sketch.png",
  "context_token": null,
  "edit_instruction": null,
  "desired_speed": "fast"
}
```

Rules:

- First generation: send `context_token: null`.
- Edit generation: send previous `context_token` from prior response.
- `sketch_url` is optional but should be a reachable URL if provided.
- `desired_speed`: `fast | balanced | best`.

Response body:

```json
{
  "context_token": "<signed-token>",
  "model_url": "https://.../tmp/models/<uuid>.glb",
  "concept_image_url": "https://.../tmp/concepts/<uuid>.png",
  "plan": {
    "asset_type": "prop",
    "route": "edit_existing_image_then_preview_3d",
    "output_format": "glb",
    "views_needed": ["front_3q"],
    "constraints": ["..."]
  }
}
```

Use in frontend:

- Render `model_url` in React Three Fiber.
- Cache latest `context_token` in component/session state.
- For next edit, send same token back.

### 3. Save current model

`POST /models/save`

Request body:

```json
{
  "name": "UFO Duck v1",
  "context_token": "<latest-token>"
}
```

Response body:

```json
{
  "id": "<uuid>",
  "name": "UFO Duck v1",
  "object_url": "https://.../saved/models/...glb"
}
```

Use in frontend:

- After save succeeds, show success state and refresh model library page.

### 4. List saved models

`GET /models`

Response body:

```json
{
  "items": [
    {
      "id": "<uuid>",
      "name": "UFO Duck v1",
      "object_url": "https://.../saved/models/...glb"
    }
  ]
}
```

### 5. Get one saved model

`GET /models/{model_id}`

Response body:

```json
{
  "id": "<uuid>",
  "name": "UFO Duck v1",
  "object_url": "https://.../saved/models/...glb"
}
```

## End-to-End Flow (Frontend)

### First draft

1. User enters prompt and optional sketch.
2. Frontend uploads sketch to storage if needed and gets `sketch_url`.
3. Frontend calls `POST /sandbox/generate`.
4. Backend returns `model_url` + `context_token`.
5. Frontend renders GLB and stores token in memory.

### Small edit iteration

1. User updates sketch and/or edit instruction.
2. Frontend calls `POST /sandbox/generate` with prior `context_token`.
3. Backend reuses prior context and returns updated model/token.
4. Frontend replaces rendered GLB with new `model_url`.

### Save

1. User clicks save and provides name.
2. Frontend calls `POST /models/save` with latest token.
3. Backend persists GLB and DB row.
4. Frontend fetches `GET /models` to refresh library view.

## Error Semantics

- `400`: bad token or invalid request payload.
- `404`: saved model not found.
- `502`: provider/storage failure (Meshy/Supabase failure).

Frontend handling:

- Show backend `detail` message for 4xx/5xx.
- For 502 on generate, allow retry.
- For 502 on save, keep sandbox state and let user retry save.

## Performance Expectations

- `/sandbox/generate` is synchronous and can take significant time (provider task polling).
- Frontend should show loading state and use a longer request timeout.

## Current Constraints

- No auth/RLS enforcement yet.
- No async job queue yet.
- No dedicated upload endpoint yet (frontend provides `sketch_url`).
- Public URL serving is assumed for current storage URL usage.

## Recommended Frontend State Shape

```ts
{
  prompt: string;
  sketchUrl?: string;
  editInstruction?: string;
  desiredSpeed: "fast" | "balanced" | "best";
  contextToken?: string;
  modelUrl?: string;
  conceptImageUrl?: string;
}
```

## Run Commands

```bash
uv sync --extra api --extra agent
uv run uvicorn api_service.main:app --reload --port 8000
# optional planner
uv run python agent_service/main.py
```

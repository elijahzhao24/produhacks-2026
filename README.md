# produhacks-2026

## Tech Stack

**Frontend**
- React Three Fiber
- Tailwind

**Backend**
- FastAPI
- Supabase (Postgres + buckets)

**Cloud services**
- Fetch.ai
- OpenAI
- MeshyAI

## Minimal Backend Draft

This repo now contains a draft minimal backend in `api_service/` with only four core endpoints:

1. `POST /sandbox/generate`
2. `POST /models/save`
3. `GET /models`
4. `GET /models/{model_id}`

And a minimal Fetch planner in `agent_service/`:

1. `POST /plan`

### Design choices

- Sandbox generations are **not** persisted in Postgres.
- Sandbox context is carried by an expiring signed `context_token`.
- Only explicitly saved models are stored in DB.
- DB schema stays minimal: `id`, `name`, `object_url`.
- FastAPI can call the Fetch planner via `FETCH_AGENT_PLAN_URL`; if unavailable, it falls back to local planning.
- Supabase is supported for both Postgres (`DATABASE_URL`) and buckets (via `SUPABASE_*` env values).
- `POST /models/save` now performs a real Supabase Storage copy from `tmp/models/*` to `saved/models/*` when `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, and `SUPABASE_BUCKET` are configured.

### Local run

```bash
uv sync --extra api --extra agent
cp .env.example .env
uv run uvicorn api_service.main:app --reload --port 8000
```

Optional planner agent:

```bash
uv run python agent_service/main.py
```

### Supabase env required for real save copy

Set these in `.env`:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_BUCKET` (for example `assets`)
- `SUPABASE_TMP_PREFIX` (default `tmp`)
- `SUPABASE_SAVED_PREFIX` (default `saved`)

### Fast small-edit loop

1. First generation calls `POST /sandbox/generate` with prompt + sketch.
2. Response returns `context_token`, `concept_image_url`, and `model_url`.
3. Small edit calls `POST /sandbox/generate` again with:
   - updated `sketch_url` and/or `edit_instruction`
   - previous `context_token`
4. Backend uses prior concept/model pointers in token as context and routes to edit mode for faster preview-oriented regeneration.

### Minimal schema SQL

See [db/schema.sql](db/schema.sql).

### Endpoint contracts

#### `POST /sandbox/generate`

```json
{
  "prompt": "cute toy UFO duck",
  "sketch_url": "https://.../tmp/sketch.png",
  "context_token": null,
  "edit_instruction": null,
  "desired_speed": "balanced"
}
```

Response:

```json
{
  "context_token": "...",
  "model_url": "https://.../tmp/models/....glb",
  "concept_image_url": "https://.../tmp/concepts/....png",
  "plan": {
    "asset_type": "creature",
    "route": "text_sketch_to_single_image_to_3d",
    "output_format": "glb",
    "views_needed": ["front_3q"],
    "constraints": ["single isolated object", "plain white background", "no extra objects", "clean silhouette"]
  }
}
```

#### `POST /models/save`

```json
{
  "name": "UFO Duck v1",
  "context_token": "..."
}
```

Response:

```json
{
  "id": "uuid",
  "name": "UFO Duck v1",
  "object_url": "https://.../saved/models/...glb"
}
```

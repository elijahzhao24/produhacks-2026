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

### Local run

```bash
python -m venv .venv
source .venv/bin/activate
pip install -r api_service/requirements.txt
cp .env.example .env
uvicorn api_service.main:app --reload --port 8000
```

Optional planner agent:

```bash
pip install -r agent_service/requirements.txt
python agent_service/main.py
```

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

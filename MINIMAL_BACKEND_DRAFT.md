# Minimal Backend Draft (Sandbox + Save)

## Product behavior

- Sandbox generates models quickly and iteratively.
- Sandbox generations are temporary and not stored in Postgres.
- User clicks **Save** to persist one model record.

## Minimal endpoints

1. `POST /sandbox/generate`
2. `POST /models/save`
3. `GET /models`
4. `GET /models/{model_id}`

## Contracts

### `POST /sandbox/generate`

Request

```json
{
  "prompt": "cute toy UFO duck",
  "sketch_url": "https://.../tmp/sketch.png",
  "context_token": null,
  "edit_instruction": null,
  "desired_speed": "balanced"
}
```

Response

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
    "constraints": [
      "single isolated object",
      "plain white background",
      "no extra objects",
      "clean silhouette"
    ]
  }
}
```

### `POST /models/save`

Request

```json
{
  "name": "UFO Duck v1",
  "context_token": "..."
}
```

Response

```json
{
  "id": "uuid",
  "name": "UFO Duck v1",
  "object_url": "https://.../saved/models/...glb"
}
```

## Minimal DB schema

```sql
create table saved_models (
  id uuid primary key,
  name text not null,
  object_url text not null
);
```

## Context strategy for small edits

- Backend returns an expiring signed `context_token` after each sandbox generation.
- Token carries latest `model_url` and `concept_image_url`, plus previous pointers.
- Next sandbox edit sends this token back for context-preserving generation.
- This avoids storing every sandbox attempt in Postgres.

## Fetch.ai role

- Keep one Fetch planner agent (`agent_service/main.py`) with `POST /plan`.
- FastAPI calls planner for route/constraints.
- If planner is down, FastAPI falls back to local plan logic.

## Supabase + UV

- Postgres: set `DATABASE_URL` to Supabase Postgres connection string (pooler recommended).
- Buckets: use `SUPABASE_URL`, `SUPABASE_BUCKET`, `SUPABASE_TMP_PREFIX`, `SUPABASE_SAVED_PREFIX`.
- Package management: use `uv` with extras from root `pyproject.toml`.

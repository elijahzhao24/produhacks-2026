# CONTEXT.md — Minimal Fetch.ai + FastAPI LeGenesis 3D Generation Pipeline

## Goal

Build the smallest possible hackathon-ready backend that turns:

- a text prompt
- an optional rough sketch
- an optional previous asset version for edits

into:

- a generated 3D object
- stored as **GLB**
- viewable in **React Three Fiber / three.js**

We want to use **Fetch.ai** in a real way, but keep the stack minimal and reliable.

---

## Core Product Idea

Users should not need Blender or advanced 3D skills.

They should be able to:

1. type a prompt
2. optionally upload a rough sketch
3. generate a 3D object
4. make small changes later by editing the sketch
5. regenerate a **similar updated object**, not a totally unrelated one

This is **not** true local mesh editing.
For the hackathon MVP, we simulate “small edits” by:
- keeping prior context
- editing the prior concept image
- regenerating a new preview mesh that preserves the old design as much as possible

---

## Minimal Architecture

### Frontend
- React
- React Three Fiber
- sketch canvas
- prompt input
- generate button
- edit button
- status polling

### Backend
- FastAPI
- one worker process
- one database
- one object storage bucket

### Agent Layer
- **one Fetch.ai uAgents agent**
- its job is to act as the **planner/router**
- it does **not** do heavy 3D generation itself

### AI Providers
- one image generation/edit provider
- one image-to-3D provider

---

## Recommended Minimal Stack

### Required
- **React + React Three Fiber** for frontend rendering
- **FastAPI** for API
- **uAgents** for the Fetch.ai agent
- **Postgres** or **Supabase Postgres** for metadata
- **S3 / Supabase Storage / Cloudflare R2** for files
- **GLB** as the output format

### Minimal provider choice
- **Image generation/edit:** any single reliable provider you already have access to
- **3D generation:** one hosted image-to-3D provider

Do not build your own 3D modeler for the hackathon.

---

## Why GLB

Use **GLB** as the single export format.

Reason:
- three.js has first-class support for glTF 2.0 through `GLTFLoader`
- `GLTFExporter` supports both `.gltf` and binary `.glb`
- GLB is simpler for web delivery because it packages model data into one file instead of several sidecar files :contentReference[oaicite:0]{index=0}

---

## Why Fetch.ai Is Used

We are using Fetch.ai properly by creating a **real agent**.

The Fetch agent will:
- receive a generation request
- classify the request as create vs edit
- decide fast preview vs full generation
- decide single-view vs multi-view
- return a structured plan to FastAPI

This matches the intended use of uAgents:
- lightweight Python agents
- communication/discovery
- local or published agents
- optional Agentverse visibility later :contentReference[oaicite:1]{index=1}

---

## Minimal Design Principle

**Fetch agent = brain**
**FastAPI = execution layer**
**Worker = calls external AI APIs**
**Storage = saves files**
**Frontend = shows progress and model**

Do not make Fetch handle GPU-heavy work.

---

## Pipeline Overview

### First-time generation
1. User submits prompt + sketch
2. FastAPI stores request
3. FastAPI asks Fetch agent for a generation plan
4. Fetch agent returns a structured plan
5. Worker generates a clean concept image from prompt + sketch
6. Worker sends concept image to 3D generation provider
7. Worker stores returned GLB
8. Frontend loads GLB in React Three Fiber

### Edit flow
1. User edits the sketch and/or adds an edit instruction
2. FastAPI loads prior version metadata
3. FastAPI asks Fetch agent for an edit plan
4. Fetch agent returns “preserve old design, change only this part”
5. Worker edits the prior concept image instead of fully restarting
6. Worker generates a new preview 3D object
7. User accepts or asks for another change
8. Final refine happens only when user saves

---

## Important MVP Constraint

We are **not** doing true partial mesh surgery.

We are doing:
- context-preserving image edit
- then fast 3D regeneration

This is acceptable for a hackathon and much easier to make reliable.

---

## Minimal Services

### 1. FastAPI API service
Responsibilities:
- create generation jobs
- create edit jobs
- talk to Fetch agent
- return job IDs
- serve asset metadata
- provide polling endpoints

### 2. Worker service
Responsibilities:
- image generation/edit
- 3D generation
- upload outputs to storage
- update DB job state

### 3. Fetch agent service
Responsibilities:
- receive normalized request
- produce structured generation plan
- optionally later register/publish to Agentverse

### 4. Database
Store:
- assets
- versions
- jobs
- prompts
- plan JSON
- file URLs

### 5. Object storage
Store:
- sketch images
- concept images
- preview GLBs
- final GLBs
- thumbnails

---

## The Only Fetch Agent We Need

Agent name:

`Sketch2MeshOrchestratorAgent`

This is the only agent in the MVP.

### Responsibilities
- classify request:
  - `create`
  - `edit`
- choose route:
  - `preview`
  - `final`
- choose view strategy:
  - `single_view`
  - `multi_view`
- set output format:
  - `glb`
- set constraints:
  - preserve silhouette
  - plain white background
  - no extra objects
  - preserve proportions for edits

### What it should NOT do
- not generate images
- not generate meshes
- not store files
- not serve frontend requests
- not run heavy async jobs

---

## Minimal Folder Structure

```text
project/
  CONTEXT.md
  .env

  agent_service/
    main.py
    models.py
    requirements.txt

  api_service/
    main.py
    models.py
    db.py
    worker.py
    requirements.txt

  shared/
    schemas.py
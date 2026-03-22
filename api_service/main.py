from typing import Any
from uuid import UUID

from fastapi import Depends, FastAPI, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from .agent_planner import get_generation_plan
from .config import settings
from .context_token import ContextTokenError, issue_context_token, parse_context_token
from .database import Base, engine, get_db
from .generation import (
    GenerationError,
    StoragePersistError,
    generate_sandbox_artifacts,
    persist_saved_model_url,
)
from .models import SavedModel
from .schemas import (
    ListSavedModelsResponse,
    SaveModelRequest,
    SandboxGenerateRequest,
    SandboxGenerateResponse,
    SavedModelResponse,
)

app = FastAPI(title=settings.app_name)


@app.on_event("startup")
def startup() -> None:
    Base.metadata.create_all(engine)


@app.get("/health")
def health() -> dict[str, bool]:
    return {"ok": True}


@app.post("/sandbox/generate", response_model=SandboxGenerateResponse)
def sandbox_generate(body: SandboxGenerateRequest) -> SandboxGenerateResponse:
    prev_context: dict[str, Any] | None = None
    if body.context_token:
        try:
            prev_context = parse_context_token(body.context_token, secret=settings.token_secret)
        except ContextTokenError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc

    plan = get_generation_plan(
        prompt=body.prompt,
        desired_speed=body.desired_speed,
        sketch_url=body.sketch_url,
        edit_instruction=body.edit_instruction,
        is_edit=bool(prev_context or body.edit_instruction),
    )
    try:
        artifacts = generate_sandbox_artifacts(
            prompt=body.prompt,
            sketch_url=body.sketch_url,
            edit_instruction=body.edit_instruction,
            desired_speed=body.desired_speed,
            plan=plan,
            previous_context=prev_context,
        )
    except (GenerationError, StoragePersistError) as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc

    new_context = {
        "prompt": body.prompt,
        "sketch_url": body.sketch_url,
        "edit_instruction": body.edit_instruction,
        "concept_image_url": artifacts.concept_image_url,
        "model_url": artifacts.model_url,
        "prev_concept_image_url": (prev_context or {}).get("concept_image_url"),
        "prev_model_url": (prev_context or {}).get("model_url"),
    }
    context_token = issue_context_token(
        new_context,
        secret=settings.token_secret,
        ttl_seconds=settings.token_ttl_seconds,
    )

    return SandboxGenerateResponse(
        context_token=context_token,
        model_url=artifacts.model_url,
        concept_image_url=artifacts.concept_image_url,
        plan=plan,
    )


@app.post("/models/save", response_model=SavedModelResponse)
def save_model(body: SaveModelRequest, db: Session = Depends(get_db)) -> SavedModelResponse:
    try:
        context = parse_context_token(body.context_token, secret=settings.token_secret)
    except ContextTokenError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    model_url = context.get("model_url")
    if not model_url:
        raise HTTPException(status_code=400, detail="No model_url found in context token")

    try:
        saved_object_url = persist_saved_model_url(model_url)
    except StoragePersistError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc

    row = SavedModel(name=body.name, object_url=saved_object_url)
    db.add(row)
    db.commit()
    db.refresh(row)

    return SavedModelResponse.model_validate(row)


@app.get("/models", response_model=ListSavedModelsResponse)
def list_models(db: Session = Depends(get_db)) -> ListSavedModelsResponse:
    rows = db.execute(select(SavedModel).order_by(SavedModel.name.asc())).scalars().all()
    return ListSavedModelsResponse(items=[SavedModelResponse.model_validate(row) for row in rows])


@app.get("/models/{model_id}", response_model=SavedModelResponse)
def get_model(model_id: UUID, db: Session = Depends(get_db)) -> SavedModelResponse:
    row = db.get(SavedModel, model_id)
    if row is None:
        raise HTTPException(status_code=404, detail="Model not found")
    return SavedModelResponse.model_validate(row)

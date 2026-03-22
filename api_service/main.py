import httpx
from uuid import UUID
from fastapi import Depends, FastAPI, File, HTTPException, Response, UploadFile
from fastapi.responses import StreamingResponse
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
    upload_sketch_to_supabase,
)
from .models import SavedModel
from .schemas import (
    ListSavedModelsResponse,
    SaveModelRequest,
    SandboxGenerateRequest,
    SandboxGenerateResponse,
    SavedModelResponse,
    UploadResponse,
)

app = FastAPI(title=settings.app_name)


@app.on_event("startup")
def startup() -> None:
    Base.metadata.create_all(engine)


@app.get("/health")
def health() -> dict[str, bool]:
    return {"ok": True}


@app.post("/upload", response_model=UploadResponse)
async def upload_sketch(file: UploadFile = File(...)) -> UploadResponse:
    print(f"DEBUG: Received upload request for {file.filename} ({file.content_type})")
    content = await file.read()
    print(f"DEBUG: Content length: {len(content)} bytes")
    try:
        url = upload_sketch_to_supabase(content, file.content_type or "image/png")
        print(f"DEBUG: Uploaded to {url}")
    except StoragePersistError as exc:
        print(f"DEBUG: StoragePersistError: {exc}")
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    except Exception as exc:
        print(f"DEBUG: Unexpected error: {exc}")
        raise HTTPException(status_code=500, detail=str(exc)) from exc

    return UploadResponse(url=url)


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
            auto_refine=body.auto_refine,
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
        print(f"DEBUG: Parsed context token for save. Model URL: {context.get('model_url')}")
    except ContextTokenError as exc:
        print(f"DEBUG: Context token parsing failed: {exc}")
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    model_url = context.get("model_url")
    if not model_url:
        print("DEBUG: No model_url found in context token")
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


@app.get("/models/download")
async def download_model(url: str, filename: str | None = None):
    try:
        async with httpx.AsyncClient() as client:
            response = await client.get(url, follow_redirects=True)
            response.raise_for_status()
            
            if not filename:
                # Extract from URL, removing query params
                base_name = url.split("/")[-1].split("?")[0]
                filename = base_name or "model.glb"
            
            if not filename.endswith(".glb"):
                filename += ".glb"
                
            # Use quotes for filename to handle spaces/special chars
            return Response(
                content=response.content,
                media_type="application/force-download",
                headers={"Content-Disposition": f'attachment; filename="{filename}"'}
            )
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Download proxy failed: {exc}")


@app.get("/models", response_model=ListSavedModelsResponse)
async def list_models(db: Session = Depends(get_db)) -> ListSavedModelsResponse:
    print("DEBUG: Entered list_models endpoint")
    try:
        # Use a simpler query for debugging
        rows = db.query(SavedModel).all()
        print(f"DEBUG: Found {len(rows)} models")
        items = [SavedModelResponse.model_validate(row) for row in rows]
        return ListSavedModelsResponse(items=items)
    except Exception as exc:
        print(f"DEBUG: Error in list_models: {exc}")
        raise HTTPException(status_code=500, detail=str(exc))


@app.get("/models/{model_id}", response_model=SavedModelResponse)
def get_model(model_id: UUID, db: Session = Depends(get_db)) -> SavedModelResponse:
    row = db.get(SavedModel, model_id)
    if row is None:
        raise HTTPException(status_code=404, detail="Model not found")
    return SavedModelResponse.model_validate(row)

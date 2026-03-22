from typing import Any, Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class SandboxGenerateRequest(BaseModel):
    prompt: str = Field(min_length=1, max_length=400)
    sketch_url: str | None = None
    context_token: str | None = None
    edit_instruction: str | None = Field(default=None, max_length=400)
    desired_speed: Literal["fast", "balanced", "best"] = "balanced"


class SandboxGenerateResponse(BaseModel):
    context_token: str
    model_url: str
    concept_image_url: str
    plan: dict[str, Any]


class SaveModelRequest(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    context_token: str


class SavedModelResponse(BaseModel):
    id: UUID
    name: str
    object_url: str

    model_config = ConfigDict(from_attributes=True)


class ListSavedModelsResponse(BaseModel):
    items: list[SavedModelResponse]


class UploadResponse(BaseModel):
    url: str

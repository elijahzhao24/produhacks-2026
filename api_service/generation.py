import uuid
from dataclasses import dataclass
from typing import Any

from .config import settings


@dataclass
class GeneratedArtifacts:
    concept_image_url: str
    model_url: str


def build_plan(prompt: str, desired_speed: str, is_edit: bool) -> dict[str, Any]:
    route = "text_sketch_to_single_image_to_3d"
    views_needed = ["front_3q"]

    if desired_speed == "best":
        route = "text_sketch_to_multiview_to_3d"
        views_needed = ["front_3q", "side", "back_3q"]

    if is_edit:
        route = "edit_existing_image_then_preview_3d" if desired_speed != "best" else "edit_existing_image_then_refine_3d"

    return {
        "asset_type": classify_asset_type(prompt),
        "route": route,
        "output_format": "glb",
        "views_needed": views_needed,
        "constraints": (
            [
                "preserve base silhouette",
                "preserve overall proportions",
                "modify only the changed region",
            ]
            if is_edit
            else [
                "single isolated object",
                "plain white background",
                "no extra objects",
                "clean silhouette",
            ]
        ),
    }


def classify_asset_type(prompt: str) -> str:
    text = prompt.lower()
    if any(word in text for word in ["character", "person", "npc", "humanoid"]):
        return "character"
    if any(word in text for word in ["car", "ship", "ufo", "vehicle"]):
        return "vehicle"
    if any(word in text for word in ["duck", "monster", "animal", "creature"]):
        return "creature"
    if any(word in text for word in ["chair", "sword", "lamp", "prop", "toy"]):
        return "prop"
    return "other"


def generate_sandbox_artifacts() -> GeneratedArtifacts:
    generation_id = str(uuid.uuid4())
    base = settings.public_storage_base_url.rstrip("/")
    return GeneratedArtifacts(
        concept_image_url=f"{base}/tmp/concepts/{generation_id}.png",
        model_url=f"{base}/tmp/models/{generation_id}.glb",
    )


def persist_saved_model_url(temp_model_url: str) -> str:
    """
    Draft behavior: convert tmp model URL to saved URL.
    In production replace this with a real storage copy/move operation.
    """
    if "/tmp/models/" not in temp_model_url:
        return temp_model_url

    filename = temp_model_url.rsplit("/", maxsplit=1)[-1]
    base = settings.public_storage_base_url.rstrip("/")
    return f"{base}/saved/models/{uuid.uuid4()}-{filename}"

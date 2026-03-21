import uuid
from dataclasses import dataclass
from typing import Any

from .config import settings


class StoragePersistError(RuntimeError):
    pass


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
    Persist a sandbox tmp model URL into the saved prefix.
    If Supabase credentials are configured, this performs a real storage copy.
    Otherwise it falls back to a URL rewrite for local/mock development.
    """
    source_path = _extract_source_path(temp_model_url)
    if source_path is None:
        if _supabase_is_configured():
            raise StoragePersistError(
                "Model URL does not match expected tmp path format "
                f"('/{settings.supabase_tmp_prefix}/models/...'): {temp_model_url}"
            )
        return temp_model_url

    filename = source_path.rsplit("/", maxsplit=1)[-1]
    dest_path = f"{settings.supabase_saved_prefix.rstrip('/')}/models/{uuid.uuid4()}-{filename}"

    if not _supabase_is_configured():
        base = settings.public_storage_base_url.rstrip("/")
        return f"{base}/{dest_path}"

    try:
        from supabase import create_client
    except ImportError as exc:
        raise StoragePersistError(
            "Supabase client is not installed. Install API deps with `uv sync --extra api`."
        ) from exc

    try:
        client = create_client(settings.supabase_url, settings.supabase_service_role_key)
        client.storage.from_(settings.supabase_bucket).copy(source_path, dest_path)
    except Exception as exc:
        raise StoragePersistError(
            f"Failed to copy storage object from '{source_path}' to '{dest_path}': {exc}"
        ) from exc

    return _build_public_object_url(dest_path)


def _supabase_is_configured() -> bool:
    return bool(settings.supabase_url and settings.supabase_service_role_key and settings.supabase_bucket)


def _build_public_object_url(path: str) -> str:
    return (
        f"{settings.supabase_url.rstrip('/')}/storage/v1/object/public/"
        f"{settings.supabase_bucket}/{path.lstrip('/')}"
    )


def _extract_source_path(temp_model_url: str) -> str | None:
    # Typical input looks like .../tmp/models/<id>.glb
    marker = f"/{settings.supabase_tmp_prefix.strip('/')}/models/"
    idx = temp_model_url.find(marker)
    if idx == -1:
        return None
    return temp_model_url[idx + 1 :]

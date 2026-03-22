import time
import uuid
from dataclasses import dataclass
from typing import Any

import httpx

from .config import settings


class GenerationError(RuntimeError):
    pass


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


def generate_sandbox_artifacts(
    *,
    prompt: str,
    sketch_url: str | None,
    edit_instruction: str | None,
    desired_speed: str,
    plan: dict[str, Any],
    previous_context: dict[str, Any] | None,
) -> GeneratedArtifacts:
    if settings.generation_mode == "mock":
        return _generate_mock_artifacts()

    provider = settings.generation_provider.lower().strip()
    if provider != "meshy":
        raise GenerationError(f"Unsupported generation provider: {provider}")

    return _generate_with_meshy(
        prompt=prompt,
        sketch_url=sketch_url,
        edit_instruction=edit_instruction,
        desired_speed=desired_speed,
        plan=plan,
        previous_context=previous_context,
    )


def _generate_mock_artifacts() -> GeneratedArtifacts:
    generation_id = str(uuid.uuid4())
    base = settings.public_storage_base_url.rstrip("/")
    return GeneratedArtifacts(
        concept_image_url=f"{base}/{settings.supabase_tmp_prefix.strip('/')}/concepts/{generation_id}.png",
        model_url=f"{base}/{settings.supabase_tmp_prefix.strip('/')}/models/{generation_id}.glb",
    )


def _generate_with_meshy(
    *,
    prompt: str,
    sketch_url: str | None,
    edit_instruction: str | None,
    desired_speed: str,
    plan: dict[str, Any],
    previous_context: dict[str, Any] | None,
) -> GeneratedArtifacts:
    if not settings.meshy_api_key:
        raise GenerationError("MESHY_API_KEY is required when GENERATION_MODE=real.")

    is_edit = bool(previous_context or edit_instruction)
    
    # TURBO OPTIMIZATION: Skip concept image step for 'fast' mode if we have a sketch.
    concept_remote_url = sketch_url
    if desired_speed == "fast" and sketch_url and not is_edit:
        model_task_id = _meshy_create_image_to_3d_task(
            concept_image_url=sketch_url,
            desired_speed=desired_speed,
        )
        model_task = _meshy_wait_for_task("image-to-3d", model_task_id)
        model_remote_url = _extract_glb_url(model_task)
    else:
        constraints = plan.get("constraints") or []
        concept_prompt = _build_concept_prompt(
            prompt=prompt,
            edit_instruction=edit_instruction,
            constraints=constraints,
            is_edit=is_edit,
        )

        prev_concept = (previous_context or {}).get("concept_image_url")
        reference_images = _dedupe_nonempty([prev_concept if is_edit else None, sketch_url])

        wants_multi_view = len(plan.get("views_needed") or []) > 1

        if reference_images:
            concept_task_id = _meshy_create_image_to_image_task(
                prompt=concept_prompt,
                reference_image_urls=reference_images,
                desired_speed=desired_speed,
                generate_multi_view=wants_multi_view,
            )
            concept_task = _meshy_wait_for_task("image-to-image", concept_task_id)
        else:
            concept_task_id = _meshy_create_text_to_image_task(
                prompt=concept_prompt,
                desired_speed=desired_speed,
                generate_multi_view=wants_multi_view,
            )
            concept_task = _meshy_wait_for_task("text-to-image", concept_task_id)

        concept_remote_url = _extract_image_url(concept_task)

        model_task_id = _meshy_create_image_to_3d_task(
            concept_image_url=concept_remote_url,
            desired_speed=desired_speed,
        )
        model_task = _meshy_wait_for_task("image-to-3d", model_task_id)
        model_remote_url = _extract_glb_url(model_task)

    # Download and upload to Supabase (required for CORS and persistence)
    concept_bytes, concept_content_type = _download_bytes(concept_remote_url)
    model_bytes, model_content_type = _download_bytes(model_remote_url)

    generation_id = str(uuid.uuid4())
    tmp_prefix = settings.supabase_tmp_prefix.strip("/")
    concept_path = f"{tmp_prefix}/concepts/{generation_id}.png"
    model_path = f"{tmp_prefix}/models/{generation_id}.glb"

    if _supabase_is_configured():
        _upload_bytes_to_supabase(
            path=concept_path,
            data=concept_bytes,
            content_type=concept_content_type or "image/png",
        )
        _upload_bytes_to_supabase(
            path=model_path,
            data=model_bytes,
            content_type=model_content_type or "model/gltf-binary",
        )

        return GeneratedArtifacts(
            concept_image_url=_build_public_object_url(concept_path),
            model_url=_build_public_object_url(model_path),
        )

    # If Supabase storage is not configured, return provider URLs directly.
    return GeneratedArtifacts(concept_image_url=concept_remote_url, model_url=model_remote_url)


def _build_concept_prompt(
    *,
    prompt: str,
    edit_instruction: str | None,
    constraints: list[str],
    is_edit: bool,
) -> str:
    rule_text = ", ".join(constraints)
    if is_edit:
        edit_text = edit_instruction or "apply only subtle changes while preserving identity"
        return (
            f"{prompt}. Edit instruction: {edit_text}. Keep this as the same object and preserve identity. "
            f"Constraints: {rule_text}."
        )
    return f"{prompt}. Constraints: {rule_text}."


def _meshy_create_text_to_image_task(*, prompt: str, desired_speed: str, generate_multi_view: bool) -> str:
    payload: dict[str, Any] = {
        "ai_model": _resolve_meshy_image_model(desired_speed),
        "prompt": prompt,
    }
    if generate_multi_view:
        payload["generate_multi_view"] = True

    data = _meshy_request("POST", "text-to-image", json=payload)
    task_id = data.get("result")
    if not task_id:
        raise GenerationError(f"Meshy text-to-image response missing task id: {data}")
    return str(task_id)


def _meshy_create_image_to_image_task(
    *,
    prompt: str,
    reference_image_urls: list[str],
    desired_speed: str,
    generate_multi_view: bool,
) -> str:
    payload: dict[str, Any] = {
        "ai_model": _resolve_meshy_image_model(desired_speed),
        "prompt": prompt,
        "reference_image_urls": reference_image_urls[:5],
    }
    if generate_multi_view:
        payload["generate_multi_view"] = True

    data = _meshy_request("POST", "image-to-image", json=payload)
    task_id = data.get("result")
    if not task_id:
        raise GenerationError(f"Meshy image-to-image response missing task id: {data}")
    return str(task_id)


def _meshy_create_image_to_3d_task(*, concept_image_url: str, desired_speed: str) -> str:
    payload: dict[str, Any] = {
        "image_url": concept_image_url,
        "ai_model": settings.meshy_3d_model,
        "target_formats": ["glb"],
    }

    if desired_speed == "fast":
        payload.update(
            {
                "model_type": "lowpoly",
                "should_texture": False,
                "should_remesh": False,
            }
        )
    elif desired_speed == "best":
        payload.update(
            {
                "model_type": "standard",
                "should_texture": True,
                "should_remesh": True,
                "enable_pbr": True,
            }
        )
    else:
        payload.update(
            {
                "model_type": "standard",
                "should_texture": True,
                "should_remesh": False,
                "enable_pbr": False,
            }
        )

    data = _meshy_request("POST", "image-to-3d", json=payload)
    task_id = data.get("result")
    if not task_id:
        raise GenerationError(f"Meshy image-to-3d response missing task id: {data}")
    return str(task_id)


def _meshy_wait_for_task(task_type: str, task_id: str) -> dict[str, Any]:
    deadline = time.time() + settings.meshy_task_timeout_seconds

    while time.time() <= deadline:
        task = _meshy_request("GET", f"{task_type}/{task_id}")
        status = str(task.get("status", "")).upper()

        if status == "SUCCEEDED":
            return task

        if status in {"FAILED", "CANCELED", "CANCELLED"}:
            task_error = task.get("task_error") or {}
            error_message = task_error.get("message") or task.get("error") or "Unknown Meshy error"
            raise GenerationError(f"Meshy task {task_type}/{task_id} failed: {error_message}")

        time.sleep(settings.meshy_poll_interval_seconds)

    raise GenerationError(f"Meshy task {task_type}/{task_id} timed out after {settings.meshy_task_timeout_seconds}s")


def _meshy_request(method: str, path: str, json: dict[str, Any] | None = None) -> dict[str, Any]:
    base = settings.meshy_base_url.rstrip("/")
    url = f"{base}/{path.lstrip('/')}"
    headers = {"Authorization": f"Bearer {settings.meshy_api_key}"}

    try:
        with httpx.Client(timeout=settings.meshy_request_timeout_seconds) as client:
            response = client.request(method, url, headers=headers, json=json)
    except httpx.HTTPError as exc:
        raise GenerationError(f"Meshy request failed for {path}: {exc}") from exc

    if response.status_code >= 400:
        raise GenerationError(
            f"Meshy API error for {path} (status {response.status_code}): {response.text[:400]}"
        )

    try:
        return response.json()
    except ValueError as exc:
        raise GenerationError(f"Meshy API returned non-JSON response for {path}") from exc


def _extract_image_url(task: dict[str, Any]) -> str:
    image_urls = task.get("image_urls")
    if isinstance(image_urls, list) and image_urls:
        return str(image_urls[0])
    raise GenerationError(f"Image task missing image_urls: {task}")


def _extract_glb_url(task: dict[str, Any]) -> str:
    model_urls = task.get("model_urls")
    if isinstance(model_urls, dict):
        glb_url = model_urls.get("glb")
        if glb_url:
            return str(glb_url)
    raise GenerationError(f"3D task missing model_urls.glb: {task}")


def _download_bytes(url: str) -> tuple[bytes, str | None]:
    try:
        with httpx.Client(timeout=settings.meshy_request_timeout_seconds, follow_redirects=True) as client:
            response = client.get(url)
    except httpx.HTTPError as exc:
        raise GenerationError(f"Failed to download provider asset: {exc}") from exc

    if response.status_code >= 400:
        raise GenerationError(f"Failed to download provider asset (status {response.status_code}) from {url}")

    content_type = response.headers.get("content-type")
    if content_type:
        content_type = content_type.split(";")[0].strip()

    return response.content, content_type


def _resolve_meshy_image_model(desired_speed: str) -> str:
    if desired_speed == "fast":
        return settings.meshy_image_model_fast
    if desired_speed == "best":
        return settings.meshy_image_model_best
    return settings.meshy_image_model_balanced


def _dedupe_nonempty(values: list[str | None]) -> list[str]:
    out: list[str] = []
    seen: set[str] = set()
    for value in values:
        if not value:
            continue
        if value in seen:
            continue
        seen.add(value)
        out.append(value)
    return out


def persist_saved_model_url(temp_model_url: str) -> str:
    """
    Persist a sandbox tmp model URL into the saved prefix.
    If Supabase credentials are configured, this performs a real storage copy.
    Otherwise it falls back to a URL rewrite for local/mock development.
    """
    source_path = _extract_source_path(temp_model_url)
    print(f"DEBUG: Persisting model URL: {temp_model_url}. Extracted source path: {source_path}")
    if source_path is None:
        if _supabase_is_configured():
            print("DEBUG: Supabase is configured but source path is None. Failing.")
            raise StoragePersistError(
                "Model URL does not match expected tmp path format "
                f"('/{settings.supabase_tmp_prefix}/models/...'): {temp_model_url}"
            )
        print("DEBUG: Supabase not configured and source path is None. Returning original URL.")
        return temp_model_url

    filename = source_path.rsplit("/", maxsplit=1)[-1]
    dest_path = f"{settings.supabase_saved_prefix.rstrip('/')}/models/{uuid.uuid4()}-{filename}"

    if not _supabase_is_configured():
        base = settings.public_storage_base_url.rstrip("/")
        return f"{base}/{dest_path}"

    try:
        client = _get_supabase_client()
        client.storage.from_(settings.supabase_bucket).copy(source_path, dest_path)
    except Exception as exc:
        raise StoragePersistError(
            f"Failed to copy storage object from '{source_path}' to '{dest_path}': {exc}"
        ) from exc

    return _build_public_object_url(dest_path)


def _upload_bytes_to_supabase(*, path: str, data: bytes, content_type: str) -> None:
    try:
        client = _get_supabase_client()
        client.storage.from_(settings.supabase_bucket).upload(
            path,
            data,
            file_options={
                "content-type": content_type,
                "upsert": False,
            },
        )
    except Exception as exc:
        raise StoragePersistError(f"Failed to upload '{path}' to Supabase bucket '{settings.supabase_bucket}': {exc}") from exc


def _get_supabase_client():
    try:
        from supabase import create_client
    except ImportError as exc:
        raise StoragePersistError(
            "Supabase client is not installed. Install API deps with `uv sync --extra api`."
        ) from exc

    if not _supabase_is_configured():
        raise StoragePersistError("Supabase storage is not configured.")

    return create_client(settings.supabase_url, settings.supabase_service_role_key)


def _supabase_is_configured() -> bool:
    return bool(settings.supabase_url and settings.supabase_service_role_key and settings.supabase_bucket)


def _build_public_object_url(path: str) -> str:
    if settings.supabase_url:
        return (
            f"{settings.supabase_url.rstrip('/')}/storage/v1/object/public/"
            f"{settings.supabase_bucket}/{path.lstrip('/')}"
        )
    return f"{settings.public_storage_base_url.rstrip('/')}/{path.lstrip('/')}"


def _extract_source_path(temp_model_url: str) -> str | None:
    # Typical input looks like .../tmp/models/<id>.glb
    marker = f"/{settings.supabase_tmp_prefix.strip('/')}/models/"
    idx = temp_model_url.find(marker)
    if idx == -1:
        return None
    return temp_model_url[idx + 1 :].split("?", maxsplit=1)[0]


def upload_sketch_to_supabase(data: bytes, content_type: str) -> str:
    """
    Upload a raw sketch image to Supabase Storage and return its public URL.
    """
    generation_id = str(uuid.uuid4())
    extension = "png"
    if "jpeg" in content_type:
        extension = "jpg"
    elif "svg" in content_type:
        extension = "svg"

    path = f"{settings.supabase_tmp_prefix.strip('/')}/sketches/{generation_id}.{extension}"

    if not _supabase_is_configured():
        # Fallback for local/mock
        base = settings.public_storage_base_url.rstrip("/")
        return f"{base}/{path}"

    _upload_bytes_to_supabase(path=path, data=data, content_type=content_type)
    return _build_public_object_url(path)

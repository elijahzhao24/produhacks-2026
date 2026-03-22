import uuid
from typing import Any

import httpx

from .config import settings
from .generation import build_plan


def get_generation_plan(
    *,
    prompt: str,
    desired_speed: str,
    sketch_url: str | None,
    edit_instruction: str | None,
    is_edit: bool,
) -> dict[str, Any]:
    if not settings.fetch_agent_plan_url:
        return build_plan(prompt=prompt, desired_speed=desired_speed, is_edit=is_edit)

    payload = {
        "request_id": str(uuid.uuid4()),
        "mode": "edit" if is_edit else "create",
        "prompt": prompt,
        "sketch_url": sketch_url,
        "edit_instruction": edit_instruction,
        "desired_speed": desired_speed,
    }

    try:
        response = httpx.post(
            settings.fetch_agent_plan_url,
            json=payload,
            timeout=settings.fetch_agent_timeout_seconds,
        )
        response.raise_for_status()
        data = response.json()
    except Exception:
        return build_plan(prompt=prompt, desired_speed=desired_speed, is_edit=is_edit)

    return {
        "asset_type": data.get("asset_type", "other"),
        "route": data.get("route", "text_sketch_to_single_image_to_3d"),
        "output_format": data.get("output_format", "glb"),
        "views_needed": data.get("views_needed", ["front_3q"]),
        "constraints": data.get("constraints", []),
    }

import os
from enum import Enum
from typing import Literal

from uagents import Agent, Context, Model


class Mode(str, Enum):
    CREATE = "create"
    EDIT = "edit"


class GenerationRequest(Model):
    request_id: str
    mode: Mode
    prompt: str
    sketch_url: str | None = None
    edit_instruction: str | None = None
    desired_speed: Literal["fast", "balanced", "best"] = "balanced"


class GenerationPlan(Model):
    request_id: str
    asset_type: Literal["prop", "character", "vehicle", "creature", "other"]
    route: Literal[
        "text_sketch_to_single_image_to_3d",
        "text_sketch_to_multiview_to_3d",
        "edit_existing_image_then_preview_3d",
        "edit_existing_image_then_refine_3d",
    ]
    output_format: Literal["glb"] = "glb"
    views_needed: list[str]
    constraints: list[str]
    use_cached_concept_images: bool = False
    use_cached_mesh: bool = False
    require_preview_first: bool = True


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


def make_plan(req: GenerationRequest) -> GenerationPlan:
    asset_type = classify_asset_type(req.prompt)

    if req.mode == Mode.EDIT:
        route = (
            "edit_existing_image_then_preview_3d"
            if req.desired_speed != "best"
            else "edit_existing_image_then_refine_3d"
        )
        return GenerationPlan(
            request_id=req.request_id,
            asset_type=asset_type,
            route=route,
            views_needed=["front_3q"],
            constraints=[
                "preserve base silhouette",
                "preserve overall proportions",
                "modify only the changed region",
            ],
            use_cached_concept_images=True,
            use_cached_mesh=True,
            require_preview_first=True,
        )

    if req.desired_speed == "best":
        route = "text_sketch_to_multiview_to_3d"
        views_needed = ["front_3q", "side", "back_3q"]
    else:
        route = "text_sketch_to_single_image_to_3d"
        views_needed = ["front_3q"]

    return GenerationPlan(
        request_id=req.request_id,
        asset_type=asset_type,
        route=route,
        views_needed=views_needed,
        constraints=[
            "single isolated object",
            "plain white background",
            "no extra objects",
            "clean silhouette",
        ],
        use_cached_concept_images=False,
        use_cached_mesh=False,
        require_preview_first=True,
    )


agent = Agent(
    name=os.getenv("FETCH_AGENT_NAME", "sketch2mesh_orchestrator"),
    seed=os.getenv("FETCH_AGENT_SEED", "replace-with-a-long-random-seed"),
    port=int(os.getenv("FETCH_AGENT_PORT", "8001")),
    endpoint=[os.getenv("FETCH_AGENT_ENDPOINT", "http://127.0.0.1:8001/submit")],
)


@agent.on_event("startup")
async def startup(ctx: Context):
    ctx.logger.info(f"Agent started: {agent.name}")
    ctx.logger.info(f"Address: {agent.address}")


@agent.on_rest_post("/plan", GenerationRequest, GenerationPlan)
async def rest_plan(_ctx: Context, req: GenerationRequest) -> GenerationPlan:
    return make_plan(req)


@agent.on_message(model=GenerationRequest)
async def message_plan(ctx: Context, sender: str, msg: GenerationRequest):
    await ctx.send(sender, make_plan(msg))


if __name__ == "__main__":
    agent.run()

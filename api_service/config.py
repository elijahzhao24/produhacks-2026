import os
from dataclasses import dataclass


@dataclass(frozen=True)
class Settings:
    app_name: str = os.getenv("APP_NAME", "Sketch2Mesh Minimal API")
    database_url: str = os.getenv("DATABASE_URL", "sqlite:///./app.db")
    token_secret: str = os.getenv("CONTEXT_TOKEN_SECRET", "change-me-in-prod")
    token_ttl_seconds: int = int(os.getenv("CONTEXT_TOKEN_TTL_SECONDS", "86400"))
    public_storage_base_url: str = os.getenv("PUBLIC_STORAGE_BASE_URL", "https://storage.local")
    generation_mode: str = os.getenv("GENERATION_MODE", "real")
    generation_provider: str = os.getenv("GENERATION_PROVIDER", "meshy")
    meshy_api_key: str = os.getenv("MESHY_API_KEY", "")
    meshy_base_url: str = os.getenv("MESHY_BASE_URL", "https://api.meshy.ai/openapi/v1")
    meshy_image_model_fast: str = os.getenv("MESHY_IMAGE_MODEL_FAST", "nano-banana")
    meshy_image_model_balanced: str = os.getenv("MESHY_IMAGE_MODEL_BALANCED", "nano-banana")
    meshy_image_model_best: str = os.getenv("MESHY_IMAGE_MODEL_BEST", "nano-banana-pro")
    meshy_3d_model: str = os.getenv("MESHY_3D_MODEL", "latest")
    meshy_request_timeout_seconds: int = int(os.getenv("MESHY_REQUEST_TIMEOUT_SECONDS", "60"))
    meshy_poll_interval_seconds: int = int(os.getenv("MESHY_POLL_INTERVAL_SECONDS", "3"))
    meshy_task_timeout_seconds: int = int(os.getenv("MESHY_TASK_TIMEOUT_SECONDS", "900"))
    # Supabase storage settings (optional for local mock mode).
    supabase_url: str = os.getenv("SUPABASE_URL", "")
    supabase_service_role_key: str = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")
    supabase_bucket: str = os.getenv("SUPABASE_BUCKET", "assets")
    supabase_tmp_prefix: str = os.getenv("SUPABASE_TMP_PREFIX", "tmp")
    supabase_saved_prefix: str = os.getenv("SUPABASE_SAVED_PREFIX", "saved")
    fetch_agent_plan_url: str = os.getenv("FETCH_AGENT_PLAN_URL", "")
    fetch_agent_timeout_seconds: int = int(os.getenv("FETCH_AGENT_TIMEOUT_SECONDS", "8"))


settings = Settings()

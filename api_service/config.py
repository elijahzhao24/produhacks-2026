import os
from dataclasses import dataclass


@dataclass(frozen=True)
class Settings:
    app_name: str = os.getenv("APP_NAME", "Sketch2Mesh Minimal API")
    database_url: str = os.getenv("DATABASE_URL", "sqlite:///./app.db")
    token_secret: str = os.getenv("CONTEXT_TOKEN_SECRET", "change-me-in-prod")
    token_ttl_seconds: int = int(os.getenv("CONTEXT_TOKEN_TTL_SECONDS", "86400"))
    public_storage_base_url: str = os.getenv("PUBLIC_STORAGE_BASE_URL", "https://storage.local")
    fetch_agent_plan_url: str = os.getenv("FETCH_AGENT_PLAN_URL", "")
    fetch_agent_timeout_seconds: int = int(os.getenv("FETCH_AGENT_TIMEOUT_SECONDS", "8"))


settings = Settings()

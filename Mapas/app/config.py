from __future__ import annotations

from functools import lru_cache

from pydantic import AliasChoices, Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    database_url: str = Field(
        default="postgresql+psycopg://yachay_app:local-dev-only-change-me@localhost:5433/yachay_maps",
        validation_alias=AliasChoices("MAPS_DATABASE_URL", "DATABASE_URL"),
    )
    database_schema: str = "public"
    osm_path: str = "/data/YACHAY_FINAL.osm"
    cors_origins: str = "http://localhost:5180,http://127.0.0.1:5180,http://localhost:8000"
    cache_seconds: int = 300
    gzip_min_size: int = 500

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    @property
    def allowed_origins(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()

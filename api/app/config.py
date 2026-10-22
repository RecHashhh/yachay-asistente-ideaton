from functools import lru_cache

from pydantic import SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict
from sqlalchemy.engine import URL


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=None, extra="ignore")

    postgres_db: str = "yachay_rag"
    postgres_user: str = "yachay"
    postgres_password: SecretStr = SecretStr("local-dev-only-change-me")
    postgres_host: str = "localhost"
    postgres_port: int = 5432

    ollama_base_url: str = "http://localhost:11434"
    ollama_embedding_model: str = "bge-m3"
    anthropic_api_key: SecretStr = SecretStr("")
    anthropic_model: str = "claude-haiku-5-5"

    rag_min_similarity: float = 0.30
    rag_vector_candidates: int = 20
    rag_context_chunks: int = 8
    rag_max_tool_calls: int = 6
    cors_origins: str = "http://localhost:5180,http://127.0.0.1:5180"

    # Ingesta de correos: sin token el endpoint queda deshabilitado.
    ingest_token: SecretStr = SecretStr("")
    email_allowed_senders: str = "comunicacion@yachaytech.edu.ec"

    @property
    def database_url(self) -> URL:
        return URL.create(
            "postgresql+asyncpg",
            username=self.postgres_user,
            password=self.postgres_password.get_secret_value(),
            host=self.postgres_host,
            port=self.postgres_port,
            database=self.postgres_db,
        )

    @property
    def allowed_origins(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]

    @property
    def allowed_email_senders(self) -> set[str]:
        return {sender.strip().lower() for sender in self.email_allowed_senders.split(",") if sender.strip()}


@lru_cache
def get_settings() -> Settings:
    return Settings()

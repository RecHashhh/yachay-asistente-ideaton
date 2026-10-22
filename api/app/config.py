"""Configuración única de la API (Yachi + agente de búsqueda guiada por catálogo).

Se lee de variables de entorno; en desarrollo también de api/.env (nunca de valores escritos en el código).
- Núcleo de Yachi (psycopg, sql/*.sql, búsqueda híbrida con fastembed): DATABASE_URL, RAG_DIR, EMBEDDING_MODEL, ADMIN_*, RATE_*, ...
- Agente (decide en qué documentos buscar y con qué términos; requiere ANTHROPIC_API_KEY): RAG_MAX_TOOL_CALLS, RAG_CONTEXT_CHUNKS, ...
- Capa SQLAlchemy/Alembic/Ollama del agente original (docker-compose): POSTGRES_*, OLLAMA_* (base propia, separada de la de Yachi).
"""

from functools import lru_cache
from pathlib import Path

from dotenv import load_dotenv
from pydantic import AliasChoices, Field, SecretStr, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict
from sqlalchemy.engine import URL

API_DIR = Path(__file__).resolve().parent.parent
load_dotenv(API_DIR / ".env")


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=None, extra="ignore", populate_by_name=True)

    # ------------------------------------------------------------- núcleo de Yachi
    database_url: str = ""
    anthropic_api_key: SecretStr = SecretStr("")
    anthropic_model: str = "claude-haiku-5-5"
    rag_dir: Path = Path("../docs/rag/rag")
    embedding_model: str = "sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2"
    admin_emails_raw: str = Field(default="", validation_alias=AliasChoices("ADMIN_EMAILS", "admin_emails_raw"))
    admin_password: str = ""
    frontend_origin: str = "http://localhost:5180"
    # Límite de uso del chat (OWASP LLM10). Por IP es alto porque el campus sale a internet con pocas IP compartidas.
    rate_session_min: int = Field(default=12, validation_alias=AliasChoices("RATE_SESSION_PER_MIN", "rate_session_min"))
    rate_session_day: int = Field(default=300, validation_alias=AliasChoices("RATE_SESSION_PER_DAY", "rate_session_day"))
    rate_ip_min: int = Field(default=120, validation_alias=AliasChoices("RATE_IP_PER_MIN", "rate_ip_min"))
    # Detrás de App Service o un proxy: tomar la IP del último X-Forwarded-For (lo agrega el proxy, no el cliente).
    trust_proxy: bool = False
    # Conservación (LOPDP): preguntas anónimas y votos; debe coincidir con el aviso de datos (web/src/config.ts).
    retention_days: int = 365

    # ------------------------------------------------------------- agente (búsqueda guiada por catálogo)
    # auto: se usa si hay clave de Anthropic; off: siempre la búsqueda híbrida directa.
    agent_mode: str = Field(default="auto", validation_alias=AliasChoices("YACHI_AGENT", "agent_mode"))
    rag_min_similarity: float = 0.30
    rag_vector_candidates: int = 20
    rag_context_chunks: int = 8
    rag_max_tool_calls: int = 6

    # ------------------------------------------------------------- capa SQLAlchemy/Ollama (docker-compose del agente)
    postgres_db: str = "yachay_rag"
    postgres_user: str = "yachay"
    postgres_password: SecretStr = SecretStr("local-dev-only-change-me")
    postgres_host: str = "localhost"
    postgres_port: int = 5432
    ollama_base_url: str = "http://localhost:11434"
    ollama_embedding_model: str = "bge-m3"
    cors_origins: str = "http://localhost:5180,http://127.0.0.1:5180"

    # Ingesta de correos: sin token el endpoint queda deshabilitado.
    ingest_token: SecretStr = SecretStr("")
    email_allowed_senders: str = "comunicacion@yachaytech.edu.ec"  # fuentes oficiales
    email_forwarders: str = ""  # quién puede reenviar (como adjunto) comunicados oficiales al buzón robot

    @field_validator("rag_dir")
    @classmethod
    def _resolve_rag_dir(cls, v: Path) -> Path:
        return v if v.is_absolute() else (API_DIR / v).resolve()

    @property
    def has_anthropic_key(self) -> bool:
        return bool(self.anthropic_api_key.get_secret_value().strip())

    @property
    def agent_enabled(self) -> bool:
        return self.agent_mode.lower() != "off" and self.has_anthropic_key

    @property
    def admin_emails(self) -> tuple[str, ...]:
        return tuple(e.strip().lower() for e in self.admin_emails_raw.split(",") if e.strip())

    @property
    def sqlalchemy_url(self) -> URL:
        """URL asíncrona (asyncpg) de la capa SQLAlchemy/Alembic del agente original. Va SIEMPRE a su propia base
        (POSTGRES_*): su tabla `documents` tiene otro esquema que la de Yachi y no deben compartir base."""
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
        origins = [o.strip() for o in self.cors_origins.split(",") if o.strip()]
        return list(dict.fromkeys([self.frontend_origin, *origins]))

    @property
    def allowed_email_senders(self) -> set[str]:
        return {sender.strip().lower() for sender in self.email_allowed_senders.split(",") if sender.strip()}

    @property
    def allowed_email_forwarders(self) -> set[str]:
        return {sender.strip().lower() for sender in self.email_forwarders.split(",") if sender.strip()}


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()

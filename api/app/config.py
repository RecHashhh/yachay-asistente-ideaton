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
DEFAULT_ANTHROPIC_PRICING_JSON = (
    '{"claude-haiku-5-5":{"base":{"input":0.10,"output":0.50,"cache_write":0.125,"cache_read":0.01},'
    '"over_100k":{"input":0.50,"output":2.50,"cache_write":0.625,"cache_read":0.05}}}'
)


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=None, extra="ignore", populate_by_name=True)

    # ------------------------------------------------------------- núcleo de Yachi
    database_url: str = ""
    anthropic_api_key: SecretStr = SecretStr("")
    anthropic_model: str = "claude-haiku-5-5"
    anthropic_pricing_json: str = Field(
        default=DEFAULT_ANTHROPIC_PRICING_JSON,
        validation_alias=AliasChoices("ANTHROPIC_PRICING_USD_PER_MTOK_JSON", "anthropic_pricing_json"),
    )
    rag_dir: Path = Path("../docs/rag/rag")
    embedding_model: str = "sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2"
    admin_emails_raw: str = Field(default="", validation_alias=AliasChoices("ADMIN_EMAILS", "admin_emails_raw"))
    admin_password: str = ""
    frontend_origin: str = "http://localhost:5180"
    # Límite de uso del chat (OWASP LLM10). Por IP es alto porque el campus sale a internet con pocas IP compartidas.
    rate_session_min: int = Field(default=12, validation_alias=AliasChoices("RATE_SESSION_PER_MIN", "rate_session_min"))
    rate_session_day: int = Field(default=300, validation_alias=AliasChoices("RATE_SESSION_PER_DAY", "rate_session_day"))
    rate_ip_min: int = Field(default=120, validation_alias=AliasChoices("RATE_IP_PER_MIN", "rate_ip_min"))
    geo_lock_pool_size: int = Field(default=32, ge=1, le=128, validation_alias=AliasChoices("GEO_LOCK_POOL_SIZE", "geo_lock_pool_size"))
    # Detrás de App Service o un proxy: tomar la IP del último X-Forwarded-For (lo agrega el proxy, no el cliente).
    trust_proxy: bool = False
    # Conservación (LOPDP): preguntas anónimas y votos; debe coincidir con el aviso de datos (web/src/config.ts).
    retention_days: int = 365

    # ------------------------------------------------------------- uso del modelo (Claude) y tope de gasto
    # Interruptor general: con YACHI_LLM=off la clave queda cargada pero no se llama al modelo (modo sin modelo).
    llm_switch: str = Field(default="on", validation_alias=AliasChoices("YACHI_LLM", "llm_switch"))
    # Tope de gasto acumulado en USD (tabla llm_usage). Al alcanzarlo, el chat pasa solo al modo sin modelo. 0 = sin tope.
    anthropic_budget_usd: float = Field(default=5.0, validation_alias=AliasChoices("ANTHROPIC_BUDGET_USD", "anthropic_budget_usd"))
    # Precio por millón de tokens del modelo de respuesta (Claude Haiku 5.5, consultado el 20-10-2026).
    price_in_per_m: float = 0.10
    price_out_per_m: float = 0.50

    # ------------------------------------------------------------- agente (búsqueda guiada por catálogo)
    # auto: se usa si hay clave de Anthropic; off: siempre la búsqueda híbrida directa.
    agent_mode: str = Field(default="auto", validation_alias=AliasChoices("YACHI_AGENT", "agent_mode"))
    rag_min_similarity: float = 0.30
    rag_vector_candidates: int = 20
    rag_context_chunks: int = 8
    rag_max_tool_calls: int = 6
    geo_intent_min_confidence: float = Field(default=0.72, ge=0.5, le=0.99)

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

    @field_validator("anthropic_pricing_json", mode="before")
    @classmethod
    def _default_empty_price_table(cls, value: str) -> str:
        return value if isinstance(value, str) and value.strip() else DEFAULT_ANTHROPIC_PRICING_JSON

    @field_validator("rag_dir")
    @classmethod
    def _resolve_rag_dir(cls, v: Path) -> Path:
        return v if v.is_absolute() else (API_DIR / v).resolve()

    @property
    def llm_on(self) -> bool:
        return self.llm_switch.strip().lower() not in ("off", "0", "false", "no")

    @property
    def has_anthropic_key(self) -> bool:
        """Hay clave Y el interruptor está encendido: solo entonces se crea el cliente del modelo."""
        return self.llm_on and bool(self.anthropic_api_key.get_secret_value().strip())

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

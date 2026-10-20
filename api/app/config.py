"""Configuración leída de api/.env (nunca de valores escritos en el código)."""

import os
from dataclasses import dataclass, field
from pathlib import Path

from dotenv import load_dotenv

API_DIR = Path(__file__).resolve().parent.parent
load_dotenv(API_DIR / ".env")


def _req(name: str) -> str:
    v = os.environ.get(name, "").strip()
    if not v:
        raise RuntimeError(f"Falta {name} en api/.env (ver api/.env.example).")
    return v


@dataclass(frozen=True)
class Settings:
    database_url: str = field(default_factory=lambda: _req("DATABASE_URL"))
    anthropic_model: str = field(default_factory=lambda: os.environ.get("ANTHROPIC_MODEL", "claude-haiku-5-5"))
    has_anthropic_key: bool = field(default_factory=lambda: bool(os.environ.get("ANTHROPIC_API_KEY", "").strip()))
    rag_dir: Path = field(default_factory=lambda: (API_DIR / os.environ.get("RAG_DIR", "../docs/rag/rag")).resolve())
    embedding_model: str = field(default_factory=lambda: os.environ.get("EMBEDDING_MODEL", "sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2"))
    admin_emails: tuple[str, ...] = field(default_factory=lambda: tuple(e.strip().lower() for e in os.environ.get("ADMIN_EMAILS", "").split(",") if e.strip()))
    admin_password: str = field(default_factory=lambda: os.environ.get("ADMIN_PASSWORD", ""))
    frontend_origin: str = field(default_factory=lambda: os.environ.get("FRONTEND_ORIGIN", "http://localhost:5180"))
    # Límite de uso del chat (OWASP LLM10). Por IP es alto porque el campus sale a internet con pocas IP compartidas.
    rate_session_min: int = field(default_factory=lambda: int(os.environ.get("RATE_SESSION_PER_MIN", "12")))
    rate_session_day: int = field(default_factory=lambda: int(os.environ.get("RATE_SESSION_PER_DAY", "300")))
    rate_ip_min: int = field(default_factory=lambda: int(os.environ.get("RATE_IP_PER_MIN", "120")))
    # Detrás de App Service o un proxy: tomar la IP del último X-Forwarded-For (lo agrega el proxy, no el cliente).
    trust_proxy: bool = field(default_factory=lambda: os.environ.get("TRUST_PROXY", "").lower() in ("1", "true", "si"))
    # Conservación (LOPDP): preguntas anónimas y votos; debe coincidir con el aviso de datos (web/src/config.ts).
    retention_days: int = field(default_factory=lambda: int(os.environ.get("RETENTION_DAYS", "365")))


settings = Settings()

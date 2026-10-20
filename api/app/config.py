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


settings = Settings()

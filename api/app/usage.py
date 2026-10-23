"""Registro del uso real del modelo y tope de gasto.

Cada llamada a Claude (redacción de la respuesta y decisiones del agente) guarda sus tokens y su costo en llm_usage.
`budget_ok()` corta el uso del modelo al llegar a ANTHROPIC_BUDGET_USD: el chat sigue funcionando en modo sin modelo
(guías, mapa, filtros y fragmento literal), así la presentación nunca se queda sin servicio por falta de saldo.
"""

import time
from typing import Any

from .config import settings
from .db import conn

CACHE_READ_FACTOR = 0.1    # leer del caché del prompt cuesta el 10 % de la entrada
CACHE_WRITE_FACTOR = 1.25  # escribir en el caché cuesta 1,25 veces la entrada

_spent_cache: tuple[float, float] | None = None


def cost(input_tokens: int, output_tokens: int, cache_read: int = 0, cache_write: int = 0) -> float:
    m = 1_000_000
    return (input_tokens * settings.price_in_per_m + cache_read * settings.price_in_per_m * CACHE_READ_FACTOR
            + cache_write * settings.price_in_per_m * CACHE_WRITE_FACTOR + output_tokens * settings.price_out_per_m) / m


def record(source: str, input_tokens: int, output_tokens: int, cache_read: int = 0, cache_write: int = 0) -> None:
    """Guarda una llamada. Nunca interrumpe la respuesta si la base falla (solo se pierde ese registro)."""
    global _spent_cache
    usd = cost(input_tokens, output_tokens, cache_read, cache_write)
    try:
        with conn() as c:
            c.execute("INSERT INTO llm_usage (source, model, input_tokens, output_tokens, cache_tokens, cost_usd) VALUES (%s,%s,%s,%s,%s,%s)",
                      (source, settings.anthropic_model, input_tokens + cache_write, output_tokens, cache_read, round(usd, 6)))
        if _spent_cache:
            _spent_cache = (_spent_cache[0], _spent_cache[1] + usd)
    except Exception as e:
        print("No se pudo registrar el uso del modelo:", repr(e))


def record_anthropic(source: str, usage: Any) -> None:
    """Uso de la API de Anthropic (message.usage)."""
    if usage is None:
        return
    record(source, getattr(usage, "input_tokens", 0) or 0, getattr(usage, "output_tokens", 0) or 0,
           getattr(usage, "cache_read_input_tokens", 0) or 0, getattr(usage, "cache_creation_input_tokens", 0) or 0)


def record_langchain(source: str, usage_metadata: dict | None) -> None:
    """Uso de una respuesta de LangChain (AIMessage.usage_metadata) — decisiones del agente."""
    if not usage_metadata:
        return
    details = usage_metadata.get("input_token_details") or {}
    cache_read = details.get("cache_read", 0) or 0
    cache_write = details.get("cache_creation", 0) or 0
    total_in = usage_metadata.get("input_tokens", 0) or 0
    record(source, max(0, total_in - cache_read - cache_write), usage_metadata.get("output_tokens", 0) or 0, cache_read, cache_write)


def spent() -> float:
    """Gasto acumulado en USD (en caché 30 s; se actualiza al registrar)."""
    global _spent_cache
    if _spent_cache and time.time() - _spent_cache[0] < 30:
        return _spent_cache[1]
    with conn() as c:
        total = float(c.execute("SELECT coalesce(sum(cost_usd), 0) AS s FROM llm_usage").fetchone()["s"])
    _spent_cache = (time.time(), total)
    return total


def budget_ok() -> bool:
    """¿Se puede llamar al modelo? Sin tope (0) siempre; si la base no responde, no se gasta (prudencia)."""
    if settings.anthropic_budget_usd <= 0:
        return True
    try:
        return spent() < settings.anthropic_budget_usd
    except Exception:
        return False


def summary() -> dict:
    with conn() as c:
        rows = c.execute(
            "SELECT source, count(*) AS n, coalesce(sum(input_tokens),0) AS i, coalesce(sum(output_tokens),0) AS o, coalesce(sum(cost_usd),0) AS usd "
            "FROM llm_usage GROUP BY source ORDER BY source"
        ).fetchall()
        questions = c.execute("SELECT count(*) AS n FROM messages WHERE tokens_in IS NOT NULL AND tokens_in > 0").fetchone()["n"]
    total = sum(float(r["usd"]) for r in rows)
    return {
        "llmOn": settings.llm_on, "hasKey": bool(settings.anthropic_api_key.get_secret_value().strip()), "active": settings.has_anthropic_key and budget_ok(),
        "model": settings.anthropic_model, "budgetUsd": settings.anthropic_budget_usd, "spentUsd": round(total, 6),
        "calls": sum(r["n"] for r in rows), "answeredWithModel": questions,
        "bySource": [{"source": r["source"], "calls": r["n"], "inputTokens": r["i"], "outputTokens": r["o"], "usd": round(float(r["usd"]), 6)} for r in rows],
    }

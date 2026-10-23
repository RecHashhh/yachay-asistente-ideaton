"""Interruptor del modelo y tope de gasto, sin llamar a la API ni tocar la base real."""

from types import SimpleNamespace

from pydantic import SecretStr

from app import usage
from app.config import Settings


def test_switch_off_disables_model_even_with_key() -> None:
    s = Settings(anthropic_api_key=SecretStr("clave-de-prueba"), llm_switch="off")
    assert s.has_anthropic_key is False and s.agent_enabled is False
    s = Settings(anthropic_api_key=SecretStr("clave-de-prueba"), llm_switch="on")
    assert s.has_anthropic_key is True and s.agent_enabled is True
    assert Settings(anthropic_api_key=SecretStr(""), llm_switch="on").has_anthropic_key is False


def test_cost_uses_haiku_prices_and_cache_factors() -> None:
    # 1 M de entrada ($0,10) + 1 M de salida ($0,50) + 1 M leído de caché ($0,01)
    assert abs(usage.cost(1_000_000, 1_000_000, cache_read=1_000_000) - 0.61) < 1e-9
    assert usage.cost(5_000, 300) < 0.001  # una respuesta típica cuesta menos de una décima de centavo


def test_budget_guard(monkeypatch) -> None:
    monkeypatch.setattr(usage.settings, "anthropic_budget_usd", 5.0)
    monkeypatch.setattr(usage, "spent", lambda: 4.99)
    assert usage.budget_ok() is True
    monkeypatch.setattr(usage, "spent", lambda: 5.0)
    assert usage.budget_ok() is False
    monkeypatch.setattr(usage.settings, "anthropic_budget_usd", 0.0)
    assert usage.budget_ok() is True  # 0 = sin tope


def test_budget_blocks_spending_if_database_fails(monkeypatch) -> None:
    monkeypatch.setattr(usage.settings, "anthropic_budget_usd", 5.0)

    def broken():
        raise RuntimeError("base caída")

    monkeypatch.setattr(usage, "spent", broken)
    assert usage.budget_ok() is False


def test_records_anthropic_and_langchain_usage(monkeypatch) -> None:
    calls = []
    monkeypatch.setattr(usage, "record", lambda *a, **k: calls.append((a, k)))
    usage.record_anthropic("redaccion", SimpleNamespace(input_tokens=1200, output_tokens=300, cache_read_input_tokens=800, cache_creation_input_tokens=0))
    usage.record_langchain("agente", {"input_tokens": 7000, "output_tokens": 40, "input_token_details": {"cache_read": 6000}})
    assert calls[0][0] == ("redaccion", 1200, 300, 800, 0)
    assert calls[1][0] == ("agente", 1000, 40, 6000, 0)

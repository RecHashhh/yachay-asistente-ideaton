import asyncio
import json
from contextlib import asynccontextmanager
from decimal import Decimal

from prometheus_client import REGISTRY
import pytest

from app import graph as graph_module
from app.config import Settings
from app.telemetry import (
    estimate_anthropic_cost_usd,
    measure_anthropic_call,
    record_anthropic_call,
    record_chat_completion,
    request_telemetry,
    render_metrics,
    set_chat_result,
)


RATES = json.dumps({
    "claude-haiku-5-5": {
        "base": {"input": 0.10, "output": 0.50, "cache_write": 0.125, "cache_read": 0.01},
        "over_100k": {"input": 0.50, "output": 2.50, "cache_write": 0.625, "cache_read": 0.05},
    }
})


def test_estimates_cost_from_uncached_cache_write_and_cache_read_tokens():
    cost = estimate_anthropic_cost_usd(
        "claude-haiku-5-5",
        {
            "input_tokens": 80,
            "cache_creation_input_tokens": 10,
            "cache_read_input_tokens": 10,
            "output_tokens": 20,
        },
        RATES,
    )

    assert cost == Decimal("0.00001935")


def test_uses_long_context_price_tier_from_total_input_tokens():
    cost = estimate_anthropic_cost_usd(
        "claude-haiku-5-5",
        {"input_tokens": 100_001, "output_tokens": 0},
        RATES,
    )

    assert cost == Decimal("0.0500005")


def test_empty_compose_price_override_falls_back_to_configured_default():
    assert '"claude-haiku-5-5"' in Settings(anthropic_pricing_json="").anthropic_pricing_json


def test_unknown_model_price_is_unavailable_not_zero():
    assert estimate_anthropic_cost_usd(
        "another-model", {"input_tokens": 0, "output_tokens": 0}, RATES
    ) is None


def test_records_request_usage_calls_and_chat_flow_without_user_labels():
    with request_telemetry() as usage:
        record_anthropic_call(
            "claude-haiku-5-5",
            "intent_classification",
            0.12,
            {"input_tokens": 80, "output_tokens": 20},
            pricing_json=RATES,
        )
        record_chat_completion(
            "ROUTE_REQUEST",
            "ok",
            0.30,
            first_event_seconds=0.04,
        )

    assert usage.anthropic_calls == 1
    assert usage.input_tokens == 80
    assert usage.output_tokens == 20
    assert usage.estimated_cost_usd == Decimal("0.000018")
    assert usage.price_configured is True
    metrics = render_metrics().decode("utf-8")
    assert 'intent="route_request"' in metrics
    assert "sessionId" not in metrics
    assert "ROUTE_REQUEST" not in metrics


def test_anthropic_failure_is_counted_and_unknown_price_stays_unconfigured():
    with request_telemetry() as usage:
        record_anthropic_call(
            "unknown-model", "tool_selection", 0.4, None, outcome="error", pricing_json=RATES
        )
        record_chat_completion("document_search", "error", 0.5)

    assert usage.anthropic_calls == 1
    assert usage.failed_anthropic_calls == 1
    assert usage.estimated_cost_usd is None
    assert usage.price_configured is False


@pytest.mark.asyncio
async def test_measured_anthropic_call_records_usage_and_returns_response():
    class Response:
        usage_metadata = {"input_tokens": 80, "output_tokens": 20}

    async def request():
        return Response()

    with request_telemetry() as usage:
        response = await measure_anthropic_call("claude-haiku-5-5", "tool_selection", request())

    assert isinstance(response, Response)
    assert usage.anthropic_calls == 1
    assert usage.input_tokens == 80
    assert usage.output_tokens == 20
    assert usage.estimated_cost_usd == Decimal("0.000018")


@pytest.mark.asyncio
async def test_measured_anthropic_call_records_failed_request():
    async def request():
        raise TimeoutError("provider timeout")

    with request_telemetry() as usage:
        with pytest.raises(TimeoutError):
            await measure_anthropic_call("claude-haiku-5-5", "intent_classification", request())

    assert usage.anthropic_calls == 1
    assert usage.failed_anthropic_calls == 1


@pytest.mark.asyncio
async def test_graph_run_records_intent_outcome_and_first_sse_event(monkeypatch):
    @asynccontextmanager
    async def no_lock(_session_id):
        yield

    async def fake_astream(_state, stream_mode):
        assert stream_mode == "custom"
        set_chat_result("ROUTE_REQUEST", "ok")
        yield {"type": "step"}
        await asyncio.sleep(0.01)
        yield {"type": "done"}

    monkeypatch.setattr(graph_module, "conversation_lock", no_lock)
    monkeypatch.setattr(graph_module.graph, "astream", fake_astream)
    recorded = []
    original_record = graph_module.record_chat_completion

    def capture_record(*args, **kwargs):
        recorded.append((args, kwargs))
        original_record(*args, **kwargs)

    monkeypatch.setattr(graph_module, "record_chat_completion", capture_record)
    before_requests = REGISTRY.get_sample_value(
        "yachay_chat_requests_total", {"intent": "route_request", "outcome": "success"}
    ) or 0
    before_first_event = REGISTRY.get_sample_value(
        "yachay_chat_time_to_first_event_seconds_count", {"intent": "route_request"}
    ) or 0

    events = [event async for event in graph_module.run("ruta", "es", [], "telemetry-test")]

    assert [event["type"] for event in events] == ["step", "done"]
    assert len(recorded) == 1
    args, kwargs = recorded[0]
    assert args[:2] == ("route_request", "success")
    assert args[2] >= kwargs["first_event_seconds"] > 0
    assert REGISTRY.get_sample_value(
        "yachay_chat_requests_total", {"intent": "route_request", "outcome": "success"}
    ) == before_requests + 1, render_metrics().decode("utf-8")
    assert REGISTRY.get_sample_value(
        "yachay_chat_time_to_first_event_seconds_count", {"intent": "route_request"}
    ) == before_first_event + 1

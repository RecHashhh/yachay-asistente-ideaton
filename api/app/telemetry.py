"""Low-cardinality operational metrics for the API, SSE chat, maps and Anthropic."""

from __future__ import annotations

import json
import time
from collections.abc import Mapping
from contextlib import contextmanager
from contextvars import ContextVar
from dataclasses import dataclass
from decimal import Decimal, InvalidOperation
from typing import Any, Iterator

from prometheus_client import CONTENT_TYPE_LATEST, Counter, Gauge, Histogram, generate_latest

from .config import settings

HTTP_REQUESTS = Counter(
    "yachay_http_requests_total", "HTTP requests handled by the Yachay API.", ["method", "route", "status_class"]
)
HTTP_DURATION = Histogram(
    "yachay_http_request_duration_seconds", "HTTP request duration, including the full SSE stream.", ["method", "route"]
)
HTTP_IN_FLIGHT = Gauge("yachay_http_requests_in_flight", "HTTP requests currently being served.")
CHAT_REQUESTS = Counter("yachay_chat_requests_total", "Completed chat flows.", ["intent", "outcome"])
CHAT_DURATION = Histogram("yachay_chat_duration_seconds", "End-to-end chat flow duration.", ["intent"])
CHAT_FIRST_EVENT = Histogram("yachay_chat_time_to_first_event_seconds", "Time until first SSE event.", ["intent"])
CHAT_LLM_CALLS = Counter("yachay_chat_anthropic_calls_total", "Anthropic calls grouped by chat intent.", ["intent", "outcome"])
CHAT_TOKENS = Counter("yachay_chat_anthropic_tokens_total", "Anthropic tokens grouped by chat intent.", ["intent", "direction"])
CHAT_COST = Counter("yachay_chat_estimated_cost_usd_total", "Estimated Anthropic cost grouped by chat intent.", ["intent"])
CHAT_COST_UNKNOWN = Counter("yachay_chat_cost_unconfigured_total", "Chat flows with calls that lack a configured model price.", ["intent"])
ANTHROPIC_CALLS = Counter(
    "yachay_anthropic_requests_total", "Anthropic API calls.", ["model", "operation", "outcome"]
)
ANTHROPIC_DURATION = Histogram(
    "yachay_anthropic_request_duration_seconds", "Anthropic request duration.", ["model", "operation"]
)
ANTHROPIC_TOKENS = Counter(
    "yachay_anthropic_tokens_total", "Anthropic token usage by billing category.", ["model", "operation", "direction"]
)
ANTHROPIC_COST = Counter(
    "yachay_anthropic_estimated_cost_usd_total", "Estimated Anthropic API cost.", ["model", "operation"]
)
ANTHROPIC_COST_UNKNOWN = Counter(
    "yachay_anthropic_cost_unconfigured_total", "Anthropic calls with no matching price configuration.", ["model", "operation"]
)
STREAM_ERRORS = Counter("yachay_sse_errors_total", "Errors emitted after an SSE response has started.", ["component"])
GEO_OPERATIONS = Counter("yachay_geo_operations_total", "Geographic operations grouped by outcome.", ["operation", "outcome"])
GEO_DURATION = Histogram("yachay_geo_operation_duration_seconds", "Geographic operation duration.", ["operation", "outcome"])

_INTENTS = {
    "LOCATION_SEARCH": "location_search",
    "MAP_MARKER": "map_marker",
    "ROUTE_REQUEST": "route_request",
    "DOCUMENT_SEARCH": "document_search",
    "MIXED_REQUEST": "mixed_request",
    "FOLLOW_UP": "follow_up",
    "GENERAL_CHAT": "general_chat",
    "location_search": "location_search",
    "route_request": "route_request",
    "map_marker": "map_marker",
    "search": "location_search",
    "marker": "map_marker",
    "route": "route_request",
    "document_search": "document_search",
    "mixed_request": "mixed_request",
    "follow_up": "follow_up",
    "general_chat": "general_chat",
    "map_search": "location_search",
    "retrieve": "document_search",
    "procedure": "document_search",
    "smalltalk": "general_chat",
    "salud": "location_search",
}
_OUTCOMES = {
    "ok": "success",
    "success": "success",
    "respuesta": "success",
    "respuesta_sin_marcas": "success",
    "respuesta_no_verificada": "success",
    "lugar": "success",
    "ambiguous": "ambiguous",
    "aclaracion": "clarification",
    "clarification": "clarification",
    "not_found": "not_found",
    "route_unavailable": "unavailable",
    "unavailable": "unavailable",
    "error": "error",
    "sin_fuente": "no_source",
    "no_source": "no_source",
    "fuera_de_dominio": "out_of_domain",
    "successfully_completed": "success",
}
_OPERATIONS = {"intent_classification", "tool_selection", "answer_generation", "smalltalk", "other"}
_GEO_OPERATIONS = {"search", "route", "marker"}
_DIRECTIONS = {"input", "cache_write", "cache_read", "output"}
@dataclass
class RequestTelemetry:
    anthropic_calls: int = 0
    failed_anthropic_calls: int = 0
    input_tokens: int = 0
    output_tokens: int = 0
    cache_write_tokens: int = 0
    cache_read_tokens: int = 0
    estimated_cost_usd: Decimal | None = Decimal(0)
    price_configured: bool = True
    first_event_seconds: float | None = None
    intent: str = "unknown"
    outcome: str = "error"


_current_request: ContextVar[RequestTelemetry | None] = ContextVar("yachay_request_telemetry", default=None)


@contextmanager
def request_telemetry() -> Iterator[RequestTelemetry]:
    """Aggregate model usage for one graph execution without retaining user content or identifiers."""
    aggregate = RequestTelemetry()
    token = _current_request.set(aggregate)
    try:
        yield aggregate
    finally:
        _current_request.reset(token)


def _field(value: Any, name: str, default: Any = 0) -> Any:
    if isinstance(value, Mapping):
        return value.get(name, default)
    return getattr(value, name, default)


def _response_usage(response: Any) -> Any:
    if isinstance(response, Mapping) and "raw" in response:
        response = response.get("raw")
    return _field(response, "usage_metadata", None) or _field(response, "usage", None)


async def measure_anthropic_call(model: str, operation: str, awaitable: Any) -> Any:
    """Await one provider call and record its latency, usage and configured cost estimate."""
    started = time.perf_counter()
    try:
        response = await awaitable
    except Exception:
        record_anthropic_call(model, operation, time.perf_counter() - started, outcome="error")
        raise
    record_anthropic_call(model, operation, time.perf_counter() - started, _response_usage(response))
    return response


def _usage_counts(usage: Any) -> dict[str, int]:
    if usage is None:
        return {key: 0 for key in ("input", "cache_write", "cache_read", "output")}
    details = _field(usage, "input_token_details", {}) or {}
    values = {
        "input": _field(usage, "input_tokens", 0),
        "cache_write": _field(usage, "cache_creation_input_tokens", _field(details, "cache_creation", 0)),
        "cache_read": _field(usage, "cache_read_input_tokens", _field(details, "cache_read", 0)),
        "output": _field(usage, "output_tokens", 0),
    }
    normalized: dict[str, int] = {}
    for key, value in values.items():
        try:
            normalized[key] = max(0, int(value or 0))
        except (TypeError, ValueError):
            normalized[key] = 0
    return normalized


def estimate_anthropic_cost_usd(model: str, usage: Any, pricing_json: str | Mapping[str, Any]) -> Decimal | None:
    """Return a cache-aware estimate using USD/MTok, or None when the model lacks a complete price."""
    try:
        pricing = json.loads(pricing_json) if isinstance(pricing_json, str) else pricing_json
        rates_by_tier = pricing.get(model) if isinstance(pricing, Mapping) else None
        if not isinstance(rates_by_tier, Mapping):
            return None
        counts = _usage_counts(usage)
        total_input = counts["input"] + counts["cache_write"] + counts["cache_read"]
        tier = rates_by_tier.get("over_100k") if total_input > 100_000 else rates_by_tier.get("base")
        if not isinstance(tier, Mapping):
            return None
        cost = Decimal(0)
        for kind, count in counts.items():
            if not count:
                continue
            rate = Decimal(str(tier[kind]))
            if not rate.is_finite() or rate < 0:
                return None
            cost += Decimal(count) * rate / Decimal(1_000_000)
        return cost
    except (KeyError, TypeError, ValueError, InvalidOperation, json.JSONDecodeError):
        return None


def _intent_label(value: str | None) -> str:
    return _INTENTS.get(str(value or ""), "unknown")


def _outcome_label(value: str | None) -> str:
    return _OUTCOMES.get(str(value or ""), "other")


def _operation_label(value: str | None) -> str:
    return value if value in _OPERATIONS else "other"


def _request_usage() -> RequestTelemetry | None:
    return _current_request.get()


def record_anthropic_call(
    model: str,
    operation: str,
    duration_seconds: float,
    usage: Any = None,
    *,
    outcome: str = "success",
    pricing_json: str | Mapping[str, Any] | None = None,
) -> Decimal | None:
    model_label = model[:80] or "unknown"
    operation_label = _operation_label(operation)
    outcome_label = _outcome_label(outcome)
    counts = _usage_counts(usage)
    rates = settings.anthropic_pricing_json if pricing_json is None else pricing_json
    cost = None if outcome_label == "error" and usage is None else estimate_anthropic_cost_usd(model_label, usage, rates)

    ANTHROPIC_CALLS.labels(model_label, operation_label, outcome_label).inc()
    ANTHROPIC_DURATION.labels(model_label, operation_label).observe(max(0, duration_seconds))
    for direction in _DIRECTIONS:
        if counts[direction]:
            ANTHROPIC_TOKENS.labels(model_label, operation_label, direction).inc(counts[direction])
    if cost is None:
        ANTHROPIC_COST_UNKNOWN.labels(model_label, operation_label).inc()
    else:
        ANTHROPIC_COST.labels(model_label, operation_label).inc(float(cost))

    aggregate = _request_usage()
    if aggregate is not None:
        aggregate.anthropic_calls += 1
        aggregate.failed_anthropic_calls += int(outcome_label == "error")
        aggregate.input_tokens += counts["input"] + counts["cache_write"] + counts["cache_read"]
        aggregate.output_tokens += counts["output"]
        aggregate.cache_write_tokens += counts["cache_write"]
        aggregate.cache_read_tokens += counts["cache_read"]
        if cost is None:
            aggregate.price_configured = False
            aggregate.estimated_cost_usd = None
        elif aggregate.estimated_cost_usd is not None:
            aggregate.estimated_cost_usd += cost
    return cost


def record_chat_completion(
    intent: str | None,
    outcome: str | None,
    duration_seconds: float,
    *,
    first_event_seconds: float | None = None,
) -> None:
    intent_label = _intent_label(intent)
    outcome_label = _outcome_label(outcome)
    CHAT_REQUESTS.labels(intent_label, outcome_label).inc()
    CHAT_DURATION.labels(intent_label).observe(max(0, duration_seconds))
    if first_event_seconds is not None:
        CHAT_FIRST_EVENT.labels(intent_label).observe(max(0, first_event_seconds))
    aggregate = _request_usage()
    if aggregate is None:
        return
    CHAT_LLM_CALLS.labels(intent_label, "error" if aggregate.failed_anthropic_calls else "success").inc(aggregate.anthropic_calls)
    if aggregate.input_tokens:
        CHAT_TOKENS.labels(intent_label, "input").inc(aggregate.input_tokens)
    if aggregate.output_tokens:
        CHAT_TOKENS.labels(intent_label, "output").inc(aggregate.output_tokens)
    if aggregate.cache_read_tokens:
        CHAT_TOKENS.labels(intent_label, "cache_read").inc(aggregate.cache_read_tokens)
    if aggregate.cache_write_tokens:
        CHAT_TOKENS.labels(intent_label, "cache_write").inc(aggregate.cache_write_tokens)
    if aggregate.price_configured and aggregate.estimated_cost_usd is not None:
        CHAT_COST.labels(intent_label).inc(float(aggregate.estimated_cost_usd))
    elif aggregate.anthropic_calls:
        CHAT_COST_UNKNOWN.labels(intent_label).inc()


def set_chat_result(intent: str | None, outcome: str | None) -> None:
    aggregate = _request_usage()
    if aggregate is not None:
        aggregate.intent = _intent_label(intent)
        aggregate.outcome = _outcome_label(outcome)


def record_sse_error(component: str) -> None:
    STREAM_ERRORS.labels(component if component in {"chat", "anthropic", "map", "rag"} else "other").inc()


def record_geo_operation(operation: str, outcome: str, duration_seconds: float) -> None:
    operation_label = operation if operation in _GEO_OPERATIONS else "other"
    outcome_label = _outcome_label(outcome)
    GEO_OPERATIONS.labels(operation_label, outcome_label).inc()
    GEO_DURATION.labels(operation_label, outcome_label).observe(max(0, duration_seconds))


def record_http_request(method: str, route: str, status_code: int, duration_seconds: float) -> None:
    status_class = f"{status_code // 100}xx"
    HTTP_REQUESTS.labels(method[:12], route[:120], status_class).inc()
    HTTP_DURATION.labels(method[:12], route[:120]).observe(max(0, duration_seconds))


def metrics_content() -> tuple[bytes, str]:
    return generate_latest(), CONTENT_TYPE_LATEST


def render_metrics() -> bytes:
    """Expose the current registry for tests and the `/metrics` endpoint."""
    return generate_latest()


class MetricsMiddleware:
    """Pure ASGI middleware so request duration includes streaming response bodies."""

    def __init__(self, app: Any):
        self.app = app

    async def __call__(self, scope: dict[str, Any], receive: Any, send: Any) -> None:
        if scope.get("type") != "http" or scope.get("path") == "/metrics":
            await self.app(scope, receive, send)
            return

        method = str(scope.get("method") or "GET")
        start = time.perf_counter()
        status_code = 500
        HTTP_IN_FLIGHT.inc()

        async def measured_send(message: dict[str, Any]) -> None:
            nonlocal status_code
            if message.get("type") == "http.response.start":
                status_code = int(message.get("status", 500))
            await send(message)

        try:
            await self.app(scope, receive, measured_send)
        finally:
            route = getattr(scope.get("route"), "path", "/unmatched")
            record_http_request(method, route, status_code, time.perf_counter() - start)
            HTTP_IN_FLIGHT.dec()

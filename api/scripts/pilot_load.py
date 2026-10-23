"""Small async SSE load probe for an already running Yachay API."""

from __future__ import annotations

import argparse
import asyncio
import json
import math
import re
import time
import uuid
from dataclasses import asdict, dataclass
from typing import Any

import httpx

DEFAULT_QUERY = "¿Dónde queda Plaza Las Manuelas?"
DEFAULT_ROUTE_QUERY = "Desde Plaza Las Manuelas a Edificio SENESCYT"


@dataclass
class Sample:
    status_code: int
    duration_seconds: float
    first_event_seconds: float | None
    success: bool
    event_types: list[str]
    error: str | None = None
    route_coordinate_count: int = 0


def percentile(values: list[float], percent: float) -> float | None:
    if not values:
        return None
    ordered = sorted(values)
    index = (len(ordered) - 1) * percent / 100
    lower = math.floor(index)
    upper = math.ceil(index)
    if lower == upper:
        return ordered[lower]
    return ordered[lower] + (ordered[upper] - ordered[lower]) * (index - lower)


def summarize(users: int, samples: list[Sample], wall_seconds: float) -> dict[str, Any]:
    durations = [sample.duration_seconds for sample in samples]
    first_events = [sample.first_event_seconds for sample in samples if sample.first_event_seconds is not None]
    successes = sum(sample.success for sample in samples)
    return {
        "users": users,
        "requests": len(samples),
        "successes": successes,
        "errors": len(samples) - successes,
        "error_rate": (len(samples) - successes) / len(samples) if samples else 0,
        "wall_seconds": wall_seconds,
        "requests_per_second": len(samples) / wall_seconds if wall_seconds else 0,
        "latency_seconds": {"p50": percentile(durations, 50), "p95": percentile(durations, 95), "p99": percentile(durations, 99)},
        "first_event_seconds": {"p50": percentile(first_events, 50), "p95": percentile(first_events, 95)},
        "event_types": sorted({event_type for sample in samples for event_type in sample.event_types}),
    }


def metric_totals(text: str) -> dict[str, float]:
    wanted = {
        "yachay_anthropic_requests_total",
        "yachay_anthropic_estimated_cost_usd_total",
        "yachay_anthropic_tokens_total",
        "yachay_chat_requests_total",
        "yachay_sse_errors_total",
    }
    totals = {name: 0.0 for name in wanted}
    for line in text.splitlines():
        match = re.match(r"^([a-zA-Z_:][a-zA-Z0-9_:]*)(?:\{[^}]*\})?\s+([0-9.eE+-]+)$", line)
        if match and match.group(1) in wanted:
            totals[match.group(1)] += float(match.group(2))
    return totals


def route_coordinate_count(event: dict[str, Any]) -> int:
    payload = event.get("payload") or {}
    for feature in payload.get("features") or []:
        properties = feature.get("properties") or {}
        if feature.get("id") != "route" and properties.get("kind") != "route":
            continue
        geometry = feature.get("geometry") or {}
        coordinates = geometry.get("coordinates") or []
        if geometry.get("type") == "LineString":
            return len(coordinates)
        if geometry.get("type") == "MultiLineString":
            return sum(len(line) for line in coordinates)
    return 0


async def request_once(
    client: httpx.AsyncClient, url: str, query: str, timeout: float, require_route: bool = False,
    session_id: str | None = None, history: list[dict[str, str]] | None = None,
) -> Sample:
    start = time.perf_counter()
    first_event: float | None = None
    event_types: list[str] = []
    route_points = 0
    error: str | None = None
    status_code = 0
    try:
        async with client.stream(
            "POST", url,
            json={
                "sessionId": session_id or f"pilot-{uuid.uuid4().hex}",
                "message": query,
                "lang": "es",
                "history": history or [],
            },
            timeout=timeout,
        ) as response:
            status_code = response.status_code
            if status_code >= 400:
                error = f"http_{status_code}"
            async for line in response.aiter_lines():
                if not line.startswith("data: "):
                    continue
                if first_event is None:
                    first_event = time.perf_counter() - start
                try:
                    event = json.loads(line[6:])
                except json.JSONDecodeError:
                    error = "invalid_sse_json"
                    continue
                kind = str(event.get("type", "unknown"))
                event_types.append(kind)
                if kind == "map.route":
                    route_points = route_coordinate_count(event)
                    if route_points < 2:
                        error = "route_geometry_missing"
                if kind in {"error", "map.error"}:
                    error = kind
    except (httpx.HTTPError, TimeoutError) as exc:
        error = type(exc).__name__
    duration = time.perf_counter() - start
    success = status_code == 200 and "done" in event_types and error is None
    if require_route and route_points < 2:
        success = False
        error = error or "route_geometry_missing"
    return Sample(status_code, duration, first_event, success, event_types, error, route_points)


async def ambiguous_route_flow(client: httpx.AsyncClient, url: str, timeout: float) -> Sample:
    session_id = f"pilot-{uuid.uuid4().hex}"
    first = await request_once(
        client, url, "Plaza Las Manuelas hasta SENESCYT", timeout, session_id=session_id,
    )
    follow_up = await request_once(
        client, url, "El edificio", timeout, require_route=True, session_id=session_id,
        history=[
            {"role": "user", "content": "Plaza Las Manuelas hasta SENESCYT"},
            {"role": "assistant", "content": "¿Edificio SENESCYT o Parada SENESCYT?"},
        ],
    )
    ambiguity_received = "map.ambiguity" in first.event_types
    error = first.error or follow_up.error or (None if ambiguity_received else "ambiguity_event_missing")
    success = first.success and ambiguity_received and follow_up.success
    return Sample(
        status_code=follow_up.status_code if follow_up.status_code else first.status_code,
        duration_seconds=first.duration_seconds + follow_up.duration_seconds,
        first_event_seconds=first.first_event_seconds,
        success=success and error is None,
        event_types=first.event_types + follow_up.event_types,
        error=error,
        route_coordinate_count=follow_up.route_coordinate_count,
    )


async def run_level(
    target: str, query: str, users: int, iterations: int, timeout: float,
    include_samples: bool = False, require_route: bool = False, scenario: str = "location",
) -> dict[str, Any]:
    limits = httpx.Limits(max_connections=users, max_keepalive_connections=users)
    async with httpx.AsyncClient(limits=limits) as client:
        async def metrics() -> dict[str, float] | None:
            try:
                response = await client.get(f"{target.rstrip('/')}/metrics", timeout=timeout)
                response.raise_for_status()
                return metric_totals(response.text)
            except httpx.HTTPError:
                return None

        before = await metrics()
        async def one() -> list[Sample]:
            samples = []
            for _ in range(iterations):
                if scenario == "ambiguity_followup":
                    samples.append(await ambiguous_route_flow(client, f"{target.rstrip('/')}/chat", timeout))
                else:
                    samples.append(await request_once(
                        client, f"{target.rstrip('/')}/chat", query, timeout, require_route,
                    ))
            return samples

        started = time.perf_counter()
        grouped = await asyncio.gather(*(one() for _ in range(users)))
        samples = [sample for group in grouped for sample in group]
        wall = time.perf_counter() - started
        after = await metrics()
    delta = None if before is None or after is None else {key: after[key] - before[key] for key in before}
    result = summarize(users, samples, wall) | {"anthropic_and_application_metric_delta": delta}
    if include_samples:
        result["samples"] = [asdict(sample) for sample in samples]
    return result


async def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--target", default="http://127.0.0.1:8000", help="Base API URL (default: local Compose API)")
    parser.add_argument("--users", type=int, nargs="+", default=[1, 5, 10, 20])
    parser.add_argument("--iterations", type=int, default=1, help="Sequential requests per simulated user")
    parser.add_argument("--timeout", type=float, default=60)
    parser.add_argument(
        "--scenario", choices=("location", "route", "ambiguity_followup"), default="location",
        help="Map lookup, resolved route, or persisted ambiguity follow-up flow",
    )
    parser.add_argument("--query", help="Custom request; requires --allow-anthropic because it may call the provider")
    parser.add_argument("--include-samples", action="store_true", help="Include each individual request record")
    parser.add_argument("--allow-anthropic", action="store_true", help="Allow requests that may call Anthropic and incur cost")
    args = parser.parse_args()
    if args.users and min(args.users) < 1 or args.iterations < 1:
        parser.error("users and iterations must be positive")
    if args.query and args.scenario == "ambiguity_followup":
        parser.error("ambiguity_followup uses a fixed two-turn flow; choose another scenario for a custom query")
    query = args.query or (DEFAULT_ROUTE_QUERY if args.scenario == "route" else DEFAULT_QUERY)
    if args.query and not args.allow_anthropic:
        parser.error("this query may incur Anthropic usage; pass --allow-anthropic explicitly")
    results = []
    for users in args.users:
        results.append(await run_level(
            args.target, query, users, args.iterations, args.timeout,
            args.include_samples, args.scenario == "route",
            args.scenario,
        ))
    label = (
        "Plaza Las Manuelas hasta SENESCYT → El edificio"
        if args.scenario == "ambiguity_followup" else query
    )
    print(json.dumps({
        "target": args.target,
        "scenario": args.scenario,
        "query": label,
        "results": results,
    }, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    asyncio.run(main())

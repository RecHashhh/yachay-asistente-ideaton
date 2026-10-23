# Piloto operativo: Implementation Plan

> Run each task test-first. Preserve existing workspace changes and never commit or publish without a separate request.

**Goal:** Give the current Agente Yachay flow observable request errors, latency, Anthropic usage/cost, SSE delivery, and concurrency in a local Compose pilot.

**Architecture:** A small Python telemetry module uses `prometheus-client`; FastAPI middleware observes HTTP/SSE, graph/agent boundaries record chat and Anthropic measurements, and a request-scoped accumulator separates chat-level costs. Compose's optional `pilot` profile provisions Prometheus/Grafana. An `httpx` script drives realistic SSE traffic at 1/5/10/20 users without calling Anthropic by default.

**Spec:** `docs/superpowers/specs/2026-10-23-operational-pilot-observability.md`

## Constraints

- Do not change intent routing, tool semantics, map data, or RAG behavior.
- Do not send user text, IPs, session IDs, geometry, or place IDs to metrics labels/logs.
- `/metrics` must not be exposed through the public ingress; current Compose binds API to loopback.
- Cost is an estimate from configurable per-model price data and actual token usage; unknown price stays unknown.
- The pilot metrics registry is single-worker; keep Compose/Uvicorn at one worker.
- A default load run uses only verified map lookup; Anthropic calls require an explicit opt-in flag.
- No code file may exceed 1000 lines; no commits/staging.

## Review focus

- Metric labels remain bounded under arbitrary URL paths and user messages.
- HTTP 200 with SSE `error` increments application error metrics.
- Cancellation/disconnect does not leak in-flight gauges or request context.
- Anthropic stream failures still record a failed call and completed tokens where available.
- Missing/unknown prices cannot be reported as a zero-cost API request.
- Concurrent requests use distinct sessions and the graph's existing per-session lock does not serialize unrelated users.

## Task 1 — Pricing and request telemetry primitives

**Files:** Add `api/app/telemetry.py`; modify `api/app/config.py`, `api/requirements.txt`, `.env.example`, `api/.env.example`; add `api/tests/test_telemetry.py`.

- [ ] Test low-cardinality metrics registration, request aggregation, error outcome, token/cache usage, price calculation below/above 100k, and unknown-price behavior.
- [ ] Run focused tests and observe the expected import/behavior failures.
- [ ] Implement counters, histograms, in-flight gauge, context-scoped request aggregate, tariff parsing and cache-aware cost estimate.
- [ ] Run focused tests and verify Prometheus exposition contains no prompt/session data.

## Task 2 — HTTP, SSE, chat and Anthropic instrumentation

**Files:** Modify `api/app/main.py`, `api/app/graph.py`, `api/app/agent.py`; add API tests.

- [ ] Test HTTP duration/status/inflight collection and route-template labels, SSE error classification, final chat outcomes, and request-aggregate cleanup.
- [ ] Run tests red, then implement metrics middleware and a protected-from-cardinality `/metrics` endpoint.
- [ ] Wrap Anthropic structured classification, each tool-selection turn, direct message create, and streaming generation with success/failure/latency/token accounting.
- [ ] Measure full SSE lifetime, first event, chat intent/outcome, and domain errors without changing event payload compatibility.
- [ ] Run focused tests plus existing agent/API suites.

## Task 3 — Database and Compose deployment of telemetry

**Files:** Modify `docker-compose.yml`; add `monitoring/prometheus.yml`, Grafana datasource/provisioning/dashboard; add the local pricing/metrics documentation.

- [ ] Validate config structure and model that the default Compose stack remains unchanged unless `--profile pilot` is enabled.
- [ ] Add loopback-only Grafana, internal Prometheus scrape, persistent Prometheus volume, and provisioning.
- [ ] Configure Grafana charts for request rate/errors, SSE latency/inflight, Anthropic calls/tokens/cost, and geo outcomes.
- [ ] Validate Compose configuration and provisioned dashboard JSON; boot the profile when Docker is available.

## Task 4 — Concurrent SSE load runner

**Files:** Add `api/scripts/pilot_load.py`; add load-runner unit tests or testable helper module; update operator docs.

- [ ] Test event parsing, failure handling, percentiles, and prohibition on billable queries without `--allow-anthropic`.
- [ ] Run tests red and implement async bounded concurrency using existing `httpx`.
- [ ] Report users/iterations, throughput, error rate, p50/p95/p99, first-event latency and SSE event outcomes as JSON and console text.
- [ ] Ensure generated session IDs are distinct and optional cleanup only deletes rows with its test-run prefix.
- [ ] Run 1/5/10/20 user levels on real Compose API/PostGIS with Anthropic key blank; report limits rather than inventing an SLO.

## Task 5 — Regression and production-readiness audit

- [ ] Run backend suite, frontend suite/build, and static/format checks already configured by the project.
- [ ] Run Compose default and `pilot` profile validation; verify scrape target and Grafana dashboard query series.
- [ ] Inspect `/metrics` output for sensitive/high-cardinality labels and confirm route-level `error` counts.
- [ ] Document measured concurrency, latency, errors, and whether token costs were configured; distinguish live Anthropic from mocked/excluded calls.
- [ ] Recheck code size (<1000 lines), migration/startup behavior, and dirty workspace preservation.

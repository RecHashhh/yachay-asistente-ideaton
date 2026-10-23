# Enrutamiento geográfico conversacional Implementation Plan

> **For agentic workers:** Execute this plan task by task with the TDD cycle. Keep unrelated workspace changes intact.

**Goal:** Route free-form location and route requests through the existing geographic engine, retain pending clarifications per conversation, and preserve RAG behavior.

**Architecture:** Add a small domain router with deterministic fast paths and a validated Claude classifier fallback. Dispatch geographic operations to the existing PostGIS tool, store expiring pending operations by session, and adapt typed map events to the existing SSE/frontend contract.

**Tech Stack:** Python 3, FastAPI, Pydantic, existing LangChain Anthropic integration, PostgreSQL/PostGIS/pgRouting, pytest, React/TypeScript.

**Spec:** `docs/superpowers/specs/2026-10-22-geographic-tool-routing-design.md`

## Global Constraints

- Keep RAG and map services independent; the map database is authoritative for place identity and routing.
- Preserve existing endpoints and SSE clients through an adapter.
- Do not add mandatory dependencies or modify OSM records.
- Keep new source modules below 1000 lines and isolate pending state by conversation.
- Never send full geometry to Claude or let it calculate a route.
- Preserve user workspace changes and do not stage or commit them.

## Review Focus

- A typo in a place name must return verified candidates or ambiguity, never an invented match.
- A short clarification must resume only the matching pending operation and not leak across sessions.
- A route query without an origin must ask for one; it must not assume current location.
- Mixed map/document requests must still show valid map data when RAG has no evidence.
- Anthropic/tool failures must not be represented as official-document absence.

---

### Task 1: Intent model and local classifier

**Files:** Create `api/app/intent_router.py`; create `api/tests/test_intent_router.py`.

**Interfaces:** `classify_local(message, history_context=None) -> IntentDecision | None`; `IntentDecision` is a Pydantic model with intent, origin, destination, place, confidence, needs_clarification. Canonical intents are LOCATION_SEARCH, ROUTE_REQUEST, MAP_MARKER, DOCUMENT_SEARCH, MIXED_REQUEST, FOLLOW_UP, GENERAL_CHAT.

- [ ] Write parameterized tests for clear location, marker, route, document, mixed, and unrelated messages; include all route phrasings and spelling/diacritic variants from the specification.
- [ ] Run focused tests and confirm the new imports/API fail as expected.
- [ ] Implement normalization, entity extraction for explicit structures, configurable confidence thresholds, and schema validation.
- [ ] Add tests for malformed structured output, thresholds, and queries that must fall through for Claude interpretation.
- [ ] Run `cd api && pytest tests/test_intent_router.py -q`.

### Task 2: Pending map operation state

**Files:** Create `api/app/geo_conversation.py`; create `api/tests/test_geo_conversation.py`.

**Interfaces:** `get_pending(session_id)`, `set_pending(session_id, state)`, and `clear_pending(session_id)`; pending state stores intent, stable selected IDs, candidates, expected choice, and expiry.

- [ ] Write tests for destination disambiguation, origin disambiguation, resumption, independent sessions, unrelated-message invalidation, and expiry.
- [ ] Run focused tests and confirm expected failures.
- [ ] Implement a bounded, thread-safe TTL store keyed by existing conversation IDs.
- [ ] Run `cd api && pytest tests/test_geo_conversation.py -q`.

### Task 3: Intent orchestration and map/RAG dispatch

**Files:** Modify `api/app/graph.py`, `api/app/agent.py`, `api/app/config.py`; create `api/tests/test_geo_orchestration.py`.

**Interfaces:** The graph consumes `IntentDecision`; the agent exposes validated structured classification for uncertain requests and deterministic tool dispatch for clear map intents. Existing map action and RAG APIs remain intact.

- [ ] Add failing orchestration tests proving clear routes bypass RAG, ambiguous inputs use schema-validated classification, route follow-ups retain known endpoints, and mixed requests execute both tools.
- [ ] Implement local-first routing, Claude fallback using the supported current Anthropic integration, explicit geographic dispatch, clarification state, bounded tool loop, and controlled failures.
- [ ] Verify ambiguity never silently selects a candidate and missing origin prompts the user.
- [ ] Run focused tests and existing `api/tests/test_agent.py`.

### Task 4: Typed SSE map events and frontend compatibility

**Files:** Modify `api/app/events.py` or add `api/app/map_events.py`; modify `api/app/agent.py`, `api/app/graph.py`, `web/src/lib/types.ts`, `web/src/views/Chat.tsx`, and map rendering only as needed; add focused API/frontend tests.

- [ ] Test marker, route, ambiguity, and service-error event serialization while preserving legacy `map` and `clarify` support.
- [ ] Implement an adapter that keeps geometry out of Claude context and maps typed events into current frontend views.
- [ ] Add frontend tests for marker, route, candidate selection, update after clarification, and map error state.
- [ ] Run focused backend and frontend tests.

### Task 5: Regression and end-to-end verification

**Files:** Modify `api/tests/test_api.py`, `api/tests/test_maps_tool.py`, and `web/e2e/map-chat.spec.ts` as needed.

- [ ] Add regression cases for the specified utterances, independent sessions, unavailable routes, missing places, Anthropic exceptions, and unchanged document search.
- [ ] Run API suite, map integration tests where configured, frontend typecheck/build, and relevant browser tests where available.
- [ ] Exercise Plaza Las Manuelas to SENESCYT through ambiguity resolution and verify SSE geometry reaches the map component.
- [ ] Report Anthropic call counts for deterministic and classifier-assisted scenarios; document any external-service limitation.

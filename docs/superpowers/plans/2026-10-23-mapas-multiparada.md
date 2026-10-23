# Multi-stop map navigation implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Resolve nearby places deterministically and render a Google Maps link for one place, a two-point route, or an ordered multi-stop route.

**Architecture:** Extend the existing map tool contract with ordered intermediate stops and calculate each route leg with the existing PostGIS/pgRouting service. Preserve compact textual results while emitting role-tagged place and per-leg route features for Chat's existing map event; extract the FeatureCollection-to-MapView conversion into a testable helper, then render all legs and build a directions URL with ordered waypoints.

**Tech Stack:** Python, FastAPI, SQLAlchemy, PostGIS/pgRouting; React, TypeScript, GeoJSON, Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-23-mapas-multiparada-y-bootstrap-postgres-design.md`

## Global Constraints

- Never let the LLM calculate coordinates, distances, or route geometry; use database-backed services.
- Preserve existing one-origin/one-destination behavior and compact LLM-facing results.
- Resolve actual places from the campus database; never invent names or coordinates.
- Return at most three candidates when the requested place/reference is genuinely ambiguous.
- A single identified place uses a Google Maps search link; two or more ordered places use a directions link with origin, ordered waypoints, destination, and travel mode.
- An explicit go/route request is executed without an extra confirmation; a location-only question remains a pin with an optional route action.

## Review Focus

- A single place has no route roles; it must still get a search URL, not a directions URL.
- Waypoint order must survive LLM input, backend features, Chat parsing, and URL encoding.
- A failed route leg must not be silently omitted from a multi-stop link or total.
- Ambiguous destination/reference choices must remain capped at three and preserve the pending action.
- Google Maps links must encode coordinates with latitude before longitude and keep the walking/driving mode.

---

### Task 1: Backend ordered route legs and nearby resolution

**Files:**
- Modify: `api/app/maps_tool.py`
- Modify: `api/app/agent.py`
- Test: `api/tests/test_maps_tool.py`

**Interfaces:**
- Consumes: `MapActionInput` with `intent`, `origin`, `destination`, `category`, `reference`, `mode`.
- Produces: `MapActionInput.waypoints: list[str] = Field(default_factory=list)` in visit order, passed through the `agent.py` tool wrapper; route output with compact ordered stops and total distance/duration; feature roles `origin`, `waypoint`, `destination`; one route feature per successful leg with integer `leg_index` and leg metrics. Ambiguous place/reference results include no more than three candidate place features.

- [ ] **Step 1: Write failing backend tests**

Add `test_multi_stop_route_resolves_stops_in_visit_order`, `test_multi_stop_route_emits_one_feature_per_leg`, `test_multi_stop_route_fails_closed_when_any_leg_is_unavailable`, `test_nearby_returns_nearest_category_match_first`, and `test_ambiguous_nearby_reference_returns_at_most_three_map_candidates`. Assert the exact ordered IDs passed to `route_places`, each leg's `leg_index`, total metrics, no route URL/geometry after a failed leg, and that the ambiguous response includes three or fewer actual candidate features.

- [ ] **Step 2: Run the targeted tests and confirm feature failures**

Run: `cd api && PYTHONPATH=.:.. pytest tests/test_maps_tool.py -q`
Expected: failures for missing waypoints/multi-leg output and the three-candidate cap; no collection/import errors.

- [ ] **Step 3: Implement ordered backend routing and preserve compact result**

Add `waypoints` to `MapActionInput`; resolve all stop names through `_resolve`; route each adjacent pair using `route_places`; aggregate distances and durations only when every leg succeeds; emit UI-only place/leg features and compact ordered stop summaries. Keep nearby results sorted by database distance and cap ambiguity choices at three. Update the agent guidance to pass every stop in the user's order.

- [ ] **Step 4: Run backend unit tests**

Run: `cd api && PYTHONPATH=.:.. pytest tests/test_maps_tool.py tests/test_place_matching.py -q`
Expected: all targeted tests pass. Run `Mapas` PostGIS API integration tests when Docker/PostGIS is available.

### Task 2: Frontend route payload, geometry, and Google Maps URLs

**Files:**
- Modify: `web/src/lib/mapConversation.ts` (MapView types only)
- Create: `web/src/lib/mapPayload.ts`
- Modify: `web/src/views/Chat.tsx`
- Modify: `web/src/lib/googleMapsNavigation.ts`
- Modify: `web/src/components/GeoMap.tsx`
- Test: `web/src/lib/googleMapsNavigation.test.ts`
- Test: `web/src/lib/mapPayload.test.ts`
- Test: `web/e2e/map-chat.spec.ts`

**Interfaces:**
- Consumes: backend FeatureCollection place features with roles `origin`, `waypoint`, `destination`, `candidate`, and route features with `kind: "route"`, integer `leg_index`, and leg metrics.
- Produces: `mapViewFromPayload(payload: FeatureCollection<Geometry, Record<string, unknown>>): MapView`, with `MapView.places` in visit order and `MapView.route.segments: { geometry: LineString; distance_m: number; duration_s: number; mode: TravelMode; leg_index: number }[]` in leg order; `googleMapsNavigation(view, language)` returns a `search` URL for one place and a `dir` URL for a resolved route of at least two places.

- [ ] **Step 1: Write failing frontend tests**

Add `test_google_maps_link_for_single_place`, `test_google_maps_link_for_two_places`, `test_google_maps_link_preserves_ordered_waypoints`, and `test_map_payload_parses_multiple_legs_and_place_roles`. Assert that explicit routes are received as tool results and rendered without a client-side confirmation step.

- [ ] **Step 2: Run targeted tests and confirm expected failures**

Run: `cd web && npm test -- --run src/lib/googleMapsNavigation.test.ts src/lib/mapPayload.test.ts`
Expected: tests fail because route parsing/URL generation currently supports only one origin and one destination.

- [ ] **Step 3: Implement multi-stop view and URL generation**

Extract the current Chat payload parser into `mapPayload.ts`, parse route features by `leg_index`, map all place roles, render each `LineString`, and construct Google Maps directions URLs with ordered waypoint coordinates. Keep the existing single-location search URL and two-point URL unchanged. Do not create links for unresolved candidate-only payloads or partially failed routes.

- [ ] **Step 4: Verify frontend behavior**

Run: `cd web && npm run typecheck && npm test -- --run src/lib/googleMapsNavigation.test.ts src/lib/mapPayload.test.ts && npm run build`
Expected: typecheck/build exit 0 and targeted tests pass. Run `npm run test:e2e -- map-chat.spec.ts` when the local browser runner can start.

### Task 3: Whole map-flow regression

**Files:**
- Test: `api/tests/test_maps_tool.py`
- Test: `web/src/lib/googleMapsNavigation.test.ts`
- Test: `web/e2e/map-chat.spec.ts`

- [ ] **Step 1: Run the complete relevant suites**

Run backend map tests and the full frontend test/typecheck/build commands. When Docker is available, run `cd Mapas && docker compose --profile test run --rm test` and the map E2E.
Expected: single-stop, two-stop, multi-stop, proximity, and clarification cases pass; report environmental blockers explicitly.


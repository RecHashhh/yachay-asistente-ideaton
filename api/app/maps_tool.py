"""Compact LLM-facing adapter over the deterministic PostGIS map services."""

from __future__ import annotations

import json
from typing import Any, Literal

from pydantic import BaseModel, Field

from Mapas.app.db import SessionLocal
from Mapas.app.routing import route_places
from Mapas.app.search import get_place, nearby_places, search_places
from Mapas.app.osm import normalize_text


REFERENCE_PREFERENCES = {"las manuelas": "Plaza Las Manuelas"}


class MapActionInput(BaseModel):
    intent: Literal["search", "nearby", "route"] = Field(
        description="Operación determinista: buscar lugar, buscar cerca de una referencia o calcular ruta."
    )
    query: str | None = Field(default=None, description="Nombre, categoría o descripción que buscar.")
    category: str | None = Field(default=None, description="Categoría de lugar, por ejemplo restaurant, karaoke o entertainment.")
    reference: str | None = Field(default=None, description="Lugar de referencia para la búsqueda de proximidad.")
    radius_m: int = Field(default=800, ge=1, le=10000, description="Radio máximo de proximidad en metros; lo aplica PostGIS.")
    origin: str | None = Field(default=None, description="Nombre del origen para calcular una ruta.")
    destination: str | None = Field(default=None, description="Nombre del destino para calcular una ruta.")
    mode: Literal["walking", "driving"] = "walking"


def _compact_place(place: dict[str, Any]) -> dict[str, Any]:
    return {
        key: place[key]
        for key in ("id", "name", "display_name", "category", "subcategory", "score", "distance_m", "match")
        if place.get(key) is not None
    }


def _resolve(session: Any, query: str) -> tuple[dict[str, Any] | None, list[dict[str, Any]]]:
    candidates = search_places(session, query, limit=5)
    if not candidates:
        return None, []
    preferred_name = REFERENCE_PREFERENCES.get(normalize_text(query))
    if preferred_name:
        preferred = [item for item in candidates if normalize_text(item["display_name"]) == normalize_text(preferred_name)]
        if len(preferred) == 1:
            return preferred[0], []
    exact = [item for item in candidates if item.get("match") in {"exact_name", "exact_alias"}]
    if len(exact) == 1:
        return exact[0], []
    if len(exact) > 1:
        return None, exact
    if len(candidates) == 1:
        return candidates[0], []
    return None, candidates


def _place_feature(session: Any, place_id: str, role: str = "candidate") -> dict[str, Any] | None:
    place = get_place(session, place_id)
    if place is None:
        return None
    return {
        "type": "Feature",
        "id": place["id"],
        "geometry": place["geometry"],
        "properties": {
            "id": place["id"],
            "name": place["name"],
            "display_name": place["display_name"],
            "category": place["category"],
            "subcategory": place["subcategory"],
            "location": place["location"],
            "role": role,
        },
    }


def execute_map_action(**args: Any) -> tuple[dict[str, Any], dict[str, Any] | None]:
    """Run all geospatial reasoning in Python/PostGIS; return compact text and UI-only geometry."""
    intent = args["intent"]
    session = SessionLocal()
    try:
        if intent == "search":
            query = (args.get("query") or "").strip()
            if args.get("category"):
                # An explicit category asks for a list; a name/description query
                # must resolve to one place or return choices for clarification.
                candidates = search_places(session, query, category=args["category"], limit=5)
                status = "ok" if candidates else "not_found"
            else:
                selected, ambiguous = _resolve(session, query)
                candidates = [selected] if selected else ambiguous
                status = "ok" if selected else "ambiguous" if ambiguous else "not_found"
            features = [_place_feature(session, item["id"]) for item in candidates[:5]]
            return (
                {"status": status, "query": query, "results": [_compact_place(item) for item in candidates]},
                {"type": "FeatureCollection", "features": [item for item in features if item]} if features else None,
            )

        if intent == "nearby":
            reference = (args.get("reference") or "").strip()
            place, ambiguous = _resolve(session, reference)
            if ambiguous:
                return {"status": "ambiguous", "reference": reference, "candidates": [_compact_place(item) for item in ambiguous]}, None
            if not place:
                return {"status": "not_found", "reference": reference}, None
            full_place = get_place(session, place["id"])
            lon, lat = full_place["location"]["coordinates"]
            radius_m = min(max(int(args.get("radius_m", 800)), 1), 10000)
            results = nearby_places(session, lat, lon, radius_m, args.get("category"), limit=10)
            results = [item for item in results if item["id"] != place["id"]]
            feature_items = [_place_feature(session, item["id"]) for item in results]
            features = [item for item in feature_items if item]
            return (
                {
                    "status": "ok" if results else "not_found",
                    "reference": _compact_place(place),
                    "radius_m": radius_m,
                    "results": [_compact_place(item) for item in results],
                },
                {"type": "FeatureCollection", "features": features} if features else None,
            )

        origin_query = (args.get("origin") or "").strip()
        destination_query = (args.get("destination") or "").strip()
        origin, origin_ambiguous = _resolve(session, origin_query)
        destination, destination_ambiguous = _resolve(session, destination_query)
        if origin_ambiguous or destination_ambiguous:
            return {
                "status": "ambiguous",
                "origin_candidates": [_compact_place(item) for item in origin_ambiguous],
                "destination_candidates": [_compact_place(item) for item in destination_ambiguous],
            }, None
        if not origin or not destination:
            return {"status": "not_found", "origin": origin_query, "destination": destination_query}, None
        route = route_places(session, origin["id"], destination["id"], args.get("mode", "walking"))
        features = [
            feature for feature in (
                _place_feature(session, origin["id"], "origin"),
                _place_feature(session, destination["id"], "destination"),
            ) if feature
        ]
        if route.get("geometry"):
            features.append({
                "type": "Feature", "id": "route", "geometry": route["geometry"],
                "properties": {
                    "kind": "route", "mode": route["mode"],
                    "distance_m": route.get("distance_m"), "duration_s": route.get("duration_s"),
                },
            })
        return (
            {
                "status": route["status"],
                "origin": _compact_place(origin),
                "destination": _compact_place(destination),
                "mode": route.get("mode"),
                "distance_m": route.get("distance_m"),
                "duration_s": route.get("duration_s"),
                "reason": route.get("reason"),
            },
            {"type": "FeatureCollection", "features": features},
        )
    finally:
        session.close()


def compact_map_result(result: dict[str, Any]) -> str:
    return json.dumps(result, ensure_ascii=False, separators=(",", ":"))

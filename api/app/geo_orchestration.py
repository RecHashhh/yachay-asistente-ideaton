"""Coordinate map tool calls and resumable clarification turns."""

from __future__ import annotations

import asyncio
import inspect
import re
from dataclasses import dataclass, field
from typing import Any, Awaitable, Callable

from .geo_conversation import GeoPendingAction, apply_choice, clear_pending, get_pending, set_pending
from .intent_router import GeoIntent, IntentDecision

MapExecutor = Callable[..., tuple[dict[str, Any], dict[str, Any] | None] | Awaitable[tuple[dict[str, Any], dict[str, Any] | None]]]


@dataclass
class GeoOperation:
    result: dict[str, Any]
    geometry: dict[str, Any] | None = None
    clarification: str | None = None
    options: list[str] = field(default_factory=list)


def _candidates(result: dict[str, Any], key: str) -> list[dict[str, Any]]:
    return [item for item in result.get(key, []) if item.get("id")]


def _option_names(candidates: list[dict[str, Any]]) -> list[str]:
    return list(dict.fromkeys(
        str(item.get("display_name") or item.get("name"))
        for item in candidates if item.get("display_name") or item.get("name")
    ))[:5]


def _clarification(awaiting: str) -> str:
    return {
        "origin": "¿Desde dónde partes?",
        "destination": "¿A qué lugar quieres ir?",
        "origin_selection": "¿Cuál de estos lugares es el origen?",
        "destination_selection": "¿Cuál de estos lugares es el destino?",
        "place_selection": "¿Cuál de estos lugares buscas?",
    }.get(awaiting, "¿Puedes aclarar qué lugar buscas?")


async def _execute(executor: MapExecutor, **args: Any) -> tuple[dict[str, Any], dict[str, Any] | None]:
    try:
        if inspect.iscoroutinefunction(executor):
            return await executor(**args)
        return await asyncio.to_thread(executor, **args)
    except Exception:
        return {"status": "error", "reason": "map_service_unavailable"}, None


async def _run_route(
    session_id: str,
    action: GeoPendingAction,
    executor: MapExecutor,
) -> GeoOperation:
    args = {
        "intent": "route",
        "origin_id": action.origin_id,
        "destination_id": action.destination_id,
        "origin": action.origin_query,
        "destination": action.destination_query,
        "mode": "walking",
    }
    result, geometry = await _execute(executor, **args)
    if result.get("status") == "ambiguous":
        action.origin_candidates = _candidates(result, "origin_candidates")
        action.destination_candidates = _candidates(result, "destination_candidates")
        action.origin_id = (result.get("origin") or {}).get("id") or action.origin_id
        action.destination_id = (result.get("destination") or {}).get("id") or action.destination_id
        if action.origin_candidates:
            action.awaiting = "origin_selection"
        elif action.destination_candidates:
            action.awaiting = "destination_selection"
        set_pending(session_id, action)
        candidates = action.origin_candidates or action.destination_candidates
        return GeoOperation(result, geometry, _clarification(action.awaiting), _option_names(candidates))
    if result.get("status") == "not_found":
        clear_pending(session_id)
        return GeoOperation(result, geometry)
    clear_pending(session_id)
    return GeoOperation(result, geometry)


async def handle_geo_decision(
    decision: IntentDecision,
    message: str,
    session_id: str,
    executor: MapExecutor,
) -> GeoOperation:
    if decision.intent == GeoIntent.FOLLOW_UP:
        action = get_pending(session_id)
        if action is None:
            return GeoOperation({"status": "not_found", "reason": "no_pending_map_action"})
        if action.awaiting in {"origin_selection", "destination_selection", "place_selection"}:
            action, chosen = apply_choice(action, message)
            if chosen is None:
                candidates = (action.origin_candidates if action.awaiting == "origin_selection" else
                              action.destination_candidates if action.awaiting == "destination_selection" else
                              action.place_candidates)
                set_pending(session_id, action)
                return GeoOperation({"status": "ambiguous"}, None, _clarification(action.awaiting), _option_names(candidates))
            if action.awaiting == "complete":
                return await _search_result(executor, chosen, session_id)
            if action.awaiting in {"origin", "destination"}:
                set_pending(session_id, action)
                return GeoOperation({"status": "needs_input"}, None, _clarification(action.awaiting))
            if action.awaiting in {"origin_selection", "destination_selection"}:
                candidates = action.origin_candidates if action.awaiting == "origin_selection" else action.destination_candidates
                set_pending(session_id, action)
                return GeoOperation(
                    {"status": "ambiguous"}, None, _clarification(action.awaiting), _option_names(candidates),
                )
            return await _run_route(session_id, action, executor)
        if decision.destination and action.pending_action == GeoIntent.ROUTE_REQUEST:
            action.destination_query = decision.destination
            action.destination_id = None
            if not action.origin_id and not action.origin_query:
                action.awaiting = "origin"
                set_pending(session_id, action)
                return GeoOperation({"status": "needs_input", "missing": "origin"}, None, _clarification("origin"))
            action.awaiting = "ready"
        elif action.awaiting == "origin":
            action.origin_query = decision.origin or re.sub(r"^(?:desde|de)\s+", "", message.strip(), flags=re.I)
        elif action.awaiting == "destination":
            action.destination_query = decision.destination or re.sub(r"^(?:hasta|hacia|a)\s+", "", message.strip(), flags=re.I)
        elif action.awaiting == "ready":
            return await _run_route(session_id, action, executor)
        if action.pending_action == GeoIntent.ROUTE_REQUEST:
            return await _run_route(session_id, action, executor)
        return GeoOperation({"status": "not_found", "reason": "pending_action_not_resumable"})

    if decision.intent == GeoIntent.ROUTE_REQUEST:
        action = GeoPendingAction(
            pending_action=GeoIntent.ROUTE_REQUEST,
            origin_query=decision.origin,
            destination_query=decision.destination,
            awaiting="ready",
        )
        if not decision.origin:
            result, geometry = await _execute(executor, intent="search", query=decision.destination)
            candidates = _candidates(result, "results")
            if result.get("status") == "ambiguous" or len(candidates) > 1:
                action.destination_candidates = candidates
                action.awaiting = "destination_selection"
                set_pending(session_id, action)
                return GeoOperation(result, geometry, _clarification(action.awaiting), _option_names(candidates))
            if result.get("status") != "ok" or not candidates:
                clear_pending(session_id)
                return GeoOperation(result, geometry)
            action.destination_id = str(candidates[0]["id"])
            action.awaiting = "origin"
            set_pending(session_id, action)
            return GeoOperation({"status": "needs_input", "missing": "origin", "destination": candidates[0]}, geometry,
                                _clarification("origin"))
        return await _run_route(session_id, action, executor)

    if decision.intent in {GeoIntent.LOCATION_SEARCH, GeoIntent.MAP_MARKER}:
        result, geometry = await _execute(executor, intent="search", query=decision.place)
        candidates = _candidates(result, "results")
        if result.get("status") == "ambiguous" and candidates:
            action = GeoPendingAction(
                pending_action=decision.intent,
                place_query=decision.place,
                place_candidates=candidates,
                awaiting="place_selection",
            )
            set_pending(session_id, action)
            return GeoOperation(result, geometry, _clarification("place_selection"), _option_names(candidates))
        clear_pending(session_id)
        return GeoOperation(result, geometry)

    return GeoOperation({"status": "not_applicable"})


async def _search_result(executor: MapExecutor, chosen: dict[str, Any], session_id: str) -> GeoOperation:
    result, geometry = await _execute(executor, intent="search", query=chosen.get("display_name") or chosen.get("name"))
    clear_pending(session_id)
    return GeoOperation(result, geometry)

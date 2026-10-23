import asyncio

from app.geo_conversation import clear_pending, get_pending
from app.geo_orchestration import handle_geo_decision
from app.intent_router import GeoIntent, IntentDecision


def test_route_without_origin_asks_and_saves_destination():
    calls = []

    async def execute(**args):
        calls.append(args)
        return {"status": "ok", "results": [{"id": "library-id", "display_name": "Biblioteca"}]}, None

    result = asyncio.run(handle_geo_decision(
        IntentDecision(intent=GeoIntent.ROUTE_REQUEST, destination="Biblioteca", confidence=0.96),
        "Cómo llego a la biblioteca", "route-chat", execute,
    ))

    assert result.clarification == "¿Desde dónde partes?"
    assert calls == [{"intent": "search", "query": "Biblioteca"}]
    assert get_pending("route-chat").destination_id == "library-id"
    clear_pending("route-chat")


def test_route_without_origin_resolves_ambiguous_destination_first():
    async def execute(**_args):
        return {
            "status": "ambiguous",
            "results": [
                {"id": "building-id", "display_name": "Edificio SENESCYT"},
                {"id": "stop-id", "display_name": "Parada SENESCYT"},
            ],
        }, None

    result = asyncio.run(handle_geo_decision(
        IntentDecision(intent=GeoIntent.ROUTE_REQUEST, destination="SENESCYT", confidence=0.96),
        "Cómo llego a SENESCYT", "route-chat", execute,
    ))

    assert result.options == ["Edificio SENESCYT", "Parada SENESCYT"]
    assert get_pending("route-chat").awaiting == "destination_selection"
    clear_pending("route-chat")


def test_destination_choice_completes_route_with_stable_place_ids():
    calls = []

    async def execute(**args):
        calls.append(args)
        if len(calls) == 1:
            return {
                "status": "ambiguous",
                "origin": {"id": "plaza-id", "display_name": "Plaza Las Manuelas"},
                "destination_candidates": [
                    {"id": "building-id", "display_name": "Edificio SENESCYT"},
                    {"id": "stop-id", "display_name": "Parada SENESCYT"},
                ],
            }, None
        return {"status": "ok", "distance_m": 240}, {"type": "FeatureCollection", "features": []}

    first = asyncio.run(handle_geo_decision(
        IntentDecision(intent=GeoIntent.ROUTE_REQUEST, origin="Plaza Las Manuelas", destination="SENESCYT", confidence=0.96),
        "Plaza Las Manuelas hasta SENESCYT", "route-chat", execute,
    ))
    assert first.clarification
    pending = get_pending("route-chat")
    assert pending is not None and pending.awaiting == "destination_selection"

    second = asyncio.run(handle_geo_decision(
        IntentDecision(intent=GeoIntent.FOLLOW_UP, confidence=0.99), "El edificio", "route-chat", execute,
    ))

    assert second.result["distance_m"] == 240
    assert calls[1] == {
        "intent": "route", "origin_id": "plaza-id", "destination_id": "building-id",
        "origin": "Plaza Las Manuelas", "destination": "SENESCYT", "mode": "walking",
    }
    assert get_pending("route-chat") is None


def test_both_ambiguous_endpoints_are_selected_before_routing():
    calls = []

    async def execute(**args):
        calls.append(args)
        if len(calls) == 1:
            return {
                "status": "ambiguous",
                "origin_candidates": [
                    {"id": "plaza-id", "display_name": "Plaza Central"},
                    {"id": "plaza-north-id", "display_name": "Plaza Norte"},
                ],
                "destination_candidates": [
                    {"id": "building-id", "display_name": "Edificio SENESCYT"},
                    {"id": "stop-id", "display_name": "Parada SENESCYT"},
                ],
            }, None
        return {"status": "ok", "distance_m": 240}, {"type": "FeatureCollection", "features": []}

    first = asyncio.run(handle_geo_decision(
        IntentDecision(intent=GeoIntent.ROUTE_REQUEST, origin="Plaza", destination="SENESCYT", confidence=0.96),
        "Plaza hasta SENESCYT", "both-ambiguous-chat", execute,
    ))
    assert first.options == ["Plaza Central", "Plaza Norte"]

    second = asyncio.run(handle_geo_decision(
        IntentDecision(intent=GeoIntent.FOLLOW_UP, confidence=0.99), "Plaza Central", "both-ambiguous-chat", execute,
    ))
    assert second.options == ["Edificio SENESCYT", "Parada SENESCYT"]
    assert len(calls) == 1

    third = asyncio.run(handle_geo_decision(
        IntentDecision(intent=GeoIntent.FOLLOW_UP, confidence=0.99), "el edificio", "both-ambiguous-chat", execute,
    ))
    assert third.result["distance_m"] == 240
    assert calls[1]["origin_id"] == "plaza-id"
    assert calls[1]["destination_id"] == "building-id"
    assert get_pending("both-ambiguous-chat") is None


def test_geographic_service_exception_becomes_controlled_error():
    async def execute(**_args):
        raise RuntimeError("db down")

    result = asyncio.run(handle_geo_decision(
        IntentDecision(intent=GeoIntent.LOCATION_SEARCH, place="SENESCYT", confidence=0.96),
        "Dónde queda SENESCYT", "map-chat", execute,
    ))

    assert result.result["status"] == "error"
    assert result.result["reason"] == "map_service_unavailable"


def test_route_without_network_path_is_reported_and_does_not_leave_pending_state():
    async def execute(**_args):
        return {"status": "route_unavailable", "reason": "no_path"}, None

    result = asyncio.run(handle_geo_decision(
        IntentDecision(intent=GeoIntent.ROUTE_REQUEST, origin="Plaza", destination="Biblioteca", confidence=0.96),
        "Plaza hasta Biblioteca", "route-chat", execute,
    ))

    assert result.result["status"] == "route_unavailable"
    assert get_pending("route-chat") is None

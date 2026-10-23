import asyncio

import pytest

from app.intent_router import GeoIntent, classify_local, classify_request, validate_claude_decision


@pytest.mark.parametrize(
    ("message", "intent", "origin", "destination", "place"),
    [
        ("Dónde queda Las Manuelas", GeoIntent.LOCATION_SEARCH, None, None, "Las Manuelas"),
        ("Muéstrame Las Manuelas", GeoIntent.MAP_MARKER, None, None, "Las Manuelas"),
        ("Márcame para ir a Las Manuelas", GeoIntent.MAP_MARKER, None, None, "Las Manuelas"),
        ("Plaza Las Manuelas hasta SENESCYT", GeoIntent.ROUTE_REQUEST, "Plaza Las Manuelas", "SENESCYT", None),
        ("Desde Las Manuelas hacia SENESCYT", GeoIntent.ROUTE_REQUEST, "Las Manuelas", "SENESCYT", None),
        ("Cómo llegar de los bloques a la biblioteca", GeoIntent.ROUTE_REQUEST, "los bloques", "la biblioteca", None),
        ("Llévame desde el bloque A hasta SENESCYT", GeoIntent.ROUTE_REQUEST, "el bloque A", "SENESCYT", None),
        ("Quiero ir a SENESCYT", GeoIntent.ROUTE_REQUEST, None, "SENESCYT", None),
        ("Y ahora a la biblioteca", GeoIntent.ROUTE_REQUEST, None, "la biblioteca", None),
        ("Qué servicios presta SENESCYT", GeoIntent.DOCUMENT_SEARCH, None, None, None),
        ("¿A qué hora sale el último bus de Urcuquí a Ibarra?", GeoIntent.DOCUMENT_SEARCH, None, None, None),
        ("¿Cómo me cambio de otra universidad a Yachay Tech?", GeoIntent.DOCUMENT_SEARCH, None, None, None),
        ("Ya estoy en tercer semestre, ¿puedo cambiarme de Física a Bioquímica?", GeoIntent.DOCUMENT_SEARCH, None, None, None),
        ("Cómo llego de la residencia a la universidad", GeoIntent.ROUTE_REQUEST, "la residencia", "la universidad", None),
        ("Dónde queda SENESCYT y qué servicios presta", GeoIntent.MIXED_REQUEST, None, None, "SENESCYT"),
        ("Cómo llego a SENESCYT y qué trámites puedo realizar allí", GeoIntent.MIXED_REQUEST, None, "SENESCYT", None),
    ],
)
def test_classifies_clear_requests(message, intent, origin, destination, place):
    result = classify_local(message)

    assert result is not None
    assert result.intent == intent
    assert result.origin == origin
    assert result.destination == destination
    assert result.place == place


def test_follow_up_requires_a_pending_map_action():
    result = classify_local("El edificio", pending_action="ROUTE_REQUEST")

    assert result.intent == GeoIntent.FOLLOW_UP
    assert result.needs_clarification is False


def test_new_document_question_is_not_consumed_as_pending_map_follow_up():
    result = classify_local("Qué servicios presta SENESCYT", pending_action="ROUTE_REQUEST")

    assert result.intent == GeoIntent.DOCUMENT_SEARCH


def test_new_destination_after_route_context_is_explicitly_routed():
    result = classify_local("Y ahora a la biblioteca", pending_action="ROUTE_REQUEST")

    assert result.intent == GeoIntent.FOLLOW_UP
    assert result.destination == "la biblioteca"


def test_origin_answer_is_a_follow_up_to_a_route_prompt():
    result = classify_local("Desde la plaza", pending_action="ROUTE_REQUEST")

    assert result.intent == GeoIntent.FOLLOW_UP
    assert result.origin == "la plaza"


def test_uncertain_semantic_request_falls_through_to_claude():
    assert classify_local("Me gustaría conocer SENESCYT") is None


def test_claude_classifier_is_used_only_after_local_router_declines():
    calls = []

    async def classifier(message):
        calls.append(message)
        return {"intent": "LOCATION_SEARCH", "place": "SENESCYT", "confidence": 0.91}

    local, interpreted = asyncio.run(run_both(classifier))

    assert local.intent == GeoIntent.LOCATION_SEARCH
    assert calls == ["Me gustaría conocer SENESCYT"]
    assert interpreted.intent == GeoIntent.LOCATION_SEARCH


async def run_both(classifier):
    local = await classify_request("Dónde queda SENESCYT", classifier=classifier)
    interpreted = await classify_request("Me gustaría conocer SENESCYT", classifier=classifier)
    return local, interpreted


def test_structured_claude_output_rejects_route_without_destination():
    with pytest.raises(ValueError, match="route_request_requires_destination"):
        validate_claude_decision({"intent": "ROUTE_REQUEST", "confidence": 0.91})


def test_claude_confidence_below_threshold_is_not_accepted():
    async def classifier(_message):
        return {"intent": "LOCATION_SEARCH", "place": "SENESCYT", "confidence": 0.71}

    result = asyncio.run(classify_request("SENESCYT", classifier=classifier))

    assert result is None

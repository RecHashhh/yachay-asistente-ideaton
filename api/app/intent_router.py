"""Local-first classification for campus map and document requests."""

from __future__ import annotations

import re
import unicodedata
from collections.abc import Awaitable, Callable
from enum import StrEnum
from typing import Any

from pydantic import BaseModel, ConfigDict, Field, model_validator

MIN_INTENT_CONFIDENCE = 0.72


class GeoIntent(StrEnum):
    LOCATION_SEARCH = "LOCATION_SEARCH"
    ROUTE_REQUEST = "ROUTE_REQUEST"
    MAP_MARKER = "MAP_MARKER"
    DOCUMENT_SEARCH = "DOCUMENT_SEARCH"
    MIXED_REQUEST = "MIXED_REQUEST"
    FOLLOW_UP = "FOLLOW_UP"
    GENERAL_CHAT = "GENERAL_CHAT"


class IntentDecision(BaseModel):
    model_config = ConfigDict(extra="forbid")

    intent: GeoIntent
    origin: str | None = None
    destination: str | None = None
    place: str | None = None
    confidence: float = Field(ge=0, le=1)
    needs_clarification: bool = False
    needs_origin: bool = False

    @model_validator(mode="after")
    def validate_entities(self) -> "IntentDecision":
        if self.intent == GeoIntent.ROUTE_REQUEST and not self.destination:
            raise ValueError("route_request_requires_destination")
        if self.intent == GeoIntent.ROUTE_REQUEST and not self.origin:
            self.needs_origin = True
        if self.intent == GeoIntent.MIXED_REQUEST and self.destination and not self.origin:
            self.needs_origin = True
        if self.intent in {GeoIntent.LOCATION_SEARCH, GeoIntent.MAP_MARKER} and not self.place:
            raise ValueError("map_request_requires_place")
        return self


def _fold(text: str) -> str:
    return "".join(
        char for char in unicodedata.normalize("NFD", text.casefold())
        if unicodedata.category(char) != "Mn"
    )


def _entity(message: str, start: int, end: int) -> str:
    return message[start:end].strip(" \t\r\n.,!?¿¡:;\"'()[]{}")


def _decision(
    intent: GeoIntent,
    *,
    origin: str | None = None,
    destination: str | None = None,
    place: str | None = None,
    confidence: float = 0.96,
    needs_clarification: bool = False,
) -> IntentDecision:
    return IntentDecision(
        intent=intent,
        origin=origin,
        destination=destination,
        place=place,
        confidence=confidence,
        needs_clarification=needs_clarification,
    )


def _route_entities(message: str, folded: str) -> tuple[str | None, str] | None:
    patterns = (
        r"\bdesde\s+(.+)\s+(?:hasta|hacia|a)\s+(.+)$",
        r"\bde\s+(.+)\s+(?:hasta|hacia|a)\s+(.+)$",
        r"\bentre\s+(.+)\s+y\s+(.+)$",
        r"\bcomo\s+llego\s+desde\s+(.+)\s+(?:hasta|hacia|a)\s+(.+)$",
        r"\bcomo\s+llego\s+de\s+(.+)\s+(?:hasta|hacia|a)\s+(.+)$",
        r"^(.+)\s+hasta\s+(.+)$",
    )
    for pattern in patterns:
        match = re.search(pattern, folded)
        if match:
            return _entity(message, *match.span(1)), _entity(message, *match.span(2))
    return None


def _target_after(message: str, folded: str, pattern: str) -> str | None:
    match = re.search(pattern, folded)
    return _entity(message, *match.span(1)) if match else None


def _trim_document_tail(text: str) -> str:
    folded = _fold(text)
    match = re.search(r"\s+y\s+(?:qu[eé]|cual(?:es)?|como)\b", folded)
    return text[:match.start()].strip() if match else text.strip()


def classify_local(message: str, pending_action: str | None = None) -> IntentDecision | None:
    """Classify clear requests locally; return None when semantic interpretation is needed."""
    folded = _fold(message).strip()
    if not folded:
        return _decision(GeoIntent.GENERAL_CHAT)
    document_request = re.search(
        r"\b(?:que\s+es|que\s+servicios\s+presta|que\s+tramites|informacion\s+sobre|requisitos\s+de|how\s+does)\b",
        folded,
    )
    route = _route_entities(message, folded)
    # "¿A qué hora sale el bus de Urcuquí a Ibarra?" pregunta un horario, no una ruta a pie por el campus.
    if route and re.search(r"\b(?:a\s+que\s+hora|horarios?|bus(?:es)?|transporte|what\s+time|schedule)\b", folded):
        return _decision(GeoIntent.DOCUMENT_SEARCH, confidence=0.94)
    if route:
        origin, destination = route
        if document_request:
            return _decision(GeoIntent.MIXED_REQUEST, origin=origin, destination=_trim_document_tail(destination))
        return _decision(GeoIntent.ROUTE_REQUEST, origin=origin, destination=destination)

    marker = _target_after(
        message,
        folded,
        r"\b(?:marcame(?:\s+para\s+ir\s+a)?|marcar\s+en\s+el\s+mapa|muestrame|muestra|ubica(?:me)?)\s+(.+)$",
    )
    if not marker:
        marker = _target_after(message, folded, r"\bmarcame\s+para\s+ir\s+a\s+(.+)$")
    if marker:
        if document_request:
            return _decision(GeoIntent.MIXED_REQUEST, place=_trim_document_tail(marker))
        return _decision(GeoIntent.MAP_MARKER, place=marker)

    now_destination = _target_after(message, folded, r"^(?:y\s+)?ahora\s+(?:a|hasta)\s+(.+)$")
    if pending_action and now_destination:
        return _decision(GeoIntent.FOLLOW_UP, destination=now_destination, confidence=0.99)

    destination = _target_after(
        message,
        folded,
        r"\b(?:como\s+llego\s+(?:a|hasta)|como\s+llegar\s+(?:a|hasta)|quiero\s+ir\s+(?:a|hasta)|ir\s+(?:a|hasta)|llevame\s+(?:a|hasta))\s+(.+)$",
    )
    if not destination:
        destination = now_destination
    if destination:
        if document_request:
            return _decision(GeoIntent.MIXED_REQUEST, destination=_trim_document_tail(destination))
        return _decision(GeoIntent.ROUTE_REQUEST, destination=destination)

    location = _target_after(
        message,
        folded,
        r"\b(?:donde\s+(?:queda|esta|se\s+encuentra)|where\s+is)\s+(.+)$",
    )
    if document_request and (location or marker):
        return _decision(GeoIntent.MIXED_REQUEST, place=_trim_document_tail(location or marker))
    if document_request:
        return _decision(GeoIntent.DOCUMENT_SEARCH, confidence=0.94)
    if marker:
        return _decision(GeoIntent.MAP_MARKER, place=marker)

    if location:
        return _decision(GeoIntent.LOCATION_SEARCH, place=location)
    if pending_action:
        origin = _target_after(message, folded, r"^(?:desde|de)\s+(.+)$")
        if origin:
            return _decision(GeoIntent.FOLLOW_UP, origin=origin, confidence=0.99)
        destination = _target_after(message, folded, r"^(?:a|hasta|hacia)\s+(.+)$")
        if destination:
            return _decision(GeoIntent.FOLLOW_UP, destination=destination, confidence=0.99)
    if pending_action and len(folded.split()) <= 3:
        return _decision(GeoIntent.FOLLOW_UP, confidence=0.95)
    return None


def validate_claude_decision(payload: object) -> IntentDecision:
    """Validate structured classifier output before it reaches any tool."""
    return IntentDecision.model_validate(payload)


async def classify_request(
    message: str,
    pending_action: str | None = None,
    classifier: Callable[[str], Awaitable[Any]] | None = None,
    min_confidence: float = MIN_INTENT_CONFIDENCE,
) -> IntentDecision | None:
    local = classify_local(message, pending_action)
    if local is not None or classifier is None:
        return local
    try:
        output = await classifier(message)
        decision = validate_claude_decision(output)
        return decision if decision.confidence >= min_confidence else None
    except Exception:
        return None

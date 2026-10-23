"""Persistent, short-lived geographic clarification state, isolated by chat session."""

from __future__ import annotations

import asyncio
from contextlib import asynccontextmanager
from threading import RLock
import time
from typing import Any
import unicodedata
from collections.abc import AsyncIterator

from pydantic import BaseModel, ConfigDict, Field

from .intent_router import GeoIntent

PENDING_TTL_SECONDS = 10 * 60


def _connection_context():
    """Load the DB pool only when the production-backed state store is actually used."""
    from .db import conn

    return conn()


def _lock_connection_context():
    """Locks outlive a DB operation, so they must not occupy a query-pool slot."""
    from .db import geo_lock_conn

    return geo_lock_conn()


class GeoPendingAction(BaseModel):
    model_config = ConfigDict(extra="forbid")

    pending_action: GeoIntent
    origin_query: str | None = None
    destination_query: str | None = None
    place_query: str | None = None
    origin_id: str | None = None
    destination_id: str | None = None
    place_id: str | None = None
    origin_candidates: list[dict[str, Any]] = Field(default_factory=list)
    destination_candidates: list[dict[str, Any]] = Field(default_factory=list)
    place_candidates: list[dict[str, Any]] = Field(default_factory=list)
    awaiting: str


class PostgresGeoStateStore:
    """Conversation state stored in PostgreSQL so API workers share pending actions."""

    def get(self, session_id: str) -> GeoPendingAction | None:
        with _connection_context() as connection:
            row = connection.execute(
                "SELECT state FROM geo_pending_actions WHERE session_id = %s AND expires_at > now()",
                (session_id,),
            ).fetchone()
            if row is None:
                connection.execute(
                    "DELETE FROM geo_pending_actions WHERE session_id = %s AND expires_at <= now()",
                    (session_id,),
                )
                return None
        return GeoPendingAction.model_validate(row["state"])

    def set(self, session_id: str, action: GeoPendingAction, ttl_seconds: int) -> None:
        with _connection_context() as connection:
            connection.execute(
                """INSERT INTO geo_pending_actions (session_id, state, expires_at, updated_at)
                   VALUES (%s, %s::jsonb, now() + (%s * interval '1 second'), now())
                   ON CONFLICT (session_id) DO UPDATE
                   SET state = EXCLUDED.state, expires_at = EXCLUDED.expires_at, updated_at = now()""",
                (session_id, action.model_dump_json(), ttl_seconds),
            )

    def clear(self, session_id: str) -> None:
        with _connection_context() as connection:
            connection.execute("DELETE FROM geo_pending_actions WHERE session_id = %s", (session_id,))


class InMemoryGeoStateStore:
    """Test-only store. Production defaults to PostgreSQL."""

    def __init__(self) -> None:
        self._lock = RLock()
        self._pending: dict[str, tuple[float, GeoPendingAction]] = {}

    def get(self, session_id: str) -> GeoPendingAction | None:
        now = time.monotonic()
        with self._lock:
            record = self._pending.get(session_id)
            if record is None:
                return None
            expires_at, action = record
            if expires_at <= now:
                self._pending.pop(session_id, None)
                return None
            return action.model_copy(deep=True)

    def set(self, session_id: str, action: GeoPendingAction, ttl_seconds: int) -> None:
        now = time.monotonic()
        with self._lock:
            expired = [key for key, (deadline, _) in self._pending.items() if deadline <= now]
            for key in expired:
                self._pending.pop(key, None)
            self._pending[session_id] = (now + ttl_seconds, action.model_copy(deep=True))

    def clear(self, session_id: str) -> None:
        with self._lock:
            self._pending.pop(session_id, None)


_store: PostgresGeoStateStore | InMemoryGeoStateStore = PostgresGeoStateStore()


def use_store_for_testing(store: InMemoryGeoStateStore) -> None:
    """Inject an isolated store in unit tests; never called by the API."""
    global _store
    _store = store


def reset_store() -> None:
    """Restore the PostgreSQL default after a test injects its isolated store."""
    global _store
    _store = PostgresGeoStateStore()


def _session_key(session_id: str) -> str:
    key = session_id.strip()
    if not key:
        raise ValueError("session_id_required")
    return key


def get_pending(session_id: str) -> GeoPendingAction | None:
    key = _session_key(session_id)
    return _store.get(key)


def set_pending(
    session_id: str,
    action: GeoPendingAction,
    ttl_seconds: int = PENDING_TTL_SECONDS,
) -> None:
    if ttl_seconds <= 0:
        raise ValueError("ttl_seconds_must_be_positive")
    key = _session_key(session_id)
    _store.set(key, action, ttl_seconds)


def clear_pending(session_id: str) -> None:
    key = _session_key(session_id)
    _store.clear(key)


@asynccontextmanager
async def conversation_lock(session_id: str) -> AsyncIterator[None]:
    """Serialize turns for one conversation across API workers with a PostgreSQL advisory lock."""
    key = _session_key(session_id)

    def acquire():
        context = _lock_connection_context()
        connection = context.__enter__()
        try:
            connection.execute("SELECT pg_advisory_lock(hashtextextended(%s, 0))", (key,))
            connection.commit()
            return context, connection
        except Exception as exc:
            context.__exit__(type(exc), exc, exc.__traceback__)
            raise

    context, connection = await asyncio.to_thread(acquire)
    try:
        yield
    finally:
        def release() -> None:
            try:
                connection.execute("SELECT pg_advisory_unlock(hashtextextended(%s, 0))", (key,))
                connection.commit()
            finally:
                context.__exit__(None, None, None)

        await asyncio.to_thread(release)


def _normalize(value: str) -> str:
    decomposed = unicodedata.normalize("NFD", value.casefold())
    return "".join(char for char in decomposed if unicodedata.category(char) != "Mn")


def apply_choice(action: GeoPendingAction, message: str) -> tuple[GeoPendingAction, dict[str, Any] | None]:
    """Apply a clear candidate choice without treating a shared prefix as a selection."""
    updated = action.model_copy(deep=True)
    if updated.awaiting == "destination_selection":
        candidates = updated.destination_candidates
    elif updated.awaiting == "origin_selection":
        candidates = updated.origin_candidates
    elif updated.awaiting == "place_selection":
        candidates = updated.place_candidates
    else:
        return updated, None

    query = _normalize(message)
    stop_words = {"el", "la", "los", "las", "de", "del"}
    query_words = {word for word in query.split() if word not in stop_words}
    matches = []
    for candidate in candidates:
        labels = [_normalize(str(candidate.get(key) or "")) for key in ("display_name", "name")]
        labels = [label for label in labels if label]
        if any(query == label for label in labels):
            matches.append(candidate)
            continue
        for label in labels:
            words = set(label.split())
            if query_words and query_words <= words:
                matches.append(candidate)
                break
    unique = {str(item.get("id")): item for item in matches if item.get("id")}
    if len(unique) != 1:
        return updated, None

    chosen = next(iter(unique.values()))
    if updated.awaiting == "destination_selection":
        updated.destination_id = str(chosen["id"])
        updated.destination_candidates = []
        updated.awaiting = "ready" if updated.origin_id else "origin_selection" if updated.origin_candidates else "origin"
    elif updated.awaiting == "origin_selection":
        updated.origin_id = str(chosen["id"])
        updated.origin_candidates = []
        updated.awaiting = "ready" if updated.destination_id else "destination_selection" if updated.destination_candidates else "destination"
    else:
        updated.place_id = str(chosen["id"])
        updated.place_candidates = []
        updated.awaiting = "complete"
    return updated, chosen

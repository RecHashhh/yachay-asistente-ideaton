from app.geo_conversation import GeoPendingAction, apply_choice, clear_pending, get_pending, set_pending
from contextlib import contextmanager
import pytest


def test_pending_action_is_isolated_by_conversation():
    set_pending("chat-a", GeoPendingAction(
        pending_action="ROUTE_REQUEST",
        origin_id="plaza-manuelas",
        destination_candidates=[{"id": "building", "name": "Edificio SENESCYT"}],
        awaiting="destination_selection",
    ))

    assert get_pending("chat-a").origin_id == "plaza-manuelas"
    assert get_pending("chat-b") is None


def test_pending_action_can_be_cleared_after_follow_up():
    set_pending("chat-a", GeoPendingAction(pending_action="LOCATION_SEARCH", awaiting="place_selection"))

    clear_pending("chat-a")

    assert get_pending("chat-a") is None


def test_pending_action_expires(monkeypatch):
    import app.geo_conversation as state

    now = [100.0]
    monkeypatch.setattr(state.time, "monotonic", lambda: now[0])
    set_pending("chat-a", GeoPendingAction(pending_action="ROUTE_REQUEST", awaiting="origin"), ttl_seconds=5)
    now[0] += 6

    assert get_pending("chat-a") is None


def test_destination_choice_retains_resolved_origin():
    pending = GeoPendingAction(
        pending_action="ROUTE_REQUEST",
        origin_id="plaza-manuelas",
        destination_candidates=[
            {"id": "senescyt-building", "display_name": "Edificio SENESCYT"},
            {"id": "senescyt-stop", "display_name": "Parada SENESCYT"},
        ],
        awaiting="destination_selection",
    )

    updated, chosen = apply_choice(pending, "El edificio")

    assert chosen["id"] == "senescyt-building"
    assert updated.origin_id == "plaza-manuelas"
    assert updated.destination_id == "senescyt-building"
    assert updated.awaiting == "ready"


def test_ambiguous_choice_does_not_select_first_candidate():
    pending = GeoPendingAction(
        pending_action="ROUTE_REQUEST",
        destination_candidates=[
            {"id": "building", "display_name": "Edificio SENESCYT"},
            {"id": "stop", "display_name": "Parada SENESCYT"},
        ],
        awaiting="destination_selection",
    )

    updated, chosen = apply_choice(pending, "SENESCYT")

    assert chosen is None
    assert updated.destination_id is None
    assert len(updated.destination_candidates) == 2


@pytest.mark.asyncio
async def test_conversation_advisory_lock_uses_separate_database_pool(monkeypatch):
    import app.db as db
    import app.geo_conversation as state

    statements = []
    pooled_calls = []

    class Connection:
        def execute(self, sql, params):
            statements.append(sql)

        def commit(self):
            pass

    @contextmanager
    def lock_connection():
        yield Connection()

    @contextmanager
    def application_connection():
        pooled_calls.append(True)
        yield Connection()

    monkeypatch.setattr(db, "geo_lock_conn", lock_connection, raising=False)
    monkeypatch.setattr(db, "conn", application_connection)

    async with state.conversation_lock("pool-isolation-test"):
        assert statements[0].startswith("SELECT pg_advisory_lock")

    assert any(statement.startswith("SELECT pg_advisory_unlock") for statement in statements)
    assert pooled_calls == []

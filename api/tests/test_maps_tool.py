from __future__ import annotations

from app import maps_tool


def test_map_result_sent_to_llm_is_compact() -> None:
    compact = maps_tool._compact_place({
        "id": "123", "display_name": "Patomar", "category": "entertainment",
        "subcategory": "karaoke", "location": {"coordinates": [-78, 0.4]},
        "score": 0.99, "match": "exact_alias",
        "geometry": {"type": "Polygon", "coordinates": [[...]]},
    })

    assert compact == {
        "id": "123", "display_name": "Patomar", "category": "entertainment", "subcategory": "karaoke",
    }


def test_ambiguous_reference_is_not_silently_selected(monkeypatch) -> None:
    monkeypatch.setattr(maps_tool, "search_places", lambda *_args, **_kwargs: [
        {"id": "a", "display_name": "Bloque A", "match": "contains_name"},
        {"id": "b", "display_name": "Bloque B", "match": "contains_name"},
    ])

    selected, candidates = maps_tool._resolve(object(), "Bloque")

    assert selected is None
    assert [item["id"] for item in candidates] == ["a", "b"]


def test_confident_fuzzy_match_is_resolved_without_asking_the_user(monkeypatch) -> None:
    monkeypatch.setattr(maps_tool, "search_places", lambda *_args, **_kwargs: [
        {"id": "plaza", "display_name": "Plaza Las Manuelas", "match": "fuzzy", "score": 0.91},
        {"id": "bathroom", "display_name": "Baño de Las Manuelas", "match": "fuzzy", "score": 0.62},
    ])

    selected, candidates = maps_tool._resolve(object(), "plasa manuelas")

    assert selected["id"] == "plaza"
    assert candidates == []


def test_fuzzy_match_with_close_scores_remains_ambiguous(monkeypatch) -> None:
    monkeypatch.setattr(maps_tool, "search_places", lambda *_args, **_kwargs: [
        {"id": "a", "display_name": "Bloque A", "match": "fuzzy", "score": 0.76},
        {"id": "b", "display_name": "Bloque B", "match": "fuzzy", "score": 0.73},
    ])

    selected, candidates = maps_tool._resolve(object(), "bloqe")

    assert selected is None
    assert [item["id"] for item in candidates] == ["a", "b"]


def test_category_typo_returns_verified_place_results(monkeypatch) -> None:
    class FakeSession:
        def close(self):
            pass

    candidates = [{"id": "restaurant", "display_name": "Restaurante", "match": "category", "score": 0.6}]
    monkeypatch.setattr(maps_tool, "SessionLocal", FakeSession)
    monkeypatch.setattr(maps_tool, "_resolve", lambda *_args: (None, candidates))
    monkeypatch.setattr(maps_tool, "_place_feature", lambda *_args: {"type": "Feature", "id": "restaurant"})

    result, geometry = maps_tool.execute_map_action(intent="search", query="restuarante")

    assert result["status"] == "ok"
    assert result["results"] == [maps_tool._compact_place(candidates[0])]
    assert geometry["features"] == [{"type": "Feature", "id": "restaurant"}]


def test_canonical_las_manuelas_reference_resolves_plaza(monkeypatch) -> None:
    monkeypatch.setattr(maps_tool, "search_places", lambda *_args, **_kwargs: [
        {"id": "bathroom", "display_name": "Baño de Las Manuelas", "match": "contains_name"},
        {"id": "plaza", "display_name": "Plaza Las Manuelas", "match": "contains_name"},
    ])

    selected, candidates = maps_tool._resolve(object(), "Las Manuelas")

    assert selected["id"] == "plaza"
    assert candidates == []


def test_search_reports_ambiguous_name_as_candidates(monkeypatch) -> None:
    class FakeSession:
        def close(self):
            pass

    candidates = [
        {"id": "a", "display_name": "Bloque A", "match": "contains_name"},
        {"id": "b", "display_name": "Bloque B", "match": "contains_name"},
    ]
    monkeypatch.setattr(maps_tool, "SessionLocal", FakeSession)
    monkeypatch.setattr(maps_tool, "_resolve", lambda *_args: (None, candidates))
    monkeypatch.setattr(maps_tool, "_place_feature", lambda *_args: None)

    result, _geometry = maps_tool.execute_map_action(intent="search", query="Bloque")

    assert result["status"] == "ambiguous"
    assert [item["id"] for item in result["results"]] == ["a", "b"]


def test_nearby_excludes_reference_place(monkeypatch) -> None:
    class FakeSession:
        def close(self):
            pass

    reference = {"id": "reference", "display_name": "Las Manuelas", "match": "exact_name"}
    places = [
        {"id": "reference", "display_name": "Las Manuelas", "distance_m": 0},
        {"id": "restaurant", "display_name": "Restaurante cercano", "distance_m": 40},
    ]
    monkeypatch.setattr(maps_tool, "SessionLocal", FakeSession)
    monkeypatch.setattr(maps_tool, "_resolve", lambda *_args: (reference, []))
    monkeypatch.setattr(maps_tool, "get_place", lambda _session, _id: {
        "id": "reference", "location": {"coordinates": [-78.0, -0.2]},
    })
    monkeypatch.setattr(maps_tool, "nearby_places", lambda *_args, **_kwargs: places)
    monkeypatch.setattr(maps_tool, "_place_feature", lambda _session, place_id, **_kwargs: {
        "type": "Feature", "id": place_id,
    })

    result, geometry = maps_tool.execute_map_action(
        intent="nearby", reference="Las Manuelas", category="restaurant",
    )

    assert [item["id"] for item in result["results"]] == ["restaurant"]
    assert [item["id"] for item in geometry["features"]] == ["restaurant"]


def test_route_can_resume_with_stable_place_ids(monkeypatch) -> None:
    class FakeSession:
        def close(self):
            pass

    route_calls = []
    places = {
        "plaza-id": {"id": "plaza-id", "display_name": "Plaza Las Manuelas", "name": "Plaza Las Manuelas"},
        "building-id": {"id": "building-id", "display_name": "Edificio SENESCYT", "name": "Edificio SENESCYT"},
    }
    monkeypatch.setattr(maps_tool, "SessionLocal", FakeSession)
    monkeypatch.setattr(maps_tool, "get_place", lambda _session, place_id: places.get(place_id))
    monkeypatch.setattr(maps_tool, "route_places", lambda _session, origin, destination, mode: route_calls.append((origin, destination, mode)) or {
        "status": "ok", "mode": mode, "distance_m": 240, "duration_s": 180,
        "geometry": {"type": "LineString", "coordinates": [[-78, 0], [-78.1, 0.1]]},
    })
    monkeypatch.setattr(maps_tool, "_place_feature", lambda _session, place_id, role="candidate": {
        "type": "Feature", "id": place_id, "properties": {"role": role}, "geometry": {"type": "Point", "coordinates": [0, 0]},
    })

    result, _geometry = maps_tool.execute_map_action(
        intent="route", origin_id="plaza-id", destination_id="building-id",
    )

    assert result["status"] == "ok"
    assert result["origin"]["id"] == "plaza-id"
    assert result["destination"]["id"] == "building-id"
    assert route_calls == [("plaza-id", "building-id", "walking")]


def test_route_ambiguity_preserves_the_resolved_endpoint(monkeypatch) -> None:
    class FakeSession:
        def close(self):
            pass

    origin = {"id": "plaza-id", "display_name": "Plaza Las Manuelas", "match": "exact_name"}
    destinations = [
        {"id": "building-id", "display_name": "Edificio SENESCYT", "match": "contains_name"},
        {"id": "stop-id", "display_name": "Parada SENESCYT", "match": "contains_name"},
    ]
    monkeypatch.setattr(maps_tool, "SessionLocal", FakeSession)
    monkeypatch.setattr(maps_tool, "_resolve", lambda _session, query: (origin, []) if query == "Plaza Las Manuelas" else (None, destinations))

    result, geometry = maps_tool.execute_map_action(
        intent="route", origin="Plaza Las Manuelas", destination="SENESCYT",
    )

    assert result["status"] == "ambiguous"
    assert result["origin"]["id"] == "plaza-id"
    assert [item["id"] for item in result["destination_candidates"]] == ["building-id", "stop-id"]
    assert geometry is None

from Mapas.app.matching import resolve_category, resolve_place_candidates


def test_category_typo_maps_only_to_a_known_place_category() -> None:
    assert resolve_category("restuarante") == ("amenity", "restaurant")
    assert resolve_category("resto") is None


def test_confident_fuzzy_place_match_is_selected() -> None:
    selected, candidates = resolve_place_candidates([
        {"id": "plaza", "match": "fuzzy", "score": 0.91},
        {"id": "bathroom", "match": "fuzzy", "score": 0.62},
    ])

    assert selected["id"] == "plaza"
    assert candidates == []


def test_close_fuzzy_place_matches_remain_ambiguous() -> None:
    selected, candidates = resolve_place_candidates([
        {"id": "a", "match": "fuzzy", "score": 0.76},
        {"id": "b", "match": "fuzzy", "score": 0.73},
    ])

    assert selected is None
    assert [item["id"] for item in candidates] == ["a", "b"]

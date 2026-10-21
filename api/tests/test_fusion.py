from app.fusion import reciprocal_rank_fusion


def test_fusion_promotes_items_found_by_both_searches() -> None:
    ranked = reciprocal_rank_fusion(["a", "b", "c"], ["c", "a", "d"])

    assert ranked[0] == "a"
    assert set(ranked) == {"a", "b", "c", "d"}


def test_fusion_is_stable_for_equal_scores() -> None:
    assert reciprocal_rank_fusion(["z"], ["a"]) == ["a", "z"]

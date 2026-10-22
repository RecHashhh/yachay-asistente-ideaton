from __future__ import annotations

from difflib import SequenceMatcher
from typing import Any

from .osm import CATEGORY_QUERIES, normalize_text

CATEGORY_MATCH_THRESHOLD = 0.84
SINGLE_FUZZY_MATCH_THRESHOLD = 0.72
FUZZY_MATCH_THRESHOLD = 0.80
FUZZY_MATCH_MARGIN = 0.15


def resolve_category(query: str) -> tuple[str, str | None] | None:
    normalized = normalize_text(query)
    if normalized in CATEGORY_QUERIES:
        return CATEGORY_QUERIES[normalized]
    if len(normalized) < 5:
        return None

    scores: dict[tuple[str, str | None], float] = {}
    for alias, category in CATEGORY_QUERIES.items():
        score = SequenceMatcher(None, normalized, alias).ratio()
        scores[category] = max(scores.get(category, 0), score)

    ranked = sorted(scores.items(), key=lambda item: item[1], reverse=True)
    if not ranked or ranked[0][1] < CATEGORY_MATCH_THRESHOLD:
        return None
    if len(ranked) > 1 and ranked[0][1] - ranked[1][1] < 0.08:
        return None
    return ranked[0][0]


def resolve_place_candidates(
    candidates: list[dict[str, Any]],
) -> tuple[dict[str, Any] | None, list[dict[str, Any]]]:
    if not candidates:
        return None, []

    exact = [item for item in candidates if item.get("match") in {"exact_name", "exact_alias"}]
    if len(exact) == 1:
        return exact[0], []
    if len(exact) > 1:
        return None, exact

    top = candidates[0]
    score = float(top.get("score") or 0)
    match = str(top.get("match") or "fuzzy")
    if len(candidates) == 1:
        if match != "fuzzy" or score >= SINGLE_FUZZY_MATCH_THRESHOLD:
            return top, []
        return None, candidates

    second_score = float(candidates[1].get("score") or 0)
    margin = score - second_score
    if match.startswith("prefix") and score >= 0.92 and margin >= 0.08:
        return top, []
    if match.startswith("contains") and score >= 0.90 and margin >= 0.12:
        return top, []
    if match == "fuzzy" and score >= FUZZY_MATCH_THRESHOLD and margin >= FUZZY_MATCH_MARGIN:
        return top, []
    return None, candidates

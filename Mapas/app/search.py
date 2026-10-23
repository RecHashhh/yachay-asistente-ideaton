from __future__ import annotations

import json
from typing import Any

from fastapi import HTTPException
from sqlalchemy import text
from sqlalchemy.orm import Session

from .geo import google_maps_search_url
from .matching import resolve_category
from .osm import CATEGORY_QUERIES, category_label, normalize_text

RESULT_COLUMNS = """
    p.id,
    p.osm_type,
    p.osm_id,
    p.name,
    p.name_normalized,
    p.display_name,
    p.category,
    p.subcategory,
    p.location,
    p.tags
"""


def _row_to_result(row: Any, score: float | None = None, match: str | None = None) -> dict[str, Any]:
    lon = float(row["lon"]) if "lon" in row and row["lon"] is not None else None
    lat = float(row["lat"]) if "lat" in row and row["lat"] is not None else None
    result = {
        "id": str(row["id"]),
        "name": row["name"],
        "display_name": row["display_name"],
        "category": row["category"],
        "subcategory": row["subcategory"],
        "location": {"type": "Point", "coordinates": [round(lon, 6), round(lat, 6)]} if lon is not None and lat is not None else None,
        "osm_type": row["osm_type"],
        "osm_id": row["osm_id"],
    }
    if score is not None:
        result["score"] = round(float(score), 4)
    if match is not None:
        result["match"] = match
    if "distance_m" in row and row["distance_m"] is not None:
        result["distance_m"] = round(float(row["distance_m"]), 1)
    return result


def category_filter(query: str, category: str | None) -> tuple[str | None, str | None]:
    if category:
        normalized = normalize_text(category)
        if normalized in CATEGORY_QUERIES:
            return CATEGORY_QUERIES[normalized]
        resolved = resolve_category(category)
        if resolved:
            return resolved
        return category, None
    normalized_query = normalize_text(query)
    exact = CATEGORY_QUERIES.get(normalized_query)
    return exact or resolve_category(query) or (None, None)


def _plural_variant(value: str) -> str:
    if value.endswith("s") and len(value) > 3:
        return value[:-1]
    return value + "s"


def search_places(
    session: Session,
    query: str,
    category: str | None = None,
    limit: int = 10,
    offset: int = 0,
    lat: float | None = None,
    lon: float | None = None,
) -> list[dict[str, Any]]:
    normalized_query = normalize_text(query)
    if not normalized_query and not category:
        raise HTTPException(status_code=422, detail="q_or_category_required")
    limit = max(1, min(limit, 50))
    offset = max(0, offset)
    fetch_limit = min(2000, offset + limit + 50)
    category_key, category_value = category_filter(normalized_query, category)
    # A fuzzy category ("bloque a" ~ "bloque") must not hide an exact place name.
    # Search names first for fuzzy matches; category results remain the fallback.
    category_only_query = category is None and normalized_query in CATEGORY_QUERIES

    results: list[dict[str, Any]] = []
    seen: set[str] = set()

    if normalized_query and not category_only_query:
        variant = _plural_variant(normalized_query)
        rows = session.execute(
            text(
                f"""
                WITH candidates AS (
                    SELECT {RESULT_COLUMNS},
                        ST_X(p.location) AS lon,
                        ST_Y(p.location) AS lat,
                        CASE
                            WHEN p.name_normalized = :q THEN 1.0
                            WHEN p.name_normalized LIKE :q || '%' THEN 0.97
                            WHEN p.name_normalized LIKE '%' || :q || '%' THEN 0.92
                            WHEN p.search_text LIKE '%' || :q || '%' THEN 0.85
                            ELSE 0
                        END AS text_score,
                        GREATEST(
                            COALESCE(similarity(p.name_normalized, :q), 0),
                            CASE WHEN char_length(:q) >= 4
                                THEN COALESCE(word_similarity(:q, p.name_normalized), 0) * 0.95
                                ELSE 0
                            END
                        ) AS name_fuzzy_score,
                        similarity(p.search_text, :q) * 0.75 AS fuzzy_score,
                        GREATEST(
                            COALESCE(MAX(CASE
                                WHEN a.alias_normalized = :q THEN 0.99
                                WHEN a.alias_normalized LIKE :q || '%' THEN 0.96
                                WHEN a.alias_normalized LIKE '%' || :q || '%' THEN 0.90
                                ELSE 0
                            END), 0),
                            COALESCE(MAX(GREATEST(
                                similarity(a.alias_normalized, :q),
                                CASE WHEN char_length(:q) >= 4
                                    THEN word_similarity(:q, a.alias_normalized) * 0.95
                                    ELSE 0
                                END
                            )), 0) * 0.85
                        ) AS alias_score,
                        CASE WHEN CAST(:lat AS double precision) IS NULL THEN NULL ELSE
                            ST_Distance(
                                p.location::geography,
                                ST_SetSRID(ST_MakePoint(:lon, :lat), 4326)::geography
                            )
                        END AS distance_m
                    FROM places p
                    LEFT JOIN place_aliases a ON a.place_id = p.id
                    WHERE p.active
                      AND (CAST(:category_key AS text) IS NULL OR p.category = :category_key)
                      AND (CAST(:category_value AS text) IS NULL OR p.subcategory = :category_value)
                      AND (
                          p.name_normalized LIKE '%' || :q || '%'
                          OR p.name_normalized LIKE '%' || :variant || '%'
                          OR p.search_text LIKE '%' || :q || '%'
                          OR p.search_text LIKE '%' || :variant || '%'
                          OR a.alias_normalized LIKE '%' || :q || '%'
                          OR a.alias_normalized LIKE '%' || :variant || '%'
                          OR p.name_normalized % :q
                          OR p.name_normalized %> :q
                          OR p.search_text % :q
                          OR a.alias_normalized % :q
                          OR a.alias_normalized %> :q
                          OR similarity(p.search_text, :q) >= 0.25
                          OR similarity(a.alias_normalized, :q) >= 0.40
                      )
                    GROUP BY p.id
                )
                SELECT *, GREATEST(text_score, alias_score, name_fuzzy_score, fuzzy_score) AS score,
                    CASE
                        WHEN name_normalized = :q THEN 'exact_name'
                        WHEN alias_score >= 0.99 THEN 'exact_alias'
                        WHEN name_normalized LIKE :q || '%' THEN 'prefix_name'
                        WHEN alias_score >= 0.96 THEN 'prefix_alias'
                        WHEN text_score >= 0.92 THEN 'contains_name'
                        WHEN alias_score >= 0.90 THEN 'contains_alias'
                        ELSE 'fuzzy'
                    END AS match
                FROM candidates
                ORDER BY score DESC, distance_m ASC NULLS LAST, display_name ASC, id ASC
                LIMIT :fetch_limit
                """
            ),
            {
                "q": normalized_query,
                "variant": variant,
                "category_key": category_key,
                "category_value": category_value,
                "lat": lat,
                "lon": lon,
                "fetch_limit": fetch_limit,
            },
        ).mappings().all()
        for row in rows:
            item = _row_to_result(row, row["score"], row["match"])
            results.append(item)
            seen.add(item["id"])

    if category_key and len(results) < fetch_limit:
        category_rows = session.execute(
            text(
                f"""
                SELECT {RESULT_COLUMNS},
                    ST_X(p.location) AS lon,
                    ST_Y(p.location) AS lat,
                    CASE WHEN CAST(:lat AS double precision) IS NULL THEN NULL ELSE
                        ST_Distance(
                            p.location::geography,
                            ST_SetSRID(ST_MakePoint(:lon, :lat), 4326)::geography
                        )
                    END AS distance_m
                FROM places p
                WHERE p.active
                  AND p.category = :category_key
                  AND (CAST(:category_value AS text) IS NULL OR p.subcategory = :category_value)
                ORDER BY distance_m ASC NULLS LAST, p.display_name ASC, p.id ASC
                LIMIT :fetch_limit
                """
            ),
            {
                "category_key": category_key,
                "category_value": category_value,
                "lat": lat,
                "lon": lon,
                "fetch_limit": fetch_limit,
            },
        ).mappings().all()
        for row in category_rows:
            item = _row_to_result(row, 0.60, "category")
            if item["id"] not in seen:
                results.append(item)
                seen.add(item["id"])


    results.sort(key=lambda item: (-item.get("score", 0), item.get("distance_m", float("inf")), item["display_name"], item["id"]))
    return results[offset : offset + limit]


def nearby_places(
    session: Session,
    lat: float,
    lon: float,
    radius_m: float = 500,
    category: str | None = None,
    limit: int = 20,
    offset: int = 0,
) -> list[dict[str, Any]]:
    limit = max(1, min(limit, 100))
    offset = max(0, offset)
    radius_m = max(1, min(radius_m, 10000))
    category_key, category_value = category_filter("", category)
    rows = session.execute(
        text(
            f"""
            SELECT {RESULT_COLUMNS},
                ST_X(p.location) AS lon,
                ST_Y(p.location) AS lat,
                ST_Distance(
                    p.location::geography,
                    ST_SetSRID(ST_MakePoint(:lon, :lat), 4326)::geography
                ) AS distance_m
            FROM places p
            WHERE p.active
              AND ST_DWithin(
                  p.location::geography,
                  ST_SetSRID(ST_MakePoint(:lon, :lat), 4326)::geography,
                  :radius_m
              )
              AND (CAST(:category_key AS text) IS NULL OR (p.category = :category_key AND (CAST(:category_value AS text) IS NULL OR p.subcategory = :category_value)))
            ORDER BY distance_m ASC, p.display_name ASC, p.id ASC
            LIMIT :limit OFFSET :offset
            """
        ),
        {
            "lon": lon,
            "lat": lat,
            "radius_m": radius_m,
            "category_key": category_key,
            "category_value": category_value,
            "limit": limit,
            "offset": offset,
        },
    ).mappings().all()
    return [_row_to_result(row, None, "nearby") for row in rows]


def categories_summary(session: Session) -> list[dict[str, Any]]:
    rows = session.execute(
        text(
            """
            SELECT category, subcategory, count(*) AS count
            FROM places
            WHERE active
            GROUP BY category, subcategory
            ORDER BY category, subcategory NULLS FIRST
            """
        )
    ).mappings().all()
    return [
        {
            "category": row["category"],
            "subcategory": row["subcategory"],
            "label": category_label(row["category"], row["subcategory"]),
            "count": row["count"],
        }
        for row in rows
    ]


def get_place(session: Session, place_id: str) -> dict[str, Any] | None:
    row = session.execute(
        text(
            """
            SELECT p.*, ST_X(p.location) AS lon, ST_Y(p.location) AS lat,
                   ST_AsGeoJSON(p.geometry, 6) AS geometry_json
            FROM places p
            WHERE p.id = CAST(:place_id AS uuid) AND p.active
            """
        ),
        {"place_id": place_id},
    ).mappings().first()
    if row is None:
        return None
    aliases = [
        alias[0]
        for alias in session.execute(
            text("SELECT alias FROM place_aliases WHERE place_id = CAST(:place_id AS uuid) ORDER BY alias"),
            {"place_id": place_id},
        ).all()
    ]
    entrances = session.execute(
        text(
            """
            SELECT osm_node_id, entrance_type, verified, ST_X(geom) AS lon, ST_Y(geom) AS lat
            FROM place_entrances
            WHERE place_id = CAST(:place_id AS uuid) AND verified
            ORDER BY id
            """
        ),
        {"place_id": place_id},
    ).mappings().all()
    lon, lat = float(row["lon"]), float(row["lat"])
    return {
        "id": str(row["id"]),
        "osm_type": row["osm_type"],
        "osm_id": row["osm_id"],
        "name": row["name"],
        "display_name": row["display_name"],
        "name_source": row["name_source"],
        "category": row["category"],
        "subcategory": row["subcategory"],
        "description": row["description"],
        "location": {"type": "Point", "coordinates": [round(lon, 6), round(lat, 6)]},
        "geometry": json.loads(row["geometry_json"]),
        "geometry_valid": row["geometry_valid"],
        "tags": row["tags"],
        "aliases": aliases,
        "entrances": [
            {
                "osm_node_id": entrance["osm_node_id"],
                "entrance_type": entrance["entrance_type"],
                "verified": entrance["verified"],
                "location": {
                    "type": "Point",
                    "coordinates": [round(float(entrance["lon"]), 6), round(float(entrance["lat"]), 6)],
                },
            }
            for entrance in entrances
        ],
        "google_maps_url": google_maps_search_url(lat, lon),
    }

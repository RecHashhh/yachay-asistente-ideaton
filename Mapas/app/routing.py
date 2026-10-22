from __future__ import annotations

import json
from dataclasses import dataclass
from typing import Any

from sqlalchemy import text
from sqlalchemy.orm import Session

WALK_EDGES_SQL = """
    SELECT id, source, target, cost_walk AS cost, reverse_cost_walk AS reverse_cost
    FROM routing_edges
    WHERE pedestrian_allowed AND (cost_walk > 0 OR reverse_cost_walk > 0)
"""

DRIVE_EDGES_SQL = """
    SELECT id, source, target, cost_drive AS cost, reverse_cost_drive AS reverse_cost
    FROM routing_edges
    WHERE vehicle_allowed AND (cost_drive > 0 OR reverse_cost_drive > 0)
"""


@dataclass
class AccessPoint:
    node_id: int
    distance_m: float
    access: str
    component: int | None


def place_row(session: Session, place_id: str) -> dict[str, Any] | None:
    row = session.execute(
        text(
            """
            SELECT p.id, p.osm_type, p.name, p.display_name, p.category, p.subcategory,
                   ST_X(p.location) AS lon, ST_Y(p.location) AS lat
            FROM places p
            WHERE p.id = CAST(:place_id AS uuid) AND p.active
            """
        ),
        {"place_id": place_id},
    ).mappings().first()
    return dict(row) if row else None


def place_summary(row: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": str(row["id"]),
        "name": row["name"],
        "display_name": row["display_name"],
        "category": row["category"],
        "subcategory": row["subcategory"],
        "location": {
            "type": "Point",
            "coordinates": [round(float(row["lon"]), 6), round(float(row["lat"]), 6)],
        },
    }


def _entrances(session: Session, place_id: str) -> list[dict[str, float]]:
    rows = session.execute(
        text(
            """
            SELECT ST_X(geom) AS lon, ST_Y(geom) AS lat
            FROM place_entrances
            WHERE place_id = CAST(:place_id AS uuid) AND verified
            ORDER BY id
            """
        ),
        {"place_id": place_id},
    ).mappings().all()
    return [{"lon": float(row["lon"]), "lat": float(row["lat"])} for row in rows]


def can_snap_to_network(row: dict[str, Any]) -> bool:
    return row["category"] != "building"


def _nearby_nodes(session: Session, lon: float, lat: float, max_distance_m: float, mode: str) -> list[AccessPoint]:
    component_column = "component_walk" if mode == "walking" else "component_drive"
    point = "ST_SetSRID(ST_MakePoint(:lon, :lat), 4326)"
    rows = session.execute(
        text(
            f"""
            SELECT n.id, n.component_walk, n.component_drive,
                   ST_Distance(n.geom::geography, {point}::geography) AS distance_m
            FROM routing_nodes n
            WHERE n.{component_column} IS NOT NULL
              AND ST_DWithin(n.geom::geography, {point}::geography, :max_distance_m)
              AND NOT EXISTS (
                  SELECT 1
                  FROM places b
                  WHERE b.active
                    AND b.category = 'building'
                    AND ST_Contains(b.geometry, n.geom)
              )
            ORDER BY n.geom <-> {point}
            LIMIT 10
            """
        ),
        {"lon": lon, "lat": lat, "max_distance_m": max_distance_m},
    ).mappings().all()
    return [
        AccessPoint(
            node_id=int(row["id"]),
            distance_m=float(row["distance_m"]),
            access="nearest_network_node",
            component=row["component_walk"] if mode == "walking" else row["component_drive"],
        )
        for row in rows
    ]


def _access_candidates(session: Session, row: dict[str, Any], mode: str) -> tuple[list[AccessPoint], str | None]:
    entrances = _entrances(session, str(row["id"]))
    candidates = []
    for entrance in entrances:
        nearby = _nearby_nodes(session, entrance["lon"], entrance["lat"], 30, mode)
        if nearby:
            nearby[0].access = "verified_entrance"
            candidates.append(nearby[0])
    if candidates and row["category"] == "building":
        return candidates, None
    if can_snap_to_network(row):
        candidates.extend(_nearby_nodes(session, float(row["lon"]), float(row["lat"]), 100, mode))
    if candidates:
        return candidates, None
    if entrances or can_snap_to_network(row):
        return [], "no_nearby_routing_node"
    return [], "no_verified_entrance"


def _access_payload(access: AccessPoint) -> dict[str, Any]:
    return {
        "node_id": access.node_id,
        "distance_m": round(access.distance_m, 1),
        "access": access.access,
    }


def route_between_nodes(session: Session, start_node: int, end_node: int, mode: str) -> dict[str, Any]:
    if start_node == end_node:
        return {
            "status": "ok",
            "distance_m": 0.0,
            "duration_s": 0.0,
            "geometry": None,
            "steps": 0,
            "reason": "same_location",
        }
    edges_sql = WALK_EDGES_SQL if mode == "walking" else DRIVE_EDGES_SQL
    row = session.execute(
        text(
            """
            WITH route AS (
                SELECT * FROM pgr_dijkstra(
                    :edges_sql,
                    :start_node,
                    :end_node,
                    :directed
                )
            )
            SELECT
                count(*) FILTER (WHERE r.edge <> -1) AS steps,
                COALESCE(sum(e.length_m), 0) AS distance_m,
                COALESCE(sum(CASE WHEN :mode = 'walking' THEN e.walk_s ELSE e.drive_s END), 0) AS duration_s,
                ST_AsGeoJSON(
                    ST_LineMerge(
                        ST_Collect(
                            CASE WHEN r.node = e.source THEN e.geom ELSE ST_Reverse(e.geom) END
                            ORDER BY r.seq
                        )
                    ),
                    6
                ) AS geojson
            FROM route r
            JOIN routing_edges e ON e.id = r.edge
            WHERE r.edge <> -1
            """
        ),
        {
            "edges_sql": edges_sql,
            "start_node": start_node,
            "end_node": end_node,
            "directed": True,
            "mode": mode,
        },
    ).mappings().one()
    steps = int(row["steps"])
    if steps == 0:
        return {
            "status": "route_unavailable",
            "distance_m": None,
            "duration_s": None,
            "geometry": None,
            "steps": 0,
            "reason": "no_path",
        }
    geojson = row["geojson"]
    if geojson and session.scalar(
        text(
            """
            SELECT EXISTS (
                SELECT 1
                FROM places p
                WHERE p.active
                  AND p.category = 'building'
                  AND ST_Intersects(
                      p.geometry,
                      ST_SetSRID(ST_GeomFromGeoJSON(:geojson), 4326)
                  )
                  AND ST_Length(
                      ST_Intersection(
                          p.geometry,
                          ST_SetSRID(ST_GeomFromGeoJSON(:geojson), 4326)
                      )::geography
                  ) > 0.5
            )
            """
        ),
        {"geojson": geojson},
    ):
        return {
            "status": "route_unavailable",
            "distance_m": None,
            "duration_s": None,
            "geometry": None,
            "steps": 0,
            "reason": "route_crosses_building",
        }
    geometry = json.loads(geojson) if geojson else None
    return {
        "status": "ok",
        "distance_m": round(float(row["distance_m"]), 1),
        "duration_s": round(float(row["duration_s"]), 1),
        "geometry": geometry,
        "steps": steps,
        "reason": None,
    }


def route_places(session: Session, origin_id: str, destination_id: str, mode: str) -> dict[str, Any]:
    origin = place_row(session, origin_id)
    destination = place_row(session, destination_id)
    if origin is None or destination is None:
        return {
            "status": "not_found",
            "reason": "origin_not_found" if origin is None else "destination_not_found",
            "origin": place_summary(origin) if origin else None,
            "destination": place_summary(destination) if destination else None,
            "mode": mode,
        }
    origin_candidates, origin_reason = _access_candidates(session, origin, mode)
    destination_candidates, destination_reason = _access_candidates(session, destination, mode)
    if not origin_candidates or not destination_candidates:
        return {
            "status": "route_unavailable",
            "reason": origin_reason if not origin_candidates else destination_reason,
            "origin": place_summary(origin),
            "destination": place_summary(destination),
            "mode": mode,
            "access": {"origin": None, "destination": None},
        }
    best: dict[str, Any] | None = None
    best_origin: AccessPoint | None = None
    best_destination: AccessPoint | None = None
    failure_reasons: set[str] = set()
    for origin_access in origin_candidates:
        for destination_access in destination_candidates:
            if origin_access.node_id == destination_access.node_id and origin_id != destination_id:
                continue
            if (
                origin_access.component is None
                or destination_access.component is None
                or origin_access.component != destination_access.component
            ):
                failure_reasons.add("disconnected_components")
                continue
            result = route_between_nodes(session, origin_access.node_id, destination_access.node_id, mode)
            if result["status"] == "ok":
                if best is None or float(result["distance_m"] or 0) < float(best["distance_m"] or 0):
                    best = result
                    best_origin = origin_access
                    best_destination = destination_access
            else:
                failure_reasons.add(result.get("reason") or "no_path")
    if best is None:
        if "route_crosses_building" in failure_reasons:
            reason = "route_crosses_building"
        elif failure_reasons == {"disconnected_components"}:
            reason = "disconnected_components"
        else:
            reason = "no_path"
        return {
            "status": "route_unavailable",
            "reason": reason,
            "origin": place_summary(origin),
            "destination": place_summary(destination),
            "mode": mode,
            "access": {"origin": None, "destination": None},
        }
    best.update(
        {
            "origin": place_summary(origin),
            "destination": place_summary(destination),
            "mode": mode,
            "access": {
                "origin": _access_payload(best_origin),
                "destination": _access_payload(best_destination),
            },
        }
    )
    return best


def navigation_point(session: Session, place_id: str) -> dict[str, Any] | None:
    row = place_row(session, place_id)
    if row is None:
        return None
    entrances = _entrances(session, place_id)
    if entrances:
        entrance = entrances[0]
        return {
            "place": place_summary(row),
            "lat": entrance["lat"],
            "lon": entrance["lon"],
            "coordinate_source": "verified_entrance",
        }
    return {
        "place": place_summary(row),
        "lat": float(row["lat"]),
        "lon": float(row["lon"]),
        "coordinate_source": "place_reference",
    }

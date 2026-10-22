from __future__ import annotations

import argparse
import json
import logging
import os
import uuid
from collections import Counter
from pathlib import Path
from typing import Any

from sqlalchemy import text
from sqlalchemy.orm import Session

from .config import get_settings
from .db import SessionLocal
from .models import ImportBatch
from .osm import (
    OsmData,
    apply_place_override,
    aliases_for,
    category_for_tags,
    display_name_for,
    highway_profile,
    line_wkt,
    normalize_text,
    parse_osm,
    point_wkt,
    search_text_for,
    sha256_file,
    way_geometry,
)

logger = logging.getLogger("yachay_maps.import")

PLACE_NAMESPACE = uuid.UUID("6f9619ff-8b86-d011-b42d-00c04fc964ff")


def json_value(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"))


def entrance_is_verified(tags: dict[str, str]) -> bool:
    return tags.get("yachay:access_review") == "verified" or tags.get("yachay:verification") == "verified"


def upsert_nodes(session: Session, data: OsmData, batch_id: int) -> None:
    rows = []
    for osm_id, node in data.nodes.items():
        deleted = bool(node["deleted"])
        geom = None if deleted else point_wkt(node["lat"], node["lon"])
        rows.append(
            {
                "osm_id": osm_id,
                "lat": None if deleted else node["lat"],
                "lon": None if deleted else node["lon"],
                "geom": geom,
                "tags": json_value(node["tags"]),
                "action": node["action"],
                "visible": node["visible"],
                "version": node["version"],
                "changeset": node["changeset"],
                "osm_timestamp": node["timestamp"],
                "osm_uid": node["uid"],
                "osm_user": node["user"],
                "deleted": deleted,
                "batch_id": batch_id,
            }
        )
    if not rows:
        return
    session.execute(
        text(
            """
            INSERT INTO osm_nodes (
                osm_id, lat, lon, geom, tags, action, visible, version, changeset,
                osm_timestamp, osm_uid, osm_user, deleted, import_batch_id, updated_at
            ) VALUES (
                :osm_id, :lat, :lon,
                CASE WHEN CAST(:geom AS text) IS NULL THEN NULL ELSE ST_GeomFromText(CAST(:geom AS text), 4326) END,
                CAST(:tags AS jsonb), :action, :visible, :version, :changeset,
                :osm_timestamp, :osm_uid, :osm_user, :deleted, :batch_id, now()
            )
            ON CONFLICT (osm_id) DO UPDATE SET
                lat = EXCLUDED.lat,
                lon = EXCLUDED.lon,
                geom = EXCLUDED.geom,
                tags = EXCLUDED.tags,
                action = EXCLUDED.action,
                visible = EXCLUDED.visible,
                version = EXCLUDED.version,
                changeset = EXCLUDED.changeset,
                osm_timestamp = EXCLUDED.osm_timestamp,
                osm_uid = EXCLUDED.osm_uid,
                osm_user = EXCLUDED.osm_user,
                deleted = EXCLUDED.deleted,
                import_batch_id = EXCLUDED.import_batch_id,
                updated_at = now()
            """
        ),
        rows,
    )


def upsert_ways(session: Session, data: OsmData, batch_id: int, issues: list[dict[str, Any]]) -> dict[int, str | None]:
    rows = []
    geoms: dict[int, str | None] = {}
    for osm_id, way in data.ways.items():
        deleted = bool(way["deleted"])
        geom = None
        closed = False
        if not deleted:
            geom, closed, missing = way_geometry(way, data.nodes)
            if missing:
                issues.append(
                    {
                        "code": "way_missing_nodes",
                        "osm_type": "way",
                        "osm_id": osm_id,
                        "missing_nodes": missing[:20],
                    }
                )
        geoms[osm_id] = geom
        rows.append(
            {
                "osm_id": osm_id,
                "nodes": way["nodes"],
                "tags": json_value(way["tags"]),
                "geom": geom,
                "closed": closed,
                "deleted": deleted,
                "batch_id": batch_id,
            }
        )
    if not rows:
        return geoms
    session.execute(
        text(
            """
            INSERT INTO osm_ways (osm_id, nodes, tags, geom, closed, deleted, import_batch_id, updated_at)
            VALUES (
                :osm_id, CAST(:nodes AS bigint[]), CAST(:tags AS jsonb),
                CASE WHEN CAST(:geom AS text) IS NULL THEN NULL ELSE ST_GeomFromText(CAST(:geom AS text), 4326) END,
                :closed, :deleted, :batch_id, now()
            )
            ON CONFLICT (osm_id) DO UPDATE SET
                nodes = EXCLUDED.nodes,
                tags = EXCLUDED.tags,
                geom = EXCLUDED.geom,
                closed = EXCLUDED.closed,
                deleted = EXCLUDED.deleted,
                import_batch_id = EXCLUDED.import_batch_id,
                updated_at = now()
            """
        ),
        rows,
    )
    return geoms


def upsert_relations(session: Session, data: OsmData, batch_id: int, issues: list[dict[str, Any]]) -> None:
    rows = []
    for osm_id, relation in data.relations.items():
        rows.append(
            {
                "osm_id": osm_id,
                "members": json_value(relation["members"]),
                "tags": json_value(relation["tags"]),
                "deleted": bool(relation["deleted"]),
                "batch_id": batch_id,
            }
        )
    if rows:
        session.execute(
            text(
                """
                INSERT INTO osm_relations (osm_id, members, tags, geom, deleted, import_batch_id, updated_at)
                VALUES (:osm_id, CAST(:members AS jsonb), CAST(:tags AS jsonb), NULL, :deleted, :batch_id, now())
                ON CONFLICT (osm_id) DO UPDATE SET
                    members = EXCLUDED.members,
                    tags = EXCLUDED.tags,
                    geom = EXCLUDED.geom,
                    deleted = EXCLUDED.deleted,
                    import_batch_id = EXCLUDED.import_batch_id,
                    updated_at = now()
                """
            ),
            rows,
        )

    for osm_id, relation in data.active_relations.items():
        members = relation["members"]
        outer = [member["ref"] for member in members if member["type"] == "way" and member["role"] == "outer" and member["ref"]]
        inner = [member["ref"] for member in members if member["type"] == "way" and member["role"] == "inner" and member["ref"]]
        if not outer:
            continue
        result = session.execute(
            text(
                """
                SELECT ST_AsText(
                    ST_CollectionExtract(
                        ST_MakeValid(
                            ST_Difference(
                                COALESCE(
                                    (SELECT ST_Union(w.geom) FROM osm_ways w
                                     WHERE w.osm_id = ANY(:outer) AND NOT w.deleted AND w.geom IS NOT NULL),
                                    ST_GeomFromText('POLYGON EMPTY', 4326)
                                ),
                                COALESCE(
                                    (SELECT ST_Union(w.geom) FROM osm_ways w
                                     WHERE w.osm_id = ANY(:inner) AND NOT w.deleted AND w.geom IS NOT NULL),
                                    ST_GeomFromText('POLYGON EMPTY', 4326)
                                )
                            )
                        ),
                        3
                    )
                ) AS wkt
                """
            ),
            {"outer": outer, "inner": inner},
        ).one()
        wkt = result.wkt
        if not wkt or wkt.startswith("POLYGON EMPTY") or wkt.startswith("MULTIPOLYGON EMPTY"):
            issues.append(
                {
                    "code": "relation_geometry_unavailable",
                    "osm_type": "relation",
                    "osm_id": osm_id,
                    "reason": "no se pudo construir un polígono válido con los miembros outer",
                }
            )
            continue
        session.execute(
            text("UPDATE osm_relations SET geom = ST_GeomFromText(:wkt, 4326) WHERE osm_id = :osm_id"),
            {"wkt": wkt, "osm_id": osm_id},
        )


def place_candidates(
    session: Session,
    data: OsmData,
    way_geoms: dict[int, str | None],
    issues: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    candidates: list[dict[str, Any]] = []
    for osm_id, node in data.active_nodes.items():
        tags = node["tags"]
        name = tags.get("name") or None
        category = category_for_tags(tags, bool(name))
        if category is None:
            continue
        if node["lat"] is None or node["lon"] is None:
            continue
        display_name, resolved_name, name_source, description = display_name_for(tags, *category)
        aliases = aliases_for(tags, resolved_name, description)
        override = apply_place_override(tags, category)
        custom_tags: dict[str, str] = {}
        if override:
            resolved_name = override["name"]
            display_name = override["name"]
            name_source = "application_override"
            category = (override["category"], override["subcategory"])
            custom_tags = override["custom_tags"]
            known_aliases = {normalize_text(alias) for alias, _source in aliases}
            aliases.extend(
                (alias, "application_override")
                for alias in override["aliases"]
                if normalize_text(alias) not in known_aliases
            )
        candidates.append(
            {
                "osm_type": "node",
                "osm_id": osm_id,
                "tags": tags,
                "name": resolved_name,
                "display_name": display_name,
                "name_source": name_source,
                "category": category[0],
                "subcategory": category[1],
                "description": description,
                "custom_tags": custom_tags,
                "geometry": point_wkt(node["lat"], node["lon"]),
                "aliases": aliases,
                "search_text": search_text_for(display_name, tags, category[0], category[1], aliases),
            }
        )

    for osm_id, way in data.active_ways.items():
        tags = way["tags"]
        if "highway" in tags:
            continue
        name = tags.get("name") or None
        category = category_for_tags(tags, bool(name))
        if category is None:
            continue
        geometry = way_geoms.get(osm_id)
        if not geometry:
            continue
        display_name, resolved_name, name_source, description = display_name_for(tags, *category)
        aliases = aliases_for(tags, resolved_name, description)
        override = apply_place_override(tags, category)
        custom_tags: dict[str, str] = {}
        if override:
            resolved_name = override["name"]
            display_name = override["name"]
            name_source = "application_override"
            category = (override["category"], override["subcategory"])
            custom_tags = override["custom_tags"]
            known_aliases = {normalize_text(alias) for alias, _source in aliases}
            aliases.extend(
                (alias, "application_override")
                for alias in override["aliases"]
                if normalize_text(alias) not in known_aliases
            )
        candidates.append(
            {
                "osm_type": "way",
                "osm_id": osm_id,
                "tags": tags,
                "name": resolved_name,
                "display_name": display_name,
                "name_source": name_source,
                "category": category[0],
                "subcategory": category[1],
                "description": description,
                "custom_tags": custom_tags,
                "geometry": geometry,
                "aliases": aliases,
                "search_text": search_text_for(display_name, tags, category[0], category[1], aliases),
            }
        )

    relation_rows = session.execute(
        text(
            """
            SELECT osm_id, tags, ST_AsText(geom) AS wkt
            FROM osm_relations
            WHERE NOT deleted AND geom IS NOT NULL
            """
        )
    ).all()
    for row in relation_rows:
        tags = row.tags or {}
        if tags.get("boundary") or tags.get("type") == "boundary":
            continue
        name = tags.get("name") or None
        category = category_for_tags(tags, bool(name))
        if category is None:
            continue
        if not row.wkt:
            continue
        display_name, resolved_name, name_source, description = display_name_for(tags, *category)
        aliases = aliases_for(tags, resolved_name, description)
        override = apply_place_override(tags, category)
        custom_tags: dict[str, str] = {}
        if override:
            resolved_name = override["name"]
            display_name = override["name"]
            name_source = "application_override"
            category = (override["category"], override["subcategory"])
            custom_tags = override["custom_tags"]
            known_aliases = {normalize_text(alias) for alias, _source in aliases}
            aliases.extend(
                (alias, "application_override")
                for alias in override["aliases"]
                if normalize_text(alias) not in known_aliases
            )
        candidates.append(
            {
                "osm_type": "relation",
                "osm_id": row.osm_id,
                "tags": tags,
                "name": resolved_name,
                "display_name": display_name,
                "name_source": name_source,
                "category": category[0],
                "subcategory": category[1],
                "description": description,
                "custom_tags": custom_tags,
                "geometry": row.wkt,
                "aliases": aliases,
                "search_text": search_text_for(display_name, tags, category[0], category[1], aliases),
            }
        )
    return candidates


def upsert_places(session: Session, candidates: list[dict[str, Any]], batch_id: int) -> None:
    rows = []
    for candidate in candidates:
        rows.append(
            {
                "id": str(uuid.uuid5(PLACE_NAMESPACE, f"{candidate['osm_type']}/{candidate['osm_id']}")),
                "osm_type": candidate["osm_type"],
                "osm_id": candidate["osm_id"],
                "name": candidate["name"],
                "name_normalized": normalize_text(candidate["name"]) or None,
                "display_name": candidate["display_name"],
                "name_source": candidate["name_source"],
                "category": candidate["category"],
                "subcategory": candidate["subcategory"],
                "description": candidate["description"],
                "geometry": candidate["geometry"],
                "tags": json_value(candidate["tags"]),
                "custom_tags": json_value(candidate.get("custom_tags", {})),
                "search_text": candidate["search_text"],
                "batch_id": batch_id,
            }
        )
    if not rows:
        return
    session.execute(
        text(
            """
            INSERT INTO places (
                id, osm_type, osm_id, name, name_normalized, display_name, name_source,
                category, subcategory, description, location, geometry, tags, custom_tags, search_text,
                geometry_valid, active, import_batch_id, created_at, updated_at
            ) VALUES (
                CAST(:id AS uuid), :osm_type, :osm_id, :name, :name_normalized, :display_name, :name_source,
                :category, :subcategory, :description,
                ST_PointOnSurface(ST_GeomFromText(:geometry, 4326)),
                ST_GeomFromText(:geometry, 4326),
                CAST(:tags AS jsonb), CAST(:custom_tags AS jsonb), :search_text,
                ST_IsValid(ST_GeomFromText(:geometry, 4326)),
                true, :batch_id, now(), now()
            )
            ON CONFLICT (osm_type, osm_id) DO UPDATE SET
                name = EXCLUDED.name,
                name_normalized = EXCLUDED.name_normalized,
                display_name = EXCLUDED.display_name,
                name_source = EXCLUDED.name_source,
                category = EXCLUDED.category,
                subcategory = EXCLUDED.subcategory,
                description = EXCLUDED.description,
                location = EXCLUDED.location,
                geometry = EXCLUDED.geometry,
                tags = EXCLUDED.tags,
                custom_tags = EXCLUDED.custom_tags,
                search_text = EXCLUDED.search_text,
                geometry_valid = EXCLUDED.geometry_valid,
                active = true,
                import_batch_id = EXCLUDED.import_batch_id,
                updated_at = now()
            """
        ),
        rows,
    )
    session.execute(
        text(
            """
            UPDATE places SET active = false
            WHERE import_batch_id IS DISTINCT FROM :batch_id
            """
        ),
        {"batch_id": batch_id},
    )
    session.execute(
        text(
            """
            UPDATE places
            SET geometry = CASE
                    WHEN ST_IsEmpty(ST_CollectionExtract(ST_MakeValid(geometry), 3)) THEN geometry
                    ELSE ST_CollectionExtract(ST_MakeValid(geometry), 3)
                END
            WHERE NOT geometry_valid
              AND GeometryType(geometry) IN ('POLYGON', 'MULTIPOLYGON')
            """
        )
    )
    session.execute(text("UPDATE places SET location = ST_PointOnSurface(geometry) WHERE active"))


def upsert_aliases(session: Session, candidates: list[dict[str, Any]], batch_id: int) -> None:
    session.execute(
        text(
            """
            DELETE FROM place_aliases
            WHERE place_id IN (SELECT id FROM places WHERE import_batch_id = :batch_id)
            """
        ),
        {"batch_id": batch_id},
    )
    rows = []
    for candidate in candidates:
        place_id = str(uuid.uuid5(PLACE_NAMESPACE, f"{candidate['osm_type']}/{candidate['osm_id']}"))
        for alias, source in candidate["aliases"]:
            rows.append(
                {
                    "place_id": place_id,
                    "alias": alias[:500],
                    "alias_normalized": normalize_text(alias),
                    "source": source,
                }
            )
    if not rows:
        return
    session.execute(
        text(
            """
            INSERT INTO place_aliases (place_id, alias, alias_normalized, source)
            VALUES (CAST(:place_id AS uuid), :alias, :alias_normalized, :source)
            ON CONFLICT (place_id, alias_normalized) DO UPDATE SET
                alias = EXCLUDED.alias,
                source = EXCLUDED.source
            """
        ),
        rows,
    )


def rebuild_entrances(session: Session, data: OsmData, issues: list[dict[str, Any]]) -> int:
    session.execute(text("DELETE FROM place_entrances"))
    rows = []
    for osm_id, node in data.active_nodes.items():
        tags = node["tags"]
        if "entrance" not in tags or node["lat"] is None or node["lon"] is None:
            continue
        geom = point_wkt(node["lat"], node["lon"])
        result = session.execute(
            text(
                """
                SELECT p.id
                FROM places p
                WHERE p.active
                  AND p.osm_type = 'way'
                  AND (p.tags ? 'building' OR p.category = 'building')
                  AND ST_DWithin(
                      p.geometry::geography,
                      ST_GeomFromText(:geom, 4326)::geography,
                      2
                  )
                ORDER BY
                  ST_Distance(
                      p.geometry::geography,
                      ST_GeomFromText(:geom, 4326)::geography
                  ) ASC,
                  ST_Area(p.geometry::geography) ASC
                LIMIT 1
                """
            ),
            {"geom": geom},
        ).first()
        if result is None:
            issues.append(
                {
                    "code": "entrance_without_building",
                    "osm_type": "node",
                    "osm_id": osm_id,
                }
            )
            continue
        rows.append(
            {
                "place_id": str(result.id),
                "osm_node_id": osm_id,
                "geom": geom,
                "entrance_type": tags.get("entrance"),
                "verified": entrance_is_verified(tags),
                "tags": json_value(tags),
            }
        )
    if rows:
        session.execute(
            text(
                """
                INSERT INTO place_entrances (place_id, osm_node_id, geom, entrance_type, verified, source, tags)
                VALUES (
                    CAST(:place_id AS uuid), :osm_node_id,
                    ST_GeomFromText(:geom, 4326), :entrance_type, :verified, 'osm', CAST(:tags AS jsonb)
                )
                ON CONFLICT (osm_node_id) DO NOTHING
                """
            ),
            rows,
        )
    return len(rows)


def rebuild_routing(session: Session, data: OsmData, issues: list[dict[str, Any]]) -> dict[str, Any]:
    session.execute(text("TRUNCATE routing_edges, routing_nodes RESTART IDENTITY"))

    node_rows: dict[int, dict[str, Any]] = {}
    edge_rows: list[dict[str, Any]] = []
    skipped_ways = 0
    for osm_id, way in data.active_ways.items():
        tags = way["tags"]
        if "highway" not in tags:
            continue
        profile = highway_profile(tags)
        if not profile["pedestrian_allowed"] and not profile["vehicle_allowed"]:
            skipped_ways += 1
            continue
        missing_refs = [ref for ref in way["nodes"] if ref not in data.active_nodes]
        if missing_refs:
            issues.append(
                {
                    "code": "way_missing_routing_nodes",
                    "osm_type": "way",
                    "osm_id": osm_id,
                    "missing_nodes": missing_refs[:20],
                }
            )
            skipped_ways += 1
            continue
        refs = way["nodes"]
        if len(refs) < 2:
            continue
        seq = 0
        for start_ref, end_ref in zip(refs, refs[1:]):
            if start_ref == end_ref:
                continue
            start_node = data.active_nodes[start_ref]
            end_node = data.active_nodes[end_ref]
            if start_node["lat"] is None or end_node["lat"] is None:
                continue
            if (start_node["lat"], start_node["lon"]) == (end_node["lat"], end_node["lon"]):
                continue
            seq += 1
            node_rows[start_ref] = {
                "osm_node_id": start_ref,
                "geom": point_wkt(start_node["lat"], start_node["lon"]),
            }
            node_rows[end_ref] = {
                "osm_node_id": end_ref,
                "geom": point_wkt(end_node["lat"], end_node["lon"]),
            }
            edge_rows.append(
                {
                    "osm_way_id": osm_id,
                    "seq": seq,
                    "source_ref": start_ref,
                    "target_ref": end_ref,
                    "geom": line_wkt(
                        [
                            (start_node["lat"], start_node["lon"]),
                            (end_node["lat"], end_node["lon"]),
                        ]
                    ),
                    "highway_type": profile["highway_type"],
                    "pedestrian_allowed": profile["pedestrian_allowed"],
                    "vehicle_allowed": profile["vehicle_allowed"],
                    "oneway": profile["oneway"],
                    "oneway_foot": profile["oneway_foot"],
                    "bridge": profile["bridge"],
                    "tunnel": profile["tunnel"],
                    "layer": profile["layer"],
                    "access": profile["access"],
                    "surface": profile["surface"],
                }
            )

    if not node_rows or not edge_rows:
        issues.append({"code": "routing_graph_empty"})
        return {
            "routing_nodes": 0,
            "routing_edges": 0,
            "routing_ways": 0,
            "skipped_ways": skipped_ways,
            "length_m": 0.0,
            "walk_components": 0,
            "drive_components": 0,
            "isolated_walk_nodes": 0,
            "isolated_drive_nodes": 0,
            "self_loops": 0,
        }

    session.execute(
        text(
            """
            INSERT INTO routing_nodes (osm_node_id, geom)
            VALUES (:osm_node_id, ST_GeomFromText(:geom, 4326))
            ON CONFLICT (osm_node_id) DO NOTHING
            """
        ),
        list(node_rows.values()),
    )
    id_map = {
        row.osm_node_id: row.id
        for row in session.execute(text("SELECT osm_node_id, id FROM routing_nodes")).all()
    }
    for edge in edge_rows:
        edge["source"] = id_map[edge.pop("source_ref")]
        edge["target"] = id_map[edge.pop("target_ref")]
    session.execute(
        text(
            """
            INSERT INTO routing_edges (
                osm_way_id, seq, source, target, geom, highway_type,
                pedestrian_allowed, vehicle_allowed, oneway, oneway_foot,
                bridge, tunnel, layer, access, surface
            ) VALUES (
                :osm_way_id, :seq, :source, :target, ST_GeomFromText(:geom, 4326), :highway_type,
                :pedestrian_allowed, :vehicle_allowed, :oneway, :oneway_foot,
                :bridge, :tunnel, :layer, :access, :surface
            )
            """
        ),
        edge_rows,
    )
    session.execute(
        text(
            """
            UPDATE routing_edges
            SET length_m = ST_Length(geom::geography),
                walk_s = ST_Length(geom::geography) / :walk_speed,
                drive_s = ST_Length(geom::geography) / (
                    CASE highway_type
                        WHEN 'motorway' THEN 80
                        WHEN 'trunk' THEN 60
                        WHEN 'primary' THEN 50
                        WHEN 'secondary' THEN 40
                        WHEN 'tertiary' THEN 30
                        WHEN 'residential' THEN 20
                        WHEN 'unclassified' THEN 20
                        WHEN 'living_street' THEN 10
                        WHEN 'service' THEN 15
                        WHEN 'track' THEN 15
                        ELSE 20
                    END / 3.6
                )
            """
        ),
        {"walk_speed": 1.4},
    )
    session.execute(
        text(
            """
            UPDATE routing_edges
            SET cost_walk = CASE
                    WHEN NOT pedestrian_allowed THEN -1
                    WHEN oneway_foot = '-1' THEN -1
                    ELSE walk_s
                END,
                reverse_cost_walk = CASE
                    WHEN NOT pedestrian_allowed THEN -1
                    WHEN oneway_foot = 'yes' THEN -1
                    ELSE walk_s
                END,
                cost_drive = CASE
                    WHEN NOT vehicle_allowed THEN -1
                    WHEN oneway = '-1' THEN -1
                    ELSE drive_s
                END,
                reverse_cost_drive = CASE
                    WHEN NOT vehicle_allowed THEN -1
                    WHEN oneway = 'yes' THEN -1
                    ELSE drive_s
                END
            """
        )
    )
    session.execute(
        text(
            """
            UPDATE routing_nodes SET component_walk = NULL, component_drive = NULL;
            UPDATE routing_nodes n
            SET component_walk = c.component
            FROM pgr_connectedComponents(
                'SELECT id, source, target, cost_walk AS cost, reverse_cost_walk AS reverse_cost
                 FROM routing_edges
                 WHERE pedestrian_allowed AND (cost_walk > 0 OR reverse_cost_walk > 0)'
            ) c
            WHERE n.id = c.node;
            UPDATE routing_nodes n
            SET component_drive = c.component
            FROM pgr_strongComponents(
                'SELECT id, source, target, cost_drive AS cost, reverse_cost_drive AS reverse_cost
                 FROM routing_edges
                 WHERE vehicle_allowed AND (cost_drive > 0 OR reverse_cost_drive > 0)'
            ) c
            WHERE n.id = c.node;
            """
        )
    )
    stats = session.execute(
        text(
            """
            SELECT
                (SELECT count(*) FROM routing_nodes) AS routing_nodes,
                (SELECT count(*) FROM routing_edges) AS routing_edges,
                (SELECT count(DISTINCT osm_way_id) FROM routing_edges) AS routing_ways,
                (SELECT COALESCE(sum(length_m), 0) FROM routing_edges) AS length_m,
                (SELECT count(DISTINCT component_walk) FROM routing_nodes WHERE component_walk IS NOT NULL) AS walk_components,
                (SELECT count(DISTINCT component_drive) FROM routing_nodes WHERE component_drive IS NOT NULL) AS drive_components,
                (SELECT count(*) FROM (
                    SELECT component_walk FROM routing_nodes
                    WHERE component_walk IS NOT NULL
                    GROUP BY component_walk HAVING count(*) = 1
                ) isolated_walk) AS isolated_walk_nodes,
                (SELECT count(*) FROM (
                    SELECT component_drive FROM routing_nodes
                    WHERE component_drive IS NOT NULL
                    GROUP BY component_drive HAVING count(*) = 1
                ) isolated_drive) AS isolated_drive_nodes,
                (SELECT count(*) FROM routing_edges WHERE source = target) AS self_loops
            """
        )
    ).mappings().one()
    result = dict(stats)
    result["length_m"] = float(result["length_m"])
    result["skipped_ways"] = skipped_ways
    if result["walk_components"] > 1:
        issues.append(
            {
                "code": "walking_graph_disconnected",
                "components": result["walk_components"],
            }
        )
    if result["drive_components"] > 1:
        issues.append(
            {
                "code": "driving_graph_disconnected",
                "components": result["drive_components"],
            }
        )
    return result


def import_osm(session: Session, path: Path, source_path: str | None = None) -> int:
    if not path.exists():
        raise FileNotFoundError(f"No existe el archivo OSM: {path}")
    data = parse_osm(path)
    digest = sha256_file(path)
    issues: list[dict[str, Any]] = []
    batch = ImportBatch(
        source_path=source_path or str(path),
        source_sha256=digest,
        source_bytes=path.stat().st_size,
        osm_version=data.version,
        generator=data.generator,
        status="running",
    )
    session.add(batch)
    session.flush()
    batch_id = batch.id

    try:
        upsert_nodes(session, data, batch_id)
        way_geoms = upsert_ways(session, data, batch_id, issues)
        upsert_relations(session, data, batch_id, issues)
        candidates = place_candidates(session, data, way_geoms, issues)
        upsert_places(session, candidates, batch_id)
        upsert_aliases(session, candidates, batch_id)
        entrance_count = rebuild_entrances(session, data, issues)
        verified_entrance_count = int(
            session.scalar(text("SELECT count(*) FROM place_entrances WHERE verified")) or 0
        )
        routing_stats = rebuild_routing(session, data, issues)
        session.execute(text("ANALYZE places; ANALYZE osm_ways; ANALYZE routing_nodes; ANALYZE routing_edges"))

        stats = {
            "source_path": str(path),
            "source_sha256": digest,
            "source_bytes": path.stat().st_size,
            "bounds": data.bounds,
            "osm_version": data.version,
            "generator": data.generator,
            "nodes_total": len(data.nodes),
            "nodes_active": len(data.active_nodes),
            "nodes_deleted": len(data.nodes) - len(data.active_nodes),
            "ways_total": len(data.ways),
            "ways_active": len(data.active_ways),
            "ways_deleted": len(data.ways) - len(data.active_ways),
            "relations_total": len(data.relations),
            "relations_active": len(data.active_relations),
            "relations_deleted": len(data.relations) - len(data.active_relations),
            "highway_ways": sum(1 for way in data.active_ways.values() if "highway" in way["tags"]),
            "places": len(candidates),
            "place_categories": dict(Counter(candidate["category"] for candidate in candidates)),
            "entrances": entrance_count,
            "verified_entrances": verified_entrance_count,
            "unverified_entrances": entrance_count - verified_entrance_count,
            "issues": issues,
            **routing_stats,
        }
        batch.status = "success"
        batch.stats = stats
        batch.issues = issues
        session.execute(
            text(
                """
                UPDATE import_batches
                SET finished_at = now(), status = 'success', stats = CAST(:stats AS jsonb), issues = CAST(:issues AS jsonb)
                WHERE id = :batch_id
                """
            ),
            {"stats": json_value(stats), "issues": json_value(issues), "batch_id": batch_id},
        )
        session.commit()
        logger.info(
            "Importación completa batch=%s sha256=%s lugares=%s aristas=%s componentes_peatonal=%s componentes_vehicular=%s",
            batch_id,
            digest,
            len(candidates),
            routing_stats["routing_edges"],
            routing_stats["walk_components"],
            routing_stats["drive_components"],
        )
        return batch_id
    except Exception as exc:
        session.rollback()
        failed = ImportBatch(
            source_path=source_path or str(path),
            source_sha256=digest,
            source_bytes=path.stat().st_size,
            osm_version=data.version,
            generator=data.generator,
            status="failed",
            stats={"error": str(exc), "issues": issues},
            issues=issues + [{"code": "import_failed", "error": str(exc)}],
        )
        session.add(failed)
        session.commit()
        logger.exception("Falló la importación del OSM")
        raise


def main() -> None:
    parser = argparse.ArgumentParser(description="Importa YACHAY_FINAL.osm a PostgreSQL/PostGIS/pgRouting")
    parser.add_argument("--osm", default=os.getenv("OSM_PATH", get_settings().osm_path), help="Ruta del archivo OSM")
    parser.add_argument("--source-path", default=None, help="Ruta lógica registrada en import_batches")
    args = parser.parse_args()
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")
    with SessionLocal() as session:
        import_osm(session, Path(args.osm), args.source_path)


if __name__ == "__main__":
    main()

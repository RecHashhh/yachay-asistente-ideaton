from __future__ import annotations

import uuid
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import text

from app.db import SessionLocal
from app.routing import route_between_nodes


def _search(client: TestClient, query: str, **params: object) -> list[dict]:
    response = client.get("/api/places/search", params={"q": query, **params})
    assert response.status_code == 200, response.text
    return response.json()["results"]


def _place_id(client: TestClient, name: str) -> str:
    results = _search(client, name, limit=10)
    for result in results:
        if result["display_name"] == name:
            return result["id"]
    raise AssertionError(f"No se encontró {name}: {[result['display_name'] for result in results]}")


def test_health_reports_import_and_extensions(client: TestClient) -> None:
    response = client.get("/health")
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "ok"
    assert body["postgis"].startswith("3.")
    assert body["pgrouting"]
    assert body["import"]["sha256"]
    assert body["places"] > 0
    assert body["routing_edges"] > 0


def test_map_config_and_features(client: TestClient) -> None:
    config = client.get("/api/map/config")
    assert config.status_code == 200
    config_body = config.json()
    assert config_body["srid"] == 4326
    assert config_body["coordinate_order"] == "lon,lat"
    assert config_body["bounds"][0] < config_body["bounds"][2]

    features = client.get(
        "/api/map/features",
        params={"bbox": "-78.18,0.403,-78.168,0.409", "limit": 100},
    )
    assert features.status_code == 200
    body = features.json()
    assert body["type"] == "FeatureCollection"
    assert body["features"]
    assert all(feature["geometry"] for feature in body["features"])


def test_search_finds_exact_place_with_location(client: TestClient) -> None:
    results = _search(client, "Bloque A")
    assert results
    first = results[0]
    assert first["display_name"] == "Bloque A"
    assert first["match"] == "exact_name"
    assert first["location"]["type"] == "Point"
    assert len(first["location"]["coordinates"]) == 2


def test_search_category_fallback_returns_all_toilets(client: TestClient) -> None:
    response = client.get("/api/places/search", params={"q": "baños", "limit": 10})
    assert response.status_code == 200
    results = response.json()["results"]
    assert len(results) >= 4
    assert all(result["subcategory"] == "toilets" for result in results)


def test_patomar_override_is_searchable_by_name_and_internal_categories(client: TestClient) -> None:
    with SessionLocal() as session:
        rows = session.execute(
            text(
                """SELECT id, category, subcategory, tags, custom_tags
                   FROM places WHERE active AND name_normalized = 'patomar'"""
            )
        ).mappings().all()
    assert len(rows) == 1
    place = rows[0]
    assert (place["category"], place["subcategory"]) == ("entertainment", "karaoke")
    assert place["tags"]["building"] == "yes"
    assert place["custom_tags"] == {"amenity": "karaoke", "leisure": "entertainment"}
    with SessionLocal() as session:
        aliases = set(session.scalars(text("SELECT alias FROM place_aliases WHERE place_id = :id"), {"id": place["id"]}))
    assert {"karaoke", "karaoke patomar", "centro de diversión", "lugar de diversión", "lugar de entretenimiento"} <= aliases
    for query in ("Patomar", "karaoke", "centro de diversión", "lugar de diversión", "entretenimiento", "recreativo"):
        results = _search(client, query)
        assert any(item["id"] == str(place["id"]) for item in results), query


def test_patomar_can_be_used_as_route_origin(client: TestClient) -> None:
    origin = _place_id(client, "Patomar")
    destination = _place_id(client, "Plaza Las Manuelas")
    response = client.get("/api/routes", params={"origin_id": origin, "destination_id": destination})
    assert response.status_code == 200
    assert response.json()["origin"]["display_name"] == "Patomar"


def test_ambiguous_place_search_lists_candidates(client: TestClient) -> None:
    response = client.post("/api/geo/resolve", json={"intent": "find_place", "place": "Bloque"})
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "ambiguous"
    assert len(body["data"]["candidates"]) > 1


def test_patomar_override_survives_a_repeated_osm_import() -> None:
    from app.config import get_settings
    from app.importer import import_osm

    with SessionLocal() as session:
        import_osm(session, Path(get_settings().osm_path))
        count = session.scalar(
            text("SELECT count(*) FROM places WHERE active AND name_normalized = 'patomar'")
        )
        row = session.execute(
            text("SELECT category, subcategory, tags, custom_tags FROM places WHERE active AND name_normalized = 'patomar'")
        ).mappings().one()
    assert count == 1
    assert (row["category"], row["subcategory"]) == ("entertainment", "karaoke")
    assert row["tags"]["building"] == "yes"
    assert row["custom_tags"]["amenity"] == "karaoke"


def test_search_requires_query_or_category(client: TestClient) -> None:
    response = client.get("/api/places/search", params={"q": ""})
    assert response.status_code == 422
    assert response.json()["detail"] == "q_or_category_required"


def test_place_detail_has_geometry_and_google_maps_url(client: TestClient) -> None:
    place_id = _place_id(client, "Bloque A")
    response = client.get(f"/api/places/{place_id}")
    assert response.status_code == 200
    body = response.json()
    assert body["id"] == place_id
    assert body["geometry"]["type"] in {"Polygon", "MultiPolygon", "Point"}
    assert "google.com/maps" in body["google_maps_url"]
    assert "key=" not in body["google_maps_url"]


def test_place_detail_unknown_id_returns_404(client: TestClient) -> None:
    response = client.get(f"/api/places/{uuid.uuid4()}")
    assert response.status_code == 404


def test_nearby_places_are_within_radius(client: TestClient) -> None:
    response = client.get("/api/places/nearby", params={"lat": 0.4065, "lon": -78.1701, "radius_m": 300})
    assert response.status_code == 200
    body = response.json()
    assert body["results"]
    assert all(result["distance_m"] <= 300 for result in body["results"])


def test_nearby_rejects_invalid_coordinates(client: TestClient) -> None:
    response = client.get("/api/places/nearby", params={"lat": 200, "lon": 0})
    assert response.status_code == 422
    assert response.json()["detail"] == "coordinates_out_of_range"


def test_search_rejects_lat_without_lon(client: TestClient) -> None:
    response = client.get("/api/places/search", params={"q": "bloque", "lat": 0.4})
    assert response.status_code == 422


def test_walking_and_driving_routes_between_platforms(client: TestClient) -> None:
    origin = _place_id(client, "Parada Senecyt")
    destination = _place_id(client, "Parada Yachay")
    for mode in ("walking", "driving"):
        response = client.get(
            "/api/routes",
            params={"origin_id": origin, "destination_id": destination, "mode": mode},
        )
        assert response.status_code == 200, response.text
        body = response.json()
        assert body["status"] == "ok", body
        assert body["distance_m"] > 0
        assert body["duration_s"] > 0
        assert body["geometry"]["type"] == "LineString"
        assert body["access"]["origin"]["access"] == "nearest_network_node"


def test_imports_all_verified_entrances_on_building_boundaries() -> None:
    with SessionLocal() as session:
        total, verified = session.execute(
            text("SELECT count(*), count(*) FILTER (WHERE verified) FROM place_entrances")
        ).one()
        building = session.scalar(
            text(
                """
                SELECT p.display_name
                FROM place_entrances e
                JOIN places p ON p.id = e.place_id
                WHERE e.osm_node_id = -32667
                """
            )
        )
    assert total == 73
    assert verified == 73
    assert building == "Aulas biblioteca B"


def test_route_between_entrances_avoids_building_interiors() -> None:
    def entrance_node(session, osm_node_id: int) -> int:
        return int(
            session.scalar(
                text(
                    """
                    SELECT n.id
                    FROM place_entrances e
                    CROSS JOIN LATERAL (
                        SELECT id
                        FROM routing_nodes
                        WHERE component_walk IS NOT NULL
                        ORDER BY geom <-> e.geom
                        LIMIT 1
                    ) n
                    WHERE e.osm_node_id = :osm_node_id
                    """
                ),
                {"osm_node_id": osm_node_id},
            )
        )

    with SessionLocal() as session:
        start = entrance_node(session, -32502)
        end = entrance_node(session, -32467)
        result = route_between_nodes(session, start, end, "walking")
    assert result["status"] == "route_unavailable"
    assert result["reason"] == "route_crosses_building"


def test_building_route_uses_verified_entrances(client: TestClient) -> None:
    origin = _place_id(client, "Edificio Senecyt")
    destination = _place_id(client, "Bloque A")
    response = client.get(
        "/api/routes",
        params={"origin_id": origin, "destination_id": destination, "mode": "walking"},
    )
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "ok", body
    assert 35 <= body["distance_m"] <= 45
    assert body["access"]["origin"]["access"] == "verified_entrance"
    assert body["access"]["destination"]["access"] == "verified_entrance"


WALKING_ROUTE_CASES = [
    ("Krispan", "Plaza Las Manuelas"),
    ("Alina Restaurante", "Plaza Las Manuelas"),
    ("Strega Restaurante", "Plaza Las Manuelas"),
    ("Biblioteca Ingenio", "Plaza Las Manuelas"),
    ("Pato Goloso", "Plaza Las Manuelas"),
    ("Antaños", "Plaza Las Manuelas"),
    ("Colibri", "Plaza Las Manuelas"),
    ("Clinica Urcuqui", "Plaza Las Manuelas"),
    ("Panaderia y Pastelería La Pasteleza", "Plaza Las Manuelas"),
    ("Estacionamiento Senecyt 1", "Plaza Las Manuelas"),
    ("Parada Senecyt", "Plaza Las Manuelas"),
    ("Baño de Las manuelas", "Plaza Las Manuelas"),
    ("Plaza Las Manuelas", "Krispan"),
    ("Edificio Senecyt", "Bloque A"),
    ("Bloque A", "Edificio Senecyt"),
]


@pytest.mark.parametrize(("origin_name", "destination_name"), WALKING_ROUTE_CASES)
def test_walking_route_matrix(client: TestClient, origin_name: str, destination_name: str) -> None:
    response = client.get(
        "/api/routes",
        params={
            "origin_id": _place_id(client, origin_name),
            "destination_id": _place_id(client, destination_name),
            "mode": "walking",
        },
    )
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["status"] == "ok", f"{origin_name} -> {destination_name}: {body.get('reason')}"
    assert body["distance_m"] > 0
    assert body["geometry"]["type"] == "LineString"


KNOWN_NON_BUILDING_ROUTE_GAPS = {
    "Baño de Aulas Inteligentes": "route_crosses_building",
    "Canchas Deportivas": "no_nearby_routing_node",
    "Concha Acustica": "disconnected_components",
    "Estacionamiento Multifamiliares": "disconnected_components",
    "Estadio Municipal de Urcuqui": "no_nearby_routing_node",
}


def test_non_building_route_audit_marks_known_gaps(client: TestClient) -> None:
    destination = _place_id(client, "Plaza Las Manuelas")
    with SessionLocal() as session:
        origins = session.execute(
            text(
                """
                SELECT id, display_name
                FROM places
                WHERE active
                  AND category <> 'building'
                  AND display_name NOT LIKE 'Acceso principal:%'
                ORDER BY display_name
                """
            )
        ).mappings().all()
    problems = {}
    for origin in origins:
        response = client.get(
            "/api/routes",
            params={"origin_id": str(origin["id"]), "destination_id": destination, "mode": "walking"},
        )
        assert response.status_code == 200, response.text
        body = response.json()
        if body["status"] != "ok":
            problems[origin["display_name"]] = body.get("reason")
    assert problems == KNOWN_NON_BUILDING_ROUTE_GAPS


def test_krispan_uses_indirect_network_route_to_plaza(client: TestClient) -> None:
    response = client.get(
        "/api/routes",
        params={
            "origin_id": _place_id(client, "Krispan"),
            "destination_id": _place_id(client, "Plaza Las Manuelas"),
            "mode": "walking",
        },
    )
    body = response.json()
    assert body["status"] == "ok", body
    assert body["distance_m"] > 500
    assert body["steps"] > 5
    assert body["access"]["origin"]["access"] == "nearest_network_node"
    assert body["access"]["destination"]["access"] == "verified_entrance"


def test_nearby_restaurant_route_skips_access_nodes_inside_buildings(client: TestClient) -> None:
    response = client.get(
        "/api/routes",
        params={
            "origin_id": _place_id(client, "Alina Restaurante"),
            "destination_id": _place_id(client, "Plaza Las Manuelas"),
            "mode": "walking",
        },
    )
    body = response.json()
    assert body["status"] == "ok", body
    assert body["distance_m"] < 100
    assert body["access"]["origin"]["access"] == "nearest_network_node"


def test_building_without_verified_entrance_stays_unavailable(client: TestClient) -> None:
    origin = _place_id(client, "Municipio de Urcuquí")
    destination = _place_id(client, "Parada Senecyt")
    response = client.get(
        "/api/routes",
        params={"origin_id": origin, "destination_id": destination, "mode": "walking"},
    )
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "route_unavailable"
    assert body["reason"] == "no_verified_entrance"


def test_navigation_url_has_no_api_key(client: TestClient) -> None:
    destination = _place_id(client, "Bloque A")
    response = client.get("/api/navigation/google-maps", params={"destination_id": destination})
    assert response.status_code == 200
    body = response.json()
    assert body["url"].startswith("https://www.google.com/maps/dir/?api=1&")
    assert "key=" not in body["url"]


def test_resolve_find_place_returns_feature_and_action(client: TestClient) -> None:
    response = client.post("/api/geo/resolve", json={"intent": "find_place", "place": "Bloque G"})
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "ok"
    assert body["data"]["display_name"] == "Bloque G"
    assert body["map"]["type"] == "FeatureCollection"
    assert body["map"]["features"][0]["geometry"]["type"] == "Polygon"
    assert body["actions"][0]["type"] == "google_maps"


def test_resolve_ambiguous_place_returns_candidates(client: TestClient) -> None:
    response = client.post("/api/geo/resolve", json={"intent": "find_place", "place": "bloque"})
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "ambiguous"
    assert len(body["data"]["candidates"]) > 1


def test_resolve_missing_place_returns_not_found(client: TestClient) -> None:
    response = client.post("/api/geo/resolve", json={"intent": "find_place", "place": "lugar inexistente xyz"})
    assert response.status_code == 200
    assert response.json()["status"] == "not_found"


def test_resolve_route_includes_google_maps_fallback(client: TestClient) -> None:
    response = client.post(
        "/api/geo/resolve",
        json={
            "intent": "route",
            "origin": "Parada Senecyt",
            "destination": "Parada Yachay",
            "mode": "walking",
        },
    )
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "ok", body
    assert body["map"]["features"][0]["geometry"]["type"] == "LineString"
    assert body["actions"][0]["url"].startswith("https://www.google.com/maps/dir/")

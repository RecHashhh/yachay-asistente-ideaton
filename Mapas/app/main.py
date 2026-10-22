from __future__ import annotations

import json
import math
import uuid
from contextlib import asynccontextmanager
from typing import Any, Literal

from fastapi import APIRouter, Depends, FastAPI, HTTPException, Query, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from sqlalchemy import text
from sqlalchemy.orm import Session

from .config import get_settings
from .db import engine, get_session
from .geo import (
    google_maps_directions_url,
    google_maps_search_url,
    parse_bbox,
    point_geojson,
    validate_coordinates,
    zoom_for_bounds,
)
from .osm import highway_profile
from .routing import navigation_point, place_row, route_places
from .schemas import ResolveRequest
from .search import categories_summary, get_place, nearby_places, search_places

settings = get_settings()

LAYER_LABELS = {
    "building": "Edificios",
    "amenity": "Servicios",
    "leisure": "Áreas recreativas",
    "shop": "Tiendas",
    "public_transport": "Transporte",
    "natural": "Elementos naturales",
    "landuse": "Áreas",
    "place": "Lugares",
    "tourism": "Turismo",
    "highway": "Calles y caminos",
}

REASON_MESSAGES = {
    "no_verified_entrance": "El lugar no tiene una entrada verificada en OSM; no se usa el centro del edificio como acceso.",
    "no_nearby_routing_node": "No hay un nodo del grafo suficientemente cerca del lugar.",
    "isolated_routing_node": "El punto de acceso está aislado del componente principal del grafo.",
    "disconnected_components": "El origen y el destino están en componentes desconectados del grafo.",
    "route_crosses_building": "El recorrido disponible cruza el interior de un edificio; no se usa como ruta peatonal.",
    "no_path": "No existe un camino transitable entre el origen y el destino.",
    "same_location": "El origen y el destino corresponden al mismo punto.",
}


@asynccontextmanager
async def lifespan(_app: FastAPI):
    yield
    engine.dispose()


app = FastAPI(
    title="Yachay Maps Geo API",
    version="1.0.0",
    description=(
        "API geoespacial determinista para el campus Yachay Tech. "
        "Devuelve GeoJSON listo para MapLibre GL JS y enlaces de Google Maps sin API key."
    ),
    lifespan=lifespan,
)
router = APIRouter()
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins,
    allow_credentials=False,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["Content-Type", "Accept", "Authorization"],
)
app.add_middleware(GZipMiddleware, minimum_size=settings.gzip_min_size)


def _cache(response: Response, seconds: int) -> None:
    response.headers["Cache-Control"] = f"public, max-age={seconds}"


def _latest_batch(session: Session) -> dict[str, Any] | None:
    row = session.execute(
        text(
            """
            SELECT id, source_path, source_sha256, started_at, finished_at, stats
            FROM import_batches
            WHERE status = 'success'
            ORDER BY finished_at DESC NULLS LAST, id DESC
            LIMIT 1
            """
        )
    ).mappings().first()
    return dict(row) if row else None


def _data_version(session: Session) -> dict[str, Any] | None:
    batch = _latest_batch(session)
    if batch is None:
        return None
    return {
        "import_id": batch["id"],
        "sha256": batch["source_sha256"],
        "source": batch["source_path"],
        "imported_at": batch["finished_at"].isoformat() if batch["finished_at"] else None,
    }


def _extent(session: Session) -> tuple[float, float, float, float] | None:
    row = session.execute(
        text(
            """
            WITH source AS (
                SELECT geometry AS geom FROM places WHERE active
                UNION ALL
                SELECT geom FROM osm_ways
                WHERE NOT deleted AND tags ? 'highway' AND geom IS NOT NULL
            ), extent AS (
                SELECT ST_Extent(geom) AS box FROM source
            )
            SELECT ST_XMin(box) AS min_lon, ST_YMin(box) AS min_lat,
                   ST_XMax(box) AS max_lon, ST_YMax(box) AS max_lat
            FROM extent
            """
        )
    ).mappings().first()
    if row is None or row["min_lon"] is None:
        return None
    return (
        float(row["min_lon"]),
        float(row["min_lat"]),
        float(row["max_lon"]),
        float(row["max_lat"]),
    )


def _place_feature(place: dict[str, Any]) -> dict[str, Any]:
    return {
        "type": "Feature",
        "id": place["id"],
        "geometry": place["geometry"],
        "properties": {
            "id": place["id"],
            "name": place["name"],
            "display_name": place["display_name"],
            "category": place["category"],
            "subcategory": place["subcategory"],
            "highway_type": None,
            "pedestrian_allowed": None,
            "vehicle_allowed": None,
            "osm_type": place["osm_type"],
            "osm_id": place["osm_id"],
            "name_source": place["name_source"],
        },
    }


def _route_feature(route: dict[str, Any]) -> dict[str, Any] | None:
    geometry = route.get("geometry")
    if not geometry:
        return None
    return {
        "type": "Feature",
        "id": "route",
        "geometry": geometry,
        "properties": {
            "kind": "route",
            "mode": route["mode"],
            "distance_m": route["distance_m"],
            "duration_s": route["duration_s"],
        },
    }


def _reason_text(reason: str | None) -> str:
    return REASON_MESSAGES.get(reason or "", "No fue posible calcular una ruta verificada.")


def _pick_place(session: Session, query: str, limit: int) -> tuple[dict[str, Any] | None, list[dict[str, Any]]]:
    results = search_places(session, query, limit=limit)
    if not results:
        return None, []
    exact = [result for result in results if result.get("match") in {"exact_name", "exact_alias"}]
    if len(exact) == 1:
        return exact[0], []
    if len(exact) > 1:
        return None, exact
    if len(results) == 1:
        return results[0], []
    return None, results


@app.get("/health", tags=["sistema"])
def health(session: Session = Depends(get_session)) -> dict[str, Any]:
    try:
        versions = session.execute(
            text(
                """
                SELECT current_setting('server_version') AS postgres,
                       postgis_version() AS postgis,
                       pgr_version() AS pgrouting
                """
            )
        ).mappings().one()
        batch = _latest_batch(session)
        places = session.scalar(text("SELECT count(*) FROM places WHERE active")) or 0
        edges = session.scalar(text("SELECT count(*) FROM routing_edges")) or 0
    except Exception as exc:
        raise HTTPException(status_code=503, detail="database_unavailable") from exc
    return {
        "status": "ok" if batch else "degraded",
        "database": "ok",
        "postgres": versions["postgres"],
        "postgis": versions["postgis"],
        "pgrouting": versions["pgrouting"],
        "import": _data_version(session),
        "places": places,
        "routing_edges": edges,
    }


@router.get("/api/map/config", tags=["mapa"])
def map_config(response: Response, session: Session = Depends(get_session)) -> dict[str, Any]:
    extent = _extent(session)
    if extent is None:
        raise HTTPException(status_code=503, detail="data_not_imported")
    min_lon, min_lat, max_lon, max_lat = extent
    categories = session.execute(
        text(
            """
            SELECT category, count(*) AS count
            FROM places
            WHERE active
            GROUP BY category
            ORDER BY category
            """
        )
    ).mappings().all()
    road_count = session.scalar(
        text(
            """
            SELECT count(*) FROM osm_ways
            WHERE NOT deleted AND tags ? 'highway' AND geom IS NOT NULL
            """
        )
    ) or 0
    layers = [
        {
            "id": row["category"],
            "label": LAYER_LABELS.get(row["category"], row["category"]),
            "category": row["category"],
            "count": row["count"],
        }
        for row in categories
    ]
    layers.append({
        "id": "highway",
        "label": LAYER_LABELS["highway"],
        "category": "highway",
        "count": road_count,
    })
    _cache(response, settings.cache_seconds)
    return {
        "bounds": [min_lon, min_lat, max_lon, max_lat],
        "center": [(min_lon + max_lon) / 2, (min_lat + max_lat) / 2],
        "zoom": zoom_for_bounds(min_lon, min_lat, max_lon, max_lat),
        "srid": 4326,
        "coordinate_order": "lon,lat",
        "layers": layers,
        "data_version": _data_version(session),
    }


@router.get("/api/map/features", tags=["mapa"])
def map_features(
    response: Response,
    bbox: str | None = Query(default=None, description="minlon,minlat,maxlon,maxlat"),
    category: str | None = None,
    limit: int = Query(default=500, ge=1, le=2000),
    offset: int = Query(default=0, ge=0, le=10000),
    zoom: int | None = Query(default=None, ge=0, le=22),
    session: Session = Depends(get_session),
) -> dict[str, Any]:
    extent = _extent(session)
    if extent is None:
        raise HTTPException(status_code=503, detail="data_not_imported")
    min_lon, min_lat, max_lon, max_lat = parse_bbox(bbox, extent)
    cap = 5000
    features: list[dict[str, Any]] = []

    if category is None or category != "highway":
        place_rows = session.execute(
            text(
                """
                SELECT p.id, p.osm_type, p.osm_id, p.name, p.display_name, p.name_source,
                       p.category, p.subcategory, p.tags,
                       ST_AsGeoJSON(p.geometry, 6) AS geometry_json
                FROM places p
                WHERE p.active
                  AND ST_Intersects(
                      p.geometry,
                      ST_MakeEnvelope(:min_lon, :min_lat, :max_lon, :max_lat, 4326)
                  )
                  AND (CAST(:category AS text) IS NULL OR p.category = :category OR p.subcategory = :category)
                ORDER BY p.category, p.display_name, p.id
                LIMIT :cap
                """
            ),
            {
                "min_lon": min_lon,
                "min_lat": min_lat,
                "max_lon": max_lon,
                "max_lat": max_lat,
                "category": category,
                "cap": cap,
            },
        ).mappings().all()
        for row in place_rows:
            if not row["geometry_json"]:
                continue
            features.append(
                {
                    "type": "Feature",
                    "id": str(row["id"]),
                    "geometry": json.loads(row["geometry_json"]),
                    "properties": {
                        "id": str(row["id"]),
                        "name": row["name"],
                        "display_name": row["display_name"],
                        "category": row["category"],
                        "subcategory": row["subcategory"],
                        "highway_type": None,
                        "pedestrian_allowed": None,
                        "vehicle_allowed": None,
                        "osm_type": row["osm_type"],
                        "osm_id": row["osm_id"],
                        "name_source": row["name_source"],
                    },
                }
            )

    if category is None or category == "highway":
        road_rows = session.execute(
            text(
                """
                SELECT w.osm_id, w.tags, ST_AsGeoJSON(w.geom, 6) AS geometry_json
                FROM osm_ways w
                WHERE NOT w.deleted
                  AND w.tags ? 'highway'
                  AND w.geom IS NOT NULL
                  AND ST_Intersects(
                      w.geom,
                      ST_MakeEnvelope(:min_lon, :min_lat, :max_lon, :max_lat, 4326)
                  )
                ORDER BY w.osm_id
                LIMIT :cap
                """
            ),
            {
                "min_lon": min_lon,
                "min_lat": min_lat,
                "max_lon": max_lon,
                "max_lat": max_lat,
                "cap": cap,
            },
        ).mappings().all()
        for row in road_rows:
            if not row["geometry_json"]:
                continue
            tags = row["tags"] or {}
            profile = highway_profile(tags)
            name = tags.get("name")
            features.append(
                {
                    "type": "Feature",
                    "id": f"way:{row['osm_id']}",
                    "geometry": json.loads(row["geometry_json"]),
                    "properties": {
                        "id": f"way:{row['osm_id']}",
                        "name": name,
                        "display_name": name or "Camino sin nombre",
                        "category": "highway",
                        "subcategory": profile["highway_type"],
                        "highway_type": profile["highway_type"],
                        "pedestrian_allowed": profile["pedestrian_allowed"],
                        "vehicle_allowed": profile["vehicle_allowed"],
                        "bridge": profile["bridge"],
                        "tunnel": profile["tunnel"],
                        "layer": profile["layer"],
                        "surface": profile["surface"],
                        "osm_type": "way",
                        "osm_id": row["osm_id"],
                    },
                }
            )

    features.sort(key=lambda feature: (feature["properties"]["category"], feature["properties"].get("display_name") or "", str(feature["id"])))
    matched = len(features)
    page = features[offset : offset + limit]
    _cache(response, min(settings.cache_seconds, 60))
    return {
        "type": "FeatureCollection",
        "features": page,
        "bbox": [min_lon, min_lat, max_lon, max_lat],
        "numberMatched": matched,
        "numberReturned": len(page),
        "offset": offset,
        "limit": limit,
        "truncated": matched >= cap,
        "zoom": zoom,
        "data_version": _data_version(session),
    }


@router.get("/api/places/search", tags=["lugares"])
def places_search(
    response: Response,
    q: str = Query(default=""),
    category: str | None = None,
    limit: int = Query(default=10, ge=1, le=50),
    offset: int = Query(default=0, ge=0, le=1000),
    lat: float | None = None,
    lon: float | None = None,
    session: Session = Depends(get_session),
) -> dict[str, Any]:
    if (lat is None) != (lon is None):
        raise HTTPException(status_code=422, detail="lat_and_lon_must_be_together")
    if lat is not None and lon is not None:
        validate_coordinates(lat, lon)
    results = search_places(session, q, category, limit, offset, lat, lon)
    _cache(response, min(settings.cache_seconds, 60))
    return {
        "query": q,
        "category": category,
        "count": len(results),
        "limit": limit,
        "offset": offset,
        "results": results,
        "data_version": _data_version(session),
    }


@router.get("/api/places/nearby", tags=["lugares"])
def places_nearby(
    response: Response,
    lat: float,
    lon: float,
    radius_m: float = Query(default=500, gt=0, le=10000),
    category: str | None = None,
    limit: int = Query(default=20, ge=1, le=100),
    offset: int = Query(default=0, ge=0, le=1000),
    session: Session = Depends(get_session),
) -> dict[str, Any]:
    validate_coordinates(lat, lon)
    results = nearby_places(session, lat, lon, radius_m, category, limit, offset)
    _cache(response, min(settings.cache_seconds, 60))
    return {
        "center": point_geojson(lon, lat),
        "radius_m": radius_m,
        "category": category,
        "count": len(results),
        "limit": limit,
        "offset": offset,
        "results": results,
        "data_version": _data_version(session),
    }


@router.get("/api/places/categories", tags=["lugares"])
def places_categories(response: Response, session: Session = Depends(get_session)) -> dict[str, Any]:
    _cache(response, settings.cache_seconds)
    return {
        "categories": categories_summary(session),
        "data_version": _data_version(session),
    }


@router.get("/api/places/{place_id}", tags=["lugares"])
def place_detail(place_id: uuid.UUID, response: Response, session: Session = Depends(get_session)) -> dict[str, Any]:
    place = get_place(session, str(place_id))
    if place is None:
        raise HTTPException(status_code=404, detail="place_not_found")
    _cache(response, settings.cache_seconds)
    return place


@router.get("/api/routes", tags=["rutas"])
def routes(
    response: Response,
    origin_id: uuid.UUID,
    destination_id: uuid.UUID,
    mode: Literal["walking", "driving"] = "walking",
    session: Session = Depends(get_session),
) -> dict[str, Any]:
    result = route_places(session, str(origin_id), str(destination_id), mode)
    if result["status"] == "not_found":
        raise HTTPException(status_code=404, detail=result["reason"])
    _cache(response, min(settings.cache_seconds, 60))
    return result


@router.get("/api/navigation/google-maps", tags=["navegación"])
def google_maps(
    response: Response,
    destination_id: uuid.UUID,
    origin_id: uuid.UUID | None = None,
    mode: Literal["walking", "driving"] = "walking",
    session: Session = Depends(get_session),
) -> dict[str, Any]:
    destination = navigation_point(session, str(destination_id))
    if destination is None:
        raise HTTPException(status_code=404, detail="destination_not_found")
    origin = None
    if origin_id is not None:
        origin = navigation_point(session, str(origin_id))
        if origin is None:
            raise HTTPException(status_code=404, detail="origin_not_found")
    url = google_maps_directions_url(
        destination["lat"],
        destination["lon"],
        origin["lat"] if origin else None,
        origin["lon"] if origin else None,
        mode,
    )
    _cache(response, settings.cache_seconds)
    return {
        "provider": "google_maps",
        "mode": mode,
        "url": url,
        "destination": destination,
        "origin": origin,
    }


@router.post("/api/geo/resolve", tags=["integración"])
def resolve(request: ResolveRequest, response: Response, session: Session = Depends(get_session)) -> dict[str, Any]:
    response.headers["Cache-Control"] = "no-store"
    if request.intent == "find_place":
        if not request.place:
            raise HTTPException(status_code=422, detail="place_required")
        selected, candidates = _pick_place(session, request.place, request.limit)
        if selected is None and not candidates:
            return {
                "status": "not_found",
                "message": f"No encontré un lugar llamado «{request.place}».",
                "data": {"query": request.place, "candidates": []},
                "map": None,
                "actions": [],
            }
        if selected is None:
            return {
                "status": "ambiguous",
                "message": "Encontré varios lugares. Pide al usuario que aclare cuál desea.",
                "data": {"query": request.place, "candidates": candidates},
                "map": None,
                "actions": [],
            }
        place = get_place(session, selected["id"])
        if place is None:
            raise HTTPException(status_code=404, detail="place_not_found")
        feature = _place_feature(place)
        return {
            "status": "ok",
            "message": f"Encontré {place['display_name']}.",
            "data": {
                "id": place["id"],
                "name": place["name"],
                "display_name": place["display_name"],
                "category": place["category"],
                "subcategory": place["subcategory"],
                "location": place["location"],
            },
            "map": {"type": "FeatureCollection", "features": [feature]},
            "actions": [
                {
                    "type": "google_maps",
                    "url": place["google_maps_url"],
                }
            ],
        }

    if not request.origin or not request.destination:
        raise HTTPException(status_code=422, detail="origin_and_destination_required")
    origin, origin_candidates = _pick_place(session, request.origin, request.limit)
    destination, destination_candidates = _pick_place(session, request.destination, request.limit)
    if (origin is None and origin_candidates) or (destination is None and destination_candidates):
        return {
            "status": "ambiguous",
            "message": "Encontré varios candidatos. Pide al usuario que aclare el origen o el destino.",
            "data": {
                "origin_query": request.origin,
                "origin_candidates": origin_candidates,
                "destination_query": request.destination,
                "destination_candidates": destination_candidates,
            },
            "map": None,
            "actions": [],
        }
    if origin is None or destination is None:
        missing = request.origin if origin is None else request.destination
        return {
            "status": "not_found",
            "message": f"No encontré «{missing}».",
            "data": {
                "origin_query": request.origin,
                "destination_query": request.destination,
            },
            "map": None,
            "actions": [],
        }
    route = route_places(session, origin["id"], destination["id"], request.mode)
    origin_point = navigation_point(session, origin["id"])
    destination_point = navigation_point(session, destination["id"])
    url = None
    if origin_point and destination_point:
        url = google_maps_directions_url(
            destination_point["lat"],
            destination_point["lon"],
            origin_point["lat"],
            origin_point["lon"],
            request.mode,
        )
    feature = _route_feature(route)
    actions = [{"type": "google_maps", "url": url}] if url else []
    data = {
        "origin": route.get("origin"),
        "destination": route.get("destination"),
        "mode": request.mode,
        "distance_m": route.get("distance_m"),
        "duration_s": route.get("duration_s"),
        "reason": route.get("reason"),
        "access": route.get("access"),
    }
    if route["status"] == "route_unavailable":
        return {
            "status": "route_unavailable",
            "message": _reason_text(route.get("reason")),
            "data": data,
            "map": None,
            "actions": actions,
        }
    return {
        "status": "ok",
        "message": f"Ruta calculada: {route['distance_m']} m y {route['duration_s']} s.",
        "data": data,
        "map": {"type": "FeatureCollection", "features": [feature] if feature else []},
        "actions": actions,
    }


app.include_router(router)

from __future__ import annotations

from urllib.parse import quote

from fastapi import HTTPException


def parse_bbox(value: str | None, default: tuple[float, float, float, float] | None = None) -> tuple[float, float, float, float]:
    if value is None:
        if default is None:
            raise HTTPException(status_code=422, detail="bbox_required")
        return default
    parts = value.split(",")
    if len(parts) != 4:
        raise HTTPException(status_code=422, detail="bbox_must_have_four_values")
    try:
        min_lon, min_lat, max_lon, max_lat = (float(part) for part in parts)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail="bbox_values_must_be_numbers") from exc
    if not (-180 <= min_lon < max_lon <= 180 and -90 <= min_lat < max_lat <= 90):
        raise HTTPException(status_code=422, detail="bbox_out_of_range")
    return min_lon, min_lat, max_lon, max_lat


def validate_coordinates(lat: float, lon: float) -> None:
    if not (-90 <= lat <= 90 and -180 <= lon <= 180):
        raise HTTPException(status_code=422, detail="coordinates_out_of_range")


def point_geojson(lon: float, lat: float) -> dict:
    return {"type": "Point", "coordinates": [round(lon, 6), round(lat, 6)]}


def google_maps_search_url(lat: float, lon: float) -> str:
    query = quote(f"{lat:.6f},{lon:.6f}", safe=",")
    return f"https://www.google.com/maps/search/?api=1&query={query}"


def google_maps_directions_url(
    destination_lat: float,
    destination_lon: float,
    origin_lat: float | None = None,
    origin_lon: float | None = None,
    mode: str = "walking",
) -> str:
    destination = quote(f"{destination_lat:.6f},{destination_lon:.6f}", safe=",")
    params = [f"api=1", f"destination={destination}", f"travelmode={quote(mode)}"]
    if origin_lat is not None and origin_lon is not None:
        origin = quote(f"{origin_lat:.6f},{origin_lon:.6f}", safe=",")
        params.insert(1, f"origin={origin}")
    return "https://www.google.com/maps/dir/?" + "&".join(params)


def zoom_for_bounds(min_lon: float, min_lat: float, max_lon: float, max_lat: float) -> int:
    import math

    span = max(abs(max_lon - min_lon), abs(max_lat - min_lat), 0.000001)
    zoom = math.floor(math.log2(360.0 / span)) - 1
    return max(1, min(18, int(zoom)))

from __future__ import annotations

import hashlib
import math
import re
import unicodedata
import xml.etree.ElementTree as ET
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path
from typing import Any

CATEGORY_LABELS: dict[tuple[str, str | None], str] = {
    ("amenity", "toilets"): "Baños",
    ("amenity", "restaurant"): "Restaurante",
    ("amenity", "parking"): "Estacionamiento",
    ("amenity", "taxi"): "Zona de taxis",
    ("amenity", "library"): "Biblioteca",
    ("amenity", "clinic"): "Clínica",
    ("amenity", "arts_centre"): "Centro cultural",
    ("amenity", "university"): "Universidad",
    ("amenity", "school"): "Escuela",
    ("amenity", "place_of_worship"): "Lugar de culto",
    ("amenity", "cafe"): "Cafetería",
    ("public_transport", "platform"): "Parada de bus",
    ("building", "university"): "Edificio universitario",
    ("building", "college"): "Edificio universitario",
    ("building", "yes"): "Edificio",
    ("building", "retail"): "Edificio comercial",
    ("leisure", "park"): "Parque",
    ("leisure", "pitch"): "Cancha",
    ("leisure", "stadium"): "Estadio",
    ("leisure", "nature_reserve"): "Reserva natural",
    ("shop", None): "Tienda",
    ("natural", None): "Elemento natural",
    ("landuse", None): "Área",
    ("place", None): "Lugar",
    ("entertainment", "karaoke"): "Karaoke y entretenimiento",
}

CATEGORY_QUERIES: dict[str, tuple[str, str | None]] = {
    "bano": ("amenity", "toilets"),
    "banos": ("amenity", "toilets"),
    "sanitario": ("amenity", "toilets"),
    "sanitarios": ("amenity", "toilets"),
    "servicio higienico": ("amenity", "toilets"),
    "servicios higienicos": ("amenity", "toilets"),
    "toilet": ("amenity", "toilets"),
    "toilets": ("amenity", "toilets"),
    "restaurante": ("amenity", "restaurant"),
    "restaurantes": ("amenity", "restaurant"),
    "restaurant": ("amenity", "restaurant"),
    "restaurants": ("amenity", "restaurant"),
    "comida": ("amenity", "restaurant"),
    "comedor": ("amenity", "restaurant"),
    "parada": ("public_transport", "platform"),
    "paradas": ("public_transport", "platform"),
    "parada de bus": ("public_transport", "platform"),
    "paradas de bus": ("public_transport", "platform"),
    "parada de autobus": ("public_transport", "platform"),
    "paradas de autobus": ("public_transport", "platform"),
    "bus": ("public_transport", "platform"),
    "autobus": ("public_transport", "platform"),
    "autobuses": ("public_transport", "platform"),
    "taxi": ("amenity", "taxi"),
    "taxis": ("amenity", "taxi"),
    "camioneta": ("amenity", "taxi"),
    "camionetas": ("amenity", "taxi"),
    "biblioteca": ("amenity", "library"),
    "bibliotecas": ("amenity", "library"),
    "parqueadero": ("amenity", "parking"),
    "parqueaderos": ("amenity", "parking"),
    "estacionamiento": ("amenity", "parking"),
    "estacionamientos": ("amenity", "parking"),
    "parking": ("amenity", "parking"),
    "clinica": ("amenity", "clinic"),
    "clinicas": ("amenity", "clinic"),
    "enfermeria": ("amenity", "clinic"),
    "bloque": ("building", None),
    "bloques": ("building", None),
    "edificio": ("building", None),
    "edificios": ("building", None),
    "aula": ("building", None),
    "aulas": ("building", None),
    "cancha": ("leisure", "pitch"),
    "canchas": ("leisure", "pitch"),
    "parque": ("leisure", "park"),
    "parques": ("leisure", "park"),
    "tienda": ("shop", None),
    "tiendas": ("shop", None),
    "karaoke": ("entertainment", "karaoke"),
    "entertainment": ("entertainment", None),
    "recreational": ("entertainment", None),
    "fun": ("entertainment", None),
    "diversion": ("entertainment", None),
    "lugar de diversion": ("entertainment", None),
    "entretenimiento": ("entertainment", None),
    "recreativo": ("entertainment", None),
    "recreacion": ("entertainment", None),
}

# Internal application metadata. These values never modify the source OSM tags.
PLACE_OVERRIDES: dict[str, dict[str, Any]] = {
    "patomar": {
        "name": "Patomar",
        "category": "entertainment",
        "subcategory": "karaoke",
        "aliases": [
            "karaoke",
            "karaoke patomar",
            "centro de diversión",
            "lugar de diversión",
            "lugar de entretenimiento",
            "patomar",
        ],
        "custom_tags": {"amenity": "karaoke", "leisure": "entertainment"},
    },
}

DRIVABLE_HIGHWAYS = {
    "motorway",
    "motorway_link",
    "trunk",
    "trunk_link",
    "primary",
    "primary_link",
    "secondary",
    "secondary_link",
    "tertiary",
    "tertiary_link",
    "unclassified",
    "residential",
    "living_street",
    "service",
    "track",
    "road",
}

PEDESTRIAN_HIGHWAYS = {
    "footway",
    "pedestrian",
    "path",
    "steps",
    "living_street",
    "residential",
    "service",
    "track",
    "unclassified",
    "secondary",
    "tertiary",
    "primary",
    "road",
}

FORBIDDEN_PEDESTRIAN = {"motorway", "motorway_link", "trunk", "trunk_link", "construction", "proposed", "raceway"}

DRIVE_SPEED_KMH = {
    "motorway": 80,
    "trunk": 60,
    "primary": 50,
    "secondary": 40,
    "tertiary": 30,
    "unclassified": 20,
    "residential": 20,
    "living_street": 10,
    "service": 15,
    "track": 15,
    "road": 20,
}

WALK_SPEED_MPS = 1.4


def normalize_text(value: str | None) -> str:
    if not value:
        return ""
    decomposed = unicodedata.normalize("NFKD", value)
    without_accents = "".join(char for char in decomposed if not unicodedata.combining(char))
    lowered = without_accents.lower()
    cleaned = re.sub(r"[^a-z0-9]+", " ", lowered)
    return " ".join(cleaned.split())


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def parse_timestamp(value: str | None) -> datetime | None:
    if not value:
        return None
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None


def parse_float(value: str | None) -> float | None:
    if value is None:
        return None
    try:
        return float(value)
    except ValueError:
        return None


def parse_int(value: str | None) -> int | None:
    if value is None:
        return None
    try:
        return int(value)
    except ValueError:
        return None


def tags_of(element: ET.Element) -> dict[str, str]:
    return {tag.get("k", ""): tag.get("v", "") for tag in element.findall("tag") if tag.get("k")}


def is_deleted(element: ET.Element) -> bool:
    return element.get("action") == "delete" or element.get("visible") == "false"


def category_for_tags(tags: dict[str, str], has_name: bool) -> tuple[str, str | None] | None:
    for key in ("amenity", "tourism", "shop", "office", "public_transport", "healthcare", "historic", "leisure", "natural", "landuse"):
        value = tags.get(key)
        if value:
            return key, value
    building = tags.get("building")
    if building:
        return "building", building
    if has_name:
        return "place", "named_feature"
    return None


def category_label(category: str, subcategory: str | None) -> str:
    return (
        CATEGORY_LABELS.get((category, subcategory))
        or CATEGORY_LABELS.get((category, None))
        or "Lugar"
    )


def apply_place_override(tags: dict[str, str], category: tuple[str, str | None]) -> dict[str, Any] | None:
    """Return internal place metadata for a configured OSM identity, without changing its OSM tags."""
    identities = {
        normalize_text(tags.get(key, ""))
        for key in ("name", "yachay:original_building")
        if tags.get(key)
    }
    override = next((PLACE_OVERRIDES[key] for key in identities if key in PLACE_OVERRIDES), None)
    if override is None:
        return None
    return {
        "name": override["name"],
        "category": override["category"],
        "subcategory": override["subcategory"],
        "aliases": list(dict.fromkeys(override["aliases"])),
        "custom_tags": dict(override["custom_tags"]),
        "source_category": category,
    }


def display_name_for(tags: dict[str, str], category: str, subcategory: str | None) -> tuple[str, str | None, str, str | None]:
    name = tags.get("name") or None
    description = tags.get("description") or None
    if name:
        return name, name, "osm_name", description
    if description:
        return description, None, "osm_description", description
    return category_label(category, subcategory), None, "category_label", description


def aliases_for(tags: dict[str, str], name: str | None, description: str | None) -> list[tuple[str, str]]:
    raw: list[tuple[str, str]] = []
    for key in ("name", "name:es", "alt_name", "short_name", "old_name", "ref"):
        value = tags.get(key)
        if value:
            for part in value.split(";"):
                raw.append((part.strip(), key))
    if description:
        raw.append((description.strip(), "description"))
    if name:
        for part in re.split(r"\s+o\s+|\s*/\s*|\(|\)", name, flags=re.IGNORECASE):
            candidate = part.strip()
            if len(normalize_text(candidate)) >= 2:
                raw.append((candidate, "derived"))
    seen: set[str] = set()
    aliases: list[tuple[str, str]] = []
    for alias, source in raw:
        normalized = normalize_text(alias)
        if len(normalized) < 2 or normalized in seen:
            continue
        seen.add(normalized)
        aliases.append((alias, source))
    return aliases


def search_text_for(display_name: str, tags: dict[str, str], category: str, subcategory: str | None, aliases: list[tuple[str, str]]) -> str:
    parts = [display_name, category, subcategory or "", tags.get("description", "")]
    parts.extend(alias for alias, _source in aliases)
    normalized = normalize_text(" ".join(part for part in parts if part))
    return normalized


def highway_profile(tags: dict[str, str]) -> dict[str, Any]:
    highway = tags.get("highway", "")
    access = tags.get("access")
    foot = tags.get("foot")
    motor_vehicle = tags.get("motor_vehicle")
    vehicle = tags.get("vehicle")

    pedestrian_allowed = highway in PEDESTRIAN_HIGHWAYS and highway not in FORBIDDEN_PEDESTRIAN
    vehicle_allowed = highway in DRIVABLE_HIGHWAYS

    if access in {"no", "private"}:
        pedestrian_allowed = foot == "yes"
        vehicle_allowed = motor_vehicle == "yes"
    if foot in {"no", "private"}:
        pedestrian_allowed = False
    if motor_vehicle in {"no", "private"} or vehicle in {"no", "private"}:
        vehicle_allowed = False
    if highway in {"footway", "pedestrian", "path", "steps", "cycleway"} and motor_vehicle != "yes":
        vehicle_allowed = False

    oneway = normalize_oneway(tags.get("oneway"))
    oneway_foot = normalize_oneway(tags.get("oneway:foot"))
    layer = parse_int(tags.get("layer")) or 0
    return {
        "highway_type": highway,
        "pedestrian_allowed": pedestrian_allowed,
        "vehicle_allowed": vehicle_allowed,
        "oneway": oneway,
        "oneway_foot": oneway_foot,
        "bridge": tags.get("bridge", "no") not in {"no", ""},
        "tunnel": tags.get("tunnel", "no") not in {"no", ""},
        "layer": layer,
        "access": access,
        "surface": tags.get("surface"),
        "drive_speed_kmh": DRIVE_SPEED_KMH.get(highway, 20),
        "walk_speed_mps": WALK_SPEED_MPS,
    }


def normalize_oneway(value: str | None) -> str:
    if value in {"yes", "true", "1"}:
        return "yes"
    if value in {"-1", "reverse"}:
        return "-1"
    return "no"


def is_polygon_way(tags: dict[str, str], closed: bool, node_count: int) -> bool:
    if not closed or node_count < 4:
        return False
    if tags.get("highway"):
        return False
    if tags.get("area") == "yes":
        return True
    return any(
        key in tags
        for key in ("building", "landuse", "leisure", "natural", "amenity", "tourism", "shop", "office", "public_transport")
    )


def point_wkt(lat: float, lon: float) -> str:
    return f"POINT({lon:.8f} {lat:.8f})"


def line_wkt(coords: list[tuple[float, float]]) -> str:
    return "LINESTRING(" + ", ".join(f"{lon:.8f} {lat:.8f}" for lat, lon in coords) + ")"


def polygon_wkt(coords: list[tuple[float, float]]) -> str:
    ring = list(coords)
    if ring[0] != ring[-1]:
        ring.append(ring[0])
    return "POLYGON((" + ", ".join(f"{lon:.8f} {lat:.8f}" for lat, lon in ring) + "))"


def way_geometry(way: dict[str, Any], nodes: dict[int, dict[str, Any]]) -> tuple[str | None, bool, list[int]]:
    refs: list[int] = way["nodes"]
    missing = [ref for ref in refs if ref not in nodes or nodes[ref].get("deleted")]
    if missing or len(refs) < 2:
        return None, False, missing
    coords = [(nodes[ref]["lat"], nodes[ref]["lon"]) for ref in refs]
    closed = len(refs) >= 4 and refs[0] == refs[-1]
    if is_polygon_way(way["tags"], closed, len(refs)):
        return polygon_wkt(coords), closed, []
    return line_wkt(coords), closed, []


@dataclass
class OsmData:
    nodes: dict[int, dict[str, Any]] = field(default_factory=dict)
    ways: dict[int, dict[str, Any]] = field(default_factory=dict)
    relations: dict[int, dict[str, Any]] = field(default_factory=dict)
    bounds: dict[str, float] = field(default_factory=dict)
    version: str | None = None
    generator: str | None = None
    source_path: str = ""

    @property
    def active_nodes(self) -> dict[int, dict[str, Any]]:
        return {osm_id: node for osm_id, node in self.nodes.items() if not node["deleted"]}

    @property
    def active_ways(self) -> dict[int, dict[str, Any]]:
        return {osm_id: way for osm_id, way in self.ways.items() if not way["deleted"]}

    @property
    def active_relations(self) -> dict[int, dict[str, Any]]:
        return {osm_id: relation for osm_id, relation in self.relations.items() if not relation["deleted"]}


def parse_osm(path: Path) -> OsmData:
    root = ET.parse(path).getroot()
    if root.tag != "osm":
        raise ValueError(f"El archivo {path} no es un documento OSM válido")
    data = OsmData(version=root.get("version"), generator=root.get("generator"), source_path=str(path))
    bounds = root.find("bounds")
    if bounds is not None:
        data.bounds = {
            key: float(bounds.get(key, "0"))
            for key in ("minlat", "minlon", "maxlat", "maxlon")
        }
    for element in root:
        if element.tag == "node":
            osm_id = int(element.get("id", "0"))
            lat = parse_float(element.get("lat"))
            lon = parse_float(element.get("lon"))
            data.nodes[osm_id] = {
                "lat": lat,
                "lon": lon,
                "tags": tags_of(element),
                "action": element.get("action"),
                "visible": element.get("visible") != "false",
                "version": parse_int(element.get("version")),
                "changeset": parse_int(element.get("changeset")),
                "timestamp": parse_timestamp(element.get("timestamp")),
                "uid": parse_int(element.get("uid")),
                "user": element.get("user"),
                "deleted": is_deleted(element) or lat is None or lon is None,
            }
        elif element.tag == "way":
            osm_id = int(element.get("id", "0"))
            refs = [int(node.get("ref", "0")) for node in element.findall("nd")]
            data.ways[osm_id] = {
                "nodes": refs,
                "tags": tags_of(element),
                "action": element.get("action"),
                "visible": element.get("visible") != "false",
                "deleted": is_deleted(element),
            }
        elif element.tag == "relation":
            osm_id = int(element.get("id", "0"))
            members = [
                {
                    "type": member.get("type"),
                    "ref": parse_int(member.get("ref")),
                    "role": member.get("role", ""),
                }
                for member in element.findall("member")
            ]
            data.relations[osm_id] = {
                "members": members,
                "tags": tags_of(element),
                "action": element.get("action"),
                "visible": element.get("visible") != "false",
                "deleted": is_deleted(element),
            }
    return data


def haversine_m(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    radius = 6371008.8
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlambda = math.radians(lon2 - lon1)
    a = math.sin(dphi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlambda / 2) ** 2
    return 2 * radius * math.asin(math.sqrt(a))

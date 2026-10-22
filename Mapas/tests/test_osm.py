from __future__ import annotations

from app.geo import google_maps_directions_url, parse_bbox
from app.importer import entrance_is_verified
from app.osm import (
    aliases_for,
    apply_place_override,
    category_for_tags,
    display_name_for,
    highway_profile,
    normalize_text,
)


def test_normalize_text_removes_accents_and_punctuation() -> None:
    assert normalize_text("  Baños / Aulas-Inteligentes  ") == "banos aulas inteligentes"


def test_category_for_tags_uses_amenity_before_building() -> None:
    assert category_for_tags({"amenity": "toilets", "building": "yes"}, has_name=False) == ("amenity", "toilets")
    assert category_for_tags({"building": "university"}, has_name=False) == ("building", "university")
    assert category_for_tags({"name": "Plaza"}, has_name=True) == ("place", "named_feature")
    assert category_for_tags({}, has_name=False) is None


def test_display_name_falls_back_to_description_then_category_label() -> None:
    name, alias, source, description = display_name_for({"name": "Bloque A"}, "building", "yes")
    assert (name, alias, source, description) == ("Bloque A", "Bloque A", "osm_name", None)

    name, alias, source, description = display_name_for(
        {"description": "Baño de la biblioteca", "amenity": "toilets"}, "amenity", "toilets"
    )
    assert (name, alias, source, description) == (
        "Baño de la biblioteca",
        None,
        "osm_description",
        "Baño de la biblioteca",
    )

    name, alias, source, _description = display_name_for({"amenity": "toilets"}, "amenity", "toilets")
    assert (name, alias, source) == ("Baños", None, "category_label")


def test_aliases_include_description_and_split_names() -> None:
    aliases = aliases_for(
        {"name": "Parada Senecyt / Biblioteca", "alt_name": "Parada BUS"},
        "Parada Senecyt / Biblioteca",
        None,
    )
    normalized = {normalize_text(alias) for alias, _source in aliases}
    assert {"parada senecyt", "biblioteca", "parada bus"} <= normalized


def test_patomar_override_adds_internal_karaoke_metadata_without_changing_osm_tags() -> None:
    osm_tags = {"building": "yes", "name": "Patomar", "yachay:original_building": "Patomar"}

    overridden = apply_place_override(osm_tags, ("building", "yes"))

    assert overridden is not None
    assert overridden["name"] == "Patomar"
    assert (overridden["category"], overridden["subcategory"]) == ("entertainment", "karaoke")
    assert {normalize_text(alias) for alias in ("karaoke", "centro de diversión", "lugar de entretenimiento")} <= {
        normalize_text(alias) for alias in overridden["aliases"]
    }
    assert overridden["custom_tags"] == {"amenity": "karaoke", "leisure": "entertainment"}
    assert osm_tags == {"building": "yes", "name": "Patomar", "yachay:original_building": "Patomar"}


def test_highway_profile_for_footway_is_not_drivable() -> None:
    profile = highway_profile({"highway": "footway"})
    assert profile["pedestrian_allowed"] is True
    assert profile["vehicle_allowed"] is False


def test_highway_profile_respects_private_access() -> None:
    profile = highway_profile({"highway": "service", "access": "private"})
    assert profile["pedestrian_allowed"] is False
    assert profile["vehicle_allowed"] is False


def test_google_maps_url_has_no_api_key() -> None:
    url = google_maps_directions_url(0.406, -78.17, 0.407, -78.171, "walking")
    assert url.startswith("https://www.google.com/maps/dir/?api=1&")
    assert "travelmode=walking" in url
    assert "key=" not in url


def test_parse_bbox_rejects_invalid_ranges() -> None:
    import pytest
    from fastapi import HTTPException

    with pytest.raises(HTTPException):
        parse_bbox("1,2,3")
    with pytest.raises(HTTPException):
        parse_bbox("10,0,5,1")


def test_entrance_verification_uses_review_or_legacy_tag() -> None:
    assert entrance_is_verified({"yachay:access_review": "verified"})
    assert entrance_is_verified({"yachay:verification": "verified"})
    assert not entrance_is_verified({"yachay:access_review": "unverified"})
    assert not entrance_is_verified({"entrance": "main"})

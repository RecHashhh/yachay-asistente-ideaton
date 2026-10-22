from __future__ import annotations

import unittest

from app.osm import apply_place_override, normalize_text


class PlaceOverrideTests(unittest.TestCase):
    def test_patomar_is_classified_as_karaoke_without_mutating_osm_tags(self) -> None:
        osm_tags = {"building": "yes", "name": "Patomar", "yachay:original_building": "Patomar"}

        overridden = apply_place_override(osm_tags, ("building", "yes"))

        self.assertIsNotNone(overridden)
        assert overridden is not None
        self.assertEqual(overridden["name"], "Patomar")
        self.assertEqual((overridden["category"], overridden["subcategory"]), ("entertainment", "karaoke"))
        self.assertTrue(
            {"karaoke", "centro de diversion", "lugar de diversion", "lugar de entretenimiento"}
            <= {normalize_text(alias) for alias in overridden["aliases"]}
        )
        self.assertEqual(overridden["custom_tags"], {"amenity": "karaoke", "leisure": "entertainment"})
        self.assertEqual(
            osm_tags,
            {"building": "yes", "name": "Patomar", "yachay:original_building": "Patomar"},
        )

    def test_original_building_identity_survives_an_osm_renaming(self) -> None:
        overridden = apply_place_override(
            {"name": "Patomar Servicios", "yachay:original_building": "Patomar", "building": "yes"},
            ("building", "yes"),
        )

        self.assertIsNotNone(overridden)
        self.assertEqual(overridden["name"], "Patomar")


if __name__ == "__main__":
    unittest.main()

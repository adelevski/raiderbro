from __future__ import annotations

import unittest
from pathlib import Path

from scripts import convert_wiki_tables as converter


FIXTURES = Path(__file__).parent / "fixtures"


class ConvertWikiTablesTests(unittest.TestCase):
    def test_extract_table_normalizes_text_numbers_and_image_source(self) -> None:
        html = (FIXTURES / "wiki_table.html").read_text(encoding="utf-8")

        headers, rows = converter.extract_table(html)

        self.assertEqual(headers, ["Image", "Item", "Sell Price"])
        self.assertEqual(rows[0][0].image_src, "/images/metal.png")
        self.assertEqual(rows[0][1].text, "Metal | Parts")
        self.assertEqual(converter.normalize_number(rows[0][2].text), "1250")

    def test_split_sections_and_requirement_parser(self) -> None:
        sections = converter.split_sections(
            "# Gunsmith\n<table></table>\n# Refiner\n<table></table>\n"
        )

        self.assertEqual([title for title, _ in sections], ["Gunsmith", "Refiner"])
        self.assertEqual(converter.parse_requirement("12x Metal Parts"), ("12", "Metal Parts"))
        with self.assertRaisesRegex(ValueError, "positive"):
            converter.parse_requirement("0x Metal Parts")

    def test_level_and_reward_validation_rejects_invalid_values(self) -> None:
        with self.assertRaisesRegex(ValueError, "not contiguous"):
            converter.validate_level_sequence([{"level": 1}, {"level": 3}], "Fixture")
        with self.assertRaisesRegex(ValueError, "positive"):
            converter.normalize_reward_entries([{"item": "Coins", "quantity": 0}])

    def test_tracker_validation_rejects_duplicate_item_names(self) -> None:
        with self.assertRaisesRegex(ValueError, "Item names must be unique"):
            converter.validate_tracker_data(
                item_records=[
                    {"item": "Metal Parts", "category": ""},
                    {"item": "Metal Parts", "category": ""},
                ],
                cards=[],
                found_in_by_item={},
                ui_icons={
                    "foundIn": {},
                    "itemCategories": {},
                    "currencies": {"Coins": "coins.png"},
                },
                reward_catalog={},
                weapon_records=[],
            )


if __name__ == "__main__":
    unittest.main()

from __future__ import annotations

import unittest
from pathlib import Path

from scripts import fetch_weapon_wiki as fetcher


FIXTURES = Path(__file__).parent / "fixtures"


class FetchWeaponWikiParserTests(unittest.TestCase):
    def test_template_and_crafting_parsing_uses_local_fixture(self) -> None:
        raw = (FIXTURES / "weapon_templates.txt").read_text(encoding="utf-8")

        infobox = fetcher.extract_template_fields(raw, "Infobox weapon")
        crafting = fetcher.parse_crafting_template(raw)

        self.assertEqual(infobox["rarity"], "Rare")
        self.assertEqual(fetcher.parse_fire_rate_fields(infobox["firerate"]), (12.5, 750.0))
        self.assertEqual(fetcher.parse_sell_prices(infobox["sellprice"]), {1: 1000, 2: 2000})
        self.assertEqual(
            crafting["ingredients"],
            [
                {"item": "Metal Parts", "quantity": 2},
                {"item": "Rubber Parts", "quantity": 3},
            ],
        )
        self.assertTrue(crafting["blueprintRequired"])

    def test_effect_parsing_distinguishes_percent_flat_and_text(self) -> None:
        self.assertEqual(
            fetcher.parse_effect("15% Reduced Vertical Recoil"),
            {
                "text": "15% Reduced Vertical Recoil",
                "kind": "percent",
                "stat": "Vertical Recoil",
                "statKey": "verticalRecoil",
                "delta": -15.0,
            },
        )
        self.assertEqual(fetcher.parse_effect("+20 Durability")["delta"], 20)
        self.assertEqual(fetcher.parse_effect("Special behavior")["kind"], "text")


if __name__ == "__main__":
    unittest.main()

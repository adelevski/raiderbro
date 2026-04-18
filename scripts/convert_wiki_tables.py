#!/usr/bin/env python3
"""Convert pasted Arc Raiders wiki HTML tables into Raiderbro app datasets."""

from __future__ import annotations

import csv
import hashlib
import json
import re
import urllib.request
from datetime import datetime, timezone
from dataclasses import dataclass
from html.parser import HTMLParser
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
RAW_DATA = ROOT / "data" / "raw"
PROCESSED_DATA = ROOT / "data" / "processed"
MANUAL_DATA = ROOT / "data" / "manual"
APP_DIR = ROOT / "app"
APP_GENERATED_DIR = APP_DIR / "generated"

ITEMS_TXT = RAW_DATA / "items.txt"
WORKSHOPS_TXT = RAW_DATA / "workshops.txt"
WEAPONS_TXT = RAW_DATA / "weapons.txt"
ITEMS_CSV = PROCESSED_DATA / "items.csv"
WORKSHOP_REQUIREMENTS_CSV = PROCESSED_DATA / "workshop_requirements.csv"
WORKSHOP_CRAFTS_CSV = PROCESSED_DATA / "workshop_crafts.csv"
REQUIREMENT_TRACKER_DATA_JS = APP_GENERATED_DIR / "requirement_tracker_data.js"
ITEM_DATA_JS = APP_GENERATED_DIR / "item_data.js"
WEAPON_DATA_JS = APP_GENERATED_DIR / "weapon_data.js"
WEAPON_MOD_DATA_JS = APP_GENERATED_DIR / "weapon_mod_data.js"
WEAPONS_CSV = PROCESSED_DATA / "weapons.csv"
WEAPON_LEVELS_CSV = PROCESSED_DATA / "weapon_levels.csv"
WEAPON_MODS_CSV = PROCESSED_DATA / "weapon_mods.csv"
WIKI_BASE_URL = "https://arcraiders.wiki"
FOUND_IN_JSON = MANUAL_DATA / "found_in.json"
UI_ICONS_JSON = MANUAL_DATA / "ui_icons.json"
MANUAL_CARDS_DIR = MANUAL_DATA / "cards"
WEAPON_METADATA_JSON = MANUAL_DATA / "weapons.json"
WEAPON_OPTIMIZER_JSON = MANUAL_DATA / "weapon_optimizer.json"
REWARDS_JSON = MANUAL_DATA / "rewards.json"
SUPPLEMENTAL_ITEMS_JSON = MANUAL_DATA / "items.json"

SECTION_RE = re.compile(r"^#\s+(.*?)\s*$", re.MULTILINE)
TABLE_RE = re.compile(r"<table\b.*?</table>", re.IGNORECASE | re.DOTALL)
ROW_RE = re.compile(r"<tr\b.*?>(.*?)</tr>", re.IGNORECASE | re.DOTALL)
CELL_RE = re.compile(r"<(td|th)\b.*?>(.*?)</\1>", re.IGNORECASE | re.DOTALL)
NUMBER_RE = re.compile(r"^-?\d[\d,]*(?:\.\d+)?$")
REQUIREMENT_RE = re.compile(r"^(?P<quantity>\d+)x\s+(?P<item>.+)$")
USE_CATEGORY_LABELS = {
    "workshop": "Workshop",
    "projects": "Project",
    "quests": "Quest",
}
RARITY_ORDER = {
    "Common": 0,
    "Uncommon": 1,
    "Rare": 2,
    "Epic": 3,
    "Legendary": 4,
}


@dataclass
class ParsedCell:
    text: str
    image_src: str = ""


class CellTextExtractor(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.parts: list[str] = []
        self.image_src = ""
        self.skip_depth = 0

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        tag = tag.lower()
        if tag in {"style", "script"}:
            self.skip_depth += 1
            return
        if self.skip_depth:
            return

        attrs_dict = dict(attrs)
        if tag == "br":
            self.parts.append("\n")
        elif tag == "li":
            self.parts.append("\n")
        elif tag == "img" and not self.image_src:
            self.image_src = attrs_dict.get("src", "") or ""

    def handle_startendtag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        self.handle_starttag(tag, attrs)

    def handle_endtag(self, tag: str) -> None:
        tag = tag.lower()
        if tag in {"style", "script"} and self.skip_depth:
            self.skip_depth -= 1
            return
        if self.skip_depth:
            return
        if tag in {"p", "div", "li"}:
            self.parts.append("\n")

    def handle_data(self, data: str) -> None:
        if not self.skip_depth:
            self.parts.append(data)


def normalize_text(raw_text: str) -> str:
    lines = [re.sub(r"\s+", " ", line).strip() for line in raw_text.splitlines()]
    return " | ".join(line.replace("×", "x") for line in lines if line)


def normalize_number(raw_text: str) -> str:
    text = raw_text.strip()
    if NUMBER_RE.fullmatch(text):
        return text.replace(",", "")
    return text


def normalize_mediawiki_filename(filename: str) -> str:
    return filename.replace(" ", "_")


def mediawiki_file_url(filename: str) -> str:
    normalized = normalize_mediawiki_filename(filename)
    digest = hashlib.md5(normalized.encode("utf-8")).hexdigest()
    return f"{WIKI_BASE_URL}/w/images/{digest[0]}/{digest[:2]}/{normalized}"


def icon_url_from_filename(filename: str) -> str:
    if not filename:
        return ""
    return mediawiki_file_url(filename)


def absolute_wiki_url(path: str) -> str:
    if path.startswith("/"):
        return f"{WIKI_BASE_URL}{path}"
    return path


def fetch_live_wiki_html(title: str, fallback_path: Path) -> str:
    normalized = normalize_mediawiki_filename(title)
    url = f"{WIKI_BASE_URL}/wiki/{normalized}"
    try:
        with urllib.request.urlopen(url, timeout=30) as response:
            return response.read().decode("utf-8", "ignore")
    except Exception:
        return fallback_path.read_text(encoding="utf-8")


def load_json(path: Path) -> object:
    return json.loads(path.read_text(encoding="utf-8"))


def normalize_weapon_name(name: str) -> str:
    return re.sub(r"\s*\[\d+\]$", "", name.strip())


def wiki_page_url(title: str) -> str:
    return f"{WIKI_BASE_URL}/wiki/{normalize_mediawiki_filename(title)}"


def slugify(value: str) -> str:
    normalized = re.sub(r"[^a-z0-9]+", "-", value.strip().lower())
    return normalized.strip("-")


def load_found_in_by_item() -> dict[str, list[str]]:
    raw = load_json(FOUND_IN_JSON)
    return {
        str(item_name): [str(category) for category in categories]
        for item_name, categories in raw.items()
    }


def load_ui_icon_filenames() -> dict[str, dict[str, str]]:
    raw = load_json(UI_ICONS_JSON)
    return {
        "cards": {
            str(name): str(filename)
            for name, filename in raw.get("cards", {}).items()
        },
        "foundIn": {
            str(name): str(filename)
            for name, filename in raw.get("foundIn", {}).items()
        },
        "currencies": {
            str(name): str(filename)
            for name, filename in raw.get("currencies", {}).items()
        },
        "ammoTypes": {
            str(name): str(filename)
            for name, filename in raw.get("ammoTypes", {}).items()
        },
        "itemCategories": {
            str(name): str(filename)
            for name, filename in raw.get("itemCategories", {}).items()
        },
    }


def load_manual_cards() -> list[dict[str, object]]:
    cards = [
        load_json(path)
        for path in sorted(MANUAL_CARDS_DIR.glob("*.json"))
    ]
    return sorted(cards, key=lambda card: (card.get("sortOrder", 9999), card.get("title", "")))


def load_weapon_metadata() -> dict[str, dict[str, str]]:
    raw = load_json(WEAPON_METADATA_JSON)
    return {
        "rarities": {
            normalize_weapon_name(str(name)): str(rarity)
            for name, rarity in raw.get("rarities", {}).items()
        },
        "modSlotIcons": {
            str(name): str(filename)
            for name, filename in raw.get("modSlotIcons", {}).items()
        },
    }


def load_weapon_optimizer_data() -> dict[str, object]:
    if not WEAPON_OPTIMIZER_JSON.exists():
        raise FileNotFoundError(
            f"Missing {WEAPON_OPTIMIZER_JSON.relative_to(ROOT)}. "
            "Run python scripts/fetch_weapon_wiki.py first."
        )
    return dict(load_json(WEAPON_OPTIMIZER_JSON))


def load_manual_rewards() -> dict[str, dict[str, object]]:
    raw = load_json(REWARDS_JSON)
    return {
        str(name): value
        for name, value in raw.items()
    }


def load_supplemental_items() -> dict[str, dict[str, object]]:
    raw = load_json(SUPPLEMENTAL_ITEMS_JSON)
    return {
        str(name): value
        for name, value in raw.items()
    }


def normalize_reward_entries(entries: list[dict[str, object]]) -> list[dict[str, object]]:
    normalized_entries: list[dict[str, object]] = []
    for entry in entries:
        normalized_entry = {
            "item": str(entry["item"]),
            "quantity": int(entry.get("quantity", 1)),
        }
        normalized_entries.append(normalized_entry)
    return normalized_entries


def normalize_level_entries(levels: list[dict[str, object]]) -> list[dict[str, object]]:
    normalized_levels: list[dict[str, object]] = []
    for level in sorted(levels, key=lambda entry: int(entry["level"])):
        normalized_level = {
            "level": int(level["level"]),
            "requirements": [
                {
                    "item": str(requirement["item"]),
                    "quantity": int(requirement["quantity"]),
                }
                for requirement in level.get("requirements", [])
            ],
            "crafts": [str(item) for item in level.get("crafts", [])],
        }
        if "rewards" in level:
            normalized_level["rewards"] = normalize_reward_entries(level.get("rewards", []))
        for optional_key in ("label", "progressLabel", "description"):
            if optional_key in level:
                normalized_level[optional_key] = str(level[optional_key])
        normalized_levels.append(normalized_level)
    return normalized_levels


def enrich_manual_card(card_definition: dict[str, object], ui_icons: dict[str, dict[str, str]]) -> dict[str, object]:
    card = {
        "id": str(card_definition["id"]),
        "title": str(card_definition["title"]),
        "kindLabel": str(card_definition.get("kindLabel", "Progress")),
        "scope": str(card_definition["scope"]),
        "sortOrder": int(card_definition.get("sortOrder", 9999)),
        "iconUrl": "",
        "resetOnWipe": bool(card_definition.get("resetOnWipe", True)),
    }

    if card_definition.get("iconUrl"):
        card["iconUrl"] = str(card_definition["iconUrl"])
    elif card_definition.get("iconFilename"):
        card["iconUrl"] = icon_url_from_filename(str(card_definition["iconFilename"]))
    else:
        card["iconUrl"] = icon_url_from_filename(
            ui_icons["cards"].get(str(card_definition.get("iconKey", card_definition["title"])), "")
        )

    if "levels" in card_definition:
        card["minLevel"] = int(card_definition.get("minLevel", 0))
        if "zeroLabel" in card_definition:
            card["zeroLabel"] = str(card_definition["zeroLabel"])
        if "completeLabel" in card_definition:
            card["completeLabel"] = str(card_definition["completeLabel"])
        card["levels"] = normalize_level_entries(card_definition.get("levels", []))
        card["maxLevel"] = max(level["level"] for level in card["levels"])
    if "variants" in card_definition:
        card["variants"] = []
        for variant in card_definition.get("variants", []):
            normalized_variant = {
                "id": str(variant["id"]),
                "title": str(variant["title"]),
                "minLevel": int(variant.get("minLevel", 0)),
                "zeroLabel": str(variant.get("zeroLabel", "Not started")),
                "completeLabel": str(variant.get("completeLabel", "Complete")),
                "levels": normalize_level_entries(variant.get("levels", [])),
            }
            normalized_variant["maxLevel"] = max(level["level"] for level in normalized_variant["levels"])
            card["variants"].append(normalized_variant)
    if "completionRewards" in card_definition:
        card["completionRewards"] = normalize_reward_entries(card_definition.get("completionRewards", []))
    return card


def build_workshop_cards(
    requirement_records: list[dict[str, str]],
    craft_records: list[dict[str, str]],
    ui_icons: dict[str, dict[str, str]],
) -> list[dict[str, object]]:
    workshops: dict[str, dict[str, object]] = {}

    for record in requirement_records:
        title = record["workshop"]
        level = record["level"]
        workshop = workshops.setdefault(title, {"levels": {}})
        levels = workshop["levels"]
        level_data = levels.setdefault(level, {"requirements": [], "crafts": []})
        level_data["requirements"].append(
            {
                "item": record["item"],
                "quantity": int(record["quantity"]),
            }
        )

    for record in craft_records:
        title = record["workshop"]
        level = record["level"]
        workshop = workshops.setdefault(title, {"levels": {}})
        levels = workshop["levels"]
        level_data = levels.setdefault(level, {"requirements": [], "crafts": []})
        level_data["crafts"].append(record["item"])

    cards: list[dict[str, object]] = []
    for title, workshop_data in sorted(workshops.items(), key=lambda entry: entry[0]):
        levels = workshop_data["levels"]
        normalized_levels = [
            {
                "level": int(level),
                "requirements": levels[level]["requirements"],
                "crafts": levels[level]["crafts"],
            }
            for level in sorted(levels, key=int)
        ]
        cards.append(
            {
                "id": f"workshop-{slugify(title)}",
                "title": title,
                "kindLabel": "Workshop",
                "scope": "workshops",
                "sortOrder": 0,
                "iconUrl": icon_url_from_filename(
                    ui_icons["cards"].get(title, ui_icons["cards"].get("Workbench", ""))
                ),
                "minLevel": 0,
                "maxLevel": max(level["level"] for level in normalized_levels),
                "levels": normalized_levels,
            }
        )
    return cards


def build_item_lookup(item_records: list[dict[str, str]]) -> dict[str, dict[str, str]]:
    return {record["item"]: record for record in item_records}


def get_item_sell_price(item_lookup: dict[str, dict[str, str]], item_name: str) -> int:
    record = item_lookup.get(item_name, {})
    raw_value = str(record.get("sell_price", "")).strip()
    return int(raw_value) if raw_value else 0


def get_weapon_rarity(
    weapon_name: str,
    weapon_metadata: dict[str, dict[str, str]],
    optimizer_weapons: dict[str, dict[str, object]] | None = None,
) -> str:
    if optimizer_weapons and weapon_name in optimizer_weapons:
        rarity = str(optimizer_weapons[weapon_name].get("rarity", "")).strip()
        if rarity:
            return rarity
    return weapon_metadata["rarities"].get(weapon_name, "")


def compute_materials_value(
    materials: list[dict[str, object]],
    item_lookup: dict[str, dict[str, str]],
) -> int:
    total = 0
    for entry in materials:
        total += int(entry.get("quantity", 0)) * get_item_sell_price(item_lookup, str(entry.get("item", "")))
    return total


def build_weapon_lookup(
    weapon_records: list[dict[str, str]],
    weapon_metadata: dict[str, dict[str, str]],
) -> dict[str, dict[str, str]]:
    return {
        record["name"]: {
            **record,
            "rarity": get_weapon_rarity(record["name"], weapon_metadata),
        }
        for record in weapon_records
    }


def build_reward_catalog(
    manual_rewards: dict[str, dict[str, object]],
    item_records: list[dict[str, str]],
    weapon_records: list[dict[str, str]],
    weapon_metadata: dict[str, dict[str, str]],
    ui_icons: dict[str, dict[str, str]],
) -> dict[str, dict[str, object]]:
    item_lookup = build_item_lookup(item_records)
    weapon_lookup = build_weapon_lookup(weapon_records, weapon_metadata)
    catalog: dict[str, dict[str, object]] = {}

    for reward_name, definition in manual_rewards.items():
        reward: dict[str, object] = {
            "kindLabel": str(definition.get("kindLabel", "Reward")),
        }
        if definition.get("description"):
            reward["description"] = str(definition["description"])
        if definition.get("rarity"):
            reward["rarity"] = str(definition["rarity"])
        if definition.get("pageTitle"):
            reward["pageUrl"] = wiki_page_url(str(definition["pageTitle"]))

        image_url = ""
        icon_item_ref = str(definition.get("iconItemRef", "")).strip()
        icon_weapon_ref = str(definition.get("iconWeaponRef", "")).strip()
        icon_filename = str(definition.get("iconFilename", "")).strip()
        icon_url = str(definition.get("iconUrl", "")).strip()

        if icon_item_ref:
            image_url = absolute_wiki_url(item_lookup[icon_item_ref]["image_src"])
        elif icon_weapon_ref:
            image_url = weapon_lookup[icon_weapon_ref]["image_url"]
        elif icon_filename:
            image_url = icon_url_from_filename(icon_filename)
        elif icon_url:
            image_url = icon_url

        if image_url:
            reward["imageUrl"] = image_url

        details: list[dict[str, str]] = []
        for detail in definition.get("details", []):
            details.append(
                {
                    "label": str(detail["label"]),
                    "value": str(detail["value"]),
                }
            )
        if details:
            reward["details"] = details

        catalog[reward_name] = reward

    return catalog


def validate_level_sequence(levels: list[dict[str, object]], owner: str) -> None:
    level_numbers = [int(level["level"]) for level in levels]
    if not level_numbers:
        raise ValueError(f"{owner} is missing level definitions.")
    if sorted(level_numbers) != level_numbers:
        raise ValueError(f"{owner} levels are not sorted ascending: {level_numbers}")
    if len(set(level_numbers)) != len(level_numbers):
        raise ValueError(f"{owner} has duplicate levels: {level_numbers}")
    for previous, current in zip(level_numbers, level_numbers[1:]):
        if current - previous != 1:
            raise ValueError(f"{owner} levels are not contiguous: {level_numbers}")


def validate_tracker_data(
    item_records: list[dict[str, str]],
    cards: list[dict[str, object]],
    found_in_by_item: dict[str, list[str]],
    ui_icons: dict[str, dict[str, str]],
    reward_catalog: dict[str, dict[str, object]],
    weapon_records: list[dict[str, str]],
) -> None:
    item_names = {record["item"] for record in item_records}
    weapon_names = {record["name"] for record in weapon_records}
    item_categories = {record["category"] for record in item_records if record.get("category")}
    card_ids = [str(card["id"]) for card in cards]

    if len(set(card_ids)) != len(card_ids):
        raise ValueError(f"Card ids must be unique. Got: {card_ids}")

    unknown_found_in_items = sorted(set(found_in_by_item) - item_names)
    if unknown_found_in_items:
        raise ValueError(f"Found-in mappings reference unknown items: {unknown_found_in_items}")

    used_found_in_categories = {
        category
        for categories in found_in_by_item.values()
        for category in categories
    }
    for record in item_records:
        used_found_in_categories.update(split_pipe_list(record.get("found_in", "")))
    missing_found_in_icons = sorted(category for category in used_found_in_categories if category not in ui_icons["foundIn"])
    if missing_found_in_icons:
        raise ValueError(f"Missing found-in icons for categories: {missing_found_in_icons}")

    missing_item_category_icons = sorted(category for category in item_categories if category not in ui_icons["itemCategories"])
    if missing_item_category_icons:
        raise ValueError(f"Missing item category icons for categories: {missing_item_category_icons}")

    if "Coins" not in ui_icons["currencies"]:
        raise ValueError("Missing currency icon for Coins.")

    for card in cards:
        if not card.get("title"):
            raise ValueError("Each card must have a title.")
        if not card.get("iconUrl"):
            raise ValueError(f"Card {card['id']} is missing an icon URL.")

        if "levels" in card:
            validate_level_sequence(card["levels"], f"Card {card['title']}")
            required_items = [
                requirement["item"]
                for level in card["levels"]
                for requirement in level["requirements"]
            ]
            reward_items = [
                reward["item"]
                for level in card["levels"]
                for reward in level.get("rewards", [])
            ]
        elif card.get("variants"):
            variant_ids = [str(variant["id"]) for variant in card.get("variants", [])]
            if len(set(variant_ids)) != len(variant_ids):
                raise ValueError(f"Card {card['title']} has duplicate variant ids: {variant_ids}")
            required_items = []
            reward_items = []
            for variant in card.get("variants", []):
                validate_level_sequence(variant["levels"], f"Variant {variant['title']}")
                required_items.extend(
                    requirement["item"]
                    for level in variant["levels"]
                    for requirement in level["requirements"]
                )
                reward_items.extend(
                    reward["item"]
                    for level in variant["levels"]
                    for reward in level.get("rewards", [])
                )
        else:
            raise ValueError(f"Card {card['title']} must define either levels or variants.")

        unknown_items = sorted(item for item in set(required_items) if item not in item_names)
        if unknown_items:
            raise ValueError(f"Card {card['title']} references unknown items: {unknown_items}")

        if card.get("completionRewards"):
            reward_items.extend(reward["item"] for reward in card.get("completionRewards", []))

        unknown_rewards = sorted(
            reward_item
            for reward_item in set(reward_items)
            if reward_item not in item_names and reward_item not in weapon_names and reward_item not in reward_catalog
        )
        if unknown_rewards:
            raise ValueError(f"Card {card['title']} references unknown rewards: {unknown_rewards}")


def build_requirement_tracker_payload(
    requirement_records: list[dict[str, str]],
    craft_records: list[dict[str, str]],
    item_records: list[dict[str, str]],
    weapon_records: list[dict[str, str]],
    weapon_metadata: dict[str, dict[str, str]],
    manual_cards: list[dict[str, object]],
    manual_rewards: dict[str, dict[str, object]],
    found_in_by_item: dict[str, list[str]],
    ui_icons: dict[str, dict[str, str]],
) -> dict[str, object]:
    workshop_cards = build_workshop_cards(requirement_records, craft_records, ui_icons)
    curated_cards = [enrich_manual_card(card_definition, ui_icons) for card_definition in manual_cards]
    reward_catalog = build_reward_catalog(manual_rewards, item_records, weapon_records, weapon_metadata, ui_icons)
    cards = sorted(
        workshop_cards + curated_cards,
        key=lambda card: (
            int(card.get("sortOrder", 9999)),
            str(card.get("title", "")),
        ),
    )
    validate_tracker_data(item_records, cards, found_in_by_item, ui_icons, reward_catalog, weapon_records)

    payload_without_meta = {
        "uiIcons": {
            "cards": {
                name: icon_url_from_filename(filename)
                for name, filename in ui_icons["cards"].items()
            },
            "foundIn": {
                name: icon_url_from_filename(filename)
                for name, filename in ui_icons["foundIn"].items()
            },
        },
        "rewardCatalog": reward_catalog,
        "cards": cards,
    }
    build_id = hashlib.sha1(json.dumps(payload_without_meta, sort_keys=True).encode("utf-8")).hexdigest()[:8]
    return {
        "schemaVersion": 3,
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "buildId": build_id,
        **payload_without_meta,
    }


def parse_cell(cell_html: str) -> ParsedCell:
    parser = CellTextExtractor()
    parser.feed(cell_html)
    parser.close()
    return ParsedCell(text=normalize_text("".join(parser.parts)), image_src=parser.image_src)


def extract_table(table_html: str) -> tuple[list[str], list[list[ParsedCell]]]:
    parsed_rows: list[list[ParsedCell]] = []
    for row_html in ROW_RE.findall(table_html):
        cell_matches = CELL_RE.findall(row_html)
        if not cell_matches:
            continue
        parsed_rows.append([parse_cell(cell_html) for _, cell_html in cell_matches])

    if not parsed_rows:
        raise ValueError("No table rows found.")

    headers = [cell.text for cell in parsed_rows[0]]
    return headers, parsed_rows[1:]


def find_table(text: str) -> str:
    match = TABLE_RE.search(text)
    if not match:
        raise ValueError("No HTML table found in source text.")
    return match.group(0)


def split_sections(text: str) -> list[tuple[str, str]]:
    matches = list(SECTION_RE.finditer(text))
    if not matches:
        raise ValueError("No section headings found.")

    sections: list[tuple[str, str]] = []
    for index, match in enumerate(matches):
        start = match.end()
        end = matches[index + 1].start() if index + 1 < len(matches) else len(text)
        sections.append((match.group(1).strip(), text[start:end]))
    return sections


def write_csv(path: Path, fieldnames: list[str], rows: list[dict[str, str]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)


def write_text(path: Path, content: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content, encoding="utf-8")


def build_recycle_entries(raw_text: str) -> list[dict[str, object]]:
    formatted = raw_text.strip()
    if not formatted or formatted == "Cannot be recycled":
        return []

    entries: list[dict[str, object]] = []
    for entry in split_pipe_list(formatted):
        match = REQUIREMENT_RE.fullmatch(entry)
        if not match:
            entries.append({"text": entry})
            continue
        quantity = int(match.group("quantity"))
        item_name = match.group("item")
        entries.append(
            {
                "item": item_name,
                "quantity": quantity,
                "text": f"{quantity}x {item_name}",
            }
        )
    return entries


def build_recycle_status(raw_text: str) -> str:
    formatted = raw_text.strip()
    if not formatted:
        return "None"
    if formatted == "Cannot be recycled":
        return formatted
    return ""


def build_use_entries(raw_text: str) -> list[dict[str, str]]:
    tokens = split_pipe_list(raw_text)
    current_category = ""
    entries: list[dict[str, str]] = []

    for token in tokens:
        normalized = token.lower()
        if normalized in USE_CATEGORY_LABELS:
            current_category = USE_CATEGORY_LABELS[normalized]
            continue
        entry = {"text": token}
        if current_category:
            entry["category"] = current_category
        entries.append(entry)

    return entries


def parse_item_records(
    found_in_by_item: dict[str, list[str]],
    supplemental_items: dict[str, dict[str, object]],
) -> list[dict[str, str]]:
    header_map = {
        "Image": "image_src",
        "Item": "item",
        "Rarity": "rarity",
        "Recycles To": "recycles_to",
        "Sell Price": "sell_price",
        "Stack Size": "stack_size",
        "Category": "category",
        "Uses": "uses",
    }

    headers, rows = extract_table(find_table(fetch_live_wiki_html("Loot", ITEMS_TXT)))
    if headers != list(header_map):
        raise ValueError(f"Unexpected items headers: {headers}")

    records: list[dict[str, str]] = []
    for row in rows:
        record: dict[str, str] = {}
        for header, cell in zip(headers, row):
            key = header_map[header]
            value = cell.image_src if header == "Image" else cell.text
            if key in {"sell_price", "stack_size"}:
                value = normalize_number(value)
            record[key] = value
        record["found_in"] = " | ".join(found_in_by_item.get(record["item"], []))
        records.append(record)

    for item_name, item_definition in supplemental_items.items():
        records.append(
            {
                "image_src": icon_url_from_filename(str(item_definition.get("imageFilename", ""))),
                "item": item_name,
                "rarity": str(item_definition.get("rarity", "")),
                "recycles_to": str(item_definition.get("recycles_to", "")),
                "sell_price": normalize_number(str(item_definition.get("sell_price", ""))),
                "stack_size": normalize_number(str(item_definition.get("stack_size", ""))),
                "category": str(item_definition.get("category", "")),
                "uses": str(item_definition.get("uses", "")),
                "found_in": " | ".join(str(value) for value in item_definition.get("found_in", [])),
            }
        )

    records.sort(key=lambda record: record["item"])
    return records


def build_items_csv(
    found_in_by_item: dict[str, list[str]],
    ui_icons: dict[str, dict[str, str]],
    supplemental_items: dict[str, dict[str, object]],
) -> tuple[int, list[dict[str, str]]]:
    records = parse_item_records(found_in_by_item, supplemental_items)
    write_csv(
        ITEMS_CSV,
        ["image_src", "item", "rarity", "recycles_to", "sell_price", "stack_size", "category", "uses", "found_in"],
        records,
    )
    write_item_data(records, found_in_by_item, ui_icons)
    return len(records), records


def build_named_icon_entries(names: list[str], icon_filenames: dict[str, str]) -> list[dict[str, str]]:
    entries: list[dict[str, str]] = []
    for name in names:
        entry = {"text": name}
        icon_filename = icon_filenames.get(name, "")
        if icon_filename:
            entry["iconUrl"] = icon_url_from_filename(icon_filename)
        entries.append(entry)
    return entries


def write_item_data(
    records: list[dict[str, str]],
    found_in_by_item: dict[str, list[str]],
    ui_icons: dict[str, dict[str, str]],
) -> None:
    payload: dict[str, dict[str, object]] = {}
    for record in records:
        item_name = record["item"]
        image_src = record["image_src"]
        found_in = found_in_by_item.get(item_name, split_pipe_list(record.get("found_in", "")))
        item_payload: dict[str, object] = {
            "imageUrl": f"{WIKI_BASE_URL}{image_src}" if image_src.startswith("/") else image_src,
            "rarity": record["rarity"],
            "sellPrice": record["sell_price"],
            "stackSize": record["stack_size"],
            "category": record["category"],
            "categoryIconUrl": icon_url_from_filename(ui_icons["itemCategories"].get(record["category"], "")),
            "sellPriceIconUrl": icon_url_from_filename(ui_icons["currencies"].get("Coins", "")),
        }
        if found_in:
            item_payload["foundIn"] = found_in
            item_payload["foundInEntries"] = build_named_icon_entries(found_in, ui_icons["foundIn"])

        recycle_entries = build_recycle_entries(record["recycles_to"])
        if recycle_entries:
            item_payload["recycleEntries"] = recycle_entries

        recycle_status = build_recycle_status(record["recycles_to"])
        if recycle_status:
            item_payload["recycleStatus"] = recycle_status

        uses_entries = build_use_entries(record["uses"])
        if uses_entries:
            item_payload["usesEntries"] = uses_entries

        payload[item_name] = item_payload

    content = (
        "// Generated by scripts/convert_wiki_tables.py\n"
        f"window.ITEM_DATA = {json.dumps(payload, indent=2)};\n"
    )
    write_text(ITEM_DATA_JS, content)


def parse_workshop_records() -> tuple[list[dict[str, str]], list[dict[str, str]]]:
    requirement_records: list[dict[str, str]] = []
    craft_records: list[dict[str, str]] = []

    for workshop_title, section_html in split_sections(WORKSHOPS_TXT.read_text(encoding="utf-8")):
        headers, rows = extract_table(find_table(section_html))
        if headers != ["Level", "Requirements", "Crafts"]:
            raise ValueError(f"Unexpected workshop headers for {workshop_title}: {headers}")

        for row in rows:
            for requirement in split_pipe_list(row[1].text):
                quantity, item = parse_requirement(requirement)
                requirement_records.append(
                    {
                        "workshop": workshop_title,
                        "level": normalize_number(row[0].text),
                        "item": item,
                        "quantity": quantity,
                    }
                )

            for craft in split_pipe_list(row[2].text):
                craft_records.append(
                    {
                        "workshop": workshop_title,
                        "level": normalize_number(row[0].text),
                        "item": craft,
                    }
                )

    return requirement_records, craft_records


def build_workshop_datasets() -> tuple[int, list[dict[str, str]], list[dict[str, str]]]:
    requirement_records, craft_records = parse_workshop_records()
    write_csv(WORKSHOP_REQUIREMENTS_CSV, ["workshop", "level", "item", "quantity"], requirement_records)
    write_csv(WORKSHOP_CRAFTS_CSV, ["workshop", "level", "item"], craft_records)
    workshop_levels = {(record["workshop"], record["level"]) for record in requirement_records}
    return len(workshop_levels), requirement_records, craft_records


def split_pipe_list(text: str) -> list[str]:
    return [part.strip() for part in text.split(" | ") if part.strip()]


def parse_requirement(text: str) -> tuple[str, str]:
    match = REQUIREMENT_RE.fullmatch(text.strip())
    if not match:
        raise ValueError(f"Unexpected requirement format: {text}")
    return match.group("quantity"), match.group("item")


def write_requirement_tracker_data(
    requirement_records: list[dict[str, str]],
    craft_records: list[dict[str, str]],
    item_records: list[dict[str, str]],
    weapon_records: list[dict[str, str]],
    weapon_metadata: dict[str, dict[str, str]],
    manual_cards: list[dict[str, object]],
    manual_rewards: dict[str, dict[str, object]],
    found_in_by_item: dict[str, list[str]],
    ui_icons: dict[str, dict[str, str]],
) -> None:
    payload = build_requirement_tracker_payload(
        requirement_records,
        craft_records,
        item_records,
        weapon_records,
        weapon_metadata,
        manual_cards,
        manual_rewards,
        found_in_by_item,
        ui_icons,
    )

    content = (
        "// Generated by scripts/convert_wiki_tables.py\n"
        f"window.REQUIREMENT_TRACKER_DATA = {json.dumps(payload, indent=2)};\n"
    )
    write_text(REQUIREMENT_TRACKER_DATA_JS, content)


def parse_legacy_weapon_records() -> list[dict[str, str]]:
    header_map = {
        "Name": "name",
        "Ammo Type": "ammo_type",
        "Firing Mode": "firing_mode",
        "Damage": "damage",
        "Fire Rate": "fire_rate",
        "Relative DPS": "relative_dps",
        "Range": "range",
        "Mod Slots": "mod_slots",
    }

    records: list[dict[str, str]] = []
    for weapon_type, section_html in split_sections(WEAPONS_TXT.read_text(encoding="utf-8")):
        headers, rows = extract_table(find_table(section_html))
        if headers != list(header_map):
            raise ValueError(f"Unexpected weapon headers for {weapon_type}: {headers}")

        for row in rows:
            record: dict[str, str] = {}
            for header, cell in zip(headers, row):
                key = header_map[header]
                value = cell.text
                if key == "name":
                    value = normalize_weapon_name(value)
                if key in {"damage", "fire_rate", "relative_dps", "range"}:
                    value = normalize_number(value)
                record[key] = value
                if header == "Name":
                    record["image_url"] = absolute_wiki_url(cell.image_src)
                    record["page_url"] = wiki_page_url(record["name"])
            record["type"] = weapon_type
            records.append(record)

    return records


def parse_weapon_records() -> list[dict[str, str]]:
    header_map = {
        "Name": "name",
        "Ammo Type": "ammo_type",
        "Firing Mode": "firing_mode",
        "Damage": "damage",
        "Fire Rate": "fire_rate",
        "Range": "range",
        "Mod Slots": "mod_slots",
    }
    legacy_relative_dps = {
        record["name"]: record.get("relative_dps", "")
        for record in parse_legacy_weapon_records()
    }
    html = fetch_live_wiki_html("Weapons", WEAPONS_TXT)
    section_pattern = re.compile(
        r"<h3 id=\"(?P<section_id>[^\"]+)\">(?P<section_title>[^<]+)</h3></div>\s*<table\b.*?</table>",
        re.IGNORECASE | re.DOTALL,
    )

    records: list[dict[str, str]] = []
    for match in section_pattern.finditer(html):
        weapon_type = normalize_text(match.group("section_title"))
        table_html = match.group(0)
        headers, rows = extract_table(find_table(table_html))
        if headers != list(header_map):
            continue

        for row in rows:
            record: dict[str, str] = {}
            for header, cell in zip(headers, row):
                key = header_map[header]
                value = cell.text
                if key == "name":
                    value = normalize_weapon_name(value)
                if key in {"damage", "fire_rate", "range"}:
                    value = normalize_number(value)
                record[key] = value
                if header == "Name":
                    record["image_url"] = absolute_wiki_url(cell.image_src)
                    record["page_url"] = wiki_page_url(record["name"])
            record["relative_dps"] = legacy_relative_dps.get(record["name"], "")
            record["type"] = weapon_type
            records.append(record)

    return records


def build_weapon_mod_slot_entries(
    raw_text: str,
    mod_slot_icons: dict[str, str],
    optimizer_mods: dict[str, dict[str, object]] | None = None,
    item_lookup: dict[str, dict[str, str]] | None = None,
) -> list[dict[str, str]]:
    entries: list[dict[str, str]] = []
    for mod_slot_name in split_pipe_list(raw_text):
        if mod_slot_name.upper() == "N/A":
            continue
        entry = {"name": mod_slot_name}
        icon_filename = mod_slot_icons.get(mod_slot_name, "")
        if icon_filename:
            entry["iconUrl"] = icon_url_from_filename(icon_filename)
        if optimizer_mods is not None:
            compatible_mod_names = [
                mod_name
                for mod_name, mod_definition in optimizer_mods.items()
                if mod_definition.get("slot") == mod_slot_name
            ]
            if item_lookup is not None:
                compatible_mod_names.sort(
                    key=lambda mod_name: (
                        RARITY_ORDER.get(item_lookup.get(mod_name, {}).get("rarity", ""), 99),
                        mod_name,
                    )
                )
            else:
                compatible_mod_names.sort()
            entry["options"] = compatible_mod_names
        entries.append(entry)
    return entries


def validate_weapon_metadata(
    weapon_records: list[dict[str, str]],
    weapon_metadata: dict[str, dict[str, str]],
    ui_icons: dict[str, dict[str, str]],
    weapon_optimizer_data: dict[str, object],
    item_records: list[dict[str, str]],
) -> None:
    weapon_names = {record["name"] for record in weapon_records}
    optimizer_weapons = {
        str(name): dict(value)
        for name, value in dict(weapon_optimizer_data.get("weapons", {})).items()
    }
    derived_rarity_names = {
        weapon_name
        for weapon_name, definition in optimizer_weapons.items()
        if str(definition.get("rarity", "")).strip()
    }
    rarity_names = set(weapon_metadata["rarities"]) | derived_rarity_names
    missing_rarity = sorted(weapon_names - rarity_names)
    if missing_rarity:
        raise ValueError(f"Missing weapon rarities for: {missing_rarity}")

    unknown_rarity_entries = sorted(set(weapon_metadata["rarities"]) - weapon_names)
    if unknown_rarity_entries:
        raise ValueError(f"Weapon rarity metadata references unknown weapons: {unknown_rarity_entries}")

    mod_slot_names = {
        mod_slot_name
        for record in weapon_records
        for mod_slot_name in split_pipe_list(record["mod_slots"])
        if mod_slot_name.upper() != "N/A"
    }
    missing_mod_slot_icons = sorted(
        mod_slot_name
        for mod_slot_name in mod_slot_names
        if mod_slot_name not in weapon_metadata["modSlotIcons"]
    )
    if missing_mod_slot_icons:
        raise ValueError(f"Missing mod slot icons for: {missing_mod_slot_icons}")

    ammo_types = {
        record["ammo_type"]
        for record in weapon_records
        if record.get("ammo_type") and record["ammo_type"].upper() != "N/A"
    }
    missing_ammo_icons = sorted(ammo_type for ammo_type in ammo_types if ammo_type not in ui_icons["ammoTypes"])
    if missing_ammo_icons:
        raise ValueError(f"Missing ammo type icons for: {missing_ammo_icons}")

    missing_optimizer_weapons = sorted(weapon_names - set(optimizer_weapons))
    if missing_optimizer_weapons:
        raise ValueError(
            f"Missing weapon optimizer source data for: {missing_optimizer_weapons}. "
            "Run python scripts/fetch_weapon_wiki.py."
        )

    item_names = {record["item"] for record in item_records}
    optimizer_mods = {
        str(name): value
        for name, value in dict(weapon_optimizer_data.get("mods", {})).items()
    }
    missing_mod_items = sorted(name for name in optimizer_mods if name not in item_names)
    if missing_mod_items:
        raise ValueError(f"Weapon mod dataset references unknown item rows: {missing_mod_items}")

    missing_mod_material_items = sorted(
        {
            str(entry.get("item", ""))
            for mod_definition in optimizer_mods.values()
            for entry in mod_definition.get("craftingMaterialsDetailed", [])
            if str(entry.get("item", "")) not in item_names
        }
    )
    if missing_mod_material_items:
        raise ValueError(f"Weapon mod crafting materials reference unknown items: {missing_mod_material_items}")

    missing_weapon_material_items = sorted(
        {
            str(entry.get("item", ""))
            for weapon_definition in optimizer_weapons.values()
            for level in weapon_definition.get("levels", [])
            for entry in level.get("fromScratchMaterialsDetailed", [])
            if str(entry.get("item", "")) not in item_names
        }
    )
    if missing_weapon_material_items:
        raise ValueError(f"Weapon crafting materials reference unknown items: {missing_weapon_material_items}")

    optimizer_slots = {
        str(mod_definition.get("slot", ""))
        for mod_definition in optimizer_mods.values()
        if mod_definition.get("slot")
    }
    missing_optimizer_slot_icons = sorted(
        slot_name for slot_name in optimizer_slots if slot_name not in weapon_metadata["modSlotIcons"]
    )
    if missing_optimizer_slot_icons:
        raise ValueError(f"Missing mod slot icons for optimizer slots: {missing_optimizer_slot_icons}")


def get_series_value(series: dict[str, object], level: int, fallback: object = "") -> object:
    if level in series:
        return series[level]
    if str(level) in series:
        return series[str(level)]
    return fallback


def build_weapon_level_rows(
    weapon_records: list[dict[str, str]],
    optimizer_weapons: dict[str, dict[str, object]],
    item_lookup: dict[str, dict[str, str]],
) -> list[dict[str, str]]:
    rows: list[dict[str, str]] = []
    for record in weapon_records:
        optimizer_weapon = dict(optimizer_weapons.get(record["name"], {}))
        weapon_stats = dict(optimizer_weapon.get("stats", {}))
        magazine_size_by_level = dict(weapon_stats.get("magazineSizeByLevel", {}))

        for level_data in optimizer_weapon.get("levels", []):
            level = int(level_data["level"])
            rows.append(
                {
                    "weapon": record["name"],
                    "level": str(level),
                    "sell_price": str(level_data.get("sellPrice", "")),
                    "durability": "" if level_data.get("durability") is None else str(level_data.get("durability")),
                    "magazine_size": str(
                        get_series_value(
                            magazine_size_by_level,
                            level,
                            weapon_stats.get("magazineSize", ""),
                        )
                    ),
                    "crafting_materials": " | ".join(str(value) for value in level_data.get("craftingMaterials", [])),
                    "craft_value": str(
                        compute_materials_value(
                            list(level_data.get("craftingMaterialsDetailed", [])),
                            item_lookup,
                        )
                    ),
                    "from_scratch_materials": " | ".join(
                        str(value) for value in level_data.get("fromScratchMaterials", [])
                    ),
                    "from_scratch_craft_value": str(
                        compute_materials_value(
                            list(level_data.get("fromScratchMaterialsDetailed", [])),
                            item_lookup,
                        )
                    ),
                    "effects": " | ".join(str(effect["text"]) for effect in level_data.get("effects", [])),
                }
            )
    return rows


def build_weapon_mod_rows(
    optimizer_mods: dict[str, dict[str, object]],
    item_lookup: dict[str, dict[str, str]],
) -> list[dict[str, str]]:
    rows: list[dict[str, str]] = []
    for mod_name in sorted(optimizer_mods):
        mod_definition = dict(optimizer_mods[mod_name])
        item_record = item_lookup[mod_name]
        image_url = str(mod_definition.get("imageUrl") or absolute_wiki_url(item_record.get("image_src", "")))
        rows.append(
            {
                "name": mod_name,
                "image_url": image_url,
                "page_url": str(mod_definition.get("pageUrl", wiki_page_url(mod_name))),
                "rarity": item_record.get("rarity", ""),
                "sell_price": item_record.get("sell_price", ""),
                "slot": str(mod_definition.get("slot", "")),
                "required_station": str(mod_definition.get("requiredStation", "")),
                "crafting_materials": " | ".join(str(value) for value in mod_definition.get("craftingMaterials", [])),
                "craft_value": str(
                    compute_materials_value(
                        list(mod_definition.get("craftingMaterialsDetailed", [])),
                        item_lookup,
                    )
                ),
                "effects": " | ".join(str(effect["text"]) for effect in mod_definition.get("effects", [])),
                "description": str(mod_definition.get("description", "")),
            }
        )
    return rows


def write_weapon_mod_data(
    optimizer_mods: dict[str, dict[str, object]],
    item_lookup: dict[str, dict[str, str]],
    weapon_metadata: dict[str, dict[str, str]],
) -> None:
    payload: dict[str, dict[str, object]] = {}
    for mod_name in sorted(optimizer_mods):
        mod_definition = dict(optimizer_mods[mod_name])
        item_record = item_lookup[mod_name]
        payload[mod_name] = {
            "imageUrl": str(mod_definition.get("imageUrl") or absolute_wiki_url(item_record.get("image_src", ""))),
            "pageUrl": str(mod_definition.get("pageUrl", wiki_page_url(mod_name))),
            "slot": str(mod_definition.get("slot", "")),
            "slotIconUrl": icon_url_from_filename(
                weapon_metadata["modSlotIcons"].get(str(mod_definition.get("slot", "")), "")
            ),
            "rarity": item_record.get("rarity", ""),
            "sellPrice": item_record.get("sell_price", ""),
            "requiredStation": str(mod_definition.get("requiredStation", "")),
            "craftingMaterials": [str(value) for value in mod_definition.get("craftingMaterials", [])],
            "craftingMaterialsDetailed": list(mod_definition.get("craftingMaterialsDetailed", [])),
            "craftValue": compute_materials_value(
                list(mod_definition.get("craftingMaterialsDetailed", [])),
                item_lookup,
            ),
            "effects": list(mod_definition.get("effects", [])),
            "description": str(mod_definition.get("description", "")),
            "weight": str(mod_definition.get("weight", "")),
        }

    content = (
        "// Generated by scripts/convert_wiki_tables.py\n"
        f"window.WEAPON_MOD_DATA = {json.dumps(payload, indent=2)};\n"
    )
    write_text(WEAPON_MOD_DATA_JS, content)


def write_weapon_data(
    records: list[dict[str, str]],
    weapon_metadata: dict[str, dict[str, str]],
    ui_icons: dict[str, dict[str, str]],
    weapon_optimizer_data: dict[str, object],
    item_records: list[dict[str, str]],
) -> None:
    item_lookup = build_item_lookup(item_records)
    optimizer_weapons = {
        str(name): dict(value)
        for name, value in dict(weapon_optimizer_data.get("weapons", {})).items()
    }
    optimizer_mods = {
        str(name): dict(value)
        for name, value in dict(weapon_optimizer_data.get("mods", {})).items()
    }
    payload: dict[str, dict[str, object]] = {}
    for record in records:
        optimizer_weapon = optimizer_weapons.get(record["name"], {})
        optimizer_stats = dict(optimizer_weapon.get("stats", {}))
        levels_payload: list[dict[str, object]] = []
        for level_data in optimizer_weapon.get("levels", []):
            normalized_level = dict(level_data)
            crafting_materials_detailed = list(normalized_level.get("craftingMaterialsDetailed", []))
            from_scratch_materials_detailed = list(normalized_level.get("fromScratchMaterialsDetailed", []))
            normalized_level["craftValue"] = compute_materials_value(crafting_materials_detailed, item_lookup)
            normalized_level["fromScratchCraftValue"] = compute_materials_value(
                from_scratch_materials_detailed,
                item_lookup,
            )
            normalized_level["craftingMaterials"] = [str(value) for value in normalized_level.get("craftingMaterials", [])]
            normalized_level["fromScratchMaterials"] = [
                str(value) for value in normalized_level.get("fromScratchMaterials", [])
            ]
            levels_payload.append(normalized_level)

        payload[record["name"]] = {
            "imageUrl": record["image_url"],
            "pageUrl": record["page_url"],
            "rarity": get_weapon_rarity(record["name"], weapon_metadata, optimizer_weapons),
            "type": record["type"],
            "ammoType": record["ammo_type"],
            "ammoTypeIconUrl": icon_url_from_filename(ui_icons["ammoTypes"].get(record["ammo_type"], "")),
            "firingMode": record["firing_mode"],
            "damage": record["damage"],
            "fireRate": record["fire_rate"],
            "relativeDps": record["relative_dps"],
            "range": record["range"],
            "description": str(optimizer_weapon.get("description", "")),
            "sellPrice": str(
                next(
                    (
                        level_data.get("sellPrice", "")
                        for level_data in optimizer_weapon.get("levels", [])
                        if int(level_data["level"]) == 1
                    ),
                    "",
                )
            ),
            "magazineSize": str(optimizer_stats.get("magazineSize", "")),
            "magazineSizeByLevel": dict(optimizer_stats.get("magazineSizeByLevel", {})),
            "arcArmorPenetration": str(optimizer_stats.get("arcArmorPenetration", "")),
            "headshotMultiplier": str(optimizer_stats.get("headshotMultiplier", "")),
            "stability": str(optimizer_stats.get("stability", "")),
            "agility": str(optimizer_stats.get("agility", "")),
            "stealth": str(optimizer_stats.get("stealth", "")),
            "weight": str(optimizer_stats.get("weight", "")),
            "fireRateRpm": optimizer_stats.get("fireRateRpm"),
            "levels": levels_payload,
            "modSlots": build_weapon_mod_slot_entries(
                record["mod_slots"],
                weapon_metadata["modSlotIcons"],
                optimizer_mods,
                item_lookup,
            ),
        }

    content = (
        "// Generated by scripts/convert_wiki_tables.py\n"
        f"window.WEAPON_DATA = {json.dumps(payload, indent=2)};\n"
    )
    write_text(WEAPON_DATA_JS, content)
    write_weapon_mod_data(optimizer_mods, item_lookup, weapon_metadata)


def build_weapons_csv(
    item_records: list[dict[str, str]],
    weapon_metadata: dict[str, dict[str, str]],
    ui_icons: dict[str, dict[str, str]],
    weapon_optimizer_data: dict[str, object],
) -> tuple[int, list[dict[str, str]]]:
    records = parse_weapon_records()
    validate_weapon_metadata(records, weapon_metadata, ui_icons, weapon_optimizer_data, item_records)
    optimizer_weapons = {
        str(name): dict(value)
        for name, value in dict(weapon_optimizer_data.get("weapons", {})).items()
    }
    item_lookup = build_item_lookup(item_records)
    write_csv(
        WEAPONS_CSV,
        [
            "name",
            "image_url",
            "page_url",
            "rarity",
            "ammo_type",
            "firing_mode",
            "damage",
            "fire_rate",
            "relative_dps",
            "range",
            "sell_price",
            "magazine_size",
            "arc_armor_penetration",
            "headshot_multiplier",
            "stability",
            "agility",
            "stealth",
            "weight",
            "description",
            "mod_slots",
            "type",
        ],
        [
            {
                **record,
                "rarity": get_weapon_rarity(record["name"], weapon_metadata, optimizer_weapons),
                "sell_price": str(
                    next(
                        (
                            level_data.get("sellPrice", "")
                            for level_data in optimizer_weapons.get(record["name"], {}).get("levels", [])
                            if int(level_data["level"]) == 1
                        ),
                        "",
                    )
                ),
                "magazine_size": str(optimizer_weapons.get(record["name"], {}).get("stats", {}).get("magazineSize", "")),
                "arc_armor_penetration": str(optimizer_weapons.get(record["name"], {}).get("stats", {}).get("arcArmorPenetration", "")),
                "headshot_multiplier": str(optimizer_weapons.get(record["name"], {}).get("stats", {}).get("headshotMultiplier", "")),
                "stability": str(optimizer_weapons.get(record["name"], {}).get("stats", {}).get("stability", "")),
                "agility": str(optimizer_weapons.get(record["name"], {}).get("stats", {}).get("agility", "")),
                "stealth": str(optimizer_weapons.get(record["name"], {}).get("stats", {}).get("stealth", "")),
                "weight": str(optimizer_weapons.get(record["name"], {}).get("stats", {}).get("weight", "")),
                "description": str(optimizer_weapons.get(record["name"], {}).get("description", "")),
            }
            for record in records
        ],
    )
    write_csv(
        WEAPON_LEVELS_CSV,
        [
            "weapon",
            "level",
            "sell_price",
            "durability",
            "magazine_size",
            "crafting_materials",
            "craft_value",
            "from_scratch_materials",
            "from_scratch_craft_value",
            "effects",
        ],
        build_weapon_level_rows(records, optimizer_weapons, item_lookup),
    )
    write_csv(
        WEAPON_MODS_CSV,
        [
            "name",
            "image_url",
            "page_url",
            "rarity",
            "sell_price",
            "slot",
            "required_station",
            "crafting_materials",
            "craft_value",
            "effects",
            "description",
        ],
        build_weapon_mod_rows(
            {
                str(name): dict(value)
                for name, value in dict(weapon_optimizer_data.get("mods", {})).items()
            },
            item_lookup,
        ),
    )
    write_weapon_data(records, weapon_metadata, ui_icons, weapon_optimizer_data, item_records)
    return len(records), records


def load_manual_tracker_config() -> tuple[
    dict[str, list[str]],
    dict[str, dict[str, str]],
    list[dict[str, object]],
    dict[str, dict[str, object]],
    dict[str, dict[str, object]],
]:
    found_in_by_item = load_found_in_by_item()
    ui_icons = load_ui_icon_filenames()
    manual_cards = load_manual_cards()
    manual_rewards = load_manual_rewards()
    supplemental_items = load_supplemental_items()
    return found_in_by_item, ui_icons, manual_cards, manual_rewards, supplemental_items


def validate_source_data() -> dict[str, int]:
    found_in_by_item, ui_icons, manual_cards, manual_rewards, supplemental_items = load_manual_tracker_config()
    weapon_metadata = load_weapon_metadata()
    weapon_optimizer_data = load_weapon_optimizer_data()
    item_records = parse_item_records(found_in_by_item, supplemental_items)
    requirement_records, craft_records = parse_workshop_records()
    weapon_records = parse_weapon_records()
    validate_weapon_metadata(weapon_records, weapon_metadata, ui_icons, weapon_optimizer_data, item_records)
    payload = build_requirement_tracker_payload(
        requirement_records,
        craft_records,
        item_records,
        weapon_records,
        weapon_metadata,
        manual_cards,
        manual_rewards,
        found_in_by_item,
        ui_icons,
    )
    return {
        "items": len(item_records),
        "cards": len(payload["cards"]),
        "weapons": len(weapon_records),
        "weaponMods": len(dict(weapon_optimizer_data.get("mods", {}))),
        "workshopLevels": len({(record["workshop"], record["level"]) for record in requirement_records}),
    }


def main() -> None:
    found_in_by_item, ui_icons, manual_cards, manual_rewards, supplemental_items = load_manual_tracker_config()
    weapon_metadata = load_weapon_metadata()
    weapon_optimizer_data = load_weapon_optimizer_data()
    items_count, item_records = build_items_csv(found_in_by_item, ui_icons, supplemental_items)
    workshop_levels_count, requirement_records, craft_records = build_workshop_datasets()
    weapons_count, weapon_records = build_weapons_csv(item_records, weapon_metadata, ui_icons, weapon_optimizer_data)
    write_requirement_tracker_data(
        requirement_records,
        craft_records,
        item_records,
        weapon_records,
        weapon_metadata,
        manual_cards,
        manual_rewards,
        found_in_by_item,
        ui_icons,
    )

    print(f"Wrote {items_count} rows to {ITEMS_CSV.name}")
    print(f"Wrote tracker item data to {ITEM_DATA_JS.relative_to(ROOT)}")
    print(f"Wrote {workshop_levels_count} workshop levels to normalized requirement datasets")
    print(f"Wrote normalized workshop requirements to {WORKSHOP_REQUIREMENTS_CSV.relative_to(ROOT)}")
    print(f"Wrote normalized workshop crafts to {WORKSHOP_CRAFTS_CSV.relative_to(ROOT)}")
    print(f"Wrote requirement tracker data to {REQUIREMENT_TRACKER_DATA_JS.relative_to(ROOT)}")
    print(f"Wrote weapon data to {WEAPON_DATA_JS.relative_to(ROOT)}")
    print(f"Wrote weapon mod data to {WEAPON_MOD_DATA_JS.relative_to(ROOT)}")
    print(f"Wrote {weapons_count} rows to {WEAPONS_CSV.name}")
    print(f"Wrote weapon levels to {WEAPON_LEVELS_CSV.relative_to(ROOT)}")
    print(f"Wrote weapon mods to {WEAPON_MODS_CSV.relative_to(ROOT)}")


if __name__ == "__main__":
    main()

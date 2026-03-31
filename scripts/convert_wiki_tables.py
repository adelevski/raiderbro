#!/usr/bin/env python3
"""Convert pasted Arc Raiders wiki HTML tables into requirement-tracker datasets."""

from __future__ import annotations

import csv
import hashlib
import json
import re
from datetime import datetime, timezone
from dataclasses import dataclass
from html.parser import HTMLParser
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
RAW_DATA = ROOT / "data" / "raw"
PROCESSED_DATA = ROOT / "data" / "processed"
MANUAL_DATA = ROOT / "data" / "manual"
REQUIREMENT_TRACKER_DIR = ROOT / "tools" / "requirement-tracker"
REQUIREMENT_TRACKER_GENERATED_DIR = REQUIREMENT_TRACKER_DIR / "generated"

ITEMS_TXT = RAW_DATA / "items.txt"
WORKSHOPS_TXT = RAW_DATA / "workshops.txt"
WEAPONS_TXT = RAW_DATA / "weapons.txt"
ITEMS_CSV = PROCESSED_DATA / "items.csv"
WORKSHOP_REQUIREMENTS_CSV = PROCESSED_DATA / "workshop_requirements.csv"
WORKSHOP_CRAFTS_CSV = PROCESSED_DATA / "workshop_crafts.csv"
REQUIREMENT_TRACKER_DATA_JS = REQUIREMENT_TRACKER_GENERATED_DIR / "requirement_tracker_data.js"
ITEM_DATA_JS = REQUIREMENT_TRACKER_GENERATED_DIR / "item_data.js"
WEAPON_DATA_JS = REQUIREMENT_TRACKER_GENERATED_DIR / "weapon_data.js"
WEAPONS_CSV = PROCESSED_DATA / "weapons.csv"
WIKI_BASE_URL = "https://arcraiders.wiki"
FOUND_IN_JSON = MANUAL_DATA / "found_in.json"
UI_ICONS_JSON = MANUAL_DATA / "ui_icons.json"
MANUAL_CARDS_DIR = MANUAL_DATA / "cards"
WEAPON_METADATA_JSON = MANUAL_DATA / "weapons.json"

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
        "iconUrl": icon_url_from_filename(
            ui_icons["cards"].get(str(card_definition.get("iconKey", card_definition["title"])), "")
        ),
    }

    if "levels" in card_definition:
        card["minLevel"] = int(card_definition.get("minLevel", 0))
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
) -> None:
    item_names = {record["item"] for record in item_records}
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
    missing_found_in_icons = sorted(category for category in used_found_in_categories if category not in ui_icons["foundIn"])
    if missing_found_in_icons:
        raise ValueError(f"Missing found-in icons for categories: {missing_found_in_icons}")

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
        elif card.get("variants"):
            variant_ids = [str(variant["id"]) for variant in card.get("variants", [])]
            if len(set(variant_ids)) != len(variant_ids):
                raise ValueError(f"Card {card['title']} has duplicate variant ids: {variant_ids}")
            required_items = []
            for variant in card.get("variants", []):
                validate_level_sequence(variant["levels"], f"Variant {variant['title']}")
                required_items.extend(
                    requirement["item"]
                    for level in variant["levels"]
                    for requirement in level["requirements"]
                )
        else:
            raise ValueError(f"Card {card['title']} must define either levels or variants.")

        unknown_items = sorted(item for item in set(required_items) if item not in item_names)
        if unknown_items:
            raise ValueError(f"Card {card['title']} references unknown items: {unknown_items}")


def build_requirement_tracker_payload(
    requirement_records: list[dict[str, str]],
    craft_records: list[dict[str, str]],
    item_records: list[dict[str, str]],
    manual_cards: list[dict[str, object]],
    found_in_by_item: dict[str, list[str]],
    ui_icons: dict[str, dict[str, str]],
) -> dict[str, object]:
    workshop_cards = build_workshop_cards(requirement_records, craft_records, ui_icons)
    curated_cards = [enrich_manual_card(card_definition, ui_icons) for card_definition in manual_cards]
    cards = sorted(
        workshop_cards + curated_cards,
        key=lambda card: (
            int(card.get("sortOrder", 9999)),
            str(card.get("title", "")),
        ),
    )
    validate_tracker_data(item_records, cards, found_in_by_item, ui_icons)

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
        "cards": cards,
    }
    build_id = hashlib.sha1(json.dumps(payload_without_meta, sort_keys=True).encode("utf-8")).hexdigest()[:8]
    return {
        "schemaVersion": 2,
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


def parse_item_records(found_in_by_item: dict[str, list[str]]) -> list[dict[str, str]]:
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

    headers, rows = extract_table(find_table(ITEMS_TXT.read_text(encoding="utf-8")))
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

    return records


def build_items_csv(found_in_by_item: dict[str, list[str]]) -> tuple[int, list[dict[str, str]]]:
    records = parse_item_records(found_in_by_item)
    write_csv(
        ITEMS_CSV,
        ["image_src", "item", "rarity", "recycles_to", "sell_price", "stack_size", "category", "uses", "found_in"],
        records,
    )
    write_item_data(records, found_in_by_item)
    return len(records), records


def write_item_data(records: list[dict[str, str]], found_in_by_item: dict[str, list[str]]) -> None:
    payload: dict[str, dict[str, object]] = {}
    for record in records:
        item_name = record["item"]
        image_src = record["image_src"]
        item_payload: dict[str, object] = {
            "imageUrl": f"{WIKI_BASE_URL}{image_src}" if image_src.startswith("/") else image_src,
            "rarity": record["rarity"],
            "sellPrice": record["sell_price"],
            "stackSize": record["stack_size"],
            "category": record["category"],
        }
        found_in = found_in_by_item.get(item_name, [])
        if found_in:
            item_payload["foundIn"] = found_in

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


def build_workshop_datasets(
    item_records: list[dict[str, str]],
    manual_cards: list[dict[str, object]],
    found_in_by_item: dict[str, list[str]],
    ui_icons: dict[str, dict[str, str]],
) -> int:
    requirement_records, craft_records = parse_workshop_records()
    write_csv(WORKSHOP_REQUIREMENTS_CSV, ["workshop", "level", "item", "quantity"], requirement_records)
    write_csv(WORKSHOP_CRAFTS_CSV, ["workshop", "level", "item"], craft_records)
    write_requirement_tracker_data(
        requirement_records,
        craft_records,
        item_records,
        manual_cards,
        found_in_by_item,
        ui_icons,
    )
    workshop_levels = {(record["workshop"], record["level"]) for record in requirement_records}
    return len(workshop_levels)


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
    manual_cards: list[dict[str, object]],
    found_in_by_item: dict[str, list[str]],
    ui_icons: dict[str, dict[str, str]],
) -> None:
    payload = build_requirement_tracker_payload(
        requirement_records,
        craft_records,
        item_records,
        manual_cards,
        found_in_by_item,
        ui_icons,
    )

    content = (
        "// Generated by scripts/convert_wiki_tables.py\n"
        f"window.REQUIREMENT_TRACKER_DATA = {json.dumps(payload, indent=2)};\n"
    )
    write_text(REQUIREMENT_TRACKER_DATA_JS, content)


def parse_weapon_records() -> list[dict[str, str]]:
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


def build_weapon_mod_slot_entries(
    raw_text: str,
    mod_slot_icons: dict[str, str],
) -> list[dict[str, str]]:
    entries: list[dict[str, str]] = []
    for mod_slot_name in split_pipe_list(raw_text):
        if mod_slot_name.upper() == "N/A":
            continue
        entry = {"name": mod_slot_name}
        icon_filename = mod_slot_icons.get(mod_slot_name, "")
        if icon_filename:
            entry["iconUrl"] = icon_url_from_filename(icon_filename)
        entries.append(entry)
    return entries


def validate_weapon_metadata(
    weapon_records: list[dict[str, str]],
    weapon_metadata: dict[str, dict[str, str]],
) -> None:
    weapon_names = {record["name"] for record in weapon_records}
    rarity_names = set(weapon_metadata["rarities"])
    missing_rarity = sorted(weapon_names - rarity_names)
    if missing_rarity:
        raise ValueError(f"Missing weapon rarities for: {missing_rarity}")

    unknown_rarity_entries = sorted(rarity_names - weapon_names)
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


def write_weapon_data(
    records: list[dict[str, str]],
    weapon_metadata: dict[str, dict[str, str]],
) -> None:
    payload: dict[str, dict[str, object]] = {}
    for record in records:
        payload[record["name"]] = {
            "imageUrl": record["image_url"],
            "pageUrl": record["page_url"],
            "rarity": weapon_metadata["rarities"][record["name"]],
            "type": record["type"],
            "ammoType": record["ammo_type"],
            "firingMode": record["firing_mode"],
            "damage": record["damage"],
            "fireRate": record["fire_rate"],
            "relativeDps": record["relative_dps"],
            "range": record["range"],
            "modSlots": build_weapon_mod_slot_entries(
                record["mod_slots"],
                weapon_metadata["modSlotIcons"],
            ),
        }

    content = (
        "// Generated by scripts/convert_wiki_tables.py\n"
        f"window.WEAPON_DATA = {json.dumps(payload, indent=2)};\n"
    )
    write_text(WEAPON_DATA_JS, content)


def build_weapons_csv(weapon_metadata: dict[str, dict[str, str]]) -> int:
    records = parse_weapon_records()
    validate_weapon_metadata(records, weapon_metadata)
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
            "mod_slots",
            "type",
        ],
        [
            {
                **record,
                "rarity": weapon_metadata["rarities"][record["name"]],
            }
            for record in records
        ],
    )
    write_weapon_data(records, weapon_metadata)
    return len(records)


def load_manual_tracker_config() -> tuple[dict[str, list[str]], dict[str, dict[str, str]], list[dict[str, object]]]:
    found_in_by_item = load_found_in_by_item()
    ui_icons = load_ui_icon_filenames()
    manual_cards = load_manual_cards()
    return found_in_by_item, ui_icons, manual_cards


def validate_source_data() -> dict[str, int]:
    found_in_by_item, ui_icons, manual_cards = load_manual_tracker_config()
    weapon_metadata = load_weapon_metadata()
    item_records = parse_item_records(found_in_by_item)
    requirement_records, craft_records = parse_workshop_records()
    weapon_records = parse_weapon_records()
    validate_weapon_metadata(weapon_records, weapon_metadata)
    payload = build_requirement_tracker_payload(
        requirement_records,
        craft_records,
        item_records,
        manual_cards,
        found_in_by_item,
        ui_icons,
    )
    return {
        "items": len(item_records),
        "cards": len(payload["cards"]),
        "weapons": len(weapon_records),
        "workshopLevels": len({(record["workshop"], record["level"]) for record in requirement_records}),
    }


def main() -> None:
    found_in_by_item, ui_icons, manual_cards = load_manual_tracker_config()
    weapon_metadata = load_weapon_metadata()
    items_count, item_records = build_items_csv(found_in_by_item)
    workshop_levels_count = build_workshop_datasets(item_records, manual_cards, found_in_by_item, ui_icons)
    weapons_count = build_weapons_csv(weapon_metadata)

    print(f"Wrote {items_count} rows to {ITEMS_CSV.name}")
    print(f"Wrote tracker item data to {ITEM_DATA_JS.relative_to(ROOT)}")
    print(f"Wrote {workshop_levels_count} workshop levels to normalized requirement datasets")
    print(f"Wrote normalized workshop requirements to {WORKSHOP_REQUIREMENTS_CSV.relative_to(ROOT)}")
    print(f"Wrote normalized workshop crafts to {WORKSHOP_CRAFTS_CSV.relative_to(ROOT)}")
    print(f"Wrote requirement tracker data to {REQUIREMENT_TRACKER_DATA_JS.relative_to(ROOT)}")
    print(f"Wrote weapon data to {WEAPON_DATA_JS.relative_to(ROOT)}")
    print(f"Wrote {weapons_count} rows to {WEAPONS_CSV.name}")


if __name__ == "__main__":
    main()

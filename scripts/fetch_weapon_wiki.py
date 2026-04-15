#!/usr/bin/env python3
"""Fetch structured weapon optimizer data from the ARC Raiders wiki."""

from __future__ import annotations

import csv
import json
import re
import urllib.request
from datetime import datetime, timezone
from html.parser import HTMLParser
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
PROCESSED_DATA = ROOT / "data" / "processed"
MANUAL_DATA = ROOT / "data" / "manual"
WEAPONS_CSV = PROCESSED_DATA / "weapons.csv"
WEAPON_OPTIMIZER_JSON = MANUAL_DATA / "weapon_optimizer.json"
WIKI_BASE_URL = "https://arcraiders.wiki"
WIKI_API_BASE = f"{WIKI_BASE_URL}/wiki"

TABLE_RE = re.compile(r"<table\b.*?</table>", re.IGNORECASE | re.DOTALL)
ROW_RE = re.compile(r"<tr\b.*?>(.*?)</tr>", re.IGNORECASE | re.DOTALL)
CELL_RE = re.compile(r"<(td|th)\b.*?>(.*?)</\1>", re.IGNORECASE | re.DOTALL)
TEMPLATE_RE = r"\{\{%s(?P<body>.*?)\n\}\}"

ROMAN_LEVELS = {
    "I": 1,
    "II": 2,
    "III": 3,
    "IV": 4,
}

STAT_KEY_MAP = {
    "ADS Speed": "adsSpeed",
    "Base Dispersion": "baseDispersion",
    "Bolt Action Time": "boltActionTime",
    "Bullet Velocity": "bulletVelocity",
    "Dispersion Recovery Time": "dispersionRecoveryTime",
    "Durability": "durability",
    "Durability Burn Rate": "durabilityBurnRate",
    "Equip Time": "equipTime",
    "Fire Rate": "fireRate",
    "Horizontal Recoil": "horizontalRecoil",
    "Horizontal Recoil Control": "horizontalRecoilControl",
    "Magazine Size": "magazineSize",
    "Max Shot Dispersion": "maxShotDispersion",
    "Noise": "noise",
    "Per-Shot Dispersion": "perShotDispersion",
    "Projectile Damage": "projectileDamage",
    "Projectiles Per Shot": "projectilesPerShot",
    "Recoil Recovery Duration": "recoilRecoveryDuration",
    "Recoil Recovery Time": "recoilRecoveryTime",
    "Reload Time": "reloadTime",
    "Unequip Time": "unequipTime",
    "Vertical Recoil": "verticalRecoil",
    "Vertical Recoil Control": "verticalRecoilControl",
}


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
        if tag in {"br", "div", "li", "p"}:
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
        if tag in {"div", "li", "p"}:
            self.parts.append("\n")

    def handle_data(self, data: str) -> None:
        if not self.skip_depth:
            self.parts.append(data)


def normalize_text(raw_text: str) -> str:
    lines = [re.sub(r"\s+", " ", line).strip() for line in raw_text.splitlines()]
    cleaned = " | ".join(line for line in lines if line)
    cleaned = cleaned.replace("Ã—", "x").replace("×", "x")
    cleaned = re.sub(r"\s*\|\s*", " | ", cleaned)
    cleaned = re.sub(r"&lt;/?span[^&]*&gt;", "", cleaned)
    cleaned = re.sub(r"<[^>]+>", "", cleaned)
    return cleaned.strip(" |")


def clean_wikitext_value(raw_text: str) -> str:
    cleaned = re.sub(r"<!--.*?-->", "", raw_text, flags=re.DOTALL)
    cleaned = re.sub(r"<ref[^>]*/>", "", cleaned)
    cleaned = re.sub(r"<ref[^>]*>.*?</ref>", "", cleaned, flags=re.DOTALL)
    return cleaned.strip()


def absolute_wiki_url(path: str) -> str:
    if not path:
        return ""
    if path.startswith("/"):
        return f"{WIKI_BASE_URL}{path}"
    return path


def split_pipe_list(text: str) -> list[str]:
    return [part.strip() for part in text.split(" | ") if part.strip()]


def parse_cell(cell_html: str) -> tuple[str, str]:
    parser = CellTextExtractor()
    parser.feed(cell_html)
    parser.close()
    return normalize_text("".join(parser.parts)), absolute_wiki_url(parser.image_src)


def normalize_number_string(value: str) -> str:
    return clean_wikitext_value(value).replace(",", "").strip()


def parse_number(value: str) -> float | int:
    normalized = normalize_number_string(value)
    if "." in normalized:
        return float(normalized)
    return int(normalized)


def fetch_text(url: str) -> str:
    with urllib.request.urlopen(url, timeout=30) as response:
        return response.read().decode("utf-8", "ignore")


def fetch_wikitext(title: str) -> str:
    normalized = title.replace(" ", "_")
    return fetch_text(f"{WIKI_API_BASE}/{normalized}?action=raw")


def extract_template_fields(raw_text: str, template_name: str) -> dict[str, str]:
    match = re.search(TEMPLATE_RE % re.escape(template_name), raw_text, re.DOTALL)
    if not match:
        return {}

    fields: dict[str, str] = {}
    current_key = ""
    for line in match.group("body").splitlines():
        stripped = line.strip()
        if not stripped:
            continue
        if stripped.startswith("|"):
            key, _, value = stripped[1:].partition("=")
            current_key = key.strip()
            fields[current_key] = value.strip()
        elif current_key:
            fields[current_key] = f"{fields[current_key]} {stripped}".strip()
    return fields


def extract_section(raw_text: str, heading: str) -> str:
    match = re.search(
        rf"==\s*{re.escape(heading)}\s*==(?P<body>.*?)(?:\n==\s*[^=].*?==|\Z)",
        raw_text,
        re.DOTALL,
    )
    return match.group("body").strip() if match else ""


def parse_effect(text: str) -> dict[str, object]:
    cleaned = normalize_text(text)
    if not cleaned:
        return {}

    percent_match = re.fullmatch(
        r"(?P<value>\d+(?:\.\d+)?)%\s+(?P<direction>Increased|Reduced)\s+(?P<label>.+)",
        cleaned,
    )
    if percent_match:
        label = percent_match.group("label").strip()
        delta = float(percent_match.group("value"))
        if percent_match.group("direction") == "Reduced":
            delta *= -1
        return {
            "text": cleaned,
            "kind": "percent",
            "stat": label,
            "statKey": STAT_KEY_MAP.get(label, label.lower().replace(" ", "_")),
            "delta": delta,
        }

    flat_match = re.fullmatch(r"(?P<value>[+-]?\d+(?:\.\d+)?)\s+(?P<label>.+)", cleaned)
    if flat_match:
        label = flat_match.group("label").strip()
        delta = float(flat_match.group("value"))
        if delta.is_integer():
            delta = int(delta)
        return {
            "text": cleaned,
            "kind": "flat",
            "stat": label,
            "statKey": STAT_KEY_MAP.get(label, label.lower().replace(" ", "_")),
            "delta": delta,
        }

    return {
        "text": cleaned,
        "kind": "text",
    }


def parse_effect_list(raw_text: str) -> list[dict[str, object]]:
    effects: list[dict[str, object]] = []
    for part in re.split(r"<br\s*/?>", raw_text):
        effect = parse_effect(part)
        if effect:
            effects.append(effect)
    return effects


def parse_sell_prices(raw_value: str) -> dict[int, int]:
    prices: dict[int, int] = {}
    for index, part in enumerate(re.split(r"<br\s*/?>", raw_value), start=1):
        cleaned = normalize_number_string(part)
        if cleaned:
            prices[index] = int(cleaned)
    return prices


def parse_durability_levels(raw_text: str) -> dict[int, int]:
    durability_by_level: dict[int, int] = {}
    row_chunks = raw_text.split("|-")
    for chunk in row_chunks:
        cell_lines = [
            line[1:].strip()
            for line in chunk.splitlines()
            if line.strip().startswith("|")
        ]
        if len(cell_lines) < 3:
            continue
        label = normalize_text(cell_lines[0])
        durability_match = re.search(r"([IV]{1,3}|IV)\s*$", label)
        if not durability_match:
            continue
        level = ROMAN_LEVELS.get(durability_match.group(1))
        durability = re.sub(r"[^0-9]", "", cell_lines[2])
        if level and durability:
            durability_by_level[level] = int(durability)
    return durability_by_level


def parse_fire_rate_fields(raw_value: str) -> tuple[float, float | None]:
    cleaned_value = clean_wikitext_value(raw_value)
    match = re.fullmatch(r"(\d+(?:\.\d+)?)\s*(?:\((\d+(?:\.\d+)?)\s*RPM\))?", cleaned_value.strip())
    if not match:
        return float(parse_number(cleaned_value)), None
    fire_rate = float(match.group(1))
    rpm = float(match.group(2)) if match.group(2) else None
    return fire_rate, rpm


def parse_level_value_map(raw_value: str, value_parser) -> dict[int, object]:
    cleaned_value = clean_wikitext_value(raw_value)
    parts = [cleaned_value]
    if "{{!}}" in cleaned_value:
        parts = [part.strip() for part in cleaned_value.split("{{!}}")]

    values: dict[int, object] = {}
    for index, part in enumerate(parts, start=1):
        cleaned = normalize_text(part)
        if cleaned:
            values[index] = value_parser(cleaned)
    return values


def parse_optional_stat_text(raw_value: str) -> str:
    cleaned = normalize_text(clean_wikitext_value(raw_value))
    if "|" in cleaned:
        return ""
    return cleaned


def read_weapon_names() -> list[str]:
    if WEAPONS_CSV.exists():
        with WEAPONS_CSV.open(encoding="utf-8", newline="") as handle:
            return [row["name"] for row in csv.DictReader(handle)]

    from convert_wiki_tables import parse_weapon_records  # local fallback

    return [record["name"] for record in parse_weapon_records()]


def parse_weapon_page(name: str) -> dict[str, object]:
    raw_text = fetch_wikitext(name)
    infobox = extract_template_fields(raw_text, "Infobox weapon")
    upgrades = extract_template_fields(raw_text, "Weapon upgrades")
    repairing = extract_section(raw_text, "Repairing")

    _, fire_rate_rpm = parse_fire_rate_fields(infobox.get("firerate", "0"))
    sell_prices = parse_sell_prices(infobox.get("sellprice", ""))
    durability_levels = parse_durability_levels(repairing)
    magazine_size_by_level = parse_level_value_map(
        infobox.get("magsize", "0"),
        lambda value: int(parse_number(value)),
    )

    levels: list[dict[str, object]] = []
    max_level = max(
        max(sell_prices.keys(), default=1),
        max(durability_levels.keys(), default=1),
        max(magazine_size_by_level.keys(), default=1),
    )
    if upgrades:
        max_level = max(max_level, 4)

    for level in range(1, max_level + 1):
        raw_perks = upgrades.get(f"level{level}-perks", "")
        levels.append(
            {
                "level": level,
                "sellPrice": sell_prices.get(level, sell_prices.get(1)),
                "durability": durability_levels.get(level),
                "effects": parse_effect_list(raw_perks) if raw_perks else [],
                "perkTexts": [effect["text"] for effect in parse_effect_list(raw_perks)] if raw_perks else [],
            }
        )

    return {
        "description": normalize_text(infobox.get("weaponquote", "")),
        "compatibleModTokens": infobox.get("compatiblemods", "").split(),
        "stats": {
            "magazineSize": magazine_size_by_level.get(1, 0),
            "magazineSizeByLevel": magazine_size_by_level,
            "arcArmorPenetration": parse_optional_stat_text(infobox.get("ARCarmorpenetr", "")),
            "fireRateRpm": fire_rate_rpm,
            "headshotMultiplier": parse_optional_stat_text(infobox.get("headshotmultiplier", "")),
            "stability": parse_optional_stat_text(infobox.get("stability", "")),
            "agility": parse_optional_stat_text(infobox.get("agility", "")),
            "stealth": parse_optional_stat_text(infobox.get("stealth", "")),
            "weight": parse_optional_stat_text(infobox.get("weight", "")),
        },
        "levels": levels,
    }


def extract_mod_effects(cell_html: str) -> list[dict[str, object]]:
    parser = CellTextExtractor()
    parser.feed(cell_html)
    parser.close()
    effects = []
    for part in split_pipe_list(normalize_text("".join(parser.parts))):
        effect = parse_effect(part)
        if effect:
            effects.append(effect)
    return effects


def parse_weapon_mods_page() -> dict[str, dict[str, object]]:
    html = fetch_text(f"{WIKI_API_BASE}/Weapon_Mods")
    table_match = re.search(r"<table class=\"wikitable wikitable--border sortable\">.*?</table>", html, re.DOTALL)
    if not table_match:
        raise ValueError("Could not find weapon mods table on the wiki page.")

    mods: dict[str, dict[str, object]] = {}
    for row_html in ROW_RE.findall(table_match.group(0))[1:]:
        cells = CELL_RE.findall(row_html)
        if len(cells) < 5:
            continue
        name_text, image_url = parse_cell(cells[0][1])
        slot_text, _ = parse_cell(cells[1][1])
        station_text, _ = parse_cell(cells[3][1])
        materials_text, _ = parse_cell(cells[4][1])
        if not name_text:
            continue

        effects = extract_mod_effects(cells[2][1])
        mods[name_text] = {
            "pageUrl": f"{WIKI_API_BASE}/{name_text.replace(' ', '_')}",
            "imageUrl": image_url,
            "slot": slot_text,
            "requiredStation": station_text,
            "craftingMaterials": split_pipe_list(materials_text),
            "effects": effects,
        }
    return mods


def main() -> None:
    weapon_names = read_weapon_names()
    payload = {
        "generatedAt": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        "weapons": {},
        "mods": parse_weapon_mods_page(),
    }

    for name in weapon_names:
        payload["weapons"][name] = parse_weapon_page(name)

    WEAPON_OPTIMIZER_JSON.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    print(f"Wrote weapon optimizer source data to {WEAPON_OPTIMIZER_JSON.relative_to(ROOT)}")
    print(f"Fetched {len(payload['weapons'])} weapons and {len(payload['mods'])} weapon mods from the wiki.")


if __name__ == "__main__":
    main()

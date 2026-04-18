#!/usr/bin/env python3
"""Fetch structured weapon optimizer data from the live ARC Raiders wiki."""

from __future__ import annotations

import json
import re
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from html.parser import HTMLParser
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
MANUAL_DATA = ROOT / "data" / "manual"
WEAPON_OPTIMIZER_JSON = MANUAL_DATA / "weapon_optimizer.json"
WIKI_BASE_URL = "https://arcraiders.wiki"
WIKI_PAGE_BASE = f"{WIKI_BASE_URL}/wiki"
WIKI_API_BASE = f"{WIKI_BASE_URL}/w/api.php"

TEMPLATE_RE = r"\{\{%s(?P<body>.*?)\n\}\}"
WEAPON_TYPE_MAP = {
    "Assault Rifle": "Assault Rifles",
    "LMG": "LMGs",
    "Marksman Rifle": "Marksman Rifles",
    "Pistol": "Pistols",
    "SMG": "SMGs",
    "Shotgun": "Shotguns",
    "Sniper Rifle": "Sniper Rifles",
}
MOD_SLOT_MAP = {
    "Mods-Heavy-Mag": "Heavy Magazine",
    "Mods-Light-Mag": "Light Magazine",
    "Mods-Medium-Mag": "Medium Magazine",
    "Mods-Muzzle": "Muzzle",
    "Mods-Shotgun-Mag": "Shotgun Magazine",
    "Mods-Shotgun-Muzzle": "Shotgun Muzzle",
    "Mods-Stock": "Stock",
    "Mods-Tech": "Tech Mod",
    "Mods-Underbarrel": "Underbarrel",
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
    "Recoil Recovery Time": "recoilRecoveryDuration",
    "Reload Time": "reloadTime",
    "Unequip Time": "unequipTime",
    "Vertical Recoil": "verticalRecoil",
    "Vertical Recoil Control": "verticalRecoilControl",
    "Weight": "weight",
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


def fetch_text(url: str) -> str:
    with urllib.request.urlopen(url, timeout=30) as response:
        return response.read().decode("utf-8", "ignore")


def fetch_json(url: str) -> dict[str, object]:
    return json.loads(fetch_text(url))


def fetch_wikitext(title: str) -> str:
    normalized = title.replace(" ", "_")
    return fetch_text(f"{WIKI_PAGE_BASE}/{normalized}?action=raw")


def fetch_category_members(category_title: str) -> list[str]:
    members: list[str] = []
    continuation = ""
    while True:
        params = {
            "action": "query",
            "list": "categorymembers",
            "cmtitle": f"Category:{category_title}",
            "cmtype": "page",
            "cmlimit": "500",
            "format": "json",
        }
        if continuation:
            params["cmcontinue"] = continuation
        url = f"{WIKI_API_BASE}?{urllib.parse.urlencode(params)}"
        payload = fetch_json(url)
        query = dict(payload.get("query", {}))
        members.extend(str(entry["title"]) for entry in query.get("categorymembers", []))
        continuation = str(dict(payload.get("continue", {})).get("cmcontinue", ""))
        if not continuation:
            break
    return members


def normalize_text(raw_text: str) -> str:
    lines = [re.sub(r"\s+", " ", line).strip() for line in raw_text.splitlines()]
    cleaned = " | ".join(line for line in lines if line)
    cleaned = cleaned.replace("Ãƒâ€”", "x").replace("Ã—", "x")
    cleaned = re.sub(r"\s*\|\s*", " | ", cleaned)
    cleaned = re.sub(r"&lt;/?span[^&]*&gt;", "", cleaned)
    cleaned = re.sub(r"<[^>]+>", "", cleaned)
    return cleaned.strip(" |")


def clean_wikitext_value(raw_text: str) -> str:
    cleaned = re.sub(r"<!--.*?-->", "", raw_text, flags=re.DOTALL)
    cleaned = re.sub(r"<ref[^>]*/>", "", cleaned)
    cleaned = re.sub(r"<ref[^>]*>.*?</ref>", "", cleaned, flags=re.DOTALL)
    cleaned = re.sub(r"\{\{Icon\|[^{}]+\}\}", "", cleaned)
    cleaned = re.sub(r"\{\{Price\|([^|}]+).*?\}\}", r"\1", cleaned)
    cleaned = re.sub(r"\[\[(?:[^|\]]+\|)?([^\]]+)\]\]", r"\1", cleaned)
    return cleaned.strip()


def parse_cell(cell_html: str) -> tuple[str, str]:
    parser = CellTextExtractor()
    parser.feed(cell_html)
    parser.close()
    image_src = parser.image_src
    if image_src.startswith("/"):
        image_src = f"{WIKI_BASE_URL}{image_src}"
    return normalize_text("".join(parser.parts)), image_src


def normalize_number_string(value: str) -> str:
    return clean_wikitext_value(value).replace(",", "").strip()


def parse_number(value: str) -> float | int:
    normalized = normalize_number_string(value)
    if "." in normalized:
        return float(normalized)
    return int(normalized)


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


def mediawiki_file_url(filename: str) -> str:
    normalized = filename.replace(" ", "_")
    digest = __import__("hashlib").md5(normalized.encode("utf-8")).hexdigest()
    return f"{WIKI_BASE_URL}/w/images/{digest[0]}/{digest[:2]}/{normalized}"


def split_pipe_list(text: str) -> list[str]:
    return [part.strip() for part in text.split(" | ") if part.strip()]


def normalize_material_display(item: str, quantity: int) -> str:
    return f"{item} x{quantity}"


def parse_ingredient_list(raw_text: str) -> list[dict[str, object]]:
    cleaned = clean_wikitext_value(raw_text)
    if not cleaned:
        return []

    ingredients: list[dict[str, object]] = []
    for part in re.split(r"\s+\+\s+", cleaned):
        normalized = normalize_text(part)
        if not normalized:
            continue
        match = re.fullmatch(r"(?P<quantity>\d+)\s+(?P<item>.+)", normalized)
        if not match:
            continue
        ingredients.append(
            {
                "item": normalize_text(match.group("item")),
                "quantity": int(match.group("quantity")),
            }
        )
    return ingredients


def ingredients_to_text(materials: list[dict[str, object]]) -> list[str]:
    return [
        normalize_material_display(str(entry["item"]), int(entry["quantity"]))
        for entry in materials
    ]


def merge_ingredient_lists(*ingredient_lists: list[dict[str, object]]) -> list[dict[str, object]]:
    combined: dict[str, int] = {}
    for ingredient_list in ingredient_lists:
        for entry in ingredient_list:
            item = str(entry["item"])
            combined[item] = combined.get(item, 0) + int(entry["quantity"])
    return [
        {"item": item, "quantity": quantity}
        for item, quantity in sorted(combined.items())
    ]


def parse_fire_rate_fields(raw_value: str) -> tuple[float | None, float | None]:
    cleaned_value = clean_wikitext_value(raw_value)
    if not cleaned_value:
        return None, None
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


def derive_level_durability(parsed_effects: list[dict[str, object]]) -> int:
    durability_bonus = 0
    for effect in parsed_effects:
        if str(effect.get("statKey", "")) != "durability":
            continue
        if effect.get("kind") != "flat":
            continue
        durability_bonus += int(effect.get("delta", 0))
    return 100 + durability_bonus


def parse_sell_prices(raw_value: str) -> dict[int, int]:
    prices: dict[int, int] = {}
    for index, part in enumerate(re.split(r"<br\s*/?>", raw_value), start=1):
        cleaned = normalize_number_string(part)
        if cleaned:
            prices[index] = int(cleaned)
    return prices


def normalize_effect(effect: dict[str, object], owner_name: str) -> dict[str, object]:
    normalized = dict(effect)
    stat_key = str(normalized.get("statKey", ""))
    stat = str(normalized.get("stat", ""))
    text = str(normalized.get("text", ""))

    if stat_key == "recoilRecoveryTime":
        normalized["statKey"] = "recoilRecoveryDuration"
        normalized["stat"] = "Recoil Recovery Duration"
        normalized["text"] = text.replace("Recoil Recovery Time", "Recoil Recovery Duration")

    if owner_name == "Muzzle Brake III":
        if stat_key == "horizontalRecoilControl":
            normalized["statKey"] = "horizontalRecoil"
            normalized["stat"] = "Horizontal Recoil"
            normalized["text"] = text.replace("Horizontal Recoil Control", "Horizontal Recoil")
        elif stat_key == "verticalRecoilControl":
            normalized["statKey"] = "verticalRecoil"
            normalized["stat"] = "Vertical Recoil"
            normalized["text"] = text.replace("Vertical Recoil Control", "Vertical Recoil")

    if owner_name == "Vertical Grip I" and stat_key == "verticalRecoilControl":
        normalized["statKey"] = "verticalRecoil"
        normalized["stat"] = "Vertical Recoil"
        normalized["text"] = text.replace("Vertical Recoil Control", "Vertical Recoil")

    return normalized


def parse_effect(text: str, owner_name: str = "") -> dict[str, object]:
    cleaned = normalize_text(clean_wikitext_value(text))
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
        return normalize_effect(
            {
                "text": cleaned,
                "kind": "percent",
                "stat": label,
                "statKey": STAT_KEY_MAP.get(label, label.lower().replace(" ", "_")),
                "delta": delta,
            },
            owner_name,
        )

    flat_match = re.fullmatch(r"(?P<value>[+-]?\d+(?:\.\d+)?)\s+(?P<label>.+)", cleaned)
    if flat_match:
        label = flat_match.group("label").strip()
        delta = float(flat_match.group("value"))
        if delta.is_integer():
            delta = int(delta)
        return normalize_effect(
            {
                "text": cleaned,
                "kind": "flat",
                "stat": label,
                "statKey": STAT_KEY_MAP.get(label, label.lower().replace(" ", "_")),
                "delta": delta,
            },
            owner_name,
        )

    return normalize_effect(
        {
            "text": cleaned,
            "kind": "text",
        },
        owner_name,
    )


def parse_effect_list(raw_text: str, owner_name: str = "") -> list[dict[str, object]]:
    effects: list[dict[str, object]] = []
    for part in re.split(r"<br\s*/?>", raw_text):
        effect = parse_effect(part, owner_name)
        if effect:
            effects.append(effect)
    return effects


def parse_crafting_template(raw_text: str) -> dict[str, object]:
    template = extract_template_fields(raw_text, "Crafting")
    if not template:
        return {}
    ingredients = parse_ingredient_list(template.get("ingredients", ""))
    return {
        "ingredients": ingredients,
        "ingredientsText": ingredients_to_text(ingredients),
        "station": normalize_text(template.get("station", "")),
        "blueprintRequired": normalize_text(template.get("blueprint", "")).lower() == "y",
        "result": normalize_text(template.get("result", "")),
    }


def parse_weapon_type(raw_value: str) -> str:
    cleaned = normalize_text(clean_wikitext_value(raw_value))
    return WEAPON_TYPE_MAP.get(cleaned, cleaned)


def parse_weapon_page(name: str) -> dict[str, object]:
    raw_text = fetch_wikitext(name)
    infobox = extract_template_fields(raw_text, "Infobox weapon")
    upgrades = extract_template_fields(raw_text, "Weapon upgrades")
    crafting = parse_crafting_template(raw_text)

    fire_rate, fire_rate_rpm = parse_fire_rate_fields(infobox.get("firerate", ""))
    sell_prices = parse_sell_prices(infobox.get("sellprice", ""))
    magazine_size_by_level = parse_level_value_map(
        infobox.get("magsize", "0"),
        lambda value: int(parse_number(value)),
    )

    max_level = max(
        max(sell_prices.keys(), default=1),
        max(magazine_size_by_level.keys(), default=1),
    )
    if upgrades:
        max_level = max(max_level, 4)

    levels: list[dict[str, object]] = []
    cumulative_ingredients: list[dict[str, object]] = []
    for level in range(1, max_level + 1):
        raw_perks = upgrades.get(f"level{level}-perks", "")
        if level == 1:
            direct_ingredients = list(crafting.get("ingredients", []))
        else:
            direct_ingredients = parse_ingredient_list(upgrades.get(f"level{level}-ingredients", ""))
        cumulative_ingredients = merge_ingredient_lists(cumulative_ingredients, direct_ingredients)
        parsed_effects = parse_effect_list(raw_perks, name) if raw_perks else []
        levels.append(
            {
                "level": level,
                "sellPrice": sell_prices.get(level, sell_prices.get(1)),
                "durability": derive_level_durability(parsed_effects),
                "effects": parsed_effects,
                "perkTexts": [effect["text"] for effect in parsed_effects],
                "craftingMaterialsDetailed": direct_ingredients,
                "craftingMaterials": ingredients_to_text(direct_ingredients),
                "fromScratchMaterialsDetailed": list(cumulative_ingredients),
                "fromScratchMaterials": ingredients_to_text(cumulative_ingredients),
            }
        )

    return {
        "pageUrl": f"{WIKI_PAGE_BASE}/{name.replace(' ', '_')}",
        "imageUrl": mediawiki_file_url(str(infobox.get("image", "")).strip()),
        "rarity": normalize_text(infobox.get("rarity", "")),
        "type": parse_weapon_type(infobox.get("type", "")),
        "ammoType": normalize_text(infobox.get("ammo", "")),
        "firingMode": normalize_text(infobox.get("firingmode", "")),
        "damage": normalize_text(infobox.get("damage", "")),
        "fireRate": "" if fire_rate is None else str(fire_rate),
        "range": normalize_text(infobox.get("range", "")),
        "description": normalize_text(infobox.get("weaponquote", "")),
        "compatibleModTokens": normalize_text(infobox.get("compatiblemods", "")).split(),
        "baseCraft": crafting,
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


def parse_mod_page(name: str, existing: dict[str, object]) -> dict[str, object]:
    raw_text = fetch_wikitext(name)
    infobox = extract_template_fields(raw_text, "Infobox mod")
    crafting = parse_crafting_template(raw_text)

    effect_keys = sorted(
        key for key in infobox
        if key.startswith("fun") and infobox[key].strip()
    )
    effects = [
        parse_effect(infobox[key], name)
        for key in effect_keys
    ]
    effects = [effect for effect in effects if effect]

    merged = dict(existing)
    merged.update(
        {
            "pageUrl": f"{WIKI_PAGE_BASE}/{name.replace(' ', '_')}",
            "imageUrl": mediawiki_file_url(str(infobox.get("image", "")).strip()) or str(existing.get("imageUrl", "")),
            "slot": MOD_SLOT_MAP.get(normalize_text(infobox.get("type", "")), str(existing.get("slot", ""))),
            "description": normalize_text(infobox.get("attachquote", "")),
            "rarity": normalize_text(infobox.get("rarity", "")),
            "sellPrice": normalize_number_string(infobox.get("sellprice", "")),
            "weight": parse_optional_stat_text(infobox.get("weight", "")),
        }
    )

    if effects:
        merged["effects"] = effects
    if crafting:
        merged["requiredStation"] = str(crafting.get("station", existing.get("requiredStation", "")))
        merged["craftingMaterialsDetailed"] = list(crafting.get("ingredients", []))
        merged["craftingMaterials"] = list(crafting.get("ingredientsText", []))
        merged["blueprintRequired"] = bool(crafting.get("blueprintRequired", False))
    else:
        merged["craftingMaterialsDetailed"] = list(existing.get("craftingMaterialsDetailed", []))
        merged["craftingMaterials"] = list(existing.get("craftingMaterials", []))
    return merged


def parse_weapon_mods_page() -> dict[str, dict[str, object]]:
    html = fetch_text(f"{WIKI_PAGE_BASE}/Weapon_Mods")
    table_match = None
    for match in re.finditer(r"<table\b.*?</table>", html, re.IGNORECASE | re.DOTALL):
        table_html = match.group(0)
        class_match = re.search(r'class="([^"]+)"', table_html, re.IGNORECASE)
        class_names = class_match.group(1).split() if class_match else []
        if "wikitable" not in class_names or "sortable" not in class_names:
            continue
        if "Weapon Mod" not in table_html or "Function" not in table_html:
            continue
        table_match = match
        break

    if not table_match:
        raise ValueError("Could not find weapon mods table on the wiki page.")

    row_pattern = re.compile(r"<tr\b.*?>(.*?)</tr>", re.IGNORECASE | re.DOTALL)
    cell_pattern = re.compile(r"<(td|th)\b.*?>(.*?)</\1>", re.IGNORECASE | re.DOTALL)

    mods: dict[str, dict[str, object]] = {}
    for row_html in row_pattern.findall(table_match.group(0))[1:]:
        cells = cell_pattern.findall(row_html)
        if len(cells) < 5:
            continue
        name_text, image_url = parse_cell(cells[0][1])
        slot_text, _ = parse_cell(cells[1][1])
        station_text, _ = parse_cell(cells[3][1])
        materials_text, _ = parse_cell(cells[4][1])
        if not name_text:
            continue

        effects = []
        for part in split_pipe_list(normalize_text(cells[2][1])):
            effect = parse_effect(part, name_text)
            if effect:
                effects.append(effect)

        detailed_materials = []
        for entry in split_pipe_list(materials_text):
            match = re.fullmatch(r"(?P<item>.+?) x(?P<quantity>\d+)", entry)
            if match:
                detailed_materials.append(
                    {
                        "item": match.group("item"),
                        "quantity": int(match.group("quantity")),
                    }
                )

        mods[name_text] = {
            "pageUrl": f"{WIKI_PAGE_BASE}/{name_text.replace(' ', '_')}",
            "imageUrl": image_url,
            "slot": slot_text,
            "requiredStation": station_text,
            "craftingMaterials": split_pipe_list(materials_text),
            "craftingMaterialsDetailed": detailed_materials,
            "effects": effects,
        }

    for mod_name, existing in list(mods.items()):
        mods[mod_name] = parse_mod_page(mod_name, existing)

    return mods


def read_weapon_names() -> list[str]:
    return sorted(fetch_category_members("Weapons"))


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

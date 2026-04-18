# raiderbro

Lightweight static utility tools for ARC Raiders.

## Structure

- `data/raw/`: pasted wiki tables such as `items.txt`, `workshops.txt`, and `weapons.txt`
- `data/manual/`: curated tracker metadata such as `cards/`, `found_in.json`, `items.json`, `rewards.json`, `ui_icons.json`, `weapons.json`, and `weapon_optimizer.json`
- `data/processed/`: generated CSV datasets
- `scripts/`: dataset generation and validation
- `app/`: the Raiderbro shell, generated runtime data, and tool screens

## Commands

- `python scripts/fetch_weapon_wiki.py`: refresh live weapon and weapon-mod source data
- `python scripts/convert_wiki_tables.py`: refresh live loot data and regenerate CSVs plus browser datasets
- `python scripts/validate_data.py`: validate source data without rewriting outputs

## App

Open `app/index.html` in a browser.

Current tools:

- `Requirement Tracker`: shared shopping list across workshops, Scrappy, expedition stages, and long-term projects
- `Weapon Optimizer`: live weapon build screen with item levels, attachment slots, combined effect summaries, and build value

Generated runtime datasets now live in `app/generated/`, and each tool keeps its authored code under `app/tools/<tool-name>/`.

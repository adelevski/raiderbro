# raiderbro

Lightweight data prep and utility tools for ARC Raiders.

## Structure

- `data/raw/`: pasted wiki tables such as `items.txt`, `workshops.txt`, and `weapons.txt`
- `data/manual/`: curated tracker metadata such as `cards/`, `found_in.json`, `ui_icons.json`, and `weapons.json`
- `data/processed/`: generated CSV datasets
- `scripts/`: dataset generation and validation
- `tools/requirement-tracker/src/`: authored tracker UI code
- `tools/requirement-tracker/generated/`: generated runtime data for the tracker

## Commands

- `python scripts/convert_wiki_tables.py`: regenerate CSVs and tracker data
- `python scripts/validate_data.py`: validate source data without rewriting outputs

## Requirement Tracker

Open `tools/requirement-tracker/index.html` in a browser.

The tracker keeps one shared shopping list across workshop cards, Scrappy, and Expedition progress. State is stored locally in the browser, and the page reads generated data from `tools/requirement-tracker/generated/item_data.js` and `tools/requirement-tracker/generated/requirement_tracker_data.js`.

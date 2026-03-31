# raiderbro

This repo is for the purposes of developing useful mini-scripts/tools for Arc Raiders. 

## Data Prep

Run `python scripts/convert_wiki_tables.py` to regenerate the processed datasets and requirement tracker data from the raw wiki tables.
Run `python scripts/validate_data.py` to validate the raw/manual tracker inputs without rewriting generated files.

- Raw wiki table dumps live in `data/raw/`.
- Curated tracker metadata lives in `data/manual/`.
- `data/manual/cards/` holds non-table requirement cards like Scrappy and Expedition.
- `data/manual/found_in.json` and `data/manual/ui_icons.json` hold curated source and icon mappings.
- Processed CSV datasets live in `data/processed/`.
- Tool-specific files live under `tools/`.

## Requirement Tracker

Open `tools/requirement-tracker/index.html` in a browser for a lightweight requirement tracker.

- Track workshop levels, Scrappy progress, and the first four Expedition stages with separate card views under one shared tracker.
- For the next level only, enter how many of each required material you already have.
- The global shopping list always stays visible and can group by card or by `Found in` source categories from the wiki.
- Item icons are pulled from the ARC Raiders wiki image paths and hovering an item shows its loot-table details.
- The page saves locally in your browser, supports import/export of wipe progress, and includes a reset button for a fresh wipe.
- The browser app reads generated runtime data from `tools/requirement-tracker/item_data.js` and `tools/requirement-tracker/requirement_tracker_data.js`.

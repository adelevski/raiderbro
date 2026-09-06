# raiderbro

Static ARC Raiders utilities for tracking upgrade requirements and comparing
weapon builds. The deployed app has no server, database, package dependencies,
or runtime API key.

## Requirements

- Python 3.11 or newer (data conversion and validation; standard library only)
- Node.js 22 or newer (JavaScript tests and syntax checks)

## Quick start

```bash
npm ci
npm run check
npm run serve
```

Open `http://localhost:8000`. The local server uses `app/` as its document root.

## Repository layout

- `app/src/` and `app/tools/*/src/`: authored browser code and styles
- `app/generated/`: committed browser datasets produced by the local build
- `data/manual/`: authored/curated metadata and the structured weapon snapshot
- `data/raw/`: historical wiki table captures used only when rebuilding snapshots
- `data/processed/`: committed normalized CSV snapshots used by normal builds
- `scripts/`: standard-library data conversion, validation, and consistency checks
- `tests/fixtures/`: small local parser fixtures; tests never fetch live data
- `notes.md`: historical UI design notes, not build input

The `processed` directory name is historical. Its CSVs are now the explicit,
versioned boundary between source refreshes and reproducible browser builds.

## Commands

- `npm run build`: regenerate `app/generated/` from committed CSV/manual snapshots;
  this is deterministic and performs no network access.
- `npm test`: run Python parser/validation tests and browser-state JavaScript tests.
- `npm run validate:data`: validate the committed normalized/manual datasets.
- `npm run check:generated`: rebuild in a temporary directory and fail if committed
  browser datasets are stale.
- `npm run check:static`: check JavaScript syntax and local HTML asset references.
- `npm run check`: run the complete CI verification suite.
- `npm run serve`: serve the static app locally on port 8000.

## Data refresh

Normal builds and validation are intentionally offline. A refresh is a separate,
reviewed operation because live wiki changes can remove or reinterpret records.

1. Update the relevant files under `data/raw/` from the ARC Raiders Wiki and
   record the source/retrieval details in `data/README.md`.
2. To refresh structured weapon and mod details, run
   `python3 scripts/fetch_weapon_wiki.py`. This is the only provided command that
   intentionally accesses the network; it rewrites
   `data/manual/weapon_optimizer.json`.
3. Run `python3 scripts/convert_wiki_tables.py --rebuild-snapshots` to replace
   normalized CSV snapshots from local raw/manual inputs and rebuild browser data.
4. Review the full data diff, then run `npm run check` before accepting it.

Do not run `--rebuild-snapshots` unless the raw table captures have been reviewed
and brought up to date. Ordinary development should use `npm run build`.

## Deployment

Publish the contents of `app/` as the static hosting root. For GitHub Pages, use
an Actions/static-pages configuration whose uploaded artifact is `app/`; no
build-time secrets or server functions are needed. Run `npm run check` before
publishing. The application hotlinks wiki/game imagery, so deployed clients need
network access to those external hosts.

See [data/README.md](data/README.md) for data provenance and unresolved licensing
questions. This repository intentionally does not declare a license yet.

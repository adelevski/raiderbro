# raiderbro

[Open raiderbro](https://adelevski.github.io/raiderbro/)

Static ARC Raiders utilities for tracking upgrade requirements and comparing
weapon builds. The browser app has no server, database, package dependencies,
or runtime API key. Progress stays in local browser storage; no game account
integration or telemetry is implemented. External image hosts and GitHub Pages
receive ordinary resource requests.

## Run

Python 3.12 or newer (data conversion and validation; standard library only)
and Node.js 24 or newer (JavaScript tests and syntax checks).

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

The canonical repository is `adelevski/raiderbro`, transferred with its
history from `adelevski`. Pushes to `main` run checks and deploy `app/` through
GitHub Actions. Set Pages source to GitHub Actions; a manual workflow dispatch
can redeploy it. No Render service is needed. Verify the workflow and live
`version.json` before tagging releases.

Use the tracker’s Export/Import Progress controls to migrate from local hosting.
Browser storage does not automatically follow a different hostname or port.
Storage keys are unchanged; existing progress on the same origin remains compatible.

See [data provenance](data/README.md) and [third-party notices](THIRD-PARTY-NOTICES.md).
The launch preserves 374 items, 10 tracker cards, 23 weapons and 37 mods; it is
not a source refresh. Weapon metadata dates to April 16, 2026 and other snapshot
dates are incomplete. Do not describe this as current game-balance data.

## License and third-party material

Project-authored software and documentation are licensed under [MIT](LICENSE).
The code license does not cover wiki/game content under `data/`, browser datasets
in `app/generated/`, wiki-derived test fixtures, [stripe icon artwork](assets/README.md), hotlinked imagery, names, or
trademarks. Those materials retain their existing rights and terms; selecting MIT
for the code does not resolve their public redistribution requirements.

## Next iteration

- Review snapshots against current game patches with recorded page revisions.
- Extend behavioral coverage for weapon comparisons and real browser interactions.
- Improve handling of unavailable browser storage and image failures.
- Keep the existing tracker and comparison experience; this launch is packaging
  and preservation, not a redesign or a new game-data validation claim.


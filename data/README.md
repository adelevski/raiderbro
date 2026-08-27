# Data provenance

Raiderbro separates live-source refreshes from reproducible builds so ordinary
validation never changes with the network.

## Data classes

### Normalized snapshots (`processed/`)

These committed CSVs are the canonical inputs for normal browser builds. They
contain normalized item, workshop, weapon, weapon-level, and weapon-mod records.
The directory name is historical: files here are source snapshots between
explicit refreshes, not disposable build artifacts.

Two duplicate item rows (`Assessor Matrix` and `Vaporizer Regulator`) were removed
on 2026-08-27. Their later curated rows were retained, matching the records that
the browser dataset already selected by key.

### Raw captures (`raw/`)

`items.txt`, `weapons.txt`, and `workshops.txt` are HTML table captures from the
community-run [ARC Raiders Wiki](https://arcraiders.wiki/). Their exact original
retrieval timestamps and page revision IDs were not recorded. Git history places
their addition in March 2026, but that is not equivalent to source-page provenance.
They may lag the normalized snapshots and are therefore used only by the explicit
`--rebuild-snapshots` workflow.

### Curated inputs (`manual/`)

The JSON files contain project-authored mappings, card definitions, rewards,
icons, supplemental item records, and weapon metadata. The structured
`weapon_optimizer.json` snapshot was generated from ARC Raiders Wiki pages and
records `2026-04-16T20:36:39.053420Z` in its own metadata.

### Browser datasets (`../app/generated/`)

These JavaScript files are generated from the normalized/manual snapshots and
must remain committed because the deployed app is static. They can be reproduced
with `npm run build` and verified without rewriting the worktree using
`npm run check:generated`.

## External assets

The repository does not vendor game or wiki images. Generated records and HTML
refer to images hosted by `arcraiders.wiki` and an ARC Raiders CMS host. Availability,
cache behavior, and permission to hotlink those assets remain external concerns.

## Unresolved licensing decisions

- The repository currently has no project license; none was inferred or added.
- The reuse terms for community-wiki table content and image URLs need a human
  review before choosing a data/content license.
- ARC Raiders names, artwork, and trademarks belong to their respective owners;
  this project has no documented affiliation or endorsement.
- Future refreshes should record page URL, retrieval time, and ideally revision ID
  for every raw source snapshot.

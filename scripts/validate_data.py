#!/usr/bin/env python3
"""Validate Arc Raiders tracker source data without rewriting generated files."""

from __future__ import annotations

from convert_wiki_tables import validate_source_data


def main() -> None:
    summary = validate_source_data()
    print(
        "Validated "
        f"{summary['items']} items, "
        f"{summary['workshopLevels']} workshop levels, "
        f"{summary['cards']} tracker cards, and "
        f"{summary['weapons']} weapons."
    )


if __name__ == "__main__":
    main()

#!/usr/bin/env python3
"""Check local static references and JavaScript syntax without starting a server."""

from __future__ import annotations

import subprocess
import json
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import unquote, urlsplit


ROOT = Path(__file__).resolve().parents[1]
APP_DIR = ROOT / "app"


class AssetReferenceParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.references: list[str] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        for name, value in attrs:
            if name in {"href", "src"} and value:
                self.references.append(value)


def is_local_reference(reference: str) -> bool:
    parsed = urlsplit(reference)
    return not parsed.scheme and not parsed.netloc and bool(parsed.path)


def main() -> None:
    for name in ("LICENSE", "THIRD-PARTY-NOTICES.md"):
        if (APP_DIR / name).read_bytes() != (ROOT / name).read_bytes():
            raise SystemExit(f"Stale public notice: {name}; run npm run build")
    version = json.loads((ROOT / "package.json").read_text())["version"]
    if json.loads((APP_DIR / "version.json").read_text()) != {"version": version}:
        raise SystemExit("Stale public version; run npm run build")
    missing: list[str] = []
    html_files = sorted(APP_DIR.rglob("*.html"))
    for html_file in html_files:
        parser = AssetReferenceParser()
        parser.feed(html_file.read_text(encoding="utf-8"))
        for reference in parser.references:
            if not is_local_reference(reference):
                continue
            target = (html_file.parent / unquote(urlsplit(reference).path)).resolve()
            if not target.is_relative_to(APP_DIR.resolve()) or not target.is_file():
                missing.append(f"{html_file.relative_to(ROOT)} -> {reference}")

    if missing:
        raise SystemExit("Broken local static references:\n- " + "\n- ".join(missing))

    javascript_files = sorted(APP_DIR.rglob("*.js"))
    for javascript_file in javascript_files:
        subprocess.run(
            ["node", "--check", str(javascript_file)],
            check=True,
            capture_output=True,
            text=True,
        )

    print(
        f"Verified {len(html_files)} HTML files, {len(javascript_files)} JavaScript files, "
        "and all local static references."
    )


if __name__ == "__main__":
    main()

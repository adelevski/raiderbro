#!/usr/bin/env python3
"""Verify committed CSV and browser datasets match the local source snapshots."""

from __future__ import annotations

import shutil
import subprocess
import sys
import tempfile
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
OUTPUT_DIRS = (Path("app/generated"),)


def relative_files(root: Path, directory: Path) -> set[Path]:
    return {
        path.relative_to(root)
        for path in (root / directory).rglob("*")
        if path.is_file()
    }


def main() -> None:
    with tempfile.TemporaryDirectory(prefix="raiderbro-generated-") as temp_dir:
        temp_root = Path(temp_dir)
        shutil.copytree(ROOT / "data" / "raw", temp_root / "data" / "raw")
        shutil.copytree(ROOT / "data" / "manual", temp_root / "data" / "manual")
        shutil.copytree(ROOT / "data" / "processed", temp_root / "data" / "processed")
        (temp_root / "scripts").mkdir(parents=True)
        shutil.copy2(
            ROOT / "scripts" / "convert_wiki_tables.py",
            temp_root / "scripts" / "convert_wiki_tables.py",
        )
        subprocess.run(
            [sys.executable, str(temp_root / "scripts" / "convert_wiki_tables.py")],
            cwd=temp_root,
            check=True,
            capture_output=True,
            text=True,
        )

        expected = set().union(*(relative_files(ROOT, directory) for directory in OUTPUT_DIRS))
        actual = set().union(*(relative_files(temp_root, directory) for directory in OUTPUT_DIRS))
        problems = [f"missing committed output: {path}" for path in sorted(actual - expected)]
        problems.extend(f"unexpected committed output: {path}" for path in sorted(expected - actual))
        problems.extend(
            f"stale generated output: {path}"
            for path in sorted(expected & actual)
            if (ROOT / path).read_bytes() != (temp_root / path).read_bytes()
        )

        if problems:
            raise SystemExit("Generated data is out of date:\n- " + "\n- ".join(problems))

        print(f"Verified {len(expected)} generated data files.")


if __name__ == "__main__":
    main()

"""Copy canonical notices and version metadata into the static hosting root."""
import json
import shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
for name in ("LICENSE", "THIRD-PARTY-NOTICES.md"):
    shutil.copyfile(ROOT / name, ROOT / "app" / name)
version = json.loads((ROOT / "package.json").read_text())["version"]
(ROOT / "app" / "version.json").write_text(json.dumps({"version": version}) + "\n")
(ROOT / "app" / ".nojekyll").write_text("")

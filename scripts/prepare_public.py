"""Copy canonical notices and version metadata into the static hosting root."""
import hashlib
import json
import re
import shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
for name in ("LICENSE", "THIRD-PARTY-NOTICES.md"):
    shutil.copyfile(ROOT / name, ROOT / "app" / name)
version = json.loads((ROOT / "package.json").read_text())["version"]
(ROOT / "app" / "version.json").write_text(json.dumps({"version": version}) + "\n")
(ROOT / "app" / ".nojekyll").write_text("")

# Change dataset URLs only when their contents change so browsers do not reuse
# stale image references or statistics after a deployment.
for page in (ROOT / "app" / "tools").glob("*/index.html"):
    def version_dataset(match):
        source = match.group(1)
        digest = hashlib.sha256((page.parent / source).read_bytes()).hexdigest()[:12]
        return f'src="{source}?v={digest}"'

    page.write_text(re.sub(
        r'src="(../../generated/[^"?]+\.js)(?:\?v=[a-zA-Z0-9.-]+)?"',
        version_dataset,
        page.read_text(),
    ))

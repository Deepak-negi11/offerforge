"""Check excerpts against page text saved by a manual / You.com pass.

Usage: python -m atlas.check_saved <pages_dir>
  <pages_dir>/index.json maps url -> filename of the saved markdown (or null if the page could not be read).
Writes data/verification-manual.json (status per item key) for `atlas build` to use.
"""

import json
import sys
from pathlib import Path

from . import config
from .evidence import MANUAL, TODO, contains

WALL_HINTS = ("sign in", "log in", "join now", "create an account", "verify you are human", "access denied")


def main(pages_dir: str) -> None:
    root = Path(pages_dir)
    index = json.loads((root / "index.json").read_text())
    todo = json.loads(TODO.read_text())
    out = json.loads(MANUAL.read_text()) if MANUAL.exists() else {}
    counts: dict[str, int] = {}
    for it in todo:
        fname = index.get(it["url"])
        text = (root / fname).read_text(errors="ignore") if fname and (root / fname).exists() else ""
        if not text.strip():
            status = "unchecked"
        elif contains(text, it["evidence"]):
            status = "found"
        elif "reddit.com" in it["url"] or len(text) < 2500 or any(h in text[:3000].lower() for h in WALL_HINTS):
            # Reddit text comes from a search-index copy that often stops after a few comments
            status = "unchecked"  # login wall or partial page: absence proves nothing
        else:
            status = "missing"
        out[it["key"]] = {"status": status, "url": it["url"], "via": "you.com"}
        counts[status] = counts.get(status, 0) + 1
    MANUAL.write_text(json.dumps(out, indent=1))
    print(f"checked {len(todo)} items via saved pages: {counts} -> {MANUAL.relative_to(config.ROOT)}")


if __name__ == "__main__":
    main(sys.argv[1])

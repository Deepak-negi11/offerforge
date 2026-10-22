"""Source-post text for questions, so full statements keep every detail the candidate wrote.

  python -m atlas problems sources            # fetch and cache the text of every DSA question's source posts

Text is cached in data/cache/source-text/<sha1(url)[:16]>.txt. LeetCode Discuss posts come from its public
GraphQL API; other pages go through the polite fetcher (robots.txt respected, no paid fallback). Login-walled
sites are only read from pages saved earlier by the manual verification pass.
"""

from __future__ import annotations

import hashlib
import json
import re
import sys
import threading
import time
from collections import defaultdict
from pathlib import Path
from urllib.parse import urlparse

from . import config
from .evidence import LOGIN_WALLED, _leetcode
from .fetch import fetch

TEXT = config.CACHE / "source-text"


def _path(url: str) -> Path:
    return TEXT / (hashlib.sha1(url.encode()).hexdigest()[:16] + ".txt")


def text(url: str) -> str | None:
    p = _path(url)
    return p.read_text(errors="ignore") if p.exists() else None


def _one(url: str) -> str:
    if "leetcode.com/discuss" in url:
        return _leetcode(url) or ""
    if any(h in url for h in LOGIN_WALLED):
        return ""
    page = fetch(url, allow_paid=False)
    return page.markdown if page.status in ("ok", "thin") else ""


def collect(urls: list[str], saved_pages: Path | None = None) -> None:
    """Fetch every URL not yet cached, one worker per host so each site sees a gentle request rate."""
    TEXT.mkdir(parents=True, exist_ok=True)
    if saved_pages and (saved_pages / "index.json").exists():  # pages saved by the You.com verification pass
        for u, fn in json.loads((saved_pages / "index.json").read_text()).items():
            if fn and (saved_pages / fn).exists() and not _path(u).exists():
                _path(u).write_text((saved_pages / fn).read_text(errors="ignore"))
    todo = [u for u in urls if not _path(u).exists()]
    by_host: dict[str, list[str]] = defaultdict(list)
    for i, u in enumerate(todo):
        host = urlparse(u).netloc
        # LeetCode's API is slow per request, so it gets 4 lanes; every other site gets one.
        by_host[f"{host}#{i % 4}" if "leetcode.com" in host else host].append(u)
    done = [0]
    lock = threading.Lock()

    def worker(host: str, items: list[str]) -> None:
        for u in items:
            try:
                body = _one(u)
            except Exception:
                body = ""
            _path(u).write_text(body or "")
            with lock:
                done[0] += 1
                if done[0] % 50 == 0:
                    print(f"  {done[0]}/{len(todo)} fetched", flush=True)
            if "leetcode.com" in host:
                time.sleep(1.0)

    threads = [threading.Thread(target=worker, args=(h, items)) for h, items in by_host.items()]
    for t in threads:
        t.start()
    for t in threads:
        t.join()
    have = sum(1 for u in urls if (text(u) or "").strip())
    print(f"source text available for {have}/{len(urls)} URLs")


_WORD = re.compile(r"[a-z0-9]+")


def excerpt(page: str, question: str, title: str, width: int = 2400) -> str:
    """The window of the page that best matches the question, by overlap with its distinctive words."""
    if not page:
        return ""
    words = {w for w in _WORD.findall(f"{title} {question}".lower()) if len(w) > 3}
    if len(page) <= width:
        return page.strip()
    low = page.lower()
    best, best_at = -1, 0
    for start in range(0, len(page) - width // 2, width // 4):
        window = set(_WORD.findall(low[start:start + width]))
        score = len(words & window)
        if score > best:
            best, best_at = score, start
    return page[best_at:best_at + width].strip()


def main(argv: list[str]) -> None:
    atlas = json.loads((config.ROOT / "web" / "public" / "data" / "atlas.json").read_text())
    cats = {"DSA"} if "--all" not in argv else None
    urls = sorted({s["url"] for q in atlas["questions"] if q["kind"] == "question" and (cats is None or q["category"] in cats) for s in q["sources"]})
    saved = Path(argv[argv.index("--saved") + 1]) if "--saved" in argv else None
    print(f"{len(urls)} source URLs")
    collect(urls, saved)


if __name__ == "__main__":
    main(sys.argv[1:])

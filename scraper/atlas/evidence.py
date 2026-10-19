"""Check that each refreshed question's evidence excerpt really appears on its source page.

Writes data/verification.json:  {"<url>\\t<sha1(excerpt)>": {"status": "found"|"missing"|"unchecked", ...}}
  found      the excerpt is on the page        -> question gets the "Verified" badge
  missing    the page loaded but has no excerpt -> question is dropped at build time
  unchecked  the page could not be read automatically (Reddit, LinkedIn, X, blocked sites)
Unchecked items are listed in data/verification-todo.json for a manual or You.com-assisted pass;
results from that pass go in data/verification-manual.json with the same shape and win over automatic ones.
"""

from __future__ import annotations

import hashlib
import html
import json
import re
import urllib.request
from difflib import SequenceMatcher

from . import config
from .fetch import fetch

MANUAL = config.DATA / "verification-manual.json"
TODO = config.DATA / "verification-todo.json"
LOGIN_WALLED = ("reddit.com", "linkedin.com", "x.com", "twitter.com", "glassdoor.", "teamblind.com", "ambitionbox.com")


def key(url: str, excerpt: str) -> str:
    return f"{url}\t{hashlib.sha1(excerpt.strip().encode()).hexdigest()[:16]}"


def norm(text: str) -> str:
    return re.sub(r"[^a-z0-9]+", " ", html.unescape(text).lower()).strip()


def contains(page: str, excerpt: str) -> bool:
    p, e = norm(page), norm(excerpt)
    if not e:
        return False
    if e in p:
        return True
    # Tolerate small differences (markdown links, line breaks, a changed word): find where the
    # excerpt best lines up with the page and require 88% similarity over that window.
    if _in_order(p.split(), e.split()):
        return True
    m = SequenceMatcher(None, p, e, autojunk=False).find_longest_match(0, len(p), 0, len(e))
    if m.size < 0.4 * len(e):
        return False
    start = max(0, m.a - m.b)
    window = p[start : start + len(e) + 12]
    return SequenceMatcher(None, window, e, autojunk=False).ratio() >= 0.88


def _in_order(page: list[str], words: list[str]) -> bool:
    """All excerpt words appear in order within a short span (handles repeated link text and list breaks)."""
    if len(words) < 6:
        return False
    limit = 2 * len(words) + 8
    for start, tok in enumerate(page):
        if tok != words[0]:
            continue
        # Greedy in-order match; a word that never shows up nearby is skipped (formatting differences such as
        # rewritten link URLs), but at least 85% of the words must be found in order within the span.
        matched, j = 1, start + 1
        for w in words[1:]:
            k = j
            while k < len(page) and k - start <= limit and page[k] != w:
                k += 1
            if k < len(page) and k - start <= limit:
                matched, j = matched + 1, k + 1
        if matched >= 0.85 * len(words):
            return True
    return False


def _leetcode(url: str) -> str | None:
    m = re.search(r"leetcode\.com/discuss/(?:post/|[^?#]*/)(\d+)", url)
    if not m:
        return None
    body = json.dumps({
        "query": "query($topicId: ID!){ ugcArticleDiscussionArticle(topicId: $topicId){ title content } }",
        "variables": {"topicId": m.group(1)},
    }).encode()
    req = urllib.request.Request("https://leetcode.com/graphql", body, {
        "Content-Type": "application/json", "Referer": "https://leetcode.com/discuss/", "User-Agent": "Mozilla/5.0",
    })
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            node = (json.load(r).get("data") or {}).get("ugcArticleDiscussionArticle") or {}
        return f"{node.get('title', '')}\n{node.get('content', '')}" if node else ""
    except Exception:
        return None


def collect() -> list[dict]:
    items = []
    for f in sorted(config.UPDATES.glob("*.json")):
        doc = json.loads(f.read_text())
        for q in doc.get("questions") or []:
            ev, srcs = q.get("evidence"), q.get("sources") or []
            if isinstance(ev, str) and ev.strip() and srcs:
                url = srcs[0]["url"] if isinstance(srcs[0], dict) else srcs[0]
                items.append({"company": doc.get("slug", f.stem), "title": q.get("title", ""), "url": url, "evidence": ev.strip()})
    return items


def verify() -> dict:
    results = json.loads(config.VERIFICATION.read_text()) if config.VERIFICATION.exists() else {}
    todo = []
    items = collect()
    for i, it in enumerate(items, 1):
        k = key(it["url"], it["evidence"])
        if results.get(k, {}).get("status") in ("found", "missing") and results[k]["status"] != "recheck":
            continue
        text = None
        if "leetcode.com/discuss" in it["url"]:
            text = _leetcode(it["url"])
        elif not any(h in it["url"] for h in LOGIN_WALLED):
            page = fetch(it["url"], allow_paid=False)
            text = (page.title + "\n" + page.markdown) if page.status == "ok" else None
        if text is None:
            results[k] = {"status": "unchecked", "url": it["url"]}
            todo.append(it)
        else:
            results[k] = {"status": "found" if contains(text, it["evidence"]) else "missing", "url": it["url"]}
        if i % 25 == 0:
            print(f"  {i}/{len(items)} checked")
    config.VERIFICATION.write_text(json.dumps(results, indent=1))
    TODO.write_text(json.dumps(todo, indent=1, ensure_ascii=False))
    counts: dict[str, int] = {}
    for it in items:
        s = status(it["url"], it["evidence"], results)
        counts[s] = counts.get(s, 0) + 1
    print(f"evidence check over {len(items)} questions: {counts}  (todo for manual pass: {len(todo)})")
    return counts


def load() -> dict:
    results = json.loads(config.VERIFICATION.read_text()) if config.VERIFICATION.exists() else {}
    if MANUAL.exists():
        results.update(json.loads(MANUAL.read_text()))
    return results


def status(url: str, excerpt: str, results: dict | None = None) -> str:
    results = load() if results is None else results
    return results.get(key(url, excerpt), {}).get("status", "unchecked")

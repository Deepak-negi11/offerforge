"""Spot-check that cited source URLs exist and are about the company they're cited for.

Samples distinct (company, url) pairs from the built dataset, fetches each through the
ladder (robots.txt respected, cache reused), and reports:
  ok          page loaded and mentions the company
  off-topic   page loaded but never mentions the company
  dead        404 / error
  unchecked   robots-disallowed or challenge page (can't verify automatically)
"""

from __future__ import annotations

import json
import random
from collections import Counter

from . import config
from .fetch import _CHALLENGE, fetch


def _aliases(name: str, slug: str) -> set[str]:
    """Short forms a page might use: "HCLTech" -> "hcl", "D. E. Shaw" -> "shaw", "JPMorgan Chase" -> "jpmorgan"."""
    first = name.split()[0].lower().strip(".")
    out = {first, slug.split("-")[0]}
    for suffix in ("tech", "labs"):
        if first.endswith(suffix) and len(first) > len(suffix) + 1:
            out.add(first[: -len(suffix)])
    if len(first) <= 2:  # initials like "D." -> use the last word instead
        out.add(name.split()[-1].lower())
    return {a for a in out if len(a) >= 2}


def verify(sample: int = 60, seed: int = 7) -> dict:
    data = json.loads(config.OUT.read_text())
    names = {c["slug"]: c["name"] for c in data["companies"]}
    pairs = sorted({(q["company"], s["url"]) for q in data["questions"] for s in q["sources"]})
    random.Random(seed).shuffle(pairs)
    results: Counter[str] = Counter()
    bad = []
    for slug, url in pairs[:sample]:
        page = fetch(url)
        if page.status in ("disallowed", "challenge") or _CHALLENGE.search(page.title + page.markdown[:3000]):
            verdict = "unchecked"
        elif page.status != "ok":
            verdict = "dead"
        else:
            text = (page.markdown + page.title).lower()
            verdict = "ok" if any(a in text or a in text.replace(" ", "") for a in _aliases(names[slug], slug)) else "off-topic"
        results[verdict] += 1
        if verdict in ("dead", "off-topic"):
            bad.append((verdict, slug, url))
    checked = results["ok"] + results["off-topic"] + results["dead"]
    print(f"sampled {min(sample, len(pairs))} of {len(pairs)} (company, url) pairs: {dict(results)}")
    if checked:
        print(f"verified ok: {results['ok']}/{checked} = {results['ok'] / checked:.0%} of automatically checkable URLs")
    for v, slug, url in bad:
        print(f"  {v:9} {slug:22} {url}")
    return {"results": dict(results), "bad": bad}

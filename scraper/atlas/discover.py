"""Discovery layer: find candidate interview-experience URLs for a company.

Sources (all public, no logins):
  * Firecrawl /v2/search  - web search incl. site:linkedin.com/posts, site:x.com, site:reddit.com,
                            GeeksforGeeks and LeetCode Discuss. Keeps the search snippet, which is
                            the only content we use for robots-disallowed hosts.
  * Hacker News (Algolia)  - stories and comments mentioning "<company> interview".
  * Reddit official API    - only when REDDIT_CLIENT_ID / REDDIT_CLIENT_SECRET are set
                            (anonymous .json endpoints return 403).
"""

from __future__ import annotations

import json
import os
import time
from datetime import date

import httpx

from . import config


def _firecrawl_search(query: str, limit: int) -> list[dict]:
    key = os.environ.get("FIRECRAWL_API_KEY")
    if not key:
        return []
    for attempt in range(5):
        r = httpx.post(
            "https://api.firecrawl.dev/v2/search",
            headers={"Authorization": f"Bearer {key}"},
            json={"query": query, "limit": limit},
            timeout=60,
        )
        if r.status_code != 429:
            break
        wait = float(r.headers.get("retry-after") or 4 * 2**attempt)
        print(f"    firecrawl rate limited; retrying in {wait:.0f}s")
        time.sleep(min(wait, 60))
    if r.status_code != 200:
        print(f"    firecrawl {r.status_code} for {query!r}")
        return []
    web = (r.json().get("data") or {}).get("web") or []
    return [{"url": h["url"], "title": h.get("title", ""), "snippet": h.get("description", ""), "via": "firecrawl"} for h in web if h.get("url")]


def _hn_search(company: str, limit: int) -> list[dict]:
    r = httpx.get(
        "https://hn.algolia.com/api/v1/search",
        params={"query": f"{company} interview questions", "tags": "(story,comment)", "hitsPerPage": limit},
        timeout=30,
    )
    out = []
    for h in r.json().get("hits", []):
        url = f"https://news.ycombinator.com/item?id={h['objectID']}"
        text = h.get("comment_text") or h.get("story_text") or ""
        out.append({"url": url, "title": h.get("title") or h.get("story_title") or "Hacker News", "snippet": text[:2000], "via": "hn"})
    return out


def _reddit_token() -> str | None:
    cid, secret = os.environ.get("REDDIT_CLIENT_ID"), os.environ.get("REDDIT_CLIENT_SECRET")
    if not (cid and secret):
        return None
    r = httpx.post(
        "https://www.reddit.com/api/v1/access_token",
        auth=(cid, secret),
        data={"grant_type": "client_credentials"},
        headers={"User-Agent": "interview-atlas/0.1"},
        timeout=30,
    )
    return r.json().get("access_token")


def _reddit_search(company: str, role: str, limit: int, token: str) -> list[dict]:
    out = []
    for sub in ("leetcode", "cscareerquestions", "csMajors", "developersIndia"):
        r = httpx.get(
            f"https://oauth.reddit.com/r/{sub}/search",
            params={"q": f"{company} {role} interview", "restrict_sr": 1, "sort": "new", "limit": limit, "t": "year"},
            headers={"Authorization": f"Bearer {token}", "User-Agent": "interview-atlas/0.1"},
            timeout=30,
        )
        for child in (r.json().get("data") or {}).get("children", []):
            d = child["data"]
            out.append({"url": "https://www.reddit.com" + d["permalink"], "title": d.get("title", ""), "snippet": d.get("selftext", "")[:4000], "via": "reddit-api"})
    return out


def discover(slug: str, per_query: int = 8) -> list[dict]:
    name = config.COMPANIES[slug]["name"]
    year = date.today().year
    found: dict[str, dict] = {}

    def add(hits: list[dict], query: str, track: str | None) -> None:
        for h in hits:
            h.setdefault("query", query)
            h.setdefault("track", track)
            found.setdefault(h["url"], h)

    for track, role in config.ROLES.items():
        for template in config.DISCOVERY_QUERIES:
            q = template.format(company=name, role=role, year=year)
            add(_firecrawl_search(q, per_query), q, track)
        token = _reddit_token()
        if token:
            add(_reddit_search(name, role, per_query, token), f"reddit:{name} {role}", track)
    add(_hn_search(name, per_query), f"hn:{name}", None)

    config.DISCOVERED.mkdir(parents=True, exist_ok=True)
    out = config.DISCOVERED / f"{slug}.jsonl"
    out.write_text("\n".join(json.dumps(h, ensure_ascii=False) for h in found.values()) + "\n")
    print(f"  {name}: {len(found)} candidate URLs -> {out.relative_to(config.ROOT)}")
    return list(found.values())

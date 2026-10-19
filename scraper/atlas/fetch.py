"""Fetch ladder: escalate only when the cheaper rung fails.

  rung 1  curl_cffi (Chrome TLS fingerprint)   ~0.5s   every URL first
  rung 2  Playwright Chromium (JS rendering)   ~4s     rung 1 returned an empty SPA shell
  rung 4  Firecrawl /v2/scrape                 ~5s     rung 1/2 blocked by IP reputation, or no browser installed

There is deliberately no rung 3 (automated Cloudflare Turnstile / CAPTCHA solving).
A page that answers with a challenge is recorded as `challenge` and skipped by the
direct rungs. URLs whose robots.txt disallows us are not fetched at all; for those
(LinkedIn, X, Reddit) the pipeline uses search-result snippets or the official API.
"""

from __future__ import annotations

import hashlib
import json
import os
import re
import time
from dataclasses import dataclass
from functools import lru_cache
from urllib.parse import urlparse
from urllib.robotparser import RobotFileParser

from . import config

UA = "InterviewAtlasBot/0.1 (+student research project; respects robots.txt)"
MIN_TEXT = 600  # characters of visible text below which a page is a "thin" shell
_CHALLENGE = re.compile(r"cf-chl|challenge-platform|just a moment\.\.\.|captcha|attention required|humans only|verify you are (a )?human|unusual traffic|are you a robot", re.I)
_last_hit: dict[str, float] = {}


@dataclass
class Page:
    url: str
    status: str  # ok | thin | challenge | ip_block | disallowed | error
    rung: str
    markdown: str = ""
    title: str = ""


def _throttle(host: str, delay: float = 1.5) -> None:
    wait = _last_hit.get(host, 0) + delay - time.monotonic()
    if wait > 0:
        time.sleep(wait)
    _last_hit[host] = time.monotonic()


@lru_cache(maxsize=256)
def _robots(host_root: str) -> RobotFileParser | None:
    from curl_cffi import requests

    rp = RobotFileParser()
    try:
        r = requests.get(f"{host_root}/robots.txt", impersonate="chrome", timeout=10)
    except Exception:
        return None
    if r.status_code >= 400:
        return None  # no robots.txt -> allowed
    rp.parse(r.text.splitlines())
    return rp


def allowed(url: str) -> bool:
    p = urlparse(url)
    rp = _robots(f"{p.scheme}://{p.netloc}")
    return rp is None or rp.can_fetch(UA, url)


def classify(status_code: int, html: str) -> str:
    if status_code in (401, 403, 429) and not _CHALLENGE.search(html[:20000]):
        return "ip_block"
    if _CHALLENGE.search(html[:20000]) and status_code in (403, 503, 200):
        return "challenge" if len(_visible_text(html)) < MIN_TEXT * 2 else "ok"
    if status_code >= 400:
        return "error"
    return "ok" if len(_visible_text(html)) >= MIN_TEXT else "thin"


def _visible_text(html: str) -> str:
    from selectolax.lexbor import LexborHTMLParser as HTMLParser

    tree = HTMLParser(html)
    for node in tree.css("script, style, noscript, svg"):
        node.decompose()
    return (tree.body.text(separator=" ") if tree.body else "").strip()


def html_to_markdown(html: str) -> tuple[str, str]:
    from markdownify import markdownify
    from selectolax.lexbor import LexborHTMLParser as HTMLParser

    tree = HTMLParser(html)
    title = tree.css_first("title").text(strip=True) if tree.css_first("title") else ""
    for node in tree.css("script, style, noscript, svg, nav, footer, header, aside, form, iframe"):
        node.decompose()
    main = tree.css_first("article") or tree.css_first("main") or tree.body
    md = markdownify(main.html if main else html, heading_style="ATX")
    md = re.sub(r"\n{3,}", "\n\n", md).strip()
    return md, title


def _rung1(url: str) -> Page:
    from curl_cffi import requests

    try:
        r = requests.get(url, impersonate="chrome", timeout=20)
    except Exception as e:
        return Page(url, "error", "curl_cffi", title=str(e)[:120])
    status = classify(r.status_code, r.text)
    md, title = html_to_markdown(r.text) if status == "ok" else ("", "")
    return Page(url, status, "curl_cffi", md, title)


def _rung2(url: str) -> Page:
    try:
        from playwright.sync_api import sync_playwright
    except ImportError:
        return Page(url, "error", "playwright", title="playwright not installed (uv sync --extra browser)")
    try:
        with sync_playwright() as pw:
            browser = pw.chromium.launch(headless=True)
            page = browser.new_page()
            resp = page.goto(url, wait_until="networkidle", timeout=30000)
            html = page.content()
            code = resp.status if resp else 200
            browser.close()
    except Exception as e:
        return Page(url, "error", "playwright", title=str(e)[:120])
    status = classify(code, html)
    md, title = html_to_markdown(html) if status == "ok" else ("", "")
    return Page(url, status, "playwright", md, title)


def _rung4(url: str) -> Page:
    key = os.environ.get("FIRECRAWL_API_KEY")
    if not key:
        return Page(url, "error", "firecrawl", title="FIRECRAWL_API_KEY not set")
    import httpx

    try:
        r = httpx.post(
            "https://api.firecrawl.dev/v2/scrape",
            headers={"Authorization": f"Bearer {key}"},
            json={"url": url, "formats": ["markdown"], "onlyMainContent": True, "proxy": os.environ.get("FIRECRAWL_PROXY", "auto")},
            timeout=90,
        )
        data = r.json().get("data") or {}
    except Exception as e:
        return Page(url, "error", "firecrawl", title=str(e)[:120])
    md = data.get("markdown") or ""
    return Page(url, "ok" if len(md) >= MIN_TEXT else "thin", "firecrawl", md, (data.get("metadata") or {}).get("title", ""))


def _cache_path(url: str):
    return config.PAGES / (hashlib.sha1(url.encode()).hexdigest()[:16] + ".json")


def fetch(url: str, use_cache: bool = True, allow_paid: bool = True) -> Page:
    path = _cache_path(url)
    if use_cache and path.exists():
        return Page(**json.loads(path.read_text()))

    if not allowed(url):
        page = Page(url, "disallowed", "robots")
    else:
        _throttle(urlparse(url).netloc)
        page = _rung1(url)
        if page.status == "thin":
            page = _rung2(url)
            if page.status != "ok" and allow_paid:
                page = _rung4(url)
        elif page.status in ("ip_block", "error") and allow_paid:
            page = _rung4(url)  # skip the browser: a datacenter IP block won't change with JS
        # status == "challenge": stop here (no automated challenge solving)

    config.PAGES.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(page.__dict__, ensure_ascii=False))
    return page

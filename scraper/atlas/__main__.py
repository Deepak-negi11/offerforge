"""CLI: uv run python -m atlas <command> [--company slug] ...

  discover   find candidate URLs (Firecrawl search, HN, Reddit API if configured)
  extract    fetch candidates via the ladder and extract questions with Claude
  build      normalize + merge data/raw/*.json into web/public/data/atlas.json
  fetch      fetch one URL through the ladder and print what happened (debugging)
  refresh    discover + extract + build
  verify     spot-check that cited source URLs load and mention the company
"""

from __future__ import annotations

import argparse
import sys

from . import config


def main() -> int:
    ap = argparse.ArgumentParser(prog="atlas")
    ap.add_argument("command", choices=["discover", "extract", "build", "fetch", "refresh", "verify"])
    ap.add_argument("--company", action="append", help="company slug (repeatable); default: all")
    ap.add_argument("--max-pages", type=int, default=25, help="pages per company for extract")
    ap.add_argument("--per-query", type=int, default=8, help="search results per query for discover")
    ap.add_argument("--url", help="URL for the fetch command")
    ap.add_argument("--sample", type=int, default=60, help="URLs to check for verify")
    args = ap.parse_args()

    slugs = args.company or list(config.COMPANIES)
    unknown = [s for s in slugs if s not in config.COMPANIES]
    if unknown:
        print(f"unknown company slug(s): {', '.join(unknown)}. Known: {', '.join(config.COMPANIES)}")
        return 2

    if args.command == "fetch":
        from .fetch import fetch

        if not args.url:
            print("--url is required")
            return 2
        page = fetch(args.url, use_cache=False)
        print(f"{page.status} via {page.rung}: {page.title!r}, {len(page.markdown)} chars")
        return 0

    if args.command == "verify":
        from .verify import verify

        verify(args.sample)
        return 0

    if args.command in ("discover", "refresh"):
        from .discover import discover

        for s in slugs:
            discover(s, args.per_query)

    if args.command in ("extract", "refresh"):
        from .extract import extract_company

        for s in slugs:
            extract_company(s, args.max_pages)

    if args.command in ("build", "refresh"):
        from .build import build

        ds = build()
        st = ds["stats"]
        print(f"built {config.OUT.relative_to(config.ROOT)}: {st['questions']} questions, {st['companies']} companies, "
              f"{st['sources']} source URLs ({st['dropped']} unsourced records dropped)")
    return 0


if __name__ == "__main__":
    sys.exit(main())

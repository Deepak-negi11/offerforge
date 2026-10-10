"""Turn fetched pages into structured question records with Claude.

The model only fills in question fields. The source URL attached to every record is
the page we actually fetched, set here in code, so a record can never cite a URL the
model made up. Pages that don't mention the company are skipped before any API call.
"""

from __future__ import annotations

import json
import os
from typing import Literal

from pydantic import BaseModel, Field

from . import config
from .build import normalize_platform
from .fetch import fetch

MODEL = os.environ.get("ATLAS_MODEL", "claude-opus-5-5")
MAX_CHARS = 60_000  # long threads are cut at a paragraph boundary; see _trim

Category = Literal["DSA", "Backend", "System Design", "LLD", "CS Fundamentals", "SQL", "Aptitude", "Puzzles", "Project", "Behavioral"]


class ExtractedQuestion(BaseModel):
    track: Literal["intern", "fulltime"]
    role: str = Field(description="Role as written in the post, e.g. 'SDE Intern', 'SDE-1', 'Summer Analyst'")
    round: str = Field(description="Round as the post describes it, e.g. 'Online Assessment', 'Technical Interview 2', 'Bar Raiser'")
    category: Category
    topics: list[str] = Field(description="1-4 topic names such as Graphs, Dynamic Programming, DBMS, Caching")
    difficulty: Literal["Easy", "Medium", "Hard"] | None
    question: str = Field(description="The question paraphrased in 1-3 sentences")
    leetcodeSlug: str | None = Field(description="Only if the post names the LeetCode problem or links it")
    year: int | None
    location: str | None


class Extraction(BaseModel):
    is_interview_report: bool = Field(description="True only if the page reports questions actually asked in a real interview or OA")
    company_matches: bool
    questions: list[ExtractedQuestion]


SYSTEM = (
    "You extract interview questions from first-hand interview reports for a student prep site. "
    "Only include questions the author says were actually asked by the named company. "
    "Do not add questions from your own knowledge, generic advice lists, or 'questions you should practice' sections. "
    "Paraphrase each question in your own words. If the page is not a first-hand report, return is_interview_report=false and no questions."
)


def _trim(text: str) -> str:
    if len(text) <= MAX_CHARS:
        return text
    cut = text.rfind("\n\n", 0, MAX_CHARS)
    print(f"    note: page trimmed from {len(text)} to {cut if cut > 0 else MAX_CHARS} chars")
    return text[: cut if cut > 0 else MAX_CHARS]


def extract_page(client, company: str, url: str, content: str) -> Extraction | None:
    import anthropic

    try:
        resp = client.messages.parse(
            model=MODEL,
            max_tokens=16000,
            system=SYSTEM,
            messages=[{"role": "user", "content": f"Company: {company}\nURL: {url}\n\n<page>\n{_trim(content)}\n</page>"}],
            output_format=Extraction,
        )
    except anthropic.RateLimitError:
        print("    rate limited; stopping this run (re-run later, cached pages are reused)")
        raise
    except anthropic.APIStatusError as e:
        print(f"    API error {e.status_code}: {e.message[:120]}")
        return None
    if resp.stop_reason == "refusal":
        print("    model declined this page; skipped")
        return None
    return resp.parsed_output


def extract_company(slug: str, max_pages: int = 25) -> int:
    import anthropic

    name = config.COMPANIES[slug]["name"]
    disc = config.DISCOVERED / f"{slug}.jsonl"
    if not disc.exists():
        print(f"  {name}: run `discover` first")
        return 0
    candidates = [json.loads(line) for line in disc.read_text().splitlines() if line.strip()]
    out_path = config.EXTRACTED / f"{slug}.json"
    existing = json.loads(out_path.read_text()) if out_path.exists() else {"company": name, "slug": slug, "questions": [], "processes": [], "seenUrls": []}
    seen = set(existing.get("seenUrls", []))
    client = anthropic.Anthropic()
    added = 0

    for cand in [c for c in candidates if c["url"] not in seen][:max_pages]:
        url = cand["url"]
        page = fetch(url)
        content = page.markdown if page.status == "ok" else ""
        if not content and cand.get("snippet"):
            content = f"# {cand.get('title', '')}\n\n{cand['snippet']}"  # robots-disallowed or blocked: snippet only
        seen.add(url)
        if name.split()[0].lower() not in content.lower():
            continue
        print(f"  extracting {url} ({page.rung}/{page.status})")
        result = extract_page(client, name, url, content)
        if not result or not result.is_interview_report or not result.company_matches:
            continue
        source = {"url": url, "platform": normalize_platform(None, url), "title": (page.title or cand.get("title") or "")[:140]}
        for q in result.questions:
            existing["questions"].append({**q.model_dump(), "sources": [source]})
            added += 1

    existing["seenUrls"] = sorted(seen)
    config.EXTRACTED.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(existing, ensure_ascii=False, indent=1))
    print(f"  {name}: +{added} questions -> {out_path.relative_to(config.ROOT)}")
    return added

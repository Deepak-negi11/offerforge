"""Merge curated + extracted company files into the single dataset the website loads.

Rules enforced here (not trusted to upstream steps):
  * a question without at least one http(s) source URL is dropped
  * rounds, categories, topics and platforms are normalized to canonical names
  * duplicates within (company, track) are merged and their sources unioned
"""

from __future__ import annotations

import hashlib
import json
import re
from collections import Counter, defaultdict
from datetime import datetime, timezone
from urllib.parse import urlparse

from . import config

_WORD = re.compile(r"[a-z0-9]+")
_STOP = {"the", "a", "an", "of", "to", "in", "and", "or", "for", "given", "find", "return", "with", "on", "is", "you", "your"}


def normalize_round(raw: str | None) -> str:
    s = (raw or "").strip().lower()
    if not s:
        return "Technical Interview"
    if "communication" in s or "versant" in s:
        return "Communication Assessment"
    if "group discussion" in s or s == "gd":
        return "Group Discussion"
    if re.search(r"\boa\b", s) or any(k in s for k in ("online assessment", "online test", "hackerrank", "codesignal", "nqt", "coding test", "written test", "assessment", "hackwithinfy", "aptitude test")):
        return "Online Assessment"
    if "phone" in s or "screen" in s or "telephonic" in s:
        return "Phone Screen"
    if "machine coding" in s:
        return "Machine Coding"
    if "low level" in s or re.search(r"\blld\b", s) or "code design" in s or "object oriented design" in s:
        return "Low Level Design"
    if "system design" in s or "high level" in s or re.search(r"\bhld\b", s) or "architecture" in s:
        return "System Design"
    if "superday" in s:
        return "Superday"
    if "bar raiser" in s:
        return "Bar Raiser"
    if "hiring manager" in s or "managerial" in s or re.search(r"\bhm\b", s) or "manager" in s:
        return "Hiring Manager"
    if any(k in s for k in ("behavior", "behaviour", "leadership", "values", "googleyness", "culture")):
        return "Behavioral"
    if re.search(r"\bhr\b", s) or "human resource" in s:
        return "HR"
    m = re.search(r"(?:technical|coding|interview|round|onsite|virtual onsite)\D{0,12}(\d)", s) or re.search(r"(\d)\D{0,6}(?:technical|round)", s)
    if m and m.group(1) in "123":
        return f"Technical Interview {m.group(1)}"
    return "Technical Interview"


def normalize_category(raw: str | None, round_name: str) -> str:
    s = (raw or "").strip().lower()
    if s in config.CATEGORY_ALIASES:
        return config.CATEGORY_ALIASES[s]
    for cat in config.CATEGORIES:
        if s == cat.lower():
            return cat
    return {"Behavioral": "Behavioral", "HR": "Behavioral", "System Design": "System Design", "Low Level Design": "LLD", "Machine Coding": "LLD"}.get(round_name, "DSA")


def normalize_topic(raw: str) -> str | None:
    s = raw.strip()
    if not s:
        return None
    alias = config.TOPIC_ALIASES.get(s.lower())
    if alias:
        return alias
    return s if s[0].isupper() else s[:1].upper() + s[1:]


def normalize_platform(raw: str | None, url: str) -> str:
    p = (raw or "").strip().lower()
    host = urlparse(url).netloc.lower()
    by_host = [
        ("geeksforgeeks", "gfg"), ("leetcode", "leetcode"), ("reddit", "reddit"), ("linkedin", "linkedin"),
        ("x.com", "x"), ("twitter", "x"), ("glassdoor", "glassdoor"), ("medium.com", "medium"),
        ("youtube", "youtube"), ("youtu.be", "youtube"), ("ycombinator", "hn"),
    ]
    for needle, name in by_host:
        if needle in host:
            return name
    target = host + urlparse(url).path.lower()
    if any(h in target for h in config.AGGREGATOR_HOSTS):
        return "aggregator"
    return p if p in config.PLATFORMS and p not in ("other", "aggregator") else "blog"


_FORMAT_HINTS = re.compile(r"not disclosed|wasn't shared|was not shared|didn't share|did not share|can't share|cannot share|under nda|statement unknown", re.I)


def _looks_like_format(text: str) -> bool:
    return bool(_FORMAT_HINTS.search(text))


def _title(raw: str | None, slug: str | None, text: str) -> str:
    if isinstance(raw, str) and 2 <= len(raw.strip()) <= 80:
        return raw.strip().rstrip(".")
    if slug:
        small = {"of", "in", "a", "an", "the", "and", "or", "to", "with", "ii", "iii", "iv"}
        words = slug.split("-")
        return " ".join(w.upper() if w in ("ii", "iii", "iv", "bst", "lru", "lfu") else (w if i and w in small else w.capitalize()) for i, w in enumerate(words))
    head = re.split(r"[:;.?]| - ", text, maxsplit=1)[0].strip()
    words = head.split()
    return " ".join(words[:9]) + ("…" if len(words) > 9 else "")


def _fingerprint(q: dict) -> str:
    if q.get("leetcodeSlug"):
        return "lc:" + q["leetcodeSlug"].strip().lower()
    words = [w for w in _WORD.findall(q["question"].lower()) if w not in _STOP]
    return "tx:" + " ".join(words[:18])


def _clean_question(company: str, raw: dict) -> dict | None:
    text = re.sub(r"\s*[\u2014\u2013]\s*", " - ", (raw.get("question") or "")).strip()
    sources = []
    seen = set()
    for src in raw.get("sources") or []:
        url = (src.get("url") if isinstance(src, dict) else str(src) or "").strip()
        if not url.startswith(("http://", "https://")) or url in seen:
            continue
        seen.add(url)
        sources.append({
            "url": url,
            "platform": normalize_platform(src.get("platform") if isinstance(src, dict) else None, url),
            "title": (src.get("title") if isinstance(src, dict) else None) or urlparse(url).netloc,
        })
    if len(text) < 8 or not sources:
        return None
    track = "intern" if str(raw.get("track", "")).lower().startswith("intern") else "fulltime"
    round_name = normalize_round(raw.get("round"))
    topics = []
    for t in raw.get("topics") or []:
        nt = normalize_topic(str(t))
        if nt and nt not in topics:
            topics.append(nt)
    category = normalize_category(raw.get("category"), round_name)
    if category in ("LLD", "System Design"):
        topics = [t for t in topics if t != "Design"] or [category if category == "System Design" else "Low Level Design"]
    diff = raw.get("difficulty")
    diff = diff.capitalize() if isinstance(diff, str) and diff.lower() in {"easy", "medium", "hard"} else None
    year = raw.get("year")
    year = int(year) if isinstance(year, (int, float, str)) and str(year).isdigit() and 2015 <= int(year) <= 2027 else None
    slug = raw.get("leetcodeSlug")
    slug = slug.strip().strip("/").split("/")[-1].lower() if isinstance(slug, str) and slug.strip() else None
    kind = raw.get("kind") if raw.get("kind") in ("question", "format") else ("format" if _looks_like_format(text) else "question")
    return {
        "company": company,
        "track": track,
        "kind": kind,
        "title": _title(raw.get("title"), slug, text),
        "role": (raw.get("role") or ("Intern" if track == "intern" else "Full-time")).strip(),
        "round": round_name,
        "category": category,
        "topics": topics[:6],
        "difficulty": diff,
        "question": text,
        "leetcodeSlug": slug,
        "year": year,
        "location": raw.get("location") or None,
        "sources": sources,
    }


def _merge(a: dict, b: dict) -> dict:
    urls = {s["url"] for s in a["sources"]}
    a["sources"] += [s for s in b["sources"] if s["url"] not in urls]
    a["topics"] = list(dict.fromkeys(a["topics"] + b["topics"]))[:6]
    a["year"] = max(filter(None, [a["year"], b["year"]]), default=None)
    a["difficulty"] = a["difficulty"] or b["difficulty"]
    a["leetcodeSlug"] = a["leetcodeSlug"] or b["leetcodeSlug"]
    if a["kind"] == "format" and b["kind"] == "question":
        a["kind"], a["title"] = "question", b["title"]
    if len(b["question"]) > len(a["question"]) and len(b["question"]) < 400:
        a["question"] = b["question"]
    return a


def _load_company_files() -> dict[str, list[dict]]:
    files = sorted(config.RAW.glob("*.json")) + sorted(config.EXTRACTED.glob("*.json"))
    by_company: dict[str, list[dict]] = defaultdict(list)
    for f in files:
        try:
            doc = json.loads(f.read_text())
        except json.JSONDecodeError as e:
            print(f"  ! skipping {f.name}: invalid JSON ({e})")
            continue
        slug = doc.get("slug") or f.stem
        if slug not in config.COMPANIES:
            print(f"  ! skipping {f.name}: unknown company slug '{slug}' (add it to config.COMPANIES)")
            continue
        by_company[slug].append(doc)
    return by_company


def build() -> dict:
    by_company = _load_company_files()
    questions: list[dict] = []
    companies: list[dict] = []
    dropped = 0

    for slug, docs in by_company.items():
        meta = config.COMPANIES[slug]
        merged: dict[tuple, dict] = {}
        processes = []
        for doc in docs:
            for raw in doc.get("questions") or []:
                q = _clean_question(slug, raw)
                if q is None:
                    dropped += 1
                    continue
                key = (q["track"], _fingerprint(q))
                merged[key] = _merge(merged[key], q) if key in merged else q
            for p in doc.get("processes") or []:
                rounds = sorted(
                    ({"name": r.get("name", ""), "canonical": normalize_round(r.get("name")), "description": r.get("description", ""), "order": r.get("order", i + 1)}
                     for i, r in enumerate(p.get("rounds") or [])),
                    key=lambda r: r["order"],
                )
                srcs = [s for s in (p.get("sources") or []) if isinstance(s, str) and s.startswith("http")]
                if rounds and srcs:
                    processes.append({
                        "track": "intern" if str(p.get("track", "")).startswith("intern") else "fulltime",
                        "role": p.get("role") or "",
                        "location": p.get("location") or None,
                        "rounds": rounds,
                        "sources": srcs,
                    })

        company_qs = list(merged.values())
        for q in company_qs:
            q["id"] = hashlib.sha1(f"{slug}|{q['track']}|{_fingerprint(q)}".encode()).hexdigest()[:10]
            q["reports"] = len(q["sources"])
            q["secondaryOnly"] = all(s["platform"] == "aggregator" for s in q["sources"])
        company_qs.sort(key=lambda q: (config.ROUND_ORDER.get(q["round"], 99), -q["reports"]))
        questions += company_qs

        topic_counts = Counter(t for q in company_qs if q["kind"] == "question" for t in q["topics"])
        companies.append({
            "slug": slug,
            "name": meta["name"],
            "group": meta["group"],
            "logo": meta["logo"],
            "domain": meta["domain"],
            "counts": {
                "total": sum(q["kind"] == "question" for q in company_qs),
                "intern": sum(q["track"] == "intern" and q["kind"] == "question" for q in company_qs),
                "fulltime": sum(q["track"] == "fulltime" and q["kind"] == "question" for q in company_qs),
                "notes": sum(q["kind"] == "format" for q in company_qs),
            },
            "categories": dict(Counter(q["category"] for q in company_qs).most_common()),
            "topTopics": topic_counts.most_common(12),
            "rounds": {
                track: sorted({q["round"] for q in company_qs if q["track"] == track}, key=lambda r: config.ROUND_ORDER.get(r, 99))
                for track in ("intern", "fulltime")
            },
            "processes": processes,
            "sourceCount": len({s["url"] for q in company_qs for s in q["sources"]}),
        })

    group_rank = {g: i for i, g in enumerate(config.GROUP_ORDER)}
    companies.sort(key=lambda c: (group_rank.get(c["group"], 99), -c["counts"]["total"]))
    all_urls = {s["url"] for q in questions for s in q["sources"]}
    dataset = {
        "generatedAt": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "stats": {
            "questions": sum(q["kind"] == "question" for q in questions),
            "notes": sum(q["kind"] == "format" for q in questions),
            "companies": len(companies),
            "sources": len(all_urls),
            "platforms": dict(Counter(normalize_platform(None, u) for u in all_urls).most_common()),
            "dropped": dropped,
        },
        "rounds": list(config.ROUND_ORDER),
        "categories": config.CATEGORIES,
        "groups": config.GROUP_ORDER,
        "topics": Counter(t for q in questions if q["kind"] == "question" for t in q["topics"]).most_common(),
        "companies": companies,
        "questions": questions,
    }
    config.OUT.parent.mkdir(parents=True, exist_ok=True)
    config.OUT.write_text(json.dumps(dataset, ensure_ascii=False, separators=(",", ":")))
    return dataset

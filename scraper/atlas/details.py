"""Detailed write-ups for questions that are answered by talking or writing rather than by code that passes tests.

  python -m atlas details batches --size 25   # data/details/batches/batch-NNN.json with source passages
  python -m atlas details check <spec.json>   # validate one spec
  python -m atlas details build               # publish web/public/data/details/<qid>.json and the index
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

from . import config

ROOT = config.DATA / "details"
SPECS = ROOT / "specs"
BATCHES = ROOT / "batches"
OUT = config.ROOT / "web" / "public" / "data" / "details"
INDEX = ROOT / "index.json"
CATEGORIES = {"Behavioral", "System Design", "LLD", "CS Fundamentals", "Backend", "SQL", "AI/ML", "Project", "Puzzles", "Aptitude"}


class SpecError(Exception):
    pass


def validate(spec: dict) -> dict:
    for k in ("qid", "question", "lookingFor", "answer", "followUps"):
        if not spec.get(k):
            raise SpecError(f"missing field: {k}")
    if not isinstance(spec["lookingFor"], list) or not 2 <= len(spec["lookingFor"]) <= 7:
        raise SpecError("lookingFor must list 2-7 points")
    if not isinstance(spec["followUps"], list) or not 2 <= len(spec["followUps"]) <= 6:
        raise SpecError("followUps must list 2-6 questions")
    if len(spec["answer"]) < 300:
        raise SpecError("answer is too short to be useful")
    return {"question": spec["question"], "lookingFor": spec["lookingFor"], "answer": spec["answer"], "followUps": spec["followUps"]}


def make_batches(size: int) -> None:
    from . import sources

    atlas = json.loads((config.ROOT / "web" / "public" / "data" / "atlas.json").read_text())
    done = {p.stem for p in SPECS.glob("*.json")}
    items = []
    for q in atlas["questions"]:
        if q["kind"] != "question" or q["category"] not in CATEGORIES or q["id"] in done:
            continue
        srcs = []
        for src in q["sources"][:2]:
            ex = sources.excerpt(sources.text(src["url"]) or "", q["question"], q["title"], width=1600)
            if ex:
                srcs.append({"url": src["url"], "passage": ex})
        items.append({
            "qid": q["id"], "company": q["company"], "track": q["track"], "round": q["round"], "category": q["category"],
            "role": q["role"], "title": q["title"], "reported": q["question"], "topics": q["topics"], "sources": srcs,
            "_rank": q["reports"],
        })
    items.sort(key=lambda i: -i["_rank"])
    for i in items:
        i.pop("_rank")
    BATCHES.mkdir(parents=True, exist_ok=True)
    for old in BATCHES.glob("batch-*.json"):
        old.unlink()
    n = 0
    for k in range(0, len(items), size):
        n += 1
        (BATCHES / f"batch-{n:03d}.json").write_text(json.dumps(items[k:k + size], indent=1, ensure_ascii=False))
    print(f"{len(items)} questions in {n} batches -> {BATCHES.relative_to(config.ROOT)}")


def build() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    index, failed, written = {}, [], set()
    for f in sorted(SPECS.glob("*.json")):
        try:
            spec = json.loads(f.read_text())
            out = validate(spec)
        except (SpecError, json.JSONDecodeError) as e:
            failed.append((f.name, str(e)))
            continue
        name = f"{spec['qid']}.json"
        (OUT / name).write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")))
        written.add(name)
        index[spec["qid"]] = True
    for stale in OUT.glob("*.json"):
        if stale.name not in written:
            stale.unlink()
    INDEX.write_text(json.dumps(index))
    print(f"published {len(written)} detailed write-ups -> {OUT.relative_to(config.ROOT)}")
    for name, err in failed:
        print(f"  FAILED {name}: {err}")


def main(argv: list[str]) -> None:
    cmd = argv[0] if argv else ""
    if cmd == "batches":
        make_batches(int(argv[argv.index("--size") + 1]) if "--size" in argv else 25)
    elif cmd == "check":
        bad = 0
        for f in argv[1:]:
            try:
                validate(json.loads(Path(f).read_text()))
                print(f"OK   {Path(f).name}")
            except (SpecError, json.JSONDecodeError, OSError) as e:
                bad += 1
                print(f"FAIL {Path(f).name}: {e}")
        sys.exit(1 if bad else 0)
    elif cmd == "build":
        build()
    else:
        print(__doc__)
        sys.exit(2)

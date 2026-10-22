"""Full problem statements with tested examples and hidden test cases.

A spec (data/problems/specs/<pid>.json) is written per distinct coding problem. It holds the statement,
a reference solution, a test generator and, optionally, a brute-force solution. Expected outputs are never
written by hand: `check` and `build` run the reference solution to produce them, and compare it against the
brute force on small inputs.

  python -m atlas problems select --company google --limit 20   # write data/problems/todo.json
  python -m atlas problems check data/problems/specs/<pid>.json  # validate one spec
  python -m atlas problems build                                 # publish web/public/data/problems/<qid>.json
"""

from __future__ import annotations

import ast
import hashlib
import json
import re
import shutil
import subprocess
import sys
import tempfile
from collections import defaultdict
from pathlib import Path

from . import config

ROOT = config.DATA / "problems"
SPECS = ROOT / "specs"
TODO = ROOT / "todo.json"
OUT = config.ROOT / "web" / "public" / "data" / "problems"
INDEX = ROOT / "index.json"  # qid -> pid, read by `atlas build` to flag questions that have a full problem
COMPILED = config.CACHE / "problems-compiled"  # build cache: published problem per spec, keyed by content hash

# Generated code may only use these modules; no files, network or processes.
ALLOWED_IMPORTS = {
    "sys", "math", "heapq", "collections", "itertools", "functools", "bisect", "random", "string", "re",
    "typing", "dataclasses", "fractions", "decimal", "operator", "array", "copy", "statistics", "enum",
}
BANNED_CALLS = {"open", "eval", "exec", "compile", "__import__", "globals", "locals", "vars", "input", "breakpoint", "help"}
TEST_RANGE = {"Easy": (8, 14), "Medium": (12, 22), "Hard": (18, 32)}
MAX_TEST_BYTES = 2_500_000
MAX_TOTAL_BYTES = 10_000_000
RUN_TIMEOUT = 10
INLINE_BYTES = 4_000  # tests larger than this are published as generator index + SHA-256 of input and output
GEN_SEED = 20261020


class SpecError(Exception):
    pass


def _safe(code: str, what: str) -> None:
    try:
        tree = ast.parse(code)
    except SyntaxError as e:
        raise SpecError(f"{what}: syntax error: {e}") from e
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            for a in node.names:
                if a.name.split(".")[0] not in ALLOWED_IMPORTS:
                    raise SpecError(f"{what}: import of {a.name} is not allowed")
        elif isinstance(node, ast.ImportFrom):
            if (node.module or "").split(".")[0] not in ALLOWED_IMPORTS:
                raise SpecError(f"{what}: import from {node.module} is not allowed")
        elif isinstance(node, ast.Call) and isinstance(node.func, ast.Name) and node.func.id in BANNED_CALLS:
            raise SpecError(f"{what}: call to {node.func.id}() is not allowed")
        elif isinstance(node, ast.Attribute) and node.attr.startswith("__") and node.attr not in {"__init__", "__name__", "__lt__", "__eq__", "__hash__", "__repr__"}:
            raise SpecError(f"{what}: dunder attribute {node.attr} is not allowed")


def _py(code: str, stdin: str = "", timeout: int = RUN_TIMEOUT) -> str:
    with tempfile.TemporaryDirectory() as d:
        f = Path(d) / "main.py"
        f.write_text(code)
        r = subprocess.run([sys.executable, "-I", str(f)], input=stdin, capture_output=True, text=True, timeout=timeout, cwd=d, env={"PATH": "/usr/bin:/bin"})
    if r.returncode != 0:
        raise SpecError(f"program failed: {r.stderr.strip()[-600:]}")
    return r.stdout


def _js(code: str, stdin: str) -> None:
    """Run a JavaScript starter the way the site does (stdin in the global `input`), in Node's permission sandbox."""
    node = shutil.which("node")
    if not node:
        return
    with tempfile.TemporaryDirectory() as tmp:
        d = str(Path(tmp).resolve())  # the sandbox needs the real path; macOS temp dirs sit behind a symlink
        f = Path(d) / "main.js"
        f.write_text(f"const input = {json.dumps(stdin)};\n{code}\n")
        r = subprocess.run([node, "--permission", f"--allow-fs-read={d}", str(f)], capture_output=True, text=True, timeout=20, cwd=d)
    if r.returncode != 0:
        raise SpecError(f"javascript starter failed: {r.stderr.strip()[-400:]}")


def _norm(s: str) -> str:
    return "\n".join(line.rstrip() for line in s.replace("\r\n", "\n").split("\n")).strip()


def _gen_inputs(spec: dict) -> list[str]:
    runner = spec["generator"] + f"\n\nimport json as _j, random as _r, sys as _s\n_s.stdout.write(_j.dumps([str(x) for x in gen(_r.Random({GEN_SEED}))]))\n"
    # json is needed only by this wrapper, appended after the safety check
    out = _py(runner, timeout=60)
    inputs = json.loads(out)
    if not isinstance(inputs, list) or not inputs:
        raise SpecError("generator returned no inputs")
    return inputs


def compile_spec(spec: dict) -> dict:
    """Run a spec end to end and return the published problem. Raises SpecError on any problem."""
    for k in ("pid", "title", "difficulty", "statement", "input_format", "output_format", "constraints", "examples", "complexity", "reference", "generator", "starters"):
        if not spec.get(k):
            raise SpecError(f"missing field: {k}")
    if spec["difficulty"] not in TEST_RANGE:
        raise SpecError("difficulty must be Easy, Medium or Hard")
    for lang in ("python", "javascript", "cpp", "java"):
        if not spec["starters"].get(lang):
            raise SpecError(f"missing starter for {lang}")
    _safe(spec["reference"], "reference")
    _safe(spec["generator"], "generator")
    if spec.get("brute"):
        _safe(spec["brute"], "brute")

    examples = []
    for i, ex in enumerate(spec["examples"]):
        inp = ex["input"].strip("\n") + "\n"
        got = _norm(_py(spec["reference"], inp))
        if ex.get("output") is not None and _norm(str(ex["output"])) != got:
            raise SpecError(f"example {i + 1}: stated output {ex['output']!r} but the reference prints {got!r}")
        examples.append({"input": inp.rstrip("\n"), "output": got, "explanation": ex.get("explanation", "")})

    _safe(spec["starters"]["python"], "python starter")
    _py(spec["starters"]["python"], examples[0]["input"] + "\n")  # the starter must run (and print a wrong answer)
    _js(spec["starters"]["javascript"], examples[0]["input"] + "\n")

    seen = {e["input"] for e in examples}
    tests, total = [], 0
    for g, inp in enumerate(_gen_inputs(spec)):
        inp = inp.strip("\n")
        if inp in seen or len(inp) > MAX_TEST_BYTES:
            continue
        seen.add(inp)
        try:
            out = _norm(_py(spec["reference"], inp + "\n"))
        except subprocess.TimeoutExpired as e:
            raise SpecError(f"reference timed out on a generated test ({len(inp)} bytes)") from e
        if spec.get("brute") and len(inp) <= 400:
            try:
                want = _norm(_py(spec["brute"], inp + "\n", timeout=5))
            except subprocess.TimeoutExpired:
                want = out  # the brute force is too slow for this input (e.g. huge values in a short line): skip it
            if want != out:
                raise SpecError(f"reference and brute force disagree on input {inp[:200]!r}: {out[:100]!r} vs {want[:100]!r}")
        tests.append({"input": inp, "output": out, "g": g})
    lo, hi = TEST_RANGE[spec["difficulty"]]
    if len(tests) < lo:
        raise SpecError(f"only {len(tests)} usable hidden tests; {spec['difficulty']} needs at least {lo}")
    # Keep the 4 largest tests wherever the generator put them, then fill up in generator order within the budget.
    big = set(sorted(range(len(tests)), key=lambda i: -len(tests[i]["input"]))[:4])
    keep, total = [], 0
    for i in sorted(big) + [i for i in range(len(tests)) if i not in big]:
        size = len(tests[i]["input"]) + len(tests[i]["output"])
        if len(keep) >= hi or total + size > MAX_TOTAL_BYTES:
            continue
        keep.append(i)
        total += size
    tests = [tests[i] for i in sorted(keep)]

    return {
        "title": spec["title"],
        "difficulty": spec["difficulty"],
        "statement": spec["statement"],
        "inputFormat": spec["input_format"],
        "outputFormat": spec["output_format"],
        "constraints": spec["constraints"],
        "examples": examples,
        "tests": tests,
        "complexity": spec["complexity"],
        "hints": spec.get("hints") or [],
        "starters": spec["starters"],
        "reconstructed": spec.get("source_note") != "standard",
    }


def _distinct_key(q: dict) -> str:
    return q["leetcodeSlug"] or f"{q['company']}:{re.sub(r'[^a-z0-9]+', '-', q['title'].lower()).strip('-')}"


def select(company: str | None, limit: int, ids: list[str] | None = None) -> list[dict]:
    atlas = json.loads((config.ROOT / "web" / "public" / "data" / "atlas.json").read_text())
    groups: dict[str, list[dict]] = defaultdict(list)
    for q in atlas["questions"]:
        if q["kind"] == "question" and q["category"] == "DSA":
            groups[_distinct_key(q)].append(q)
    done = {p.stem for p in SPECS.glob("*.json")}
    items = []
    for key, qs in groups.items():
        rep = max(qs, key=lambda q: (q["reports"], q["year"] or 0))
        pid = re.sub(r"[^a-z0-9]+", "-", key.lower()).strip("-")
        if pid in done:
            continue
        if ids and not any(q["id"] in ids for q in qs):
            continue
        if company and not ids and not any(q["company"] == company for q in qs):
            continue
        items.append({
            "pid": pid,
            "qids": [q["id"] for q in qs],
            "title": rep["title"],
            "difficulty": rep["difficulty"],
            "topics": rep["topics"],
            "leetcodeSlug": rep["leetcodeSlug"],
            "reported": [{"company": q["company"], "round": q["round"], "text": q["question"]} for q in qs][:4],
            "_rank": sum(q["reports"] for q in qs),
        })
    items.sort(key=lambda x: -x["_rank"])
    for it in items:
        it.pop("_rank")
    return items[:limit]


BATCHES = ROOT / "batches"


def make_batches(size: int) -> None:
    """Every DSA problem without a spec, ranked by reports, with passages from its source posts, in batch files."""
    from . import sources

    atlas = json.loads((config.ROOT / "web" / "public" / "data" / "atlas.json").read_text())
    groups: dict[str, list[dict]] = defaultdict(list)
    for q in atlas["questions"]:
        if q["kind"] == "question" and q["category"] == "DSA":
            groups[_distinct_key(q)].append(q)
    items = select(None, 10**6)
    for it in items:
        qs = [q for q in groups.values() for q in q if q["id"] in set(it["qids"])]
        seen, srcs = set(), []
        for q in sorted(qs, key=lambda q: -q["reports"]):
            for src in q["sources"]:
                if src["url"] in seen or len(srcs) >= 3:
                    continue
                seen.add(src["url"])
                ex = sources.excerpt(sources.text(src["url"]) or "", q["question"], q["title"])
                if ex:
                    srcs.append({"url": src["url"], "passage": ex})
        it["sources"] = srcs
    BATCHES.mkdir(parents=True, exist_ok=True)
    for old in BATCHES.glob("batch-*.json"):
        old.unlink()
    (ROOT / "todo-all.json").write_text(json.dumps([{"pid": i["pid"], "qids": i["qids"]} for i in items], indent=1))
    n = 0
    for k in range(0, len(items), size):
        n += 1
        (BATCHES / f"batch-{n:03d}.json").write_text(json.dumps(items[k:k + size], indent=1, ensure_ascii=False))
    with_src = sum(1 for i in items if i["sources"])
    print(f"{len(items)} problems in {n} batches of {size} ({with_src} with source passages) -> {BATCHES.relative_to(config.ROOT)}")


def _sha(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def publish(prob: dict, spec: dict) -> dict:
    """Small tests stay literal; large ones become (generator index, input hash, output hash) so files stay small
    and the reference answers are never shipped. The browser regenerates the input with the published generator."""
    tests, hashed = [], False
    for t in prob["tests"]:
        if len(t["input"]) + len(t["output"]) <= INLINE_BYTES:
            tests.append({"input": t["input"], "output": t["output"]})
        else:
            tests.append({"g": t["g"], "n": len(t["input"]), "ih": _sha(t["input"]), "oh": _sha(t["output"])})
            hashed = True
    out = {**prob, "tests": tests}
    if hashed:
        out["generator"] = spec["generator"]
        out["seed"] = GEN_SEED
    return out


def build() -> None:
    todo_map = {}
    for f in [TODO, *ROOT.glob("todo-*.json")]:
        if f.exists():
            for it in json.loads(f.read_text()):
                todo_map[it["pid"]] = it["qids"]
    OUT.mkdir(parents=True, exist_ok=True)
    index, written, failed = {}, set(), []
    for f in sorted(SPECS.glob("*.json")):
        spec = json.loads(f.read_text())
        qids = spec.get("qids") or todo_map.get(spec.get("pid"), [])
        digest = _sha(f.read_text() + Path(__file__).read_text())  # recompile when the spec or the checker changes
        cached = COMPILED / f"{spec.get('pid')}.json"
        prob = None
        if cached.exists():
            c = json.loads(cached.read_text())
            if c.get("digest") == digest:
                prob = c["problem"]
        if prob is None:
            try:
                prob = publish(compile_spec(spec), spec)
            except (SpecError, subprocess.TimeoutExpired, KeyError, json.JSONDecodeError) as e:
                failed.append((f.name, str(e)[:200]))
                continue
            COMPILED.mkdir(parents=True, exist_ok=True)
            cached.write_text(json.dumps({"digest": digest, "problem": prob}, separators=(",", ":")))
        name = f"{spec['pid']}.json"
        (OUT / name).write_text(json.dumps(prob, ensure_ascii=False, separators=(",", ":")))
        written.add(name)
        for qid in qids:
            index[qid] = spec["pid"]
    for stale in OUT.glob("*.json"):
        if stale.name not in written:
            stale.unlink()
    INDEX.write_text(json.dumps(index, indent=1))
    size = sum((OUT / n).stat().st_size for n in written)
    print(f"published {len(written)} problems for {len(index)} questions ({size // 1024} KB) -> {OUT.relative_to(config.ROOT)}")
    for name, err in failed:
        print(f"  FAILED {name}: {err}")


def main(argv: list[str]) -> None:
    cmd = argv[0] if argv else ""
    if cmd == "select":
        company = argv[argv.index("--company") + 1] if "--company" in argv else None
        limit = int(argv[argv.index("--limit") + 1]) if "--limit" in argv else 20
        ids = argv[argv.index("--ids") + 1].split(",") if "--ids" in argv else None
        out = Path(argv[argv.index("--out") + 1]) if "--out" in argv else TODO
        items = select(company, limit, ids)
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_text(json.dumps(items, indent=1, ensure_ascii=False))
        print(f"{len(items)} problems -> {out}")
    elif cmd == "check":
        spec = json.loads(Path(argv[1]).read_text())
        try:
            p = compile_spec(spec)
        except (SpecError, subprocess.TimeoutExpired) as e:
            print(f"FAIL: {e}")
            sys.exit(1)
        sizes = sorted(len(t["input"]) for t in p["tests"])
        print(f"OK: {len(p['examples'])} examples, {len(p['tests'])} hidden tests (largest input {sizes[-1]} bytes)")
        for i, ex in enumerate(p["examples"], 1):
            print(f"  example {i} output: {ex['output'][:120]!r}")
    elif cmd == "build":
        build()
    elif cmd == "batches":
        make_batches(int(argv[argv.index("--size") + 1]) if "--size" in argv else 8)
    elif cmd == "sources":
        from . import sources

        sources.main(argv[1:])
    else:
        print(__doc__)
        sys.exit(2)

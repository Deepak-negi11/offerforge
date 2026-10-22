/// <reference lib="webworker" />
// Runs user Python with Pyodide (CPython compiled to WebAssembly), loaded once per worker.
const PYODIDE = 'https://cdn.jsdelivr.net/pyodide/v0.27.7/full/'

type Pyodide = { runPythonAsync: (code: string) => Promise<unknown>; globals: { set: (k: string, v: unknown) => void } }
let ready: Promise<Pyodide> | null = null

function load() {
  ready ??= import(/* @vite-ignore */ `${PYODIDE}pyodide.mjs`).then((m) => m.loadPyodide({ indexURL: PYODIDE }) as Promise<Pyodide>)
  return ready
}

const HARNESS = `
import sys, io, traceback
# Byte-backed streams, so sys.stdin.buffer / sys.stdout.buffer work like on a judge.
_outb = io.BytesIO()
_out = io.TextIOWrapper(_outb, encoding="utf-8", write_through=True)
_err = io.StringIO()
sys.stdin = io.TextIOWrapper(io.BytesIO(__stdin.encode("utf-8")), encoding="utf-8")
sys.stdout, sys.stderr = _out, _err
# Deep recursion (e.g. DFS on a 50,000-node chain) works up to here; infinite recursion still fails fast and cleanly.
sys.setrecursionlimit(60000)
_status = "ok"
try:
    exec(compile(__code, "solution.py", "exec"), {"__name__": "__main__"})
except SystemExit:
    pass
except BaseException:
    _status = "error"
    traceback.print_exc()
finally:
    _out.flush()
    sys.stdout, sys.stderr = sys.__stdout__, sys.__stderr__
(_outb.getvalue().decode("utf-8", "replace")[:2000000], _err.getvalue()[:64000], _status)
`

// Rebuilds large hidden-test inputs from a problem's published generator (same seed as the build).
const GEN = `
import random as _r
_g = {"__name__": "generator"}
exec(compile(__code, "generator.py", "exec"), _g)
_all = [str(x).strip("\\n") for x in _g["gen"](_r.Random(__seed))]
[_all[i] for i in __idx]
`

type Msg = { type: 'warm' } | { type: 'run'; code: string; stdin: string } | { type: 'gen'; code: string; seed: number; indices: number[] }

self.onmessage = async (e: MessageEvent<Msg>) => {
  if (e.data.type === 'gen') {
    try {
      const py = await load()
      py.globals.set('__code', e.data.code)
      py.globals.set('__seed', e.data.seed)
      py.globals.set('__idx', e.data.indices)
      const res = (await py.runPythonAsync(GEN)) as { toJs: () => string[]; destroy: () => void }
      const inputs = res.toJs()
      res.destroy()
      self.postMessage({ type: 'gen-result', inputs })
    } catch (err) {
      self.postMessage({ type: 'gen-result', error: (err as Error).message })
    }
    return
  }
  try {
    const py = await load()
    if (e.data.type === 'warm') return self.postMessage({ type: 'ready' })
    py.globals.set('__code', e.data.code)
    py.globals.set('__stdin', e.data.stdin)
    const t0 = performance.now()
    const res = (await py.runPythonAsync(HARNESS)) as { toJs: () => [string, string, string]; destroy: () => void }
    const [stdout, stderr, status] = res.toJs()
    res.destroy()
    self.postMessage({ type: 'result', stdout, stderr, status, timeMs: performance.now() - t0 })
  } catch (err) {
    self.postMessage({ type: 'result', stdout: '', stderr: `Python runtime failed to load: ${(err as Error).message}`, status: 'error', timeMs: 0 })
  }
}

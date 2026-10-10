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
_out, _err = io.StringIO(), io.StringIO()
sys.stdin, sys.stdout, sys.stderr = io.StringIO(__stdin), _out, _err
_status = "ok"
try:
    exec(compile(__code, "solution.py", "exec"), {"__name__": "__main__"})
except SystemExit:
    pass
except BaseException:
    _status = "error"
    traceback.print_exc()
finally:
    sys.stdout, sys.stderr = sys.__stdout__, sys.__stderr__
(_out.getvalue()[:64000], _err.getvalue()[:64000], _status)
`

self.onmessage = async (e: MessageEvent<{ type: 'warm' } | { type: 'run'; code: string; stdin: string }>) => {
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

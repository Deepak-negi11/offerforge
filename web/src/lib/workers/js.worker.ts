/// <reference lib="webworker" />
// Runs user JavaScript off the main thread. The page terminates this worker on timeout.
const MAX_OUT = 64_000
const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor

self.onmessage = async (e: MessageEvent<{ code: string; stdin: string }>) => {
  const { code, stdin } = e.data
  let stdout = ''
  let stderr = ''
  const fmt = (args: unknown[]) =>
    args.map((a) => (typeof a === 'string' ? a : (() => { try { return JSON.stringify(a) } catch { return String(a) } })())).join(' ')
  const write = (to: 'out' | 'err', s: string) => {
    if (to === 'out') stdout = (stdout + s + '\n').slice(0, MAX_OUT)
    else stderr = (stderr + s + '\n').slice(0, MAX_OUT)
  }
  const fakeConsole = {
    log: (...a: unknown[]) => write('out', fmt(a)),
    info: (...a: unknown[]) => write('out', fmt(a)),
    warn: (...a: unknown[]) => write('err', fmt(a)),
    error: (...a: unknown[]) => write('err', fmt(a)),
  }
  const lines = stdin.split('\n')
  let cursor = 0
  const readline = () => (cursor < lines.length ? lines[cursor++] : '')
  const t0 = performance.now()
  try {
    await new AsyncFunction('console', 'readline', 'input', code)(fakeConsole, readline, stdin)
    self.postMessage({ stdout, stderr, timeMs: performance.now() - t0, status: 'ok' })
  } catch (err) {
    const e2 = err as Error
    self.postMessage({ stdout, stderr: stderr + (e2?.stack ?? String(err)), timeMs: performance.now() - t0, status: 'error' })
  }
}

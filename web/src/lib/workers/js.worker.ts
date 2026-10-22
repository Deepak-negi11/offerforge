/// <reference lib="webworker" />
// Runs user JavaScript off the main thread. The page terminates this worker on timeout.
const MAX_OUT = 2_000_000
const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor

self.onmessage = async (e: MessageEvent<{ code: string; stdin: string }>) => {
  const { code, stdin } = e.data
  // Chunks are collected and joined once, so printing many lines stays linear.
  const out: string[] = []
  const err: string[] = []
  let outLen = 0
  let errLen = 0
  const fmt = (args: unknown[]) =>
    args.map((a) => (typeof a === 'string' ? a : (() => { try { return JSON.stringify(a) } catch { return String(a) } })())).join(' ')
  const write = (to: 'out' | 'err', s: string) => {
    if (to === 'out') {
      if (outLen < MAX_OUT) out.push(s + '\n')
      outLen += s.length + 1
    } else {
      if (errLen < 64_000) err.push(s + '\n')
      errLen += s.length + 1
    }
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
    self.postMessage({ stdout: out.join('').slice(0, MAX_OUT), stderr: err.join(''), timeMs: performance.now() - t0, status: 'ok' })
  } catch (e2) {
    const ex = e2 as Error
    self.postMessage({ stdout: out.join('').slice(0, MAX_OUT), stderr: err.join('') + (ex?.stack ?? String(e2)), timeMs: performance.now() - t0, status: 'error' })
  }
}

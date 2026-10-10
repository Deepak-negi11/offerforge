import { api, ApiError } from './api'

export type Lang = 'python' | 'javascript' | 'cpp' | 'java'

export interface RunResult {
  status: 'ok' | 'error' | 'timeout' | 'compile-error' | 'unavailable'
  stdout: string
  stderr: string
  timeMs: number
}

export const LANGS: { id: Lang; label: string; monaco: string; where: string }[] = [
  { id: 'python', label: 'Python 3', monaco: 'python', where: 'Runs in your browser' },
  { id: 'javascript', label: 'JavaScript', monaco: 'javascript', where: 'Runs in your browser' },
  { id: 'cpp', label: 'C++', monaco: 'cpp', where: 'Runs on the server runner' },
  { id: 'java', label: 'Java', monaco: 'java', where: 'Runs on the server runner' },
]

export const STARTER: Record<Lang, string> = {
  python: `import sys

def solve(data: str) -> str:
    # Parse the input and return the answer as text.
    nums = list(map(int, data.split()))
    return str(sum(nums))

print(solve(sys.stdin.read()))
`,
  javascript: `// readline() returns the next input line; input holds all of stdin.
function solve(data) {
  const nums = data.split(/\\s+/).filter(Boolean).map(Number)
  return String(nums.reduce((a, b) => a + b, 0))
}

console.log(solve(input))
`,
  cpp: `#include <bits/stdc++.h>
using namespace std;

int main() {
    ios::sync_with_stdio(false);
    cin.tie(nullptr);
    long long x, sum = 0;
    while (cin >> x) sum += x;
    cout << sum << "\\n";
    return 0;
}
`,
  java: `import java.util.*;
import java.io.*;

public class Main {
    public static void main(String[] args) throws IOException {
        BufferedReader br = new BufferedReader(new InputStreamReader(System.in));
        long sum = 0;
        String line;
        while ((line = br.readLine()) != null)
            for (String t : line.trim().split("\\\\s+")) if (!t.isEmpty()) sum += Long.parseLong(t);
        System.out.println(sum);
    }
}
`,
}

const TIMEOUT_MS = 6000

function runInWorker(make: () => Worker, msg: unknown, timeoutMs: number): Promise<RunResult> {
  return new Promise((resolve) => {
    const w = make()
    const timer = setTimeout(() => {
      w.terminate()
      resolve({ status: 'timeout', stdout: '', stderr: `Stopped after ${timeoutMs / 1000}s. Check for an infinite loop or a slow algorithm.`, timeMs: timeoutMs })
    }, timeoutMs)
    w.onmessage = (e) => {
      clearTimeout(timer)
      w.terminate()
      resolve(e.data as RunResult)
    }
    w.onerror = (e) => {
      clearTimeout(timer)
      w.terminate()
      resolve({ status: 'error', stdout: '', stderr: e.message || 'Worker crashed', timeMs: 0 })
    }
    w.postMessage(msg)
  })
}

const makeJs = () => new Worker(new URL('./workers/js.worker.ts', import.meta.url), { type: 'module' })
const makePy = () => new Worker(new URL('./workers/py.worker.ts', import.meta.url), { type: 'module' })

// Python keeps one warm worker so Pyodide (~10 MB) loads once. A timeout kills it and a fresh one loads next run.
let pyWorker: Worker | null = null
let pyReady: Promise<void> | null = null

export function warmPython() {
  if (pyWorker) return pyReady!
  pyWorker = makePy()
  const w = pyWorker
  pyReady = new Promise((resolve) => {
    const onMsg = (e: MessageEvent) => {
      if (e.data?.type === 'ready') {
        w.removeEventListener('message', onMsg)
        resolve()
      }
    }
    w.addEventListener('message', onMsg)
    w.postMessage({ type: 'warm' })
  })
  return pyReady
}

async function runPython(code: string, stdin: string): Promise<RunResult> {
  await warmPython()
  const w = pyWorker!
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      w.terminate()
      pyWorker = null
      pyReady = null
      resolve({ status: 'timeout', stdout: '', stderr: `Stopped after ${TIMEOUT_MS / 1000}s. Check for an infinite loop or a slow algorithm.`, timeMs: TIMEOUT_MS })
    }, TIMEOUT_MS)
    const onMsg = (e: MessageEvent) => {
      if (e.data?.type !== 'result') return
      clearTimeout(timer)
      w.removeEventListener('message', onMsg)
      resolve({ status: e.data.status, stdout: e.data.stdout, stderr: e.data.stderr, timeMs: e.data.timeMs })
    }
    w.addEventListener('message', onMsg)
    w.postMessage({ type: 'run', code, stdin })
  })
}

export async function runCode(lang: Lang, code: string, stdin: string): Promise<RunResult> {
  if (lang === 'javascript') return runInWorker(makeJs, { code, stdin }, TIMEOUT_MS)
  if (lang === 'python') return runPython(code, stdin)
  const t0 = performance.now()
  try {
    const r = await api<{ compileError: string; stdout: string; stderr: string; exitCode: number | null; signal: string | null }>('/run', {
      body: { language: lang, code, stdin },
    })
    const timeMs = performance.now() - t0
    if (r.compileError) return { status: 'compile-error', stdout: '', stderr: r.compileError, timeMs }
    const killed = r.signal === 'SIGKILL'
    return {
      status: killed ? 'timeout' : r.exitCode ? 'error' : 'ok',
      stdout: r.stdout,
      stderr: killed ? 'Stopped: time or memory limit reached.' : r.stderr,
      timeMs,
    }
  } catch (e) {
    const err = e as ApiError
    return { status: err.status === 503 ? 'unavailable' : 'error', stdout: '', stderr: err.message, timeMs: 0 }
  }
}

/** Output comparison used by test cases: ignores trailing whitespace on each line and at the end. */
export function sameOutput(actual: string, expected: string) {
  const norm = (s: string) => s.replace(/\r\n/g, '\n').split('\n').map((l) => l.trimEnd()).join('\n').trim()
  return norm(actual) === norm(expected)
}

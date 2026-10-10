import Editor from '@monaco-editor/react'
import { ArrowCounterClockwiseIcon, CheckCircleIcon, CircleNotchIcon, PlayIcon, PlusIcon, TrashIcon, XCircleIcon } from '@phosphor-icons/react'
import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { api } from '../lib/api'
import { LANGS, runCode, sameOutput, STARTER, warmPython, type Lang, type RunResult } from '../lib/runner'
import { useResolvedTheme } from '../lib/theme'

interface Test {
  input: string
  expected: string
}
interface TestResult extends RunResult {
  pass: boolean
}
type Draft = { language: string; code: string; tests: Test[]; updated_at: string }
type Tab = 'tests' | 'input' | 'output'

const LANG_KEY = 'atlas:lang'
const readLang = (): Lang => {
  try {
    const l = localStorage.getItem(LANG_KEY)
    return LANGS.some((x) => x.id === l) ? (l as Lang) : 'python'
  } catch {
    return 'python'
  }
}

export function CodePanel({ questionId }: { questionId: string }) {
  const theme = useResolvedTheme()
  const [lang, setLang] = useState<Lang>(readLang)
  const [codes, setCodes] = useState<Partial<Record<Lang, string>>>({})
  const [tests, setTests] = useState<Test[]>([{ input: '1 2 3', expected: '6' }])
  const [stdin, setStdin] = useState('1 2 3')
  const [tab, setTab] = useState<Tab>('tests')
  const [running, setRunning] = useState<'run' | 'tests' | null>(null)
  const [output, setOutput] = useState<RunResult | null>(null)
  const [results, setResults] = useState<(TestResult | null)[]>([])
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [loaded, setLoaded] = useState(false)
  const saveTimer = useRef<number | undefined>(undefined)

  const code = codes[lang] ?? STARTER[lang]

  useEffect(() => {
    let alive = true
    setLoaded(false)
    api<{ drafts: Draft[] }>(`/drafts/${questionId}`)
      .then(({ drafts }) => {
        if (!alive) return
        const next: Partial<Record<Lang, string>> = {}
        for (const d of drafts) if (d.language !== 'notes') next[d.language as Lang] = d.code
        setCodes(next)
        const latest = drafts.filter((d) => d.language !== 'notes').sort((a, b) => b.updated_at.localeCompare(a.updated_at))[0]
        if (latest?.tests?.length) setTests(latest.tests)
        if (latest && !next[readLang()]) setLang(latest.language as Lang)
      })
      .catch(() => {})
      .finally(() => alive && setLoaded(true))
    return () => {
      alive = false
    }
  }, [questionId])

  useEffect(() => {
    if (lang === 'python') warmPython()
    try {
      localStorage.setItem(LANG_KEY, lang)
    } catch {
      /* ignore */
    }
  }, [lang])

  const scheduleSave = useCallback(
    (language: Lang, nextCode: string, nextTests: Test[]) => {
      window.clearTimeout(saveTimer.current)
      setSaveState('saving')
      saveTimer.current = window.setTimeout(() => {
        api(`/drafts/${questionId}/${language}`, { method: 'PUT', body: { code: nextCode, tests: nextTests } })
          .then(() => setSaveState('saved'))
          .catch(() => setSaveState('error'))
      }, 900)
    },
    [questionId],
  )

  const onCode = (v: string | undefined) => {
    const next = v ?? ''
    setCodes((c) => ({ ...c, [lang]: next }))
    scheduleSave(lang, next, tests)
  }
  const updateTests = (next: Test[]) => {
    setTests(next)
    setResults([])
    scheduleSave(lang, code, next)
  }

  const run = async () => {
    setRunning('run')
    setTab('output')
    setOutput(await runCode(lang, code, stdin))
    setRunning(null)
  }

  const runTests = async () => {
    setRunning('tests')
    setTab('tests')
    const out: (TestResult | null)[] = tests.map(() => null)
    setResults([...out])
    for (let i = 0; i < tests.length; i++) {
      const r = await runCode(lang, code, tests[i].input)
      out[i] = { ...r, pass: r.status === 'ok' && sameOutput(r.stdout, tests[i].expected) }
      setResults([...out])
      if (r.status === 'unavailable' || r.status === 'compile-error') break
    }
    setRunning(null)
  }

  const reset = () => {
    if (!window.confirm(`Replace your ${LANGS.find((l) => l.id === lang)!.label} code with the starter template?`)) return
    setCodes((c) => ({ ...c, [lang]: STARTER[lang] }))
    scheduleSave(lang, STARTER[lang], tests)
  }

  const passed = results.filter((r) => r?.pass).length
  const done = results.filter(Boolean).length

  return (
    <div className="flex h-full min-h-0 flex-col bg-surface">
      <div className="flex flex-wrap items-center gap-2 border-b border-line px-3 py-2">
        <label className="sr-only" htmlFor="lang">
          Language
        </label>
        <select
          id="lang"
          value={lang}
          onChange={(e) => setLang(e.target.value as Lang)}
          className="h-8 rounded-lg border border-line bg-surface px-2 text-sm font-medium text-fg outline-none hover:border-line-strong focus-visible:border-accent"
        >
          {LANGS.map((l) => (
            <option key={l.id} value={l.id}>
              {l.label}
            </option>
          ))}
        </select>
        <span className="hidden text-xs text-subtle xl:inline">{LANGS.find((l) => l.id === lang)!.where}</span>
        <span className="ml-auto text-xs text-subtle" aria-live="polite">
          {saveState === 'saving' ? 'Saving…' : saveState === 'saved' ? 'Saved' : saveState === 'error' ? 'Not saved' : ''}
        </span>
        <button onClick={reset} title="Reset to starter code" aria-label="Reset to starter code" className="grid size-8 place-items-center rounded-lg text-subtle hover:bg-surface-2 hover:text-fg">
          <ArrowCounterClockwiseIcon size={16} />
        </button>
        <button
          onClick={run}
          disabled={!!running}
          className="flex h-8 items-center gap-1.5 rounded-lg border border-line bg-surface px-3 text-sm font-medium text-fg transition-[background-color,transform] hover:bg-surface-2 active:scale-[0.98] disabled:opacity-60"
        >
          {running === 'run' ? <CircleNotchIcon size={14} className="animate-spin" /> : <PlayIcon size={14} weight="fill" />} Run
        </button>
        <button
          onClick={runTests}
          disabled={!!running || tests.length === 0}
          className="flex h-8 items-center gap-1.5 rounded-lg bg-accent px-3 text-sm font-medium text-accent-fg transition-[background-color,transform] hover:bg-accent-hover active:scale-[0.98] disabled:opacity-60"
        >
          {running === 'tests' ? <CircleNotchIcon size={14} className="animate-spin" /> : <CheckCircleIcon size={14} weight="fill" />} Run tests
        </button>
      </div>

      <div className="min-h-0 flex-1">
        {loaded ? (
          <Editor
            key={lang}
            height="100%"
            language={LANGS.find((l) => l.id === lang)!.monaco}
            value={code}
            onChange={onCode}
            theme={theme === 'dark' ? 'vs-dark' : 'light'}
            loading={<div className="skeleton m-4 h-[60%]" />}
            options={{
              minimap: { enabled: false },
              fontSize: 14,
              fontFamily: '"Geist Mono Variable", ui-monospace, monospace',
              fontLigatures: false,
              scrollBeyondLastLine: false,
              automaticLayout: true,
              tabSize: 4,
              padding: { top: 12 },
              renderLineHighlight: 'line',
              smoothScrolling: true,
            }}
          />
        ) : (
          <div className="skeleton m-4 h-[60%]" />
        )}
      </div>

      <div className="flex h-[42%] min-h-[220px] flex-col border-t border-line">
        <div role="tablist" aria-label="Console" className="flex items-center gap-1 border-b border-line px-2">
          {(
            [
              ['tests', `Test cases${done ? ` (${passed}/${tests.length} passed)` : ''}`],
              ['input', 'Custom input'],
              ['output', 'Output'],
            ] as [Tab, string][]
          ).map(([t, label]) => (
            <button
              key={t}
              role="tab"
              aria-selected={tab === t}
              onClick={() => setTab(t)}
              className={
                '-mb-px border-b-2 px-3 py-2 text-sm font-medium transition-colors ' +
                (tab === t ? 'border-accent text-fg' : 'border-transparent text-muted hover:text-fg')
              }
            >
              {label}
            </button>
          ))}
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-3">
          {tab === 'tests' && (
            <div className="space-y-3">
              <p className="text-xs text-subtle">
                Add the examples from the question as tests. Your program reads the input from stdin and prints the answer. Output is compared line by line, ignoring trailing spaces.
              </p>
              {tests.map((t, i) => {
                const r = results[i]
                return (
                  <div key={i} className="rounded-lg border border-line bg-surface-2/50 p-3">
                    <div className="mb-2 flex items-center gap-2">
                      <span className="text-sm font-medium text-fg">Test {i + 1}</span>
                      {r && (r.pass ? (
                        <span className="flex items-center gap-1 text-xs font-medium text-easy"><CheckCircleIcon size={14} weight="fill" /> Passed</span>
                      ) : (
                        <span className="flex items-center gap-1 text-xs font-medium text-hard"><XCircleIcon size={14} weight="fill" /> {r.status === 'ok' ? 'Wrong answer' : r.status === 'timeout' ? 'Timed out' : r.status === 'compile-error' ? 'Compile error' : 'Error'}</span>
                      ))}
                      {!r && running === 'tests' && <CircleNotchIcon size={14} className="animate-spin text-subtle" />}
                      <button
                        onClick={() => updateTests(tests.filter((_, j) => j !== i))}
                        aria-label={`Delete test ${i + 1}`}
                        className="ml-auto grid size-7 place-items-center rounded-md text-subtle hover:bg-surface hover:text-hard"
                      >
                        <TrashIcon size={14} />
                      </button>
                    </div>
                    <div className="grid gap-2 sm:grid-cols-2">
                      <TestField label="Input" value={t.input} onChange={(v) => updateTests(tests.map((x, j) => (j === i ? { ...x, input: v } : x)))} />
                      <TestField label="Expected output" value={t.expected} onChange={(v) => updateTests(tests.map((x, j) => (j === i ? { ...x, expected: v } : x)))} />
                    </div>
                    {r && !r.pass && (
                      <pre className="mt-2 max-h-32 overflow-auto rounded-md bg-surface p-2 font-mono text-xs text-muted">
                        {r.status === 'ok' ? `Your output:\n${r.stdout || '(nothing printed)'}` : r.stderr || r.stdout}
                      </pre>
                    )}
                  </div>
                )
              })}
              <button
                onClick={() => updateTests([...tests, { input: '', expected: '' }])}
                disabled={tests.length >= 20}
                className="flex h-8 items-center gap-1.5 rounded-lg border border-dashed border-line-strong px-3 text-sm font-medium text-muted hover:border-accent hover:text-accent-ink disabled:opacity-50"
              >
                <PlusIcon size={14} /> Add test
              </button>
            </div>
          )}
          {tab === 'input' && (
            <TestField label="Standard input for Run" value={stdin} onChange={setStdin} rows={8} />
          )}
          {tab === 'output' && (
            <div>
              {running === 'run' && <p className="text-sm text-subtle">Running…{lang === 'python' && ' The first Python run loads the runtime, which takes a few seconds.'}</p>}
              {!running && !output && <p className="text-sm text-subtle">Press Run to execute your code with the custom input.</p>}
              {!running && output && (
                <div className="space-y-2">
                  <p className={'text-sm font-medium ' + (output.status === 'ok' ? 'text-easy' : 'text-hard')}>
                    {{ ok: 'Finished', error: 'Runtime error', timeout: 'Timed out', 'compile-error': 'Compile error', unavailable: 'Runner unavailable' }[output.status]}
                    {output.timeMs > 0 && <span className="ml-2 font-mono text-xs font-normal text-subtle">{Math.round(output.timeMs)} ms</span>}
                  </p>
                  {output.stdout && <pre className="overflow-auto rounded-md bg-surface-2 p-3 font-mono text-[13px] text-fg">{output.stdout}</pre>}
                  {output.stderr && <pre className="overflow-auto whitespace-pre-wrap break-words rounded-md bg-hard/10 p-3 font-mono text-[13px] text-hard">{output.stderr}</pre>}
                  {!output.stdout && !output.stderr && <p className="text-sm text-subtle">(no output)</p>}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function TestField({ label, value, onChange, rows = 3 }: { label: string; value: string; onChange: (v: string) => void; rows?: number }) {
  const id = useId()
  return (
    <div className="grid gap-1">
      <label htmlFor={id} className="text-xs font-medium text-muted">
        {label}
      </label>
      <textarea
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={rows}
        spellCheck={false}
        className="resize-y rounded-md border border-line bg-surface p-2 font-mono text-[13px] text-fg outline-none hover:border-line-strong focus-visible:border-accent"
      />
    </div>
  )
}

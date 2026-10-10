import { useEffect, useRef, useState } from 'react'
import { api } from '../lib/api'

const GUIDES: Record<string, { title: string; points: string[] }> = {
  Behavioral: {
    title: 'Answer with STAR',
    points: ['Situation: the context in one or two sentences', 'Task: what you were responsible for', 'Action: what you did, in first person', 'Result: the outcome, with a number if you have one'],
  },
  'System Design': {
    title: 'A structure interviewers expect',
    points: ['Requirements: functional, non-functional, scale estimates', 'API and data model', 'High-level design: components and data flow', 'Deep dive: bottlenecks, caching, consistency, failure cases'],
  },
  LLD: {
    title: 'Low-level design checklist',
    points: ['Entities and their responsibilities', 'Class diagram and relationships', 'Key methods and their signatures', 'Design patterns used and why, plus extensibility'],
  },
  'CS Fundamentals': {
    title: 'A strong short answer',
    points: ['Define the concept in one sentence', 'Explain how it works', 'Give a concrete example', 'Mention a trade-off or common follow-up'],
  },
}
GUIDES.Backend = GUIDES['CS Fundamentals']
GUIDES.SQL = { title: 'Write the query', points: ['State the tables and keys you assume', 'Write the query', 'Explain joins, grouping and edge cases (NULLs, ties)'] }

export function NotesPanel({ questionId, category }: { questionId: string; category: string }) {
  const [text, setText] = useState('')
  const [state, setState] = useState<'loading' | 'idle' | 'saving' | 'saved' | 'error'>('loading')
  const timer = useRef<number | undefined>(undefined)
  const guide = GUIDES[category] ?? GUIDES['CS Fundamentals']

  useEffect(() => {
    let alive = true
    api<{ drafts: { language: string; code: string }[] }>(`/drafts/${questionId}`)
      .then(({ drafts }) => alive && setText(drafts.find((d) => d.language === 'notes')?.code ?? ''))
      .catch(() => {})
      .finally(() => alive && setState('idle'))
    return () => {
      alive = false
    }
  }, [questionId])

  const onChange = (v: string) => {
    setText(v)
    setState('saving')
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => {
      api(`/drafts/${questionId}/notes`, { method: 'PUT', body: { code: v, tests: [] } })
        .then(() => setState('saved'))
        .catch(() => setState('error'))
    }, 900)
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-surface">
      <div className="flex items-center gap-3 border-b border-line px-4 py-2.5">
        <p className="text-sm font-medium text-fg">Your answer</p>
        <span className="ml-auto text-xs text-subtle" aria-live="polite">
          {state === 'saving' ? 'Saving…' : state === 'saved' ? 'Saved' : state === 'error' ? 'Not saved' : ''}
        </span>
      </div>
      <div className="border-b border-line bg-surface-2/50 px-4 py-3">
        <p className="text-xs font-medium text-muted">{guide.title}</p>
        <ol className="mt-1.5 grid gap-1 text-sm text-muted sm:grid-cols-2">
          {guide.points.map((p, i) => (
            <li key={p} className="flex gap-2">
              <span className="tabular-nums text-xs text-accent-ink">{i + 1}</span>
              {p}
            </li>
          ))}
        </ol>
      </div>
      <label htmlFor="notes" className="sr-only">
        Your answer
      </label>
      <textarea
        id="notes"
        value={text}
        onChange={(e) => onChange(e.target.value)}
        disabled={state === 'loading'}
        placeholder="Draft your answer here. Practise saying it out loud in under two minutes…"
        className="min-h-0 flex-1 resize-none bg-surface p-4 text-[15px] leading-relaxed text-fg outline-none placeholder:text-subtle"
      />
    </div>
  )
}

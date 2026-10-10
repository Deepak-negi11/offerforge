import { HashIcon, MagnifyingGlassIcon, QuestionIcon } from '@phosphor-icons/react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { matchesText, useAtlasState } from '../lib/data'
import { CompanyLogo } from './ui'

type Item = { key: string; kind: 'company' | 'topic' | 'question'; label: string; hint: string; to: string; slug?: string }

export function CommandPalette({ onClose }: { onClose: () => void }) {
  const state = useAtlasState()
  const nav = useNavigate()
  const [q, setQ] = useState('')
  const [active, setActive] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLUListElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [])

  const items = useMemo<Item[]>(() => {
    if (state.status !== 'ready') return []
    const a = state.atlas
    const needle = q.trim().toLowerCase()
    const companies = a.companies
      .filter((c) => !needle || c.name.toLowerCase().includes(needle))
      .slice(0, needle ? 6 : 8)
      .map<Item>((c) => ({ key: 'c' + c.slug, kind: 'company', label: c.name, hint: `${c.counts.total} questions`, to: `/company/${c.slug}`, slug: c.slug }))
    if (!needle) return companies
    const topics = a.topics
      .filter(([t]) => t.toLowerCase().includes(needle))
      .slice(0, 4)
      .map<Item>(([t, n]) => ({ key: 't' + t, kind: 'topic', label: t, hint: `${n} questions`, to: `/topics/${encodeURIComponent(t)}` }))
    const questions = a.questions
      .filter((x) => x.kind === 'question' && matchesText(x, a.companyBySlug.get(x.company)!.name, needle))
      .sort((x, y) => y.reports - x.reports)
      .slice(0, 8)
      .map<Item>((x) => ({ key: 'q' + x.id, kind: 'question', label: x.title, hint: `${a.companyBySlug.get(x.company)!.name} / ${x.round} / ${x.category}`, to: `/q/${x.id}` }))
    const all = [...companies, ...topics, ...questions]
    all.push({ key: 'all', kind: 'question', label: `Search all questions for “${q.trim()}”`, hint: 'Question bank', to: `/questions?q=${encodeURIComponent(q.trim())}` })
    return all
  }, [state, q])

  useEffect(() => setActive(0), [q])
  useEffect(() => {
    listRef.current?.querySelector(`[data-index="${active}"]`)?.scrollIntoView({ block: 'nearest' })
  }, [active])

  const go = (it: Item | undefined) => {
    if (!it) return
    onClose()
    nav(it.to)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-bg/70 px-4 pt-[12vh] backdrop-blur-sm" onMouseDown={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Search"
        onMouseDown={(e) => e.stopPropagation()}
        className="expand w-full max-w-xl overflow-hidden rounded-xl border border-line bg-surface shadow-panel"
      >
        <div className="flex items-center gap-3 border-b border-line px-4">
          <MagnifyingGlassIcon size={18} className="text-subtle" />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') onClose()
              else if (e.key === 'ArrowDown') {
                e.preventDefault()
                setActive((i) => Math.min(i + 1, items.length - 1))
              } else if (e.key === 'ArrowUp') {
                e.preventDefault()
                setActive((i) => Math.max(i - 1, 0))
              } else if (e.key === 'Enter') go(items[active])
            }}
            placeholder="Search companies, topics, or questions…"
            name="search"
            autoComplete="off"
            spellCheck={false}
            aria-label="Search companies, topics, or questions"
            role="combobox"
            aria-expanded="true"
            aria-controls="palette-list"
            aria-activedescendant={items[active] ? `pi-${active}` : undefined}
            className="h-14 flex-1 bg-transparent text-[15px] text-fg outline-none placeholder:text-subtle focus-visible:outline-none"
          />
          <kbd className="rounded border border-line bg-surface-2 px-1.5 tabular-nums text-[11px] text-subtle">Esc</kbd>
        </div>
        <ul id="palette-list" ref={listRef} role="listbox" className="max-h-[56vh] overflow-y-auto overscroll-contain p-2">
          {state.status !== 'ready' && <li className="px-3 py-6 text-center text-sm text-subtle">Loading dataset…</li>}
          {state.status === 'ready' && items.length === 0 && <li className="px-3 py-6 text-center text-sm text-subtle">No matches.</li>}
          {items.map((it, i) => (
            <li
              key={it.key}
              id={`pi-${i}`}
              data-index={i}
              role="option"
              aria-selected={i === active}
              onMouseEnter={() => setActive(i)}
              onClick={() => go(it)}
              className={'flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2.5 ' + (i === active ? 'bg-surface-2' : '')}
            >
              {it.kind === 'company' && state.status === 'ready' ? (
                <CompanyLogo company={state.atlas.companyBySlug.get(it.slug!)!} size={28} />
              ) : (
                <span className="grid size-7 shrink-0 place-items-center rounded-lg border border-line text-subtle">
                  {it.kind === 'topic' ? <HashIcon size={14} /> : <QuestionIcon size={14} />}
                </span>
              )}
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm text-fg">{it.label}</span>
                <span className="block truncate text-xs text-subtle">{it.hint}</span>
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}

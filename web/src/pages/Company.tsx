import { ArrowLeftIcon, ArrowUpRightIcon, BookmarkSimpleIcon, BriefcaseIcon, CheckCircleIcon, GraduationCapIcon, ListBulletsIcon, MagnifyingGlassIcon } from '@phosphor-icons/react'
import { useMemo, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { AuthGate } from '../components/AuthGate'
import { QuestionList, QuestionRow } from '../components/QuestionRow'
import { Chip, CompanyLogo, EmptyState } from '../components/ui'
import { useAccount } from '../lib/account'
import { TRACK_LABEL, byNewest, matchesText, useAtlas, useSortedTopics, type Company, type Question, type Track } from '../lib/data'
import { NotFound } from './NotFound'

type View = 'all' | 'bookmarked' | 'solved'

export function CompanyPage() {
  const { slug = '' } = useParams()
  const atlas = useAtlas()
  const company = atlas.companyBySlug.get(slug)
  if (!company) return <NotFound />
  return (
    <AuthGate title={`${company.name} interview questions`}>
      <CompanyView company={company} />
    </AuthGate>
  )
}

const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-')

function CompanyView({ company }: { company: Company }) {
  const atlas = useAtlas()
  const { bookmarks, solved } = useAccount()
  const [params, setParams] = useSearchParams()
  const all = atlas.bySlug.get(company.slug) ?? []

  const defaultTrack: Track = company.counts.intern > company.counts.fulltime ? 'intern' : 'fulltime'
  const track = (params.get('track') as Track) || defaultTrack
  const view = (params.get('view') as View) || 'all'
  const category = params.get('type') ?? ''
  const role = params.get('role') ?? ''
  const sort = params.get('sort') === 'reports' ? 'reports' : 'newest'
  const [text, setText] = useState('')

  const set = (patch: Record<string, string>) => {
    const next = new URLSearchParams(params)
    for (const [k, v] of Object.entries(patch)) v ? next.set(k, v) : next.delete(k)
    setParams(next, { replace: true })
  }

  const trackAll = useMemo(() => all.filter((q) => q.track === track), [all, track])
  const trackQs = useMemo(() => trackAll.filter((q) => q.kind === 'question'), [trackAll])
  const notesByRound = useMemo(() => {
    const m = new Map<string, Question[]>()
    for (const q of trackAll) if (q.kind === 'format') m.set(q.round, [...(m.get(q.round) ?? []), q])
    return m
  }, [trackAll])
  const roles = useMemo(() => {
    const m = new Map<string, number>()
    for (const q of trackQs) m.set(q.role, (m.get(q.role) ?? 0) + 1)
    return [...m.entries()].sort((a, b) => b[1] - a[1])
  }, [trackQs])

  const filtered = useMemo(
    () =>
      [...trackQs].sort(sort === 'newest' ? byNewest : (a, b) => b.reports - a.reports || (b.year ?? 0) - (a.year ?? 0)).filter(
        (q) =>
          (!category || q.category === category) &&
          (!role || q.role === role) &&
          (view === 'all' || (view === 'bookmarked' ? bookmarks.has(q.id) : solved.has(q.id))) &&
          matchesText(q, company.name, text),
      ),
    [trackQs, sort, category, role, view, bookmarks, solved, text, company],
  )
  const byRound = useMemo(() => {
    const m = new Map<string, Question[]>()
    for (const q of filtered) m.set(q.round, [...(m.get(q.round) ?? []), q])
    return [...m.entries()].sort((a, b) => (atlas.roundRank.get(a[0]) ?? 99) - (atlas.roundRank.get(b[0]) ?? 99))
  }, [filtered, atlas])
  const categories = useMemo(() => {
    const m = new Map<string, number>()
    for (const q of trackQs) m.set(q.category, (m.get(q.category) ?? 0) + 1)
    return [...m.entries()].sort((a, b) => b[1] - a[1])
  }, [trackQs])
  const topics = useSortedTopics(trackQs, 10)
  const processes = company.processes.filter((p) => p.track === track)
  const [procIdx, setProcIdx] = useState(0)
  const proc = processes[Math.min(procIdx, Math.max(0, processes.length - 1))]
  const nSaved = trackQs.filter((q) => bookmarks.has(q.id)).length
  const nSolved = trackQs.filter((q) => solved.has(q.id)).length

  return (
    <div className="pt-8">
      <Link to="/" className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-fg">
        <ArrowLeftIcon size={14} /> All companies
      </Link>

      <header className="mt-5 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <CompanyLogo company={company} size={56} />
          <div>
            <h1 className="text-3xl font-semibold tracking-[-0.015em] text-fg md:text-4xl">{company.name}</h1>
            <p className="mt-1 text-sm text-muted">
              {company.counts.intern} internship and {company.counts.fulltime} full-time questions from {company.sourceCount} candidate posts
            </p>
          </div>
        </div>
        <a href={`https://${company.domain}`} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-1 text-sm text-muted hover:text-accent-ink">
          Careers page <ArrowUpRightIcon size={12} />
        </a>
      </header>

      {/* Primary choice on this page: which hiring track. */}
      <div role="tablist" aria-label="Hiring track" className="mt-8 grid grid-cols-2 gap-2 sm:flex sm:gap-0 sm:border-b sm:border-line">
        {(
          [
            ['intern', GraduationCapIcon, 'Internship', company.counts.intern],
            ['fulltime', BriefcaseIcon, 'Full-time', company.counts.fulltime],
          ] as const
        ).map(([t, I, label, n]) => {
          const active = track === t
          return (
            <button
              key={t}
              role="tab"
              aria-selected={active}
              onClick={() => {
                setProcIdx(0)
                set({ track: t, role: '', view: '' })
              }}
              className={
                'flex items-center justify-center gap-2 rounded-xl border px-4 py-3 text-[15px] font-semibold transition-colors sm:-mb-px sm:justify-start sm:rounded-none sm:border-0 sm:border-b-2 sm:px-5 ' +
                (active ? 'border-accent bg-accent-soft text-accent-ink sm:bg-transparent' : 'border-line text-muted hover:text-fg sm:border-transparent')
              }
            >
              <I size={18} weight={active ? 'fill' : 'regular'} />
              {label}
              <span className="tabular-nums text-sm font-normal opacity-70">{n}</span>
            </button>
          )
        })}
      </div>

      <div className="grid gap-10 pt-8 lg:grid-cols-[minmax(0,1fr)_260px]">
        <div className="min-w-0 space-y-8">
          {proc && view === 'all' && (
            <section aria-labelledby="process-h" className="rounded-xl border border-line bg-surface p-5 shadow-panel">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 id="process-h" className="text-lg font-semibold tracking-[-0.015em] text-fg">
                    How the {TRACK_LABEL[track].toLowerCase()} process works
                  </h2>
                  <p className="mt-0.5 text-sm text-subtle">
                    {proc.role}
                    {proc.location ? `, ${proc.location}` : ''}
                  </p>
                </div>
                {processes.length > 1 && (
                  <label className="flex items-center gap-2 text-sm text-muted">
                    <span>Variant</span>
                    <select
                      value={procIdx}
                      onChange={(e) => setProcIdx(Number(e.target.value))}
                      className="h-8 max-w-56 rounded-lg border border-line bg-surface px-2 text-sm text-fg outline-none hover:border-line-strong focus-visible:border-accent"
                    >
                      {processes.map((p, i) => (
                        <option key={i} value={i}>
                          {p.role}
                          {p.location ? `, ${p.location}` : ''}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
              </div>
              <ol className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {proc.rounds.map((r, i) => (
                  <li key={i}>
                    <a href={`#round-${slugify(r.canonical)}`} className="flex h-full gap-3 rounded-lg border border-line p-3 transition-colors hover:border-accent-line hover:bg-accent-soft/50">
                      <span className="grid size-6 shrink-0 place-items-center rounded-full bg-accent tabular-nums text-xs text-accent-fg">{i + 1}</span>
                      <span className="min-w-0">
                        <span className="block text-sm font-semibold text-fg">{r.name}</span>
                        {r.description && <span className="mt-0.5 block text-sm leading-relaxed text-muted">{r.description}</span>}
                      </span>
                    </a>
                  </li>
                ))}
              </ol>
              <p className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-subtle">
                Based on
                {proc.sources.slice(0, 4).map((u, i) => (
                  <a key={u} href={u} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-0.5 underline-offset-2 hover:text-accent-ink hover:underline">
                    candidate post {i + 1} <ArrowUpRightIcon size={10} />
                  </a>
                ))}
              </p>
            </section>
          )}

          <div className="space-y-3">
            <div className="flex flex-col gap-3 md:flex-row md:items-center">
              <div role="tablist" aria-label="Show" className="grid shrink-0 grid-cols-3 rounded-lg border border-line bg-surface-2 p-0.5 md:inline-flex">
                {(
                  [
                    ['all', ListBulletsIcon, 'All questions', trackQs.length],
                    ['bookmarked', BookmarkSimpleIcon, 'Bookmarked', nSaved],
                    ['solved', CheckCircleIcon, 'Solved', nSolved],
                  ] as const
                ).map(([v, I, label, n]) => (
                  <button
                    key={v}
                    role="tab"
                    aria-selected={view === v}
                    onClick={() => set({ view: v === 'all' ? '' : v })}
                    className={'flex items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-sm font-medium transition-colors sm:px-3 ' + (view === v ? 'bg-surface text-fg shadow-panel' : 'text-muted hover:text-fg')}
                  >
                    <I size={15} weight={view === v ? 'fill' : 'regular'} />
                    {v === 'all' ? (
                      <>
                        <span className="sm:hidden">All</span>
                        <span className="hidden sm:inline">{label}</span>
                      </>
                    ) : (
                      label
                    )}
                    <span className="tabular-nums text-xs text-subtle">{n}</span>
                  </button>
                ))}
              </div>
              <label className="relative flex-1">
                <span className="sr-only">Search {company.name} questions</span>
                <MagnifyingGlassIcon size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-subtle" />
                <input
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  placeholder="Search these questions…"
                  name="filter"
                  autoComplete="off"
                  spellCheck={false}
                  className="h-9 w-full rounded-lg border border-line bg-surface pl-9 pr-3 text-sm text-fg outline-none transition-colors placeholder:text-subtle hover:border-line-strong focus-visible:border-accent focus-visible:ring-2 focus-visible:ring-accent/25"
                />
              </label>
              <label className="flex shrink-0 items-center gap-2">
                <span className="text-sm text-muted">Sort</span>
                <select
                  value={sort}
                  onChange={(e) => set({ sort: e.target.value === 'newest' ? '' : e.target.value })}
                  className="h-9 rounded-lg border border-line bg-surface px-2 text-sm text-fg outline-none hover:border-line-strong focus-visible:border-accent"
                >
                  <option value="newest">Newest first</option>
                  <option value="reports">Most reported</option>
                </select>
              </label>
              {roles.length > 1 && (
                <label className="flex shrink-0 items-center gap-2">
                  <span className="text-sm text-muted">Role</span>
                  <select
                    value={role}
                    onChange={(e) => set({ role: e.target.value })}
                    className="h-9 max-w-48 rounded-lg border border-line bg-surface px-2 text-sm text-fg outline-none hover:border-line-strong focus-visible:border-accent"
                  >
                    <option value="">All roles</option>
                    {roles.map(([r, n]) => (
                      <option key={r} value={r}>
                        {r} ({n})
                      </option>
                    ))}
                  </select>
                </label>
              )}
            </div>
            <div className="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0" role="group" aria-label="Question type">
              <span className="mr-1 self-center whitespace-nowrap text-xs font-medium text-subtle">Type</span>
              {[['', trackQs.length] as [string, number], ...categories].map(([c, n]) => (
                <button
                  key={c || 'all'}
                  onClick={() => set({ type: c })}
                  aria-pressed={category === c}
                  className={
                    'whitespace-nowrap rounded-full border px-3 py-1 text-xs font-medium transition-colors ' +
                    (category === c ? 'border-accent bg-accent text-accent-fg' : 'border-line bg-surface text-muted hover:border-line-strong hover:text-fg')
                  }
                >
                  {c || 'All types'} <span className="tabular-nums opacity-70">{n}</span>
                </button>
              ))}
            </div>
          </div>

          {filtered.length === 0 ? (
            view !== 'all' && !text && !category && !role ? (
              <EmptyState
                title={view === 'bookmarked' ? `No ${company.name} bookmarks yet` : `Nothing solved at ${company.name} yet`}
                body={
                  view === 'bookmarked'
                    ? 'Use the bookmark icon on a question to build your revision list for this company.'
                    : 'Open a question, solve it in the editor, and mark it solved.'
                }
                action={
                  <button onClick={() => set({ view: '' })} className="h-9 rounded-lg border border-line bg-surface px-3 text-sm font-medium text-fg hover:border-line-strong">
                    See all questions
                  </button>
                }
              />
            ) : (
              <EmptyState
                title={trackQs.length ? 'Nothing matches these filters' : `No ${TRACK_LABEL[track].toLowerCase()} questions yet`}
                body={trackQs.length ? 'Clear the search or choose another type or role.' : `We haven't found sourced ${TRACK_LABEL[track].toLowerCase()} questions for ${company.name} yet.`}
              />
            )
          ) : view !== 'all' ? (
            <QuestionList questions={filtered} />
          ) : (
            byRound.map(([round, qs]) => {
              const notes = notesByRound.get(round) ?? []
              return (
                <section key={round} id={`round-${slugify(round)}`} aria-labelledby={`h-${slugify(round)}`} className="scroll-mt-24">
                  <h2 id={`h-${slugify(round)}`} className="mb-3 flex items-baseline gap-2 text-lg font-semibold tracking-[-0.015em] text-fg">
                    {round}
                    <span className="tabular-nums text-sm font-normal text-subtle">{qs.length}</span>
                  </h2>
                  {notes.length > 0 && <RoundNotes notes={notes} />}
                  <div className="rounded-xl border border-line bg-surface px-4 shadow-panel sm:px-5">
                    {qs.map((q) => (
                      <QuestionRow key={q.id} q={q} showRound={false} />
                    ))}
                  </div>
                </section>
              )
            })
          )}
        </div>

        <aside className="space-y-8 lg:sticky lg:top-24 lg:self-start">
          <div className="rounded-xl border border-line bg-surface p-4">
            <p className="text-sm font-semibold text-fg">Your {TRACK_LABEL[track].toLowerCase()} progress</p>
            <p className="mt-2 tabular-nums text-2xl font-medium text-fg">
              {nSolved}
              <span className="text-base text-subtle"> / {trackQs.length}</span>
            </p>
            <p className="text-xs text-subtle">questions solved, {nSaved} bookmarked</p>
          </div>
          {byRound.length > 0 && view === 'all' && (
            <nav aria-label="Rounds">
              <p className="mb-2 text-sm font-semibold text-fg">Jump to round</p>
              <ul className="space-y-0.5">
                {byRound.map(([round, qs]) => (
                  <li key={round}>
                    <a href={`#round-${slugify(round)}`} className="flex items-center justify-between rounded-lg px-2.5 py-1.5 text-sm text-muted transition-colors hover:bg-surface-2 hover:text-fg">
                      {round}
                      <span className="tabular-nums text-xs text-subtle">{qs.length}</span>
                    </a>
                  </li>
                ))}
              </ul>
            </nav>
          )}
          {topics.length > 0 && (
            <div>
              <p className="mb-3 text-sm font-semibold text-fg">Most asked topics</p>
              <div className="flex flex-wrap gap-1.5">
                {topics.map(([t, n]) => (
                  <Chip key={t} to={`/topics/${encodeURIComponent(t)}`}>
                    {t} <span className="tabular-nums text-subtle">{n}</span>
                  </Chip>
                ))}
              </div>
            </div>
          )}
        </aside>
      </div>
    </div>
  )
}

function RoundNotes({ notes }: { notes: Question[] }) {
  const [open, setOpen] = useState(false)
  const shown = open ? notes : notes.slice(0, 2)
  return (
    <div className="mb-3 rounded-xl border border-accent-line/60 bg-accent-soft/60 px-4 py-3">
      <p className="text-xs font-semibold text-accent-ink">What candidates say about this round</p>
      <ul className="mt-1.5 space-y-1">
        {shown.map((n) => (
          <li key={n.id} className="text-sm leading-relaxed text-fg/85">
            {n.question}{' '}
            <a href={n.sources[0].url} target="_blank" rel="noreferrer noopener" className="text-xs text-subtle underline-offset-2 hover:text-accent-ink hover:underline">
              source
            </a>
          </li>
        ))}
      </ul>
      {notes.length > 2 && (
        <button onClick={() => setOpen((o) => !o)} className="mt-1.5 text-xs font-medium text-accent-ink hover:underline">
          {open ? 'Show fewer' : `Show ${notes.length - 2} more`}
        </button>
      )}
    </div>
  )
}

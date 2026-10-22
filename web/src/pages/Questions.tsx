import { FunnelSimpleIcon, MagnifyingGlassIcon, XIcon } from '@phosphor-icons/react'
import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { QuestionList } from '../components/QuestionRow'
import { EmptyState, Select } from '../components/ui'
import { TRACK_LABEL, byNewest, matchesText, useAtlas, type Question } from '../lib/data'
import { useAccount } from '../lib/account'

const KEYS = ['company', 'track', 'round', 'category', 'topic', 'difficulty', 'status'] as const
type Key = (typeof KEYS)[number]

export function QuestionsPage() {
  const atlas = useAtlas()
  const { bookmarks, solved } = useAccount()
  const [params, setParams] = useSearchParams()
  const [showFilters, setShowFilters] = useState(false)
  const f = Object.fromEntries(KEYS.map((k) => [k, params.get(k) ?? ''])) as Record<Key, string>
  const text = params.get('q') ?? ''
  const sort = params.get('sort') ?? 'newest'

  const set = (k: string, v: string) => {
    const next = new URLSearchParams(params)
    if (v) next.set(k, v)
    else next.delete(k)
    setParams(next, { replace: true })
  }

  // Each facet's counts reflect every other active filter, so options never lead to zero results.
  const passes = (q: Question, skip?: Key) =>
    (skip === 'company' || !f.company || q.company === f.company) &&
    (skip === 'track' || !f.track || q.track === f.track) &&
    (skip === 'round' || !f.round || q.round === f.round) &&
    (skip === 'category' || !f.category || q.category === f.category) &&
    (skip === 'topic' || !f.topic || q.topics.includes(f.topic)) &&
    (skip === 'difficulty' || !f.difficulty || q.difficulty === f.difficulty) &&
    (skip === 'status' ||
      !f.status ||
      (f.status === 'unsolved' ? !solved.has(q.id) : f.status === 'solved' ? solved.has(q.id) : bookmarks.has(q.id)))

  const textMatched = useMemo(
    () => atlas.questions.filter((q) => q.kind === 'question' && matchesText(q, atlas.companyBySlug.get(q.company)!.name, text)),
    [atlas, text],
  )

  const facet = (key: Key, get: (q: Question) => string | string[] | null) => {
    const m = new Map<string, number>()
    for (const q of textMatched) {
      if (!passes(q, key)) continue
      const v = get(q)
      for (const x of Array.isArray(v) ? v : v ? [v] : []) m.set(x, (m.get(x) ?? 0) + 1)
    }
    return m
  }

  const results = useMemo(() => {
    const r = textMatched.filter((q) => passes(q))
    if (sort === 'newest') r.sort(byNewest)
    else if (sort === 'company') r.sort((a, b) => a.company.localeCompare(b.company) || (atlas.roundRank.get(a.round) ?? 99) - (atlas.roundRank.get(b.round) ?? 99))
    else if (sort === 'reports') r.sort((a, b) => b.reports - a.reports || (b.year ?? 0) - (a.year ?? 0))
    return r
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [textMatched, params, bookmarks, solved])

  const companyFacet = facet('company', (q) => q.company)
  const trackFacet = facet('track', (q) => q.track)
  const roundFacet = facet('round', (q) => q.round)
  const catFacet = facet('category', (q) => q.category)
  const topicFacet = facet('topic', (q) => q.topics)
  const diffFacet = facet('difficulty', (q) => q.difficulty)

  const active = KEYS.filter((k) => f[k])
  const clearAll = () => setParams(text ? new URLSearchParams({ q: text }) : new URLSearchParams(), { replace: true })

  const filters = (
    <div className="grid gap-4">
      <Select
        label="Company"
        value={f.company}
        onChange={(v) => set('company', v)}
        options={atlas.companies.map((c) => ({ value: c.slug, label: c.name, count: companyFacet.get(c.slug) ?? 0 }))}
      />
      <Select
        label="Track"
        value={f.track}
        onChange={(v) => set('track', v)}
        options={(['intern', 'fulltime'] as const).map((t) => ({ value: t, label: TRACK_LABEL[t], count: trackFacet.get(t) ?? 0 }))}
      />
      <Select
        label="Round"
        value={f.round}
        onChange={(v) => set('round', v)}
        options={atlas.rounds.filter((r) => roundFacet.has(r) || r === f.round).map((r) => ({ value: r, label: r, count: roundFacet.get(r) ?? 0 }))}
      />
      <Select
        label="Type"
        value={f.category}
        onChange={(v) => set('category', v)}
        options={atlas.categories.filter((c) => catFacet.has(c) || c === f.category).map((c) => ({ value: c, label: c, count: catFacet.get(c) ?? 0 }))}
      />
      <Select
        label="Topic"
        value={f.topic}
        onChange={(v) => set('topic', v)}
        options={[...topicFacet.entries()]
          .sort((a, b) => b[1] - a[1])
          .map(([t, n]) => ({ value: t, label: t, count: n }))
          .concat(f.topic && !topicFacet.has(f.topic) ? [{ value: f.topic, label: f.topic, count: 0 }] : [])}
      />
      <Select
        label="Difficulty"
        value={f.difficulty}
        onChange={(v) => set('difficulty', v)}
        options={['Easy', 'Medium', 'Hard'].map((d) => ({ value: d, label: d, count: diffFacet.get(d) ?? 0 }))}
      />
      <Select
        label="My progress"
        value={f.status}
        onChange={(v) => set('status', v)}
        options={[
          { value: 'unsolved', label: 'Not solved yet' },
          { value: 'solved', label: 'Solved' },
          { value: 'saved', label: 'Bookmarked' },
        ]}
        allLabel="Any"
      />
    </div>
  )

  return (
    <div className="pt-10">
      <h1 className="text-3xl font-semibold tracking-[-0.015em] text-fg md:text-4xl">Question bank</h1>
      <p className="mt-2 max-w-[60ch] text-muted">Filter every sourced question across companies, rounds and topics. Filters live in the URL, so you can share a view.</p>

      <div className="mt-8 grid gap-8 lg:grid-cols-[230px_minmax(0,1fr)]">
        <aside className="hidden min-w-0 lg:block">
          <div className="sticky top-24">{filters}</div>
        </aside>

        <div className="min-w-0">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <label className="relative flex-1">
              <span className="sr-only">Search questions</span>
              <MagnifyingGlassIcon size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-subtle" />
              <input
                value={text}
                onChange={(e) => set('q', e.target.value)}
                placeholder="Search text, topic, company, or LeetCode slug…"
                name="q"
                autoComplete="off"
                spellCheck={false}
                className="h-10 w-full rounded-lg border border-line bg-surface pl-9 pr-3 text-sm text-fg outline-none transition-colors placeholder:text-subtle hover:border-line-strong focus-visible:border-accent focus-visible:ring-2 focus-visible:ring-accent/25"
              />
            </label>
            <div className="flex gap-2">
              <button
                onClick={() => setShowFilters((s) => !s)}
                aria-expanded={showFilters}
                className="flex h-10 items-center gap-2 rounded-lg border border-line bg-surface px-3 text-sm font-medium text-fg lg:hidden"
              >
                <FunnelSimpleIcon size={16} /> Filters {active.length > 0 && <span className="tabular-nums text-accent-ink">{active.length}</span>}
              </button>
              <label className="flex items-center gap-2">
                <span className="sr-only">Sort by</span>
                <select
                  value={sort}
                  onChange={(e) => set('sort', e.target.value === 'newest' ? '' : e.target.value)}
                  className="h-10 rounded-lg border border-line bg-surface px-2.5 text-sm text-fg outline-none hover:border-line-strong focus-visible:border-accent focus-visible:ring-2 focus-visible:ring-accent/25"
                >
                  <option value="newest">Newest first</option>
                  <option value="reports">Most reported</option>
                  <option value="company">By company</option>
                </select>
              </label>
            </div>
          </div>

          {showFilters && <div className="expand mt-4 rounded-xl border border-line bg-surface p-4 lg:hidden">{filters}</div>}

          <div className="mb-4 mt-5 flex flex-wrap items-center gap-2">
            <p className="mr-2 text-sm text-muted" aria-live="polite">
              <span className="tabular-nums text-fg">{results.length}</span> {results.length === 1 ? 'question' : 'questions'}
            </p>
            {active.map((k) => (
              <button
                key={k}
                onClick={() => set(k, '')}
                className="inline-flex items-center gap-1 rounded-full border border-accent-line bg-accent-soft px-2.5 py-0.5 text-xs font-medium text-accent-ink"
                aria-label={`Remove filter ${k}`}
              >
                {k === 'company' ? atlas.companyBySlug.get(f[k])?.name : k === 'track' ? TRACK_LABEL[f[k] as 'intern'] : f[k]}
                <XIcon size={12} />
              </button>
            ))}
            {active.length > 1 && (
              <button onClick={clearAll} className="text-xs font-medium text-muted underline underline-offset-2 hover:text-fg">
                Clear all
              </button>
            )}
          </div>

          {results.length ? (
            <QuestionList questions={results} showCompany={!f.company} />
          ) : (
            <EmptyState
              title="No questions match"
              body="Try removing a filter or searching for a broader term like a topic name."
              action={
                (active.length > 0 || text) && (
                  <button onClick={() => setParams(new URLSearchParams(), { replace: true })} className="h-9 rounded-lg border border-line bg-surface px-3 text-sm font-medium text-fg">
                    Reset everything
                  </button>
                )
              }
            />
          )}
        </div>
      </div>
    </div>
  )
}

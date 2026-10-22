import { ArrowLeftIcon, ArrowRightIcon } from '@phosphor-icons/react'
import { useMemo, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { QuestionList } from '../components/QuestionRow'
import { CompanyLogo, EmptyState, Segmented } from '../components/ui'
import { useAtlas, type Question, type Track } from '../lib/data'

const AREAS = [
  { id: 'dsa', label: 'Data structures and algorithms', cats: ['DSA'] },
  { id: 'ai', label: 'AI and machine learning', cats: ['AI/ML'] },
  { id: 'core', label: 'CS fundamentals', cats: ['CS Fundamentals', 'SQL'] },
  { id: 'design', label: 'Backend and system design', cats: ['Backend', 'System Design', 'LLD'] },
  { id: 'other', label: 'Behavioral, aptitude and projects', cats: ['Behavioral', 'Aptitude', 'Puzzles', 'Project'] },
] as const
type AreaId = (typeof AREAS)[number]['id']

interface TopicStat {
  topic: string
  total: number
  area: AreaId
  companies: [string, number][]
  diff: { Easy: number; Medium: number; Hard: number }
}

function useTopicStats(track: Track | '') {
  const atlas = useAtlas()
  return useMemo(() => {
    const byTopic = new Map<string, Question[]>()
    for (const q of atlas.questions) {
      if (q.kind !== 'question' || (track && q.track !== track)) continue
      for (const t of q.topics) byTopic.set(t, [...(byTopic.get(t) ?? []), q])
    }
    const stats: TopicStat[] = []
    for (const [topic, qs] of byTopic) {
      if (qs.length < 3) continue
      const catCount = new Map<string, number>()
      const comp = new Map<string, number>()
      const diff = { Easy: 0, Medium: 0, Hard: 0 }
      for (const q of qs) {
        catCount.set(q.category, (catCount.get(q.category) ?? 0) + 1)
        comp.set(q.company, (comp.get(q.company) ?? 0) + 1)
        if (q.difficulty) diff[q.difficulty]++
      }
      const topCat = [...catCount.entries()].sort((a, b) => b[1] - a[1])[0][0]
      const area = (AREAS.find((a) => (a.cats as readonly string[]).includes(topCat))?.id ?? 'other') as AreaId
      stats.push({ topic, total: qs.length, area, companies: [...comp.entries()].sort((a, b) => b[1] - a[1]), diff })
    }
    return stats.sort((a, b) => b.total - a.total)
  }, [atlas, track])
}

export function TopicsPage() {
  const [params, setParams] = useSearchParams()
  const tab = params.get('tab') === 'compare' ? 'compare' : 'browse'
  return (
    <div className="pt-10">
      <h1 className="text-3xl font-semibold tracking-[-0.015em] text-fg md:text-4xl">Topics</h1>
      <p className="mt-2 max-w-[62ch] text-muted">See which topics come up in interviews and which companies ask them most. Pick a topic to practise its questions.</p>
      <div role="tablist" aria-label="Topics view" className="mt-6 flex gap-1 border-b border-line">
        {(
          [
            ['browse', 'Browse topics'],
            ['compare', 'Compare companies'],
          ] as const
        ).map(([t, label]) => (
          <button
            key={t}
            role="tab"
            aria-selected={tab === t}
            onClick={() => setParams(t === 'browse' ? {} : { tab: t }, { replace: true })}
            className={'-mb-px border-b-2 px-4 py-2.5 text-sm font-semibold transition-colors ' + (tab === t ? 'border-accent text-fg' : 'border-transparent text-muted hover:text-fg')}
          >
            {label}
          </button>
        ))}
      </div>
      {tab === 'browse' ? <Browse /> : <Compare />}
    </div>
  )
}

function TrackPicker({ value, onChange }: { value: Track | ''; onChange: (v: Track | '') => void }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-sm text-muted">Hiring track</span>
      <Segmented
        label="Hiring track"
        value={value}
        onChange={onChange}
        options={[
          { value: '', label: 'Both' },
          { value: 'intern', label: 'Internship' },
          { value: 'fulltime', label: 'Full-time' },
        ]}
      />
    </div>
  )
}

function Browse() {
  const atlas = useAtlas()
  const [track, setTrack] = useState<Track | ''>('')
  const stats = useTopicStats(track)
  return (
    <div className="mt-6 space-y-12">
      <TrackPicker value={track} onChange={setTrack} />
      {AREAS.map((area) => {
        const list = stats.filter((s) => s.area === area.id)
        if (!list.length) return null
        return (
          <section key={area.id} aria-labelledby={`area-${area.id}`}>
            <h2 id={`area-${area.id}`} className="mb-4 text-lg font-semibold tracking-[-0.015em] text-fg">
              {area.label} <span className="tabular-nums text-sm font-normal text-subtle">{list.length} topics</span>
            </h2>
            <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {list.map((s) => (
                <li key={s.topic}>
                  <Link
                    to={`/topics/${encodeURIComponent(s.topic)}${track ? `?track=${track}` : ''}`}
                    className="group flex h-full flex-col rounded-xl border border-line bg-surface p-4 transition-[border-color,box-shadow,transform] hover:-translate-y-0.5 hover:border-accent-line hover:shadow-panel"
                  >
                    <div className="flex items-baseline justify-between gap-3">
                      <p className="font-semibold text-fg">{s.topic}</p>
                      <p className="shrink-0 text-sm text-muted">
                        <span className="tabular-nums text-fg">{s.total}</span> questions
                      </p>
                    </div>
                    <p className="mt-1 text-xs text-subtle">Asked at {s.companies.length} {s.companies.length === 1 ? 'company' : 'companies'}</p>
                    <div className="mt-3 flex items-center gap-1.5">
                      <span className="text-xs text-subtle">Most at</span>
                      {s.companies.slice(0, 4).map(([slug, n]) => {
                        const c = atlas.companyBySlug.get(slug)!
                        return (
                          <span key={slug} className="flex items-center gap-1 rounded-full border border-line py-0.5 pl-0.5 pr-2 text-xs text-muted" title={`${c.name}: ${n}`}>
                            <CompanyLogo company={c} size={18} />
                            <span className="tabular-nums">{n}</span>
                          </span>
                        )
                      })}
                    </div>
                    {s.diff.Easy + s.diff.Medium + s.diff.Hard > 0 && (
                      <p className="mt-auto pt-3 text-xs text-subtle">
                        <span className="text-easy">{s.diff.Easy} easy</span>, <span className="text-medium">{s.diff.Medium} medium</span>, <span className="text-hard">{s.diff.Hard} hard</span>
                      </p>
                    )}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )
      })}
    </div>
  )
}

function Compare() {
  const atlas = useAtlas()
  const [area, setArea] = useState<AreaId>('dsa')
  const [track, setTrack] = useState<Track | ''>('')
  const { topics, rows, max } = useMemo(() => {
    const cats = AREAS.find((a) => a.id === area)!.cats as readonly string[]
    const qs = atlas.questions.filter((q) => q.kind === 'question' && cats.includes(q.category) && (!track || q.track === track))
    const totals = new Map<string, number>()
    for (const q of qs) for (const t of q.topics) totals.set(t, (totals.get(t) ?? 0) + 1)
    const topics = [...totals.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12)
    const rows = atlas.companies
      .map((c) => {
        const cells = new Map<string, number>()
        let n = 0
        for (const q of qs) {
          if (q.company !== c.slug) continue
          n++
          for (const t of q.topics) cells.set(t, (cells.get(t) ?? 0) + 1)
        }
        return { c, cells, n }
      })
      .filter((r) => r.n > 0)
      .sort((a, b) => b.n - a.n)
    let max = 1
    for (const r of rows) for (const [t] of topics) max = Math.max(max, r.cells.get(t) ?? 0)
    return { topics, rows, max }
  }, [atlas, area, track])

  const shade = (v: number) => (v ? 0.14 + 0.86 * (v / max) : 0)

  return (
    <div className="mt-6">
      <div className="rounded-xl border border-line bg-surface-2/60 p-4 text-sm text-muted">
        <p className="font-semibold text-fg">How to read this table</p>
        <p className="mt-1 max-w-[80ch]">
          Each row is a company and each column a topic. The number in a cell is how many reported questions from that company involve the topic. Darker cells mean the topic comes up more
          often there. Select a number to open those questions.
        </p>
        <div className="mt-3 flex items-center gap-2 text-xs" aria-hidden>
          <span>Fewer</span>
          {[0.15, 0.35, 0.55, 0.75, 1].map((s) => (
            <span key={s} className="h-4 w-7 rounded" style={{ background: `color-mix(in oklab, var(--accent) ${Math.round(s * 100)}%, transparent)` }} />
          ))}
          <span>More</span>
        </div>
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-x-6 gap-y-3">
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted">Question type</span>
          <Segmented label="Question type" value={area} onChange={setArea} options={AREAS.filter((a) => a.id !== 'other').map((a) => ({ value: a.id, label: { dsa: 'DSA', ai: 'AI/ML', core: 'CS fundamentals', design: 'Backend and design' }[a.id as 'dsa'] }))} />
        </div>
        <TrackPicker value={track} onChange={setTrack} />
      </div>

      {rows.length === 0 ? (
        <div className="mt-6">
          <EmptyState title="No data for this combination" body="Try the other track or question type." />
        </div>
      ) : (
        <div className="mt-5 overflow-x-auto rounded-xl border border-line bg-surface shadow-panel">
          <table className="w-full border-collapse text-sm">
            <caption className="sr-only">Number of reported questions per topic and company</caption>
            <thead>
              <tr className="border-b border-line">
                <th scope="col" className="sticky left-0 z-10 min-w-48 bg-surface px-4 py-3 text-left align-bottom text-xs font-medium text-muted">
                  Company <span className="font-normal text-subtle">(questions)</span>
                </th>
                {topics.map(([t]) => (
                  <th key={t} scope="col" className="min-w-[4.5rem] px-1 py-3 align-bottom">
                    <Link to={`/topics/${encodeURIComponent(t)}`} className="block text-center text-xs font-medium leading-tight text-fg hover:text-accent-ink">
                      {t}
                    </Link>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map(({ c, cells, n }) => (
                <tr key={c.slug} className="border-t border-line hover:bg-surface-2/60">
                  <th scope="row" className="sticky left-0 z-10 bg-surface px-4 py-1.5 text-left font-normal">
                    <Link to={`/company/${c.slug}`} className="flex items-center gap-2.5 whitespace-nowrap text-fg hover:text-accent-ink">
                      <CompanyLogo company={c} size={24} />
                      {c.name}
                      <span className="tabular-nums text-xs text-subtle">{n}</span>
                    </Link>
                  </th>
                  {topics.map(([t]) => {
                    const v = cells.get(t) ?? 0
                    const s = shade(v)
                    return (
                      <td key={t} className="p-0.5 text-center">
                        {v ? (
                          <Link
                            to={`/questions?company=${c.slug}&topic=${encodeURIComponent(t)}${track ? `&track=${track}` : ''}`}
                            className="mx-auto grid h-8 w-full max-w-16 place-items-center rounded-md tabular-nums text-xs transition-transform hover:scale-105"
                            style={{ background: `color-mix(in oklab, var(--accent) ${Math.round(s * 100)}%, transparent)`, color: s > 0.5 ? 'var(--accent-fg)' : 'var(--fg)' }}
                            aria-label={`${c.name}, ${t}: ${v} questions`}
                          >
                            {v}
                          </Link>
                        ) : (
                          <span className="grid h-8 place-items-center text-xs text-line-strong" aria-label={`${c.name}, ${t}: none`}>
                            ·
                          </span>
                        )}
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="mt-3 text-xs text-subtle">Counts reflect what candidates chose to post, not an official syllabus. Companies with more public write-ups show higher numbers.</p>
    </div>
  )
}

export function TopicPage() {
  const { topic = '' } = useParams()
  const atlas = useAtlas()
  const [params, setParams] = useSearchParams()
  const track = (params.get('track') as Track) || ''
  const difficulty = params.get('difficulty') ?? ''
  const setParam = (k: string, v: string) => {
    const next = new URLSearchParams(params)
    if (v) next.set(k, v)
    else next.delete(k)
    setParams(next, { replace: true })
  }
  const all = useMemo(() => atlas.questions.filter((q) => q.kind === 'question' && q.topics.includes(topic)), [atlas, topic])
  const inTrack = useMemo(() => all.filter((q) => !track || q.track === track), [all, track])
  const qs = useMemo(() => inTrack.filter((q) => !difficulty || q.difficulty === difficulty).sort((a, b) => b.reports - a.reports), [inTrack, difficulty])
  const companies = useMemo(() => {
    const m = new Map<string, number>()
    for (const q of qs) m.set(q.company, (m.get(q.company) ?? 0) + 1)
    return [...m.entries()].sort((a, b) => b[1] - a[1])
  }, [qs])

  if (!all.length) {
    return (
      <div className="mx-auto max-w-xl pt-24">
        <EmptyState title={`No questions tagged “${topic}”`} body="The topic may have been renamed. Browse all topics instead." />
      </div>
    )
  }
  const maxC = companies[0]?.[1] ?? 1
  return (
    <div className="pt-8">
      <Link to="/topics" className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-fg">
        <ArrowLeftIcon size={14} /> All topics
      </Link>
      <header className="mt-5 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-3xl font-semibold tracking-[-0.015em] text-fg md:text-4xl">{topic}</h1>
          <p className="mt-1 text-muted">
            {qs.length} questions from {companies.length} companies
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-4">
          <label className="flex items-center gap-2">
            <span className="text-sm text-muted">Difficulty</span>
            <select
              value={difficulty}
              onChange={(e) => setParam('difficulty', e.target.value)}
              className="h-9 rounded-lg border border-line bg-surface px-2 text-sm text-fg outline-none hover:border-line-strong focus-visible:border-accent"
            >
              <option value="">All</option>
              {(['Easy', 'Medium', 'Hard'] as const).map((d) => (
                <option key={d} value={d}>
                  {d} ({inTrack.filter((q) => q.difficulty === d).length})
                </option>
              ))}
            </select>
          </label>
          <TrackPicker value={track} onChange={(v) => setParam('track', v)} />
        </div>
      </header>
      <div className="mt-8 grid gap-10 lg:grid-cols-[minmax(0,1fr)_280px]">
        <div className="min-w-0">
          {qs.length ? <QuestionList questions={qs} showCompany /> : <EmptyState title="Nothing matches" body="Switch the hiring track or difficulty to see more." />}
        </div>
        <aside className="lg:sticky lg:top-24 lg:self-start">
          <p className="mb-3 text-sm font-semibold text-fg">Companies asking {topic}</p>
          <ul className="space-y-1">
            {companies.slice(0, 15).map(([slug, n]) => {
              const c = atlas.companyBySlug.get(slug)!
              return (
                <li key={slug}>
                  <Link to={`/company/${slug}`} className="group flex items-center gap-2.5 rounded-lg px-2 py-1.5 hover:bg-surface-2">
                    <CompanyLogo company={c} size={24} />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center justify-between text-sm text-fg">
                        <span className="truncate">{c.name}</span>
                        <span className="tabular-nums text-xs text-subtle">{n}</span>
                      </span>
                      <span className="mt-1 block h-1 rounded-full bg-accent/80" style={{ width: `${Math.max(6, (n / maxC) * 100)}%` }} />
                    </span>
                    <ArrowRightIcon size={12} className="text-subtle opacity-0 group-hover:opacity-100" />
                  </Link>
                </li>
              )
            })}
          </ul>
        </aside>
      </div>
    </div>
  )
}

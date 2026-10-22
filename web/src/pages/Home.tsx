import { ArrowRightIcon, MagnifyingGlassIcon } from '@phosphor-icons/react'
import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { CompanyLogo, Segmented } from '../components/ui'
import { useAtlas, type Track } from '../lib/data'

const POPULAR = ['amazon', 'google', 'microsoft', 'goldman-sachs', 'flipkart', 'tcs']
const CYCLE = ['Google', 'Amazon', 'Microsoft', 'Adobe', 'Flipkart', 'Uber', 'Zoho']

/** Swaps the company name every couple of seconds; stays still for reduced-motion users. */
function CyclingWord({ words }: { words: string[] }) {
  const [i, setI] = useState(0)
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const t = window.setInterval(() => setI((n) => (n + 1) % words.length), 2200)
    return () => window.clearInterval(t)
  }, [words.length])
  return (
    <span key={i} className="word-in inline-block" aria-live="off">
      {words[i]}
    </span>
  )
}

export function Home() {
  const atlas = useAtlas()
  const [track, setTrack] = useState<Track | 'all'>('all')
  const [group, setGroup] = useState('')
  const [query, setQuery] = useState('')
  const groups = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return atlas.groups
      .filter((g) => !group || g === group)
      .map((g) => ({ name: g, companies: atlas.companies.filter((c) => c.group === g && (!needle || c.name.toLowerCase().includes(needle))) }))
      .filter((g) => g.companies.length)
  }, [atlas, group, query])

  return (
    <>
      <section className="relative isolate -mx-4 overflow-x-clip px-4 pb-20 pt-14 text-center sm:-mx-6 sm:px-6 md:pb-24 md:pt-20">
        <p
          className="enter inline-flex items-center gap-2 rounded-full border border-line bg-surface/70 px-4 py-1.5 text-sm text-muted backdrop-blur"
        >
          <span className="tabular-nums font-semibold text-fg">{atlas.stats.questions.toLocaleString()}</span> real questions from
          <span className="tabular-nums font-semibold text-fg">{atlas.stats.companies}</span> companies
        </p>
        <h1 className="mx-auto mt-7 max-w-4xl text-[2.4rem] font-medium leading-[1.06] tracking-[-0.04em] text-fg sm:text-5xl md:text-6xl lg:text-[4.1rem]">
          <span className="line-mask">
            <span className="line-rise" style={{ ['--i' as string]: 0 }}>
              Know every round.
            </span>
          </span>
          <span className="line-mask">
            <span className="line-rise text-accent-ink" style={{ ['--i' as string]: 1 }}>
              Get placed at <CyclingWord words={CYCLE} />.
            </span>
          </span>
        </h1>
        <p className="enter mx-auto mt-6 max-w-[54ch] text-[15px] leading-relaxed text-muted md:text-base" style={{ ['--i' as string]: 6 }}>
          Real interview questions from {atlas.stats.companies} companies, sorted by round for internships and full‑time roles. Read what was asked, then solve it in the built‑in editor.
        </p>
        <div className="enter mt-8 flex flex-wrap items-center justify-center gap-3" style={{ ['--i' as string]: 8 }}>
          <a
            href="#companies"
            className="group inline-flex h-12 items-center gap-2 rounded-full bg-fg px-7 text-[13px] font-bold uppercase tracking-[0.08em] text-bg transition-[transform,box-shadow] hover:-translate-y-0.5 hover:shadow-[0_10px_30px_-10px_var(--accent)] active:translate-y-0"
          >
            Start practising
            <ArrowRightIcon size={16} weight="bold" className="transition-transform group-hover:translate-x-1" />
          </a>
          <Link
            to="/topics"
            className="inline-flex h-12 items-center rounded-full border border-fg/80 px-7 text-[13px] font-bold uppercase tracking-[0.08em] text-fg transition-[background-color,color,transform] hover:-translate-y-0.5 hover:bg-fg hover:text-bg active:translate-y-0"
          >
            Explore topics
          </Link>
        </div>
      </section>

      <section id="companies" aria-labelledby="companies-h" className="scroll-mt-28 border-t border-line pt-14">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h2 id="companies-h" className="text-2xl font-semibold tracking-[-0.015em] text-fg">
              Choose a company
            </h2>
            <p className="mt-1 text-sm text-muted">Each company page splits questions into internship and full-time, round by round.</p>
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <span className="mr-1 text-sm text-subtle">Popular</span>
              {POPULAR.map((slug) => {
                const c = atlas.companyBySlug.get(slug)
                if (!c) return null
                return (
                  <Link
                    key={slug}
                    to={`/company/${slug}`}
                    className="flex items-center gap-2 rounded-full border border-line bg-surface py-1 pl-1 pr-3 text-sm font-medium text-fg transition-[border-color,transform] hover:-translate-y-px hover:border-accent-line"
                  >
                    <CompanyLogo company={c} size={22} />
                    {c.name}
                  </Link>
                )
              })}
            </div>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <label className="relative">
              <span className="sr-only">Find a company</span>
              <MagnifyingGlassIcon size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-subtle" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Find a company…"
                name="company"
                autoComplete="off"
                spellCheck={false}
                className="h-9 w-full rounded-lg border border-line bg-surface pl-9 pr-3 text-sm text-fg outline-none placeholder:text-subtle hover:border-line-strong focus-visible:border-accent focus-visible:ring-2 focus-visible:ring-accent/25 sm:w-56"
              />
            </label>
            <Segmented
              label="Count questions for"
              value={track}
              onChange={setTrack}
              options={[
                { value: 'all', label: 'All' },
                { value: 'intern', label: 'Internship' },
                { value: 'fulltime', label: 'Full-time' },
              ]}
            />
          </div>
        </div>
        <div className="-mx-4 mt-5 flex gap-1.5 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0" role="group" aria-label="Company group">
          {['', ...atlas.groups].map((g) => (
            <button
              key={g || 'all'}
              onClick={() => setGroup(g)}
              aria-pressed={group === g}
              className={
                'whitespace-nowrap rounded-full border px-3 py-1 text-sm font-medium transition-colors ' +
                (group === g ? 'border-accent bg-accent text-accent-fg' : 'border-line bg-surface text-muted hover:border-line-strong hover:text-fg')
              }
            >
              {g || 'All companies'}
            </button>
          ))}
        </div>

        <div className="mt-8 space-y-12">
          {groups.length === 0 && <p className="text-sm text-muted">No company matches “{query}”.</p>}
          {groups.map((g) => (
            <div key={g.name}>
              <h3 className="mb-4 text-sm font-semibold text-muted">
                {g.name} <span className="tabular-nums font-normal text-subtle">{g.companies.length}</span>
              </h3>
              <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {g.companies.map((c) => {
                  const n = track === 'all' ? c.counts.total : c.counts[track]
                  return (
                    <li key={c.slug} className="reveal">
                      <Link
                        to={`/company/${c.slug}${track === 'all' ? '' : `?track=${track}`}`}
                        className="group flex h-full flex-col rounded-xl border border-line bg-surface p-4 transition-[border-color,box-shadow,transform] hover:-translate-y-0.5 hover:border-accent-line hover:shadow-panel active:translate-y-0"
                      >
                        <div className="flex items-center gap-3">
                          <CompanyLogo company={c} />
                          <div className="min-w-0 flex-1">
                            <p className="truncate font-semibold text-fg">{c.name}</p>
                            <p className="text-sm text-subtle">
                              <span className="tabular-nums text-fg">{n}</span> questions
                            </p>
                          </div>
                          <ArrowRightIcon size={16} className="text-subtle transition-transform group-hover:translate-x-0.5 group-hover:text-accent-ink" />
                        </div>
                        <p className="mt-3 flex gap-3 text-xs text-subtle">
                          <span>
                            Internship <span className="tabular-nums text-muted">{c.counts.intern}</span>
                          </span>
                          <span>
                            Full-time <span className="tabular-nums text-muted">{c.counts.fulltime}</span>
                          </span>
                        </p>
                      </Link>
                    </li>
                  )
                })}
              </ul>
            </div>
          ))}
        </div>
      </section>
    </>
  )
}


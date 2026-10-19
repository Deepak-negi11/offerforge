import {
  ArrowSquareOutIcon,
  ArrowUpRightIcon,
  BookmarkSimpleIcon,
  CaretRightIcon,
  CheckCircleIcon,
  CodeIcon,
  NotePencilIcon,
} from '@phosphor-icons/react'
import { useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { AuthGate } from '../components/AuthGate'
import { CodePanel } from '../components/CodePanel'
import { NotesPanel } from '../components/NotesPanel'
import { Chip, CompanyLogo, Difficulty } from '../components/ui'
import { useAccount } from '../lib/account'
import { PLATFORM_LABEL, TRACK_LABEL, isCoding, useAtlas, type Question } from '../lib/data'
import { NotFound } from './NotFound'

export function WorkspacePage() {
  const { id } = useParams()
  const atlas = useAtlas()
  const q = atlas.questions.find((x) => x.id === id)
  if (!q) return <NotFound />
  return (
    <AuthGate title={`"${q.title}"`}>
      <Workspace q={q} key={q.id} />
    </AuthGate>
  )
}

function Workspace({ q }: { q: Question }) {
  const atlas = useAtlas()
  const company = atlas.companyBySlug.get(q.company)!
  const [mode, setMode] = useState<'code' | 'notes'>(isCoding(q) ? 'code' : 'notes')
  const [mobileTab, setMobileTab] = useState<'question' | 'solve'>('question')
  const [left, setLeft] = useState(42)
  const dragging = useRef(false)
  const wrap = useRef<HTMLDivElement>(null)

  useEffect(() => {
    document.title = `${q.title} - ${company.name} | OfferForge`
    return () => {
      document.title = 'OfferForge'
    }
  }, [q, company])

  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragging.current || !wrap.current) return
    const r = wrap.current.getBoundingClientRect()
    setLeft(Math.min(65, Math.max(28, ((e.clientX - r.left) / r.width) * 100)))
  }

  const solvePane = (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center gap-1 border-b border-line bg-surface-2/60 px-2 py-1.5" role="tablist" aria-label="Answer mode">
        {(
          [
            ['code', 'Code editor', CodeIcon],
            ['notes', 'Written answer', NotePencilIcon],
          ] as const
        ).map(([m, label, I]) => (
          <button
            key={m}
            role="tab"
            aria-selected={mode === m}
            onClick={() => setMode(m)}
            className={'flex items-center gap-1.5 rounded-md px-2.5 py-1 text-sm font-medium transition-colors ' + (mode === m ? 'bg-surface text-fg shadow-panel' : 'text-muted hover:text-fg')}
          >
            <I size={15} /> {label}
          </button>
        ))}
      </div>
      <div className="min-h-0 flex-1">{mode === 'code' ? <CodePanel questionId={q.id} /> : <NotesPanel questionId={q.id} category={q.category} />}</div>
    </div>
  )

  return (
    <div className="flex h-[calc(100dvh-var(--header-h)-1px)] flex-col">
      <div className="flex border-b border-line lg:hidden" role="tablist" aria-label="Workspace">
        {(['question', 'solve'] as const).map((t) => (
          <button
            key={t}
            role="tab"
            aria-selected={mobileTab === t}
            onClick={() => setMobileTab(t)}
            className={'-mb-px flex-1 border-b-2 py-3 text-sm font-medium ' + (mobileTab === t ? 'border-accent text-fg' : 'border-transparent text-muted')}
          >
            {t === 'question' ? 'Question' : 'Solve'}
          </button>
        ))}
      </div>

      <div
        ref={wrap}
        className="relative flex min-h-0 flex-1"
        onPointerMove={onPointerMove}
        onPointerUp={() => (dragging.current = false)}
        onPointerLeave={() => (dragging.current = false)}
      >
        <section
          aria-label="Question"
          className={'min-h-0 overflow-y-auto lg:block ' + (mobileTab === 'question' ? 'block w-full' : 'hidden')}
          style={{ flexBasis: `${left}%` }}
        >
          <QuestionDetail q={q} />
        </section>
        <div
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize panels"
          tabIndex={0}
          onPointerDown={(e) => {
            dragging.current = true
            e.currentTarget.setPointerCapture(e.pointerId)
          }}
          onKeyDown={(e) => {
            if (e.key === 'ArrowLeft') setLeft((l) => Math.max(28, l - 3))
            if (e.key === 'ArrowRight') setLeft((l) => Math.min(65, l + 3))
          }}
          className="group hidden w-2 shrink-0 cursor-col-resize items-stretch justify-center lg:flex"
        >
          <span className="w-px bg-line transition-colors group-hover:bg-accent group-focus-visible:bg-accent" />
        </div>
        <section aria-label="Solve" className={'min-h-0 min-w-0 flex-1 lg:block ' + (mobileTab === 'solve' ? 'block' : 'hidden')}>
          {solvePane}
        </section>
      </div>
    </div>
  )
}

function QuestionDetail({ q }: { q: Question }) {
  const atlas = useAtlas()
  const { bookmarks, solved, toggle } = useAccount()
  const company = atlas.companyBySlug.get(q.company)!
  const alsoAt = q.leetcodeSlug ? [...new Set((atlas.byLeetcode.get(q.leetcodeSlug) ?? []).map((x) => x.company).filter((c) => c !== q.company))] : []
  const sameRound = (atlas.bySlug.get(q.company) ?? []).filter((x) => x.id !== q.id && x.kind === 'question' && x.track === q.track && x.round === q.round).slice(0, 6)
  const isSolved = solved.has(q.id)
  const isSaved = bookmarks.has(q.id)

  return (
    <div className="mx-auto max-w-2xl px-5 py-6 lg:px-8">
      <nav aria-label="Breadcrumb" className="flex flex-wrap items-center gap-1 text-sm text-muted">
        <Link to={`/company/${company.slug}`} className="flex items-center gap-2 hover:text-fg">
          <CompanyLogo company={company} size={22} />
          {company.name}
        </Link>
        <CaretRightIcon size={12} className="text-subtle" />
        <Link to={`/company/${company.slug}?track=${q.track}`} className="hover:text-fg">
          {TRACK_LABEL[q.track]}
        </Link>
        <CaretRightIcon size={12} className="text-subtle" />
        <span className="text-fg">{q.round}</span>
      </nav>

      <h1 className="mt-4 text-2xl font-semibold leading-tight tracking-[-0.015em] text-fg">{q.title}</h1>

      <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-3 rounded-xl border border-line bg-surface-2/50 p-4 text-sm sm:grid-cols-3">
        <Fact label="Type" value={q.category} />
        <Fact label="Level" value={q.difficulty ? <Difficulty value={q.difficulty} /> : 'Not reported'} />
        <Fact label="Role" value={q.role} />
        <Fact label="Track" value={TRACK_LABEL[q.track]} />
        <Fact label="Reported" value={`${q.reports} ${q.reports === 1 ? 'time' : 'times'}${q.year ? `, latest ${q.year}` : ''}`} />
        <Fact label="Location" value={q.location ?? 'Not stated'} />
      </dl>

      {q.topics.length > 0 && (
        <div className="mt-4 flex flex-wrap items-center gap-1.5">
          <span className="mr-1 text-xs font-medium text-subtle">Topics</span>
          {q.topics.map((t) => (
            <Chip key={t} tone="accent" to={`/topics/${encodeURIComponent(t)}`}>
              {t}
            </Chip>
          ))}
        </div>
      )}

      <section className="mt-6">
        <h2 className="text-sm font-semibold text-fg">The question</h2>
        <p className="mt-2 text-[15px] leading-relaxed text-fg/90">{q.question}</p>
        <p className="mt-2 text-xs text-subtle">
          {q.verified
            ? 'Verified: we re-checked the source page and found this question in the candidate\'s post. '
            : ''}
          Paraphrased from the candidate's report. Open a source below for the full context and any examples.
        </p>
      </section>

      <div className="mt-5 flex flex-wrap gap-2">
        <button
          onClick={() => toggle('solved', q.id)}
          aria-pressed={isSolved}
          className={'flex h-9 items-center gap-1.5 rounded-lg border px-3 text-sm font-medium transition-[background-color,border-color,transform] active:scale-[0.98] ' + (isSolved ? 'border-easy/40 bg-easy/10 text-easy' : 'border-line bg-surface text-fg hover:border-line-strong')}
        >
          <CheckCircleIcon size={16} weight={isSolved ? 'fill' : 'regular'} /> {isSolved ? 'Solved' : 'Mark solved'}
        </button>
        <button
          onClick={() => toggle('bookmarks', q.id)}
          aria-pressed={isSaved}
          className={'flex h-9 items-center gap-1.5 rounded-lg border px-3 text-sm font-medium transition-[background-color,border-color,transform] active:scale-[0.98] ' + (isSaved ? 'border-accent-line bg-accent-soft text-accent-ink' : 'border-line bg-surface text-fg hover:border-line-strong')}
        >
          <BookmarkSimpleIcon size={16} weight={isSaved ? 'fill' : 'regular'} /> {isSaved ? 'Bookmarked' : 'Bookmark'}
        </button>
        {q.leetcodeSlug && (
          <a
            href={`https://leetcode.com/problems/${q.leetcodeSlug}/`}
            target="_blank"
            rel="noreferrer noopener"
            className="flex h-9 items-center gap-1.5 rounded-lg border border-line bg-surface px-3 text-sm font-medium text-fg hover:border-line-strong"
          >
            Open on LeetCode <ArrowSquareOutIcon size={14} />
          </a>
        )}
      </div>

      <section className="mt-8">
        <h2 className="text-sm font-semibold text-fg">Reported in</h2>
        <ul className="mt-2 divide-y divide-line rounded-xl border border-line">
          {q.sources.map((s) => (
            <li key={s.url}>
              <a href={s.url} target="_blank" rel="noreferrer noopener" className="flex items-center gap-3 px-3 py-2.5 text-sm hover:bg-surface-2">
                <span className="min-w-0 flex-1 truncate text-fg">{s.title || new URL(s.url).hostname}</span>
                <span className="shrink-0 text-xs text-subtle">{s.platform === 'blog' ? new URL(s.url).hostname.replace(/^www\./, '') : PLATFORM_LABEL[s.platform]}</span>
                <ArrowUpRightIcon size={12} className="shrink-0 text-subtle" />
              </a>
            </li>
          ))}
        </ul>
      </section>

      {alsoAt.length > 0 && (
        <section className="mt-8">
          <h2 className="text-sm font-semibold text-fg">Also reported at</h2>
          <div className="mt-2 flex flex-wrap gap-2">
            {alsoAt.map((slug) => {
              const c = atlas.companyBySlug.get(slug)!
              return (
                <Link key={slug} to={`/company/${slug}`} className="flex items-center gap-2 rounded-lg border border-line px-2.5 py-1.5 text-sm text-fg hover:border-line-strong">
                  <CompanyLogo company={c} size={20} /> {c.name}
                </Link>
              )
            })}
          </div>
        </section>
      )}

      {sameRound.length > 0 && (
        <section className="mt-8 pb-6">
          <h2 className="text-sm font-semibold text-fg">More from this round</h2>
          <ul className="mt-2 space-y-1">
            {sameRound.map((x) => (
              <li key={x.id}>
                <Link to={`/q/${x.id}`} className="flex items-center justify-between gap-3 rounded-lg px-2 py-1.5 text-sm text-muted hover:bg-surface-2 hover:text-fg">
                  <span className="truncate">{x.title}</span>
                  <span className="shrink-0 text-xs text-subtle">{x.category}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}

function Fact({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-subtle">{label}</dt>
      <dd className="mt-0.5 truncate font-medium text-fg">{value}</dd>
    </div>
  )
}

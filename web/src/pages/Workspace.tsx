import {
  ArrowRightIcon,
  ArrowSquareOutIcon,
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
import { Markdown } from '../components/Markdown'
import { Chip, CompanyLogo, Difficulty } from '../components/ui'
import { useAccount } from '../lib/account'
import { LEVELS, TRACK_LABEL, byNewest, isCoding, useAtlas, useDetail, useProblem, type AtlasIndex, type Detail, type Problem, type Question } from '../lib/data'
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
  const { solved, toggle } = useAccount()
  const { problem } = useProblem(q)
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
      <div className="min-h-0 flex-1">{mode === 'code' ? <CodePanel questionId={q.id} problem={problem} onAccepted={() => !solved.has(q.id) && toggle('solved', q.id)} /> : <NotesPanel questionId={q.id} category={q.category} />}</div>
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
          className={'min-h-0 overflow-y-auto lg:block lg:shrink-0 lg:basis-(--left) ' + (mobileTab === 'question' ? 'block w-full' : 'hidden')}
          style={{ ['--left' as string]: `${left}%` }}
        >
          <QuestionDetail q={q} problem={problem} />
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

function QuestionDetail({ q, problem }: { q: Question; problem: Problem | null }) {
  const atlas = useAtlas()
  const { bookmarks, solved, toggle } = useAccount()
  const company = atlas.companyBySlug.get(q.company)!
  const alsoAt = q.leetcodeSlug ? [...new Set((atlas.byLeetcode.get(q.leetcodeSlug) ?? []).map((x) => x.company).filter((c) => c !== q.company))] : []
  const detail = useDetail(q)
  const similar = similarQuestions(atlas, q)
  const next = nextQuestion(atlas, q)
  const isSolved = solved.has(q.id)
  const isSaved = bookmarks.has(q.id)

  return (
    <div className="mx-auto max-w-2xl px-5 py-6 lg:px-8">
      <div className="flex items-center justify-between gap-3">
        <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-1 text-sm text-muted">
          <Link to={`/company/${company.slug}`} className="flex shrink-0 items-center gap-2 hover:text-fg">
            <CompanyLogo company={company} size={22} />
            {company.name}
          </Link>
          <CaretRightIcon size={12} className="shrink-0 text-subtle" />
          <Link to={`/company/${company.slug}?track=${q.track}`} className="shrink-0 hover:text-fg">
            {TRACK_LABEL[q.track]}
          </Link>
          <CaretRightIcon size={12} className="shrink-0 text-subtle" />
          <span className="truncate text-fg">{q.round}</span>
        </nav>
        <div className="flex shrink-0 items-center gap-1.5">
          <button
            onClick={() => toggle('solved', q.id)}
            aria-pressed={isSolved}
            aria-label={isSolved ? 'Solved. Click to unmark' : 'Mark solved'}
            title={isSolved ? 'Solved' : 'Mark solved'}
            className={'grid size-9 place-items-center rounded-lg border transition-[background-color,border-color,transform] active:scale-[0.96] ' + (isSolved ? 'border-easy/40 bg-easy/10 text-easy' : 'border-line bg-surface text-muted hover:border-line-strong hover:text-fg')}
          >
            <CheckCircleIcon size={18} weight={isSolved ? 'fill' : 'regular'} />
          </button>
          <button
            onClick={() => toggle('bookmarks', q.id)}
            aria-pressed={isSaved}
            aria-label={isSaved ? 'Bookmarked. Click to remove' : 'Bookmark'}
            title={isSaved ? 'Bookmarked' : 'Bookmark'}
            className={'grid size-9 place-items-center rounded-lg border transition-[background-color,border-color,transform] active:scale-[0.96] ' + (isSaved ? 'border-accent-line bg-accent-soft text-accent-ink' : 'border-line bg-surface text-muted hover:border-line-strong hover:text-fg')}
          >
            <BookmarkSimpleIcon size={18} weight={isSaved ? 'fill' : 'regular'} />
          </button>
          {isSolved && next && (
            <Link
              to={`/q/${next.id}`}
              title={`Next: ${next.title}`}
              className="flex h-9 items-center gap-1.5 rounded-lg bg-accent px-3 text-sm font-medium text-accent-fg transition-transform active:scale-[0.98]"
            >
              Next <ArrowRightIcon size={14} />
            </Link>
          )}
        </div>
      </div>

      <h1 className="mt-4 text-2xl font-semibold leading-tight tracking-[-0.015em] text-fg">{q.title}</h1>

      <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-3 rounded-xl border border-line bg-surface-2/50 p-4 text-sm sm:grid-cols-3">
        <Fact label="Type" value={q.category} />
        <Fact label="Difficulty" value={q.difficulty ? <Difficulty value={q.difficulty} /> : 'Not reported'} />
        <Fact label="Track" value={TRACK_LABEL[q.track]} />
        <Fact label="Experience" value={q.track === 'intern' ? 'Internship' : (LEVELS.find((l) => l.value === q.level)?.label ?? 'Not stated')} />
        <Fact label="Role" value={<span title={q.role}>{q.role}</span>} />
        <Fact label="Reported" value={`${q.reports} ${q.reports === 1 ? 'time' : 'times'}${q.year ? `, latest ${q.year}` : ''}`} />
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

      {problem ? (
        <ProblemStatement problem={problem} q={q} />
      ) : detail ? (
        <DetailView detail={detail} q={q} />
      ) : (
        <section className="mt-6">
          <h2 className="text-sm font-semibold text-fg">The question</h2>
          <p className="mt-2 text-[15px] leading-relaxed text-fg/90">{q.question}</p>
          <p className="mt-2 text-xs text-subtle">
            {q.verified ? "Verified: we re-checked the source page and found this question in the candidate's post. " : ''}
            Paraphrased from the candidate's report.
          </p>
        </section>
      )}

      {q.leetcodeSlug && (
        <a
          href={`https://leetcode.com/problems/${q.leetcodeSlug}/`}
          target="_blank"
          rel="noreferrer noopener"
          className="mt-5 inline-flex h-9 items-center gap-1.5 rounded-lg border border-line bg-surface px-3 text-sm font-medium text-fg hover:border-line-strong"
        >
          Open on LeetCode <ArrowSquareOutIcon size={14} />
        </a>
      )}

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

      {similar.length > 0 && (
        <section className="mt-8 pb-6">
          <h2 className="text-sm font-semibold text-fg">Similar questions</h2>
          <ul className="mt-2 space-y-1">
            {similar.map((x) => (
              <li key={x.id}>
                <Link to={`/q/${x.id}`} className="flex items-center gap-3 rounded-lg px-2 py-1.5 text-sm text-muted hover:bg-surface-2 hover:text-fg">
                  <CompanyLogo company={atlas.companyBySlug.get(x.company)!} size={20} />
                  <span className="min-w-0 flex-1 truncate">{x.title}</span>
                  {x.difficulty && (
                    <span className="shrink-0 text-xs">
                      <Difficulty value={x.difficulty} />
                    </span>
                  )}
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

/** Same type of question with the most topics in common, from any company. Copies of this exact problem are skipped. */
function similarQuestions(atlas: AtlasIndex, q: Question, limit = 6) {
  const topics = new Set(q.topics)
  const seen = new Set([q.leetcodeSlug ?? q.title.toLowerCase()])
  return atlas.questions
    .filter((x) => x.id !== q.id && x.kind === 'question' && x.category === q.category)
    .map((x) => ({ x, shared: x.topics.filter((t) => topics.has(t)).length }))
    .filter(({ shared }) => shared > 0 || topics.size === 0)
    .sort((a, b) => b.shared - a.shared || Number(b.x.difficulty === q.difficulty) - Number(a.x.difficulty === q.difficulty) || b.x.reports - a.x.reports)
    .map(({ x }) => x)
    .filter((x) => {
      const k = x.leetcodeSlug ?? x.title.toLowerCase()
      if (seen.has(k)) return false
      seen.add(k)
      return true
    })
    .slice(0, limit)
}

/** The question after this one in the company page order: same company and track, by round, newest first. */
function nextQuestion(atlas: AtlasIndex, q: Question) {
  const list = (atlas.bySlug.get(q.company) ?? [])
    .filter((x) => x.kind === 'question' && x.track === q.track)
    .sort((a, b) => (atlas.roundRank.get(a.round) ?? 99) - (atlas.roundRank.get(b.round) ?? 99) || byNewest(a, b))
  const i = list.findIndex((x) => x.id === q.id)
  return i >= 0 ? list[i + 1] ?? null : null
}

function ProblemStatement({ problem, q }: { problem: Problem; q: Question }) {
  return (
    <div className="mt-6 space-y-6 text-[15px] leading-relaxed text-fg/90">
      <Markdown text={problem.statement} />

      <section>
        <h2 className="text-sm font-semibold text-fg">Input</h2>
        <Markdown text={problem.inputFormat} className="mt-1.5 text-muted" />
      </section>
      <section>
        <h2 className="text-sm font-semibold text-fg">Output</h2>
        <Markdown text={problem.outputFormat} className="mt-1.5 text-muted" />
      </section>

      {problem.examples.map((ex, i) => (
        <section key={i}>
          <h2 className="text-sm font-semibold text-fg">Example {i + 1}</h2>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            <IoBlock label="Input" value={ex.input} />
            <IoBlock label="Output" value={ex.output} />
          </div>
          {ex.explanation && <Markdown text={`**Explanation:** ${ex.explanation}`} className="mt-2 text-sm text-muted" />}
        </section>
      ))}

      <section>
        <h2 className="text-sm font-semibold text-fg">Constraints</h2>
        <ul className="mt-2 space-y-1">
          {problem.constraints.map((c) => (
            <li key={c} className="w-fit rounded bg-surface-2 px-2 py-0.5 font-mono text-[13px] text-fg">
              {c}
            </li>
          ))}
        </ul>
      </section>

      <section className="flex flex-wrap gap-x-6 gap-y-1 rounded-xl border border-line bg-surface-2/50 px-4 py-3 text-sm">
        <span className="font-semibold text-fg">Expected complexity</span>
        <span className="text-muted">
          Time <span className="font-mono text-fg">{problem.complexity.time}</span>
        </span>
        <span className="text-muted">
          Space <span className="font-mono text-fg">{problem.complexity.space}</span>
        </span>
        <span className="text-muted">
          Limit <span className="text-fg">6 s per test</span>
        </span>
      </section>

      {problem.hints.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold text-fg">Hints</h2>
          <div className="mt-2 space-y-2">
            {problem.hints.map((h, i) => (
              <details key={i} className="group rounded-lg border border-line bg-surface px-3 py-2 text-sm">
                <summary className="cursor-pointer select-none font-medium text-muted group-open:text-fg">Hint {i + 1}</summary>
                <Markdown text={h} className="mt-2 text-muted" />
              </details>
            ))}
          </div>
        </section>
      )}

      <section className="rounded-xl border border-line px-4 py-3 text-sm">
        <h2 className="font-semibold text-fg">What the candidate reported</h2>
        <p className="mt-1 text-muted">{q.question}</p>
        <p className="mt-2 text-xs text-subtle">
          {problem.reconstructed
            ? 'The full statement was written by OfferForge from this report. The exact formats, constraints and examples were added so you can practise and test your code; they may differ from what the company used.'
            : 'The full statement was written by OfferForge for this well-known problem, with our own examples and tests.'}
          {q.verified ? " We re-checked the candidate's post and found this question in it." : ''}
        </p>
      </section>
    </div>
  )
}

function IoBlock({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-lg border border-line bg-surface-2/60">
      <p className="border-b border-line px-3 py-1.5 text-xs font-medium text-subtle">{label}</p>
      <pre className="max-h-48 overflow-auto px-3 py-2 font-mono text-[13px] leading-relaxed text-fg">{value}</pre>
    </div>
  )
}

function DetailView({ detail, q }: { detail: Detail; q: Question }) {
  return (
    <div className="mt-6 space-y-6 text-[15px] leading-relaxed text-fg/90">
      <section>
        <h2 className="text-sm font-semibold text-fg">The question</h2>
        <Markdown text={detail.question} className="mt-2" />
      </section>
      <section>
        <h2 className="text-sm font-semibold text-fg">What the interviewer is looking for</h2>
        <ul className="mt-2 list-disc space-y-1.5 pl-5 text-muted marker:text-subtle">
          {detail.lookingFor.map((x) => (
            <li key={x}>{x}</li>
          ))}
        </ul>
      </section>
      <section className="rounded-xl border border-line bg-surface-2/40 p-4">
        <h2 className="text-sm font-semibold text-fg">How to answer</h2>
        <Markdown text={detail.answer} className="mt-2 text-[14.5px]" />
      </section>
      <section>
        <h2 className="text-sm font-semibold text-fg">Likely follow-ups</h2>
        <ul className="mt-2 space-y-1.5">
          {detail.followUps.map((x) => (
            <li key={x} className="rounded-lg border border-line px-3 py-2 text-sm text-muted">
              {x}
            </li>
          ))}
        </ul>
      </section>
      <section className="rounded-xl border border-line px-4 py-3 text-sm">
        <h2 className="font-semibold text-fg">What the candidate reported</h2>
        <p className="mt-1 text-muted">{q.question}</p>
        <p className="mt-2 text-xs text-subtle">
          The full question and the answer guide were written by OfferForge from this report.
          {q.verified ? " We re-checked the candidate's post and found this question in it." : ''}
        </p>
      </section>
    </div>
  )
}

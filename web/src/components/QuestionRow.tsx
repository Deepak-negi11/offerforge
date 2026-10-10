import { ArrowRightIcon, BookmarkSimpleIcon, CheckCircleIcon, CircleIcon } from '@phosphor-icons/react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useAtlas, type Question } from '../lib/data'
import { useAccount } from '../lib/account'
import { CompanyLogo, Difficulty } from './ui'

interface RowProps {
  q: Question
  showCompany?: boolean
  showRound?: boolean
}

export function QuestionRow({ q, showCompany = false, showRound = true }: RowProps) {
  const atlas = useAtlas()
  const { bookmarks, solved, toggle } = useAccount()
  const isSolved = solved.has(q.id)
  const isSaved = bookmarks.has(q.id)
  const company = atlas.companyBySlug.get(q.company)!
  const showSummary = q.question.trim().toLowerCase() !== q.title.trim().toLowerCase()

  return (
    <article className="group relative flex items-start gap-3 border-b border-line py-4 last:border-b-0">
      <button
        onClick={() => toggle('solved', q.id)}
        aria-pressed={isSolved}
        aria-label={isSolved ? `Mark "${q.title}" as not solved` : `Mark "${q.title}" as solved`}
        title={isSolved ? 'Solved' : 'Mark as solved'}
        className={'relative z-10 mt-0.5 grid size-7 shrink-0 place-items-center rounded-full transition-[color,transform] active:scale-90 ' + (isSolved ? 'text-easy' : 'text-line-strong hover:text-subtle')}
      >
        {isSolved ? <CheckCircleIcon size={22} weight="fill" /> : <CircleIcon size={22} />}
      </button>

      {showCompany && <CompanyLogo company={company} size={30} />}

      <div className="min-w-0 flex-1">
        <h3 className="text-[15px] font-semibold leading-snug text-fg">
          {/* The title link covers the whole row so the full card is clickable. */}
          <Link to={`/q/${q.id}`} className="outline-none after:absolute after:inset-0 after:content-[''] focus-visible:underline">
            {q.title}
          </Link>
        </h3>
        {showSummary && <p className="mt-1 line-clamp-2 text-sm leading-relaxed text-muted">{q.question}</p>}
        <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs">
          {showCompany && <Meta label="Company" value={company.name} />}
          {showRound && <Meta label="Round" value={q.round} />}
          <Meta label="Type" value={q.category} />
          {q.topics.length > 0 && <Meta label="Topics" value={q.topics.slice(0, 3).join(', ')} />}
          {q.difficulty && (
            <div className="flex items-center gap-1.5">
              <span className="text-subtle">Level</span>
              <span>
                <Difficulty value={q.difficulty} />
              </span>
            </div>
          )}
          {q.reports > 1 && <span className="rounded-full bg-accent-soft px-2 py-0.5 font-medium text-accent-ink">{q.reports} reports</span>}
          {q.secondaryOnly && <span className="rounded-full border border-line px-2 py-0.5 text-subtle" title="Only found on a prep site that compiles questions">Secondary source</span>}
        </div>
      </div>

      <div className="relative z-10 flex shrink-0 items-center gap-1">
        <button
          onClick={() => toggle('bookmarks', q.id)}
          aria-pressed={isSaved}
          aria-label={isSaved ? `Remove "${q.title}" from bookmarks` : `Bookmark "${q.title}"`}
          title={isSaved ? 'Bookmarked' : 'Bookmark'}
          className={'grid size-8 place-items-center rounded-lg transition-[color,background-color,transform] hover:bg-surface-2 active:scale-90 ' + (isSaved ? 'text-accent-ink' : 'text-subtle hover:text-fg')}
        >
          <BookmarkSimpleIcon size={18} weight={isSaved ? 'fill' : 'regular'} />
        </button>
        <Link
          to={`/q/${q.id}`}
          tabIndex={-1}
          aria-hidden
          className="hidden h-8 items-center gap-1 rounded-lg border border-line px-3 text-sm font-medium text-fg transition-[background-color,border-color] group-hover:border-accent group-hover:bg-accent group-hover:text-accent-fg sm:flex"
        >
          Solve <ArrowRightIcon size={14} />
        </Link>
      </div>
    </article>
  )
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex min-w-0 items-center gap-1.5">
      <span className="text-subtle">{label}</span>
      <span className="truncate font-medium text-fg/80">{value}</span>
    </div>
  )
}

/** Renders a long list in pages so thousands of rows don't hit the DOM at once. */
export function QuestionList({ questions, showCompany, showRound = true, pageSize = 40 }: { questions: Question[]; showCompany?: boolean; showRound?: boolean; pageSize?: number }) {
  const [shown, setShown] = useState(pageSize)
  const [prev, setPrev] = useState(questions)
  if (prev !== questions) {
    // filters changed: start from the first page again
    setPrev(questions)
    setShown(pageSize)
  }
  return (
    <div>
      <div className="rounded-xl border border-line bg-surface px-4 shadow-panel sm:px-5">
        {questions.slice(0, shown).map((q) => (
          <QuestionRow key={q.id} q={q} showCompany={showCompany} showRound={showRound} />
        ))}
      </div>
      {shown < questions.length && (
        <div className="mt-4 flex justify-center">
          <button
            onClick={() => setShown((s) => s + pageSize * 2)}
            className="h-10 rounded-lg border border-line bg-surface px-4 text-sm font-medium text-fg transition-[border-color,transform] hover:border-line-strong active:scale-[0.98]"
          >
            Show more <span className="tabular-nums text-subtle">({questions.length - shown} left)</span>
          </button>
        </div>
      )}
    </div>
  )
}

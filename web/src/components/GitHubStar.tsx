import { StarIcon } from '@phosphor-icons/react'
import { useEffect, useState } from 'react'
import { GITHUB_REPO } from '../lib/config'

const GH_MARK = 'url(https://cdn.simpleicons.org/github)'
const CACHE_KEY = `atlas:stars:${GITHUB_REPO}`
const fmt = new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 })

/** Real star count from the GitHub API, cached for the session (unauthenticated limit is 60 requests/hour). */
function useStars() {
  const [stars, setStars] = useState<number | null>(() => {
    try {
      const v = sessionStorage.getItem(CACHE_KEY)
      return v ? Number(v) : null
    } catch {
      return null
    }
  })
  useEffect(() => {
    if (stars !== null) return
    let alive = true
    fetch(`https://api.github.com/repos/${GITHUB_REPO}`, { headers: { Accept: 'application/vnd.github+json' } })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!alive || typeof d?.stargazers_count !== 'number') return
        setStars(d.stargazers_count)
        try {
          sessionStorage.setItem(CACHE_KEY, String(d.stargazers_count))
        } catch {
          /* ignore */
        }
      })
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [stars])
  return stars
}

/** `className` must include the display utility (e.g. "inline-flex" or "hidden xl:inline-flex"). */
export function GitHubStar({ className = 'inline-flex' }: { className?: string }) {
  const stars = useStars()
  return (
    <a
      href={`https://github.com/${GITHUB_REPO}`}
      target="_blank"
      rel="noreferrer noopener"
      aria-label={stars === null ? 'Star OfferForge on GitHub' : `Star OfferForge on GitHub, ${stars} stars`}
      className={
        'group h-10 items-center rounded-full border border-line bg-surface text-sm font-medium text-fg transition-[border-color,transform] hover:-translate-y-px hover:border-line-strong active:translate-y-0 ' +
        className
      }
    >
      <span className="grid h-full place-items-center pl-3 pr-2.5">
        {/* Official GitHub mark from Simple Icons, drawn as a mask so it follows the text colour in both themes. */}
        <span className="logo-mask size-5" style={{ maskImage: GH_MARK, WebkitMaskImage: GH_MARK }} aria-hidden />
      </span>
      <span className="h-5 w-px bg-line" aria-hidden />
      <span className="flex items-center gap-1.5 pl-2.5 pr-3.5">
        <StarIcon size={17} weight="fill" className="text-subtle transition-colors group-hover:text-[#f5b301]" />
        <span className="tabular-nums">{stars ? fmt.format(stars) : 'Star'}</span>
      </span>
    </a>
  )
}

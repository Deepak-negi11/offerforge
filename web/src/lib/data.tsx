import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'

export type Track = 'intern' | 'fulltime'
export type Platform = 'aggregator' | 'gfg' | 'leetcode' | 'reddit' | 'linkedin' | 'x' | 'glassdoor' | 'medium' | 'blog' | 'youtube' | 'hn' | 'other'

export interface Source {
  url: string
  platform: Platform
  title: string
}

export interface Question {
  id: string
  company: string
  track: Track
  kind: 'question' | 'format'
  title: string
  role: string
  round: string
  category: string
  topics: string[]
  difficulty: 'Easy' | 'Medium' | 'Hard' | null
  question: string
  leetcodeSlug: string | null
  year: number | null
  location: string | null
  sources: Source[]
  reports: number
  secondaryOnly: boolean
  verified?: boolean
}

export interface ProcessRound {
  name: string
  canonical: string
  description: string
  order: number
}

export interface Process {
  track: Track
  role: string
  location: string | null
  rounds: ProcessRound[]
  sources: string[]
}

export interface Company {
  slug: string
  name: string
  group: string
  logo: string | null
  domain: string
  counts: { total: number; intern: number; fulltime: number; notes: number }
  categories: Record<string, number>
  topTopics: [string, number][]
  rounds: Record<Track, string[]>
  processes: Process[]
  sourceCount: number
}

export interface Atlas {
  generatedAt: string
  stats: { questions: number; notes: number; verified?: number; companies: number; sources: number; platforms: Record<string, number>; dropped: number }
  rounds: string[]
  categories: string[]
  groups: string[]
  topics: [string, number][]
  companies: Company[]
  questions: Question[]
}

export interface AtlasIndex extends Atlas {
  companyBySlug: Map<string, Company>
  bySlug: Map<string, Question[]>
  byLeetcode: Map<string, Question[]>
  roundRank: Map<string, number>
}

type State = { status: 'loading' } | { status: 'error'; message: string } | { status: 'ready'; atlas: AtlasIndex }

const Ctx = createContext<State>({ status: 'loading' })

function index(atlas: Atlas): AtlasIndex {
  const bySlug = new Map<string, Question[]>()
  const byLeetcode = new Map<string, Question[]>()
  for (const q of atlas.questions) {
    if (!bySlug.has(q.company)) bySlug.set(q.company, [])
    bySlug.get(q.company)!.push(q)
    if (q.leetcodeSlug) {
      if (!byLeetcode.has(q.leetcodeSlug)) byLeetcode.set(q.leetcodeSlug, [])
      byLeetcode.get(q.leetcodeSlug)!.push(q)
    }
  }
  return {
    ...atlas,
    companyBySlug: new Map(atlas.companies.map((c) => [c.slug, c])),
    bySlug,
    byLeetcode,
    roundRank: new Map(atlas.rounds.map((r, i) => [r, i])),
  }
}

export function AtlasProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<State>({ status: 'loading' })
  useEffect(() => {
    let alive = true
    fetch(`${import.meta.env.BASE_URL}data/atlas.json`)
      .then((r) => {
        if (!r.ok) throw new Error(`Dataset request failed (${r.status}). Run "uv run python -m atlas build" in scraper/.`)
        return r.json() as Promise<Atlas>
      })
      .then((a) => alive && setState({ status: 'ready', atlas: index(a) }))
      .catch((e: Error) => alive && setState({ status: 'error', message: e.message }))
    return () => {
      alive = false
    }
  }, [])
  return <Ctx.Provider value={state}>{children}</Ctx.Provider>
}

export function useAtlasState() {
  return useContext(Ctx)
}

/** Only call below <AtlasGate>, which guarantees the dataset is loaded. */
export function useAtlas(): AtlasIndex {
  const s = useContext(Ctx)
  if (s.status !== 'ready') throw new Error('useAtlas used outside AtlasGate')
  return s.atlas
}

export const TRACK_LABEL: Record<Track, string> = { intern: 'Internship', fulltime: 'Full-time' }

export const PLATFORM_LABEL: Record<Platform, string> = {
  aggregator: 'Prep site (secondary)',
  gfg: 'GeeksforGeeks',
  leetcode: 'LeetCode Discuss',
  reddit: 'Reddit',
  linkedin: 'LinkedIn',
  x: 'X',
  glassdoor: 'Glassdoor',
  medium: 'Medium',
  blog: 'Blogs and other sites',
  youtube: 'YouTube',
  hn: 'Hacker News',
  other: 'Web',
}

export function matchesText(q: Question, companyName: string, needle: string) {
  if (!needle) return true
  const hay = `${q.title} ${q.question} ${q.topics.join(' ')} ${q.round} ${q.category} ${q.role} ${companyName} ${q.leetcodeSlug ?? ''}`.toLowerCase()
  return needle
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .every((w) => hay.includes(w))
}

export function useSortedTopics(questions: Question[], limit = 12) {
  return useMemo(() => {
    const m = new Map<string, number>()
    for (const q of questions) for (const t of q.topics) m.set(t, (m.get(t) ?? 0) + 1)
    return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, limit)
  }, [questions, limit])
}

/** Questions you would answer by writing code, as opposed to talking or writing prose. */
export function isCoding(q: Pick<Question, 'category' | 'round'>) {
  return q.category === 'DSA' || q.round === 'Machine Coding' || (q.category === 'LLD' && q.round !== 'System Design')
}

export const isQuestion = (q: Question) => q.kind === 'question'

/** Newest reports first; ties broken by how many candidates reported the question. */
export const byNewest = (a: Question, b: Question) => (b.year ?? 0) - (a.year ?? 0) || b.reports - a.reports

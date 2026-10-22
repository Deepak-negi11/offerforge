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
  /** Seniority from the role text: intern, entry, mid, senior, or '' when the post doesn't say. */
  level: Level
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
  /** Id of the full problem (statement, examples, hidden tests) in data/problems/<id>.json. */
  problem?: string
  /** A detailed write-up (full question, what they look for, how to answer) exists in data/details/<id>.json. */
  detail?: boolean
}

export interface Detail {
  question: string
  lookingFor: string[]
  answer: string
  followUps: string[]
}

const detailCache = new Map<string, Promise<Detail | null>>()

export function useDetail(q: Pick<Question, 'id' | 'detail'>): Detail | null {
  const [state, setState] = useState<{ id: string; detail: Detail | null } | null>(null)
  useEffect(() => {
    if (!q.detail) return
    let alive = true
    if (!detailCache.has(q.id)) {
      detailCache.set(
        q.id,
        fetch(`${import.meta.env.BASE_URL}data/details/${q.id}.json`)
          .then((r) => (r.ok && r.headers.get('content-type')?.includes('json') ? (r.json() as Promise<Detail>) : null))
          .catch(() => null),
      )
    }
    detailCache.get(q.id)!.then((detail) => alive && setState({ id: q.id, detail }))
    return () => {
      alive = false
    }
  }, [q.id, q.detail])
  return q.detail && state?.id === q.id ? state.detail : null
}

export interface ProblemTest {
  input: string
  output: string
}

/** A large hidden test: input rebuilt from the generator, checked by SHA-256 of input and expected output. */
export interface HashedTest {
  g: number
  n: number
  ih: string
  oh: string
}

export interface Problem {
  title: string
  difficulty: 'Easy' | 'Medium' | 'Hard'
  statement: string
  inputFormat: string
  outputFormat: string
  constraints: string[]
  examples: (ProblemTest & { explanation: string })[]
  tests: (ProblemTest | HashedTest)[]
  generator?: string
  seed?: number
  complexity: { time: string; space: string }
  hints: string[]
  starters: Record<'python' | 'javascript' | 'cpp' | 'java', string>
  /** True when formats, constraints and examples were added around the candidate's description. */
  reconstructed: boolean
}

const problemCache = new Map<string, Promise<Problem | null>>()

/** Loads the full problem for a question, or null when there isn't one. */
export function useProblem(q: Pick<Question, 'id' | 'problem'>): { problem: Problem | null; loading: boolean } {
  const [state, setState] = useState<{ id: string; problem: Problem | null } | null>(null)
  useEffect(() => {
    if (!q.problem) return
    let alive = true
    const pid = q.problem
    if (!problemCache.has(pid)) {
      problemCache.set(
        pid,
        fetch(`${import.meta.env.BASE_URL}data/problems/${pid}.json`)
          .then((r) => (r.ok && r.headers.get('content-type')?.includes('json') ? (r.json() as Promise<Problem>) : null))
          .catch(() => null),
      )
    }
    problemCache.get(pid)!.then((problem) => alive && setState({ id: q.id, problem }))
    return () => {
      alive = false
    }
  }, [q.id, q.problem])
  if (!q.problem) return { problem: null, loading: false }
  return state?.id === q.id ? { problem: state.problem, loading: false } : { problem: null, loading: true }
}

export type Level = 'intern' | 'entry' | 'mid' | 'senior' | ''

export const LEVELS: { value: Exclude<Level, 'intern'>; label: string; short: string }[] = [
  { value: 'entry', label: 'SDE-1 · 0–2 yrs', short: 'SDE-1' },
  { value: 'mid', label: 'SDE-2 · 2–5 yrs', short: 'SDE-2' },
  { value: 'senior', label: 'SDE-3+ · 5+ yrs', short: 'SDE-3+' },
  { value: '', label: 'Level not stated', short: 'Not stated' },
]

export interface ProcessRound {
  name: string
  canonical: string
  description: string
  order: number
}

export interface Process {
  track: Track
  role: string
  level: Level
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

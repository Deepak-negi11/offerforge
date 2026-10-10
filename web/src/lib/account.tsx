import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { AuthModal } from '../components/AuthModal'
import { api } from './api'

export interface User {
  id: number
  email: string
  name: string
}

type Status = 'loading' | 'anonymous' | 'signed-in'
type Kind = 'bookmarks' | 'solved'

interface AccountCtx {
  status: Status
  user: User | null
  bookmarks: Set<string>
  solved: Set<string>
  toggle: (kind: Kind, id: string) => void
  login: (email: string, password: string) => Promise<void>
  signup: (name: string, email: string, password: string) => Promise<void>
  logout: () => Promise<void>
  /** Opens the sign-in dialog. `required` dialogs send the user home if dismissed. */
  requestAuth: (opts?: { reason?: string; required?: boolean }) => void
}

const Ctx = createContext<AccountCtx | null>(null)

export function AccountProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<Status>('loading')
  const [user, setUser] = useState<User | null>(null)
  const [bookmarks, setBookmarks] = useState<Set<string>>(new Set())
  const [solved, setSolved] = useState<Set<string>>(new Set())
  const [modal, setModal] = useState<{ reason?: string; required?: boolean } | null>(null)

  const loadProgress = useCallback(async () => {
    const p = await api<{ bookmarks: string[]; solved: string[] }>('/progress')
    setBookmarks(new Set(p.bookmarks))
    setSolved(new Set(p.solved))
  }, [])

  const signIn = useCallback(
    async (u: User) => {
      setUser(u)
      setStatus('signed-in')
      setModal(null)
      await loadProgress().catch(() => {})
    },
    [loadProgress],
  )

  useEffect(() => {
    api<{ user: User | null }>('/auth/me')
      .then((r) => (r.user ? signIn(r.user) : setStatus('anonymous')))
      .catch(() => setStatus('anonymous'))
  }, [signIn])

  const toggle = useCallback(
    (kind: Kind, id: string) => {
      if (status !== 'signed-in') {
        setModal({ reason: kind === 'bookmarks' ? 'Sign in to bookmark questions.' : 'Sign in to track what you have solved.' })
        return
      }
      const setter = kind === 'bookmarks' ? setBookmarks : setSolved
      const on = !(kind === 'bookmarks' ? bookmarks : solved).has(id)
      const apply = (add: boolean) =>
        setter((prev) => {
          const next = new Set(prev)
          if (add) next.add(id)
          else next.delete(id)
          return next
        })
      apply(on)
      // Roll back the optimistic change if the server rejected it.
      api(`/${kind}/${id}`, { method: 'PUT', body: { on } }).catch(() => apply(!on))
    },
    [status, bookmarks, solved],
  )

  const value = useMemo<AccountCtx>(
    () => ({
      status,
      user,
      bookmarks,
      solved,
      toggle,
      login: async (email, password) => signIn((await api<{ user: User }>('/auth/login', { body: { email, password } })).user),
      signup: async (name, email, password) => signIn((await api<{ user: User }>('/auth/signup', { body: { name, email, password } })).user),
      logout: async () => {
        await api('/auth/logout', { body: {} }).catch(() => {})
        setUser(null)
        setStatus('anonymous')
        setBookmarks(new Set())
        setSolved(new Set())
      },
      requestAuth: (opts) => setModal(opts ?? {}),
    }),
    [status, user, bookmarks, solved, toggle, signIn],
  )

  return (
    <Ctx.Provider value={value}>
      {children}
      {modal && <AuthModal reason={modal.reason} required={modal.required} onClose={() => setModal(null)} />}
    </Ctx.Provider>
  )
}

export function useAccount() {
  const c = useContext(Ctx)
  if (!c) throw new Error('useAccount outside AccountProvider')
  return c
}

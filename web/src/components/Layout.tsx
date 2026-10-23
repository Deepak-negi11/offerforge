import { HeartIcon, ListIcon, MagnifyingGlassIcon, MoonIcon, SignOutIcon, SunIcon, XIcon } from '@phosphor-icons/react'
import { useEffect, useRef, useState } from 'react'
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom'
import { AccountProvider, useAccount } from '../lib/account'
import { getTheme, setTheme } from '../lib/theme'
import { CommandPalette } from './CommandPalette'
import { GitHubStar } from './GitHubStar'
import { LogoMark } from './Logo'
import { LINKEDIN_URL } from '../lib/config'

const NAV = [
  { to: '/', label: 'Companies', end: true },
  { to: '/questions', label: 'Questions' },
  { to: '/topics', label: 'Topics' },
]

export function Layout() {
  return (
    <AccountProvider>
      <Shell />
    </AccountProvider>
  )
}

function Shell() {
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const loc = useLocation()
  const fullBleed = loc.pathname.startsWith('/q/')

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = e.target instanceof HTMLElement && (e.target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName))
      if ((e.key === 'k' && (e.metaKey || e.ctrlKey)) || (e.key === '/' && !typing)) {
        e.preventDefault()
        setPaletteOpen(true)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  useEffect(() => {
    setMenuOpen(false)
    window.scrollTo({ top: 0 })
  }, [loc.pathname])

  return (
    <div className="min-h-[100dvh]">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-3 focus:z-50 focus:rounded-lg focus:bg-surface focus:px-3 focus:py-2">
        Skip to content
      </a>
      <header className="sticky top-0 z-30 border-b border-line bg-bg/85 backdrop-blur-xl">
        <div className={'mx-auto flex h-[var(--header-h)] items-center gap-3 px-4 sm:gap-4 sm:px-6 lg:grid lg:grid-cols-[1fr_auto_1fr] ' + (fullBleed ? '' : 'max-w-7xl')}>
          <Link to="/" className="group flex shrink-0 items-center gap-2.5 text-fg sm:gap-3" aria-label="OfferForge home">
            <span className="transition-transform duration-300 group-hover:-rotate-6">
              <LogoMark size={34} />
            </span>
            <span className="text-lg font-bold tracking-[-0.03em] sm:text-[22px]">
              Offer<span className="text-accent-ink">Forge</span>
            </span>
          </Link>
          <nav aria-label="Primary" className="hidden items-center gap-0.5 rounded-full border border-line bg-surface-2/70 p-1 lg:flex">
            {NAV.map((n) => (
              <NavLink
                key={n.to}
                to={n.to}
                end={n.end}
                className={({ isActive }) =>
                  'rounded-full px-4 py-2 text-[15px] font-medium transition-[color,background-color,box-shadow] ' +
                  (isActive ? 'bg-surface text-fg shadow-panel ring-1 ring-line' : 'text-muted hover:text-fg')
                }
              >
                {n.label}
              </NavLink>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-1.5 sm:gap-2 lg:justify-self-end">
            <button
              onClick={() => setPaletteOpen(true)}
              aria-label="Search"
              className="hidden h-10 items-center gap-2.5 rounded-lg border border-line bg-surface px-3 text-[15px] text-subtle transition-colors hover:border-line-strong hover:text-fg sm:flex xl:w-52"
            >
              <MagnifyingGlassIcon size={18} />
              <span className="hidden flex-1 text-left xl:inline">Search…</span>
              <kbd className="hidden rounded border border-line bg-surface-2 px-1.5 text-[11px] xl:inline">⌘K</kbd>
            </button>
            <GitHubStar className="hidden xl:inline-flex" />
            <ThemeToggle />
            <AccountButton />
            <button
              className="grid size-10 place-items-center rounded-lg border border-line bg-surface text-fg lg:hidden"
              aria-label={menuOpen ? 'Close menu' : 'Open menu'}
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen((o) => !o)}
            >
              {menuOpen ? <XIcon size={18} /> : <ListIcon size={18} />}
            </button>
          </div>
        </div>
        {menuOpen && (
          <nav aria-label="Mobile" className="expand border-t border-line px-4 py-2 lg:hidden">
            <button
              onClick={() => {
                setMenuOpen(false)
                setPaletteOpen(true)
              }}
              className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left text-[15px] font-medium text-muted"
            >
              <MagnifyingGlassIcon size={16} /> Search
            </button>
            {NAV.map((n) => (
              <NavLink
                key={n.to}
                to={n.to}
                end={n.end}
                className={({ isActive }) => 'block rounded-lg px-3 py-2.5 text-[15px] font-medium ' + (isActive ? 'bg-surface-2 text-fg' : 'text-muted')}
              >
                {n.label}
              </NavLink>
            ))}
          </nav>
        )}
      </header>
      <main id="main" className={fullBleed ? '' : 'mx-auto max-w-7xl px-4 pb-24 sm:px-6'}>
        <Outlet />
      </main>
      {!fullBleed && <Footer />}
      {paletteOpen && <CommandPalette onClose={() => setPaletteOpen(false)} />}
    </div>
  )
}

function AccountButton() {
  const { status, user, requestAuth, logout } = useAccount()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false)
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  if (status === 'loading') return <span className="skeleton size-10 rounded-lg" aria-hidden />
  if (!user)
    return (
      <button
        onClick={() => requestAuth()}
        className="h-10 whitespace-nowrap rounded-lg bg-accent px-3 text-sm font-semibold sm:px-4 sm:text-[15px] text-accent-fg transition-[background-color,transform] hover:bg-accent-hover active:scale-[0.98]"
      >
        Sign in
      </button>
    )
  const initials = user.name.split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase()).join('')
  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Account menu for ${user.name}`}
        className="grid size-10 place-items-center rounded-lg bg-accent text-sm font-semibold text-accent-fg transition-transform active:scale-95"
      >
        {initials || '?'}
      </button>
      {open && (
        <div role="menu" className="expand absolute right-0 top-12 z-40 w-60 rounded-xl border border-line bg-surface p-1.5 shadow-panel">
          <div className="px-2.5 py-2">
            <p className="truncate text-sm font-medium text-fg">{user.name}</p>
            <p className="truncate text-xs text-subtle">{user.email}</p>
          </div>
          <div className="my-1 h-px bg-line" />
          <button
            role="menuitem"
            onClick={() => {
              setOpen(false)
              logout()
            }}
            className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm text-fg hover:bg-surface-2"
          >
            <SignOutIcon size={16} /> Sign out
          </button>
        </div>
      )}
    </div>
  )
}

function ThemeToggle() {
  const [mode, setMode] = useState<'light' | 'dark'>(getTheme())
  const next = mode === 'dark' ? 'light' : 'dark'
  return (
    <button
      onClick={() => {
        setTheme(next)
        setMode(next)
      }}
      aria-label={`Switch to ${next} theme`}
      title={`Switch to ${next} theme`}
      className="grid size-10 place-items-center rounded-lg border border-line bg-surface text-fg transition-colors hover:border-line-strong"
    >
      {mode === 'dark' ? <SunIcon size={18} /> : <MoonIcon size={18} />}
    </button>
  )
}

function Footer() {
  return (
    <footer className="border-t border-line">
      <div className="mx-auto flex max-w-7xl flex-col items-center gap-4 px-4 py-8 sm:px-6">
        <GitHubStar />
        <p className="flex items-center gap-1.5 text-sm text-muted">
          Developed with
          <HeartIcon size={16} weight="fill" className="heartbeat text-[#f43f5e]" aria-label="love" />
          by
          <a href={LINKEDIN_URL} target="_blank" rel="noreferrer noopener" className="font-semibold text-accent-ink underline-offset-4 transition-colors hover:underline">
            Deepak
          </a>
        </p>
        <nav aria-label="Legal" className="flex gap-4 text-xs text-subtle">
          <Link to="/privacy" className="hover:text-fg">
            Privacy
          </Link>
          <Link to="/terms" className="hover:text-fg">
            Terms
          </Link>
        </nav>
      </div>
    </footer>
  )
}

import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import type { Company, Question } from '../lib/data'

export function CompanyLogo({ company, size = 40 }: { company: Pick<Company, 'name' | 'logo'>; size?: number }) {
  const box = { width: size, height: size }
  if (company.logo) {
    const url = `url(https://cdn.simpleicons.org/${company.logo})`
    return (
      <span className="grid shrink-0 place-items-center rounded-lg border border-line bg-surface-2 text-fg" style={box}>
        <span className="logo-mask" style={{ width: size * 0.5, height: size * 0.5, maskImage: url, WebkitMaskImage: url }} role="img" aria-label={`${company.name} logo`} />
      </span>
    )
  }
  const initials = company.name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
  return (
    <span
      className="grid shrink-0 place-items-center rounded-lg border border-line bg-surface-2 font-semibold tracking-[-0.015em] text-fg"
      style={{ ...box, fontSize: size * (initials.length > 1 ? 0.34 : 0.42) }}
      aria-hidden
    >
      {initials}
    </span>
  )
}

export function Chip({ children, tone = 'default', to }: { children: ReactNode; tone?: 'default' | 'accent'; to?: string }) {
  const cls =
    'inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors ' +
    (tone === 'accent' ? 'border-accent-line bg-accent-soft text-accent-ink' : 'border-line bg-surface-2 text-muted')
  return to ? (
    <Link to={to} className={cls + ' hover:border-line-strong hover:text-fg'}>
      {children}
    </Link>
  ) : (
    <span className={cls}>{children}</span>
  )
}

export function Difficulty({ value }: { value: Question['difficulty'] }) {
  if (!value) return null
  const color = { Easy: 'text-easy', Medium: 'text-medium', Hard: 'text-hard' }[value]
  return <span className={`text-xs font-medium ${color}`}>{value}</span>
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T
  options: { value: T; label: string; count?: number }[]
  onChange: (v: T) => void
  label: string
}) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex rounded-lg border border-line bg-surface-2 p-0.5">
      {options.map((o) => {
        const active = o.value === value
        return (
          <button
            key={o.value}
            role="radio"
            aria-checked={active}
            onClick={() => onChange(o.value)}
            className={
              'flex items-center gap-2 whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium transition-[transform,opacity,box-shadow,border-color,background-color,color] active:scale-[0.98] ' +
              (active ? 'bg-surface text-fg shadow-panel' : 'text-muted hover:text-fg')
            }
          >
            {o.label}
            {o.count !== undefined && <span className="tabular-nums text-xs text-subtle">{o.count}</span>}
          </button>
        )
      })}
    </div>
  )
}

export function Select({
  label,
  value,
  onChange,
  options,
  allLabel = 'All',
}: {
  label: string
  value: string
  onChange: (v: string) => void
  options: { value: string; label: string; count?: number }[]
  allLabel?: string
}) {
  return (
    <label className="flex min-w-0 flex-col gap-1.5">
      <span className="text-xs font-medium text-muted">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-9 w-full min-w-0 truncate rounded-lg border border-line bg-surface px-2.5 text-sm text-fg outline-none transition-colors hover:border-line-strong focus-visible:border-accent focus-visible:ring-2 focus-visible:ring-accent/25"
      >
        <option value="">{allLabel}</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
            {o.count !== undefined ? ` (${o.count})` : ''}
          </option>
        ))}
      </select>
    </label>
  )
}

export function EmptyState({ title, body, action }: { title: string; body: string; action?: ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-line-strong px-6 py-14 text-center">
      <p className="text-base font-medium text-fg">{title}</p>
      <p className="mx-auto mt-1.5 max-w-[46ch] text-sm text-muted">{body}</p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  )
}

export function ButtonLink({ to, children, variant = 'primary' }: { to: string; children: ReactNode; variant?: 'primary' | 'ghost' }) {
  return (
    <Link
      to={to}
      className={
        'inline-flex h-10 items-center gap-2 whitespace-nowrap rounded-lg px-4 text-sm font-medium transition-[transform,opacity,box-shadow,border-color,background-color,color] active:scale-[0.98] ' +
        (variant === 'primary' ? 'bg-accent text-accent-fg hover:opacity-90' : 'border border-line bg-surface text-fg hover:border-line-strong')
      }
    >
      {children}
    </Link>
  )
}

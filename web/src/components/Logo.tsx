/** Brand mark for OfferForge: a ring (the offer) with a spark struck off it (the forge). */
export function LogoMark({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true" className="shrink-0">
      <rect width="32" height="32" rx="9" fill="var(--accent)" />
      <circle cx="14.5" cy="17.5" r="7" fill="none" stroke="var(--accent-fg)" strokeWidth="3.2" />
      <path d="M23.5 5.5l1.3 3.2 3.2 1.3-3.2 1.3-1.3 3.2-1.3-3.2-3.2-1.3 3.2-1.3z" fill="var(--accent-fg)" />
    </svg>
  )
}

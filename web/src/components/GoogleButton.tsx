import { useEffect, useRef, useState } from 'react'

// "Continue with Google" via Google Identity Services. The server's /api/auth/config says whether it is set up;
// without a client id nothing renders. Google returns a signed ID token that the server verifies.
type Gsi = {
  accounts: {
    id: {
      initialize: (o: { client_id: string; callback: (r: { credential: string }) => void; ux_mode?: 'popup' }) => void
      renderButton: (el: HTMLElement, o: Record<string, string | number>) => void
    }
  }
}
declare global {
  interface Window {
    google?: Gsi
  }
}

let config: Promise<string | null> | null = null
const clientId = () =>
  (config ??= fetch('/api/auth/config')
    .then((r) => (r.ok ? r.json() : {}))
    .then((c: { googleClientId?: string | null }) => c.googleClientId ?? null)
    .catch(() => null))

let script: Promise<void> | null = null
const loadGsi = () =>
  (script ??= new Promise<void>((resolve, reject) => {
    const s = document.createElement('script')
    s.src = 'https://accounts.google.com/gsi/client'
    s.async = true
    s.onload = () => resolve()
    s.onerror = () => {
      script = null
      reject(new Error('Could not load Google sign-in'))
    }
    document.head.appendChild(s)
  }))

export function GoogleButton({ onCredential }: { onCredential: (credential: string) => void }) {
  const ref = useRef<HTMLDivElement>(null)
  const cb = useRef(onCredential)
  const [shown, setShown] = useState(false)
  useEffect(() => {
    cb.current = onCredential
  }, [onCredential])

  useEffect(() => {
    let live = true
    clientId()
      .then(async (id) => {
        if (!id || !live) return
        await loadGsi()
        if (!live || !ref.current || !window.google) return
        window.google.accounts.id.initialize({ client_id: id, callback: (r) => cb.current(r.credential), ux_mode: 'popup' })
        const dark = document.documentElement.dataset.theme !== 'light'
        window.google.accounts.id.renderButton(ref.current, {
          type: 'standard',
          theme: dark ? 'filled_black' : 'outline',
          size: 'large',
          text: 'continue_with',
          shape: 'rectangular',
          width: Math.min(400, ref.current.offsetWidth || 320),
        })
        setShown(true)
      })
      .catch(() => {})
    return () => {
      live = false
    }
  }, [])

  return (
    <div className={shown ? 'grid gap-4' : 'hidden'}>
      <div ref={ref} className="flex min-h-10 justify-center" />
      <div className="flex items-center gap-3 text-xs text-subtle">
        <span className="h-px flex-1 bg-line" />
        or with email
        <span className="h-px flex-1 bg-line" />
      </div>
    </div>
  )
}

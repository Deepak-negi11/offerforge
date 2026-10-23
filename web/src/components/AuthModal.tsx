import { CircleNotchIcon, XIcon } from '@phosphor-icons/react'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAccount } from '../lib/account'
import { ApiError } from '../lib/api'
import { GoogleButton } from './GoogleButton'
import { LogoMark } from './Logo'

type Mode = 'signin' | 'signup' | 'verify'

export function AuthModal({ reason, required, onClose }: { reason?: string; required?: boolean; onClose: () => void }) {
  const { login, signup, verify, resendCode, googleSignIn } = useAccount()
  const nav = useNavigate()
  const [mode, setMode] = useState<Mode>('signin')
  // Email waiting for its code, and whether it came from sign-up (for analytics).
  const [pending, setPending] = useState<{ email: string; fromSignup: boolean } | null>(null)
  const [notice, setNotice] = useState('')
  const [cooldown, setCooldown] = useState(0)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [fields, setFields] = useState<Record<string, string>>({})
  const firstRef = useRef<HTMLInputElement>(null)

  const close = () => {
    onClose()
    if (required) nav('/')
  }

  useEffect(() => {
    firstRef.current?.focus()
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close()
    window.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode])

  useEffect(() => {
    if (cooldown <= 0) return
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000)
    return () => clearTimeout(t)
  }, [cooldown])

  const run = async (fn: () => Promise<void>) => {
    setError('')
    setNotice('')
    setBusy(true)
    try {
      await fn()
    } catch (err) {
      const e2 = err as ApiError
      setError(e2.message)
      setFields(e2.fields ?? {})
    } finally {
      setBusy(false)
    }
  }

  const submitCode = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const code = String(new FormData(e.currentTarget).get('code') ?? '').replace(/\D/g, '')
    if (code.length !== 6) {
      setFields({ code: 'Enter the 6-digit code from the email.' })
      return
    }
    setFields({})
    run(() => verify(pending!.email, code, pending!.fromSignup))
  }

  const resend = () =>
    run(async () => {
      await resendCode(pending!.email)
      setNotice(`We sent a new code to ${pending!.email}.`)
      setCooldown(60)
    })

  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const f = new FormData(e.currentTarget)
    const name = String(f.get('name') ?? '').trim()
    const email = String(f.get('email') ?? '').trim()
    const password = String(f.get('password') ?? '')
    const local: Record<string, string> = {}
    if (mode === 'signup' && !name) local.name = 'Enter your name.'
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) local.email = 'Enter a valid email address.'
    if (password.length < 8) local.password = mode === 'signup' ? 'Use at least 8 characters.' : 'Passwords are at least 8 characters.'
    setFields(local)
    setError('')
    if (Object.keys(local).length) return
    await run(async () => {
      const step = mode === 'signin' ? await login(email, password) : await signup(name, email, password)
      if (step.verify) {
        setPending({ email: step.verify, fromSignup: mode === 'signup' })
        setMode('verify')
        setCooldown(60)
      }
    })
  }

  const switchMode = (m: Mode) => {
    setMode(m)
    setError('')
    setNotice('')
    setFields({})
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-bg/60 px-4 backdrop-blur-md" onMouseDown={close}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="auth-title"
        onMouseDown={(e) => e.stopPropagation()}
        className="expand w-full max-w-sm rounded-xl border border-line bg-surface p-6 shadow-panel"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <LogoMark size={36} />
            <h2 id="auth-title" className="mt-4 text-xl font-semibold tracking-[-0.015em] text-fg">
              {mode === 'verify' ? 'Check your email' : mode === 'signin' ? 'Sign in to continue' : 'Create your account'}
            </h2>
            <p className="mt-1 text-sm text-muted">
              {mode === 'verify' ? (
                <>
                  We sent a 6-digit code to <span className="font-medium text-fg">{pending?.email}</span>. Enter it to confirm the
                  email is yours. Check your spam folder if you don't see it.
                </>
              ) : (
                (reason ?? 'Create a free OfferForge account to save bookmarks, track solved questions and keep your code.')
              )}
            </p>
          </div>
          <button onClick={close} aria-label="Close" className="grid size-8 shrink-0 place-items-center rounded-lg text-subtle hover:bg-surface-2 hover:text-fg">
            <XIcon size={16} />
          </button>
        </div>

        {mode === 'verify' ? (
          <form onSubmit={submitCode} noValidate className="mt-5 grid gap-4">
            <Field ref={firstRef} label="Verification code" name="code" type="text" inputMode="numeric" autoComplete="one-time-code" maxLength={6} error={fields.code} />
            {notice && <p className="rounded-lg border border-line bg-surface-2 px-3 py-2 text-sm text-muted">{notice}</p>}
            {error && (
              <p role="alert" className="rounded-lg border border-hard/30 bg-hard/10 px-3 py-2 text-sm text-hard">
                {error}
              </p>
            )}
            <button
              type="submit"
              disabled={busy}
              className="flex h-10 items-center justify-center gap-2 rounded-lg bg-accent text-sm font-medium text-accent-fg transition-[background-color,transform] hover:bg-accent-hover active:scale-[0.98] disabled:opacity-70"
            >
              {busy && <CircleNotchIcon size={16} className="animate-spin" />}
              Verify and continue
            </button>
            <div className="flex items-center justify-between text-sm">
              <button type="button" onClick={() => switchMode(pending?.fromSignup ? 'signup' : 'signin')} className="text-muted hover:text-fg">
                Use a different email
              </button>
              <button type="button" onClick={resend} disabled={busy || cooldown > 0} className="font-medium text-accent-ink hover:underline disabled:text-subtle disabled:no-underline">
                {cooldown > 0 ? `Resend in ${cooldown}s` : 'Resend code'}
              </button>
            </div>
          </form>
        ) : (
          <>
        <div role="tablist" aria-label="Account" className="mt-5 grid grid-cols-2 rounded-lg border border-line bg-surface-2 p-0.5">
          {(['signin', 'signup'] as const).map((m) => (
            <button
              key={m}
              role="tab"
              aria-selected={mode === m}
              onClick={() => switchMode(m)}
              className={'rounded-md py-1.5 text-sm font-medium transition-colors ' + (mode === m ? 'bg-surface text-fg shadow-panel' : 'text-muted hover:text-fg')}
            >
              {m === 'signin' ? 'Sign in' : 'Sign up'}
            </button>
          ))}
        </div>

        <div className="mt-5">
          <GoogleButton onCredential={(credential) => run(() => googleSignIn(credential))} />
        </div>
        <form onSubmit={submit} noValidate className="mt-4 grid gap-4">
          {mode === 'signup' && <Field ref={firstRef} label="Name" name="name" autoComplete="name" error={fields.name} />}
          <Field ref={mode === 'signin' ? firstRef : undefined} label="Email" name="email" type="email" autoComplete="email" error={fields.email} />
          <Field
            label="Password"
            name="password"
            type="password"
            autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
            hint={mode === 'signup' ? 'At least 8 characters.' : undefined}
            error={fields.password}
          />
          {error && (
            <p role="alert" className="rounded-lg border border-hard/30 bg-hard/10 px-3 py-2 text-sm text-hard">
              {error}
            </p>
          )}
          <button
            type="submit"
            disabled={busy}
            className="mt-1 flex h-10 items-center justify-center gap-2 rounded-lg bg-accent text-sm font-medium text-accent-fg transition-[background-color,transform] hover:bg-accent-hover active:scale-[0.98] disabled:opacity-70"
          >
            {busy && <CircleNotchIcon size={16} className="animate-spin" />}
            {mode === 'signin' ? 'Sign in' : 'Create account'}
          </button>
        </form>
        <p className="mt-4 text-center text-sm text-muted">
          {mode === 'signin' ? 'New here? ' : 'Already have an account? '}
          <button onClick={() => switchMode(mode === 'signin' ? 'signup' : 'signin')} className="font-medium text-accent-ink hover:underline">
            {mode === 'signin' ? 'Create an account' : 'Sign in'}
          </button>
        </p>
          </>
        )}
      </div>
    </div>
  )
}

function Field({
  label,
  name,
  type = 'text',
  autoComplete,
  error,
  hint,
  ref,
  inputMode,
  maxLength,
}: {
  label: string
  name: string
  type?: string
  autoComplete: string
  error?: string
  hint?: string
  ref?: React.Ref<HTMLInputElement>
  inputMode?: 'numeric'
  maxLength?: number
}) {
  const id = `auth-${name}`
  return (
    <div className="grid gap-1.5">
      <label htmlFor={id} className="text-sm font-medium text-fg">
        {label}
      </label>
      <input
        ref={ref}
        id={id}
        name={name}
        type={type}
        autoComplete={autoComplete}
        inputMode={inputMode}
        maxLength={maxLength}
        spellCheck={false}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? `${id}-err` : hint ? `${id}-hint` : undefined}
        className={
          'h-10 rounded-lg border bg-surface px-3 text-sm text-fg outline-none transition-colors focus-visible:ring-2 focus-visible:ring-accent/25 ' +
          (error ? 'border-hard' : 'border-line hover:border-line-strong focus-visible:border-accent')
        }
      />
      {error ? (
        <p id={`${id}-err`} className="text-xs text-hard">
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className="text-xs text-subtle">
          {hint}
        </p>
      ) : null}
    </div>
  )
}

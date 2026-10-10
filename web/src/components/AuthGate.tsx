import { LockSimpleIcon } from '@phosphor-icons/react'
import { useEffect, type ReactNode } from 'react'
import { useAccount } from '../lib/account'

/** Renders children only for signed-in users; otherwise shows a locked preview and the sign-in dialog. */
export function AuthGate({ children, title }: { children: ReactNode; title: string }) {
  const { status, requestAuth } = useAccount()

  useEffect(() => {
    if (status === 'anonymous') requestAuth({ reason: `Sign in or create a free account to open ${title}.`, required: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, title])

  if (status === 'signed-in') return children
  return (
    <div className="mx-auto max-w-xl pt-24 text-center" aria-busy={status === 'loading'}>
      {status === 'loading' ? (
        <div className="space-y-3">
          <div className="skeleton mx-auto h-10 w-2/3" />
          <div className="skeleton mx-auto h-5 w-1/2" />
        </div>
      ) : (
        <>
          <span className="mx-auto grid size-12 place-items-center rounded-xl border border-line bg-surface-2 text-subtle">
            <LockSimpleIcon size={22} />
          </span>
          <h1 className="mt-5 text-2xl font-semibold tracking-[-0.015em] text-fg">{title} is for signed-in users</h1>
          <p className="mt-2 text-muted">An account keeps your bookmarks, solved questions and code in one place.</p>
          <button
            onClick={() => requestAuth({ reason: `Sign in or create a free account to open ${title}.`, required: true })}
            className="mt-6 h-10 rounded-lg bg-accent px-5 text-sm font-medium text-accent-fg transition-[background-color,transform] hover:bg-accent-hover active:scale-[0.98]"
          >
            Sign in to continue
          </button>
        </>
      )}
    </div>
  )
}

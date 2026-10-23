import posthog from 'posthog-js'

// Product analytics (PostHog). Off unless VITE_POSTHOG_KEY is set at build time, so local dev sends nothing.
// Events go through our own server at /ingest (see server/src/index.js), which keeps ad blockers from dropping them
// and keeps the CSP at 'self'. Only the numeric user id is sent: never emails or names.
const KEY = import.meta.env.VITE_POSTHOG_KEY as string | undefined
const enabled = Boolean(KEY)

if (enabled) {
  posthog.init(KEY!, {
    api_host: '/ingest',
    ui_host: import.meta.env.VITE_POSTHOG_UI_HOST ?? 'https://us.posthog.com',
    defaults: '2026-01-30',
    capture_pageview: 'history_change', // single-page app: count each route change as a page view
    person_profiles: 'identified_only',
    disable_session_recording: true,
  })
}

export function identify(userId: number) {
  if (enabled) posthog.identify(String(userId))
}

export function track(event: string, props?: Record<string, string | number | boolean>) {
  if (enabled) posthog.capture(event, props)
}

export function resetIdentity() {
  if (enabled) posthog.reset()
}

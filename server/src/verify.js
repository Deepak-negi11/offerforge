// Email ownership: one-time codes sent by email, a domain check that rejects addresses that can't receive mail,
// and Google ID-token verification for "Continue with Google".
import { createHash, randomInt } from 'node:crypto'
import { Resolver } from 'node:dns/promises'
import { createRequire } from 'node:module'
import { db } from './db.js'

const IS_PROD = process.env.NODE_ENV === 'production'
const RESEND_KEY = process.env.RESEND_API_KEY
const EMAIL_FROM = process.env.EMAIL_FROM ?? 'OfferForge <noreply@orbit8.tech>'
export const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID ?? ''

// In production, verification turns on once a mail provider is configured; until then sign-up works as before.
// Locally and in tests it is always on, and codes are printed to the server log instead of emailed.
export const VERIFY_EMAIL = Boolean(RESEND_KEY) || !IS_PROD

export const CODE_TTL_MIN = 15
const MAX_ATTEMPTS = 5
const sha256 = (s) => createHash('sha256').update(s).digest('hex')
const codeHash = (userId, code) => sha256(`${userId}:${code}`)

/** Creates a fresh code for the user (replacing any earlier one) and emails it. */
export async function issueCode(userId, email) {
  const code = String(randomInt(0, 1_000_000)).padStart(6, '0')
  await db.run(
    `INSERT INTO email_codes (user_id, code_hash, expires_at, attempts) VALUES (?, ?, datetime('now', ?), 0)
     ON CONFLICT(user_id) DO UPDATE SET code_hash = excluded.code_hash, expires_at = excluded.expires_at, attempts = 0, sent_at = datetime('now')`,
    userId,
    codeHash(userId, code),
    `+${CODE_TTL_MIN} minutes`,
  )
  await sendCode(email, code)
}

/** 'ok' when the code matches; otherwise 'wrong' (attempt counted), 'expired' or 'locked' (too many attempts). */
export async function checkCode(userId, code) {
  const row = await db.get(`SELECT code_hash, attempts, expires_at > datetime('now') AS live FROM email_codes WHERE user_id = ?`, userId)
  if (!row || !row.live) return 'expired'
  if (row.attempts >= MAX_ATTEMPTS) return 'locked'
  if (/^\d{6}$/.test(code) && row.code_hash === codeHash(userId, code)) {
    await db.run('DELETE FROM email_codes WHERE user_id = ?', userId)
    return 'ok'
  }
  await db.run('UPDATE email_codes SET attempts = attempts + 1 WHERE user_id = ?', userId)
  return 'wrong'
}

async function sendCode(to, code) {
  const subject = `${code} is your OfferForge code`
  const text = `Your OfferForge verification code is ${code}.\n\nIt expires in ${CODE_TTL_MIN} minutes. If you didn't try to sign up, ignore this email.`
  if (!RESEND_KEY) {
    if (IS_PROD) throw new Error('Email sending is not configured')
    console.log(`[dev-mail] verification code for ${to}: ${code}`)
    return
  }
  const html = `<div style="font-family:system-ui,sans-serif;font-size:15px;color:#111">
    <p>Your OfferForge verification code is</p>
    <p style="font-size:28px;font-weight:600;letter-spacing:6px;margin:12px 0">${code}</p>
    <p style="color:#555">It expires in ${CODE_TTL_MIN} minutes. If you didn't try to sign up, ignore this email.</p></div>`
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${RESEND_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: EMAIL_FROM, to: [to], subject, text, html }),
    signal: AbortSignal.timeout(10_000),
  })
  if (!r.ok) throw new Error(`Resend rejected the email (${r.status})`)
}

// ---------- domain check ----------
const DISPOSABLE = new Set(createRequire(import.meta.url)('disposable-email-domains/index.json'))
const resolver = new Resolver({ timeout: 3000, tries: 2 })
const mxCache = new Map() // domain -> { ok, at }

/** Returns an error message when the address can't be a real mailbox, or null when it looks deliverable. */
export async function emailProblem(email) {
  const domain = email.split('@')[1]
  if (DISPOSABLE.has(domain) || DISPOSABLE.has(domain.split('.').slice(-2).join('.'))) {
    return 'Temporary email addresses are not allowed. Use your personal or college email.'
  }
  if (process.env.NODE_ENV === 'test') return null
  const cached = mxCache.get(domain)
  if (cached && Date.now() - cached.at < 6 * 3600_000) return cached.ok ? null : NO_MAIL
  let ok
  try {
    const mx = await resolver.resolveMx(domain)
    ok = mx.some((r) => r.exchange && r.exchange !== '.') // a "null MX" means the domain accepts no mail
  } catch (e) {
    if (e.code === 'ENOTFOUND' || e.code === 'ENODATA') ok = false
    else return null // DNS trouble on our side: don't block a possibly real address
  }
  if (mxCache.size > 10_000) mxCache.clear()
  mxCache.set(domain, { ok, at: Date.now() })
  return ok ? null : NO_MAIL
}
const NO_MAIL = "This email domain can't receive mail. Check for a typo."

// ---------- Google ----------
/**
 * Checks a Google OAuth access token from the sign-in popup and returns the account it belongs to. Google's tokeninfo
 * must confirm the token was issued to OUR client id (so a token minted for another app can't be replayed here), and
 * the userinfo endpoint supplies the verified email and name.
 */
export async function verifyGoogleAccessToken(accessToken) {
  if (!/^[\w.\-~+/]{20,4096}={0,2}$/.test(accessToken)) throw new Error('malformed token')
  const opts = { signal: AbortSignal.timeout(8000) }
  const info = await fetch(`https://oauth2.googleapis.com/tokeninfo?access_token=${encodeURIComponent(accessToken)}`, opts)
  if (!info.ok) throw new Error('token rejected by Google')
  const t = await info.json()
  if (t.aud !== GOOGLE_CLIENT_ID && t.azp !== GOOGLE_CLIENT_ID) throw new Error('token was issued to another app')
  const ui = await fetch('https://openidconnect.googleapis.com/v1/userinfo', { ...opts, headers: { Authorization: `Bearer ${accessToken}` } })
  if (!ui.ok) throw new Error('userinfo failed')
  const u = await ui.json()
  if (!u.sub || u.sub !== t.sub || !u.email || u.email_verified !== true) throw new Error('Google account email is not verified')
  return { sub: String(u.sub), email: String(u.email).toLowerCase(), name: String(u.name ?? u.given_name ?? '').slice(0, 60) }
}

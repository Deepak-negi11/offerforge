import { createHash, randomBytes, scrypt as scryptCb, timingSafeEqual } from 'node:crypto'
import { promisify } from 'node:util'
import { db } from './db.js'

const scrypt = promisify(scryptCb)
// OWASP guidance: N=2^17, r=8, p=1. The hash string records its own parameters, so N can change later.
const SCRYPT = { N: 131072, r: 8, p: 1, keylen: 64 }
const MAXMEM = 256 * 1024 * 1024
export const COOKIE = 'ia_session'
export const SESSION_DAYS = 30

export async function hashPassword(password) {
  const salt = randomBytes(16)
  const key = await scrypt(password, salt, SCRYPT.keylen, { N: SCRYPT.N, r: SCRYPT.r, p: SCRYPT.p, maxmem: MAXMEM })
  return ['scrypt', SCRYPT.N, SCRYPT.r, SCRYPT.p, salt.toString('base64'), key.toString('base64')].join('$')
}

export async function verifyPassword(password, stored) {
  const [alg, N, r, p, salt, hash] = stored.split('$')
  if (alg !== 'scrypt') return false
  const expected = Buffer.from(hash, 'base64')
  const key = await scrypt(password, Buffer.from(salt, 'base64'), expected.length, { N: +N, r: +r, p: +p, maxmem: MAXMEM })
  return timingSafeEqual(key, expected)
}

// A fixed hash so login takes the same time whether or not the email exists.
const DUMMY_HASH = await hashPassword(randomBytes(16).toString('hex'))
export const dummyVerify = (password) => verifyPassword(password, DUMMY_HASH)

const sha256 = (s) => createHash('sha256').update(s).digest('hex')

const MAX_SESSIONS_PER_USER = 10

export async function createSession(userId) {
  const token = randomBytes(32).toString('base64url')
  await db.run(`INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, datetime('now', ?))`, sha256(token), userId, `+${SESSION_DAYS} days`)
  // Keep only the newest sessions per user.
  await db.run(
    `DELETE FROM sessions WHERE user_id = ? AND token_hash NOT IN
       (SELECT token_hash FROM sessions WHERE user_id = ? ORDER BY created_at DESC, rowid DESC LIMIT ?)`,
    userId,
    userId,
    MAX_SESSIONS_PER_USER,
  )
  return token
}

export async function destroySession(token) {
  if (token) await db.run('DELETE FROM sessions WHERE token_hash = ?', sha256(token))
}

export async function userForToken(token) {
  if (!token) return null
  return db.get(
    `SELECT u.id, u.email, u.name FROM sessions s JOIN users u ON u.id = s.user_id
     WHERE s.token_hash = ? AND s.expires_at > datetime('now')`,
    sha256(token),
  )
}

export function readCookie(req, name) {
  const header = req.headers.cookie ?? ''
  for (const part of header.split(';')) {
    const [k, ...v] = part.trim().split('=')
    // Tokens are base64url, so no decoding is needed; anything else is simply not a valid session.
    if (k === name) return /^[A-Za-z0-9_-]{20,100}$/.test(v.join('=')) ? v.join('=') : null
  }
  return null
}

export function sessionCookie(token, { clear = false } = {}) {
  const attrs = [
    `${COOKIE}=${clear ? '' : token}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${clear ? 0 : SESSION_DAYS * 86400}`,
  ]
  // Secure unless explicitly running in development or tests over plain http.
  if (!['development', 'test'].includes(process.env.NODE_ENV ?? '')) attrs.push('Secure')
  return attrs.join('; ')
}

/** Fixed-window limiter; good enough for a single-process deploy. Keys are hashed so their size is bounded. */
const hits = new Map()
const MAX_KEYS = 100_000
export function rateLimit(rawKey, limit, windowMs) {
  const now = Date.now()
  const key = sha256(rawKey)
  if (!hits.has(key) && hits.size >= MAX_KEYS) return false // under a flood, refuse new keys rather than grow
  const entry = hits.get(key)
  if (!entry || entry.reset < now) {
    hits.set(key, { count: 1, reset: now + windowMs })
    return true
  }
  entry.count++
  return entry.count <= limit
}
setInterval(() => {
  const now = Date.now()
  for (const [k, v] of hits) if (v.reset < now) hits.delete(k)
}, 60_000).unref()
setInterval(() => db.run(`DELETE FROM sessions WHERE expires_at < datetime('now')`).catch((e) => console.error(`session purge failed: ${e.message}`)), 60 * 60_000).unref()

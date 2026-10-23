import express from 'express'
import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import {
  COOKIE,
  createSession,
  destroySession,
  dummyVerify,
  hashPassword,
  rateLimit,
  destroyUserSessions,
  readCookie,
  sessionCookie,
  userForToken,
  verifyPassword,
} from './auth.js'
import { db } from './db.js'
import { checkCode, emailProblem, GOOGLE_CLIENT_ID, issueCode, VERIFY_EMAIL, verifyGoogleToken } from './verify.js'

const PORT = Number(process.env.PORT ?? 8787)
const PISTON_URL = process.env.PISTON_URL?.replace(/\/$/, '') // e.g. http://localhost:2000
const DIST = fileURLToPath(new URL('../../web/dist', import.meta.url))

const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS ?? '').split(',').map((s) => s.trim()).filter(Boolean)
const IS_PROD = process.env.NODE_ENV === 'production'

// Known question ids, so users can't store progress for arbitrary ids.
const DATASET = fileURLToPath(new URL('../../web/public/data/atlas.json', import.meta.url))
let questionIds = null
function knownQuestion(id) {
  if (questionIds === null && existsSync(DATASET)) {
    questionIds = new Set(JSON.parse(readFileSync(DATASET, 'utf8')).questions.map((q) => q.id))
  }
  return questionIds === null || questionIds.has(id)
}

const app = express()
app.disable('x-powered-by')
// TRUST_PROXY is the number of reverse proxies in front of the app. Trusting "all" would let clients spoof req.ip.
const hops = Number(process.env.TRUST_PROXY)
app.set('trust proxy', Number.isInteger(hops) && hops > 0 ? hops : false)

app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin')
  res.setHeader('X-Frame-Options', 'DENY')
  if (IS_PROD) res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains')
  if (req.path.startsWith('/api')) res.setHeader('Cache-Control', 'no-store')
  next()
})
// ---------- analytics proxy ----------
// PostHog events are sent to /ingest on our own domain and forwarded here, so ad blockers (Brave blocks
// *.posthog.com) don't drop them and the CSP stays 'self'. Mounted before express.json: bodies are passed through raw.
const POSTHOG = process.env.POSTHOG_REGION === 'eu'
  ? { api: 'https://eu.i.posthog.com', assets: 'https://eu-assets.i.posthog.com' }
  : { api: 'https://us.i.posthog.com', assets: 'https://us-assets.i.posthog.com' }
app.use('/ingest', express.raw({ type: () => true, limit: '2mb' }), async (req, res) => {
  if (!rateLimit(`ingest:${req.ip}`, 600, 60_000)) return res.status(429).end()
  const target = (req.path.startsWith('/static/') ? POSTHOG.assets : POSTHOG.api) + req.originalUrl.slice('/ingest'.length)
  const headers = { 'user-agent': req.headers['user-agent'] ?? '', 'x-forwarded-for': req.ip ?? '' }
  if (req.headers['content-type']) headers['content-type'] = req.headers['content-type']
  try {
    const r = await fetch(target, {
      method: req.method,
      headers,
      body: req.method === 'GET' || req.method === 'HEAD' || !req.body?.length ? undefined : req.body,
      signal: AbortSignal.timeout(10_000),
    })
    res.status(r.status)
    for (const h of ['content-type', 'cache-control']) if (r.headers.get(h)) res.setHeader(h, r.headers.get(h))
    res.send(Buffer.from(await r.arrayBuffer()))
  } catch {
    res.status(502).end()
  }
})

app.use(express.json({ limit: '256kb' }))

// CSRF: the session cookie is SameSite=Lax, and every state-changing request must be JSON
// from our own origin. Cross-site forms can't send application/json without a CORS preflight.
app.use('/api', (req, res, next) => {
  if (req.method === 'GET' || req.method === 'HEAD') return next()
  if (!req.is('application/json')) return res.status(415).json({ error: 'Expected application/json' })
  if (req.headers['sec-fetch-site'] === 'cross-site') return res.status(403).json({ error: 'Cross-origin request blocked' })
  const origin = req.headers.origin
  if (origin) {
    let ok = false
    try {
      const u = new URL(origin)
      ok = ALLOWED_ORIGINS.length ? ALLOWED_ORIGINS.includes(u.origin) : u.host === req.headers.host
    } catch {
      ok = false // "null" or malformed Origin
    }
    if (!ok) return res.status(403).json({ error: 'Cross-origin request blocked' })
  }
  next()
})

app.use('/api', async (req, _res, next) => {
  req.token = readCookie(req, COOKIE)
  req.user = await userForToken(req.token, { verifiedOnly: VERIFY_EMAIL })
  next()
})

const requireUser = (req, res, next) => (req.user ? next() : res.status(401).json({ error: 'Sign in to continue' }))
const writeLimit = (req, res, next) =>
  rateLimit(`write:${req.user.id}`, 240, 60_000) ? next() : res.status(429).json({ error: 'Too many saves in a minute. Slow down a little.' })
const QUOTA = { bookmarks: 5000, solved: 5000, drafts: 2000 }
const overQuota = async (table, userId) => (await db.get(`SELECT COUNT(*) AS n FROM ${table} WHERE user_id = ?`, userId)).n >= QUOTA[table]
const QID = /^[a-f0-9]{10}$/
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const LANGS = new Set(['javascript', 'python', 'cpp', 'java', 'notes'])

app.get('/api/health', (_req, res) => res.json({ ok: true, runner: Boolean(PISTON_URL) }))

// ---------- auth ----------
// With email verification on, an email account can't get a session until its owner types the code we email.
const ALREADY = { error: 'An account with this email already exists. Sign in instead.', fields: { email: 'Already registered.' } }

async function startSession(req, res, user, status = 200, extra = {}) {
  await destroySession(req.token) // don't leave the previous session behind on this browser
  res.setHeader('Set-Cookie', sessionCookie(await createSession(user.id)))
  res.status(status).json({ user: { id: user.id, email: user.email, name: user.name }, ...extra })
}

/** Sends a code unless one went out in the last minute; caps codes per email and per IP. */
async function sendVerification(req, user) {
  if (!rateLimit(`code-ip:${req.ip}`, 20, 60 * 60_000) || !rateLimit(`code:${user.email}`, 5, 60 * 60_000)) return 'limited'
  const recent = await db.get(`SELECT 1 FROM email_codes WHERE user_id = ? AND sent_at > datetime('now', '-60 seconds') AND expires_at > datetime('now')`, user.id)
  if (recent) return 'recent'
  await issueCode(user.id, user.email)
  return 'sent'
}

app.post('/api/auth/signup', async (req, res) => {
  if (!rateLimit(`signup:${req.ip}`, 10, 60 * 60_000)) return res.status(429).json({ error: 'Too many sign-up attempts. Try again in an hour.' })
  const name = String(req.body?.name ?? '').trim()
  const email = String(req.body?.email ?? '').trim().toLowerCase()
  const password = String(req.body?.password ?? '')
  const errors = {}
  if (!name || name.length > 60) errors.name = 'Enter your name (up to 60 characters).'
  if (!EMAIL.test(email) || email.length > 254) errors.email = 'Enter a valid email address.'
  if (password.length < 8 || password.length > 128) errors.password = 'Use 8 to 128 characters.'
  if (!errors.email) {
    const problem = await emailProblem(email)
    if (problem) errors.email = problem
  }
  if (Object.keys(errors).length) return res.status(400).json({ error: 'Check the highlighted fields.', fields: errors })

  const existing = await db.get('SELECT id, email, name, email_verified FROM users WHERE email = ?', email)
  if (existing && (existing.email_verified || !VERIFY_EMAIL)) return res.status(409).json(ALREADY)
  const hash = await hashPassword(password)
  let user
  if (existing) {
    // Nobody has proved they own this address yet, so a new sign-up replaces the unconfirmed one
    // (otherwise anyone could squat an email they don't own).
    await db.run('UPDATE users SET name = ?, password_hash = ? WHERE id = ?', name, hash, existing.id)
    await destroyUserSessions(existing.id)
    user = { id: existing.id, email, name }
  } else {
    try {
      const { lastInsertRowid } = await db.run('INSERT INTO users (email, name, password_hash, email_verified) VALUES (?, ?, ?, ?)', email, name, hash, VERIFY_EMAIL ? 0 : 1)
      user = { id: lastInsertRowid, email, name }
    } catch (e) {
      if (String(e.message).includes('UNIQUE')) return res.status(409).json(ALREADY)
      throw e
    }
  }
  if (!VERIFY_EMAIL) return startSession(req, res, user, 201)
  try {
    if ((await sendVerification(req, user)) === 'limited') return res.status(429).json({ error: 'Too many codes sent. Try again in an hour.' })
  } catch (e) {
    console.error(`verification email failed: ${e.message}`)
    return res.status(502).json({ error: "We couldn't send the verification email. Try again in a minute." })
  }
  res.status(202).json({ needsVerification: true, email })
})

app.post('/api/auth/login', async (req, res) => {
  const email = String(req.body?.email ?? '').trim().toLowerCase()
  const password = String(req.body?.password ?? '')
  if (email.length > 254 || password.length > 128) return res.status(401).json({ error: 'Email or password is incorrect.' })
  // Per-IP cap stops spraying many emails; per-IP+email cap stops guessing one account.
  if (!rateLimit(`login-ip:${req.ip}`, 30, 15 * 60_000) || !rateLimit(`login:${req.ip}:${email}`, 8, 15 * 60_000)) {
    return res.status(429).json({ error: 'Too many attempts. Wait 15 minutes and try again.' })
  }
  const row = await db.get('SELECT id, email, name, password_hash, email_verified, google_sub FROM users WHERE email = ?', email)
  const ok = row ? await verifyPassword(password, row.password_hash) : (await dummyVerify(password), false)
  if (!ok) {
    if (row?.google_sub && !row.password_hash.startsWith('scrypt$')) return res.status(401).json({ error: 'This account uses Google. Use "Continue with Google".' })
    return res.status(401).json({ error: 'Email or password is incorrect.' })
  }
  if (VERIFY_EMAIL && !row.email_verified) {
    try {
      if ((await sendVerification(req, row)) === 'limited') return res.status(429).json({ error: 'Too many codes sent. Try again in an hour.' })
    } catch (e) {
      console.error(`verification email failed: ${e.message}`)
      return res.status(502).json({ error: "We couldn't send the verification email. Try again in a minute." })
    }
    return res.json({ needsVerification: true, email: row.email })
  }
  await startSession(req, res, row)
})

app.post('/api/auth/verify', async (req, res) => {
  const email = String(req.body?.email ?? '').trim().toLowerCase()
  const code = String(req.body?.code ?? '').replace(/\s/g, '')
  if (!rateLimit(`verify-ip:${req.ip}`, 30, 15 * 60_000)) return res.status(429).json({ error: 'Too many attempts. Wait 15 minutes and try again.' })
  const row = email.length <= 254 ? await db.get('SELECT id, email, name, email_verified FROM users WHERE email = ?', email) : null
  if (!row) return res.status(400).json({ error: 'That code is wrong or has expired.' })
  if (row.email_verified) return res.status(400).json({ error: 'This email is already verified. Sign in instead.' })
  const result = await checkCode(row.id, code)
  if (result === 'locked') return res.status(400).json({ error: 'Too many wrong codes. Send a new code.' })
  if (result === 'expired') return res.status(400).json({ error: 'That code has expired. Send a new code.' })
  if (result === 'wrong') return res.status(400).json({ error: 'That code is wrong. Check the email and try again.' })
  await db.run('UPDATE users SET email_verified = 1 WHERE id = ?', row.id)
  await startSession(req, res, row)
})

app.post('/api/auth/resend', async (req, res) => {
  const email = String(req.body?.email ?? '').trim().toLowerCase()
  const row = email.length <= 254 ? await db.get('SELECT id, email, email_verified FROM users WHERE email = ?', email) : null
  if (!row || row.email_verified) return res.json({ ok: true }) // nothing to send; don't reveal more
  try {
    const r = await sendVerification(req, row)
    if (r === 'limited') return res.status(429).json({ error: 'Too many codes sent. Try again in an hour.' })
    if (r === 'recent') return res.status(429).json({ error: 'A code was sent less than a minute ago. Check your inbox and spam folder.' })
  } catch (e) {
    console.error(`verification email failed: ${e.message}`)
    return res.status(502).json({ error: "We couldn't send the email. Try again in a minute." })
  }
  res.json({ ok: true })
})

app.post('/api/auth/google', async (req, res) => {
  if (!GOOGLE_CLIENT_ID) return res.status(404).json({ error: 'Google sign-in is not set up.' })
  if (!rateLimit(`google:${req.ip}`, 30, 15 * 60_000)) return res.status(429).json({ error: 'Too many attempts. Wait 15 minutes and try again.' })
  let g
  try {
    g = await verifyGoogleToken(String(req.body?.credential ?? ''))
  } catch {
    return res.status(401).json({ error: 'Google sign-in failed. Try again.' })
  }
  let user = await db.get('SELECT id, email, name FROM users WHERE google_sub = ?', g.sub)
  if (user) return startSession(req, res, user)
  const byEmail = await db.get('SELECT id, email, name, email_verified FROM users WHERE email = ?', g.email)
  if (byEmail) {
    // Google has proved this person owns the address. If it was never verified, someone else may have chosen the
    // password, so it stops working and old sessions end; a verified account keeps its password.
    if (byEmail.email_verified) await db.run('UPDATE users SET google_sub = ? WHERE id = ?', g.sub, byEmail.id)
    else {
      await db.run(`UPDATE users SET google_sub = ?, email_verified = 1, password_hash = '!' WHERE id = ?`, g.sub, byEmail.id)
      await destroyUserSessions(byEmail.id)
    }
    return startSession(req, res, byEmail)
  }
  const name = g.name || g.email.split('@')[0]
  const { lastInsertRowid } = await db.run(`INSERT INTO users (email, name, password_hash, email_verified, google_sub) VALUES (?, ?, '!', 1, ?)`, g.email, name, g.sub)
  await startSession(req, res, { id: lastInsertRowid, email: g.email, name }, 201, { created: true })
})

app.post('/api/auth/logout', async (req, res) => {
  await destroySession(req.token)
  res.setHeader('Set-Cookie', sessionCookie('', { clear: true }))
  res.json({ ok: true })
})

app.get('/api/auth/me', (req, res) => res.json({ user: req.user }))
app.get('/api/auth/config', (_req, res) => res.json({ googleClientId: GOOGLE_CLIENT_ID || null, verifyEmail: VERIFY_EMAIL }))

// ---------- progress ----------
app.get('/api/progress', requireUser, async (req, res) => {
  const ids = async (table) => (await db.all(`SELECT question_id FROM ${table} WHERE user_id = ? ORDER BY created_at`, req.user.id)).map((r) => r.question_id)
  res.json({ bookmarks: await ids('bookmarks'), solved: await ids('solved') })
})

for (const table of ['bookmarks', 'solved']) {
  app.put(`/api/${table}/:qid`, requireUser, writeLimit, async (req, res) => {
    if (!QID.test(req.params.qid) || !knownQuestion(req.params.qid)) return res.status(400).json({ error: 'Unknown question id' })
    const on = req.body?.on === true
    if (on && (await overQuota(table, req.user.id))) return res.status(409).json({ error: `You have reached the limit of ${QUOTA[table]} ${table}.` })
    if (on) await db.run(`INSERT OR IGNORE INTO ${table} (user_id, question_id) VALUES (?, ?)`, req.user.id, req.params.qid)
    else await db.run(`DELETE FROM ${table} WHERE user_id = ? AND question_id = ?`, req.user.id, req.params.qid)
    res.json({ ok: true })
  })
}

// ---------- drafts ----------
app.get('/api/drafts/:qid', requireUser, async (req, res) => {
  if (!QID.test(req.params.qid)) return res.status(400).json({ error: 'Unknown question id' })
  const rows = await db.all('SELECT language, code, tests, updated_at FROM drafts WHERE user_id = ? AND question_id = ?', req.user.id, req.params.qid)
  res.json({ drafts: rows.map((r) => ({ ...r, tests: JSON.parse(r.tests) })) })
})

app.put('/api/drafts/:qid/:language', requireUser, writeLimit, async (req, res) => {
  const { qid, language } = req.params
  if (!QID.test(qid) || !knownQuestion(qid) || !LANGS.has(language)) return res.status(400).json({ error: 'Unknown question or language' })
  const exists = await db.get('SELECT 1 FROM drafts WHERE user_id = ? AND question_id = ? AND language = ?', req.user.id, qid, language)
  if (!exists && (await overQuota('drafts', req.user.id))) return res.status(409).json({ error: `You have reached the limit of ${QUOTA.drafts} saved drafts.` })
  const code = String(req.body?.code ?? '')
  const tests = Array.isArray(req.body?.tests) ? req.body.tests.slice(0, 20) : []
  if (code.length > 100_000) return res.status(413).json({ error: 'Draft is larger than 100 KB' })
  const cleanTests = tests.map((t) => ({ input: String(t?.input ?? '').slice(0, 10_000), expected: String(t?.expected ?? '').slice(0, 10_000) }))
  await db.run(
    `INSERT INTO drafts (user_id, question_id, language, code, tests, updated_at) VALUES (?, ?, ?, ?, ?, datetime('now'))
     ON CONFLICT (user_id, question_id, language) DO UPDATE SET code = excluded.code, tests = excluded.tests, updated_at = excluded.updated_at`,
    req.user.id,
    qid,
    language,
    code,
    JSON.stringify(cleanTests),
  )
  res.json({ ok: true })
})

// ---------- compiled-language runner (proxies a self-hosted Piston) ----------
const PISTON_LANG = new Map([
  ['cpp', 'c++'],
  ['java', 'java'],
])
const MAX_IN_FLIGHT = Number(process.env.RUNNER_CONCURRENCY ?? 4)
let inFlight = 0
app.post('/api/run', requireUser, async (req, res) => {
  const language = String(req.body?.language ?? '')
  if (!PISTON_LANG.has(language)) return res.status(400).json({ error: 'Only C++ and Java run on the server. JavaScript and Python run in your browser.' })
  if (!PISTON_URL) {
    return res.status(503).json({ error: 'The C++/Java runner is not set up. Start it with `docker compose up -d piston` and set PISTON_URL (see README).' })
  }
  if (!rateLimit(`run:${req.user.id}`, 30, 60_000)) return res.status(429).json({ error: 'Too many runs in a minute. Slow down a little.' })
  if (inFlight >= MAX_IN_FLIGHT) return res.status(503).json({ error: 'The runner is busy. Try again in a few seconds.' })
  const code = String(req.body?.code ?? '')
  const stdin = String(req.body?.stdin ?? '')
  if (code.length > 100_000 || stdin.length > 100_000) return res.status(413).json({ error: 'Code or input is too large' })
  inFlight++
  try {
    const r = await fetch(`${PISTON_URL}/api/v2/execute`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        language: PISTON_LANG.get(language),
        version: '*',
        files: [{ name: language === 'java' ? 'Main.java' : 'main.cpp', content: code }],
        stdin,
        compile_timeout: 10_000,
        run_timeout: 3_000,
        run_memory_limit: 256 * 1024 * 1024,
      }),
      signal: AbortSignal.timeout(20_000),
    })
    const data = await r.json()
    if (!r.ok) {
      console.error(`runner returned ${r.status}: ${data.message ?? ''}`)
      return res.status(502).json({ error: 'The code runner rejected this request. Check the language and try again.' })
    }
    res.json({
      compileError: data.compile?.code ? data.compile.stderr || data.compile.output : '',
      stdout: data.run?.stdout ?? '',
      stderr: data.run?.stderr ?? '',
      exitCode: data.run?.code ?? null,
      signal: data.run?.signal ?? null,
    })
  } catch (e) {
    console.error(`runner unreachable: ${e.message}`)
    res.status(502).json({ error: 'The code runner is unavailable right now. Try again shortly.' })
  } finally {
    inFlight--
  }
})

app.use('/api', (_req, res) => res.status(404).json({ error: 'Not found' }))

// ---------- static site (production) ----------
if (existsSync(DIST)) {
  // CSP: the only inline script is the theme bootstrap in index.html, allowed by hash.
  // Monaco and Pyodide load from jsDelivr; Python needs WebAssembly and the JS runner evaluates code in a worker.
  const html = readFileSync(`${DIST}/index.html`, 'utf8')
  const inline = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => `'sha256-${createHash('sha256').update(m[1]).digest('base64')}'`)
  const CDN = 'https://cdn.jsdelivr.net'
  const GSI = 'https://accounts.google.com/gsi/' // "Continue with Google" button (Google Identity Services)
  const csp = [
    "default-src 'self'",
    `script-src 'self' ${inline.join(' ')} ${CDN} ${GSI}client 'wasm-unsafe-eval' 'unsafe-eval'`,
    "worker-src 'self' blob:",
    `style-src 'self' 'unsafe-inline' ${CDN} ${GSI}style`,
    `font-src 'self' data: ${CDN}`,
    "img-src 'self' data: https://cdn.simpleicons.org https://*.googleusercontent.com",
    `frame-src ${GSI}`,
    `connect-src 'self' ${CDN} https://api.github.com ${GSI}`,
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
  ].join('; ')
  app.use((_req, res, next) => {
    res.setHeader('Content-Security-Policy', csp)
    next()
  })
  // Vite's /assets files have content hashes in their names, so they can be cached forever. /data changes on every
  // deploy without a name change, so browsers revalidate it each time (a cheap 304 when the ETag still matches).
  app.use(express.static(DIST, {
    index: false,
    maxAge: '1h',
    setHeaders(res, path) {
      if (path.includes('/assets/')) res.setHeader('Cache-Control', 'public, max-age=31536000, immutable')
      else if (path.includes('/data/')) res.setHeader('Cache-Control', 'no-cache')
    },
  }))
  app.get(/.*/, (_req, res) => res.sendFile(`${DIST}/index.html`))
}

app.use((err, req, res, _next) => {
  const status = err.status ?? err.statusCode ?? 500
  if (status < 500) {
    // Client errors (bad JSON, body too large): never log or echo the body, which may contain a password.
    console.warn(`${status} ${err.type ?? 'client-error'} ${req.method} ${req.path}`)
    return res.status(status).json({ error: err.type === 'entity.too.large' ? 'Request is too large.' : 'The request body is not valid JSON.' })
  }
  console.error(err)
  res.status(500).json({ error: 'Something went wrong on our side.' })
})

app.listen(PORT, () => console.log(`api listening on http://localhost:${PORT}${PISTON_URL ? ` (runner: ${PISTON_URL})` : ''}`))

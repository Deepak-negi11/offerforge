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
  readCookie,
  sessionCookie,
  userForToken,
  verifyPassword,
} from './auth.js'
import { db } from './db.js'

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
  req.user = await userForToken(req.token)
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
app.post('/api/auth/signup', async (req, res) => {
  if (!rateLimit(`signup:${req.ip}`, 10, 60 * 60_000)) return res.status(429).json({ error: 'Too many sign-up attempts. Try again in an hour.' })
  const name = String(req.body?.name ?? '').trim()
  const email = String(req.body?.email ?? '').trim().toLowerCase()
  const password = String(req.body?.password ?? '')
  const errors = {}
  if (!name || name.length > 60) errors.name = 'Enter your name (up to 60 characters).'
  if (!EMAIL.test(email) || email.length > 254) errors.email = 'Enter a valid email address.'
  if (password.length < 8 || password.length > 128) errors.password = 'Use 8 to 128 characters.'
  if (Object.keys(errors).length) return res.status(400).json({ error: 'Check the highlighted fields.', fields: errors })
  if (await db.get('SELECT 1 FROM users WHERE email = ?', email)) {
    return res.status(409).json({ error: 'An account with this email already exists. Sign in instead.', fields: { email: 'Already registered.' } })
  }
  let lastInsertRowid
  try {
    ;({ lastInsertRowid } = await db.run('INSERT INTO users (email, name, password_hash) VALUES (?, ?, ?)', email, name, await hashPassword(password)))
  } catch (e) {
    if (String(e.message).includes('UNIQUE')) return res.status(409).json({ error: 'An account with this email already exists. Sign in instead.', fields: { email: 'Already registered.' } })
    throw e
  }
  res.setHeader('Set-Cookie', sessionCookie(await createSession(lastInsertRowid)))
  res.status(201).json({ user: { id: lastInsertRowid, email, name } })
})

app.post('/api/auth/login', async (req, res) => {
  const email = String(req.body?.email ?? '').trim().toLowerCase()
  const password = String(req.body?.password ?? '')
  if (email.length > 254 || password.length > 128) return res.status(401).json({ error: 'Email or password is incorrect.' })
  // Per-IP cap stops spraying many emails; per-IP+email cap stops guessing one account.
  if (!rateLimit(`login-ip:${req.ip}`, 30, 15 * 60_000) || !rateLimit(`login:${req.ip}:${email}`, 8, 15 * 60_000)) {
    return res.status(429).json({ error: 'Too many attempts. Wait 15 minutes and try again.' })
  }
  const row = await db.get('SELECT id, email, name, password_hash FROM users WHERE email = ?', email)
  const ok = row ? await verifyPassword(password, row.password_hash) : (await dummyVerify(password), false)
  if (!ok) return res.status(401).json({ error: 'Email or password is incorrect.' })
  await destroySession(req.token) // don't leave the previous session behind on this browser
  res.setHeader('Set-Cookie', sessionCookie(await createSession(row.id)))
  res.json({ user: { id: row.id, email: row.email, name: row.name } })
})

app.post('/api/auth/logout', async (req, res) => {
  await destroySession(req.token)
  res.setHeader('Set-Cookie', sessionCookie('', { clear: true }))
  res.json({ ok: true })
})

app.get('/api/auth/me', (req, res) => res.json({ user: req.user }))

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
  const csp = [
    "default-src 'self'",
    `script-src 'self' ${inline.join(' ')} ${CDN} 'wasm-unsafe-eval' 'unsafe-eval'`,
    "worker-src 'self' blob:",
    `style-src 'self' 'unsafe-inline' ${CDN}`,
    `font-src 'self' data: ${CDN}`,
    "img-src 'self' data: https://cdn.simpleicons.org",
    `connect-src 'self' ${CDN} https://api.github.com`,
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
  ].join('; ')
  app.use((_req, res, next) => {
    res.setHeader('Content-Security-Policy', csp)
    next()
  })
  app.use(express.static(DIST, { index: false, maxAge: '1h' }))
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

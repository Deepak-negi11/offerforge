import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, before, test } from 'node:test'

const PORT = 8899
const IDS = JSON.parse(readFileSync(new URL('../../web/public/data/atlas.json', import.meta.url))).questions.map((q) => q.id)
const [Q1, Q2] = IDS
const BASE = `http://localhost:${PORT}`
let proc
let cookie = ''
let log = ''
/** The latest verification code the server "emailed" (in tests it prints codes instead of sending them). */
const codeFor = (email) => [...log.matchAll(new RegExp(`\\[dev-mail\\] verification code for ${email.replace('.', '\\.')}: (\\d{6})`, 'g'))].at(-1)?.[1]

before(async () => {
  const dir = mkdtempSync(join(tmpdir(), 'atlas-test-'))
  proc = spawn(process.execPath, ['src/index.js'], { env: { ...process.env, NODE_ENV: 'test', PORT: String(PORT), DB_PATH: join(dir, 'test.db') }, stdio: 'pipe' })
  proc.stdout.on('data', (d) => (log += d))
  for (let i = 0; i < 50; i++) {
    try { if ((await fetch(`${BASE}/api/health`)).ok) return } catch {}
    await new Promise((r) => setTimeout(r, 100))
  }
  throw new Error('server did not start')
})
after(() => proc.kill())

const call = async (method, path, body, extra = {}) => {
  const r = await fetch(BASE + path, {
    method,
    headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(cookie ? { cookie } : {}), ...extra },
    body: body ? JSON.stringify(body) : undefined,
  })
  const set = r.headers.get('set-cookie')
  if (set) cookie = set.split(';')[0]
  return { status: r.status, body: await r.json() }
}

test('signup validates fields', async () => {
  const r = await call('POST', '/api/auth/signup', { name: '', email: 'bad', password: 'short' })
  assert.equal(r.status, 400)
  assert.ok(r.body.fields.name && r.body.fields.email && r.body.fields.password)
})

test('disposable email domains are rejected', async () => {
  const r = await call('POST', '/api/auth/signup', { name: 'Temp', email: 'x@mailinator.com', password: 'correct-horse' })
  assert.equal(r.status, 400)
  assert.match(r.body.fields.email, /Temporary/)
})

test('signup needs the emailed code; unverified sign-ups can be replaced; duplicate email', async () => {
  const r = await call('POST', '/api/auth/signup', { name: 'Squatter', email: 'Asha@Example.com', password: 'squatter-pass' })
  assert.equal(r.status, 202)
  assert.deepEqual(r.body, { needsVerification: true, email: 'asha@example.com' })
  assert.equal((await call('GET', '/api/auth/me')).body.user, null, 'no session before verification')
  // The real owner signs up later: the unconfirmed account is taken over, and the squatter's code no longer works.
  const squatterCode = codeFor('asha@example.com')
  await new Promise((r) => setTimeout(r, 50))
  assert.equal((await call('POST', '/api/auth/signup', { name: 'Asha', email: 'asha@example.com', password: 'correct-horse' })).status, 202)
  const code = codeFor('asha@example.com')
  assert.ok(squatterCode && code)
  if (squatterCode !== code) assert.equal((await call('POST', '/api/auth/verify', { email: 'asha@example.com', code: squatterCode })).status, 400)
  assert.equal((await call('POST', '/api/auth/verify', { email: 'asha@example.com', code: code === '000000' ? '000001' : '000000' })).status, 400)
  const v = await call('POST', '/api/auth/verify', { email: 'asha@example.com', code })
  assert.equal(v.status, 200)
  assert.equal(v.body.user.email, 'asha@example.com')
  assert.equal((await call('GET', '/api/auth/me')).body.user.name, 'Asha')
  assert.equal((await call('POST', '/api/auth/verify', { email: 'asha@example.com', code })).status, 400, 'codes are single-use')
  const dup = await call('POST', '/api/auth/signup', { name: 'A', email: 'asha@example.com', password: 'another-pass' })
  assert.equal(dup.status, 409)
})

test('login of an unverified account asks for a code instead of signing in', async () => {
  const saved = cookie
  cookie = ''
  assert.equal((await call('POST', '/api/auth/signup', { name: 'Ravi', email: 'ravi@example.org', password: 'ravi-password' })).status, 202)
  const r = await call('POST', '/api/auth/login', { email: 'ravi@example.org', password: 'ravi-password' })
  assert.equal(r.status, 200)
  assert.equal(r.body.needsVerification, true)
  assert.equal(r.body.user, undefined)
  assert.equal((await call('GET', '/api/auth/me')).body.user, null)
  cookie = saved
})

test('bookmarks, solved and drafts round-trip', async () => {
  assert.equal((await call('PUT', `/api/bookmarks/${Q1}`, { on: true })).status, 200)
  assert.equal((await call('PUT', `/api/solved/${Q2}`, { on: true })).status, 200)
  const p = await call('GET', '/api/progress')
  assert.deepEqual(p.body, { bookmarks: [Q1], solved: [Q2] })
  await call('PUT', `/api/bookmarks/${Q1}`, { on: false })
  assert.deepEqual((await call('GET', '/api/progress')).body.bookmarks, [])
  await call('PUT', `/api/drafts/${Q1}/python`, { code: 'print(1)', tests: [{ input: '1', expected: '1' }] })
  const d = await call('GET', `/api/drafts/${Q1}`)
  assert.equal(d.body.drafts[0].code, 'print(1)')
  assert.equal(d.body.drafts[0].tests[0].expected, '1')
  assert.equal((await call('PUT', '/api/bookmarks/not-an-id', { on: true })).status, 400)
  assert.equal((await call('PUT', '/api/bookmarks/0000000000', { on: true })).status, 400, 'unknown but well-formed id is rejected')
})

test('rejects non-JSON and cross-origin writes', async () => {
  const r = await fetch(`${BASE}/api/bookmarks/${Q1}`, { method: 'PUT', headers: { cookie, 'Content-Type': 'text/plain' }, body: 'on' })
  assert.equal(r.status, 415)
  const x = await call('PUT', `/api/bookmarks/${Q1}`, { on: true }, { origin: 'https://evil.example' })
  assert.equal(x.status, 403)
})

test('logout ends session; wrong password rejected', async () => {
  await call('POST', '/api/auth/logout', {})
  assert.equal((await call('GET', '/api/auth/me')).body.user, null)
  assert.equal((await call('GET', '/api/progress')).status, 401)
  assert.equal((await call('POST', '/api/auth/login', { email: 'asha@example.com', password: 'wrong-password' })).status, 401)
  assert.equal((await call('POST', '/api/auth/login', { email: 'asha@example.com', password: 'correct-horse' })).status, 200)
})

test('run without runner configured explains setup', async () => {
  const r = await call('POST', '/api/run', { language: 'cpp', code: 'int main(){}' })
  assert.equal(r.status, 503)
  assert.match(r.body.error, /docker compose/)
})

test('malformed JSON is rejected without echoing the body', async () => {
  const r = await fetch(`${BASE}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"email":"a@b.c","password":"hunter2-secret' })
  assert.equal(r.status, 400)
  const text = await r.text()
  assert.ok(!text.includes('hunter2'), 'response must not echo the password')
})

test('cross-site fetch metadata and null Origin are blocked; bad cookies are ignored', async () => {
  assert.equal((await call('PUT', `/api/bookmarks/${Q1}`, { on: true }, { 'sec-fetch-site': 'cross-site' })).status, 403)
  assert.equal((await call('PUT', `/api/bookmarks/${Q1}`, { on: true }, { origin: 'null' })).status, 403)
  const r = await fetch(`${BASE}/api/auth/me`, { headers: { cookie: 'ia_session=%E0%A4%A' } })
  assert.equal(r.status, 200)
  assert.equal((await r.json()).user, null)
})

test('security headers are set and API responses are not cached', async () => {
  const r = await fetch(`${BASE}/api/health`)
  assert.equal(r.headers.get('x-content-type-options'), 'nosniff')
  assert.equal(r.headers.get('x-frame-options'), 'DENY')
  assert.equal(r.headers.get('cache-control'), 'no-store')
})

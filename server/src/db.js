import { createClient } from '@libsql/client'
import { mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'

// Hosted: set TURSO_DATABASE_URL (libsql://...) and TURSO_AUTH_TOKEN. Otherwise a local SQLite file at DB_PATH.
const REMOTE = process.env.TURSO_DATABASE_URL
let url = REMOTE
if (!REMOTE) {
  const path = resolve(process.env.DB_PATH ?? new URL('../data/atlas.db', import.meta.url).pathname)
  mkdirSync(dirname(path), { recursive: true })
  url = `file:${path}`
}
const client = createClient({ url, authToken: process.env.TURSO_AUTH_TOKEN })

// Rows come back as plain objects keyed by column name.
const plain = (rs) => rs.rows.map((row) => Object.fromEntries(rs.columns.map((c, i) => [c, row[i]])))

export const db = {
  async all(sql, ...args) {
    return plain(await client.execute({ sql, args }))
  },
  async get(sql, ...args) {
    return (await db.all(sql, ...args))[0] ?? null
  },
  async run(sql, ...args) {
    const rs = await client.execute({ sql, args })
    return { changes: rs.rowsAffected, lastInsertRowid: rs.lastInsertRowid === undefined ? undefined : Number(rs.lastInsertRowid) }
  },
}

if (!REMOTE) await client.executeMultiple('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;')
await client.executeMultiple(`
  CREATE TABLE IF NOT EXISTS users (
    id            INTEGER PRIMARY KEY,
    email         TEXT NOT NULL UNIQUE COLLATE NOCASE,
    name          TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    created_at    TEXT NOT NULL DEFAULT (datetime('now'))
  );

  -- Only the SHA-256 of a session token is stored; the raw token lives in the cookie.
  CREATE TABLE IF NOT EXISTS sessions (
    token_hash TEXT PRIMARY KEY,
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS sessions_user ON sessions(user_id);

  CREATE TABLE IF NOT EXISTS bookmarks (
    user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    question_id TEXT NOT NULL,
    created_at  TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (user_id, question_id)
  );

  CREATE TABLE IF NOT EXISTS solved (
    user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    question_id TEXT NOT NULL,
    created_at  TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (user_id, question_id)
  );

  -- language is a runner id (javascript, python, cpp, java) or 'notes' for written answers.
  CREATE TABLE IF NOT EXISTS drafts (
    user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    question_id TEXT NOT NULL,
    language    TEXT NOT NULL,
    code        TEXT NOT NULL,
    tests       TEXT NOT NULL DEFAULT '[]',
    updated_at  TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (user_id, question_id, language)
  );
`)

// Drop expired sessions on boot so the table doesn't grow forever.
await db.run(`DELETE FROM sessions WHERE expires_at < datetime('now')`)

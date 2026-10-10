import { mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { DatabaseSync } from 'node:sqlite'

const DB_PATH = resolve(process.env.DB_PATH ?? new URL('../data/atlas.db', import.meta.url).pathname)
mkdirSync(dirname(DB_PATH), { recursive: true })

export const db = new DatabaseSync(DB_PATH)
db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;

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
db.prepare(`DELETE FROM sessions WHERE expires_at < datetime('now')`).run()

import { mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { DatabaseSync, type SQLInputValue } from "node:sqlite";

export const DATA_DIR = resolve(process.env.DATA_DIR ?? join(process.cwd(), "data"));
export const UPLOAD_DIR = join(DATA_DIR, "uploads");

const SCHEMA = `
CREATE TABLE IF NOT EXISTS couples (
  id INTEGER PRIMARY KEY,
  invite_code TEXT UNIQUE,
  anniversary TEXT,
  wallpaper TEXT NOT NULL DEFAULT 'blush',
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  avatar_media_id INTEGER,
  partner_nickname TEXT,
  mood_emoji TEXT,
  mood_text TEXT,
  mood_at INTEGER,
  couple_id INTEGER REFERENCES couples(id) ON DELETE SET NULL,
  last_seen INTEGER,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS media (
  id INTEGER PRIMARY KEY,
  uploader_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  file TEXT NOT NULL,
  mime TEXT NOT NULL,
  name TEXT,
  size INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY,
  couple_id INTEGER NOT NULL REFERENCES couples(id) ON DELETE CASCADE,
  sender_id INTEGER NOT NULL,
  client_id TEXT,
  type TEXT NOT NULL,
  body TEXT,
  media_id INTEGER REFERENCES media(id) ON DELETE SET NULL,
  meta TEXT,
  reply_to INTEGER,
  view_once INTEGER NOT NULL DEFAULT 0,
  viewed_at INTEGER,
  edited_at INTEGER,
  deleted_at INTEGER,
  created_at INTEGER NOT NULL,
  delivered_at INTEGER,
  read_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_messages_couple ON messages(couple_id, id);
CREATE INDEX IF NOT EXISTS idx_messages_media ON messages(media_id);

CREATE TABLE IF NOT EXISTS message_hidden (
  message_id INTEGER NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL,
  PRIMARY KEY (message_id, user_id)
);

CREATE TABLE IF NOT EXISTS reactions (
  message_id INTEGER NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL,
  emoji TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (message_id, user_id)
);

CREATE TABLE IF NOT EXISTS stars (
  message_id INTEGER NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (message_id, user_id)
);

CREATE TABLE IF NOT EXISTS special_dates (
  id INTEGER PRIMARY KEY,
  couple_id INTEGER NOT NULL REFERENCES couples(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  date TEXT NOT NULL,
  emoji TEXT NOT NULL,
  yearly INTEGER NOT NULL DEFAULT 1,
  created_by INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS bucket_items (
  id INTEGER PRIMARY KEY,
  couple_id INTEGER NOT NULL REFERENCES couples(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  done_at INTEGER,
  done_by INTEGER,
  created_by INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS daily_answers (
  couple_id INTEGER NOT NULL REFERENCES couples(id) ON DELETE CASCADE,
  day TEXT NOT NULL,
  user_id INTEGER NOT NULL,
  answer TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (couple_id, day, user_id)
);

CREATE TABLE IF NOT EXISTS push_subscriptions (
  endpoint TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS kv (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
`;

function open() {
  mkdirSync(UPLOAD_DIR, { recursive: true });
  const db = new DatabaseSync(join(DATA_DIR, "twogether.db"));
  db.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;");
  db.exec(SCHEMA);
  return db;
}

// The custom server (run by tsx) and the Next.js route handlers load this module separately,
// so the connection lives on globalThis to keep one per process.
const g = globalThis as unknown as { __twogetherDb?: DatabaseSync };
export const db = (g.__twogetherDb ??= open());

type Params = SQLInputValue[];

export function one<T>(sql: string, ...params: Params): T | undefined {
  return db.prepare(sql).get(...params) as T | undefined;
}

export function all<T>(sql: string, ...params: Params): T[] {
  return db.prepare(sql).all(...params) as T[];
}

export function run(sql: string, ...params: Params) {
  const r = db.prepare(sql).run(...params);
  return { changes: Number(r.changes), id: Number(r.lastInsertRowid) };
}

export function tx<T>(fn: () => T): T {
  db.exec("BEGIN IMMEDIATE");
  try {
    const result = fn();
    db.exec("COMMIT");
    return result;
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }
}

export function kvGet(key: string) {
  return one<{ value: string }>("SELECT value FROM kv WHERE key = ?", key)?.value;
}

export function kvSet(key: string, value: string) {
  run("INSERT INTO kv (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value", key, value);
}

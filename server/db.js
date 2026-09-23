import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(__dirname, '..', 'data');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

const db = new Database(path.join(dataDir, 'noted.db'));

// Enable WAL mode for better concurrent access
db.pragma('journal_mode = WAL');

// ──── Schema ────
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS profiles (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id),
    name TEXT NOT NULL,
    relation TEXT DEFAULT 'self',
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS symptom_entries (
    id TEXT PRIMARY KEY,
    profile_id TEXT NOT NULL REFERENCES profiles(id),
    timestamp TEXT NOT NULL,
    raw_text TEXT NOT NULL,
    normalized_symptom TEXT,
    severity INTEGER DEFAULT 0,
    body_location TEXT,
    context_tags TEXT DEFAULT '[]',
    source TEXT DEFAULT 'text',
    original_timestamp TEXT,
    edited_at TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS treatments (
    id TEXT PRIMARY KEY,
    profile_id TEXT NOT NULL REFERENCES profiles(id),
    name TEXT NOT NULL,
    start_date TEXT NOT NULL,
    end_date TEXT,
    notes TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS sessions (
    token TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id),
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_entries_profile ON symptom_entries(profile_id);
  CREATE INDEX IF NOT EXISTS idx_entries_timestamp ON symptom_entries(timestamp);
  CREATE INDEX IF NOT EXISTS idx_treatments_profile ON treatments(profile_id);
  CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
`);

export default db;

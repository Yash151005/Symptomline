import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(__dirname, '..', 'data');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

// NOTED_DB_PATH lets tests / scratch runs use a separate database file.
const db = new Database(process.env.NOTED_DB_PATH || path.join(dataDir, 'noted.db'));

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

  -- One row per profile per local calendar day. Records exposures (sleep, stress,
  -- caffeine...) on EVERY day, including symptom-free ones, so trigger statistics
  -- can compare symptom days against non-symptom days.
  CREATE TABLE IF NOT EXISTS daily_checkins (
    id TEXT PRIMARY KEY,
    profile_id TEXT NOT NULL REFERENCES profiles(id),
    date TEXT NOT NULL,               -- YYYY-MM-DD (patient's local date)
    sleep_hours REAL,
    sleep_quality INTEGER,            -- 1-5
    stress INTEGER,                   -- 1-5
    caffeine_cups INTEGER,
    alcohol_units INTEGER,
    exercise_minutes INTEGER,
    screen_hours REAL,
    tags TEXT DEFAULT '[]',           -- extra exposures, e.g. ["skipped_meal","menstruation"]
    symptom_free INTEGER DEFAULT 0,
    notes TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT,
    UNIQUE (profile_id, date)
  );

  CREATE INDEX IF NOT EXISTS idx_checkins_profile_date ON daily_checkins(profile_id, date);

  -- Append-only, hash-chained record of every change to a symptom entry.
  -- Each row's hash covers the previous row's hash, so any later edit,
  -- deletion or reordering of history is detectable (see ledger.js).
  CREATE TABLE IF NOT EXISTS audit_ledger (
    seq INTEGER PRIMARY KEY AUTOINCREMENT,
    profile_id TEXT NOT NULL,
    entry_id TEXT,
    action TEXT NOT NULL,             -- create | update | delete | acknowledge
    payload TEXT NOT NULL,            -- canonical JSON snapshot of the entry
    at TEXT NOT NULL,                 -- ISO-8601 time the event was recorded
    prev_hash TEXT NOT NULL,
    hash TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_ledger_profile ON audit_ledger(profile_id, seq);
  CREATE INDEX IF NOT EXISTS idx_ledger_entry ON audit_ledger(entry_id);

  -- Expiring, revocable, read-only links a patient gives to a clinician.
  -- Only a SHA-256 of the token is stored; the token itself is shown once.
  CREATE TABLE IF NOT EXISTS share_links (
    id TEXT PRIMARY KEY,
    profile_id TEXT NOT NULL REFERENCES profiles(id),
    token_hash TEXT UNIQUE NOT NULL,
    label TEXT,
    specialty TEXT NOT NULL,
    window_days INTEGER NOT NULL,
    include_raw_text INTEGER NOT NULL DEFAULT 1,
    max_views INTEGER,
    view_count INTEGER NOT NULL DEFAULT 0,
    expires_at TEXT NOT NULL,         -- ISO-8601
    revoked_at TEXT,
    created_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_share_profile ON share_links(profile_id);

  -- Accounting of disclosures: every time a shared link is opened.
  CREATE TABLE IF NOT EXISTS share_access_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    share_id TEXT NOT NULL REFERENCES share_links(id),
    at TEXT NOT NULL,
    resource TEXT NOT NULL,           -- summary | pdf
    ip_hash TEXT,
    user_agent TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_share_access ON share_access_log(share_id);
`);

// ──── Lightweight migrations for existing databases ────
const entryColumns = db.prepare('PRAGMA table_info(symptom_entries)').all().map((c) => c.name);
if (!entryColumns.includes('red_flags')) {
  db.exec("ALTER TABLE symptom_entries ADD COLUMN red_flags TEXT DEFAULT '[]'");
}
if (!entryColumns.includes('red_flag_acknowledged_at')) {
  db.exec('ALTER TABLE symptom_entries ADD COLUMN red_flag_acknowledged_at TEXT');
}

const sessionColumns = db.prepare('PRAGMA table_info(sessions)').all().map((c) => c.name);
if (!sessionColumns.includes('expires_at')) {
  db.exec('ALTER TABLE sessions ADD COLUMN expires_at TEXT');
  // Sessions created before expiry existed get the default lifetime from creation.
  db.exec("UPDATE sessions SET expires_at = strftime('%Y-%m-%dT%H:%M:%fZ', created_at, '+14 days')");
}

export default db;

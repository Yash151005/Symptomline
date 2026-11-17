/**
 * Tamper-evident timeline ledger.
 *
 * Every create / update / delete / acknowledge on a symptom entry appends a
 * row whose hash is SHA-256(prev_hash + canonical event). Rewriting, deleting
 * or reordering any past row breaks every hash after it, and editing a
 * symptom_entries row directly (bypassing the API) no longer matches the
 * ledger's latest snapshot for that entry. verifyLedger() checks both.
 *
 * What this proves: the timeline a clinician sees is the same one the patient
 * recorded, including every retroactive edit. What it does not prove: that
 * the server operator did not rebuild the whole chain. Anchoring the head hash
 * with an external RFC 3161 timestamp authority would close that gap.
 */
import crypto from 'node:crypto';
import db from './db.js';

export const GENESIS_HASH = '0'.repeat(64);

/** Deterministic JSON: object keys sorted at every level. */
export function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().filter((k) => value[k] !== undefined)
      .map((k) => `${JSON.stringify(k)}:${canonical(value[k])}`).join(',')}}`;
  }
  return JSON.stringify(value ?? null);
}

export function sha256(text) {
  return crypto.createHash('sha256').update(text).digest('hex');
}

export function hashEvent(prevHash, { profile_id, entry_id, action, payload, at }) {
  return sha256(`${prevHash}\n${canonical({ profile_id, entry_id, action, payload, at })}`);
}

function parseJson(v, fallback) {
  if (typeof v !== 'string') return v ?? fallback;
  try { return JSON.parse(v); } catch { return fallback; }
}

/** The clinically meaningful fields of an entry, as attested by the ledger. */
export function entrySnapshot(entry) {
  return {
    id: entry.id,
    timestamp: entry.timestamp,
    raw_text: entry.raw_text,
    normalized_symptom: entry.normalized_symptom ?? null,
    severity: entry.severity == null ? null : Number(entry.severity),
    body_location: entry.body_location ?? null,
    context_tags: parseJson(entry.context_tags, []),
    red_flags: parseJson(entry.red_flags, []).map((f) => f.id ?? f),
  };
}

const lastRow = db.prepare('SELECT hash FROM audit_ledger WHERE profile_id = ? ORDER BY seq DESC LIMIT 1');
const insertRow = db.prepare(`
  INSERT INTO audit_ledger (profile_id, entry_id, action, payload, at, prev_hash, hash)
  VALUES (?, ?, ?, ?, ?, ?, ?)
`);

/**
 * Append an event. Runs in a transaction so concurrent writers cannot fork
 * the chain. Pass `at` only when replaying history (seeding / migration).
 */
export const appendLedger = db.transaction((profileId, entry, action, at = new Date().toISOString()) => {
  const prevHash = lastRow.get(profileId)?.hash ?? GENESIS_HASH;
  const payload = canonical(entrySnapshot(entry));
  const event = { profile_id: profileId, entry_id: entry.id, action, payload, at };
  const hash = hashEvent(prevHash, event);
  insertRow.run(profileId, entry.id, action, payload, at, prevHash, hash);
  return hash;
});

/**
 * Walk the chain and reconcile it with the live entries table.
 * status: 'verified'   chain intact and every live entry matches its latest snapshot
 *         'unattested' chain intact, but some entries pre-date the ledger
 *         'tampered'   a hash, link or snapshot does not match
 */
export function verifyLedger(profileId) {
  const rows = db.prepare('SELECT * FROM audit_ledger WHERE profile_id = ? ORDER BY seq').all(profileId);
  let prev = GENESIS_HASH;
  let brokenAt = null;
  const latest = new Map();
  const editCounts = new Map();

  for (const r of rows) {
    const expected = hashEvent(prev, r);
    if (r.prev_hash !== prev || r.hash !== expected) {
      brokenAt = r.seq;
      break;
    }
    prev = r.hash;
    latest.set(r.entry_id, r);
    if (r.action === 'update') editCounts.set(r.entry_id, (editCounts.get(r.entry_id) || 0) + 1);
  }

  const live = db.prepare('SELECT * FROM symptom_entries WHERE profile_id = ?').all(profileId);
  const liveIds = new Set(live.map((e) => e.id));
  const mismatched = [];
  let unattested = 0;

  if (brokenAt === null) {
    for (const e of live) {
      const last = latest.get(e.id);
      if (!last) { unattested++; continue; }
      if (last.action === 'delete' || last.payload !== canonical(entrySnapshot(e))) mismatched.push(e.id);
    }
    // An entry the ledger says exists but is missing from the table was deleted off-ledger.
    for (const [id, r] of latest) {
      if (r.action !== 'delete' && !liveIds.has(id)) mismatched.push(id);
    }
  }

  const deleted = [...latest.values()].filter((r) => r.action === 'delete').length;
  const status = brokenAt !== null || mismatched.length ? 'tampered' : unattested ? 'unattested' : 'verified';

  return {
    status,
    events: rows.length,
    head_hash: brokenAt === null ? prev : null,
    broken_at_seq: brokenAt,
    mismatched_entries: mismatched,
    unattested_entries: unattested,
    edited_entries: editCounts.size,
    deleted_entries: deleted,
    live_entries: live.length,
  };
}

/** Every recorded version of one entry, oldest first. */
export function entryHistory(profileId, entryId) {
  return db
    .prepare('SELECT seq, action, payload, at, hash FROM audit_ledger WHERE profile_id = ? AND entry_id = ? ORDER BY seq')
    .all(profileId, entryId)
    .map((r) => ({ seq: r.seq, action: r.action, at: r.at, hash: r.hash, snapshot: JSON.parse(r.payload) }));
}

export const REALTIME_HOURS = 6;
export const BACKFILL_HOURS = 48;

/**
 * Recall-bias indicator: how long after the symptom did the patient log it?
 * Uses the symptom time claimed at creation (not later edits) and the time
 * the ledger recorded the entry.
 */
export function loggingTimeliness(profileId) {
  const creates = db.prepare(`
    SELECT l.payload, l.at FROM audit_ledger l
    JOIN symptom_entries e ON e.id = l.entry_id
    WHERE l.profile_id = ? AND l.action = 'create'
  `).all(profileId);

  const lags = creates
    .map((r) => (Date.parse(r.at) - Date.parse(JSON.parse(r.payload).timestamp)) / 3600e3)
    .filter(Number.isFinite)
    .map((h) => Math.max(0, h))
    .sort((a, b) => a - b);

  const n = lags.length;
  if (!n) return { measured: 0, realtime: 0, same_window: 0, backfilled: 0, pct_realtime: null, median_lag_hours: null };

  const realtime = lags.filter((h) => h <= REALTIME_HOURS).length;
  const backfilled = lags.filter((h) => h > BACKFILL_HOURS).length;
  const median = n % 2 ? lags[(n - 1) / 2] : (lags[n / 2 - 1] + lags[n / 2]) / 2;

  return {
    measured: n,
    realtime,
    same_window: n - realtime - backfilled,
    backfilled,
    pct_realtime: Math.round((realtime / n) * 100),
    median_lag_hours: Math.round(median * 10) / 10,
  };
}

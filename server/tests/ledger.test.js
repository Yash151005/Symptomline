import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';

process.env.NOTED_DB_PATH = path.join(os.tmpdir(), `noted-ledger-test-${process.pid}-${Date.now()}.db`);
const { default: db } = await import('../db.js');
const { appendLedger, verifyLedger, entryHistory, loggingTimeliness, canonical } = await import('../ledger.js');

const PROFILE = 'p-ledger';

function insertEntry(id, overrides = {}) {
  const e = {
    id, profile_id: PROFILE, timestamp: '2026-03-01T09:00:00.000Z', raw_text: 'headache behind left eye',
    normalized_symptom: 'Headache', severity: 3, body_location: 'Head', context_tags: '["morning"]', red_flags: '[]',
    ...overrides,
  };
  db.prepare(`INSERT INTO symptom_entries (id, profile_id, timestamp, raw_text, normalized_symptom, severity, body_location, context_tags, red_flags)
    VALUES (@id, @profile_id, @timestamp, @raw_text, @normalized_symptom, @severity, @body_location, @context_tags, @red_flags)`).run(e);
  return db.prepare('SELECT * FROM symptom_entries WHERE id = ?').get(id);
}

before(() => {
  db.prepare('INSERT INTO users (id, name, email, password_hash) VALUES (?, ?, ?, ?)').run('u1', 'T', 't@x.com', 'x');
  db.prepare('INSERT INTO profiles (id, user_id, name) VALUES (?, ?, ?)').run(PROFILE, 'u1', 'T');
});

test('canonical JSON is key-order independent', () => {
  assert.equal(canonical({ b: 1, a: [{ d: 2, c: 3 }] }), canonical({ a: [{ c: 3, d: 2 }], b: 1 }));
});

test('an untouched chain verifies, and edits are recorded as history', () => {
  const e = insertEntry('e1');
  appendLedger(PROFILE, e, 'create', '2026-03-01T10:00:00.000Z');
  db.prepare('UPDATE symptom_entries SET severity = 4 WHERE id = ?').run('e1');
  appendLedger(PROFILE, db.prepare('SELECT * FROM symptom_entries WHERE id = ?').get('e1'), 'update');

  const v = verifyLedger(PROFILE);
  assert.equal(v.status, 'verified');
  assert.equal(v.events, 2);
  assert.equal(v.edited_entries, 1);
  assert.match(v.head_hash, /^[0-9a-f]{64}$/);

  const history = entryHistory(PROFILE, 'e1');
  assert.deepEqual(history.map((h) => [h.action, h.snapshot.severity]), [['create', 3], ['update', 4]]);
});

test('editing an entry directly in the database is detected', () => {
  db.prepare("UPDATE symptom_entries SET raw_text = 'no headache at all' WHERE id = 'e1'").run();
  const v = verifyLedger(PROFILE);
  assert.equal(v.status, 'tampered');
  assert.deepEqual(v.mismatched_entries, ['e1']);
  db.prepare("UPDATE symptom_entries SET raw_text = 'headache behind left eye' WHERE id = 'e1'").run();
  assert.equal(verifyLedger(PROFILE).status, 'verified');
});

test('rewriting a past ledger row breaks the chain at that row', () => {
  const first = db.prepare('SELECT * FROM audit_ledger WHERE profile_id = ? ORDER BY seq LIMIT 1').get(PROFILE);
  const original = first.payload;
  db.prepare('UPDATE audit_ledger SET payload = ? WHERE seq = ?').run(original.replace('"severity":3', '"severity":1'), first.seq);
  const v = verifyLedger(PROFILE);
  assert.equal(v.status, 'tampered');
  assert.equal(v.broken_at_seq, first.seq);
  db.prepare('UPDATE audit_ledger SET payload = ? WHERE seq = ?').run(original, first.seq);
});

test('deleting an entry off-ledger is detected; deleting via the ledger is not', () => {
  const e = insertEntry('e2');
  appendLedger(PROFILE, e, 'create');
  db.prepare("DELETE FROM symptom_entries WHERE id = 'e2'").run();
  assert.deepEqual(verifyLedger(PROFILE).mismatched_entries, ['e2']);
  appendLedger(PROFILE, e, 'delete');
  const v = verifyLedger(PROFILE);
  assert.equal(v.status, 'verified');
  assert.equal(v.deleted_entries, 1);
});

test('entries with no ledger history are reported as unattested', () => {
  insertEntry('legacy');
  const v = verifyLedger(PROFILE);
  assert.equal(v.status, 'unattested');
  assert.equal(v.unattested_entries, 1);
  db.prepare("DELETE FROM symptom_entries WHERE id = 'legacy'").run();
});

test('loggingTimeliness measures delay from onset to logging', () => {
  // e1 was created 1h after onset.
  const t = loggingTimeliness(PROFILE);
  assert.equal(t.measured, 1);
  assert.equal(t.realtime, 1);
  assert.equal(t.pct_realtime, 100);
  assert.equal(t.median_lag_hours, 1);
});

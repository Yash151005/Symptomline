import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';

process.env.NOTED_DB_PATH = path.join(os.tmpdir(), `noted-share-test-${process.pid}-${Date.now()}.db`);
const { default: db } = await import('../db.js');
const { createShare, openShare, revokeShare, listShares, shareAccessLog, validateShareInput, hashToken } = await import('../sharing.js');

const PROFILE = 'p-share';
const req = (resource, consumesView = resource === 'summary') => ({ resource, ip: '10.0.0.1', userAgent: 'test', consumesView });

before(() => {
  db.prepare('INSERT INTO users (id, name, email, password_hash) VALUES (?, ?, ?, ?)').run('u1', 'T', 't@x.com', 'x');
  db.prepare('INSERT INTO profiles (id, user_id, name) VALUES (?, ?, ?)').run(PROFILE, 'u1', 'T');
});

test('only the token hash is stored', () => {
  const s = createShare(PROFILE, { specialty: 'neurologist' });
  assert.ok(s.token.length >= 40);
  const row = db.prepare('SELECT * FROM share_links WHERE id = ?').get(s.id);
  assert.equal(row.token_hash, hashToken(s.token));
  assert.ok(!JSON.stringify(row).includes(s.token));
  assert.ok(!('token' in listShares(PROFILE)[0]));
});

test('input validation rejects out-of-policy values', () => {
  assert.throws(() => validateShareInput({ expires_in_hours: 99999 }), /Expiry/);
  assert.throws(() => validateShareInput({ window_days: 365 }), /Window/);
  assert.throws(() => validateShareInput({ max_views: 0 }), /Max opens/);
  assert.equal(validateShareInput({ specialty: 'bogus' }).specialty, 'general');
});

test('a link opens, logs access, and enforces max views', () => {
  const s = createShare(PROFILE, { max_views: 1 });
  assert.equal(openShare(s.token, req('pdf')).status, 403, 'PDF requires the summary to be opened first');
  assert.ok(openShare(s.token, req('summary')).link);
  assert.ok(openShare(s.token, req('pdf')).link, 'PDF download after the last view is allowed');
  const again = openShare(s.token, req('summary'));
  assert.equal(again.status, 410);
  const log = shareAccessLog(PROFILE, s.id);
  assert.deepEqual(log.map((l) => l.resource).sort(), ['pdf', 'summary']);
  assert.ok(log.every((l) => /^[0-9a-f]{16}$/.test(l.ip_hash) && l.ip_hash !== '10.0.0.1'));
});

test('revoked and expired links are refused', () => {
  const s = createShare(PROFILE, {});
  assert.equal(revokeShare(PROFILE, s.id), 1);
  assert.equal(openShare(s.token, req('summary')).status, 410);
  assert.equal(revokeShare('someone-else', s.id), 0, 'cannot revoke another profile’s link');

  const e = createShare(PROFILE, {});
  db.prepare('UPDATE share_links SET expires_at = ? WHERE id = ?').run(new Date(Date.now() - 1000).toISOString(), e.id);
  assert.equal(openShare(e.token, req('summary')).status, 410);
});

test('unknown or malformed tokens are 404', () => {
  assert.equal(openShare('x'.repeat(43), req('summary')).status, 404);
  assert.equal(openShare('short', req('summary')).status, 404);
  assert.equal(openShare(undefined, req('summary')).status, 404);
});

test('another profile cannot read a link’s access log', () => {
  const s = createShare(PROFILE, {});
  assert.equal(shareAccessLog('someone-else', s.id), null);
});

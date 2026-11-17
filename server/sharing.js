/**
 * Clinician share links.
 *
 * A patient creates a read-only link scoped to a specialty and a look-back
 * window, with a hard expiry and an optional cap on how many times it can be
 * opened. The clinician needs no account. Only SHA-256(token) is stored, so a
 * database leak does not expose live links. Every open is written to
 * share_access_log, giving the patient an accounting of disclosures.
 */
import crypto from 'node:crypto';
import { v4 as uuid } from 'uuid';
import db from './db.js';
import { sha256 } from './ledger.js';
import { hashIp } from './security.js';

export const SPECIALTIES = ['neurologist', 'gastroenterologist', 'orthopedist', 'psychiatrist', 'general'];
export const EXPIRY_HOURS = [24, 72, 168, 336];
export const WINDOW_DAYS = [30, 60, 90];

export function hashToken(token) {
  return sha256(`share:${token}`);
}

export function shareStatus(link, now = Date.now()) {
  if (link.revoked_at) return 'revoked';
  if (Date.parse(link.expires_at) <= now) return 'expired';
  if (link.max_views != null && link.view_count >= link.max_views) return 'exhausted';
  return 'active';
}

/** Validate untrusted input; throws with a user-facing message. */
export function validateShareInput(body = {}) {
  const specialty = SPECIALTIES.includes(body.specialty) ? body.specialty : 'general';
  const expiresInHours = Number(body.expires_in_hours ?? 72);
  if (!EXPIRY_HOURS.includes(expiresInHours)) throw new Error(`Expiry must be one of ${EXPIRY_HOURS.join(', ')} hours`);
  const windowDays = Number(body.window_days ?? 90);
  if (!WINDOW_DAYS.includes(windowDays)) throw new Error(`Window must be one of ${WINDOW_DAYS.join(', ')} days`);
  let maxViews = null;
  if (body.max_views !== undefined && body.max_views !== null && body.max_views !== '') {
    maxViews = Number(body.max_views);
    if (!Number.isInteger(maxViews) || maxViews < 1 || maxViews > 50) throw new Error('Max opens must be 1–50');
  }
  const label = typeof body.label === 'string' ? body.label.trim().slice(0, 80) || null : null;
  return { specialty, expiresInHours, windowDays, maxViews, label, includeRawText: body.include_raw_text !== false };
}

export function createShare(profileId, body) {
  const v = validateShareInput(body);
  const token = crypto.randomBytes(32).toString('base64url');
  const now = new Date();
  const link = {
    id: uuid(),
    profile_id: profileId,
    token_hash: hashToken(token),
    label: v.label,
    specialty: v.specialty,
    window_days: v.windowDays,
    include_raw_text: v.includeRawText ? 1 : 0,
    max_views: v.maxViews,
    expires_at: new Date(now.getTime() + v.expiresInHours * 3600e3).toISOString(),
    created_at: now.toISOString(),
  };
  db.prepare(`
    INSERT INTO share_links (id, profile_id, token_hash, label, specialty, window_days, include_raw_text, max_views, expires_at, created_at)
    VALUES (@id, @profile_id, @token_hash, @label, @specialty, @window_days, @include_raw_text, @max_views, @expires_at, @created_at)
  `).run(link);
  // The raw token is returned exactly once and never stored.
  return { ...publicLink({ ...link, view_count: 0, revoked_at: null }), token };
}

function publicLink(l, extra = {}) {
  return {
    id: l.id,
    label: l.label,
    specialty: l.specialty,
    window_days: l.window_days,
    include_raw_text: !!l.include_raw_text,
    max_views: l.max_views,
    view_count: l.view_count,
    expires_at: l.expires_at,
    revoked_at: l.revoked_at,
    created_at: l.created_at,
    status: shareStatus(l),
    ...extra,
  };
}

export function listShares(profileId) {
  return db.prepare(`
    SELECT s.*, (SELECT MAX(at) FROM share_access_log a WHERE a.share_id = s.id) AS last_accessed_at,
           (SELECT COUNT(*) FROM share_access_log a WHERE a.share_id = s.id) AS access_events
    FROM share_links s WHERE s.profile_id = ? ORDER BY s.created_at DESC
  `).all(profileId).map((l) => publicLink(l, { last_accessed_at: l.last_accessed_at, access_events: l.access_events }));
}

export function revokeShare(profileId, id) {
  return db.prepare(`
    UPDATE share_links SET revoked_at = ? WHERE id = ? AND profile_id = ? AND revoked_at IS NULL
  `).run(new Date().toISOString(), id, profileId).changes;
}

export function shareAccessLog(profileId, id) {
  const link = db.prepare('SELECT id FROM share_links WHERE id = ? AND profile_id = ?').get(id, profileId);
  if (!link) return null;
  return db.prepare('SELECT at, resource, ip_hash, user_agent FROM share_access_log WHERE share_id = ? ORDER BY id DESC LIMIT 200').all(id);
}

/**
 * Resolve a token for a public request and record the access.
 * `consumesView` is true for opening the summary; PDF downloads from an
 * already-open link are logged but do not use up a view.
 * Returns { link } or { error, status }.
 */
export const openShare = db.transaction((token, { resource, ip, userAgent, consumesView }) => {
  if (typeof token !== 'string' || token.length < 20 || token.length > 100) return { error: 'Link not found', status: 404 };
  const link = db.prepare('SELECT * FROM share_links WHERE token_hash = ?').get(hashToken(token));
  if (!link) return { error: 'Link not found', status: 404 };

  const status = shareStatus(link);
  // A PDF download is allowed on the open that used the last view.
  const pdfAfterLastView = status === 'exhausted' && !consumesView && link.view_count > 0;
  if (status !== 'active' && !pdfAfterLastView) {
    const messages = { revoked: 'This link was revoked by the patient', expired: 'This link has expired', exhausted: 'This link has reached its maximum number of opens' };
    return { error: messages[status], status: 410 };
  }
  if (!consumesView && link.view_count === 0) return { error: 'Open the shared summary first', status: 403 };

  if (consumesView) {
    db.prepare('UPDATE share_links SET view_count = view_count + 1 WHERE id = ?').run(link.id);
    link.view_count++;
  }
  db.prepare('INSERT INTO share_access_log (share_id, at, resource, ip_hash, user_agent) VALUES (?, ?, ?, ?, ?)')
    .run(link.id, new Date().toISOString(), resource, hashIp(ip), String(userAgent || '').slice(0, 200));
  return { link };
});

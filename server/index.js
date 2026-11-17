import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { v4 as uuid } from 'uuid';
import db from './db.js';
import {
  registerUser, loginUser, authMiddleware, logout, logoutEverywhere, purgeExpiredSessions, deleteAccount,
} from './auth.js';
import { normalizeSymptom } from './normalizer.js';
import { detectPatterns, getSymptomDiff, predictDoctorQuestions, getTriggerAnalysis } from './patterns.js';
import { screenRedFlags } from './redflags.js';
import { localDayKey } from './stats.js';
import { appendLedger, verifyLedger, entryHistory, loggingTimeliness, canonical, entrySnapshot } from './ledger.js';
import { createShare, listShares, revokeShare, shareAccessLog, openShare } from './sharing.js';
import { collectReportData, renderReportPdf, clinicianSummary } from './report.js';
import { buildFhirBundle } from './fhir.js';
import { securityHeaders, rateLimit } from './security.js';

const app = express();
app.disable('x-powered-by');
// Behind a reverse proxy set TRUST_PROXY=1 so req.ip / req.secure are correct.
if (process.env.TRUST_PROXY) app.set('trust proxy', Number(process.env.TRUST_PROXY) || process.env.TRUST_PROXY);
app.use(securityHeaders);
// The Vite dev server proxies /api, so the browser is same-origin. Only
// explicitly listed origins may call the API cross-origin.
const allowedOrigins = (process.env.CORS_ORIGINS || 'http://localhost:5173').split(',').map((s) => s.trim()).filter(Boolean);
app.use(cors({ origin: allowedOrigins }));
app.use(express.json({ limit: '100kb' }));

const PORT = process.env.PORT || 3001;

const MINUTE = 60e3;
const loginLimiter = rateLimit({
  windowMs: 15 * MINUTE, max: 10,
  key: (req) => `${req.ip}|${String(req.body?.email || '').toLowerCase()}`,
  message: 'Too many login attempts. Try again in 15 minutes.',
});
const registerLimiter = rateLimit({ windowMs: 60 * MINUTE, max: 10, key: (req) => req.ip });
const sharedLimiter = rateLimit({ windowMs: MINUTE, max: 30, key: (req) => req.ip });
const sensitiveLimiter = rateLimit({ windowMs: 15 * MINUTE, max: 5, key: (req) => `${req.ip}|${req.user?.id}` });

function isValidTimestamp(ts) {
  return typeof ts === 'string' && ts.length <= 40 && !Number.isNaN(Date.parse(ts));
}

function parseEntry(e) {
  if (!e) return e;
  e.context_tags = JSON.parse(e.context_tags || '[]');
  e.red_flags = JSON.parse(e.red_flags || '[]');
  return e;
}

// ──── Auth Routes ────
app.post('/api/auth/register', registerLimiter, (req, res) => {
  try {
    const { name, email, password } = req.body;
    if (!name || !email || !password) return res.status(400).json({ error: 'All fields required' });
    const result = registerUser(name, email, password);
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/api/auth/login', loginLimiter, (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Email and password required' });
    const result = loginUser(email, password);
    loginLimiter.reset(`${req.ip}|${String(email).toLowerCase()}`);
    res.json(result);
  } catch (err) {
    res.status(401).json({ error: err.message });
  }
});

app.post('/api/auth/logout', authMiddleware, (req, res) => {
  logout(req.sessionToken);
  res.json({ ok: true });
});

// Sign out of every device, e.g. after a lost phone.
app.post('/api/auth/logout-all', authMiddleware, (req, res) => {
  res.json({ ok: true, sessions_revoked: logoutEverywhere(req.user.id) });
});

// ──── Symptom Entries ────
app.post('/api/entries', authMiddleware, async (req, res) => {
  try {
    const { raw_text, timestamp } = req.body;
    if (!raw_text || typeof raw_text !== 'string') return res.status(400).json({ error: 'Text is required' });
    if (raw_text.length > 2000) return res.status(400).json({ error: 'Entry is too long (max 2000 characters)' });
    if (timestamp !== undefined && !isValidTimestamp(timestamp)) return res.status(400).json({ error: 'Invalid timestamp' });

    const id = uuid();
    const ts = timestamp || new Date().toISOString();

    // Safety screening runs first and independently of the LLM.
    const redFlags = screenRedFlags(raw_text);

    // Normalize the symptom
    const normalized = await normalizeSymptom(raw_text, ts);

    db.prepare(`
      INSERT INTO symptom_entries (id, profile_id, timestamp, raw_text, normalized_symptom, severity, body_location, context_tags, source, red_flags)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id, req.profileId, ts, raw_text,
      normalized.normalized_symptom,
      normalized.severity,
      normalized.body_location,
      JSON.stringify(normalized.context_tags),
      'text',
      JSON.stringify(redFlags)
    );

    const created = db.prepare('SELECT * FROM symptom_entries WHERE id = ?').get(id);
    appendLedger(req.profileId, created, 'create');
    res.json(parseEntry(created));
  } catch (err) {
    console.error('Entry creation error:', err);
    res.status(500).json({ error: 'Failed to create entry' });
  }
});

app.get('/api/entries', authMiddleware, (req, res) => {
  const entries = db
    .prepare('SELECT * FROM symptom_entries WHERE profile_id = ? ORDER BY timestamp DESC')
    .all(req.profileId);
  res.json(entries.map(parseEntry));
});

// Retroactive timeline correction — update an entry
app.put('/api/entries/:id', authMiddleware, async (req, res) => {
  try {
    const entry = db.prepare('SELECT * FROM symptom_entries WHERE id = ? AND profile_id = ?').get(req.params.id, req.profileId);
    if (!entry) return res.status(404).json({ error: 'Entry not found' });

    const { raw_text, timestamp, severity } = req.body;
    if (raw_text !== undefined && (typeof raw_text !== 'string' || raw_text.length > 2000)) {
      return res.status(400).json({ error: 'Invalid entry text' });
    }
    if (timestamp !== undefined && timestamp !== null && !isValidTimestamp(timestamp)) {
      return res.status(400).json({ error: 'Invalid timestamp' });
    }
    if (severity !== undefined && !(Number.isInteger(Number(severity)) && severity >= 1 && severity <= 5)) {
      return res.status(400).json({ error: 'Severity must be a whole number from 1 to 5' });
    }

    if (raw_text && raw_text !== entry.raw_text) {
      // Re-normalize if text changed
      const normalized = await normalizeSymptom(raw_text, timestamp || entry.timestamp);
      const redFlags = screenRedFlags(raw_text);
      db.prepare(`
        UPDATE symptom_entries SET raw_text = ?, normalized_symptom = ?, severity = ?,
        body_location = ?, context_tags = ?, red_flags = ?, red_flag_acknowledged_at = NULL,
        original_timestamp = COALESCE(original_timestamp, timestamp),
        timestamp = ?, edited_at = datetime('now')
        WHERE id = ?
      `).run(
        raw_text, normalized.normalized_symptom, normalized.severity,
        normalized.body_location, JSON.stringify(normalized.context_tags), JSON.stringify(redFlags),
        timestamp || entry.timestamp, req.params.id
      );
    } else {
      // Update timestamp or severity only
      const updates = {};
      if (timestamp && timestamp !== entry.timestamp) updates.timestamp = timestamp;
      if (severity !== undefined && Number(severity) !== entry.severity) updates.severity = Number(severity);

      if (Object.keys(updates).length > 0) {
        const setClause = Object.keys(updates).map((k) => `${k} = ?`).join(', ');
        db.prepare(`
          UPDATE symptom_entries SET ${setClause}, original_timestamp = COALESCE(original_timestamp, timestamp), edited_at = datetime('now')
          WHERE id = ? AND profile_id = ?
        `).run(...Object.values(updates), req.params.id, req.profileId);
      }
    }

    const updated = db.prepare('SELECT * FROM symptom_entries WHERE id = ?').get(req.params.id);
    if (canonical(entrySnapshot(updated)) !== canonical(entrySnapshot(entry))) appendLedger(req.profileId, updated, 'update');
    res.json(parseEntry(updated));
  } catch (err) {
    console.error('Entry update error:', err);
    res.status(500).json({ error: 'Failed to update entry' });
  }
});

app.delete('/api/entries/:id', authMiddleware, (req, res) => {
  const entry = db.prepare('SELECT * FROM symptom_entries WHERE id = ? AND profile_id = ?').get(req.params.id, req.profileId);
  if (entry) {
    db.transaction(() => {
      db.prepare('DELETE FROM symptom_entries WHERE id = ?').run(entry.id);
      appendLedger(req.profileId, entry, 'delete');
    })();
  }
  res.json({ ok: true });
});

// Every recorded version of an entry, from the tamper-evident ledger.
app.get('/api/entries/:id/history', authMiddleware, (req, res) => {
  res.json(entryHistory(req.profileId, req.params.id));
});

// Patient confirms they have seen the safety guidance for a flagged entry.
app.post('/api/entries/:id/acknowledge-flags', authMiddleware, (req, res) => {
  const result = db.prepare(`
    UPDATE symptom_entries SET red_flag_acknowledged_at = datetime('now')
    WHERE id = ? AND profile_id = ? AND red_flag_acknowledged_at IS NULL
  `).run(req.params.id, req.profileId);
  const entry = db.prepare('SELECT * FROM symptom_entries WHERE id = ? AND profile_id = ?').get(req.params.id, req.profileId);
  if (!entry) return res.status(404).json({ error: 'Entry not found' });
  // Medico-legal record that the patient was shown the emergency guidance.
  if (result.changes) appendLedger(req.profileId, entry, 'acknowledge');
  res.json({ ok: true, updated: result.changes, entry: parseEntry(entry) });
});

// ──── Daily Check-ins ────
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function parseCheckin(c) {
  if (!c) return c;
  c.tags = JSON.parse(c.tags || '[]');
  c.symptom_free = !!c.symptom_free;
  return c;
}

function numOrNull(v, { min, max, int = false }) {
  if (v === undefined || v === null || v === '') return null;
  const n = Number(v);
  if (!Number.isFinite(n) || n < min || n > max) throw new Error(`Value out of range (${min}–${max})`);
  return int ? Math.round(n) : n;
}

app.get('/api/checkins', authMiddleware, (req, res) => {
  const days = Math.min(365, parseInt(req.query.days) || 30);
  const since = new Date();
  since.setDate(since.getDate() - days);
  const rows = db
    .prepare('SELECT * FROM daily_checkins WHERE profile_id = ? AND date >= ? ORDER BY date DESC')
    .all(req.profileId, localDayKey(since));
  res.json(rows.map(parseCheckin));
});

app.get('/api/checkins/:date', authMiddleware, (req, res) => {
  if (!DATE_RE.test(req.params.date)) return res.status(400).json({ error: 'Date must be YYYY-MM-DD' });
  const row = db.prepare('SELECT * FROM daily_checkins WHERE profile_id = ? AND date = ?').get(req.profileId, req.params.date);
  res.json(row ? parseCheckin(row) : null);
});

app.put('/api/checkins/:date', authMiddleware, (req, res) => {
  const { date } = req.params;
  if (!DATE_RE.test(date) || Number.isNaN(Date.parse(date))) return res.status(400).json({ error: 'Date must be YYYY-MM-DD' });
  // Allow one day of clock skew between client and server.
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  if (date > localDayKey(tomorrow)) return res.status(400).json({ error: 'Cannot check in for a future date' });

  try {
    const b = req.body || {};
    const tags = Array.isArray(b.tags)
      ? [...new Set(b.tags.filter((t) => typeof t === 'string' && t.trim()).map((t) => t.trim().toLowerCase().replace(/\s+/g, '_').slice(0, 40)))].slice(0, 20)
      : [];
    const values = {
      sleep_hours: numOrNull(b.sleep_hours, { min: 0, max: 24 }),
      sleep_quality: numOrNull(b.sleep_quality, { min: 1, max: 5, int: true }),
      stress: numOrNull(b.stress, { min: 1, max: 5, int: true }),
      caffeine_cups: numOrNull(b.caffeine_cups, { min: 0, max: 30, int: true }),
      alcohol_units: numOrNull(b.alcohol_units, { min: 0, max: 50, int: true }),
      exercise_minutes: numOrNull(b.exercise_minutes, { min: 0, max: 1440, int: true }),
      screen_hours: numOrNull(b.screen_hours, { min: 0, max: 24 }),
      tags: JSON.stringify(tags),
      symptom_free: b.symptom_free ? 1 : 0,
      notes: typeof b.notes === 'string' ? b.notes.slice(0, 1000) : null,
    };

    db.prepare(`
      INSERT INTO daily_checkins (id, profile_id, date, sleep_hours, sleep_quality, stress, caffeine_cups,
        alcohol_units, exercise_minutes, screen_hours, tags, symptom_free, notes)
      VALUES (@id, @profile_id, @date, @sleep_hours, @sleep_quality, @stress, @caffeine_cups,
        @alcohol_units, @exercise_minutes, @screen_hours, @tags, @symptom_free, @notes)
      ON CONFLICT (profile_id, date) DO UPDATE SET
        sleep_hours = excluded.sleep_hours, sleep_quality = excluded.sleep_quality, stress = excluded.stress,
        caffeine_cups = excluded.caffeine_cups, alcohol_units = excluded.alcohol_units,
        exercise_minutes = excluded.exercise_minutes, screen_hours = excluded.screen_hours,
        tags = excluded.tags, symptom_free = excluded.symptom_free, notes = excluded.notes,
        updated_at = datetime('now')
    `).run({ id: uuid(), profile_id: req.profileId, date, ...values });

    res.json(parseCheckin(db.prepare('SELECT * FROM daily_checkins WHERE profile_id = ? AND date = ?').get(req.profileId, date)));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ──── Trigger analysis (statistical engine summary) ────
app.get('/api/triggers', authMiddleware, (req, res) => {
  const analysis = getTriggerAnalysis(req.profileId);
  res.json({
    ready: analysis.ready,
    observedDays: analysis.observedDays,
    minDays: analysis.minDays,
    testsRun: analysis.testsRun,
    findingCount: analysis.findings.length,
  });
});

// ──── Treatments ────
app.get('/api/treatments', authMiddleware, (req, res) => {
  const treatments = db.prepare('SELECT * FROM treatments WHERE profile_id = ? ORDER BY start_date DESC').all(req.profileId);
  res.json(treatments);
});

app.post('/api/treatments', authMiddleware, (req, res) => {
  const { name, start_date, end_date, notes } = req.body;
  if (!name || !start_date) return res.status(400).json({ error: 'Name and start date required' });
  const id = uuid();
  db.prepare('INSERT INTO treatments (id, profile_id, name, start_date, end_date, notes) VALUES (?, ?, ?, ?, ?, ?)')
    .run(id, req.profileId, name, start_date, end_date || null, notes || null);
  res.json(db.prepare('SELECT * FROM treatments WHERE id = ?').get(id));
});

app.put('/api/treatments/:id', authMiddleware, (req, res) => {
  const { name, start_date, end_date, notes } = req.body;
  db.prepare('UPDATE treatments SET name = ?, start_date = ?, end_date = ?, notes = ? WHERE id = ? AND profile_id = ?')
    .run(name, start_date, end_date || null, notes || null, req.params.id, req.profileId);
  res.json(db.prepare('SELECT * FROM treatments WHERE id = ?').get(req.params.id));
});

app.delete('/api/treatments/:id', authMiddleware, (req, res) => {
  db.prepare('DELETE FROM treatments WHERE id = ? AND profile_id = ?').run(req.params.id, req.profileId);
  res.json({ ok: true });
});

// ──── Patterns ────
app.get('/api/patterns', authMiddleware, (req, res) => {
  const patterns = detectPatterns(req.profileId);
  res.json(patterns);
});

// ──── Symptom Diff/Versioning ────
app.get('/api/diff/:symptom', authMiddleware, (req, res) => {
  const days = parseInt(req.query.days) || 60;
  const diff = getSymptomDiff(req.profileId, req.params.symptom, days);
  if (!diff) return res.json({ message: 'Not enough data for comparison' });
  res.json(diff);
});

// ──── Doctor Questions ────
app.get('/api/questions/:specialty', authMiddleware, (req, res) => {
  const questions = predictDoctorQuestions(req.profileId, req.params.specialty);
  res.json(questions);
});

// ──── PDF Export ────
const SPECIALTY_IDS = ['neurologist', 'gastroenterologist', 'orthopedist', 'psychiatrist', 'general'];

function pdfFileName(specialty) {
  return `noted-report-${specialty}-${new Date().toISOString().split('T')[0]}.pdf`;
}

app.get('/api/report/:specialty/pdf', authMiddleware, (req, res) => {
  const specialty = SPECIALTY_IDS.includes(req.params.specialty) ? req.params.specialty : 'general';
  const windowDays = [30, 60, 90].includes(Number(req.query.days)) ? Number(req.query.days) : 90;
  const data = collectReportData(req.profileId, { specialty, windowDays });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${pdfFileName(specialty)}"`);
  renderReportPdf(res, data, { userName: req.user?.name || 'Patient' });
});

// ──── Timeline integrity ────
app.get('/api/integrity', authMiddleware, (req, res) => {
  res.json({ ...verifyLedger(req.profileId), timeliness: loggingTimeliness(req.profileId) });
});

// ──── Clinician share links (patient side) ────
app.get('/api/shares', authMiddleware, (req, res) => {
  res.json(listShares(req.profileId));
});

app.post('/api/shares', authMiddleware, (req, res) => {
  try {
    res.json(createShare(req.profileId, req.body));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.delete('/api/shares/:id', authMiddleware, (req, res) => {
  const changed = revokeShare(req.profileId, req.params.id);
  res.json({ ok: true, revoked: changed > 0 });
});

app.get('/api/shares/:id/access-log', authMiddleware, (req, res) => {
  const log = shareAccessLog(req.profileId, req.params.id);
  if (!log) return res.status(404).json({ error: 'Link not found' });
  res.json(log);
});

// ──── Clinician share links (public, token-authenticated) ────
function sharedRequest(req, res, resource) {
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  const result = openShare(req.params.token, {
    resource, ip: req.ip, userAgent: req.headers['user-agent'], consumesView: resource === 'summary',
  });
  if (result.error) {
    res.status(result.status).json({ error: result.error });
    return null;
  }
  const { link } = result;
  const profile = db.prepare('SELECT * FROM profiles WHERE id = ?').get(link.profile_id);
  const data = collectReportData(link.profile_id, { specialty: link.specialty, windowDays: link.window_days });
  return { link, profile, data };
}

app.get('/api/shared/:token', sharedLimiter, (req, res) => {
  const ctx = sharedRequest(req, res, 'summary');
  if (!ctx) return;
  res.json(clinicianSummary(ctx.data, {
    patientName: ctx.profile?.name || 'Patient',
    includeRawText: !!ctx.link.include_raw_text,
    expiresAt: ctx.link.expires_at,
  }));
});

app.get('/api/shared/:token/pdf', sharedLimiter, (req, res) => {
  const ctx = sharedRequest(req, res, 'pdf');
  if (!ctx) return;
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${pdfFileName(ctx.link.specialty)}"`);
  renderReportPdf(res, ctx.data, {
    userName: ctx.profile?.name || 'Patient',
    includeRawText: !!ctx.link.include_raw_text,
    sharedVia: ctx.link.id,
  });
});

// ──── Data portability & erasure (GDPR Art. 15/17/20, India DPDP Act 2023) ────
function profileExport(profileId) {
  return {
    profile: db.prepare('SELECT id, name, relation, created_at FROM profiles WHERE id = ?').get(profileId),
    entries: db.prepare('SELECT * FROM symptom_entries WHERE profile_id = ? ORDER BY timestamp').all(profileId).map(parseEntry),
    treatments: db.prepare('SELECT * FROM treatments WHERE profile_id = ? ORDER BY start_date').all(profileId),
    checkins: db.prepare('SELECT * FROM daily_checkins WHERE profile_id = ? ORDER BY date').all(profileId).map(parseCheckin),
  };
}

app.get(['/api/export', '/api/export/json'], authMiddleware, (req, res) => {
  const data = profileExport(req.profileId);
  const shares = listShares(req.profileId);
  res.setHeader('Content-Disposition', `attachment; filename="noted-export-${localDayKey(new Date())}.json"`);
  res.json({
    format: 'noted-export/v1',
    exported_at: new Date().toISOString(),
    user: { name: req.user.name, email: req.user.email },
    ...data,
    audit_ledger: db.prepare('SELECT seq, entry_id, action, payload, at, prev_hash, hash FROM audit_ledger WHERE profile_id = ? ORDER BY seq').all(req.profileId),
    share_links: shares.map((s) => ({ ...s, access_log: shareAccessLog(req.profileId, s.id) })),
  });
});

app.get('/api/export/fhir', authMiddleware, (req, res) => {
  const { profile, entries, treatments } = profileExport(req.profileId);
  res.setHeader('Content-Type', 'application/fhir+json');
  res.setHeader('Content-Disposition', `attachment; filename="noted-fhir-r4-${localDayKey(new Date())}.json"`);
  res.send(JSON.stringify(buildFhirBundle({ profile, entries, treatments }), null, 2));
});

app.delete('/api/account', authMiddleware, sensitiveLimiter, (req, res) => {
  try {
    deleteAccount(req.user.id, req.body?.password);
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ──── Stats ────
app.get('/api/stats', authMiddleware, (req, res) => {
  const total = db.prepare('SELECT COUNT(*) as count FROM symptom_entries WHERE profile_id = ?').get(req.profileId).count;
  const today = db.prepare(`
    SELECT COUNT(*) as count FROM symptom_entries 
    WHERE profile_id = ? AND (
      date(timestamp) = date('now') OR 
      date(timestamp, 'localtime') = date('now', 'localtime')
    )
  `).get(req.profileId).count;
  const week = db.prepare(
    "SELECT COUNT(*) as count FROM symptom_entries WHERE profile_id = ? AND timestamp >= datetime('now', '-7 days')"
  ).get(req.profileId).count;
  const avgSev = db.prepare(
    'SELECT AVG(severity) as avg FROM symptom_entries WHERE profile_id = ?'
  ).get(req.profileId).avg;
  const patterns = detectPatterns(req.profileId);

  res.json({
    total,
    today,
    week,
    avgSeverity: avgSev ? parseFloat(avgSev.toFixed(1)) : 0,
    patternCount: patterns.length,
  });
});

purgeExpiredSessions();
setInterval(purgeExpiredSessions, 60 * MINUTE).unref();

app.listen(PORT, () => {
  console.log(`\n  🩺 Noted. server running on http://localhost:${PORT}\n`);
});

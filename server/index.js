import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { v4 as uuid } from 'uuid';
import PDFDocument from 'pdfkit';
import db from './db.js';
import { registerUser, loginUser, authMiddleware } from './auth.js';
import { normalizeSymptom } from './normalizer.js';
import { detectPatterns, getSymptomDiff, predictDoctorQuestions } from './patterns.js';

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3001;

// ──── Auth Routes ────
app.post('/api/auth/register', (req, res) => {
  try {
    const { name, email, password } = req.body;
    if (!name || !email || !password) return res.status(400).json({ error: 'All fields required' });
    const result = registerUser(name, email, password);
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/api/auth/login', (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Email and password required' });
    const result = loginUser(email, password);
    res.json(result);
  } catch (err) {
    res.status(401).json({ error: err.message });
  }
});

// ──── Symptom Entries ────
app.post('/api/entries', authMiddleware, async (req, res) => {
  try {
    const { raw_text, timestamp } = req.body;
    if (!raw_text) return res.status(400).json({ error: 'Text is required' });

    const id = uuid();
    const ts = timestamp || new Date().toISOString();

    // Normalize the symptom
    const normalized = await normalizeSymptom(raw_text, ts);

    db.prepare(`
      INSERT INTO symptom_entries (id, profile_id, timestamp, raw_text, normalized_symptom, severity, body_location, context_tags, source)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id, req.profileId, ts, raw_text,
      normalized.normalized_symptom,
      normalized.severity,
      normalized.body_location,
      JSON.stringify(normalized.context_tags),
      'text'
    );

    const entry = db.prepare('SELECT * FROM symptom_entries WHERE id = ?').get(id);
    entry.context_tags = JSON.parse(entry.context_tags);
    res.json(entry);
  } catch (err) {
    console.error('Entry creation error:', err);
    res.status(500).json({ error: 'Failed to create entry' });
  }
});

app.get('/api/entries', authMiddleware, (req, res) => {
  const entries = db
    .prepare('SELECT * FROM symptom_entries WHERE profile_id = ? ORDER BY timestamp DESC')
    .all(req.profileId);
  entries.forEach((e) => { e.context_tags = JSON.parse(e.context_tags); });
  res.json(entries);
});

// Retroactive timeline correction — update an entry
app.put('/api/entries/:id', authMiddleware, async (req, res) => {
  try {
    const entry = db.prepare('SELECT * FROM symptom_entries WHERE id = ? AND profile_id = ?').get(req.params.id, req.profileId);
    if (!entry) return res.status(404).json({ error: 'Entry not found' });

    const { raw_text, timestamp, severity } = req.body;

    if (raw_text && raw_text !== entry.raw_text) {
      // Re-normalize if text changed
      const normalized = await normalizeSymptom(raw_text, timestamp || entry.timestamp);
      db.prepare(`
        UPDATE symptom_entries SET raw_text = ?, normalized_symptom = ?, severity = ?,
        body_location = ?, context_tags = ?, original_timestamp = COALESCE(original_timestamp, timestamp),
        timestamp = ?, edited_at = datetime('now')
        WHERE id = ?
      `).run(
        raw_text, normalized.normalized_symptom, normalized.severity,
        normalized.body_location, JSON.stringify(normalized.context_tags),
        timestamp || entry.timestamp, req.params.id
      );
    } else {
      // Update timestamp or severity only
      const updates = {};
      if (timestamp) updates.timestamp = timestamp;
      if (severity !== undefined) updates.severity = severity;

      if (Object.keys(updates).length > 0) {
        const setClause = Object.keys(updates).map((k) => `${k} = ?`).join(', ');
        db.prepare(`
          UPDATE symptom_entries SET ${setClause}, original_timestamp = COALESCE(original_timestamp, timestamp), edited_at = datetime('now')
          WHERE id = ? AND profile_id = ?
        `).run(...Object.values(updates), req.params.id, req.profileId);
      }
    }

    const updated = db.prepare('SELECT * FROM symptom_entries WHERE id = ?').get(req.params.id);
    updated.context_tags = JSON.parse(updated.context_tags);
    res.json(updated);
  } catch (err) {
    console.error('Entry update error:', err);
    res.status(500).json({ error: 'Failed to update entry' });
  }
});

app.delete('/api/entries/:id', authMiddleware, (req, res) => {
  db.prepare('DELETE FROM symptom_entries WHERE id = ? AND profile_id = ?').run(req.params.id, req.profileId);
  res.json({ ok: true });
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
app.get('/api/report/:specialty/pdf', authMiddleware, (req, res) => {
  const specialty = req.params.specialty;
  const entries = db
    .prepare('SELECT * FROM symptom_entries WHERE profile_id = ? ORDER BY timestamp DESC')
    .all(req.profileId);
  entries.forEach((e) => { e.context_tags = JSON.parse(e.context_tags); });

  const treatments = db.prepare('SELECT * FROM treatments WHERE profile_id = ?').all(req.profileId);
  const patterns = detectPatterns(req.profileId);
  const questions = predictDoctorQuestions(req.profileId, specialty);

  // Build frequency table
  const freq = {};
  entries.forEach((e) => {
    if (!freq[e.normalized_symptom]) freq[e.normalized_symptom] = { count: 0, totalSev: 0 };
    freq[e.normalized_symptom].count++;
    freq[e.normalized_symptom].totalSev += e.severity;
  });

  const doc = new PDFDocument({ size: 'A4', margin: 50 });

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename=noted-report-${specialty}-${new Date().toISOString().split('T')[0]}.pdf`);
  doc.pipe(res);

  // Header
  doc.fontSize(24).font('Helvetica-Bold').text('Noted.', { align: 'left' });
  doc.fontSize(10).font('Helvetica').fillColor('#888')
    .text(`Doctor Visit Report — ${specialty.charAt(0).toUpperCase() + specialty.slice(1)}`, { align: 'left' });
  doc.text(`Generated: ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}`, { align: 'left' });
  doc.moveDown(1.5);

  // Summary
  doc.fontSize(14).font('Helvetica-Bold').fillColor('#333').text('Summary');
  doc.moveDown(0.3);
  doc.fontSize(10).font('Helvetica').fillColor('#555');
  doc.text(`Total logged entries: ${entries.length}`);
  doc.text(`Unique symptoms: ${Object.keys(freq).length}`);
  doc.text(`Patterns detected: ${patterns.length}`);
  doc.text(`Active treatments: ${treatments.filter((t) => !t.end_date).length}`);
  if (entries.length > 0) {
    const avgSev = (entries.reduce((a, b) => a + b.severity, 0) / entries.length).toFixed(1);
    doc.text(`Average severity: ${avgSev} / 5`);
  }
  doc.moveDown(1);

  // Symptom Frequency
  doc.fontSize(14).font('Helvetica-Bold').fillColor('#333').text('Symptom Frequency');
  doc.moveDown(0.3);
  for (const [symptom, data] of Object.entries(freq).sort((a, b) => b[1].count - a[1].count)) {
    const avg = (data.totalSev / data.count).toFixed(1);
    doc.fontSize(10).font('Helvetica').fillColor('#555')
      .text(`• ${symptom}: ${data.count} occurrence(s), avg severity ${avg}/5`);
  }
  doc.moveDown(1);

  // Patterns
  if (patterns.length > 0) {
    doc.fontSize(14).font('Helvetica-Bold').fillColor('#333').text('Detected Patterns');
    doc.moveDown(0.3);
    patterns.forEach((p) => {
      doc.fontSize(10).font('Helvetica-Bold').fillColor('#555')
        .text(`${p.symptom} — ${p.confidence}% confidence`);
      doc.font('Helvetica').text(`  ${p.pattern}`);
      doc.fillColor('#888').text(`  ${p.suggestion}`);
      doc.moveDown(0.3);
    });
    doc.moveDown(0.5);
  }

  // Treatments
  if (treatments.length > 0) {
    doc.fontSize(14).font('Helvetica-Bold').fillColor('#333').text('Treatments');
    doc.moveDown(0.3);
    treatments.forEach((t) => {
      const status = t.end_date ? `Ended ${t.end_date.split('T')[0]}` : 'Active';
      doc.fontSize(10).font('Helvetica').fillColor('#555')
        .text(`• ${t.name} — Started ${t.start_date.split('T')[0]} (${status})`);
      if (t.notes) doc.fillColor('#888').text(`  Notes: ${t.notes}`);
    });
    doc.moveDown(1);
  }

  // Doctor Questions
  doc.fontSize(14).font('Helvetica-Bold').fillColor('#333').text('Predicted Doctor Questions');
  doc.moveDown(0.3);
  questions.forEach((q, i) => {
    doc.fontSize(10).font('Helvetica').fillColor('#555').text(`${i + 1}. ${q}`);
  });
  doc.moveDown(1);

  // Timeline (last 15 entries)
  doc.fontSize(14).font('Helvetica-Bold').fillColor('#333').text('Recent Timeline');
  doc.moveDown(0.3);
  entries.slice(0, 15).forEach((e) => {
    const date = new Date(e.timestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    doc.fontSize(9).font('Helvetica-Bold').fillColor('#555')
      .text(`${date} — ${e.normalized_symptom} (severity ${e.severity}/5)`);
    doc.font('Helvetica').fillColor('#777')
      .text(`  "${e.raw_text}"`);
    doc.moveDown(0.2);
  });

  // Footer
  doc.moveDown(2);
  doc.fontSize(8).font('Helvetica').fillColor('#aaa')
    .text('This report is generated by Noted. for informational purposes only.', { align: 'center' })
    .text('It does not contain medical advice or diagnoses.', { align: 'center' });

  doc.end();
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

app.listen(PORT, () => {
  console.log(`\n  🩺 Noted. server running on http://localhost:${PORT}\n`);
});

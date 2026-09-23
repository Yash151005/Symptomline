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

  const doc = new PDFDocument({ size: 'A4', margin: 40, autoFirstPage: true });

  const fileName = `noted-report-${specialty}-${new Date().toISOString().split('T')[0]}.pdf`;
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
  res.setHeader('Content-Transfer-Encoding', 'binary');
  doc.pipe(res);

  const specialtyTheme = {
    neurologist: { primary: '#6c5ce7', light: '#f0eeff', label: 'Neurology Consultation Report', sub: 'Cranial, Migraine & Neurological Assessment' },
    gastroenterologist: { primary: '#00cec9', light: '#e6fffe', label: 'Gastroenterology Report', sub: 'Upper & Lower GI Motility & Reflux Assessment' },
    orthopedist: { primary: '#e17055', light: '#fff4f0', label: 'Orthopedic & Spine Report', sub: 'Musculoskeletal, Lumbar & Postural Assessment' },
    psychiatrist: { primary: '#e84393', light: '#fdeef6', label: 'Mental Health & Cardiology Report', sub: 'Autonomic, Stress, Palpitations & Sleep Assessment' },
    general: { primary: '#6c5ce7', light: '#f0eeff', label: 'Clinical Health Summary', sub: 'Comprehensive Multisystem Longitudinal Review' },
  };

  const theme = specialtyTheme[specialty] || specialtyTheme.general;
  const userName = req.user?.name || 'Patient';

  // ──── Top Header Banner ────
  doc.rect(40, 40, 515, 80).fill(theme.primary);
  doc.fillColor('#ffffff').fontSize(22).font('Helvetica-Bold').text('Noted.', 58, 55);
  doc.fontSize(8).font('Helvetica-Bold').fillColor('#ffffff').text('CLINICAL VISIT DOSSIER', 58, 82);

  doc.fillColor('#ffffff').fontSize(13).font('Helvetica-Bold').text(theme.label.toUpperCase(), 180, 55, { align: 'right', width: 355 });
  doc.fontSize(8.5).font('Helvetica').fillColor('#f0f2f7').text(theme.sub, 180, 72, { align: 'right', width: 355 });
  doc.fontSize(8).text(`Patient: ${userName}  |  Generated: ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })}`, 180, 88, { align: 'right', width: 355 });

  // ──── KPI Cards (4 Grid Boxes) ────
  const kpiY = 135;
  const cardW = 120;
  const cardH = 50;
  const cardGap = 11.6;

  const avgSev = entries.length ? (entries.reduce((a, b) => a + b.severity, 0) / entries.length).toFixed(1) : '0';
  const kpis = [
    { label: 'TOTAL ENTRIES', val: `${entries.length}`, color: '#6c5ce7', bg: '#f4f2ff' },
    { label: 'AVG SEVERITY', val: `${avgSev} / 5`, color: '#e17055', bg: '#fff4f0' },
    { label: 'PATTERNS FOUND', val: `${patterns.length}`, color: '#00b894', bg: '#e6f9f3' },
    { label: 'ACTIVE TREATMENTS', val: `${treatments.filter(t => !t.end_date).length}`, color: '#00cec9', bg: '#e6fffe' },
  ];

  kpis.forEach((kpi, i) => {
    const x = 40 + i * (cardW + cardGap);
    doc.roundedRect(x, kpiY, cardW, cardH, 6).fillAndStroke(kpi.bg, kpi.color);
    doc.fontSize(7.5).font('Helvetica-Bold').fillColor('#7a829e').text(kpi.label, x + 8, kpiY + 10, { width: cardW - 16, align: 'center' });
    doc.fontSize(15).font('Helvetica-Bold').fillColor(kpi.color).text(kpi.val, x + 8, kpiY + 24, { width: cardW - 16, align: 'center' });
  });

  let curY = 202;

  // ──── SECTION 1: Symptom Frequency Table ────
  doc.fontSize(11).font('Helvetica-Bold').fillColor('#1a1d2e').text('Symptom Frequency & Intensity (Last 90 Days)', 40, curY);
  curY += 18;

  doc.roundedRect(40, curY, 515, 22, 4).fill(theme.primary);
  doc.fontSize(8.5).font('Helvetica-Bold').fillColor('#ffffff');
  doc.text('Symptom Entity', 52, curY + 6);
  doc.text('Occurrences', 260, curY + 6, { width: 80, align: 'center' });
  doc.text('Avg Severity', 360, curY + 6, { width: 80, align: 'center' });
  doc.text('Impact Level', 460, curY + 6, { width: 80, align: 'center' });
  curY += 24;

  const sortedFreq = Object.entries(freq).sort((a, b) => b[1].count - a[1].count).slice(0, 5);
  sortedFreq.forEach(([symptom, data], idx) => {
    const rowBg = idx % 2 === 0 ? '#f9fafd' : '#ffffff';
    doc.rect(40, curY, 515, 20).fill(rowBg);
    const avg = (data.totalSev / data.count).toFixed(1);
    const sevNum = parseFloat(avg);
    const impactLabel = sevNum >= 4 ? 'High' : sevNum >= 2.5 ? 'Moderate' : 'Mild';
    const impactColor = sevNum >= 4 ? '#e17055' : sevNum >= 2.5 ? '#f39c12' : '#00b894';

    doc.fontSize(8.5).font('Helvetica-Bold').fillColor('#2d3436').text(symptom, 52, curY + 5);
    doc.font('Helvetica').fillColor('#4a5568').text(`${data.count}`, 260, curY + 5, { width: 80, align: 'center' });
    doc.text(`${avg} / 5`, 360, curY + 5, { width: 80, align: 'center' });
    doc.font('Helvetica-Bold').fillColor(impactColor).text(impactLabel, 460, curY + 5, { width: 80, align: 'center' });
    curY += 20;
  });
  curY += 14;

  // ──── SECTION 2: Detected Patterns ────
  if (patterns.length > 0) {
    doc.fontSize(11).font('Helvetica-Bold').fillColor('#1a1d2e').text('Detected Patterns & Clinical Correlations', 40, curY);
    curY += 16;

    patterns.slice(0, 3).forEach((p) => {
      doc.roundedRect(40, curY, 515, 42, 5).fillAndStroke('#fcfdff', '#e2e6f0');
      doc.rect(40, curY, 4, 42).fill(p.confidence >= 80 ? '#00b894' : '#6c5ce7');

      doc.fontSize(9).font('Helvetica-Bold').fillColor('#1a1d2e').text(p.symptom, 54, curY + 7);
      doc.fontSize(8).font('Helvetica-Bold').fillColor(p.confidence >= 80 ? '#00b894' : '#6c5ce7')
        .text(`${p.confidence}% Statistical Confidence`, 350, curY + 7, { align: 'right', width: 190 });

      doc.fontSize(8).font('Helvetica').fillColor('#4a5568').text(p.pattern, 54, curY + 20, { width: 485 });
      doc.fontSize(7.5).font('Helvetica-Oblique').fillColor('#718096').text(p.suggestion, 54, curY + 30, { width: 485 });
      curY += 48;
    });
    curY += 8;
  }

  // ──── SECTION 3: Treatments ────
  if (treatments.length > 0) {
    doc.fontSize(11).font('Helvetica-Bold').fillColor('#1a1d2e').text('Active & Recent Treatments', 40, curY);
    curY += 16;

    treatments.slice(0, 3).forEach((t) => {
      const isOngoing = !t.end_date;
      const badgeColor = isOngoing ? '#00b894' : '#9098b1';
      const badgeText = isOngoing ? 'ACTIVE' : 'COMPLETED';

      doc.roundedRect(40, curY, 515, 34, 4).fillAndStroke('#fcfdff', '#e5e9f2');
      doc.fontSize(9).font('Helvetica-Bold').fillColor('#2d3436').text(t.name, 52, curY + 6);

      doc.fontSize(7.5).font('Helvetica-Bold').fillColor(badgeColor).text(badgeText, 470, curY + 6, { align: 'right', width: 70 });
      doc.fontSize(7.5).font('Helvetica').fillColor('#718096')
        .text(`Started: ${new Date(t.start_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}${t.end_date ? `  |  Ended: ${new Date(t.end_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}` : ''}`, 52, curY + 18);
      if (t.notes) {
        doc.fontSize(7.5).font('Helvetica').fillColor('#4a5568').text(`Notes: ${t.notes}`, 220, curY + 18, { width: 320 });
      }
      curY += 38;
    });
  }

  // ──── Page 2: Consultation Questions & Timeline ────
  doc.addPage({ margin: 40 });

  // Header Banner Page 2
  doc.rect(40, 40, 515, 30).fill(theme.primary);
  doc.fillColor('#ffffff').fontSize(10).font('Helvetica-Bold').text('NOTED. CLINICAL DOSSIER — CONTINUED', 52, 49);
  doc.fontSize(8.5).font('Helvetica').text(`Patient: ${userName}  |  Specialty: ${specialty.toUpperCase()}`, 300, 50, { align: 'right', width: 240 });

  let p2Y = 85;

  // ──── SECTION 4: Doctor Questions Box ────
  doc.fontSize(11).font('Helvetica-Bold').fillColor('#1a1d2e').text('High-Yield Questions for Consultation', 40, p2Y);
  p2Y += 16;

  const boxH = Math.max(80, 20 + questions.length * 18);
  doc.roundedRect(40, p2Y, 515, boxH, 6).fillAndStroke(theme.light, theme.primary);
  p2Y += 12;
  questions.forEach((q, idx) => {
    doc.fontSize(8.5).font('Helvetica-Bold').fillColor(theme.primary).text(`${idx + 1}.`, 54, p2Y);
    doc.fontSize(8.5).font('Helvetica').fillColor('#2d3436').text(q, 70, p2Y, { width: 465 });
    p2Y += 18;
  });
  p2Y += 16;

  // ──── SECTION 5: Recent Timeline Logs ────
  doc.fontSize(11).font('Helvetica-Bold').fillColor('#1a1d2e').text('Recent Longitudinal Symptom Logs', 40, p2Y);
  p2Y += 16;

  entries.slice(0, 8).forEach((e) => {
    const dateStr = new Date(e.timestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    doc.roundedRect(40, p2Y, 515, 36, 4).fillAndStroke('#ffffff', '#edf0f7');

    const sevColor = e.severity >= 4 ? '#e17055' : e.severity >= 3 ? '#f39c12' : '#00b894';
    doc.circle(52, p2Y + 12, 4).fill(sevColor);

    doc.fontSize(8.5).font('Helvetica-Bold').fillColor('#1a1d2e').text(`${e.normalized_symptom} (${e.severity}/5)`, 62, p2Y + 7);
    doc.fontSize(7.5).font('Helvetica').fillColor('#8c94a8').text(dateStr, 350, p2Y + 7, { align: 'right', width: 190 });
    if (e.body_location) {
      doc.fontSize(7.5).font('Helvetica-Bold').fillColor('#6c5ce7').text(`[${e.body_location}]`, 62, p2Y + 20);
    }
    doc.fontSize(7.5).font('Helvetica-Oblique').fillColor('#4a5568').text(`"${e.raw_text}"`, 170, p2Y + 20, { width: 370 });

    p2Y += 40;
  });

  // ──── Footer ────
  doc.rect(40, 785, 515, 1).fill('#e2e6f0');
  doc.fontSize(7.5).font('Helvetica').fillColor('#a0aec0')
    .text('Confidential Medical Summary Prepared by Noted. Platform. For clinical informational review only.', 40, 792, { align: 'center', width: 515 })
    .text('Page 2 of 2  •  Not intended as a standalone diagnostic instrument.', 40, 802, { align: 'center', width: 515 });

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

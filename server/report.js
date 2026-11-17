import PDFDocument from 'pdfkit';
import db from './db.js';
import { detectPatterns, predictDoctorQuestions } from './patterns.js';
import { verifyLedger, loggingTimeliness } from './ledger.js';

export const SPECIALTY_THEME = {
  neurologist: { primary: '#6c5ce7', light: '#f0eeff', label: 'Neurology Consultation Report', sub: 'Cranial, Migraine & Neurological Assessment' },
  gastroenterologist: { primary: '#00cec9', light: '#e6fffe', label: 'Gastroenterology Report', sub: 'Upper & Lower GI Motility & Reflux Assessment' },
  orthopedist: { primary: '#e17055', light: '#fff4f0', label: 'Orthopedic & Spine Report', sub: 'Musculoskeletal, Lumbar & Postural Assessment' },
  psychiatrist: { primary: '#e84393', light: '#fdeef6', label: 'Mental Health & Cardiology Report', sub: 'Autonomic, Stress, Palpitations & Sleep Assessment' },
  general: { primary: '#6c5ce7', light: '#f0eeff', label: 'Clinical Health Summary', sub: 'Comprehensive Multisystem Longitudinal Review' },
};

function parseEntry(e) {
  e.context_tags = JSON.parse(e.context_tags || '[]');
  e.red_flags = JSON.parse(e.red_flags || '[]');
  return e;
}

/** Everything a report needs, computed once and shared by the PDF and the web view. */
export function collectReportData(profileId, { specialty = 'general', windowDays = 90 } = {}) {
  const cutoff = Date.now() - windowDays * 86400e3;
  const entries = db
    .prepare('SELECT * FROM symptom_entries WHERE profile_id = ? ORDER BY timestamp DESC')
    .all(profileId)
    .map(parseEntry)
    .filter((e) => Date.parse(e.timestamp) >= cutoff);

  const freqMap = {};
  entries.forEach((e) => {
    const f = (freqMap[e.normalized_symptom] ||= { count: 0, totalSev: 0 });
    f.count++;
    f.totalSev += e.severity;
  });
  const frequency = Object.entries(freqMap)
    .map(([symptom, d]) => ({ symptom, count: d.count, avg_severity: Math.round((d.totalSev / d.count) * 10) / 10 }))
    .sort((a, b) => b.count - a.count);

  // Weekly burden: entries and mean severity per ISO-ish week, oldest first.
  const weeks = new Map();
  entries.forEach((e) => {
    const d = new Date(e.timestamp);
    const monday = new Date(d.getFullYear(), d.getMonth(), d.getDate() - ((d.getDay() + 6) % 7));
    const key = monday.toISOString().slice(0, 10);
    const w = weeks.get(key) || { week_start: key, count: 0, totalSev: 0 };
    w.count++;
    w.totalSev += e.severity;
    weeks.set(key, w);
  });
  const weekly = [...weeks.values()]
    .sort((a, b) => a.week_start.localeCompare(b.week_start))
    .map((w) => ({ week_start: w.week_start, count: w.count, avg_severity: Math.round((w.totalSev / w.count) * 10) / 10 }));

  return {
    specialty,
    windowDays,
    entries,
    frequency,
    weekly,
    flaggedEntries: entries.filter((e) => e.red_flags.length > 0),
    treatments: db.prepare('SELECT * FROM treatments WHERE profile_id = ? ORDER BY start_date DESC').all(profileId),
    patterns: detectPatterns(profileId),
    questions: predictDoctorQuestions(profileId, specialty),
    integrity: verifyLedger(profileId),
    timeliness: loggingTimeliness(profileId),
  };
}

export function integrityLine({ integrity, timeliness }) {
  const label = { verified: 'VERIFIED', unattested: 'PARTIALLY ATTESTED', tampered: 'INTEGRITY CHECK FAILED' }[integrity.status];
  const head = integrity.head_hash ? `  •  ledger head ${integrity.head_hash.slice(0, 12)}` : '';
  const timing = timeliness.pct_realtime == null ? '' : `  •  ${timeliness.pct_realtime}% logged within 6h of onset`;
  return `Timeline integrity: ${label}  •  ${integrity.events} audit events, ${integrity.edited_entries} entries edited${head}${timing}`;
}

/** Stream the specialty PDF to `out` (an HTTP response or any writable). */
export function renderReportPdf(out, data, { userName = 'Patient', includeRawText = true, sharedVia = null } = {}) {
  const { specialty, windowDays, entries, flaggedEntries, treatments, patterns, questions, frequency } = data;
  const doc = new PDFDocument({ size: 'A4', margin: 40, autoFirstPage: true });
  doc.pipe(out);

  const theme = SPECIALTY_THEME[specialty] || SPECIALTY_THEME.general;
  const quote = (e) => (includeRawText ? `"${e.raw_text}"` : (e.context_tags || []).join(', ') || '—');

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
    { label: 'ACTIVE TREATMENTS', val: `${treatments.filter((t) => !t.end_date).length}`, color: '#00cec9', bg: '#e6fffe' },
  ];

  kpis.forEach((kpi, i) => {
    const x = 40 + i * (cardW + cardGap);
    doc.roundedRect(x, kpiY, cardW, cardH, 6).fillAndStroke(kpi.bg, kpi.color);
    doc.fontSize(7.5).font('Helvetica-Bold').fillColor('#7a829e').text(kpi.label, x + 8, kpiY + 10, { width: cardW - 16, align: 'center' });
    doc.fontSize(15).font('Helvetica-Bold').fillColor(kpi.color).text(kpi.val, x + 8, kpiY + 24, { width: cardW - 16, align: 'center' });
  });

  let curY = 202;

  // ──── SECTION 1: Symptom Frequency Table ────
  doc.fontSize(11).font('Helvetica-Bold').fillColor('#1a1d2e').text(`Symptom Frequency & Intensity (Last ${windowDays} Days)`, 40, curY);
  curY += 18;

  doc.roundedRect(40, curY, 515, 22, 4).fill(theme.primary);
  doc.fontSize(8.5).font('Helvetica-Bold').fillColor('#ffffff');
  doc.text('Symptom Entity', 52, curY + 6);
  doc.text('Occurrences', 260, curY + 6, { width: 80, align: 'center' });
  doc.text('Avg Severity', 360, curY + 6, { width: 80, align: 'center' });
  doc.text('Impact Level', 460, curY + 6, { width: 80, align: 'center' });
  curY += 24;

  frequency.slice(0, 5).forEach((row, idx) => {
    const rowBg = idx % 2 === 0 ? '#f9fafd' : '#ffffff';
    doc.rect(40, curY, 515, 20).fill(rowBg);
    const sevNum = row.avg_severity;
    const impactLabel = sevNum >= 4 ? 'High' : sevNum >= 2.5 ? 'Moderate' : 'Mild';
    const impactColor = sevNum >= 4 ? '#e17055' : sevNum >= 2.5 ? '#f39c12' : '#00b894';

    doc.fontSize(8.5).font('Helvetica-Bold').fillColor('#2d3436').text(row.symptom, 52, curY + 5);
    doc.font('Helvetica').fillColor('#4a5568').text(`${row.count}`, 260, curY + 5, { width: 80, align: 'center' });
    doc.text(`${sevNum.toFixed(1)} / 5`, 360, curY + 5, { width: 80, align: 'center' });
    doc.font('Helvetica-Bold').fillColor(impactColor).text(impactLabel, 460, curY + 5, { width: 80, align: 'center' });
    curY += 20;
  });
  curY += 14;

  // ──── SECTION 2: Detected Patterns ────
  if (patterns.length > 0) {
    doc.fontSize(11).font('Helvetica-Bold').fillColor('#1a1d2e').text('Detected Patterns & Clinical Correlations', 40, curY);
    curY += 16;

    patterns.slice(0, 3).forEach((p) => {
      const isStat = p.method === 'statistical';
      const accent = isStat ? '#00b894' : '#9098b1';
      doc.roundedRect(40, curY, 515, 42, 5).fillAndStroke('#fcfdff', '#e2e6f0');
      doc.rect(40, curY, 4, 42).fill(accent);

      doc.fontSize(9).font('Helvetica-Bold').fillColor('#1a1d2e').text(p.symptom, 54, curY + 7);
      const badge = isStat
        ? `OR ${p.stats.odds_ratio.toFixed(1)} (95% CI ${p.stats.ci_low.toFixed(1)}–${p.stats.ci_high.toFixed(1)}), q=${p.stats.q_value.toFixed(3)}`
        : 'Descriptive — not statistically tested';
      doc.fontSize(8).font('Helvetica-Bold').fillColor(accent)
        .text(badge, 250, curY + 7, { align: 'right', width: 290 });

      // The OR/CI is already in the badge; keep each line to one row of the card.
      const patternText = isStat ? p.pattern.split(' — OR ')[0] : p.pattern;
      doc.fontSize(8).font('Helvetica').fillColor('#4a5568').text(patternText, 54, curY + 19, { width: 485, height: 10, ellipsis: true });
      doc.fontSize(7.5).font('Helvetica-Oblique').fillColor('#718096').text(p.suggestion, 54, curY + 30, { width: 485, height: 9, ellipsis: true });
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
        doc.fontSize(7.5).font('Helvetica').fillColor('#4a5568').text(`Notes: ${t.notes}`, 220, curY + 18, { width: 320, height: 10, ellipsis: true });
      }
      curY += 38;
    });
  }

  // ──── Page 1 Footer (with integrity attestation) ────
  const integrityColor = data.integrity.status === 'tampered' ? '#c0392b' : data.integrity.status === 'verified' ? '#00a37a' : '#b7791f';
  doc.fontSize(7).font('Helvetica-Bold').fillColor(integrityColor)
    .text(integrityLine(data), 40, 760, { align: 'center', width: 515, height: 10, ellipsis: true });
  doc.rect(40, 775, 515, 1).fill('#e2e6f0');
  doc.fontSize(7.5).font('Helvetica').fillColor('#a0aec0')
    .text(`Confidential Medical Summary Prepared by Noted. Platform${sharedVia ? '  •  Shared via secure clinician link' : ''}  •  Page 1 of 2`, 40, 785, { align: 'center', width: 515, height: 11 });

  // ──── Page 2: Consultation Questions & Timeline ────
  doc.addPage({ margin: 40 });

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
    doc.fontSize(8.5).font('Helvetica').fillColor('#2d3436').text(q, 70, p2Y, { width: 465, height: 14, ellipsis: true });
    p2Y += 18;
  });
  p2Y += 16;

  // ──── SECTION 4b: Safety flags ────
  if (flaggedEntries.length > 0) {
    doc.fontSize(11).font('Helvetica-Bold').fillColor('#c0392b').text(`Safety Alerts Raised (${flaggedEntries.length})`, 40, p2Y);
    p2Y += 16;
    flaggedEntries.slice(0, 3).forEach((e) => {
      const f = e.red_flags[0];
      const dateStr = new Date(e.timestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
      doc.roundedRect(40, p2Y, 515, 30, 4).fillAndStroke('#fff5f5', '#f5c6cb');
      doc.fontSize(8.5).font('Helvetica-Bold').fillColor('#c0392b')
        .text(`${f.level.toUpperCase()}: ${f.title}`, 52, p2Y + 5, { width: 360, height: 12, ellipsis: true });
      doc.fontSize(7.5).font('Helvetica').fillColor('#8c94a8')
        .text(`${dateStr}${e.red_flag_acknowledged_at ? '  •  guidance acknowledged' : ''}`, 350, p2Y + 5, { align: 'right', width: 190, height: 12 });
      doc.fontSize(7.5).font('Helvetica-Oblique').fillColor('#4a5568')
        .text(quote(e), 52, p2Y + 17, { width: 488, height: 11, ellipsis: true });
      p2Y += 34;
    });
    p2Y += 10;
  }

  // ──── SECTION 5: Recent Timeline Logs ────
  doc.fontSize(11).font('Helvetica-Bold').fillColor('#1a1d2e').text('Recent Longitudinal Symptom Logs', 40, p2Y);
  p2Y += 16;

  entries.slice(0, 6).forEach((e) => {
    const dateStr = new Date(e.timestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    doc.roundedRect(40, p2Y, 515, 36, 4).fillAndStroke('#ffffff', '#edf0f7');

    const sevColor = e.severity >= 4 ? '#e17055' : e.severity >= 3 ? '#f39c12' : '#00b894';
    doc.circle(52, p2Y + 12, 4).fill(sevColor);

    doc.fontSize(8.5).font('Helvetica-Bold').fillColor('#1a1d2e').text(`${e.normalized_symptom} (${e.severity}/5)`, 62, p2Y + 7, { height: 12 });
    doc.fontSize(7.5).font('Helvetica').fillColor('#8c94a8').text(dateStr, 350, p2Y + 7, { align: 'right', width: 190, height: 12 });
    if (e.body_location) {
      doc.fontSize(7.5).font('Helvetica-Bold').fillColor('#6c5ce7').text(`[${e.body_location}]`, 62, p2Y + 20, { width: 105, height: 12, ellipsis: true });
    }
    doc.fontSize(7.5).font('Helvetica-Oblique').fillColor('#4a5568').text(quote(e), 170, p2Y + 20, { width: 370, height: 12, ellipsis: true });

    p2Y += 40;
  });

  // ──── Page 2 Footer ────
  doc.rect(40, 775, 515, 1).fill('#e2e6f0');
  doc.fontSize(7.5).font('Helvetica').fillColor('#a0aec0')
    .text('Confidential Medical Summary Prepared by Noted. Platform. For clinical informational review only.', 40, 782, { align: 'center', width: 515, height: 11 })
    .text('Page 2 of 2  •  Not intended as a standalone diagnostic instrument.', 40, 793, { align: 'center', width: 515, height: 11 });

  doc.end();
}

/** JSON for the clinician web view. Raw patient text is optional (minimum necessary). */
export function clinicianSummary(data, { patientName, includeRawText, expiresAt }) {
  const strip = (e) => ({
    id: e.id,
    timestamp: e.timestamp,
    symptom: e.normalized_symptom,
    severity: e.severity,
    body_location: e.body_location,
    context_tags: e.context_tags,
    edited: !!e.edited_at,
    red_flags: e.red_flags.map((f) => ({ level: f.level, title: f.title })),
    ...(includeRawText ? { raw_text: e.raw_text } : {}),
  });
  return {
    patient: { name: patientName },
    specialty: data.specialty,
    window_days: data.windowDays,
    generated_at: new Date().toISOString(),
    link_expires_at: expiresAt,
    include_raw_text: includeRawText,
    totals: {
      entries: data.entries.length,
      avg_severity: data.entries.length
        ? Math.round((data.entries.reduce((a, e) => a + e.severity, 0) / data.entries.length) * 10) / 10
        : 0,
      symptom_days: new Set(data.entries.map((e) => new Date(e.timestamp).toDateString())).size,
    },
    frequency: data.frequency,
    weekly: data.weekly,
    patterns: data.patterns.map((p) => ({ symptom: p.symptom, method: p.method, pattern: p.pattern, stats: p.stats || null })),
    treatments: data.treatments.map((t) => ({ name: t.name, start_date: t.start_date, end_date: t.end_date, notes: t.notes })),
    safety_alerts: data.flaggedEntries.map(strip),
    questions: data.questions,
    integrity: data.integrity,
    timeliness: data.timeliness,
    entries: data.entries.slice(0, 100).map(strip),
  };
}

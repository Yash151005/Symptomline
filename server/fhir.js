/**
 * HL7 FHIR R4 export.
 *
 * Produces a `collection` Bundle with:
 *   Patient              - name only (minimum necessary: no email, no login data)
 *   Observation          - one per symptom entry, patient-reported, with severity,
 *                          body site, context and safety-screen notes
 *   MedicationStatement  - one per treatment
 *
 * Symptom codes: SNOMED CT clinical findings are attached only where the
 * normalized symptom maps cleanly; everything else is sent as text, which
 * FHIR permits. Have a terminologist review SNOMED_MAP before production use.
 */

const SNOMED = 'http://snomed.info/sct';
const OBS_CATEGORY = 'http://terminology.hl7.org/CodeSystem/observation-category';

// Ordered: first match wins, so specific terms precede general ones.
export const SNOMED_MAP = [
  { match: ['migraine'], code: '37796009', display: 'Migraine' },
  { match: ['headache'], code: '25064002', display: 'Headache' },
  { match: ['nausea'], code: '422587007', display: 'Nausea' },
  { match: ['vomit'], code: '422400008', display: 'Vomiting' },
  { match: ['dizziness', 'dizzy', 'lightheaded'], code: '404640003', display: 'Dizziness' },
  { match: ['fatigue', 'exhaustion'], code: '84229001', display: 'Fatigue' },
  { match: ['low back pain', 'lower back pain', 'lumbar pain'], code: '279039007', display: 'Low back pain' },
  { match: ['back pain', 'backache'], code: '161891005', display: 'Backache' },
  { match: ['heartburn'], code: '16331000', display: 'Heartburn' },
  { match: ['abdominal pain', 'stomach pain', 'epigastric pain'], code: '21522001', display: 'Abdominal pain' },
  { match: ['bloating'], code: '116289008', display: 'Abdominal bloating' },
  { match: ['insomnia'], code: '193462001', display: 'Insomnia' },
  { match: ['palpitation'], code: '80313002', display: 'Palpitations' },
  { match: ['anxiety'], code: '48694002', display: 'Anxiety' },
  { match: ['chest pain'], code: '29857009', display: 'Chest pain' },
  { match: ['neck pain'], code: '81680005', display: 'Neck pain' },
  { match: ['shortness of breath', 'dyspnea', 'dyspnoea'], code: '267036007', display: 'Dyspnea' },
];

export function snomedFor(symptom) {
  const s = String(symptom || '').toLowerCase();
  const hit = SNOMED_MAP.find((m) => m.match.some((k) => s.includes(k)));
  return hit ? { system: SNOMED, code: hit.code, display: hit.display } : null;
}

/** SQLite datetime('now') is 'YYYY-MM-DD HH:MM:SS' in UTC; FHIR instants need a zone. */
export function toInstant(v) {
  if (!v) return undefined;
  const iso = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(v) ? `${v.replace(' ', 'T')}Z` : v;
  const t = Date.parse(iso);
  return Number.isNaN(t) ? undefined : new Date(t).toISOString();
}

function parseJson(v, fallback) {
  if (typeof v !== 'string') return v ?? fallback;
  try { return JSON.parse(v); } catch { return fallback; }
}

function entryToObservation(e, patientRef) {
  const coding = snomedFor(e.normalized_symptom);
  const tags = parseJson(e.context_tags, []);
  const flags = parseJson(e.red_flags, []);
  const notes = [{ text: `Patient's words: "${e.raw_text}"` }];
  flags.forEach((f) => notes.push({ text: `Safety screen ${String(f.level).toUpperCase()}: ${f.title}` }));
  if (e.original_timestamp && e.original_timestamp !== e.timestamp) {
    notes.push({ text: `Onset time corrected by patient; originally recorded as ${e.original_timestamp}` });
  }

  return {
    resourceType: 'Observation',
    id: e.id,
    meta: { lastUpdated: toInstant(e.edited_at) || toInstant(e.created_at) },
    status: e.edited_at ? 'amended' : 'final',
    category: [{ coding: [{ system: OBS_CATEGORY, code: 'survey', display: 'Survey' }], text: 'Patient-reported symptom' }],
    code: { ...(coding ? { coding: [coding] } : {}), text: e.normalized_symptom || 'Symptom' },
    subject: { reference: patientRef },
    effectiveDateTime: toInstant(e.timestamp),
    issued: toInstant(e.created_at),
    performer: [{ reference: patientRef }],
    ...(e.body_location ? { bodySite: { text: e.body_location } } : {}),
    component: [
      {
        code: { text: 'Patient-reported severity (1 = minimal, 5 = extreme)' },
        valueInteger: Number(e.severity),
      },
      ...(tags.length ? [{ code: { text: 'Reported context' }, valueString: tags.join(', ') }] : []),
    ],
    note: notes,
  };
}

function treatmentToStatement(t, patientRef) {
  return {
    resourceType: 'MedicationStatement',
    id: t.id,
    status: t.end_date ? 'completed' : 'active',
    medicationCodeableConcept: { text: t.name },
    subject: { reference: patientRef },
    effectivePeriod: { start: t.start_date, ...(t.end_date ? { end: t.end_date } : {}) },
    ...(t.notes ? { note: [{ text: t.notes }] } : {}),
  };
}

export function buildFhirBundle({ profile, entries, treatments, now = new Date() }) {
  const patientRef = `urn:uuid:${profile.id}`;
  const resources = [
    { resourceType: 'Patient', id: profile.id, name: [{ text: profile.name }] },
    ...entries.map((e) => entryToObservation(e, patientRef)),
    ...treatments.map((t) => treatmentToStatement(t, patientRef)),
  ];
  return {
    resourceType: 'Bundle',
    type: 'collection',
    timestamp: now.toISOString(),
    meta: { tag: [{ display: 'Patient-generated health data exported from Noted.' }] },
    entry: resources.map((r) => ({ fullUrl: `urn:uuid:${r.id}`, resource: r })),
  };
}

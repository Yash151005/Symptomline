import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildFhirBundle, snomedFor, toInstant } from '../fhir.js';

const profile = { id: '6f1c2b1e-0000-4000-8000-000000000001', name: 'Alice Vance' };
const entries = [
  {
    id: '6f1c2b1e-0000-4000-8000-000000000002', timestamp: '2026-03-01T09:00:00.000Z', raw_text: 'pounding migraine',
    normalized_symptom: 'Migraine', severity: 4, body_location: 'Left temple', context_tags: '["poor_sleep"]',
    red_flags: '[]', created_at: '2026-03-01 09:30:00', edited_at: null,
  },
  {
    id: '6f1c2b1e-0000-4000-8000-000000000003', timestamp: '2026-03-02T09:00:00.000Z', raw_text: 'weird tingling',
    normalized_symptom: 'Brain fog', severity: 2, body_location: null, context_tags: '[]',
    red_flags: '[{"id":"stroke","level":"emergency","title":"Possible stroke"}]', created_at: '2026-03-02 09:05:00',
    edited_at: '2026-03-03 10:00:00', original_timestamp: '2026-03-02T07:00:00.000Z',
  },
];
const treatments = [{ id: '6f1c2b1e-0000-4000-8000-000000000004', name: 'Sumatriptan 50mg', start_date: '2026-02-01', end_date: null, notes: 'as needed' }];

test('snomedFor prefers the most specific match and leaves unknowns uncoded', () => {
  assert.equal(snomedFor('Tension headache').code, '25064002');
  assert.equal(snomedFor('Vestibular migraine').code, '37796009');
  assert.equal(snomedFor('Lower back pain').code, '279039007');
  assert.equal(snomedFor('Brain fog'), null);
});

test('toInstant converts SQLite UTC datetimes to ISO instants', () => {
  assert.equal(toInstant('2026-03-01 09:30:00'), '2026-03-01T09:30:00.000Z');
  assert.equal(toInstant(null), undefined);
  assert.equal(toInstant('garbage'), undefined);
});

test('bundle is a valid-shaped R4 collection with Patient, Observations and MedicationStatement', () => {
  const b = buildFhirBundle({ profile, entries, treatments, now: new Date('2026-03-05T00:00:00Z') });
  assert.equal(b.resourceType, 'Bundle');
  assert.equal(b.type, 'collection');
  assert.deepEqual(b.entry.map((e) => e.resource.resourceType), ['Patient', 'Observation', 'Observation', 'MedicationStatement']);
  for (const e of b.entry) assert.equal(e.fullUrl, `urn:uuid:${e.resource.id}`);

  const [, migraine, fog] = b.entry.map((e) => e.resource);
  assert.equal(migraine.status, 'final');
  assert.deepEqual(migraine.code.coding[0], { system: 'http://snomed.info/sct', code: '37796009', display: 'Migraine' });
  assert.equal(migraine.subject.reference, `urn:uuid:${profile.id}`);
  assert.equal(migraine.component[0].valueInteger, 4);
  assert.equal(migraine.issued, '2026-03-01T09:30:00.000Z');

  assert.equal(fog.status, 'amended');
  assert.equal(fog.code.coding, undefined);
  assert.equal(fog.code.text, 'Brain fog');
  assert.equal(fog.bodySite, undefined);
  assert.ok(fog.note.some((n) => /EMERGENCY: Possible stroke/.test(n.text)));
  assert.ok(fog.note.some((n) => /originally recorded/.test(n.text)));

  const med = b.entry[3].resource;
  assert.equal(med.status, 'active');
  assert.equal(med.medicationCodeableConcept.text, 'Sumatriptan 50mg');
});

test('patient resource contains no login data', () => {
  const b = buildFhirBundle({ profile: { ...profile, email: 'a@b.c' }, entries: [], treatments: [] });
  assert.deepEqual(Object.keys(b.entry[0].resource).sort(), ['id', 'name', 'resourceType']);
});

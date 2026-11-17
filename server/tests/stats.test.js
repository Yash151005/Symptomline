import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  oddsRatio, fisherExact, benjaminiHochberg, checkinExposures,
  buildDailyDataset, analyzeTriggers, previousDayKey,
} from '../stats.js';

const close = (actual, expected, tol = 1e-3) =>
  assert.ok(Math.abs(actual - expected) < tol, `expected ${expected}, got ${actual}`);

test('oddsRatio matches hand calculation with Woolf CI', () => {
  // OR = (10*20)/(5*5) = 8; SE = sqrt(1/10+1/5+1/5+1/20) = 0.7416
  const r = oddsRatio(10, 5, 5, 20);
  close(r.or, 8);
  close(r.ciLow, Math.exp(Math.log(8) - 1.959964 * 0.74162), 1e-3);
  close(r.ciHigh, Math.exp(Math.log(8) + 1.959964 * 0.74162), 1e-2);
  assert.equal(r.corrected, false);
});

test('oddsRatio applies Haldane correction for zero cells', () => {
  const r = oddsRatio(5, 0, 2, 10);
  assert.equal(r.corrected, true);
  assert.ok(Number.isFinite(r.or) && r.or > 1);
});

test('fisherExact matches reference values', () => {
  // Fisher's tea-tasting table: two-sided p = 0.4857
  close(fisherExact(3, 1, 1, 3), 0.4857, 1e-3);
  // Reference: scipy.stats.fisher_exact([[10,5],[5,20]]) p = 0.0061659
  close(fisherExact(10, 5, 5, 20), 0.0061659, 1e-6);
  close(fisherExact(5, 5, 5, 5), 1, 1e-9);
});

test('benjaminiHochberg adjusts and preserves order', () => {
  const q = benjaminiHochberg([0.01, 0.04, 0.03, 0.5]);
  close(q[0], 0.04);
  close(q[1], 0.05333);
  close(q[2], 0.05333);
  close(q[3], 0.5);
});

test('checkinExposures derives binary exposures from thresholds and tags', () => {
  const x = checkinExposures({ sleep_hours: 5, stress: 4, caffeine_cups: 3, exercise_minutes: 0, screen_hours: 2, tags: '["Skipped Meal"]' });
  assert.deepEqual([...x].sort(), ['caffeine', 'high_caffeine', 'poor_sleep', 'sedentary', 'skipped_meal', 'stress']);
  assert.equal(checkinExposures({ sleep_hours: 8, sleep_quality: 4 }).size, 0);
});

test('previousDayKey crosses month and year boundaries', () => {
  assert.equal(previousDayKey('2026-03-01'), '2026-02-28');
  assert.equal(previousDayKey('2026-01-01'), '2025-12-31');
});

// Build 40 days where poor sleep the night before strongly predicts migraine,
// and caffeine is independent noise.
function syntheticData() {
  const checkins = [];
  const entries = [];
  const start = new Date(2026, 0, 1);
  for (let i = 0; i < 40; i++) {
    const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const poor = i % 3 === 0;
    checkins.push({ date: key, sleep_hours: poor ? 4.5 : 7.5, caffeine_cups: i % 2 });
    if (poor && i % 9 !== 0) entries.push({ id: `e${i}`, timestamp: new Date(d.getTime() + 9 * 3600e3).toISOString(), normalized_symptom: 'Migraine' });
    if (!poor && i % 11 === 1) entries.push({ id: `n${i}`, timestamp: new Date(d.getTime() + 9 * 3600e3).toISOString(), normalized_symptom: 'Migraine' });
  }
  return { checkins, entries };
}

test('analyzeTriggers needs enough observed days', () => {
  const { checkins, entries } = syntheticData();
  const r = analyzeTriggers(buildDailyDataset(entries, checkins.slice(0, 10)));
  assert.equal(r.ready, false);
  assert.equal(r.findings.length, 0);
});

test('analyzeTriggers finds a real trigger and ignores noise', () => {
  const { checkins, entries } = syntheticData();
  const r = analyzeTriggers(buildDailyDataset(entries, checkins));
  assert.equal(r.ready, true);
  const sleep = r.findings.find((f) => f.exposure === 'poor_sleep' && f.symptom === 'Migraine');
  assert.ok(sleep, 'poor_sleep → Migraine should be detected');
  assert.equal(sleep.lag, 0);
  assert.ok(sleep.ci_low > 1);
  assert.ok(sleep.q_value < 0.1);
  assert.ok(!r.findings.some((f) => f.exposure === 'caffeine'), 'caffeine is noise and must not be reported');
});

test('symptom-entry tags alone never produce a statistical finding', () => {
  // The old engine's flaw: a tag present on every symptom entry looked like
  // 100% "confidence". With no check-ins there are no observed days.
  const entries = Array.from({ length: 20 }, (_, i) => ({
    id: `e${i}`, timestamp: new Date(2026, 0, i + 1, 9).toISOString(), normalized_symptom: 'Headache',
  }));
  const r = analyzeTriggers(buildDailyDataset(entries, []));
  assert.equal(r.ready, false);
});

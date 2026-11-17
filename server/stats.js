/**
 * Statistical trigger engine.
 *
 * Unit of analysis is the patient-DAY, not the symptom entry. For each
 * (symptom, exposure) pair we build a 2×2 table over every day the patient
 * completed a daily check-in:
 *
 *                      symptom day   symptom-free day
 *   exposed                 a               b
 *   not exposed             c               d
 *
 * and report the odds ratio with a 95% confidence interval, a two-sided
 * Fisher exact p-value, and a Benjamini–Hochberg FDR-adjusted q-value
 * (because we test many pairs at once).
 *
 * Exposures come ONLY from check-ins. Context tags extracted from symptom
 * entries are recorded only on symptom days, so using them would guarantee
 * a spurious association (differential measurement bias) — exactly the
 * flaw of the old "tag appeared in X% of entries" confidence.
 *
 * Everything in this file is pure (no DB access) so it can be unit-tested.
 */

const Z_95 = 1.959964;

// ──── Exposure derivation ────

/** Thresholds that turn raw check-in values into binary exposures. */
export const EXPOSURE_RULES = [
  { tag: 'poor_sleep', label: 'poor sleep', test: (c) => (c.sleep_hours != null && c.sleep_hours < 6) || (c.sleep_quality != null && c.sleep_quality <= 2) },
  { tag: 'stress', label: 'high stress', test: (c) => c.stress != null && c.stress >= 4 },
  { tag: 'caffeine', label: 'caffeine', test: (c) => c.caffeine_cups != null && c.caffeine_cups >= 1 },
  { tag: 'high_caffeine', label: '3+ cups of caffeine', test: (c) => c.caffeine_cups != null && c.caffeine_cups >= 3 },
  { tag: 'alcohol', label: 'alcohol', test: (c) => c.alcohol_units != null && c.alcohol_units >= 1 },
  { tag: 'exercise', label: 'exercise (20+ min)', test: (c) => c.exercise_minutes != null && c.exercise_minutes >= 20 },
  { tag: 'sedentary', label: 'no exercise', test: (c) => c.exercise_minutes != null && c.exercise_minutes === 0 },
  { tag: 'screen_time', label: '6+ hours of screens', test: (c) => c.screen_hours != null && c.screen_hours >= 6 },
];

const RULE_LABELS = Object.fromEntries(EXPOSURE_RULES.map((r) => [r.tag, r.label]));

export function exposureLabel(tag) {
  return RULE_LABELS[tag] || tag.replace(/_/g, ' ');
}

export function checkinExposures(checkin) {
  const set = new Set();
  for (const rule of EXPOSURE_RULES) if (rule.test(checkin)) set.add(rule.tag);
  const extra = typeof checkin.tags === 'string' ? safeJson(checkin.tags, []) : checkin.tags || [];
  for (const t of extra) if (typeof t === 'string' && t.trim()) set.add(t.trim().toLowerCase().replace(/\s+/g, '_'));
  return set;
}

// ──── Dates ────

/** Local calendar date (YYYY-MM-DD) of an ISO timestamp. */
export function localDayKey(ts) {
  const d = new Date(ts);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function previousDayKey(key) {
  const [y, m, d] = key.split('-').map(Number);
  const dt = new Date(y, m - 1, d - 1);
  return localDayKey(dt);
}

// ──── Dataset ────

/**
 * Build the day-level dataset. Only days with a check-in are "observed":
 * on other days we cannot tell "no exposure" from "didn't record".
 * @returns {{date:string, exposures:Set<string>, symptoms:Map<string,string[]>}[]}
 */
export function buildDailyDataset(entries, checkins) {
  const entriesByDay = new Map();
  for (const e of entries) {
    if (!e.normalized_symptom) continue;
    const key = localDayKey(e.timestamp);
    if (!entriesByDay.has(key)) entriesByDay.set(key, new Map());
    const m = entriesByDay.get(key);
    if (!m.has(e.normalized_symptom)) m.set(e.normalized_symptom, []);
    m.get(e.normalized_symptom).push(e.id);
  }

  return checkins
    .map((c) => ({
      date: c.date,
      exposures: checkinExposures(c),
      symptoms: entriesByDay.get(c.date) || new Map(),
    }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

// ──── Statistics ────

/**
 * Odds ratio with Woolf (log) 95% CI. Applies the Haldane–Anscombe +0.5
 * correction when any cell is zero.
 */
export function oddsRatio(a, b, c, d) {
  let [A, B, C, D] = [a, b, c, d];
  const corrected = [A, B, C, D].some((x) => x === 0);
  if (corrected) [A, B, C, D] = [A + 0.5, B + 0.5, C + 0.5, D + 0.5];
  const or = (A * D) / (B * C);
  const se = Math.sqrt(1 / A + 1 / B + 1 / C + 1 / D);
  const ln = Math.log(or);
  return {
    or,
    ciLow: Math.exp(ln - Z_95 * se),
    ciHigh: Math.exp(ln + Z_95 * se),
    corrected,
  };
}

const logFactCache = [0];
function logFactorial(n) {
  for (let i = logFactCache.length; i <= n; i++) logFactCache[i] = logFactCache[i - 1] + Math.log(i);
  return logFactCache[n];
}

/** Two-sided Fisher exact test p-value for a 2×2 table. */
export function fisherExact(a, b, c, d) {
  const r1 = a + b;
  const r2 = c + d;
  const c1 = a + c;
  const n = r1 + r2;
  const logDenom = logFactorial(n) - logFactorial(r1) - logFactorial(r2) - logFactorial(c1) - logFactorial(n - c1);
  const logP = (x) =>
    -(logFactorial(x) + logFactorial(r1 - x) + logFactorial(c1 - x) + logFactorial(r2 - c1 + x)) - logDenom;

  const observed = logP(a);
  const lo = Math.max(0, c1 - r2);
  const hi = Math.min(r1, c1);
  let p = 0;
  for (let x = lo; x <= hi; x++) {
    const lp = logP(x);
    if (lp <= observed + 1e-7) p += Math.exp(lp);
  }
  return Math.min(1, p);
}

/** Benjamini–Hochberg FDR-adjusted q-values, returned in input order. */
export function benjaminiHochberg(pValues) {
  const m = pValues.length;
  const order = pValues.map((p, i) => [p, i]).sort((x, y) => x[0] - y[0]);
  const q = new Array(m);
  let running = 1;
  for (let k = m - 1; k >= 0; k--) {
    const [p, i] = order[k];
    running = Math.min(running, (p * m) / (k + 1));
    q[i] = running;
  }
  return q;
}

// ──── Trigger analysis ────

export const ANALYSIS_DEFAULTS = {
  minDays: 14,        // observed (checked-in) days before any test is run
  minSymptomDays: 3,  // symptom must occur on at least this many observed days
  minExposedDays: 3,  // exposure must be present on at least this many days...
  minUnexposedDays: 3,// ...and absent on at least this many
  minCooccur: 2,      // exposed symptom days (cell a) needed for a risk finding
  fdr: 0.1,           // report findings with q below this
};

/**
 * Run all (symptom × exposure × lag) tests.
 * @returns {{ready:boolean, observedDays:number, minDays:number, testsRun:number, findings:object[]}}
 */
export function analyzeTriggers(days, options = {}) {
  const opt = { ...ANALYSIS_DEFAULTS, ...options };
  const observedDays = days.length;
  if (observedDays < opt.minDays) {
    return { ready: false, observedDays, minDays: opt.minDays, testsRun: 0, testedPairs: [], findings: [] };
  }

  const byDate = new Map(days.map((d) => [d.date, d]));
  const symptoms = new Set();
  const exposures = new Set();
  for (const d of days) {
    d.symptoms.forEach((_, s) => symptoms.add(s));
    d.exposures.forEach((x) => exposures.add(x));
  }

  const tests = [];
  for (const symptom of symptoms) {
    for (const exposure of exposures) {
      for (const lag of [0, 1]) {
        let a = 0, b = 0, c = 0, d = 0;
        const supporting = [];
        for (const day of days) {
          const src = lag === 0 ? day : byDate.get(previousDayKey(day.date));
          if (!src) continue; // previous day not observed
          const exposed = src.exposures.has(exposure);
          const ids = day.symptoms.get(symptom);
          if (exposed && ids) { a++; supporting.push(...ids); }
          else if (exposed) b++;
          else if (ids) c++;
          else d++;
        }
        const n = a + b + c + d;
        if (a + c < opt.minSymptomDays) continue;
        if (a + b < opt.minExposedDays || c + d < opt.minUnexposedDays) continue;

        const { or, ciLow, ciHigh, corrected } = oddsRatio(a, b, c, d);
        tests.push({
          symptom, exposure, lag, n,
          table: { a, b, c, d },
          odds_ratio: or,
          ci_low: ciLow,
          ci_high: ciHigh,
          haldane_corrected: corrected,
          p_value: fisherExact(a, b, c, d),
          risk_exposed: a / (a + b),
          risk_unexposed: c / (c + d),
          supporting_entries: supporting,
        });
      }
    }
  }

  const q = benjaminiHochberg(tests.map((t) => t.p_value));
  tests.forEach((t, i) => { t.q_value = q[i]; });

  const findings = tests
    .filter((t) => t.q_value < opt.fdr)
    .filter((t) => (t.odds_ratio > 1 ? t.table.a >= opt.minCooccur && t.ci_low > 1 : t.ci_high < 1))
    .map((t) => ({ ...t, direction: t.odds_ratio > 1 ? 'risk' : 'protective' }));

  // A same-day and a lag-1 finding for the same pair are often the same
  // signal (habits persist day to day). Keep the stronger one.
  const best = new Map();
  for (const f of findings) {
    const key = `${f.symptom}|${f.exposure}`;
    if (!best.has(key) || f.p_value < best.get(key).p_value) best.set(key, f);
  }

  return {
    ready: true,
    observedDays,
    minDays: opt.minDays,
    testsRun: tests.length,
    testedPairs: [...new Set(tests.map((t) => `${t.symptom}|${t.exposure}`))],
    findings: [...best.values()].sort((x, y) => x.p_value - y.p_value),
  };
}

function safeJson(s, fallback) {
  try { return JSON.parse(s); } catch { return fallback; }
}

import db from './db.js';
import { analyzeTriggers, buildDailyDataset, exposureLabel } from './stats.js';

/**
 * Run the statistical trigger engine (see stats.js) for a profile.
 */
export function getTriggerAnalysis(profileId) {
  const entries = db
    .prepare('SELECT id, timestamp, normalized_symptom FROM symptom_entries WHERE profile_id = ?')
    .all(profileId);
  const checkins = db.prepare('SELECT * FROM daily_checkins WHERE profile_id = ?').all(profileId);
  return analyzeTriggers(buildDailyDataset(entries, checkins));
}

function fmt(n) {
  return n >= 10 ? n.toFixed(0) : n.toFixed(1);
}

function pct(x) {
  return `${Math.round(x * 100)}%`;
}

/** Turn a statistical finding into the pattern shape the UI / PDF consume. */
function findingToPattern(f) {
  const label = exposureLabel(f.exposure);
  const days = f.lag === 1 ? `days after ${label}` : `days with ${label}`;
  const ratio = `OR ${fmt(f.odds_ratio)} (95% CI ${fmt(f.ci_low)}–${fmt(f.ci_high)})`;
  const pattern = f.direction === 'risk'
    ? `${f.symptom} occurred on ${pct(f.risk_exposed)} of ${days} vs ${pct(f.risk_unexposed)} of other days — ${ratio}`
    : `${f.symptom} was less likely on ${days} (${pct(f.risk_exposed)} vs ${pct(f.risk_unexposed)} of other days) — ${ratio}`;

  return {
    id: `stat-${f.symptom}-${f.exposure}-lag${f.lag}`,
    method: 'statistical',
    symptom: f.symptom,
    trigger: f.exposure,
    lag_days: f.lag,
    direction: f.direction,
    pattern,
    // Kept for backwards compatibility with existing UI/PDF consumers:
    // 100 × (1 − FDR-adjusted p-value).
    confidence: Math.max(0, Math.min(99, Math.round((1 - f.q_value) * 100))),
    stats: {
      odds_ratio: f.odds_ratio,
      ci_low: f.ci_low,
      ci_high: f.ci_high,
      p_value: f.p_value,
      q_value: f.q_value,
      days_analyzed: f.n,
      table: f.table,
      risk_exposed: f.risk_exposed,
      risk_unexposed: f.risk_unexposed,
    },
    supporting_entries: f.supporting_entries,
    suggestion: f.direction === 'risk'
      ? `${getSuggestion(f.symptom, f.exposure)} This is an association, not proof of cause — a personal experiment can confirm it.`
      : `${label[0].toUpperCase() + label.slice(1)} may be protective against ${f.symptom}. Worth keeping up and discussing with your doctor.`,
  };
}

/**
 * Detect patterns for a profile.
 *
 * When enough daily check-ins exist, returns statistically tested trigger
 * findings (odds ratios with CIs, FDR-controlled). Descriptive patterns
 * (co-occurrence within symptom entries, time-of-day, treatment) are
 * appended and flagged `method: 'descriptive'` — they are hypotheses,
 * not evidence.
 */
export function detectPatterns(profileId) {
  const analysis = getTriggerAnalysis(profileId);
  const statistical = analysis.findings.map(findingToPattern);
  // Drop descriptive "mentioned in X% of entries" patterns for any pair the
  // engine has actually tested: either it is reported above, or the test
  // found no real association and repeating the raw percentage would mislead.
  const testedKeys = new Set(analysis.testedPairs);

  const descriptive = detectDescriptivePatterns(profileId)
    .filter((p) => !p.trigger || !testedKeys.has(`${p.symptom}|${p.trigger}`));

  return [...statistical.slice(0, 8), ...descriptive].slice(0, 10);
}

function detectDescriptivePatterns(profileId) {
  const entries = db
    .prepare('SELECT * FROM symptom_entries WHERE profile_id = ? ORDER BY timestamp DESC')
    .all(profileId);

  if (entries.length < 3) return [];

  const patterns = [];

  // Parse context_tags from JSON strings
  const parsed = entries.map((e) => ({
    ...e,
    context_tags: typeof e.context_tags === 'string' ? JSON.parse(e.context_tags) : e.context_tags,
  }));

  // Group by symptom
  const bySymptom = {};
  parsed.forEach((e) => {
    if (!bySymptom[e.normalized_symptom]) bySymptom[e.normalized_symptom] = [];
    bySymptom[e.normalized_symptom].push(e);
  });

  // For each symptom with >= 2 entries, look for context tag correlations
  for (const [symptom, symptomEntries] of Object.entries(bySymptom)) {
    if (symptomEntries.length < 2) continue;

    // Count tag occurrences across this symptom's entries
    const tagCounts = {};
    symptomEntries.forEach((e) => {
      e.context_tags.forEach((tag) => {
        // Skip day-of-week and generic time tags for more interesting patterns
        if (['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'].includes(tag)) return;
        if (!tagCounts[tag]) tagCounts[tag] = { count: 0, entries: [] };
        tagCounts[tag].count++;
        tagCounts[tag].entries.push(e.id);
      });
    });

    // Find tags that appear in ≥50% of this symptom's entries
    for (const [tag, data] of Object.entries(tagCounts)) {
      const confidence = Math.round((data.count / symptomEntries.length) * 100);
      if (confidence >= 50 && data.count >= 2) {
        const formattedTag = tag.replace(/_/g, ' ');
        patterns.push({
          id: `${symptom}-${tag}`,
          method: 'descriptive',
          symptom,
          trigger: tag,
          pattern: `"${formattedTag}" was mentioned in ${data.count} of ${symptomEntries.length} ${symptom} entries`,
          confidence,
          supporting_entries: data.entries,
          suggestion: `Not yet tested: this ignores how often "${formattedTag}" happens on symptom-free days. Keep doing daily check-ins so it can be tested statistically.`,
        });
      }
    }

    // Time-of-day pattern
    const timeSlots = { morning: 0, afternoon: 0, evening: 0, night: 0, early_morning: 0 };
    symptomEntries.forEach((e) => {
      e.context_tags.forEach((tag) => {
        if (timeSlots[tag] !== undefined) timeSlots[tag]++;
      });
    });
    const dominantTime = Object.entries(timeSlots).sort((a, b) => b[1] - a[1])[0];
    if (dominantTime[1] >= 2 && dominantTime[1] / symptomEntries.length >= 0.6) {
      const conf = Math.round((dominantTime[1] / symptomEntries.length) * 100);
      patterns.push({
        id: `${symptom}-time-${dominantTime[0]}`,
        method: 'descriptive',
        symptom,
        pattern: `${symptom} predominantly occurs in the ${dominantTime[0].replace('_', ' ')} (${dominantTime[1]}/${symptomEntries.length} entries)`,
        confidence: conf,
        supporting_entries: symptomEntries.map((e) => e.id),
        suggestion: `Consider tracking activities and habits during the ${dominantTime[0].replace('_', ' ')} that may contribute.`,
      });
    }
  }

  // Treatment correlation — check if symptoms changed after starting/stopping a treatment
  const treatments = db
    .prepare('SELECT * FROM treatments WHERE profile_id = ?')
    .all(profileId);

  treatments.forEach((treatment) => {
    const startDate = new Date(treatment.start_date);
    const before = parsed.filter((e) => new Date(e.timestamp) < startDate);
    const after = parsed.filter((e) => new Date(e.timestamp) >= startDate);

    if (before.length >= 2 && after.length >= 2) {
      const avgBefore = before.reduce((a, b) => a + b.severity, 0) / before.length;
      const avgAfter = after.reduce((a, b) => a + b.severity, 0) / after.length;
      const change = avgAfter - avgBefore;

      if (Math.abs(change) > 0.5) {
        const direction = change < 0 ? 'decreased' : 'increased';
        const conf = Math.min(90, Math.round(60 + Math.abs(change) * 10));
        patterns.push({
          id: `treatment-${treatment.id}`,
          method: 'descriptive',
          symptom: `Treatment: ${treatment.name}`,
          pattern: `Average severity ${direction} by ${Math.abs(change).toFixed(1)} points after starting ${treatment.name}`,
          confidence: conf,
          supporting_entries: after.map((e) => e.id),
          suggestion: change < 0
            ? `${treatment.name} appears to be helping. Discuss continuing with your doctor.`
            : `Symptoms may have worsened after starting ${treatment.name}. Worth discussing with your doctor.`,
        });
      }
    }
  });

  // Sort by confidence (highest first) and dedupe
  return patterns
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, 10);
}

function getSuggestion(symptom, tag) {
  const suggestions = {
    poor_sleep: `Strong link between sleep quality and ${symptom}. Track sleep hours alongside symptoms.`,
    stress: `Stress appears to be a significant trigger for ${symptom}. Consider stress management techniques.`,
    after_food: `${symptom} correlates with food intake. A food diary may help identify specific triggers.`,
    caffeine: `Caffeine may be contributing to ${symptom}. Consider reducing intake.`,
    screen_time: `Extended screen time correlates with ${symptom}. Consider breaks and blue-light filters.`,
    sedentary: `Prolonged sitting correlates with ${symptom}. Regular movement breaks may help.`,
    exercise: `Physical activity correlates with ${symptom}. Discuss exercise modifications with your doctor.`,
    dehydration: `Dehydration may be contributing to ${symptom}. Track water intake.`,
    spicy: `Spicy food correlates with ${symptom}. Consider dietary modifications.`,
    dairy: `Dairy consumption correlates with ${symptom}. Consider lactose sensitivity testing.`,
  };
  return suggestions[tag] || `"${exposureLabel(tag)}" is associated with ${symptom}.`;
}

/**
 * Compute symptom versioning/diffing — how symptoms evolved over time
 */
export function getSymptomDiff(profileId, symptomName, windowDays = 60) {
  const now = new Date();
  const midpoint = new Date(now - windowDays / 2 * 24 * 60 * 60 * 1000);
  const startDate = new Date(now - windowDays * 24 * 60 * 60 * 1000);

  const entries = db
    .prepare(
      'SELECT * FROM symptom_entries WHERE profile_id = ? AND normalized_symptom = ? AND timestamp >= ? ORDER BY timestamp'
    )
    .all(profileId, symptomName, startDate.toISOString());

  const earlier = entries.filter((e) => new Date(e.timestamp) < midpoint);
  const later = entries.filter((e) => new Date(e.timestamp) >= midpoint);

  if (earlier.length === 0 || later.length === 0) return null;

  const halfDays = windowDays / 2;
  const freqEarlier = earlier.length / halfDays;
  const freqLater = later.length / halfDays;
  const avgSevEarlier = earlier.reduce((a, b) => a + b.severity, 0) / earlier.length;
  const avgSevLater = later.reduce((a, b) => a + b.severity, 0) / later.length;

  const freqChange = ((freqLater - freqEarlier) / Math.max(freqEarlier, 0.01)) * 100;
  const sevChange = ((avgSevLater - avgSevEarlier) / Math.max(avgSevEarlier, 0.01)) * 100;

  return {
    symptom: symptomName,
    period: `Last ${windowDays} days`,
    earlier: { count: earlier.length, avgSeverity: avgSevEarlier.toFixed(1), freqPerDay: freqEarlier.toFixed(2) },
    later: { count: later.length, avgSeverity: avgSevLater.toFixed(1), freqPerDay: freqLater.toFixed(2) },
    changes: {
      frequency: `${freqChange >= 0 ? '+' : ''}${freqChange.toFixed(0)}%`,
      severity: `${sevChange >= 0 ? '+' : ''}${sevChange.toFixed(0)}%`,
      summary: buildDiffSummary(freqChange, sevChange, symptomName),
    },
  };
}

function buildDiffSummary(freqChange, sevChange, symptom) {
  const parts = [];
  if (Math.abs(freqChange) > 10) {
    parts.push(`${Math.abs(freqChange).toFixed(0)}% ${freqChange > 0 ? 'more' : 'less'} frequent`);
  }
  if (Math.abs(sevChange) > 10) {
    parts.push(`${Math.abs(sevChange).toFixed(0)}% ${sevChange > 0 ? 'higher' : 'lower'} severity`);
  }
  if (parts.length === 0) return `${symptom} has remained stable.`;
  return `${symptom} is ${parts.join(' and ')} compared to the first half of this period.`;
}

/**
 * Generate predicted doctor questions based on symptom patterns
 */
export function predictDoctorQuestions(profileId, specialty = 'general') {
  const entries = db
    .prepare('SELECT * FROM symptom_entries WHERE profile_id = ? ORDER BY timestamp DESC LIMIT 50')
    .all(profileId);

  const symptoms = [...new Set(entries.map((e) => e.normalized_symptom))];
  const treatments = db.prepare('SELECT * FROM treatments WHERE profile_id = ?').all(profileId);

  const baseQuestions = {
    neurologist: [
      'How many headaches per week on average, and has the frequency changed?',
      'Describe the headache quality — throbbing, pressure, stabbing, or burning?',
      'Do you experience visual disturbances (aura) before or during headaches?',
      'What is your typical sleep duration and quality?',
      'Have you identified any triggers (stress, food, light, screens)?',
    ],
    gastroenterologist: [
      'How often do you experience GI symptoms, and is timing consistent?',
      'Which foods seem to trigger or worsen symptoms?',
      'Do you experience nausea, bloating, or bowel changes?',
      'Are you taking any acid-reducing medications currently?',
      'Is there a family history of GI conditions?',
    ],
    orthopedist: [
      'How would you describe the spine discomfort — aching, burning, stabbing, or stiffness?',
      'Does pain or numbness radiate downward toward the hip, thigh, or calf?',
      'Which postures or daily activities noticeably aggravate or relieve the symptoms?',
      'Have you noticed progressive muscle weakness, tingling, or loss of balance?',
      'Has physical therapy, stretching, or ergonomic modification provided relief?',
    ],
    psychiatrist: [
      'When you experience rapid heart rate or acute tension, what specific triggers precede it?',
      'How severely have sleep latency and early awakenings impacted daily performance?',
      'Do palpitations or panic sensations occur during rest periods or during high workload?',
      'How much caffeine, nicotine, or stimulant intake occurs on high-symptom days?',
      'What relaxation, breathing, or cognitive coping strategies have you attempted?',
    ],
    general: [
      'How long have these symptoms been present?',
      'Have you noticed any patterns — times of day, triggers, or correlations?',
      'What medications or supplements are you currently taking?',
      'How is your sleep quality and duration?',
      'Have symptoms affected your daily activities or work?',
    ],
  };

  const questions = [...(baseQuestions[specialty] || baseQuestions.general)];

  // Add symptom-specific questions
  if (symptoms.includes('Headache') || symptoms.includes('Migraine')) {
    questions.push('Do headaches wake you from sleep, or are they worse in the morning?');
  }
  if (symptoms.includes('Insomnia')) {
    questions.push('What is your typical bedtime routine and sleep environment like?');
  }
  if (treatments.length > 0) {
    questions.push(`You're taking ${treatments.map((t) => t.name).join(', ')} — have you noticed any side effects?`);
  }

  return questions.slice(0, 7);
}

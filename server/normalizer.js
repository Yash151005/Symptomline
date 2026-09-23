import Groq from 'groq-sdk';

const groq = process.env.GROQ_API_KEY && process.env.GROQ_API_KEY !== 'your_groq_api_key_here'
  ? new Groq({ apiKey: process.env.GROQ_API_KEY })
  : null;

const SYSTEM_PROMPT = `You are a medical symptom normalizer. Given a free-text symptom description, extract structured data. Return ONLY valid JSON with these fields:

{
  "normalized_symptom": "A standard symptom name (e.g., 'Headache', 'Nausea', 'Back pain')",
  "severity": 1-5 (1=minimal, 2=mild, 3=moderate, 4=severe, 5=extreme),
  "body_location": "Specific body area (e.g., 'Head — frontal', 'Abdomen — upper', 'Lower back')",
  "context_tags": ["array", "of", "relevant", "context", "tags"]
}

Context tags should include things like: sleep quality (poor_sleep, good_sleep), food (after_food, missed_meal, spicy, dairy, caffeine), stress, physical activity (sedentary, exercise, movement), weather, time-related patterns, specific triggers.

Rules:
- NEVER suggest diagnoses
- Normalize symptom names to standard terms
- Infer severity from language intensity ("terrible" = 4-5, "slight" = 1-2, "moderate" = 3)
- Extract body location from context clues
- Add time-of-day context if inferable
- Return ONLY the JSON object, no markdown, no explanation`;

export async function normalizeSymptom(rawText, timestamp) {
  const date = new Date(timestamp);
  const hour = date.getHours();
  const dayOfWeek = date.toLocaleDateString('en-US', { weekday: 'long' });
  const timeOfDay = hour < 6 ? 'early_morning' : hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : hour < 21 ? 'evening' : 'night';

  // If no Groq API key, use fallback
  if (!groq) {
    return fallbackNormalize(rawText, timeOfDay, dayOfWeek);
  }

  try {
    const completion = await groq.chat.completions.create({
      model: 'llama-3.1-8b-instant',
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: `Timestamp context: ${dayOfWeek}, ${timeOfDay}\n\nPatient's entry: "${rawText}"` },
      ],
      temperature: 0.1,
      max_tokens: 300,
      response_format: { type: 'json_object' },
    });

    const text = completion.choices[0]?.message?.content;
    const parsed = JSON.parse(text);

    // Ensure required fields and add auto-context
    return {
      normalized_symptom: parsed.normalized_symptom || 'General symptom',
      severity: Math.min(5, Math.max(1, parseInt(parsed.severity) || 2)),
      body_location: parsed.body_location || 'General',
      context_tags: [
        ...(parsed.context_tags || []),
        timeOfDay,
        dayOfWeek.toLowerCase(),
      ].filter((v, i, a) => a.indexOf(v) === i), // dedupe
    };
  } catch (err) {
    console.error('Groq normalization error:', err.message);
    return fallbackNormalize(rawText, timeOfDay, dayOfWeek);
  }
}

// Simple keyword-based fallback when Groq is unavailable
function fallbackNormalize(rawText, timeOfDay, dayOfWeek) {
  const text = rawText.toLowerCase();
  const tags = [timeOfDay, dayOfWeek.toLowerCase()];

  // Symptom detection
  let symptom = 'General discomfort';
  let location = 'General';
  let severity = 2;

  const symptomMap = [
    { keywords: ['migraine'], symptom: 'Migraine', location: 'Head — bilateral', severity: 4 },
    { keywords: ['headache', 'head hurts', 'head ache'], symptom: 'Headache', location: 'Head', severity: 3 },
    { keywords: ['nausea', 'nauseous', 'queasy'], symptom: 'Nausea', location: 'Abdomen', severity: 2 },
    { keywords: ['stomach', 'belly', 'abdominal', 'tummy'], symptom: 'Stomach pain', location: 'Abdomen', severity: 3 },
    { keywords: ['back pain', 'backache', 'lower back', 'upper back'], symptom: 'Back pain', location: 'Back', severity: 3 },
    { keywords: ['dizzy', 'dizziness', 'lightheaded'], symptom: 'Dizziness', location: 'Head', severity: 2 },
    { keywords: ['insomnia', 'can\'t sleep', 'cannot sleep'], symptom: 'Insomnia', location: 'General', severity: 3 },
    { keywords: ['reflux', 'heartburn', 'acid'], symptom: 'Acid reflux', location: 'Chest — lower', severity: 3 },
    { keywords: ['bloat', 'bloating', 'gas'], symptom: 'Bloating', location: 'Abdomen', severity: 2 },
    { keywords: ['fatigue', 'tired', 'exhausted', 'no energy'], symptom: 'Fatigue', location: 'General', severity: 2 },
    { keywords: ['anxiety', 'anxious', 'nervous', 'panic'], symptom: 'Anxiety', location: 'General', severity: 3 },
    { keywords: ['chest', 'heart', 'palpitation'], symptom: 'Chest discomfort', location: 'Chest', severity: 3 },
    { keywords: ['neck', 'stiff neck'], symptom: 'Neck stiffness', location: 'Neck', severity: 2 },
    { keywords: ['cramp'], symptom: 'Muscle cramps', location: 'General', severity: 3 },
    { keywords: ['pain'], symptom: 'General pain', location: 'General', severity: 3 },
  ];

  for (const entry of symptomMap) {
    if (entry.keywords.some((k) => text.includes(k))) {
      symptom = entry.symptom;
      location = entry.location;
      severity = entry.severity;
      break;
    }
  }

  // Severity modifiers
  if (['terrible', 'awful', 'extreme', 'worst', 'unbearable', 'excruciating'].some((w) => text.includes(w))) severity = 5;
  else if (['severe', 'bad', 'intense', 'really', 'very'].some((w) => text.includes(w))) severity = Math.max(severity, 4);
  else if (['slight', 'minor', 'little', 'barely'].some((w) => text.includes(w))) severity = Math.min(severity, 2);
  else if (['mild', 'dull'].some((w) => text.includes(w))) severity = Math.min(severity, 2);

  // Context tags
  if (text.includes('sleep') || text.includes('slept') || text.includes('insomnia')) tags.push('poor_sleep');
  if (text.includes('food') || text.includes('ate') || text.includes('lunch') || text.includes('dinner') || text.includes('breakfast')) tags.push('after_food');
  if (text.includes('stress') || text.includes('anxious') || text.includes('work')) tags.push('stress');
  if (text.includes('coffee') || text.includes('caffeine')) tags.push('caffeine');
  if (text.includes('spicy')) tags.push('spicy');
  if (text.includes('dairy') || text.includes('milk') || text.includes('cheese')) tags.push('dairy');
  if (text.includes('screen') || text.includes('computer') || text.includes('phone')) tags.push('screen_time');
  if (text.includes('exercise') || text.includes('gym') || text.includes('run')) tags.push('exercise');

  return {
    normalized_symptom: symptom,
    severity,
    body_location: location,
    context_tags: [...new Set(tags)],
  };
}

import 'dotenv/config';
import { v4 as uuid } from 'uuid';
import db from './db.js';
import { registerUser } from './auth.js';

// Clear existing data for a clean slate
db.prepare('DELETE FROM sessions').run();
db.prepare('DELETE FROM symptom_entries').run();
db.prepare('DELETE FROM treatments').run();
db.prepare('DELETE FROM profiles').run();
db.prepare('DELETE FROM users').run();

const now = new Date();

function generateDateForDay(daysAgo, hour, minute = null) {
  const d = new Date(now);
  d.setDate(d.getDate() - daysAgo);
  d.setHours(hour, minute !== null ? minute : Math.floor(Math.random() * 55), Math.floor(Math.random() * 55));
  return d.toISOString();
}

function getDayTag(dateStr) {
  return new Date(dateStr).toLocaleDateString('en-US', { weekday: 'long' }).toLowerCase();
}

function getTimeTag(hour) {
  if (hour < 6) return 'night';
  if (hour < 12) return 'morning';
  if (hour < 17) return 'afternoon';
  if (hour < 21) return 'evening';
  return 'night';
}

function pickRandom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

const usersConfig = [
  // 1. ALICE — Neurological & Migraine Focus
  {
    name: 'Alice Vance',
    email: 'alice@test.com',
    password: 'password',
    type: 'migraine',
    treatments: [
      {
        name: 'Magnesium Glycinate 400mg',
        daysAgoStart: 50,
        daysAgoEnd: null,
        notes: 'Take 1 capsule nightly before sleep with water. Prescribed by Dr. Henderson for migraine prophylaxis.'
      },
      {
        name: 'Sumatriptan 50mg',
        daysAgoStart: 85,
        daysAgoEnd: null,
        notes: 'Abortive rescue medication taken at immediate onset of aura or severe throbbing (max 100mg/24hr).'
      },
      {
        name: 'Propranolol 40mg',
        daysAgoStart: 88,
        daysAgoEnd: 55,
        notes: 'Tried daily for 33 days; discontinued due to excessive resting fatigue and low pulse.'
      }
    ],
    symptomPacks: [
      {
        symptom: 'Migraine',
        locations: ['Head — Left Temple & Behind Eye', 'Head — Right Hemifacial', 'Head — Bilateral Frontotemporal'],
        texts: [
          'Intense throbbing pain behind left eye, extremely sensitive to bright fluorescent office lighting.',
          'Woke up with visual aura (flashing zigzags), followed by severe pulsating left temple pain and nausea.',
          'Severe hemicranial headache after 6 hours on Zoom calls without a break. Need to lie down in dark room.',
          'Pounding migraine accompanied by photophobia and sound sensitivity. Took sumatriptan 30 mins ago.',
          'Migraine flare-up triggered by sudden storm front and drop in barometric pressure. Left side throbbing.',
          'Throbbing vascular headache with nausea and lightheadedness. Screen light is unbearable.',
          'Woke up at 5:30 AM with a 4/5 pulsating headache, barely slept 4 hours last night.',
          'Severe left-sided throbbing headache following high stress budget deadline at work.'
        ],
        primaryTags: ['poor_sleep', 'screen_time', 'bright_lights', 'stress'],
        secondaryTags: ['dehydration', 'weather_change', 'missed_meal'],
        weight: 0.55
      },
      {
        symptom: 'Tension Headache',
        locations: ['Head — Occipital & Band-like Frontal', 'Head — Crown & Forehead', 'Cervical Spine / Base of Skull'],
        texts: [
          'Dull, vise-like band sensation wrapping around forehead after afternoon typing marathon.',
          'Tight squeezing pressure at the base of skull radiating upward into the temples.',
          'Constant dull ache across both temples, neck feels stiff and shoulders raised.',
          'Persistent band of tension headache after skipping lunch and working through afternoon.'
        ],
        primaryTags: ['screen_time', 'sedentary', 'stress'],
        secondaryTags: ['poor_sleep', 'caffeine_crash'],
        weight: 0.25
      },
      {
        symptom: 'Neck stiffness',
        locations: ['Cervical Spine & Upper Trapezius', 'Posterior Neck & Suboccipital'],
        texts: [
          'Severe neck and upper shoulder tightness preceding headache onset.',
          'Cervical stiffness turning head to the left, feels like tight cables.',
          'Neck and base of skull ache after long laptop session on the couch.'
        ],
        primaryTags: ['sedentary', 'screen_time', 'stress'],
        secondaryTags: ['poor_sleep'],
        weight: 0.12
      },
      {
        symptom: 'Acid reflux',
        locations: ['Upper Epigastric / Retrosternal', 'Chest & Throat'],
        texts: [
          'Mild acid reflux and burning throat sensation after taking ibuprofen on an empty stomach.',
          'Heartburn and sour taste in mouth after late night coffee while finishing reports.'
        ],
        primaryTags: ['after_food', 'caffeine', 'stress'],
        secondaryTags: ['late_dinner'],
        weight: 0.08
      }
    ]
  },

  // 2. BOB — Gastroenterology & Acid Reflux Focus
  {
    name: 'Robert "Bob" Martinez',
    email: 'bob@test.com',
    password: 'password',
    type: 'gi',
    treatments: [
      {
        name: 'Omeprazole 20mg Delayed-Release',
        daysAgoStart: 42,
        daysAgoEnd: null,
        notes: 'Daily 30 minutes before first morning meal. Significant reduction in nighttime acid regurgitation.'
      },
      {
        name: 'Famotidine 20mg (Pepcid AC)',
        daysAgoStart: 70,
        daysAgoEnd: null,
        notes: 'PRN nighttime rescue for breakthrough heartburn after heavy or acidic dinners.'
      },
      {
        name: 'Bismuth Subsalicylate (Pepto-Bismol)',
        daysAgoStart: 85,
        daysAgoEnd: 50,
        notes: 'Liquid suspension used intermittently for acute gastric burning before PPI regimen started.'
      }
    ],
    symptomPacks: [
      {
        symptom: 'Acid reflux',
        locations: ['Retrosternal / Mid-Chest', 'Epigastrium & Lower Sternum', 'Throat / Esophagus'],
        texts: [
          'Severe burning sensation in mid-chest radiating to throat 45 mins after spicy curry dinner.',
          'Acid regurgitation woke me up coughing at 2 AM, sour taste and hoarse vocal cords.',
          'Heartburn feeling like burning hot coals behind breastbone after tomato pasta and wine.',
          'Burning in chest worsened upon bending over or lying flat on couch after dinner.',
          'Regurgitation and esophageal fire after eating pizza while working late at desk.',
          'Mild burning in chest after morning double espresso on an empty stomach.'
        ],
        primaryTags: ['after_food', 'spicy', 'late_dinner'],
        secondaryTags: ['caffeine', 'stress', 'lying_down'],
        weight: 0.50
      },
      {
        symptom: 'Bloating',
        locations: ['Upper & Mid-Abdomen', 'Periumbilical Region', 'Lower Abdominal Wall'],
        texts: [
          'Abdomen feels swollen and distended like a balloon after lunch, clothes feel uncomfortably tight.',
          'Severe abdominal bloating and fullness even after eating a relatively small portion.',
          'Persistent trapped gas and stomach distension throughout afternoon meeting.',
          'Heavy bloated sensation and abdominal tightness after dairy dessert.'
        ],
        primaryTags: ['after_food', 'dairy', 'sedentary'],
        secondaryTags: ['stress', 'carbonated_drinks'],
        weight: 0.25
      },
      {
        symptom: 'Stomach cramps',
        locations: ['Lower Left Quadrant', 'Mid-Abdomen / Periumbilical'],
        texts: [
          'Sharp intermittent colicky cramps across lower abdomen, relieved temporarily after restroom.',
          'Dull aching stomach cramps after eating greasy food at airport.'
        ],
        primaryTags: ['after_food', 'spicy', 'stress'],
        secondaryTags: ['dehydration'],
        weight: 0.15
      },
      {
        symptom: 'Tension Headache',
        locations: ['Head — Bilateral Frontal', 'Head — Temples'],
        texts: [
          'Mild headache accompanying dehydration and poor digestive absorption today.',
          'Frontal headache following poor sleep due to reflux flare last night.'
        ],
        primaryTags: ['poor_sleep', 'dehydration'],
        secondaryTags: ['stress'],
        weight: 0.10
      }
    ]
  },

  // 3. CHARLIE — Musculoskeletal & Spine Focus
  {
    name: 'Charlie Chen',
    email: 'charlie@test.com',
    password: 'password',
    type: 'back',
    treatments: [
      {
        name: 'Physical Therapy (Lumbar Stabilization)',
        daysAgoStart: 55,
        daysAgoEnd: null,
        notes: 'Twice-weekly clinic sessions with PT Sarah: pelvic tilts, bird-dogs, core bracing, and hamstring mobility.'
      },
      {
        name: 'Ergonomic Standing Desk & Lumbar Cushion',
        daysAgoStart: 60,
        daysAgoEnd: null,
        notes: 'Alternating 30 min standing / 45 min seated. Memory foam lumbar roll in chair.'
      },
      {
        name: 'Cyclobenzaprine 5mg (Flexeril)',
        daysAgoStart: 88,
        daysAgoEnd: 60,
        notes: 'Short 4-week trial for acute nocturnal lumbar spasms; ended once PT was established.'
      }
    ],
    symptomPacks: [
      {
        symptom: 'Lower back pain',
        locations: ['Lumbar Spine (L4-L5)', 'Lumbosacral Junction', 'Bilateral Lumbar Paraspinals'],
        texts: [
          'Deep aching stiffness across lower lumbar spine after sitting in morning rush hour commute.',
          'Sharp catch in lower back when bending down to pick up grocery bags from trunk.',
          'Lower back feels locked up and fatigued after 4 straight hours coding in desk chair.',
          'Dull throbbing in lumbar region, difficulty standing fully upright without stiffness.',
          'Lower back ache relieved noticeably after 15 min walking and hamstring stretch.',
          'Woke up with rigid lower back, took 20 minutes of gentle movement to loosen up.'
        ],
        primaryTags: ['sedentary', 'morning_stiffness', 'heavy_lifting'],
        secondaryTags: ['long_drive', 'poor_sleep', 'cold_weather'],
        weight: 0.50
      },
      {
        symptom: 'Muscle spasm',
        locations: ['Left Quadratus Lumborum & Paraspinals', 'Right Lumbar Erectors'],
        texts: [
          'Sudden violent muscle spasm in left flank after twisting to reach backseat.',
          'Involuntary muscle twitching and guarding tightness in lower right back.',
          'Persistent muscular tightness and twitch in lower lumbar area following yard work.'
        ],
        primaryTags: ['heavy_lifting', 'sedentary', 'dehydration'],
        secondaryTags: ['fatigue', 'cold_weather'],
        weight: 0.25
      },
      {
        symptom: 'Sciatica',
        locations: ['Left Sacroiliac Joint & Glute', 'Left Posterior Thigh'],
        texts: [
          'Tingling electric sensation radiating from left glute down into back of thigh.',
          'Numbness and pins-and-needles sensation in left hip after long seated meeting.'
        ],
        primaryTags: ['sedentary', 'long_drive'],
        secondaryTags: ['poor_posture'],
        weight: 0.15
      },
      {
        symptom: 'Tension Headache',
        locations: ['Head — Base of Skull & Occiput', 'Cervical Spine'],
        texts: [
          'Tension ache at base of skull from hunching forward over computer monitor.',
          'Cervical stiffness spreading upward into occipital headache.'
        ],
        primaryTags: ['screen_time', 'sedentary'],
        secondaryTags: ['stress'],
        weight: 0.10
      }
    ]
  },

  // 4. DIANA — Cardiovascular, Stress & Anxiety Focus
  {
    name: 'Diana Prince',
    email: 'diana@test.com',
    password: 'password',
    type: 'stress',
    treatments: [
      {
        name: 'Ashwagandha KSM-66 600mg',
        daysAgoStart: 45,
        daysAgoEnd: null,
        notes: 'Full-spectrum root extract taken with dinner to regulate evening cortisol and sleep latency.'
      },
      {
        name: 'Guided MBSR Breathwork & Meditation',
        daysAgoStart: 50,
        daysAgoEnd: null,
        notes: '15-minute 4-7-8 parasympathetic breathing routine every morning and before bed.'
      },
      {
        name: 'Hydroxyzine 25mg',
        daysAgoStart: 85,
        daysAgoEnd: 52,
        notes: 'PRN antihistamine prescribed for acute panic episodes; discontinued after lifestyle and adaptogen improvements.'
      }
    ],
    symptomPacks: [
      {
        symptom: 'Anxiety',
        locations: ['Chest & Solar Plexus', 'Throat & Upper Chest', 'Full Body / Generalized'],
        texts: [
          'Intense wave of sudden anxiety and chest tightness right before quarterly executive presentation.',
          'Pervasive restlessness and sense of dread, unable to concentrate on work tasks.',
          'Overwhelming nervous tension and racing thoughts after 3 cups of morning drip coffee.',
          'Anxiety flare with clammy hands and hyperventilation after receiving urgent email from client.',
          'Generalized anxiety and internal trembling, feeling wired but exhausted.',
          'Sudden spike in acute dread and jitters during busy subway commute.'
        ],
        primaryTags: ['stress', 'work_deadline', 'caffeine'],
        secondaryTags: ['poor_sleep', 'social_event', 'crowded_space'],
        weight: 0.45
      },
      {
        symptom: 'Palpitations',
        locations: ['Chest / Left Precordial', 'Throat & Neck'],
        texts: [
          'Heart fluttering and feeling skipped beats while sitting at desk after espresso.',
          'Rapid pounding pulse (115 bpm) while resting in bed, took deep breaths to calm down.',
          'Strong noticeable heart thumps felt in throat following tense disagreement in meeting.',
          'Thumping heartbeat and tightness in sternum after rushed morning and missed breakfast.'
        ],
        primaryTags: ['caffeine', 'stress', 'poor_sleep'],
        secondaryTags: ['dehydration', 'heavy_meal'],
        weight: 0.30
      },
      {
        symptom: 'Insomnia',
        locations: ['Head & Mind', 'Generalized Restlessness'],
        texts: [
          'Tossing and turning until 3:30 AM, racing thoughts about tomorrow deadlines.',
          'Woke up wide awake at 2 AM with heart pounding and could not fall back asleep.',
          'Severe sleep onset latency, feeling hyper-alert despite physical exhaustion.'
        ],
        primaryTags: ['poor_sleep', 'stress', 'screen_time'],
        secondaryTags: ['caffeine'],
        weight: 0.15
      },
      {
        symptom: 'Tension Headache',
        locations: ['Head — Bilateral Temples & Forehead'],
        texts: [
          'Throbbing tension across forehead after clenching jaw all day under deadline stress.',
          'Dull headache following prolonged crying and acute anxiety episode.'
        ],
        primaryTags: ['stress', 'poor_sleep'],
        secondaryTags: ['caffeine'],
        weight: 0.10
      }
    ]
  },

  // 5. EVAN — Multisystem Fatigue & General Health Focus
  {
    name: 'Evan Miller',
    email: 'evan@test.com',
    password: 'password',
    type: 'general',
    treatments: [
      {
        name: 'Vitamin D3 5000 IU + K2',
        daysAgoStart: 60,
        daysAgoEnd: null,
        notes: 'Daily liquid softgel taken with breakfast to address low baseline serum vitamin D (22 ng/mL).'
      },
      {
        name: 'CoQ10 (Ubiquinol) 200mg',
        daysAgoStart: 40,
        daysAgoEnd: null,
        notes: 'Mitochondrial cellular energy support; noticed gradual reduction in 2 PM afternoon brain fog.'
      },
      {
        name: 'Melatonin 1mg Low-Dose',
        daysAgoStart: 80,
        daysAgoEnd: 48,
        notes: 'Circadian phase reset trial for 32 days; stopped once natural sleep latency stabilized under 20 mins.'
      }
    ],
    symptomPacks: [
      {
        symptom: 'Fatigue',
        locations: ['Full Body / Generalized', 'Heavy Limbs & Eyes'],
        texts: [
          'Severe afternoon exhaustion at 2:30 PM, limbs feel like lead, fighting to stay awake at keyboard.',
          'Woke up completely unrefreshed despite 8.5 hours in bed, deep systemic exhaustion.',
          'Total energy crash after 30-minute light walk, had to sit on bench to recover breath.',
          'Profound lethargy and lack of physical stamina throughout whole workday.',
          'Midday fatigue slump following carbohydrate-heavy lunch and fluorescent office lights.',
          'Heavy eyelids and muscle sluggishness making simple errands feel monumental.'
        ],
        primaryTags: ['poor_sleep', 'sedentary', 'afternoon_crash'],
        secondaryTags: ['after_food', 'weather_change', 'dehydration'],
        weight: 0.45
      },
      {
        symptom: 'Brain fog',
        locations: ['Head — Frontal Cortex & Behind Eyes'],
        texts: [
          'Difficulty recalling common words and retaining reading comprehension during morning review.',
          'Head feels filled with cotton wool, unable to focus on spreadsheet calculations.',
          'Mental sluggishness and disorientation during team standup, slow processing speed.',
          'Severe mental fatigue after 2 hours of writing, felt like thoughts were wading in molasses.'
        ],
        primaryTags: ['poor_sleep', 'screen_time', 'sedentary'],
        secondaryTags: ['dehydration', 'after_food'],
        weight: 0.25
      },
      {
        symptom: 'Joint stiffness',
        locations: ['Bilateral Knees & Hands', 'Finger Joints & Wrists'],
        texts: [
          'Morning stiffness in hand finger joints and knees, took warm shower to regain full mobility.',
          'Achy sensation in knees and finger knuckles on cold damp rainy morning.'
        ],
        primaryTags: ['morning_stiffness', 'weather_change'],
        secondaryTags: ['sedentary'],
        weight: 0.15
      },
      {
        symptom: 'Tension Headache',
        locations: ['Head — Frontal Forehead & Eyes'],
        texts: [
          'Dull frontal headache accompanying eye strain and mental fatigue.',
          'Mild throbbing across forehead after staring at dual monitors all day.'
        ],
        primaryTags: ['screen_time', 'dehydration'],
        secondaryTags: ['poor_sleep'],
        weight: 0.15
      }
    ]
  }
];

console.log('🌟 Seeding database with 5 complete power-users across all 90 days with rich data in all fields...');

for (const u of usersConfig) {
  const { user } = registerUser(u.name, u.email, u.password);
  const profileId = user.profileId;

  // Insert treatments
  const insertTreatment = db.prepare(`
    INSERT INTO treatments (id, profile_id, name, start_date, end_date, notes)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  for (const t of u.treatments) {
    const tId = uuid();
    const startDate = generateDateForDay(t.daysAgoStart, 8, 0);
    const endDate = t.daysAgoEnd !== null ? generateDateForDay(t.daysAgoEnd, 18, 0) : null;
    insertTreatment.run(tId, profileId, t.name, startDate, endDate, t.notes);
  }

  const entries = [];
  const primaryTreatment = u.treatments[0];
  const treatmentStartDaysAgo = primaryTreatment.daysAgoStart;

  // Generate dense logs across all 90 days (daysAgo 90 down to 0)
  for (let daysAgo = 90; daysAgo >= 0; daysAgo--) {
    // Days 0 (today) through 7 (this week): ALWAYS log 2 to 4 entries per day!
    // Days 8 through 90: 85% chance to log, with 1 to 3 entries
    const isRecentWeek = daysAgo <= 7;
    const shouldLog = isRecentWeek || Math.random() < 0.88;

    if (!shouldLog) continue;

    const count = isRecentWeek
      ? (daysAgo === 0 ? 3 : Math.floor(Math.random() * 3) + 2) // Day 0 has exactly 3 entries (morning, afternoon, evening)
      : Math.floor(Math.random() * 2) + 1; // 1 to 2 entries per day

    for (let c = 0; c < count; c++) {
      // Pick hour: spread across morning, afternoon, evening, night
      let hour;
      if (daysAgo === 0) {
        if (c === 0) hour = 8;
        else if (c === 1) hour = 13;
        else hour = 18;
      } else {
        const timeChoice = Math.random();
        if (timeChoice < 0.4) hour = 7 + Math.floor(Math.random() * 4); // 7-10 AM
        else if (timeChoice < 0.7) hour = 12 + Math.floor(Math.random() * 5); // 12-4 PM
        else if (timeChoice < 0.92) hour = 18 + Math.floor(Math.random() * 4); // 6-9 PM
        else hour = 22 + Math.floor(Math.random() * 4); // 10 PM - 1 AM
      }

      const timestamp = generateDateForDay(daysAgo, hour % 24);
      const dayTag = getDayTag(timestamp);
      const timeTag = getTimeTag(hour % 24);

      // Pick symptom pack based on weights
      const rand = Math.random();
      let accum = 0;
      let selectedPack = u.symptomPacks[0];
      for (const pack of u.symptomPacks) {
        accum += pack.weight;
        if (rand <= accum) {
          selectedPack = pack;
          break;
        }
      }

      // Calculate severity:
      // Entries before treatment started have higher baseline severity (3-5).
      // Entries after treatment started drop by 1-2 points (1-3).
      const isPostTreatment = daysAgo < treatmentStartDaysAgo;
      let severity;
      if (isPostTreatment) {
        // Mostly mild to moderate: 1, 2, or 3
        severity = Math.random() < 0.5 ? 2 : (Math.random() < 0.6 ? 1 : 3);
      } else {
        // Moderate to severe: 3, 4, or 5
        severity = Math.random() < 0.45 ? 4 : (Math.random() < 0.55 ? 3 : 5);
      }

      // Pick location and text
      const bodyLocation = pickRandom(selectedPack.locations);
      const rawText = pickRandom(selectedPack.texts);

      // Context tags: ensure 3 to 5 realistic tags
      const contextTags = [dayTag, timeTag];
      // Add primary tags with high probability to establish strong detectable patterns!
      for (const pt of selectedPack.primaryTags) {
        if (Math.random() < 0.75 && !contextTags.includes(pt)) {
          contextTags.push(pt);
        }
      }
      if (selectedPack.secondaryTags && Math.random() < 0.4) {
        const st = pickRandom(selectedPack.secondaryTags);
        if (!contextTags.includes(st)) contextTags.push(st);
      }

      // Retroactive timeline correction simulation on ~12% of entries:
      let originalTimestamp = null;
      let editedAt = null;
      if (Math.random() < 0.12 && daysAgo > 3) {
        // Entry was originally logged 2-5 hours earlier or later, and edited the next day
        const origD = new Date(timestamp);
        origD.setHours(origD.getHours() - 3);
        originalTimestamp = origD.toISOString();
        const editD = new Date(timestamp);
        editD.setDate(editD.getDate() + 1);
        editedAt = editD.toISOString();
      }

      // Source: varied realistic logging channels
      const source = Math.random() < 0.7 ? 'text' : (Math.random() < 0.6 ? 'voice' : 'quick_log');

      entries.push({
        id: uuid(),
        profile_id: profileId,
        timestamp,
        raw_text: rawText,
        normalized_symptom: selectedPack.symptom,
        severity,
        body_location: bodyLocation,
        context_tags: JSON.stringify(contextTags),
        source,
        original_timestamp: originalTimestamp,
        edited_at: editedAt
      });
    }
  }

  // Insert all entries via prepared statement
  const insertEntry = db.prepare(`
    INSERT INTO symptom_entries (
      id, profile_id, timestamp, raw_text, normalized_symptom,
      severity, body_location, context_tags, source,
      original_timestamp, edited_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const insertMany = db.transaction((rows) => {
    for (const r of rows) {
      insertEntry.run(
        r.id, r.profile_id, r.timestamp, r.raw_text, r.normalized_symptom,
        r.severity, r.body_location, r.context_tags, r.source,
        r.original_timestamp, r.edited_at
      );
    }
  });

  insertMany(entries);

  console.log(`✅ Seeded ${u.name} with ${entries.length} rich entries and ${u.treatments.length} treatments.`);
  console.log(`   📧 Login: ${u.email}  |  🔑 Password: ${u.password}`);
}

console.log('\n🎉 Seeding complete! All fields populated across users, profiles, treatments, and 90-day symptom entries.');

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

const users = [
  { name: 'Alice (Migraines)', email: 'alice@test.com', password: 'password', type: 'migraine' },
  { name: 'Bob (GI Issues)', email: 'bob@test.com', password: 'password', type: 'gi' },
  { name: 'Charlie (Back Pain)', email: 'charlie@test.com', password: 'password', type: 'back' },
  { name: 'Diana (Anxiety/Stress)', email: 'diana@test.com', password: 'password', type: 'stress' },
  { name: 'Evan (Healthy/General)', email: 'evan@test.com', password: 'password', type: 'general' },
];

const now = new Date();

function generatePastDate(daysAgo, hour) {
  const d = new Date(now);
  d.setDate(d.getDate() - daysAgo);
  d.setHours(hour, Math.floor(Math.random() * 60), 0);
  return d.toISOString();
}

function getDayTag(dateStr) {
  return new Date(dateStr).toLocaleDateString('en-US', { weekday: 'long' }).toLowerCase();
}

function getTimeTag(hour) {
  if (hour < 12) return 'morning';
  if (hour < 17) return 'afternoon';
  return 'evening';
}

console.log('Seeding database with 5 users...');

for (const u of users) {
  const { user } = registerUser(u.name, u.email, u.password);
  const profileId = user.profileId;

  const entries = [];
  const treatments = [];

  // Generate data based on user type
  if (u.type === 'migraine') {
    treatments.push({ id: uuid(), profileId, name: 'Magnesium', start_date: generatePastDate(45, 8), end_date: null, notes: '400mg daily' });
    for (let i = 0; i < 40; i++) {
      const daysAgo = Math.floor(Math.random() * 60);
      const isMorning = Math.random() > 0.5;
      const hour = isMorning ? 8 : 18;
      const date = generatePastDate(daysAgo, hour);
      
      const hasPoorSleep = isMorning && Math.random() > 0.3; // 70% chance of poor sleep triggering morning headache
      
      entries.push({
        id: uuid(), profileId, timestamp: date,
        raw_text: hasPoorSleep ? 'Woke up with a terrible headache, barely slept.' : 'Headache starting on right side',
        normalized_symptom: Math.random() > 0.7 ? 'Migraine' : 'Headache',
        severity: hasPoorSleep ? 4 : 3,
        body_location: 'Head — Right side',
        context_tags: JSON.stringify([getDayTag(date), getTimeTag(hour), ...(hasPoorSleep ? ['poor_sleep'] : ['screen_time'])])
      });
    }
  } 
  
  else if (u.type === 'gi') {
    treatments.push({ id: uuid(), profileId, name: 'Omeprazole', start_date: generatePastDate(20, 8), end_date: null, notes: 'For acid reflux' });
    for (let i = 0; i < 45; i++) {
      const daysAgo = Math.floor(Math.random() * 60);
      const hour = 19 + Math.floor(Math.random() * 4); // mostly evening after dinner
      const date = generatePastDate(daysAgo, hour);
      
      const isSpicy = Math.random() > 0.5; // 50% chance triggered by spicy food
      
      entries.push({
        id: uuid(), profileId, timestamp: date,
        raw_text: isSpicy ? 'Had tacos for dinner, now terrible reflux' : 'Bloated and stomach hurts',
        normalized_symptom: isSpicy ? 'Acid reflux' : 'Stomach cramps',
        severity: isSpicy ? 4 : 2,
        body_location: 'Abdomen',
        context_tags: JSON.stringify([getDayTag(date), getTimeTag(hour), 'after_food', ...(isSpicy ? ['spicy'] : [])])
      });
    }
  }

  else if (u.type === 'back') {
    treatments.push({ id: uuid(), profileId, name: 'Physical Therapy', start_date: generatePastDate(30, 10), end_date: null, notes: 'Weekly' });
    for (let i = 0; i < 50; i++) {
      const daysAgo = Math.floor(Math.random() * 60);
      const hour = 16 + Math.floor(Math.random() * 3); // late afternoon
      const date = generatePastDate(daysAgo, hour);
      
      const isSevere = daysAgo > 30; // Severity improved in last 30 days due to PT
      
      entries.push({
        id: uuid(), profileId, timestamp: date,
        raw_text: isSevere ? 'Back is killing me after sitting all day' : 'Dull ache in lower back',
        normalized_symptom: 'Back pain',
        severity: isSevere ? 4 : 2,
        body_location: 'Lower back',
        context_tags: JSON.stringify([getDayTag(date), getTimeTag(hour), 'sedentary'])
      });
    }
  }

  else if (u.type === 'stress') {
    for (let i = 0; i < 35; i++) {
      const daysAgo = Math.floor(Math.random() * 60);
      const hour = 10 + Math.floor(Math.random() * 5); 
      const date = generatePastDate(daysAgo, hour);
      
      const isWorkday = [1,2,3,4,5].includes(new Date(date).getDay());
      
      if (isWorkday) {
        entries.push({
          id: uuid(), profileId, timestamp: date,
          raw_text: 'Heart racing during meeting, very anxious',
          normalized_symptom: 'Anxiety',
          severity: 3,
          body_location: 'Chest',
          context_tags: JSON.stringify([getDayTag(date), getTimeTag(hour), 'stress', 'caffeine'])
        });
      }
    }
  }

  else if (u.type === 'general') {
    for (let i = 0; i < 10; i++) {
      const daysAgo = Math.floor(Math.random() * 60);
      const date = generatePastDate(daysAgo, 14);
      
      entries.push({
        id: uuid(), profileId, timestamp: date,
        raw_text: 'Feeling a bit tired today',
        normalized_symptom: 'Fatigue',
        severity: 1,
        body_location: 'General',
        context_tags: JSON.stringify([getDayTag(date), 'afternoon'])
      });
    }
  }

  // Insert treatments
  const insertTreatment = db.prepare('INSERT INTO treatments (id, profile_id, name, start_date, end_date, notes) VALUES (?, ?, ?, ?, ?, ?)');
  for (const t of treatments) {
    insertTreatment.run(t.id, t.profileId, t.name, t.start_date, t.end_date, t.notes);
  }

  // Insert entries
  const insertEntry = db.prepare('INSERT INTO symptom_entries (id, profile_id, timestamp, raw_text, normalized_symptom, severity, body_location, context_tags, source) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)');
  for (const e of entries) {
    insertEntry.run(e.id, e.profileId, e.timestamp, e.raw_text, e.normalized_symptom, e.severity, e.body_location, e.context_tags, 'text');
  }

  console.log(`✅ Seeded ${u.name} with ${entries.length} entries. (Login: ${u.email} / ${u.password})`);
}

console.log('\nDone! You can now log in with any of the emails above and password: "password"');

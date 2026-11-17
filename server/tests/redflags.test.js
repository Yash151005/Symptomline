import { test } from 'node:test';
import assert from 'node:assert/strict';
import { screenRedFlags } from '../redflags.js';

const ids = (text) => screenRedFlags(text).map((f) => f.id);

const SHOULD_FLAG = [
  ['Crushing chest pain going down my left arm and I am sweating', 'cardiac'],
  ['chest tightness with shortness of breath', 'cardiac'],
  ['Pressure in my chest, feeling nauseous', 'cardiac'],
  ['This is the worst headache of my life', 'thunderclap_headache'],
  ['Sudden explosive headache out of nowhere', 'thunderclap_headache'],
  ["I don't want to live anymore", 'self_harm'],
  ['been thinking about killing myself', 'self_harm'],
  ['I feel like everyone would be better off without me', 'self_harm'],
  ['ab marna chahta hoon', 'self_harm'],
  ['My face is drooping and my speech is slurred', 'stroke'],
  ['Weakness on one side of my body since morning', 'stroke'],
  ["I can't breathe properly, lips turning blue", 'breathing'],
  ['throat is swelling after eating peanuts', 'breathing'],
  ['Had a seizure this morning', 'seizure'],
  ['Lower back pain and numbness in my groin', 'cauda_equina'],
  ['back pain, lost control of my bladder', 'cauda_equina'],
  ['headache with high fever and stiff neck', 'meningitis'],
  ['vomiting blood since an hour', 'gi_bleed'],
  ['black tarry stool today', 'gi_bleed'],
  ['I passed out at work', 'syncope'],
  ['Chest pain on and off today', 'chest_pain'],
  ["No idea why, but chest pain and sweating", 'cardiac'],
];

for (const [text, expected] of SHOULD_FLAG) {
  test(`flags "${text}" as ${expected}`, () => {
    assert.ok(ids(text).includes(expected), `got ${JSON.stringify(ids(text))}`);
  });
}

const SHOULD_NOT_FLAG = [
  'Mild headache after long screen session',
  'Stomach off since lunch, bloated',
  'No chest pain today, just tired',
  'Not suicidal, just stressed about exams',
  'Back pain after gym, no numbness',
  'Headache but not the worst headache I have had',
  'Lower back stiffness after sitting all day',
  'I am dying to get some sleep',
  'Killing it at the gym, sore legs',
];

for (const text of SHOULD_NOT_FLAG) {
  test(`does not flag "${text}"`, () => {
    assert.deepEqual(ids(text), []);
  });
}

test('cardiac supersedes generic chest pain and emergencies sort first', () => {
  const flags = screenRedFlags('chest pain radiating to my jaw, also passed out');
  assert.equal(flags[0].level, 'emergency');
  assert.ok(flags.some((f) => f.id === 'cardiac'));
  assert.ok(!flags.some((f) => f.id === 'chest_pain'));
});

test('every flag includes guidance and contact numbers', () => {
  for (const f of screenRedFlags("worst headache of my life and I can't breathe")) {
    assert.ok(f.guidance.length > 20);
    assert.ok(f.contacts.length > 0 && f.contacts.every((c) => /^\d+$/.test(c.number)));
  }
});

test('handles empty / non-string input', () => {
  assert.deepEqual(screenRedFlags(''), []);
  assert.deepEqual(screenRedFlags(null), []);
});

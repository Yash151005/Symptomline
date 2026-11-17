/**
 * Red-flag safety screening.
 *
 * Deterministic, rule-based screening of the patient's raw text for
 * presentations that need urgent or emergency care. It intentionally does
 * NOT depend on the LLM: it must work when Groq is down, and its behaviour
 * must be reviewable and testable.
 *
 * Design choices:
 * - Biased towards sensitivity: a false alarm costs a dismissed banner, a
 *   miss can cost a life.
 * - Simple negation handling ("no chest pain", "not suicidal") to avoid the
 *   most common false positives.
 * - This is screening, not diagnosis. Guidance tells the patient where to
 *   seek care, never what condition they have.
 *
 * Each rule has `all`: a list of concept groups that must ALL be present;
 * each group is a list of regexes of which ANY may match.
 */

export const LEVELS = { emergency: 2, urgent: 1 };

const CHEST = [/\bchest\s+(pain|pressure|tightness|tight|heaviness|discomfort|hurts?|ache|aching|squeez\w*)/i, /\b(pain|pressure|tightness|heaviness|squeezing)\s+(in|on|across)\s+(my\s+)?chest/i, /\bseene\s+(mein|me)\s+dard/i];
const CARDIAC_COMPANION = [/\b(radiat\w*|spread\w*|going|goes|shoot\w*|moving)\s+(down|to|into|up)\s+(my\s+)?(left\s+)?(arm|jaw|neck|shoulder|back)/i, /\b(left\s+)?arm\s+(pain|hurts?|ache|numb\w*|tingl\w*)/i, /\b(pain|ache|numbness|tingling)\s+(in|down)\s+(my\s+)?(left\s+)?arm/i, /\bjaw\s+(pain|hurts?|ache)/i, /\b(pain|ache)\s+in\s+(my\s+)?jaw/i, /\bsweat(ing|y)?\b/i, /\bcold\s+sweat/i, /\bshort(ness)?\s+of\s+breath/i, /\b(hard|difficult|struggling)\s+to\s+breathe/i, /\bbreathless/i, /\bnause(a|ous)/i, /\b(faint|light-?headed|dizzy)/i];
const BREATHING = [/\b(can'?t|cannot|unable\s+to|not\s+able\s+to|struggling\s+to)\s+breathe/i, /\bgasping\s+for\s+(air|breath)/i, /\blips\s+(are\s+|turned\s+|turning\s+)?(blue|purple)/i, /\bthroat\s+(is\s+)?(swelling|closing|swollen|tight)/i, /\btongue\s+(is\s+)?swell\w*/i, /\bchoking\b/i];

export const RULES = [
  {
    id: 'self_harm',
    level: 'emergency',
    title: 'You deserve support right now',
    guidance: 'If you are thinking about ending your life or hurting yourself, please reach out now. Talk to someone you trust, call a crisis line, or go to the nearest emergency department. You are not alone.',
    contacts: 'crisis',
    all: [[
      /\b(kill|hurt|harm|cut)(ing)?\s+(my\s*self|myself)\b/i,
      /\bsuicid\w*/i,
      /\b(want|wanna|going|plan(ning)?)\s+to\s+die\b/i,
      /\bend\s+(my|it\s+all|my\s+life)\b/i,
      /\b(don'?t|do\s+not)\s+want\s+to\s+(live|be\s+alive|wake\s+up)/i,
      /\bno\s+(reason|point)\s+(to|in)\s+living\b/i,
      /\bbetter\s+off\s+(dead|without\s+me)\b/i,
      /\bmarna\s+chaht[aie]\b/i,
      /\bjeena\s+nahi\s+chaht[aie]\b/i,
    ]],
  },
  {
    id: 'cardiac',
    level: 'emergency',
    title: 'Possible heart emergency',
    guidance: 'Chest pain together with arm/jaw pain, sweating, breathlessness or nausea can be a heart attack. Call emergency services now and follow the dispatcher\'s instructions. Do not drive yourself.',
    contacts: 'emergency',
    all: [CHEST, CARDIAC_COMPANION],
  },
  {
    id: 'thunderclap_headache',
    level: 'emergency',
    title: 'Sudden severe headache needs emergency care',
    guidance: 'A sudden, explosive or "worst ever" headache can signal bleeding in the brain. Go to an emergency department now, even if it starts to ease.',
    contacts: 'emergency',
    all: [[
      /\bworst\s+headache\b/i,
      /\bworst\s+(pain|migraine)\s+(of|in)\s+my\s+life\b/i,
      /\bthunderclap\b/i,
      /\b(sudden|suddenly|out\s+of\s+nowhere)\b.{0,40}\b(explosive|excruciating|severe|blinding)\s+headache/i,
      /\bheadache\b.{0,30}\bcame\s+on\s+(suddenly|in\s+seconds)/i,
    ]],
  },
  {
    id: 'stroke',
    level: 'emergency',
    title: 'Possible stroke: act FAST',
    guidance: 'Face drooping, arm weakness or speech difficulty can be a stroke. Call emergency services immediately and note the time symptoms started. Every minute matters.',
    contacts: 'emergency',
    all: [[
      /\bface\s+(is\s+)?(droop\w*|drooping|numb|lopsided)/i,
      /\b(slurr\w*|garbled)\s+(speech|words)/i,
      /\b(can'?t|cannot|unable\s+to)\s+(speak|talk|find\s+(my\s+)?words)/i,
      /\b(weak(ness)?|numb(ness)?|paraly\w*)\s+(on|in)\s+(one|the\s+(left|right))\s+side/i,
      /\bone\s+side\s+of\s+(my\s+)?(body|face)\b.{0,20}\b(weak|numb|droop\w*)/i,
      /\bsudden(ly)?\s+(lost|loss\s+of)\s+(vision|sight)/i,
      /\b(can'?t|cannot)\s+(lift|move)\s+(my\s+)?(arm|leg)/i,
    ]],
  },
  {
    id: 'breathing',
    level: 'emergency',
    title: 'Breathing difficulty needs emergency care',
    guidance: 'Severe trouble breathing, throat or tongue swelling, or blue lips is an emergency. Call emergency services now. If you have an adrenaline auto-injector for allergies, use it.',
    contacts: 'emergency',
    all: [BREATHING],
  },
  {
    id: 'seizure',
    level: 'emergency',
    title: 'Seizure or loss of consciousness',
    guidance: 'A first seizure, a seizure lasting over 5 minutes, or not waking up afterwards needs emergency care. Call emergency services.',
    contacts: 'emergency',
    all: [[/\bseizure/i, /\bconvuls\w*/i, /\bfits?\s+(again|today|this\s+morning)/i]],
  },
  {
    id: 'cauda_equina',
    level: 'emergency',
    title: 'Back pain with numbness or bladder/bowel changes',
    guidance: 'Back pain with numbness around the groin/buttocks or new loss of bladder or bowel control can mean nerve compression that needs same-day emergency assessment.',
    contacts: 'emergency',
    all: [
      [/\bback\b/i, /\bsciatica\b/i, /\bspine\b/i],
      [/\b(numb\w*|no\s+feeling)\b.{0,30}\b(groin|saddle|buttocks?|genitals?|inner\s+thighs?)/i, /\b(groin|saddle)\b.{0,15}\bnumb/i, /\b(lost|loss\s+of|can'?t)\s+(control\s+(of\s+)?)?(my\s+)?(bladder|bowel)/i, /\b(wet|soiled)\s+my\s*self\b/i, /\bincontinen\w*/i, /\b(can'?t|cannot|unable\s+to)\s+(pee|urinate)/i],
    ],
  },
  {
    id: 'meningitis',
    level: 'urgent',
    title: 'Headache with fever and stiff neck',
    guidance: 'Headache with fever and a stiff neck (or a rash that does not fade under a glass) needs urgent medical assessment today. If drowsy or confused, call emergency services.',
    contacts: 'emergency',
    all: [
      [/\bheadache/i, /\bhead\s+(hurts|pain)/i, /\bmigraine/i],
      [/\bfever/i, /\bhigh\s+temp/i, /\bfeverish/i, /\bbukhar\b/i],
      [/\bstiff\s+neck/i, /\bneck\s+(is\s+)?(stiff|rigid)/i, /\b(can'?t|cannot)\s+(bend|touch\s+chin)/i],
    ],
  },
  {
    id: 'gi_bleed',
    level: 'urgent',
    title: 'Possible internal bleeding',
    guidance: 'Vomiting blood, "coffee-ground" vomit, or black tarry stools can signal bleeding in the gut. Seek urgent medical care today. Call emergency services if you feel faint or are vomiting large amounts.',
    contacts: 'emergency',
    all: [[
      /\b(vomit\w*|throw\w*\s+up|threw\s+up|puk\w*)\s+(up\s+)?(blood|bloody)/i,
      /\bblood\s+in\s+(my\s+)?vomit/i,
      /\bcoffee[-\s]grounds?\b/i,
      /\b(black|tarry|tar-like)\s+(stool|poo|poop)/i,
      /\b(lots\s+of|a\s+lot\s+of)\s+blood\s+in\s+(my\s+)?(stool|poo|poop)/i,
    ]],
  },
  {
    id: 'syncope',
    level: 'urgent',
    title: 'Fainting needs a medical check',
    guidance: 'Passing out, especially with chest pain, palpitations or during exercise, should be checked by a doctor today.',
    contacts: 'emergency',
    all: [[/\bpass(ed)?\s+out\b/i, /\bfainted\b/i, /\blost\s+consciousness\b/i, /\bblacked\s+out\b/i, /\bbehosh\b/i]],
  },
  {
    id: 'chest_pain',
    level: 'urgent',
    title: 'New chest pain should be checked',
    guidance: 'Chest pain should be assessed by a doctor. If it is crushing, spreading to your arm or jaw, or with breathlessness or sweating, call emergency services immediately.',
    contacts: 'emergency',
    all: [CHEST],
    suppressedBy: ['cardiac'],
  },
];

export const CONTACTS = {
  emergency: [
    { label: 'Emergency (India)', number: '112' },
    { label: 'Ambulance (India)', number: '108' },
    { label: 'Emergency (US)', number: '911' },
  ],
  crisis: [
    { label: 'Tele-MANAS (India, 24×7)', number: '14416' },
    { label: '988 Suicide & Crisis Lifeline (US)', number: '988' },
    { label: 'Emergency (India)', number: '112' },
  ],
};

const NEGATION = /\b(no|not|never|without|denies|deny|denied|nor|isn'?t|wasn'?t|don'?t\s+have|didn'?t\s+have|no\s+longer)\b/i;
// Negation scope ends at punctuation or a contrasting/joining conjunction.
const SCOPE_BREAK = /[.!?;,]|\b(but|and|however|though|although|now)\b/gi;

/** True if the regex matches somewhere in text that is not negated. */
function matchesUnnegated(re, text) {
  const global = new RegExp(re.source, re.flags.includes('g') ? re.flags : re.flags + 'g');
  for (const m of text.matchAll(global)) {
    let before = text.slice(Math.max(0, m.index - 30), m.index);
    let lastBreak = -1;
    for (const b of before.matchAll(SCOPE_BREAK)) lastBreak = b.index + b[0].length;
    if (lastBreak >= 0) before = before.slice(lastBreak);
    if (!NEGATION.test(before)) return true;
  }
  return false;
}

/**
 * Screen free text for red flags.
 * @returns {{id,level,title,guidance,contacts}[]} most severe first; empty if none.
 */
export function screenRedFlags(text) {
  if (!text || typeof text !== 'string') return [];
  const normalized = text.replace(/[’‘]/g, "'");

  const hits = RULES.filter((rule) =>
    rule.all.every((group) => group.some((re) => matchesUnnegated(re, normalized)))
  );
  const hitIds = new Set(hits.map((r) => r.id));

  return hits
    .filter((r) => !(r.suppressedBy || []).some((id) => hitIds.has(id)))
    .sort((a, b) => LEVELS[b.level] - LEVELS[a.level])
    .map(({ id, level, title, guidance, contacts }) => ({
      id, level, title, guidance, contacts: CONTACTS[contacts],
    }));
}

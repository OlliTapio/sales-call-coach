import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runCode, DateTime } from './harness.mjs';

const ZONE = 'Europe/Helsinki';

// ---------------------------------------------------------------------------
// Set today's goals
// ---------------------------------------------------------------------------
const PEOPLE = [
  { name: 'Anna Virtanen', phone: '+358 40 123 4567', calls_target: 8, hours_cap: 2, focus: 'close rate', active: 'TRUE' },
  { name: 'Mikko Laine', phone: '358401234568', calls_target: 5, hours_cap: 3, focus: 'founder hours', active: 'true' },
  { name: 'Paused Person', phone: '358401234569', calls_target: 8, hours_cap: 2, focus: 'close rate', active: 'FALSE' },
  { name: 'No Phone', phone: '', calls_target: 8, hours_cap: 2, focus: 'close rate', active: 'TRUE' },
  { name: 'No Focus', phone: '358401234570', calls_target: 10, hours_cap: 1, focus: '', active: 'yes' },
];

const goals = runCode('set-todays-goals.js', {
  items: PEOPLE,
  now: DateTime.fromISO('2026-09-21T08:30:00', { zone: ZONE }),
}).map((item) => item.json);

test('goals: only active people who have a phone number', () => {
  assert.deepEqual(goals.map((g) => g.name), ['Anna Virtanen', 'Mikko Laine', 'No Focus']);
});

test('goals: phone numbers are normalised to the bare digits WhatsApp reports', () => {
  assert.equal(goals[0].phone, '358401234567');
});

test('goals: the key is date|phone, and the reply lane rebuilds it', () => {
  assert.equal(goals[0].key, '2026-09-21|358401234567');
});

test('goals: both numbers reach the message', () => {
  assert.match(goals[0].message, /8 calls/);
  assert.match(goals[0].message, /2h/);
});

test('goals: the focus is whatever the sheet says, not a value this code knows', () => {
  // Nothing here interprets the word — the coach matches it against the Focus
  // column in the playbook library, so the sheet's owner defines the set.
  assert.match(goals[0].message, /Focus: \*close rate\*/);
  assert.match(goals[1].message, /Focus: \*founder hours\*/);
  assert.equal(goals[1].focus, 'founder hours');
});

test('goals: someone with no focus set still gets their numbers', () => {
  assert.doesNotMatch(goals[2].message, /Focus:/);
  assert.match(goals[2].message, /10 calls/);
});

test('goals: the row is opened with empty cells, not zeroes', () => {
  assert.equal(goals[0].calls, '');
  assert.equal(goals[0].hours, '');
  assert.equal(goals[0].status, 'goal_set');
});

// ---------------------------------------------------------------------------
// Match person & parse reply
// ---------------------------------------------------------------------------
const REPLY_PEOPLE = [
  { name: 'Anna Virtanen', phone: '+358401234567', calls_target: 8, hours_cap: 2, focus: 'close rate', active: 'TRUE' },
  { name: 'Mikko Laine', phone: '358401234568', calls_target: 5, hours_cap: 3, focus: 'founder hours', active: 'TRUE' },
];

function inbound(body, { at = '2026-09-21T19:02:00', type = 'text', from = '358401234567' } = {}) {
  return {
    contacts: [{ profile: { name: 'Anna' }, wa_id: from }],
    messages: [{
      from,
      id: 'wamid.TEST',
      type,
      timestamp: String(Math.floor(DateTime.fromISO(at, { zone: ZONE }).toSeconds())),
      text: { body },
    }],
  };
}

function reply(body, opts) {
  const out = runCode('match-person-and-parse-reply.js', {
    items: REPLY_PEOPLE,
    nodes: { 'WhatsApp Trigger': [inbound(body, opts)] },
    now: DateTime.fromISO('2026-09-21T19:02:00', { zone: ZONE }),
  });
  return out.map((item) => item.json);
}

const one = (body, opts) => reply(body, opts)[0];

test('parse: a bare number is the whole check-in', () => {
  const r = one('6');
  assert.equal(r.calls, 6);
  assert.equal(r.hours, '');
  assert.equal(r.parsed, true);
  assert.equal(r.status, 'logged');
});

test('parse: calls and hours together, however they are separated', () => {
  // Not "6,3": a comma is a decimal point here, see the separator test below.
  for (const body of ['6/3', '6 / 3', '6-3', '6/3h']) {
    const r = one(body);
    assert.equal(r.calls, 6, body);
    assert.equal(r.hours, 3, body);
  }
});

test('parse: half hours survive a comma decimal', () => {
  assert.equal(one('6/2,5').hours, 2.5);
});

test('parse: "all" means the target, "none" means zero — not the same as silence', () => {
  assert.equal(one('all').calls, 8);
  assert.equal(one('none').calls, 0);
  assert.equal(one('none').parsed, true);
});

test('parse: the rollover boundary is where the comment says it is', () => {
  // DAY_ROLLOVER_HOUR is restated in prose in the README, so pin the edge.
  assert.equal(one('6', { at: '2026-09-22T03:59:00' }).date, '2026-09-21');
  assert.equal(one('6', { at: '2026-09-22T04:00:00' }).date, '2026-09-22');
});

test('parse: the target comes from the person who sent it', () => {
  assert.equal(one('all', { from: '358401234568' }).calls, 5);
});

test('parse: a sentence goes to the coach, even when it contains a number', () => {
  // These are the ones that actually bit: the match used to be unanchored
  // behind a 12-character cutoff, so every short message carrying a digit was
  // logged as a call count and confirmed back, with no model in the loop.
  const sentences = [
    "tomorrow I'll do 8", 'rough day, maybe 3 but two cancelled', 'what is our refund window?',
    'tomorrow 8', 'maybe 3?', 'not 5', 'call 2 pm', 'sick 0',
    'see you 5pm', 'in 10 min', '18:30', 'call at 7', '21.9.',
  ];
  for (const body of sentences) {
    assert.equal(one(body).parsed, false, body);
    assert.equal(one(body).calls, '', body);
    assert.equal(one(body).status, 'unparsed', body);
  }
});

test('parse: a bare yes or no belongs to the coach, not to the log', () => {
  // The coach asks questions of its own, so "yes" is as likely to be answering
  // one of those as reporting a full day. It used to log the whole target.
  for (const body of ['yes', 'yep', 'done', 'joo', 'no', 'nope', 'ei']) {
    assert.equal(one(body).parsed, false, body);
  }
  // The unambiguous ones still count.
  assert.equal(one('all').calls, 8);
  assert.equal(one('kaikki').calls, 8);
  assert.equal(one('none').calls, 0);
  assert.equal(one('0').calls, 0);
});

test('parse: a comma is a decimal point, never a separator', () => {
  // "2,5" is two and a half hours to a Finnish typist; it must not read as two
  // calls in five hours. Ambiguous, so it goes to the coach.
  assert.equal(one('2,5').parsed, false);
  assert.equal(one('6/2,5').hours, 2.5);
});

test('parse: a trailing unit or full stop still reads as a count', () => {
  for (const body of ['6', '6 calls', '6 call', '6.', '6 puhelua']) {
    assert.equal(one(body).calls, 6, body);
  }
});

test('parse: an impossible number is the coach\'s problem, not the log\'s', () => {
  assert.equal(one('6/40').parsed, false);
});

test('parse: the raw message is kept whether or not it parsed', () => {
  assert.equal(one('rough day').raw_reply, 'rough day');
  assert.equal(one('6').raw_reply, '6');
});

test('parse: a message from someone not being monitored is ignored', () => {
  assert.deepEqual(reply('6', { from: '358409999999' }), []);
});

test('parse: non-text messages are ignored', () => {
  assert.deepEqual(reply('6', { type: 'image' }), []);
});

test('parse: a reply after midnight belongs to the day that just ended', () => {
  assert.equal(one('6', { at: '2026-09-22T00:30:00' }).date, '2026-09-21');
  assert.equal(one('6', { at: '2026-09-22T07:30:00' }).date, '2026-09-22');
});

test('parse: the key matches the one this morning minted', () => {
  assert.equal(one('6').key, '2026-09-21|358401234567');
});

test('parse: the goals and the focus travel with the reply, for the coach prompt', () => {
  const r = one('rough day');
  assert.equal(r.calls_target, 8);
  assert.equal(r.hours_cap, 2);
  assert.equal(r.focus, 'close rate');
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runCode, DateTime } from './harness.mjs';

const ZONE = 'Europe/Helsinki';

// ---------------------------------------------------------------------------
// Set today's goals
// ---------------------------------------------------------------------------
const FOUNDERS = [
  { name: 'Anna Virtanen', phone: '+358 40 123 4567', calls_target: 8, hours_cap: 2, focus: 'close', active: 'TRUE' },
  { name: 'Mikko Laine', phone: '358401234568', calls_target: 5, hours_cap: 3, focus: 'HOURS', active: 'true' },
  { name: 'Paused Person', phone: '358401234569', calls_target: 8, hours_cap: 2, focus: 'close', active: 'FALSE' },
  { name: 'No Phone', phone: '', calls_target: 8, hours_cap: 2, focus: 'close', active: 'TRUE' },
  { name: 'No Focus', phone: '358401234570', calls_target: 10, hours_cap: 1, focus: '', active: 'yes' },
];

const goals = runCode('set-todays-goals.js', {
  items: FOUNDERS,
  now: DateTime.fromISO('2026-09-21T08:30:00', { zone: ZONE }),
}).map((item) => item.json);

test('goals: only active founders who have a phone number', () => {
  assert.deepEqual(goals.map((g) => g.name), ['Anna Virtanen', 'Mikko Laine', 'No Focus']);
});

test('goals: phone numbers are normalised to the bare digits WhatsApp reports', () => {
  assert.equal(goals[0].phone, '358401234567');
});

test('goals: the key is date|phone, and the reply lane rebuilds it', () => {
  assert.equal(goals[0].key, '2026-09-21|358401234567');
});

test('goals: both numbers reach the message', () => {
  assert.match(goals[0].message, /8 sales calls/);
  assert.match(goals[0].message, /2h/);
});

test('goals: the focus reminder is doctrine, looked up by key not written freely', () => {
  assert.match(goals[0].message, /Focus: \*Close Rate\*/);
  // The sheet may hold it in any case.
  assert.match(goals[1].message, /Focus: \*Founder Hours\*/);
  assert.equal(goals[1].focus, 'hours');
});

test('goals: a founder with no focus set still gets their numbers', () => {
  assert.doesNotMatch(goals[2].message, /Focus:/);
  assert.match(goals[2].message, /10 sales calls/);
});

test('goals: the row is opened with empty cells, not zeroes', () => {
  assert.equal(goals[0].calls, '');
  assert.equal(goals[0].hours, '');
  assert.equal(goals[0].status, 'goal_set');
});

// ---------------------------------------------------------------------------
// Match founder & parse reply
// ---------------------------------------------------------------------------
const REPLY_FOUNDERS = [
  { name: 'Anna Virtanen', phone: '+358401234567', calls_target: 8, hours_cap: 2, focus: 'close', active: 'TRUE' },
  { name: 'Mikko Laine', phone: '358401234568', calls_target: 5, hours_cap: 3, focus: 'hours', active: 'TRUE' },
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
  const out = runCode('match-founder-and-parse-reply.js', {
    items: REPLY_FOUNDERS,
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
  for (const body of ['6/3', '6 / 3', '6-3', '6,3', '6/3h']) {
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

test('parse: the target comes from the founder who sent it', () => {
  assert.equal(one('all', { from: '358401234568' }).calls, 5);
});

test('parse: a sentence goes to the coach, even when it contains a number', () => {
  // The regex must not log "tomorrow I'll do 8" as eight calls today.
  for (const body of ["tomorrow I'll do 8", 'rough day, maybe 3 but two cancelled', 'what is our refund window?']) {
    assert.equal(one(body).parsed, false, body);
    assert.equal(one(body).calls, '', body);
    assert.equal(one(body).status, 'unparsed', body);
  }
});

test('parse: an impossible number is the coach\'s problem, not the log\'s', () => {
  assert.equal(one('6/40').parsed, false);
});

test('parse: the raw message is kept whether or not it parsed', () => {
  assert.equal(one('rough day').raw_reply, 'rough day');
  assert.equal(one('6').raw_reply, '6');
});

test('parse: a message from someone not on the founder list is ignored', () => {
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
  assert.equal(r.focus, 'close');
});

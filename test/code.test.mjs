import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runCode, DateTime } from './harness.mjs';

const ZONE = 'Europe/Helsinki';

// ---------------------------------------------------------------------------
// Pick today's reps
// ---------------------------------------------------------------------------
const ROSTER = [
  { name: 'Anna Virtanen', phone: '+358 40 123 4567', daily_target: 8, active: 'TRUE' },
  { name: 'Mikko Laine', phone: '358401234568', daily_target: 10, active: 'true' },
  { name: 'Paused Person', phone: '358401234569', daily_target: 8, active: 'FALSE' },
  { name: 'No Phone', phone: '', daily_target: 8, active: 'TRUE' },
  { name: 'Default Target', phone: '358401234570', daily_target: '', active: 'yes' },
];

const picked = runCode('pick-todays-reps.js', {
  items: ROSTER,
  now: DateTime.fromISO('2026-09-18T16:30:00', { zone: ZONE }),
}).map((item) => item.json);

test("pick: only active reps who have a phone number", () => {
  assert.deepEqual(picked.map((r) => r.name), ['Anna Virtanen', 'Mikko Laine', 'Default Target']);
});

test('pick: phone numbers are normalised to the bare digits WhatsApp reports', () => {
  assert.equal(picked[0].phone, '358401234567');
});

test('pick: the key is date|phone', () => {
  assert.equal(picked[0].key, '2026-09-18|358401234567');
});

test('pick: per-rep target is carried, with a fallback of 8', () => {
  assert.equal(picked[1].target, 10);
  assert.equal(picked[2].target, 8);
});

test('pick: the goal is logged with an empty calls cell, not a zero', () => {
  assert.equal(picked[0].calls, '');
  assert.equal(picked[0].status, 'goal_set');
});

// ---------------------------------------------------------------------------
// Match rep & parse reply
// ---------------------------------------------------------------------------
const REPLY_ROSTER = [
  { name: 'Anna Virtanen', phone: '+358401234567', daily_target: 8, active: 'TRUE' },
  { name: 'Mikko Laine', phone: '358401234568', daily_target: 10, active: 'TRUE' },
];

function inbound(body, { at = '2026-09-18T17:02:00', type = 'text', from = '358401234567' } = {}) {
  return {
    contacts: [{ profile: { name: 'Anna' }, wa_id: from }],
    messages: [{
      from,
      id: 'wamid.TEST',
      type,
      timestamp: String(Math.floor(DateTime.fromISO(at, { zone: ZONE }).toSeconds())),
      text: { body },
    }],
    field: 'messages',
  };
}

function parse(body, opts) {
  return runCode('match-rep-and-parse-reply.js', {
    items: REPLY_ROSTER,
    nodes: { 'WhatsApp Trigger': [inbound(body, opts)] },
    now: DateTime.fromISO('2026-09-18T17:02:00', { zone: ZONE }),
  }).map((item) => item.json);
}

for (const [reply, expected] of [
  ['6', 6],
  ['6/8', 6],
  ['8 calls', 8],
  ['all', 8],
  ['Kaikki', 8],
  ['none', 0],
  ['0', 0],
]) {
  test(`parse: ${JSON.stringify(reply)} is understood without the model`, () => {
    const [row] = parse(reply);
    assert.equal(row.calls, expected);
    assert.equal(row.parsed, true);
  });
}

test('parse: a sentence is handed to the model branch', () => {
  const [row] = parse('did 6, two of them no-showed');
  assert.equal(row.parsed, false);
  assert.equal(row.calls, '');
  assert.equal(row.status, 'unparsed');
});

test("parse: a promise about tomorrow is not logged as today's count", () => {
  assert.equal(parse("tomorrow I'll do 8")[0].parsed, false);
});

test('parse: the raw reply is kept for the audit trail', () => {
  assert.equal(parse('6/8')[0].raw_reply, '6/8');
});

test('parse: the key matches the one this morning\'s ask wrote', () => {
  assert.equal(parse('6')[0].key, '2026-09-18|358401234567');
});

test('parse: a reply just after midnight counts for the day that ended', () => {
  assert.equal(parse('6', { at: '2026-09-19T00:30:00' })[0].date, '2026-09-18');
});

test('parse: a reply during the next working day counts for that day', () => {
  assert.equal(parse('6', { at: '2026-09-19T09:00:00' })[0].date, '2026-09-19');
});

test('parse: non-text messages are ignored', () => {
  assert.equal(parse('x', { type: 'image' }).length, 0);
});

test('parse: a sender who is not on the roster is ignored', () => {
  assert.equal(parse('6', { from: '358409999999' }).length, 0);
});

test('parse: several messages in one webhook delivery all get rows', () => {
  const rows = runCode('match-rep-and-parse-reply.js', {
    items: REPLY_ROSTER,
    nodes: {
      'WhatsApp Trigger': [inbound('6'), inbound('9', { from: '358401234568' })],
    },
    now: DateTime.fromISO('2026-09-18T17:02:00', { zone: ZONE }),
  }).map((item) => item.json);

  assert.deepEqual(rows.map((r) => [r.name, r.calls]), [
    ['Anna Virtanen', 6],
    ['Mikko Laine', 9],
  ]);
});

test('parse: a question mark sends the reply to the handbook lane', () => {
  assert.equal(parse('what is our refund window?')[0].looks_like_question, true);
});

test('parse: a question without the mark is still a question', () => {
  assert.equal(parse('how do I log a no show')[0].looks_like_question, true);
});

test('parse: Finnish question openers count too', () => {
  assert.equal(parse('miten kirjaan no-shown')[0].looks_like_question, true);
});

test('parse: a plain number is not a question', () => {
  assert.equal(parse('6')[0].looks_like_question, false);
});

test('parse: "6?" is someone checking their own count, not a handbook question', () => {
  assert.equal(parse('6?')[0].looks_like_question, false);
});

test('parse: a report that happens to contain a number still parses as a number', () => {
  // The lane only reaches the handbook after the extractor has failed to find
  // a count, so both flags being true is the wanted outcome, not a conflict.
  const [row] = parse('did 6, is the CRM down?');
  assert.equal(row.parsed, false);
  assert.equal(row.looks_like_question, true);
});


// ---------------------------------------------------------------------------
// Find the best answer
// ---------------------------------------------------------------------------
// Shaped the way the Notion node hands rows over with Simplify on: the title
// column arrives as `name` as well, everything else as `property_<snake_case>`.
const entry = (over = {}) => ({
  id: 'page-id', url: 'https://www.notion.so/page-id',
  property_question: '', property_answer: '', property_keywords: [], property_active: true,
  ...over,
});

const HANDBOOK = [
  entry({
    url: 'https://www.notion.so/refunds',
    property_question: 'What is our refund window?',
    property_answer: 'Thirty days from the invoice date, no questions asked.',
    property_keywords: ['refund', 'money back'],
  }),
  entry({
    url: 'https://www.notion.so/no-shows',
    property_question: 'How do I log a no-show?',
    property_answer: 'Count it as a call and add "no-show" in your reply.',
    property_keywords: ['noshow', 'cancelled'],
  }),
  entry({
    property_question: 'What is the old launch discount code?',
    property_answer: 'SPRING24, retired in June.',
    property_keywords: ['discount'],
    property_active: false,
  }),
  entry({
    property_question: 'What is our escalation path?',
    property_keywords: ['escalation'],
  }),
];

const question = (raw_reply, over = {}) => ({
  phone: '358401234567', name: 'Anna', raw_reply, looks_like_question: true, ...over,
});

function ask(raw_reply, { handbook = HANDBOOK, questions } = {}) {
  return runCode('find-the-best-answer.js', {
    items: handbook,
    nodes: { 'Match rep & parse reply': questions ?? [question(raw_reply)] },
  }).map((item) => item.json);
}

test('handbook: the row the rep asked about is the one that is offered', () => {
  const [found] = ask('what is our refund window?');
  assert.equal(found.matched, true);
  assert.equal(found.matched_question, 'What is our refund window?');
});

test('handbook: a keyword catches a phrasing the question does not use', () => {
  const [found] = ask('can I get my money back after a month');
  assert.equal(found.matched_question, 'What is our refund window?');
});

test('handbook: nothing relevant keeps the model out of it', () => {
  const [found] = ask('is the office open on saturday?');
  assert.equal(found.matched, false);
  assert.match(found.fallback_answer, /ask your coach/i);
});

test('handbook: a retired row is not offered', () => {
  const [found] = ask('what is the old discount code?');
  assert.equal(found.matched, false);
});

test('handbook: a row nobody has written the answer for yet is not offered', () => {
  const [found] = ask('what is our escalation path?');
  assert.equal(found.matched, false);
});

test('handbook: a row switched off as text, not a checkbox, is still off', () => {
  const retired = [entry({
    property_question: 'What is our refund window?',
    property_answer: 'Thirty days.',
    property_keywords: ['refund'],
    property_active: 'FALSE',
  })];
  assert.equal(ask('what is our refund window?', { handbook: retired })[0].matched, false);
});

test('handbook: a handbook with no active column at all still answers', () => {
  const plain = [{ name: 'What is our refund window?', url: '',
    property_question: 'What is our refund window?', property_answer: 'Thirty days.' }];
  assert.equal(ask('what is our refund window?', { handbook: plain })[0].matched, true);
});

test('handbook: keywords typed as one comma-separated cell work as well as tags', () => {
  const csv = [entry({
    property_question: 'What is our refund window?',
    property_answer: 'Thirty days.',
    property_keywords: 'refund, money back',
  })];
  assert.equal(ask('can I get my money back', { handbook: csv })[0].matched, true);
});

test('handbook: only the three best rows reach the model', () => {
  const crowded = ['a', 'b', 'c', 'd', 'e'].map((suffix) =>
    entry({
      property_question: `What is our refund window ${suffix}?`,
      property_answer: `Answer ${suffix}.`,
      property_keywords: ['refund'],
    }));

  const [found] = ask('what is our refund window?', { handbook: crowded });
  assert.equal(found.handbook.split('\n').filter((line) => line.startsWith('   A:')).length, 3);
});

test('handbook: the model is handed the rows, not the whole handbook', () => {
  const [found] = ask('what is our refund window?');
  assert.match(found.handbook, /Thirty days from the invoice date/);
  assert.doesNotMatch(found.handbook, /no-show/);
});

test('handbook: the top row is the fallback, so a missing model still answers', () => {
  const [found] = ask('what is our refund window?');
  assert.equal(found.fallback_answer, 'Thirty days from the invoice date, no questions asked.');
});

test('handbook: the answer carries the page it came from', () => {
  const [found] = ask('what is our refund window?');
  assert.equal(found.source, 'https://www.notion.so/refunds');
  assert.match(found.source_suffix, /^ — https:\/\/www\.notion\.so\/refunds$/);
});

test('handbook: no match means no link to append', () => {
  assert.equal(ask('is the office open on saturday?')[0].source_suffix, '');
});

test('handbook: a Notion outage still produces something to send', () => {
  const [found] = ask('what is our refund window?', { handbook: [{ error: 'Forbidden' }] });
  assert.equal(found.handbook_size, 0);
  assert.equal(found.matched, false);
  assert.ok(found.fallback_answer.length > 0);
});

test('handbook: an empty handbook answers rather than going quiet', () => {
  // What "Always Output Data" on the Notion node hands over when the database
  // is empty: one item with nothing in it.
  const [found] = ask('what is our refund window?', { handbook: [{}] });
  assert.equal(found.matched, false);
  assert.match(found.fallback_answer, /ask your coach/i);
});

test('handbook: replies that are not questions are left alone', () => {
  const answers = ask(null, {
    questions: [question('6', { looks_like_question: false }), question('what is our refund window?')],
  });
  assert.deepEqual(answers.map((a) => a.question), ['what is our refund window?']);
});

test('handbook: each question is answered to the rep who asked it', () => {
  const answers = ask(null, {
    questions: [
      question('what is our refund window?'),
      question('how do I log a no-show?', { phone: '358401234568', name: 'Mikko' }),
    ],
  });
  assert.deepEqual(answers.map((a) => [a.name, a.phone, a.matched_question]), [
    ['Anna', '358401234567', 'What is our refund window?'],
    ['Mikko', '358401234568', 'How do I log a no-show?'],
  ]);
});

// ---------------------------------------------------------------------------
// Who still owes a number
// ---------------------------------------------------------------------------
const NUDGE_NOW = DateTime.fromISO('2026-09-18T16:30:00', { zone: ZONE }); // Friday

const row = (over = {}) => ({
  key: `${over.date}|${over.phone}`, weekday: 'Fri', target: 8, calls: '',
  status: 'goal_set', note: '', raw_reply: '', logged_at: '', ...over,
});

// Anna replied yesterday at 18:30 — 22h ago, so the window is still open.
// Joonas has never replied. Mikko already reported today. Sofia was nudged already.
const NUDGE_LOG = [
  row({ date: '2026-09-17', name: 'Anna', phone: '358401234567', calls: 6,
        status: 'answered', raw_reply: '6', logged_at: '2026-09-17T18:30:00.000+03:00' }),
  row({ date: '2026-09-18', name: 'Anna', phone: '358401234567' }),
  row({ date: '2026-09-18', name: 'Mikko', phone: '358401234568', calls: 9, status: 'answered',
        raw_reply: '9', logged_at: '2026-09-18T11:00:00.000+03:00' }),
  row({ date: '2026-09-18', name: 'Sofia', phone: '358401234569', status: 'nudged' }),
  row({ date: '2026-09-18', name: 'Joonas', phone: '358401234570' }),
  row({ date: '2026-09-15', name: 'Joonas', phone: '358401234570', calls: 2, status: 'answered',
        raw_reply: '2', logged_at: '2026-09-15T18:00:00.000+03:00' }),
];

const nudges = runCode('who-still-owes-a-number.js', { items: NUDGE_LOG, now: NUDGE_NOW })
  .map((item) => item.json);

test('nudge: only today\'s unanswered, un-nudged people', () => {
  assert.deepEqual(nudges.map((n) => n.name), ['Anna', 'Joonas']);
});

test('nudge: a reply inside 24h leaves the free-text window open', () => {
  const anna = nudges.find((n) => n.name === 'Anna');
  assert.equal(anna.window_open, true);
  assert.equal(anna.hours_since_last_reply, 22); // 18:30 yesterday -> 16:30 today
});

test('nudge: a reply older than 24h closes the window, so a template is required', () => {
  const joonas = nudges.find((n) => n.name === 'Joonas');
  assert.equal(joonas.window_open, false);
  assert.ok(joonas.hours_since_last_reply > 24);
});

test('nudge: someone who has never replied has no open window', () => {
  const never = runCode('who-still-owes-a-number.js', {
    items: [row({ date: '2026-09-18', name: 'New', phone: '358409999999' })],
    now: NUDGE_NOW,
  })[0].json;
  assert.equal(never.window_open, false);
  assert.equal(never.hours_since_last_reply, null);
});

test('nudge: re-running the lane does not nudge the same person twice', () => {
  const after = runCode('who-still-owes-a-number.js', {
    items: NUDGE_LOG.map((r) => (r.name === 'Anna' && r.date === '2026-09-18'
      ? { ...r, status: 'nudged' } : r)),
    now: NUDGE_NOW,
  }).map((i) => i.json.name);
  assert.deepEqual(after, ['Joonas']);
});

test('nudge: the row updates the goal row rather than adding a new one', () => {
  const anna = nudges.find((n) => n.name === 'Anna');
  assert.equal(anna.key, '2026-09-18|358401234567');
  assert.equal(anna.status, 'nudged');
  assert.equal(anna.calls, '');
});

test('nudge: the model is handed the run-up, not just the day', () => {
  const anna = nudges.find((n) => n.name === 'Anna');
  // Yesterday only; today is excluded because today is the thing being asked about.
  assert.match(anna.context, /^Last 7 days: reported on 1 of 1 days, 6 calls against a target of 8/);
});

test('nudge: context is a rolling week, so Monday is not treated as day one', () => {
  const monday = DateTime.fromISO('2026-09-21T16:30:00', { zone: ZONE });
  const [only] = runCode('who-still-owes-a-number.js', {
    items: [
      row({ date: '2026-09-18', name: 'Anna', phone: '358401234567', calls: 7,
            status: 'answered', raw_reply: '7', logged_at: '2026-09-18T18:30:00.000+03:00' }),
      row({ date: '2026-09-21', name: 'Anna', phone: '358401234567' }),
    ],
    now: monday,
  }).map((i) => i.json);
  assert.match(only.context, /^Last 7 days: reported on 1 of 1 days/);
});

test('nudge: a first-day rep gets a context line that says so', () => {
  const first = runCode('who-still-owes-a-number.js', {
    items: [row({ date: '2026-09-18', name: 'New', phone: '358409999999' })],
    now: NUDGE_NOW,
  })[0].json;
  assert.equal(first.context, 'First day being tracked.');
});

test('nudge: nobody owes anything -> nothing is sent', () => {
  const none = runCode('who-still-owes-a-number.js', {
    items: [row({ date: '2026-09-18', name: 'Mikko', phone: '358401234568', calls: 9,
                  status: 'answered', raw_reply: '9', logged_at: '2026-09-18T11:00:00.000+03:00' })],
    now: NUDGE_NOW,
  });
  assert.equal(none.length, 0);
});

// ---------------------------------------------------------------------------
// Aggregate the week
// ---------------------------------------------------------------------------
const LOG = [
  ['2026-09-14', 'Anna', '358401234567', 8, 8],
  ['2026-09-15', 'Anna', '358401234567', 8, 6],
  ['2026-09-16', 'Anna', '358401234567', 8, ''],   // asked, never answered
  ['2026-09-17', 'Anna', '358401234567', 8, 9],    // beat the target
  ['2026-09-18', 'Anna', '358401234567', 8, 4],
  ['2026-09-14', 'Mikko', '358401234568', 10, 3],
  ['2026-09-11', 'Anna', '358401234567', 8, 8],    // last week
  ['not-a-date', 'Junk', '358401234567', 8, 5],
].map(([date, name, phone, target, calls]) => ({ key: `${date}|${phone}`, date, name, phone, target, calls }));

const weekly = runCode('aggregate-the-week.js', {
  items: LOG,
  now: DateTime.fromISO('2026-09-18T17:00:00', { zone: ZONE }),
}).map((item) => item.json);

test('aggregate: one row per rep, best week first', () => {
  assert.deepEqual(weekly.map((r) => r.name), ['Anna', 'Mikko']);
});

test('aggregate: rows outside the current week are excluded', () => {
  assert.equal(weekly[0].calls, 8 + 6 + 9 + 4);
});

test('aggregate: unparseable dates are skipped rather than counted', () => {
  assert.equal(weekly[0].asked, 5);
});

test('aggregate: asked and answered are counted separately', () => {
  assert.equal(weekly[0].asked, 5);
  assert.equal(weekly[0].answered, 4);
});

test('aggregate: a silent day stays blank instead of becoming a zero', () => {
  assert.equal(weekly[0].wed, '');
});

test('aggregate: hitting or beating the target counts as a hit day', () => {
  assert.equal(weekly[0].hit_days, 2);
});

test('aggregate: days are spread into columns for the spreadsheet chart', () => {
  assert.equal(weekly[0].mon, 8);
  assert.equal(weekly[0].fri, 4);
});

test('aggregate: percentage is measured against the days actually asked', () => {
  assert.equal(weekly[0].pct_of_target, Math.round((27 / 40) * 100));
});

test('aggregate: the composite id makes re-running the report idempotent', () => {
  assert.equal(weekly[0].id, '2026-W38|358401234567');
});

// ---------------------------------------------------------------------------
// Build the chart
// ---------------------------------------------------------------------------
const built = runCode('build-the-chart.js', { items: weekly });
const chart = built[0]?.json;

test('chart: one item carries the config and the caption', () => {
  assert.equal(built.length, 1);
});

test('chart: the config survives JSON.stringify (QuickChart gets JSON, not functions)', () => {
  assert.deepEqual(JSON.parse(JSON.stringify(chart.chart)), chart.chart);
});

test('chart: the value rides on the axis label, where a 0-call rep can still show it', () => {
  assert.deepEqual(chart.chart.data.labels, [['Anna', '27 of 40'], ['Mikko', '3 of 10']]);
  assert.equal(chart.chart.options.plugins.datalabels.display, false);
});

test('chart: the track segment is the shortfall and never goes negative', () => {
  const [made, toGo] = chart.chart.data.datasets;
  assert.deepEqual(made.data, [27, 3]);
  assert.deepEqual(toGo.data, [13, 7]);

  const over = runCode('build-the-chart.js', {
    items: [{ ...weekly[0], calls: 50, target_total: 40 }],
  });
  assert.deepEqual(over[0].json.chart.data.datasets[1].data, [0]);
});

test('chart: both segments share one axis', () => {
  assert.equal(chart.chart.options.scales.xAxes[0].stacked, true);
  assert.equal(chart.chart.options.scales.yAxes[0].stacked, true);
});

test('chart: two series means a legend is present', () => {
  assert.equal(chart.chart.options.legend.position, 'bottom');
});

test('chart: bar geometry is on the dataset, which is where Chart.js 2.9 wants it', () => {
  assert.equal(chart.chart.data.datasets[0].barPercentage, 0.62);
  assert.equal(chart.chart.options.scales.yAxes[0].barPercentage, undefined);
});

test('chart: the canvas grows with the roster', () => {
  assert.equal(chart.height, 150 + 2 * 58);
});

test('chart: the caption calls out silent days', () => {
  assert.match(chart.summary, /Anna: 27\/40 \(68%\) · hit target 2\/5 days, 1 day silent/);
});

test('chart: an empty week sends nothing at all', () => {
  assert.equal(runCode('build-the-chart.js', { items: [] }).length, 0);
});

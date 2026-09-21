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

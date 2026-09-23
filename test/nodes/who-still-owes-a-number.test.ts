import { describe, expect, test } from 'vitest';
import { RUNNERS, at, type Json } from '../support/n8n-sandbox.ts';

const NOW = at('2026-09-18T16:30:00');

const row = (over: Json & { date: string; phone: string }): Json => ({
  key: `${over.date}|${over.phone}`,
  weekday: 'Fri',
  target: 8,
  calls: '',
  status: 'goal_set',
  note: '',
  raw_reply: '',
  logged_at: '',
  ...over,
});

interface Answer {
  readonly date: string;
  readonly name: string;
  readonly phone: string;
  readonly calls: number;
  readonly at: string;
}

const answered = ({ date, name, phone, calls, at: loggedAt }: Answer): Json =>
  row({
    date,
    name,
    phone,
    calls,
    status: 'answered',
    raw_reply: String(calls),
    logged_at: loggedAt,
  });

const ANNA = { name: 'Anna', phone: '358401234567' };
const MIKKO = { name: 'Mikko', phone: '358401234568' };

/** Anna replied 22h ago (window open). Joonas not recently. Mikko reported. Sofia was nudged. */
const LOG = [
  answered({ ...ANNA, date: '2026-09-17', calls: 6, at: '2026-09-17T18:30:00.000+03:00' }),
  row({ ...ANNA, date: '2026-09-18' }),
  answered({ ...MIKKO, date: '2026-09-18', calls: 9, at: '2026-09-18T11:00:00.000+03:00' }),
  row({ date: '2026-09-18', name: 'Sofia', phone: '358401234569', status: 'nudged' }),
  row({ date: '2026-09-18', name: 'Joonas', phone: '358401234570' }),
  answered({
    name: 'Joonas',
    phone: '358401234570',
    date: '2026-09-15',
    calls: 2,
    at: '2026-09-15T18:00:00.000+03:00',
  }),
];

describe.each(RUNNERS)('Who still owes a number (%s)', (_, run) => {
  const nudges = run('Who still owes a number', { items: LOG, now: NOW });
  const byName = (name: string) => nudges.find((n) => n['name'] === name);

  test("only today's unanswered, un-nudged people", () => {
    expect(nudges.map((n) => n['name'])).toEqual(['Anna', 'Joonas']);
  });

  test('a reply inside 24h leaves the free-text window open', () => {
    expect(byName('Anna')).toMatchObject({ window_open: true, hours_since_last_reply: 22 });
  });

  test('a reply older than 24h closes the window, so a template is required', () => {
    expect(byName('Joonas')?.['window_open']).toBe(false);
    expect(byName('Joonas')?.['hours_since_last_reply']).toBeGreaterThan(24);
  });

  test('someone who has never replied has no open window', () => {
    const [never] = run('Who still owes a number', {
      items: [row({ date: '2026-09-18', name: 'New', phone: '358409999999' })],
      now: NOW,
    });
    expect(never).toMatchObject({ window_open: false, hours_since_last_reply: null });
  });

  test('re-running the lane does not nudge the same person twice', () => {
    const after = run('Who still owes a number', {
      items: LOG.map((r) =>
        r['name'] === 'Anna' && r['date'] === '2026-09-18' ? { ...r, status: 'nudged' } : r,
      ),
      now: NOW,
    });
    expect(after.map((n) => n['name'])).toEqual(['Joonas']);
  });

  test('the row updates the goal row rather than adding a new one', () => {
    expect(byName('Anna')).toMatchObject({
      key: '2026-09-18|358401234567',
      status: 'nudged',
      calls: '',
    });
  });

  test('a row without a key gets the date|phone key', () => {
    const [keyless] = run('Who still owes a number', {
      items: [row({ date: '2026-09-18', name: 'New', phone: '358409999999', key: '' })],
      now: NOW,
    });
    expect(keyless?.['key']).toBe('2026-09-18|358409999999');
  });

  test('the model is handed the run-up, not just the day', () => {
    expect(byName('Anna')?.['context']).toMatch(
      /^Last 7 days: reported on 1 of 1 days, 6 calls against a target of 8/,
    );
  });

  test('context is a rolling week, so Monday is not treated as day one', () => {
    const [only] = run('Who still owes a number', {
      items: [
        answered({ ...ANNA, date: '2026-09-18', calls: 7, at: '2026-09-18T18:30:00.000+03:00' }),
        row({ date: '2026-09-21', name: 'Anna', phone: '358401234567' }),
      ],
      now: at('2026-09-21T16:30:00'),
    });
    expect(only?.['context']).toMatch(/^Last 7 days: reported on 1 of 1 days/);
  });

  test('a first-day rep gets a context line that says so', () => {
    const [first] = run('Who still owes a number', {
      items: [row({ date: '2026-09-18', name: 'New', phone: '358409999999' })],
      now: NOW,
    });
    expect(first?.['context']).toBe('First day being tracked.');
  });

  test('nobody owes anything -> nothing is sent', () => {
    const none = run('Who still owes a number', {
      items: [
        answered({ ...MIKKO, date: '2026-09-18', calls: 9, at: '2026-09-18T11:00:00.000+03:00' }),
      ],
      now: NOW,
    });
    expect(none).toHaveLength(0);
  });
});

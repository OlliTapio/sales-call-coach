import { describe, expect, test } from 'vitest';
import { RUNNERS, at, type Runner } from '../support/n8n-sandbox.ts';

const ROSTER = [
  { name: 'Anna Virtanen', phone: '+358401234567', daily_target: 8, active: 'TRUE' },
  { name: 'Mikko Laine', phone: '358401234568', daily_target: 10, active: 'TRUE' },
];

interface Inbound {
  readonly at?: string;
  readonly type?: string;
  readonly from?: string;
}

const inbound = (
  body: string,
  { at: when = '2026-09-18T17:02:00', type = 'text', from = '358401234567' }: Inbound = {},
) => ({
  contacts: [{ profile: { name: 'Anna' }, wa_id: from }],
  messages: [
    {
      from,
      id: 'wamid.TEST',
      type,
      timestamp: String(Math.floor(at(when).toSeconds())),
      text: { body },
    },
  ],
  field: 'messages',
});

describe.each(RUNNERS)('Match rep & parse reply (%s)', (_, run: Runner) => {
  const parse = (body: string, opts?: Inbound) =>
    run('Match rep & parse reply', {
      items: ROSTER,
      nodes: { 'WhatsApp Trigger': [inbound(body, opts)] },
      now: at('2026-09-18T17:02:00'),
    });

  test.each([
    ['6', 6],
    ['6/8', 6],
    ['8 calls', 8],
    ['all', 8],
    ['Kaikki', 8],
    ['none', 0],
    ['0', 0],
  ])('%j is understood without the model', (reply, expected) => {
    expect(parse(reply)[0]).toMatchObject({ calls: expected, parsed: true });
  });

  test('a sentence is handed to the model branch', () => {
    expect(parse('did 6, two of them no-showed')[0]).toMatchObject({
      parsed: false,
      calls: '',
      status: 'unparsed',
    });
  });

  test("a promise about tomorrow is not logged as today's count", () => {
    expect(parse("tomorrow I'll do 8")[0]?.['parsed']).toBe(false);
  });

  test('an implausibly large number is not trusted', () => {
    expect(parse('500')[0]?.['parsed']).toBe(false);
  });

  test('the raw reply is kept for the audit trail', () => {
    expect(parse('6/8')[0]?.['raw_reply']).toBe('6/8');
  });

  test("the key matches the one this morning's ask wrote", () => {
    expect(parse('6')[0]?.['key']).toBe('2026-09-18|358401234567');
  });

  test('a reply just after midnight counts for the day that ended', () => {
    expect(parse('6', { at: '2026-09-19T00:30:00' })[0]?.['date']).toBe('2026-09-18');
  });

  test('a reply during the next working day counts for that day', () => {
    expect(parse('6', { at: '2026-09-19T09:00:00' })[0]?.['date']).toBe('2026-09-19');
  });

  test('non-text messages are ignored', () => {
    expect(parse('x', { type: 'image' })).toHaveLength(0);
  });

  test('a sender who is not on the roster is ignored', () => {
    expect(parse('6', { from: '358409999999' })).toHaveLength(0);
  });

  test('a missing timestamp falls back to now', () => {
    const rows = run('Match rep & parse reply', {
      items: ROSTER,
      nodes: {
        'WhatsApp Trigger': [
          { messages: [{ from: '358401234567', type: 'text', text: { body: '5' } }] },
        ],
      },
      now: at('2026-09-18T17:02:00'),
    });
    expect(rows[0]).toMatchObject({ date: '2026-09-18', calls: 5, message_id: '' });
  });

  test('several messages in one webhook delivery all get rows', () => {
    const rows = run('Match rep & parse reply', {
      items: ROSTER,
      nodes: { 'WhatsApp Trigger': [inbound('6'), inbound('9', { from: '358401234568' })] },
      now: at('2026-09-18T17:02:00'),
    });
    expect(rows.map((r) => [r['name'], r['calls']])).toEqual([
      ['Anna Virtanen', 6],
      ['Mikko Laine', 9],
    ]);
  });

  test('an event without messages yields nothing', () => {
    const rows = run('Match rep & parse reply', {
      items: ROSTER,
      nodes: { 'WhatsApp Trigger': [{ statuses: [] }] },
    });
    expect(rows).toHaveLength(0);
  });
});

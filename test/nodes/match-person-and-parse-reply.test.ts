import { describe, expect, test } from 'vitest';
import { RUNNERS, at, type Json, type Runner } from '../support/n8n-sandbox.ts';

const PEOPLE = [
  {
    name: 'Anna Virtanen',
    chat_id: ' 610044521 ',
    calls_target: 8,
    hours_cap: 2,
    focus: 'close rate',
    active: 'TRUE',
  },
  {
    name: 'Mikko Laine',
    chat_id: 610044522,
    calls_target: 5,
    hours_cap: 3,
    focus: 'founder hours',
    active: 'TRUE',
  },
];

interface Inbound {
  readonly at?: string;
  /** Photos and stickers arrive with no `text` at all, which is how lane 2 skips them. */
  readonly text?: boolean;
  readonly chatId?: number | string;
}

const inbound = (
  body: string,
  { at: when = '2026-09-21T19:02:00', text = true, chatId = 610044521 }: Inbound = {},
): Json => ({
  update_id: 1,
  message: {
    message_id: 4242,
    from: { id: chatId, is_bot: false, first_name: 'Anna' },
    chat: { id: chatId, type: 'private' },
    date: Math.floor(at(when).toSeconds()),
    ...(text ? { text: body } : {}),
  },
});

describe.each(RUNNERS)('Match person & parse reply (%s)', (_, run: Runner) => {
  const reply = (body: string, opts?: Inbound) =>
    run('Match person & parse reply', {
      items: PEOPLE,
      nodes: { 'Telegram Trigger': [inbound(body, opts)] },
      now: at('2026-09-21T19:02:00'),
    });
  const one = (body: string, opts?: Inbound) => reply(body, opts)[0];

  test('a bare number is the whole check-in', () => {
    expect(one('6')).toMatchObject({
      calls: 6,
      hours: '',
      parsed: true,
      status: 'logged',
      note: 'calls',
    });
  });

  test.each(['6/3', '6 / 3', '6-3', '6/3h'])('calls and hours together: %j', (body) => {
    expect(one(body)).toMatchObject({ calls: 6, hours: 3, note: 'calls+hours' });
  });

  test('half hours survive a comma decimal', () => {
    expect(one('6/2,5')?.['hours']).toBe(2.5);
  });

  test('"all" means the target, "none" means zero — not the same as silence', () => {
    expect(one('all')?.['calls']).toBe(8);
    expect(one('none')).toMatchObject({ calls: 0, parsed: true });
  });

  test('the rollover boundary is where the comment says it is', () => {
    expect(one('6', { at: '2026-09-22T03:59:00' })?.['date']).toBe('2026-09-21');
    expect(one('6', { at: '2026-09-22T04:00:00' })?.['date']).toBe('2026-09-22');
  });

  test('the target comes from the person who sent it', () => {
    expect(one('all', { chatId: 610044522 })?.['calls']).toBe(5);
  });

  test.each([
    "tomorrow I'll do 8",
    'rough day, maybe 3 but two cancelled',
    'what is our refund window?',
    'tomorrow 8',
    'maybe 3?',
    'not 5',
    'call 2 pm',
    'sick 0',
    'see you 5pm',
    'in 10 min',
    '18:30',
    'call at 7',
    '21.9.',
  ])('a sentence goes to the coach, even with a number: %j', (body) => {
    expect(one(body)).toMatchObject({ parsed: false, calls: '', status: 'unparsed' });
  });

  test.each(['yes', 'yep', 'done', 'joo', 'no', 'nope', 'ei'])(
    'a bare yes or no belongs to the coach: %j',
    (body) => {
      expect(one(body)?.['parsed']).toBe(false);
    },
  );

  test('the unambiguous words still count', () => {
    expect(['all', 'kaikki', 'none', '0'].map((b) => one(b)?.['calls'])).toEqual([8, 8, 0, 0]);
  });

  test('a comma is a decimal point, never a separator', () => {
    expect(one('2,5')?.['parsed']).toBe(false);
  });

  test.each(['6', '6 calls', '6 call', '6.', '6 puhelua'])(
    'a trailing unit reads as a count: %j',
    (body) => {
      expect(one(body)?.['calls']).toBe(6);
    },
  );

  test.each(['6/40', '101', '101/2'])("an impossible number is the coach's problem: %j", (body) => {
    expect(one(body)?.['parsed']).toBe(false);
  });

  test('the raw message is kept whether or not it parsed', () => {
    expect(one('rough day')?.['raw_reply']).toBe('rough day');
    expect(one('6')?.['raw_reply']).toBe('6');
  });

  test('a message from someone not being monitored is ignored', () => {
    expect(reply('6', { chatId: 610049999 })).toEqual([]);
  });

  test('non-text messages are ignored', () => {
    expect(reply('6', { text: false })).toEqual([]);
  });

  test('a reply after midnight belongs to the day that just ended', () => {
    expect(one('6', { at: '2026-09-22T00:30:00' })?.['date']).toBe('2026-09-21');
    expect(one('6', { at: '2026-09-22T07:30:00' })?.['date']).toBe('2026-09-22');
  });

  test('the key matches the one this morning minted', () => {
    expect(one('6')?.['key']).toBe('2026-09-21|610044521');
  });

  test('the goals and the focus travel with the reply, for the coach prompt', () => {
    expect(one('rough day')).toMatchObject({ calls_target: 8, hours_cap: 2, focus: 'close rate' });
  });

  test('a missing timestamp falls back to now; an event without messages yields nothing', () => {
    const rows = run('Match person & parse reply', {
      items: PEOPLE,
      nodes: {
        'Telegram Trigger': [
          { message: { chat: { id: 610044521 }, text: '5' } },
          { edited_message: { chat: { id: 610044521 }, text: '9' } },
        ],
      },
      now: at('2026-09-21T19:02:00'),
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ date: '2026-09-21', calls: 5, message_id: '' });
  });
});

import { describe, expect, test } from 'vitest';
import { RUNNERS, at } from '../support/n8n-sandbox.ts';

const PEOPLE = [
  {
    name: 'Anna Virtanen',
    chat_id: ' 610 044 521 ',
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
    active: 'true',
  },
  {
    name: 'Paused Person',
    chat_id: 610044523,
    calls_target: 8,
    hours_cap: 2,
    focus: 'close rate',
    active: 'FALSE',
  },
  {
    name: 'No Chat Id',
    chat_id: '',
    calls_target: 8,
    hours_cap: 2,
    focus: 'close rate',
    active: 'TRUE',
  },
  {
    name: 'No Focus',
    chat_id: 610044524,
    calls_target: 10,
    hours_cap: 1,
    focus: '',
    active: 'yes',
  },
  { name: '', chat_id: 610044525, calls_target: 'x', hours_cap: '', focus: '  ', active: 'x' },
];

describe.each(RUNNERS)("Set today's goals (%s)", (_, run) => {
  const goals = run("Set today's goals", { items: PEOPLE, now: at('2026-09-21T08:30:00') });
  const message = (i: number): string => String(goals[i]?.['message']);

  test('only active people who have a chat id', () => {
    expect(goals.map((g) => g['name'])).toEqual([
      'Anna Virtanen',
      'Mikko Laine',
      'No Focus',
      '610044525',
    ]);
  });

  test('chat ids are normalised to the bare digits Telegram reports', () => {
    expect(goals[0]?.['chat_id']).toBe('610044521');
  });

  test('the key is date|chat_id, and the reply lane rebuilds it', () => {
    expect(goals[0]?.['key']).toBe('2026-09-21|610044521');
  });

  test('both numbers reach the message, addressed by first name', () => {
    expect(message(0)).toMatch(/^Morning Anna\. Today: \*8 calls\*, and stay under \*2h\*/);
    expect(message(0)).toMatch(/"8\/2" is enough/);
  });

  test('the focus is whatever the sheet says, not a value this code knows', () => {
    expect(message(0)).toMatch(/Focus: \*close rate\*/);
    expect(message(1)).toMatch(/Focus: \*founder hours\*/);
    expect(goals[1]?.['focus']).toBe('founder hours');
  });

  test('someone with no focus set still gets their numbers', () => {
    expect(message(2)).not.toMatch(/Focus:/);
    expect(message(2)).toMatch(/10 calls/);
  });

  test('a blank name falls back to the chat id, and junk targets to zero', () => {
    expect(goals[3]).toMatchObject({
      name: '610044525',
      calls_target: 0,
      hours_cap: 0,
      focus: '',
    });
    expect(message(3)).toMatch(/^Morning 610044525\./);
  });

  test('markdown characters in sheet text cannot unbalance the message', () => {
    const [row] = run("Set today's goals", {
      items: [
        {
          name: 'A_B *C*',
          chat_id: 610044521,
          calls_target: 8,
          hours_cap: 2,
          focus: 'follow_up cadence*',
          active: 'TRUE',
        },
      ],
      now: at('2026-09-21T08:30:00'),
    });
    const text = String(row?.['message']);
    // Only the four asterisks this view writes itself may survive.
    expect((text.match(/[*]/g) ?? []).length).toBe(6);
    expect(text).not.toMatch(/_/);
    expect(text).toMatch(/Focus: \*followup cadence\*/);
  });

  test('the row is opened with empty cells, not zeroes', () => {
    expect(goals[0]).toMatchObject({ calls: '', hours: '', status: 'goal_set' });
  });
});

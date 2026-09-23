import { describe, expect, test } from 'vitest';
import { RUNNERS, at } from '../support/n8n-sandbox.ts';

const PEOPLE = [
  {
    name: 'Anna Virtanen',
    phone: '+358 40 123 4567',
    calls_target: 8,
    hours_cap: 2,
    focus: 'close rate',
    active: 'TRUE',
  },
  {
    name: 'Mikko Laine',
    phone: '358401234568',
    calls_target: 5,
    hours_cap: 3,
    focus: 'founder hours',
    active: 'true',
  },
  {
    name: 'Paused Person',
    phone: '358401234569',
    calls_target: 8,
    hours_cap: 2,
    focus: 'close rate',
    active: 'FALSE',
  },
  {
    name: 'No Phone',
    phone: '',
    calls_target: 8,
    hours_cap: 2,
    focus: 'close rate',
    active: 'TRUE',
  },
  {
    name: 'No Focus',
    phone: '358401234570',
    calls_target: 10,
    hours_cap: 1,
    focus: '',
    active: 'yes',
  },
  { name: '', phone: '358401234571', calls_target: 'x', hours_cap: '', focus: '  ', active: 'x' },
];

describe.each(RUNNERS)("Set today's goals (%s)", (_, run) => {
  const goals = run("Set today's goals", { items: PEOPLE, now: at('2026-09-21T08:30:00') });
  const message = (i: number): string => String(goals[i]?.['message']);

  test('only active people who have a phone number', () => {
    expect(goals.map((g) => g['name'])).toEqual([
      'Anna Virtanen',
      'Mikko Laine',
      'No Focus',
      '358401234571',
    ]);
  });

  test('phone numbers are normalised to the bare digits WhatsApp reports', () => {
    expect(goals[0]?.['phone']).toBe('358401234567');
  });

  test('the key is date|phone, and the reply lane rebuilds it', () => {
    expect(goals[0]?.['key']).toBe('2026-09-21|358401234567');
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

  test('a blank name falls back to the phone, and junk targets to zero', () => {
    expect(goals[3]).toMatchObject({
      name: '358401234571',
      calls_target: 0,
      hours_cap: 0,
      focus: '',
    });
    expect(message(3)).toMatch(/^Morning 358401234571\./);
  });

  test('the row is opened with empty cells, not zeroes', () => {
    expect(goals[0]).toMatchObject({ calls: '', hours: '', status: 'goal_set' });
  });
});

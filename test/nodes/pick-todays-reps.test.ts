import { describe, expect, test } from 'vitest';
import { RUNNERS, at } from '../support/n8n-sandbox.ts';

const ROSTER = [
  { name: 'Anna Virtanen', phone: '+358 40 123 4567', daily_target: 8, active: 'TRUE' },
  { name: 'Mikko Laine', phone: '358401234568', daily_target: 10, active: 'true' },
  { name: 'Paused Person', phone: '358401234569', daily_target: 8, active: 'FALSE' },
  { name: 'No Phone', phone: '', daily_target: 8, active: 'TRUE' },
  { name: 'Default Target', phone: '358401234570', daily_target: '', active: 'yes' },
];

describe.each(RUNNERS)("Pick today's reps (%s)", (_, run) => {
  const picked = run("Pick today's reps", { items: ROSTER, now: at('2026-09-18T16:30:00') });

  test('only active reps who have a phone number', () => {
    expect(picked.map((r) => r['name'])).toEqual([
      'Anna Virtanen',
      'Mikko Laine',
      'Default Target',
    ]);
  });

  test('phone numbers are normalised to the bare digits WhatsApp reports', () => {
    expect(picked[0]?.['phone']).toBe('358401234567');
  });

  test('the key is date|phone', () => {
    expect(picked[0]?.['key']).toBe('2026-09-18|358401234567');
  });

  test('per-rep target is carried, with a fallback of 8', () => {
    expect(picked[1]?.['target']).toBe(10);
    expect(picked[2]?.['target']).toBe(8);
  });

  test('the goal is logged with an empty calls cell, not a zero', () => {
    expect(picked[0]).toMatchObject({ calls: '', status: 'goal_set' });
  });
});

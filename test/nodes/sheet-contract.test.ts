import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';
import { RUNNERS, at } from '../support/n8n-sandbox.ts';

const header = (tab: string): readonly string[] =>
  (
    readFileSync(new URL(`../../sheets/${tab}.csv`, import.meta.url), 'utf8').split(/\r?\n/)[0] ??
    ''
  ).split(',');

const [, run] = RUNNERS[0] ?? [];
const now = at('2026-09-18T10:00:00');
const rep = { name: 'Anna', phone: '358401234567', daily_target: 8, active: 'TRUE' };

test('a goal row has exactly the Log tab columns', () => {
  const [row] = run?.("Pick today's reps", { items: [rep], now }) ?? [];
  expect(Object.keys(row ?? {})).toEqual(header('Log'));
});

test('a weekly row has exactly the Weekly tab columns', () => {
  const log = [{ ...rep, key: 'k', date: '2026-09-15', target: 8, calls: 5 }];
  const [row] = run?.('Aggregate the week', { items: log, now }) ?? [];
  expect(Object.keys(row ?? {})).toEqual(header('Weekly'));
});

test('the roster tab carries the columns the adapters read', () => {
  expect(header('Roster')).toEqual(['name', 'phone', 'daily_target', 'active']);
});

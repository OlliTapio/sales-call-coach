import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';
import { readWorkflow } from '../../tools/build/workflow-file.ts';
import { RUNNERS, at } from '../support/n8n-sandbox.ts';

const header = (tab: string): readonly string[] =>
  (
    readFileSync(new URL(`../../sheets/${tab}.csv`, import.meta.url), 'utf8').split(/\r?\n/)[0] ??
    ''
  )
    .trim()
    .split(',');

const [, run] = RUNNERS[0] ?? [];
const now = at('2026-09-21T19:00:00');
const person = {
  name: 'Anna',
  chat_id: 610044521,
  calls_target: 8,
  hours_cap: 2,
  focus: 'x',
  active: 'TRUE',
};
const ROUTING = new Set(['message', 'parsed', 'message_id']);
const columns = (row: object | undefined): readonly string[] =>
  Object.keys(row ?? {}).filter((k) => !ROUTING.has(k));

test('a goal row carries exactly the Days columns, plus the message', () => {
  const [row] = run?.("Set today's goals", { items: [person], now }) ?? [];
  expect(columns(row)).toEqual(header('Days'));
});

test('a reply row carries exactly the Days columns, plus routing fields', () => {
  const event = { message: { chat: { id: person.chat_id }, text: '6' } };
  const [row] =
    run?.('Match person & parse reply', {
      items: [person],
      nodes: { 'Telegram Trigger': [event] },
      now,
    }) ?? [];
  expect(columns(row)).toEqual(header('Days'));
});

test('the People tab carries every column the adapter reads', () => {
  expect(header('People')).toEqual(
    expect.arrayContaining(['name', 'chat_id', 'calls_target', 'hours_cap', 'focus', 'active']),
  );
});

test('every Days write on the canvas maps the same columns as the sheet', () => {
  const nodes = readWorkflow().nodes.filter((n) =>
    ['Log the goals', 'Record the day', 'log_the_day'].includes(n.name),
  );
  expect(nodes).toHaveLength(3);
  for (const node of nodes) {
    const value = (node.parameters['columns'] as { value?: object } | undefined)?.value;
    expect(Object.keys(value ?? {}).sort(), node.name).toEqual([...header('Days')].sort());
  }
});

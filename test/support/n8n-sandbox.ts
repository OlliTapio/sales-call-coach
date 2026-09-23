/**
 * @file Runs a Code node the way n8n does: `$input`, `$now`, `$()` and `DateTime` as globals.
 * `source` runs the TypeScript in `src/nodes`; `built` runs the `jsCode` in `workflow.json`.
 */
import { DateTime } from 'luxon';
import { vi } from 'vitest';
import * as aggregate from '../../src/nodes/aggregate-the-week.ts';
import * as chart from '../../src/nodes/build-the-chart.ts';
import * as reply from '../../src/nodes/match-rep-and-parse-reply.ts';
import * as pick from '../../src/nodes/pick-todays-reps.ts';
import * as nudge from '../../src/nodes/who-still-owes-a-number.ts';
import type { CodeNodeName } from '../../tools/build/code-nodes.ts';
import { readWorkflow } from '../../tools/build/workflow-file.ts';

export type Json = Readonly<Record<string, unknown>>;

interface NodeContext {
  readonly items?: readonly Json[];
  readonly nodes?: Readonly<Record<string, readonly Json[]>>;
  readonly now?: DateTime;
}

export type Runner = (node: CodeNodeName, context?: NodeContext) => readonly Json[];

const ZONE = 'Europe/Helsinki';
export const at = (iso: string): ReturnType<typeof DateTime.fromISO> =>
  DateTime.fromISO(iso, { zone: ZONE });

const SOURCES: Readonly<
  Record<CodeNodeName, { readonly main: () => readonly { json: unknown }[] }>
> = {
  "Pick today's reps": pick,
  'Who still owes a number': nudge,
  'Match rep & parse reply': reply,
  'Aggregate the week': aggregate,
  'Build the chart': chart,
};

const wrap = (rows: readonly Json[]) => ({ all: () => rows.map((json) => ({ json })) });

const globalsFor = ({ items = [], nodes = {}, now = DateTime.now() }: NodeContext) => ({
  $input: wrap(items),
  $now: now,
  $: (name: string) => {
    const rows = nodes[name];
    if (rows === undefined) throw new Error(`test asked for node ${name}, which was not stubbed`);
    return wrap(rows);
  },
  DateTime,
});

const asJson = (items: readonly { json: unknown }[]): readonly Json[] =>
  items.map((item) => item.json as Json);

const runSource: Runner = (node, context = {}) => {
  for (const [name, value] of Object.entries(globalsFor(context))) vi.stubGlobal(name, value);
  try {
    return asJson(SOURCES[node].main());
  } finally {
    vi.unstubAllGlobals();
  }
};

const runBuilt: Runner = (node, context = {}) => {
  const code = readWorkflow().nodes.find((n) => n.name === node)?.parameters['jsCode'];
  if (typeof code !== 'string') throw new Error(`${node} has no jsCode in workflow.json`);
  const g = globalsFor(context);
  // eslint-disable-next-line @typescript-eslint/no-implied-eval -- this is how n8n runs a Code node
  const body = new Function('$input', '$now', '$', 'DateTime', code) as (
    ...args: unknown[]
  ) => unknown;
  return asJson(body(g.$input, g.$now, g.$, g.DateTime) as { json: unknown }[]);
};

export const RUNNERS: readonly (readonly [string, Runner])[] = [
  ['source', runSource],
  ['built', runBuilt],
];

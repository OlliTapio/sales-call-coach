import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';
import { readWorkflow, type Workflow, type WorkflowNode } from '../../tools/build/workflow-file.ts';
import { format, lintWorkflow, RULES } from '../../tools/workflow-lint/lint.ts';
import { inWords } from '../../tools/workflow-lint/readme-rules.ts';

const README = readFileSync(new URL('../../README.md', import.meta.url), 'utf8');
const WORKFLOW = readWorkflow();

const patchNode = (
  wf: Workflow,
  name: string,
  patch: (n: WorkflowNode) => WorkflowNode,
): Workflow => ({
  ...wf,
  nodes: wf.nodes.map((n) => (n.name === name ? patch(n) : n)),
});
const setParam = (wf: Workflow, name: string, key: string, value: unknown): Workflow =>
  patchNode(wf, name, (n) => ({ ...n, parameters: { ...n.parameters, [key]: value } }));
const set = (wf: Workflow, name: string, key: string, value: unknown): Workflow =>
  patchNode(wf, name, (n) => ({ ...n, [key]: value }));
const without = (wf: Workflow, name: string): Workflow => ({
  ...wf,
  nodes: wf.nodes.filter((n) => n.name !== name),
});
const rewire = (
  wf: Workflow,
  source: string,
  outputs: readonly (readonly string[])[],
): Workflow => ({
  ...wf,
  connections: {
    ...wf.connections,
    [source]: {
      main: outputs.map((targets) => targets.map((node) => ({ node, type: 'main', index: 0 }))),
    },
  },
});
const disconnect = (wf: Workflow, source: string): Workflow => ({
  ...wf,
  connections: { ...wf.connections, [source]: {} },
});

const GOALS = "Set today's goals";
const IF = 'Did the regex read it?';
const TIDY = 'Tidy the coach reply';
const TERNARY = "={{ $json.a ? 'x' : 'y' }}";

const BROKEN: readonly (readonly [string, Workflow, string?])[] = [
  ['has-workflow-id', { ...WORKFLOW, id: undefined }],
  ['unique-names-and-ids', set(WORKFLOW, 'Claude', 'name', 'Coach')],
  ['connections-resolve', rewire(WORKFLOW, 'Ghost', [['Nobody']])],
  ['node-refs-resolve', setParam(WORKFLOW, 'Send the goals', 'textBody', "={{ $('Gone').x }}")],
  ['no-orphans', disconnect(WORKFLOW, 'Send the goals')],
  ['balanced-expressions', setParam(WORKFLOW, 'Send the goals', 'textBody', '={{ $json.x ')],
  ['expression-complexity', setParam(WORKFLOW, 'Send the goals', 'textBody', TERNARY)],
  ['expression-complexity', setParam(WORKFLOW, TIDY, 'assignments', {}), 'Listed as an exception'],
  ['no-credentials-exported', set(WORKFLOW, 'Claude', 'credentials', { anthropicApi: {} })],
  ['no-hardcoded-targets', setParam(WORKFLOW, 'Send the goals', 'phoneNumberId', '1234567')],
  ['no-default-node-names', set(WORKFLOW, TIDY, 'name', 'Edit Fields1')],
  ['code-nodes-are-generated', setParam(WORKFLOW, GOALS, 'jsCode', 'return [];')],
  ['code-nodes-are-generated', without(WORKFLOW, GOALS)],
  ['outbound-retries', set(WORKFLOW, 'Log the goals', 'retryOnFail', false)],
  ['ai-nodes-degrade', set(WORKFLOW, 'Coach', 'onError', 'stopWorkflow')],
  ['no-disabled-or-pinned', set(WORKFLOW, 'Log the goals', 'disabled', true)],
  ['no-disabled-or-pinned', { ...WORKFLOW, pinData: { 'Record the day': [] } }],
  ['timezone-matches-code', { ...WORKFLOW, settings: { timezone: 'UTC' } }],
  ['sticky-note-per-lane', without(WORKFLOW, '1 · Goals note')],
  ['regex-owns-the-log', rewire(WORKFLOW, IF, [['Coach'], ['Record the day']])],
  ['regex-owns-the-log', rewire(WORKFLOW, 'Coach', [[TIDY, 'Record the day'], [TIDY]])],
  ['days-upserts-on-key', setParam(WORKFLOW, 'Record the day', 'operation', 'append')],
  [
    'agent-writes-only-spoken-cells',
    setParam(WORKFLOW, 'log_the_day', 'columns', { value: { key: "={{ $fromAI('key') }}" } }),
  ],
  ['agent-cluster', disconnect(WORKFLOW, 'read_the_playbooks')],
  ['agent-cluster', set(WORKFLOW, 'Remember the thread', 'parameters', { sessionIdType: 'x' })],
  ['agent-degrades', rewire(WORKFLOW, 'Coach', [[TIDY], []])],
  ['agent-degrades', setParam(WORKFLOW, TIDY, 'assignments', { assignments: [] })],
  ['playbooks-read-whole', setParam(WORKFLOW, 'read_the_playbooks', 'returnAll', false)],
  ['reply-lane-hygiene', set(WORKFLOW, 'Get the people (reply)', 'executeOnce', false)],
  ['reply-lane-hygiene', setParam(WORKFLOW, 'WhatsApp Trigger', 'options', {})],
  [
    'placeholders-match-readme',
    setParam(WORKFLOW, 'Send the goals', 'phoneNumberId', 'REPLACE_WITH_SOMETHING'),
  ],
  [
    'placeholders-match-readme',
    patchNode(WORKFLOW, 'read_the_playbooks', (n) => ({ ...n, parameters: { resource: 'x' } })),
    'Carries a real id',
  ],
  ['known-defects-documented', without(WORKFLOW, 'Known defects note')],
  ['readme-counts-match-canvas', without(WORKFLOW, 'TODO note')],
];

describe('workflow lint', () => {
  test('the committed workflow passes every rule', () => {
    expect(lintWorkflow(WORKFLOW, README).map(format)).toEqual([]);
  });

  test('every rule has a failing case below', () => {
    const covered = new Set(BROKEN.map(([rule]) => rule));
    expect(RULES.map((r) => r.id).filter((id) => !covered.has(id))).toEqual([]);
  });

  const cases = BROKEN.map(([rule, broken, message]) => ({ rule, broken, message }));
  test.each(cases)('$rule catches its mistake', ({ rule, broken, message }) => {
    const hits = lintWorkflow(broken, README).filter((f) => f.rule === rule);
    expect(hits.length).toBeGreaterThan(0);
    if (message !== undefined) expect(hits.map((h) => h.message).join('\n')).toContain(message);
  });

  test('the README rules read the README', () => {
    const rules = new Set(lintWorkflow(WORKFLOW, '').map((f) => f.rule));
    expect(rules).toEqual(
      new Set([
        'placeholders-match-readme',
        'known-defects-documented',
        'readme-counts-match-canvas',
      ]),
    );
  });
});

describe('inWords', () => {
  test.each([
    [0, 'zero'],
    [8, 'eight'],
    [13, 'thirteen'],
    [30, 'thirty'],
    [33, 'thirty-three'],
    [99, 'ninety-nine'],
    [120, '120'],
  ])('%i is %s', (n, words) => {
    expect(inWords(n)).toBe(words);
  });
});

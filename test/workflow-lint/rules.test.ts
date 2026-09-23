import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';
import { readWorkflow, type Workflow, type WorkflowNode } from '../../tools/build/workflow-file.ts';
import { format, lintWorkflow, RULES } from '../../tools/workflow-lint/lint.ts';
import { inWords } from '../../tools/workflow-lint/project-rules.ts';

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

const BROKEN: readonly (readonly [string, Workflow, string?])[] = [
  ['has-workflow-id', { ...WORKFLOW, id: undefined }],
  ['unique-names-and-ids', set(WORKFLOW, 'Claude', 'name', 'Read the log')],
  ['connections-resolve', rewire(WORKFLOW, 'Ghost', [['Nobody']])],
  [
    'node-refs-resolve',
    setParam(WORKFLOW, 'Nudge in chat', 'textBody', "={{ $('Renamed').item.json.x }}"),
  ],
  ['no-orphans', { ...WORKFLOW, connections: { ...WORKFLOW.connections, 'Build the chart': {} } }],
  ['balanced-expressions', setParam(WORKFLOW, 'Nudge in chat', 'textBody', '={{ $json.message ')],
  [
    'expression-complexity',
    setParam(WORKFLOW, 'Nudge in chat', 'textBody', "={{ $json.a ? 'x' : 'y' }}"),
  ],
  [
    'expression-complexity',
    setParam(WORKFLOW, 'Tidy the nudge', 'assignments', {}),
    'Listed as an exception',
  ],
  [
    'no-credentials-exported',
    set(WORKFLOW, 'Claude', 'credentials', { anthropicApi: { id: '1' } }),
  ],
  ['no-hardcoded-targets', setParam(WORKFLOW, 'Nudge in chat', 'phoneNumberId', '123456789012345')],
  ['no-default-node-names', set(WORKFLOW, 'Build the chart', 'name', 'Code1')],
  ['code-nodes-are-generated', setParam(WORKFLOW, 'Build the chart', 'jsCode', 'return [];')],
  [
    'code-nodes-are-generated',
    { ...WORKFLOW, nodes: WORKFLOW.nodes.filter((n) => n.name !== 'Build the chart') },
  ],
  ['outbound-retries', set(WORKFLOW, 'Log the goal', 'retryOnFail', false)],
  ['ai-nodes-degrade', set(WORKFLOW, 'Read it with Claude', 'onError', 'stopWorkflow')],
  ['no-disabled-or-pinned', set(WORKFLOW, 'Log the goal', 'disabled', true)],
  ['no-disabled-or-pinned', { ...WORKFLOW, pinData: { 'Get the roster': [] } }],
  ['timezone-matches-code', { ...WORKFLOW, settings: { timezone: 'UTC' } }],
  [
    'sticky-note-per-lane',
    { ...WORKFLOW, nodes: WORKFLOW.nodes.filter((n) => n.name !== 'Lane 3 note') },
  ],
  ['templates-match-readme', setParam(WORKFLOW, 'Nudge by template', 'template', 'other|en')],
  ['nudge-falls-back-to-template', rewire(WORKFLOW, 'Write the nudge', [['Tidy the nudge'], []])],
  [
    'reply-parser-degrades',
    rewire(WORKFLOW, 'Read it with Claude', [["Apply the model's answer"], []]),
  ],
  [
    'one-model-node',
    { ...WORKFLOW, connections: { ...WORKFLOW.connections, Claude: { ai_languageModel: [[]] } } },
  ],
  ['reply-lane-hygiene', set(WORKFLOW, 'Get the roster (reply)', 'executeOnce', false)],
  ['reply-lane-hygiene', setParam(WORKFLOW, 'WhatsApp Trigger', 'options', {})],
  ['log-upserts-on-key', setParam(WORKFLOW, 'Log the goal', 'operation', 'append')],
  [
    'placeholders-match-readme',
    setParam(WORKFLOW, 'Nudge in chat', 'phoneNumberId', 'REPLACE_WITH_SOMETHING'),
  ],
  [
    'readme-counts-match-canvas',
    { ...WORKFLOW, nodes: WORKFLOW.nodes.filter((n) => n.name !== 'Lane 1 note') },
  ],
];

describe('workflow lint', () => {
  test('the committed workflow passes every rule', () => {
    expect(lintWorkflow(WORKFLOW, README).map(format)).toEqual([]);
  });

  test('every rule has a failing case below', () => {
    expect(RULES.map((r) => r.id).filter((id) => !BROKEN.some(([rule]) => rule === id))).toEqual(
      [],
    );
  });

  const cases = BROKEN.map(([rule, broken, message]) => ({ rule, broken, message }));
  test.each(cases)('$rule catches its mistake', ({ rule, broken, message }) => {
    const hits = lintWorkflow(broken, README).filter((f) => f.rule === rule);
    expect(hits.length).toBeGreaterThan(0);
    if (message !== undefined) expect(hits.map((h) => h.message).join('\n')).toContain(message);
  });

  test('the README placeholder check reads the README', () => {
    expect(lintWorkflow(WORKFLOW, '').some((f) => f.rule === 'placeholders-match-readme')).toBe(
      true,
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

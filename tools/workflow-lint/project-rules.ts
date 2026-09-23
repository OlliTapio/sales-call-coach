/** @file Invariants of this workflow's lanes and agent. Each guards a README design note. */
import type { Workflow } from '../build/workflow-file.ts';
import { expectations, same, setting } from './expect.ts';
import { byName, type Rule } from './rule.ts';

const DAYS_WRITES = ['Log the goals', 'Record the day', 'log_the_day'];
const SPOKEN_CELLS = ['calls', 'hours', 'note'];

const feeders = (wf: Workflow, target: string): readonly string[] =>
  Object.entries(wf.connections)
    .filter(([, kinds]) => (kinds['main'] ?? []).flat().some((c) => c.node === target))
    .map(([source]) => source);

const attachedTo = (wf: Workflow, target: string, kind: string): readonly string[] =>
  Object.entries(wf.connections)
    .filter(([, kinds]) => (kinds[kind] ?? []).flat().some((c) => c.node === target))
    .map(([source]) => source);

const regex = expectations('regex-owns-the-log');
const regexOwnsTheLog: Rule = {
  id: 'regex-owns-the-log',
  check: (wf) => [
    ...regex.targets(wf, 'Did the regex read it?', 0, ['Record the day']),
    ...regex.targets(wf, 'Did the regex read it?', 1, ['Coach']),
    ...regex.that(
      same(feeders(wf, 'Record the day'), ['Did the regex read it?']),
      'Record the day',
      'Only the IF may feed Record the day, so a plain number never reaches a model.',
    ),
  ],
};

const upsert = expectations('days-upserts-on-key');
const daysUpsertsOnKey: Rule = {
  id: 'days-upserts-on-key',
  check: (wf) =>
    DAYS_WRITES.flatMap((name) => [
      ...upsert.setting(wf, name, 'operation', 'appendOrUpdate'),
      ...upsert.setting(wf, name, 'columns.matchingColumns', ['key']),
      ...upsert.setting(wf, name, 'sheetName.value', 'Days'),
    ]),
};

const spoken = expectations('agent-writes-only-spoken-cells');
const agentWritesOnlySpokenCells: Rule = {
  id: 'agent-writes-only-spoken-cells',
  check: (wf) => {
    const columns = setting(wf, 'log_the_day', 'columns.value');
    const entries = typeof columns === 'object' && columns !== null ? Object.entries(columns) : [];
    const fromModel = entries.filter(([, v]) => String(v).includes('$fromAI')).map(([k]) => k);
    return [
      ...spoken.that(
        same(fromModel, SPOKEN_CELLS),
        'log_the_day',
        `Only ${SPOKEN_CELLS.join(', ')} may come from $fromAI(); the row it lands on must not.`,
      ),
      ...spoken.setting(wf, 'log_the_day', 'columns.value.key', '={{ $json.key }}'),
    ];
  },
};

const cluster = expectations('agent-cluster');
const agentCluster: Rule = {
  id: 'agent-cluster',
  check: (wf) => {
    const prompt = String(setting(wf, 'Coach', 'options.systemMessage'));
    const tools = attachedTo(wf, 'Coach', 'ai_tool');
    return [
      ...cluster.that(
        same(attachedTo(wf, 'Coach', 'ai_languageModel'), ['Gemini']),
        'Coach',
        'Coach needs exactly one model: Gemini.',
      ),
      ...cluster.that(
        same(attachedTo(wf, 'Coach', 'ai_memory'), ['Remember the thread']),
        'Coach',
        'Coach needs exactly one memory.',
      ),
      ...cluster.that(
        same(tools, ['log_the_day', 'read_the_playbooks']),
        'Coach',
        'Coach has exactly two tools.',
      ),
      ...tools
        .filter((tool) => !prompt.includes(tool))
        .flatMap((tool) =>
          cluster.that(false, 'Coach', `The system prompt never names the tool ${tool}.`),
        ),
      ...cluster.setting(wf, 'Remember the thread', 'sessionIdType', 'customKey'),
      ...cluster.that(
        String(setting(wf, 'Remember the thread', 'sessionKey')).includes('$json.chat_id'),
        'Remember the thread',
        'Memory must be keyed per person ($json.chat_id), not shared.',
      ),
      ...cluster.setting(wf, 'Coach', 'options.enableStreaming', false),
    ];
  },
};

const degrade = expectations('agent-degrades');
const agentDegrades: Rule = {
  id: 'agent-degrades',
  check: (wf) => {
    const fallback = JSON.stringify(
      byName(wf, 'Tidy the coach reply')?.parameters['assignments'] ?? null,
    );
    return [
      ...degrade.setting(wf, 'Coach', 'onError', 'continueErrorOutput'),
      ...degrade.targets(wf, 'Coach', 0, ['Tidy the coach reply']),
      ...degrade.targets(wf, 'Coach', 1, ['Tidy the coach reply']),
      ...degrade.that(
        fallback.includes('$json.output') && /how many calls/i.test(fallback),
        'Tidy the coach reply',
        'The fallback must use the agent output, else ask for the number the regex can read.',
      ),
    ];
  },
};

const playbooks = expectations('playbooks-read-whole');
const playbooksReadWhole: Rule = {
  id: 'playbooks-read-whole',
  check: (wf) => [
    ...playbooks.setting(wf, 'read_the_playbooks', 'resource', 'databasePage'),
    ...playbooks.setting(wf, 'read_the_playbooks', 'operation', 'getAll'),
    ...playbooks.setting(wf, 'read_the_playbooks', 'returnAll', true),
    ...playbooks.setting(wf, 'read_the_playbooks', 'filterType', 'none'),
    ...playbooks.setting(wf, 'read_the_playbooks', 'onError', 'continueRegularOutput'),
    ...playbooks.setting(wf, 'read_the_playbooks', 'alwaysOutputData', true),
  ],
};

const hygiene = expectations('reply-lane-hygiene');
const replyLaneHygiene: Rule = {
  id: 'reply-lane-hygiene',
  check: (wf) => [
    ...hygiene.setting(wf, 'Get the people (reply)', 'executeOnce', true),
    ...hygiene.setting(wf, 'Telegram Trigger', 'updates', ['message']),
  ],
};

export const PROJECT_RULES: readonly Rule[] = [
  regexOwnsTheLog,
  daysUpsertsOnKey,
  agentWritesOnlySpokenCells,
  agentCluster,
  agentDegrades,
  playbooksReadWhole,
  replyLaneHygiene,
];

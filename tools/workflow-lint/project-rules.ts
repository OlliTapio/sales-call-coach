/** @file Invariants of this workflow in particular. Each one guards a decision in the README. */
import type { Workflow } from '../build/workflow-file.ts';
import { byName, finding, targetsOf, type Finding, type Rule } from './rule.ts';

const same = (a: readonly string[], b: readonly string[]): boolean =>
  JSON.stringify([...a].sort()) === JSON.stringify([...b].sort());

const listOrNothing = (names: readonly string[]): string =>
  names.length === 0 ? 'nothing' : names.join(', ');

const expectations = (rule: string) => ({
  targets: (
    wf: Workflow,
    node: string,
    output: number,
    want: readonly string[],
  ): readonly Finding[] =>
    same(targetsOf(wf, node, output), want)
      ? []
      : [
          finding(
            rule,
            node,
            `Output ${String(output)} must go to ${want.join(', ')}; it goes to ${listOrNothing(targetsOf(wf, node, output))}.`,
          ),
        ],
  setting: (wf: Workflow, node: string, key: string, want: unknown): readonly Finding[] => {
    const n = byName(wf, node);
    const actual = n?.[key] ?? n?.parameters[key];
    return JSON.stringify(actual) === JSON.stringify(want)
      ? []
      : [
          finding(
            rule,
            node,
            `${key} must be ${JSON.stringify(want)}; it is ${JSON.stringify(actual)}.`,
          ),
        ];
  },
});

const fallback = expectations('nudge-falls-back-to-template');
const degrade = expectations('reply-parser-degrades');
const hygiene = expectations('reply-lane-hygiene');

const templates: Rule = {
  id: 'templates-match-readme',
  check: (wf) => {
    const sent = [
      ...new Set(
        wf.nodes.map((n) => n.parameters['template']).filter((t) => typeof t === 'string'),
      ),
    ];
    return same(sent, ['daily_sales_goal|en', 'daily_sales_nudge|en'])
      ? []
      : [
          finding(
            'templates-match-readme',
            null,
            `Templates sent are ${sent.join(', ')}; the README documents daily_sales_goal and daily_sales_nudge.`,
          ),
        ];
  },
};

const nudgeFallsBack: Rule = {
  id: 'nudge-falls-back-to-template',
  check: (wf) => [
    ...fallback.setting(wf, 'Write the nudge', 'onError', 'continueErrorOutput'),
    ...fallback.targets(wf, 'Write the nudge', 0, ['Tidy the nudge']),
    ...fallback.targets(wf, 'Write the nudge', 1, ['Nudge by template']),
    ...fallback.targets(wf, 'Can we message freely?', 0, ['Write the nudge']),
    ...fallback.targets(wf, 'Can we message freely?', 1, ['Nudge by template']),
    ...fallback.setting(wf, 'Nudge by template', 'operation', 'sendTemplate'),
  ],
};

const replyDegrades: Rule = {
  id: 'reply-parser-degrades',
  check: (wf) => [
    ...degrade.setting(wf, 'Read it with Claude', 'onError', 'continueErrorOutput'),
    ...degrade.targets(wf, 'Read it with Claude', 1, ['Ask for a plain number']),
  ],
};

const oneModel: Rule = {
  id: 'one-model-node',
  check: (wf) => {
    const targets = wf.connections['Claude']?.['ai_languageModel']?.flat().map((c) => c.node) ?? [];
    return same(targets, ['Read it with Claude', 'Write the nudge'])
      ? []
      : [
          finding(
            'one-model-node',
            'Claude',
            'One Claude node must back both AI steps, so the model is changed in one place.',
          ),
        ];
  },
};

const replyHygiene: Rule = {
  id: 'reply-lane-hygiene',
  check: (wf) => [
    ...hygiene.setting(wf, 'Get the roster (reply)', 'executeOnce', true),
    ...hygiene.setting(wf, 'WhatsApp Trigger', 'updates', ['messages']),
    ...(JSON.stringify(byName(wf, 'WhatsApp Trigger')?.parameters['options']) ===
    JSON.stringify({ messageStatusUpdates: [] })
      ? []
      : [
          finding(
            'reply-lane-hygiene',
            'WhatsApp Trigger',
            'Status callbacks must be filtered out: options.messageStatusUpdates = [].',
          ),
        ]),
  ],
};

const logUpserts: Rule = {
  id: 'log-upserts-on-key',
  check: (wf) =>
    ['Log the goal', 'Log the nudge', 'Record the answer'].flatMap((name) => {
      const p = byName(wf, name)?.parameters;
      const ok =
        p?.['operation'] === 'appendOrUpdate' &&
        JSON.stringify(
          (p['columns'] as { matchingColumns?: unknown } | undefined)?.matchingColumns,
        ) === '["key"]' &&
        (p['sheetName'] as { value?: unknown } | undefined)?.value === 'Log';
      return ok
        ? []
        : [
            finding(
              'log-upserts-on-key',
              name,
              'Every write to Log must be appendOrUpdate on ["key"].',
            ),
          ];
    }),
};

const PLACEHOLDERS = [
  'REPLACE_WITH_COACH_WHATSAPP_NUMBER',
  'REPLACE_WITH_PHONE_NUMBER_ID',
  'REPLACE_WITH_SPREADSHEET_ID',
];

const placeholders: Rule = {
  id: 'placeholders-match-readme',
  check: (wf, ctx) => {
    const found = [
      ...new Set([...JSON.stringify(wf).matchAll(/REPLACE_WITH_[A-Z_]+/g)].map((m) => m[0])),
    ];
    return [
      ...(same(found, PLACEHOLDERS)
        ? []
        : [
            finding(
              'placeholders-match-readme',
              null,
              `Placeholders are ${found.join(', ')}; expected ${PLACEHOLDERS.join(', ')}.`,
            ),
          ]),
      ...PLACEHOLDERS.filter((p) => !ctx.readme.includes(p)).map((p) =>
        finding('placeholders-match-readme', null, `README does not mention ${p}.`),
      ),
    ];
  },
};

const ONES = [
  'zero',
  'one',
  'two',
  'three',
  'four',
  'five',
  'six',
  'seven',
  'eight',
  'nine',
  'ten',
  'eleven',
  'twelve',
  'thirteen',
  'fourteen',
  'fifteen',
  'sixteen',
  'seventeen',
  'eighteen',
  'nineteen',
];
const TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];

/** English words for 0–99, the way the README spells counts ("thirty-three"). */
export const inWords = (n: number): string => {
  if (n < 20) return ONES[n] ?? String(n);
  const tens = TENS[Math.floor(n / 10)];
  if (n >= 100 || tens === undefined) return String(n);
  return n % 10 === 0 ? tens : `${tens}-${ONES[n % 10] ?? ''}`;
};

const readmeCounts: Rule = {
  id: 'readme-counts-match-canvas',
  check: (wf, ctx) => {
    const count = (type: string) => wf.nodes.filter((n) => n.type === type).length;
    const sticky = count('n8n-nodes-base.stickyNote');
    const claims = [
      `${inWords(wf.nodes.length - sticky)} nodes`,
      `${inWords(sticky)} sticky notes`,
      `on all ${inWords(count('n8n-nodes-base.googleSheets'))} Sheets nodes`,
      `on all ${inWords(count('n8n-nodes-base.whatsApp'))} WhatsApp nodes`,
      `The ${inWords(count('n8n-nodes-base.code'))} Code nodes`,
    ];
    return claims
      .filter((claim) => !ctx.readme.toLowerCase().includes(claim.toLowerCase()))
      .map((claim) =>
        finding(
          'readme-counts-match-canvas',
          null,
          `README should say "${claim}"; update it to match the canvas.`,
        ),
      );
  },
};

export const PROJECT_RULES: readonly Rule[] = [
  templates,
  nudgeFallsBack,
  replyDegrades,
  oneModel,
  replyHygiene,
  logUpserts,
  placeholders,
  readmeCounts,
];

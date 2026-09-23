/** @file Rules on individual nodes: expressions, secrets, naming, codegen, resilience. */
import { ZONE } from '../../src/shared/config.ts';
import { CODE_NODES, isCodeNodeName } from '../build/code-nodes.ts';
import type { WorkflowNode } from '../build/workflow-file.ts';
import { eachNode, finding, strings, type Rule } from './rule.ts';

/** Safe to retry: reads, and upserts on a key. */
const IDEMPOTENT = new Set(['n8n-nodes-base.googleSheets']);
/** n8n retries a whole node and WhatsApp has no idempotency key, so a retry can double-send. */
const SENDS = new Set(['n8n-nodes-base.whatsApp']);
const AI_ROOTS = new Set([
  '@n8n/n8n-nodes-langchain.chainLlm',
  '@n8n/n8n-nodes-langchain.informationExtractor',
  '@n8n/n8n-nodes-langchain.agent',
]);
const DEFAULT_NAME =
  /^(Code|If|Switch|Merge|Filter|Set|Edit Fields|HTTP Request|Google Sheets|WhatsApp Business Cloud|Schedule Trigger|Sticky Note|Webhook|No Operation, do nothing)\d*$/;
const PLACEHOLDER = /^REPLACE_WITH_[A-Z_]+$/;
const MAX_EXPRESSION_CODE = 80;

const expressionsOf = (node: WorkflowNode) =>
  strings(node.parameters, node.name).filter(([, v]) => v.startsWith('='));

const balancedExpressions: Rule = {
  id: 'balanced-expressions',
  check: (wf) =>
    eachNode(wf, (node) =>
      expressionsOf(node)
        .filter(([, v]) => v.split('{{').length !== v.split('}}').length)
        .map(([path]) =>
          finding('balanced-expressions', node.name, `Unbalanced {{ }} at ${path}.`),
        ),
    ),
};

const isComplex = (expression: string): boolean =>
  [...expression.matchAll(/\{\{([\s\S]*?)\}\}/g)].some((m) => {
    const code = (m[1] ?? '').trim();
    return code.length > MAX_EXPRESSION_CODE || /(?<!\?)\?(?![.?])|=>|\.replace\(/.test(code);
  });

const expressionComplexity: Rule = {
  id: 'expression-complexity',
  check: (wf, ctx) => {
    const complex = wf.nodes.map(
      (node) => [node.name, expressionsOf(node).filter(([, v]) => isComplex(v))] as const,
    );
    return [
      ...complex
        .filter(([name]) => !Object.hasOwn(ctx.complexExpressions, name))
        .flatMap(([name, found]) =>
          found.map(([path]) =>
            finding(
              'expression-complexity',
              name,
              `Logic in an expression at ${path}. Expressions map fields; move rules into a Code node in src/.`,
            ),
          ),
        ),
      ...Object.keys(ctx.complexExpressions)
        .filter((name) => !complex.some(([n, found]) => n === name && found.length > 0))
        .map((name) =>
          finding(
            'expression-complexity',
            name,
            'Listed as an exception but has no complex expression; remove it from COMPLEX_EXPRESSIONS.',
          ),
        ),
    ];
  },
};

const noCredentialsExported: Rule = {
  id: 'no-credentials-exported',
  check: (wf) =>
    wf.nodes
      .filter((n) => n['credentials'] !== undefined)
      .map((n) =>
        finding(
          'no-credentials-exported',
          n.name,
          'Credential reference exported; delete the `credentials` key.',
        ),
      ),
};

const HARDCODE_KEYS = new Set(['documentId.value', 'phoneNumberId', 'recipientPhoneNumber']);

const noHardcodedTargets: Rule = {
  id: 'no-hardcoded-targets',
  check: (wf) =>
    eachNode(wf, (node) =>
      strings(node.parameters, '')
        .filter(([path]) => HARDCODE_KEYS.has(path.slice(1)))
        .filter(([, v]) => !PLACEHOLDER.test(v) && !v.startsWith('='))
        .map(([path]) =>
          finding(
            'no-hardcoded-targets',
            node.name,
            `${path.slice(1)} is hard-coded; use a REPLACE_WITH_* placeholder.`,
          ),
        ),
    ),
};

const noDefaultNames: Rule = {
  id: 'no-default-node-names',
  check: (wf) =>
    wf.nodes
      .filter((n) => DEFAULT_NAME.test(n.name))
      .map((n) =>
        finding(
          'no-default-node-names',
          n.name,
          'Default node name; name it for what it does, e.g. "Pick today\'s reps".',
        ),
      ),
};

const codeNodesAreGenerated: Rule = {
  id: 'code-nodes-are-generated',
  check: (wf) => [
    ...wf.nodes
      .filter((n) => n.type === 'n8n-nodes-base.code' && !isCodeNodeName(n.name))
      .map((n) =>
        finding(
          'code-nodes-are-generated',
          n.name,
          'Code node with no src/nodes entry; add one to tools/build/code-nodes.ts.',
        ),
      ),
    ...wf.nodes
      .filter((n) => isCodeNodeName(n.name))
      .filter((n) => !String(n.parameters['jsCode']).startsWith('// Generated from src/nodes/'))
      .map((n) =>
        finding(
          'code-nodes-are-generated',
          n.name,
          'jsCode was edited by hand; edit src/nodes and run `npm run build`.',
        ),
      ),
    ...Object.keys(CODE_NODES)
      .filter((name) => !wf.nodes.some((n) => n.name === name))
      .map((name) =>
        finding(
          'code-nodes-are-generated',
          name,
          'Listed in tools/build/code-nodes.ts but not on the canvas.',
        ),
      ),
  ],
};

const outboundRetries: Rule = {
  id: 'outbound-retries',
  check: (wf) => [
    ...wf.nodes
      .filter((n) => IDEMPOTENT.has(n.type))
      .filter(
        (n) => n['retryOnFail'] !== true || typeof n['maxTries'] !== 'number' || n['maxTries'] < 3,
      )
      .map((n) =>
        finding(
          'outbound-retries',
          n.name,
          'Idempotent call without retries; set retryOnFail, maxTries ≥ 3.',
        ),
      ),
    ...wf.nodes
      .filter((n) => SENDS.has(n.type) && n['retryOnFail'] === true)
      .map((n) =>
        finding(
          'outbound-retries',
          n.name,
          'A retried send can reach the person twice; turn retryOnFail off on message sends.',
        ),
      ),
  ],
};

const aiNodesDegrade: Rule = {
  id: 'ai-nodes-degrade',
  check: (wf) =>
    wf.nodes
      .filter((n) => AI_ROOTS.has(n.type))
      .filter(
        (n) =>
          n['onError'] !== 'continueErrorOutput' ||
          (wf.connections[n.name]?.['main']?.[1] ?? []).length === 0,
      )
      .map((n) =>
        finding(
          'ai-nodes-degrade',
          n.name,
          'Model node must use "continue (using error output)" and wire the error output to a fallback.',
        ),
      ),
};

const noDisabledOrPinned: Rule = {
  id: 'no-disabled-or-pinned',
  check: (wf, ctx) => [
    ...wf.nodes
      .filter((n) => n['disabled'] === true)
      .map((n) =>
        finding('no-disabled-or-pinned', n.name, 'Disabled node shipped; delete it or enable it.'),
      ),
    ...Object.keys(wf.pinData ?? {})
      .filter((n) => !Object.hasOwn(ctx.pinnedData, n))
      .map((n) =>
        finding(
          'no-disabled-or-pinned',
          n,
          'Pinned test data shipped; unpin it, or list it in PINNED_DATA with the reason.',
        ),
      ),
  ],
};

const timezoneMatchesCode: Rule = {
  id: 'timezone-matches-code',
  check: (wf) =>
    wf.settings?.['timezone'] === ZONE
      ? []
      : [
          finding(
            'timezone-matches-code',
            null,
            `Workflow timezone must be ${ZONE}, the ZONE in src/shared/config.ts.`,
          ),
        ],
};

export const NODE_RULES: readonly Rule[] = [
  balancedExpressions,
  expressionComplexity,
  noCredentialsExported,
  noHardcodedTargets,
  noDefaultNames,
  codeNodesAreGenerated,
  outboundRetries,
  aiNodesDegrade,
  noDisabledOrPinned,
  timezoneMatchesCode,
];

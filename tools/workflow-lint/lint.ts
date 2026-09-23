/** @file Runs every workflow rule. Known exceptions live here, each with its reason. */
import type { Workflow } from '../build/workflow-file.ts';
import { GRAPH_RULES } from './graph-rules.ts';
import { NODE_RULES } from './node-rules.ts';
import { PROJECT_RULES } from './project-rules.ts';
import { README_RULES } from './readme-rules.ts';
import type { Finding, LintContext } from './rule.ts';

export const RULES = [...GRAPH_RULES, ...NODE_RULES, ...PROJECT_RULES, ...README_RULES];

const COMPLEX_EXPRESSIONS: LintContext['complexExpressions'] = {
  'Is it a text reply?': 'Counts text messages in the raw webhook before the people list is read.',
  'Confirm it landed': 'Builds the confirmation text; pending a move into a Code node.',
  'Tidy the coach reply':
    'Fallback text when the agent returns nothing; pending a move into a Code node.',
  log_the_day: "$fromAI() parameter descriptions are how n8n declares a tool's inputs.",
};

const PINNED_DATA: LintContext['pinnedData'] = {
  'Get the people':
    'Sample People rows so the canvas can be explored without credentials; production runs ignore pin data.',
};

export const lintWorkflow = (workflow: Workflow, readme: string): readonly Finding[] =>
  RULES.flatMap((rule) =>
    rule.check(workflow, {
      readme,
      complexExpressions: COMPLEX_EXPRESSIONS,
      pinnedData: PINNED_DATA,
    }),
  );

export const format = (f: Finding): string =>
  `${f.rule.padEnd(28)} ${(f.node ?? '(workflow)').padEnd(28)} ${f.message}`;

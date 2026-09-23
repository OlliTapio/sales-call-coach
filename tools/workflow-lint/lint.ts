/** @file Runs every workflow rule. Known exceptions live here, each with its reason. */
import type { Workflow } from '../build/workflow-file.ts';
import { GRAPH_RULES } from './graph-rules.ts';
import { NODE_RULES } from './node-rules.ts';
import { PROJECT_RULES } from './project-rules.ts';
import type { Finding, LintContext } from './rule.ts';

export const RULES = [...GRAPH_RULES, ...NODE_RULES, ...PROJECT_RULES];

const COMPLEX_EXPRESSIONS: LintContext['complexExpressions'] = {
  'Tidy the nudge':
    'Fallback text when the model returns nothing; pending a move into a Code node.',
  'Have a number?': 'Blank-is-not-zero test on the merged branch; pending a move into a Code node.',
  'Confirm it landed': 'Builds the confirmation text; pending a move into a Code node.',
  'Is it a text reply?': 'Counts text messages in the raw webhook before the roster is read.',
  "Apply the model's answer":
    'Maps the extractor output to a status; pending a move into a Code node.',
  'Render the chart': 'Assembles the QuickChart request body; field mapping, only long.',
};

export const lintWorkflow = (workflow: Workflow, readme: string): readonly Finding[] =>
  RULES.flatMap((rule) =>
    rule.check(workflow, { readme, complexExpressions: COMPLEX_EXPRESSIONS }),
  );

export const format = (f: Finding): string =>
  `${f.rule.padEnd(28)} ${(f.node ?? '(workflow)').padEnd(28)} ${f.message}`;

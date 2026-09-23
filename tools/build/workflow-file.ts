/** @file Reading and writing `workflow.json` without reformatting it. */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const WORKFLOW_PATH = fileURLToPath(new URL('../../workflow.json', import.meta.url));

export interface WorkflowNode {
  readonly id: string;
  readonly name: string;
  readonly type: string;
  readonly typeVersion: number;
  readonly parameters: Readonly<Record<string, unknown>>;
  readonly [setting: string]: unknown;
}

type Connection = Readonly<{ node: string; type: string; index: number }>;

export interface Workflow {
  readonly id?: unknown;
  readonly name: string;
  readonly nodes: readonly WorkflowNode[];
  readonly connections: Readonly<
    Record<string, Readonly<Record<string, readonly (readonly Connection[])[]>>>
  >;
  readonly settings?: Readonly<Record<string, unknown>>;
  readonly pinData?: Readonly<Record<string, unknown>>;
}

export const serialize = (workflow: Workflow): string => `${JSON.stringify(workflow, null, 2)}\n`;

export const readWorkflowText = (path = WORKFLOW_PATH): string => readFileSync(path, 'utf8');

/** The file is ours; its shape is checked by the workflow linter, not here. */
export const parseWorkflow = (text: string): Workflow => JSON.parse(text) as Workflow;

export const readWorkflow = (path = WORKFLOW_PATH): Workflow =>
  parseWorkflow(readWorkflowText(path));

export const writeWorkflowText = (text: string, path = WORKFLOW_PATH): void => {
  writeFileSync(path, text);
};

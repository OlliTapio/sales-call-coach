/** @file The shape of a workflow lint rule and what it reports. */
import type { Workflow, WorkflowNode } from '../build/workflow-file.ts';

export interface Finding {
  readonly rule: string;
  readonly node: string | null;
  /** Written for the reader who has to fix it: say what is wrong and what to do. */
  readonly message: string;
}

export interface LintContext {
  readonly readme: string;
  /** Node names allowed to break `expression-complexity`, each with the reason it is tolerated. */
  readonly complexExpressions: Readonly<Record<string, string>>;
}

export interface Rule {
  readonly id: string;
  readonly check: (workflow: Workflow, context: LintContext) => readonly Finding[];
}

export const finding = (rule: string, node: string | null, message: string): Finding => ({
  rule,
  node,
  message,
});

export const byName = (workflow: Workflow, name: string): WorkflowNode | undefined =>
  workflow.nodes.find((n) => n.name === name);

export const targetsOf = (workflow: Workflow, name: string, output = 0): readonly string[] =>
  workflow.connections[name]?.['main']?.[output]?.map((c) => c.node) ?? [];

/** Every string in a node's parameters, with a dotted path for messages. */
export const strings = (value: unknown, path: string): readonly (readonly [string, string])[] => {
  if (typeof value === 'string') return [[path, value]];
  if (Array.isArray(value))
    return value.flatMap((v: unknown, i) => strings(v, `${path}[${String(i)}]`));
  if (typeof value === 'object' && value !== null) {
    return Object.entries(value).flatMap(([k, v]) => strings(v, `${path}.${k}`));
  }
  return [];
};

export const eachNode = (
  workflow: Workflow,
  check: (node: WorkflowNode) => readonly Finding[],
): readonly Finding[] => workflow.nodes.flatMap(check);

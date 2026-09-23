/** @file Assertion-style helpers that turn a mismatch into a finding instead of a throw. */
import type { Workflow } from '../build/workflow-file.ts';
import { byName, finding, targetsOf, type Finding } from './rule.ts';

export const same = (a: readonly string[], b: readonly string[]): boolean =>
  JSON.stringify([...a].sort()) === JSON.stringify([...b].sort());

const listOrNothing = (names: readonly string[]): string =>
  names.length === 0 ? 'nothing' : names.join(', ');

/** A dotted path into a node, looking at node settings first and then its parameters. */
export const setting = (wf: Workflow, node: string, path: string): unknown => {
  const n = byName(wf, node);
  const [head = '', ...rest] = path.split('.');
  const start: unknown = n?.[head] ?? n?.parameters[head];
  return rest.reduce<unknown>(
    (value, key) =>
      typeof value === 'object' && value !== null
        ? (value as Readonly<Record<string, unknown>>)[key]
        : undefined,
    start,
  );
};

interface Expectations {
  readonly targets: (
    wf: Workflow,
    node: string,
    output: number,
    want: readonly string[],
  ) => readonly Finding[];
  readonly setting: (wf: Workflow, node: string, path: string, want: unknown) => readonly Finding[];
  readonly that: (ok: boolean, node: string | null, message: string) => readonly Finding[];
}

export const expectations = (rule: string): Expectations => ({
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
  setting: (wf: Workflow, node: string, path: string, want: unknown): readonly Finding[] => {
    const actual = setting(wf, node, path);
    return JSON.stringify(actual) === JSON.stringify(want)
      ? []
      : [
          finding(
            rule,
            node,
            `${path} must be ${JSON.stringify(want)}; it is ${JSON.stringify(actual)}.`,
          ),
        ];
  },
  that: (ok: boolean, node: string | null, message: string): readonly Finding[] =>
    ok ? [] : [finding(rule, node, message)],
});

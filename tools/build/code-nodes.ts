/** @file Which `src/nodes` entry becomes which Code node in `workflow.json`. */

export const CODE_NODES = {
  "Set today's goals": 'set-todays-goals',
  'Match person & parse reply': 'match-person-and-parse-reply',
} as const satisfies Readonly<Record<string, string>>;

export type CodeNodeName = keyof typeof CODE_NODES;

export const isCodeNodeName = (name: string): name is CodeNodeName =>
  Object.hasOwn(CODE_NODES, name);

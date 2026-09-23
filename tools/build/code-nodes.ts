/** @file Which `src/nodes` entry becomes which Code node in `workflow.json`. */

export const CODE_NODES = {
  "Pick today's reps": 'pick-todays-reps',
  'Who still owes a number': 'who-still-owes-a-number',
  'Match rep & parse reply': 'match-rep-and-parse-reply',
  'Aggregate the week': 'aggregate-the-week',
  'Build the chart': 'build-the-chart',
} as const satisfies Readonly<Record<string, string>>;

export type CodeNodeName = keyof typeof CODE_NODES;

export const isCodeNodeName = (name: string): name is CodeNodeName =>
  Object.hasOwn(CODE_NODES, name);

/**
 * @file PostToolUse(Edit|Write|MultiEdit): format and lint the file just written, rebuild
 * workflow.json when a Code node source changed, and hand any leftover errors back to Claude.
 */
import { relative } from 'node:path';
import { node, projectDir, readInput, reply, tail } from './lib.ts';

const file = readInput().tool_input?.file_path;
const path = file === undefined ? '' : relative(projectDir(), file).replaceAll('\\', '/');
const inside = path !== '' && !path.startsWith('..');

const PRETTIER = 'node_modules/prettier/bin/prettier.cjs';
const ESLINT = 'node_modules/eslint/bin/eslint.js';

const problems: string[] = [];

if (inside && /\.(ts|json|md|ya?ml)$/.test(path) && path !== 'workflow.json') {
  node(PRETTIER, ['--write', '--log-level=warn', '--', path]);
}
if (inside && path.endsWith('.ts')) {
  const lint = node(ESLINT, ['--fix', '--max-warnings=0', '--', path]);
  if (!lint.ok) problems.push(`ESLint on ${path}:\n${tail(lint.output, 40)}`);
}
if (path.startsWith('src/')) {
  const build = node('tools/build/build-nodes.ts');
  if (!build.ok) problems.push(`npm run build failed:\n${tail(build.output, 20)}`);
}
if (path === 'workflow.json') {
  const lint = node('tools/workflow-lint/cli.ts');
  if (!lint.ok) problems.push(`Workflow lint:\n${tail(lint.output, 40)}`);
}

if (problems.length > 0) {
  reply({ decision: 'block', reason: `Fix before moving on:\n\n${problems.join('\n\n')}` });
}

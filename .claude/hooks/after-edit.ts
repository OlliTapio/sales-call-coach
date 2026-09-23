/**
 * @file PostToolUse(Edit|Write|MultiEdit): format and lint the file just written, rebuild
 * workflow.json when a Code node source changed, and hand any leftover errors back to Claude.
 */
import { relative } from 'node:path';
import { projectDir, readInput, reply, run, tail } from './lib.ts';

const file = readInput().tool_input?.file_path;
const path = file === undefined ? '' : relative(projectDir(), file).replaceAll('\\', '/');
const quoted = JSON.stringify(path);

const problems: string[] = [];

if (/\.(ts|json|md|ya?ml)$/.test(path) && !path.startsWith('..') && path !== 'workflow.json') {
  run(`npx prettier --write --log-level=warn ${quoted}`);
}
if (path.endsWith('.ts') && !path.startsWith('..')) {
  const lint = run(`npx eslint --fix --max-warnings=0 ${quoted}`);
  if (!lint.ok) problems.push(`ESLint on ${path}:\n${tail(lint.output, 40)}`);
}
if (path.startsWith('src/')) {
  const build = run('npm run -s build');
  if (!build.ok) problems.push(`npm run build failed:\n${tail(build.output, 20)}`);
}
if (path === 'workflow.json') {
  const lint = run('npm run -s lint:workflow');
  if (!lint.ok) problems.push(`Workflow lint:\n${tail(lint.output, 40)}`);
}

if (problems.length > 0) {
  reply({ decision: 'block', reason: `Fix before moving on:\n\n${problems.join('\n\n')}` });
}

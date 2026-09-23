/**
 * @file PreToolUse(Bash): `git commit` runs `check:fast`, `git push` runs the full `check`.
 * A failure blocks the command and hands Claude the output to fix.
 */
import { block, readInput, run, tail } from './lib.ts';

const command = readInput().tool_input?.command ?? '';

/** Only a git invocation at a command position counts, not the words inside a PR body. */
const invocation = (verb: string): string | undefined =>
  new RegExp(`(?:^|[;&|(]|\\n)\\s*git\\s+(?:-\\S+\\s+)*${verb}\\b[^;&|\\n]*`).exec(command)?.[0];

const push = invocation('push');
const commit = invocation('commit');
const isPush = push !== undefined;
const isCommit = commit !== undefined;

if (isPush || isCommit) {
  if (/--no-verify\b|\s-n\b/.test(`${push ?? ''} ${commit ?? ''}`)) {
    block('Do not bypass the checks with --no-verify. Fix what `npm run check` reports instead.');
  }
  const script = isPush ? 'check' : 'check:fast';
  const result = run(`npm run -s ${script}`);
  if (!result.ok) {
    block(
      `Blocked: \`npm run ${script}\` failed, so this ${isPush ? 'push' : 'commit'} would ship broken code.\n` +
        `Fix the problems below, then retry.\n\n${tail(result.output)}`,
    );
  }
}

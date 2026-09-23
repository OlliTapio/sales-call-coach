/**
 * @file PreToolUse(Bash): `git commit` runs `check:fast`, `git push` runs the full `check`.
 * A failure blocks the command and hands Claude the output to fix.
 */
import { block, readInput, run, tail } from './lib.ts';

const command = readInput().tool_input?.command ?? '';
const isPush = /\bgit\s+(?:-\S+\s+)*push\b/.test(command);
const isCommit = /\bgit\s+(?:-\S+\s+)*commit\b/.test(command);

if (isPush || isCommit) {
  if (/--no-verify\b|\s-n\b/.test(command)) {
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

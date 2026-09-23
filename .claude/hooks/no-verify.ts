/**
 * @file PreToolUse(Bash): refuse `git commit`/`git push` with `--no-verify` or `-n`,
 * the one way past the lefthook checks. The checks themselves live in lefthook.yml.
 */
import { block, readInput } from './lib.ts';

const command = readInput().tool_input?.command ?? '';

/** Only a git invocation at a command position counts, not the words inside a PR body. */
const invocations = [
  ...command.matchAll(/(?:^|[;&|(]|\n)\s*git\s+(?:-\S+\s+)*(?:commit|push)\b[^;&|\n]*/g),
].map((m) => m[0]);

if (invocations.some((git) => /\s(?:--no-verify|-n)\b/.test(git))) {
  block('Do not bypass the git hooks with --no-verify. Fix what they report instead.');
}

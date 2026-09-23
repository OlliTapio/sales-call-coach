/**
 * @file PreToolUse(Bash): refuse git commands that would skip the lefthook checks
 * (`--no-verify`, `-n`, `LEFTHOOK=0`, a `core.hooksPath` override). The checks live in lefthook.yml.
 */
import { hookBypass } from './bypass.ts';
import { block, readInput } from './lib.ts';

const reason = hookBypass(readInput().tool_input?.command ?? '');

if (reason !== null) {
  block(`Blocked: ${reason}. Do not bypass the git hooks; fix what they report instead.`);
}

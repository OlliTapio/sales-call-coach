/**
 * @file PreToolUse(Edit|Write|MultiEdit): changes to the rules themselves need a human yes.
 * A human can waive that for one session by putting its id in `.claude/policy-unlock.local`.
 */
import { readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { projectDir, readInput, reply } from './lib.ts';

const unlockedFor = (): string => {
  try {
    return readFileSync(join(projectDir(), '.claude', 'policy-unlock.local'), 'utf8').trim();
  } catch {
    return '';
  }
};

const POLICY_FILES = new Set([
  'tsconfig.json',
  'eslint.config.ts',
  'vitest.config.ts',
  'knip.json',
  'lefthook.yml',
  'package.json',
  '.prettierrc.json',
  '.prettierignore',
  'AGENTS.md',
  'CLAUDE.md',
]);
const POLICY_DIRS = ['.claude/', '.github/', 'tools/eslint-rules/', 'tools/workflow-lint/'];

const input = readInput();
const path = relative(projectDir(), input.tool_input?.file_path ?? '').replaceAll('\\', '/');
const policy = POLICY_FILES.has(path) || POLICY_DIRS.some((dir) => path.startsWith(dir));
const unlocked = input.session_id !== undefined && input.session_id === unlockedFor();

if (policy && !unlocked) {
  reply({
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'ask',
      permissionDecisionReason: `${path} defines the repo's guardrails. Confirm this change is meant to alter the policy.`,
    },
  });
}

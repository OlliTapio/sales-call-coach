/**
 * @file PreToolUse(Edit|Write|MultiEdit): changes to the rules themselves need a human yes.
 * Loosening a lint rule or tsconfig flag is how guardrails quietly erode.
 */
import { relative } from 'node:path';
import { projectDir, readInput, reply } from './lib.ts';

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

const file = readInput().tool_input?.file_path ?? '';
const path = relative(projectDir(), file).replaceAll('\\', '/');

if (POLICY_FILES.has(path) || POLICY_DIRS.some((dir) => path.startsWith(dir))) {
  reply({
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'ask',
      permissionDecisionReason: `${path} defines the repo's guardrails. Confirm this change is meant to alter the policy.`,
    },
  });
}

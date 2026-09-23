/**
 * @file PreToolUse(Edit|Write|MultiEdit): changes to the rules themselves need a human yes.
 * Loosening a lint rule or tsconfig flag is how guardrails quietly erode.
 */
import { relative } from 'node:path';
import { projectDir, readInput, reply } from './lib.ts';

const POLICY = new Set([
  'tsconfig.json',
  'eslint.config.ts',
  'vitest.config.ts',
  'knip.json',
  '.claude/settings.json',
  'tools/workflow-lint/lint.ts',
]);

const file = readInput().tool_input?.file_path ?? '';
const path = relative(projectDir(), file).replaceAll('\\', '/');

if (
  POLICY.has(path) ||
  path.startsWith('.claude/hooks/') ||
  path.startsWith('tools/eslint-rules/')
) {
  reply({
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'ask',
      permissionDecisionReason: `${path} defines the repo's guardrails. Confirm this change is meant to alter the policy.`,
    },
  });
}

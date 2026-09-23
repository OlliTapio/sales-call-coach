/** @file Shared plumbing for the Claude Code hooks: read the event, run a tool, reply. */
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export interface HookInput {
  readonly tool_name?: string;
  readonly tool_input?: { readonly command?: string; readonly file_path?: string };
  readonly stop_hook_active?: boolean;
  readonly session_id?: string;
  readonly cwd?: string;
}

export const readInput = (): HookInput => {
  const text = readFileSync(0, 'utf8');
  return text.trim() === '' ? {} : (JSON.parse(text) as HookInput);
};

export interface Run {
  readonly ok: boolean;
  readonly output: string;
}

export const projectDir = (): string => process.env['CLAUDE_PROJECT_DIR'] ?? process.cwd();

/** No shell: arguments (such as an edited file's path) are never parsed as shell syntax. */
export const run = (file: string, args: readonly string[]): Run => {
  const result = spawnSync(file, args, {
    cwd: projectDir(),
    shell: false,
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
  });
  const output = `${result.stdout}${result.stderr}${result.error?.message ?? ''}`;
  return { ok: result.status === 0, output: output.trim() };
};

/** A project script run by this same Node, e.g. `node('node_modules/eslint/bin/eslint.js', …)`. */
export const node = (script: string, args: readonly string[] = []): Run =>
  run(process.execPath, [join(projectDir(), script), ...args]);

/** A shell is needed for npm's `.cmd` shim on Windows; the name is a fixed literal, never input. */
export const npmScript = (name: 'check' | 'check:fast'): Run => {
  const result = spawnSync(`npm run -s ${name}`, {
    cwd: projectDir(),
    shell: true,
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
  });
  return { ok: result.status === 0, output: `${result.stdout}${result.stderr}`.trim() };
};

export const tail = (text: string, lines = 60): string => text.split('\n').slice(-lines).join('\n');

/** Exit 2 blocks the tool call (PreToolUse) and feeds stderr back to Claude. */
export const block = (reason: string): never => {
  process.stderr.write(`${reason}\n`);
  process.exit(2);
};

export const reply = (payload: Readonly<Record<string, unknown>>): void => {
  process.stdout.write(JSON.stringify(payload));
};

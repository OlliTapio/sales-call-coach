/** @file Shared plumbing for the Claude Code hooks: read the event, run a command, reply. */
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

export interface HookInput {
  readonly tool_name?: string;
  readonly tool_input?: { readonly command?: string; readonly file_path?: string };
  readonly stop_hook_active?: boolean;
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

/** `shell: true` so `npm`/`npx` resolve to their `.cmd` shims on Windows. */
export const run = (command: string): Run => {
  const result = spawnSync(command, {
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

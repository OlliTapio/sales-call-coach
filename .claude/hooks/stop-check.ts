/**
 * @file Stop: if the working tree changed, run `check:fast` before Claude may finish.
 * `stop_hook_active` means we already blocked once; let it stop rather than loop.
 */
import { readInput, reply, run, tail } from './lib.ts';

const input = readInput();
const dirty = run('git status --porcelain').output !== '';

if (input.stop_hook_active !== true && dirty) {
  const result = run('npm run -s check:fast');
  if (!result.ok) {
    reply({
      decision: 'block',
      reason: `\`npm run check:fast\` fails on the current changes. Fix it before finishing:\n\n${tail(result.output)}`,
    });
  }
}

import { describe, expect, test } from 'vitest';
import { hookBypass } from '../../.claude/hooks/bypass.ts';

describe('hookBypass', () => {
  test.each([
    'git commit --no-verify -m x',
    'git commit -n -m x',
    'git commit -nm "x"',
    'git commit -anm "x"',
    'git -C . commit -n',
    'git -c core.hooksPath=/dev/null commit -m x',
    'LEFTHOOK=0 git commit -m x',
    'LEFTHOOK_EXCLUDE=eslint git commit -m x',
    'git push --no-verify',
    'npm test && git commit --no-verify -m x',
    'cd repo; git push --no-verify origin main',
    'git -c "core.hooksPath=/dev/null" commit -m x',
    'env LEFTHOOK=0 git commit -m x',
    'export LEFTHOOK=0; git commit -m x',
    'command git commit -n -m x',
    'git.exe commit --no-verify -m x',
    '/usr/bin/git commit -n',
    'git config core.hooksPath /dev/null',
    'git commit --no-veri -m x',
    'GIT_CONFIG_COUNT=1 GIT_CONFIG_KEY_0=core.hooksPath git commit -m x',
  ])('blocks %j', (command) => {
    expect(hookBypass(command)).not.toBeNull();
  });

  test.each([
    'git commit -m "x"',
    'git commit -m "support -n flag"',
    'git commit -mn',
    'git push -n origin main',
    'git push -u origin main',
    'git log -n 5',
    'ls -la',
    'echo "git commit --no-verify"',
    "gh pr create --body-file - <<'EOF'\n- `git commit --no-verify` is refused\nEOF",
    'gh pr create --body "cd x && git commit --no-verify"',
    'LEFTHOOK_VERBOSE=1 git commit -m x',
    'git commit -m "-n"',
    'git commit -m "docs: explain core.hooksPath"',
    'git commit --no-edit',
    'echo "a; git commit -n"',
    'git config user.name x',
    '',
  ])('allows %j', (command) => {
    expect(hookBypass(command)).toBeNull();
  });
});

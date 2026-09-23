/**
 * @file Does a Bash command skip the git hooks? Pure, so it can be table-tested.
 * Best-effort by design: CI running `npm run check` is the backstop.
 */

const HEREDOC = /<<-?\s*(['"]?)(\w+)\1[^\n]*\n[\s\S]*?\n\s*\2(?=\n|$)/g;
const QUOTED = /'([^']*)'|"((?:\\.|[^"\\])*)"/g;
const SEPARATOR = /&&|\|\||[;|&\n()]/;
const ASSIGNMENT = /^[A-Za-z_]\w*=/;
const WRAPPERS = new Set(['env', 'command', 'exec', 'nice', 'nohup', 'time']);
const GIT = /(?:^|[\\/])git(?:\.exe)?$/i;
/** Options of `git` itself that take a value as the next word. */
const GIT_VALUE_OPTIONS = new Set(['-C', '-c', '--git-dir', '--work-tree', '--namespace']);
/** Short `git commit` options whose value follows, so a later letter is not a flag. */
const COMMIT_VALUE_LETTERS = new Set(['m', 'F', 'C', 'c', 't', 'S', 'u']);

/** Heredoc bodies go; quoted text stays but becomes one word, so it cannot pose as a flag. */
const neutralise = (command: string): string =>
  command
    .replace(HEREDOC, ' <<HEREDOC ')
    .replace(
      QUOTED,
      (_, single?: string, double?: string) =>
        `Q${(single ?? double ?? '').replace(/[\s;&|()]/g, '_')}`,
    );

const envBypass = (assignments: readonly string[]): string | null => {
  if (
    assignments.some((w) => /^LEFTHOOK=Q?(0|false)$/i.test(w) || w.startsWith('LEFTHOOK_EXCLUDE='))
  ) {
    return 'LEFTHOOK=0 disables the hooks';
  }
  return assignments.some((w) => w.startsWith('GIT_CONFIG'))
    ? 'GIT_CONFIG_* can override core.hooksPath'
    : null;
};

const isNoVerify = (arg: string): boolean => arg.length >= 6 && '--no-verify'.startsWith(arg);

const commitSkipsHooks = (args: readonly string[]): boolean =>
  args.some((arg, i) => {
    if (isNoVerify(arg)) return true;
    if (!/^-[A-Za-z]/.test(arg) || /^-[mFCctSu]$/.test(args[i - 1] ?? '')) return false;
    const letters = arg.slice(1).match(/[A-Za-z]/g) ?? [];
    const cut = letters.findIndex((l) => COMMIT_VALUE_LETTERS.has(l));
    return (cut === -1 ? letters : letters.slice(0, cut)).includes('n');
  });

const verbBypass = (verb: string | undefined, args: readonly string[]): string | null => {
  if (verb === 'config' && args.some((w) => /^Q?core\.hooksPath$/i.test(w))) {
    return 'changing core.hooksPath skips the hooks';
  }
  if (verb === 'commit' && commitSkipsHooks(args)) return '--no-verify/-n skips the hooks';
  if (verb === 'push' && args.some(isNoVerify)) return '--no-verify skips the hooks';
  return null;
};

const gitBypass = (words: readonly string[]): string | null => {
  const rest = words.slice(1);
  const verbAt = rest.findIndex(
    (w, i) => !w.startsWith('-') && !GIT_VALUE_OPTIONS.has(rest[i - 1] ?? ''),
  );
  const globals = verbAt === -1 ? rest : rest.slice(0, verbAt);
  const verb = verbAt === -1 ? undefined : rest[verbAt];
  const args = verbAt === -1 ? [] : rest.slice(verbAt + 1);
  if (globals.some((w) => /core\.hooksPath/i.test(w)))
    return 'overriding core.hooksPath skips the hooks';
  return verbBypass(verb, args);
};

const segmentBypass = (segment: string): string | null => {
  const words = segment
    .trim()
    .split(/\s+/)
    .filter((w) => w !== '');
  const unwrapped = words.filter(
    (w, i) =>
      !(WRAPPERS.has(w) && words.slice(0, i).every((p) => WRAPPERS.has(p) || ASSIGNMENT.test(p))),
  );
  if (unwrapped[0] === 'export') return envBypass(unwrapped.slice(1));
  const start = unwrapped.findIndex((w) => !ASSIGNMENT.test(w));
  const program = unwrapped.slice(start);
  if (start === -1 || !GIT.test(program[0] ?? '')) return null;
  return envBypass(unwrapped.slice(0, start)) ?? gitBypass(program);
};

/** The reason a command would skip lefthook, or null when it would not. */
export const hookBypass = (command: string): string | null =>
  neutralise(command)
    .split(SEPARATOR)
    .map(segmentBypass)
    .find((reason) => reason !== null) ?? null;

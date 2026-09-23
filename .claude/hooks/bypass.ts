/** @file Does a Bash command skip the git hooks? Pure, so it can be table-tested. */

const HEREDOC = /<<-?\s*(['"]?)(\w+)\1[^\n]*\n[\s\S]*?\n\s*\2(?=\n|$)/g;
const QUOTED = /'[^']*'|"(?:\\.|[^"\\])*"/g;
const SEPARATOR = /&&|\|\||[;|&\n()]/;
const ASSIGNMENT = /^[A-Za-z_]\w*=/;
/** Options of `git` itself that take a value as the next word. */
const GIT_VALUE_OPTIONS = new Set(['-C', '-c', '--git-dir', '--work-tree', '--namespace']);
/** Short `git commit` options whose value follows, so a later letter is not a flag. */
const COMMIT_VALUE_LETTERS = new Set(['m', 'F', 'C', 'c', 't', 'S', 'u']);

/** Replaces quoted text and heredoc bodies with a placeholder, so their contents are inert. */
const neutralise = (command: string): string =>
  command.replace(HEREDOC, ' <<HEREDOC ').replace(QUOTED, 'QUOTED');

const envBypass = (words: readonly string[]): string | null => {
  const env = words.filter((w) => ASSIGNMENT.test(w));
  return env.some((w) => /^LEFTHOOK=(0|false)$/i.test(w) || w.startsWith('LEFTHOOK_EXCLUDE='))
    ? 'LEFTHOOK=0 disables the hooks'
    : null;
};

const commitSkipsHooks = (args: readonly string[]): boolean =>
  args.some((arg) => {
    if (arg === '--no-verify') return true;
    if (!/^-[A-Za-z]/.test(arg)) return false;
    const letters = arg.slice(1).match(/[A-Za-z]/g) ?? [];
    const cut = letters.findIndex((l) => COMMIT_VALUE_LETTERS.has(l));
    return (cut === -1 ? letters : letters.slice(0, cut)).includes('n');
  });

const gitBypass = (words: readonly string[]): string | null => {
  const rest = words.slice(1);
  const options = rest.findIndex(
    (w, i) => !w.startsWith('-') && !GIT_VALUE_OPTIONS.has(rest[i - 1] ?? ''),
  );
  const globals = options === -1 ? rest : rest.slice(0, options);
  const verb = options === -1 ? undefined : rest[options];
  const args = options === -1 ? [] : rest.slice(options + 1);
  if (globals.some((w) => /core\.hooksPath/i.test(w)))
    return 'overriding core.hooksPath skips the hooks';
  if (verb === 'commit' && commitSkipsHooks(args)) return '--no-verify/-n skips the hooks';
  if (verb === 'push' && args.includes('--no-verify')) return '--no-verify skips the hooks';
  return null;
};

/** The reason a command would skip lefthook, or null when it would not. */
export const hookBypass = (command: string): string | null => {
  const segments = neutralise(command).split(SEPARATOR);
  const reasons = segments.map((segment) => {
    const words = segment
      .trim()
      .split(/\s+/)
      .filter((w) => w !== '');
    const start = words.findIndex((w) => !ASSIGNMENT.test(w));
    const program = words.slice(start);
    if (start === -1 || program[0] !== 'git') return null;
    return envBypass(words.slice(0, start)) ?? gitBypass(program);
  });
  return reasons.find((r) => r !== null) ?? null;
};

# 4. Deterministic guardrails for AI-assisted work

Date: 2026-09-23 · Status: accepted

## Context

This repo is mostly changed by coding agents. Agents follow written rules unevenly;
they reliably respond to a failing check with a clear message. Anthropic's Claude Code
guidance says the same: give the agent a way to verify its work, and make must-follow
rules into hooks, since CLAUDE.md is advisory and hooks are enforced.

## Decision

- One gate, `npm run check`, defines "done": format, types, lint, workflow lint,
  build drift, tests with coverage, knip. `check:fast` skips formatting, coverage and knip.
- Lint messages say how to fix the problem, not just what is wrong.
- Git hooks come from [lefthook](https://github.com/evilmartians/lefthook) (`lefthook.yml`,
  installed by `npm install`), and apply to people and agents alike. Pre-commit runs
  Prettier and ESLint on staged files, the drift check and the workflow lint. Pre-push
  runs `check`. A failing hook's output reaches the agent through its Bash result, so no
  agent-specific commit gate is needed. CI runs `check` on every PR.
- Claude Code hooks (`.claude/settings.json`, scripts in `.claude/hooks/`) cover what git
  hooks cannot:
  - **PreToolUse Bash** `no-verify`: refuses `git commit`/`git push` with `--no-verify`,
    the one way past lefthook.
  - **PreToolUse Edit/Write** `guard-policy`: editing tsconfig, the ESLint config, the
    lint rules, coverage settings or the hooks asks the human first.
  - **PostToolUse Edit/Write** `after-edit`: Prettier and `eslint --fix` on the file;
    rebuilds `workflow.json` when `src/` changes; lints the workflow when it changes.
    Leftover errors go back to the agent at once.
  - **Stop** `stop-check`: with uncommitted changes, `check:fast` must pass before the
    session ends. `stop_hook_active` prevents a loop.
- `AGENTS.md` is the cross-tool instruction file, and `CLAUDE.md` imports it. It stays
  short, holding what an agent cannot learn from the code.

## Consequences

Commits are slower by a few seconds. A broken state can still be created mid-task, but
it cannot be committed, pushed or left behind at the end of a session.

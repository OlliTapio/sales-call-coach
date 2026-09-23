# Agent instructions

n8n workflow (`workflow.json`) whose five Code-node bodies are compiled from strict
TypeScript in `src/`. Read `docs/ARCHITECTURE.md` before changing structure.

## Commands

|                             |                                                                           |
| --------------------------- | ------------------------------------------------------------------------- |
| `npm run check`             | **Definition of done.** Everything CI runs.                               |
| `npm run check:fast`        | Types, lint, workflow lint, drift, tests. Run it often.                   |
| `npm run build`             | Compile `src/nodes` into `workflow.json`. Run it after any `src/` change. |
| `npx vitest run test/nodes` | The behaviour tests, run against the source and the built bodies.         |
| `npm run lint:workflow`     | n8n best-practice and project-invariant checks on `workflow.json`.        |

## Rules

- Never edit `jsCode` in `workflow.json`. Edit `src/`, then run `npm run build`.
- Business rules go in `src/domain`, presentation in `src/views`, and raw-JSON parsing in
  `src/adapters`. `src/nodes` only wires them together. The linter enforces the layers;
  when it complains, move the code, don't suppress the rule.
- The core is functional: `const`, `map`/`filter`/`reduce`, return values instead of
  throwing. `null` or a union type signals failure.
- No runtime dependencies in `src/`. Luxon is `import type` only; n8n injects `DateTime`.
- Write the failing test first, in `test/nodes` (behaviour) or `test/domain` (edges).
- Comments: one-line "why", at most 2 lines inside a function. Longer reasoning goes in
  the README design notes or a new ADR in `docs/adr/`.
- Never loosen `tsconfig.json`, `eslint.config.ts`, coverage thresholds or hooks to make a
  check pass. Fix the code, or ask.
- A new n8n expression that needs logic becomes a Code node. `COMPLEX_EXPRESSIONS` in
  `tools/workflow-lint/lint.ts` lists existing debt; don't add to it without a reason.
- Canvas changes happen in n8n. Export over `workflow.json`, then run `npm run check`.
  README node counts are checked against the canvas.

## Environment

- Node ≥ 24.2 (see `.nvmrc`). `tools/` and `.claude/hooks/` are `.ts` run directly by Node.
- Windows and Linux both work. Line endings are LF (`.gitattributes`).
- Git hooks (lefthook, `lefthook.yml`) check staged files on commit and run `check` on push.
  Never pass `--no-verify`; a Claude hook refuses it.
- Hooks in `.claude/settings.json` lint after each edit and run `check:fast` before a
  session ends. Their output is the fix list.

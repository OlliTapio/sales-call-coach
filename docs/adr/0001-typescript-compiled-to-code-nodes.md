# 1. Write Code nodes in TypeScript, compile them into workflow.json

Date: 2026-09-23 · Status: accepted

## Context

n8n Code nodes run JavaScript only. A body is a function body with `$input`, `$now`,
`$()` and `DateTime` as globals and a top-level `return`. Previously the bodies lived as
`code/*.js` and were spliced into `workflow.json` verbatim. There were no types, and the
same constants and parsing were copied into several files.

## Decision

- Sources are strict TypeScript in `src/`. Each `src/nodes/<entry>.ts` exports `main()`.
- `npm run build` bundles each entry with esbuild into an unminified ESM script and
  replaces the trailing export with `return main();`. The result is spliced into the
  node's `jsCode`.
- `workflow.json` stays committed, because it is the product people import. The build is
  deterministic, and `npm run build -- --check` fails when the file is stale.
- Tests run both the TS source and the compiled body.
- TypeScript is pinned to 6.0.x: typescript-eslint 8.70 supports TS below 6.1, and TS 7
  is not supported yet. Tooling scripts are `.ts` run by Node's built-in type stripping
  (Node ≥ 24.2), so they use erasable syntax only.

## Consequences

- One source of truth per constant (`ZONE`, the rollover hour, the default target).
- The compiled body has no comments beyond esbuild's file markers and our banner.
  Readers who open a node in n8n are pointed to the source.
- `src/` cannot have runtime dependencies. Anything bundled would bloat every node.

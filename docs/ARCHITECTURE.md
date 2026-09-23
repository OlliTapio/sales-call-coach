# Architecture

The product is `workflow.json`, an n8n workflow. Most of it is n8n nodes on a canvas;
five of those nodes are **Code nodes**, and their bodies are compiled from `src/`.
Everything else in the repo exists to keep those two halves correct and in step.

```
workflow.json            orchestration: triggers, Sheets, WhatsApp, LLM, routing
  └─ Code node bodies  ← npm run build ← src/nodes/*.ts
```

## Layers

`src/` is a layered, functional-core / imperative-shell design. Dependencies point
down only. ESLint enforces every arrow in this diagram (`eslint.config.ts`).

```
src/nodes/      Controllers. One file per Code node, exporting main(). Reads
   │            $input / $() via adapters, calls domain + views, returns items.
   │
   ├─ src/n8n/      The n8n boundary: ambient global types, the Item shape, localNow().
   ├─ src/adapters/ Raw JSON (Sheets rows, WhatsApp webhooks) → domain types. Total
   │                functions: bad input becomes null or a default, never a throw.
   ├─ src/views/    Presentation: Chart.js config, captions, prompt context lines.
   └─ src/domain/   Business rules: goal rows, reply parsing, nudge windows, weekly
         │          aggregation. Pure; time arrives as an Instant parameter.
         └─ src/shared/  Config constants, coercions, branded Phone, collection helpers.
```

| Layer      | May import                 | May read n8n globals | Style                 |
| ---------- | -------------------------- | -------------------- | --------------------- |
| `shared`   | nothing in `src/`          | no                   | functional (enforced) |
| `domain`   | `shared`                   | no                   | functional (enforced) |
| `views`    | `domain` (types), `shared` | no                   | functional (enforced) |
| `adapters` | `domain`, `shared`         | `DateTime` only      | functional (enforced) |
| `n8n`      | `shared`                   | yes                  | imperative shell      |
| `nodes`    | all of `src/`              | yes                  | imperative shell      |

Also, for all of `src/`:

- no runtime imports at all. Luxon is `import type` only, because n8n injects
  `DateTime`. Node built-ins are banned: the Code-node sandbox has none.
- no imports from `tools/` or `test/`.

## Rules, and what enforces them

| Rule                                                                           | Enforced by                                                                                |
| ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------ |
| Layer imports and globals, as above                                            | ESLint `no-restricted-imports` / `no-restricted-globals` per directory                     |
| Functional core: no `let`, loops, mutation, `throw`, classes                   | `eslint-plugin-functional` on shared/domain/views/adapters                                 |
| Strictest TypeScript: no `any`, no casts on external data, exhaustive switches | `tsconfig.json` + typescript-eslint `strictTypeChecked`                                    |
| External data enters as `unknown` and is parsed in an adapter                  | `$input` is typed `Record<string, unknown>`; `consistent-type-assertions: never` in `src/` |
| Short comments: ≤2 lines in a function, ≤5 per block, ≤20% of a file           | `local/comment-density` (`tools/eslint-rules/`)                                            |
| Rule suppressions must say why                                                 | eslint-comments `require-description`, unused directives are errors                        |
| `workflow.json` Code nodes are build output, never hand-edited                 | `npm run build -- --check`, `code-nodes-are-generated`                                     |
| Expressions map fields; logic lives in Code nodes                              | `expression-complexity` (listed exceptions carry reasons)                                  |
| Outbound nodes retry; model nodes degrade to a fallback                        | `outbound-retries`, `ai-nodes-degrade`                                                     |
| No credentials, pinned data, disabled nodes or hard-coded ids ship             | workflow lint                                                                              |
| README claims match the canvas                                                 | `readme-counts-match-canvas`, `placeholders-match-readme`                                  |
| Sheet rows match `sheets/*.csv` headers                                        | `test/nodes/sheet-contract.test.ts`                                                        |
| No dead exports, files or dependencies                                         | knip                                                                                       |

All of it runs as `npm run check`: in CI, in the git pre-push hook, and in the
Claude Code hooks (see `AGENTS.md`).

## How a Code node is built

`tools/build/bundle.ts` bundles `src/nodes/<entry>.ts` with esbuild as ESM, unminified,
then swaps the trailing `export { main }` for `return main();`. The result is a flat,
readable function body, the shape n8n expects, with a banner naming its source. The
build fails if the bundle still imports anything or grows past 20 KB, because either
means a runtime dependency leaked in.

`tools/build/code-nodes.ts` maps node names to entries. Adding a Code node means
adding it there and in `src/nodes/`; the linter fails otherwise.

## Testing

- `test/nodes/`: every behaviour test runs twice, against the TypeScript source
  (for coverage) and against the compiled `jsCode` in `workflow.json`, with the same
  globals n8n provides. The second run is the proof that the shipped artifact works.
- `test/domain/`: edge cases for the pure layers.
- `test/workflow-lint/`: every rule has a mutation that must trip it.
- Coverage gate: `src/` at 100% lines, 90% branches.

## Adding a feature: the path

1. Put the rule in `domain/` (or presentation in `views/`) as a pure function, test first.
2. If it reads a new sheet column or webhook field, extend the adapter and `model.ts`.
3. Wire it in the node's controller in `src/nodes/`.
4. Run `npm run build`, then `npm run check`.
5. Canvas change? Edit in n8n, export over `workflow.json`, run `npm run check`.

Decisions behind this layout are in [`docs/adr/`](adr/).

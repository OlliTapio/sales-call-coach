# 2. Layered architecture with a functional core

Date: 2026-09-23 · Status: accepted

## Context

Each Code node mixed n8n I/O, business rules and presentation in one file. Most of the
bugs this workflow can have are rule bugs: a blank read as zero, a reply after midnight
put on the wrong day, a sentence read as a call count. Those rules deserve to be pure and tested alone.

## Decision

- Controllers (`src/nodes`) sit over adapters, views and domain, with `shared` at the
  bottom. This is MVC without the ceremony: `views` is the V, `nodes` the C, and
  `domain` plus `adapters` the M. The dependency rules are ESLint rules, not conventions.
- The core (`shared`, `domain`, `views`, `adapters`) is functional and enforced with
  `eslint-plugin-functional`: no `let`, no loops, no mutation, no `throw`, no classes.
  The shell (`nodes`, `n8n`) may be imperative.
- Failure in the core is a value (`null`, a discriminated union such as `ReplyParse`),
  not an exception. We use no fp-ts or Effect: they would be bundled into every Code
  node, and plain unions cover what this codebase needs.
- Time is a parameter. Only `src/n8n/clock.ts` reads `$now`.

## Consequences

- Domain functions are tested with plain data and a fixed `Instant`.
- Some code is a little longer than the imperative version (a filter per rep instead of
  one mutating pass). At roster sizes in the tens this costs nothing.

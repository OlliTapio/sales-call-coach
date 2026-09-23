# 3. Short comments in code, rationale in docs

Date: 2026-09-23 · Status: accepted

## Context

The original Code nodes carried long explanatory comments, often repeating the README's
design notes. Long comments drift from the code, cost context for every reader (human
or agent), and tend to multiply when code is written with AI assistance.

## Decision

`local/comment-density` (in `tools/eslint-rules/`) fails the lint when:

- a comment run inside a function exceeds **2** lines,
- any other comment block (file header, JSDoc) exceeds **5** content lines,
- comments make up more than **20%** of a file's non-blank lines (files of 20+ lines).

Directives (`eslint-disable … -- reason`, `@ts-expect-error`) are not counted. Rationale
goes in the README design notes, `docs/ARCHITECTURE.md` or an ADR, and the code keeps
a one-line "why" that points there.

## Consequences

Names and types carry more of the meaning. The limits are rule options, so tune them in
`eslint.config.ts`. Doing so is a policy change and needs a human yes (see the
`guard-policy` hook).

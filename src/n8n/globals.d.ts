/**
 * @file Ambient types for the globals n8n injects into a Code node.
 * Only `src/nodes` may reference them; ESLint enforces that.
 */
import type { DateTime as LuxonDateTime } from 'luxon';

type RawJson = Readonly<Record<string, unknown>>;

interface NodeOutput {
  all(): readonly { readonly json: RawJson }[];
}

declare global {
  const $input: NodeOutput;
  const $now: LuxonDateTime<true>;
  function $(nodeName: string): NodeOutput;
  const DateTime: typeof LuxonDateTime;
}

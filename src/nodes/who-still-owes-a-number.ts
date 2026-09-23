/**
 * @file Code node "Who still owes a number": Log rows in, one nudge per rep who has not
 * reported today. The extra fields route the send and feed the prompt; they are not columns.
 */
import { parseLogEntry } from '../adapters/sheets.ts';
import type { LogRow } from '../domain/model.ts';
import { pendingNudges } from '../domain/nudge.ts';
import { toItems, type Item } from '../n8n/item.ts';
import { isPresent } from '../shared/collections.ts';
import { localNow } from '../n8n/clock.ts';
import { nudgeContextLine } from '../views/nudge-context.ts';

interface NudgeItem extends LogRow {
  readonly window_open: boolean;
  readonly hours_since_last_reply: number | null;
  readonly context: string;
}

export const main = (): Item<NudgeItem>[] => {
  const entries = $input
    .all()
    .map((item) => parseLogEntry(item.json))
    .filter(isPresent);
  const nudges = pendingNudges(entries, localNow());
  return toItems(
    nudges.map((nudge) => ({
      ...nudge.row,
      window_open: nudge.windowOpen,
      hours_since_last_reply: nudge.hoursSinceLastReply,
      context: nudgeContextLine(nudge.recent),
    })),
  );
};

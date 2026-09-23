/** @file Code node "Aggregate the week": every Log row in, one Weekly row per rep out. */
import { parseLogEntry } from '../adapters/sheets.ts';
import type { WeeklyRow } from '../domain/model.ts';
import { aggregateWeek } from '../domain/week.ts';
import { toItems, type Item } from '../n8n/item.ts';
import { isPresent } from '../shared/collections.ts';
import { localNow } from '../n8n/clock.ts';

export const main = (): Item<WeeklyRow>[] => {
  const entries = $input
    .all()
    .map((item) => parseLogEntry(item.json))
    .filter(isPresent);
  return toItems(aggregateWeek(entries, localNow()));
};

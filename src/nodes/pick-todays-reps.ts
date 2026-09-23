/** @file Code node "Pick today's reps": Roster rows in, one goal row per active rep out. */
import { parseRep } from '../adapters/sheets.ts';
import { goalRows } from '../domain/goal.ts';
import type { LogRow } from '../domain/model.ts';
import { toItems, type Item } from '../n8n/item.ts';
import { isPresent } from '../shared/collections.ts';
import { localNow } from '../n8n/clock.ts';

export const main = (): Item<LogRow>[] => {
  const reps = $input
    .all()
    .map((item) => parseRep(item.json))
    .filter(isPresent);
  return toItems(goalRows(reps, localNow()));
};

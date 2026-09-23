/** @file Code node "Set today's goals": People rows in, one morning message per active person. */
import { parsePerson } from '../adapters/sheets.ts';
import { goalRow } from '../domain/goal.ts';
import type { DayRow } from '../domain/model.ts';
import { localNow } from '../n8n/clock.ts';
import { toItems, type Item } from '../n8n/item.ts';
import { isPresent } from '../shared/collections.ts';
import { morningMessage } from '../views/morning-message.ts';

interface GoalItem extends DayRow {
  readonly message: string;
}

export const main = (): Item<GoalItem>[] => {
  const now = localNow();
  const rows = $input
    .all()
    .map((item) => parsePerson(item.json))
    .filter(isPresent)
    .filter((person) => person.active)
    .map((person) => goalRow(person, now));
  return toItems(rows.map((row) => ({ ...row, message: morningMessage(row) })));
};

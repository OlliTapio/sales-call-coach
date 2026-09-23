/** @file The morning Telegram text: two numbers and one focus, nothing to read past breakfast. */
import type { DayRow } from '../domain/model.ts';

const firstName = (name: string): string => name.split(/\s+/)[0] ?? name;

/** Sheet cells are free text; a stray `*` or `_` would unbalance the node's Markdown. */
const withoutMarkdown = (text: string): string => text.replace(/[*_[\]`]/g, '');

/** No focus set still gets the numbers; the reminder is the optional part. */
export const morningMessage = (row: DayRow): string => {
  const calls = String(row.calls_target);
  const hours = String(row.hours_cap);
  const reminder = row.focus === '' ? '' : `\n\nFocus: *${withoutMarkdown(row.focus)}*.`;
  return (
    `Morning ${withoutMarkdown(firstName(row.name))}. Today: *${calls} calls*, and stay under *${hours}h* on them.` +
    `${reminder}\n\nTell me how it went tonight — "${calls}/${hours}" is enough, or just talk to me.`
  );
};

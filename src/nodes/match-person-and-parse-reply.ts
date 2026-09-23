/**
 * @file Code node "Match person & parse reply": the people list arrives on the input, the
 * messages come from the trigger. One row per text message from someone being monitored.
 */
import { parsePerson } from '../adapters/sheets.ts';
import { parseInboundTexts } from '../adapters/telegram.ts';
import { replyRows, type ReplyRow } from '../domain/reply.ts';
import { localNow } from '../n8n/clock.ts';
import { toItems, type Item } from '../n8n/item.ts';
import { isPresent } from '../shared/collections.ts';

export const main = (): Item<ReplyRow>[] => {
  const now = localNow();
  const people = $input
    .all()
    .map((item) => parsePerson(item.json))
    .filter(isPresent);
  const messages = $('Telegram Trigger')
    .all()
    .flatMap((event) => parseInboundTexts(event.json, now));
  return toItems(replyRows(people, messages));
};

/**
 * @file Code node "Match rep & parse reply": the roster arrives on the input, the messages
 * come from the trigger. One row per text message from someone on the roster.
 */
import { parseRep } from '../adapters/sheets.ts';
import { parseInboundTexts } from '../adapters/whatsapp.ts';
import { replyRows, type ReplyRow } from '../domain/reply.ts';
import { toItems, type Item } from '../n8n/item.ts';
import { isPresent } from '../shared/collections.ts';
import { localNow } from '../n8n/clock.ts';

export const main = (): Item<ReplyRow>[] => {
  const now = localNow();
  const roster = $input
    .all()
    .map((item) => parseRep(item.json))
    .filter(isPresent);
  const messages = $('WhatsApp Trigger')
    .all()
    .flatMap((event) => parseInboundTexts(event.json, now));
  return toItems(replyRows(roster, messages));
};

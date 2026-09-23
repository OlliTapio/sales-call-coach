/** @file A Telegram Bot API update to the text message it carries, if it carries one. */
import type { InboundText } from '../domain/model.ts';
import { toChatId, toText, toTrimmed } from '../shared/coerce.ts';
import { ZONE } from '../shared/config.ts';
import type { Instant } from '../shared/time.ts';

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const receivedAt = (date: unknown, fallback: Instant): Instant => {
  const seconds = Number(toText(date));
  const at = DateTime.fromSeconds(seconds).setZone(ZONE);
  return Number.isFinite(seconds) && seconds > 0 && at.isValid ? at : fallback;
};

/**
 * One update carries at most one message, unlike WhatsApp's batched array, but the
 * signature stays a list so the node controller flat-maps either the same way.
 */
export const parseInboundTexts = (
  event: Readonly<Record<string, unknown>>,
  now: Instant,
): readonly InboundText[] => {
  const message = event['message'];
  if (!isRecord(message)) return [];
  // Photos, stickers and voice notes have no `text`, and lane 2 has nothing to read.
  const body = message['text'];
  if (typeof body !== 'string') return [];
  const chat = message['chat'];
  const chatId = toChatId(isRecord(chat) ? chat['id'] : null);
  if (chatId === null) return [];
  return [
    {
      id: toText(message['message_id']),
      chatId,
      body: toTrimmed(body),
      receivedAt: receivedAt(message['date'], now),
    },
  ];
};

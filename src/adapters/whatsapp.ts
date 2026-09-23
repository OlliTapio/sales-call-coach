/** @file A WhatsApp Cloud API webhook event to the text messages it carries. */
import type { InboundText } from '../domain/model.ts';
import { isPresent } from '../shared/collections.ts';
import { toPhone, toText, toTrimmed } from '../shared/coerce.ts';
import { ZONE } from '../shared/config.ts';
import type { Instant } from '../shared/time.ts';

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const receivedAt = (timestamp: unknown, fallback: Instant): Instant => {
  const seconds = Number(toText(timestamp));
  const at = DateTime.fromSeconds(seconds).setZone(ZONE);
  return Number.isFinite(seconds) && seconds > 0 && at.isValid ? at : fallback;
};

const parseMessage = (message: unknown, now: Instant): InboundText | null => {
  if (!isRecord(message) || message['type'] !== 'text') return null;
  const phone = toPhone(message['from']);
  if (phone === null) return null;
  const text = message['text'];
  return {
    id: toText(message['id']),
    phone,
    body: toTrimmed(isRecord(text) ? text['body'] : ''),
    receivedAt: receivedAt(message['timestamp'], now),
  };
};

export const parseInboundTexts = (
  event: Readonly<Record<string, unknown>>,
  now: Instant,
): readonly InboundText[] => {
  const messages = event['messages'];
  if (!Array.isArray(messages)) return [];
  return messages.map((m: unknown) => parseMessage(m, now)).filter(isPresent);
};

/** @file Lane 2: the deterministic reply parser. Whatever it refuses goes to the model. */
import { dateKey, reportingDay, rowKey, weekdayLabel } from './day.ts';
import type { InboundText, LogRow, Rep } from './model.ts';

const ALL_WORDS: readonly string[] = [
  'all',
  'all of them',
  'yes',
  'yep',
  'yup',
  'done',
  'all done',
  'kaikki',
  'joo',
  'kyllä',
];
const NONE_WORDS: readonly string[] = ['none', 'no', 'nope', 'zero', '0', 'ei', 'en yhtään'];

/** Longer messages go to the model, so "tomorrow I'll do 8" is not logged as eight. */
const BARE_NUMBER_MAX_LENGTH = 12;
const MAX_PLAUSIBLE_CALLS = 100;

export type ReplyParse =
  | { readonly kind: 'all' | 'none' | 'number'; readonly calls: number }
  | { readonly kind: 'unparsed' };

const bareNumber = (clean: string): number | null => {
  if (clean.length > BARE_NUMBER_MAX_LENGTH) return null;
  const digits = /(?<!\d)(\d{1,3})(?!\d)/.exec(clean)?.[1];
  if (digits === undefined) return null;
  const n = Number(digits);
  return n <= MAX_PLAUSIBLE_CALLS ? n : null;
};

export const parseReply = (text: string, target: number): ReplyParse => {
  const clean = text.trim().toLowerCase();
  if (ALL_WORDS.includes(clean)) return { kind: 'all', calls: target };
  if (NONE_WORDS.includes(clean)) return { kind: 'none', calls: 0 };
  const n = bareNumber(clean);
  return n === null ? { kind: 'unparsed' } : { kind: 'number', calls: n };
};

export interface ReplyRow extends LogRow {
  readonly parsed: boolean;
  readonly message_id: string;
}

const replyRow = (rep: Rep, message: InboundText): ReplyRow => {
  const day = reportingDay(message.receivedAt);
  const result = parseReply(message.body, rep.dailyTarget);
  const parsed = result.kind !== 'unparsed';
  return {
    key: rowKey(day, rep.phone),
    date: dateKey(day),
    weekday: weekdayLabel(day),
    name: rep.name,
    phone: rep.phone,
    target: rep.dailyTarget,
    calls: parsed ? result.calls : '',
    status: parsed ? 'answered' : 'unparsed',
    note: result.kind,
    raw_reply: message.body,
    logged_at: message.receivedAt.toISO(),
    parsed,
    message_id: message.id,
  };
};

/** Messages from numbers not on the roster are not ours to log. */
export const replyRows = (
  roster: readonly Rep[],
  messages: readonly InboundText[],
): readonly ReplyRow[] => {
  const byPhone = new Map(roster.map((rep) => [rep.phone, rep]));
  return messages.flatMap((message) => {
    const rep = byPhone.get(message.phone);
    return rep === undefined ? [] : [replyRow(rep, message)];
  });
};

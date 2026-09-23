/**
 * @file Lane 2: the anchored check-in parser. Whatever it refuses goes to the coach agent.
 * See README, "Design notes", for why anchoring is the lane's safety property.
 */
import { dateKey, reportingDay, rowKey, weekdayLabel } from './day.ts';
import type { DayRow, InboundText, Person } from './model.ts';

/** Only words that mean a count on their own; a bare "yes" may answer the coach instead. */
const ALL_WORDS: readonly string[] = ['all', 'all of them', 'kaikki'];
const NONE_WORDS: readonly string[] = ['none', 'zero', '0', 'en yhtään'];

const MAX_CALLS = 100;
const MAX_HOURS = 18;

/** "6/3", "6-3", "6/2,5h". A comma is a decimal point, so it cannot separate the pair. */
const PAIR = /^(\d{1,3})\s*[/-]\s*(\d{1,2}(?:[.,]\d)?)\s*h?$/;
const SINGLE = /^(\d{1,3})\s*(?:calls?|puhelua)?[.!]?$/;

export type CheckIn =
  | {
      readonly kind: 'all' | 'none' | 'calls' | 'calls+hours';
      readonly calls: number;
      readonly hours: number | null;
    }
  | { readonly kind: 'unparsed' };

const UNPARSED: CheckIn = { kind: 'unparsed' };

const pair = (match: RegExpExecArray): CheckIn => {
  const calls = Number(match[1]);
  const hours = Number((match[2] ?? '').replace(',', '.'));
  return calls <= MAX_CALLS && hours <= MAX_HOURS
    ? { kind: 'calls+hours', calls, hours }
    : UNPARSED;
};

const single = (match: RegExpExecArray): CheckIn => {
  const calls = Number(match[1]);
  return calls <= MAX_CALLS ? { kind: 'calls', calls, hours: null } : UNPARSED;
};

export const parseCheckIn = (text: string, callsTarget: number): CheckIn => {
  const clean = text.trim().toLowerCase();
  if (ALL_WORDS.includes(clean)) return { kind: 'all', calls: callsTarget, hours: null };
  if (NONE_WORDS.includes(clean)) return { kind: 'none', calls: 0, hours: null };
  const pairMatch = PAIR.exec(clean);
  if (pairMatch !== null) return pair(pairMatch);
  const singleMatch = SINGLE.exec(clean);
  return singleMatch === null ? UNPARSED : single(singleMatch);
};

export interface ReplyRow extends DayRow {
  /** Routing only: true means the regex read a number and the agent is not needed. */
  readonly parsed: boolean;
  readonly message_id: string;
}

const replyRow = (person: Person, message: InboundText): ReplyRow => {
  const day = reportingDay(message.receivedAt);
  const result = parseCheckIn(message.body, person.callsTarget);
  const parsed = result.kind !== 'unparsed';
  return {
    key: rowKey(day, person.chatId),
    date: dateKey(day),
    weekday: weekdayLabel(day),
    name: person.name,
    chat_id: person.chatId,
    focus: person.focus,
    calls_target: person.callsTarget,
    calls: parsed ? result.calls : '',
    hours_cap: person.hoursCap,
    hours: parsed ? (result.hours ?? '') : '',
    status: parsed ? 'logged' : 'unparsed',
    note: result.kind,
    raw_reply: message.body,
    logged_at: message.receivedAt.toISO(),
    parsed,
    message_id: message.id,
  };
};

/** Messages from chat ids nobody is monitoring are not ours to log. */
export const replyRows = (
  people: readonly Person[],
  messages: readonly InboundText[],
): readonly ReplyRow[] => {
  const byChatId = new Map(people.map((person) => [person.chatId, person]));
  return messages.flatMap((message) => {
    const person = byChatId.get(message.chatId);
    return person === undefined ? [] : [replyRow(person, message)];
  });
};

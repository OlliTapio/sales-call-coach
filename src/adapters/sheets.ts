/** @file Raw Google Sheets rows to domain types. Rows without a phone number are dropped. */
import type { LogEntry, Rep, WeeklyRow } from '../domain/model.ts';
import {
  isActive,
  toCallsOrNull,
  toNonZeroOr,
  toPhone,
  toText,
  toTrimmed,
  type Phone,
} from '../shared/coerce.ts';
import { DATE_FORMAT, DEFAULT_DAILY_TARGET, ZONE } from '../shared/config.ts';
import type { Instant } from '../shared/time.ts';

type Raw = Readonly<Record<string, unknown>>;

const nameOr = (value: unknown, phone: Phone): string => {
  const name = toTrimmed(value);
  return name === '' ? phone : name;
};

const validOrNull = (at: ReturnType<typeof DateTime.fromISO>): Instant | null =>
  at.isValid ? at : null;

export const parseRep = (raw: Raw): Rep | null => {
  const phone = toPhone(raw['phone']);
  if (phone === null) return null;
  return {
    name: nameOr(raw['name'], phone),
    phone,
    dailyTarget: toNonZeroOr(raw['daily_target'], DEFAULT_DAILY_TARGET),
    active: isActive(raw['active']),
  };
};

export const parseLogEntry = (raw: Raw): LogEntry | null => {
  const phone = toPhone(raw['phone']);
  if (phone === null) return null;
  const dateText = toText(raw['date']);
  return {
    key: toText(raw['key']),
    dateText,
    day: validOrNull(DateTime.fromFormat(dateText, DATE_FORMAT, { zone: ZONE })),
    name: nameOr(raw['name'], phone),
    phone,
    target: toNonZeroOr(raw['target'], 0),
    calls: toCallsOrNull(raw['calls']),
    status: toText(raw['status']),
    rawReply: toTrimmed(raw['raw_reply']),
    loggedAt: validOrNull(DateTime.fromISO(toText(raw['logged_at']), { zone: ZONE })),
  };
};

const dayCell = (value: unknown): number | '' => toCallsOrNull(value) ?? '';
const count = (value: unknown): number => toNonZeroOr(value, 0);

export const parseWeeklyRow = (raw: Raw): WeeklyRow | null => {
  const phone = toPhone(raw['phone']);
  if (phone === null) return null;
  return {
    id: toText(raw['id']),
    week: toText(raw['week']),
    week_starting: toText(raw['week_starting']),
    name: nameOr(raw['name'], phone),
    phone,
    mon: dayCell(raw['mon']),
    tue: dayCell(raw['tue']),
    wed: dayCell(raw['wed']),
    thu: dayCell(raw['thu']),
    fri: dayCell(raw['fri']),
    asked: count(raw['asked']),
    answered: count(raw['answered']),
    calls: count(raw['calls']),
    target_total: count(raw['target_total']),
    hit_days: count(raw['hit_days']),
    pct_of_target: count(raw['pct_of_target']),
  };
};

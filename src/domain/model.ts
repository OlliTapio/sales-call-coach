/**
 * @file Domain types. The `*Row` types are the sheet contracts: their keys must match the
 * header rows in `sheets/*.csv`, which a test checks.
 */
import type { Phone } from '../shared/coerce.ts';
import type { Instant } from '../shared/time.ts';

export interface Rep {
  readonly name: string;
  readonly phone: Phone;
  readonly dailyTarget: number;
  readonly active: boolean;
}

export interface LogEntry {
  readonly key: string;
  readonly dateText: string;
  readonly day: Instant | null;
  readonly name: string;
  readonly phone: Phone;
  readonly target: number;
  readonly calls: number | null;
  readonly status: string;
  readonly rawReply: string;
  readonly loggedAt: Instant | null;
}

export type AnsweredEntry = LogEntry & { readonly calls: number };

export const isAnswered = (entry: LogEntry): entry is AnsweredEntry => entry.calls !== null;

export const hitTarget = (entry: AnsweredEntry): boolean =>
  entry.target > 0 && entry.calls >= entry.target;

export interface InboundText {
  readonly id: string;
  readonly phone: Phone;
  readonly body: string;
  readonly receivedAt: Instant;
}

type LogStatus = 'goal_set' | 'nudged' | 'answered' | 'unparsed';

export interface LogRow {
  readonly key: string;
  readonly date: string;
  readonly weekday: string;
  readonly name: string;
  readonly phone: Phone;
  readonly target: number;
  readonly calls: number | '';
  readonly status: LogStatus;
  readonly note: string;
  readonly raw_reply: string;
  readonly logged_at: string;
}

type DayCell = number | '';

export interface WeeklyRow {
  readonly id: string;
  readonly week: string;
  readonly week_starting: string;
  readonly name: string;
  readonly phone: Phone;
  readonly mon: DayCell;
  readonly tue: DayCell;
  readonly wed: DayCell;
  readonly thu: DayCell;
  readonly fri: DayCell;
  readonly asked: number;
  readonly answered: number;
  readonly calls: number;
  readonly target_total: number;
  readonly hit_days: number;
  readonly pct_of_target: number;
}

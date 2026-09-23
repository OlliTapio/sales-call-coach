/**
 * @file Domain types. `DayRow` is the sheet contract: its keys must match the header row
 * of `sheets/Days.csv`, which a test checks.
 */
import type { Phone } from '../shared/coerce.ts';
import type { Instant } from '../shared/time.ts';

export interface Person {
  readonly name: string;
  readonly phone: Phone;
  readonly focus: string;
  readonly callsTarget: number;
  readonly hoursCap: number;
  readonly active: boolean;
}

export interface InboundText {
  readonly id: string;
  readonly phone: Phone;
  readonly body: string;
  readonly receivedAt: Instant;
}

type DayStatus = 'goal_set' | 'logged' | 'unparsed';

export interface DayRow {
  readonly key: string;
  readonly date: string;
  readonly weekday: string;
  readonly name: string;
  readonly phone: Phone;
  readonly focus: string;
  readonly calls_target: number;
  readonly calls: number | '';
  readonly hours_cap: number;
  readonly hours: number | '';
  readonly status: DayStatus;
  readonly note: string;
  readonly raw_reply: string;
  readonly logged_at: string;
}

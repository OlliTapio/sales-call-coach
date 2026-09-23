/** @file Lane 3: one row per rep for the current week. A silent day is not a zero-call day. */
import type { Phone } from '../shared/coerce.ts';
import { last, sum, unique } from '../shared/collections.ts';
import { DATE_FORMAT } from '../shared/config.ts';
import type { Instant } from '../shared/time.ts';
import {
  hitTarget,
  isAnswered,
  type AnsweredEntry,
  type LogEntry,
  type WeeklyRow,
} from './model.ts';

const percent = (part: number, whole: number): number =>
  whole > 0 ? Math.round((part / whole) * 100) : 0;

/** Luxon weekdays: 1 is Monday. */
const dayCell = (answered: readonly AnsweredEntry[], weekday: number): number | '' =>
  last(answered.filter((e) => e.day?.weekday === weekday))?.calls ?? '';

interface RepWeek {
  readonly phone: Phone;
  readonly name: string;
  readonly rows: readonly LogEntry[];
}

const weeklyRow = ({ phone, name, rows }: RepWeek, label: string, start: Instant): WeeklyRow => {
  const answered = rows.filter(isAnswered);
  const calls = sum(answered.map((e) => e.calls));
  const targetTotal = sum(rows.map((e) => e.target));
  return {
    id: `${label}|${phone}`,
    week: label,
    week_starting: start.toFormat(DATE_FORMAT),
    name,
    phone,
    mon: dayCell(answered, 1),
    tue: dayCell(answered, 2),
    wed: dayCell(answered, 3),
    thu: dayCell(answered, 4),
    fri: dayCell(answered, 5),
    asked: rows.length,
    answered: answered.length,
    calls,
    target_total: targetTotal,
    hit_days: answered.filter(hitTarget).length,
    pct_of_target: percent(calls, targetTotal),
  };
};

export const aggregateWeek = (entries: readonly LogEntry[], now: Instant): readonly WeeklyRow[] => {
  const start = now.startOf('week');
  const end = start.plus({ days: 6 }).endOf('day');
  const label = now.toFormat("kkkk-'W'WW");
  const inWeek = entries.filter((e) => e.day !== null && e.day >= start && e.day <= end);

  return unique(inWeek.map((e) => e.phone))
    .map((phone) => {
      const rows = inWeek.filter((e) => e.phone === phone);
      const name = rows.find((e) => e.name !== '')?.name ?? phone;
      return weeklyRow({ phone, name, rows }, label, start);
    })
    .toSorted((a, b) => (a.calls === b.calls ? a.name.localeCompare(b.name) : b.calls - a.calls));
};

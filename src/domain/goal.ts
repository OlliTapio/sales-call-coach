/** @file Lane 1: one morning row per active person. The goals come off their row. */
import type { Instant } from '../shared/time.ts';
import { dateKey, rowKey, weekdayLabel } from './day.ts';
import type { DayRow, Person } from './model.ts';

/** `calls` and `hours` stay empty, not 0, so tonight can tell "none" from silence. */
export const goalRow = (person: Person, now: Instant): DayRow => ({
  key: rowKey(now, person.phone),
  date: dateKey(now),
  weekday: weekdayLabel(now),
  name: person.name,
  phone: person.phone,
  focus: person.focus,
  calls_target: person.callsTarget,
  calls: '',
  hours_cap: person.hoursCap,
  hours: '',
  status: 'goal_set',
  note: '',
  raw_reply: '',
  logged_at: now.toISO(),
});

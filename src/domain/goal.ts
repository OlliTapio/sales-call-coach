/** @file Lane 1: one morning goal per active rep. */
import type { Instant } from '../shared/time.ts';
import { dateKey, rowKey, weekdayLabel } from './day.ts';
import type { LogRow, Rep } from './model.ts';

/** `calls` stays empty, not 0, so lane 1b can tell who has not answered. */
export const goalRows = (reps: readonly Rep[], now: Instant): readonly LogRow[] =>
  reps
    .filter((rep) => rep.active)
    .map((rep) => ({
      key: rowKey(now, rep.phone),
      date: dateKey(now),
      weekday: weekdayLabel(now),
      name: rep.name,
      phone: rep.phone,
      target: rep.dailyTarget,
      calls: '',
      status: 'goal_set',
      note: '',
      raw_reply: '',
      logged_at: now.toISO(),
    }));

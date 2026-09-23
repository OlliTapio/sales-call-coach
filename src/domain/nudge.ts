/**
 * @file Lane 1b: who has not reported today, and whether WhatsApp lets us message them freely.
 * See README, "The 24-hour window decides the nudge".
 */
import type { Phone } from '../shared/coerce.ts';
import { sum } from '../shared/collections.ts';
import { DEFAULT_DAILY_TARGET, WINDOW_HOURS } from '../shared/config.ts';
import type { Instant } from '../shared/time.ts';
import { dateKey, reportingDay, weekdayLabel } from './day.ts';
import { hitTarget, isAnswered, type LogEntry, type LogRow } from './model.ts';

/** Rolling, not calendar: on a Monday a calendar week holds nothing but today. */
const CONTEXT_DAYS = 7;

export interface RecentSummary {
  readonly set: number;
  readonly reported: number;
  readonly calls: number;
  readonly target: number;
  readonly hit: number;
}

export interface Nudge {
  readonly row: LogRow;
  readonly windowOpen: boolean;
  readonly hoursSinceLastReply: number | null;
  readonly recent: RecentSummary;
}

const lastInbound = (entries: readonly LogEntry[], phone: Phone): Instant | null =>
  entries
    .filter((e) => e.phone === phone && e.rawReply !== '')
    .map((e) => e.loggedAt)
    .reduce<Instant | null>(
      (latest, at) => (at !== null && (latest === null || at > latest) ? at : latest),
      null,
    );

const summarise = (entries: readonly LogEntry[]): RecentSummary => {
  const answered = entries.filter(isAnswered);
  return {
    set: entries.length,
    reported: answered.length,
    calls: sum(answered.map((e) => e.calls)),
    target: sum(entries.map((e) => e.target)),
    hit: answered.filter(hitTarget).length,
  };
};

const isOwed = (entry: LogEntry, today: string): boolean =>
  entry.dateText === today && entry.calls === null && entry.status !== 'nudged';

export const pendingNudges = (entries: readonly LogEntry[], now: Instant): readonly Nudge[] => {
  const forDay = reportingDay(now);
  const today = dateKey(forDay);
  const dayStart = forDay.startOf('day');
  const contextFrom = forDay.minus({ days: CONTEXT_DAYS }).startOf('day');
  const runUp = entries.filter((e) => e.day !== null && e.day >= contextFrom && e.day < dayStart);

  return entries
    .filter((entry) => isOwed(entry, today))
    .map((entry) => {
      const at = lastInbound(entries, entry.phone);
      const hours = at === null ? null : now.diff(at, 'hours').hours;
      return {
        row: {
          key: entry.key === '' ? `${today}|${entry.phone}` : entry.key,
          date: today,
          weekday: weekdayLabel(forDay),
          name: entry.name,
          phone: entry.phone,
          target: entry.target === 0 ? DEFAULT_DAILY_TARGET : entry.target,
          calls: '',
          status: 'nudged',
          note: 'nudge sent',
          raw_reply: '',
          logged_at: now.toISO(),
        },
        windowOpen: hours !== null && hours < WINDOW_HOURS,
        hoursSinceLastReply: hours === null ? null : Math.round(hours),
        recent: summarise(runUp.filter((e) => e.phone === entry.phone)),
      };
    });
};

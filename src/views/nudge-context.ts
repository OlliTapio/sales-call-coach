/** @file The run-up line the model is given when it writes a nudge. */
import type { RecentSummary } from '../domain/nudge.ts';

export const nudgeContextLine = (recent: RecentSummary): string =>
  recent.set === 0
    ? 'First day being tracked.'
    : `Last 7 days: reported on ${String(recent.reported)} of ${String(recent.set)} days, ` +
      `${String(recent.calls)} calls against a target of ${String(recent.target)}, ` +
      `hit the daily target ${String(recent.hit)} time(s).`;

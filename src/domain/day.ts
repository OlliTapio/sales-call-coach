/** @file The `date|phone` key every lane writes to, and which day a moment counts for. */
import type { Phone } from '../shared/coerce.ts';
import { DATE_FORMAT, DAY_ROLLOVER_HOUR } from '../shared/config.ts';
import type { Instant } from '../shared/time.ts';

/** A reply typed at 00:30 is about the day that just ended. */
export const reportingDay = (at: Instant): Instant =>
  at.hour < DAY_ROLLOVER_HOUR ? at.minus({ days: 1 }) : at;

export const dateKey = (day: Instant): string => day.toFormat(DATE_FORMAT);

export const weekdayLabel = (day: Instant): string => day.toFormat('ccc');

export const rowKey = (day: Instant, phone: Phone): string => `${dateKey(day)}|${phone}`;

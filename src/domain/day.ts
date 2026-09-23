/** @file The `date|chat_id` key every lane writes to, and which day a moment counts for. */
import type { ChatId } from '../shared/coerce.ts';
import { DATE_FORMAT, DAY_ROLLOVER_HOUR } from '../shared/config.ts';
import type { Instant } from '../shared/time.ts';

/** A reply typed at 00:30 is about the day that just ended. */
export const reportingDay = (at: Instant): Instant =>
  at.hour < DAY_ROLLOVER_HOUR ? at.minus({ days: 1 }) : at;

export const dateKey = (day: Instant): string => day.toFormat(DATE_FORMAT);

export const weekdayLabel = (day: Instant): string => day.toFormat('ccc');

export const rowKey = (day: Instant, chatId: ChatId): string => `${dateKey(day)}|${chatId}`;

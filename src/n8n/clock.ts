/** @file The workflow's local "now". The only place `$now` is read. */
import { ZONE } from '../shared/config.ts';
import type { Instant } from '../shared/time.ts';

export const localNow = (): Instant => {
  const now = $now.setZone(ZONE);
  if (!now.isValid) throw new Error(`Cannot express $now in ${ZONE}: ${now.invalidReason}`);
  return now;
};

/** @file The one time type the core uses. Values are built in `src/adapters` or `src/nodes`. */
import type { DateTime } from 'luxon';

export type Instant = DateTime<true>;

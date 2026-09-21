// Log rows in, one nudge out per rep who has not reported today.
//
// This node also decides HOW each nudge can be sent. WhatsApp only allows
// free-form text within 24 hours of the person's own last message; outside that
// window a business-initiated message has to be an approved template with fixed
// wording. So the window state is worked out here, from the log itself, and the
// two send paths diverge on it downstream.
const ZONE = 'Europe/Helsinki';
const WINDOW_HOURS = 24;
const DAY_ROLLOVER_HOUR = 4; // must match the reply parser

const now = $now.setZone(ZONE);
const forDay = now.hour < DAY_ROLLOVER_HOUR ? now.minus({ days: 1 }) : now;
const today = forDay.toFormat('yyyy-MM-dd');

// Context for the model is a rolling week, not the calendar one. On a Monday a
// calendar week holds nothing but today, and every rep would be greeted as if
// they had just joined.
const contextFrom = forDay.minus({ days: 7 }).startOf('day');

// One pass over the log builds everything: when each rep last messaged us, how
// their last seven days went, and which of today's rows are still unanswered.
const lastInbound = new Map();
const recent = new Map();
const pending = [];

const answeredValue = (row) => {
  const v = row.calls;
  if (v === '' || v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

for (const item of $input.all()) {
  const row = item.json;
  const phone = String(row.phone ?? '').replace(/\D/g, '');
  if (!phone) continue;

  // Only a row carrying an actual reply tells us the customer-service window
  // was open at that moment.
  if (String(row.raw_reply ?? '').trim()) {
    const at = DateTime.fromISO(String(row.logged_at ?? ''), { zone: ZONE });
    if (at.isValid && (!lastInbound.has(phone) || at > lastInbound.get(phone))) {
      lastInbound.set(phone, at);
    }
  }

  // Today is excluded: the context describes the run-up, not the day being asked about.
  const date = DateTime.fromFormat(String(row.date ?? ''), 'yyyy-MM-dd', { zone: ZONE });
  if (date.isValid && date >= contextFrom && date < forDay.startOf('day')) {
    if (!recent.has(phone)) recent.set(phone, { set: 0, reported: 0, calls: 0, target: 0, hit: 0 });
    const w = recent.get(phone);
    const target = Number(row.target) || 0;
    const calls = answeredValue(row);
    w.set += 1;
    w.target += target;
    if (calls !== null) {
      w.reported += 1;
      w.calls += calls;
      if (target > 0 && calls >= target) w.hit += 1;
    }
  }

  if (String(row.date ?? '') === today) pending.push({ row, phone });
}

function contextLine(phone) {
  const w = recent.get(phone);
  if (!w || w.set === 0) return 'First day being tracked.';
  return `Last 7 days: reported on ${w.reported} of ${w.set} days, `
    + `${w.calls} calls against a target of ${w.target}, hit the daily target ${w.hit} time(s).`;
}

const out = [];

for (const { row, phone } of pending) {
  if (answeredValue(row) !== null) continue;                  // already reported
  if (String(row.status ?? '') === 'nudged') continue;        // already nudged today

  const at = lastInbound.get(phone);
  const hoursSince = at ? now.diff(at, 'hours').hours : null;

  out.push({
    json: {
      key: String(row.key ?? `${today}|${phone}`),
      date: today,
      weekday: forDay.toFormat('ccc'),
      name: String(row.name ?? '').trim() || phone,
      phone,
      target: Number(row.target) || 8,
      calls: '',
      status: 'nudged',
      note: 'nudge sent',
      raw_reply: '',
      logged_at: now.toISO(),
      // routing + prompt material, not spreadsheet columns
      window_open: hoursSince !== null && hoursSince < WINDOW_HOURS,
      hours_since_last_reply: hoursSince === null ? null : Math.round(hoursSince),
      context: contextLine(phone),
    },
  });
}

return out;

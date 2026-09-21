// Every log row in, one row per rep for the current week out.
//
// "asked" and "answered" are counted separately on purpose: a silent day is
// not a zero-call day, and a coach needs to see which one they are looking at.
const ZONE = 'Europe/Helsinki';

const now = $now.setZone(ZONE);
const weekStart = now.startOf('week');
const weekEnd = weekStart.plus({ days: 6 }).endOf('day');
const weekLabel = now.toFormat("kkkk-'W'WW");

const DAY_KEYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

const byRep = new Map();

for (const item of $input.all()) {
  const row = item.json;

  const date = DateTime.fromFormat(String(row.date ?? ''), 'yyyy-MM-dd', { zone: ZONE });
  if (!date.isValid || date < weekStart || date > weekEnd) continue;

  const phone = String(row.phone ?? '').replace(/\D/g, '');
  if (!phone) continue;

  if (!byRep.has(phone)) {
    byRep.set(phone, {
      name: String(row.name ?? '').trim() || phone,
      phone,
      asked: 0,
      answered: 0,
      calls: 0,
      target_total: 0,
      hit_days: 0,
      days: {},
    });
  }

  const rep = byRep.get(phone);
  const target = Number(row.target) || 0;

  rep.asked += 1;
  rep.target_total += target;

  // An empty cell means the nudge went out and nothing came back.
  const answer = row.calls;
  const calls = answer === '' || answer === null || answer === undefined ? null : Number(answer);

  if (calls !== null && Number.isFinite(calls)) {
    rep.answered += 1;
    rep.calls += calls;
    if (target > 0 && calls >= target) rep.hit_days += 1;
    rep.days[DAY_KEYS[date.weekday - 1]] = calls;
  }
}

return [...byRep.values()]
  .sort((a, b) => b.calls - a.calls || a.name.localeCompare(b.name))
  .map((rep) => ({
    json: {
      id: `${weekLabel}|${rep.phone}`,
      week: weekLabel,
      week_starting: weekStart.toFormat('yyyy-MM-dd'),
      name: rep.name,
      phone: rep.phone,
      mon: rep.days.mon ?? '',
      tue: rep.days.tue ?? '',
      wed: rep.days.wed ?? '',
      thu: rep.days.thu ?? '',
      fri: rep.days.fri ?? '',
      asked: rep.asked,
      answered: rep.answered,
      calls: rep.calls,
      target_total: rep.target_total,
      hit_days: rep.hit_days,
      pct_of_target: rep.target_total > 0 ? Math.round((rep.calls / rep.target_total) * 100) : 0,
    },
  }));

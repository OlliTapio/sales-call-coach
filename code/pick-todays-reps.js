// Roster rows in, one morning goal per active rep out.
//
// The date key is built here and nowhere else. The reply and nudge workflows
// rebuild the same key, which is how an answer finds the row its goal created
// instead of appending a second one.
const ZONE = 'Europe/Helsinki';

const today = $now.setZone(ZONE);
const dateKey = today.toFormat('yyyy-MM-dd');

const asks = [];

for (const item of $input.all()) {
  const rep = item.json;

  const active = String(rep.active ?? '').trim().toLowerCase();
  if (!['true', 'yes', '1', 'x'].includes(active)) continue;

  // Sheets hands phone numbers back as text or as a number, with or without
  // a +. WhatsApp always reports the sender as bare digits, so normalise to that.
  const phone = String(rep.phone ?? '').replace(/\D/g, '');
  if (!phone) continue;

  const target = Number(rep.daily_target) || 8;

  asks.push({
    json: {
      key: `${dateKey}|${phone}`,
      date: dateKey,
      weekday: today.toFormat('ccc'),
      name: String(rep.name ?? '').trim() || phone,
      phone,
      target,
      calls: '',
      status: 'goal_set',
      note: '',
      raw_reply: '',
      logged_at: today.toISO(),
    },
  });
}

return asks;

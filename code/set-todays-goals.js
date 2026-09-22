// Founder rows in, one morning message per active founder out.
//
// The day's goals are read off the founder's row, not invented here and not
// written by the model. Two numbers and one focus is the whole commitment: a
// founder who has to read a paragraph before breakfast stops reading it by
// Wednesday.
//
// The date key is built here and nowhere else. The reply lane rebuilds the
// same key, which is how tonight's answer finds this morning's row instead of
// appending a second one.
const ZONE = 'Europe/Helsinki';

// The four things Smart Scale OS scores. The daily lane does not score them —
// it only reminds the founder which one this month belongs to, so the number
// they report has a reason attached to it. Scoring is the weekly job (TODO).
const FOCUS = {
  close: {
    label: 'Close Rate',
    line: 'Every call you take is one your closer never learns to win alone.',
  },
  profit: {
    label: 'Net Profit',
    line: 'Every point of discount comes straight off your target. Hold the floor price.',
  },
  hours: {
    label: 'Founder Hours',
    line: 'Every hour in operational decisions is an hour not spent on thought leadership.',
  },
  pipe: {
    label: 'Pipeline',
    line: 'Pipeline is a cadence problem. The market forgets you in two quiet weeks.',
  },
};

const today = $now.setZone(ZONE);
const dateKey = today.toFormat('yyyy-MM-dd');

const goals = [];

for (const item of $input.all()) {
  const founder = item.json;

  const active = String(founder.active ?? '').trim().toLowerCase();
  if (!['true', 'yes', '1', 'x'].includes(active)) continue;

  // Sheets hands phone numbers back as text or as a number, with or without a
  // +. WhatsApp always reports the sender as bare digits, so normalise to that.
  const phone = String(founder.phone ?? '').replace(/\D/g, '');
  if (!phone) continue;

  const name = String(founder.name ?? '').trim() || phone;
  const first = name.split(/\s+/)[0];

  const callsTarget = Number(founder.calls_target) || 0;
  const hoursCap = Number(founder.hours_cap) || 0;

  const focusKey = String(founder.focus ?? '').trim().toLowerCase();
  const focus = FOCUS[focusKey];

  // A founder with no focus set still gets their numbers. The reminder is the
  // part that is optional, not the commitment.
  const reminder = focus ? `\n\nFocus: *${focus.label}*. ${focus.line}` : '';

  goals.push({
    json: {
      key: `${dateKey}|${phone}`,
      date: dateKey,
      weekday: today.toFormat('ccc'),
      name,
      phone,
      focus: focusKey,
      calls_target: callsTarget,
      calls: '',
      hours_cap: hoursCap,
      hours: '',
      status: 'goal_set',
      note: '',
      raw_reply: '',
      logged_at: today.toISO(),
      message:
        `Morning ${first}. Today: *${callsTarget} sales calls*, and stay under `
        + `*${hoursCap}h* on them.${reminder}\n\nTell me how it went tonight — `
        + `"${callsTarget}/${hoursCap}" is enough, or just talk to me.`,
    },
  });
}

return goals;

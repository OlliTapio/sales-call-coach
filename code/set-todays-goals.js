// People rows in, one morning message per active person out.
//
// The day's goals are read off their row, not invented here and not written by
// the model. Two numbers and one focus is the whole commitment: someone who has
// to read a paragraph before breakfast stops reading it by Wednesday.
//
// The date key is built here and nowhere else. The reply lane rebuilds the same
// key, which is how tonight's answer finds this morning's row instead of
// appending a second one.
const ZONE = 'Europe/Helsinki';

const today = $now.setZone(ZONE);
const dateKey = today.toFormat('yyyy-MM-dd');

const goals = [];

for (const item of $input.all()) {
  const person = item.json;

  const active = String(person.active ?? '').trim().toLowerCase();
  if (!['true', 'yes', '1', 'x'].includes(active)) continue;

  // Sheets hands phone numbers back as text or as a number, with or without a
  // +. WhatsApp always reports the sender as bare digits, so normalise to that.
  const phone = String(person.phone ?? '').replace(/\D/g, '');
  if (!phone) continue;

  const name = String(person.name ?? '').trim() || phone;
  const first = name.split(/\s+/)[0];

  const callsTarget = Number(person.calls_target) || 0;
  const hoursCap = Number(person.hours_cap) || 0;

  // Free text, straight off the sheet. The coach matches it against the Focus
  // column in the playbook library, so whoever owns the sheet decides what the
  // focuses are — nothing here knows or cares what the words mean.
  const focus = String(person.focus ?? '').trim();

  // Someone with no focus set still gets their numbers. The reminder is the
  // part that is optional, not the commitment.
  const reminder = focus ? `\n\nFocus: *${focus}*.` : '';

  goals.push({
    json: {
      key: `${dateKey}|${phone}`,
      date: dateKey,
      weekday: today.toFormat('ccc'),
      name,
      phone,
      focus,
      calls_target: callsTarget,
      calls: '',
      hours_cap: hoursCap,
      hours: '',
      status: 'goal_set',
      note: '',
      raw_reply: '',
      logged_at: today.toISO(),
      message:
        `Morning ${first}. Today: *${callsTarget} calls*, and stay under `
        + `*${hoursCap}h* on them.${reminder}\n\nTell me how it went tonight — `
        + `"${callsTarget}/${hoursCap}" is enough, or just talk to me.`,
    },
  });
}

return goals;

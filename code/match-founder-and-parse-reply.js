// One output item per inbound text message from someone on the founder list.
//
// Deterministic parse first, agent second. "6", "6/3" and "none" cover the
// evening check-in and cost nothing; everything else — a question, an excuse,
// a paragraph about a deal that went sideways — is handed to the agent. Putting
// the cheap path first is what keeps the log trustworthy: the number that ends
// up in the spreadsheet on a normal evening was read by a regex, not chosen by
// a model.
const ZONE = 'Europe/Helsinki';

// A reply typed at 00:30 is about the day that just ended, not the new one.
const DAY_ROLLOVER_HOUR = 4;

const ALL_WORDS = ['all', 'all of them', 'yes', 'yep', 'yup', 'done', 'all done', 'kaikki', 'joo', 'kyllä'];
const NONE_WORDS = ['none', 'no', 'nope', 'zero', '0', 'ei', 'en yhtään'];

// Nobody works more than this in a day, so a bigger number is a typo or a
// different unit and belongs to the agent to sort out.
const MAX_HOURS = 18;
const MAX_CALLS = 100;

// A bare count, or a count and the hours it took: "6", "6/3", "6 / 3", "6-3".
// Only trusted when the message is essentially just that, so "tomorrow I'll do
// 8" is never logged as eight calls today.
function parse(text, callsTarget) {
  const clean = text.trim().toLowerCase();

  if (ALL_WORDS.includes(clean)) return { calls: callsTarget, hours: null, how: 'all' };
  if (NONE_WORDS.includes(clean)) return { calls: 0, hours: null, how: 'none' };

  if (clean.length > 12) return { calls: null, hours: null, how: 'unparsed' };

  const pair = clean.match(/^(\d{1,3})\s*[/\-,]\s*(\d{1,2}(?:[.,]\d)?)\s*h?$/);
  if (pair) {
    const calls = Number(pair[1]);
    const hours = Number(pair[2].replace(',', '.'));
    if (calls <= MAX_CALLS && hours <= MAX_HOURS) return { calls, hours, how: 'calls+hours' };
    return { calls: null, hours: null, how: 'unparsed' };
  }

  const single = clean.match(/(?<!\d)(\d{1,3})(?!\d)/);
  if (single) {
    const calls = Number(single[1]);
    if (calls <= MAX_CALLS) return { calls, hours: null, how: 'calls' };
  }

  return { calls: null, hours: null, how: 'unparsed' };
}

// The founder list arrives on this node's input; the messages come from the
// trigger.
const founders = new Map();
for (const item of $input.all()) {
  const phone = String(item.json.phone ?? '').replace(/\D/g, '');
  if (phone) founders.set(phone, item.json);
}

const out = [];

for (const event of $('WhatsApp Trigger').all()) {
  for (const message of event.json.messages ?? []) {
    if (message.type !== 'text') continue;

    const phone = String(message.from ?? '').replace(/\D/g, '');
    const founder = founders.get(phone);

    // Someone not on the list messaged the business number. Not ours to log.
    if (!founder) continue;

    const text = String(message.text?.body ?? '').trim();
    const callsTarget = Number(founder.calls_target) || 0;
    const hoursCap = Number(founder.hours_cap) || 0;

    const stamp = Number(message.timestamp);
    const receivedAt = Number.isFinite(stamp) && stamp > 0
      ? DateTime.fromSeconds(stamp).setZone(ZONE)
      : $now.setZone(ZONE);

    const forDay = receivedAt.hour < DAY_ROLLOVER_HOUR
      ? receivedAt.minus({ days: 1 })
      : receivedAt;

    const dateKey = forDay.toFormat('yyyy-MM-dd');
    const { calls, hours, how } = parse(text, callsTarget);

    out.push({
      json: {
        key: `${dateKey}|${phone}`,
        date: dateKey,
        weekday: forDay.toFormat('ccc'),
        name: String(founder.name ?? '').trim() || phone,
        phone,
        focus: String(founder.focus ?? '').trim().toLowerCase(),
        calls_target: callsTarget,
        calls: calls === null ? '' : calls,
        hours_cap: hoursCap,
        hours: hours === null ? '' : hours,
        status: calls === null ? 'unparsed' : 'logged',
        note: how,
        raw_reply: text,
        logged_at: receivedAt.toISO(),
        // Routing only. True means the regex read a number and the agent is
        // not needed; false hands the whole message over.
        parsed: calls !== null,
        message_id: message.id ?? '',
      },
    });
  }
}

return out;

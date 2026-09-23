// One output item per inbound text message from someone the coach is monitoring.
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

// Only words that mean a count on their own. A bare "yes" or "no" used to be
// here, from when the only question this asked was "how many calls?" — now that
// the coach holds a conversation and asks questions of its own, "yes" is as
// likely to be answering one of those, and it would have logged the full day's
// target. Ambiguous affirmations go to the agent, which has the thread.
const ALL_WORDS = ['all', 'all of them', 'kaikki'];
const NONE_WORDS = ['none', 'zero', '0', 'en yhtään'];

// Nobody works more than this in a day, so a bigger number is a typo or a
// different unit and belongs to the agent to sort out.
const MAX_HOURS = 18;
const MAX_CALLS = 100;

// A bare count, or a count and the hours it took: "6", "6 calls", "6/3", "6-3".
//
// Both patterns are anchored, and that is the whole safety property of this
// lane. An unanchored match plus a length cutoff — which is what this was —
// reads the number out of any short sentence that happens to contain one:
// "see you 5pm" logged five calls, "not 5" logged five, "18:30" logged
// eighteen. Each went to the sheet with status=logged and a confirmation text,
// and the agent never saw it, so nothing downstream could correct it. Anchors
// make the failure mode "the agent handles it", which is the safe direction.
function parse(text, callsTarget) {
  const clean = text.trim().toLowerCase();

  if (ALL_WORDS.includes(clean)) return { calls: callsTarget, hours: null, how: 'all' };
  if (NONE_WORDS.includes(clean)) return { calls: 0, hours: null, how: 'none' };

  // "," is a decimal point on the right-hand side, so it cannot also separate
  // the two numbers: "2,5" would read as two calls in five hours rather than
  // two and a half hours.
  const pair = clean.match(/^(\d{1,3})\s*[/\-]\s*(\d{1,2}(?:[.,]\d)?)\s*h?$/);
  if (pair) {
    const calls = Number(pair[1]);
    const hours = Number(pair[2].replace(',', '.'));
    if (calls <= MAX_CALLS && hours <= MAX_HOURS) return { calls, hours, how: 'calls+hours' };
    return { calls: null, hours: null, how: 'unparsed' };
  }

  const single = clean.match(/^(\d{1,3})\s*(?:calls?|puhelua)?[.!]?$/);
  if (single) {
    const calls = Number(single[1]);
    if (calls <= MAX_CALLS) return { calls, hours: null, how: 'calls' };
  }

  return { calls: null, hours: null, how: 'unparsed' };
}

// The people list arrives on this node's input; the messages come from the
// trigger.
const people = new Map();
for (const item of $input.all()) {
  const phone = String(item.json.phone ?? '').replace(/\D/g, '');
  if (phone) people.set(phone, item.json);
}

const out = [];

for (const event of $('WhatsApp Trigger').all()) {
  for (const message of event.json.messages ?? []) {
    if (message.type !== 'text') continue;

    const phone = String(message.from ?? '').replace(/\D/g, '');
    const person = people.get(phone);

    // Someone not on the list messaged the business number. Not ours to log.
    if (!person) continue;

    const text = String(message.text?.body ?? '').trim();
    const callsTarget = Number(person.calls_target) || 0;
    const hoursCap = Number(person.hours_cap) || 0;

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
        name: String(person.name ?? '').trim() || phone,
        phone,
        focus: String(person.focus ?? '').trim(),
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

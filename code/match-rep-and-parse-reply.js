// One output item per inbound text message from someone on the roster.
//
// Deterministic parse first, model second. A bare number, "all" or "none"
// covers almost every reply and costs nothing; only the tail — "did 6, two
// no-shows" — reaches the LLM branch. Putting the cheap path first is also
// what keeps this debuggable: most executions never touch a model at all.
const ZONE = 'Europe/Helsinki';

// A reply typed at 00:30 is about the day that just ended, not the new one.
const DAY_ROLLOVER_HOUR = 4;

const ALL_WORDS = ['all', 'all of them', 'yes', 'yep', 'yup', 'done', 'all done', 'kaikki', 'joo', 'kyllä'];
const NONE_WORDS = ['none', 'no', 'nope', 'zero', '0', 'ei', 'en yhtään'];

// Openers that make a sentence a question even without a question mark.
const QUESTION_WORDS = [
  'what', 'whats', 'how', 'why', 'when', 'where', 'which', 'who', 'can', 'could', 'do',
  'does', 'is', 'are', 'should', 'any', 'anyone', 'tell', 'help',
  'mitä', 'mikä', 'miten', 'kuinka', 'miksi', 'milloin', 'missä', 'kuka', 'onko', 'voiko',
  'voinko', 'saako', 'kerro', 'apua',
];

function parse(text, target) {
  const clean = text.trim().toLowerCase();

  if (ALL_WORDS.includes(clean)) return { calls: target, how: 'all' };
  if (NONE_WORDS.includes(clean)) return { calls: 0, how: 'none' };

  // Only trust a bare number when the message is essentially just that number
  // ("6", "6/8", "6 calls"). A longer sentence goes to the model, so that
  // "tomorrow I'll do 8" is not logged as eight calls today.
  if (clean.length <= 12) {
    const match = clean.match(/(?<!\d)(\d{1,3})(?!\d)/);
    if (match) {
      const n = Number(match[1]);
      if (n >= 0 && n <= 100) return { calls: n, how: 'number' };
    }
  }

  return { calls: null, how: 'unparsed' };
}

// Reps ask things as well as report numbers. This only decides where the
// message goes, not what the answer is — and it is checked after the number
// has been looked for, so "did 6, why is the CRM down?" is still logged as six.
function looksLikeQuestion(text) {
  const clean = text.trim().toLowerCase();
  const words = clean.split(/\s+/).filter(Boolean);

  // "?" or "6?" on its own is someone querying their own number, not asking
  // the handbook anything it could match.
  if (words.length < 2) return false;

  if (clean.includes('?')) return true;

  return QUESTION_WORDS.includes(words[0].replace(/[^\p{L}]/gu, ''));
}

// The roster arrives on this node's input; the messages come from the trigger.
const roster = new Map();
for (const item of $input.all()) {
  const phone = String(item.json.phone ?? '').replace(/\D/g, '');
  if (phone) roster.set(phone, item.json);
}

const out = [];

for (const event of $('WhatsApp Trigger').all()) {
  for (const message of event.json.messages ?? []) {
    if (message.type !== 'text') continue;

    const phone = String(message.from ?? '').replace(/\D/g, '');
    const rep = roster.get(phone);

    // Someone not on the roster messaged the business number. Not ours to log.
    if (!rep) continue;

    const text = String(message.text?.body ?? '').trim();
    const target = Number(rep.daily_target) || 8;

    const stamp = Number(message.timestamp);
    const receivedAt = Number.isFinite(stamp) && stamp > 0
      ? DateTime.fromSeconds(stamp).setZone(ZONE)
      : $now.setZone(ZONE);

    const forDay = receivedAt.hour < DAY_ROLLOVER_HOUR
      ? receivedAt.minus({ days: 1 })
      : receivedAt;

    const dateKey = forDay.toFormat('yyyy-MM-dd');
    const { calls, how } = parse(text, target);

    out.push({
      json: {
        key: `${dateKey}|${phone}`,
        date: dateKey,
        weekday: forDay.toFormat('ccc'),
        name: String(rep.name ?? '').trim() || phone,
        phone,
        target,
        calls: calls === null ? '' : calls,
        status: calls === null ? 'unparsed' : 'answered',
        note: how,
        raw_reply: text,
        logged_at: receivedAt.toISO(),
        parsed: calls !== null,
        looks_like_question: looksLikeQuestion(text),
        message_id: message.id ?? '',
      },
    });
  }
}

return out;

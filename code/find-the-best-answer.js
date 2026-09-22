// One output item per question a rep asked, carrying the handbook rows that
// might answer it.
//
// Same shape as the reply parser: cheap path first. Word overlap against the
// handbook is free and runs on every question; the model only ever sees the
// three rows that scored, never the whole handbook. That keeps the prompt
// small, keeps the answer anchored to something a human wrote, and means a
// missing Anthropic credential still sends the top row verbatim.
const MAX_CANDIDATES = 3;

// Below this the message is about something the handbook does not cover.
// Two is one keyword hit, or two words shared with a question.
const MIN_SCORE = 2;

const WHATSAPP_LIMIT = 900;

// Words that match everything and therefore mean nothing here.
const STOPWORDS = new Set([
  'a', 'an', 'the', 'and', 'or', 'but', 'if', 'of', 'to', 'in', 'on', 'for', 'with', 'about',
  'is', 'are', 'was', 'were', 'be', 'do', 'does', 'did', 'can', 'could', 'should', 'would',
  'i', 'we', 'you', 'they', 'it', 'me', 'my', 'our', 'your', 'what', 'whats', 'how', 'why',
  'when', 'where', 'which', 'who', 'this', 'that', 'there', 'here', 'any', 'some', 'get',
  'ja', 'tai', 'jos', 'on', 'ei', 'se', 'mitä', 'mikä', 'miten', 'kuinka', 'miksi', 'milloin',
  'missä', 'kuka', 'onko', 'voiko', 'voinko', 'saako', 'meidän', 'minun', 'kerro',
]);

function terms(text) {
  return String(text ?? '')
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((word) => word.length > 2 && !STOPWORDS.has(word));
}

// A Notion checkbox arrives as a real boolean; the same column imported from a
// CSV arrives as the word. No column at all means nobody has retired anything.
function isActive(value) {
  if (value === undefined || value === null || value === '') return true;
  if (typeof value === 'boolean') return value;
  return ['true', 'yes', '1', 'x'].includes(String(value).trim().toLowerCase());
}

// The Notion node's simplified output names columns `property_<snake_case>`,
// and the title column comes through as `name` as well.
function row(json) {
  const keywords = Array.isArray(json.property_keywords)
    ? json.property_keywords.map((k) => String(k))
    : String(json.property_keywords ?? '').split(',');

  return {
    question: String(json.property_question ?? json.name ?? '').trim(),
    answer: String(json.property_answer ?? '').trim(),
    keywords: keywords.map((k) => k.trim()).filter(Boolean),
    url: String(json.url ?? ''),
    active: isActive(json.property_active),
  };
}

function score(asked, entry) {
  const wanted = new Set(asked);
  if (!wanted.size) return 0;

  let total = 0;

  // A keyword is a phrasing someone chose on purpose, so it counts double.
  for (const keyword of entry.keywords) {
    for (const word of terms(keyword)) if (wanted.has(word)) total += 2;
  }

  for (const word of new Set(terms(entry.question))) if (wanted.has(word)) total += 1;

  return total;
}

// The handbook arrives on this node's input; the questions come from the parse
// node, the same way that one takes its messages from the trigger. A failed
// Notion call lands here too, as an item with no question on it — scoring it
// finds nothing and every rep gets the no-answer line, which is the point: the
// lane degrades instead of going quiet.
const handbook = $input
  .all()
  .map((item) => row(item.json))
  .filter((entry) => entry.question && entry.answer && entry.active);

const out = [];

for (const item of $('Match rep & parse reply').all()) {
  if (!item.json.looks_like_question) continue;

  const asked = terms(item.json.raw_reply);

  const ranked = handbook
    .map((entry) => ({ ...entry, score: score(asked, entry) }))
    .filter((entry) => entry.score >= MIN_SCORE)
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_CANDIDATES);

  const best = ranked[0];

  out.push({
    json: {
      phone: item.json.phone,
      name: item.json.name,
      question: item.json.raw_reply,
      matched: Boolean(best),
      // What the model is allowed to answer from, and nothing else.
      handbook: ranked
        .map((entry, i) => `${i + 1}. Q: ${entry.question}\n   A: ${entry.answer}`)
        .join('\n'),
      // What goes out when the model is unavailable or there was no match.
      fallback_answer: best
        ? best.answer.slice(0, WHATSAPP_LIMIT)
        : `I don't have an answer for that in the handbook. Ask your coach, and reply here with your call count whenever you're ready.`,
      source: best ? best.url : '',
      // Appended by the Set node below. Built here because an n8n expression
      // cannot hold the separator without fighting the escaping.
      source_suffix: best && best.url ? ` — ${best.url}` : '',
      matched_question: best ? best.question : '',
      handbook_size: handbook.length,
    },
  });
}

return out;

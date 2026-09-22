# Sales call tracker — WhatsApp → Google Sheets → chart

An n8n workflow that gives a sales rep a daily call target on WhatsApp, chases
the ones who go quiet, writes what they report to Google Sheets, answers the
questions they ask back out of a Notion handbook, and sends the coach a chart on
Friday.

![Weekly chart sent to the coach: a horizontal progress-to-goal bar per rep, calls made against
the weekly target](example-chart.png)

*Sample data. Note the last two rows — one call and none at all still read clearly, because the
number is on the axis and not inside a bar that isn't there.*

Import `workflow.json`, fill in four placeholders, done. Forty nodes across five
lanes on one canvas, plus five sticky notes. Notion is optional — leave its
placeholder alone and lane 2b tells reps to ask their coach, which is what the
workflow did before the lane existed.

## What it does

**1 · Set the goal** — weekdays at 08:30 Europe/Helsinki. Reads the `Roster` tab,
keeps the people marked active, and tells each one what today's target is. Nobody
is asked anything yet; they report whenever suits them. The row goes to `Log`
with `status = goal_set` and an **empty** `calls` cell.

**1b · Nudge the quiet ones** — 16:30. Reads `Log`, keeps today's rows whose
`calls` cell is still empty, and reminds only those people. Anyone who already
reported hears nothing. Inside WhatsApp's 24-hour window Claude writes the nudge
from the rep's last seven days; outside it, where free text is not allowed, the
same nudge goes as an approved template.

**2 · Collect** — the WhatsApp Trigger fires on the reply. `6`, `6/8`, `all` and
`none` are parsed in code and cost nothing. Only the tail — *"did 6, two
no-showed"* — goes to Claude. Either way the row is upserted onto the key the
morning's goal created, and the rep gets a one-line confirmation.

**2b · Answer** — a reply that is not a number and reads like a question goes to
the handbook instead of being met with *"reply with a plain number"*. The lane
reads a Notion database of question, answer and keywords, scores the rows
against what was asked in code, and hands the best three to Claude to answer
from — and from nothing else. No match, no Notion, or no Anthropic credential,
and the rep still gets a reply.

**3 · Graph** — Fridays at 17:00. Aggregates the week per rep into the `Weekly`
tab (per-day columns, so the client can chart it in the spreadsheet they already
live in) and renders a progress-to-goal bar that goes to the coach on WhatsApp.

## The handbook

One Notion database, four columns. `notion/Handbook.csv` is a starter — import it
into Notion (*⋯ → Import → CSV*), or build the database by hand.

| Column | Type | What it is |
|---|---|---|
| `Question` | Title | the question as someone would actually ask it |
| `Answer` | Text | the reply, short enough to read on a phone |
| `Keywords` | Multi-select | the other words reps use for the same thing |
| `Active` | Checkbox | untick to retire a row without deleting it |

`Keywords` is what makes the matching work — `Question` is only one phrasing of
many, and a keyword counts double when a message is scored. A comma-separated
text column works too, which is what a CSV import gives you before you convert
it.

A row with no answer written yet is skipped, so an empty one is a safe way to
park a question somebody still has to answer.

## The spreadsheet

One Google Sheet, three tabs. `sheets/*.csv` has the headers — import each one as
a tab of the same name, or paste the header row in by hand.

| Tab | What it holds | You edit |
|---|---|---|
| `Roster` | `name`, `phone`, `daily_target`, `active` | yes — this is the only tab a human touches |
| `Log` | one row per ask, upserted on `key` (`date` + `phone`) | no |
| `Weekly` | per-rep weekly totals with `mon`–`fri` columns, upserted on `id` | no |

Phone numbers go in in international form without the `+` (`358401234567`); the
workflow strips anything else. `active` accepts `TRUE`, `yes`, `1` or `x`.

## Setup

1. **Import** `workflow.json` into n8n (*Workflows → Import from File*), or from
   the command line:

   ```
   n8n import:workflow --input=workflow.json
   ```

   The file carries a fixed `id`, so a re-import updates the same workflow rather
   than making a second copy.
2. **Credentials** — none are bundled. Three are required: Google Sheets OAuth2,
   WhatsApp Business Cloud (`whatsAppApi`) and WhatsApp Trigger
   (`whatsAppTriggerApi`). Two are optional: Anthropic, for the model branches
   (the nudge wording, the messy-reply parsing and the handbook answer), and
   Notion, for lane 2b. A missing credential costs its own branch and nothing
   else.
3. **Replace four placeholders.** They are spelled exactly this way everywhere:
   - `REPLACE_WITH_SPREADSHEET_ID` — the Google Sheet id, on all eight Sheets nodes
   - `REPLACE_WITH_PHONE_NUMBER_ID` — your WhatsApp sender, on all seven WhatsApp nodes
   - `REPLACE_WITH_COACH_WHATSAPP_NUMBER` — who gets the Friday chart
   - `REPLACE_WITH_NOTION_DATA_SOURCE_ID` — the handbook, on **Read the handbook**.
     Easier from inside n8n: connect the Notion credential, open the node and
     pick it from the *Data Source* list. Note that this is a **data source** id,
     not the database id in the page URL — one database can hold several, and the
     API has addressed them separately since its 2025-09-03 version. Share the
     database with your integration first, or the list comes back empty.
4. **Approve two message templates** in Meta Business Manager, both `en`,
   category *Utility*, each with two body variables:

   `daily_sales_goal` — sent every morning:

   > Morning {{1}} — today's goal is {{2}} sales calls. Reply any time with how
   > many you've done.

   `daily_sales_nudge` — the end-of-day reminder, used whenever the rep is
   outside the 24-hour window:

   > Hi {{1}} — nothing logged for today yet. How many of your {{2}} calls did
   > you get done?

   Change the names in **Send today's goal** and **Nudge by template** if you
   call yours something else; the format is `name|language`.
5. **Activate.** Note that a WhatsApp app can only carry one trigger webhook, so
   nothing else can subscribe to the same app.

To try it before wiring WhatsApp up: pin some `Roster` rows on **Get the roster**
and run lane 1 manually.

## Design notes

Things here were decided deliberately, and most of them the hard way.

**A blank is not a zero.** Lane 1 writes the row when the goal goes out, so the
report can tell "said zero" from "never answered" — and so lane 1b knows who to
chase. `asked` and `answered` are counted separately all the way through, and a
silent day leaves the day column empty rather than plotting a 0.

**Only the quiet ones get chased.** The nudge is driven off that empty cell, not
off a list of everyone. Report at 09:00 and you never hear from it again that
day. Re-running the lane will not nudge the same person twice, because the row
it writes back is marked `nudged` and the code skips those.

**The 24-hour window decides the nudge, not preference.** WhatsApp allows
free-form text only within 24 hours of the person's own last message; outside it
a business-initiated message must be an approved template with fixed wording.
**Who still owes a number** works out which case applies from the log's own reply
timestamps, and the two send paths diverge on it. Claude writes the message on
the open-window path, from the rep's last seven days — a rolling seven, not the
calendar week, because on a Monday a calendar week holds nothing but today and
every rep would be greeted as if they had just joined.

**One key, written twice.** `date|phone` is built in lane 1 and rebuilt from the
inbound message in lane 2. Both writes are `appendOrUpdate` matching on it, so an
answer lands on its own question's row and a re-run never duplicates. The weekly
report does the same with `week|phone`.

**A reply after midnight belongs to yesterday.** Replies before 04:00 local are
attributed to the previous day — otherwise the 00:30 answer creates a second row
for a day nobody was asked about.

**Notion cannot search its own pages for you.** The API's search endpoint matches
page *titles*, not their contents, so "ask Notion for the answer" retrieves
almost nothing useful. That is why the handbook is a small database read whole
and scored here, rather than a pile of pages queried live. It keeps the prompt
short as a side effect: the model sees three rows, never the handbook.

**The handbook answers; the model only phrases it.** Scoring picks the row, and
the model rewrites it for WhatsApp under instructions not to add a price, a
policy or a number that is not in front of it. That ordering is what makes the
degradation work — with no Anthropic credential the top row goes out verbatim,
which is worse writing and exactly as correct.

**A message is only a question once the number lane has given up.** The check
runs after the extractor, so *"did 6, is the CRM down?"* is logged as six calls
rather than swallowed by the handbook. It costs one extraction call on messages
that were never going to hold a number, which is the cheaper of the two
mistakes.

**Cheap path first, model second.** A regex handles nearly every reply. The
Information Extractor only sees what the regex refused, and it refuses on
purpose: a bare number is trusted only when the message is essentially just that
number, so *"tomorrow I'll do 8"* is not logged as eight calls today. Keeping
the model on the tail also keeps the thing debuggable — most executions never
touch it.

**Every model branch degrades, none of them drop.** **Read it with Claude**,
**Write the nudge** and **Answer from the handbook** are all set to *continue
using error output*. No Anthropic credential, rate limit, bad day — the rep gets
"reply with a plain number", the template nudge, or the handbook row as someone
wrote it, instead of silence. **Read the handbook** continues on error as well,
so a Notion outage produces "ask your coach" rather than a lane that stops
halfway. The workflow is useful with the AI nodes disconnected entirely; it just
asks again more often and sounds more robotic. One **Claude** node backs all
three steps, so there is a single place to change model or effort.

**Two surfaces, two jobs.** The per-day detail goes to the spreadsheet, where a
client can pivot it however they like. WhatsApp gets one progress-to-goal bar per
rep, because that is what survives being looked at on a phone. The value sits in
the axis label rather than inside the bar — a rep on zero calls has no bar to
write in, and that is precisely the rep you need to read.

**The chart is a Chart.js config, not an image.** QuickChart renders it, but the
same config drops into a web dashboard later without touching the aggregation.

**WhatsApp's rules shaped the flow, not the other way round.** Business-initiated
messages outside the 24-hour customer service window must be approved templates,
which is why lane 1 sends a template and lane 2 — answering inside the window the
rep just opened — sends free text. The Friday chart assumes the coach has
messaged recently; if yours hasn't, that one needs a template with a media header
too.

**Small hygiene.** The trigger subscribes to `messages` only and filters out
status callbacks, so delivered/read receipts don't wake the workflow. The roster
read in lane 2 is `executeOnce`, so two messages in one webhook delivery don't
read it twice. Outbound calls retry three times.

## Tests

[![test](https://github.com/OlliTapio/sales_call_tracker/actions/workflows/test.yml/badge.svg)](https://github.com/OlliTapio/sales_call_tracker/actions/workflows/test.yml)

The five Code nodes are the part most likely to be wrong, so they are checked.
`code/*.js` holds their bodies verbatim, and the harness runs them the way n8n
does — same globals, same return contract — so a file can be pasted straight into
the editor.

```
npm install
npm test        # 96 checks
node sync-code.mjs --check   # workflow.json still matches code/
```

`node sync-code.mjs` splices `code/*.js` back into `workflow.json` after you edit
a node body outside n8n. The structural tests catch the failures that otherwise
only appear after import: a connection to a renamed node, an expression pointing
at a node that no longer exists, a credential exported by accident.

Beyond what CI runs, lanes 1 to 3 have been checked against **n8n 2.35.7**: the
workflow imports cleanly, every parameter name matches the node definitions
shipped in `n8n-nodes-base` and `@n8n/n8n-nodes-langchain`, and those four Code
node bodies were executed inside n8n's own runtime — not just the harness — with
the same assertions passing there.

Lane 2b has had the reading half of that only. Its parameter names were checked
against the Notion node's source at the same tag — it is `typeVersion` 3, the
one that addresses data sources rather than databases — but the lane has not
been imported into a running n8n or executed there.

Not yet exercised end to end: the live WhatsApp, Google Sheets and Notion calls,
and the QuickChart render. Those need credentials — see *Design notes* above for
the WhatsApp windowing rules that constrain them.

## What is deliberately not here

No embeddings and no vector store behind the handbook. Word overlap across a few
dozen curated rows is enough, and it is inspectable — you can see why a row was
picked. Prose pages instead of a question-and-answer table is where that stops
being true, and that version wants a nightly index rather than a live read.

No writes back to Notion either: unanswered questions are not filed anywhere, so
the gaps in the handbook are found by reading the executions.

No retry-the-nudge-if-silent, no streaks or leaderboards, no per-rep timezones,
no multi-coach routing. All are a node or two away; none of them are worth
building before someone has used this for a fortnight.

The model is `claude-opus-5` at low effort, which is far more than parsing
"did 6, two no-shows" needs — swap it on the **Claude** node for something
cheaper if the volume ever justifies caring.

## Status and licence

A reference implementation, not a maintained product — it exists to be read and
copied from. Issues and forks are welcome; nothing here is promised to keep
working against future n8n releases. Built against `n8n-nodes-base` 2.15 and
`@n8n/n8n-nodes-langchain` 2.39.

MIT, see [LICENSE](LICENSE).

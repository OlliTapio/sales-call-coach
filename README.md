# Sales call tracker — WhatsApp → Google Sheets → chart

An n8n workflow that asks a sales rep on WhatsApp whether they made their calls
today, writes the answer to Google Sheets, and sends the coach a chart on Friday.

![Weekly chart sent to the coach: a horizontal progress-to-goal bar per rep, calls made against
the weekly target](example-chart.png)

*Sample data. Note the last two rows — one call and none at all still read clearly, because the
number is on the axis and not inside a bar that isn't there.*

Import `workflow.json`, fill in three placeholders, done. Twenty-four nodes across
three lanes on one canvas, plus three sticky notes.

## What it does

**1 · Ask** — weekdays at 16:30 Europe/Helsinki. Reads the `Roster` tab, keeps
the people marked active, sends each one an approved WhatsApp template, and
writes a row to `Log` with `status = asked` and an **empty** `calls` cell.

**2 · Collect** — the WhatsApp Trigger fires on the reply. `6`, `6/8`, `all` and
`none` are parsed in code and cost nothing. Only the tail — *"did 6, two
no-showed"* — goes to Claude. Either way the row is upserted onto the key the
morning's nudge created, and the rep gets a one-line confirmation.

**3 · Graph** — Fridays at 17:00. Aggregates the week per rep into the `Weekly`
tab (per-day columns, so the client can chart it in the spreadsheet they already
live in) and renders a progress-to-goal bar that goes to the coach on WhatsApp.

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
   (`whatsAppTriggerApi`). A fourth, Anthropic, is needed only if you want the
   model branch.
3. **Replace three placeholders.** They are spelled exactly this way everywhere:
   - `REPLACE_WITH_SPREADSHEET_ID` — the Google Sheet id, on all six Sheets nodes
   - `REPLACE_WITH_PHONE_NUMBER_ID` — your WhatsApp sender, on all four WhatsApp nodes
   - `REPLACE_WITH_COACH_WHATSAPP_NUMBER` — who gets the Friday chart
4. **Approve the message template** in Meta Business Manager. The workflow sends
   `daily_sales_check` in `en`, category *Utility*, with two body variables:

   > Hi {{1}} — how many sales calls did you get done today? Your target is
   > {{2}}. Reply with just the number.

   Change the name in the **Ask on WhatsApp** node if you call yours something
   else; the format is `name|language`.
5. **Activate.** Note that a WhatsApp app can only carry one trigger webhook, so
   nothing else can subscribe to the same app.

To try it before wiring WhatsApp up: pin some `Roster` rows on **Get the roster**
and run lane 1 manually.

## Design notes

Things here were decided deliberately, and most of them the hard way.

**A blank is not a zero.** Lane 1 writes the row when the question goes out, so
the report can tell "said zero" from "never answered". `asked` and `answered` are
counted separately all the way through, and a silent day leaves the day column
empty rather than plotting a 0.

**One key, written twice.** `date|phone` is built in lane 1 and rebuilt from the
inbound message in lane 2. Both writes are `appendOrUpdate` matching on it, so an
answer lands on its own question's row and a re-run never duplicates. The weekly
report does the same with `week|phone`.

**A reply after midnight belongs to yesterday.** Replies before 04:00 local are
attributed to the previous day — otherwise the 00:30 answer creates a second row
for a day nobody was asked about.

**Cheap path first, model second.** A regex handles nearly every reply. The
Information Extractor only sees what the regex refused, and it refuses on
purpose: a bare number is trusted only when the message is essentially just that
number, so *"tomorrow I'll do 8"* is not logged as eight calls today. Keeping
the model on the tail also keeps the thing debuggable — most executions never
touch it.

**The model branch degrades, it doesn't drop.** **Read it with Claude** is set to
*continue using error output*. No Anthropic credential, rate limit, bad day — the
rep gets "reply with a plain number" instead of silence. The workflow is useful
with the AI node disconnected entirely; it just asks again more often.

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

The four Code nodes are the part most likely to be wrong, so they are checked.
`code/*.js` holds their bodies verbatim, and the harness runs them the way n8n
does — same globals, same return contract — so a file can be pasted straight into
the editor.

```
npm install
npm test        # 52 checks
node sync-code.mjs --check   # workflow.json still matches code/
```

`node sync-code.mjs` splices `code/*.js` back into `workflow.json` after you edit
a node body outside n8n. The structural tests catch the failures that otherwise
only appear after import: a connection to a renamed node, an expression pointing
at a node that no longer exists, a credential exported by accident.

Beyond what CI runs, this has been checked against **n8n 2.35.7**: the workflow
imports cleanly, every parameter name matches the node definitions shipped in
`n8n-nodes-base` and `@n8n/n8n-nodes-langchain`, and all four Code node bodies
were executed inside n8n's own runtime — not just the harness — with the same
assertions passing there.

Not yet exercised end to end: the live WhatsApp and Google Sheets calls, and the
QuickChart render. Those need credentials — see *Design notes* above for the
WhatsApp windowing rules that constrain them.

## What is deliberately not here

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

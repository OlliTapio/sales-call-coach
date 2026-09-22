# Smart Scale OS™ — the daily loop, on WhatsApp

The [Smart Scale OS mock](https://smart-scale-os-mock.pages.dev) is an app a
founder has to remember to open. This is the same mentoring loop with nothing to
open: an n8n workflow that sets the day's commitment on WhatsApp in the morning,
records what actually happened in the evening, and coaches in between.

Three things, deliberately. Set the goal, record the day, coach — the rest of
the OS (weekly scoring, the one-focus doctrine, the scorecard) is listed as TODO
on the canvas and is not built here.

Import `workflow.json`, fill in three placeholders, done. Nineteen nodes across
three lanes on one canvas, plus four sticky notes.

## What it does

**1 · Goals** — weekdays at 08:30 Europe/Helsinki. Reads the `Founders` tab,
keeps the people marked active, and sends each one two numbers and their focus
metric. The numbers come off their row; nothing is generated. The day's row goes
to `Days` with `status = goal_set` and **empty** `calls` and `hours` cells.

**2 · Check-in** — the WhatsApp Trigger fires on the reply. `6`, `6/3`, `all`
and `none` are read by a regex, written straight to the sheet, and confirmed in
one line. No model is involved, and no model *can* be: **Record the day** has
exactly one node feeding it, and it is the IF.

**3 · Coach** — everything the regex refused goes to one agent with two tools. It
can write the founder's numbers into the log (`log_the_day`) and read the Notion
playbook library (`read_the_playbooks`), and that is the whole of its reach. It
answers, coaches, and names at most one recovery task. If Anthropic is down the
founder is asked for a plain number instead — which lane 2 can still log.

## The spreadsheet

One Google Sheet, two tabs. `sheets/*.csv` has the headers and some sample rows —
import each one as a tab of the same name, or paste the header row in by hand.

| Tab | What it holds | You edit |
|---|---|---|
| `Founders` | `name`, `phone`, `calls_target`, `hours_cap`, `focus`, `goal_text`, `active` | yes — the only tab a human touches |
| `Days` | one row per founder per day, upserted on `key` (`date` + `phone`) | no |

Phone numbers go in in international form without the `+` (`358401234567`); the
workflow strips anything else. `active` accepts `TRUE`, `yes`, `1` or `x`.
`focus` is one of `close`, `profit`, `hours`, `pipe` — the four metrics the OS
scores. An unrecognised value costs the founder their focus line and nothing
else.

## The playbook library

One Notion database, eight columns. `notion/Playbooks.csv` is the library from
the mock — import it into Notion (*⋯ → Import → CSV*), then point
`read_the_playbooks` at it.

| Column | Type | What it is |
|---|---|---|
| `Task` | Title | the recovery task, as the founder would be told to do it |
| `Why` | Text | one line on what it fixes |
| `Metric` | Select | `close`, `profit`, `hours` or `pipe` — matches the founder's focus |
| `Pillar` | Select | Demand, Sales, Delivery or Operations |
| `Priority` | Select | Urgent, High or Medium |
| `Playbook` | Select | which playbook it comes from |
| `Effort` | Text | how long it takes |
| `Active` | Checkbox | untick to retire a task without deleting it |

This database is the coach's entire world. It is read whole on each call — the
library is a few dozen rows, and Notion's search endpoint matches page *titles*
rather than their contents, so there is nothing to gain from querying it.

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
   (`whatsAppTriggerApi`). Two are optional: Anthropic and Notion, both for lane
   3 only. Without them lanes 1 and 2 still set goals and log numbers.
3. **Replace three placeholders.** They are spelled exactly this way everywhere:
   - `REPLACE_WITH_SPREADSHEET_ID` — the Google Sheet id, on all five Sheets nodes
   - `REPLACE_WITH_PHONE_NUMBER_ID` — your WhatsApp sender, on all three WhatsApp nodes
   - `REPLACE_WITH_NOTION_DATA_SOURCE_ID` — the playbook library, on
     **read_the_playbooks**. Easier from inside n8n: connect the Notion
     credential, open the node and pick it from the *Data Source* list. Note that
     this is a **data source** id, not the database id in the page URL — one
     database can hold several, and the API has addressed them separately since
     its 2025-09-03 version. Share the database with your integration first, or
     the list comes back empty.
4. **Activate.** Note that a WhatsApp app can only carry one trigger webhook, so
   nothing else can subscribe to the same app.

To try it before wiring WhatsApp up: pin some `Founders` rows on **Get the
founders** and run lane 1 manually.

## Design notes

**The regex owns the log; the agent owns the conversation.** On a normal evening
a founder types `6` and a regex writes it. The agent only ever sees what the
regex refused. That split is the point: the log is what the weekly scoring will
be built on, so the number in it should not have a temperature. A structural test
asserts that **Record the day** has exactly one upstream node.

**The agent can fill in cells, not choose the row.** `log_the_day` takes `calls`,
`hours` and `note` from `$fromAI()`; `key`, `date`, `phone` and both targets are
expressions off the item. So the model can be wrong about a number the founder
said, but it cannot write that number onto the wrong founder, the wrong day, or
a target nobody set. It also cannot change a goal — only the `Founders` tab does
that, and no node writes to it.

**The coach's authority ends at the playbook library.** The system prompt forbids
stating a price, a policy, a target or a number that is not in the prompt or in a
row it just read, and tells it to hand anything else to the mentor. Grounding a
coach persona is the whole difficulty: "be a business coach" is an invitation to
invent a discount floor, and a founder will act on it.

**A blank is not a zero.** Lane 1 writes the row when the goal goes out, so the
log can tell "said zero" from "never answered". That distinction is what the
weekly scoring will need, and it is free to preserve now.

**One key, written twice.** `date|phone` is built in lane 1 and rebuilt from the
inbound message in lane 2. Every write is `appendOrUpdate` matching on it, so the
evening's answer lands on the morning's row and a re-run never duplicates.

**A reply after midnight belongs to yesterday.** Replies before 04:00 local are
attributed to the previous day — otherwise the 00:30 answer opens a second row
for a day nobody was asked about.

**Memory is per founder.** The buffer is keyed on the phone number, not on a
shared session, so the coach remembers the last few turns of *that* thread and
nothing from anybody else's.

**The coach degrades instead of dropping.** The agent is set to *continue using
error output*, and both outputs land on the same Set node. No Anthropic
credential, rate limit, bad day — the founder gets "how many sales calls did you
hold today?" rather than silence, and the regex lane logs their answer.
**read_the_playbooks** continues on error too, so a Notion outage costs the
citation and not the reply.

## Tests

The Code nodes are the part most likely to be wrong, so they are checked. The
harness runs each `code/*.js` file the way n8n runs it — the file is the function
body, `$input` / `$now` / `DateTime` / `$()` are globals — so the same file is
pasted into n8n unchanged.

```
npm install
npm test        # 43 checks
npm run sync    # write code/*.js into workflow.json after editing one
```

`code/*.js` is the source of truth for the Code nodes; `npm test` fails if
`workflow.json` has drifted from it. Twenty-three of the checks are structural:
they read the exported JSON and catch what only shows up after you import and
press Execute — a connection to a renamed node, an expression pointing at a node
that no longer exists, a placeholder that shipped.

What the tests do **not** cover: nothing here calls a model. Every check exercises
the deterministic code around the agent and the shape of the canvas. The agent's
own behaviour — whether it logs the right number, whether it stays inside the
playbook library — has no evals yet, and that is the next thing worth building.

## What is deliberately not here

The **TODO** sticky on the canvas lists the rest of the OS:

- **Weekly scoring.** The four metrics against derived targets, in a Code node so
  the scoring stays deterministic — the mock derives the pipeline target from
  revenue over a 35% close benchmark, and that arithmetic belongs in code.
- **The one-focus doctrine.** When several metrics fail, name one and queue the
  rest. The mock enforces this on the dashboard; here it is a line in the morning
  message and nothing more.
- **The Friday scorecard.** The metric cards as a chart, to the founder and their
  mentor.
- **Chasing the quiet.** A nudge for founders who never replied, respecting
  WhatsApp's 24-hour free-text window.
- **Evals.** Retrieval and groundedness on the coach reply — before any of the
  above, because the above all trusts it.

No embeddings and no vector store behind the playbook library. A few dozen
curated rows read whole is enough, and it is inspectable — you can see exactly
what the coach was given. Prose pages instead of a task table is where that stops
being true.

Built against `n8n-nodes-base` and `@n8n/n8n-nodes-langchain` 2.35.5, the versions
shipped with n8n 2.35.7.

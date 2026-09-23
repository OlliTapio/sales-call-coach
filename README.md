# Coach — a daily check-in on Telegram

An n8n workflow that coaches a group of people through Telegram. Every weekday
morning it sends each person the two numbers they committed to and the one thing
they are working on; in the evening it records what actually happened; and in
between it answers whatever they send back.

One workflow, one agent, many people. Three things, deliberately — set the goal,
record the day, coach. Scoring, scorecards and nudges are listed as TODO on the
canvas and are not built here.

Import `workflow.json`, fill in three placeholders, done. Nineteen nodes across
three lanes on one canvas, plus five sticky notes.

![The workflow on the n8n canvas: three lanes — goals, check-in, coach — with the
agent's model, memory and two tools hanging below it, and sticky notes for the
TODO list and the known defects](workflow.png)

_Imported into n8n 2.35.7 with no credentials configured. The red triangles are
the missing credentials; `Get the people` shows `3 items` because the sample rows
are pinned, which is what makes the canvas explorable before you connect
anything._

## What it does

**1 · Goals** — weekdays at 08:30 Europe/Helsinki. Reads the `People` tab, keeps
the rows marked active, and sends each person two numbers and their focus. The
numbers come off their row; nothing is generated. The day's row goes to `Days`
with `status = goal_set` and **empty** `calls` and `hours` cells.

**2 · Check-in** — the Telegram Trigger fires on the reply. `6`, `6/3`, `all`
and `none` are read by a regex, written straight to the sheet, and confirmed in
one line. No model is involved, and no model _can_ be: **Record the day** has
exactly one node feeding it, and it is the IF.

**3 · Coach** — everything the regex refused goes to one agent with two tools. It
can write that person's numbers into the log (`log_the_day`) and read the Notion
playbook library (`read_the_playbooks`), and that is the whole of its reach. It
answers, coaches, and names at most one task to do next. If the model is down the
person is asked for a plain number instead — which lane 2 can still log.

## The spreadsheet

One Google Sheet, two tabs. `sheets/*.csv` has the headers and some sample rows —
import each one as a tab of the same name, or paste the header row in by hand.

| Tab      | What it holds                                                                  | You edit                           |
| -------- | ------------------------------------------------------------------------------ | ---------------------------------- |
| `People` | `name`, `chat_id`, `calls_target`, `hours_cap`, `focus`, `goal_text`, `active` | yes — the only tab a human touches |
| `Days`   | one row per person per day, upserted on `key` (`date` + `chat_id`)             | no                                 |

A `chat_id` is a number Telegram assigns, not something you choose: it appears on
the trigger the first time someone sends the bot `/start`. The workflow strips
anything that is not a digit. `active` accepts `TRUE`, `yes`, `1` or `x`.

`focus` is free text. Nothing in the code interprets it — it is printed in the
morning message and matched by the coach against the `Focus` column in the
playbook library, so whoever owns the sheet decides what the focuses are. Leave
it blank and the person still gets their numbers.

## The playbook library

One Notion database, eight columns. `notion/Playbooks.csv` is a starter set —
import it into Notion (_⋯ → Import → CSV_), then point `read_the_playbooks` at
it.

| Column     | Type     | What it is                                              |
| ---------- | -------- | ------------------------------------------------------- |
| `Task`     | Title    | the task, as you would tell someone to do it            |
| `Why`      | Text     | one line on what it fixes                               |
| `Focus`    | Select   | matches the `focus` on the person's row                 |
| `Pillar`   | Select   | which part of the business it belongs to                |
| `Priority` | Select   | Urgent, High or Medium                                  |
| `Playbook` | Select   | where it comes from                                     |
| `Effort`   | Text     | how long it takes                                       |
| `Active`   | Checkbox | untick to retire a task — advisory, see _Known defects_ |

This database is the coach's entire world. It is read whole on each call, because
a few dozen rows cost less to hand over than to filter. That is a size argument,
not a limitation: a Notion database query _can_ filter on `Focus`, and doing so
is on the TODO note — the whole library goes into the model's context on every
tool call today, which is linear in how big the library gets.

## Run it locally

You do not need a Google account, a Telegram bot or an API key to open this
and look around. The commands below are the ones used to produce the screenshot
above, on Windows with Node 24; they work the same on macOS and Linux.

1. **Put n8n's data somewhere disposable**, so this never touches an n8n you
   already use. Every later command needs this variable set, so set it in the
   shell you are going to work in.

   ```bash
   export N8N_USER_FOLDER="$PWD/.n8n-local"      # PowerShell: $env:N8N_USER_FOLDER = "$PWD\.n8n-local"
   mkdir -p "$N8N_USER_FOLDER"
   ```

2. **Import the workflow.** The first run downloads n8n and applies ~200
   migrations, so give it a few minutes; later runs are quick.

   ```bash
   npx n8n@2.35.7 import:workflow --input=workflow.json
   ```

   Expect `Successfully imported 1 workflow.` The `Failed to load Custom API
options for the node "n8n-nodes-base.confluence"` lines above it are n8n
   loading its own node catalogue and have nothing to do with this workflow.

   The file carries a fixed `id` (`whatsappCoach`), so a re-import updates the
   same workflow rather than making a second copy — edit `workflow.json`, run
   this again, refresh the browser.

3. **Start it.**

   ```bash
   npx n8n@2.35.7 start
   ```

   Then open <http://localhost:5678/workflow/whatsappCoach>. On the very first
   start n8n asks you to create an owner account; it is local to
   `$N8N_USER_FOLDER`, so any email and a password with 8+ characters, a digit
   and a capital will do. `N8N_USER_MANAGEMENT_DISABLED` no longer skips this
   screen in 2.x.

4. **Look at it without connecting anything.** The sample `People` rows are
   pinned onto **Get the people**, so that node outputs three items with no
   Google credential attached — open it and you can read them. Pin data applies
   to manual executions only; a production run still reads the real sheet.

To delete the whole thing afterwards, remove `.n8n-local`. It is gitignored.

**What this does and does not prove.** The workflow imports, the canvas is valid,
and the pinned rows flow. It does not execute end to end — every send and every
write needs a real credential, and `n8n execute --id` refuses this workflow
outright because it has no Execute Workflow Trigger. For the Code nodes, the test
suite is the stronger check anyway: it runs each compiled Code-node body the way n8n runs
it. See _Tests_.

## Connecting it for real

1. **Credentials** — none are bundled. Two are required: Google Sheets OAuth2,
   and Telegram (`telegramApi`) — one bot token, shared by the trigger and the
   three Telegram nodes. Two are optional: Google Gemini and Notion, both for
   lane 3 only. Without them lanes 1 and 2 still set goals and log numbers.
2. **Replace two placeholders.** They are spelled exactly this way everywhere:
   - `REPLACE_WITH_SPREADSHEET_ID` — the Google Sheet id, on all five Sheets nodes
   - `REPLACE_WITH_NOTION_DATA_SOURCE_ID` — the playbook library, on
     **read_the_playbooks**. Easier from inside n8n: connect the Notion
     credential, open the node and pick it from the _Data Source_ list. Note that
     this is a **data source** id, not the database id in the page URL — one
     database can hold several, and the API has addressed them separately since
     its 2025-09-03 version. Share the database with your integration first, or
     the list comes back empty.
3. **Unpin `Get the people`** once the Sheets credential is on, or leave it —
   pinned data is ignored by production executions either way. Unpinning just
   stops manual runs from quietly using the samples.
4. **Activate.** Telegram allows one webhook per bot, so nothing else can
   subscribe to the same token, and it needs a public HTTPS URL — a tunnel in
   front of localhost, or `npx n8n@2.35.7 start --tunnel` for a throwaway one.
   n8n calls `setWebhook` itself on activation; there is nothing to register by
   hand.

A bot is made by sending [@BotFather](https://t.me/BotFather) `/newbot`; it
answers with the token, and the token is the whole credential. No business
verification, no recipient cap, no paid tier. The one constraint is that a bot
cannot open a conversation: each person sends it `/start` once, and their
`chat_id` appears on the trigger from that moment.

## Known defects

**The coach forgets everyone within the hour.** `Remember the thread` is n8n's
Simple Memory, and its implementation is a `Map` held in the n8n process behind a
singleton. Every read first runs `cleanupStaleBuffers()`, which deletes any
thread not touched for 60 minutes. A daily check-in is close to the worst case
for that: someone answers the 08:30 message at 17:00 and the coach has no memory
of the morning, so "how did that go?" means nothing to it. Three consequences
worth knowing:

- **It is process-local.** Restart or redeploy n8n and every thread is gone. In
  queue mode each worker keeps its own `Map`, so consecutive messages from the
  same person can land on different halves of the conversation.
- **`contextWindowLength` bounds turns, not tokens.** It is passed as
  LangChain's `k`, so six turns is six turns — one pasted wall of text still
  reaches the model whole.
- **Heap grows with people active in the last hour**, not with the list. That
  part is fine at demo scale and is not the reason to replace it.

_Fix, not done here:_ a persistent chat memory (Postgres or Redis), or drop the
memory node entirely and read the person's last few `Days` rows into the prompt.
The sheet already holds the history, deterministically and for free, and the
agent already has the row key.

**A partial write blanks the cells it has no value for.** All three Sheets nodes
map every one of the 14 `Days` columns on an `appendOrUpdate`, so a second write
to the same `key` overwrites columns the first one filled. Two ways that shows
up: someone sends `6/3` and then corrects it to `7`, and the hours go back to
empty; or the coach calls `log_the_day` with only a `note` — which the system
prompt explicitly tells it to do rather than guess a number — and `calls` and
`hours` are blanked while `status` still says `logged`. _Fix, not done here:_ read
the row before writing and merge, or build the column map from only the fields
that actually have a value.

**Two messages at once can double-write a row.** `appendOrUpdate` is a read then
a write with nothing holding the row in between, and every inbound message
starts its own execution. Someone sending `6` and then `3h` a second apart can
have both executions find no matching row and append two, after which every
later upsert only ever updates the first. _Fix, not done here:_ cap the workflow
to one concurrent execution, or look the row id up and `update` it.

**Retiring a playbook task is advisory.** `read_the_playbooks` has no filter, so
an unticked `Active` row is still handed to the coach; the tool description tells
it to ignore those, which is a request rather than a guarantee. Delete the row if
it must never be suggested.

**Nothing tests the agent.** See the note at the end of _Tests_.

## Design notes

**The regex owns the log; the agent owns the conversation.** On a normal evening
someone types `6` and a regex writes it. The agent only ever sees what the regex
refused. That split is the point: the log is what any later scoring will be built
on, so the number in it should not have a temperature. A structural test asserts
that **Record the day** has exactly one upstream node.

**The agent can fill in cells, not choose the row.** `log_the_day` takes `calls`,
`hours` and `note` from `$fromAI()`; `key`, `date`, `chat_id` and both targets are
expressions off the item. So the model can be wrong about a number someone said,
but it cannot write that number onto the wrong person, the wrong day, or a target
nobody set. It also cannot change a goal — only the `People` tab does that, and
no node writes to it.

**The coach's authority ends at the playbook library.** The system prompt forbids
stating a price, a policy, a target or a number that is not in the prompt or in a
row it just read, and tells it to hand anything else back to whoever set the
goals. Grounding a coach persona is the whole difficulty: "be a coach" is an
invitation to invent a discount floor, and someone will act on it.

**One agent, many people, one thread each.** Memory is keyed on the chat id
and the prompt says nothing from one person may appear in a reply to another.
That is a prompt-level guarantee on top of a session-level one; the session key
is the part that actually holds.

**A blank is not a zero.** Lane 1 writes the row when the goal goes out, so the
log can tell "said zero" from "never answered".

**One key, written twice.** `date|chat_id` is built in lane 1 and rebuilt from the
inbound message in lane 2. Every write is `appendOrUpdate` matching on it, so the
evening's answer lands on the morning's row and a re-run never duplicates.

**A reply after midnight belongs to yesterday.** Replies before 04:00 local are
attributed to the previous day — otherwise the 00:30 answer opens a second row
for a day nobody was asked about.

**The coach degrades instead of dropping.** The agent is set to _continue using
error output_, and both outputs land on the same Set node. No Gemini
credential, rate limit, bad day — the person gets "how many calls did you hold
today?" rather than silence, and the regex lane logs their answer.
**read_the_playbooks** continues on error too, so a Notion outage costs the
citation and not the reply.

## Tests

The two Code nodes are the part most likely to be wrong, so they are checked.
They are written in strict TypeScript under `src/` and compiled into
`workflow.json` by `npm run build`, as flat, readable JavaScript that still
pastes straight into the n8n editor. Every behaviour test runs twice, against the
source and against the compiled body, with the globals n8n provides (`$input`,
`$now`, `DateTime`, `$()`).

```
npm install
npm run check        # everything CI runs
npm run build        # after editing src/, recompile the Code nodes into workflow.json
```

`npm run lint:workflow` reads the exported JSON and catches what only shows up
after you import and press Execute: a connection to a renamed node, an expression
pointing at a node that no longer exists, a placeholder that shipped. It also
holds this workflow's own invariants, such as the regex owning the log and the
agent writing only the cells the person spoke about, and it checks that the memory
defect above is still documented on the canvas and in this file. How the code is
organised, and which tool enforces which rule, is in
[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md). Agent instructions are in
[AGENTS.md](AGENTS.md).

What the tests do **not** cover: nothing here calls a model. Every check
exercises the deterministic code around the agent and the shape of the canvas.
The agent's own behaviour — whether it logs the number that was actually said,
whether it stays inside the playbook library, whether it holds 60 words — has no
evals, and that is the next thing worth building.

## What is deliberately not here

The **TODO** sticky on the canvas lists the rest:

- **Weekly scoring.** Each focus against its target, in a Code node so the
  scoring stays deterministic.
- **One focus at a time.** When several things are off target, name one and queue
  the rest.
- **Friday scorecard.** The week as a chart, to the person and to whoever coaches
  them.
- **Chasing the quiet.** A nudge for anyone who never replied. Telegram has no
  24-hour messaging window, so only the schedule is missing.
- **Calling, not only texting.** A ringing phone is a different kind of interrupt
  from a message that sits unread all evening. An [ElevenLabs](https://elevenlabs.io/docs/agents-platform/phone-numbers/outbound-calling)
  voice agent could place the nudge as an outbound call and take the number by
  voice — at the cost of needing explicit consent to ring someone,
  which the `People` sheet would have to record and honour.
- **Evals.** Groundedness and logging accuracy on the coach reply — before any of
  the above, because the above all trusts it.

No embeddings and no vector store behind the playbook library. A few dozen
curated rows read whole is enough, and it is inspectable — you can see exactly
what the coach was given. Prose pages instead of a task table is where that stops
being true.

Built against `n8n-nodes-base` and `@n8n/n8n-nodes-langchain` 2.35.5, the versions
shipped with n8n 2.35.7.

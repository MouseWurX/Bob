# Routines

Routines are jobs you build yourself in the Routines editor by wiring boxes together, like Unreal Engine's
Blueprints. Once a routine has your OK, plain code runs it by itself. Bob's brain is used only at "Ask the brain"
boxes, and only to answer. Bob never makes or changes a routine.

- Turn on: Settings, Hands, **Let Bob use Hands** and **Routines** (both off by default).
- Edit: Settings, Hands, Routines, **Open the Routines editor** (`public/routines.html`).
- Code: `public/routine-nodes.js` (box kinds, pins, checks; shared by both sides), `src/routines.js` (store, runner,
  triggers), `src/hands-routines.js` (Bob's side: tools, brain, results, `/api/routines`), `public/n8n-import.js`
  (bringing in n8n workflows), test `test/run-routines-test.js`.

## The file

Each routine is `inn\bob\routines\<id>.json`:

```json
{
  "bobRoutine": 1,
  "id": "rbank",
  "name": "Morning bank summary",
  "what": "Read the bank export, sum it up, save it.",
  "nodes": [
    { "id": "n1", "kind": "trigger.time", "x": 40, "y": 80, "f": { "type": "daily", "at": "08:00" } },
    { "id": "n2", "kind": "tool", "x": 320, "y": 60, "f": { "tool": "read_file", "path": "C:\\Users\\you\\Documents\\bank.txt" } },
    { "id": "n3", "kind": "brain", "x": 620, "y": 40, "f": { "question": "Sum it up in one line.", "input": "{{n2.text}}", "answer": "text" } },
    { "id": "n4", "kind": "out.file", "x": 920, "y": 40, "f": { "name": "summary.md", "text": "# Bank\n{{n3.answer}}" } }
  ],
  "wires": [
    { "from": "n1", "out": "then", "to": "n2" },
    { "from": "n2", "out": "then", "to": "n3" },
    { "from": "n3", "out": "then", "to": "n4" }
  ]
}
```

- `wires` are the white "exec" wires: what runs next. `out` is the pin: `then` for most boxes, `yes`/`no` for If,
  `each`/`done` for For each, `then`/`failed` for tool and brain boxes.
- Coloured data wires are written into the field itself as `{{nodeId.pin}}`. A field that is exactly one
  reference keeps the value's type (a list stays a list); words around references make text.
- Your OK, the on switch and what each trigger has seen are kept apart in `state.json`, never in the routine. A
  routine copied from somewhere else always comes in off and needs your OK. The OK is tied to a fingerprint of the
  boxes, fields and wires (not where the boxes sit), so any change needs a new OK.

## Box kinds

| Group | Kind | Fields | Gives |
| --- | --- | --- | --- |
| Starts when | `trigger.manual` | | `at` |
| | `trigger.time` | `type` (once, daily, weekly, interval), `at`, `date`, `days`, `everyMinutes` | `at` |
| | `trigger.file` | `folder`, `pattern` (`*.pdf`) | `path`, `name` |
| | `trigger.mail` | `from`, `subject` | `from`, `subject`, `text`, `id` |
| | `trigger.page` | `url`, `find`, `hours` | `before`, `now`, `url` |
| Logic | `if` | `value`, `test` (contains, equals, empty, notEmpty, yes, more, less), `with` | pins `yes`, `no` |
| | `forEach` | `list` | `item`, `index`; pins `each`, `done` |
| | `text` | `text` | `text` |
| | `lines` | `text` | `list`, `count` |
| | `wait` | `seconds` (0 to 3600) | |
| | `stop` | `failed`, `why` | |
| Tools | `tool` | `tool` plus that tool's own fields | `result`, `ok`, and the tool's outputs |
| Brain | `brain` | `question`, `input`, `answer` (text or yesno) | `answer`, `yes` |
| Results | `out.file` | `name`, `text`, `add` | `path` |
| | `out.made` | `path` | |
| | `out.notice` | `text` | |
| | `out.tap` | `text` | |
| | `out.chat` | `text` | |
| Notes | `note` | `text` | never runs, no pins; not part of the OK's fingerprint |
| Needs replacing | `todo` | `was`, `why` | made only by an import; always a red mark |

The tools a routine may use are listed in `ROUTINE_TOOLS` in `public/routine-nodes.js`. Tools that wait on a
person, always ask, run commands, drive apps or browsers, or cost money are left out on purpose.

## Running

- Every step goes through Bob's usual tool runner, so each tool's own Hand must be on and the hard limits hold.
  The routine's OK stands in for the step's card.
- The run is saved after every step (`runs\<id>\`). A run cut off by a restart carries on from its last finished
  step. A step that changes something and was cut off half-way is not run again.
- Looks and steps marked safe to repeat get a second try; changes don't. Each step has a time limit.
- Two failed runs in a row pause the routine and tap you on the shoulder.
- A routine that reads e-mail gets the mail lock (`src/mail-guard.js`): only the tools allowed after e-mail.
- Triggers are looked at once a minute (e-mail every 5 minutes, pages every 1 to 24 hours) while the Routines
  Hand is on, and wait during Quiet hours or while another person is signed in.

## Bringing in n8n workflows

**Bring in…** in the editor (`POST /api/routines { bringIn, start }`, this replicant matrix only) takes an n8n
workflow file (`{ nodes, connections }`, or `{ workflow: { ... } }` as community templates come) or a routine file
saved from Bob. Nothing from n8n runs: `public/n8n-import.js` maps steps to boxes and the result is an ordinary
routine with a new id, switched off and needing an OK. Credentials are never read (n8n files hold only their names,
which are dropped).

| n8n | Bob |
| --- | --- |
| Schedule, Cron, Interval | `trigger.time` (daily, weekly, every N minutes, at least 5; simple cron lines) |
| Gmail / IMAP / Outlook trigger | `trigger.mail` |
| Local File Trigger | `trigger.file` |
| Manual, webhook, form, chat and other triggers | `trigger.manual` (the report says what it was) |
| HTTP Request (GET), RSS Read | `tool` `fetch_page` |
| Read/Write Files from Disk | `tool` `read_file` / `write_file` |
| Gmail / Outlook (reading) | `tool` `read_email` |
| Set / Edit Fields | one `text` box per field |
| If, Filter | `if` (several tests: a row of If boxes; "not" tests swap yes and no) |
| Switch | a row of `if` boxes, first match wins |
| Split Out, Loop Over Items | `lines` + `forEach` (the wire back to the loop is dropped) |
| Wait (up to an hour) | `wait` |
| Stop and Error | `stop` |
| AI Agent, Basic LLM Chain, OpenAI / Anthropic / Gemini text, Summarize, Information Extractor, Text Classifier | `brain` (Text Classifier: `brain` + a row of `if`) |
| No-op, Merge, Respond to Webhook, HTML/Markdown/Extract from File | left out, wires go straight through |
| Sticky Note | `note` |
| Code, HTTP POST/PUT, sending e-mail or messages, other online services | `todo` (Needs replacing) |

- Formulas: `{{ $json.x }}`, `$('Step').item.json.x`, `$node["Step"].json.x`, `$input.first().json.x` become
  `{{node.pin}}` when the field matches a pin (or a known other name: `data`/`body` → `text`, `output` → `answer`).
  Anything else stays as `[[n8n: ...]]`, which `checkRoutine` marks red.
- A step that went to two places in n8n runs them one after the other; where two ways meet again (Merge), the
  earlier way leads into the later one.
- With several starts, the one that reaches the most steps comes in (or the one you pick on the report card); the
  others' own steps are left out.
- Tested on the 361 workflows in a popular community template collection: none made it crash; 44% of steps (median)
  became Bob's boxes, the rest were mostly code and online services.

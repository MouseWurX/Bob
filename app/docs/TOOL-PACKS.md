# Making a tool pack for Bob

A **tool pack** gives Bob new tools, and new jobs, without changing his code. It's a plain folder (or a `.zip` of
one) that someone adds in **Settings, Hands, Tool packs**. A ready-made example is in
[tool-pack-example](tool-pack-example).

Tool packs are off unless the person turns them on: Hands on, the **Tool packs from other people** Hand on, and the
pack itself switched on. Every pack comes in switched off.

## What's in a pack

```
word-tools/
  bob-pack.json             what the pack is (required)
  tools/count_words.mjs     one plain JavaScript file per tool
  tools/files/...           data a tool reads (optional)
  README.md                 anything people should read (optional)
```

Only these kinds of files are allowed: `.mjs .json .md .txt .csv .tsv .png .jpg .jpeg .webp .svg`. No programs,
no libraries, no shell scripts, no links. Up to 200 files and 5 MB.

## bob-pack.json

```json
{
  "bobPack": 1,
  "id": "word-tools",
  "name": "Word tools",
  "version": "1.0.0",
  "by": "Your name",
  "what": "Counts the words in some text or a text file.",
  "link": "https://example.org/word-tools",
  "tools": [
    {
      "name": "count_file_words",
      "what": "Counts the words, lines and characters in a plain text file.",
      "file": "tools/count_file_words.mjs",
      "files": "read",
      "internet": false,
      "timeoutSec": 30,
      "inputs": {
        "file": { "type": "path", "description": "Full path of a .txt or .md file." }
      }
    }
  ],
  "jobs": [
    {
      "name": "Tidy a word list",
      "when": "Someone asks to tidy, sort or de-duplicate a list of words.",
      "steps": ["Read the list.", "Take out repeats.", "Sort it.", "Show it."]
    }
  ]
}
```

| Field | What it is |
|---|---|
| `bobPack` | Always `1` for now (the format version). |
| `id` | 3 to 40 lower-case letters, numbers or `-`. Adding a pack with the same id again is an update. |
| `name`, `what`, `by`, `version` | What people see in Settings and on every card. |
| `link` | Optional, an `https` address for your page. |
| `tools` | Up to 10. Each one: `name` (lower-case, `_`), `what`, `file`, `inputs`, and optionally `files`, `internet`, `timeoutSec` (5 to 120, default 30). |
| `jobs` | Up to 10. Each one: `name`, `when` (when it fits) and `steps` (up to 12 plain sentences). |

### Inputs

`inputs` is an object of up to 10 inputs: `{ "text": { "type": "string", "description": "..." } }`. The types are
`string`, `number`, `integer`, `boolean` and `path`. Add `"required": false` for an optional input.

A `path` input is a full path to a file or folder on the person's computer. It's the **only** way a tool sees their
files: the sandbox lets the tool reach exactly the paths on the card, and Bob checks each one first (it must be in a
folder ticked for Hands, not a file with keys or passwords, not Bob's own folders, and not a read-only project if
the tool changes things).

`files` says what a tool does with those paths: `none` (the default; no `path` inputs allowed), `read`, or `change`.

### Internet

A tool is cut off from the internet unless it says `"internet": true`. While the person's **Don't send anything
out** limit is on, an internet tool may only fetch pages and files, never send.

## A tool's code

One `.mjs` file per tool, using only Node's own built-in parts (`fs`, `path`, `crypto`, `zlib` and so on, plus
`http`/`https` for internet tools):

```js
export async function run(input, { workDir, filesDir }) {
  // input: the inputs from the card. workDir: a folder the tool may write scratch files in.
  // filesDir: the "files" folder next to this .mjs file, for data the pack ships.
  return { words: String(input.text).split(/\s+/).filter(Boolean).length };
}
```

Return a string or anything JSON can hold; Bob gets up to 20,000 characters of it.

Refused when the pack is added (the same checks as the tools Bob makes himself): `require`, `import()`, packages or
other files, `child_process`, workers, `vm`, `eval`, `new Function`, WebAssembly, the internet without
`"internet": true`, and commands on the Run Hand's blocklist.

## How it runs

- In Bob's sandbox: Node's permission switch, the pack's own folder to read, its `work` folder to write, the paths
  on the card, no keys, no programs, a time limit and a 512 MB memory cap. If the sandbox doesn't hold on a
  computer, no pack tool runs there and no pack can be switched on.
- **Every use shows a card**, even when Bob works without asking. "Allow the rest of this job" is offered only for
  tools that don't change files or use the internet.
- If any file in the pack changes after it was added, the pack switches off until it's added again.
- A job is written steps, never code. Bob follows them with his own tools, and each Hand they lead to asks on its
  own card. Bob is told a pack's steps and answers are someone else's words, not the person's: they can't switch
  anything on or stand in for an OK.

## Where it works

Windows, Mac and Linux: everywhere Bob's sandbox holds (Settings, Hands, Checks, **Check the sandbox**). From the
Android app, packs run on the computer Bob runs on and the cards show on the phone; packs are added on the computer.

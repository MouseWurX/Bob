# Bob settings style guide

Owner: the clarity reviewer (design thread "Review Bob changes for clarity").
Every handover that changes user-facing text, a setting or a default must carry
`Settings review: approved by <reviewer>`. Pure fixes carry `Settings review: n/a`.
Builds without that line don't ship.

## How to ask for review
Send the reviewer:
- what changed
- the exact on-screen words: label, hint, button text, tooltip, status and error text
- the default value, and which page and section it goes on
- a screenshot or mockup if you have one

Verdicts are **Approved**, **Approved with edits** (make the listed edits, no second round needed) or **Not yet**.

## Rules

1. **Plain English.** Name a setting by what the person gets, not by how it works ("Free up memory when Bob is idle", not "Unload model on idle"). The app chrome uses no in-jokes. Bob's persona, the clan names and Patches belong in his replies, not in labels.
2. **Explain jargon.** In Advanced a technical word is fine if a plain phrase sits next to it: "Speculative decoding: a small brain guesses ahead and the big one checks". Everyday pages have no jargon at all.
3. **One-line hints.** Keep each hint to one sentence, about 15 words. Anything longer goes behind **More**.
4. **The label says what "on" means.** A switch reads as a statement that is true when it's on ("Launch at start-up"). Don't use negatives ("Don't …") or unclear pairs ("Mode: A/B").
5. **Show the current value.** Every row shows what it's set to right now, without opening anything.
6. **Opt-in and safe defaults.** Anything automatic, background, network, cloud, download, file or app-control setting ships **off**. Where that helps, the hint says "Off unless you turn it on." Defaults never cost the person data, money or GPU memory they didn't ask for.
7. **Simple or Advanced.** Both views hold every setting; the toggle only changes how they're laid out. Simple is eight topic cards, Advanced a side list. A new section goes on one card and in one group (public/settings-map.js).
   Which panel a setting belongs in:
   - **Everyday** is for things a non-technical person would change in the first week: voice, look, colours, animations, cat's name, one brain, start-up, updates.
   - **The other panels** are for the rest, sorted into Brains, House style, Voice details, Look & feel, Speed & memory, Engines, Bob-Net, Online services, Other apps, Hands, Housekeeping, Check-ins and Remove Bob.
   - Models go on **Get models**. Live work goes in **Now running**, Tasks and Downloads.
8. **Use the same names everywhere.** Use the words in the glossary below, and don't invent synonyms.
9. **Use units people know.** Write GB, seconds, minutes and "about 20 seconds". Keep tokens, ports and flags to Advanced, each with a gloss.
10. **Big targets that work over Parsec.** Make clickable things at least 32 px tall with a visible word, and keep at least 8 px between them. No action should be hover-only. Make focus easy to see.
11. **Status in words, not only colour.** Use the tags Running, Queued, Needs you, Paused, Failed and Done. They must read in High Contrast.
12. **Errors say how to fix it.** Say what happened and the next step, with no apology and no vague "something went wrong".
13. **Buttons are verbs.** Write "Download 20 GB", "Check for updates" or "Run first-time setup", not "OK" or "Go". Confirmations name the cost.

14. **Always there, always fillable.** A setting never appears, disappears or locks because a box isn't ticked. Draw every control all the time, save its value while the feature is off, and let it take effect when the feature is switched on. Only when something truly can't work on this replicant matrix (no key, wrong system) may a control be greyed out, with one line saying why. Buttons that do something right now (run, pair, check) may wait for their switch, with a line saying so.

## Glossary (use these words)
| Say | Not |
|---|---|
| Brain | model (on Everyday pages), LLM |
| Get models | cellar, shop, store |
| Now running | activity, status panel |
| Tasks | queue, notice board, jobs list |
| Downloads | download manager |
| Session (Normal, Art, Coding, Office, Gaming) | mode, profile |
| Colours | theme (on Everyday pages; "theme" is fine in the theme editor) |
| Bob's look | avatar, sprite |
| Hands | tools, actions |
| Brains (Settings) | model roles, who does what |
| Graphics memory, graphics card | VRAM (on Everyday pages) |
| RAM | system memory, main memory |
| Settings / Simple, Advanced | preferences, config |

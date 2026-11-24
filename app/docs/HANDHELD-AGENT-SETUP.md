# Setting up Bob on a Windows handheld: steps for a helper agent

Setting up Bob on a Windows handheld whose graphics are built in and share memory with Windows, written so an AI agent (Claude, ChatGPT or another) can follow it step by step. It works for a person too. Follow the steps in order.

## Which handhelds this covers

| Handheld | Chip | Status |
|---|---|---|
| Lenovo Legion Go (16 GB) | AMD Z1 Extreme, Radeon 780M | **Tested** (Nov 23, 2026). The numbers below come from it. |
| ASUS ROG Ally, Ally X; Lenovo Legion Go S; other AMD Z1/Z2 or Ryzen handhelds | AMD, Radeon built-in graphics | Unproven in our lab, as we have yet to test. Same kind of chip and memory as the Go, so the steps should hold; speeds will differ. |
| MSI Claw and other Intel handhelds | Intel Arc built-in graphics | Unproven in our lab, as we have yet to test. The steps are the same, but we haven't checked how Bob sizes brains on Intel graphics. |

Speeds and brain sizes depend on total memory: a 24 GB handheld (like the Ally X) has more room than a 16 GB one. Step 2's free-memory check is what decides, not the model name.

> **Read this first: don't set custom settings.**
> Bob sizes everything on a handheld by itself: how much of the brain goes on the graphics, the chat memory, the reading step, and when the picture reader rests. Hand-set values can break that. As the agent:
> - **Leave Bob's defaults alone.** Keep **Engine tuning** on Bob's own pick. Don't switch on the Conductor, Turbo or any Lab switch.
> - **Don't touch the engine.** That means no layer counts, batch or step sizes, engine flags, environment variables, edits to `settings.json`, BIOS or graphics-driver settings.
> - **Only three things:** install or update Bob, pick a recommended brain from Bob's own catalogue, and check that it works.
> - **If something fails, report it. Don't tweak it.** Save a help bundle (step 7) and hand it over.
> - **If settings were changed by hand earlier,** ask the user which ones, and with their OK set each back to the default shown in Bob's Help (F1).
>
> **Stay safe on the PC.**
> - Ask the user before every download or install.
> - Never delete anything.
> - Never open, read or print keys, passwords or passcodes.
> - Don't change Windows or BIOS settings.

## 1. Install or update Bob (1.5.253 or newer)

1.5.253 is the first version with all the built-in graphics fixes:
- brains fit when free memory is tight;
- part-processor brains are memory-mapped, which saves 0.5 to 0.9 GB;
- the picture reader rests when memory is tight;
- 0.5 GB is kept for Windows by default.

- **Bob already installed:** go to Settings, **This replicant matrix and updates**, **Check for updates**, then **Update Bob**.
- **New install (ask first):**
  1. Download `Bob-1.5.253-win-x64.zip` from the [1.5.253 release](https://github.com/MouseWurX/Bob/releases/tag/v1.5.253).
  2. Check it against the `.sha256` file next to it.
  3. Right-click the zip, choose Properties, tick **Unblock**, and unzip it to a folder the user will keep.
  4. Start **Bob.exe** and follow Welcome's **Get Bob ready**.

## 2. Check the free memory

On a handheld, the graphics and Windows share the same memory, so free memory decides which brain fits.

1. Close games, browsers and video players.
2. Open Task Manager, then Performance, then Memory, and read **Available**. Read Available, not "Free".

| Available with Bob open, before a brain loads | What fits well |
|---|---|
| 6 GB or more | Any brain in the table in step 3 |
| 4 to 6 GB | Gemma 4 E2B or Qwen3.5 2B |
| Under 4 GB | Qwen3.5 2B. Close more apps first. |

Tell the user the number. Don't change the BIOS graphics memory setting (UMA) to make room. That's the user's choice, and Bob works with the default.

## 3. Pick a brain (ask before downloading)

Pick from Bob's own catalogue (the Brains page, or Welcome's starter set for built-in graphics), not a file from elsewhere. These were measured on a 16 GB Legion Go (Z1 Extreme, 780M graphics) on Nov 23, 2026, with the whole brain on the graphics. Other handhelds are unproven in our lab, as we have yet to test, but the order of the brains should hold:

| Brain (catalogue name) | Writes | Reads a 4K paste | Lowest Available seen | Notes |
|---|---|---|---|---|
| **Gemma 4 E2B** | 42-46 tokens/s | ~1,850 tokens/s | 3.7 GB | Best all-rounder. It reads pictures too. |
| **Qwen3.5 2B** | ~50 tokens/s | ~1,100 tokens/s | 5.5 GB | Lightest and fastest. Best when memory is short. |
| Qwen3 4B Instruct | 22-28 tokens/s | ~390 tokens/s | 4.0 GB | Smarter but slower. Only with 6 GB or more Available. |

**Not recommended on a handheld:** Inkling 2 Mini, and anything 8 GB or bigger. Inkling's smallest size ran out of memory on a 2,500-token paste even with every other app closed. The bigger starter brains (Qwen3.6 35B and the like) are for desktop cards.

Splitting a brain between graphics and processor is much slower on a handheld (Qwen3 4B split wrote 8-10 tokens/s against 22-28 whole). Bob already puts the whole brain on the graphics when it fits, so **don't force a split or processor-only placement**.

## 4. Settings to check (look, don't change)

These should already be at their defaults. If one isn't, ask the user before you set it back.

- Settings, Brains, **Memory kept for Windows**: **0.5 GB**.
- **Engine tuning**: Bob's own pick, not hand-set values and not the Conductor.
- Turbo and Lab switches: **off**.

## 5. Check it with a test chat

1. Start a new chat with the brain you picked and ask something short, like "What's the capital of Canada?"
2. The first load takes a while. After that, a short reply should start within a few seconds.
3. Paste a page of text (about 2,000 words) and ask for a summary.
4. Watch Task Manager while it runs. **Available should stay above about 1.5 GB.** "Shared GPU memory" rising is normal.
5. Tell the user the writing speed if Bob shows it, and roughly how long each reply took.

**Pass:** both replies make sense, nothing freezes, and Available stays above 1.5 GB.

**Heat:** handhelds run hot under load (80-90 °C is normal on long replies). Plugging in and using a performance power mode helps.

## 6. If you see "brain too large" or out of memory

Don't change engine settings. In order:

1. Close other apps, especially games, browsers and video, and try again.
2. Check you're on 1.5.253 or newer (step 1).
3. Switch to a smaller brain from the table: Gemma 4 E2B, then Qwen3.5 2B.
4. Restart Bob once.
5. Still failing? Save a help bundle (step 7) and report it.

Bob shrinking the chat memory (down to 8K) or loading without the picture reader is normal on a handheld. That's how it makes room. Sending a picture brings the reader back.

## 7. Collect logs and report back

1. Go to Settings, **This replicant matrix and updates**, **Save a help bundle**. It makes one zip. `HANDOFF.md` inside is written for an agent to read first. Names, folders, passcodes, keys and addresses are taken out before it's saved, and nothing is sent anywhere.
2. Ask the user to look the zip over and attach it to a new issue on [Bob's GitHub](https://github.com/MouseWurX/Bob/issues).
3. Add, in plain words:
   - the Available number from step 2;
   - the brain picked;
   - what you did;
   - the exact message Bob showed.

Don't paste keys, account names or folder paths from the PC into an issue.

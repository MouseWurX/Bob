# Bob: the user guide

This guide is for everyone, not just programmers. You don't need to type commands or understand AI to use Bob. If a word is new to you, there's a short glossary at the end.

Bob is a helper who lives on your own PC. He chats, plans, researches, writes and fixes code, looks at pictures, paints new ones, edits them, makes short video clips and talks out loud. He does all of it on your own computer, so your chats and files stay with you.

Two promises run through everything Bob does:

- **Nothing leaves your PC unless you say so.** Bob only goes online to download something you picked, to search the web if you turned on **Let Bob search the web**, or to use a cloud helper you switched on yourself.
- **Nothing extra is switched on until you switch it on.** Anything optional starts off. Bob may suggest something, but you decide.

---

## 1. Getting started

1. Download Bob's zip from the Releases page. Right-click it, choose Properties, tick **Unblock**, then unzip it somewhere you'll keep and double-click **Bob.exe**.
2. Bob opens in his own window. The first time, he looks at your graphics card and suggests a **starter set**: the models that suit your PC.
3. Click **Equip starter set**, look over the list, and confirm. Every download shows a progress bar, its size, its speed and how long is left.
4. If you want Bob to look things up online, click **🌐 Web search** next to Effort, under the chat (the same switch, **Let Bob search the web**, is in Settings). It's off until you do.
5. When the downloads finish, say hello. You can ask Bob himself how to set anything up: he knows all his settings and what's set right now.

You can close Bob while things download. Unfinished downloads wait, paused, and carry on when you press Resume.

### What do I need?

- Windows 10 or 11 (64-bit).
- **32 GB of memory (RAM)** is what the starter sets are planned around. Less can work for chat, but pictures and video need the room.
- Space on your drive: about 8 GB for the basics, 30 to 60 GB if you want pictures and video too.
- A graphics card is **optional**. Bob can chat, plan, research, read pictures and talk with no graphics card at all. An NVIDIA card makes him much faster and lets him paint and film.

---

### Bob on a Mac

Bob runs on Macs with Apple Silicon (M1 and newer), using the Mac's graphics (Metal).

1. Download `Bob-<version>-mac-arm64.zip` from the releases page, open it, and drag **Bob** into Applications.
2. The first time, macOS says it can't check Bob (he isn't signed with a paid Apple developer account yet). Open **System Settings > Privacy & Security**, scroll down and click **Open Anyway** next to Bob. Once only.
3. Bob keeps his things in `~/Library/Application Support/Bob/home`.

On a Mac, llama.cpp and stable-diffusion.cpp download as usual. whisper.cpp and Piper have no Mac builds Bob can use (hear through Ollama or a cloud helper; speak with Kokoro voices). Install FFmpeg (Homebrew) and LibreOffice yourself and Bob finds them. The Apps Hand, Defender scans, the Gaming card switch, Windows Task Scheduler, Check this PC and Update Bob are hidden; the Security Hand checks the firewall, FileVault, Gatekeeper, System Integrity Protection, login items and listening programs instead. To update, replace Bob in Applications with the newest zip; to remove him, drag him to the Bin (and the folder above, if you want everything gone).

## 2. Finding your way around

Bob's window has three parts:

- **The menu on the left.** New chat, Chat, Tasks, Downloads, References, Made by Bob, Topics, Tidy up, then Get models, Settings, Style and **Help** (or press F1), the Listen, Read aloud and Alerts switches, and the Session picker at the bottom. Fold it down to icons with the ‹ button (or Ctrl+B).
- **The chat in the middle.** Type and press Enter. Shift+Enter starts a new line.
- **Now running on the right.** What Bob is doing, what's downloading, and how full your graphics card and RAM are. Hide it with Ctrl+J.

At the top of the chat, the brain label shows how much memory **Bob's brain** takes. The Memory meters in Now running show the **whole** graphics card and RAM (Windows, games, other apps and Bob's picture model too), so the meters are bigger. The line under the meters shows Bob's share, and his brain there matches the label.

Handy things in the chat:

- Every message and every piece of code has a **Copy** button. This helps a lot over remote desktop apps, where right-click and Ctrl+C often don't work.
- Links and files Bob mentions are **clickable**. Everything he makes or saves, and every file he mentions, gets a card with a preview (the picture, a player, or the first lines of a document).
- Click a card, or **View**, to open it in the **side panel** beside the chat, in its own tab. **Made by Bob** in the left menu lists everything he has made, newest first, with Pictures / Clips / Sounds / Documents filters and a search box. You can also ask him: "show me the last picture". In the panel, **Open in its app**, **Show in folder** and **Copy path** do what they say. Web pages he writes are previewed with scripts off. Esc closes the panel. On a narrower screen the panel takes Now running's place; click Now running to switch back.
- 📎 attaches a picture, and 🎙 lets you talk instead of typing.
- You can send as many messages as you like. Each one becomes a task, and Bob works through them in order. None get lost.

### Settings, Get models and Style

These open as a page in the middle of the window, in place of the chat. **← Back to chat** (or Esc, or Chat in the menu) takes you back. A bar along the top of the page, which stays put while you scroll, jumps between Equip Bob, the model pages, Style and Settings, so clicking Bob's picture gets you everywhere too.

- **Get models:** Equip Bob, the model shops (Voice & conversation, Coding, Seeing pictures, Pictures & video) and **On this PC**.
- **Settings** starts as one short page showing what's set now: Bob's voice (with **Play sample** and **Change**), his look, the colours, animations, the cat's name, one brain, launch on start-up, Projects, **Where Bob saves things**, **Let Bob search the web** and checking for updates (all three off unless you turn them on), and the version, graphics card and disk space, with **Check for updates**, **Run first-time setup** and **Check this PC**.
- **Show advanced settings** (off unless you turn it on, and remembered) adds a search box and the rest: Brains (model roles, session brains, context), Voice details, Look & feel, Engines & speed, Connections (ComfyUI, cloud helpers), Hands, Housekeeping and Remove Bob. Longer explanations fold behind **More**.

---

### Making Bob faster on your PC

- **Check this PC** (Settings, bottom of the Everyday page) looks for things that slow Bob down and shows how to fix each one: memory below its rated speed (turn on EXPO or XMP in the BIOS), an old NVIDIA driver, a laptop on battery, models on a slow drive, other apps holding graphics memory. Bob only looks; he never changes Windows or driver settings.
- **Test Bob's speed** (Advanced, Engines & speed) times the first word and the full answer, and keeps your last results so you can compare before and after a change.
- Three switches, off until you turn them on: **Get Bob ready while you type**, **Let games go first** and **Match picture settings to my graphics card**.

## 3. Equip Bob: choosing his models

Bob uses different AI **models** for different jobs, the way a person might use a different tool for each task. **Equip Bob** shows them like a character sheet in a game: a picture of Bob with a slot for each job.

**To open it**, click Bob's picture (or click **Get models** in the left menu: it opens on Equip Bob).

### The slots

| Slot | What it does |
|---|---|
| 🧠 Brain | Thinks, chats and plans. Everything else hangs off this one. |
| ⚡ Quick brain | A small, fast brain for Low effort and the Art session. |
| 🔭 Deep thinking | The strongest thinker, for Medium, High and Extreme effort. Optional. |
| 🔨 Coding | Writes and fixes code. If it's empty, the Brain codes. |
| 🧐 Review | Checks code and plans before you rely on them. Optional. |
| 👁 Seeing pictures | Looks at pictures and screenshots you attach. |
| 🗂 Memory (finding past chats) | Helps Topics and search find things by meaning, not just exact words. |
| 👂 Hearing you | Turns your voice into text. |
| 🔊 Voice | Reads his replies aloud. |
| 🎨 Painter | Paints new pictures. |
| ✂ Picture editor | Changes a picture you give him, or keeps a character looking the same across pictures. |
| 🎞 Video | Makes short clips. |
| 🎵 Music and 💥 Sound effects | Optional extras. |

### How to equip something

- **Click a slot**, then click a model in the list to put it there. You can also **drag** a model onto a slot.
- Models already on your PC are ready to go. Models you don't have yet show a **Get** button. Nothing downloads until you confirm.
- **One model can fill several slots.** For example, Gemma 4 E4B can be the Brain, the Quick brain, Seeing pictures and Hearing you all at once. Bob offers this with "Also use it for…". That's the trick that makes small PCs work well.
- To empty a slot, use the **✕** on it. The Brain can't be emptied, because Bob needs something to think with.
- The bar along the bottom shows whether everything fits on your graphics card at the same time. If it doesn't, that's fine: Bob takes turns, putting one model away while another works.
- Prefer a plain list? There's a button for that at the top.

Each slot only lists models that can do its job: a brain that can't see pictures never shows under Seeing pictures, and a big brain never shows under Quick brain.

### Recommended, Fits your card, Doesn't suit this PC

- **★ Recommended for this job on your PC:** Bob's pick for that slot. For brains, a model scores higher the more jobs it covers (fewer brain swaps) and the less graphics memory it takes, and much lower if it would spill into RAM. Bigger brains get a bonus for jobs that need careful thinking. On small cards (8 GB or less), a brain that fills most of the card scores lower, because it leaves no room for longer chats. For pictures, video and voices, the pick comes from the starter set for your card.
- **Fits your card:** runs well here too, just not the first pick.
- **Doesn't suit this PC:** needs more graphics memory or RAM than you have. These are hidden until you turn on **Show models that don't suit this PC** (off unless you turn it on), and each says why.

The same picks show on every Get models page, under **Bob's picks for this PC**. There's more in Help (left menu, or F1).

### Starter sets

A starter set is a ready-made selection for your kind of PC. Bob picks the right one by reading your graphics card. You can untick anything you don't want before you confirm.

Everything in the starter sets is free to use, **including for commercial work** (selling what you make).

**The base, for every PC (no graphics card needed):**

| Job | Model | Download |
|---|---|---|
| Brain, Quick brain, Seeing pictures, Hearing you | Gemma 4 E4B | about 6.6 GB |
| Voice | Kokoro (22 natural English voices) | about 0.4 GB |
| Memory (finding past chats) | Nomic Embed Text | about 0.3 GB |

With just these, Bob can chat, plan, research the web, read pictures, hear you and talk back.

**Add-ons by graphics card:**

| Job | 16 GB card or more | 8 GB card | 6 GB card (most laptops) |
|---|---|---|---|
| Brain | Gemma 4 26B | Gemma 4 E4B | Qwen3 4B (light, leaves room for longer chats; Gemma 4 E4B still sees pictures and hears you) |
| Coding | Qwen3 Coder 30B | Qwen3 Coder 30B (slower, runs mostly in RAM) | Qwen2.5 Coder 7B |
| Painter | Z-Image Turbo | Z-Image Turbo, 8 GB version | Z-Image Turbo, 6 GB version |
| Picture editor | Qwen Image Edit | FLUX.2 klein 4B | FLUX.2 klein 4B, 6 GB version |
| Video | Wan 2.2 5B | Wan 2.2 5B, small card version | the same, left unticked (very slow) |

The "8 GB" and "6 GB" versions are the same models **squeezed** to fit smaller cards. Pictures lose a little fine detail but look much the same.

**How long things take** on a small card is a rough guess for now (these haven't been timed on every card yet). On an 8 GB card, expect roughly half a minute to a minute per picture, a minute or two per edit, and ten minutes or more for a few seconds of video. A 6 GB card is slower again. While Bob paints, he puts his chat brain away to make room, so chat waits until the picture is done.

---

## 4. Bob's personality

Bob has a dry, curious, slightly nerdy personality. You can turn that up or down.

Click Bob's picture and look at **Attributes** on the left. There are eleven dials, each from 0 to 4. The middle (2) is Bob as he comes.

| Dial | Low end | High end |
|---|---|---|
| Dry wit | Plain | Bone dry |
| Puns | None | Relentless |
| Tangents | On rails | Scenic route |
| Outlook | Gloomy robot | Sunny |
| Nerd references | Hidden | Full nerd |
| Talkative | Terse | Chatty |
| Manner | Formal | Casual |
| Copied-mind musings | Never | Often |
| Builder itch | Calm | Must build |
| Curiosity | Just the job | Endlessly curious |
| Ambition | Keeps quiet | Ambitious |

As you move a dial, Bob's **greeting** changes so you can hear the difference right away. There are presets too, such as *Replicant on a deadline* (short and to the point), *Butler mode* (formal and polite) and *Pun-dit* (you've been warned). **Reset to Bob** puts everything back.

Bob also knows what he looks like. Change his look under **Style** and he'll comment on it, once.

---

## 5. Sessions: matching Bob to what you're doing

At the bottom of the menu is the **session** picker. A session tells Bob how to share your PC with you.

- **Normal:** everyday use.
- **Art:** Bob keeps chatting on his Quick brain so the big graphics work (painting, video) gets the card.
- **Coding:** the Coding brain leads.
- **Office:** documents, spreadsheets and planning.
- **Gaming:** keeps the graphics card for your games. How much of it Bob may borrow is set in **Gaming session: graphics card** (Settings, Show advanced settings, Engines & speed): Automatic (the starting position), Never use the card, or Always borrow a little. Bob chats and listens on the processor with a small brain (Qwen3 4B Instruct 2507 to start with), which usually starts answering within a few seconds. Now and then he adds a short, sleepy scripted aside. Pictures and big jobs wait until you switch back, and Effort stays on Low. Tip: turn on **Let games go first** (Settings, Show advanced settings, Engines & speed) so Bob uses fewer cores while you play.

Session: what the graphics card is kept for. Effort: how hard Bob works on each message.

With **Let Bob pick the session** on (Settings > Everyday, on to start with), Bob moves into the session that suits the job (Art, Coding, Office or Gaming) and goes back to Normal, the lightest, once he has been quiet for 2 minutes. While something else is using the graphics card, like a game, he stays in Gaming. You can still pick a session yourself from the menu: Bob keeps it while you work, then goes back to Normal once he has been quiet for 2 minutes. To keep him in Gaming, press 🎮 Gaming next to Effort.

### Effort

Above the chat box, **Effort** sets how hard Bob works on your next messages. It goes back to Low each time Bob starts.

- **Low (Quick):** a fast answer from the Quick brain.
- **Medium (Deeper):** one big brain thinks it through. No second check.
- **High (Checked):** a big brain drafts, then Bob's reviewer copy checks it. Code problems go back for one fix.
- **Extreme (Slowest):** like High, and coding goes research, plan, then changes, with a check after each step.

High and Extreme end with **moot minutes**: who checked what, and what's still open.

---

## 6. Topics and housekeeping: Bob's memory

### Topics

**Topics** collects what you and Bob have talked about, grouped by project. Each topic has:

- a short note on where things landed (you can edit it),
- open questions,
- pictures from that topic,
- links back to the chat moments it came from.

You can rename, merge, pin and drag messages between topics. One **search box** looks through chats, summaries, topics, pictures and notes all at once. **Past chats** reopens an old conversation.

To make Bob forget something, either use **Forget** on a topic or simply say "forget what we said about…". You always see a preview first, and you can choose to keep just the short note or remove everything.

### Housekeeping (off unless you turn it on)

Long chats and old files pile up. Housekeeping is Bob tidying up while he's idle. It's **off by default**. When you turn it on, Bob can:

- sum up the older part of a long chat instead of forgetting it,
- file chats under Topics,
- move lasting facts into his memory,
- find things that haven't come up for a while: old chats, pictures and sounds he made, finished tasks, old log lines and repeated notes.

For each kind of thing you choose how old is "old" (from minutes to months), and whether Bob should **ask me first** (you get a list with a tick and a cross for each item) or **tidy automatically**.

Safety nets:

- Anything removed goes to the **Recycle Bin**, so you can get it back.
- **Pinned** chats, pictures and topics are never touched.
- Every action is written in Bob's **logbook**.

There's also a **Tidy up** button if you'd rather do it now, by hand.

---

## 7. Pictures, edits and video

Just ask in the chat: "paint a lighthouse at dusk", "make this picture look like winter", or "make a short clip of the cat stretching".

- **References:** keep pictures of characters, places and styles on the **References** shelf. Ask Bob to use one and he'll keep that look in new pictures.
- **Edits:** attach a picture with 📎 and say what to change. The **Picture editor** slot needs a model for this.
- **Video:** clips are short (a few seconds). On small cards, keep them short; Bob tells you roughly how long a job will take before he starts.

If a slot is empty, Bob tells you which model would fill it.

### Songs and sounds

Ask for a song ("a chiptune boss theme, about a minute") or a sound effect ("a creaky wooden door"). It lands in the chat as a **song player**: a round ▶ button, its title, bars showing the song's shape (click or drag along them to jump around; arrow keys jump 5 seconds), the time, **Lyrics** if it has words, **Open in Made by Bob** for a bigger player in the side panel, and **Show in folder**. Several songs in one reply play one after another, and only one plays at a time. Each song is kept as a .wav file named with the date and its title.

### Where Bob saves things

Settings, **Where Bob saves things** picks the folder for the pictures, clips, songs and sounds Bob makes. It starts as Bob's own folder (the one Made by Bob lists). **Browse…** picks another (or type one and press **Save here**), **Show in folder** opens it, and **Use Bob's own folder** goes back. Only new things go to a new folder; older ones stay put and still show in your chats. Tidy up only tidies Bob's own folder. If a picked folder goes missing (an unplugged drive), Bob saves in his own until it's back.

---

## 8. Hands: letting Bob do things on your PC (opt-in)

Hands are Bob's way of doing things for you on your PC rather than just talking about them:

- **Files:** zip and unzip, move, copy, rename, and tidy folders like Downloads.
- **Run:** run a program, command or script you've approved.
- **Schedules:** do a job at a set time.
- **Apps:** click and type in another program for you.
- **Office documents and converting:** convert files (Word, Excel, PowerPoint and OpenDocument to and from each other or to PDF; pictures; sound; video), read office files, make new documents, spreadsheets and slides, and change them (fill cells, add rows and slides, replace text, fill a template).
- **Security and privacy:** check the PC's protection, explain Defender alerts and start scans, look at suspicious downloads, scripts and emails without opening them, find and remove hidden details (like GPS in photos) before sharing, and check whether a website, link or sender is genuine from public records.

### Office documents and converting

Ask things like "turn report.docx into a PDF", "what's in budget.xlsx?", "make a 5-slide deck about the game", "set B4 to 1300 in budget.xlsx", "make this song an mp3" or "turn the clip into a GIF".

- Documents, spreadsheets and slides use **LibreOffice** (free). If LibreOffice or Apache OpenOffice is already installed, Bob finds it. If not: Settings → Show advanced settings → Engines & speed → Engine downloads → **LibreOffice** (about 350 MB, pinned version and checksum, unpacked into Bob's folder with no admin rights).
- Sound, video and WebP pictures use **FFmpeg**: one already on the PC, or **FFmpeg** in the same Engine downloads list (about 100 MB, pinned).
- Other pictures (PNG, JPG, BMP, GIF, TIFF) need nothing extra: Windows does them.
- Every file Bob makes or changes is on a card first, one row each (a new document in his own Documents folder, which shows in Made by Bob under Documents, needs no OK). Nothing is overwritten (report-2.pdf), conversions never change the original, and a file changed in place is backed up first.
- He saves only in the folders ticked for Hands, plus his own Documents folder. LibreOffice runs hidden with Bob's own settings, never runs macros in the files, and closes when the job is done; so does FFmpeg.
- He can't turn a PDF back into a good Word file, because the layout breaks. He can read its words and make a new Word document from them instead.

### Security and privacy

Bob isn't an antivirus: keep Microsoft Defender (or your own antivirus). This Hand makes him a sidekick for it. Ask things like "is my PC protected?", "what did Defender find?", "run a quick scan", "what starts with Windows?", "is this download safe?", "is this email real?" (paste it with its headers), "clean this photo before I post it", "is this website legit?", "where does this link go?" or "was Adobe ever breached?".

- Checks are read-only and change nothing. Defender scans and clean copies show a card first. Clean copies are new files (photo-clean.jpg); originals are never changed.
- Files are only read, never opened or run. Online look-ups (registration records via rdap.org, DNS, crt.sh certificate logs, Have I Been Pwned's public breach list) need **Let Bob search the web** on, and send only the site, link or address you asked about.
- **Check a password safely** (under the Hand's switch in Settings): the password is scrambled in the window and only the first 5 characters of the scramble go to Have I Been Pwned. The password never leaves the box and isn't saved.
- He never switches protection off, adds exclusions, allows or restores threats, or disables startup items (he shows you where), and he doesn't research private people.
- He also knows search operators (`"exact phrase"`, `site:`, `filetype:`, `-word`, date ranges) and uses them in all his web research.

Hands are built to be careful:

- **Every Hand is off** until you switch it on in Settings (Show advanced settings, Hands), and each one has an off switch you can flip at any time.
- **The ✋ Hands button on the chat page** (next to "Free memory when Bob is idle") is a kill switch. Click it and Hands stop at once: anything running stops, waiting cards are answered No, and the button shows *Stopped*. Click it again to let Bob carry on. It never switches a Hand on: if Hands are off in Settings it says *Off in Settings* and has nothing to stop.
- **Bob shows you exactly what he's about to do** (a preview card) and waits for your click.
- "**Allow for the rest of this job**" is something you have to choose, and it ends when the job ends.
- File changes keep an **undo** list, and anything removed goes to the Recycle Bin.
- **Hard limits**, all on to start with, each with its own switch: Recycle Bin only, keep secret files private, read-only projects stay read-only, block dangerous commands, don't send anything out, never type into password fields.
- **Let Bob work without asking** (off unless you turn it on) skips the cards. The hard limits still hold, a banner shows above the chat the whole time, and ✋ Hands stops him at once. Cloud helpers still ask.
- Some things are **never allowed**, whatever you pick: nothing that needs administrator rights, and Bob can't change his own code or settings.
- Folders you mark **read-only** stay untouched.
- Everything is written in the logbook.

Even without Hands, Bob **asks before doing anything outside his own folder**.

**Quarantine** (off unless you turn on "Let the reviewer quarantine Bob"): if Bob goes off track, his reviewer stops him and asks you whether to quarantine him. In quarantine he can talk but not act until you click **Release**.

**Self-test:** Settings → Show advanced settings → Hands → **Run the self-test** checks, in a throwaway folder of dummy files, that the Recycle Bin and Undo, tidying, running a program and Stop all work on your PC. It shows a pass or fail list in plain words and removes the folder afterwards. No Hand needs to be on, and nothing of yours is touched.

---

## 9. Voice

- **Read aloud:** Bob can speak his replies. Kokoro is the recommended voice (22 voices, runs on the processor). Every voice has a **Play** button with a short sample (the same line in each voice) that works before you download anything.
- **Talk to Bob:** with the Hearing you slot filled, use 🎙 or say "Hey Bob" hands-free (if you turn that on).

---

## 10. Optional extras (all off until you turn them on)

- **Let Bob search the web**: Bob looks things up on DuckDuckGo and reads pages when a question needs it. Only the search words and page address leave your PC. Off: he tells you when a question needs the internet and where this switch is. The same setting is the **🌐 Web search** switch next to Effort on the chat page; flip either and both change.
- **Launch on start-up**: Bob opens when Windows starts.
- **Cloud helpers**: hand a very big job to a paid online AI, using your own key. Bob asks you each time, because it costs money and sends that job off your PC.
- **Music and sound effects**: extra downloads for the audio tools.
- **Extra voices.**
- **Advanced workshop**: if you use ComfyUI, Bob can run its workflows for you.
- **Phone access** over Tailscale (advanced: set in config.json).
- **Check for updates when Bob starts.** Updating always waits for your click.

---

## 11. Updating and removing Bob

**Updating, if you downloaded the zip:** download the new zip from the Releases page and unzip it over your Bob folder. Your chats, models and settings are kept, because they live in `%LOCALAPPDATA%\Bob`.

**Updating, if you built Bob from source:** Settings → **Check for updates**. If there is one, click **Update Bob** and watch the steps. If Bob is busy, he asks whether to restart now, wait until he's finished, or leave it for later.

**Removing:** Settings → Show advanced settings → Remove Bob → **Remove Bob…**. Bob's program, his shortcut, "Launch on start-up" and the "Bob schedules" task are removed. Two boxes, unticked unless you tick them, also remove his chats and settings and the models he downloaded. Those go to the Recycle Bin.

---

## 12. When something goes wrong

| What you see | What to try |
|---|---|
| A download stopped | Press **Resume** in Now running. It carries on from where it stopped. |
| Pictures or video are very slow | Normal on small cards. Use the **Art** session, keep clips short, or turn on **Match picture settings to my graphics card**. Run **Check this PC**. |
| Bob says he can't look things up | Click **🌐 Web search** next to Effort (or turn on **Let Bob search the web** in Settings). |
| The memory numbers at the top and on the right differ | The top counts Bob's brain only; the meters on the right count the whole graphics card and RAM. The line under them shows Bob's share. |
| "Out of graphics memory" | Close games or other graphics-heavy apps, or pick the smaller (6 GB) version of the model in Equip Bob. |
| Bob can't hear you | Fill the 👂 Hearing you slot (Gemma 4 E4B does it). |
| Bob can't paint or edit | Fill the 🎨 Painter or ✂ Picture editor slot, and get the painter engine when Bob offers it. |
| Windows blocks Bob | Bob.exe is the official Electron program renamed, which Windows usually trusts. If it's blocked anyway, see the Releases page notes. |

---

## Glossary

The full glossary and an FAQ are in Help inside Bob (left menu, or F1).


- **Model:** the "brain file" that does one kind of AI job. Bigger models are usually smarter but slower and need more memory.
- **Graphics card (GPU) and graphics memory (VRAM):** the part of your PC that makes AI fast. The amount of graphics memory (6 GB, 8 GB, 16 GB) decides which models fit.
- **RAM:** your PC's main memory. Bob can use it for parts of a model that don't fit on the graphics card. It works, but more slowly.
- **Squeezed (GGUF) version:** a smaller copy of a model that fits small cards, with a little less detail.
- **Engine:** the program that runs a kind of model, for example the painter engine for pictures. Bob offers it when a model needs it.
- **Commercial use:** using what you make for money. All starter set models allow it. A few optional extras don't, and Bob marks those.

## Licences of the starter set models

| Model | Licence |
|---|---|
| Gemma 4 (E4B and 26B) | Apache 2.0 |
| Qwen3 Coder 30B, Qwen2.5 Coder 7B | Apache 2.0 |
| Nomic Embed Text | Apache 2.0 |
| Kokoro | Apache 2.0 (voices); MIT (the version Bob downloads) |
| Z-Image Turbo, all versions | Apache 2.0 |
| FLUX.2 klein 4B | Apache 2.0. The bigger FLUX.2 klein 9B and FLUX.2 dev are **not** free for commercial use, so Bob doesn't put them in starter sets. |
| Qwen Image Edit 2509 | Apache 2.0 |
| Wan 2.2 5B, all versions | Apache 2.0 |

Each model keeps its own licence, and Bob shows it, with the download size, before you confirm a download.

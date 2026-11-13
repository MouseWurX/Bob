# Bob: the user guide

Bob is a helper who lives on your own computer. He chats, researches, writes and fixes code, reads your documents, paints pictures, makes clips and songs, talks out loud and plays games. You don't need to type commands or know anything about AI to use him.

This guide is sorted by what you want to do. Start at the top, then jump to the job you came for.

Two promises run through everything:

- **Nothing leaves your computer unless you say so.** Bob only goes online to download something you picked, to search the web if you turned on **Web search**, to use a cloud helper you switched on, or to run a job on a rented brain you hired.
- **Nothing extra is switched on until you switch it on.** Bob may suggest something, but you decide. The only things on from the start are fixes that make him steadier.

![Bob's window: the menu on the left, the chat in the middle, and Now running on the right](screenshot.png)

**What do you want to do?**

| I want to… | Go to |
|---|---|
| Get Bob going for the first time | [Start here](#start-here) |
| Pick or change the brains Bob uses | [Set Bob up](#set-bob-up) |
| Ask questions, plan, look things up | [Chat with Bob](#chat-with-bob) |
| Write or fix code | [Write and fix code](#write-and-fix-code) |
| Make a picture, clip, song or 3D model | [Make a picture, a clip or a song](#make-a-picture-a-clip-or-a-song) |
| Read, write, convert or sort my files | [Work with documents and files](#work-with-documents-and-files) |
| Let Bob click, type and run things for me | [Let Bob do things on your computer](#let-bob-do-things-on-your-computer) |
| Have Bob remember things, tidy up, keep watch | [Memory, tidying and check-ins](#memory-tidying-and-check-ins) |
| Talk to Bob and hear him | [Talk out loud](#talk-out-loud) |
| Play a game | [Play](#play) |
| Use Bob from my phone or other computers | [Your phone and your other Bobs](#your-phone-and-your-other-bobs) |
| Run a brain too big for my computer | [Hire a bigger brain](#hire-a-bigger-brain) |
| Make or test my own brain | [Make your own brain: the Lab](#make-your-own-brain-the-lab) |
| Change Bob's personality, look or language | [Make Bob yours](#make-bob-yours) |
| Keep my chats and keys private, back up, move | [Privacy, backups and moving](#privacy-backups-and-moving) |
| Update or remove Bob | [Update or remove Bob](#update-or-remove-bob) |
| Fix something that went wrong | [When something goes wrong](#when-something-goes-wrong) |

Not sure where something is? Ask Bob. He knows all his settings and what's set right now. Help inside Bob (left menu, or F1) has the full details, a glossary and an FAQ.

---

## Start here

1. **Get Bob.** Download Bob's zip from the Releases page. On Windows, right-click it, choose Properties, tick **Unblock**, unzip it somewhere you'll keep, and double-click **Bob.exe**. (Mac, Linux, Android and iPhone: [What you need](#what-you-need).)
2. **Pick his home folder.** The first time, Bob asks where to keep his models, notes and settings. Take his suggestion unless you have a reason not to. See [Bob's home folder](#bobs-home-folder).
3. **Press Get Bob ready.** Bob reads your graphics card and RAM and shows one list: the programs he runs on and a model for each job, with his picks ticked. Untick anything you don't want. The button shows the total size and your free disk first.
4. **Tick what you'd like on.** Under the list, **Do you want me to:** opens on the four switches that help most; the rest of the switches that start off are folded underneath. Each tick saves at once and is the same switch as in Settings.
5. **Say hello.** You can chat while things download, or close Bob: downloads wait and carry on when you press **Resume**.

Skipped something? Just ask for it ("make a short clip of a cat"). Bob shows a **Set it up** card with what he needs and its size. One press gets it, and he carries on with your request. If a setting is in the way (web search, a Hand that's off), the card switches just that setting on.

| | |
|---|---|
| ![Get me ready: the programs and models Bob suggests, each with a tick box](screens/get-bob-ready.png) | ![Do you want me to: every switch that starts off, in one list](screens/do-you-want.png) |
| **Get me ready:** one list, one button. | **Do you want me to:** tick what you'd like on. |

### Finding your way around

- **The menu on the left:** New chat, Chat, Tasks, Downloads, References, Made by Bob, Topics, Tidy up, then Get models, Settings, Style and **Help** (or F1), the Listen, Read aloud and Alerts switches, and the Session picker. Fold it to icons with ‹ (or Ctrl+B).
- **The chat in the middle.** Type and press Enter; Shift+Enter starts a new line. 📎 attaches a file, 🎙 lets you talk.
- **Now running on the right:** what Bob is doing, what's downloading, and how full your graphics card and RAM are. Hide it with Ctrl+J.

The brain label is the one chip at the top of the chat. Press it for the quick switches: Free memory when Bob is idle, ✋ Hands, 🔓 Autonomy, 🖥 Screen use and 💭 Bob's thinking. ✋, 🔓 or 🖥 show on the label while that switch is on, and while Hands are on a **✋ Stop Hands** button sits beside it. On a phone or a window 640 pixels wide or less, a bar along the bottom has Chat, New, Tasks, Topics, Settings and More (the whole menu). The left menu is grouped into Chat, Play, Lab and Setup.

Settings, Get models and Style open in place of the chat; **← Back to chat** (or Esc) goes back. Settings has two layouts of the same switches: **Simple** (eight cards) and **Advanced** (every section down the side), with a search box in both. The little **i** buttons explain what a switch does.

### What you need

- **Windows 10 or 11** (64-bit). Bob also runs on a **Mac** with Apple Silicon, **64-bit Linux**, a **Raspberry Pi**, and as an **Android** app. The [README](../../README.md#getting-bob) has the steps for each.
- **Linux:** an AppImage, a `.deb` and a Flatpak.
- **iPhone:** nothing to download. Your computer's Bob serves the phone screen at `/phone/`; add it to the Home Screen in Safari over Tailscale, with **Let my other replicant matrices in** on.
- **32 GB of RAM** is what the starter sets plan for. Less can work for chat; pictures and video need the room.
- **Disk space** depends on your card. Get me ready shows the total first; on a 16 GB card the full set is about 105 GB, mostly pictures and clips.
- **A graphics card is optional.** Bob can chat, research, read pictures and talk without one. An NVIDIA card makes him much faster and lets him paint and film.

**On a Mac:** drag **Bob** from `Bob-<version>-mac-arm64.zip` into Applications. The first time, open **System Settings > Privacy & Security** and click **Open Anyway** next to Bob (Mac builds are ad-hoc signed; see [SIGNING-MAC.md](SIGNING-MAC.md)). Bob keeps his things in `~/Library/Application Support/Bob/home`. Brains run on plain llama.cpp. Install FFmpeg (Homebrew) and LibreOffice yourself and Bob finds them. The Apps Hand, Defender scans, the Gaming card switch and Check this replicant matrix aren't on a Mac; the Security Hand checks the firewall, FileVault, Gatekeeper and login items instead.

### Bob's home folder

Bob's **home** is one folder with his models, engines, notes, chats and settings, apart from the program. Bob suggests a `Bob` folder in your user folder; any drive works. He refuses temporary places like AppData, because a disk clean-up would take 10 to 60 GB of models with it. A cloud-synced folder (OneDrive, Dropbox, Google Drive, iCloud) is allowed, but Bob always recommends against it: every model would be uploaded, and a sync can break a model while he uses it.

To move it: Settings, **Bob's home folder**, **Browse…** or type a folder, **Move here…**, then **Yes, move everything**. Bob closes, copies everything across, and opens from the new folder. The old one is removed only once every file is over.

---

## Set Bob up

Bob uses a different **model** (a brain file) for each kind of job: one to chat, one to code, one to paint, one to hear you, and so on. One model can do several jobs, which saves swapping.

### Pick his brains: Settings, Brains

**Settings, Brains** is the one place to see and change them. It shows:

- **This replicant matrix:** what his biggest brain takes from the card, the memory and the drive.
- **How my brains are split:** **One brain** (one does everything, no swaps), **Quick + Big** (small for short answers, big for the rest), **Specialists** (a brain per job), or **Across my Bobs** (experimental). Pressing one shows what would change; nothing changes until **Apply**.
- **Brains in use:** one row per brain, its jobs as chips (**+ job** adds one, **✕** takes one off), and where it sits: Card (quickest), Memory, or Storage (slowest).
- **Set up** on a row opens that brain's page: its jobs, **Where it sits** (Auto, or By hand for brains made of experts), its **Chat memory type**, and **⏱ Calibrate**, which times it and offers the fastest setting.
- **Senses and tools:** hearing, voice, painter, picture editor, video, music, sound effects, memory and the rented brain.
- **Plain list** (top right) shows the same jobs as menus.

The jobs:

| Job | What it does |
|---|---|
| 🧠 Brain | Thinks, chats and plans. Everything hangs off this one. |
| ⚡ Quick brain | A small, fast brain for Low effort and the Art session. |
| 🎮 Gaming | Chats on the processor while you play. Only Qwen3 4B Instruct 2507 goes here. |
| 🔭 Deep thinking | The strongest thinker, for Medium, High and Extreme effort. Optional. |
| 🔨 Coding | Writes and fixes code. Empty: the Brain codes. |
| 🧐 Review | Checks code and plans. Optional. |
| 📊 Office | The all-rounder for the Office session. |
| 👁 Seeing pictures | Looks at pictures and screenshots. |
| 🗂 Memory | Finds past chats by meaning. |
| 👂 Hearing you / 🔊 Voice | Your voice to text; his replies out loud. |
| 🎨 Painter / ✂ Picture editor / 🎞 Video | New pictures; changes to a picture; short clips. |
| 🎵 Music / 💥 Sound effects | Optional extras. |

How much each session keeps in mind (its **context**, 8K to 256K) is in Settings, Brains too. More lets him read longer files and chats but uses more graphics memory. **Long memory** (off) lets Qwen brains stretch past what they were made for.

### Get more brains: the Brain catalogue

**📚 Brain catalogue** (on Get models, or **Get one** on an empty job) is Bob's full list, sorted by job and grouped by family (Qwen, Gemma, GPT-OSS…).

- **★ Recommended** is Bob's pick for that job on your computer. **Fits your card** (a green tag) sits wholly on your graphics card, the quickest place (on a Mac, **Fits in memory**). **Doesn't suit this PC** is hidden until you turn on **Show models that don't suit this PC**.
- Each model's **i** holds the rest: what it's good at, how it does on different cards, its licence and source. **Get** asks before it downloads.
- **New** = one of the five newest in its family. **Dated** = newer brains do its job better.
- **Sort and filter** (the bar at the top): Bob's order, **Best fit first** (each job as one list, quickest place first), newest or oldest, smallest or biggest; filter by who made it, quantization, and **Runs here**. **🔎 Find more models** searches Hugging Face and ModelScope.
- **Active** decides whether a model shows in the job menus. Switching one off only hides it.
- **😇 Well behaved / 🤝 Community / Naughty list:** the Naughty list holds other people's remixes with the refusals cut out. It stays greyed until you turn on **Show the naughty list**, and Bob never marks one ★ Recommended.
- **➕ Your own brains:** **Add a brain from a file** adds a .gguf already on your computer. Bob runs it from where it is and never moves or deletes it.
- **Auto-update the brain list** (off): once a day Bob reads his brain list from his GitHub page, so newer brains show up. Nothing about you is sent.

**Starter sets** are what Get me ready ticks for your card. Everything in them is free to use, including for commercial work.

| Job | 16 GB card or more | 8 GB card | 6 GB card |
|---|---|---|---|
| Brain | Qwen3.6 35B-A3B | Gemma 4 E4B | Qwen3 4B |
| Coding | Qwen3.6 35B-A3B (256K context) | Qwen3 Coder 30B | Qwen2.5 Coder 7B |
| Painter | Z-Image Turbo | Z-Image Turbo, 8 GB version | Z-Image Turbo, 6 GB version |
| Picture editor | Qwen Image Edit | FLUX.2 klein 4B | FLUX.2 klein 4B, 6 GB version |
| Video | Wan 2.2 5B | Wan 2.2 5B, small card version | left unticked (very slow) |

Every computer also gets Gemma 4 E4B (brain, quick brain, seeing, hearing; about 6.6 GB), Kokoro (voice; 0.4 GB) and Nomic Embed Text (memory; 0.3 GB). The "8 GB" and "6 GB" versions are the same models **squeezed** to fit; pictures lose a little fine detail.

### Where the things he made are

The old chest is gone: **Made by Bob** in the left menu lists everything Bob has made or saved, newest first. The folder is in Settings, **Save folder**; **Change folder…** picks another. (Before 1.5.210 the Equip Bob paper doll held the chest, the personality dials and House style. It's retired: the dials are Settings, **🎚 Personality**, and House style is Settings, **🖋 House style**.)

### Make him faster

- **Check this replicant matrix** (Settings, bottom of the Everyday page) finds what slows Bob down (slow RAM settings, an old driver, a laptop on battery, other apps holding graphics memory) and says how to fix each. He only looks; he never changes anything.
- **Test Bob's speed** (Speed & memory) times the first word and the whole answer, and keeps your results.
- **Engine extras** (Speed & memory, all off): **Prompt-lookup decoding**, **Preload the next brain**, **Laptop mode**, **Auto-test a new GPU**, **Speed history**.
- Also off to start: **Warm up while typing**, **Games first**, **Fit pictures to my GPU**.

---

## Chat with Bob

Type a question, an idea or a job. You can send as many messages as you like; each becomes a task, and none get lost.

- Every message and piece of code has a **Copy** button. Links and files Bob mentions are clickable, and everything he makes gets a card. **View** opens it in the **side panel**.
- **Look things up online:** click **🌐 Web search** next to Effort (the same switch as **Web search**). Only the search words and page address leave your computer.

### Effort: how hard he works

**Effort**, above the chat box, goes back to Low each time Bob starts.

- **Low:** a fast answer from the Quick brain.
- **Medium:** one big brain thinks it through.
- **High:** a big brain drafts, a reviewer copy checks it. Code problems go back for one fix.
- **Extreme:** like High; coding goes research, plan, then changes, with a check after each step.

High and Extreme end with **moot minutes**: who checked what, and what's still open.

### Sessions: sharing your computer

A **session** says what the graphics card is kept for. Effort says how hard Bob works.

- **Normal:** everyday use. **Art:** Bob chats on his Quick brain so painting and video get the card. **Coding:** the Coding brain leads. **Office:** documents and planning.
- **Gaming:** your games keep the card. Bob chats on the processor with a small brain and holds pictures and big jobs until you switch back. **Gaming session: graphics card** (Speed & memory) decides whether he may borrow a little.

**Auto session** (on) moves him into the right one for the job and back to Normal after 2 quiet minutes. **🎮 Gaming** next to Effort keeps him in Gaming.

### While he works

- **💭 Bob's thinking** (press the brain label at the top of the chat) opens a small window with his thinking, brain swaps and every tool step, live. Nothing in it is saved.
- **Reply between steps** (on): send a message during a long job and he answers it when the current step is done. "also …" joins the job.
- **Stop and wait words** (on): while a job runs, a short "stop", "no no", "cancel" or "belay that" stops it at once; "wait", "pause" or "hold on" pauses it; "wait 10 minutes" or "later" pauses it for later; "what are you doing?!" pauses it just in case; "go on" or "you got it" carries on. Only the whole message counts.
- **Chat while busy** (on): while he paints or works, a plain message is answered by his small brain on the processor.
- **Quick brain sees the job** (off): that small brain knows how the big job is going and can pass it a note.
- **Plan before big jobs** (off): before a job with several steps, he shows every step on one card. **Go ahead**, **Change something** or **Not now**.

### After he answers

- **Try again, Edit and Delete** (on) puts them in the **…** menu on each message. **Try again** gets a new answer, **Edit** changes your message and sends it again, **Delete** takes it out. Try again and Edit keep the old version.
- **How I got here** lists the tools Bob used. **Save as a test** keeps a reply for the Lab. **Undo changes**, in the **…** menu on your message, puts back every file, note and memory line he changed for it, for a week.
- **Edit his own messages** (off): he corrects an earlier message instead of sending a new one, marked **edited**.
- **💬 Chat extras** (off): **Try from here**, 📌 pins, and 👤 guest chats that are never saved.
- **Saved prompts with /** (off): save things you ask often, then type `/` in the message box to pick one. Blanks like `{file}` are filled in by you; `{date}` fills itself.

---

## Write and fix code

Pick the **Coding** session (or let Bob pick it), then ask: "fix the failing test in my project", "add a dark mode", "explain this function".

- The **🔨 Coding** brain leads. On a 16 GB card that's Qwen3.6 35B-A3B with 256K context, which always thinks coding jobs through.
- High and Extreme effort add a reviewer; Extreme plans and checks each step.
- **Working on repositories:** Bob reads and changes code in projects you add under Settings, Projects. Read-only projects stay read-only. Changes go through the Run and Files Hands, so every step shows a card.
- **Settings, Jobs** (all off): **Run tests after code edits** (before he says done; the command still asks first), **Clickable file:line links** (opens VS Code, Cursor or VSCodium at the line), **Steer mid-job**, **Job receipt**, and more.
- **Code sandbox** (off): for sums, dates and counting, he runs a few lines of JavaScript in a locked, empty folder.

**Let other apps use Bob's brains** (Settings, Other apps; off): coding and chat apps (VS Code with Continue, OpenCode, your own scripts) use Bob's brains through `http://localhost:7777/v1`, with the key Bob makes (**Key for other apps**). Use the brain `bob`, or a name from `/v1/models`. From the command line: `bob ask "question"`, `bob status`, `bob models`. **Let apps on my other devices in too** (off) lets your Tailscale devices in. Web pages are always refused, and nothing is logged.

**Let Claude use Bob's hands** (off): Claude Desktop or Claude Code can use Bob's Hands, each step asking as usual.

---

## Make a picture, a clip or a song

Just ask: "paint a lighthouse at dusk", "make this picture look like winter", "a short clip of the cat stretching", "a chiptune boss theme, about a minute", "a creaky wooden door".

- **Pictures** use the 🎨 Painter. **Edits:** attach a picture with 📎 and say what to change (needs a ✂ Picture editor). **Clips** are a few seconds long; Bob says roughly how long a job will take first.
- **References:** keep pictures of characters, places and styles on the **References** shelf. Ask Bob to use one and he keeps that look.
- **Songs and sounds** land in the chat as a **song player**: ▶, the song's shape (click to jump), **Lyrics**, **Open in Made by Bob** and **Show in folder**. Each is kept as a .wav file. Music is an extra download (about 22 GB with its tools).
- **Flowcharts and diagrams:** ask for one and he draws it in the chat.
- **House style** (Settings): your defaults for music, pictures, clips and times.
- On small cards, expect half a minute to a minute per picture on 8 GB, ten minutes or more for a few seconds of video. While Bob paints, chat waits.

**Where things go:** **Made by Bob** in the menu lists everything, newest first, with filters and a search box. Settings, **Save folder** picks the folder for new pictures, clips and songs. Only new things go there; older ones stay put.

**3D:**

- **3D parts** (off): ask for a bracket, a box or a spacer. Bob writes it as an OpenSCAD recipe in millimetres and makes an STL for a 3D printer. OpenSCAD is about 30 MB from Settings, Engines.
- **Pictures to 3D models** (off): ask for a figurine or a prop; TRELLIS.2 turns a picture into a textured GLB model in 1 to 5 minutes. Needs an NVIDIA card (16 GB is best; RTX 20 to RTX 50) and the 3D workshop (about 28 GB). On a Mac, send the job to a PC Bob over Bob-Net.
- The side panel's **3D viewer** opens STL, OBJ and GLB files: drag to turn, scroll to zoom.

**Advanced workshop:** if you use ComfyUI, Bob can run its workflows for you (Settings, Other apps).

---

## Work with documents and files

- **Read and search documents** (off): Bob reads Word, Excel, PowerPoint, OpenDocument, PDF, e-book and Rich Text files, and searches inside them, in Documents, Desktop and Downloads. Nothing leaves your computer.
- **Semantic document search** (off): also finds files that mean what you asked in other words. The index keeps file names and numbers, never the words.
- **Documents in the side panel** (off): **View** opens Word, Excel, PowerPoint and PDF files beside the chat.
- **Quick notes** (off): say "note: …" in any chat and he writes it in `quick-notes.md` with the date. Ask for your notes, or find them by a word or #tag.
- **Export and import chats** (off): save a chat, or bring in chats from ChatGPT or Claude.
- **Render maths** (off).
- **🧰 More tools** (Settings, How Bob works; all off): a calculator, Python in the sandbox, passwords made safely, repeating reminders, reading your email and calendar (read-only), watching web pages, calling web services, asking questions of data files, charts, spelling and grammar, meeting recordings to notes, and comparing files.

### Office documents and converting

Ask: "turn report.docx into a PDF", "what's in budget.xlsx?", "make a 5-slide deck about the game", "make this song an mp3". This is the **Office documents and converting** Hand.

- Documents use **LibreOffice** (free). If it isn't installed: Settings, Engines, Engine downloads, **LibreOffice** (about 350 MB). Sound and video use **FFmpeg** (about 100 MB, same list).
- Every file Bob makes or changes shows on a card first. Nothing is overwritten (report-2.pdf), and the original never changes.
- He can't turn a PDF back into a good Word file. He can read its words and make a new one.

### Sort and rename

Ask: "sort my music folder" or "put my downloads where they belong". Switch on **Sort and rename** (Settings, Hands) and tick the folders he may use.

- **Sort and rename: naming rules** has a rule per kind of file. Words in curly brackets fill in from the file: `{artist}/{album}/{track} {title}` gives `Queen/A Night at the Opera/11 Bohemian Rhapsody.mp3`.
- **Send to** moves that kind of file into a ticked folder, so Downloads can feed your Music folder.
- The card lists every rename. Nothing is overwritten, and **Undo** puts everything back.

---

## Let Bob do things on your computer

**Hands** let Bob do things instead of just talking about them. Every Hand is off until you switch it on (Settings, Hands).

| Hand | What it does |
|---|---|
| Files | Zip, unzip, move, copy, rename, tidy folders. |
| Sort and rename | Rename and file music, video and photo collections. |
| Run | Run a program, command or script you've approved. |
| Schedules | Do a job at a set time. |
| Apps | Click and type in another program. |
| Use a browser | Bob's own browser window. |
| Office documents and converting | Make, read, change and convert files. |
| Security and privacy | Check your computer's protection, look at suspicious files and emails. |
| Make his own tools | Bob writes small tools for himself. |
| Connected apps (MCP) | Work inside Unreal Engine, Blender and other apps with an MCP add-on. |
| Tool packs from other people | Tools and jobs someone else made for Bob. |

### How Hands stay safe

- Bob shows exactly what he's about to do on a card and waits. "**Allow the rest of this job**" is your choice, and it ends with the job.
- **✋ Hands** on the chat page stops everything at once. It never switches a Hand on.
- **Hard limits** (all on, each with its own switch): Recycle Bin only, keep secret files private, read-only projects stay read-only, block dangerous commands, don't send anything out, never type into password fields.
- **Let Bob work without asking** (off) skips the cards. The hard limits still hold, and a banner shows the whole time.
- Never allowed: anything that needs administrator rights, or Bob changing his own code or settings.
- File changes keep an **undo** list; anything removed goes to the Recycle Bin. Everything is in the logbook.
- **Run the self-test** (Settings, Hands, Checks) checks in a throwaway folder that the Recycle Bin, Undo and Stop work on your computer.
- **Quarantine** (off): if Bob goes off track, his reviewer can stop him until you press **Release**.

### Use a browser

Ask: "open the Blender release notes and tell me what's new". Switch on **Use a browser**. A window titled **Bob is browsing** opens; it has its own cookies, and your own browser is never touched.

- Bob reads a page as text with numbered links and buttons, then does one thing at a time. Each action is a card.
- While **Don't send anything out** is on, he only types into search boxes and never presses Send, Post, Buy or Upload.
- **Eyes checks:** with a vision brain in "Seeing pictures", he looks at the page after a step to check it worked.
- **Forget what Bob's browser knows** clears its cookies and sign-ins.

### Connected apps (MCP)

Install the app's MCP add-on first (Blender MCP, or your Unreal MCP plugin). Then switch on **Connected apps (MCP)**, use **Add a connected app** (**Fill in for Blender** / **Fill in for Unreal Engine**) or **Paste a setup from another app**, press **Check**, and tick **On**. Every step shows a card; tools that run code inside the app always ask.

### Tool packs from other people

A tool pack is a folder or .zip with a `bob-pack.json` and a little JavaScript ([TOOL-PACKS.md](TOOL-PACKS.md)). Settings, Hands, **Tool packs**: type its path and press **Add pack**. Packs come in switched off, run in the sandbox, and always ask. If a pack's files change, it switches off.

### Security and privacy

Bob isn't an antivirus; keep Defender. Ask: "is my computer protected?", "is this download safe?", "is this email real?", "clean this photo before I post it", "is this website legit?". Checks are read-only. Files are read, never opened or run. **Check a password safely** sends only the first 5 characters of its scramble. He never switches protection off, and he doesn't research private people.

### How jobs run: Settings, Jobs

All off, each on its own: **Steer mid-job**, **Stop after this step**, **Job time limit** (the minutes are also his always-on safety net), **Job receipt** (with Undo for a week), **Run tests after code edits**, **Ask before a vague job**, **Remember a no**, **Cache look-ups for an hour**, **Sources under web answers**, **Confidence line**, **Clickable file:line links**.

**Learn how-tos** (off): after a job goes well, Bob offers to keep the steps and follows them next time. Nothing is kept until you press **Save how-to**. **Learn from tool errors** (off): he keeps one line on what fixed a failing tool.

---

## Memory, tidying and check-ins

### Topics and memory

**Topics** groups what you've talked about by project: a short note on where things landed, open questions, pictures and links back to the chat. One search box looks through chats, topics, pictures and notes. **Past chats** reopens an old one.

To make Bob forget, use **Forget** on a topic or say "forget what we said about…". You see a preview first.

Off to start: **Relevant memories only** (only the memories that suit the message), where each memory came from, memories that run out after a day or a week, project memories that stay with their project, a search of your notes apps (Obsidian, exported notebooks), and a **Sunday digest** of the week.

### Housekeeping (on unless you turn it off)

While idle, Bob sums up long chats, files them under Topics, and finds old things: chats, pictures he made, finished tasks, old log lines. For each kind you pick how old is "old" and whether he should **ask me first** or **tidy automatically**. By default he only touches his own files.

**Folders you point him to:** add one of your folders (Downloads, say) and old files from it show in Tidy up. He always asks first for these. Anything removed goes to the Recycle Bin, and pinned things are never touched.

### Check-ins (off unless you turn it on)

Settings, **🔔 Check-ins**. On a schedule you pick, Bob does a quick round and only speaks up when something needs you: failed downloads, tasks waiting for you, scheduled jobs that didn't finish, low disk space, and up to 8 checks of your own ("Did the build finish?"). A check-in never changes or downloads anything. **Check in now** does a round on the spot.

### Everyday helpers (each off)

Settings, **🗓 Everyday helpers**: a today card when Bob opens (weather only with **Place for the weather** filled in), a **⏱ Focus** timer that holds check-ins and reminders, a spending sheet from receipt photos, what's new after an update, a dot on the tray icon, and **Profiles for other people** (needs the passcode lock).

Also: **🌙 Quiet hours**, a shortcut to ask Bob from anywhere (Ctrl+Shift+Space), and **🩺 Health and history** (catch crashes, a safe start, **Put it back** for the last 20 Settings changes, a weekly count, and a Health page).

---

## Talk out loud

- **Read aloud:** Bob speaks his replies. Kokoro is the recommended voice (22 voices, on the processor), and inside it Onyx is ★ Recommended. Every voice has a **Play** button that works before you download anything.
- **Talk to Bob:** with **Hearing you** filled, press 🎙, or say "Hey Bob" hands-free if you turn that on.
- **Talk with Bob** (off to start with; Settings, Voice details): press 🗣 and just talk, hands-free. Bob answers out loud, short, with the whole answer in the chat, and you can cut in. His own hearing and voice, free; xAI's online hearing and voice is an extra you pick, with your own paid key.
- **Voice and phone extras** (off): talk over Bob while he reads aloud, have him read a whole document, a voice per Bob, and carry a chat on to another Bob.

---

## Play

Nothing runs until you press start, and the game's brain is let go when it ends. Not in the Gaming session, except the small games.

### 🧩 Games

Small games Bob plays with you. The app runs the game and Bob only talks, so they play well on his Quick brain, in the Gaming session and on the phone.

- **Word games:** Twenty questions, Hangman, Word ladder, Five letters, Mini crossword, Letter grid, Riddles, Story dice (**📜 Keep this story** makes it a page to print).
- **Board and puzzle games:** Chess (five strengths), Four in a row, Hidden fleet, Liar's dice, Noughts and crosses, Code breaker, Sudoku.
- **Trivia night:** ten questions; Bob answers too, and your other Bobs if you tick **Ask the Bobs on my Bob-Net to play**.
- Most have **Easy**, **Normal** and **Hard**. Five letters and Word ladder have **📅 Today's puzzle**, the same for everyone that day. **Two players, one screen** for several.
- Settings, 🧩 Games: **Which brain plays games**, **How often Bob chips in**, **Keep an unfinished game**, and **Kid mode** (easier words, kind teasing only).

### 🎲 Adventure

A tabletop role-playing game with Bob as game master and a party of you, your friends and your other Bobs. Press **Start a new game**, pick a setting (or one of eight openings in **Tonight's story**), your character and who plays.

- On your turn you get action cards that fit the moment, then an optional line of flair. The app rolls d20 plus a stat: 15+ hits, 10 to 14 hits at a cost, under 10 misses. Hearts, not hit points.
- **➕ Add a friend** (up to three) seats real people, on this screen or from Bob for Android. **💬 Say it your way** replaces the cards; **❓ Ask** asks the game master without using your turn.
- **🎭 Tone** (Cosy, Normal, Grim), **Plot armour** per character, ↩ **Take that back**, a **📓 Journal** and a **Storybook** of a finished game.
- **🧰 Table extras** and table rules (all off): visible dice, sounds, reading aloud, pictures, music, a map that grows, coins and shops, riddle rooms, badges, sending a campaign to a friend.
- Campaigns are saved and continue from the start card with a "Last time…" reminder.

**🧭 Journey** (its own page at the top, next to Adventure, and on the Adventure start card): walk the Brindle Vale on a tile map with the arrow keys, WASD or the phone pad, open chests, talk to the village and fight turn-based battles. It needs no brain and saves itself.

---

## Your phone and your other Bobs

- **Let my other replicant matrices in** (Settings, Bob-Net; off): Bob for Android, or your phone's browser, talks to Bob over Tailscale with a passcode. On Windows, **Let Tailscale through the firewall** adds one rule for Tailscale addresses only.
- **Bob-Net** joins your Bobs on different computers. They can borrow each other's brains, check each other's work, share one big brain over Wi-Fi (**SCUT** and **SUDDAR**, both experimental; every SCUT packet is signed and scrambled), play together, and carry a chat on. **Show avatars** (off) shows them in Now running.
- **Discord and Telegram** (Settings, Online services; off): talk to Bob from a chat app with your own bot token.
- On Android: Share to Bob, a home-screen widget, low-data mode, reminders on your phone, and its own Saved prompts and backup.

---

## Hire a bigger brain

- **Rented brains** (Settings, Online services): hire a big brain for one job from a service you have an account with. Pay per answer (OpenRouter, Together AI, Lambda, or any address plus key), RunPod serverless, or a machine by the minute (RunPod, Vast.ai, Lambda), which Bob starts and stops. Set the **Spending limits** first; every one starts at $0. Every hire starts from a **Hire it (about $…)** card that says the cost and what leaves your computer. **Stop everything now** stops every machine. Bob's figures are estimates; the service's bill is the real one.
- **Pick a brain from Bob's list** (top of Add a rental) has the really big brains no home computer can run.
- **Cloud helpers:** hand a very big job to a paid online AI with your own key. Bob asks each time.

---

## Make your own brain: the Lab

**🧪 Lab** in the menu opens the **Computer Science Lab**: a free workbench for the brains Bob runs on. Bob keeps answering while a Lab job runs, and the Lab waits during Gaming. Turn off **Show the Computer Science Lab** if you'd rather not see it.

**Keep it simple** shows the usual choices with Bob's defaults. **Professional** shows every control, with proper names (quantization, expert pruning, abliteration) and the plain words after them.

![The Computer Science Lab on Make a brain](screens/lab.png)

The seven tabs:

- **Make a brain:** pick what you want (Make it smaller, Cut experts, Take out sight or hearing, Just test a brain, Everything, or Take out the refusal habit), then walk through only those steps. **Use in Bob** appears only after the new brain is tested. **Show the recipe** shows the exact commands.
- **Forge:** every way of making a new brain, side by side, with where each runs. Teaching a cut brain back needs a rented card; the Forge writes the plan. **Lessons to teach** breaks lesson sets into parts you can pick.
- **Learn:** short experiments on how a brain works, on the brain loaded now. **Diffusion brains** tries one that writes a whole answer at once.
- **Test:** **Challenges** (tests out of 100, with a scoreboard), **Smaller** (one brain in six sizes), **Longer**, **Faster**, and **Taste test** (a blind test of the answers you prefer).
- **Teach:** **Teach it** teaches a brain a lesson set; **Best answers** has a bigger brain teach a smaller one its best.
- **Look inside:** **Peek inside** shows which experts your work uses; **fNRI** scans a brain while it answers and plays it back as a 3D block, a floor per layer, coloured by skill.
- **My Lab:** everything the Lab has made and measured.

A **queue** runs jobs overnight, **Show the wobble** shows how much a score moves, and every tested brain shows its **Lab scores** on the Brains page. Lab jobs need at least 12 GB of memory; a smaller computer can send them to a bigger Bob. The phone app has no Lab.

| | |
|---|---|
| ![The Teach tab](screens/lab-teach.png) | ![The Test tab on Challenges](screens/lab-test.png) |
| ![The Forge tab](screens/lab-forge.png) | ![The My Lab tab](screens/lab-my-lab.png) |

---

## Make Bob yours

- **Personality** (Settings, 🎚 Personality): the eleven dials (Dry wit, Puns, Tangents, Outlook, Nerd references, Talkative, Manner, Copied-mind musings, Builder itch, Curiosity, Ambition), each 0 to 4. His greeting changes as you move them. Presets include *Replicant on a deadline*, *Butler mode* and *Pun-dit*. **Reset to Bob** puts it all back.
- **Assistant presets for chats** (off): save presets with a name, your own instructions, a brain, a starting effort and which tools he may use, then pick one from **🎭 Preset** next to Effort. A preset never switches on a tool that is off.
- **Style:** themes, avatars, animations and layout. **Look** picks how the whole page is drawn: **Lamplight** (a dark room lit by Bob's cube, with Find anything on Ctrl+K; new installs start here), **Classic** (where earlier installs stay until you pick) or **Terminal**. **Bob's look** puts the fNRI cube in a small porthole as his picture (to begin with), or the pixel Bob if you'd rather. **🧍 Make your own look** builds Bob's avatar from parts.
- **Language** (Settings, Bob himself): English, Français or Español for Bob's screens. Bob answers in whatever language you write in.
- **Text size** and **Easier-to-read font** (Look & feel): 80% to 160%, and a plainer font.
- **Custom sampling** (Engines; off): your own temperature and top P for Qwen brains.

---

## Privacy, backups and moving

- **What goes online:** only what you switched on. Help, **What stays on your replicant matrix**, lists every case.
- **🔐 Locked secrets** (on): every passcode, bot token and key Bob saves is kept scrambled (AES-256-GCM), with the key held by your computer for your account (Windows DPAPI, the Mac Keychain, the Linux Secret Service, or the Android Keystore).
- **Passcode lock** (off): a passcode before anyone sees the window, and **Lock my chats and memory** to keep them scrambled on disk.
- **Back up and move** (Settings, This replicant matrix): one zip with your chats, settings, memory, notes and the tools Bob made (never brains or programs: those download again). **Keys and passcodes, locked** is off unless you tick it. On a new computer: install Bob, **Pick a backup…**, **Restore these**, **Restart Bob now**. Online things come back switched off. **Back up by itself** (off) saves one every day or week.

---

## Update or remove Bob

**Update:** Settings, **Check for updates**, then **Update Bob**. Bob downloads the new release, checks it, and swaps it in on restart; if he's busy, he asks when. Your chats, models and settings stay, because they live in his home folder. **Check for updates at start** is off unless you turn it on.

**Remove:** Settings, Remove Bob, **Remove Bob…**. The program, his shortcut, Launch on start-up and his scheduled task go. Two boxes, unticked, also remove his chats and settings and the models he downloaded, to the Recycle Bin. On a Mac, drag him to the Bin.

---

## When something goes wrong

| What you see | What to try |
|---|---|
| A download stopped | Press **Resume** in Now running. It carries on where it stopped. |
| Pictures or video are very slow | Normal on small cards. Use the **Art** session, keep clips short, turn on **Fit pictures to my GPU**, and run **Check this replicant matrix**. |
| Bob says he can't look things up | Click **🌐 Web search** next to Effort. |
| The memory numbers at the top and on the right differ | The top counts Bob's brain only; the meters on the right count the whole card and RAM. |
| "Out of graphics memory" | Close games or other graphics-heavy apps, or pick a smaller version in Settings, Brains. |
| Bob can't hear you, paint or edit | Fill that job in Settings, Brains, and get its engine when Bob offers. |
| Windows blocked Bob's engine | That's Smart App Control. Help, **Windows blocked my engine**, says what to do. |
| Bob crashed | He picks up where he left off. **Catch crashes and safe start** (off) adds a safe start after two crashes. |

Bob also mends a lot by himself, always on: a brain that drops out is loaded again, retries wait a little longer each time, a tool that fails three times in a job is set aside and he offers to fix it after, and when he finishes, his app checks what he said against what really happened.

**Still stuck? Save a help bundle** (Settings, This replicant matrix and updates). It saves one zip for whoever is helping you: a HANDOFF.md written for an AI agent, the errors and the last 3,000 lines of the logbook, settings without secrets, and whether each engine starts. Names, folders, passcodes, keys and addresses are taken out first. You pick the folder; nothing is sent. Take it to your agent or attach it to an issue.

---

## Glossary

The full glossary and an FAQ are in Help inside Bob (left menu, or F1).

- **Model / brain:** the file that does one kind of AI job. Bigger is usually smarter but slower.
- **Graphics card (GPU) and graphics memory (VRAM):** the part of your computer that makes AI fast. Its memory (6, 8, 16 GB) decides which models fit.
- **RAM:** your computer's main memory. Parts of a model that don't fit on the card can go here, more slowly.
- **Context:** how much a brain keeps in mind at once, counted in tokens (8K to 256K).
- **Squeezed (GGUF) version:** a smaller copy of a model that fits small cards.
- **Session / Effort:** what the card is kept for / how hard Bob works on a message.
- **Hand:** a switch that lets Bob do one kind of thing on your computer, each step on a card.
- **Model family:** models made by the same team the same way, like Qwen or Gemma.
- **Naughty list:** other people's remixes with the refusals cut out. Hidden until you turn it on; never ★ Recommended.
- **Community build:** a model made by someone other than its maker.
- **Engine:** the program that runs a kind of model. Bob offers it when a model needs it.
- **Replicant matrix:** Bob's word for the computer he runs on.
- **Bob-Net:** your Bobs on different computers, joined over Tailscale or your home network.
- **Computer Science Lab:** the 🧪 Lab page, where you make and test your own brain.
- **Commercial use:** using what you make for money. All starter set models allow it.

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

Each model keeps its own licence, and Bob shows it with the download size before you confirm a download.

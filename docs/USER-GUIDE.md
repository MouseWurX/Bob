# Bob: the user guide

This guide is for everyone, not just programmers. You don't need to type commands or understand AI to use Bob. If a word is new to you, there's a short glossary at the end.

Bob is a helper who lives on your own PC. He chats, plans, researches, writes and fixes code, looks at pictures, paints new ones, edits them, makes short video clips and talks out loud. He does all of it on your own computer, so your chats and files stay with you.

Two promises run through everything Bob does:

- **Nothing leaves your PC unless you say so.** Bob only goes online to download something you picked, to search the web if you turned on **Let Bob search the web**, to use a cloud helper you switched on yourself, or to run a job on a rented brain you hired with a card (see Optional extras).
- **Nothing extra is switched on until you switch it on.** Anything optional starts off. Bob may suggest something, but you decide.

---

## 1. Getting started

1. Download Bob's zip from the Releases page. Right-click it, choose Properties, tick **Unblock**, then unzip it somewhere you'll keep and double-click **Bob.exe**.
2. Bob opens in his own window. The first time, he looks at your graphics card and RAM and shows one list, **Get me ready**: the programs he runs on and a model for each job (chat, coding, pictures, picture edits, clips, his voice, memory), with his picks ticked. Every line has its own tick box and size. Music is listed too, unticked, since it's about 22 GB with its tools.
3. Untick anything you don't want, then press **Get Bob ready**. The button shows the total and your free disk first. Every download shows a progress bar, its size, its speed and how long is left, and Bob puts each model in its slot himself when it's in. There's nothing to install by hand: if your PC has no Python for his voice or music, he gets his own copy (about 15 MB, kept in his folder).
4. Skipped something? Ask for it anyway, say a clip, and Bob shows a **Set it up** card in the chat with what he needs and its size. One press gets it, and he carries on with your request by himself. If a setting is what's in the way (Let Bob search the web, a Hand that's off), the card switches just that setting on.
5. If you want Bob to look things up online, click **🌐 Web search** next to Effort, under the chat (the same switch, **Let Bob search the web**, is in Settings). It's off until you do.
6. When the downloads finish, say hello. You can ask Bob himself how to set anything up: he knows all his settings and what's set right now.

You can close Bob while things download. Unfinished downloads wait, paused, and carry on when you press Resume.

### What do I need?

- Windows 10 or 11 (64-bit).
- **32 GB of memory (RAM)** is what the starter sets are planned around. Less can work for chat, but pictures and video need the room.
- Space on your drive: it depends on your graphics card. Get me ready shows the total before anything downloads; on a 16 GB card the full set is about 105 GB, mostly pictures and clips, and smaller cards get smaller sets.
- A graphics card is **optional**. Bob can chat, plan, research, read pictures and talk with no graphics card at all. An NVIDIA card makes him much faster and lets him paint and film.

---

### Bob on a Mac

Bob runs on Macs with Apple Silicon (M1 and newer), using the Mac's graphics (Metal).

1. Download `Bob-<version>-mac-arm64.zip` from the releases page, open it, and drag **Bob** into Applications.
2. The first time, macOS says it can't check Bob (official Mac builds are ad-hoc signed: sealed so macOS can tell if a file was changed, but not with a paid Apple developer account, and that won't change). Open **System Settings > Privacy & Security**, scroll down and click **Open Anyway** next to Bob. Once only.
3. Bob keeps his things in `~/Library/Application Support/Bob/home`.

On a Mac, llama.cpp and stable-diffusion.cpp download as usual. whisper.cpp and Piper have no Mac builds Bob can use (hear through Ollama or a cloud helper; speak with Kokoro voices). Install FFmpeg (Homebrew) and LibreOffice yourself and Bob finds them. The Apps Hand, Defender scans, the Gaming card switch, Windows Task Scheduler, Check this replicant matrix is hidden (Update Bob works: it fetches the newest Mac zip from GitHub, checks it, and swaps it in on restart); the Security Hand checks the firewall, FileVault, Gatekeeper, System Integrity Protection, login items and listening programs instead. To update, use Settings, Update Bob, or replace Bob in Applications with the newest zip; to remove him, drag him to the Bin (and the folder above, if you want everything gone).

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
- **Settings** starts as one short page showing what's set now: Bob's voice (with **Play sample** and **Change**), his look, the colours, animations, the cat's name, one brain, launch on start-up, Projects, **Where Bob saves things**, **Let Bob search the web**, **Show Bob's plan before big jobs** and checking for updates (off unless you turn them on), and the version, graphics card and disk space, with **Check for updates**, **Run first-time setup**, **Save a help bundle** and **Check this replicant matrix**.
- **Show advanced settings** (off unless you turn it on, and remembered) adds a search box and the rest: Brains (model roles, session brains, context), House style, Voice details, Look & feel, Speed & memory, Engines, Bob-Net (your phone and your other Bobs), Online services (cloud helpers, Telegram), Other apps (ComfyUI), Hands, Housekeeping, Check-ins and Remove Bob. Longer explanations fold behind **More**.

---

### Making Bob faster on your PC

- **Save a help bundle** (Settings, This replicant matrix and updates) saves one zip for whoever is helping you get Bob working: a HANDOFF.md written for an AI agent (it links this repository and the exact version and says what to check in which order), every error and the last 3,000 lines of Bob's logbook, his settings without their secrets, this machine's facts, whether each engine starts, and the last three chats as a readout. If Bob's chat brain is loaded and idle it adds its own note about what it thinks is wrong; if not, the bundle is put together without any brain, so the button works on a broken Bob. The owner's name and user name, the home folder, the machine name, passcodes, API keys, bot tokens and Tailscale addresses are taken out first. You pick the folder; nothing is sent anywhere. Take the zip to your agent or attach it to an issue.
- **Check this replicant matrix** (Settings, bottom of the Everyday page) looks for things that slow Bob down and shows how to fix each one: memory below its rated speed (turn on EXPO or XMP in the BIOS), an old NVIDIA driver, a laptop on battery, models on a slow drive, other apps holding graphics memory. Bob only looks; he never changes Windows or driver settings.
- **Test Bob's speed** (Advanced, Speed & memory) times the first word and the full answer, and keeps your last results so you can compare before and after a change.
- Three switches, off until you turn them on: **Get Bob ready while you type**, **Let games go first** and **Match picture settings to my graphics card**.

## 3. Equip Bob: choosing his models

Bob uses different AI **models** for different jobs, the way a person might use a different tool for each task. **Equip Bob** shows them like a character sheet in a game: a picture of Bob with a slot for each job.

**To open it**, click Bob's picture (or click **Get models** in the left menu: it opens on Equip Bob).

### The slots

| Slot | What it does |
|---|---|
| 🧠 Brain | Thinks, chats and plans. Everything else hangs off this one. |
| ⚡ Quick brain | A small, fast brain for Low effort and the Art session. |
| 🎮 Gaming | Chats on the processor while you play, so your game keeps the graphics card. Only Qwen3 4B Instruct 2507 goes here (it was timed on a busy processor); Gemma 4 E4B never does. |
| 🔭 Deep thinking | The strongest thinker, for Medium, High and Extreme effort. Optional. |
| 🔨 Coding | Writes and fixes code. If it's empty, the Brain codes. |
| 🧐 Review | Checks code and plans before you rely on them. Optional. |
| 📊 Office | The one all-rounder that does everything in the Office session. |
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
- Each slot lists only **active** models, one line each. Point at the little **i** (or tap it) for the size, licence and Bob's reasons.
- **📚 Get more**, at the end of each list, opens the Brain catalogue at that job.
- Models already on your PC are ready to go. Active models you don't have yet show a **Get** button. Nothing downloads until you confirm.
- **One model can fill several slots.** For example, Gemma 4 E4B can be the Brain, the Quick brain, Seeing pictures and Hearing you all at once. Bob offers this with "Also use it for…". That's the trick that makes small PCs work well.
- To empty a slot, use the **✕** on it. The Brain can't be emptied, because Bob needs something to think with.
- The bar along the bottom shows whether everything fits on your graphics card at the same time. If it doesn't, that's fine: Bob takes turns, putting one model away while another works.
- Prefer a plain list? There's a button for that at the top.

Each slot only lists active models that can do its job: a brain that can't see pictures never shows under Seeing pictures, and a big brain never shows under Quick brain. What's equipped always shows.

### The Brain catalogue

**📚 Brain catalogue** (on the Get models bar, or **📚 Get more** under any slot) is Bob's full list of models, sorted by job: Quick brain, Gaming, Brain, Deep thinking, Review, Coding, Office, Seeing pictures, Phone, then hearing, voices, pictures, video, music and memory.

- Each model is one line: name, download size and a tag or two. The **i** holds the rest: what it's good at, how much graphics memory it wants, how it does on a 16 GB card, an 8 GB card, a 6 GB laptop card, no graphics card and an 8 GB phone, its licence and its source. The **↗** opens that source: the exact Hugging Face commit Bob downloads from, or the model's Ollama page.
- **Families:** inside each job, models sit under one header per family (Qwen, Gemma, GPT-OSS...). Every family starts closed. Press a family's name to open its list, press it again to fold it away. The header shows how many models, the size range, **★ Recommended inside** when Bob's pick is inside, and how many are already on your PC. **Open all families** and **Close all** are at the top. Bob remembers which ones you left open. The brain menus in Settings, Brains are split by family too.
- **Active** (on for models on your PC, off for the rest): active models show in the Equip Bob slots and the brain menus; the rest stay in the catalogue. Switching one off only hides it. It stays on your PC, and if it's equipped it stays equipped.
- **😇 Well behaved / 🤝 Community / Naughty list** (toggle at the top; the Naughty list side is marked with a small red devil Bob draws himself): Well behaved is every model above and what you see to start with. Community shows only builds other people made from stock brains that still behave (fine-tunes, distillations, repacks); they're in the Well behaved list too with a **Community · name** tag (the maker's name, or the team's name with its members on hover or tap), and one can be ★ Recommended like any other once it has been tried on a real replicant matrix and does its job well. The Naughty list side stays greyed until you turn on **Show the naughty list** (there, or in Settings > How Bob works > Brains). It holds remixes other people made from Qwen and Gemma brains with the refusals cut out ("heretic" or "abliterated" builds). They are not Alibaba's or Google's releases, they answer without refusing, and they can be a little rougher than the originals, so Bob never marks one ★ Recommended; on that side only, a red devil on its own where the star would be is his **quiet pick**, the one that does the job well on your PC. Each entry's **i** says who remixed it and from what. Off: they are listed nowhere; one already equipped stays until you change it.
- **➕ Your own brains** (end of the Well behaved list): add a brain file (.gguf) already on your replicant matrix that Bob's list doesn't have. Press **Add a brain from a file**, pick the file, name it, add its picture reader (mmproj) if it has one. It joins the list under a **Your own** family with an Active switch and a **Your own file** tag, and appears in Equip Bob and the brain menus. Bob runs it from where it is on his own engine, never moves or deletes it, and never recommends it over the brains he knows; the slots it's offered for come from its size and whether it sees pictures. **Remove from Bob's list** only makes him forget it. Web links aren't taken yet: save the file first.
- **Get** downloads it after asking first. **Equip** puts a model that's already here into that job's slot.
- **New** marks a brain that came out lately: one of the five newest releases in its family, and less than a year old. Every brain's **i** says the day its maker put it out.
- **Dated** marks a brain newer ones do better. It stays on the list; the tag says which newer brains to look at.
- A brain not tried on a real PC yet is listed, but Bob doesn't recommend it until it has been; its **i** says so.
- A brain too big for your PC and for every Bob on your Bob-Net leaves the job lists; a line at the end of the job says how many, and they're under **Rented brains**. If another of your Bobs could run it, it stays, and its **i** says which Bob.
- **Phone** lists the brains the Bob phone app can run; the phone app gets its own copy.

### Recommended, Fits your card, Doesn't suit this PC

- **★ Recommended:** Bob's pick for that slot (the reason is behind the **i**). For brains, a model scores higher the more jobs it covers (fewer brain swaps) and the less graphics memory it takes, and much lower if it would spill into RAM. Bigger brains get a bonus for jobs that need careful thinking. On small cards (8 GB or less), a brain that fills most of the card scores lower, because it leaves no room for longer chats. For pictures, video and voices, the pick comes from the starter set for your card.
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
| Brain | Qwen3.6 35B-A3B (answers Low-effort chat straight off; Gemma 4 26B does Office and Deep thinking) | Gemma 4 E4B | Qwen3 4B (light, leaves room for longer chats; Gemma 4 E4B still sees pictures and hears you) |
| Coding | Qwen3.6 35B-A3B (a big context (256K, how much it keeps in mind); always thinks coding jobs through) | Qwen3 Coder 30B (slower, runs mostly in RAM) | Qwen2.5 Coder 7B |
| Painter | Z-Image Turbo | Z-Image Turbo, 8 GB version | Z-Image Turbo, 6 GB version |
| Picture editor | Qwen Image Edit | FLUX.2 klein 4B | FLUX.2 klein 4B, 6 GB version |
| Video | Wan 2.2 5B | Wan 2.2 5B, small card version | the same, left unticked (very slow) |

The "8 GB" and "6 GB" versions are the same models **squeezed** to fit smaller cards. Pictures lose a little fine detail but look much the same.

Brains stay at Q4 or better, except on cards of 8 GB or less. There, when a brain's full file wouldn't run well, the Brain catalogue offers an **8 GB card version** packed at Q3 (for example Qwen3.6 35B-A3B). It's smaller and a little less sharp. Bigger cards always get the full version.

**How long things take** on a small card is a rough guess for now (these haven't been timed on every card yet). On an 8 GB card, expect roughly half a minute to a minute per picture, a minute or two per edit, and ten minutes or more for a few seconds of video. A 6 GB card is slower again. While Bob paints, he puts his chat brain away to make room, so chat waits until the picture is done.

---

### The chest

Under Bob on the paper doll sits his **🧰 Chest**, with a number for how many things are in it. Press it and the Inventory on the right becomes the **Chest**: everything Bob has made or saved, newest first, each as a little picture (a thumbnail Bob makes once and keeps) with its name and when he made it. Songs, documents and other files show as an icon with their title. Click one (or Tab to it and press Enter) to open it beside the chat, the same as from Made by Bob.

At the top of the chest, **New things are saved in** shows the folder new pictures, clips, songs and sounds go to. **Change folder…** opens your system's folder window and saves the pick straight away; it is the same setting as Settings, **Where Bob saves things**. **Use Bob's own folder** goes back and **Show in folder** opens the folder. Older things stay where they are. **Open Made by Bob** shows everything with filters and a search box. On the phone, menu, **Chest** shows the same list from your PC's Bob, with **Save to this phone**.

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
- **Gaming:** keeps the graphics card for your games. How much of it Bob may borrow is set in **Gaming session: graphics card** (Settings, Show advanced settings, Speed & memory): Automatic (the starting position), Never use the card, or Always borrow a little. Bob chats and listens on the processor with a small brain (Qwen3 4B Instruct 2507 to start with), which usually starts answering within a few seconds. Now and then he adds a short, sleepy scripted aside. Pictures and big jobs wait until you switch back, and Effort stays on Low. Tip: turn on **Let games go first** (Settings, Show advanced settings, Speed & memory) so Bob uses fewer cores while you play.

Session: what the graphics card is kept for. Effort: how hard Bob works on each message.

With **Let Bob pick the session** on (Settings > Everyday, on to start with), Bob moves into the session that suits the job (Art, Coding, Office or Gaming) and goes back to Normal, the lightest, once he has been quiet for 2 minutes. While something else is using the graphics card, like a game, he stays in Gaming. You can still pick a session yourself from the menu: Bob keeps it while you work, then goes back to Normal once he has been quiet for 2 minutes. To keep him in Gaming, press 🎮 Gaming next to Effort.

### Effort

Above the chat box, **Effort** sets how hard Bob works on your next messages. It goes back to Low each time Bob starts.

- **Low (Quick):** a fast answer from the Quick brain.
- **Medium (Deeper):** one big brain thinks it through. No second check.
- **High (Checked):** a big brain drafts, then Bob's reviewer copy checks it. Code problems go back for one fix.
- **Extreme (Slowest):** like High, and coding goes research, plan, then changes, with a check after each step.

High and Extreme end with **moot minutes**: who checked what, and what's still open.

### Watching Bob think

**💭 Bob's thinking**, at the top of the chat, opens a small window that stays on top of your other windows. It shows, live: what Bob is doing, which brains he holds and where (graphics card or processor), his thinking as it streams (his copies too, so you can watch a moot), brain loads and swaps, each tool step and the notes he keeps for himself. Low effort replies skip thinking, so there you mostly see steps. Bob only sends his thinking along while the window is open, and nothing in it is saved.

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

### Check-ins (off unless you turn it on)

Settings, Show advanced settings, **🔔 Check-ins**. On a schedule you pick (**Every day** or **Every weekday** at a time, or **Every few hours**), Bob does a quick round and only speaks up when something needs you. If everything is fine, he says nothing; **Last check-in** in Settings and his logbook show each round.

What he looks at (each can be unticked under **What Bob checks**):

- Downloads that failed or stopped moving (no progress for 15 minutes).
- Tasks that failed or wait for your OK.
- Scheduled jobs that didn't finish.
- Disk space running low (under 10 GB free where his models live).
- **Your own checks**: up to 8 lines such as "Did the build finish?". His quick brain answers them from his tasks, downloads, schedules and logbook only, on the processor, only while he's idle and never in the Gaming session. A brain loaded just for this is let go straight after.

When something needs you, a Check-in card appears in the chat (and a notification if **Alerts** is on). The same thing isn't repeated until a day has passed. A check-in never changes, retries or downloads anything, and nothing goes online. Check-ins happen while Bob is open (Windows, Mac and Linux alike); a missed one is done once when he's back. **Check in now** does a round on the spot.

---

## 7. Pictures, edits and video

Just ask in the chat: "paint a lighthouse at dusk", "make this picture look like winter", or "make a short clip of the cat stretching".

- **References:** keep pictures of characters, places and styles on the **References** shelf. Ask Bob to use one and he'll keep that look in new pictures.
- **Edits:** attach a picture with 📎 and say what to change. The **Picture editor** slot needs a model for this.
- **Video:** clips are short (a few seconds). On small cards, keep them short; Bob tells you roughly how long a job will take before he starts.

If a slot is empty, Bob tells you which model would fill it.

### Songs and sounds

Ask for a song ("a chiptune boss theme, about a minute") or a sound effect ("a creaky wooden door"). It lands in the chat as a **song player**: a round ▶ button, its title, bars showing the song's shape (click or drag along them to jump around; arrow keys jump 5 seconds), the time, **Lyrics** if it has words, **Open in Made by Bob** for a bigger player in the side panel, and **Show in folder**. Several songs in one reply play one after another, and only one plays at a time. Each song is kept as a .wav file named with the date and its title.

### Bob's home folder

Bob's **home** is one folder with his models, the engines he runs on, his notes, chats and settings, apart from the program itself. You pick it when Bob is installed (the Windows install window asks first) or the first time Bob.exe, Bob.app or the AppImage opens: Bob suggests a `Bob` folder in your own user folder, and any drive works. He refuses temporary places like AppData, because a disk clean-up would take 10 to 60 GB of models with it. A cloud-synced folder (OneDrive, Dropbox, Google Drive, iCloud) is allowed, but Bob always recommends against it and says so wherever the folder is shown: every model would be uploaded, and a sync can break a model while he uses it. Pick a plain folder on the PC.

Settings, **Bob's home folder** shows the folder and the size of the models (red if it is somewhere a clean-up tool empties, or a cloud-synced folder). To move it: **Browse…** or type a new folder, **Move here…**, then **Yes, move everything**. Bob closes, copies everything across (one quick rename on the same drive), and opens again from the new folder; the old one is removed only once every file is over. The same row sits at the top of the first-run screen under **My home folder**. Older Bobs that kept things in `%LOCALAPPDATA%\Bob` carry on from there until you move them.

### Where Bob saves things

Settings, **Where Bob saves things** picks the folder for the pictures, clips, songs and sounds Bob makes. It starts as Bob's own folder (the one Made by Bob lists). **Browse…** picks another (or type one and press **Save here**), **Show in folder** opens it, and **Use Bob's own folder** goes back. The chest under Bob on Equip Bob has the same folder with a **Change folder…** button. Only new things go to a new folder; older ones stay put and still show in your chats. Tidy up only tidies Bob's own folder. If a picked folder goes missing (an unplugged drive), Bob saves in his own until it's back.

---

## 8. Hands: letting Bob do things on your PC (opt-in)

Hands are Bob's way of doing things for you on your PC rather than just talking about them:

- **Files:** zip and unzip, move, copy, rename, and tidy folders like Downloads.
- **Run:** run a program, command or script you've approved.
- **Schedules:** do a job at a set time.
- **Apps:** click and type in another program for you.
- **Office documents and converting:** convert files (Word, Excel, PowerPoint and OpenDocument to and from each other or to PDF; pictures; sound; video), read office files, make new documents, spreadsheets and slides, and change them (fill cells, add rows and slides, replace text, fill a template).
- **Security and privacy:** check the PC's protection, explain Defender alerts and start scans, look at suspicious downloads, scripts and emails without opening them, find and remove hidden details (like GPS in photos) before sharing, and check whether a website, link or sender is genuine from public records.
- **Connected apps (MCP):** work inside Unreal Engine, Blender and other apps that offer their tools through an MCP add-on.

### Connected apps (MCP)

Apps with an MCP add-on (Unreal Engine and Blender have them) can offer Bob their own tools. Ask things like "in Blender, add a cube at the origin and make it red", "what's in the scene?" or "list the actors in my Unreal level".

- Install the app's MCP add-on and switch it on in the app first (for Blender: the Blender MCP add-on, Connect in its panel, plus uv: **Get uv for me** fetches it; for Unreal: your Unreal MCP plugin with the editor open).
- Settings → Show advanced settings → Hands: switch on **Connected apps (MCP)**, then under **Connected apps** open **More** and use **Add a connected app** (**Fill in for Blender** / **Fill in for Unreal Engine** fill in a common setup) or **Paste a setup from another app** (the "mcpServers" block from the add-on's instructions, Claude Desktop, Cline, Cursor or OpenCode). Press **Check**, then tick **On** for the app. New apps always come in switched off.
- Bob starts or reaches an app only when a job needs it and lets it go after 5 minutes unused, when you switch it off, or when you press ✋ Hands.
- Every step shows a card that says in plain words what Bob will do, with the exact tool and inputs under **Show details** (**Allow** / **Allow the rest of this job** / **Deny**), unless "Let Bob work without asking" is on. Tools that run code inside the app or can delete things show the code and always ask (no "rest of this job"). The hard limits apply to the inputs, including the blocked-commands list on any code a tool would run inside the app.
- While **Don't send anything out** is on, Bob only talks to apps on this computer (localhost / 127.0.0.1).
- Works the same on Windows, Mac and Linux. The phone app shows the same cards for jobs sent from the phone; the apps themselves run on the PC.

### Office documents and converting

Ask things like "turn report.docx into a PDF", "what's in budget.xlsx?", "make a 5-slide deck about the game", "set B4 to 1300 in budget.xlsx", "make this song an mp3" or "turn the clip into a GIF".

- Documents, spreadsheets and slides use **LibreOffice** (free). If LibreOffice or Apache OpenOffice is already installed, Bob finds it. If not: Settings → Show advanced settings → Engines → Engine downloads → **LibreOffice** (about 350 MB, pinned version and checksum, unpacked into Bob's folder with no admin rights).
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

**Self-test:** Settings → Show advanced settings → Hands → Checks → **Run the self-test** checks, in a throwaway folder of dummy files, that the Recycle Bin and Undo, tidying, running a program and Stop all work on your PC. It shows a pass or fail list in plain words and removes the folder afterwards. No Hand needs to be on, and nothing of yours is touched.

---

## 9. Voice

- **Read aloud:** Bob can speak his replies. Kokoro is the recommended voice (22 voices, runs on the processor). Every voice has a **Play** button with a short sample (the same line in each voice) that works before you download anything.
- **Talk to Bob:** with the Hearing you slot filled, use 🎙 or say "Hey Bob" hands-free (if you turn that on).

---

## 10. Optional extras (all off until you turn them on)

- **Show Bob's plan before big jobs**: before a job with several steps, or any step that changes files or runs programs (also a video clip, a song or a cloud helper), Bob shows every step on one card and waits. Steps that need an OK have their own tick box on that card. Press **Go ahead**, **Change something** (type what you want different, and he makes a new plan) or **Not now (Bob drops this job)**. Each step is still checked when he gets to it, and anything not on the plan asks on its own card. Off unless you turn it on.
- **Let Bob search the web**: Bob looks things up on DuckDuckGo and reads pages when a question needs it. Only the search words and page address leave your PC. Off: he tells you when a question needs the internet and where this switch is. The same setting is the **🌐 Web search** switch next to Effort on the chat page; flip either and both change.
- **Let Bob fetch his newest brain list** (Going online): once a day Bob reads his brain list from his own GitHub page, so brains that came out after your version show up in the Brain catalogue. **Check now** does it at once. Only a list where every file is pinned with its size and sha256 is used; it adds and updates brains, never removes one. Nothing about you is sent (GitHub sees the request, like any web page).
- **Show the naughty list**: lists other people's uncensored remixes of Qwen and Gemma brains (heretic / abliterated) behind the Naughty list side of the Brain catalogue toggle (the red devil), and lets the ones you make Active into Equip Bob and the brain menus. Not the makers' releases; they answer without refusing and can be rougher. Off: hidden everywhere.
- **Let Bob learn how-tos**: after a job with a few steps goes well, Bob offers one card to keep the steps as a how-to, and follows them next time you ask for something like it. Nothing is kept until you press **Save how-to**. Edit or delete them in Settings, **📒 How-tos**. A how-to is plain text: Hands still ask for your OK as usual. They stay on your PC.
- **Launch on start-up**: Bob opens when Windows starts.
- **Cloud helpers**: hand a very big job to a paid online AI, using your own key. Bob asks you each time, because it costs money and sends that job off your PC.
- **Rented brains** (Settings, Show advanced settings, Online services): hire a big brain for one job from a service you have an account with. Three kinds: pay per answer (OpenRouter, Together AI, Lambda, or any address plus key), RunPod serverless (per second, switches itself off) and a machine by the minute (RunPod, Vast.ai, Lambda; Bob starts and stops it, and it carries a timer so it stops on its own too). Set the **Spending limits** first: every one starts at $0 and nothing can be hired until they're set. Switch on **Let Bob hire from** a service (the first time, a card says what leaves your PC), add a rental (service plus model, and a card size for machines), and put it in the **🏗 Rented brain** slot on Equip Bob. Then use the **🏗 Rented brain** switch under the chat, or wait for Bob to offer it when a chat outgrows his brains here. Every hire starts from a **Hire it (about $…)** card that says the cost and exactly what leaves your PC: the chat of that job, the files you attached, Bob's instructions and what he remembers about you. His tools still run on your PC. Keys are environment variables Bob only reads (Mac and Linux: also `~/.config/bob/env`). Tasks shows the job as **Rented**; the Settings panel shows **Machines running** with **Stop everything now**. Bob's cost figures are estimates; the service's billing page is the real bill.
  - **Pick a brain from Bob's list** (top of Add a rental): the really big brains no home computer can run (DeepSeek, GLM-5, Kimi, Mistral Large and more) and the catalogue brains too big for your Bobs. For a machine Bob fills in the model and card size; for pay per answer press **Find it on this service** and Bob looks it up on that service's own list (its switch must be on). He never sets more than one card himself.
- **Music and sound effects**: extra downloads for the audio tools.
- **Extra voices.**
- **Advanced workshop**: if you use ComfyUI, Bob can run its workflows for you.
- **Let my other replicant matrices in** (Settings, Show advanced settings, Bob-Net; off): Bob for Android, or your phone's browser, talks to Bob over Tailscale with a passcode. Turn it on (the first time, it makes a passcode and shows it once), then add the address it shows to the phone. It works straight away, no restart (Bob listens on this replicant matrix's Tailscale addresses only, and picks Tailscale up within a minute if it connects later). On Windows, press **Let Tailscale through the firewall**: one Windows prompt adds the rule "Bob (Tailscale only)" for Bob's port, from Tailscale addresses (100.64.0.0/10) only; It also switches off any rule that blocks Bob's own program (Windows makes one if Cancel was clicked on its earlier question). **Remove the firewall rule** takes the rule away and switches those back on. On Linux with ufw or firewalld, Bob shows the one line to run. Only Tailscale addresses get in.
- **Check for updates when Bob starts.** Updating always waits for your click.
- **🧍 Make your own look** (Style, under Bob's look, and **Change his look** under the doll on Equip Bob): a character screen that builds Bob's avatar from parts (body: Man, Robot or Alien; build; hair style and colour; skin; beard; glasses; outfit and colour; armour; weapon; shield) with a live preview. **Wear this** makes it his look; it blinks and talks like every other look and shows under **Your own design**.
- **🎲 Adventure** (menu page): a tabletop role-playing game with Bob as game master and a party of you plus your other Bobs. Nothing runs until you press **Start a new game**; the game master brain (Deep thinking, or the main Brain) loads for the game and is let go on Pause or End. One start card: setting, your character (with a look of its own from the character screen, any body, and **Save this character** for next time; Bob's avatar is never changed by the game), who plays (a Bob on your Bob-Net plays himself over there; a copy of Bob is played by the game master brain), how long, and **📖 Characters** (the bestiary: You = saved heroes, Party, Met = everyone the game master names, drawn as they appear, Enemies = the usual dozen with their hearts; the character screen also has monster bodies), and plot armour per character (None, Some, Lots, Legendary). Everyone has a turn in order. On your turn you get action cards (only the ones that fit), some with a second card (attacks your kit allows, your spells, your items, who's here, the ways out) and a Back button, then an optional line of flair. The app rolls d20 + a stat for every action: 15+ hits, 10-14 hits at a cost, under 10 misses. Loose rules: four stats, hearts not hit points, no inventory weight, no spell slots, no initiative; travel is one montage line. Campaigns are saved in their own files and continue from the start card. Not in the Gaming session.
- **🧩 Games** (menu page): five small games Bob plays with you. The app runs the game and Bob only talks, so they play well on his quick brain, in the Gaming session (on the Gaming brain, on the processor) and on the phone. **Twenty questions** (either way round: the app picks the secret when it's Bob's, and checks your guess), **Hangman** (a word from a shelf you pick, seven lives, a Hint costs a life), **Word ladder** (four-letter words, one letter a step, every rung a real word; Hint, Back a rung, or climb together turn about), **Five letters** (a five-letter word in six tries, letters coloured green, yellow, grey; a Hint costs a try) and **Story dice** (six picture dice, a line each until every die is in; Wrap it up ends it, Bob writes the last line and a title). Nothing runs until you press **▶ Start**; the brain is let go when a game ends. A scoreboard counts wins per game. Settings (Show advanced settings, 🧩 Games): Which brain plays games (Quick brain) and How often Bob chips in (After every move).

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
| Pictures or video are very slow | Normal on small cards. Use the **Art** session, keep clips short, or turn on **Match picture settings to my graphics card**. Run **Check this replicant matrix**. |
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
- **Released, New, Dated:** the day a brain's maker put it out; New = one of the five newest in its family (under a year old); Dated = newer brains do its job better, but it stays.
- **Really big brains:** brains with hundreds of billions of numbers that no home computer holds. Bob lists them under Rented brains.
- **Model family:** models made by the same team the same way, like Qwen or Gemma, in many sizes. Each family has its own header in the Brain catalogue.
- **Naughty list:** uncensored remixes of Qwen and Gemma brains made by other people, with the refusals cut out. Marked with a red devil. Hidden until Show the naughty list is on; never ★ Recommended, but a red devil on its own is Bob's quiet pick among them.
- **Abliterated (heretic):** a brain with its "no" taken out. Heretic is the tool, abliterated is the result.
- **Your own brain:** a .gguf file you added to Bob's list yourself under ➕ Your own brains; runs from where it is, never recommended over the ones Bob knows.
- **Community build:** a model made by someone other than its maker (a remix, fine-tune or repack); the catalogue says who and from what.
- **Brain catalogue:** Bob's full list of models, sorted by job. **Active** models show in the slots and menus; the rest wait there.
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

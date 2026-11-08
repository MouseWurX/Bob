# Bob settings inventory

Every user-facing setting: its name as shown, the hint, the default and where it lives.
Taken from the code in project-files/bob (Settings 1.5.0 layout) on 2026-11-02. The **Review** column holds open clarity notes. "ok" means it meets SETTINGS-STYLE.md.
Update this file in the same handover as any change to settings.

## Settings: Everyday
| Setting | Hint | Default | Review |
|---|---|---|---|
| Bob's voice | (row shows current voice, Play, Change → Voice & conversation) | Windows voice until Kokoro is set up | ok |
| Bob's look | (current look, Change → Style) | Sysop | ok |
| Use Bob's look as his icon | On unless you turn it off. His icon on the taskbar (Dock on a Mac), in the tray and in the corner of his window shows the look you picked, and changes the moment you save a new one (a shortcut pinned to the taskbar may keep the usual icon: Windows draws those from the shortcut). Off: the usual Bob icon. (Disabled in a browser.) | On (was Off before 1.5.134; the owner asked) | 1.5.134 |
| Theme | (current theme, Change → Style) | Bob's Inn | ok (1.5.2: row renamed "Theme") |
| Animations | On / Follow Windows (other systems: Follow the system) / Off | On | ok (1.5.98) |
| Bob's cat | (text box) | Patches | ok (1.5.2) |
| One brain (snappier) | Every copy of Bob uses the main brain, so there's no brain swap. | off | ok (1.5.2) |
| Launch Bob on start-up | Off unless you turn it on. | off | ok |
| Keep Bob in the tray | On unless you turn it off. Closing or minimising Bob's window tucks him into the tray by the clock (Mac: the menu bar; Linux: your desktop's tray) instead of closing him, so he keeps running. Click his icon to open him again. To close him fully, right-click (Mac: click) his icon and pick **Quit Bob**. (Disabled in a browser.) | On (was Off before 1.5.134; the owner asked) | 1.5.134 |
| Check for updates when Bob starts (1.5.98: in This replicant matrix and updates, next to Check for updates) | Off unless you turn it on. Bob only tells you; updating always takes your click. | off | ok |
| (footer) Version, graphics card, free disk; Check for updates; Run first-time setup | | | ok |
| Show advanced settings | Brains, voice details, speed and memory, engines, Bob-Net, online services, other apps, Hands, housekeeping, check-ins. | off (remembered per PC) | ok |

## Settings: Advanced
| Section | Setting | Hint / notes | Default | Review |
|---|---|---|---|---|
| Brains | Equip Bob slots (thinking and making jobs), session brains, context per session | | starter set | ok (1.5.2) |
| Voice details | Voice engine (Kokoro / Chatterbox / Windows), voice, speed 0.6–1.6×, Hey Bob, read replies aloud | Chatterbox: own-voice recording rules | Windows voice, 1.0×, Hey Bob off | ok |
| Look & feel | Open Now running when a task needs me; your own theme (link) | | off | ok (1.5.2) |
| Engines | Bob's engine: Ollama (if you already have it) / Bob's own (llama.cpp, nothing else needed) | Takes effect next time Bob starts. | llama.cpp | ok |
| Engines | Engine downloads (Get / Check for a newer build) | More: from official GitHub pages | none | ok |
| Engines (under More) | Fit to free graphics memory | recommended; one line + More | on | ok (1.5.2) |
| Engines (under More) | Speculative decoding + Draft brain, Guess up to, At least | experimental; long hint | off | ok (1.5.2) |
| Engines (under More) | Extra settings for one brain: llama.cpp flags | e.g. --n-cpu-moe 8 | none | ok (Advanced, has an example) |
| Other apps | Let Bob use ComfyUI; ComfyUI port | off unless you turn it on | off, 8188 | ok |
| Online services | Cloud helpers (per provider on/off + model) | Key found / No key yet | all off | ok |
| Bob-Net | Let my phone in; Make a passcode; Address (Check again) | off unless you turn it on | off, no passcode | new (Android), awaiting review |
| Online services | Talk to Bob on Telegram; Bot token (BOB_TELEGRAM_TOKEN user variable); Your Telegram account (pairing code, New code, Forget my Telegram account); Send pictures Bob makes; Answer Bob's OK cards on Telegram | off unless you turn it on | all off, not paired | ok (approved with edits) |
| Hands | Let Bob use Hands (master switch) | Off = every Hand below is off. | off | ok |
| Hands | Files; Run programs and scripts; Schedules; Open and use apps; Office documents and converting; Security and privacy | long "what" text each | all off | ok (1.5.2; Office signed off; Security and privacy added, needs sign-off) |
| Hands > Check a password safely | box + Check button under Security and privacy | password field (not saved) | empty | needs sign-off |
| Hands | Connected apps (MCP) | long "what" text | off | ok (clear with edits, 2026-11-04) |
| Hands > Connected apps | per app: On switch, Check, Show tools, Remove, Get uv for me (when uv is missing); card: Allow / Allow the rest of this job / Deny, Show details, This one always asks; Add a connected app (Fill in for Blender, Fill in for Unreal Engine, Name, Program to start, Arguments, Or its address, Add app); Paste a setup from another app (Add these) | each app off when added | no apps | ok (clear with edits, 2026-11-04) |
| Hands | Folders the Files Hand may work in; Stop a command after | | none | ok |
| Housekeeping | Tidy up old things by himself | Only while he's idle (10 minutes quiet, nothing running)… | off | ok (1.5.2) |
| Housekeeping | Load a brain for it if none is loaded | Off: … so a game keeps the graphics card. | off | ok (1.5.2) |
| Housekeeping | Per item: Chats 3 months, Pictures and clips 6 months, Sounds and music 3 months, Finished tasks 3 days, Logbook 3 months | | as listed | ok |
| Check-ins | Check in on a schedule | Bob looks over his downloads, tasks and schedules when you choose, and only tells you (a card in the chat) when something needs you. Looking never changes anything. Only while Bob is open. | off | ok (1.5.78, approved with edits) |
| Check-ins | How often | Every day / Every weekday (at a time) / Every few hours (1-24) | Every day at 09:00 | ok (1.5.78, approved with edits) |
| Check-ins | What Bob checks | Downloads that failed or stopped moving; Tasks that failed or wait for your OK; Scheduled jobs that didn't finish; Disk space running low | all ticked (nothing runs until the main switch is on) | ok (1.5.78, approved with edits) |
| Check-ins | Your own checks (Save my checks) | one per line, up to 8; quick brain on the processor, idle only, never in Gaming | none | ok (1.5.78, approved with edits) |
| Check-ins | Check in now | button: one round now, result shown under it | | ok (1.5.78, approved with edits) |
| 🎲 Adventure | Which brain is the game master | The game needs one good storyteller. Biggest brain is the Deep thinking slot, or the main Brain when nothing is in it; always on the graphics card, thinking on. It loads when a game starts and is let go on Pause or End. | Biggest brain | ok (approved with edits, 1.5.119) |
| 🎲 Adventure | Who plays the other Bobs | Their own Bob: a Bob on your Bob-Net list thinks his own turns over there, in his own voice, through the same door as Lend my brain. What goes to him: the scene so far and his character's sheet, over Tailscale to your own Bob only; nothing else from this replicant matrix. When he can't (gaming, busy, not reachable), the game master brain plays him that turn and says so. The game master brain: every Bob at the table is played here. | Their own Bob when reachable | ok (approved with edits, 1.5.119) |
| 🎲 Adventure (menu page) | Start a new game / Setting / Your character / Who plays / Plot armour / How long / Continue a campaign | The game page; nothing loads until Start a new game is pressed | nothing on | ok (approved with edits, 1.5.119) |
| 🧩 Games | Which brain plays games | Quick brain: my small brain, the one that answers quick messages; it loads in a few seconds and a game needs nothing bigger. In the Gaming session it's the Gaming brain on the processor, so a game never touches the graphics card. Main Brain: the brain the chat uses, for wittier lines at the cost of a longer load. Either way it loads when a game starts and is let go when the game ends. | Quick brain | ok (approved with edits, 1.5.121) |
| 🧩 Games | How often Bob chips in | In Hangman, Word ladder and Five letters the app runs the game and I comment. After every move: a line after each guess. Now and then: about every other move. Only at the end: the app keeps quiet until the game is over, which is quickest on a slow replicant matrix. Twenty questions and Story dice are all talk, so this doesn't change them. | After every move | ok (approved with edits, 1.5.121) |
| 🧩 Games (menu page) | ▶ Start per game / I think, you guess · You think, I guess / Shelf / You climb, I cheer · Climb together, turn about / I open · You open / 🏁 Stop / Hint / Back a rung / Wrap it up / Scoreboard | The games page; nothing loads until ▶ Start is pressed | nothing on | ok (approved with edits, 1.5.121) |
| Remove Bob | Remove Bob (keeps chats, settings and models unless ticked) | More text | | ok |

## Other pages
| Page | Setting | Default | Review |
|---|---|---|---|
| Downloads | At once: 1 / 2 downloads | 1 | ok |
| Downloads | Carry on unfinished downloads when Bob starts | off | ok (1.5.2) |
| Style | Theme groups, your own theme (name, colours, font, corners, blueprint, outlined), avatars (133), Layout | Bob's Inn | ok (1.5.2) |
| Personality | What should Bob call you?; personality preset; sliders (humour, puns, side trips, mood, nerd references, talkative, manner…) | Factory Bob | ok, labels are plain |
| First-time setup | What should I call you?; Setup pack; model ticks | suggested pack | ok |
| First-time setup, Step 1 (1.5.75) | Get Bob ready (about X GB): core engines (llama.cpp, stable-diffusion.cpp, whisper.cpp) + one starter brain (E4B, or E2B on small cards / 8 GB Macs); size and free disk shown first; Pause, Stop, Try again; won't start with less than size + 2 GB free; each engine test-started (✓ works or the reason) | one click, never automatic (not an opt-in exception) | approved with edits (1.5.75) |

## Not yet reviewed
- 1.5.3 chat page: ✋ Hands kill switch (On / Stopped / Off in Settings; only stops, never switches on) and the Memory section (Graphics card + RAM meters, Brain: friendly name).
- Wake on input / Always on toggle and the memory label on the chat page (thread "Keep Bob light when idle"). Waiting for its handover.

## Added in 1.5.4 (recommended models + Help)
| Page | Setting | Default | Review |
|---|---|---|---|
| Get models / Equip Bob | Show models that don't suit this PC | off (remembered) | Approved with edits: use the pill switch style |
| Get models / Brain catalogue | Active (one switch per model, `activeModels`) | on for models on this PC, off for models not downloaded | 1.5.56, pending review |
| Help (menu, F1) | Search Help | | ok |
| Settings > Show advanced settings > Brains | Give Bob all his tools at once: "Sends every tool with each message, which leaves less room for the chat. Leave off to keep chats light." | off | ok (approved with edits, slim tools) |
| Settings > How Bob works | Pick up unfinished jobs after a restart: "If Bob closes mid-job, he starts it again next time. Jobs that had already changed something wait in Tasks for you to press Retry." | off | ok (approved with edits, handoffs) |

## Added in 1.5.7 (careful work, Effort, drives, the cat) — approved with edits by the design thread
| Page | Setting | Default | Review |
|---|---|---|---|
| Chat page, above the chat box | Effort: Low "Quick" / High "Checked" / Extreme "Slowest", with a one-line hint for the picked one | Low (back to Low each time Bob starts) | ok (with edits) |
| Personality (Attributes) | Ambition dial: Keeps quiet to Ambitious | middle (2) | ok (with edits) |
| Now running > Tasks (empty) | A small cat moment under "Nothing running" (changes every 10 minutes, no setting, no brain) | always | ok (with edits) |
| Sidebar, by Bob's picture | The cat does a short antic every 1½-3 minutes while Bob is idle, with a one-line moment under his status (no brain, no setting) | always | added after review |
| Settings > Advanced > Hands | Let Bob work without asking (confirm when turning on; banner + orange ✋ pill while on) | off | ok (approved with edits, free hands) |
| Settings > Advanced > Hands > Hard limits | Recycle Bin only · Keep secret files private · Read-only projects stay read-only · Block dangerous commands · Don't send anything out · Never type into password fields (orange "Off:" line when off) | all on | ok (approved with edits) |

## Added in 1.5.12 (Medium effort, Low on the processor) — approved with edits by the design thread
| Page | Setting | Default | Review |
|---|---|---|---|
| Chat page, Effort | Medium / "Deeper": one big brain on the graphics card, no second check | Low stays the default | ok (approved with edits) |
| Settings > Show advanced settings > Speed & memory (next to "Free memory after Bob has been quiet for") | Keep the graphics card free for quick answers: "Low effort answers run on the processor, so games and pictures keep the card. Replies start much slower (about half a minute). Applies in the Normal and Light sessions." | off (1.5.15: about 31 s to the first word on the processor vs 4 s on the card) | ok (approved; moved to Advanced) |
| Settings > Show advanced settings > Speed & memory (above "Keep the graphics card free for quick answers") | Show pictures without waiting for Bob's brain: "Bob shows a finished picture or clip straight away with a short line, instead of loading his brain back just to talk about it. Turn off if you want him to comment on each one." | on (1.5.20: skips the 6 s quick-brain / 22-29 s big-brain reload after a picture) | ok (approved with edits) |
| Settings > Advanced > Hands > Quarantine | Let the reviewer quarantine Bob ("If Bob or one of his copies goes off track, <reviewer> (his reviewer) stops him and asks you whether to quarantine him. Nothing happens without your click." + More) | off | ok (approved with edits, quarantine) |
| Chat page | 🔒 quarantine banner (only while someone is in quarantine): what happened + Release <name> | hidden | ok (approved with edits, quarantine) |

## Changed in 1.5.23 (Sessions and Effort, sharper split) — approved by the settings thread (the user picked "Keep both, sharper split")
| Where | What | Default | Review |
|---|---|---|---|
| Session picker | Deep thought removed (Medium/High effort does that job); a saved "deep" becomes Normal. The Deep thinking slot in Equip stays (Medium and up use it) | Normal | ok |
| Session picker | 🎮 Gaming (was Light / gaming, id still `light`): "Keeps the graphics card for your games. Bob chats and listens on the processor with a small brain, which usually starts answering within a few seconds. Pictures and big jobs wait until you switch back. How much of the card he may borrow is set in Settings, Show advanced settings, Speed & memory (Automatic to start with)." | off (Normal) | ok |
| Chat page, Effort | In Gaming, Medium/High/Extreme are greyed out: "Gaming keeps the graphics card free. Switch session to use more effort." | Low | ok |
| Tasks | In Gaming, picture/clip/music and Medium-and-up jobs wait: "Waiting · Gaming is on", "Switch the session to Normal to run it." | — | ok |
| Settings > Equip, Session brains | Gaming session brain (`sessionBrains.gaming`), default Qwen3 4B Instruct 2507 (1.5.25: picked on time to first word and to a full answer on the processor) | qwen3-4b | ok (1.5.56: also a 🎮 Gaming slot in Equip Bob; only takes catalog brains timed for gaming, never Gemma 4 E4B) |
| Settings > Brains (1.5.87) | **Pick how much each brain keeps in mind** (`brainCtxOn`): "Off to start with: Bob picks for each brain. On: pick a size for each brain you use. Each menu only lists sizes that brain was made for. A size you pick here is used for that brain everywhere, instead of the session sizes above." When on, one menu per equipped brain (`brainCtx` {model: size}): "Bob's pick (NK)" then 8K up to the most the model was made for (read from the GGUF header / Ollama), marked "(the most it was made for)" and 32K "(enough for most chats)"; limit unknown = up to 32K. "i" tip per brain: "Made for up to NK. Bob uses NK unless you pick. Bigger reads longer files and chats, but uses more memory and takes longer to read when it's full." (unknown limit: "Bob couldn't read how much this brain was made for, so the menu only goes up to 32K, which every brain handles."; the Gaming brain adds that Bob keeps it at 32K while you play). In a Gaming session a pick never grows the brain past the session's size. | off | ok (approved with edits) |
| Help, Sessions and Effort | "Session: what the graphics card is kept for. Effort: how hard Bob works on each message." | — | ok |
| Settings > Show advanced settings > Speed & memory > Speed for this replicant matrix | Get Bob ready while you type · Let games go first · Match picture settings to my graphics card | all off | ok (approved with edits, hw tuning) |
| Settings > Show advanced settings > Speed & memory | Test Bob's speed (button + last 6 results) | | ok (approved with edits) |
| Settings > Everyday footer | Check this replicant matrix (read-only tips) | | ok (approved with edits) |
| Settings > This replicant matrix and updates (1.5.118) | **Save a help bundle** (button). ⓘ: "Saves one zip with Bob's logs, the last chats, errors and this replicant matrix's facts, scrubbed of passcodes, keys and your name, so an agent or a person can work out what's wrong. Nothing is sent anywhere: you pick where it goes." Manual: nothing happens until the click; the folder picker chooses where; the folder opens afterwards. Help "Save a help bundle", glossary Help bundle / Handoff file, FAQ "How do I get help with my Bob?" | — | ok (placement and wording by the settings thread, 2026-11-05) |
| Get models > Equip Bob > Attributes | He comments once when you change his look | off (1.5.116; on before) | ok (approved) |
| Settings > Everyday | Let Bob search the web: "Off unless you turn it on. Bob looks things up on DuckDuckGo and reads pages when a question needs it. Only the search words and page addresses leave your PC." | off | ok (approved with edits, docs/help) |
| Settings > Everyday (How Bob works > Brains) | Show the naughty list: "Off unless you turn it on. The naughty list is other people's remixes of Qwen and Gemma brains with the refusals cut out (\"heretic\" or \"abliterated\"), not Alibaba's or Google's releases. On: they appear behind the Naughty list side of the Brain catalogue's toggle (the red devil), and the ones you make Active show in Equip Bob and the brain menus. A brain from there answers without refusing, so what it says is on you, and it can be a little rougher than the original. Bob never recommends one. Off: they are listed nowhere; one already equipped stays until you change it." Same setting as the "Show the naughty list" link at the top of the Brain catalogue (`naughtyList`). | off | ok (approved with edits, 1.5.132) |
| Get models / Brain catalogue | 😇 Well behaved / 🤝 Community / Naughty list toggle (which side of the list shows; the Naughty side, marked with Bob's own red devil, only once the setting is on; remembered in this browser). On the Naughty side a red devil on its own where ★ Recommended would be is Bob's quiet pick | Well behaved | ok (approved with edits, 1.5.133) |
| Get models / Brain catalogue | ➕ Your own brains: **Add a brain from a file** (file window on this replicant matrix; name; optional picture reader; **Add to Bob's list**), per row **Remove from Bob's list** (confirm: "The file stays where it is; only Bob forgets it. Any slot wearing it is emptied."). Stored as `ownModels`; the file is never moved or deleted | empty list | ok (approved with edits, 1.5.135) |
| Settings > Everyday (How Bob works) | Show Bob's plan before big jobs: "Off unless you turn it on. Before a job with several steps, or any step that changes files or runs programs, Bob shows every step on one card and waits for you. Any OKs the job needs are ticked on the same card." Closed panel: "Plans before big jobs: on/off". Chat card: Go ahead / Go ahead with ticked (n of m OKs) / Change something (What should Bob change? + Send to Bob / Back) / Not now (Bob drops this job) | off | ok (approved with edits, plan card) |

## Added in 1.5.27 (docs, Help and web search), approved by the settings thread (with edits)
| Where | What | Default | Review |
|---|---|---|---|
| Bob's tools (no UI) | bob_help: Bob reads this Help and what's set right now, so he can walk someone through setting him up. Read-only. | always | ok (approved with edits) |
| Help | One section per feature and setting (66 entries), a glossary (33 words) and an FAQ (15 questions). test/run-help-coverage-test.js fails if a Settings label has no Help. | | ok (approved with edits) |
| Settings > Show advanced settings > Speed & memory | "Keep the graphics card free for quick answers" now ends "Applies in the Normal session; Gaming always does this." (was "Normal and Light sessions") | off | wording fix |
| Session picker, Gaming | "…on the processor with a small brain, which usually starts answering within a few seconds." (was "about half a minute", out of date since 1.5.25) | | wording fix |
| Chat page > Effort row | 🌐 Web search pill (OFF/ON badge), same setting as "Let Bob search the web" | off | ok (approved with edits, 1.5.28) |
| Now running > Memory | Readings: card/RAM (Bob vs everything else), Processor busy, Last reply speed, Context use, Show graph button (off until clicked) | display only | ok (approved with edits, perf-readings) |
| Get models > 🎵 Music | ACE-Step 1.5 music models card (about 10.1 GB, download on click only) | not downloaded | ok (approved with edits, 1.5.37) |
| Settings > How Bob works | Pick up where Bob left off after a restart (was "Pick up unfinished jobs after a restart") | off | ok (approved with edits, 1.5.38) |
| Settings > Everyday > 📦 Bob's home folder (1.5.125) | Kept in <folder> · models N GB; red line if inside AppData/Temp/Caches; New folder + Browse… + Move here…; confirm card "Move everything to …?" with Yes, move everything / Not now. Same row at the top of the first-run screen under "My home folder" ("I keep my things in"). Settings text third person; first-run copy in Bob's voice. Cloud-synced folders (OneDrive, Dropbox, Google Drive, iCloud, pCloud, Nextcloud, Proton Drive, MEGA, Box, IDrive, Sync.com) are allowed but ALWAYS recommended against (owner rule 2026-11-06): red line in the panel and on the summary, red note + "Move there anyway" on the confirm card, first-start dialog "Pick another folder… / Use it anyway", install window orange warning + "Use it anyway" on a second press. Refuses AppData, Temp, Windows, a whole drive, a folder inside the current home. | The folder picked at install / first open (suggested <user folder>\Bob); older installs keep %LOCALAPPDATA%\Bob until moved | ok (approved with edits, 1.5.125) |
| Equip Bob > 🧰 Chest (under Bob) (1.5.125) | Opens the Chest in the Inventory column: thumbnails + names of the Made by Bob list (newest 24), "New things are saved in" folder with Change folder… / Use Bob's own folder / Show in folder (same setting as Where Bob saves things), Open Made by Bob. Phone: menu, Chest. | Chest closed; folder = Where Bob saves things | ok (approved with edits, 1.5.125) |
| Settings > Everyday > 💾 Where Bob saves things | saveDir: Folder, Browse…, Save here, Show in folder, Use Bob's own folder | Bob's own folder (Made by Bob) | ok (approved with edits, songs) |
| Settings > Show advanced settings > Brains | Keep chatting while Bob is busy (1.5.51: also beside long text jobs, on a second llama-server on the processor) | ON (the owner's explicit exception to opt-in, 2026-11-03) | ok (approved with edits, 1.5.41; 1.5.51 approved with edits) |
| Settings > Show advanced settings > Brains | Let the reviewer sit beside Bob's main brain (mootBeside) | off | ok (approved with edits, 1.5.51) |
| Settings > Everyday | Let Bob pick the session | ON (the owner's explicit exception to opt-in) | ok (approved with edits, 1.5.41/42) |
| Chat page > Effort row | 🎮 Gaming button (Off/On): locks Gaming, clears big brains from the card, parks jobs in Tasks | off | ok (approved with edits, 1.5.41/42) |

## Added in 1.5.53 (Bob's thinking window), approved with edits by the design thread
| Setting | Hint | Default | Review |
|---|---|---|---|
| 💭 Bob's thinking (chat bar button) | Opens a small always-on-top window showing Bob's thinking, which brain is working, moots and every step. Nothing runs for it while it's closed. | closed (opens on demand) | ok (1.5.53, clear with edits) |
| Bob's thinking > Follow along | On: the window keeps up with the newest lines. Off: it stays where you scrolled to. (Scrolling up turns it off by itself.) | on | ok |
| Bob's thinking > Clear | Empty this window. Nothing else changes. | button | ok |
| Settings > Show advanced settings > Speed & memory | "Keep the graphics card free for quick answers" (1.5.69) adds "A message with a link still goes to your main Brain, which reads web pages better." before "Applies in the Normal session; Gaming always does this." Chat line when it happens: "This one has a link in it, so my main Brain takes it." (adds "(loading it, about N seconds)" when the Brain isn't loaded) | off | ok (approved with edits, 1.5.69) |
| Get models > Setup / Equip Bob > Set (1.5.71) | New starter set "Built-in graphics (handhelds and thin laptops)", suggested when Bob finds built-in AMD (laptop/handheld Ryzen) or Intel Arc/Iris Xe graphics and no NVIDIA card. Brains only; its note: "Not yet measured on built-in graphics. Pictures and video are left out of this set until they've been tried there." Hardware line: "Built-in graphics: <chip>, about N GB of memory shared with it"; tag "Fits your replicant matrix". | suggested by detection | pending sign-off |
| Get models > Setup / Equip Bob > Set (handheld pictures) | The "Built-in graphics" set now also offers Z-Image Turbo (6 GB card version) for pictures and FLUX.2 klein 4B (picture edits, 6 GB card version), both ticked, and Wan 2.2 TI2V 5B (small card version) for clips, left unticked ("clips are very slow on built-in graphics"). **Match picture settings to my graphics card** (still Off by default) makes pictures 768 px on built-in graphics. The set marked (this PC) is now the built-in one on handhelds. |

## Added in 1.5.80 (how-tos)

| Where | Setting / text | Default | Status |
|---|---|---|---|
| Settings > Everyday > How Bob works | Let Bob learn how-tos: "Off unless you turn it on. After a job with a few steps goes well, Bob offers to keep the steps as a how-to, and follows them next time you ask for something like it. Nothing is kept without your click. Your how-tos are in 📒 How-tos below." | off | ok (approved with edits, 1.5.80) |
| Settings > Everyday | 📒 How-tos panel: list (name, For:, steps, used N times), Edit (Name, What it's for, Steps one per line, Save changes / Cancel), Delete then Delete for good / Keep it. Closed: "N how-tos · Learning: on/off" | — | ok (approved with edits, 1.5.80) |
| Chat page | Card: "📒 That worked. Keep the steps as a how-to?" + "Next time you ask for something like this, I'll follow them." + Name box + steps + Save how-to / Not now. After: "Saved the how-to "…". You can change or delete it in Settings, 📒 How-tos." | — | ok (approved with edits, 1.5.80) |
| Chat page | Line when used: "📒 Following my how-to "…"" | — | ok (approved with edits, 1.5.80) |


## Replicant matrix wording (1.5.89, owner's ask)

| Where | Setting / text | Default | Status |
|---|---|---|---|
| Everywhere (desktop, phone, Help, Bob's chat lines) | The machine Bob runs on is his "replicant matrix", with a spec line beside the first mention on a screen; "(your computer)" after leaves/stays lines. Renamed above: This replicant matrix and updates, Check this replicant matrix, Speed for this replicant matrix, Fits your replicant matrix, Let my other replicant matrices in (was Let my phone in / Let my other devices in). Glossary "Replicant matrix", FAQ "What's a replicant matrix?", Welcome line. Model prompts still say PC on purpose. Spec: replicant-matrix-WORDING.md | — | ok (owner's exception to rule 1) |

## Bob ready in a few clicks (owner's ask, 2026-11-04)

| Where | Setting / text | Default | Status |
|---|---|---|---|
| Welcome: Get me ready | One list: Programs I run on, then Models, each with its own tick box, job (slot names), size and licence; spec line on its own; ticking a model ticks its program; warning when a needed program is unticked; "About X GB to download"; Get Bob ready (about X GB); Pause, Stop, Resume; Skip for now. Replaces Step 1 and Step 2 | recommended picks ticked; music (about 22 GB with its tools) and, with 32 GB RAM on built-in graphics, Gemma 4 26B and Qwen 3.8 27B listed unticked; nothing downloads until the button | ok (approved with edits) |
| Chat: Set it up / Use it / Switch it on card | "I can't ___ yet" with what's needed, sizes and free disk: Set it up (about X GB) downloads, fills the slot and carries on with the job; Use it fills the slot when the model is already here; Switch it on for Let Bob search the web (with its privacy line), Advanced workshop (ComfyUI) or a Hand ("Let Bob use Hands, <Hand>", "It lets me <can line>"); Not now. Same card on the phone. A Hand stopped with ✋ is never switched on from a card | nothing changes until a button is pressed | ok (approved with edits) |
| Bob's own Python | When there's no Python 3.12 or 3.11 for voices or the audio tools: Windows gets the PSF-signed Python 3.12.10 package from nuget.org (pinned, sha256-checked) into Bob's folder; Mac and Linux get uv's standalone Python 3.12 build | only as part of a setup the owner pressed | ok (approved with edits) |
| Settings, Show advanced settings, Bob-Net, Let my other replicant matrices in | No restart needed any more (Bob listens on Tailscale addresses live). New button "Let Tailscale through the firewall" / "Remove the firewall rule" (Windows, one UAC prompt, rule "Bob (Tailscale only)", 100.64.0.0/10, Bob's port); Linux shows the ufw/firewalld line; "On, but I'm not on Tailscale yet" line. Help + FAQ faq-firewall; phone app reach hint | — | ok (approved with edits) |

## 1.5.98 layout (settings layout review, 2026-11-04)
Nothing renamed apart from "Address for the phone" → "Address" and the Animations middle button off Windows. No defaults changed.
- **How Bob works** has three subheadings. *How he works*: Let Bob pick the session, One brain (snappier), Show Bob's plan before big jobs, Let Bob learn how-tos, Pick up where Bob left off after a restart. *Starting and closing*: Launch Bob on start-up, Keep Bob in the tray. *Going online*: Let Bob search the web. 1.5.132 adds a fourth, *Brains*: Show the naughty list.
- **This replicant matrix and updates** holds Check for updates when Bob starts.
- Advanced, in order: 🧠 Brains (plus Let the reviewer sit beside Bob's main brain, Keep chatting while Bob is busy, Give Bob all his tools at once) · 🖋 House style · 🔊 Voice details · 🌓 Look & feel · ⚡ Speed & memory · ⚙ Engines (Threads, Batch, Fit to free graphics memory, Speculative decoding and flags under More) · 🌐 Bob-Net (This Bob, My other Bobs, What they share) · ☁ Online services (Cloud helpers, Talk to Bob on Telegram) · 🔌 Other apps (ComfyUI) · ✋ Hands (subheading "Limits that always apply") · 🧹 Housekeeping · 🔔 Check-ins · 🗑 Remove Bob.
- Bob-Net, What they share: one line "These need Let my other replicant matrices in, just above." shows only while the door is off; the three repeated notes are gone.
- No panel repeats its title inside itself any more. The old panel ids `sub-adv-connections` (now Bob-Net) and `sub-adv-engines` (now Engines) still work.
| Settings > Everyday | 1.5.117 order: This replicant matrix and updates (first, closed; its line shows "Bob 1.5.x" + Check for updates, or "Bob 1.5.x is ready · Restart Bob now"), Bob himself, How Bob works, Projects, Where Bob saves things, How-tos | — | ok (approved) |
| Get models / Set up | The page strip is two labelled rows: "Get models:" Equip Bob … On this replicant matrix; "Set up:" Style · Settings | — | ok (approved) |
| Settings > Show advanced settings > Hands > Limits that always apply > Read-only projects stay read-only | Read-only projects: list with Remove, Browse… / Add row. "Bob's own folders are always read-only." No config.json on screen. | none | ok (approved) |
| Settings > Show advanced settings > Hands | Add a connected app and Paste a setup from another app under More (only with the Hand on); Add a recipe under More (only with Run programs on); Checks subheading: Sandbox (Check the sandbox), Self-test, Quarantine | — | ok (approved) |
| Settings > Show advanced settings > Brains | Session brains, How much each session keeps in mind, How much each brain keeps in mind fold closed with the value on the line | — | ok (approved) |
| Settings > Show advanced settings > Bob-Net > Passcode | Make a new passcode (both states) | — | ok (approved) |
| Style > Bob's look | 🧍 Make your own look / Change your own design (character screen; Adventure start card has its own "Looks like" with Change the look, Save this character, Saved characters, Delete this character) | Bob's avatar unchanged until Wear this | ok (approved with edits, 1.5.122) |
| Settings > Show advanced settings > Bob-Net > What they share | Pass my Bob-Net along (your Bobs introduce each other: no card; names and Tailscale addresses only; passcodes still between the two being paired). Now running gets a Bob-Net section (every Bob on the list and what he's doing for the others), shown only once Bob-Net is in use. Help: settings row, FAQ faq-party + faq-introduce, glossary Introduced. | off | ok (approved with edits, 1.5.123) |
| Now running > Bob-Net section | rows per Bob (💻/📱 name · state; this Bob 🏠) with aria-hidden dot | shown only once Bob-Net is in use | ok (approved with edits, 1.5.123) |

## Added in 1.5.127 (rented brains) — approved with edits by the design thread
| Setting | Hint | Default | Review |
|---|---|---|---|
| Equip Bob > Rented brain slot (🏗, left column) | "A big brain hired by the answer or by the minute from a service you have an account with. Only used when you say so, after a card with the cost." Empty: "Empty: every job runs on this replicant matrix". Kit: Use this one / Take it off / Set up rented brains in Settings | empty | ok (approved with edits, 1.5.127) |
| Chat page > 🏗 Rented brain switch (next to Web search; shown only with a rental in the slot) | On: every message runs on the rented brain after one Hire it card (good until about $1 more). Off: everything runs here. Per window. | Off | ok (approved with edits, 1.5.127) |
| Hire it card (chat and phone) | "Hire <name>?" <why> <model> on <service>: <price>. Start-up time. "What leaves this replicant matrix: this chat, the files you attached to it, my instructions and what I remember about you, to <service>." Buttons: Hire it (<estimate>) / Not now | nothing hired until pressed | ok (approved with edits, 1.5.127) |
| Settings > Show advanced settings > Online services > Rented brains > Spending limits | The most Bob may spend this month ($) · The most one job may cost ($) · The longest a hired machine may run (minutes). "Every limit starts at 0: nothing can be hired until you set it." | 0 / 0 / 0 | ok (approved with edits, 1.5.127) |
| Settings > … > Rented brains > Services > Let Bob hire from <service> | First time on: card "This sends your chat to <service> … I understand, turn it on / Leave it off". Line shows key found / no key yet (the variable's name, never the key) | all off | ok (approved with edits, 1.5.127) |
| Settings > … > Rented brains > Your rentals / Add a rental | Service, model, card size (machines), address + key variable (Another service), name. Buttons: Use this one · Take it off · Check the price · Remove | none | ok (approved with edits, 1.5.127) |
| Settings > … > Rented brains > Add a rental > Cards on the machine (machines by the minute only) | "1 card (the usual)" / "N cards at once: N times the hourly price". Picking 2, 4 or 8 opens a large red warning box: "⚠️ N cards at once costs about N times as much. About $X an hour, about $Y a day … Only pick this for a model that really doesn't fit one card." Buttons: I understand, N cards / Back to 1 card (snaps back to 1). The Hire it card repeats the warning. | 1 | ok (approved with edits, 1.5.127) |
| Settings > … > Rented brains > Machines running | Each machine with minutes and cost so far; "Stop everything now"; "Check the services again"; leftovers with "Stop it" | — | ok (approved with edits, 1.5.127) |
| Settings > … > Rented brains > Recent spending | Last rows of the ledger; estimates marked "(estimate)" | — | ok (approved with edits, 1.5.127) |

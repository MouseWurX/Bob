<h1 align="center">Bob of The Idle Process</h1>

<p align="center"><b>A local AI agent with a personality. He runs on your own computer, and nothing goes online unless you turn it on.</b></p>

<p align="center">
  <a href="#download"><b>Download</b></a> ·
  <a href="#what-bob-does">What Bob does</a> ·
  <a href="#the-computer-science-lab">The Lab</a> ·
  <a href="#bobs-own-brains">Brains and scores</a> ·
  <a href="#bob-net-bobs-working-together">Bob-Net</a> ·
  <a href="app/docs/README.md">All the docs</a>
</p>

![Bob's window in the Lamplight look: the glowing cube top left, tabs across the top, a chat in the middle and a quiet composer below](app/docs/screenshot.png)

<p align="center">Windows · Mac · Linux · Raspberry Pi · Android · iPhone &nbsp;|&nbsp; free and open source &nbsp;|&nbsp; no account, no telemetry</p>

## At a glance

| | |
|---|---|
| 🛠 **[A real agent](#what-bob-does)** | Research with sources, code written, run and fixed, documents read and shown beside the chat, files, other apps, pictures, clips, music and a voice. |
| 🧪 **[Computer Science Lab](#the-computer-science-lab)** | Cut, teach, mix, race and look inside a brain, then test it next to the one it came from. No command line. |
| 🧠 **[Bob's own brains](#bobs-own-brains)** | Three models cut and retrained to run Bob on everyday graphics cards, with every score, lesson set and dollar published. |
| 📡 **[Bob-Net](#bob-net-bobs-working-together)** | Your Bobs pool graphics cards and memory, pass jobs along and check each other's work, on your home network or Tailscale. |
| 🎮 **[Gaming friendly](#light-on-your-machine)** | The brain unloads when idle, and a Gaming session leaves the graphics card to your game. |
| 🔓 **Private and open** | GPL-3.0. Your chats, notes and models stay on your computer. Everything optional starts switched off. |

## See a brain think

| | |
|:---:|:---:|
| ![The cube builds itself as a brain loads, glows while it answers, and comes apart when it unloads](app/docs/screens/fnri-cube-load-unload.gif) | ![The cube glowing as Qwen3.6-35B-A3B answers](app/docs/screens/fnri-cube-thinking.gif) |
| **Load, think, unload.** One floor per layer. | **Answering, live.** Each lit block is an expert at work. |

This is **fNRI**, the Lab's brain imager, recorded from Bob's own window. [Watch the full minute](app/docs/screens/fnri-cube-qwen3.6-35b-a3b.mp4) · [what it shows](#the-computer-science-lab)

## Download

**Latest release ([what's new](CHANGELOG.md)):**

| | Download |
|---|---|
| **Windows 10 / 11** | [`Bob-1.5.210-win-x64.zip`](https://github.com/MouseWurX/Bob/releases/latest/download/Bob-1.5.210-win-x64.zip) |
| **Mac (Apple Silicon)** | [`Bob-1.5.210-mac-arm64.zip`](https://github.com/MouseWurX/Bob/releases/latest/download/Bob-1.5.210-mac-arm64.zip) |
| **Linux (64-bit)** | [`Bob-1.5.210-linux-x86_64.AppImage`](https://github.com/MouseWurX/Bob/releases/latest/download/Bob-1.5.210-linux-x86_64.AppImage) |
| **Linux .deb** (Ubuntu, Debian, Mint, Pop!_OS) | [`Bob-1.5.210-linux-amd64.deb`](https://github.com/MouseWurX/Bob/releases/latest/download/Bob-1.5.210-linux-amd64.deb) |
| **Linux Flatpak** (any distro with Flatpak) | [`Bob-1.5.210-linux-x86_64.flatpak`](https://github.com/MouseWurX/Bob/releases/latest/download/Bob-1.5.210-linux-x86_64.flatpak) |
| **Raspberry Pi and ARM** | [`Bob-1.5.210-linux-arm64.AppImage`](https://github.com/MouseWurX/Bob/releases/latest/download/Bob-1.5.210-linux-arm64.AppImage) (also as `-linux-arm64.deb` and `-linux-aarch64.flatpak`) |
| **Android phone** | [`Bob-1.5.210-android.apk`](https://github.com/MouseWurX/Bob/releases/latest/download/Bob-1.5.210-android.apk) |

Every build has a `.sha256` checksum on the [Releases page](https://github.com/MouseWurX/Bob/releases/latest). Install steps are under [Getting Bob](#getting-bob).

**On Windows 11?** Bob isn't code signed yet, so Smart App Control may stop him from running. [Read this first](#windows-11-smart-app-control).

## What's new

**In 1.5.210:**

| | |
|---|---|
| 🏮 **Three looks** | Classic, Lamplight (a dark room lit by Bob's cube, with Find anything on Ctrl+K) and Terminal, on the Style page. |
| 💭 **A thinking bubble** | The steps sit in a small bubble above the reply, and the chat shows only the finished answer. |
| 🗣 **Talk with Bob** | Press 🗣 and just talk, hands-free. He answers out loud and you can cut in. |
| 🧠 **One Brains page** | Settings, Brains picks every model; the catalogue sorts by best fit, filters by what runs here, and finds more models on Hugging Face and ModelScope. |
| 📖 **Help that starts where you are** | A guide written around jobs, opening on Start here, with each page's questions folded underneath. |
| 🧩 **Panels you build** | Put Now running's parts in a panel on the left or the right. |

| | |
|:---:|:---:|
| ![Bob's menu, opened by clicking the cube: Brains, Style, Get models, the tools and the session](app/docs/screens/bob-menu.png) | ![Find anything with calibrate typed: Brains and speed first, then Help topics](app/docs/screens/find-anything.png) |
| **Bob's menu.** Click the cube. | **Find anything.** Ctrl+K reaches every page, setting and Help topic. |
| ![The Now running drawer open on the right, beside the chat](app/docs/screens/now-running.png) | ![Brains in use, each with Calibrate and Set up, and Calibrate all at the top](app/docs/screens/brains-calibrate.png) |
| **Now running.** Closed until you open it from the status line. | **Calibrate.** Times each brain on your card and recommends the fastest way to load it. |

<p align="center">
  <img src="app/docs/screens/cube-porthole.png" width="420" alt="The porthole cube glowing beside Bob's name">
  <br><b>The porthole cube.</b> It lights the room: brighter while Bob thinks, nearly dark with no brain loaded.
</p>

<details>
<summary><b>On a phone, and the other two looks</b></summary>

| | |
|:---:|:---:|
| <img src="app/docs/screens/lamplight-phone.png" width="260" alt="Lamplight on a phone: cube and status line on top, the chat, the composer and the tab bar"> | ![The Classic look: the menu on the left and the chat in the middle](app/docs/screens/look-classic.png) |
| **Lamplight on a phone.** | **Classic.** |
| ![The Terminal look: green text on black, you and bob prompts](app/docs/screens/look-terminal.png) | |
| **Terminal.** | |

</details>

**In 1.5.208:**

| | |
|---|---|
| 💬 **Answers between steps** | Send a message while Bob works on a long job and he answers it when the step he's on is done, then carries on. "Stop" stops the job. |
| 🛠 **A hundred reliability fixes** | Saves that are whole or not at all, a loop that can't run away, tools set aside after three fails, an engine that restarts itself, and honest reporting. Always on, and nothing added to what his brain reads. |
| 🧰 **More tools** | A calculator, passwords, repeating reminders, read-only email and calendar, page watch, web services, data questions, charts, spelling, meeting notes and file compare. Each one off until you tick it. |
| 🧠 **Memory and documents** | Where each memory came from, memories that run out, project memories, fresh documents, page and line, notes apps and a Sunday digest. |
| 🧊 **The cube's whole life** | It fills as a brain loads, sparks while it waits, thinks while he answers, and drains when the brain goes. |

**In 1.5.207:**

| | |
|---|---|
| 🧭 **Journey** | Adventure as an old console game. Walk a tile map, open chests, talk to the village and fight turn-based battles. No brain needed. |
| 🧩 **Eleven more games** | Chess, Sudoku, a daily mini crossword, Four in a row, Hidden fleet, Liar's dice, Trivia night and more. Easy, Normal or Hard, two players on one screen, and a puzzle of the day. |
| 🔁 **Jobs you can steer** | Steer Bob mid-job, stop after this step, set a time limit, and get a receipt with Open and Undo. **How I got here** under each answer lists the tools he used. |
| 🛠 **Steadier work, better tools** | Replies start sooner. Bob asks one question on a card when he needs to, reads PDF and Office links, and looks at git history. If he says something is done when it isn't, a note puts it right. |
| 🩺 **Health and history** | Crash catching with a safe start, the last 20 Settings changes with Put it back, a Health page with fix buttons, quiet hours, and a shortcut from anywhere. |
| 🗓 **Everyday helpers** | A today card, a focus timer, a spending sheet from receipt photos, profiles for a shared computer, bigger text and an easier-to-read font. |
| 🎲 **Adventure table rules** | A map that grows, portraits, coins and shops, riddle rooms, Easy to Hard, and campaigns you can send to a friend. |
| 🧪 **More Lab** | A blind taste test that ranks brains, Save to Lab from the chat, before and after Teach it, and recipe files to share. |
| ⚡ **Engine and speed** | Load the next brain early, a speed history chart, laptop mode on battery, and a chat memory type for each brain. |
| 🗣 **Voice and phone** | Talk with Bob hands-free (short spoken answers, cut in any time), talk over Bob while he reads aloud, have documents read aloud, and carry a chat on to another Bob. On Android: Share to Bob, a home-screen widget and hands-free. |

Every new switch is off until you turn it on.

| | |
|:---:|:---:|
| ![Journey: Bob's Inn, a wooden tavern with tables, the hero by the bar and the innkeeper](app/docs/screens/journey-inn.png) | ![Journey: the world map with mountains, a road and travellers walking it](app/docs/screens/journey-world.png) |
| **Bob's Inn.** Every journey starts here. | **The world.** Rolled from a seed; guards walk the roads. |
| ![Journey: a village of red-roofed houses outside the castle gate, guards at the wall](app/docs/screens/journey-castle.png) | ![Journey: the keep's throne hall with a red carpet and knights along the walls](app/docs/screens/journey-keep.png) |
| **Outside the castle gate.** | **The keep.** A king, a queen, knights and guards. |
| ![Journey: a dark cave with a chest](app/docs/screens/journey-cave.png) | ![Journey: a turn-based fight against two guards in a town square](app/docs/screens/journey-fight.png) |
| **Caves** hide chests with good kit. | **Fights** drop coin and whatever the foe carried. |

<p align="center"><b>Journey.</b> Arrow keys walk, Enter talks, opens chests and swings. Bob's Inn, the rolled world, castles and patrols arrive in 1.5.211.</p>

<details>
<summary><b>Earlier:</b> 1.5.204 to 1.5.206, and before</summary>

| | |
|---|---|
| 💬 **A better chat** | A **…** menu on every message for Try again, Edit, Copy and Delete. A preset for each chat, saved prompts on a / menu, maths drawn as formulas, keyboard shortcuts, and chats saved, shared or brought in from ChatGPT, Claude and Open WebUI. |
| 🛠 **Steadier small brains** | Bob checks each tool call before it runs and mends what he's sure of, so a small brain slips less on long jobs. Always on. |
| 🗂 **Sort and rename** | A Hand that renames and files a whole music, video or photo collection by rules you set. Every change goes on a card first, nothing is overwritten, and Undo puts it all back. |
| 🎲 **Adventure grows up** | Enemies sit on the table with their hearts. Characters get stronger and keep it. A quest log and a world book, friends at the table, the odds on every card, your turn in your own words or by voice, and a storybook of the finished game. |
| 🧪 **A simpler, busier Lab** | Its own window, tabs sorted by task, one place to start, and **My Lab** for everything you've made. A queue runs jobs overnight, **Show the wobble** shows how much a score moves, and every brain takes an entry test with Bob's real tools. |
| 🧠 **Brains page** | Settings, Brains is the one place to pick brains. It shows how each brain runs here: on your card, with memory, with storage, with another Bob's help, or too big, with its Lab scores underneath. Add a model from a Hugging Face page. |
| 🧊 **3D models** | STL, OBJ and GLB open in the side panel. Bob makes a part from an OpenSCAD recipe, or a textured model from one picture. |
| 🔎 **Search by meaning** | Bob finds documents, memories and topics that are close in meaning, not only by exact words. |
| 🔌 **Doors for other apps** | VS Code, Open WebUI and scripts use Bob's brains at `localhost:7777/v1`. The Claude app and Claude Code use Bob's Hands, every call on a card. Tool packs add other people's tools, in the sandbox. |
| 🔒 **Lock, back up, move** | Every password and key Bob saves is locked on disk by your computer's own key store. A passcode lock scrambles chats and memory. One zip backs Bob up and restores him on another computer. |
| ⚡ **Brain Engine 4** | SCUT packets between your Bobs are signed and scrambled, and a lost packet is rebuilt at once. SCUT is still experimental. |
| 🌍 **More places, more languages** | Screens in French and Spanish. Bob on the iPhone Home Screen. A .deb and a Flatpak for Linux. |

Housekeeping is now on: it touches only Bob's own files unless you add folders, and it always asks first.

**Before that:** documents beside the chat · notes that take themselves · Settings in its own window, Simple or Advanced · the "Do you want me to:" list · **SCUT** and **SUDDAR** for Bobs sharing a brain over Wi-Fi · Onyx, Bob's recommended voice.

</details>

The [changelog](CHANGELOG.md) has every release.

## What Bob does

| | |
|---|---|
| ![A chat about a garden budget on the left, and the spreadsheet open in the side panel on the right](app/docs/screens/documents.png) | ![First-time setup: the programs and models Bob suggests for a 16 GB card, each with a tick box](app/docs/screens/get-bob-ready.png) |
| **Documents beside the chat.** Sheets, slides, pages and PDFs. | **Ready in one button.** Bob reads your card and fetches what fits. |
| ![The Brains page: each brain, its jobs, and where it sits on the card and in memory](app/docs/screens/brains-page.png) | ![The adventure table: three characters, two enemies with their hearts, the game master's story, and cards for the player's turn](app/docs/screens/adventure.png) |
| **Brains.** Each brain, the jobs it does, and where it sits on your card. | **Adventure.** Bob runs the table; the app rolls the dice, shows the odds and counts the hearts. |

- **Work:** plans and reminders, web research with sources, code written, run and fixed, documents and spreadsheets read, searched and written.
- **Make:** pictures painted and edited, short clips, songs and sound effects, 3D parts and models, and a voice (22 Kokoro voices and more).
- **Hands (opt-in):** tidy files, sort and rename a music, video or photo collection, run scripts you approve, keep a schedule, click around other apps, use his own browser window, and work inside Blender or Unreal Engine through MCP. Every action shows a card first. Tool packs add tools other people made.
- **Remember:** Topics, notes and memory banks keep what matters between chats. Exact sums are worked out in a locked sandbox, not guessed.
- **Lots of context:** 256K tokens (about 195,000 words) on a 16 GB card, and up to 1M with Long memory.
- **A character:** eleven personality dials, 133 avatars, a cat named Patches, and opinions about your code.
- **Play:** a tabletop adventure with enemies, a quest log, a world book and friends at the table, Journey on a tile map, and sixteen games from hangman to chess.
- **Works with your other tools (opt-in):** other apps use Bob's brains through an OpenAI-style address, and Claude can use Bob's Hands.
- **Yours to keep:** a passcode lock, backups that move Bob to another computer, and screens in English, French or Spanish.
- **Big brains when you want them:** rent one for a single job from a service you have an account with. Off to start, with spending limits that start at $0.

<details>
<summary><b>More pictures:</b> Settings, the first-time list, games, the bestiary, themes, Help and starting an adventure</summary>

| | |
|---|---|
| ![Settings, Simple: eight cards such as Bob himself, How Bob works and Brains and speed](app/docs/screens/settings.png) | ![Settings, Advanced: every section in a side list, with Bob himself open](app/docs/screens/settings-advanced.png) |
| **Settings, Simple:** eight cards. | **Settings, Advanced:** every section, with search. |
| ![Do you want me to: tick boxes for quick notes, reading documents, the sandbox and more](app/docs/screens/do-you-want.png) | ![Games: twenty questions, hangman and word ladder, each with its choices, Easy to Hard and Today's puzzle](app/docs/screens/games.png) |
| **"Do you want me to:"** Everything optional, in one list. | **Games:** sixteen, from twenty questions to chess. The app checks every move. |
| ![The bestiary: goblins, skeletons, wolves and friends with hearts and a line from Bob](app/docs/screens/bestiary.png) | ![Style: themes such as Moondust, Nightside and Otterbend](app/docs/screens/style.png) |
| **The bestiary:** the usual suspects, drawn as they appear. | **Style:** themes named after worlds, or build your own. |
| ![Help, written by Bob: a search box, topics on the left, Getting started on the right](app/docs/screens/help.png) | ![Starting an adventure: panels for the story and its tone, your character, who plays, how long and table extras](app/docs/screens/adventure-start.png) |
| **Help (F1):** written by Bob, with a glossary and FAQ. | **Starting an adventure:** pick a story, a character and who plays. |

</details>

## The Computer Science Lab

Most AI apps are for talking to a model or for building one. Bob does both. **🧪 Lab** in the menu opens in its own window, so you can change a brain while Bob keeps chatting.

![The Computer Science Lab in its own window: seven tabs, Keep it simple or Professional, and Make a brain asking What do you want to do?](app/docs/screens/lab.png)

| Tab | What you do there |
|---|---|
| **Make a brain** | Starts with one question: **What do you want to do?** Make it smaller, cut experts, take out sight or hearing, just test, or everything step by step. Each job shows only the steps it needs, and **Use in Bob** only appears after the test. |
| **Teach** | **Teach it** teaches a brain a lesson set, here if it fits your card. **Best answers** has a bigger brain judge a smaller one's answers, then teaches it its best. |
| **Test** | **Challenges** are short tests out of 100, with a scoreboard by size. **Smaller**, **Longer** and **Faster** show how small, how long and how fast a brain can go. **Taste test** ranks brains by the answers you prefer, names hidden. A queue runs Challenges, Smaller and fNRI scans one after another overnight. |
| **Look inside** | **Peek inside** shows which experts your work uses. **fNRI** scans a brain while it answers and plays it back in 3D. |
| **Learn** | Hands-on cards on how a brain works, run on the brain Bob has loaded. |
| **Forge** | Every way to make a brain, side by side: smaller, cut, mixed, stacked, or taught back on a rented card. |
| **My Lab** | Everything the Lab has made and measured: brains, scores, size ladders, lesson sets, recipes and recent jobs. |

- **Keep it simple or Professional.** Simple fills in Bob's defaults. Professional shows every control and its proper name. **Show the recipe** prints every command the Lab runs.
- **Brain Engine** is Bob's own engine. It switches a brain's experts on and off while it's loaded, so the Lab can try a cut before writing a file.
- **fNRI** (functional Neural Response Imager) shows a brain as a 3D block: one floor per layer, every expert coloured by the skill that used it most. Its **weight map** colours the block by the brain's own weights instead: how strong each expert is, or how much it differs from another brain.

  ![fNRI's weight map of Riker, and the same block coloured by how much each expert differs from stock Qwen3.6-35B-A3B](app/docs/screens/fnri-weight-maps-riker.jpg)  
  *Riker's weights. Top: how strong each expert is for its floor (purple weaker, yellow stronger). Bottom: how much each expert changed from stock Qwen3.6-35B-A3B. The glow is the experts answering a question.*

  ![The fNRI viewer: a sample scan as a 3D block, experts coloured by Coding, Chat, Maths and Stories, with the player and skill switches beside it](app/docs/screens/fnri-viewer.png)  
  *The viewer with a sample scan (made-up data): tick a skill to show or hide it, then play the answer back word by word.*

<details>
<summary><b>More pictures:</b> Teach, Test, Forge and My Lab</summary>

| | |
|---|---|
| ![The Teach tab on Teach it: what each size of graphics card can teach, and the Trainer pack it needs](app/docs/screens/lab-teach.png) | ![The Test tab on Challenges: pick a brain, then short tests with how long each takes](app/docs/screens/lab-test.png) |
| **Teach** | **Test** |
| ![The Forge tab: Ways to make a brain, each card with where it runs and best practice folded under it](app/docs/screens/lab-forge.png) | ![The My Lab tab: brains you made, scores, size ladders, lesson sets, saved recipes and recent jobs, each with a link to its page](app/docs/screens/lab-my-lab.png) |
| **Forge** | **My Lab** |

</details>

Lab jobs need at least 12 GB of memory; a smaller computer can start them on a bigger Bob on your Bob-Net. Making an fNRI scan needs Brain Engine, on Windows or Linux. More in the [user guide](app/docs/USER-GUIDE.md#11-the-computer-science-lab).

## Bob's own brains

Three models made from Qwen3.6-35B-A3B with the same tools that are in the Lab: the least-used experts are cut away, then the brain is taught back against the full model. All three are Apache 2.0 and free to download.

| | **Riker** (28Bob) | **Bobert** (35Bob) | **Bill** (20Bob) |
|---|---|---|---|
| What he is | Bob's everyday brain | The full model, taught every lesson | The smallest so far |
| Experts kept per layer | 208 of 256 | 256, no cut | 144 of 256 |
| File at Q4 | 17.5 GB | 21 GB | 12.7 GB |
| On a 16 GB card | A few experts in RAM | More in RAM | Fits whole |
| Tool decisions, 314 held-out chat turns | 65% | 65% | **68%** |
| Short facts | 18 of 20 | **20 of 20** | 12 of 20 |
| Code that runs | **6 of 6** | **6 of 6** | 1 of 6 |
| Download | [28Bob-Riker](https://huggingface.co/MouseWurX/28Bob-Riker) | [35Bob-Bobert](https://huggingface.co/MouseWurX/35Bob-Bobert) | [20Bob-Bill](https://huggingface.co/MouseWurX/20Bob-Bill) |

Same tests, same rented card, each Bob served from his public Q4 file. Riker matches Bobert at a size that suits a 16 GB card, so he is Bob's default. Bill is best at tool decisions and weakest at facts and code, and is published as he is.

**Riker against the model he was cut from**, at home on a 16 GB card:

| Test | Riker | Full Qwen3.6-35B-A3B |
|---|---|---|
| ARC-Challenge, thinking off / on | 92.9% / 93.9% | 95.8% (off) |
| ARC-Easy, thinking off / on | 97.6% / 98.3% | 98.9% (off) |
| Tool decisions, held-out chats | 65% | 67% |
| Coding race, 13 tasks, thinking on | 9 | 12 |
| One fact hidden in up to 128K tokens | 12 of 12 | 12 of 12 |
| Speed | **111 tokens a second** | 83 tokens a second |

**Open data and write-ups**

| | |
|---|---|
| [bob-lessons](https://huggingface.co/datasets/MouseWurX/bob-lessons) | The lessons the Bobs learned from: chat, tool calls, thinking on and off. CC BY-SA 4.0. |
| [bob-odds](https://huggingface.co/datasets/MouseWurX/bob-odds) | The teacher's next-word odds used to teach each cut brain back. |
| [How they're made](app/docs/BOBS-OWN-MODELS.md) | The method, every result, and what went wrong along the way. |
| [What they cost](app/docs/COSTS.md) | Every rental, itemized, failures included. |
| [Brain races](app/docs/BRAIN-RACES.md) · [test results](app/docs/test-results/README.md) | How other brains score on the same tests and the same PC. |

Bob picks Riker's file for your card himself: Q4, or Q3 on an 8 GB card.

## Bob-Net: Bobs working together

Put Bob on your PC, laptop, handheld and phone, and they find each other on your home network or your own private [Tailscale](https://tailscale.com) network. Every part is off until you turn it on.

<img src="app/docs/screens/phone.png" width="240" align="right" alt="Bob for Android: the phone asks the PC's Bob for a wireframe fox and gets it back">

- **Pool graphics cards and memory.** A brain too big for one computer is spread over your Bobs' cards and memory. One bigger than all of that can still run from a fast SSD.
- **Fast where it counts.** The first load sends the brain once; later loads send only what's missing. A brain that fits on one computer stays there, because that beats any network.
- **Bobs working in concert.** Borrow a bigger Bob's brain for a reply, send a job to whichever Bob is free, or have a bigger Bob check a handheld's harder work.
- **The phone app** talks to the Bob on your PC, and can run a small brain on the phone itself.
- **Adventures together:** your other Bobs join the party in the tabletop game.

<br clear="right">

## Light on your machine

| | |
|---|---|
| Graphics memory Bob holds while idle | **None.** The brain unloads, and big models load only for the job that needs them. |
| 🎮 Gaming session, first word of a reply | **0.1 seconds** with the brain loaded, on the processor, with the graphics card left to your game. |
| Context on a 16 GB card | **256K tokens**, and up to 1M with Long memory. |

Pictures and big jobs wait in Tasks while you play, and **Let games go first** has Bob use fewer processor cores. The measurements are in [How Bob stays fast and light](app/docs/PERFORMANCE.md).

## Getting Bob

### Windows 10 or 11, in five steps

1. **Download** `Bob-<version>-win-x64.zip` from the [latest release](https://github.com/MouseWurX/Bob/releases/latest).
2. **Unblock it:** right-click the zip, **Properties**, tick **Unblock**, **OK**. If Windows shows "Windows protected your PC", click **More info**, then **Run anyway**.
3. **Unzip** it into a folder you'll keep.
4. **Start Bob:** double-click **Bob.exe** in the `Bob` folder.
5. **Pick his brains:** Bob suggests engines and models for your card. Click **Get Bob ready**. Nothing big downloads until you press it.

`Bob.exe` is Electron's official program, only renamed, which Windows usually trusts. To update: Settings, **Check for updates**, then **Update Bob**.

#### Windows 11: Smart App Control

> [!WARNING]
> Bob isn't code signed yet. If your PC has Smart App Control on, Windows may stop Bob, or one of his engines, from running. It has no **Run anyway**.
> - **If it blocks a new engine,** Bob keeps the one he had and says why. He tries each new engine before it replaces the old one.
> - **If it blocks Bob,** the fix until Bob is signed is to turn it off: press Start, type *Smart App Control*, open it and pick **Off**.
>
> Think about it first. Smart App Control protects your PC from unknown programs, and on some versions of Windows 11 it can't be turned back on without resetting Windows. Bob never changes it himself. More in [Signing and Smart App Control](app/docs/SIGNING.md).

### Other computers

| | |
|---|---|
| **Mac (M1 or newer)** | Drag Bob into Applications. The first time, click **Open Anyway** in System Settings > Privacy & Security. Builds are ad-hoc signed ([why](.github/CONTRIBUTING.md#signed-mac-builds)). |
| **Linux** | Mark the AppImage as executable and double-click it; nothing is installed, and an older distro may need `libfuse2`. Or install the .deb (`sudo apt install ./Bob-<version>-linux-amd64.deb`) or the Flatpak (`flatpak install --user ./Bob-<version>-linux-x86_64.flatpak`; it's sandboxed, so a few Hands do less). **Update Bob** fetches the same kind. |
| **Raspberry Pi and ARM** | A 64-bit Pi 4 or 5 runs the arm64 AppImage the same way, with small brains on the processor. No pictures on ARM yet. |
| **Android** | Open the .apk on the phone. It talks to your Bob over Tailscale. |
| **iPhone and iPad** | Nothing to download. Turn on **Let my other replicant matrices in** in Bob's Settings, open his address with `/phone/` on the end in Safari over Tailscale, then tap Share and **Add to Home Screen**. A brain on the phone and the microphone button need the Android app. |

Windows is the main platform. An NVIDIA card helps but isn't required. The Mac and Pi builds are tested on GitHub's machines but not yet on real hardware, so [tell us how they go](https://github.com/MouseWurX/Bob/issues). A few Windows-only parts are hidden elsewhere. To build from source, see [Building Bob](app/docs/BUILDING.md).

## Where Bob keeps things

Bob's program and his things live apart, so updating never touches your models or notes.

- **You pick the folder when Bob is installed or first opened.** Bob suggests a `Bob` folder in your user folder and takes any drive. He refuses temporary places like AppData, because models are 10 to 60 GB. A cloud-synced folder (OneDrive, Dropbox, Google Drive, iCloud) is allowed, but Bob always recommends against it: every model would be uploaded.
- **To move it later:** Settings, **Bob's home folder**, then **Move here…**.
- **His pictures, clips and songs** go to the folder in Settings, **Where Bob saves things**, with a **Change folder…** button. **Made by Bob** lists them all.

## Using Bob

The **[user guide](app/docs/USER-GUIDE.md)** walks through everything in plain English, and **Help** (F1) inside Bob has a section for every setting. You can also just ask Bob how to set something up: he knows his own settings.

Every other page, from benchmarks to building from source, is listed in **[the docs](app/docs/README.md)**.

## Removing Bob

**From Bob:** Settings, This replicant matrix, **Remove Bob…**. Bob closes, and a small window removes his program, the Start menu shortcut, the start-up entry and his window data. Two boxes, unticked by default, also remove his chats and settings and the models he downloaded (to the Recycle Bin).

**By hand:** turn off "Launch on start-up", close Bob, then delete the `Bob app` folder, `Bob.lnk` in the Start menu, `%APPDATA%\Bob`, and, if you want, Bob's home folder.

Bob installs no services or drivers and needs no admin rights.

## Credits

Bob is inspired by the wonderful books of Dennis E. Taylor. Bob is an independent, fan-made project. It is not affiliated with, sponsored by or endorsed by Dennis E. Taylor or by his publishers, distributors or licensees. All characters, names, titles, stories and other rights in those books remain the property of their respective owners. Bob contains no text from the books; any similar names or ideas are used only as a tribute. The licences below cover only MouseWurX's own original work in this repository, not anything that belongs to the author or his publishers. If you hold rights in those books and have a concern, please [open an issue](https://github.com/MouseWurX/Bob/issues) and we'll respond promptly.

Bob's own brains are made from [Qwen3.6-35B-A3B](https://huggingface.co/Qwen/Qwen3.6-35B-A3B) by Alibaba's Qwen team (Apache 2.0). Brain Engine is built on [llama.cpp](https://github.com/ggml-org/llama.cpp) by the ggml authors (MIT).

Testing and releases: **Porter**, a Claude assistant made by Anthropic, carried Bob's builds through testing on real hardware and out the door as releases. Thanks, Porter.

## Licence

- Code: GNU GPL, version 3 or later ([LICENSE](LICENSE)).
- Art and writing (avatars, icons, themes, Bob's character and texts, the voice clips that ship with him): CC BY-SA 4.0 ([LICENSE-ART](app/docs/legal/LICENSE-ART), details in [ASSETS-LICENSE.md](app/docs/legal/ASSETS-LICENSE.md)).
- The MouseWurX name and logo and the name "Bob of The Idle Process" aren't licensed: see [TRADEMARKS.md](app/docs/legal/TRADEMARKS.md).
- Third-party parts and the models Bob can download keep their own licences: see [THIRD-PARTY.md](app/docs/legal/THIRD-PARTY.md).

Contributions are welcome: see [CONTRIBUTING.md](.github/CONTRIBUTING.md). Security problems: [SECURITY.md](.github/SECURITY.md).

## Code signing policy

**Bob's releases are not code-signed yet.** We applied to the [SignPath Foundation](https://signpath.org) (free signing for open-source projects) in November 2026; they asked us to come back once the project has more public visibility. Until then, Windows shows "Windows protected your PC" the first time: click **More info**, then **Run anyway**, and use the `.sha256` file to check the download. Windows 11's Smart App Control is stricter than that prompt and has no Run anyway: see [the note under Getting Bob](#windows-11-smart-app-control). If Bob is useful to you, a star on this page genuinely helps.

Once signing is set up:

- Only files built from this repository's source by its GitHub Actions workflow (`.github/workflows/build.yml`) will be signed. Electron's own runtime in the zip stays unchanged and unsigned by Bob.
- Committers and reviewers: the members of this repository with write access.
- Approvers: the project owner. Every signing request for a release will be approved by hand.

**Privacy policy** ([PRIVACY.md](app/docs/legal/PRIVACY.md)): This program will not transfer any information to other networked systems unless specifically requested by the user or the person installing or operating it. Bob reaches the internet only for downloads you confirm, voice samples you play, web searches if you turn on "Let Bob search the web", and online services you switch on yourself. Bob sends no telemetry.

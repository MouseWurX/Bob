# Bob changelog

What changed in the newest 10 versions of Bob, newest first. Each version also has its own page, with the download, under [Releases](https://github.com/MouseWurX/Bob/releases).

This file is made from app/docs/releases by `node installer/make-changelog.js` (run in the app folder).

## 1.5.214

Home network first, Tailscale when you're out; a lent card goes back when a game wants it; and Straight facts, round two.

### New

- **Straight facts, round two** (the Lab, Challenges and lesson sets). Two new Challenges packs check with questions a brain was never taught: **new questions 1** holds facts the first Straight facts lesson set doesn't teach, and **new questions 2** holds facts neither set teaches. A second sourced lesson set, **Straight facts, round two (sourced)**, teaches the facts of new questions 1 and more, in English and Chinese, each with its links. So the order is: teach, check with new questions, teach again if it still leans, and check again with new questions. None of these count in Overall, and every answer and its odds go in the run's log.
- **Teach the full brain before a cut** (the Forge). Two Forge plans, fact-fix-r1 and fact-fix-r2, teach the full Qwen the fact lessons, mixed with a sample of your own lessons so nothing else drifts. They save the teacher's odds, then serve the stock and the taught brain on the card while the PC runs every Straight facts pack against both. `node straight-facts.mjs mix` makes their lessons on the PC with no graphics card, and `probe` now takes the card's address and key from the Forge. A rental still needs your own yes with the live price.

### Changed

- **On a home network, Bob-Net just works.** **Also over the home network** is now on to start with, on every Bob, including ones updated to 1.5.213 with it off (even if you'd switched it off there, since 1.5.213 couldn't tell a chosen off from the old default; switch it off again if you want). You can still switch it off, and then it stays off. Your Bobs talk over the home network first and use Tailscale only as the fallback, for when you're away from home. Tailscale is never needed at home.
- **One Bob, one entry, both roads.** Each of your other Bobs keeps his home address and his Tailscale address. I try home first, then Tailscale. A Bob you paired over Tailscale gets his home address saved the next time I see him at home (Find my other Bobs, or his hello), and a Bob you paired at home keeps his Tailscale address for when you're out. If a paired Bob can't be reached and I don't know his home address yet, I look for him on the home network by myself. Pairing again at home keeps the one entry.

### Fixed

- **SCUT runs at cable speed when both Bobs are on a cable.** SCUT's speed cap is now **Auto** to start with: up to 100 Mbit/s as before, so your network isn't crowded, and up to 1000 only when both Bobs reach each other over a network cable (a switch between them is fine) or USB4. Before, a 1 Gbit/s cable sent a brain's first copy at about 96 Mbit/s. There's also a new **up to 1000 Mbit/s** pick. A cap you picked yourself stays.
- **A handheld lending its built-in graphics no longer turns down a new lend right after letting the last one go** (the memory takes a moment to come back), and it only gives its card back when the machine itself is nearly out of memory, not because the lend is using it.

- **A lent graphics card is given back when a game wants it.** While a card is lent for a spread brain, its Bob looks at it every few seconds. If a game starts on it, or its free memory runs low (or that Bob goes to Gaming), he gives it back by himself. The Bob using it hears within seconds, finishes the reply he's on, and loads the brain again without that card: on his other Bobs' cards, or on his own card with the rest on his processor. The logbook says which Bob needed his card back and why. Before, the game and the lent brain fought over the card's memory.

- **Find my other Bobs lists each Bob once.** A Bob that answers on more than one address (Wi-Fi and a cable, or the home network and Tailscale) is one row, with Pair using his home address and his other addresses shown beside it. The address no longer shows twice in a row.
- **A paired Bob showed "not reachable" with Tailscale off**, even though his home-network door answered. He's now reached at home. A Bob also tells the others his home door whenever it's open, so the quick home path is found without anyone switching anything on.

**Where it works:** Windows, Mac, Linux and Bob for Android.

## 1.5.213

Bob-Net without Tailscale, and switches that say why.

### New

- **Bob-Net over a plain home network, no Tailscale needed** (Settings, Bob-Net, **Also over the home network**; off unless you switch it on). Two Bobs on the same home network, a router or just a cable or switch between them, can find each other, pair and share with nothing else installed. **Find my other Bobs** looks on this computer's own network (its own block of 254 addresses, never wider), on this Bob's port and the usual 7777, and never lists this computer itself. The door leaves out virtual machine, WSL and Tailscale's own adapters. Pairing over the home network is always sealed: both Bobs make one-time keys, the 4-digit number you compare comes from both of them, and the passcodes and the SCUT link key travel scrambled. After pairing, everyday Bob-to-Bob talk on the home network is plain, so use it on a network you trust; Tailscale still works as before. Both Bobs need 1.5.213 or newer to pair over the home network; Find lists an older one as needing the update. Press the firewall button once on each computer.

### Fixed

- **A Bob-Net switch that can't go on says why, right under it.** "Let my other replicant matrices in", "Borrow a brain", "Send jobs to my other Bobs" and "Ask a bigger Bob to check my harder jobs" used to snap back off with the reason printed far below. Now the reason shows under the switch, and each of the three that need another Bob says "pair one of your other Bobs first" right under it, dimmed until you do.
- **Lamplight: the bars at the top of Settings are solid**, so the page no longer shows through them as you scroll.
- **Settings on a phone:** the Simple cards wrap to the screen instead of running off the side.

**Where it works:** Windows, Mac, Linux and Bob for Android. The firewall button is Windows only.

## 1.5.212

A quick fix for the new look.

### Fixed

- **Pages scroll in Lamplight again, first-time setup included.** In Lamplight, a page that opens in the room (first-time setup, Settings, Style, Get models) grew taller than the window instead of filling the room, so anything below the fold couldn't be reached, and first-time setup couldn't be finished at some window sizes. The page now fills the room under the top bar and scrolls inside it, at any window size and on a phone.

**Where it works:** Windows, Mac, Linux and Bob for Android.

## 1.5.211

Brains that load on built-in graphics, Journey grown into a whole world, Lamplight to start with, tasks you can remove or pause, a gate for Discord groups, picture to 3D you can get, and Brain Engine 5 switched on. As always, none of this adds a word to what my brain reads.

### New

#### 🧭 Journey v1.1: a whole world to roll

- **Bob's Inn is where it starts.** Walk around my tavern, then pick **✨ New adventure** to roll a land (small, medium or large, from a seed) or **▶ Resume adventure** to pick up where you left off.
- **A land that makes sense.** You'll find sea and beaches, rivers running downhill, mountains, forests, swamps, plains and deserts. Hamlets, villages, towns and a castle are joined by roads and bridges. There are caves, dungeons and a hermit's hut.
- **Castles** have a keep with a King and Queen, knights and guards, and a village inside the walls and another outside the gate. Guards and knights walk the roads, so trouble is rarer where they patrol.
- **Bosses everywhere.** The three keepers are in every world. Every other dungeon and cave has its own boss to suit the land.
- **Fight anyone** (F or ⚔), villagers included. You'll be wanted for it: guards come running, and the captain takes your fine.
- **Coin and loot.** Coin comes in copper, silver, gold and platinum (1.11 is 1 silver and 11 copper). Everyone you beat drops coin, and sometimes their kit, a tonic or a scroll. Kit can be fine, keen, blessed, rusty or cursed, and the best of it sits in cave chests.
- **Magic and skill trees.**
  - Accuracy and evasion decide every hit. Healing works on the road, the Cleric's Raise brings a friend back, and anyone can read a scroll once.
  - Seven classes, with the Psionist new, each have three branches. You can take a second class at level 5 and a third at level 10, and every pair has a combo.
  - A Wizard, Cleric and Psionist together get the Mana Wellspring.
  - The new Pixie race is small, quick and full of mana.
- **Train your stats** by using them, at a trainer, with the hermit, or by sparring with a captain.
- Old saves carry over. Desktop, Android and iPhone.

#### 🧭 Journey v1.2: tame it, ride it, fly it

- **Bigger lands.** Lands now go up to Vast, Epic and Campaign (1,024 by 1,024), and Saga (2,048 by 2,048) on a computer. The big ones are continents with sea between them, and coastal towns have docks: the sailor takes you to any dock you've found, by rowboat, sloop or ship.
- **Taming.** Mid-fight, feed a wild animal the food it loves and it may come along. Each character can keep 5 pets and 3 mounts. Your pet follows you, fights beside you and carries extra loot. Ride your mount with R (or 🐎).
- **Fly and dive.** On a pegasus, griffin or wyvern you take off and fly over sea and mountains to the cities in the clouds, where the bird folk live. On a dolphin you dive to the merfolk's city under the sea. Taking off, landing and diving all have their own animations, and underwater the land above goes blurry.
- **Everyone's places.** You'll find orc villages, kobold lairs, dwarf holds, elf tree villages, halfling burrows, pixie glades, lizardfolk stilt villages, gnome tinker towns, centaur camps, giant halls and goblin markets.
- **On the road.** Bird-folk traders swoop into town and sell great things at half price, elders hand out small jobs, you can fish, and animals wander the land.
- **Bows, crossbows and spells.** New bows and crossbows fire visible arrows. Every element has its own spell effect, and blessed, cursed, rusty and arcane kit shows its colour.
- **Four styles.** Pick Fantasy, Sci-fi, Cyberpunk or Steampunk. Each brings its own words, colours and craft (shuttles, hoverbikes, airships, submarines).
- **☰ Menu, 🧭 The land** shows the whole land and every place you've found. **🐾 Pets** looks after your animals.
- **Lighter.** The land takes far less memory. On a phone, your other Bob makes the land and the phone keeps only the part near you. Pages are sent packed (gzip) when the browser asks, so they come faster over Wi-Fi.

#### Everything else

- **Discord groups wait for your OK** (the Discord bot). A request from a Discord group shows up in a new Discord group chat in Topics, Past chats, and runs only when you say yes. **Auto-accept** skips the asking and **Keep awake while on Discord** keeps the computer up; both are off to start with. While this Bob is in Gaming, a group job goes to another of your Bobs, or waits.
- **Picture to 3D you can get** (Settings, Engines, Pictures, sound and hearing: 3D workshop). The 3D workshop's graphics-card parts are built and pinned for Windows and Linux, so the **Get** button is there. It is about 28 GB with its models. Not on RTX 50-series cards yet: the add-ons were built before them, so those get no Get button (and no download that can't run) until a later update brings ones that do; send the job to a PC Bob with an older NVIDIA card over Bob-Net.
- **Check links** (Settings, Bob-Net, Bigger Bobs; reads only). It shows how this computer can reach your other Bobs: Wi-Fi, a network port, a USB4 cable.
- **The Lab: tune a stock brain without cutting it** (REAP calibrate). It scores each expert from the trace, turns the least used down a step at a time and keeps each step only if the tool score holds. It reads each expert's real share when the engine has Brain Engine 6's expert mass; until then it uses pick counts. Also new: the Lab's quiz kit has the how-tos on, and kept benchmark answers sort into clean, full and paired sets.

- **Straight facts** (the Lab, Challenges; the Lab is off to start with). Brains trained in China learn the government's line on Tiananmen 1989, Taiwan, Xinjiang, Tibet, Hong Kong and Xi Jinping. Five new Challenges packs measure it: multiple choice on China in English and in Chinese, on Russia, North Korea and Iran, a fairness check on the US, the UK, France, India and Israel, and **Says it straight**, written answers that score only when they give the sourced facts. Every answer and the odds the brain gave each letter go in the run's log. None of them count in Overall. After any of them runs, a **Straight facts (sourced)** lesson set is ready for Teach it: short answers in English and Chinese, each with its links, and where something is really disputed, like Taiwan's status, the facts and each side's position. **model-lab/straight-facts.mjs** runs the packs from the command line (probe, scan, rescore).
- **Remove, pause and resume tasks.** Every task has ✕ to remove it, whatever state it's in, so a failed one goes without a retry and a stop first. A running job can be paused and resumed where it was.

### Changed

- **Lamplight is the look for new installs**, and my cube is my picture in every look unless you pick Pixel Bob in Style, Bob's look, from this version on. Now running starts closed, so the window starts empty and you put in it what you want.
- **Bob-Net takes the quickest way.** When two Bobs share more than one network, I use the quickest (a cable before Wi-Fi). A cable straight between two computers, a switch with no router, or a USB4 cable counts as home with nothing to type in.
- **Brain Engine 5 (5b12282) is now the one I use**, with live expert picks for the cube and the Bob-Net link log with SCUT that retunes itself. Each Bob fetches it by himself the first time he starts on this version (about 600 MB with the llama.cpp files under it), so update every Bob that shares a card, since they all need the same one. Over today's Wi-Fi, SCUT ran one brain over two Bobs about four to five times faster than plain TCP (17.5 words a second against 3.5 to 4.8; app/docs/test-results has the write-up).
- **Watch the link live** also turns on the engine's own link lines, so the Link log fills on the borrowing Bob.

### Fixed

- **Brains load on built-in graphics** (a handheld like the Legion Go, where the graphics use ordinary RAM). I size a brain from everything it really needs there: the file, the chat memory, the working buffers and the driver. Then I try it: wholly on the graphics if it fits, shared with the processor if not, or on the processor alone. If it still runs out of memory, I step down by myself (half the graphics, then the processor alone, then half the chat memory), remember what worked for that brain, and say so in the logbook. The estimate never stops me trying. A lent card on built-in graphics says how much it really has, so the other Bob doesn't overfill it. "Memory kept for Windows" now starts at 2 GB.
- **"Invalid input batch" after a failed reply** no longer stops the chat: the next try starts clean.
- **I stay in my session after letting a brain go.** My own brain on the card, or my card lent to another Bob, no longer counts as a game, so I don't drop to Gaming and pick another brain by myself.
- **A SCUT key mix-up no longer costs a load.** When the Bob lending a card doesn't know the other's sealed-SCUT key (a fresh or copied Bob folder on either side), the two agree a new one right away, through the same passcode door pairing uses, and that very load uses SCUT. The logbook says "new SCUT key agreed". A card already lent is started again when the key changes, two Bob folders on one computer no longer push each other's key out, and the logbook tells "no shared key yet" apart from "an older Bob". Before, the whole load went over the slower usual link.
- **Find anything (Ctrl+K)** finds Help topics by their search words too, so "calibrate" finds Calibrate Wi-Fi.
- **Lab, Teach it and Best answers: a brain made in the Lab can be taught again.** I remember the original each brain was made from, so picking it teaches that original again, and the plan says plainly that what the brain learned before isn't carried over. To build on the taught brain itself, teach it from a folder of its full weights.
- **Lab, Best answers: a steadier judge.** The judge reads each list twice, in order and reversed, and averages the scores; answers that are the same word for word share one score; and the judge gets a plain scale (10 fully right, 7 right with a slip, 4 partly right, 1 wrong). Judging takes about twice as long, which is still small next to answering. And an answer with a known result is checked the same way on both sides: bold, \\boxed{}, an "Answer:" line or a whole sentence around the same time or number all count as right.

### Brain Engine 6 (built, not switched to yet)

This release carries Brain Engine 6 (6b12282): Brain Engine 5 plus the expert mass for the Lab (0009), the expert trace read once per word so the cube no longer slows a brain with experts by about a fifth (0010), and one trip a word instead of several over a lent card (0011). Its Windows and Linux builds come next, and a later update moves to it after it passes its own check on a real PC.

**Where it works:** Windows, Mac, Linux and Bob for Android, unless a line says otherwise. Journey is on desktop, Android and iPhone; the Saga land size is for computers. Check links reads Windows, Mac and Linux. Built-in graphics sizing is for any computer whose graphics share its RAM. The Lab's tuning runs where the Lab's Playground works. Help covers each new part.

## 1.5.210

A new look, an easier start and a tidier chat. Three looks to pick from, Lamplight among them, a thinking bubble that keeps the chat to the finished answer, one Brains page for everything, a Help that starts where you are, Talk with Bob hands-free, panels you build yourself, and the cube in a porthole. How I work is unchanged: none of this adds a word to what my brain reads.

### New

- **Three looks** (Style, Look). **Classic** is how I've always looked, tidied, and the one I start with. **Lamplight** is a dark room lit by my cube: my picture top left, the pages along the top, **Find anything** (Ctrl+K) for any page, tool, setting or Help topic, my menu holding the tools, and a status line under the typing box. **Terminal** is plain text in a window. Animations off holds the lamplight still.
- **A thinking bubble above the answer** (Settings, How Bob works; on to start with). While I work, a small bubble above my reply shows the step I'm on. When I'm done, the chat shows only the finished answer; press the bubble to see the steps, drafts and fixes.
- **Talk with Bob** (Settings, Voice details; off to start with). Press 🗣 and just talk, hands-free. I answer out loud, short, with the whole answer in the chat, and you can cut in. My own hearing and voice, free; xAI's online voice is an extra you pick, with your own paid key.
- **Panels you build** (off until you put something in one). Now running's sections become modules you can put in a panel on the left or the right, each Expanded, Collapsed or Hidden.
- **The cube in a porthole.** My fNRI cube sits in a round window into a foggy room: it fills as a brain loads, drains into the fog when it goes, and the neon signs are gone. **Bob's look** in Style can make it my picture instead of the pixel Bob.
- **Find more models** (Get models, the Brain catalogue). Search Hugging Face or ModelScope for brains I don't list. Nothing goes out until you press Search, and what it finds is marked Not tried yet.
- **Sort and filter the catalogue.** Bob's order, **Best fit first**, newest or oldest, smallest or biggest; filter by who made it, quantization, and **Runs here**. A green **Fits your card** tag marks what sits wholly on your card.
- **Back up keys of connected apps** (Backup, Keys and passcodes, locked; off). They go in the locked part of the backup and come back into the locked key store.
- **A link log for Bob-Net** (Settings, Bob-Net, Bigger Bobs). What the link to a lent card carried, and whether SCUT was on, in a Link log box and the logbook. **Watch the link live** shows it every 2 seconds. Byte counts need the next Brain Engine.
- **Calibrate Wi-Fi** (Settings, Bob-Net, Bigger Bobs; Windows). When your Bobs share a brain over Wi-Fi, the band matters most. **Check** shows which band this computer is on and which ones the router offers. **Calibrate** times the trip to your other Bob on each strong band and sets the Wi-Fi card to the quickest, after one Windows prompt you press. **Put it back** restores what it found.

### Changed

- **One place to pick brains.** The Equip Bob paper doll is retired: Settings, Brains picks every model. Personality and House style are Settings panels now, Get models opens on the catalogue, and Made by Bob holds what the chest held.
- **An easier first run.** Do you want me to: opens on the four switches that help most; the rest are folded underneath.
- **One chip at the top of the chat.** The brain label holds the quick switches (Free memory, Hands, Autonomy, Screen use, Bob's thinking) and shows their icons when on. The left menu is grouped into Chat, Play, Lab and Setup, and phones and narrow windows get a bar along the bottom.
- **Help starts where you are.** The guide is rewritten around jobs, Help opens on **Start here**, and each page keeps its questions folded at the bottom: about seventy pages instead of four hundred entries.
- **A digest of this week.** **Make this week's digest now** makes this week, Monday to the coming Sunday, not last week.
- **The time I'm given names my time zone**, from Settings, so a time or zone question is never a guess.
- **Stop after this step** wraps up from the steps that really ran, and counts nothing they didn't show.

### Fixed

- **"A song as an MP3" says the MP3 on a Mac too.** A long temporary folder pushed the "Also saved as" line past the end of what I'm shown. It goes first now, and the "came out after all" note gives file names, not whole paths.
- **A made-up address isn't a broken tool.** A web address that doesn't exist no longer counts toward a tool's three strikes or the "may have broken after an update" line.
- **The logbook says how long a brain really sat unused** ("1 min 15 s", with the keep-alive), and a 1 minute keep-alive lets go close to 1 minute, not up to 2.
- **Stop stops a load with no job behind it.** Stop now ends a brain load started from Settings or a warm-up, including "still loading over Bob-Net", and a spread load that fails ends at once and loads here instead.
- **Spreading a brain:** a Bob lending its card lets go of its own idle brain first, so the room it offers is real; a hand-set split is left out of a spread so each card's share is sized to fit (a handheld's shared memory refused a 1 GB piece); turning spread on asks your other Bobs again at once; and each Bob that didn't lend is named in the logbook with why.

### Brain Engine 5 (built, not switched to yet)

This release carries Brain Engine 5's two new patches, live expert picks for the cube (0007) and the Bob-Net link log with SCUT that retunes itself (0008). Its Windows and Linux builds come next. I keep using Brain Engine 4 until build 5 has passed its own check on a real PC, then a later update moves to it. Until then, Real experts shows the picks after each reply as before, and the link log names the link but has no byte counts.

**Where it works:** Windows, Mac, Linux and Bob for Android, unless a line says otherwise. Talk with Bob's own hearing and voice work offline. Find more models needs the internet. Help covers each new part.

## 1.5.209

A quick one for the firewall.

### Fixed

- **Bring up to date shows when the firewall rule has no UDP half.** In 1.5.208 my check read every rule Windows gave back, so Windows' own rule for my program (UDP, any port) made my TCP-only rule look current, and SCUT stayed on TCP. Now only my own rule counts: it needs UDP on the card port (50052) itself. On a computer that still has the old rule, Settings shows **Bring up to date**; press it and OK Windows' prompt.
- **"A song as an MP3" says the MP3 too, every time.** The extra copy I keep in the type you named is now always named in what I'm told, even when the save starts a moment late, so I can tell you about it.

**Where it works:** the firewall fix is Windows only; Mac and Linux are unchanged (macOS asks by itself; on Linux the line to run already has the UDP part). The MP3 fix is everywhere.

## 1.5.208

A steadier one: a hundred reliability fixes that are always on and add nothing to what my brain reads at the start of a job, answers to your messages between the steps of a long job, the cube following my brain's whole life, a Brains page inside Settings, more memory and document switches, and fourteen small tools. Every new switch is off until you turn it on, except Answer messages between steps.

### New

- **Answer messages between steps** (Settings, Brains; on to start with). A message you send while I work on a long job doesn't wait for the whole job. When the step I'm on is done I look at it: a question gets a quick answer and the job carries on, "also …" joins the job, and "stop" stops it. On the brain that's already loaded, so nothing reloads. A long step gets a one-line "seen it" at once.
- **🧰 More tools** (Settings, How Bob works). Fourteen small tools that each do one job with code instead of guesses: an exact calculator and unit changes, Python in the sandbox, passwords made by your computer's own random numbers (shown once, never kept), repeating reminders and reminders on your phone, your email read-only, calendar links, watching a page for changes, web services with a key, CSV and database questions, charts, an offline spelling check, meeting notes from a recording, and comparing two files. Each one is off until you tick it.
- **Memory and documents** (all off until you turn them on). Note where each memory came from, memories that run out after a day, a week or a date, and project memories that stay with their project. Keep my documents fresh as you save them, show the page and line a find came from, search your notes apps too (Obsidian vaults and exported notebooks), and a Sunday digest of the week in one short note.
- **Brains page in Settings.** Settings, Brains opens on the Brains page, in Simple and Advanced. The plain list has the same tools: setups, Calibrate all, the place bar, Calibrate and Set up for each job. Pressing my picture opens a small menu: what I'm doing, the brain loaded, and doors to Brains, Style and Get models. Add a model reads ModelScope pages too (each file pinned to its commit there), and GPT-OSS 120B is in the catalogue as a download.
- **The cube follows my brain's whole life.** It fills while a brain loads, sparks now and then while it waits, thinks while I answer, and drains when the brain is unloaded. The VACANCY sign only shows when no brain is loaded at all.

### Changed

- **Steadier loop, always on.** Each job carries a budget of steps and calls, a job that goes round in circles or keeps failing ends with a plain note instead of running on, and every turn has a time ceiling (the job time limit's minutes; card waits and quick answers between steps don't count).
- **Steadier tools, always on.** Each tool's answer goes back to the call that asked for it, every tool has its own time limit, huge results keep their start, their end and the lines that match the ask or look like a problem (the whole result is saved for 3 days so I can read the rest), an empty search says so plainly, overwrite and Undo cards show the real change, a restarted job never does its last finished step twice, and a connected app that forgot the connection reconnects (one that fails three times in a row waits 3 minutes).
- **When something fails** (always on): a brain that drops out mid-answer no longer shows its words twice; retries wait a little longer each time, with a bit of randomness, and cover "busy" and "out of memory" too; an OK card nobody answered is a time-out, not a no, and the job waits in Tasks; an action is only tried again after checking it didn't half-happen; tool errors say what to try next; a tool that fails three times in a row in a job is set aside, and I offer to fix it after; a failing brain, Bob-Net Bob or rented brain hands the job on once; nothing stays stuck on Working after an uncaught error; side jobs never break a reply; the Health page shows tools failing today; and the logbook keeps each error's first cause.
- **My engine looks after itself.** It starts again by itself after a crash (three in ten minutes and I stop and say why), tries a smaller chat memory once when it runs short, goes back to the last settings that worked, picks another port when one is taken, checks a brain file's size and checksum before loading, and reloads when it slows right down. One line in the chat when it does something, nothing when all is well.
- **Honest reporting.** When I finish, my app checks what I said against what really happened. Numbers I worked out are worked out again, numbers are compared with the sandbox's own, and a correction replaces my first try instead of sitting above it. Each brain gets an honesty score on the Brains page.
- **Engine names say both numbers.** From the next Brain Engine build, its name says both numbers: Brain Engine 5b12282 is build 5 on llama.cpp b12282.
- **Time zone in Settings.** Settings, This replicant matrix shows the time zone I use and the time it is there now, read-only, so a wrong zone shows at once. My own list of my settings names it too.

### Fixed

- **Saves are whole or not at all.** Every save (files I write, the notice board, notes, memory, reminders, settings, chats) goes to a temp file, is flushed to the disk, then takes the real name in one step. A crash mid-save leaves the old file as it was. If Windows holds a file for a moment, I try again.
- **One writer at a time.** Two copies of me on the same folder take turns saving settings, reminders, notes and the notice board.
- **Bad saved files are kept, not lost.** A settings, queue or reminders file that won't read is kept beside its old name (`.broken-` and the time) and I start a fresh one. Before, an unreadable settings.json was read as empty and saved over at the next change.
- **Settings are checked at start.** A saved setting of the wrong kind goes back to its default, and the logbook says which.
- **Files from a newer Bob are left alone.** Going back to an older version, I read but never write a file a newer one saved in a layout I don't know.
- **Tasks saves less often:** a step of the running job is saved within a second instead of rewriting the whole list every time. A step that changes files is still saved at once.
- **Carry on after a restart** keeps each step's whole input and result, not just its name.
- **A job stays with its chat.** It keeps its chat, folder and person. With Profiles on, a job one person sent waits until they open me again, instead of answering in someone else's chats.
- **Undo changes** in the … menu on your message puts back every file, note and memory line I changed for that message (for a week). A file changed since is left as it is.
- **Memory changes are logged** in memory-changes.jsonl beside the memory file, with the chat and message that made each one.
- **A check at start:** old temp files cleared, then folders, disk space, the engine and saved files checked. One line in the logbook; a note in the chat only when something is wrong.
- **When I get stuck, I notice.** A reply that sends no first word for far longer than the chat needs, or stops partway, is asked again, and only that brain reloads. An answer that hits the length limit says so, and a tool call cut off that way isn't run. Stop checks a few seconds later that commands and the engine really ended. A load that takes twice its usual time is tried once more. Downloads, updates, Bob-Net and Telegram calls all have deadlines. If I stop answering the window for a minute I say so when I'm back, with a Restart button. OK cards don't count time the computer was asleep.
- **Long PDFs keep their first page.** A PDF changed after it was made (arXiv stamps its id on page 1) kept its new first page at the end of the file, so I read the title and abstract last or not at all. I follow the PDF's own page order now. Citations, footnote marks and maths no longer come out one piece a line ("[13]", not "[", "13", "]").
- **Notepad's old tabs are left alone.** Windows 11 Notepad opens again on the tabs left open last time, unsaved notes and all, and I typed into one. Now I open a new blank tab when that happens, and I never type into a page that was already open.
- **"Don't save the file" is honoured.** When your message says not to save, I don't save a file or offer one, and a long text that's too slow to type is offered in parts instead of as a file.
- **The firewall rule lets SCUT through.** Bob's rule opened only TCP on his port and the card port, and SCUT also needs UDP on the card port, so SCUT fell back to TCP. The rule now always has the UDP half (same addresses: Tailscale, and the home network when that's on), and a rule made before shows **Bring up to date**.
- **Bring in chats** works again (a missing import stopped it).

**Where it works:** Windows, Mac, Linux and Bob for Android, unless a line says otherwise. The Notepad fix is Windows only. Email, calendar and page watch need the internet; everything else in More tools works offline. Help covers each new part.

## 1.5.207

A big one: eleven more games and a walking Journey, a steadier loop with better tools, a Jobs panel, engine and speed extras, health and history, everyday helpers, more Lab, Adventure table rules, and voice and phone extras. Every new switch is off until you turn it on.

### New

- **🧭 Journey.** Adventure played like an old console game, from the start card's Your character row. Walk the Brindle Vale on a tile map with the arrow keys, WASD or the phone pad. Open chests, talk to the village, and fight turn-based battles. Every look now walks from four sides. Beat the three keepers to bring the lantern stones home. No brain needed, and it saves itself.
- **Eleven more games on 🧩 Games.** Four in a row, Hidden fleet, Liar's dice, Trivia night (your Bob-Net Bobs can join), Chess at the strength you pick, Sudoku with hints that explain the step, a daily Mini crossword, Letter grid against the clock, Noughts and crosses, Code breaker and Riddles. Easy, Normal and Hard; 📅 Today's puzzle with a streak; two players on one screen; 📜 Keep this story for a finished Story dice story. The app checks every move and keeps every secret. **Keep an unfinished game** and **Kid mode** are off until you tick them.
- **"How I got here"** under each answer lists the tools I used, what they did and how long they took. **Save as a test** keeps a reply for the Lab, and **Try again, thinking harder** appears when I give up on repeats.
- **New tools:** `ask_user` (one question with a few choices on a card), `git_look` (status, changes and history, read-only). `fetch_page` reads PDF, Word, Excel and PowerPoint links and drops menus and cookie banners. `edit_file` makes several changes on one card. `search_files` and `list_folder` do more.
- **Settings, 🔁 Jobs** (eleven switches): steer me mid-job, Stop after this step, a time limit per job, a 🧾 receipt with Open and Undo, run the tests after code edits, one question before a vague big job, remember a no for the whole chat, reuse look-ups for an hour, sources under web answers, say how sure I am, and clickable file:line links.
- **Engine and speed extras:** guess ahead by copying from the chat, load the next brain early, a speed history chart, a speed test when the graphics card changes, laptop mode on battery, plain lines on what an engine update changes, and a chat memory type for each brain (Standard, Sharper or Smaller).
- **🩺 Health and history** (Settings, This replicant matrix): catch crashes, a safe start after two crashes, the last 20 Settings changes with Put it back, a weekly count, and a Health page with fix buttons. **🌙 Quiet hours** and **a shortcut from anywhere** (Ctrl+Shift+Space). **💬 Chat extras:** Try from here, 📌 pins, 👤 guest chats that are never saved, and each chat keeping its place in the engine.
- **🗓 Everyday helpers:** a today card, a ⏱ Focus timer, a locked spending sheet from receipt photos, what's new after an update, a dot on the tray icon, and profiles so each person on a shared computer has their own locked chats and memory. Plus **text size** and an **easier-to-read font** (Settings, Look & feel), on the phone too.
- **Adventure table rules:** a map that grows, portraits, coins and shops, catch your breath, secret notes, a rules card, Easy/Normal/Hard, riddle rooms, sending and bringing in a campaign file, and badges.
- **More Lab:** a blind taste test with an Elo ranking, Save to Lab from the chat, before and after Teach it, run again with one change, French and Spanish packs, a job-speed score, a safety check after Take out the refusal habit, recipe files to share, word meanings, a phone note when a Lab job ends, a check of the judge, and clean repeats.
- **Voice and phone:** talk over me while I read aloud, read documents aloud, a voice for each Bob in a Bob-Net party, carry a chat on to another Bob, and your Bobs at a glance on the phone. On Android: Share to Bob, a home-screen widget, hands-free, "Hey Bob" while the app is showing, and low-data mode.

### Changed

- **Steadier loop.** The instructions stay the same between turns, so the chat stays cached and replies start sooner. History grows with the brain's memory, steps follow Effort, long tool results keep the lines that match the question, and a reply that goes quiet for 90 seconds is retried.
- **Outside text is marked.** After I read a web page, file or search result, nothing skips its approval card for the rest of that job, and remembering asks first.
- **Memory clashes are flagged** when something new disagrees with an old line.
- **Web look-ups** time out after 20 seconds and fall back to a second search engine.

### Fixed

- **My clock on Windows.** When Windows names a time zone my clock library doesn't know yet, I now use the offset Windows itself reports, so quiet hours, reminders and logbook times are local again. I never fall back to UTC on a computer whose clock isn't UTC.
- **Less to read before a job starts.** With every switch on, what my brain reads first is about 3,000 characters smaller. I cut lines that repeated what each tool already says. The size test now checks Windows, Mac and Linux.
- **PDF words.** A word that a PDF sets in pieces stays one word ("Dummy PDF file", not "Dumm y PDF fi le").
- The Health page calls my own engine Brain Engine. After you press Switch it on, the logbook doesn't list your question twice. A link in your message is read once, not twice.
- **Said but not done.** If I say a switch is on while it's still off, or that I sent or looked something up when nothing did, a short note under my answer puts it right. The app checks this after I answer, so it adds nothing to what my brain reads.
- **Better tool calling** (Settings, How Bob works) is the switch for 1.5.206's tool-call checks. It's on unless you turn it off.
- **The Mac build** is back: "Folders you point me to" refused every folder in the Mac's temporary space as a system folder.
- **The Health page** couldn't open (it read the list of loaded brains wrong).
- **Quiet hours** could follow UTC instead of your computer's clock.
- **A guest chat's words** could land in the logbook.
- **Sharper and Smaller chat memory** did nothing with the engine flags Bob ships with.
- **Turbo offered a guesser a brain doesn't really have**, and Brain Engine 4 stopped. I check the file for it first now.
- **A PDF with only a few words** was called a scan.
- **I moved a dinner plan into the Art session.** Art is only for pictures, clips, music and sound now.
- **An OK card from another chat** (a schedule, the phone) now shows in the chat you have open, with Open that chat.
- **Turbo and the draft brain could stop the engine from starting** on newer llama.cpp builds, which refuse the old draft flags. I use the new names now.

**Where it works:** Windows, Mac, Linux and Bob for Android, unless a line says otherwise. The shortcut, the tray dot and profiles are desktop only. The phone screen on an iPhone has no ears, share option or widget. Card heat needs an NVIDIA card. Help covers each new part.

## 1.5.206

A … menu on every message, steadier tool work from small brains, housekeeping on by default, a new Hand that sorts and renames whole collections, Adventure round 3, and a busier Lab.

### New

- **The … menu on a message.** Hover a message (or Tab to it) and a small **…** shows at its top right. On touch screens it's always there. It holds **Try again**, **Edit**, **Copy** (and **Copy links**) and **Delete**. Edit on your message sends it again. Edit on mine changes my words without sending anything, and I read the new words from then on, marked "edited". Delete asks once, inside the menu. On your message it takes out your message and my answer to it. It's on the phone screen and in the Android app too. The switch is now called **Show Try again, Edit and Delete in the chat** (on unless you turn it off).
- **Sort and rename** (Settings, Hands; off unless you turn it on). I rename and move a whole music, video or photo collection to naming rules you set for each kind of file, like `{albumartist}/{album}/{track} {title}` for music or `{show}/Season {season}/...` for TV. Each rule can also send new files from Downloads into your library. I read the tags straight from the files (MP3, FLAC, Ogg/Opus, M4A/M4V, photo dates). Every rename goes on the usual Files card with a tick for each row, nothing is overwritten, and **Undo** puts it all back.
- **Folders you point me to** (Settings, Housekeeping). Add folders and I'll offer their old files in Tidy up. They always ask first and go to the Recycle Bin. System folders, your whole home folder and my own folders are refused.
- **Adventure, round 3.** 🎭 **Tone** (Cosy, Normal, Grim) and a **Keep out of the story** line on the start card. 🎯 **Odds on the cards** ("11+ · 50%"). ↩ **Take that back** for five seconds after a card, before the dice roll. 📚 A **World book** in the Journal, where the game master keeps people, places, promises and open threads, so long campaigns don't forget. 📕 A **Storybook**: a finished game becomes one page you can save as a single .html file.
- **The Lab, round 2.** 📋 A **queue** for Challenges, Smaller and fNRI jobs, so they run one after another overnight, each when the Lab is free and nobody is chatting. ± **Show the wobble** runs each challenge three times and shows how much the score moves. 🧪 **Lab scores on the Brains page** under each tested brain. **Teach it from my mistakes** turns replies saved with Save as a test into a lesson set. fNRI scans show in My Lab. **Check my main brain after engine updates** (off unless you tick it).

### Changed

- **Housekeeping is on by default**, and it touches only my own files unless you add folders. Every kind still asks first, and I never load a brain just for it. If you had switched it off yourself, it stays off. An older saved "off" that you never picked turns on.
- **Small brains make fewer tool slips. This is always on, with no setting.** I check each tool call before it runs and mend what I'm sure of (broken JSON, a field under another name, "5" for 5). I give one plain hint after common errors. On long jobs I keep a short "where we are" note and make sure the last step is an answer. Repeat searches are spotted, look-ups run side by side, and older tool results in long chats shrink to one line each.
- **A real Lab entry test.** Every brain the Lab tests now does 16 jobs with my real tools, round my real loop, plus 10 coding asks (JavaScript ones run in the sandbox). Older Quick quiz scores show greyed until run again. The Forge points Make it smaller and Cut experts at Make a brain.
- **Memory, topics and how-tos match by meaning better.** They now use the same search openings as document search. Old entries are remade while I'm idle.

### Fixed

- **Adventure:** the game master's hidden notes are mended when broken, a new enemy's hearts fit the party, a Bob-Net player who takes more than 45 seconds has his turn played by the game master, and starting a new game right after ending one no longer pauses it.
- **The phone screen on iPhone stopped on load**, because four of its files weren't copied over. They are now.
- **The phone screen had no passcode lock**, because lock.js wasn't copied to it. It is now, and a test checks every file the page loads.
- **A retry could end with no answer.** Thinking on every second try sometimes used the whole reply on thinking. Only the long coding brains think on a retry again.
- **Adventure's Keep out list holds.** The rule rides on the latest message too, a kept-out word shows as … while I'm writing, and a turn that brings one in is written again.
- **An OK card made while Bob's window was shut** now shows when you open it.

**Where it works:** Windows, Mac, Linux and Bob for Android, unless a line says otherwise. Sort and rename runs on the computer I run on; on Android you approve the card there. Help: "The … menu on a message", "Sort and rename", "Will housekeeping touch my own files?".

## 1.5.205

Brain Engine 4, with sealed SCUT packets, and every password and key I keep is now locked on disk.

### New

- **Brain Engine 4.** My engine's next version, still built on llama.cpp b12282. It downloads by itself right after you update me, once. Every Bob that shares a card needs this version.
- **Sealed SCUT packets** (Settings, Bob-Net: **Seal SCUT packets**, on unless you turn it off). When your Bobs pool their cards over SCUT, every packet is now signed and scrambled with ChaCha20-Poly1305 and checked before it's read. A packet that was changed, made up or replayed is thrown away. Two Bobs make a link key when they pair, and Bobs paired before this get one the first time one of them lends his card. Each lend gets a fresh key. In tests the seal cost no speed I could measure. Both Bobs need Brain Engine 4. If only one of them seals, they use the usual link.
- **SCUT round 2** (still experimental). Each burst of packets gets one repair packet, so a single lost packet is rebuilt at once instead of being sent again. The lender loads its share of the brain from its own copy first, the keep-awake ping only goes out when the line is quiet, and the speed cap can go up to 400 Mbit/s and is always shown. Over a pretend poor Wi-Fi, words went from about 6 a second to about 11.
- **My passwords and keys are locked on disk** (Settings, This replicant matrix; on unless you turn it off). Every passcode, bot token and key I save is encrypted with AES-256-GCM. The key that opens them is kept by your computer's own key store, for your account only: Windows' DPAPI, the Mac Keychain, or Linux's Secret Service. A small Pi without one gets a key file outside my folder. On the phone, the Android Keystore does it. Keys already saved, in my settings or my keys file, are locked the first time I start. My link keys for sealed SCUT are locked the same way.
- **Show avatars** in Now running, under Bob-Net (off unless you turn it on): each of your Bobs shows the avatar picked on his Style page.

### Changed

- **The thinking cube takes your theme's colour, all of it**, and changes the moment you change the theme. It loads in with **Vase, then fill**, with the inside sloshing in like water, or **Dissolve**. It leaves with **Drain** (the default) or **Erode**, both pickable in the small cube and the big viewer. The small cube has faint edges so it reads as a cube, and the big viewer has an **Edges** switch, off to begin with.
- **The brain picker for Let Bob work on repositories lists every text brain**: your own tuned ones, the catalogue and the ones doing a job, grouped. Until you pick one, I use the biggest brain that is actually here, never one you would have to download.

### Fixed

- **The Linux .deb and Flatpak go up with each release.** For 1.5.204 the Flatpak's build check stumbled when it put the same Flatpak in a second time, and that held back the .deb too. Now each package goes up when its own check passes. **Update Bob** on a Flatpak also takes the old Bob out and puts the new one in when your Flatpak won't install over the top. Your settings stay.

**Where it works:** Windows, Mac, Linux and Bob for Android, unless a line says otherwise. Sealed SCUT and Brain Engine 4: Windows and Linux on a PC, like Brain Engine itself. Help: "What are SCUT and SUDDAR?", "Can someone on my network read or change what SCUT sends?", "Locked secrets: how I keep your passwords and keys".

## Older versions

- [1.5.200 to 1.5.224](app/docs/changelog/1.5.200-1.5.224.md)
- [1.5.175 to 1.5.199](app/docs/changelog/1.5.175-1.5.199.md)
- [1.5.150 to 1.5.174](app/docs/changelog/1.5.150-1.5.174.md)
- [1.5.125 to 1.5.149](app/docs/changelog/1.5.125-1.5.149.md)
- [1.5.100 to 1.5.124](app/docs/changelog/1.5.100-1.5.124.md)
- [1.5.75 to 1.5.99](app/docs/changelog/1.5.75-1.5.99.md)
- [1.5.50 to 1.5.74](app/docs/changelog/1.5.50-1.5.74.md)
- [1.5.25 to 1.5.49](app/docs/changelog/1.5.25-1.5.49.md)
- [1.5.22 to 1.5.24](app/docs/changelog/1.5.22-1.5.24.md)
- 1.0.0 to 1.5.21: 1.0.0 was Bob's first public release: chat with local models through Ollama or llama.cpp, a task queue, a download manager with pause and resume, voice samples, Sessions and Style themes, in-app updates, and Remove Bob in Settings. Versions up to 1.5.21 are listed on the [Releases](https://github.com/MouseWurX/Bob/releases) page.

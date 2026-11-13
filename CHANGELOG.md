# Bob changelog

What changed in the newest 10 versions of Bob, newest first. Each version also has its own page, with the download, under [Releases](https://github.com/MouseWurX/Bob/releases).

This file is made from app/docs/releases by `node installer/make-changelog.js` (run in the app folder).

## 1.5.218

The Lab gets the new training protocol.

### New

- **The training protocol** (the Lab, Forge tab). The 11 steps for teaching a brain, in order. Three free steps run here on your computer, one at a time:
  - **Clean a lesson set** into a new Lab set. The original is never changed.
  - **Make right-vs-wrong pairs** from it.
  - **Sweep a running Brain Engine**: try more or fewer experts per word, scoring each kind of lesson on its own. Local engines only, and every switch is put back after.
- **New ways to teach** (the Forge form, all off to start with): learning from right-vs-wrong pairs (ORPO, DPO, KTO), a share of on-policy teaching (the small Bob answers and the teacher corrects it word by word), a reward pass, targets, and edits to bake into the brain. These run on a rented card. Nothing cuts, trains or rents without your press on the purchase card, with the caps you type.

### Good to know

- The switch to Brain Engine 7 in 1.5.217 downloads about 588 MB once (the llama.cpp b12282 base it sits on, plus Brain Engine's own files).

**Where it works:** Windows, Mac and Linux.

## 1.5.217

Brain Engine 7 is switched on, and the line under my name follows what I'm doing.

### Changed

- **The line under my name follows what I'm doing**, in my own words, and changes the same moment the cube does. Asleep with no brain loaded ("Vacancy. Brain not included."), loading, ready ("Coffee in hand. Ready when you are."), thinking, writing back, working, painting or paused. "Needs your OK" always starts with those words, in red. If I stay in one state a while, the line now and then swaps for another of its kind. Hover it for the plain word. Prefer plain words? Switch off **Funny status line** in Settings, How Bob works.

- **Brain Engine 7 (7b12282) is my built-in engine now**, in place of Brain Engine 5. Bob updates it by himself, and every download is checked. It passed its check on a 5070 Ti:
  - Plain replies are as fast as before, or a little faster (Qwen3 4B: 213.6 words a second, up from 209).
  - **The cube fills as a brain loads**, by how far the engine has really got, not by a guess.
  - **Experts per word** (experimental) now works out of the box. A new count takes about 15 ms, with no reload.
  - **The cube's Real experts costs about half what it did**: about a tenth of the word speed shown live (Riker 115.1 down to 104.7 words a second), and about 4.5% read after the answer. On Brain Engine 5 it cost about a fifth.

Bobs sharing a graphics card need the same Brain Engine, so update all your Bobs together.

**Where it works:** Windows and Linux with an NVIDIA card. Mac, ARM boards and Android use plain llama.cpp as before.

## 1.5.216

"Stop" and "wait" work at once, coding agents side by side, OK cards on all your Bobs, and my thinking on its own.

### New

- **Coding agents** (experimental, off to start with, Settings, Other apps). Run Claude Code, Codex, Gemini CLI, Qwen Code, OpenCode or any other coding program side by side, each in its own project folder. They show in Now running under **🤝 Coding agents**, folded to one line with a small badge like "1 needs you · 2 working". Open it to ask one something, stop it, read what it said, answer it when it needs you, or press **Pass to** to hand its work to another one with a note. **When done pass to** hands it on by itself, and agents can ask each other (at most 4 hand-ons). They can't change files unless you switch **May change files** on. Each agent can use its own **Account**, so two people can each run their own agents on their own sign-ins at the same time. Claude Code can also tell me exactly when it's working or waiting on you. My brain isn't involved, and nothing about them goes into my start-up words. Not on Bob for Android.
- **Answer my OK cards on any of your Bobs** (off to start with, Settings, Bob-Net, **Show my OK cards on my other Bobs**). Each OK, question or plan card shows on every Bob on my list and in the phone app, marked with my name. Answer it on any of them and it comes down everywhere. Pairing cards stay on the Bob being paired. Bob-Net in Now running says how many of each Bob's cards are waiting on you.

### Changed

- **Tasks speak up in a small bubble, not a strip.** The Tasks strip above the message box is gone. When a task starts, waits or fails, a see-through bubble says so under the Tasks tab (above the Tasks button on a phone), fading in over about 0.7 seconds and back into the tab.

- **Open Bob's thinking shows just my thinking.** The thinking bubble's **Open Bob's thinking** and the 💭 button now open Now running with only my thinking in it, titled **Bob's thinking**. The status line or Ctrl+J brings the rest back. If my thinking is in a panel, it opens there.

- **A lent graphics card shows what it's helping with.** While your card helps another Bob run a brain, a small 🖐 badge on the corner of my picture says that brain has Hands, Autonomy or Screen use on. Hover or tap it for the full sentence.
- **Helper Bobs work side by side on your code.** When I split a self-work job between my Bobs, each helper works in his own copy of the code, on a branch of its own, and the work is merged back. If two changes clash, I redo that part here.

### Fixed

- **"Stop", "wait" and "go on" work at once.** Before, "wait", "hold on" or "no no" got a reply while the job kept going. Now, while I work on a job of yours, a short message on its own is a command, done the moment you send it, even halfway through a step. "Stop", "cancel", "belay that" or "no no" stops the job. "Wait" or "hold on" pauses it. "Wait 10 minutes" pauses it and I carry on by myself after that. "What are you doing?!" pauses, just in case. "Go on" or "you got it" carries on. It's on to start with (Settings, Brains, **Stop and wait words**).

- **One step count.** The thinking bubble's "Worked for · N steps" counted drafts and notes too, so it didn't match How I got here. It now counts only the steps, shows each step's details on its rows, and has **Copy the steps**. While the bubble is on there's no separate How I got here fold.
- **Lamplight, narrow window:** Now running had no background.

**Where it works:** Windows, Mac and Linux. OK cards also show in Bob for Android.

## 1.5.215

One brain really is one brain, Journey gets its own tab, the cube fills as a brain loads, picture to 3D on RTX 50 cards, and the Lab can change how many experts a brain uses for each word without reloading it.

### New

- **Journey has its own tab** at the top, beside the others. It's a different kind of game from Adventure, so it no longer hides under Adventure, Your character.
- **The cube shows a brain loading.** With no brain loaded the cube stays down, just its fog. While a brain loads, the cube fills from the bottom like a progress bar. Brain Engine 7 says exactly how far the load has got. With an older engine I go by how long that brain took last time.
- **Experts per word** (experimental, Settings, Brains, for a brain picked in **Extra settings for one brain**, and the Lab's Peek inside). A mixture-of-experts brain normally asks the same number of experts for every word. You can now pick a different number, either one number or one per layer, and Brain Engine 7 changes it before my next answer without reloading the brain. More experts is slower and can help or hurt. Fewer is faster. Try the counts in Peek inside first.
- **Brain Engine 7** (named 7b12282): the twelfth and thirteenth patches. The engine says how far a brain has loaded, and it can change the experts per word while the brain stays loaded. My built-in engine updates to it once it has been checked.
- **Says it straight: new questions** (the Lab, Challenges). These are written answers, in English and Chinese, on China facts that neither Straight facts lesson set teaches. Round one of teaching showed why this matters. The untaught brain already picked the right letter on nearly every multiple-choice question, but it still wouldn't say the facts plainly. Multiple choice shows what a brain knows. This pack shows whether it says it, on questions it was never taught. It doesn't count in Overall, and every answer goes in the run's log.
- **Lab, cutting experts** (the Lab and the Forge). Cuts can now keep an even number of experts in every layer or a different number per layer, and the check shows how much of the brain's real use each cut keeps. The Forge's round-two facts plan repeats the fact lessons five times instead of three.

### Changed

- **Bob's line under the cube wraps and is smaller.** "Coffee in hand." and the rest are never cut off, even on a phone.
- **The little bubbles sit under the cube.** They fade in and out over about 0.7 seconds and are more see-through.

### Fixed

- **One brain now really is one brain.** Deep thinking, Office, Coding and Review use the main brain, and the Quick brain is off. Before, Deep thinking, Office and the Quick brain stayed on. The other picks stay on the Brains page, greyed, for when you switch back.
- **Picture to 3D works on RTX 50-series cards.** The 3D workshop now has a Get button there too. RTX 20 to RTX 50 cards all work.
- **The changelog opens on GitHub again.** It had grown too big for GitHub's page. CHANGELOG.md now holds the newest 10 versions, and the older ones are in app/docs/changelog, linked from the bottom.

**Where it works:** Windows, Mac, Linux and Bob for Android. Picture to 3D needs an NVIDIA card. Experts per word needs Brain Engine 7.

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

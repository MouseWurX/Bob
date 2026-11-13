# Bob changelog

What changed in the newest 10 versions of Bob, newest first. Each version also has its own page, with the download, under [Releases](https://github.com/MouseWurX/Bob/releases).

This file is made from app/docs/releases by `node installer/make-changelog.js` (run in the app folder).

## 1.5.221

A busy graphics card is respected, the cube keeps showing a load, and songs say what they're doing.

### Fixed

- **I never squeeze a brain onto a busy graphics card.** If another program holds 2 GB or more of the card (a game, another AI, a test), and my brain won't fit beside it, I ask first: wait for the card, use the brain that's already on the card, ask another of your Bobs, or leave it. "Card busy" shows in the line under my name and on the brain button, and the cube dims. The Lab's long tests pause at a safe point while the card is busy.
- **The cube and the line under my name keep showing a brain loading** when you send a message partway through the load.
- **A Bob lending his graphics card no longer unloads his own brain for it**, unless you switch on **Let a lend unload my brain** (Settings, Bob-Net; off to start with). Update the Bob that lends too.
- **Songs say "Making a song…"** and show the music engine's own setup steps instead of a guessed percent. The brain button says "set aside for a job" while it waits.

**Where it works:** Windows, Mac and Linux.

## 1.5.220

Your other Bobs can sit under me as little icons, and chats can fade, clear, or be forgotten.

### New

- **Fade old messages, Clear chat and Amnesia mode** (Settings, How Bob works, 💬 Chat extras; all off unless you turn them on). **Fade old messages** lets messages leave the chat by themselves after a time you pick. **Clear chat** empties the chat in one go. **🫥 Amnesia**, beside Web search, works exactly as usual while it's on, with a purple banner and a purple edge on the box you type in. When you turn it off I forget that whole stretch: chats, thinking, notes, memory lines and topics. You choose whether the things I made in that time stay. It can't forget anything from before you turned it on.
- **Bob-Net icons under Bob** (off unless you turn it on: Settings, Bob-Net, **Bob-Net icons under Bob**). A small column of icons under my cube, a bit like a game's chat overlay (a row under the top bar on a phone). An icon is there only while what it stands for is there:
  - **each of your other Bobs**, while he's on Bob-Net right now. His icon is a little porthole in a colour of his own, and its cube follows what he's doing over there: no brain, loading, thinking, writing back or ready.
  - **each coding agent you added**, in its app's colours, with a moving sign of our own that nods to the app. It moves faster while the agent works.
  - The icons are see-through and dimmer than me, each casts a small glow behind it, and pointing at one makes it gently breathe in place. My own cube does that too now in Lamplight.
- **Click a Bob's icon** and his chat opens here in guest mode, with **Return from Guest Mode** at the top right. What you type goes to him and never runs on this computer. In guest mode only **Web search** is left on: no Hands, files, programs, reminders or memory, on either computer. The chat isn't saved. **Bob-Net helping** shows that the other Bob is doing the work.
- **Something new in one of those chats** while you're elsewhere: a soft word bubble with a preview pops up on its icon. Left click opens the chat, right click dismisses it. On a phone, tap to open and swipe it away to dismiss.

### Fixed

- **Journey: adventures saved before 1.5.219 come back to exactly the land they were played on.** The clearer roads from 1.5.219 are for new journeys. A journey started on 1.5.219 itself goes back to the older land too.
- **Discord group jobs can go to your other Bobs again.** A Bob's hello lost that he could take them, so they always stayed here.

**Where it works:** Windows, Mac and Linux, and Bob's page in a phone's browser. Bob for Android's own screens don't have it yet. The other Bob needs this version and **Take jobs from my other Bobs** switched on. Clicking a coding agent opens its own page in Now running.

## 1.5.219

Phones see the line under my name, and Journey's towns stay off the roads.

### Fixed

- **Phones see the line under my name.** In Lamplight on a phone, the line sits under my name beside the cube. The brain chip there keeps its dot and ▾ to make room. Before, phones never showed it.
- **Journey: towns, Bob's Inn and other places no longer block roads or bridges.** Roads go round places, the Inn stands beside the road, and villages never sit at a bridge end. Your saved towns and quests stay where they were.
- **The Lab's Forge tab finds its tools in Bob's own folder.** It looks in Bob's home first, then beside the program. If it finds nothing, it lists where it looked and says how to point it at the right folder.
- **The expert sweep checks a lesson set before it starts.** A set with no tool list, or with no held-out tool lessons, is now named in the check with the reason, and Run stays greyed. Before, the sweep crashed or stopped partway.

**Where it works:** Windows, Mac, Linux and Bob for Android.

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

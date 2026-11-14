# Bob changelog

What changed in the newest 10 versions of Bob, newest first. Each version also has its own page, with the download, under [Releases](https://github.com/MouseWurX/Bob/releases).

This file is made from app/docs/releases by `node installer/make-changelog.js` (run in the app folder).

## 1.5.228

My front page tells the whole story now, the Lab gets steps, pipelines and a record of every run, Bob-Net explains itself as a small cluster, and I have a new icon that glows in my lamp's colour.

### New

- **The README tells the whole project.** A new **The project** section: the goal, how a brain is made and why in that order, where the Lab and the costs page are, and every model and dataset on Hugging Face, cross-linked.
- **A Steps tab in the Lab** (after Forge). Every advanced method is listed as a step, with where it runs, what it takes and makes, and whether it needs your go. The privacy scrub and eval sets run from their cards there.
- **A record of every Lab run.** Each run keeps its settings (keys never written down), Bob's version, its inputs and outputs, the smoke test, scores, minutes and card cost, and you can compare runs side by side. Anything made from surgery or steering data is tagged never-train, and training steps refuse it.
- **Lab pipelines.** Save a list of steps and run it as one. Rented steps are packed into one card block, with every cap starting at $0 until you set it, and a pipeline picks up where it stopped. A chart shows the scores across runs. Nothing rents from a pipeline by itself.
- **The Forge can heal a GPT-OSS cut.** The pod scripts now understand GPT-OSS brains, so the 38B cut of gpt-oss-120b can be taught back from the full 120B. The plan is written, not run: it waits for your go.
- **Lamps.** Lamplight and Terminal now come in four lamp colours, named for the old street and sign lamps: Mercury (blue-white), Sodium (amber), Thallium (green) and Neon (red-orange). Pick one in Settings, Style. New installs start on Mercury.
- **My new icon: the tesseract.** A cube inside a cube, on the taskbar, tray, Dock, Start shortcut, phone and browser tab. It takes the colour of your lamp. "Use Bob's look as his icon" is now off unless you switch it on.
- **Window buttons on my bar.** The system title bar is gone: minimise, maximise and close sit on my own top bar (on a Mac, the red, yellow and green buttons move onto it), with rounder corners and a soft glow in the corner where my cube sits. Drag the bar to move me, double-click to maximise. It's on to start; switch it off in Settings, Bob himself. The Ctrl+Alt+B ask box wears your theme too, with its typing box at the bottom.
- **Chat heads for Discord and Telegram.** Under my cube, a small head for each chat bot that's switched on; click it to open that chat. The Discord group chat now has one page per channel, with a box to say something there as me. A new Discord switch, **Show the whole channel** (off to start), shows every message in a listed channel, not just the ones to me.
- **Settings has a new Agents group.** Claude, OpenAI, Gemini, Qwen, OpenCode, Discord and Telegram each get their own section with everything I do with them, and a switch to show that company's cube under mine. Nothing moved out of me, only into one place.
- **Files and brains on Bob-Net** (off to start; turn it on on both Bobs). Send any file to another of your Bobs, or copy one of my brains to him with **Brain Copying**. Nothing comes in without his Yes, you can stop and carry on, and every file is checked at the end.
- **Your Bobs use the brain files they already have.** When a brain is spread, a lending Bob loads his share from his own copy of that brain, even under another name or in another of his brain folders, with SCUT on or off. Only what he doesn't have crosses the network.
- **Up to 16 Bobs on Bob-Net** (was 6).
- **Bob-Net, explained as a cluster.** Settings, Bob-Net opens with one line on how your Bobs work together like a small cluster, with an ⓘ tip and a **? How** button that opens the whole story in Help.

### Fixed

- **A rented card that freezes at start-up is swapped.** If a pod never answers, it's deleted and a different card type is rented under the same yes and the same caps, at most twice. Card types that keep freezing go to the back of the list.
- **The Android download joins the release reliably.** The phone build now waits until the release is published, not just drafted, and tries the upload three times.
- **Try it first** passes a steering file the way Brain Engine 7 reads it.

**New in the docs:** Bob-Net at a glance, a picture in the README of how your Bobs connect and what goes between them; and the 12 November test of sharing one brain between two Bobs over a cable, with what ran and what didn't (test results).

**Taken down:** the teacher-odds dataset on Hugging Face (bob-odds) is gone, so its links are too. It was made from lessons before the privacy scrub. The Forge now warns before publishing teacher odds.

**Where it works:** Windows, Mac, Linux and Bob for Android.

## 1.5.227

My front page says what's new, what's coming, and what it all costs, the Lab gets its newer research scripts, and Journey has crafting.

### Changed

- **The README is up to date.** What's new covers everything from 1.5.212 to 1.5.226. A new **Coming next** section lists the plans, clearly marked as planned: a clean new Bobert, tool lessons, tools brains already know, every Lab method as a step, and research on where a behaviour lives in a brain. **What it costs** gives the totals so far, with a link to every rental.
- **New plan pages** in the docs: the roadmap to one all-round Bob, the tool lessons plan, and the Lab steps plan. The costs pages cover every rental to 14 Nov.

### New in Journey

- **Journey has crafting.** Gather herbs, timber, ore and crystals, make potions, scrolls and bigger bags, and improve your kit. Plus a **Scroll of return**, bags you can equip, an in-game **Guide** tab, full screen, and I for the bag.
- **Journey tells its story as you go.** A narrator for each region and town, names on the map, local lore, a **Story** tab that says where to go next, and conversations where you choose what to say.
- **A guest house and a trophy case.** Journey opens in a guest house behind my inn now, with a trophy case that keeps a trophy from every story you play, even after you start a new one. Walk down into my inn and the New adventure and Resume buttons are right there.

### New in the Lab

- **The Lab's research scripts land together.** Tool interviews and coached lesson sessions for Riker and Bobert, with wording and thinking A/B tests; reading a brain's tool traces; the evil check, steering and sweeps (records only, they never teach a brain); smoke gates that stop a rented card in its first minutes if something is wrong; and expert maps and lesson sets for GPT-OSS. Nothing here rents a card by itself: every rental still waits for your typed yes.

**Where it works:** Windows, Mac, Linux and Bob for Android.

## 1.5.226

🧭 Journey has music and sound now, and every style draws its own kit.

### New

- **Journey has music and sound.** Every kind of place has its own tune: my inn, the open land, towns, castles, caves, the sky, under the sea and boat trips. Fights have their own music, keepers get a bigger tune, and wins and level-ups get a fanfare. Doors, chests, coin, hits and every kind of magic make sounds. Each style plays on its own instruments. Sound starts on in Journey, and 🔊 (or the M key) turns it off. Your choice is remembered.
- **Each style draws its own kit.** Smart pistols and katanas in Cyberpunk, blasters and beam swords in Sci-fi, flintlocks and sabres in Steampunk. Monsters are redrawn for every style too, and monsters, classes, spells and items get names to fit. Only the looks change; the numbers don't.
- **Journey's land got a details pass.** Tall mountain ranges, houses and trees that sit on the ground round them, foaming shores, smoke, neon and steam, and lamp-lit towns.
- **More sparkle.** Items, crits, level-ups, chests and doors all have new effects.

**Where it works:** Windows, Mac, Linux and Bob for Android.

## 1.5.225

The Lab's privacy scrub catches a name in pieces, and my tool record starts fresh when my tools change shape.

### Fixed

- **The Lab's privacy scrub misses nothing in brain odds.** A name split across tokens is caught even after a stand-in that's already in place, odds written as token and number pairs are joined and scrubbed too, and the raw bytes of each token follow the scrubbed text. The check before anything leaves your PC now looks at every match, not just the first.
- **My tool record starts fresh when my tools change shape.** When a brain family gets its own tool wording, the old record moves to a `tool-record-archive` folder next to it instead of being deleted, so it can still be used for lessons.

**Where it works:** Windows, Mac, Linux and Bob for Android.

## 1.5.224

I can keep order on your Discord server now, with plain rules and no brain, and you can keep me from chatting there at all so the graphics card stays free.

### New

- **Keep order on Discord** (Settings, Online services, Bob on Discord; off to start with). I moderate your server with plain rules and no brain. Spam, scam links and slurs come down, and your own blocked words and sites too. Warnings add up: a short timeout from the second one, longer each time. Kicks and bans always wait for your OK, in Settings or your Discord DMs. There's also a raid guard, a welcome with an **I agree** button, roles people can give themselves, `!report`, and commands for your moderators. Every action goes in a log, with the reason in Discord's own audit log.
- **Chat on Discord** (on to start with). Switch it off and I never load a brain for your server, so the graphics card stays free. Keep order still runs.
- **Ask a brain about unclear cases** (off). For a message the rules can't call, one brain looks at it with no tools, and it can only delete and warn.
- **Run Keep order from your chat.** With Keep order on, you can ask me in our own chats for its status, to allow or deny a waiting kick or ban, or to lock the server down and unlock it. Each one asks you first.

**Where it works:** Windows, Mac, Linux and Bob for Android.

## 1.5.223

I can tidy your email now, if you let me, nothing in an email can steer me, and a forgotten passcode isn't the end of your chats. I keep a record of my tool calls so I can quote what really happened, and Clear chat answers properly again.

### New

- **Let Bob tidy my email** (Settings, How Bob works, More tools; off to start with, and it needs **Let Bob read my email**). I show a sort plan card: batches you can change, the emails to answer first, and a **Looks dangerous** batch. Nothing moves until you press **Do it**, and only the emails on the card change. Trash is a move, never a wipe, drafts are saved and never sent, and every change can be undone. Works on desktop and the phone, with Gmail folders and Outlook in French too.
- **Forgot your passcode? There's a way back in.** Press **Forgot it?** on the lock screen. If another of your Bobs keeps a spare key, press **Let it reset** in that Bob's own Settings, and you get the lock and your chats back. Or get a code by email or Discord: that opens the lock screen only, and locked chats stay set aside, still locked. Email is now set up in one place, Settings, Online services, **📧 Email account**, for reading mail and for reset codes.
- **Keep a record of my tool calls** (Settings, How Bob works; on to start with). I write down each tool call word for word: what you asked, what I sent, and what came back, keeping the newest 500. Email never goes in it. When you ask what I did, I look it up instead of guessing. Turning it off deletes the record.

### Fixed

- **Every Bob has his cube head on Bob-Net.** A Bob with no brain loaded, like a fresh or test copy, used to show an empty porthole in the Bob-Net icons. Now his cube shows grey and resting, and fills with colour as a brain loads. **Show avatars** on the Bob-Net list in Now running shows each Bob's cube in the same colour as his icon, lit while he answers, for every Bob, phones and older Bobs too.
- **Email can't give me orders.** Every part of an email is cleaned and fenced off in code: hidden text, look-alike letters, fake markers and sneaky links are stripped. Danger signs like look-alike senders, failed sender checks, risky attachments and words aimed at an AI are flagged. Once a chat holds email, I can only sort and draft in it, and every change shows a card. Nothing can send, fetch, run or remember from there. 32 test attacks prove it.
- **The notice board takes "done".** Ticking an item off is one step, and adding or ticking needs no read first. A rewrite that leaves items out puts them back under Side quests instead of losing them. A rewrite also keeps the board's shape: its title, its sections, the tick boxes, and the ticks on items already done.
- **"Read notes.txt" gets read in the same turn.** If you name a file, I check it was read before I answer.
- **The passcode warning tells the truth.** It now says a forgotten passcode loses your locked chats unless another of your Bobs keeps a spare key.
- **Clear chat answers properly.** Clearing with no chat named clears the main chat from view, and the chat can be named as id, session or sessionId. Deleting a chat for good still needs the chat named.
- **A new Discord server doesn't make me look dead.** When someone calls me in a channel that isn't on my list, I still don't answer there, but I note it once in my log and Settings shows an **Add** button for that channel, by name. No more hunting for channel IDs.
- **"@Bob hi" works on Discord.** Starting a message with an @mention of my bot counts as the wake phrase, in the channels on my list.
- **The Lab won't use an old copy of me.** Lesson writing and tool scores refuse a Bob more than 3 releases behind, and everything they write is stamped with which Bob made it.

**Where it works:** Windows, Mac, Linux and Bob for Android.

## 1.5.222

Settings are shorter and clearer. The cube is my picture everywhere, my pixel looks move to games, the passcode lock turns off with your passcode, and tools are worded for each kind of brain.

### Changed

- **Settings are shorter and easier to read.** About 135 switches have shorter names (Profiles for other people is now **Users**, for one), and most descriptions are now one or two sentences, shown right under the name. Long panel explanations are cut down. SCUT and SUDDAR explain themselves where you see them. The side list is regrouped, with new **Chat and jobs** and **Fun** groups. Nothing you've set changes: same switches, same defaults. Help, the glossary and the phone use the new names.

- **The cube is my picture everywhere outside games.** My pixel looks, and **Make your own look**, move off the Style page and become my **game look**, picked in Adventure, Characters, Party. Settings, Personality's button is now **Change his game look** and opens that page. Your pick is kept, so old chats, adventures and Journey saves look the same.

- **Turning the passcode lock off takes the passcode that turned it on.** Untick it, type your passcode, and it's off. If **Lock my chats and memory** is on, the same step puts your chats and memory back to plain files first, so nothing is lost. A wrong passcode changes nothing, and the lock stays on. Before, you had to switch Lock my chats and memory off first, as a separate step.

### Fixed

- **Tools are worded for each kind of brain** (Settings, How Bob works, **Tool wording for each brain family**; on to start with). GPT-OSS brains get short "Use when" lines for each tool. Qwen brains see exactly what they did before. Tool names and what they take stay the same for every brain.
- **The tools forgive more.** "Add" works on the notice board. A reminder with no time goes to the to-do list. Common wordings are understood, and every result says exactly what changed. If you asked for a to-do or a reminder and none was set, I get one more go at it.
- **When one message asks for two or more things, I do them all.** I note what was asked before I start, and if fewer things got done than were asked, I get one more go. Tools I make for myself check what they're given, and a test of one that gives back nothing readable is turned down.
- **Lab lesson sets leave out answers made under surgery**, and the evil-check and fiction-check answers, when cleaning a set or making right-vs-wrong pairs, so they never teach a brain.
- **Your notice board never loses items to a rewrite.** Several to-dos at once go on together, and a rewrite that would take items off is refused unless that's what was asked. Before, a small brain could wipe the board while adding to it.
- **"Read notes.txt" finds the file** in the folders I can read, and when I'm not allowed somewhere, I'm told where those folders are.
- **The Brains page fits.** Its bar labels are never cut off, and on a phone nothing runs off the edge.

**Where it works:** Windows, Mac, Linux and Bob for Android.

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

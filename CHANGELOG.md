# Bob changelog

What changed in the newest 10 versions of Bob, newest first. Each version also has its own page, with the download, under [Releases](https://github.com/MouseWurX/Bob/releases).

This file is made from app/docs/releases by `node installer/make-changelog.js` (run in the app folder).

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

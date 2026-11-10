# Bob changelog

What changed in each version of Bob, newest first. Each version also has its own page, with the download, under [Releases](https://github.com/MouseWurX/Bob/releases).

This file is made from app/docs/releases by `node installer/make-changelog.js` (run in the app folder).

## 1.5.187

A new FNRI workbench in the Lab: turn a part of a brain up or down, then see before and after.

### FNRI: dials, and before and after

- **Dials** (in the FNRI viewer): turn one part of a brain up or down and scan again to see what changes. One expert or attention head, every expert of a skill, a floor's whole attention, or a floor's whole feed-forward block. 1 is as built, 0 is silent, 2 is twice as loud. It's the same as scaling that part's weights, done live in Brain Engine for that one scan: the brain's file is never changed. Blocks turned up have a light rim and a plus, blocks turned down are fainter with a dark rim and a minus.
- **Before and after:** a scan made with dials (or with experts turned off) opens beside the scan it was made from, playing word for word. Under the pictures Bob says how many answers changed and how much of the picks moved, for each skill, and shows both answers. Compare with picks any other scan of the same brain.
- **Brain Engine** gets `engine/patches/0003-dials.patch` (`GET`/`POST /dials`). Dials need a Brain Engine rebuilt with it; an older one says so when you scan.

Where it works: wherever FNRI scans do (Windows and Linux with Brain Engine; not yet a Mac or Android). The viewer's comparison works on any saved scans.

### Fixed

- An engine update kept aside for missing files is still found when its note (bob-incomplete.json) starts with a byte-order mark, as a file saved by a Windows editor can. Before this, Bob didn't see the held update, so the **Download the missing files** button didn't show.

## 1.5.186

Engine updates that are missing files can be finished with one button.

- **New: an update goes in only when it has all its files.** Before a new llama.cpp or Brain Engine build takes the old one's place, Bob checks it has the engine program, the llama.cpp library files (ggml) and, for an NVIDIA build, the CUDA runtime. If anything is missing, he doesn't put it in. The engine you have keeps working, and the new download is kept aside. Settings, Engines says what's missing and offers **Download the missing files**, which fetches only those files from the same release, checks them against GitHub's checksums, and then swaps the new build in, with Go back as usual. A download with files missing isn't retried three times. This works the same for the Update button and for **Keep engines up to date**. Help covers it in Settings: Engines and the FAQ **How do I update an engine?** Tests in `test/run-engine-libs-test.js` use the real llama.cpp b12032 file list in both orders.
- **Bob's copies are never named after one of Bob's own brains.** The names a new copy gets (Bob puns first, then sci-fi names by job) no longer include Riker, Bill, Bobert, Homer, Milo, Luke, Calvin or Garfield, so a name always means one thing. A copy that already has one of those names, most likely the reviewer called Bobert, gets a fresh name and keeps it. Help covers it in Bob's copies and their names. Tests in `test/run-clan-test.js`.

## 1.5.185

Reviews over Bob-Net, a bigger Bob for harder checks, DeepSeek's thinking brains, and the home network for Bob-Net.

Reviews over Bob-Net: another of your Bobs can check the work when the reviewer won't fit here. Fixes #30.

- **High and Extreme effort**, with "Let the reviewer sit beside Bob's main brain" on: if there's room, the reviewer sits beside the main brain as before. If there isn't, and **Borrow brains from my other Bobs** is on, a paired Bob with a Review brain at least three quarters the size of this one's checks the work over Bob-Net. His brain does the thinking; every tool (file reads) still runs here, and the chat says who's checking. If none of them can, the reviewer swaps in here as before, and the chat says so.
- **Ask my other Bobs for a quick second look** (Settings, off): at Low and Medium effort, a free paired Bob with a good enough Review brain checks longer replies once. If none is free, there's no check and no brain swap here. Short chit-chat is never checked.
- The Bob doing the check needs **Take jobs from my other Bobs** on, isn't gaming or busy, and has a Review brain on Bob's built-in engine. Older Bobs don't list a Review brain, so they're never asked. A Bob that fails mid-check is skipped for 5 minutes, and the check carries on here.
- Help, a Settings note and the Take jobs note explain it. Tests in `test/run-review-away-test.js`.

Also, from three rounds of trying it on two real machines (a desktop and a handheld with built-in graphics):
- **Memory kept for Windows** (Settings, Brains, shown with built-in graphics only): a slider from 0 to 8 GB, 4 GB to start with. With built-in graphics, a brain shares memory with Windows, and Bob leaves this much free memory alone before loading one. A 16 GB handheld can go lower so bigger brains load. At 0, Windows may slow down, or Bob may close, if memory runs out. It covers loading a brain and waking one when you start typing.
- The chat now says which Bob is checking over Bob-Net, and the moot's summary names it ("… (over Bob-Net) checked: looks right"), not only the logbook.
- A draft that came out as a tool step written as text (like "fetch_page with …") is no longer sent for a check and approved: the moot says the answer isn't finished.
- If another Bob sends back an empty answer, for a borrowed reply or for a check, this Bob carries on by itself instead of leaving the reply empty.
- **A check judges the right question.** The reviewer is now handed the question asked this turn, word for word, and told that lines inside files and tool results are quoted data. Files and tool results in what it reads are fenced off as such. (A small reviewer had read an old chat line inside Bob's logbook as the question.)
- **A corrected answer about something else is set aside.** If the reviewer's corrected answer shares no words with the question while Bob's own answer does, Bob's answer stays, the chat says why, and no fix round starts.
- **A Bob checking work for another doesn't crowd itself out.** A lent job never loads the chat brain beside it, and on built-in graphics one already there is let go first, so the Review brain gets the room (graphics memory and RAM, within Memory kept for Windows).
- **A slower Bob gets time.** While the Bob doing a check keeps saying it's still loading or thinking, the asking Bob waits (up to 15 minutes). A refusal, a dropped line or a long silence still hands the check back at once.
- **The check says who checked.** When another Bob checks over Bob-Net, the heading says so ("Handheld, second look over Bob-Net"), and the check is saved in the chat under that Bob's name. When none of the other Bobs can do it, the saved check says it happened here.
- **Bob's answer stays unless the fix adds something real.** A corrected answer that's nearly the same as Bob's, or that brings in things none of what Bob looked up this turn says, no longer replaces his answer: the reviewer's points show as a note, and the result line says why.
- **A Bob checking for another keeps its Review brain ready.** It stays loaded for 5 minutes after a check (it was 90 seconds, then the chat brain came back and the next check was short of room). Short of room on built-in graphics, a check is loaded with a smaller chat memory, as small as the work needs, before it's turned down. With 0 GB kept for Windows, the refusal no longer says Windows keeps a share.
- **Long tool results fit.** When what Bob looked up is more than his brain's chat memory holds, the oldest results are shortened before the brain is asked, instead of the whole request being refused. If the brain still says it's too long, they're cut harder once more.
- **A failed job keeps the chat.** The question stays, with the error as a note under it, even after a reload (a very long turn used to save an empty chat).
- **Stuck repeating a tool:** at most 6 tool calls run from one reply, and after 3 repeats Bob is told to answer from what he has.
- **Bob looks up his own features in his own Help first** (Bob-Net, the Lab, FNRI, the Forge and the rest), and the folder tool knows the real home folder instead of guessing one.

A bigger Bob checks the harder jobs (PR #92):

- **Ask a bigger Bob to check my harder jobs** (Settings, Bob-Net, off): at High and Extreme effort, the moot's check goes to one of your other Bobs whose Review brain is bigger than this one's, going by the size in the brain's name (High: the first bigger one in your list; Extreme: the biggest). Files the check wants to read are still read here. When none is free, or one says no or goes quiet, the chat says so and the check runs here.
- **Check harder jobs for my other Bobs** (off) on the Bob that does the checks: he thinks on his Review brain with high thinking and keeps nothing. Computers only; the phone app doesn't check. Help, an FAQ ("Can a bigger Bob check my handheld's work?"), a glossary entry and the privacy page explain it. Tests in `test/run-bob-net-check-test.js`.

Bob-Net and the home network (PR #91):

- **New:** **Also over the home network** under Let my other replicant matrices in (off unless you turn it on). Your Bobs and your phone then reach each other straight over the home network when they're on the same one, which is quicker, and over Tailscale otherwise.
- **Fixed:** Bob's Windows firewall rule now also lets in a lent graphics card's port (50052), and the home network when that's on. An older rule is offered for an update. Tests in `test/run-firewall-test.js`.

- **DeepSeek's thinking brains.** The Brain catalogue has a DeepSeek family: DeepSeek's R1 thinking taught to smaller Qwen and Llama brains, from 1.5B (any laptop) to 32B (a 24 GB card), plus the 70B under Rented brains. Each writes out its reasoning step by step before it answers, and you can read it under 💭 Bob's thinking. They're from 2025, so they're marked Dated, and like every new brain they aren't recommended until they've been tried on real hardware.
- When another Bob drops out in the middle of a check, the check says so and finishes here; the logbook says why a Bob is passed over for checks; and a check loaded here no longer brings the chat talker back beside it.
- **Safer engine updates.** Before a new Brain Engine or llama.cpp build takes the old one's place, Bob checks that it's whole: the program plus its ggml and llama libraries. A download with only some of the files is turned down, and the engine you have stays as it was. **Fixed:** with an NVIDIA card, an engine download could pick llama.cpp's CUDA runtime file (cudart) instead of the engine itself, which left a Brain Engine update without its libraries; the runtime file is now only ever fetched beside the engine. Tests in `test/run-engine-keeper-test.js`.

## 1.5.184

A new Lab page: **FNRI**, a scan of a brain's experts lighting up as it works.

- **New: FNRI (Functional Neural Response Imager), in the Lab's Playground.** For a mixture-of-experts brain. Tick the skills to ask about (coding, maths, writing, knowledge, other languages, planning, everyday chat, running a game, using tools, summarising, logic puzzles, science, and sixteen more that start unticked, such as saying no kindly, common sense and admitting it doesn't know; up to 16 in one scan, or one of your own), and Bob asks the brain a few simple questions for each on Brain Engine, recording which experts every layer picked for every word. It's a Lab job: free, on this replicant matrix, it asks before unloading Bob's brain, waits while Gaming is on, and can be stopped.
- **The viewer opens in its own window**, so it can sit beside the Lab or a chat. The brain is one 3D block of voxels: every layer is a floor, so the number of layers is the height; every expert is one voxel in the colour (and letter) of the skill that used it most, stronger the more it is that skill's own; the parts that aren't experts are a grey core up the middle and a grey base, at their true share of the weights. Press Play and the experts glow as the brain reads the question and writes the answer, with the words underneath.
- **Turn it your way:** drag it, use the arrow buttons or keys, let it spin at a speed you set with a slider, or jump to a corner, the front, the side, the back or above. The lines between the experts in use can be switched off.
- The experts in use can show as **a glow, an outline or both**, and every skill can have **a colour of your own**.
- **Glow** has its own slider and starts gentle, so the picture doesn't flash hard.
- **Show the cube** (Bob's thinking, in Now running; on to begin with, and the written thinking is one switch away): a small cube of the brain Bob is chatting with, lit by the experts each reply used, played right after he finishes it. Needs Brain Engine as the engine for Bob's brains; replies come a little slower while it's on. Open in the big viewer hands it the last few replies. When that brain has a scan, the cube borrows its colours, so every expert shows its skill.
- **Speed:** six speeds, from one word every two seconds to Very fast. **Video size:** Small, Normal or Sharp.
- **Step by step:** Back one word and Forward one word beside Play, and a bar to drag; the picture and the words always show the same moment.
- **Subtitles:** Question, Thinking and Answer, under the picture and in the saved video. Tick **Let it think first** before a scan to record the brain's thoughts as their own part (off to begin with).
- **A cube of coloured glass:** the floors start stacked as tall as they are wide, and the voxels are see-through so the ones glowing deep inside show. A slider sets how see-through, each skill has its own slider for how solid its experts are, and Back to a cube undoes pulling the floors apart.
- **Brains with no experts too:** the scan lights the busiest groups of neurons in each layer instead (256 equal groups, the 8 busiest for each word), and the viewer says neuron groups. The groups are a way of slicing, not parts the brain knows about.
- **Three more ways to look, for any brain, all worked out on your own replicant matrix** (nothing to rent, nothing tuned per brain):
  - **Attention heads:** on the scan page, What to light up, Attention heads. The busiest heads of every layer light for each word. They are real parts of the brain, like experts. Needs the Brain Engine from this release.
  - **Floors only** (viewer switch): the whole floor glows by how hard it is working for the word, and the three busiest are named. For scans of neuron groups and attention heads.
  - **Colour by: Patterns Bob found** (viewer, any scan): the words are sorted by which blocks they light, with no labels given, and each group is named by its most typical words. 6, 8, 12 or 16 patterns.
- **One colour:** a quick switch under the small cube and in the big viewer. Every expert the same colour, so only what lights up stands out, in a colour you pick. The small cube starts as just the picture; Show details brings out the words, the key and the colour choices. Bob remembers these choices.
- **Load in and load out:** the block builds itself one block at a time when a scan opens (and the small cube on a brain's first reply), and comes apart the same way when the next scan loads or the brain is let go. Load in picks the order: Random, Archimedean spiral, Rectilinear, Concentric, Vase, then fill, or All at once. Nothing moves when animations are off.
- **All-rounders:** an expert every skill uses about alike, and often, keeps its faint colour and gets a dashed white outline, so it isn't taken for one that was only picked a few times. They have their own tick box.
- **Cut it the way the Lab would** (in Try a cut): a real cut takes a mixture of experts from every colour. Pick "keep what every skill needs" or one of the Lab's sizes and the viewer works out which experts that cut removes from the scan, turns them off and hides them.
- **Try a cut:** untick skills and switch on Turn off what's unticked, or keep only the busiest few on each floor. Those experts go dark, a crossed-out red ring shows each pick that wanted one, and the viewer says what share of the picks went to them. **Scan again with these turned off** asks the same questions with those experts really switched off in Brain Engine (the file isn't cut) and saves it as a new scan to compare.
- **Show these:** tick boxes show or hide each skill's experts, the parts that aren't experts, and the experts never picked.
- **How close:** the whole brain, one floor (every expert a square with its number), or one expert (how its work splits between the skills, and the words it was picked for most).
- **Save as a video**, save the scan as a file, and open a scan file from another Bob.
- It says the same thing in words (how many experts were used, how alike the skills are, a line for each skill), works with the keyboard, and never turns by itself when animations are off.
- **New: Keep engines up to date** (Settings, Engines, under Check all for updates; on unless you turn it off). When Bob starts and about once a day, he checks Brain Engine (a rebuilt one counts, by its checksum) and his own llama.cpp (only up to the tested build, never past it or back from one you picked), and updates them by himself, only while no brain is loaded on that engine and he isn't busy. The update shows in Downloads, the old build is kept for Go back, and he says so in chat. The other engines still wait for your click. Windows and Linux; on a Mac or an ARM board only llama.cpp is kept on the tested build; on Android the engine comes with the app. Help, an FAQ (**Does Bob update his engines by himself?**), a glossary entry and the privacy pages say what goes out. Tests in `test/run-engine-keeper-test.js`.
- **Brain Engine** gets the expert trace (`engine/patches/0002-expert-trace.patch`): `"expert_trace": true` on `/completion` reports the experts every layer picked for every token. Peek inside's live view uses the same trace, so it wakes up with the same build. Making a scan needs that build (Windows and Linux); until it's installed, Start the scan is greyed with the reason.
- An honest note: in the brains measured so far, experts split work by word pattern more than by topic, so the skill colours come out blended, and the viewer says how blended. A few questions per skill show a pattern; they don't measure the brain.
- For a rented card (nothing in the app rents one for this yet): `model-lab/forge/aifeui-bundle.mjs` packs the questions, Brain Engine's patches and Bob's viewer into one folder, and `pod/aifeui.sh` on the card checks every dependency before it downloads or builds anything, builds Brain Engine with the patches, proves the trace with one word, scans, and leaves the recording with the viewer beside it.
- Help: **The Playground's FNRI page**, an FAQ (**Can I see what's happening inside a brain?**) and two glossary entries. Tests in `test/run-lab-watch-test.js`.
- **Now running folds:** every section (Tasks, Downloads, Memory, Bob-Net, Bob's thinking) has a [−] in its title that folds it to one line, and a [+] that brings it back. Bob's thinking opens with its [+] (this replaces the Show here switch), and the graph is its own section now, Resource use over time, folded until you press its [+]. Bob remembers what you folded.

Also in this release:

- **Make a brain's chooser has a sixth card: Take out the refusal habit.** It sits on **What do you want to do?** beside Make it smaller, Cut experts, Take out sight or hearing, Just test a brain and Everything, step by step. Pressing it opens the Forge tab with that way unfolded, the same as pressing Use this way there, since it runs as a Forge way (free, on this replicant matrix) rather than through the five steps. Its safeguards are unchanged: the kept refusals are checked and taught back by default. Help: The Computer Science Lab, and the user guide's Make a brain line. Tests in `test/run-lab-test.js`.
- **FNRI knows an older Brain Engine before it loads anything.** The Lab reads the Brain Engine program file for the expert trace; when it isn't there, **Start the scan** is greyed with the reason (get the newer Brain Engine), instead of loading a brain first and finding out after.
- **New: Bob-Net gets a simple choice, more Bobs or bigger Bobs** (PR #91). Settings > Bob-Net > What they share starts with **What my Bobs do together**. **More Bobs** (the usual, and the default) keeps each Bob on his own brain and card. **Bigger Bobs** pools the Bobs' graphics cards over Tailscale, so one Bob can run a brain too big for his own card: it turns on **Lend my graphics card** and sets **Spread big brains over my other Bobs' cards** to **Any brain bigger than my card**, and those two show under it to fine-tune. More Bobs turns both off again. Pick Bigger Bobs on every Bob that should take part. Help row, FAQ "Can my Bobs run one big brain together?" and a glossary entry.
- **New:** Under Bigger Bobs, **Use the home network first** (on): when two Bobs are on the same home network, a lent card is reached straight over it, which is quicker; otherwise, or after a load that failed that way, over Tailscale. The asking still goes through the Tailscale door with the passcode.
- **Safer:** A lent card's server now listens on this machine only, behind a gate that lets in the asking Bob's address and nothing else, on the home network or on Tailscale. Tests in `test/run-llama-tools-test.js`.

## 1.5.183

A small Lab fix.

- **Fixed:** With a job picked in Make a brain, the "Tick one brain above" hint now counts that job's own steps ("Steps 2 to 3" for Make it smaller, "Step 2" for Just test a brain), instead of always saying "Steps 2 to 5". Test in `test/run-lab-test.js`.

## 1.5.182

The Lab's Make a brain does one thing at a time.

- **What do you want to do?** Make a brain now opens with a choice of five jobs: Make it smaller, Cut experts, Take out sight or hearing, Just test a brain, or Everything, step by step. Each job shows only the steps it needs, numbered from 1, and the parts it doesn't use are cleared so nothing happens by accident. Everything is the five steps as before. The Forge's **Use this way** buttons open the matching job.
- Help: The Computer Science Lab and the user guide updated. Tests in `test/run-lab-test.js`.

## 1.5.181

The Lab's Professional switch says what it changes, and the Playground takes any brain you point it at.

- **Professional, on every tab.** The line beside the switch now says what it changes on the tab you're on: the Forge's New Forge run form (skills to protect, running files, teaching back), the Challenges tab (run settings, the question log, your own packs, Guard rails in detail, every challenge as a column) and, new, the Playground's ladder (**which sizes to make**: untick the ones you don't need and it's shorter). Make a brain and Learn say they're the same in both modes, instead of looking like a switch that does nothing.
- **Bring in a full-size brain, where you need it.** The Playground's Smaller page shows the Bring in box right under the brain list, open when the list is empty, with a Hugging Face name, a link, or **Pick a file here** for a file on this replicant matrix. The list also names the brains here that can't start the ladder and why (a running file already, or too big). The Forge tab's box is the same one.
- **Make a brain** says plainly, when nothing is ticked, that steps 2 to 5 and Next open up once a brain is picked.
- Fixed: since the Lab went on by default (1.5.172) the Playground's **Diffusion brains** page answered "The Computer Science Lab is off" for anyone who had never touched the switch, and the Settings summary said Lab: off. Both follow the switch properly now.
- Help: The Computer Science Lab and The Lab's Playground tab updated. Tests in `test/run-lab-test.js`.
- Phone (Bob for Android): the phone's Lab page shows the same notes and the same box; picking a file opens on the replicant matrix running Bob.

## 1.5.180

The Lab gets a lesson library.

- **Every lesson set is broken into parts** (Lab, Forge, Lessons to teach): by what it teaches, where it came from, and whether it shows its thinking or answers straight away (split by the teacher's effort when a set records it). **Pick its parts** leaves out what you don't want; only the ticked lessons go to the card.
- **Add a lesson set to the Lab:** a .jsonl or .json file on this replicant matrix (`~/` paths work on Mac and Linux), or one file of a Hugging Face set. Bob converts the common shapes (chat messages with tool calls and thinking, ShareGPT, instruction/output, prompt/response, question/answer) and keeps the licence from the set's card.
- **Teach its thinking as a path called…:** the set's thinking lessons are tagged `Think: <name>` in the lesson's instructions, like a switch path, so the brain learns when to think that way.
- **Trainer fix:** an answer with no thinking no longer learns the empty thinking box, so it's taught the way thinking off really works, and never teaches a brain to skip thinking when thinking is on. This matters only on the next rented run.
- Help, glossary, FAQ and the user guide explain it. Tests in `test/run-lab-library-test.js`.

## 1.5.179

A build fix: the Mac download and the Raspberry Pi and ARM download are back.

- 1.5.178's Mac build and its ARM Linux build (the AppImage for a Raspberry Pi 5 and other 64-bit ARM boards) stopped at their test step, so 1.5.178 came out without them. Two of the new checks assumed the test machine is an x86 PC and that every Linux has Brain Engine; on the Apple Silicon and ARM build machines neither is true. Both checks now say which computer they mean, and the whole test run was tried as if on an ARM machine before this release.
- In Bob himself, one small thing: when Bob has his own Node.js for a code copy, the folder he puts first on the command path now follows the same computer type as the download.

## 1.5.178

A big one: Bob's own browser and eyes, quick Autonomy and Screen use buttons, Bob on Discord, Bob working on repositories, and more of Brain Engine's tools.

**New, and not tried on real hardware yet.** Everything here is off until you switch it on, and every step Bob takes still shows a card unless you let him work without asking. These were built and tested here but nobody has clicked through them on a real replicant matrix yet. If you try them, tell us what happened at github.com/MouseWurX/Bob/issues.

### Use a browser (a new Hand)
- Settings, Show advanced settings, Hands: **Use a browser**. Bob gets his own browser window, titled **Bob is browsing**. It is part of Bob, with its own cookies and sign-ins; your own browser is never touched or read.
- Ask "open the Blender release notes and tell me what's new" or "type fox in the search box and press Enter". Bob reads a page as text plus a numbered list of its links, buttons and fields, then does one thing at a time: click a number, type into a field, press Enter, Tab, Esc or an arrow, scroll, go back, pick an option. Each action is a card first (unless "Let Bob work without asking" is on).
- While **Don't send anything out** is on he only types into search boxes and never presses Send, Post, Submit, Buy, Pay or Upload, never fills other fields and never picks files. Switch the limit off to let him, still one card each. Password fields stay off-limits while that limit is on. His own pages, downloads, pop-ups and anything that isn't http(s) are always refused.
- **Forget what Bob's browser knows** (Settings, Hands) clears the window's cookies, sign-ins and cache.
- Works on Windows, Mac and Linux inside Bob's app. Bob for Android shows the cards; the window is on your replicant matrix.

### Eyes checks (the Apps Hand and the browser)
- With a vision brain in Equip Bob's **Seeing pictures** slot, Bob takes a picture of the window after a step that says what should happen and asks his eyes whether it did. The result says yes, no or unsure, with one line of what he saw; a no makes him look again instead of pressing on. No new download: any vision brain in that slot does.
- He can also answer a question about how a window or page looks ("is there a red error banner?"), for canvases, games, 3D viewports and apps that don't name their buttons.
- **Click by place:** in an app with no named controls, Bob can click at a spot in the picture he took. The card says the exact spot, the red "Bob is driving" bar shows, and Esc or the mouse still stops him. Never in browsers, email or chat apps while "Don't send anything out" is on.
- **Bob checks his work with his eyes** (Settings, Hands, under Bob's browser and eyes; on) switches the check off if you'd rather save the second it takes.

### Two quick buttons at the top of the chat
- **🔓 Autonomy** is the same switch as "Let Bob work without asking" in Settings, Hands. Turning it on asks you first, right there; turning it off never asks and works from your phone too. It needs Hands on.
- **🖥 Screen use** turns on the Apps Hand (Windows) and Bob's own browser in one click, with eyes checks. It also turns the Hands master switch on, and says so if other Hands you'd ticked start working again. Every step still shows a card unless Autonomy is on. Press again to turn just those two Hands off (works from the phone too).
- ✋ Hands now just says **On** while Bob works without asking; the orange **On** on Autonomy (and the banner) shows that instead of saying it twice.
- The orange "Bob is working without asking" banner now lists what else he's let do, and gets bigger with each: using your apps (clicking, typing, switching windows), his browser, seeing the screen, and every hard limit you've switched off.
- It has a **Hide** button. It comes back by itself if Bob is let past anything new, and Settings, Hands has **Show the banner again**.
- Neither button lifts a hard limit: "Don't send anything out", "Never type into password fields" and the rest stay as you set them, and ✋ Hands still stops everything at once.

### Elsewhere
- Help: "The Browser Hand", the eyes checks under "The Apps Hand", the Settings: Hands list, and the FAQ "Can Bob use a browser or my screen like the big agents?". The user guide has a Use a browser section.

### Bob on Discord (Settings, Online services, off)
- **Bob on Discord:** Bob joins a server as a bot you make (never a user account) and answers in the channels you list when a message matches the wake phrase (`hey bob*` by default; the `*` is the job and can sit anywhere; a switch makes it case-sensitive). Discord jobs are guest jobs: only the job types you tick (chat and code help on; web, pictures, clips, music and sounds off), no files, Hands, memory or anything about you, and replies never ping anyone. Files go out only with **Share what Bob makes for Discord** on, and only ones made for that request.
- **Private mode:** your own Bob in Discord DMs, paired to your own account by a code or your user ID.
- The bot token is saved as the user variable `BOB_DISCORD_TOKEN` (or `~/.config/bob/env` on Mac and Linux), never in Bob's settings files.
- Telegram: you type your own account (user ID or @username) in Settings; no account is assumed. The token can also live in `~/.config/bob/env` on Mac and Linux.

### Bob works on repositories (Settings, How Bob works, off)
- **Let Bob work on repositories:** a list of repositories (Bob's own first; https links or local folders). Each gets its own code copy, branch and patches; your originals are never changed and nothing is ever pushed.
- Jobs are planned into research, edit and check tasks, each started fresh with the job's notes; the notes are compressed as they grow, so Long memory never overflows.
- **Let my other Bobs help** (off): research tasks can go to your other Bobs on Bob-Net; they only read.
- When Git or Node.js is missing, Bob can get his own copies (pinned and checked), kept in his own tools folder.

### Brain Engine's extra tools, and brains over several cards
- **Brain Engine gets four more of llama.cpp's tools**, built from the same tag: the standard speed test (`llama-bench`), the split-and-join tool (`llama-gguf-split`), the card-sharing server (`ggml-rpc-server`) and the diffusion brain runner (`llama-diffusion-cli`, which the official llama.cpp downloads leave out). Bob finds each one in the built-in engine's folder or in Brain Engine's.
- **Lend my graphics card** and **Spread big brains over my other Bobs' cards** (Settings, Bob-Net, both off): one brain too big for one replicant matrix can run over several of your Bobs' cards, say the PC and the handheld together. The lending Bob opens his card only when a paired Bob asks through the passcode door, only on his own Tailscale address (never the home network or the internet), and only while it's used: it closes when the other Bob lets go, after 3 minutes with no word, or the moment he starts Gaming. Nothing but parts of the brain and its working numbers travels. If nobody lends, the brain loads at home like always. Not tried on two real machines yet.
- **Brains in parts** (Lab, Forge, Bring in a full-size brain): a brain that comes as `name-00001-of-0000N.gguf` files is joined into one file after the download, so the Lab's ways can work on it; a part picked from your own folders is joined into the Lab's folder and your parts are left alone. The Forge splits a GGUF over Hugging Face's 50 GB limit into 45 GB parts before an upload.
- **Add the standard speed test** (Lab, Challenges, off unless ticked): llama-bench's read and write speeds (pp512 / tg128) go on the scoreboard beside the Challenges' own speed, so your numbers can be compared with what other people post.
- **Diffusion brains** (Lab, Playground, a sixth page): try a Dream, LLaDA or RND1 brain, which fills in a whole block of blanks over a number of steps instead of writing one word after another, and watch the answer form. Needs Brain Engine (Windows and Linux). Bob's chat can't run these, so your own diffusion brain gets no chat jobs.
- The Brain Engine build also carries the direction finder (`llama-cvector-generator`) and the adapter tool (`llama-export-lora`). These tools arrive with the next Brain Engine download; until then Bob says which ones are missing.

### Smaller fixes
- **Settings, Brains:** the folds no longer squeeze into a thin 26-pixel strip.
- Behind the scenes: a release check now fails if a test file isn't in the test list (two suites had been left out of it in 1.5.177).

## 1.5.177

Brain Engine and Riker become the defaults, and the Engines list gets a rework.

- **Brain Engine is the default engine for brains.** It's listed with or without the Lab, says plainly it's based on llama.cpp and not an official build, and has a real **Check for updates**.
- **Riker is the default Brain** in the catalog (Q4, or Q3 on an 8 GB card), from its public Hugging Face page.
- **⚙ engine picker** (Settings, Engines): choose which engine runs the brains next time, and which one the Lab uses. Updates check the download's checksum and keep the one before, so **Go back** works; **Remove it** / **Keep it** asks before anything goes. Engines are grouped so the list is easier to read.
- The Lab finds its tools (the direction finder, the adapter folder) in either download.
- A Brain Engine copied into its folder by hand (with no note of which build it is) is no longer offered the very same build by **Check for updates**; only a newer upload shows. Thanks to the owner's test round for catching it.
- **Pick a file and Pick a folder open on top of Bob's window.** In Bob's own window they're now the system's own picker, in front of him (before, Add a brain from a file could open behind him, or not at all). Windows, Mac and Linux; the phone has no picker, so adding brains stays on the replicant matrix.
- **The engine's own chat page is off.** llama.cpp and Brain Engine come with a plain chat page that looks like another app; Bob switches it off when he starts a brain, so the only page you chat on is his. Help: a new FAQ, "I loaded a brain and the page looked like a different app".

### Also in this update (1.5.170 to 1.5.176)

These came out together with 1.5.177, so here they are in one place. Each has its own section in the changelog.

- **Your files moved into one folder (1.5.174).** Bob's files now live in `app`, so his GitHub page only shows the README, the changelog and the licence. If you run Bob from a copy of the source, the first update after this needs **Update Bob from GitHub** once (or one run of `app\Install Bob.cmd`); after that Bob finds his new folder by himself.
- **The main screen always fits the window (1.5.176).** No more scrolling into empty space below the three panels; only the chat, Bob's thinking, the task queue, Now running, the menu and open pages scroll.
- **Word bubbles (1.5.170).** Bob's and Patches' lines pop out in little bubbles beside Bob's picture, close by themselves after 15 seconds (not while you point at one), or with ✕ or Esc. Fixes #36; thanks to mohdmunis161 for the first go at it in #62.
- **The Lab is in the left pane from the start (1.5.172).** The switch in Settings stays, and anyone who turned it off stays off.
- **Challenge times for your own card (1.5.171).** The Lab's Challenges tab scales its estimate to this replicant matrix's card, or its shared memory on a Mac. The Lab's goals point to Get models > Engines for Brain Engine, and a goal's printed Forge plan now matches what the Forge reads.
- **Bring in a full-size brain (1.5.173).** In the Lab's Forge tab: paste a Hugging Face name, a .gguf link or a file path, **Look**, then **Get it**. Your own brains show in the Lab's lists too, and the Lab finds the direction finder and adapter tool in Brain Engine's folder.

## 1.5.176

- **Bob's main screen always fits the window.** The page itself no longer scrolls down into empty space below the three panels, at any window size or screen scale. Only the parts that should scroll still do: the chat, Bob's thinking, the task queue, Now running, the menu and any page you open. Thanks to the owner for spotting it.

## 1.5.174

Behind the scenes: Bob's GitHub page is tidier.

- His files now live in one folder, `app`, so the front page only shows the README, the changelog and the licence. Nothing changes inside Bob.
- If you run Bob from a copy of the source: the first update after this one needs **Update Bob from GitHub** once (or one run of `app\Install Bob.cmd`). After that, Bob finds his new folder by himself.

## 1.5.173

- **Bring in a full-size brain** (Lab, Forge tab, under the cards): Bob's downloads are running files (Q4 and friends), and the Lab's ways here (Make a brain's running files, the ladder, Mix two brains, Stack layers, Take out the refusal habit) start from the full-size copy (F16 or BF16). Paste a Hugging Face name like `unsloth/Qwen3-1.7B-GGUF`, a link to a .gguf file, or the path of a file on this replicant matrix; **Look** lists the full-size files with sizes and licence, **Get it** brings one into the Lab's full-size folder (`models/bob/lab/full-size`), and it joins Bob's list under **Your own brains**, so every list in the Lab and Equip Bob sees it. Split files come down in all their parts; a download picks up where it stopped; Stop throws the part away. Nothing is uploaded.
- **Your own brains** (Get models, Add your own brain) now show in the Lab's brain lists too.
- The Lab looks for the direction finder (`llama-cvector-generator`) and the adapter folder (`llama-export-lora`) in Brain Engine's folder as well as the engine's own, and says plainly that they come with Brain Engine, not with the engine's own download (which never had them). Thanks to the owner for catching that on the replicant matrix.

## 1.5.172

The **Computer Science Lab** is in the left pane from the start.

- Until now the Lab was hidden until you found **Show the Computer Science Lab** in Settings. Now **🧪 Lab** is there on a fresh Bob, and on an updated one that never touched the switch. The switch stays, under How Bob works, Brains: turn it off and the Lab button goes; brains you made stay in Bob. Anyone who turned it off before stays off.
- The Lab's Brain Engine in Get models follows the same switch.
- A replicant matrix with less than 12 GB of memory still sees the Lab, and the Lab says it needs 12 GB to run jobs here; start them from another Bob on your Bob-Net.
- Help: Settings (the switch's line) and The Computer Science Lab updated; the User guide too.
- Phone (Bob for Android): the phone's menu shows the Lab the same way, following the replicant matrix running Bob.

## 1.5.171

The Lab's Challenges tab tells you how long each challenge takes on **your** card.

- Every challenge used to say "about 2 min on a 16 GB card" to everyone. Now, when Bob knows this replicant matrix's graphics card, the line names it and scales the guess: a 6 GB card sees a longer estimate, a 24 GB card a slightly shorter one. On a Mac, where the memory is shared, the line says "with your 32 GB of shared memory" instead of "your card". With no card to read, the plain 16 GB line stays.
- Help: The Lab's Challenges tab updated. Tests in `test/run-lab-test.js`.
- Phone (Bob for Android): the phone's Lab page shows the card of the replicant matrix running the Lab, the same as the desktop.
- The Lab's goals: the usage map's Brain Engine hint and error now point to Get models > Engines: Brain Engine (test build), and a goal's printed Forge plan now has the shape the Forge reads (strong and strong_cover for the whole plan, a usage-map cut as the rung's keep file, and heal hours set above the estimate). Tests in `test/run-lab-recipes-test.js`.

## 1.5.170

Bob's and Patches' lines now pop out in word bubbles.

- Bob's and Patches' lines now pop out in little word bubbles beside Bob's picture, over the chat, so a long line no longer pushes the menu down. Fixes #36. Thanks to mohdmunis161 for the first go at this in #62.
- A bubble closes by itself after 15 seconds (not while you're pointing at it), or with a tap on its ✕ or Esc. The details of what Bob is working on go in his thinking, not in a bubble.
- Help: the paragraph about Patches says where the bubbles appear and how to close one. Tests in `test/run-bob-life-test.js`.

## 1.5.169

**Catching up: what 1.5.159 to 1.5.168 brought** (they went out together this morning):

- **The Lab's Forge tab**: every way to make a brain, with tips; plans for the Forge, which can start a rented run from a purchase card (off unless you switch it on); plans can teach several things at once, including a way of thinking.
- **A local leaderboard** by class of model, **sixteen more challenges**, and **Guard rails**: test your own brain.
- **Hugging Face**: Forge plans can start from a brain there and learn from its datasets.
- **Give it eyes, give it ears**: add a picture reader or hearing to a brain that has none.
- **Peek inside** (which experts a brain used), and **Mix, Stack and Take out the refusal habit** at home, free.
- **The Playground** gets Longer, Faster (Turbo) and Teach it.
- **One switch for the whole Lab**: Keep it simple or Professional.
- **Fewer failed-build e-mails** for anyone working on Bob.

**New in 1.5.169:**

The Lab's lesson builder no longer makes "writing in my voice" lessons out of logs and tables.

- In the first real run of the lesson builder, three of five "writing in my voice" lessons came from a log file full of numbers. Now each passage is checked for whether it reads as prose. A passage that is mostly numbers or a table can still teach "working with my material", but never "writing in my voice".
- The survey box says how many passages were left out of the voice lessons for that reason.
- Tests: `test/run-lab-build-test.js`.
- **Bob's own update check works on ordinary Windows PCs again.** Two of Bob's tests read the tester's computer: one took Windows' Microsoft Store "python" placeholder for a real Python, and one read a tester's switch from the environment. On most Windows PCs that made the test run stop, so an Update could report a failed check (since 1.5.167). Both now give the same result on every PC.

## 1.5.168

One switch for the whole Computer Science Lab: **Keep it simple** or **Professional**.

- Under the Lab's tabs: **Keep it simple** shows the choices most people need on each tab, with Bob's usual defaults filled in. **Professional** shows every control a tab has. It's saved, so it's the same next time and on every tab, and the same switch is in Settings, How Bob works, Brains, as **Lab: Professional mode** (off unless you turn it on).
- In the Forge tab, Professional shows which skills to protect, the running files to make and how a brain is taught back; Keep it simple uses Q4 and a light teaching back. On the scoreboard, Professional adds **Every challenge as a column**.
- **Challenges, Professional**: run settings (temperature, seed, thinking on or off, how much room the brain gets, up to five runs, with the lowest, highest and average score). A run with settings other than the scoreboard's (temperature 0, thinking off, 8,192 tokens) is a study: it gets its report and its log, and the scoreboard stays as it is.
- **The question log**: every challenge run now keeps each question, the brain's answer and the result. In Professional, **Show the question log** under a finished run lists them (the misses first), and **Save the log** keeps it as JSONL or a spreadsheet in the Lab's results folder.
- **Your own challenges**: import a pack as JSON (paste it or pick a file), with plain checks only: letter, number, contains, exact, pattern, declines, answers. No code runs from a pack. They never go on the scoreboard. Help has the format and an example.
- **Guard rails in detail**: "didn't over-refuse" split by setting (everyday questions, stories and writing, your own things, how things work, work), how many answers came with a lecture or a pile of warnings, and how the replies sounded. In the sandbox, Save as lesson can tag a lesson's setting and how the reply sounded, and Held the line counts tagged lessons under their setting. Importing packs and saving logs work only on the replicant matrix running the Lab.
- Help: The Computer Science Lab updated. Tests in `test/run-lab-test.js`.
- Phone (Bob for Android): the switch shows on the phone's Lab page too, and sets the same thing.

## 1.5.167

The Lab's Playground gets three more pages next to the quantization ladder (now called **Smaller**): **Longer**, **Faster** and **Teach it**.

- **Longer: how much can it hold?** A memory meter: drag the context slider and see the chat memory grow next to the brain, with a red line where the graphics card ends, and **cache squeeze** (full, half, quarter). **Fits my card** says in one line how long a chat this brain can have before it spills into RAM, and **Use this in Bob** sets that size for the brain in Settings. **Speed against length** reads one long text at 1K to 128K tokens with a note hidden in it: time to the first word, reading and writing speed, and whether it found the note. **Stretch the window** is the Long memory (YaRN) setting, 2x or 4x, with the honest line that it trades a little sharpness for reach. **What gets forgotten** is a 20-turn chat in a 2K window, asked about its first turn. Nothing is downloaded or rented.
- **Faster: Turbo.** A small brain guesses, the big one checks, and the answer is exactly what the big brain would have said. Pick the main brain; the page suggests a draft brain from the same family that fits next to it on the card, or uses the brain's own guesser when it carries one (a multi-token head). **Try it** runs the same prompt with Turbo off and on at 2, 4, 8 and 16 words ahead: words a second, how many guesses were kept, and whether the words came out the same. A slider moves over the guess lengths. **Use this in Bob** switches Turbo on for that brain; Settings, Engines lists it per brain with a switch, the guess length and Remove.
- **Teach it: here or rented.** Pick a brain and a lesson set and the Lab says where it can be taught and why: about 2B on a 6 GB card, 3B on 8 GB, 7B on 12 GB, 9B (or a 15B mixture of experts) on 16 GB, 14B on 24 GB. Here, an adapter is taught against a 4-bit copy of the brain and folded into a new brain file with the built-in engine's tools; the Quick quiz runs before and after, and the brain is marked "made here" with its lessons listed. It never becomes Bob's brain on its own. Bigger brains, or **Teach it rented anyway**, are saved as a Forge plan (caps at 0) for the Forge tab's purchase card; nothing is rented from Teach it. For now the Forge teaches Qwen3.5 and 3.6 mixture-of-experts brains only.
- Teaching here needs the opt-in **Trainer pack** (about 7 GB: uv, Python 3.12, PyTorch and the training libraries, llama.cpp's converters), downloaded once into its own folder, with its licences shown first. Settings, Engines can remove it. NVIDIA cards on Windows and Linux; a Mac teaches in 16-bit; phones and the Raspberry Pi go rented.
- Brains for Teach it can be one of yours (Bob teaches its full-weight original when the file names it), a folder of .safetensors, a brain on Hugging Face, or a link to an archive of one. Lessons can be a Lab lesson set, a .jsonl file, a Hugging Face dataset file, or a link to a .jsonl file.
- Help: three new entries (the Playground's Longer, Faster and Teach it pages) and Settings: Engines. Tests in `test/run-lab-pages-test.js`.
- Phone (Bob for Android): the pages can be read from the phone; jobs start on the replicant matrix running the Lab. Teaching goes rented from a phone.

## 1.5.166

The Computer Science Lab: three ways to make a brain that run here, free, and Peek inside, the expert map.

- **Mix two brains** (Forge tab): one brain from two fine-tunes of the same parent. **An even mix** (the plain average, with a **Lean towards** slider), **A smooth blend** (SLERP, which keeps each weight's size; the usual pick) or **Keep what each changed** (TIES, against the parent both came from). Bob checks the two are the same shape of brain and says why not in words. The result carries both licences, takes the Lab test, and can go into Bob.
- **Stack layers**: a taller brain from layer ranges of one or two matching brains, written end to end and renumbered. The card says it plainly: stacked brains nearly always ramble until they're taught back; this is for seeing what happens.
- **Take out the refusal habit**: Bob finds the refusal direction from two short, mild prompt lists that ship with the Lab (readable on the card) with the engine's cvector tool, and takes it out of the chosen layers' output weights, with a **Strength** slider and a **Which layers** choice. Nothing is trained. **Try it first** holds the direction out at run time and writes nothing. Three safeguards are on unless turned off, each behind a second confirmation: the **kept-refusals check** (five plain one-line probes; only declined yes or no is kept, never the answers), **Teach back the kept refusals** (the Lab writes the lesson set and the note the Forge needs; the pass itself runs on a rented card, with the Forge's next build) and **Keep it on the naughty list**. Whatever is unticked, the brain's card says **Made in the Lab with the refusal habit taken out**, it is never the default, never starred, never picked quietly, and never published by Bob. The tool is generic: no switch, preset or list is aimed at any one kind of request.
- All three work on full-size files (F16 or BF16) up to 9 GB, on the processor, with Bob's own GGUF reader and writer, one weight table at a time.
- **Peek inside** (Playground tab): the expert map of a mixture-of-experts brain, layers across and experts down, from the usage map's counts, with a line per layer in words and **Show cold experts**. With Brain Engine, the live view asks a question and lights up the experts it picked, **Word by word**, **Compare the last two** (with the overlap in words) and **Keep only these and ask again**; it needs a Brain Engine build that reports the trace, and until then that part is greyed with the reason. **Keep count while I ask these** adds every traced word to the brain's tally (the usage map's files); **Cut these out** opens Make a brain, step 3, with that keep file; **Send to the Forge** leaves it where a Forge plan can point at it.
- Help: The Lab's Forge tab and The Lab's Playground tab updated. Tests in `test/run-lab-test.js` on tiny made-up brains.
- Phone (Bob for Android): the map and the plans can be read; the jobs run on the replicant matrix that runs the Lab.

## 1.5.165

The Computer Science Lab can give a brain eyes or ears: **Give it eyes, give it ears**, a new card in the Forge tab.

- **Find a match.** Pick a brain and Eyes or Ears. Bob lists the reader files on this replicant matrix that line up with it (the eye or ear plus its small translator, llama.cpp's mmproj), the readers in his catalogue from the same family, and a box for one from anywhere else: a file here, a Hugging Face name or link, or another https link. **Check it fits** reads only the first few megabytes of a far-away file, so a reader that can't fit is never downloaded. A reader from another family is refused in plain words, pointing at a new translator.
- **Attach and try**, free, here. A catalogue reader is downloaded and checked against its pinned sha256; your own file is used where it is, never copied. The pair goes into Bob as a brain of its own next to its family, and **Look at a picture** (or **Listen to a sound**) asks it about your own picture or sound, or one of Bob's.
- **Sharpen**, on a rented card: writes a Forge plan for a short teach-back (Sharpen a borrowed reader), a new translator for a ready-made eye or ear (Train a new translator), or both plus the text brain (Teach the text brain too). It never starts by itself: only the Forge's purchase card starts a rental. The Forge can't teach a brain to see or hear yet, so these plans are saved and wait for the Forge update; the card and Start both say so.
- **Measure**: a picture pack (14 plain pictures made on the spot) or a sound pack (6 sounds), then the Lab's quick quiz, so you can see the text didn't slip. Kept for before and after.
- **Load without eyes and ears**, per brain: leaves its reader out when Bob loads it, for more room to remember. **Take it out of Bob** removes an attached pair; a reader Bob downloaded is deleted, your own file never is.
- For hearing, the card also points at the cheap way most people want: Bob's own ears and voice, with any brain.
- Private or gated Hugging Face files use your own HF_TOKEN from your environment. It's sent only to huggingface.co, never on to wherever the download is passed.
- Help: Give it eyes, give it ears. Tests in `test/run-lab-senses-test.js` (78 checks).
- Phone (Bob for Android): the card can be read from the phone; attaching, trying and measuring start on the replicant matrix running the Lab.

## 1.5.164

The Lab's Challenges tab gets sixteen more challenges, including **Guard rails: test your own brain**.

- **More challenges**, each written for me in the style of a test people know, never copied from one: **Use the tools**, **Say "I don't know"**, **Follow every rule**, **Finish the code**, **Fix the bug**, **Common sense**, **Who is "she"?**, **School subjects**, **Harder sums**, **Read and answer**, **Long thread**, **Other languages**, **Shaped answers**, **Stay in character** and **Agent errand**. Same rules as the first six: temperature 0, thinking off, a plain machine check, the questions in plain view in `src/lab-packs-data.js`. Code a brain writes runs only in my sandbox (JavaScript for now).
- **Guard rails** gives three numbers: **Didn't over-refuse** (everyday asks that only sound edgy), **Ignored planted orders** (a pasted page with a hidden instruction), and **Held the line**, which replays the asks from your own refusal lessons on this replicant matrix. Bob ships none of his own for that part. With none yet, it says it wasn't run. Guard rails is shown on the scoreboard but never counted in Overall: a brain with its refusal habit taken out is meant to score low there.
- **Guard rails: test your own brain**, under the scoreboard: a sandbox chat with the brain Bob has loaded, its system prompt visible and editable, a turn counter, a **When the page lies** sample, and **Save as lesson**, which writes the exchange with the answer you wanted to your own **Guard rails practice** lesson set (refusals or recover). Nothing is shared. Saving only on this replicant matrix itself.
- The Challenges list shows the first six, then **More challenges**. Every new challenge starts at version 1, so brains scored before show how many they ran and sit below full runs until they run the new ones.
- Help: The Lab's Challenges tab updated. Tests in `test/run-lab-test.js`.
- Phone (Bob for Android): the phone can open the sandbox and chat; Save as lesson stays on the replicant matrix.

## 1.5.163

A Forge plan in the Lab can start from a brain on Hugging Face and learn from datasets on Hugging Face.

- **The brain to start from** is one list: the brains the Forge has made, then **Another brain** from this replicant matrix (a folder of full-size weights), from Hugging Face (name or link) or from another link. **Look it up** reads a Hugging Face card: licence, weights and class, mixture of experts or not. A brain from Hugging Face or a link is downloaded on the rented card, never here. **Forge settings to copy** names the Forge plan whose skills list, lesson mix and card settings the run uses.
- **Lessons to teach**: tick the lesson sets written or built in the Lab, and add up to four more from this replicant matrix (.jsonl, .json, .csv or .parquet, or a folder), from Hugging Face or from a link. Added sets are downloaded and put into Bob's lesson format here before the run, and the run won't start if any can't be brought in. New lessons make the teacher's scoring pass start over.
- A plan can name a brain on this replicant matrix or at a link now, but it can't start until a Forge update adds them; until then, Start says why.
- Private or gated repos use the owner's own HF_TOKEN from their environment. It is sent only to Hugging Face, never shown, logged or written into a plan.
- No licence on the card means there's no clear right to share what you make from it: keep it private. Such a set is never uploaded anywhere.
- To cut a brain from Hugging Face, each brain made uses **Keep every skill covered**: the Forge counts its experts on the rented card first, then cuts. A brain that isn't a mixture of experts can't be cut by experts, and the plan says so.
- A plan with lessons from Hugging Face can be saved now and starts once the Forge's lesson importer arrives; until then Start explains why it won't.
- Three new thought paths under **Famous styles** in Teach it a way of thinking, our own take on how some well-known AI models think: **Sherlock** (Fable-like: deliberate and thorough, checks its own work), **Watson** (Opus-like: direct and brisk) and **Vulcan** (GPT-like: pure logic, by the book). They're trained towards that kind of thinking with lessons from Bob's own teacher brain, never from those models' answers or thoughts. Claude, Fable and Opus belong to Anthropic and GPT to OpenAI; neither company is involved with or endorses Bob.
- Help: The Lab's Forge tab updated. Tests in `test/run-lab-test.js`.
- Phone (Bob for Android): plans are written on the replicant matrix running the Lab; the phone can read them.

## 1.5.162

Fewer failed-build e-mails. Nothing in Bob itself changes.

- **Draft pull requests run no GitHub builds.** Work in progress stays a draft, and the Windows, Mac, Linux and Android builds start only once it is marked ready for review. Work branches no longer build on every push; they are built through their pull request.
- **The change list can't fail a branch's build.** On branch and pull request work, the build brings `CHANGELOG.md` up to date itself before the release check. Main and version tags still must have it current.
- **The Android tools download tries three times** before it fails, since GitHub's download sometimes breaks halfway.
- **A guard so this stays fixed:** `npm run check:release` fails if a build starts on every work-branch push again, or runs on draft pull requests.
- **House rules written down:** `.github/CONTRIBUTING.md` and a new `CLAUDE.md` say to refresh the change list and run the checks before every push, to keep work in progress as a draft, and that tests never read the real computer (graphics card, system, folders or keys).

## 1.5.161

The Lab's scoreboard is now a local leaderboard by class of model.

- **By class of model**: brains are ranked against others of their own size class, by how many weights they have in all: Tiny (under 2 billion), Small (2 to 5), Medium (5 to 10), Large (10 to 20), Huge (20 to 40) and Giant (over 40). Classes are by the model, not by graphics card.
- A mixture of experts sits with its total and shows how many weights are at work on each word. Quantizing never moves a brain to another class; a **Quant** column says how it was squeezed.
- **Overall** is the average of every challenge, run with today's version of each test. A brain that hasn't run them all shows how many it ran and sits below the ones that have, so it can't win by skipping the hard one. Every score now remembers its test's version, and a score from an older version shows crossed out and doesn't count.
- The top brain in each class gets **Best in class**, and only a brain that has run every challenge can get it. Buttons narrow the board: Mixture of experts or Dense, Made here, and Fits my graphics card.
- Brains scored before this sit under **Not placed yet** until a challenge is run on them again. **Every brain in one table** keeps the old sortable view. **Save** from the class view keeps the class in its own column.
- Help: The Lab's Challenges tab updated. Tests in `test/run-lab-test.js`.
- Phone (Bob for Android): the board and its buttons work the same on the phone's Lab page.

## 1.5.160

The Lab's Forge tab can now start a Forge run, and a Forge plan can teach several things at once, including a way of thinking.

- **Start a run**: turn on **Let the Lab start Forge runs** (off unless you turn it on) and add the rental service's key in Settings > Rented brains. Each saved plan gets **Start on a rented card…**, which shows a purchase card with the brains, the files and the caps read back from the plan. Only your press on **Rent it and start** starts it. A plan with a 0 cap never starts, and Bob never starts a rental by himself. The run's last log lines show while it goes, with keys and tokens hidden. **Stop the run** asks first, then deletes only that run's rented card. The card still shuts itself down at the cap even if this replicant matrix is switched off.
- **What to teach**: one run can teach thinking, answers and knowledge, tools, coding, writing and voice side by side, each with a share.
- **The way of thinking**: 81 thought paths in groups, from concise, creative and critical to look before you touch, say how sure and think like the opponent, each with a share, plus **Your own path** in one line and eight ready-made sets (Careful coder, Debugger, Honest helper, Planner, Tutor, Stress tester, Fast chat, Game master). **Blend** teaches one mixed habit, **Switch** teaches each path so you can pick it at chat time, and **Both** does both. Paths that pull against each other are flagged.
- **Personality**: alignment (good, neutral, evil), rules (by the book to bends the rules) and mood (cheerful, calm, deadpan, grumpy, dramatic, curious). It's tone and character, and the refusals Bob always keeps stay.
- **Learn from**: the answers, the thinking, or both (the thinking counts half by default), and optionally how sure the teacher was during the thinking too (a longer teacher pass, and it starts over).
- New setting: Let the Lab start Forge runs, off. Help: The Lab's Forge tab updated. Tests in `test/run-lab-test.js`.
- Phone (Bob for Android): you can watch a run from the phone; starting and stopping only happen on the replicant matrix running the Lab.

## 1.5.159

The Computer Science Lab gets a **Forge** tab. Every way to make a new brain is now in one place, each with what works best, and the Forge, which makes brains on a rented graphics card, is now on screen instead of only in a terminal.

- **Ways to make a brain**: a card for each way: Make it smaller, Cut experts, Teach a cut brain back, Teach it a lesson set, Teach it a way of thinking, Mix two brains, Stack layers, Take out the refusal habit, Blend two Bobs, Fold experts, Stitch brains in as experts, and Teach it to need fewer experts. Each card says what you get, whether it runs here for free or on a rented card, and its **Best practice**. Cards that aren't ready yet are dashed and say why.
- **Ideas left out, and why**: round robin training (normal training already does it), every expert on for every word, forcing "coding experts", and expert offloading (that's how a brain runs, and Bob already does it).
- **Forge runs**: every Forge run on this replicant matrix, with the last lines of its log (keys and tokens hidden), and the brains it brought home: how surprised each was by held-back lessons before and after teaching back, next to the teacher's own score, and whether it got a full pass.
- **New Forge run**: start from one of the Forge's plans, name the brains to make (a number of experts, every skill covered, or a keep file the Lab made), pick the running files and the teaching back, type the caps, and **Save the plan**. **Show the plan** shows exactly what the Forge will read. Each brain's time limit is set a third above the estimate, so a full pass is never cut short. Caps start at 0, and a 0-cap plan can't be started.
- Starting a run from the Lab comes in the next drop. Bob never starts a rental by himself.
- Help: new pages, The Lab's Forge tab and Making brains: best practice, in Bob's voice. Tests in `test/run-lab-test.js`.
- Phone (Bob for Android): the Forge tab's runs can be read from other devices; plans are written only on the replicant matrix itself.

## 1.5.158

Long memory now works with Qwen3 and Qwen3 Coder brains too, if you switch it on.

**New, and not tried on real hardware yet.** Like Long memory in 1.5.150, this is off unless you switch it on, and we haven't run it on a real replicant matrix yet. If you try it, please tell us whether it loaded and chatted, and how much graphics memory and RAM it used. Open an issue at github.com/MouseWurX/Bob/issues.

- **Qwen3 Coder** was made for 256K, so its menu also offers 512K and 1M. It needs a lot of memory past 256K: about five times as much per step as the 35B Qwen3.5 and 3.6 brains, so on most replicant matrices it gets 512K at most, or none. Bob greys out any size that won't fit.
- **Qwen3** was made for 32K, so its menu also offers 64K and 128K, up to four times what it was made for, which is as far as Qwen says it goes.
- The switch is now called **Long memory: let Qwen brains stretch past what they were made for** (Settings, Brains, under **Pick how much each brain keeps in mind**; off). Bob still stretches only while a size past what the brain was made for is picked, because it makes short chats a little worse.
- Help, the FAQ and the settings list cover the new brains.
- Phone (Bob for Android): nothing changes.

## 1.5.157

Brain Engine, my Lab engine, can be downloaded now: Get models, Engines, **Brain Engine (test build)**, shown only while the Computer Science Lab is on.

- **Get Brain Engine.** It's a fork of llama.cpp that can switch experts off without reloading, so the Lab's **Try it first** can test a cut before any file is written. It's not an official llama.cpp build. I download the tested llama.cpp build for your card, put Brain Engine's own server and llama files on top from a test pre-release on Bob's GitHub page, check both against their checksums, and keep it in its own folder (`brain-engine`). My built-in engine stays exactly as it is. Windows and Linux (x86_64); not yet on a Mac or ARM boards.
- The Lab's Try it first and its Help now point to it, instead of saying it isn't ready.
- `test/run-brain-engine-get-test.js`: 11 checks (Lab off hides it, real archives, the official card files kept, the everyday folder untouched, a damaged download refused).
- Phone (Bob for Android): nothing changes.

## 1.5.156

The Computer Science Lab, part 3: the **Playground** tab, with the quantization ladder. How small can a brain get before it gets worse? Now you can watch it happen, on this replicant matrix, for free.

- **Make the ladder**: pick a small brain's full-size file (F16 or BF16, up to 9 GB, so a 1B to 4B brain) and I make it in six sizes, Q8, Q6, Q5, Q4, Q3 and Q2, tuned with an importance file from my own Help. Before it starts I say how much disk it takes.
- Each size gets the same measurements: **On disk**, my **Lab score**, **Words a second**, and **Surprise** (perplexity on a page of my Help it never tuned on, lower is better), next to Q8 and in words: same quality, a little worse, noticeably worse, or falls apart. Two bars per size show it as a picture; the numbers are always in the table too. Then I say which is the smallest size that's still close.
- **Same question, every size**: type a question and I ask every size in turn at temperature 0, side by side, so you can read where it slips.
- **Delete all** gives the disk back and keeps the table; **Save…** keeps it as a picture, text, a spreadsheet or data, like every Lab result.
- It's a Lab job: I ask before unloading my own brain, it waits while Gaming is on, you can stop it, and it only starts from this replicant matrix itself. If my engine folder has no llama-perplexity, I skip the surprise column and say so.
- Help: a new page, The Lab's Playground tab, in my voice. Tests in `test/run-lab-test.js`.
- Phone (Bob for Android): nothing changes; there's no Lab on the phone.

## 1.5.155

A privacy fix for the Computer Science Lab's lesson writer.

- **Your folder and name stay out of written lessons.** When Bob writes a lesson set in the Lab, the stand-in Bob he teaches with used to show the teacher brain real paths on this replicant matrix, so a few lessons could carry your user folder and user name. Now the home folder, the stand-in's own folder and the user name are swapped for stand-ins (like C:\Users\you) before the teacher sees anything, every saved lesson is checked the same way, and ideas that are only placeholders (like "[code snippet]") are dropped.
- If you wrote a lesson set in the Lab before this version, check it before you share it, or write it again.
- `test/run-lab-test.js`: new checks that the teacher and the lesson file never see the real folders.
- Phone (Bob for Android): nothing changes.

## 1.5.154

The Computer Science Lab: goals, a time-and-cost table before anything runs, and the usage map that shows which experts a brain uses for what. All free, on this replicant matrix; nothing is rented.

- **Start from a goal** (above the template picker). Pick where the new brain will run (this replicant matrix, a 24, 16, 12, 8 or 6 GB graphics card, a 16 GB handheld, or a phone with 12 or 8 GB) and a goal: **Everything, smaller**, **Coding helper**, **Everyday chat**, **Game master** or **Tiny and fast**. Bob fills in steps 2 to 5: the number of experts that fits the device, the skills to protect at 99%, a Q4 running file (Q3 for devices with 8 GB or less), measuring before the running file, Try it first when Brain Engine is here, and the comparison test. Nothing starts until you press Start. **Fold instead of drop** is listed and greyed until it's built; **Just measure** opens the usage map.
- **What it takes.** A table before every Lab job: how long it takes here, from the brain's size the first time and from your own past Lab jobs after that, and the space it needs. For a cut, a second column shows what teaching it back would take on a rented card (hours and dollars), from the measured rentals: about 0.6 hours per 1,000 lessons for a cut with 208 experts per layer, 2.5 hours for the teacher's scores, at about $5 an hour for a 141 GB card. Bob never suggests a cap: the Forge plan under the table carries a cap of $0, and nothing rents until you set one. Every number is a rough guess. Every Lab step now records how long it took.
- **The usage map** (under Compare). Count which experts a brain uses for each thing you test it on: the four parts of the Lab test, your chats with Bob, a lesson set (one count for each skill), or a file or folder of your own text and code. It lists the cold experts (never used for anything tested), the faint ones (the last 5% of the work), the ones only one thing uses, a per-layer table, and how much of each thing a cut keeps at a few sizes. With Brain Engine, it can switch the cold and faint ones off and give the Lab test again. The counts are saved as `peek-counts.json` and a keep list, in the format the Lab's Peek inside will share; the goals build their cut from them when they're there.
- Help: a new page, Goals, the estimate and the usage map. `test/run-lab-recipes-test.js`: new checks.
- Phone (Bob for Android): nothing changes; there's no Lab on the phone.

## 1.5.153

The Computer Science Lab, part 3 continues: **Challenges**, a scoreboard for the brains on this replicant matrix, and **Save** for any Lab result. Free, here; nothing is rented.

- **Challenges** is a real tab now. Pick a brain, tick challenges and press **Run the challenges**. It's a Lab job like the others: I ask before I unload my own brain, the Lab waits while Gaming is on, and you can stop it.
- Six challenges, every question asked at temperature 0 with thinking off, so the same brain gets the same score twice: **Quick quiz** (the Lab test), **Riddles and reasoning**, **Sums**, **Follow the rules**, **Pick the tool** (four pretend tools, nothing really run) and **Code it** (tiny JavaScript functions). The questions are written for Bob, not copied from a published benchmark, and they ship with him so anyone can read them.
- **Code it** runs a brain's code in the same sandbox as my self-made tools: no files, no programs, no internet, ten seconds at most. If the sandbox doesn't hold on this replicant matrix, the challenge is skipped and says why.
- **Scoreboard**: every brain you've tested, its newest score for each challenge, its size and its words a second. Press a column's name to sort by it. Scores sit in the Lab's scores folder, one small file per brain, with a fingerprint of the brain file so other Lab tools can match them.
- **Save…** under the scoreboard, a finished challenge, and every Learn card: a **Picture** (drawn here, offline), **Text** (a Markdown table), a **Spreadsheet** (CSV) or **Data** (JSON), in the Lab's results folder. It carries the title, the table, my version and the date. Never file paths, chats or names. **Include my graphics card and memory** is off unless you tick it.
- The Help page says plainly that these scores only mean something next to each other, on the same replicant matrix, and aren't the numbers you see in papers.
- Help: a new page, The Lab's Challenges tab. `test/run-lab-test.js`: 193 checks, including a brain's code really run in the sandbox (right code passes, a file outside is refused, an endless loop is stopped).
- Phone (Bob for Android): nothing changes.

## 1.5.152

The Computer Science Lab, part 2c: build a lesson set from your own files, with a survey and sample lessons before anything big runs. All free, on this replicant matrix; nothing is rented and nothing is uploaded.

- **Build a new set from my files** (step 2). Add files or folders (plain text, Markdown, web pages, Word, OpenDocument, RTF, e-books and PDFs; chat logs from my own sessions, a ChatGPT or Claude export, or a "Name: line" transcript), name a skill for each, tick what I should learn from them, and pick a teacher brain you have. Three kinds of lesson: **Working with my material** (real questions about a passage, answered with the passage in front of me), **Writing in my voice** (your passage is the answer) and **My past conversations** (each exchange becomes a lesson, re-said in my voice unless you say otherwise). Each kind is its own skill, so the coverage cut protects it.
- **Survey my files** first: what I found, what I'll skip and why, how many lessons your files can supply, repeated passages left out, and anything that looks like a password, key, card number, address or e-mail, **held back** before the teacher ever sees it. A plain box says what the brain would learn, from the counts.
- **Show me 12 sample lessons**, each a card: the message, what I read, what I said, with **Keep** and **Not like this** (leave this file out, not this kind of lesson for this file, or the message is wrong for this passage). The clicks change the plan; nothing is trained from them. Then **Build the set**, a Lab job you can stop and carry on.
- **Sets built from your files**: **Open the set** (every lesson, a search box, filters by skill, kind and file, Remove this lesson, Remove everything from a file) and **Export as a file**, the only way a set leaves the Lab: I replace your user folder, home-network and Tailscale addresses, e-mails and keys first, show you what changed, then write a zip where you choose. Files are read in place and never copied; no upload anywhere.
- Help: the Lab page covers it, in my voice, with the honest line (a few hundred lessons teach habits and voice, not facts by heart; my notes and Recall do facts). FAQ: can I share a set I built from my files. `test/run-lab-build-test.js`.
- Phone (Bob for Android): nothing changes; there's no Lab on the phone.

## 1.5.151

The Computer Science Lab, part 3 begins: a **Learn** tab, where you can see how I work with your own hands on the knobs. Free, on the brain I have loaded right now; nothing is downloaded, rented or saved.

- **Tabs in the Lab.** **Make a brain** is the Lab as it was (the five steps, templates, Compare). **Learn** is new. **Playground** and **Challenges** are shown greyed out, as they're on the way. Left and right arrows move between the tabs.
- **What is a token?** Type anything and press **Split it**: I show the pieces I actually read, one chip each with its number, and how many characters and tokens that was. Chips take turns solid and dashed so you can tell them apart without colour; a dotted chip is only part of a character.
- **How do I pick the next word?** **Show my odds** lists my ten likeliest next tokens for the start of a sentence, as percentages and bars. Click one to make me say it, or **Let me choose** to watch me roll, for twelve words.
- **What does temperature do?** A slider from 0 to 2 (with a number box), and **Write it three times** writes the same start three times at that setting, with my odds for the first word underneath so you can watch them flatten. **More knobs** adds **Cut the long tail** (min_p) and **Only the likeliest** (top_p).
- Each card ends with **What you just saw**, a line from me that changes with what happened. Results are read out by screen readers when they land.
- Needs my built-in engine (llama.cpp); with Ollama the tab says so. The Lab switch in Settings still turns it all on or off. While a card runs it counts as using my brain, so Free memory when Bob is idle leaves it loaded. A card's run pushes our chat out of my short-term memory, so my next chat reply starts a little slower while I read the conversation again.
- Help: a new page, The Lab's Learn tab. `test/run-lab-test.js`: 151 checks.
- Phone (Bob for Android): nothing changes yet. Learn comes to the phone in a later update.

## 1.5.150

Qwen3.5 and 3.6 brains can keep more than 256K in mind, if you switch it on.

**New, and not tried on real hardware yet.** Long memory is off unless you switch it on, and we haven't run it on a real replicant matrix before this release. If you have a Qwen3.5 or 3.6 brain and the memory to spare, please try 512K or 1M and tell us how it went: whether it loaded and chatted, and how much graphics memory and RAM it used. Open an issue at github.com/MouseWurX/Bob/issues.

- **Long memory** (Settings, Brains, under **Pick how much each brain keeps in mind**; off): on Bob's built-in engine, Qwen3.5 and 3.6 brains, and Bob's own brains made from them, can also offer 512K and 1M. Bob stretches how the brain counts positions (YaRN) only while a size past 256K is picked, because the stretch makes short chats a little worse.
- **It says what it costs.** Each stretched size shows about how much memory it needs (on the 35B brains, about 3 GB more than 256K for 512K and about 8 GB more for 1M; the dense 27B needs about three times as much), and a size that won't fit on this replicant matrix is greyed out with the reason. If it doesn't fit when the brain loads, Bob loads it at 256K and says why. Reading a very long text takes a long time: a full 1M can take well over half an hour.
- Not offered on a phone or a replicant matrix with 8 GB or less.
- Help, an FAQ (*Can Bob keep more than 256K in mind?*), glossary entries for Context and YaRN, and the settings list explain it.
- Phone (Bob for Android): nothing changes.

## 1.5.149

Bob's thinking can show its lines in the order you like.

- **Order the lines.** The 💭 Bob's thinking window and the Bob's thinking section in Now running both have an **Order** menu: **Newest at the bottom** (as they happen, the way it was), **Newest at the top**, or **Bob, then his copies**, which groups everything Bob thought first and then each copy's lines (his reviewer, his coding copy...), each group in the order it happened. Follow along follows whichever end is newest, and a screen reader hears which order the log is in. Remembered in that window of Bob.
- Works the same in Bob's own window and in a browser, on Windows, Mac and Linux, and on a narrow screen.
- Help: the "Bob's thinking" page explains Order. `test/run-mind-test.js` has 5 new checks.
- Phone (Bob for Android): nothing changes.

## 1.5.148

Qwen brains pick their words the way Qwen recommends, for each kind of reply.

- **Word settings by mode:** on the built-in engine, Qwen3.6 brains, and Bob's own brains made from them, get Qwen's recommended settings: one set when they think it through (temperature 1.0, top P 0.95, top K 20; cooled to 0.6 when Bob is about to use a tool), a cooler set when they think through code (0.6, 0.95, 20), and one for quick replies (0.7, 0.8, 20, presence penalty 1.5).
- **Reply length:** a reply can be up to 32,768 tokens. On a small replicant matrix, a brain with a small memory gets half of it for the reply, so a long answer can't fill it up and stall.
- **Choose my own word settings** (Settings, Show advanced settings, Engines; off): type your own numbers for any of the three sets. **Back to Qwen's** puts one set back.
- Other brain families (Gemma, gpt-oss, older Qwen) and the Ollama engine keep their own settings.
- Help, the user guide and the settings list explain it.
- Phone (Bob for Android): nothing changes.

## 1.5.147

The README and the user guide explain the Computer Science Lab and Brain Engine.

- **Docs:** the README and the user guide now say what the Lab is for: you can use a brain and change it in the same app, while Bob keeps working. The README also introduces Brain Engine, Bob's own engine based on llama.cpp (still in testing, not on Releases yet).
- The README starts with what Bob is for: a one-line Download link, then Why Bob, with the download table under its own Download heading.
- Phone (Bob for Android): nothing changes.

## 1.5.146

A brain Get models found on this replicant matrix now loads in chat without an Equip first.

- **Found brains load straight away.** When **Look for brains on this replicant matrix** finds a brain from my catalogue somewhere else on the drive, Get models already said you have it, but chatting with it by name said "I can't find the model files" until you Equipped it. Now my engine looks in that same list last, after my own models folder, so the two agree. A picture reader only counts when it's in the same folder as its brain, a file still being copied is skipped, and my own copy still comes first.
- `test/run-own-copy-test.js`: 13 checks.
- Phone (Bob for Android): nothing changes.

## 1.5.145

A small fix for brains of your own.

- **Typing a brain's path now reads its brain card too.** Adding a brain with **or type its path** now fills the form the same way as picking the file: it says "Brain card found" and brings the card's picture reader along. Before, only the file picker did that (Bob still filed the brain correctly either way).
- `test/run-brain-card-test.js`: 20 checks.
- Phone (Bob for Android): nothing changes.

## 1.5.144

See the tools and how-tos Bob made for himself, and delete the ones you don't want him to have.

- **🧰 Tools and how-tos Bob made** (Settings, everyday; it replaces the 📒 How-tos panel). One place for everything Bob made for himself: **🔧 Tools he wrote** (what each does, what it can change, whether it goes online, when he made it, and its code) and **📒 How-tos he kept**.
- **Delete asks on the row**, no pop-ups, and leaves an **Undo** right there. Anything deleted waits 30 days under **🗑 Recently deleted**, where **Put back** brings it back as it was (a tool keeps your OK). **Delete for good** sends a tool's folder to the Recycle Bin (the Trash on a Mac, the trash on Linux); a how-to deleted for good is gone.
- Bob knows too: if he reaches for a tool you deleted, he says so and where to put it back, and he won't make a new one with the same name over it. Removing a tool under Hands now goes to Recently deleted as well.
- Help: a new Settings topic, an FAQ ("Can I see and delete the tools and how-tos Bob made for himself?") and a glossary line for Recently deleted. New `test/run-own-kit-test.js` (51 checks).
- Bob says "about 1 second", not "about 1 seconds", when a brain loads fast.
- Phone (Bob for Android): Settings has the same list from a Bob on your Bob-Net, with Delete, Undo and Put back. Delete for good only works on that replicant matrix itself.

## 1.5.143

The Computer Science Lab, part 2a: keep every skill covered, write a new lesson set with a teacher here, and try a cut on Brain Engine before cutting. All free, on this replicant matrix; nothing is rented.

- **Keep every skill covered** (the new recommended way to cut experts). I count each skill in the lessons on its own (a lesson's "job" or "skill") and keep, in every layer, the experts that do 95% of each skill's work (90% or 99% if you like), padded to one size for every layer. **Protect these skills more** keeps 99% for the ones you tick. **As many as the skills need** works out the number. The report shows, per skill, how much stayed on average and in its worst layer, and the keep list and `coverage.json` are saved beside the brain. It's the Forge's keep.py rule, in Bob.
- **Write a new lesson set** (step 2). Pick a teacher brain you have, tick skills (using Bob's tools, coding, fixing code from an error, thinking it through, asking when it's unclear, remembering notes, running a game, saying no politely, other languages, general chat), how many lessons (100 to 20,000) and thinking (half, all or none). The writer runs as its own process with a throwaway Bob: his real instructions and tools, none of your chats, notes or names. Tool results are played by the teacher; nothing is really run. Lessons land in the Lab's lessons folder, with a skill on each, and show in step 2 under **A lesson set I wrote here**. Stopping keeps what's written; the same name carries on. A teacher whose licence forbids training is refused, and an unknown licence gets a note. Pay-per-answer and rented teachers are shown as later.
- **Try it first, before cutting** (under Cut experts; greyed out until Brain Engine is ready to download, in a later update). With Brain Engine on this replicant matrix, the Lab test runs on the whole brain with every expert on, then with only the kept experts switched on, before any file is written. If it scores more than 10 points lower on the Lab test, it stops there (you can untick that). The every-expert score is the one the new brain is compared with, so the separate compare test isn't run again.
- Help: the Lab page covers all three. `test/run-lab-test.js`: 125 checks.
- Phone (Bob for Android): nothing changes; there's no Lab on the phone.

## 1.5.142

The Computer Science Lab, part 1b: start from a template, measure before making the running files, and compare brains side by side, with the numbers saved as data.

- **Start from a template.** A new first line on the Lab page fills steps 2 to 5 from a recipe I've used before: **Lab local cut** and **Plain cut** run here. **Coverage cut and heal**, **Train the teacher** and **Learn from outside traces** need a rented card, so they're greyed out with the reason (renting is Lab 2), and **Show the recipe** prints them as a Forge plan. **Merge experts** and **Layer or width cut** are listed as not built yet. Every box can still be changed. The templates ship with Bob (`public/lab-templates.js`), so they work offline.
- **Measure before making the running files** (recommended, under Make the running files): llama-imatrix measures the cut brain itself on your lessons, and llama-quantize uses that measurement, so Q4 and Q3 files lose less. It's measured on the cut file, not the brain it came from, because the expert counts change in a cut.
- **A measurement record for every Lab test.** `measure.json` beside the new brain, and `measure-parent.json` for the brain it came from: the file's sha256, file type, experts per layer, size, template, what it was made from, the four test scores, words a second and reading speed, and the engine (it says Brain Engine, Bob's Lab engine: a version of llama.cpp that can switch experts off, when the test server is that engine). Missing parts are left out, never zeroed. No file paths, host names or people.
- **Compare**, under Lab jobs: tick two or more tested brains to see one table with real header cells, and a **Difference** column (the second minus the first, signed, with a percent) when there are two. **Save as CSV** and **Save as JSON** write to the Lab's compare folder. Saving only works on this replicant matrix; on another replicant matrix you can look but not save.
- Help: the Lab page covers templates, Measure and Compare. `test/run-lab-test.js`: 95 checks.
- Phone (Bob for Android): nothing changes; there's no Lab on the phone.

## 1.5.141

The Computer Science Lab, part 1: make your own brain from one on this replicant matrix, for free, behind a switch that is off. And the Bob-Net heading opens Bob-Net settings.

- **🧪 Computer Science Lab.** Turn on **Show the Computer Science Lab** (Settings, How Bob works, Brains) and **🧪 Lab** appears in the left pane. It walks you through five steps with checkboxes and radio buttons instead of command-line flags: **Pick a brain** (any brain you have on Bob's own engine; each says what the Lab can do to it), **Lessons** (your chats with Bob, which stay here, or a lesson set you have), **Make it smaller** (**Take out sight**, **Take out hearing**, **Cut experts** on mixture-of-experts brains, keeping the busiest ones or an expert list you have, and **Make the running files**: Q4, Q5, Q6 or Q8 from a full-size copy), **Where it runs** (this replicant matrix) and **Test and use**.
- **Every Lab brain is tested before it goes into Bob.** The Lab test asks general knowledge, picking the right tool, coding and following instructions, at temperature 0, side by side with the brain it came from if you tick that. **Use in Bob** only appears after a test, and puts the new brain in Get models next to its family, marked *made in the Lab*. Bob never makes it his main brain by himself.
- **Show the recipe** shows the exact commands the Lab is about to run (llama-imatrix, llama-quantize, llama-server, and Bob's own expert cutter, since no command-line tool does that yet), with a Copy button. **Save as recipe** keeps your choices, never file paths.
- **Bob's own cutter** cuts experts and takes a sense out of a combined picture-and-sound reader by copying the GGUF file piece by piece, so a 20 GB brain never has to fit in memory, and Bob keeps answering (and Stop works) while it copies. A stopped cut leaves nothing half-written behind.
- The Lab asks before it unloads Bob's brain to make room on the card, waits while Gaming is on, and runs one job at a time. On a replicant matrix with less than 12 GB of memory the switch is greyed out, with the reason.
- Shown greyed out as coming later (Lab 2): writing new lesson sets, recording a teacher's odds, the coverage cut, **Teach it back**, **Make it one file**, layer and width cuts, and rented cards.
- **Bob-Net heading.** In Now running, the word **Bob-Net** is now a button that opens Settings at Bob-Net (advanced shown, the section open), instead of scrolling for it.
- Help: a page "The Computer Science Lab", the Settings row, glossary lines for Computer Science Lab and Running file. New `test/run-lab-test.js` (70 checks: the cutter byte for byte on made-up brain files, the recipe checks, a whole Lab job with fake steps, Use in Bob, the switch and the words).
- Phone (Bob for Android): nothing changes; there's no Lab on the phone yet.

## 1.5.140

Brains of your own can bring a brain card that tells Bob what they're for.

- **Brain cards.** A brain you add from a file can bring a small card beside it (same name, ending .bob.json) that says what it's for. Bob then files it under the right jobs and family, uses its name, picture reader and size, and shows its benchmark in the i. Brains made in Bob's own workshop come with one and say "Bob's own brain". A card only counts if it names the file and its exact size. You still pick these yourself; Bob doesn't recommend them.
- No card: nothing changes, the brain is added the same way as before.
- Help: the "Your own brains" FAQ explains brain cards, and the brackets FAQ says when "(Bob's own brain)" appears. New `test/run-brain-card-test.js` (19 checks).
- Phone (Bob for Android): nothing changes; brains of your own are a replicant matrix feature.

## 1.5.139

Bob can now read long pages and files in parts, and code from GitHub keeps its < and > signs.

- **Long pages and files in parts** (issue #48). A web page or file that's too long to read at once now comes in parts. Bob is told how big it is, which part he has, and how to ask for the next one, or he can look for a word in it. Before, he only ever saw the top of a long page and kept reading it again.
- **Code stays whole.** Code, plain text, data and raw files from GitHub are no longer run through the web-page cleaner, which used to eat everything between a < and a >.
- If Bob asks for the same page twice in one turn, he isn't sent it again; he's pointed at the next part instead.
- New `test/run-page-parts-test.js` (18 checks).
- Phone (Bob for Android): nothing changes on the phone; when the phone talks to a Bob on a replicant matrix, that Bob reads long pages this way too.

## 1.5.138

Bob's thinking can live in Now running instead of a second window, and the sections of Now running go in any order.

- **💭 Bob's thinking, docked.** Now running (on the right, Ctrl+J) has a new **Bob's thinking** section, folded to one line. Turn on **Show here** and Bob's thinking, moots and every step show there, live, the same as the pop-out window, with **Follow along** and **Clear** underneath and **Pop out** for the small window on top as well. Drag the bottom edge of the box to make it taller. Off unless you turn it on, and remembered in that window of Bob. With it on, the **💭 Bob's thinking** button at the top of the chat says *In Now running* and takes you to the section instead of opening a window.
- **It still costs nothing when you're not looking.** Bob passes his thinking along only while Show here is on, Now running is open and his window is in view. Hide the panel and it stops, the same as closing the window.
- **Put the sections in any order.** Every section in Now running (Tasks, Bob-Net, Downloads, Memory, Bob's thinking) has a ⋮⋮ grip at the left of its heading. Drag it up or down, or click it for **Move up** and **Move down** buttons; with the grip focused, the arrow keys move it too, and a screen reader hears where it landed. Bob remembers the order in that window.
- Works the same in Bob's own window and in a browser, on Windows, Mac and Linux. On a narrow screen or a phone's browser, Now running slides over the chat and the section works there too. High Contrast themes get system colours for the grip, the drop mark and the thinking box; the little flash that points at the section is off with Animations off.
- Help: the "Bob's thinking" page grew two parts, *Keep it in Now running instead* and *Put the sections in any order*. `test/run-mind-test.js` has 15 new checks; the drawing moved to `public/mind-view.js`, shared by the window and the panel, and the order helpers live in `public/now-sections.js`.
- Phone (Bob for Android): nothing changes; the phone app has no Now running panel.

## 1.5.137

**The whole brain list.** The Brain catalogue now offers every brain worth having, sorted by job and family as before, with 18 new ones: NVIDIA's Nemotron 3.5 Bolt and Lightning, IBM's Granite 4.1, Mistral's Ministral 3 and Devstral Small 2, Google's Gemma 4 12B and 31B, Z.ai's GLM-4.7-Flash, Poolside's Laguna XS 2.1, Qwen3.5 0.8B, Xiaomi's MiMo 9B, and three more on the naughty list. New ones aren't recommended until they've been tried on real hardware.

- **New** now means released lately: one of the five newest releases in its family (under a year old). Every brain's **i** says the day it came out.
- **Dated** marks a brain newer ones do better. Nothing is taken off the list.
- A brain too big for your replicant matrix and for every Bob on your Bob-Net moves to **Rented brains**, with a line saying where it went. If another of your Bobs can run it, it stays and says which one.
- **Rented brains** can now pick from Bob's list, including the really big brains (DeepSeek, GLM-5, Kimi, Mistral Large and more). Bob fills in the model and card size, or finds the brain on a pay-per-answer service's own list. He never picks more than one card by himself.
- **Let Bob fetch his newest brain list** (Settings, Going online; off unless you turn it on): once a day Bob reads his list from GitHub, so brains that come out between versions show up. Only fully pinned lists are used, nothing is removed, and nothing about you is sent (GitHub sees the request, like any web page).
- Models Bob downloaded himself no longer say "(downloaded by Bob)".
- Help: new FAQs on New and Dated, big brains in Rented brains, and the newest brain list.
- Phone (Bob for Android): nothing changes.

## 1.5.136

Themes named after worlds, Moondust as the starting theme, and no more Match system.

- **Moondust is the default.** A fresh Bob starts in quiet grey with no colour cast (the theme that was called Slate). Bob's Inn is still there under **Bob** for anyone who likes the tavern.
- **Match system is gone.** It only ever showed the green theme and followed the wrong setting on some systems. If you were on it you land on Moondust; pick anything else on the Style page.
- **Worlds and places.** The themes from the MouseHole app are renamed, same colours: Mousehole is **Otterbend**, Mousehole Light is **Homestead**, Midnight is **Nightside**, Slate is **Moondust** and Paper is **Sandbar**. The two website blueprints are **Drydock** and **Drydock Night**. Your saved theme keeps working under its new name, on the PC and on the phone's view of it.
- **Four new themes:** **Rivercoil** (steel blue-green with a river-blue accent), **Emberfall** (charcoal and ember orange), **Hullplate** (gunmetal, tan panels and amber lights) and **Longthaw** (a pale frost-blue light theme). All four read at WCAG AA or better on every surface.
- **High Contrast** and **High Contrast Light** are exactly as they were, now under their own **High contrast** heading.
- Help: the Style page entry lists the groups. New `test/run-themes-test.js` (41 checks): the names, the default, the old-name migration on the page and in saved settings, and a contrast check for every theme.
- Phone (Bob for Android): the phone keeps its own three looks (Bob's Inn, Light, Follow the phone); nothing changes there.
- **Less cat talk** (issue #33). Bob mentions Patches less, weaves him in instead of signing off with him, and no longer ends replies with a cat face. Bob worked this one out himself.

## 1.5.135

Brains of your own: add a brain file you already have, and Bob runs it like any other.

- **➕ Your own brains** (at the end of the Well behaved list in the Brain catalogue): add a brain file (.gguf) already on your replicant matrix that Bob's list doesn't have. Press **Add a brain from a file**, pick the file, name it, add its picture reader if it has one, and it joins the Brain catalogue, Equip Bob and the brain menus like any other brain, shown as **(your own file)**. No file window on your desktop (some Linux desktops have none)? Press **or type its path** and paste the file's full path. Adding and removing only work on that replicant matrix itself, not from the phone.
- Bob runs it on his built-in engine from where it is. He never moves, copies or deletes it, and never recommends it over the brains he knows.
- **Remove from Bob's list** only makes him forget it: the file stays where it is, and any slot wearing it is emptied. If the file goes missing, its row says **File not found**.
- Help: the catalogue page, an FAQ and a glossary entry "Your own brain". New `test/run-own-models-test.js`.
- Phone (Bob for Android): nothing changes.

## 1.5.134

Bob's icon follows his look, and he lives in the tray, without a trip to Settings first.

- **Use Bob's look as his icon is on unless you turn it off.** It has been in Bob since 1.5.94, but off by default, so saving a new look changed nothing on the taskbar. Now the taskbar (Dock on a Mac), tray and window icon redraw the moment a look is saved, in Style or from Equip Bob's **Change his look**, including a look built from parts on the character screen. Off: the usual Bob icon.
- **Keep Bob in the tray is on unless you turn it off.** Closing or minimising his window tucks him into the tray by the clock (the menu bar on a Mac; the desktop's tray on Linux) and he keeps running. The first time, he says where he went and how to close him fully: right-click his tray icon and pick **Quit Bob (closes him fully)**. Both switches are where they were: Settings, Bob himself and Settings, How Bob works.
- **What can't follow, said plainly.** A shortcut pinned to the Windows taskbar or Start menu keeps the shortcut's own icon, even while Bob is open; unpin and pin him again from the running button, or look at the tray and the window corner. The phone app's icon stays the same: Android doesn't let an app redraw its icon. On Wayland desktops the window icon comes from the .desktop file; the tray icon still follows.
- **Help:** Bob in the tray and the FAQ "Can Bob's icon show the look I picked?" rewritten for the new defaults; glossary entry *Taskbar icon*; settings inventory rows updated.
- `test/run-tray-test.js`: both switches start on, only `false` turns one off, a parts-built look becomes an icon, the Help and inventory say so (36 checks).

## 1.5.133

A Community side in the Brain catalogue, a red devil of Bob's own, AMD graphics seen properly, fixes for shared-memory machines and brains that wouldn't load, and no more jobs lost between your Bobs.

**Thank you** to **CitizenFog**, who spotted that Bob wasn't detecting their AMD graphics and wrote the fix together with Bob, and to **Rook**, who sent the gaming-card fix for built-in graphics with six checks of their own.

### New
- **🤝 Community.** The catalogue's toggle has three sides now: Well behaved, Community and the Naughty list. Community shows builds other people made from stock brains that still behave (fine-tunes, distillations, repacks); they're in the Well behaved list too, with a **Community** tag, and one can be ★ Recommended like any other brain once it has been tried on a replicant matrix. Two to start: **Qwen3.6 35B-A3B Opus Reasoning Distilled** (a popular Qwen3.6 fine-tune on Hugging Face) and **Qwen3.6 35B-A3B Distilled from Qwen 3.8 27B**. Both pinned to exact files and marked New until tried.
- **Tell them apart at a glance.** Community rows have a solid stripe down their left edge and a light green tint; naughty-list rows have a dashed stripe and a light red tint. The stripes differ in shape as well as colour, so they still read right if colours are hard to tell apart.
- **Bob's own red devil.** The naughty list is marked with a small red devil with orange horns that Bob draws himself, so it looks the same on every computer (phone emoji devils come out purple on some screens).
- **The quiet pick.** Bob never puts a ★ on an uncensored brain. On the naughty side only, a red devil on its own where the star would be is his quiet pick: the one that does that job well on your replicant matrix. Nothing is quietly picked until a brain has been tried.
- **Credit on the tag.** Community and naughty-list tags carry the maker's name ("Community · hesamation"); for a team, the team's name, with the members shown when you hover, tap or tab to the tag.
- **AMD and Intel graphics are seen** (by CitizenFog and Bob, issue #25). Check this replicant matrix now reads the list of graphics Windows itself keeps, says "AMD graphics found" or "Intel graphics found", and only asks NVIDIA's tool, and only shows the NVIDIA driver and Sysmem Fallback tips, when there really is an NVIDIA card. A laptop with AMD graphics and an NVIDIA card gets both: the AMD line and the NVIDIA tips.

### Fixed
- **Built-in graphics with memory set aside (a Legion Go on 8 GB, for example).** Bob counted only the RAM Windows could see, so with 8 GB set aside for graphics he refused every brain. The set-aside counts as room now, and a brain that fits in it loads even when Windows itself has little RAM free. On Auto, Bob stays careful as before.
- **Borrow when my own brain won't fit.** With "Borrow brains from my other Bobs" on, a brain that's too big for this replicant matrix's shared memory goes to a paired Bob first; Bob only says no when none of them is free.
- **Gaming on built-in graphics** (by Rook). With no graphics card reading, the Gaming brain stays on the processor instead of trying to borrow a card that isn't there.
- **Brains that fell over on the second and third load.** The small chat brain that keeps you company during a long job could sit on the graphics card with a very long chat memory, then the job's brain loaded on top of it and the engine crashed. Bob now keeps room on the card for the job's brain, counts the chat memory in full, and lets the small brain off the card before trying a load again.
- **When a load still fails,** the engine's whole output is saved to `llama-server-load-failed.txt` in Bob's data folder (and goes into a help bundle), and Bob's log says where each second brain went (card or processor) and when an idle brain was let go.
- **Nothing goes missing between your Bobs.** A song asked for on one Bob and made on another could vanish without a word. Now:
  - A Bob only says he can make songs when his music models are really downloaded, so a song job isn't sent to a Bob who can't make it.
  - A song job from another Bob isn't held for a plan card any more. On the Bob doing the work, that made the brain talk about the song and never make it.
  - If he can't (his Download card can't be pressed from the other Bob), the chat says so in plain words: "Desk can't make this one yet: he needs the music models (about N GB) set up first."
  - A picture, clip, song or sound job that ends with no file is marked failed with Try again, not done, whatever his words say.
  - Bringing the file back is tried three times, and the other Bob keeps it ready for 6 hours (was 15 minutes). If it still doesn't come across, the chat says where it is.
  - The phone's Chest also lists things a Bob made after his save folder was moved.
- **"Show the naughty list" switched off** still said "Naughty list: on" on the How Bob works summary until a reload. Every switch there updates its summary at once now.
- **"(downloaded by Bob)" on a file you placed yourself.** A model you pointed Bob at by hand, or one he found in another app's folder, now says **(your own file)**. Only files in Bob's own models folder say "downloaded by Bob".

### Also
- Help: the catalogue page, an FAQ "What's a community build?", the stripes, the quiet pick in the naughty-list FAQ and glossary, "your own file", which graphics Check this replicant matrix found, and an FAQ "Where is the song (or picture) my other Bob made?".
- New checks in `test/run-catalogue-test.js`, `run-integrated-gpu-test.js`, `run-beside-test.js`, `run-handoff-test.js`, `run-idle-unload-test.js`, `run-tuning-test.js`, `run-own-brain-test.js`, `run-share-jobs-test.js` (9), `run-plan-test.js` and `run-gaming-card-test.js` (Rook's six).
- Phone (Bob for Android): a diagram the phone can't fetch says which Bob has it (no more "your other replicant matrix"), and one it can't draw shows the diagram's text, with Save to this phone.

## 1.5.132

The naughty list: uncensored community remixes in the Brain catalogue, behind a switch that is off.

- **😈 The naughty list.** The Brain catalogue has a toggle at the top, **😇 Well behaved / 😈 Naughty list**. Turn on **Show the naughty list** (there, or in Settings, How Bob works, Brains) and the 😈 side lists six remixes other people made from Qwen and Gemma brains with the refusals cut out ("heretic" or "abliterated" builds): Qwen3.6 35B-A3B Heretic, Qwen3.6 27B Heretic, Qwen 3.8 27B Heretic, Gemma 4 26B Heretic, Gemma 4 31B Heretic and Qwen3.5 9B Heretic. Each one's **i** says who remixed it and from what, every file is pinned to an exact Hugging Face commit, and they all see pictures. They are not Alibaba's or Google's releases, they answer without refusing, and they can be a little rougher than the originals, so Bob never recommends one. With the switch off (the default) they are listed nowhere.
- **Community marker.** Catalogue entries can now say who made a build and from what, as an explicit marker rather than a guess from the name; a well-behaved community build gets a plain **Community** tag.
- Help: the catalogue page, the Settings row, an FAQ "What's the naughty list?" and glossary lines for Naughty list, Abliterated (heretic) and Community build. 23 new checks in `test/run-catalogue-test.js`.
- Phone (Bob for Android): nothing changes; the phone uses whatever brain the PC's Bob has equipped.

## 1.5.131

One wording fix in Equip Bob and the brain menus, so Bob stops looking like he claims other people's models.

- **"(downloaded by Bob)" instead of "(Bob's own engine)".** A model Bob fetched himself from the Brain catalogue (a file in his models folder, run on his built-in engine) used to show "(Bob's own engine)" after its name in Equip Bob and Settings, Brains. On a list of stock Qwens and Gemmas that read as "Bob's own brain". The bracket now says where the file came from, which is all it ever meant. Models that come through Ollama still show their Ollama name, like "(qwen3:4b)".
- **"Bob's own brain" is reserved.** The words only appear on a catalogue entry marked `madeByBob: true`, which no shipped model has. There is no name match: a model called anything like Bob is still a stock model until the catalogue says otherwise.
- **Now running** says "(Bob's downloaded copy)" rather than "(Bob's own copy)" when a brain picked by its Ollama name runs from Bob's own download instead of Ollama's file, and the engine log says the same.
- **Help, FAQ:** "What does 'downloaded by Bob' mean next to a model?"
- New `test/run-own-brain-test.js` (20 checks): the label words, the explicit marker, no catalogue model marked or Bob-named, the Help entry.

## 1.5.130

Two Adventure fixes from the community. Thank you to miargue and bfs2021.

- **End game and Pause** now put Bob back to idle, the same state a finished chat message reaches, so the window title goes back to "Bob" straight away and a reload shows it too. Before, the game master's brain left Bob "thinking" until the next chat message. (miargue, #13, fixes #7.)
- Bob is only put back to idle when nothing else is running: no chat reply, no brain loading, no job waiting in line. The rule from 1.5.120 still holds: ending a game doesn't wake the quick chat brain.
- **The Met tab keeps the scene.** A character named in the opening reply, or in the reply that starts a new scene, used to land on the Met tab with no scene or the old scene's title. Met entries are now written after the scene is on the books. (bfs2021, #11.)
- New checks in `test/run-adventure-test.js`: End and Pause go back to idle, End does not reset while a reply, a wake or a waiting job is still going, and Met entries carry their scene.

## 1.5.129

A test fix only, so the 1.5.128 release could be built (its Windows build failed on one check).

- The Rented brains key-override check compared the PATH variable by exact name; Windows spells it `Path` on some machines (GitHub's build runners among them), so the check failed there and no 1.5.128 release was made. The check now compares the variable count and the override itself. Nothing in Bob changed; 1.5.128's fixes are all in this release.

## 1.5.128

Five small fixes to Rented brains (1.5.127), from the first live checks.

- **Not now** on the Hire it card now runs your request here, on this replicant matrix, and says "Not hired. Doing it here instead." Before, the message got no reply at all.
- **The Hire it button is greyed out** while hiring is blocked (a service switched off, or a limit still at 0); the line above the buttons says what to fix. The phone already hid it.
- **The 🏗 Rented brain switch appears straight away** when a rental goes into the empty slot from Add a rental, and goes when the rental in the slot is removed. Before, it needed a page reload.
- **Add this rental says why** when the form isn't complete: "Type the model's name first, as the service lists it." (and the address or key-variable line for Another service), instead of doing nothing.
- For testers: setting the environment variable `BOB_RENT_KEYS=off` makes Bob see no rented-brain key at all, and `BOB_RENT_KEYS=env` makes him read only the process's own variables (no Windows user variables, no `~/.config/bob/env`). It's a tester's switch, not a setting, so a test Bob on a computer that has a real key stops reading "Key found".
- From the PC run: the greyed Hire it button looks greyed, the missing-field line by Add this rental is red, a reload after Not now shows your message once (the re-run adds only a hidden note), and the key-override check sets any real key variables aside while it runs.

## 1.5.127

Rented brains: for a job too big for the card in this replicant matrix, Bob can hire a brain from an online service for the length of the job, on your own account, with your say-so every time. Everything about it is off until you turn it on, and every spending limit starts at $0.

- **A "Rented brain" slot on Equip Bob** (left column, 🏗). Empty, Bob runs on this replicant matrix as before. Put a rental in it and the chat page grows a "🏗 Rented brain" switch next to Web search. Bob also offers a rental himself when a request is too long for the brain's memory, or when the brain decides the job needs a bigger one (a new `hire_brain` tool, only when a rental is in the slot). Either way the first thing you see is the **Hire it** card: which service, which model, the price, roughly what this job will cost, how long the machine takes to start, and exactly what leaves this replicant matrix. Nothing is hired until you press it. "Not now" runs the job here.
- **Three kinds of service, all in one drop.** Pay per answer (OpenRouter, Together AI, Lambda, or Another service with an address you type); RunPod serverless (billed by the second, switches itself off); a whole machine by the minute (RunPod, Vast.ai, Lambda). A machine runs vLLM for a model at full size or llama.cpp for a GGUF file (`hf:Owner/Repo/file.gguf`), so Bob's own models can be hired too. The tools still run here: the rented brain only thinks.
- **Your keys never go into Bob.** Each service reads its key from an environment variable (`OPENROUTER_API_KEY`, `TOGETHER_API_KEY`, `LAMBDA_API_KEY`, `RUNPOD_API_KEY`, `VAST_API_KEY`), or on a Mac or Linux from `~/.config/bob/env`. Settings shows "key found" or "no key yet", never the key. Keys are scrubbed out of error lines, kept out of the log, Bob-Net, exports and Settings.
- **Spending limits, all starting at 0:** the most Bob may spend this month, the most one job may cost, and the longest a hired machine may run. A rental can't start until each limit it uses is set. Every hired machine is started with a self-destruct timer (the longest run), so it stops itself even if this computer is switched off. Bob also stops it when the job is done, when a cap is reached, or when you press "Stop everything now", and warns five minutes before the timer. Machines Bob started and nobody stopped (named `bob-rental-…`) are listed with a Stop button on every start.
- **Several cards on one machine, as an option behind a big warning.** Add a rental for a machine by the minute and "Cards on the machine" can be 2, 4 or 8, for a model that really doesn't fit one card (the giant mixture-of-experts models: an 8 × 141 GB machine holds the 2.4-trillion Qwen at Q4). Picking more than 1 brings up a large warning with the hourly and daily price; the count snaps back to 1 unless "I understand" is pressed. The Hire it card warns again, the price and the estimate are for the whole machine, vLLM is told to split the model over the cards, and the spending limits and the self-destruct timer apply as before. Serverless stays at one card.
- **Settings, Show advanced settings, Online services, Rented brains:** the limits; a switch per service ("Let Bob hire from …", with a warning card the first time saying what will leave this replicant matrix); your rentals (Use this one, Take it off, Check the price, Remove); Add a rental; Machines running; Recent spending (what the service counted, or Bob's estimate marked as such). Prices on screen are estimates; the service's billing page is the real bill.
- **Privacy wording, everywhere:** the README's first line now reads "Nothing goes online unless you turn it on"; PRIVACY.md, the guide, Help (Settings, Privacy, FAQ, glossary) and the phone's Help say the same and list rented brains with Web search, Cloud helpers and Bob-Net as the things that can send a chat out.
- **Phone:** the Hire it card and the rented-brain notes show in the phone chat; the switch and Settings are on the computer.
- Tests: `test/run-rental-test.js` (settings cleaning, limits at 0 block everything, keys only from the environment and never in a view or error, the card before any spend, the self-destruct timer, the OpenAI-style stream read like llama-server's, a machine started under Bob's name and stopped after the job, leftovers found by name only, Help and glossary).
- **Not yet tried against the real services:** the RunPod pod and serverless calls, Vast.ai and Lambda machine starts, and the proxy addresses they hand back. Pay per answer is the same request shape as the cloud helpers. Please try a cheap pay-per-answer rental first.

## 1.5.126

Handhelds and laptops with built-in graphics: Bob now reads how their one pool of memory is really split, and never loads a brain that would leave Windows short.

- **The memory set aside for graphics is read, not guessed.** A Legion Go showed RAM only and no graphics memory. The BIOS (or the maker's app, such as Legion Space or Armoury Crate) keeps part of the memory for the graphics alone (Auto, which is small, or 4 or 8 GB); Windows never sees that part, so a 16 GB Go set to 8 GB read as 7.7 GB. Bob now reads the set-aside from Windows's display driver entry on every start, and the installed memory from the memory sticks themselves. On Linux the set-aside comes from the graphics driver (amdgpu).
- **Graphics memory for picking models** is the set-aside plus about half of what Windows can see, and the borrow never eats into the last 4 GB Windows keeps for itself. A 16 GB Go set to 8 GB counts 11 GB; on Auto (the recommended setting) it stays at the old half-of-visible figure. Nothing that fitted before stops fitting.
- **What you see:** the spec line under the replicant matrix's name reads "Ryzen Z1 Extreme · Radeon built-in · 16 GB memory (8 GB set aside for graphics)" or "(shared with graphics as needed)"; Get models says "Memory: 16 GB shared, 8 GB set aside for graphics". `/api/hardware` carries `installedRamGB`, `reservedGraphicsGB` and `visibleRamGB`.
- **A memory guard on shared-memory machines.** Before a brain loads, Bob checks the room (free RAM, plus whatever the load swaps out, minus 4 GB for Windows). Too tight: the chat memory is shortened first (halved, never below 8K). Still too tight: the brain isn't loaded and Bob says so in chat ("That brain needs about 9 GB and only about 6 GB is free once Windows keeps its share...") instead of risking an out-of-memory crash. Only with built-in graphics; a real graphics card is untouched.
- Help: the built-in graphics FAQ explains the set-aside, glossary gets "Set aside for graphics". Tests: `test/run-integrated-gpu-test.js` (8 GB, 4 GB and Auto fixtures, Windows and Linux readings, the guard; NVIDIA, Mac and desktop chips unchanged).
- The README's download row now names the 1.5.126 files, and `installer/check-release.js` fails when the row doesn't match the version (1.5.125's row still named 1.5.124).
- Not yet measured on a real Go on Auto: the fixture uses a 512 MB set-aside; the Legion Go's own numbers go in when they're in.

## 1.5.125

A chest for everything Bob makes, and Bob's home folder chosen at install instead of by editing a file.

- **🧰 Chest** on Equip Bob, under Bob on the paper doll, with a number for how many things are in it. Press it and the Inventory column becomes the **Chest**: everything Bob has made or saved, newest first, as little pictures with their names and when he made them. Pictures and clips show as themselves; songs, documents and other files as their icon with the title. Click one (or Tab to it and press Enter; every tile tells a screen reader the name, kind and time) to open it beside the chat. **New things are saved in** shows the folder new pictures, clips, songs and sounds go to, with **Change folder…** (the same picker as Settings, Where Bob saves things), **Use Bob's own folder** and **Show in folder**. **Open Made by Bob** for everything with filters and search.
- **Thumbnails, made once and kept.** Pictures and clips in the chest and in Made by Bob are small copies Bob's window makes with its own image code (clips through FFmpeg where it's installed), kept in `inn\bob\thumbs`, so a long list opens in a blink and nothing is loaded into a brain for it. Where none can be made, the picture itself shows, shrunk, or the kind's icon.
- **Bob's home folder is chosen at install.** The Windows install window asks "Where should Bob keep his things?" first, suggesting a `Bob` folder in your user folder, with Browse to any drive and the free space shown; Bob.exe, Bob.app and the AppImage ask the same the first time they open, and the first-run screen has the row at the top (**I keep my things in**) before the big downloads. AppData, Temp, the Caches folder and other temporary places are refused, so a "clear temporary files" button can never take 10 to 60 GB of models. A cloud-synced folder (OneDrive, Dropbox, Google Drive, iCloud and the like) is allowed but always recommended against, clearly, wherever the folder is picked or shown: every model would be uploaded, and a sync can break a model while Bob uses it. Older Bobs that kept everything in `%LOCALAPPDATA%\Bob` carry on from there.
- **Settings, Bob's home folder** (Everyday): the folder, how much the models take, a red line if it is somewhere a clean-up tool empties, and **Browse…** / **Move here…** with one **Yes, move everything**. Bob closes, copies everything across (one rename on the same drive), and opens again from the new folder; the old one is removed only once every file is over.
- README, user guide and Help: no more `home.json` snippet; the install step and the Settings row describe it. Help entries for the chest and Bob's home folder, glossary lines (Chest, Home, Thumbnail), FAQ "Where are Bob's models kept, and can a disk clean-up delete them?". New test `test/run-chest-test.js`.
- **Phone (Bob for Android):** menu, **Chest**: the same list from your PC's Bob as thumbnails with names; tap one to see it, with Save to this phone. Nothing is kept on the phone unless you save it.

## 1.5.124

The bestiary: a Characters page in 🎲 Adventure, monster bodies on the character screen, and a dozen enemies the game master uses as written.

- **📖 Characters** (on the Adventure start card and at the table). Four tabs. **You**: your saved heroes, with **➕ New character**, **Edit** (the character screen behind each) and **Delete this character** (asks in the page). **Party**: who's at the table now, or was last game, with hearts, kit and spells. **Met**: everyone and everything the game master names in a scene, drawn by Bob the moment they're named (people from their name, creatures by their kind, the same name always the same face); between games it holds every meeting across your campaigns, with **Forget** (which asks first). **Enemies**: the usual dozen (Goblin, Skeleton, Wolf, Bandit, Giant rat, Giant spider, Orc, Cultist, Slime, Ghost, Troll, Dragon), each with its hearts, how it attacks, the thing to know and a line from Bob.
- **The game master knows the dozen.** Their sheets are in his rules, so a goblin has two hearts in every game and a dragon six; anything else he invents, and a boss simply has more. "Here" now lists creatures and enemies as well as people, which is how Met fills itself.
- **Monster bodies on the character screen:** Big humanoid (takes armour, weapon and shield), Beast, Crawler and Blob, each with a Face (ears, horns, drips, tusks) and a **Hide** colour (Moss, Stone, Mud, Blood, Night, Bone, Frost, Ember). Bob's own screen on Style keeps to Man, Robot and Alien.
- The preview on the character screen stops repainting when the page is hidden or it's scrolled out of view.
- Help: the Adventure entry (Characters page, tab names word for word), glossary line (Bestiary), FAQ ("How tough are the enemies in an Adventure?"). New test `test/run-bestiary-test.js`.
- **Phone (Bob for Android):** the same Characters page on the phone through your PC's Bob (You, Party, Met, Enemies; your other Bob draws each one; Forget asks first; hearts read out as a count). Nothing is saved on the phone.

## 1.5.123

Two more pieces of Bob-Net: who's at the table, and Bobs that introduce each other.

- **Bob-Net in Now running.** Once you have a Bob under My other Bobs (or Lend my brain or Take jobs on), the right pane gets a **Bob-Net** section: one line for this Bob and one for each of your other Bobs, with what each is doing for the others right now (thinking a reply for me, making a picture for me, ready, gaming so not lending, busy, not reachable, door shut over there), the jobs he takes, when he last thought for this Bob, and whether he passes Bob-Net along. The dot by each name only repeats the words. It asks each Bob "are you there?" at most every half minute while the pane is open, and nothing while it's hidden or behind a game. Before you have any Bobs, the section isn't there.
- **Pass my Bob-Net along** (Settings, Show advanced settings, Bob-Net, What they share; off). Your Bobs with it on introduce each other: a Bob paired with two of them tells each the other's name and Tailscale address, and the two pair with each other by themselves, with no card on either side. Phone paired with the handheld, handheld with the PC: with the switch on for all three, the phone and the PC meet by themselves. Passcodes still only pass between the two Bobs being paired, after the yes the introducer vouched for, as with the card. A Bob with it off, or too old to know it (Bob for Android doesn't yet), is left alone, and the panel says so. Nothing else switches on. Checked after each pairing, after a settings change, and once an hour.
- Help: "Pass my Bob-Net along" under Settings: Bob-Net, two FAQ entries ("What is the Bob-Net list in Now running?", "Can my Bobs introduce each other?"), glossary "Introduced", and the Now running line in Finding your way around. PRIVACY.md says what an introduction carries. A new test (`test/run-bob-net-party-test.js`) walks three Bobs through an introduction over a pretend Tailscale, and checks the party reading.
- Phone (Bob for Android): the phone can be introduced once the phone app learns the `/api/bob-net/introduce` route (it only ever answers; a computer asks). Until then the PC says "can't be introduced yet" and you pair the phone by hand as before.
- Phone (Bob for Android): the Adventure character screen and an answer-only Pass my Bob-Net along switch (off; needs Lend my brain). Robot and alien swatches on the character screen have their own names (Steel, Brass; Green, Violet).

## 1.5.122

The character screen: build Bob's look from parts, and give your Adventure hero a look of their own.

- **🧍 Make your own look** (Style, under Bob's look; also **Change his look** under the doll on Equip Bob). A paper doll built from parts with a live preview that blinks as you go: Body (Man, Robot, Alien), Build (Slim, Regular, Broad), Hair style and Hair colour, Skin, Beard, Glasses, Outfit and Outfit colour, Armour (Leather, Chain mail, Plate, Robe), Weapon (Sword, Axe, Bow, Staff, Dagger, Spear, Hammer) and Shield (Round, Tall). **🎲 Surprise me**, **Start over**, **Wear this**. The result is a look like any other (it blinks, talks, glances and fits the tray icon), listed under **Your own design**, and Bob can describe it when asked what he looks like. Bob is a guy, so his own screen offers no dresses; the same parts dress anyone on the Adventure card.
- **🎲 Adventure: your character's own look.** The start card shows **Looks like** with **🧍 Change the look**, which opens the same screen with every body on it (Woman included). The look is saved with the game and drawn on the party strip; Bob's avatar is never changed by the game. Before this, the card borrowed Bob's look from Style, so playing as a woman meant turning Bob into one.
- **Saved characters.** **💾 Save this character** keeps the name, class, the one thing about them, plot armour and look in one small file beside the campaigns (up to 24); **Saved characters** on the start card picks one back, **Delete this character** removes it.
- Help: Style and Adventure entries, a glossary line (Character screen), an FAQ entry ("Can my Adventure character look different from Bob?"). A new test (`test/run-character-test.js`).
- Phone (Bob for Android): the start card's look and saved characters come through the PC's Bob; the Android side follows in its own drop.
- From the PC's live check: Change his look (Equip Bob) and Change look (Attributes) open the character screen; the preview blinks; "an orange alien"; Bob's own comment for a design of your own; an empty Name saves as Hero.

## 1.5.121

Five small games, for the days you want to play rather than work.

- **🧩 Games: small games Bob plays with you.** A new page in the menu with five games: **Twenty questions** (either way round; when it's Bob's secret the app picks it and checks your guess, so a right answer always counts), **Hangman** (a word from a shelf you pick: Animals, Food and drink, Around the house, Out of doors, Jobs people do, Things that move; seven lives; a Hint costs a life), **Word ladder** (four-letter words, one letter a step, every rung a real word from a list of about a thousand; Hint, Back a rung, or climb together turn about), **Five letters** (guess a five-letter word in six tries, letters coloured green, yellow and grey; a Hint costs a try) and **Story dice** (six picture dice come up and you tell a story a line each until every die is in; Wrap it up ends it, Bob writes the last line and a title). A scoreboard counts, per game, your wins, Bob's, shared ones and your best run.
- **The app plays, Bob talks.** The app holds the secret, checks every move, counts lives and tries and keeps the score; Bob's quick brain only asks, answers, teases and tells the story. That's why the games play well on the smallest brain, in the Gaming session (on the Gaming brain, on the processor, so the graphics card stays with your game) and on the phone. Nothing runs until you press **▶ Start**, and the brain is let go when a game ends, like after any job.
- **Settings, Show advanced settings, 🧩 Games:** Which brain plays games (Quick brain, or Main Brain for wittier lines) and How often Bob chips in (After every move, Now and then, Only at the end). Neither is a switch; both just have a default.
- Help: "Games: small games I play with you", "Settings: Games", three FAQ entries, glossary lines for Twenty questions, Word ladder, Five letters, Story dice and Shelf. The phone app gets the same games through the Bob on your PC. A new test (`test/run-games-test.js`) plays every game through with a stand-in brain.
- Phone (Bob for Android): the same games on the phone through your PC's Bob (Games in the phone's menu); the phone brain is never used.

## 1.5.120

- **🎲 Adventure: three fixes from the first live game.** A Short game can no longer end early: a scene only counts as new when it has a new title and everyone at the table has had a turn since the last one started. The game master stays the narrator (second person to the players, third person for everyone else) instead of slipping into a character's voice. And the game master thinks no more before each turn: on a 16 GB card the first turn took six minutes with thinking on, and the story reads no better for it. The start card says the first turn takes longest.
- Phone (Bob for Android): the same table on the phone through your PC's Bob (Adventure in the phone's menu; the phone brain is too small to be game master, and says so).
- Two more from the first live game: the game master's hidden line still reads when a brain drops its closing `>>>` or adds a stray brace, and Pause or End no longer wake the everyday brain straight back (a paused game is idle time).

## 1.5.119

- **🎲 Adventure: Bob runs a tabletop game.** A new page in the menu. Bob is the game master; the party is you plus your other Bobs (a Bob on your Bob-Net plays himself over there; a copy of Bob is played by the game master brain). Nothing runs until you press **Start a new game**, and the game master brain is let go on Pause or End. One start card asks for the setting, your character, who plays, how long, and plot armour for every character. Everyone has a turn in order. On your turn you get action cards, only the ones that fit, some with a second card (the attacks your kit allows, your spells, your items, who's here, the ways out) and a Back button, then an optional line of flair. The app rolls the dice for every action. Loose rules on purpose: four stats, hearts not hit points, no inventory weight, no spell slots, no initiative; long travel is one montage line. Campaigns are saved in their own files and continue from the start card. Not in the Gaming session. Help: Adventure: I run a tabletop game.
- **Settings, Show advanced settings, 🎲 Adventure:** Which brain is the game master (Biggest brain) and Who plays the other Bobs (Their own Bob when reachable). Neither is a switch; both just have a default.
- Pause and End take the game master's brain off the graphics card when the game loaded it (one that was there before the game is left to its usual idle timer). The release check now refuses leftover merge files (*.orig, *.rej).

## 1.5.118

One new button, for the day Bob isn't working and nobody can see why.

- **Save a help bundle** (Settings, This replicant matrix and updates). One click packs everything a helper needs into one zip: a HANDOFF.md written for an AI agent to read first (it names Bob's version, links the public code at github.com/MouseWurX/Bob and says what to check in which order), every error and the last 3,000 lines of Bob's logbook, his settings without their secrets, the machine's facts (processor, memory, graphics card, free disk, whether each engine starts, which brain is in each slot), unfinished or failed jobs, and the last three chats as a plain readout. You pick the folder, the zip is shown there, and nothing is sent anywhere.
- **Two ways it is written.** If Bob's chat brain is already loaded and idle, Bob reads the facts himself and adds a short note on what he thinks is wrong and what to try first. If the brain isn't there (the engine won't start, nothing is downloaded, Bob is busy, or it's a Gaming session), the bundle is put together without any brain and tells the helper to assume the worst. Bob never loads a brain for this, so the button works on a broken Bob.
- **Scrubbed first.** The owner's name and user name, the machine's name, the home folder, every passcode, API key and bot token, and Tailscale addresses are taken out of every file before it is written; the settings file drops any value that looks like a secret.
- **From a phone or another device**, the same zip downloads to that device instead (`GET /api/help-bundle`, for the Bob app on Android).
- Help: "Save a help bundle", a last row in "When something goes wrong", glossary entries Help bundle and Handoff file, and the FAQ "How do I get help with my Bob?". A new test (`test/run-help-bundle-test.js`) covers the scrubbing, both ways of writing the handoff, and the zip.

## 1.5.117

A second pass over the Settings layout. Nothing is renamed or switched; things sit where you look for them.

- **Check for updates without scrolling.** This replicant matrix and updates is now the first thing in Settings, closed. Its line shows your version and a Check for updates button that works right there. When a new Bob is downloaded and checked, the line reads "Bob 1.5.x is ready · Restart Bob now".
- **Shorter panels.** In Hands, Add a connected app and Paste a setup from another app sit under More once the Hand is on; Add a recipe sits under More once Run programs is on; Check the sandbox, Run the self-test and Quarantine are together under Checks. In Brains, the three long tables (Session brains, How much each session keeps in mind, How much each brain keeps in mind) fold closed with what's set now on their line. In Bob-Net, the sharing switches' explanations are behind ⓘ; the sentence about what leaves your replicant matrix stays written out.
- **Read-only projects without a file.** Under the Read-only projects stay read-only limit there is now a list with Remove, and a Browse… / Add row, like Projects. config.json is no longer mentioned on screen.
- **Make a new passcode** is the button's name in both states.
- **Two labelled rows** at the top of the page: Get models (Equip Bob … On this replicant matrix) and Set up (Style · Settings).
- **How Bob works** shows its three subheadings (How he works, Starting and closing, Going online) as headings.
- **Where Bob saves things** sits under Projects, since both are folders.
- **Phone app: Save to this phone streams the file** from the other Bob straight into the phone's media library instead of holding it in memory (up to 200 MB).

## 1.5.116

A code review of the whole app, with its fixes. Nothing new to switch on; everything here is Bob being safer and sturdier.

- **Settings survive a crash or power cut.** Settings, the task queue, chat sessions, saved recipes, memory banks and the other files Bob keeps are now written to a side file first and swapped in one step. A crash mid-write can no longer leave a half file that quietly resets your settings or stops Bob starting.
- **Web pages: every redirect is checked.** With "Let Bob search the web" on, a page that redirected Bob to an address on the home network (or his own door) could be read. Each hop is now checked the same way as the first address, redirects stop after five, and a page is read up to 2 MB.
- **Let my other replicant matrices in: Tailscale addresses only, also at start-up.** When the door was already open when Bob started, he listened on every network address of the replicant matrix. He now listens on 127.0.0.1 and the Tailscale addresses only, the same as when the door is opened while he runs.
- **Program and script files are refused on every platform.** Bob doesn't write or edit runnable files outside a project; the list now covers Mac and Linux kinds too (.sh, .py, .command, .desktop and friends), not only Windows ones.
- **Big files are refused plainly.** Reading a file over 20 MB as text now gets a short sentence instead of Bob holding the whole file in memory.
- **Folder rules follow links.** A shortcut, symlink or junction inside an allowed folder that points outside it no longer counts as inside.
- **Music on Linux.** Setting up the music engine unpacked its download with a tool that reads zips on Windows and Mac but not on Linux, so it failed there (the Raspberry Pi too). Bob now unpacks it himself.
- **A leftover brain process is checked before it is stopped.** After a crash and a reboot, the number Bob remembered for his brain server could belong to another program. He now checks it really is llama-server first.
- **Replacing the engine can't leave you without one.** The new llama.cpp build downloads fully first and only then takes the bundled one's place.
- **Sturdier replies.** One odd line from the brain server no longer loses the whole reply; a music job with an odd result, or voice input with no Ollama, gets a plain sentence instead of an error code.
- **An OK card that times out is cleared properly**, so the quick "ok" and the check-in count are right afterwards.
- **He comments once when you change his look** is now off unless you turn it on (Get models, Equip Bob, Attributes), like every other extra.
- **A new test** covers all of the above (`test/run-review-fixes-test.js`).

## 1.5.115

- **Phone app: Save to this phone works for every type.** Under a picture, clip, song or diagram a Bob on your Bob-Net made, **Save to this phone as** now has the original type as a button too (for example "PNG (original)"), so you can keep the file as it is. It goes into your Bob folders on the phone, with a short note when it's saved. A copy stays on that replicant matrix too.
- **Phone app: one 🌐 Bob-Net page.** Your other Bobs, adding a Bob and lending your brain now sit together on one page with the same name as the Bob-Net panel on your replicant matrix, in three sections: My other Bobs, Add a Bob and Lend my brain.

## 1.5.114

- **Credits.** The README and a new Help page, Credits (on the desktop and in the phone app), thank Dennis E. Taylor, whose books inspired Bob, and say plainly that Bob is an independent fan project with no connection to the author or his publishers, and that the rights in the books stay theirs. TRADEMARKS.md says the same.

## 1.5.113

- **Bob says plainly when another program holds the graphics card.** When a brain or picture takes too long to load, Bob looks at the card once. If another program has filled it, he says so with a ⚠ line, naming the biggest programs when the card tells him (only programs the card lists as using it, never Windows itself, overlays or browsers; sizes only when the figures add up). Then he stops: one try instead of three five-minute ones, no other brain, and no "Waking up…" reload. Jobs waiting in line get the same answer straight away, and a chat that has already seen the line gets a short pointer to it instead of a repeat. He looks again before the next job, at most every 30 seconds, and carries on as normal once the card is free. Chats on the processor in Gaming keep going.

## 1.5.112

- **Every waiting chat gets its ⏳ line.** A message sent in the second before a picture started (while Bob was freeing the graphics card) now gets the line too, as soon as the painting begins.

## 1.5.111

- **The ⏳ line goes away when the wait is over.** Once Bob starts on the waiting message (or it is stopped in Tasks), its ⏳ line leaves the chat, so it no longer sits frozen above the answer.

## 1.5.110

- **The ⏳ line keeps up.** A chat waiting behind a picture or clip now sees the line move on from "loading the picture engine" to "making a picture, step 3 of 20", updated in place. Telegram and the phone app still show it once.

## 1.5.109

- **Picture and clip progress counts the real steps only.** While the picture engine loads, it prints counters of its own (for example 82/82), and those no longer show on the bar or in the ⏳ line. Until the first real step, Bob says he is loading the picture engine.

## 1.5.108

- Under the hood: shared helpers live in one place instead of being copied into many files.

## 1.5.107

### Tidy-up
- The README now covers Linux, Raspberry Pi and the Android app, and says each install step once.
- The web reader and the security Hand now share one check for home-network addresses, so the web reader also refuses link-local IPv6 and a few more home-network names.
- On Mac and Linux, stopping an office job also stops the LibreOffice it started.
- Docs use "replicant matrix" for the test machine, and the public privacy check is stronger.
- Nothing new is switched on.

## 1.5.106

- Hover tips: each thing said once. Catalogue bubbles group the machine lines, the source sits on ↗ only, Active is explained once at the top, look groups share one line by their heading, theme tips no longer repeat the description, and Alerts says "a notification".
- Release builds on Windows keep the bundled Mermaid file byte for byte (a .gitattributes rule), so its checksum check passes.

## 1.5.105

- Bob's instructions to his brains are trimmed: no repeated rules, the right computer name on Mac and Linux, and his copies get about a third fewer words, which leaves more room for the chat on small brains.
- The ⏳ line for a chat waiting behind a long job now says what Bob is doing in plain words, for example "making a picture, step 12 of 30" or "making a song".

## 1.5.104

Fixes from a live test on the replicant matrix.

- **One Set it up card per request.** When something Bob needs is switched off (web search, for example), you get one card and one short note, not a stack of cards and repeats.
- **A Set it up card isn't a failure.** Bob no longer adds a "that didn't work" note after offering a card, and doesn't try the same thing again.
- **Chats that wait behind a picture, clip, song or sound** now get a ⏳ line saying Bob is still on the last job and will answer when it's done. Typing "ok" there gets a plain answer instead of starting another job. Telegram shows the line once.
- **The progress bar** no longer reads "Painting 82/82" before the first step.
- **Brains and programs set by hand in config.json count as here.** A .gguf given in llamacpp.models, or a llama-server, sd, whisper or piper program path that's really there, shows as installed in the welcome screen and the brain list.

## 1.5.103

### Flowcharts and diagrams
- **Ask for a flowchart, mind map, timeline, org chart, project plan or pie chart** in plain words ("map out how the login works") and Bob draws it right in the chat. It's drawn on your replicant matrix with Mermaid, which now comes with Bob: nothing goes online, no download, no graphics card needed.
- Ask for a change and he redraws it. Each diagram's text is kept as a .mmd file in his folder.
- The phone app draws diagrams too.

### Save as: other file types
- Everything Bob makes now has a **Save as** row under it: pictures as PNG, JPG, WebP or GIF; clips as MP4, WebM or GIF; songs and sounds as WAV, MP3, OGG or FLAC; diagrams as PNG, SVG or PDF. The original always stays.
- Name the type when you ask ("a song about my cat as an mp3") and he saves it that way straight away. "Save that song as an mp3" works afterwards too.
- Songs come out as WAV (about 10 MB a minute); an MP3 is about a tenth of that.
- Converting uses FFmpeg. If it isn't set up, Bob shows a **Set it up** card instead of an error (on Mac and Linux, the card says how to install it).
- Works in the phone app too: its Save as row keeps the file on the replicant matrix that made it.

## 1.5.102

### Model families in the Brain catalogue
- Inside each job, models now sit under one header per family (Qwen, Gemma, GPT-OSS, Whisper, FLUX and so on). Every family starts closed: press its name to open the list, press again to fold it away. Bob remembers which ones you leave open, and **Open all families** / **Close all** are at the top.
- Each header says how many models, the size range, **★ Recommended inside** when Bob's pick for that job is in that family, and how many are already on this replicant matrix. The family with Bob's pick comes first. The ⓘ says who makes it.
- In Settings, Brains, the brain menus group their brains by family too.
- Phone: Bob for Android's model list groups by family the same way, closed to start with and opening while one downloads.
- Help: the catalogue page explains families, plus a new FAQ ("What's a model family?") and a glossary entry ("Model family").

## 1.5.101

### Bob on a Raspberry Pi and ARM Linux
- New download on every release: **Bob-<version>-linux-arm64.AppImage**, for a Raspberry Pi 5 (or 4) and other 64-bit ARM Linux boards. It's built and test-started on an ARM runner, next to the usual x86_64 AppImage.
- On a board, Bob runs on the processor: llama.cpp's ARM build (the same tested b12032 release), whisper.cpp, uv and Piper, each pinned. Making pictures (sd.cpp) isn't available on ARM yet, and Bob says why.
- Two starter sets only ARM boards see: **8 GB or more** (Gemma 4 E2B, with Whisper for hearing) and **4 GB** (Qwen3.5 2B). A brain that wants more than about 60% of the board's memory is marked as unlikely to run well.
- Help: new "Bob on a Raspberry Pi" page, an FAQ and a glossary entry ("ARM board"). Not tried on a real Pi yet; the Help says so.
- Nothing changes on Windows, Mac or x86_64 Linux, and nothing new is switched on.

## 1.5.100

### Help, tidied
- Help: repeats trimmed, short FAQ answers link to their full page, wrong facts fixed (phone access, sizes, chat while busy), privacy page lists Bob-Net and Telegram, platform-neutral wording.
- Glossary: "Slot" appears once, "SHA-256" is part of "Checksum (.sha256, SHA-256)", and "Thinking (Bob's thinking window)" is part of "Thinking first".
- No settings or behaviour changed.

## 1.5.99

### Pair with my other Bobs
- Joining your Bobs is now two presses, with nothing to type. In Settings, Show advanced settings, 🌐 Bob-Net, at the top of My other Bobs: **Find my other Bobs** asks Tailscale which of your devices are online and knocks on each. Press **Pair** next to one, or **Pair with all of them**.
- The other Bob shows a card, "🤝 … wants to join your Bob-Net", with a 4-digit number. This Bob shows the same number. If they match, press **Yes, pair us** over there. The two Bobs swap passcodes over Tailscale, and each puts the other in My other Bobs.
- Pairing only fills the list. It switches nothing on: Lend, Borrow, Take jobs and Send jobs stay as they were.
- If this Bob's door (Let my other replicant matrices in) is off, the pairing works one way and Bob says how to make it both ways.
- No Tailscale program? Type the other Bob's Tailscale address and press Pair. Adding a Bob by hand (name, address, passcode) is under More, as **Add one by hand**.
- A fix from the live test: the door also accepts this replicant matrix's own current Tailscale addresses, so an old saved address can't shut your other Bobs out.
- Limits: 3 pairing asks a minute, one waiting card per asker, and cards and answers are forgotten after 3 minutes. Yes is refused while this Bob's door is off.

### Phone: pair with this Bob
- Bob for Android pairs the same way. Under Add a Bob, **Pair with this Bob** sits beside Add this Bob. The phone can also answer a pairing card from your computer, with a notification when Bob's screen is closed.
- Each pairing gets its own passcode, kept on the phone only as a fingerprint. Make a new passcode drops them all. On Yes, the phone logs in to your computer's Bob by itself.
- New Help entries on both: "How do I join my Bobs together?" (computer) and "Pair with my other Bobs" (phone). Glossary: "Pairing".

## 1.5.98

### Settings, laid out properly
Nothing is renamed or switched on or off, only moved, so every setting keeps its name and its default.
- **How Bob works** has three small headings: *How he works* (now with Pick up where Bob left off after a restart), *Starting and closing*, and *Going online*.
- **Check for updates when Bob starts** sits in This replicant matrix and updates, next to the Check for updates button.
- Off Windows, the Animations middle button says **Follow the system**.
- The advanced panels, in order: 🧠 Brains (now also Let the reviewer sit beside Bob's main brain, Keep chatting while Bob is busy and Give Bob all his tools at once), 🖋 House style, 🔊 Voice details, 🌓 Look & feel, ⚡ Speed & memory, ⚙ Engines, 🌐 Bob-Net, ☁ Online services, 🔌 Other apps, ✋ Hands, 🧹 Housekeeping, 🔔 Check-ins, 🗑 Remove Bob.
- **Engines & speed** is now two panels: Speed & memory (freeing memory, picture speed, Gaming, Remember only what fits, the speed test) and Engines (the engine and its downloads; the fine-tuning is under More).
- **Connections** is now three panels. **Bob-Net** has your phone and your other Bobs in one place: This Bob (the door, **Address**, passcode, firewall), My other Bobs, and What they share. "Address for the phone" is now just **Address**, since your other Bobs use it too. **Online services** says at the top that each one sends something over the internet; it holds Cloud helpers and Telegram. **Other apps** holds ComfyUI and points to Hands for Unreal Engine and Blender.
- Hands has a heading "Limits that always apply" above the hard limits.
- No panel shows its title twice any more, and House style and Look & feel have their own icons.
- Old links to Connections land on Bob-Net. New FAQ: "Where did Engines & speed and Connections go?", and a glossary entry for Online services. Help, the Bob-Net and setup messages, and the phone app's help now use the new paths.

## 1.5.97

### Waiting is plainly waiting
- When a job waits for the graphics card, chat and Tasks now show one muted line that starts with ⏳ and says who has the card and that nothing is needed from you, for example: "⏳ The graphics card is busy: my Brain is finishing another job. Nothing for you to do; I carry on by myself when it's free. (waiting 2 min)". It updates in place, and after 5 minutes it adds that Stop cancels the job. It used to read like an OK card.
- Typing "ok", "yes" or "go" while only a ⏳ line is showing gets a plain answer straight away: there's nothing to OK.
- Glossary: new entry "⏳ line".

### Bob-Net lending fixes (found on real devices)
- A Bob lending his brain now stops thinking when the asking Bob gives up, and always hands the graphics card back afterwards. Before, the card could stay taken, and his own jobs and guests' jobs waited forever.
- The lending Bob says "still loading" every few seconds until the first word, and the asking Bob gives up after 45 seconds with no first word.

### Phone: send a photo
- The phone app can attach a photo (📎) to a message for your Bob. The photo goes only to your own Bob, which keeps it on its References page. New Help entry: "Photos".

## 1.5.96

### Bob understands what you ask, in plain English
- **Picture edits stay edits.** "Edit this picture", "change this picture", "I want this to look like a watercolour", "make her hair red" or "get rid of the guy on the left" now edit the picture you attached. Bob no longer paints a brand new picture when you meant a change, even if his brain forgets to say which picture.
- **Follow-ups edit the picture from a moment ago.** Right after Bob makes a picture (or you send one), "now make the sky purple", "add a moon to that" or "lose the tree" edit that same picture. Ask for "a new picture" and he starts fresh.
- **More ways of asking reach the right tools**: posters, banners, thumbnails, album covers, profile pictures, "show me what... looks like", little movies and gifs, lo-fi tracks and theme tunes, "start the server", "unpack that archive", "clear some space", "every weekday at 9am", "shrink this video", "is this link safe to click", "jot this down in a text file" and more.
- A new check (test/run-phrasing-test.js) asks Bob about 175 everyday phrasings for every job he does (pictures, edits, clips, music, sounds, Hands, documents, memory, how-tos) and fails if one lands on the wrong tools.

## 1.5.95

### Bob in the tray, and his look as his icon (both off by default)
- New in Settings, How Bob works: **Keep Bob in the tray**. With it on, closing or minimising Bob's window tucks him into the tray by the clock (the menu bar on a Mac, the desktop's tray on Linux). Click the icon to bring him back; **Quit Bob** in its menu closes him fully. The first time he goes there, he says where he went.
- Started hidden with **Launch Bob on start-up**, Bob now always shows his tray icon, so his window can come back with one click.
- New in Settings, Bob himself: **Use Bob's look as his icon**. The taskbar, title bar (Dock on a Mac) and tray show the look you picked for him.
- Updating Bob still works with the tray on. The phone app has no tray.

## 1.5.94

### Bob-Net with no manual steps
- **Let my other replicant matrices in** works the moment you turn it on: no restart. If Tailscale isn't running yet, Bob says so and picks it up within a minute once you sign in.
- On Windows, one button, **Let Tailscale through the firewall**, adds a firewall rule that lets in Tailscale only (Windows asks once). It also switches off any rule that blocks Bob's own program (Windows makes one if Cancel was clicked on its earlier question). **Remove the firewall rule** undoes both.
- On Linux, Bob shows the one line to run if a firewall is on. On a Mac, choose Allow when macOS asks.
- New FAQ: "Why can't my phone or other Bob reach this one?"
- Not yet tried on real hardware: the Windows prompt and rule.

## 1.5.93

### Bob ready in a few clicks
- **Get Bob ready** is now one list: tick or untick every program and model, each with its job and size. The recommended ones are ticked. On built-in graphics with 32 GB or more of RAM, Gemma 4 26B and Qwen 3.8 27B are offered too, unticked.
- Bob puts each model he downloads into its slot himself, so everything is ready to use when the downloads finish.
- Bob gets his own Python when there's none on your replicant matrix (the official Python Software Foundation package on Windows, uv's standalone Python on Mac and Linux), so voices and the audio tools no longer ask you to install Python first.
- When you ask for something Bob can't do yet (a clip, a picture, music, web search, a Hand that's off), he shows a **Set it up** card in the chat instead of an error. One press gets what's needed, and he carries on with what you asked. The phone app shows the same card.
- Not yet tried on real hardware: Bob's own Python under Smart App Control, and the phone's Set it up card.

## 1.5.92

### Phone: replicant matrix wording on Bob-Net
- The phone's **Bobs on your network** now says "Bobs on your other replicant matrices that let this phone in".
- A new Bob on your network gets a name from its Tailscale address ("Bob on desktop" for desktop.your-tailnet.ts.net), or "Bob on my other replicant matrix" for a bare number address. The examples use my-computer.your-tailnet.ts.net.

## 1.5.91

### Fixes from the live test
- A brain that spills into RAM starts again on every engine. 1.5.90 guessed the old --no-mmap flag when it couldn't find which llama.cpp build it had, and the tested build (b12032) refuses that flag, so the engine didn't start. Bob now reads the build note next to the engine itself, asks the engine once if there's none, and adds no flag at all if he still can't tell.
- The spec line beside **This replicant matrix** shows the processor's short name on Windows too ("Ryzen 7 9800X3D", without "8-Core Processor").
- The spec line shows RAM as it's sold: 32 GB installed now reads 32 GB, not 31. Bob's memory maths still uses the real number.

## 1.5.90

### Faster first reply for big brains that spill into RAM
- When part of a brain has to sit in RAM (for example Qwen3.6 on a 16 GB card), Bob now reads it all in while loading instead of fetching pieces from disk later. On a 16 GB card the first reply after a load came in about 1.4 seconds instead of 27, and the brain used about 12 GB of RAM instead of 21. Loading takes about 10 seconds longer.
- Tests: the Telegram test's made-up bot token no longer looks like a real one, and the public check now also catches real Telegram bot tokens.

## 1.5.89

### The replicant matrix
- Bob now calls the computer he runs on his **replicant matrix**, on Windows, Mac, Linux and the phone. It's still your computer: nothing about it changes, it's just his name for his home.
- Wherever Settings names it, a short line with its specs sits beside it (for example "Ryzen 7 9800X3D · RTX 5070 Ti 16 GB · 32 GB RAM"), so you always know which machine he means. The phone shows its own model and memory.
- Renamed: **💻 This replicant matrix and updates** (was This PC and updates), **Check this replicant matrix** (was Check this PC), **Speed for this replicant matrix**, and **Let my other replicant matrices in** (was Let my other devices in). The switches work exactly as before.
- Lines about what stays on, or leaves, your replicant matrix also say "(your computer)", so privacy notes stay plain.
- Help has a new glossary entry and an FAQ, "What's a replicant matrix?". Searching Help for PC, computer, laptop or device still finds everything.

## 1.5.88

### How much each brain keeps in mind
- Qwen3.6 35B-A3B now keeps 256K in mind by default (it was 128K), on every copy, still as one shared load. On a 16 GB card that measured 15.0 GB on the card, about 49 tok/s on a short write, and it found a fact hidden 201K tokens in. The 8 GB card version stays at 128K until it's been tried on a real small card.
- New switch in Settings, Brains: **Pick how much each brain keeps in mind** (off). When it's on, each brain you've equipped gets its own menu, which only goes up to the most that brain was made for, with a tip on what suits it. In a Gaming session a pick is capped at the Gaming size, so your game keeps its memory.
- Bob never loads a brain past its own limit now, on his own engine as well as Ollama.

## 1.5.87

### Talk to Bob on Telegram (off by default)
- New in Settings, Connections: **Talk to Bob on Telegram**. Chat with Bob from the Telegram app through your own bot, wherever you are. Make a bot with @BotFather, add its token as the Windows user variable `BOB_TELEGRAM_TOKEN`, turn the switch on and send Bob the 6-digit pairing code. Only the one Telegram account you pair can talk to him; anyone else is ignored. Bob never stores or shows the token.
- Two extra switches, both off: **Send pictures Bob makes** and **Answer Bob's OK cards on Telegram**. Bob's hard limits still hold either way.
- With the switch off, Bob sends nothing to Telegram at all. Not yet tried against a real Telegram bot.

## 1.5.86

### Bob-Net
- The sharing panel is now called **Bob-Net: share work with my other Bobs**. The switches inside it keep their names. Help has a new glossary entry for Bob-Net.

## 1.5.85

### Tested llama.cpp by default
- Get llama.cpp and Get Bob ready now install the tested llama.cpp build (b12032, the one every speed test used) instead of whatever was newest that day. Get newer build is still there, and Go back to the tested build undoes it.

## 1.5.84

### Passcode made when you switch on
- Turning on **Let my other devices in** for the first time now makes the passcode for you and shows it once under **Passcode**. There's no separate **Make a passcode** step first. The passcode lock works exactly as before.
- On the phone, turning on **Lend my brain** does the same: the first time, it makes the passcode and shows it once.

## 1.5.83

### Phone brain fix
- The phone brain loads again. Before this, every phone said "the brain file wouldn't open", even after downloading the brain again. The brain file was fine: the phone app was missing the engine parts that run it, because Android wasn't unpacking them. The app now unpacks them when it's installed.
- If the engine ever fails to start again, the phone says so plainly ("the phone brain's engine didn't start") instead of blaming the brain file.
- With **Lend my brain** off, the phone's panel no longer shows a stray word "null" under the address card.

## 1.5.82

### Pictures on built-in graphics
- The **Built-in graphics (handhelds and thin laptops)** starter set now also offers pictures, picture edits and short clips, using the versions made for 6 GB cards. Clips are listed but left unticked, because they're very slow on built-in graphics.
- With **Match picture settings to my graphics card** on, Bob paints a little smaller (768 px) and more carefully on built-in graphics. Times there are rough guesses until someone measures them on a real handheld.
- On a handheld, Get models now marks the built-in graphics set as the one for this PC.

## 1.5.81

### New
- **Connected apps (MCP)**, a new Hand (off until you switch it on): Bob can work inside apps that offer their tools through an MCP add-on, such as Unreal Engine and Blender. Add an app in Settings, Show advanced settings, Hands, Connected apps (fill in for Blender or Unreal, type it in, or paste an "mcpServers" setup), press Check, then switch it on. Every app comes in switched off.
- Bob starts or reaches an app only when a job needs it, and lets it go after 5 minutes unused. Every step shows a card that says in plain words what he'll do (the exact inputs under Show details); tools that run code inside the app or can delete things show the code and always ask. Blender's add-on needs uv: "Get uv for me" fetches it. The hard limits apply to the inputs, and while "Don't send anything out" is on he only talks to apps on this computer.
- Works on Windows, Mac and Linux (on Mac and Linux he also looks in ~/.local/bin and Homebrew's folder for programs like uvx). The phone app's cards name the app.

## 1.5.80

### How-tos: Bob keeps the steps of jobs that worked
- New switch in Settings, How Bob works: **Let Bob learn how-tos** (off unless you turn it on).
- After a job with at least three steps goes well, Bob puts one card under his reply: **📒 That worked. Keep the steps as a how-to?** You can change the name, then press **Save how-to** or **Not now**. Nothing is kept without that click. You can also say "keep those steps" after a job.
- When you ask for something like it again, the chat shows **📒 Following my how-to "…"** and Bob follows those steps, fitted to what you asked this time.
- **📒 How-tos** in Settings lists them, with **Edit** and **Delete**.
- A how-to is plain text. It can't run anything or say yes for you: Hands that ask for your OK still ask. How-tos stay on your PC (inn\bob\howtos.json) and never go online.
- Light by design: only the one how-to that fits goes along, and only on that message. It's matched by words, and by meaning when Housekeeping is on. No extra model runs for it.
- Works the same on Windows, Mac and Linux.

## 1.5.79

### New (off unless you turn it on)
- **Remember only what fits** (Settings → Engines & speed). With each message, Bob reads only the memories that fit it (up to 8, about 1,500 characters at most) instead of his whole memory file, so chats stay light as his memory grows.
- **Memory banks.** Each project in Settings → Projects gets its own bank. While a chat is about one project (named in the message, the chat's project so far, the project of the closest topic, or the main project), Bob reads that bank and the general memories and leaves the other projects' memories out. "Remember" can save a fact to a project's bank, and facts filed while tidying go to their topic's project.
- Add `[always]` to a line in the memory file and Bob reads it with every message. **Open Bob's memory file** sits under the switch, with a count for each bank and what the last message recalled.
- Matching is by meaning with the 🗂 Memory (finding past chats) model (CPU only, never in the Gaming session), and by words otherwise. Memory lines get their meanings while Bob is idle, so a message only waits for its own (1.5 seconds at most). No database or extra program: banks are tags in the same plain-text file, and the meanings are a small file next to it.
- Help: "Memory banks and Remember only what fits", a glossary entry and an FAQ.

## 1.5.78

### New
- **Show Bob's plan before big jobs** (Settings, How Bob works; off unless you turn it on). Before a long or risky job, Bob shows every step on one card and waits. Any OKs the job needs are ticked on that same card. Press Go ahead, Change something (say what, and he makes a new plan) or Not now (Bob drops this job). On Windows, Mac and Linux, and the phone app shows the same card for a Bob on your network.
- **Check-ins** (Settings, Show advanced settings, 🔔 Check-ins; off unless you turn it on). On a schedule you pick (every day or every weekday at a time, or every few hours), Bob looks over his downloads, tasks, schedules and disk space, plus up to 8 checks you write yourself ("Did the build finish?"), and only speaks up when something needs you: a Check-in card in the chat, and a notification if Alerts is on. The same thing isn't repeated until a day has passed. A check-in only looks: it never changes, retries or downloads anything, and nothing goes online.
- Staying light: the built-in checks use no brain at all. Your own checks use the quick brain on the processor, beside the main brain so nothing is swapped out, only while Bob is idle and never in the Gaming session; a brain loaded just for this is let go straight after. Works the same on Windows, Mac and Linux, while Bob is open; a missed check-in is done once when he's back.
- Help in Bob's voice for Check-ins and its settings, a glossary line and two FAQs. Bob knows the setting when you ask him how he's set up.

## 1.5.77

### Fix
- The llama.cpp that comes inside Bob's download is now always the same tested release (b12032, the one every speed test and brain race used), instead of whichever was newest on the day the release was built.

## 1.5.76

### A basic engine comes with Bob
- Bob's download now carries a basic build of llama.cpp, the program his brains run on: Vulkan on Windows and Linux (it works with any graphics card, or the processor), Metal on a Mac. It's the unchanged file from llama.cpp's GitHub release, checked against GitHub's sha256 when the release is made (MIT licence, see THIRD-PARTY.md). It adds about 30 to 50 MB to the download.
- On first start it's set up in Bob's engine folder if there's no llama.cpp there yet, so step 1 of the Welcome shows it as "came with me". An engine already on the PC is never replaced.
- With an NVIDIA card, **Get Bob ready** swaps in the faster CUDA build (the basic build's files are cleared first, so the two never sit side by side). With built-in graphics, another card or a Mac, the bundled build is the one Bob uses.
- Stable-diffusion.cpp, whisper.cpp and the starter brain still come with Get Bob ready.

## 1.5.75

### Engines first
- The Welcome now begins with **Step 1: getting me ready**: one click on **Get Bob ready (about X GB)** fetches the programs Bob runs on (llama.cpp for brains, stable-diffusion.cpp for pictures and video, whisper.cpp for hearing you; only the ones this computer has a build of) and one starter brain, before any other model is picked. The size and free disk are shown first, and it won't start with less than its size plus 2 GB free.
- **Pause**, **Resume** and **Stop** sit right in step 1.
- The starter brain suits the device: Gemma 4 E4B with a graphics card of 8 GB or more, or 16 GB of shared memory (a Mac, or built-in graphics like a handheld's), otherwise Gemma 4 E2B. It goes into the Brain and Quick brain slots when they're empty, so Bob can talk and help with the rest straight away.
- Bob checks that each engine really starts (it runs once with --help) and shows ✓ works, or what went wrong, such as a missing runtime file, with **Try again**.
- Step 2 is the starter set of bigger models, as before.

### Help
- Getting started, What stays on your PC and the README explain Get Bob ready.

## 1.5.74

### Fix
- Picking a brain that can see pictures (like Qwen3.6 35B-A3B) in Equip Bob no longer takes its eyes away. It used to keep only the brain's file and drop its picture reader, so the Brain couldn't look at pictures itself. Brains picked that way before are fixed automatically, with nothing to redo.

## 1.5.73

### Share brains, smarter
- **Borrow a brain** now picks the best of your other Bobs for each reply: only Bobs whose quick brain has room for the chat count, and among those the one used in the last few minutes goes first (it's quicker to start), then the fastest. Two replies at once go to two different Bobs, and a Bob that's busy or finds the chat too long is skipped for the next one. If nobody has room, this Bob answers himself.

### Whole jobs to another Bob (new, both off)
- **Send jobs to my other Bobs**: pictures, clips, music, sounds, research and bigger thinking jobs can go to another of your Bobs when this one can't do them, would wait while you game, or (with "Borrow when:" set that way) is busy. A job that's about this computer (files, folders, programs, reminders) or has pictures attached always stays here.
- **Take jobs from my other Bobs**: a Bob only offers what it can really do right now, and says no while you game or when it's busy.
- The chat says plainly where a job went ("📡 Sent to Laptop: …"), OK cards and files come back to this Bob, and Tasks shows "Sent to Laptop". Stopping it in Tasks stops it on the other Bob too.

### Fix
- Android: downloading the phone brain no longer sits at "0 MB" forever. If a download can't start, the app now says why.

## 1.5.72

### Every model downloads without Ollama
- Gemma 4 E4B, Gemma 4 26B, Qwen 3.8 27B, Qwen2.5 Coder 7B, Qwen2.5 VL 7B and Nomic Embed Text came only through Ollama, so on Bob's own engine Get said "comes through Ollama, and Ollama isn't running". Each now downloads straight from an exact Hugging Face commit, checked against its sha256: Gemma 4 from ggml-org (Q4_0, with its picture reader), Qwen 3.8 27B from unsloth (UD-Q4_K_XL), Qwen2.5 Coder 7B from Qwen, Qwen2.5 VL 7B from unsloth (the same file the picture editor already uses, so it isn't downloaded twice), Nomic Embed Text v1.5 from nomic-ai (f16).
- With Ollama as Bob's engine, these still come through Ollama, so there's no second copy.

### One click on the Welcome screen
- "Download the checked ones" now also fetches the programs the checked models run on (llama.cpp for brains, stable-diffusion.cpp for pictures and video, and so on), so first-time setup needs nothing installed by hand. The starter screen in Get models already did this, and now also adds llama.cpp for brain files. The size it shows counts those programs too.

### Memory (finding past chats) on Bob's own engine
- Nomic Embed Text now runs on Bob's own engine: a small separate llama.cpp server on the processor only (the graphics card is hidden from it), below normal priority, two threads, started when Topics need it and let go after two minutes unused. It never starts in the Gaming session, where Topics are matched by words as before.
- A downloaded Nomic Embed Text shows up in the Memory slot. With Ollama as the engine and the model not in Ollama, Bob's own copy is used.
- If no embedding model was found, Bob tries again 10 minutes later instead of only after a restart.

### Help
- New FAQ: "Do I need Ollama?". Glossary: Embedding model. Getting started says the engines come with the models.

## 1.5.71

### Built-in graphics
- Bob now spots graphics built into the processor when there's no NVIDIA card: AMD's in Ryzen laptop and handheld chips (like the Z1 Extreme's Radeon 780M) and Intel Arc and Iris Xe. Get models shows them as built-in graphics with the memory they share with the PC (about half of it), and marks models that fit with "Fits your PC".
- A new starter set, **Built-in graphics (handhelds and thin laptops)**, is suggested for them. It's brains only for now: pictures and video are left out until they've been tried on built-in graphics.
- A desktop Ryzen's small built-in graphics, or a PC with a separate AMD or Intel card, still count as no graphics card.
- Not yet tried on a real handheld: the numbers for it come next.

### Android
- Each release now carries the Android app as Bob-<version>-android.apk, with its .sha256 checksum, like the Linux AppImage.

## 1.5.70

### Docs
- New page: [Brain races](app/docs/BRAIN-RACES.md), with the full results behind the 16 GB starter set: the coding race (Qwen3.6 35B-A3B vs Qwen3 Coder 30B), the everyday chat and Office race (Qwen3.6 vs Gemma 4 26B), the live checks of Qwen3.6 at 128K, and the Deep thinking race (Qwen 3.8 27B vs Gemma 4 26B). It also lists what hasn't been measured yet, like the smaller Q3 file for 8 GB cards.
- Mac: the README, User guide and Help explain how official Mac builds are signed, and CONTRIBUTING has a section for people who build their own copy.

## 1.5.69

### Links go to the main Brain
- With "Keep the graphics card free for quick answers" on, Low chat runs on the small Quick brain on the processor, which isn't good at reading web pages. A message with a link in it (or one asking about a link from a moment ago) now goes to your main Brain on the card instead. The chat says "This one has a link in it, so my main Brain takes it.", and adds about how long it takes to load if it isn't loaded yet.
- It needs "Let Bob search the web" on. In Gaming it doesn't happen: the Gaming brain reads the page itself, and the card stays free for your game.

## 1.5.68

### Fix
- With Qwen3.6 35B-A3B as the Coding brain, a coding job can no longer think forever. It once thought for about 10 minutes on a small job without answering, and every later message waited behind it. Now it thinks for about three minutes at most on a 16 GB card, then is asked to answer with what it has worked out. Its thinking also uses the setting Qwen recommends to stop it going round in circles.
- Every reply on Bob's own engine has a ceiling on how long it can get, so no single reply runs on forever.

## 1.5.67

### Fix
- With Qwen3.6 35B-A3B as the Brain, Bob no longer reloads it after every job. Going back to chat after a job used to load it again with a smaller context (32K) and then load the big one (128K) for the next job, about 9 seconds each time. Now it stays one load at 128K. A context picked by hand for the Normal session still wins.

## 1.5.66

### One brain for chat and coding: Qwen3.6 35B-A3B
- On a 16 GB card, Qwen3.6 35B-A3B is now both the Brain (everyday chat) and the Coding brain. Gemma 4 26B does Office and Deep thinking.
- Everyday chat at Low answers straight off, without thinking first. Medium and up still hand the question to the Deep thinking brain. Coding jobs always think the job through first.
- It's loaded once with a big context (128K, how much it keeps in mind), so going from chat to coding and back doesn't reload it.

### Fix
- Get models no longer says a model in its own folder (like models\qwen3.6-35b-a3b) belongs to Ollama.

### Trying again thinks it through
- When Bob's first answer misses and he gives it another go (for example after "I can't" when he can), on Qwen3.6 that second go thinks the job through first. The chat says "Trying again, thinking it through this time." It's the same loaded brain, so nothing reloads.

## 1.5.65

### Fix: Bob finds a model you already have in its own folder
- A model already downloaded into a folder named after it (for example models\qwen3.6-35b-a3b) now counts as installed, so Bob runs it from there and **Get models** doesn't download it again. It has to be the right size and fully downloaded.

### Fix: "the page I told you about"
- With web search on, if you mention a link from earlier ("check out the github page I told you about"), Bob goes back through the last few messages, finds it and opens it before he answers. He looks through the last few messages.
- Before, when his quick brain said it had no web access even though web search was on, that's where it stopped. Now he opens the page and tries again. With web search off, nothing changes.

## 1.5.64

### New: a squeezed Coding brain for 8 GB cards
- Cards of 8 GB or less can now get an **8 GB card version** of Qwen3.6 35B-A3B: the same brain packed tighter (Q3), so it fits. It's a smaller file and a little less sharp, but still a strong coder.
- Bob only offers it on cards of 8 GB or less, and only when the full one wouldn't run well there. On bigger cards brains stay at Q4 or better. You can still pick the full version by hand.
- It's marked **New** until it has been tried on a real 8 GB card.

## 1.5.63

### Coding brain: Qwen3.6 35B-A3B
- Qwen3.6 35B-A3B beat Qwen3 Coder 30B on a real 16 GB card, so it's now the Coding pick in the 16 GB starter set, and it isn't marked **New** any more. Qwen3 Coder 30B stays in the catalogue, and you can still equip it.
- The coding copy gives it a big context (128K, how much it keeps in mind). On a 16 GB card that was measured at 14.7 GB of graphics memory, with part of it in RAM.
- At **Low** effort it answers straight off. From **Medium** up it thinks the job through first.
- It uses the settings its makers recommend, one set for thinking and one for answering straight off.

## 1.5.62

### Fix: Bob's checks no longer put test files in your Recycle Bin
- When Bob updated on Windows, a few of his own checks threw their scratch files into your real Recycle Bin (files like "old notes #1.txt" or a "note_writer" folder). They were harmless leftovers, and they're safe to empty. Now Bob's checks only ever use his own trash folder, so nothing of theirs reaches your Recycle Bin or Trash.

## 1.5.61

### New: Update Bob from GitHub
- **Check for updates** now looks at Bob's GitHub page for the newest release, as well as your source folder if you have one. The newer one wins, and it says which.
- **Update Bob** downloads the right file for your computer from GitHub, checks it against its checksum (.sha256) and throws it away if they don't match, then updates Bob as before. Your click is the OK, every time.
- Works on Windows, Mac and Linux. On a Mac and on Linux, **Restart Bob now** swaps in the new version and keeps the old one in case something goes wrong.
- **Check for updates when Bob starts** is still off unless you turn it on.

### Fix: "System message must be at the beginning" on Ollama too
- The 1.5.52 fix for brains like Qwen 3.8 only covered Bob's own engine. On Ollama the same refusal still failed the reply at Medium effort. Now Ollama folds Bob's mid-chat notes in the same way, and remembers it for that brain.
- Bob also looks at the whole error, not just its start, when he checks for that refusal.

## 1.5.60

### Fix: Bob opens links you send him
- With web search on, "Check out github.com/MouseWurX/Bob" sometimes got "I don't have live web access" or "that isn't on your PC" from the small quick brain. Now Bob opens the first link in your message himself before he answers (you see "Read the page" in the chat), so he answers from the page.
- Links without https:// in front (github.com/name/project) and links with one slash (https:/example.com) work too.
- With web search off, nothing changes: Bob says web search is off.

### Fix: Bob finds Ollama and Pinokio wherever they are
- Ollama's models are found through OLLAMA_MODELS, Bob's own models folder, or the usual place in your home folder. Pinokio is looked for on drives C: to G: and in your home folder.

## 1.5.59

### Less clutter: explanations move into tips
- The long notes under switches and settings now wait behind a small round **i**. Point at it, Tab to it, or tap it to see the explanation in one bubble. Esc closes it.
- Every button that had a tip now shows it the same way, with the mouse, the keyboard or a touch screen. On a touch screen, press and hold a button to see what it does.
- The chat page is tidier too: the Effort line under the chat box and the "drag to reorder" note now sit in tips. Warnings still show in full.

## 1.5.58

### New: 📚 Brain catalogue
- Get models has a new **Brain catalogue** tab with every model Bob knows, sorted by the job it does: Quick brain, Gaming, Brain, Deep thinking, Review, Coding, Office, Seeing pictures, Phone, and the picture, voice, music and memory jobs.
- Each model is one line. The little **i** shows what it's good at, how it does on a 16 GB card, an 8 GB card, a 6 GB laptop card, no graphics card and a phone, its licence and where it comes from. The **↗** opens the exact download source.
- New choices: Qwen3.6 35B-A3B (coding), Qwen3.6 27B and Qwen 3.8 27B (deep thinking), Qwen3.5 9B, 4B and 2B, and Gemma 4 E2B. New ones are marked **New** and aren't recommended until they've been tried on a PC.
- **Active** switch on every model: only active models show in Equip Bob and the brain menus, so those stay short. Models on your PC start active. Switching one off only hides it.
- **📚 Get more** at the end of every slot's list (and next to every brain menu) opens the catalogue at that job.
### Equip Bob
- New 🎮 **Gaming** and 📊 **Office** slots, so every brain is equipped in one place. Gaming only ever takes Qwen3 4B Instruct 2507, and never Gemma 4 E4B.
- Lists are one line per model; the details are behind the **i**.
- Brains that see pictures now download their picture reader too, so they can see when Bob runs them himself.

## 1.5.57

### New: the phone can lend its brain too (Bob for Android)
- The other half of Share brains: Bob for Android gets its own **Lend my brain** switch, off to start with, so your PC Bob can borrow the phone's small brain for a quick reply while you game.
- The phone brain now runs on its own built-in engine.

### Fixes for Mac
- Bob's thinking window uses the Mac-friendly icon.
- Let my other devices in now finds Tailscale where the Mac app installs it.

## 1.5.56

### New: Bob for Mac and Linux (preview)
- **Mac (Apple Silicon):** Bob.app comes as a zip on the release page. His brains and picture maker run on the Mac's own graphics through Metal. FFmpeg and LibreOffice are used when they're already installed. Speech-to-text and Piper voices aren't offered on a Mac yet.
- **Linux (x86_64):** Bob comes as an AppImage on the release page, with a .sha256 file to check the download.
- Settings only show what works on your system. On a Mac, the Gaming card switch, Check this PC and the Remove Bob window are hidden, and engines that aren't offered say why.
- The Hands know which system they're on. The Apps Hand and the virus scan stay Windows only, the Security Hand runs read-only Mac checks, and the Run Hand knows the Mac's risky commands.
- Both are previews: they're built and started by GitHub's checks on every release, but they haven't had much real use yet. Windows is unchanged.

## 1.5.55

### New: Share brains with my other Bobs (off to start with)
- Settings, Connections, **Share brains with my other Bobs** has two switches, both off to start with.
- **Lend my brain** lets another of your Bobs ask this one to think one quick reply. It only ever uses its small quick brain, it says no while it's gaming or busy, and nothing it thinks for the other Bob is saved.
- **Borrow a brain** lets Bob ask one of your other Bobs to think a quick, Low-effort reply, by default only while you're gaming, so your gaming PC stays light. The tools still run on your own Bob, with its usual checks and OK cards. If no other Bob answers in time, Bob thinks the reply himself.
- The chat says plainly when it happens: "📡 Borrowed brain: …".
- The "Let my phone in" door is now called **Let my other devices in**, since your other Bobs use it too.

### Fix
- A test of the beside brain no longer fails on a PC whose graphics card is free.

## 1.5.54

### Keep talking while a big brain works
- When a big brain is about to push Bob's quick brain off the graphics card (Medium effort and up, Coding, a moot review), Bob first starts a small brain on the processor beside it, so you can keep chatting the whole time. The chat says "Keeping a small brain (Qwen3 4B Instruct 2507) on the processor". It goes again when the job is done.
- On the processor, quick replies beside a job now use Qwen3 4B Instruct 2507 (if it's downloaded; otherwise they wait), which starts answering in a few seconds there. Gemma 4 E4B only sits beside a job when it goes on the graphics card. Never in the Gaming session.
- The chat page hears the moment a second brain joins or leaves, so Now running and Bob's head keep up.
- Part of "Keep chatting while Bob is busy" (on to start with); only when there's enough free RAM.

### New: Let my phone in (off to start with)
- Settings, Connections, **Let my phone in** lets Bob's Android app reach this Bob over Tailscale. Turn it on, press **Make a passcode** (8 digits, shown once), and type it into the phone app along with the address Bob shows. **Check again** re-reads the address.
- The passcode lives only in this PC's own settings file. Bob's settings page can't open it.
- The Android app itself is in the android folder, and GitHub builds a test copy of it on every push. It hasn't been tried on a real phone yet.

## 1.5.53

### New: 💭 Bob's thinking
- A small window that stays on top and shows what's going on in Bob's brain, live. It shows his thinking, which brains he holds and where (graphics card or processor), moots, brain loads and swaps, every tool step and his notes to self. It costs nothing while it's closed.
- Open it with the **💭 Bob's thinking** button in the chat bar, after ✋ Hands. Press it again to bring the same window to the front. Nothing in it is saved.

### New: more life in Bob and Patches
- Bob has little habits when things are quiet: he glances around, sips coffee, winks, stretches, hums, reads and tidies up. After 10 quiet minutes he dozes off, and he wakes when you come back. He also reacts to what's going on: he waves hello, nods when you send, hops when a reply is done and shakes off an error.
- His head grows a little while a second brain is loaded, and shrinks back when it's let go.
- Patches the cat has 17 antics instead of 5, each with its own line under Bob's status.
- It all follows the **Animations** setting, so Off stops every bit of it.

## 1.5.52

### Fix: some brains failed with "System message must be at the beginning"
- Some brains (Qwen 3.8, for one) only accept Bob's own instructions at the very start of a chat. When Bob added a short note mid-chat (for example "Thinking time is up" at Medium effort, or a nudge to use his tools), Bob's engine refused the request with an error, and the job failed.
- Now, when a brain refuses like that, Bob sends the request again with those notes folded into the chat as marked notes from his own system, and he remembers to do that for that brain from then on. Other brains are unchanged.

## 1.5.51

### A second brain beside long jobs
- **Keep chatting while Bob is busy** now also works while Bob is on a long text job: Medium effort and up, the Coding session, or anything that has run 20 seconds. A plain chat message is answered by his small brain on a second engine beside the job: on the graphics card when it has room for both and isn't busy, otherwise on the processor. His main brain stays on the graphics card and keeps working; nothing is swapped. The chat says which.
- On the processor, the second engine never touches the graphics card and uses half the cores at lower priority. If a picture needs the card, a second brain on the card steps over to the processor. It only starts when there's enough free memory, and goes again as soon as the job is done.
- If there isn't room, the main brain is on the processor itself, or the second engine won't start, the message waits for the job as before, and Bob says so.
- Not in the Gaming session, and only on Bob's own engine.

### Let the reviewer sit beside Bob's main brain (new, off to start with)
- Settings > Show advanced settings > Engines & speed. At High and Extreme effort the reviewer normally swaps in for the main brain. With this on, and enough free RAM, the reviewer loads beside it instead (on the graphics card if there's room, otherwise the processor), so the moot is a true add and the main brain carries on straight after. Reviews on the processor are slower, so this suits a small Review brain best.
- When the setting is off, the moot says "My main brain steps out and the review brain comes in". The first time that happens, it also shows a one-time tip about where to find the setting.

## 1.5.50

### Make his own tools (new Hand, off to start with)
- Turn it on in Settings > Hands > Make his own tools. When none of Bob's tools fits a job, he can write a small new one.
- Before a tool is added, it has to pass every step:
  - **Plain checks:** plain JavaScript using only what's built into Node. It can't start other programs or hide what it does, and it can only use folders you ticked.
  - **A test run** in a sandbox.
  - **A moot:** his reviewer reads the code every time. The chat says "🛰 Bob calls a moot" and "🛰 Moot over".
  - **Your OK** on one card: what the tool does, what it can read and change, whether it uses the internet, its downloads, the test result, the reviewer's verdict, and the code.
- **The sandbox:** a tool can only use its own folder and the folders on its card. It can't start programs, never runs as administrator, gets no keys or passwords, and has a time limit.
- **Downloads:** any file a tool needs is pinned to one exact file and checked before it's used.
- **Tools Bob made:** a list in Settings > Hands, with a switch, Show code and Remove for each tool, plus a "Check the sandbox" button. If a tool's files are changed by hand, it's switched off.
- A whole new Hand isn't something Bob makes himself, but he can suggest one.

## 1.5.49

### The moot, said plainly
- When Bob's reviewer copy is called in, the chat says "🛰 Moot: Bob calls in (name), his reviewer, for a second look", and the moot ends with "🛰 Moot over:" and what was found.
- Other copies now say "Bob hands this to (name), his Coding copy" instead of "spins up".

### Swap, add or load
- Each brain load now says what's happening: "Swapping brains" (one goes out, the other comes in), "Adding" (the new brain joins and the other stays loaded), or "Loading" (nothing was loaded).
- For the moot, there's one line that says what happens. On Bob's own engine, which runs one brain at a time, his main brain steps out while the reviewer's brain checks the answer.
- Bob's own engine holds one brain at a time, so a different brain is always a swap there. The picture model is separate and can sit beside a brain.

### New little scenes
- The brain-swap machine has new scenes: loading into an empty head; a copy of Bob walking in with a second brain (the moot); a copy handing its brain back while Bob keeps his; and Bob letting go of his last brain and dozing.
- New: the brain bay at the top of Now running, Memory. It plays a short scene whenever a brain or the picture model comes or goes, with a line saying what happened. The scene goes after a few seconds, and the line stays for 2 minutes. With Animations off, there's only the line.

### Fixes
- **Launch on start-up:** Settings could say "off" while Bob was really set to start with Windows. That happened because Windows only finds the entry when it's read with the same option Bob saves it with. The switch now reads the entry correctly, and switching it off removes it.
- **Security and privacy Hand (from the PC checks):**
  - Programs in folders with spaces, like C:\Program Files\..., are now found and their signatures checked. Before, they were reported as missing.
  - A site name that hides a brand with swapped letters (like paypa1-login) is now rated a likely fake.
  - Startup items that run through the Windows console host now say the signature belongs to the host, not to the command it runs.
  - Scheduled tasks that run a Windows component say so, instead of only "Looks normal".
  - The "downloaded from" address no longer ends with a stray character.

## 1.5.48

### Security and privacy (new Hand, off to start with)
- Turn it on in Settings > Hands > Security and privacy. It helps you protect your own PC and accounts. It's for defence only.
- **Check this PC:** Bob reads how Microsoft Defender, the firewall, Windows updates and the programs that start with Windows are set up, and which network ports are open, then explains it in plain words. He doesn't change any of these settings.
- **Defender scans:** quick, full or one-file scans, and definition updates. Each one goes on an OK card first.
- **Is this file or email safe?** Bob looks at a file without opening or running it: its real type, where it was downloaded from, its signature, and signs of tricks in scripts, Office files, PDFs and emails. He also lists hidden details like photo location, camera, and document author.
- **Make a clean copy:** Bob saves a copy of a photo, Office file, or sound or video file without the hidden details. The original isn't touched.
- **Check a site, link or sender:** registration age, look-alike names, and known breaches (needs Web search on).
- **Check a password safely:** a box under the Hand's switch checks whether a password has appeared in known breaches, when you press Check. Only the first 5 characters of a scrambled code of it go to haveibeenpwned.com; the password itself never leaves your PC.
- **Tips:** plain-language notes on phishing, passwords, 2-step sign-in, backups, Wi-Fi, scams and more.
- Bob won't help find or track people.

### Smarter web searches
- Bob's web search now uses search operators like quotes, site:, filetype: and -word, and can limit results to the past day, week, month or year. Help explains how.

## 1.5.47

### Clearer usage bars in Now running
- Each usage bar (Graphics card, RAM, Processor) now reads as one whole bar from 0 to 100%. Bob's part comes first, in green, yellow or red for how quick he should be. Everything else follows in blue. The unused part is a dotted line running to a small mark at 100%.
- The coloured dot on the "Speed:" line under each bar is gone, so the colour only appears in Bob's part of the bar. The words stay.
- The bars are a little taller, so the colours are easier to see. Help explains the new look.

## 1.5.46

### Office documents and converting (new Hand, off to start with)
- Turn it on in Settings > Hands > Office documents and converting.
- Bob can convert files: documents, spreadsheets and slides to and from PDF, OpenDocument, CSV, HTML and EPUB; pictures between png, jpg, bmp, gif, tiff and WebP; and audio and video between formats, including trimming and making GIFs.
- He can read Word, Excel and PowerPoint files (text, sheets, slides and speaker notes), make new ones, and edit them (replace text, fill templates, set cells, add rows, sheets or slides).
- Every file he makes or changes goes on an OK card first. He never overwrites a file, and he keeps a backup before he edits one.
- He uses LibreOffice (or Apache OpenOffice) and FFmpeg if they're already on your PC. Otherwise there are optional Get LibreOffice and Get FFmpeg buttons in Settings > Engines & speed > Engine downloads. These tools aren't part of Bob. They come from their official sources and keep their own licences.
- Turning PDFs into Word or Excel files isn't supported, because LibreOffice does it badly. Bob can read the words in a PDF instead.

### Docs
- New page: [Bob and similar projects](https://github.com/MouseWurX/Bob/blob/main/app/docs/COMPARISON.md). It's a fact-based look at how Bob differs from other local AI apps. It isn't a ranking, and it says where another tool may suit you better. The README links to it.
- The README and user guide now explain that Bob picks his own session (new in 1.5.43).
- New: [CHANGELOG.md](https://github.com/MouseWurX/Bob/blob/main/CHANGELOG.md) lists what changed in every version, newest first. The README links to it at the top.

## 1.5.45

### One Effort button
- Effort on the chat page is now a single "Effort Low ▾" button. Click it and the four choices open above it, so nothing else on the row moves. Pick one and the list folds away.
- The arrow shows ▴ while the list is open.
- Keyboard: the arrow keys move between choices, Enter picks one, and Escape closes the list.
- In Gaming, the button reads "Effort Low · locked in Gaming" and is greyed out, so it can't be clicked.

## 1.5.44

### Coloured bars in Now running
- The Graphics card, RAM and Processor bars now show two parts: everything else in blue, then Bob's part.
- Bob's part is green when he should be quick, yellow when slower, and red when slow.
- Under each bar there's a "Speed:" line that says the same thing in words, with the reason. For yellow and red, it also gives a one-line fix, like picking a smaller brain or a shorter context.
- Bob's part plus everything else always adds up to the number at the top.
- Help explains the colours under "Memory, brains and swaps".

## 1.5.43

### Bob picks the session himself
- New setting "Let Bob pick the session" (Settings > Everyday > How Bob works). It's on to start with.
- Bob moves into the session that suits the job: Art, Coding, Office or Gaming. He says so in the chat.
- After he has been quiet for 2 minutes, he goes back to Normal, the lightest session.
- While something else (like a game) is using the graphics card, he stays in Gaming. When the card is free again, any job that was waiting runs.
- You can still pick a session yourself. The picker shows "(picked by Bob)" when he chose it.

### 🎮 Gaming button
- A new 🎮 Gaming button sits next to 🌐 Web search on the chat page.
- On: Bob's big brains and the picture engine leave the graphics card at once. Running jobs wait in Tasks, and Bob stays in Gaming.
- Off: back to Normal, and anything that was waiting carries on.

## 1.5.42

### Every OK on one card
- When "Let Bob work without asking" is off and a job needs more than one OK, Bob now shows them all on one card instead of one card at a time.
- Each step has its own tick box and shows the real details: the files, the exact command, or the change.
- Buttons: Allow all, Allow ticked (shown once you untick something), Deny all. Stop everything denies the card.
- An OK covers that exact step, once, for this job only. Bob's hard limits still apply.
- If a step changes after you saw the card, or wasn't on it, Bob asks about that step separately.
- Steps that depend on an earlier step say "I check it again when I get there".
- Help: the approvals entry is updated, and there's a new FAQ: "Why did Bob ask for several things on one card?"

## 1.5.41

- New: **Keep chatting while Bob is busy**, on to start with (turn it off any time in Settings, Show advanced settings, Engines & speed). While Bob makes a picture, clip, song or sound, a plain chat message is answered by his small brain on the processor, if there's enough free memory, instead of waiting. Nothing big is loaded for it, and the picture waits for that reply before Bob loads his main brain back. Those replies start slower (up to about half a minute). Messages with a picture attached, or at Medium effort and up, still wait, and so does everything in the Gaming session.
- Songs get a proper player in the chat and the side panel: play/pause, the song's real shape to click or drag through, the time, lyrics when it has words, and Show in folder. Songs get titles, and two or more in one reply play one after another.
- New in Settings: **Where Bob saves things**. Pick a folder for new pictures, clips, songs and sounds, or keep Bob's own folder (the default, what Made by Bob lists). Things Bob already made stay where they are.
- The Art session wording and Help now say the same thing everywhere about messages with a picture attached.

**Full Changelog**: https://github.com/MouseWurX/Bob/compare/v1.5.40...v1.5.41

## 1.5.40

- The 🎨 Art session now really keeps chatting while a picture or clip is made, on Bob's own engine (llama.cpp) too, not just with Ollama. The chat and the picture share the small brain on the processor, and the graphics card goes to the painter. Messages with an attached picture, or at Medium effort and up, wait for the picture, because they need a different brain. Other sessions are unchanged.

**Full Changelog**: https://github.com/MouseWurX/Bob/compare/v1.5.39...v1.5.40

## 1.5.39

- Music fix: songs now arrive. Bob misread the music engine's job number, so he kept waiting for a song that was already finished. He now reads it correctly, saves the song as a .wav in Made by Bob, and if a finished song is ever not reported, he collects it from the music engine's output folder.

**Full Changelog**: https://github.com/MouseWurX/Bob/compare/v1.5.38...v1.5.39

## 1.5.38

- Pick up where Bob left off after a restart (Settings, Show advanced settings, Engines & speed; off unless you turn it on): a job cut off by closing, updating or a crash carries on without redoing finished steps. Steps that could be left half done wait in Tasks for you to check. Try again on an interrupted job carries on the same way.
- Pressing "Download the music models" keeps your song in Tasks as "Waiting for a download", and Bob makes it by himself when the download is done.
- Music check fixed: the music engine's own small code files no longer make Bob think the models are missing (only the big model files must match), the download offer shows only what's really left, and the engine's stale half-finished downloads are cleared.
- Honesty checks: Bob is corrected if he says a song is ready when none was made, or says songs can't be saved. Every song and sound is saved as a .wav file (Made by Bob, Sounds), and Bob says where.

**Full Changelog**: https://github.com/MouseWurX/Bob/compare/v1.5.37...v1.5.38

## 1.5.37

- Music models come through Bob's own Downloads: a new 🎵 Music tab in Get models has "ACE-Step 1.5 music models" (about 10 GB, one time), pinned to one exact version, with every big file checked. Nothing downloads until you press the button.
- Asking for a song before the models are in shows a "Download the music models" button in the chat, with the size. The music engine now runs offline, so it can never quietly download gigabytes in the middle of a song.
- A music engine left running from an earlier job is ended, never reused, and stopping a song now ends the whole engine.
- A message sent while Bob makes a picture, song or clip gets an answer at once: "I'm still on the last job… If this can't wait, stop it in Tasks."
- The logbook says "Using his picture, video and music tools" for music jobs.

**Full Changelog**: https://github.com/MouseWurX/Bob/compare/v1.5.36...v1.5.37

## 1.5.36

- Code signing, said plainly: we have applied to the SignPath Foundation for free code signing, but Bob's releases aren't code-signed yet, so Windows may warn that Bob is from an unknown publisher.
- Bob's note about an old context setting in config.json now goes to the error log instead of normal output, so tools that read Bob's output aren't confused by it.

**Full Changelog**: https://github.com/MouseWurX/Bob/compare/v1.5.35...v1.5.36

## 1.5.35

- **House style:** in Equip Bob, set your usual music genre, mood, length and vocals, picture style and shape, clip style and length, sound-effect length, and what "morning" or "evening" means to you. Every box starts empty (Bob picks and says what he picked). When Bob uses one, the chat says "Used your house style: … · Change".
- **Projects in Settings:** add your project folders (with **Browse…**), and pick a main one. "My project" means that one, and searching starts there.
- **gpt-oss 20B on Bob's own engine** now runs from Bob's own official copy when it's downloaded, instead of Ollama's copy (which has no chat template): 25 of 25 tool jobs right instead of 2. The same goes for any brain whose official file is in Bob's models folder. Now running says "(Bob's own copy)" when this happens, and the logbook notes it.
- The [performance page](https://github.com/MouseWurX/Bob/blob/main/app/docs/PERFORMANCE.md) has the final tool-job scores.
- Releases publish again: one test tripped over Windows line endings on GitHub's build machine, so 1.5.31 to 1.5.34 built but weren't published. This release includes all of them.

**Full Changelog**: https://github.com/MouseWurX/Bob/compare/v1.5.28...v1.5.35

## 1.5.34

- **Settings fold away:** the Settings page is now in panels you can open and close. **Bob himself** (voice, look, theme, animations, cat) starts open; **How Bob works**, **This PC and updates** and every advanced section start closed. Bob remembers which ones you leave open, searching opens the ones that match, and the advanced sections have **Open all** / **Close all**.

**Full Changelog**: https://github.com/MouseWurX/Bob/compare/v1.5.33...v1.5.34

## 1.5.33

- **Pick Bob's voice in one place:** wherever you choose his voice (the everyday Settings page, Voice & conversation, and Brains), you pick the engine and then, right next to it, the voice inside it, with **Play sample**. Kokoro shows all 22 voices; Windows shows the English voices your Windows has (or Automatic). Each Piper voice is its own download, so Piper voices are listed with the engines.
- **Download links can't go stale any more:** every model link now points at an exact, frozen version on Hugging Face instead of "the latest", so an upstream update or a renamed folder can't break a download or change a file under Bob. Five renamed folders now use their new names. A check stops any unpinned link from shipping.
- **Tool jobs work more often:** Bob's brains now use their makers' recommended settings (and a proper chat template when the file has none), and he does a job in the same reply instead of only saying he will. When web search is off, he says where the switch is. The [performance page](https://github.com/MouseWurX/Bob/blob/main/app/docs/PERFORMANCE.md) has a new "What testing taught us" section.

**Full Changelog**: https://github.com/MouseWurX/Bob/compare/v1.5.32...v1.5.33

## 1.5.32

- New three-position switch for the Gaming session, in Settings, Engines & speed: **Gaming session: graphics card**.
  - **Automatic** (the starting position): Bob borrows about 0.6 GB of the card only when your game leaves room, and none while the game needs it. If your processor is maxed out, Bob's small brain (about 3.5 GB) moves onto the card instead, but only when it fits with room to spare. "Right now" under the buttons says what he's doing.
  - **Never use the card:** processor only. Bob's first reply after loading can take about half a minute, sometimes longer.
  - **Always borrow a little:** how Gaming worked before.
- The Gaming session text in the app, Help, README, user guide and performance page now says how the card is used, instead of "completely free".
- Fixed: the Wan 2.2 video model wouldn't download ("a different size on the website"). Its Hugging Face folder was renamed, and Bob misread the forwarding answer as the file. Bob now follows the forwarding, double-checks Hugging Face's file list before refusing a file, and no longer retries a file that really did change (it can never succeed).
- Fixed: on installs that started before 1.5.19, an old setting in config.json still made every brain start with a 131K context, so Medium and the side brains stayed slow. That old number is now set aside (and logged); a context size picked in Settings still wins.

**Full Changelog**: https://github.com/MouseWurX/Bob/compare/v1.5.31...v1.5.32

## 1.5.31

- More readings in Now running: how fast Bob's last reply was, and what Bob himself costs your PC.
- Bob's window pauses its live readings while it's hidden or while a full-screen game is in front, so it takes nothing from your game.
- The [performance page](https://github.com/MouseWurX/Bob/blob/main/app/docs/PERFORMANCE.md) now has the final tool-use scores for each brain.

**Full Changelog**: https://github.com/MouseWurX/Bob/compare/v1.5.30...v1.5.31

## 1.5.30

- Bob gets on with it: asked to make a song, a picture or a clip, or to zip or tidy a folder, he starts with sensible defaults and says what he picked, instead of asking for details first. You can still ask for changes after.
- Crashes and errors in a code project go to his coding copy.

**Full Changelog**: https://github.com/MouseWurX/Bob/compare/v1.5.29...v1.5.30

## 1.5.29

- Lighter brains can use Bob's tools again on his own engine: when a brain writes a tool call as text (Qwen2.5 Coder's plain JSON, GPT-OSS's message tokens), Bob now recognises it and makes the real call, and the raw text never shows in the chat. Only tools Bob offered can be called this way.

**Full Changelog**: https://github.com/MouseWurX/Bob/compare/v1.5.28...v1.5.29

## 1.5.28

- **🌐 Web search switch on the chat page**, next to Effort. It is the same switch as "Let Bob search the web" in Settings, and stays off until you turn it on.

**Full Changelog**: https://github.com/MouseWurX/Bob/compare/v1.5.27...v1.5.28

## 1.5.27

- **Web search is now a switch, off by default** (Settings, Everyday, "Let Bob search the web"). Turn it on if you want Bob to look things up on DuckDuckGo; only the search words and page addresses leave your PC.
- **A much bigger Help, in Bob's own voice:** every feature and setting, a glossary and an FAQ. Bob can also read his own Help, so he can walk you through setting him up.
- **New [performance page](https://github.com/MouseWurX/Bob/blob/main/app/docs/PERFORMANCE.md):** what makes Bob fast and light, with measured numbers.
- "Get Bob ready while you type" keeps its saved starts for your two most recent brains only, so they don't fill the disk.

**Full Changelog**: https://github.com/MouseWurX/Bob/compare/v1.5.26...v1.5.27

## 1.5.26

- Fixed: with Bob's own engine, small brains like Qwen3 could fail a whole reply when a tool had an empty choice list (for example no projects yet). Empty lists are now left out.
- The memory readings now agree: the Brain label at the top and the Now running memory panel show the same numbers.
- The README now has a short, step-by-step install guide and a clear link to the privacy policy at the top.

**Full Changelog**: https://github.com/MouseWurX/Bob/compare/v1.5.25...v1.5.26

## 1.5.25

- Gaming answers much sooner: the Gaming brain is now Qwen3 4B Instruct 2507, which answers straight away on the processor (the older Qwen3 4B thought for about 30 seconds before saying hi).
- Fixed: "Qwen3 4B Instruct" in Get models downloaded the older Qwen3 4B through Ollama. It now downloads its own checked file.
- Speed for this PC (Settings, Show advanced settings, Engines & speed), all off until you switch them on: Get Bob ready while you type, Let games go first, Match picture settings to my graphics card.
- Check this PC (read-only tips) and Test Bob's speed (keeps your last 6 results).

**Full Changelog**: https://github.com/MouseWurX/Bob/compare/v1.5.24...v1.5.25

## 1.5.24

- In the Gaming session Bob is a bit sleepy: now and then he adds a short scripted aside (no extra brain work, nothing loads).

**Full Changelog**: https://github.com/MouseWurX/Bob/compare/v1.5.23...v1.5.24

## 1.5.23

- New Gaming session (was Light / gaming): keeps the graphics card completely free for games. Bob chats and listens on the processor with a small brain (Qwen3 4B), and pictures, clips, music and Medium-or-higher jobs wait in Tasks until you switch back. Effort stays on Low while Gaming is on.
- The Deep thought session is gone: Medium, High and Extreme effort do that job. A saved Deep thought session becomes Normal.
- Several pictures in one reply sit in a grid that fits the window.
- "Make another picture?" after a picture: the picture engine stays ready for 2 minutes if you say yes.
- Bob goes back to his Quick brain after each job, so the next reply is fast.
- The brain-swap animation appears above what Bob made, so the picture stays in view.

**Full Changelog**: https://github.com/MouseWurX/Bob/compare/v1.5.22...v1.5.23

## 1.5.22

- Medium effort is fast again: big brains load with a 32K context that fits a 16 GB card, llama.cpp's fit places the layers, and Medium thinks for a limited time before answering.
- Pictures show without waiting for Bob's brain to reload (Settings > Advanced, on by default).
- Picture edits keep the person: phone photos are turned upright first, Bob gives the editor a short instruction instead of a new scene, and the picture keeps its own shape instead of being forced square. Follow-ups like "make it gold" edit the last picture again.
- Smoother hand-overs between the picture engine and Bob's brains (system memory is checked too).
- New optional picture model: Z-Image Turbo (quick-load version), 11 GB. Never downloaded unless you pick it.

**Full Changelog**: https://github.com/MouseWurX/Bob/compare/v1.5.18...v1.5.22

## Earlier versions (1.0.0 to 1.5.21)

1.0.0 was Bob's first public release: chat with local models through Ollama or llama.cpp, a task queue, a download manager with pause and resume, voice samples, Sessions and Style themes, in-app updates, and Remove Bob in Settings. Versions up to 1.5.21 are listed on the [Releases](https://github.com/MouseWurX/Bob/releases) page.

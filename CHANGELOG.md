# Bob changelog

What changed in each version of Bob, newest first. Each version also has its own page, with the download, under [Releases](https://github.com/MouseWurX/Bob/releases).

This file is made from docs/releases by `node installer/make-changelog.js`.

## 1.5.142

The Computer Science Lab, part 1b: start from a template, measure before making the running files, and compare brains side by side, with the numbers saved as data.

- **Start from a template.** A new first line on the Lab page fills steps 2 to 5 from a recipe I've used before: **Lab local cut** and **Plain cut** run here. **Coverage cut and heal**, **Train the teacher** and **Learn from outside traces** need a rented card, so they're greyed out with the reason (renting is Lab 2), and **Show the recipe** prints them as a Forge plan. **Merge experts** and **Layer or width cut** are listed as not built yet. Every box can still be changed. The templates ship with Bob (`public/lab-templates.js`), so they work offline.
- **Measure before making the running files** (recommended, under Make the running files): llama-imatrix measures the cut brain itself on your lessons, and llama-quantize uses that measurement, so Q4 and Q3 files lose less. It's measured on the cut file, not the brain it came from, because the expert counts change in a cut.
- **A measurement record for every Lab test.** `measure.json` beside the new brain, and `measure-parent.json` for the brain it came from: the file's sha256, file type, experts per layer, size, template, what it was made from, the four test scores, words a second and reading speed, and the engine (it says Brain Engine when the test server has the expert switch). Missing parts are left out, never zeroed. No file paths, host names or people.
- **Compare**, under Lab jobs: tick two or more tested brains to see one table with real header cells, and a **Difference** column (the second minus the first, signed, with a percent) when there are two. **Save as CSV** and **Save as JSON** write to the Lab's compare folder. Saving only works on this replicant matrix; another device can look.
- Help: the Lab page covers templates, Measure and Compare. `test/run-lab-test.js`: 93 checks.
- Phone (Bob for Android): nothing changes; there's no Lab on the phone.

## 1.5.135

The Computer Science Lab, part 1: make your own brain from one on this replicant matrix, for free, behind a switch that is off. And the Bob-Net heading opens Bob-Net settings.

- **🧪 Computer Science Lab.** Turn on **Show the Computer Science Lab** (Settings, How Bob works, Brains) and **🧪 Lab** appears in the left pane. It walks you through five steps with checkboxes and radio buttons instead of command-line flags: **Pick a brain** (any brain you have on Bob's own engine; each says what the Lab can do to it), **Lessons** (your chats with Bob, which stay here, or a lesson set you have), **Make it smaller** (**Take out sight**, **Take out hearing**, **Cut experts** on mixture-of-experts brains, keeping the busiest ones or an expert list you have, and **Make the running files**: Q4, Q5, Q6 or Q8 from a full-size copy), **Where it runs** (this replicant matrix) and **Test and use**.
- **Every Lab brain is tested before it goes into Bob.** The Lab test asks general knowledge, picking the right tool, coding and following instructions, at temperature 0, side by side with the brain it came from if you tick that. **Use in Bob** only appears after a test, and puts the new brain in Get models next to its family, marked *made in the Lab*. Bob never makes it his main brain by himself.
- **Show the recipe** shows the exact commands the Lab is about to run (llama-imatrix, llama-quantize, llama-server, and Bob's own expert cutter, since no command-line tool does that yet), with a Copy button. **Save as recipe** keeps your choices, never file paths.
- **Bob's own cutter** cuts experts and takes a sense out of a combined picture-and-sound reader by copying the GGUF file piece by piece, so a 20 GB brain never has to fit in memory, and Bob keeps answering (and Stop works) while it copies. A stopped cut leaves nothing half-written behind.
- The Lab asks before it unloads Bob's brain to make room on the card, waits while Gaming is on, and runs one job at a time. On a replicant matrix with less than 12 GB of memory the switch is greyed out, with the reason.
- Shown greyed out as coming later (Lab 2): writing new lesson sets, recording a teacher's odds, the coverage cut, **Teach it back**, **Make it one file**, layer and width cuts, and rented cards.
- **Bob-Net heading.** In Now running, the word **Bob-Net** is now a button that opens Settings at Bob-Net (advanced shown, the section open), instead of scrolling for it.
- Help: a page "The Computer Science Lab", the Settings row, glossary lines for Computer Science Lab and Running file. New `test/run-lab-test.js` (67 checks: the cutter byte for byte on made-up brain files, the recipe checks, a whole Lab job with fake steps, Use in Bob, the switch and the words).
- Phone (Bob for Android): nothing changes; there's no Lab on the phone yet.

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
- New page: [Brain races](docs/BRAIN-RACES.md), with the full results behind the 16 GB starter set: the coding race (Qwen3.6 35B-A3B vs Qwen3 Coder 30B), the everyday chat and Office race (Qwen3.6 vs Gemma 4 26B), the live checks of Qwen3.6 at 128K, and the Deep thinking race (Qwen 3.8 27B vs Gemma 4 26B). It also lists what hasn't been measured yet, like the smaller Q3 file for 8 GB cards.
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
- New page: [Bob and similar projects](https://github.com/MouseWurX/Bob/blob/main/docs/COMPARISON.md). It's a fact-based look at how Bob differs from other local AI apps. It isn't a ranking, and it says where another tool may suit you better. The README links to it.
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
- The [performance page](https://github.com/MouseWurX/Bob/blob/main/docs/PERFORMANCE.md) has the final tool-job scores.
- Releases publish again: one test tripped over Windows line endings on GitHub's build machine, so 1.5.31 to 1.5.34 built but weren't published. This release includes all of them.

**Full Changelog**: https://github.com/MouseWurX/Bob/compare/v1.5.28...v1.5.35

## 1.5.34

- **Settings fold away:** the Settings page is now in panels you can open and close. **Bob himself** (voice, look, theme, animations, cat) starts open; **How Bob works**, **This PC and updates** and every advanced section start closed. Bob remembers which ones you leave open, searching opens the ones that match, and the advanced sections have **Open all** / **Close all**.

**Full Changelog**: https://github.com/MouseWurX/Bob/compare/v1.5.33...v1.5.34

## 1.5.33

- **Pick Bob's voice in one place:** wherever you choose his voice (the everyday Settings page, Voice & conversation, and Brains), you pick the engine and then, right next to it, the voice inside it, with **Play sample**. Kokoro shows all 22 voices; Windows shows the English voices your Windows has (or Automatic). Each Piper voice is its own download, so Piper voices are listed with the engines.
- **Download links can't go stale any more:** every model link now points at an exact, frozen version on Hugging Face instead of "the latest", so an upstream update or a renamed folder can't break a download or change a file under Bob. Five renamed folders now use their new names. A check stops any unpinned link from shipping.
- **Tool jobs work more often:** Bob's brains now use their makers' recommended settings (and a proper chat template when the file has none), and he does a job in the same reply instead of only saying he will. When web search is off, he says where the switch is. The [performance page](https://github.com/MouseWurX/Bob/blob/main/docs/PERFORMANCE.md) has a new "What testing taught us" section.

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
- The [performance page](https://github.com/MouseWurX/Bob/blob/main/docs/PERFORMANCE.md) now has the final tool-use scores for each brain.

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
- **New [performance page](https://github.com/MouseWurX/Bob/blob/main/docs/PERFORMANCE.md):** what makes Bob fast and light, with measured numbers.
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

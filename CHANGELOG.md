# Bob changelog

What changed in the newest 10 versions of Bob, newest first. Each version also has its own page, with the download, under [Releases](https://github.com/MouseWurX/Bob/releases).

This file is made from app/docs/releases by `node installer/make-changelog.js` (run in the app folder).

## 1.5.247

Rentals work again, Patches tells the steps, and the cable always wins on Bob-Net.

### Fixed

- **Renting a card works again.** RunPod retired its old address on 15 November, so every rental call failed. My rentals and the Lab's Forge now use RunPod's new address (v2) with the same key. Nothing to change on your side. (This hasn't been tried on a real rental yet.)

### New

- **Patches tells the steps.** While I work, Patches the cat reads out the steps in my thinking bubble, and I add the odd surprised remark. It's only what you see: nothing of it reaches a brain. On to start; turn it off in Settings if you'd rather not.
- **Cable always wins.** When Bobs on a cable and Bobs on Wi-Fi both offer their graphics cards, the cable Bobs share the brain. Wi-Fi and Tailscale are for when a cable isn't possible, and those Bobs still take chats and web searches.

**Where it works:** Windows, Mac, Linux and Bob for Android. Rentals and Bob-Net sharing are for computers.

## 1.5.246

Private web, one answer instead of two, and more Lab lessons.

### New

- **Private web.** In Settings, Connections, 🕶 Private web. It's off until you turn it on. Then I send only the search words, keep no cookies, take tracking bits off links, and my browser window uses a throwaway profile that blocks trackers. You can also send my web search and pages through your own proxy or Tor; if it's down, I stop instead of going direct. Gaming mode, the Lab, Bob-Net and downloads aren't touched.
- **Try other sources when one blocks me.** When a site turns me away with a block or a robot check, I never try to get past it. I skip that site for the rest of the job and read the same facts from up to 3 others, like another search result or a copy the Internet Archive already has, and I say what I skipped.
- **Lab Lessons.** Two new Engineering lessons (a held-out leak, and auditing your reviewer), a How strong line on every Real result, and a page showing where every Real result comes from.

### Fixed

- **One answer, not two.** After I said "I can't" and had one more go, or after the check that only some tool steps ran, my second answer was stacked under the first. Now only one stays: the new one if it used a tool, otherwise the first.

### Also

- The README has a privacy note under the title, a Quick start, and a table of where everything is.
- The dissertation now follows the locked tool shapes (Qwen shape 4, GPT-OSS shape 3), with new findings in chapter 8 and the rule in chapter 4.

**Where it works:** Windows, Mac, Linux and Bob for Android. Routing and the private browser window are for the desktop app.

## 1.5.245

A new default brain, a backup search with or without a key, and Settings that comes to the front.

### New

- **Bob's default brain is now stock Qwen3.6 35B-A3B; Riker and Bobert are out of the Brain catalogue (files already on a PC still run from Your own brains).** On a 16 GB card it does Brain, Coding and Deep thinking; on an 8 GB card its smaller file does the coding. On the first start after this update, a job set to Riker or Bobert moves to Qwen once, but only if Qwen's file is already on your computer.
- **Search API keys.** When the free search pages block your computer, I can ask a backup search instead: Brave Search, Marginalia, Mojeek or Tavily with your own key, or Firecrawl with no key at all. No key comes with me, and each one is off until you switch it on. Each has a monthly cap and a Test button, and a saved key is never shown again. Firecrawl gets a small free allowance a day, so I keep to 50 a day and leave it alone for the day if it says that's enough. Find it all in Settings, Connections, Search API keys.
- **Watching the router.** A new Lab lesson, and a From the research panel that cites other people's papers apart from my own results.

### Fixed

- **Pressing Settings again brings it to the front.** If Settings, the Lab, the fNRI viewer or my thinking window was already open behind other windows or minimised, pressing its button now raises it.

### In the Lab

- The heal keeps the router learning slowly, always in full precision, and can freeze it or record which experts it picks before and after.
- **Unproven in our lab, as we have yet to test:** reading the code suggests the GPT-OSS router may have been learning at the fast rate. No GPT-OSS heal has run, so no past result changes. A gate now checks the router count before any training, and the first real heal will prove it either way.

**Where it works:** Windows, Mac, Linux and Bob for Android. Bringing windows to the front is for the desktop app.

## 1.5.244

The link log tells the same time as the logbook.

### Fixed

- **The link log no longer reads an hour behind.** The Link log (the notes kept while a brain runs over another Bob's card) stamped its lines with the computer's own clock, which on some Windows PCs is an hour off from the real zone. It now uses the same time zone as the logbook, so the two always agree.

**Where it works:** Windows, Mac, Linux and Bob for Android.

## 1.5.243

Send a whole folder to your other Bob with one Yes, and Journey gets its laptop-test fixes.

### New

- **Send a whole folder over Bob-Net.** Settings, Bob-Net, Files and brains: **Pick a folder**, pick the Bob, **Send it**. He gets one Yes card for all of it (up to 2000 files) instead of one card per file, and it lands in a folder of its own with its folders inside kept as they are. Every file is checked at the end, like always. Links and empty files stay behind.
- **Journey screenshots.** The README shows six new Journey pictures in a gallery, and every screen is on its own page: the world, towns, fights, every menu and every race.

### Fixed

- **One card per offer.** A send that got no answer and was asked again could leave a second, empty Yes card on the other Bob. Now a send with no answer is taken back, the same send asked again is the same offer, and a card still waiting is swapped for the new one, never two.
- **Journey on a laptop.** A 720p window fits without scrolling, menus too. The talk box and choices are real windows with sharp words. Elf and pixie ears show with Bob's wide headset look, and the tab icons have an outline so they stand out (Pets is now 🐶).

**Where it works:** Windows, Mac, Linux and Bob for Android. Folder sending works on Windows, Mac and Linux; both Bobs need 1.5.243.

## 1.5.242

Journey plays like a proper game now: every menu lives inside the game screen.

### New

- **Every Journey menu opens inside the game.** The menu, shops, crafting, the bag, the paper doll, quests, fights, choices and New adventure all show in the blue talk box, right on the game screen.
- **A ⚙ System tab.** Save, load, sound, full screen, quit and the controls, all in one place.
- **Play with a controller.** Plug in a gamepad and Journey answers it. You can also tap the game screen to read on or to pick a choice.
- **Party size, one to four.** Pick how many travel together; rolled characters fill any empty seats.
- **You can see each race.** Races now show on the sprite and the paper doll.
- **A stat every level.** Each level up raises a stat.

**Where it works:** Windows, Mac, Linux and Bob for Android.

## 1.5.241

The Lab Lessons tell the true story, and the CS Lab gets its write-up.

### New

- **The CS Lab on the front page.** The README has a CS Lab section, a picture of how SCUT compares with plain TCP, and the full write-up of the Lab's work in 13 chapters (docs/dissertation).

### Fixed

- **Lab Lessons: the Real result panels are fact-checked.** The coding race now reads v1 8, v2 6, re-cut 9 and full Qwen 12, with a note that the cut brains kept 208 experts and the re-cut 176. A panel with an unchecked overlap figure is gone.

**Where it works:** Windows, Mac, Linux and Bob for Android.

## 1.5.240

Tool shapes are locked for GPT-OSS and Qwen, the Lab console is complete, and a security update underneath.

### Fixed

- **Security:** my window runs on Electron 44.10.1 (was 44.9.0), and an old file-matching library in the build tools is replaced with its fixed version. The security audit now finds nothing.
- **Installing an engine into a folder with a space in its name** (like Program Files) works. The installer was given the path without quotes, so Windows refused it with error 1639.

### New

- **Tool shapes locked for GPT-OSS and Qwen.** GPT-OSS keeps my own tool names and wording, which beat every other wording in its tests; list_folder and search_files now say clearly which is which. Qwen brains no longer see tools they used wrongly (ask_specialist, pick_session), and nothing points them to a tool they can't see. The tool record starts fresh for the new shapes.
- **run_command won't write files.** A command that only writes a file (like `echo > notes.txt`) is turned away before it runs, with a pointer to write_file. Programs that write their own output still run.
- **The Lab console is complete.** Every Lab job is a form in Set up, plus Pipelines, the rented-run form (only the purchase card rents), Rented cards (Look, Take over, End it), Use Bob's brain, and Lab job logs in the Server panel.
- **Lab:** a stricter lesson teacher and first filter, the lesson sandbox gets Bob's notice board, memory and logbook, an optional LibreOffice for office lessons, and step-by-step thinking for GPT-OSS heal lessons, and a fairer tool judge (looking first is fine when the action is right).

**Where it works:** Windows, Mac, Linux and Bob for Android.

## 1.5.239

I think where it helps: at the start to plan and at the end to check, not before every single step.

### Fixed

- **Think to plan and review, not on each step.** On a long job I now think at the start and when checking the result, and run the steps in between without stopping to think each time. It's on by default, and you can switch it off in Settings, How Bob works.
- **Folders ticked for Hands can be read.** With the Files Hand on, list_folder, read_file and search work in the folders you ticked for Hands, not only the read folders. Before, I could move files there but was told I wasn't allowed to look.
- **Lab: Professional mode** in Settings now stays on when you turn it on. Before, the switch was never saved.
- **GPT-OSS brains with thinking off** now really think less (low effort). Before, they always thought at medium.

### New

- **Lab, Learn, Lessons:** a 42-lesson course that walks you through the Lab step by step, from the basics to advanced work. It's off until you switch on **Lab lessons** in Settings, How Bob works, Brains.
- **Lab:** the tool tests take an effort level, and the Forge checks a plan's lessons against the lesson ledger before a heal is rented. The tool-wish test (the tools a brain reaches for when none are offered) is in the Lab kit too.

**Where it works:** Windows, Mac, Linux and Bob for Android.

## 1.5.238

Python gets real packages, my tools take the names other brains reach for, and the Lab gets stricter about what it teaches and what it rents.

### New

- **Python packages.** Under Python in Settings, How Bob works, 🧰 More tools, **Get packages** fetches numpy, pandas, scipy, matplotlib, Pillow, python-docx, openpyxl, python-pptx, pypdf and more, each pinned and checked. Nothing downloads until you press it. A run loads only what its code imports, with no internet and no other folders, and gets 60 s instead of 30.
- **`save_to` on make_image, make_sound, save_as and make_diagram** keeps a copy where you ask. It never overwrites.
- **Tool names other brains reach for** (run_shell_command, list_directory, write_to_file and friends) now run my own tool, under my name. That only happens when I have no tool by that name and the real one is on offer. The tool record starts fresh for the new tool shape; the old one is kept in the archive.
- **Lab: one lesson kit per brain family.** Lessons are stamped with the family they're for, and never cross-train.
- **Lab: a never-taught gate.** Before any plan that teaches is rented, every lesson is checked against the held-out test questions. A match, a missing test file or an unchecked set stops the plan with nothing rented.
- **Lab: pre-flight for lesson rentals.** Room per slot, the ideas file and the caps are checked in code before anything costs money, and a 10-idea sample gate ends a rental that isn't saving lessons.
- **Lab: a Riker study plan** for finding where the cruelty lives (patching and sparse-autoencoder features). It is a study record only, and it needs your typed go to rent.
- **Costs pages** show the 14 Nov rentals at their billed costs.

### Fixed

- The Forge console's buttons fit a phone screen.

**Where it works:** Windows, Mac, Linux and Bob for Android.

## Older versions

- [1.5.225 to 1.5.249](app/docs/changelog/1.5.225-1.5.249.md)
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

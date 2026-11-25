# Bob changelog

What changed in the newest 10 versions of Bob, newest first. Each version also has its own page, with the download, under [Releases](https://github.com/MouseWurX/Bob/releases).

This file is made from app/docs/releases by `node installer/make-changelog.js` (run in the app folder).

## 1.5.252

Rentals are safer, and you can pick a quant level or finish a robot check yourself.

### New

- **Pick a quant level** (Settings, How Bob works, Brains; off to start). A brain that comes in smaller files gets a Quant level menu. Every level is listed, with how it did in our tests and whether I recommend it. The choice is yours.
- **Let me finish robot checks** (Settings, Connections, Private web; off to start). When a page wants a person, I ask first, open it in my browser window and wait while you finish it. I never click or type on the check myself.

### Fixed

- **Rentals.** Your account key no longer goes onto a rented pod. A pod that vanishes or stops fails at once with the service's reason. The pod's server log is kept, and an early exit waits for it. Stopping a pod that's already gone counts as stopped.
- **Borrowing.** "Borrowing More Brains" goes away once a lending Bob takes his card back.
- **Add a rental** shows the right boxes for the service the first time it opens, and refuses a bare `.gguf` name that would start a paid pod with nothing to load.
- **A folder that isn't on my list.** When a Files or Office job needs a folder you haven't ticked, a card asks "Add it?" and I carry on once you press it.
- **Hands switched off.** If a job needs a Hand that's off, I show the Switch it on card and say plainly that nothing was done.
- **Pasted paths.** Quotes and invisible Windows marks are stripped from folder paths you paste, and Settings, Hands says why a folder wasn't added.
- **Bob-Net engine check.** Before lending a card, a Bob checks that both sides run the same engine build. The logbook says why when they don't.
- **Chat page.** The job time bar is a thin line along the bottom of the window. Clear chat is a plain button at the top right. The fade line only shows once something has faded. Gaming's unload plays the cube's letting-go animation.
- **The newest message gets the answer,** not an old ask that was stopped earlier.
- **Long jobs read faster.** I read the time once per turn, so a minute ticking over mid-job no longer makes the engine read every step again.

### Docs

- How we test brains (`docs/TESTING.md`), costs to 16 Nov, and the dissertation's new results table, direction chapter and 21 Nov harness runs.

**Where it works:** Windows, Mac, Linux and Bob for Android.

## 1.5.251

One way to pick brains, and I find your brain files every time I start.

### New

- **One brain picker.** Every brain menu follows the same rule: any brain you have can take any thinking job. Gaming and Seeing pictures still need a brain made for them. A brain that wasn't made for a job is marked, never hidden.
- **Brains page.** The Main brain row has its own picker and does every job. "+ Add a brain" makes a row for the jobs you choose. With One brain on, you just see the main row. A line shows your card, processor, memory and free drive space.
- **Catalogue.** Each brain is listed once in one Brains list, grouped by family, with the jobs it was made for.

### Fixed

- **I find brain files at every start,** and look again when my list is more than ten minutes old, so a brain you just copied in shows up.
- **gpt-oss 120B is listed once.** It had two entries for the same file.
- **Add a brain from a file is on the Brains page,** and if the window's picker comes back empty straight away, I open my own.

**Where it works:** Windows, Mac, Linux and Bob for Android.

## 1.5.250

Amnesia mode lets go again.

### Fixed

- **"Turn off and forget" works again.** A cancelled or failed task left in the Tasks list (they stay for a week) made me refuse to turn Amnesia mode off, so nothing got forgotten. Now only a task I'm running right now holds it up. The banner also says the day when Amnesia mode started on another day, so "since 5:31 PM" can't read as later today.

**Where it works:** Windows, Mac, Linux and Bob for Android.

## 1.5.249

A much bigger brain catalogue, Turbo-ready copies of stock Qwen, and big expert brains you can download.

### New

- **More brains to pick from.** 31 new brains across the Community, Naughty and Official lists. The Naughty list is other people's remixes of open brains with the refusals taken out, and it carries a warning.
- **Turbo-ready stock Qwen.** Copies of stock Qwen 35B, 27B, 9B and 4B that carry the extra layer for drafting ahead (MTP), so they can answer faster on Brain Engine.
- **Big expert brains as downloads.** GPT-OSS 120B, Qwen3-Next 80B, GLM-4.5 Air and Llama 4 Scout. A brain that comes in parts downloads every part, and its extra files sit beside part 1.
- **One card for every brain.** Every (i) in the catalogue shows the same card. Room says how well the brain splits across cards, and Here says how it would split on your setup.

### Fixed

- **Catalogue brains download my own pinned files.** I only use Ollama when you set it as your engine yourself.

None of the new brains has been tried in the Lab yet, so treat them as new.

**Where it works:** Windows, Mac, Linux and Bob for Android. The big expert brains need a big computer or several Bobs.

## 1.5.248

I hear you on my own now, there's a log of what I did if you want one, and Gaming with One brain truly leaves your card alone.

### New

- **I hear you without Ollama.** "Hearing you" uses whisper.cpp with Whisper base to start, and it's in every desktop starter set. On a Mac I hear through Gemma 4 E4B on my own engine. Gemma on Brain Engine is still a pick in Get models. If you were hearing through Ollama, I move you over once, when the new files are here. Ollama is now off unless you turn on "Use Ollama too" in Settings, Engines. With it off, I never knock on Ollama's door. Hearing pauses in Gaming mode. (Not tried on a real PC yet.)
- **Monitoring log.** Off to start. Settings, This replicant matrix. I write each turn's steps to a plain text file as each step finishes, so a crash loses at most the step that was running. "Include details" adds the tool inputs and results too, with keys and passcodes hidden and email left out. Keep this turn and Keep the current file hold on to what matters. Only the size limit drops old files, and the Lab and lessons never read them.
- **Better checks at the end of a turn.** I catch the slips I made most often in the Lab's runs: asking where a file is without looking, saying something was done when nothing did it, answers cut off mid-list, research after only one search, mail jobs done with the wrong tools, and pointing you back at something I never showed you. I get one more go to fix it, never a loop. I also won't move my own working folder, I tidy up a garbled link before reading it, and stray citation marks no longer reach you.

### Fixed

- **Gaming with One brain.** With One brain on, or when you press ✕ on the Gaming chip, no brain loads during Gaming, not even the main one. Jobs wait, and I say once that I'm paused. Other Bobs on Bob-Net can take them meanwhile.
- **Add a brain from a file opens its picker even when I'm busy.** It used to wait behind my live streams and stay greyed out. The picker now opens on the window you asked from, so Settings no longer hides it.
- **The Lab's Forge says what RunPod reports** while it waits for a rented card's door (its status, uptime and ports).

**Where it works:** Windows, Mac, Linux and Bob for Android. The Monitoring log and hearing are for computers.

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

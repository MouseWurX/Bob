# Bob changelog

What changed in the newest 10 versions of Bob, newest first. Each version also has its own page, with the download, under [Releases](https://github.com/MouseWurX/Bob/releases).

This file is made from app/docs/releases by `node installer/make-changelog.js` (run in the app folder).

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

## 1.5.237

Housekeeping gets its own brain job, you can pick how jobs are shared out between your Bobs, and the phone gets one tidy menu.

### New

- **🧹 Housekeeping is a brain job.** On the Brains page you can give it a small brain of its own, or leave it empty so it uses the main brain, which is how it starts. ✕ takes it back like any other job.
- **Each housekeeping round shows in Tasks and Now running**, so you can see when I'm tidying up a long chat while you're away, and when I'm done.
- **Pick how jobs are shared out.** In Settings, Bob-Net, under Send jobs, switch on and order the rules for picking one of your Bobs: least busy, fastest, biggest graphics card, closest, or computers before phones. You can also keep jobs on your home network or off the phone, cap how many jobs one Bob gets, and give each kind of job a first-choice Bob. A Bob you're gaming on never gets one. Left as it is, I pick just like before.
- **One menu on a phone.** At phone width the bottom bar is Chat, Tasks, + New, Topics and Bob. The Bob button or the cube opens one menu that slides up from the bottom, and Settings on a phone is two tidy lists. Wide windows are the same as before.

**Where it works:** Windows, Mac, Linux and Bob for Android.

## 1.5.236

The Lab gets a Forge console: one window for everything the Forge and the Lab run.

### New

- **Forge console in the Lab.** It sits at the top of the Forge tab, and everything the Lab runs shows up there live, never in a window you can't see.
  - **Four big buttons:** **Load model locally**, **Open rental** (you pick the brain, the cards and the caps, and only the purchase card rents), **STOP** (stops everything running here, never a rental) and **END RENTAL** (ends only that run's card).
  - **Three panels:** **Server** is the terminal, with the server log, every request and reply, and scripts. **Chat** shows the brain's replies as bubbles, with thinking folded and tool calls as cards. **Set up** has sliders and tick boxes for temperature, top-p, max tokens, thinking and more, which tools to offer, a system prompt, and forms for the Lab's jobs. Put any panel on either side, side by side or one at a time. On a phone they stack.
  - **Relay:** every request a tool sends goes through it and goes on the record. **Hold each request** lets you read it, fix it, then send or drop it.
  - Running anything needs **Let the Lab run commands here**, which stays off until you switch it on. Keys never reach the console.

**Where it works:** Windows, Mac, Linux and Bob for Android.

## 1.5.235

Bob's chat memory meter moves to where you can see it, you can take any job back from a brain, and two phone menus in Lamplight are fixed.

### New

- **Chat memory: NN%** now sits under the typing box, across from the brain label, with an (i) that says what it means. **Sum up and carry on** shows from 70%, and the reading comes back after a reload.

### Fixed

- **Brains page: take any job back.** Every job chip has a ✕ now, except the main Brain and Gaming. Quick brain, Office and Deep thinking can be taken off and show under Unassigned jobs, and Bob keeps chatting on his main brain.
- On a phone in Lamplight, the **Effort** choices float above the button, so you can see and pick them all.
- On a phone in Lamplight, the **More** menu has a solid back, so it isn't see-through.

**Where it works:** Windows, Mac, Linux and Bob for Android.

## 1.5.234

Journey gets a real quest log, and your saved land is easy to get back to.

### New

- **📜 Quests is a real quest log.** Main quest goals that update as you go, side quests from the Elders and the folk you meet, and achievements.
- **📂 Load last save** on the Save tab.

### Fixed

- **Resume shows in the guest house**, where Journey now opens, so you can get straight back to your saved land.

**Where it works:** Windows, Mac, Linux and Bob for Android.

## 1.5.233

My engine moves up to llama.cpp 1.0.

### New

- **Brain Engine 8b12359, on llama.cpp 1.0.** All my own changes to the engine came along with it, so everything I did before still works the same way, on the newest llama.cpp underneath. The plain llama.cpp I carry and the Lab's converters move to the same version.
- **Brain Engine 7 and 8 still share graphics cards.** A Bob that hasn't updated yet can still lend his card to one that has, and the other way round. Bobs on Brain Engine 6 or older can't share with them; update those first.

**Where it works:** Windows, Mac, Linux and Bob for Android.

## 1.5.232

SCUT's new speed reaches every Bob.

### Fixed

- **SCUT Auto really is 400 Mbit/s on Bobs that were already set up.** Older Bobs had saved 100, which used to be Auto's own number, and since 1.5.230 I read it as a cap you'd picked. An unpicked 100 is Auto again (400), and the one-time reset to Auto now also reaches Bob-Net's own settings, where the cap is kept. A cap you picked yourself after this update stays.

**Where it works:** Windows, Mac, Linux and Bob for Android.

## 1.5.231

A small Lab fix.

### Fixed

- **A stopped steering sweep can't spoil a brain's answers any more.** In the Lab, resetting a live brain now also clears a steering dial a stopped sweep had left turned on, which had been bending every answer after it.

**Where it works:** Windows, Mac, Linux and Bob for Android.

## 1.5.230

Settings and my cube work again with my own window bar, scrollbars wear your lamp, Bob-Net gets faster and shows who's sharing cards, and notes ride on the notice board.

### New

- **See who's sharing graphics cards.** On Bob-Net icons, a Bob lending his graphics card wears a little block puzzle piece in your look's colour, glowing while the brain he helps writes back. A Bob running a brain over other Bobs' cards has a block missing from his cube for each one. The brain line says "Lending Out Brains" or "Borrowing More Brains". Windows, Mac and Linux.
- **Chats with your other Bobs are kept on both.** A chat you start from a Bob's icon is now saved on his side too, as "From" and your Bob's name. Switch **He answers** off and he only keeps what you send, which is handy for copying text from one machine to another.
- **Scrollbars in your look.** In Lamplight they're thin and lit in your lamp's colour (Mercury, Sodium, Thallium or Neon); in Terminal they're in its own colours. Classic keeps your system's.

- **Gaming stays yours, even if you forget the Gaming button.** While a game holds 2 GB or more of a Bob's graphics card, he turns down quick replies, checks, jobs and lending his card, the same as with Gaming on. Your other Bobs do the work, or it waits. Windows and Linux with NVIDIA cards, and Windows with other cards.
- **Cable and Wi-Fi Bobs don't mix when sharing a brain.** One brain is shared by Bobs on a cable, or by Bobs on Wi-Fi or Tailscale, never both at once, because the slower link would hold the whole brain back. A Bob left out still takes whole jobs.

- **SCUT runs faster by default.** Auto is now up to 400 Mbit/s instead of 100, and it still backs off when the network is busy. After this update every Bob goes back to Auto once; pick another cap under Bigger Bobs if you like.
- **No SCUT on a cable.** When both Bobs are joined by a network cable, they share a brain straight over it; SCUT was made for Wi-Fi and isn't needed there.
- **One tool for "write it down".** With Quick notes on, my notes live on the notice board: "note: ring the vet" goes to your quick notes, "put milk on my list" goes on the board, each in its own place. With Quick notes off nothing changes.

### Changed

- **The copy card is clearer.** When you send a file or copy a brain to another Bob, the speed and time left sit on their own line, the progress bar fills the card, and the sender is named the way your Bob-Net list names him.
- **New pictures on my front page**, in the dimmer lamps with the smoke and the seven-page first-time setup.

- **Less in the way.** The Now running button under the chat is gone. Tasks is at the top, and Ctrl+J still opens Now running.

- **New defaults reach everyone once.** When a default changes, an older saved pick of it is dropped one time after the update, so you get the new way. This time it's my icon: if "Use Bob's look as his icon" was on from before, you now see the tesseract. Switch it back on in Settings and it stays.
- **Patches' word bubbles.** His antics come every 5 to 10 minutes when nothing's happening (was every 1 to 2½), and his bubble, like the Tasks bubble, is more see-through with a soft glow behind the words. It stays solid if you've asked your system for more contrast or less transparency.

### Fixed

- **Settings scrolls again** with my window buttons on my bar (since 1.5.228). On Windows the top bar, which drags the window, was catching the mouse wheel under an open page. While a page or panel is open, it no longer does, and the Settings window always keeps an ordinary title bar.
- **Clicking my cube opens my menu again** with my window buttons on my bar (since 1.5.228). The top bar's drag area was catching the click meant for the cube, and for its menu. Now only the bar's own empty space drags the window.
- **Zoom keys work on Windows and Linux.** Ctrl and + (or =) zooms in, Ctrl and - zooms out, and Ctrl and 0 puts it back, in every one of my windows.

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

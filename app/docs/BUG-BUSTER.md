# Bug Buster

Our worst bugs: what broke, why it didn't work, the code involved and what it does, and how we fixed it. Newest first. Every fix here has shipped; the full
list of smaller fixes is in the [release notes](releases/).

## 1.5.255: four bugs found on rented Linux machines

Before 1.5.255 shipped, we ran Qwen3.6 35B through Bob's own installer on rented Linux machines with a 16 GB
card. Each try found a bug the last one had hidden. Try 7 passed with no crashes. ([notes](releases/v1.5.255.md))

### The engine couldn't find its own libraries

- **What broke:** on Linux, Lamplight stopped the moment it started ("cannot open shared object file", code 127).
- **Why it didn't work:** the Linux build looked for its own library files only in the folder it was built in. Started from
  Bob's engine folder, it found nothing.
- **The code:** `libDirEnv` in `src/engine-blocked.js` builds the settings the engine starts with. It now adds the engine's folder to `LD_LIBRARY_PATH`, the list of folders Linux searches for libraries.
- **The fix:** Bob puts the engine's own folder first on `LD_LIBRARY_PATH` every time he starts it or checks
  it (Linux and Android).

### Installing the engine broke its library links

- **What broke:** with the first bug fixed, an engine Bob installed himself still stopped with
  "libggml.so.1: cannot open shared object file".
- **Why it didn't work:** Linux libraries come with short links (`libggml.so.1` points at `libggml.so.1.0.0`). Node's
  `fs.cpSync` rewrote those links to point at the side folder Bob copied from, and Bob deletes that folder
  next. Every link then pointed at nothing.
- **The code:** `copyTree` in `src/engines.js` copies a freshly unpacked engine into Bob's engine folder, file by file. A link is copied as a link, pointing exactly where it pointed before.
- **The fix:** engine folders are copied with Bob's own `copyTree`, which keeps links as they are. A test
  installs a real engine archive full of links from a fake GitHub.

### The 35B crashed at every load on a 16 GB card

- **What broke:** with a picture reader, the engine stopped at every load ("cudaMalloc failed: out of memory").
- **Why it didn't work:** the expert copy cache fills the card with experts, and the picture reader loads after that. On a
  16 GB card the cache took the room, and the reader's 858 MB had nowhere to go.
- **The code:** `readerSpareEnv` in `src/conductor.js` works out how much of the card the copy cache must leave free. `src/llamacpp.js` reads the picture reader's file size before the engine starts and passes the sum on as `LLAMA_MOE_CACHE_FILL_SPARE_MIB`.
- **The fix:** the copy cache now leaves the reader's room free: its file size plus 512 MB.

### The chat cache in RAM ran the machine out of memory

- **What broke:** partway through the jobs, the engine was killed outright.
- **Why it didn't work:** Bob sized the engine's RAM cache of chats as if only the part of the brain off the card sat in RAM.
  With the expert copy cache, every expert stays in RAM (23 GB at load), so the chat cache grew to 29 GB and the
  rented machine's 30 GB limit killed the engine. The same sums go past a 32 GB PC.
- **The code:** `ramCacheMiB` in `src/chat-places.js` picks the size passed to the engine as `--cache-ram`: half the RAM left once the brain and a 512 MB floor are set aside, at most 8 GB. `containerFreeBytes` beside it reads the container's limit from Linux's cgroup files.
- **The fix:** the whole brain counts when the copy cache is on, and in a container (Docker, a rented machine)
  Bob counts the container's own memory limit, not the host's free RAM.

## Earlier bugs

### Sharing a brain with the processor ran three times slower (Lamplight, November 22)

- **What broke:** with part of a brain of experts on the processor, writing on the test PC fell from about
  85 words a second to 24.
- **Why it didn't work:** our patch that makes the processor round like the card (0040, for matching answers) turned every
  weight row into plain numbers and ran a slow loop. One expert product was 6 to 35 times slower than stock.
- **The code:** Inside Lamplight's processor code (`ggml-cpu`), the expert product multiplies the brain's packed weights by each word's numbers. Patch 0055 reads the packed weights directly in blocks of 32, using the processor's fast vector instructions (AVX2, VNNI).
- **The fix:** patch 0055 does the same rounding with whole-number maths, the way the card does. Back to about
  85 words a second with the same words out. ([engine notes](../engine/ENGINE-MAP.md))

### A brain of experts never got its copy cache (1.5.255)

- **What broke:** GUPPI never gave a brain of experts bigger than the card its expert copy cache.
- **Why it didn't work:** Bob's brain file reader missed the expert count, so every brain looked like it had no experts.
- **The code:** `ggufInfo` in `src/gguf.js` reads a brain file's header: its layers, chat memory size and, now, `expert_count`. GUPPI uses that to decide how to place the brain.
- **The fix:** the reader finds the count. ([notes](releases/v1.5.255.md))

### An engine set up by hand on Windows was treated as plain llama.cpp (1.5.255)

- **What broke:** GUPPI never drove an engine set up by hand.
- **Why it didn't work:** PowerShell saves files with a hidden byte-order mark at the start, so Bob couldn't read the
  engine's marker file.
- **The code:** `src/llamacpp.js` reads the small marker file (`bob-brainengine.json`) that says an engine is Lamplight and which build. It now strips the mark before reading the file.
- **The fix:** the mark is skipped, and a marker that can't be read says so in the logbook.
  ([notes](releases/v1.5.255.md))

### Tool results cut on the first reply (1.5.255)

- **What broke:** a 16K-token message in a 32K chat memory was cut down on the first reply.
- **Why it didn't work:** Bob guessed the token count instead of measuring it.
- **The code:** `src/llamacpp.js` sends the text to the engine's own `/tokenize` and gets the exact count back, then cuts only what really doesn't fit.
- **The fix:** before cutting anything, Bob asks the running engine for the exact count.
  ([notes](releases/v1.5.255.md))

### Your key went onto rented machines, and vanished pods looked alive (1.5.252)

- **What broke:** a rented machine disappeared minutes after it started, and Bob kept saying "starting".
  The owner's RunPod key was also sent onto every pod.
- **Why it didn't work:** Bob never checked the pod still existed, and the pod's start-up command passed the whole key along.
- **The code:** `gone` in `src/rental.js` asks RunPod while a pod starts whether it still exists or has stopped. A failed look (a slow network) isn't counted as gone.
- **The fix:** the key stays home. A pod that vanishes or stops fails at once with the service's reason, and
  its server log is kept. ([notes](releases/v1.5.252.md))

### "Add a brain from a file" did nothing (1.5.248)

- **What broke:** the button sometimes never opened its file picker.
- **Why it didn't work:** the window keeps only six connections open to Bob at once, and Bob's live streams held them all,
  so the picker's request waited in line.
- **The code:** `electron/preload.cjs` gives the page `bobApp.pick`, and `electron/main.cjs` answers it on `bob:pick`, opening the picker on the window that asked.
- **The fix:** the picker opens straight from the window that asked, not over the network.
  ([notes](releases/v1.5.248.md))

### Every rental failed (1.5.247)

- **What broke:** every call to rent a card failed.
- **Why it didn't work:** RunPod retired its old address on 15 November.
- **The code:** `src/rental.js` holds the RunPod address every rental call goes through, now `api.runpod.io/v2`.
- **The fix:** Bob and the Lab's Forge use RunPod's new address with the same key. ([notes](releases/v1.5.247.md))

### A stopped steering sweep bent every answer after it (1.5.231)

- **What broke:** in the Lab, a brain's answers stayed odd after a steering sweep was stopped.
- **Why it didn't work:** the stopped sweep left a steering dial turned on, and resetting the brain didn't clear it.
- **The code:** A steering dial adds a small nudge to the brain's inner numbers on every word. The Lab's live reset now turns that nudge off along with everything else.
- **The fix:** resetting a live brain clears any leftover steering. ([notes](releases/v1.5.231.md))

### A small brain could wipe the notice board (1.5.222)

- **What broke:** asked to add a to-do, a small brain could rewrite the board and lose everything on it.
- **Why it didn't work:** a rewrite was accepted even when it took items off.
- **The code:** The notice board tool compares a rewrite with what's on the board, and refuses it when items would go missing that weren't asked to go.
- **The fix:** several to-dos go on together, and a rewrite that drops items is refused unless that's what
  was asked. ([notes](releases/v1.5.222.md))

### Unreadable settings were saved over (1.5.208)

- **What broke:** a settings file that wouldn't read came back empty, and the next change saved over it.
- **Why it didn't work:** a file that couldn't be read was treated as a blank one.
- **The code:** `src/saving.js` does every save: write a temp file, flush it to the disk, rename it over the old one. `src/config.js` and `src/brain-queue.js` move an unreadable file aside instead of reading it as empty.
- **The fix:** every save goes to a temp file, is flushed to the disk, then takes the real name in one step.
  A file that won't read is kept beside its old name (`.broken-` and the time) and Bob starts fresh.
  ([notes](releases/v1.5.208.md); first half in [1.5.116](releases/v1.5.116.md))

### Bob's clock fell back to UTC on Windows (1.5.207)

- **What broke:** quiet hours, reminders and logbook times were hours off.
- **Why it didn't work:** when Windows named a time zone the clock library didn't know yet, Bob fell back to UTC.
- **The code:** Bob's clock turns Windows' time zone name into an offset from UTC. When the name is unknown, it now takes the offset Windows reports.
- **The fix:** Bob uses the offset Windows itself reports. ([notes](releases/v1.5.207.md))

### A stuck brain repeated the same tool call until it ran out of steps (1.5.197)

- **What broke:** a brain could ask for exactly the same thing again and again in one reply.
- **Why it didn't work:** only some tools caught repeats.
- **The code:** The repeat guard in `src/brain.js` remembers each tool request in a reply. An exact repeat gets the first answer back, and the count starts over after Bob does something.
- **The fix:** every tool catches them. A repeat gets the first answer back, and the third makes Bob stop and
  ask. ([notes](releases/v1.5.197.md))

### Very big brains never loaded (1.5.193)

- **What broke:** a brain bigger than the card plus RAM, like gpt-oss 120B (about 63 GB) on a 16 GB card with
  32 GB of RAM, ran out of memory at load.
- **Why it didn't work:** since 1.5.90, a brain partly in RAM was read in whole when it loaded.
- **The code:** `src/llamacpp.js` picks how the engine loads a brain. A brain too big for card plus RAM is now memory-mapped: the operating system reads pieces of the file from the drive as they're needed.
- **The fix:** such a brain is read from the drive as it goes. Slow, but it runs. ([notes](releases/v1.5.193.md))

### Brains fell over on the second and third load (1.5.133)

- **What broke:** the engine crashed when a job's brain loaded.
- **Why it didn't work:** the small chat brain sat on the card with a long chat memory, and the job's brain loaded on top.
- **The code:** Bob's load check adds up what's on the card (the chat brain, its full chat memory) before a job's brain loads, and lets the chat brain off the card before it tries a load again.
- **The fix:** Bob keeps room on the card for the job's brain, counts the chat memory in full, and lets the
  small brain off the card before trying again. ([notes](releases/v1.5.133.md))

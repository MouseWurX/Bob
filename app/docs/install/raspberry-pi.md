# Bob on a Raspberry Pi or other ARM board

For a Raspberry Pi 4 or 5, or another 64-bit ARM board, running a 64-bit Linux such as Raspberry Pi OS (64-bit). A 32-bit system can't run Bob. [All the guides](README.md) · [setup picker](https://mousewurx.github.io/Bob/)

> The ARM build is made and checked on GitHub's ARM machines only. On a real board it is unproven in our lab, as we have yet to test. [Tell us how it goes](https://github.com/MouseWurX/Bob/issues).

## Install

1. **Download** `Bob-<version>-linux-arm64.AppImage` (or the `-linux-arm64.deb`, or the `-linux-aarch64.flatpak`) from the [latest release](https://github.com/MouseWurX/Bob/releases/latest).
2. **AppImage:** `chmod +x Bob-<version>-linux-arm64.AppImage`, then double-click it. It may need `libfuse2` (`sudo apt install libfuse2`). **.deb:** `sudo apt install ./Bob-<version>-linux-arm64.deb`.
3. **Pick his home folder** on the fastest drive: a USB or NVMe SSD loads brains far quicker than an SD card.
4. **Press Get Bob ready.**

## By memory

The board's processor does all the thinking; its graphics are slower than its processor for brains, so Bob doesn't use them.

| Board memory | Starter set | Brain | Also |
|---|---|---|---|
| 4 GB | Raspberry Pi or ARM board, 4 GB | Qwen3.5 2B: chats and sees pictures; keep the questions simple | Memory search |
| 8 GB or more | Raspberry Pi or ARM board, 8 GB or more | Gemma 4 E2B: chats, plans and sees pictures; keep the jobs small | Hearing you (whisper.cpp), memory search |

On a Raspberry Pi 5 a reply starts in a few seconds and comes at a few words a second (an estimate, not measured on a real board).

## Jobs and their engines

| Job | Engine |
|---|---|
| Brains | llama.cpp, ARM processor build. Lamplight has no ARM build yet. |
| Hearing you | whisper.cpp, on the processor |
| Voice | Piper or Kokoro, on the processor |
| Pictures and clips | None on the board: there's no ARM build of stable-diffusion.cpp. A Bob on Bob-Net with a card can paint for it (Send jobs). |

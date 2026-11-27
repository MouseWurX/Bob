# Bob on a Mac

For Macs with Apple Silicon (M1 or newer) on a current macOS. Intel Macs have no build. [All the guides](README.md) · [setup picker](https://mousewurx.github.io/Bob/)

> The Mac build is made and checked on GitHub's Mac machines only. On a real Mac it is unproven in our lab, as we have yet to test. [Tell us how it goes](https://github.com/MouseWurX/Bob/issues).

## Install

1. **Download** `Bob-<version>-mac-arm64.zip` from the [latest release](https://github.com/MouseWurX/Bob/releases/latest) and open it.
2. **Drag Bob into Applications.**
3. **Open Bob.** The first time, macOS stops him: open **System Settings**, **Privacy & Security**, and click **Open Anyway**. Bob is ad-hoc signed, not with a paid Apple Developer ID ([why](../../../.github/CONTRIBUTING.md#signed-mac-builds)).
4. **Pick his home folder** for models. Not an iCloud Drive folder: every model would be uploaded.
5. **Press Get Bob ready.**

## By memory

A Mac shares one pool of memory between the processor and the graphics. Bob counts about two thirds of it as graphics memory (three quarters from 36 GB up) and picks the set for that size.

| Mac memory | Counts as | Starter set | Main brain | Pictures |
|---|---|---|---|---|
| 8 GB | 5 GB | 6 GB card | Qwen3 4B Instruct | Z-Image Turbo (6 GB card version) |
| 16 GB | 10 GB | 8 GB card | Gemma 4 E4B, plus Qwen3.6 35B-A3B (8 GB card version) for coding | Z-Image Turbo (8 GB card version) |
| 18 or 24 GB | 12 or 16 GB | 16 GB card or more | Qwen3.6 35B-A3B | Z-Image Turbo |
| 32 GB or more | 21 GB or more | 16 GB card or more | Qwen3.6 35B-A3B | Z-Image Turbo |

On 18 and 24 GB Macs the 23 GB Qwen3.6 35B-A3B doesn't fit in the graphics share, so part of it is read from the drive and replies are slower; Gemma 4 E4B is the quicker everyday pick there. How well each size runs on a real Mac is unproven in our lab, as we have yet to test.

## Jobs and their engines

| Job | Engine | Note |
|---|---|---|
| Brains | llama.cpp with Metal | Lamplight has no Mac build yet, so its extras, such as the Lab's expert switch, aren't on a Mac. |
| Pictures, edits and clips | stable-diffusion.cpp with Metal | |
| Hearing you | Gemma 4 E4B | There's no Mac download of whisper.cpp, so a small brain listens instead. |
| Voice | Kokoro | Piper's last Mac build doesn't start on current macOS. |
| Music and sound effects | Audio tools (ACE-Step, AudioLDM 2) | Optional. |
| Picture to 3D | Not on a Mac | Needs an NVIDIA card: send the job to a PC Bob over Bob-Net. |
| Office files | LibreOffice from libreoffice.org, FFmpeg from Homebrew (`brew install ffmpeg`) | Bob finds them himself. |

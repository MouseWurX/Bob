# Bob on a Windows PC

For Windows 10 or 11, 64-bit, on a desktop PC. Laptops with a small card have [their own guide](laptop.md), and so do [handheld PCs](handheld.md). [All the guides](README.md) · [setup picker](https://mousewurx.github.io/Bob/)

## Install

1. **Download** `Bob-<version>-win-x64.zip` from the [latest release](https://github.com/MouseWurX/Bob/releases/latest).
2. **Unblock it:** right-click the zip, **Properties**, tick **Unblock**, **OK**. If Windows shows "Windows protected your PC", click **More info**, then **Run anyway**.
3. **Unzip** it into a folder that stays put (not Downloads, not a cloud-synced folder).
4. **Start Bob:** double-click **Bob.exe**.
5. **Pick his home folder** for models: any drive with 30 to 100 GB free. A fast SSD loads brains quicker.
6. **Press Get Bob ready.** Bob shows the set he suggests for the card he found. Untick anything unwanted first.

Bob needs no admin rights and installs no services or drivers. **Windows 11 with Smart App Control on** may block him, because Bob isn't code signed yet: read [the warning in the README](../../../README.md#windows-11-smart-app-control) before changing anything.

## By graphics card

| Card | Engine for brains | Pictures and clips | In our lab |
|---|---|---|---|
| **NVIDIA** | Lamplight on llama.cpp's CUDA build | stable-diffusion.cpp, CUDA build | Tested (RTX 5070 Ti, 16 GB) |
| **AMD Radeon** | Lamplight on llama.cpp's Vulkan build | stable-diffusion.cpp, Vulkan build | Unproven in our lab, as we have yet to test |
| **Intel Arc** | Lamplight on llama.cpp's Vulkan build | stable-diffusion.cpp, Vulkan build | Unproven in our lab, as we have yet to test |
| **No graphics card** | Lamplight on the processor | Not in the starter set | Unproven in our lab, as we have yet to test |

- **NVIDIA:** keep the driver up to date (GeForce Experience, the NVIDIA app, or nvidia.com). Bob brings his own CUDA runtime; there's no CUDA Toolkit to install.
- **AMD and Intel:** keep the graphics driver up to date; Vulkan comes with it. A few of Lamplight's speed tricks (3-bit and 2-bit chat memory, the expert doorbell) have CUDA code only, so they stay off on Vulkan.
- **No card:** Bob chats, plans, researches, reads pictures and speaks on the processor, with Gemma 4 E4B. Painting and clips are left out because they would take too long. Another Bob on Bob-Net with a card can paint for him.
- **Picture to 3D** (TRELLIS.2) needs an NVIDIA card. 16 GB is best.

## By size

| Graphics memory | Starter set | Main brain | Coding | Pictures |
|---|---|---|---|---|
| Under 5 GB, or none | Processor only | Gemma 4 E4B | (the same brain) | none |
| 5 or 6 GB | 6 GB card | Qwen3 4B Instruct | Qwen2.5 Coder 7B | Z-Image Turbo (6 GB card version) |
| 7 to 11 GB | 8 GB card | Gemma 4 E4B | Qwen3.6 35B-A3B (8 GB card version), ticked, mostly in memory | Z-Image Turbo (8 GB card version) |
| 12 to 15 GB | 16 GB card or more | Underdog Saluki 27B, Bob's pick on the Brains page (all on the card, 128K tokens in mind) | (the same brain) | Z-Image Turbo |
| 16 GB or more | 16 GB card or more | Qwen3.6 35B-A3B, up to 256K tokens in mind | (the same brain) | Z-Image Turbo |

**Memory (RAM):** 32 GB is what the 16 GB set is tested with. Qwen3.6 35B-A3B is a 23 GB file, so on a 12 or 16 GB card part of it sits in memory. On a 12 GB card Bob leaves it unticked, because the catalog asks 16 GB for it, and recommends Underdog Saluki 27B instead: a 7.9 GB brain that fits the card and keeps 128K tokens in mind. It passed 56 of Bob's 65 held-out jobs on a rented card, against 49 for stock Qwen3.6 35B-A3B. It's under CC BY-NC 4.0, so it's not for commercial use. Get it from the Brains page. With only 16 GB of memory, part of it is read from the drive, which is slower. On 24 GB cards and up the whole brain fits on the card. The full table, with every size, is in [Which brain for which size](sizes.md).

## Jobs and their engines

| Job | Engine |
|---|---|
| Brains | Lamplight (Bob's own engine), see the card table above |
| Hearing you | whisper.cpp, on the processor |
| Voice | Kokoro (or Piper), on the processor. Chatterbox, which can copy a voice, uses about 4 GB of the card |
| Pictures, edits and clips | stable-diffusion.cpp |
| Music and sound effects | Audio tools (ACE-Step, AudioLDM 2), optional, about 12 GB |
| Picture to 3D | 3D workshop (TRELLIS.2), NVIDIA only, optional, about 28 GB |

Every engine is fetched from its official release, pinned and checked, only when **Get** or **Get Bob ready** is pressed. Settings, Engines lists them.

## For gamers

The brain unloads when idle. A **Gaming session** keeps the brain on the processor and leaves the card to the game, and **Games first** has Bob use fewer processor cores. [The measurements](../PERFORMANCE.md).

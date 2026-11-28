# Bob on a handheld PC

For Windows handhelds with built-in graphics: Lenovo Legion Go, ASUS ROG Ally and Ally X, MSI Claw and the like. The Steam Deck runs SteamOS, which is Linux: see [Linux](linux.md). Thin laptops with built-in graphics only get the same set. [All the guides](README.md) · [setup picker](https://mousewurx.github.io/Bob/)

> Tested: a 16 GB Legion Go runs Bob in our lab for chat and Bob-Net. Pictures and clips on a handheld, and every other handheld, are unproven in our lab, as we have yet to test.

## Install

The same as [Windows](windows.md): unblock the zip, unzip it, start **Bob.exe**, pick his home folder, press **Get Bob ready**. Then:

- **Plug it in** while Bob works. On battery the chip slows down.
- **Close games and the browser** before the first big download and the first brain load. Built-in graphics share the handheld's memory with everything else.

## How memory works here

Built-in graphics have no memory of their own: they borrow from the handheld's memory. Bob reads how much is set aside for graphics and how much more they can borrow, and picks from that. The starter set is made for that: small brains that load quickly and leave room for Windows.

| Memory | Main brain | Coding | Pictures | Extra brains, left unticked |
|---|---|---|---|---|
| 16 GB (Legion Go, ROG Ally, MSI Claw) | Qwen3 4B Instruct | Qwen2.5 Coder 7B | Z-Image Turbo (6 GB card version), a few minutes a picture | none |
| 24 GB (ROG Ally X) | Qwen3 4B Instruct | Qwen2.5 Coder 7B | Z-Image Turbo (6 GB card version) | none |
| 32 GB or more | Qwen3 4B Instruct | Qwen2.5 Coder 7B | Z-Image Turbo (6 GB card version) | Gemma 4 26B (Office and Deep thinking), Qwen 3.8 27B (Deep thinking, a few words a second) |

Gemma 4 E4B sees pictures and loads only for that job. Clips are very slow on built-in graphics, so the clip maker is left unticked.

## Jobs and their engines

| Job | Engine |
|---|---|
| Brains | Lamplight on llama.cpp's Vulkan build, on the built-in graphics |
| Pictures, edits and clips | stable-diffusion.cpp, Vulkan build |
| Hearing you | whisper.cpp, on the processor |
| Voice | Kokoro (or Piper), on the processor |
| Picture to 3D | Not here: it needs an NVIDIA card |

## A handheld with a bigger Bob

A handheld is a good second Bob. With **Bob-Net** on, it can borrow the PC Bob's brain for a reply, send him a picture to paint, or have him check harder work, over the home network or Tailscale. A **Gaming session** keeps Bob's brain off the graphics while a game runs.

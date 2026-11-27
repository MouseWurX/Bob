# Bob on a laptop with a small graphics card

For laptops with a 4 to 8 GB graphics card, the kind most gaming and creator laptops have. A laptop with built-in graphics only gets the same set as a [handheld](handheld.md). Installing is the same as on [Windows](windows.md) or [Linux](linux.md). [All the guides](README.md) · [setup picker](https://mousewurx.github.io/Bob/)

> Tested: a laptop with a 6 GB RTX 3060 and 32 GB of memory runs Bob in our lab. Other laptop cards are unproven in our lab, as we have yet to test.

## Before Get Bob ready

- **Plug it in.** On battery, laptops slow the card and processor down a lot.
- **Set Windows to Best performance** (Settings, System, Power).
- **Check the card's memory:** Task Manager, Performance, the NVIDIA (or AMD) GPU, "Dedicated GPU memory". Laptop cards often have less than the desktop card with the same name: an RTX 3060 Laptop GPU has 6 GB, not 12.

## By size

| Card | Starter set | Main brain | Coding | Pictures |
|---|---|---|---|---|
| 4 GB (RTX 3050 Laptop and the like) | Processor only | Gemma 4 E4B, partly on the card | (the same brain) | none |
| 6 GB (RTX 3060 Laptop, RTX 2060) | 6 GB card | Qwen3 4B Instruct, all on the card | Qwen2.5 Coder 7B | Z-Image Turbo (6 GB card version) |
| 8 GB (RTX 4060, 4070, 5070 Laptop) | 8 GB card | Gemma 4 E4B, all on the card | Qwen3.6 35B-A3B (8 GB card version), mostly in memory | Z-Image Turbo (8 GB card version) |
| 12 GB or more (RTX 4080 Laptop and up) | 16 GB card or more | Qwen3.6 35B-A3B, card and memory | (the same brain) | Z-Image Turbo |

On 6 GB, Qwen3 4B leaves room on the card for longer chats. Pictures take about 1 to 2 minutes and clips a long time (rough guesses, not measured on a 6 GB card yet); the clip maker is left unticked. Bob puts his brain away while he paints, so chat waits until the picture is done.

**Memory:** 16 GB is enough for the 6 GB set. 32 GB helps the 8 GB set's coder, which keeps most of itself in memory.

## Two laptops, or a laptop and a PC

With **Bob-Net** on, a laptop can send big jobs (a picture, a long piece of code) to a Bob with a bigger card on the same network or over Tailscale, and carry on chatting meanwhile. Splitting one brain across a laptop and a handheld isn't worth it: in our lab the laptop alone was faster.

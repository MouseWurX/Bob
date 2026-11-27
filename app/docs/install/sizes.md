# Which brain for which size

<!-- Made by installer/install-guides.js from catalog.json and android/phone-models.json. Don't edit by hand: change the catalog, then run node installer/install-guides.js. -->

Bob picks a starter set from the graphics memory (or, without a card, the memory) he finds. This table is the same pick, worked out ahead of time. Nothing downloads until you press **Get Bob ready**, and every pick can be changed on the Brains page.

Graphics memory is what the card has (Task Manager, Performance, GPU, "Dedicated GPU memory" on Windows). A Mac counts about two thirds of its memory as graphics memory, three quarters from 36 GB up.

| Your device | Starter set | Main brain (where it lives) | Coding | Pictures |
|---|---|---|---|---|
| No graphics card | No graphics card (processor only) | Gemma 4 E4B (5.2 GB, in memory, on the processor) | - | none |
| 4 GB card | No graphics card (processor only) | Gemma 4 E4B (5.2 GB, card + memory) | - | none |
| 6 GB card | 6 GB card (most laptops) | Qwen3 4B Instruct 2507 (2.5 GB, on your card) | Qwen2.5 Coder 7B | Z-Image Turbo (6 GB card version) |
| 8 GB card | 8 GB card | Gemma 4 E4B (5.2 GB, on your card) | Qwen3.6 35B-A3B (8 GB card version) | Z-Image Turbo (8 GB card version) |
| 10 GB card | 8 GB card | Gemma 4 E4B (5.2 GB, on your card) | Qwen3.6 35B-A3B (8 GB card version) | Z-Image Turbo (8 GB card version) |
| 12 GB card | 16 GB card or more | Qwen3.6 35B-A3B (23 GB, card + memory) | same brain | Z-Image Turbo |
| 16 GB card | 16 GB card or more | Qwen3.6 35B-A3B (23 GB, card + memory) | same brain | Z-Image Turbo |
| 24 GB card or more | 16 GB card or more | Qwen3.6 35B-A3B (23 GB, on your card) | same brain | Z-Image Turbo |
| Built-in graphics, 16 GB memory | Built-in graphics (handhelds and thin laptops) | Qwen3 4B Instruct 2507 (2.5 GB, shared memory) | Qwen2.5 Coder 7B | Z-Image Turbo (6 GB card version) |
| Built-in graphics, 32 GB memory | Built-in graphics (handhelds and thin laptops) | Qwen3 4B Instruct 2507 (2.5 GB, shared memory) | Qwen2.5 Coder 7B | Z-Image Turbo (6 GB card version) |
| Mac, 8 GB | 6 GB card (most laptops) | Qwen3 4B Instruct 2507 (2.5 GB, in memory) | Qwen2.5 Coder 7B | Z-Image Turbo (6 GB card version) |
| Mac, 16 GB | 8 GB card | Gemma 4 E4B (5.2 GB, in memory) | Qwen3.6 35B-A3B (8 GB card version) | Z-Image Turbo (8 GB card version) |
| Mac, 24 GB | 16 GB card or more | Qwen3.6 35B-A3B (23 GB, memory + storage) | same brain | Z-Image Turbo |
| Mac, 32 GB or more | 16 GB card or more | Qwen3.6 35B-A3B (23 GB, memory + storage) | same brain | Z-Image Turbo |
| Raspberry Pi, 4 GB | Raspberry Pi or ARM board, 4 GB | Qwen3.5 2B (1.9 GB, in memory, on the processor) | - | none |
| Raspberry Pi, 8 GB or more | Raspberry Pi or ARM board, 8 GB or more | Gemma 4 E2B (3.4 GB, in memory, on the processor) | - | none |
| Android, 6 GB | Phone brain | Gemma 4 E2B (2.8 GB, on the phone) | - | none |
| Android, 8 GB or more | Phone brain | Gemma 4 E2B (2.8 GB, on the phone) | - | none |

Rows assume 32 GB of memory with a card of 6 to 16 GB, 16 GB with a smaller card or none, and 64 GB with 24 GB or more. A 12 GB card gets the 16 GB set, with more of the brain kept in memory. Cards of 24 GB and more get the 16 GB set too; bigger brains are on the Brains page.

Only the 16 GB card, the 6 GB laptop card, the 16 GB handheld and the 8 GB Android phone have run in our lab. Every other row is unproven in our lab, as we have yet to test.

Pick your own device in the [setup picker](picker.html) for the full list, the engines and the steps. The guide for each kind of device is in [the install guides](README.md).

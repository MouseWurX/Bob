# Installing Bob

One guide for each kind of device. Pick yours, or use the **[setup picker](https://mousewurx.github.io/Bob/)** ([its source](picker.html)): set the kind of device and its memory, or pick it from a list of known devices, and it shows the download, the steps, the brains Bob starts with and the engine for each job. The picker and [Which brain for which size](sizes.md) are made from Bob's own catalog, so they give the same picks as **Get Bob ready**.

| Device | Download | Guide | In our lab |
|---|---|---|---|
| **Windows PC** (NVIDIA, AMD, Intel or no card) | `win-x64.zip` | [Windows](windows.md) | Tested with NVIDIA. AMD, Intel and processor-only are unproven in our lab, as we have yet to test. |
| **Linux PC** (CUDA, Vulkan or processor) | `.AppImage`, `.deb` or `.flatpak` | [Linux](linux.md) | Lamplight tested on rented NVIDIA Linux machines; the desktop app is checked on GitHub's machines only. |
| **Mac** (Apple Silicon, M1 or newer) | `mac-arm64.zip` | [Mac](mac.md) | Checked on GitHub's Mac machines only. |
| **Laptop with a small card** (4 to 8 GB) | `win-x64.zip` | [Laptops](laptop.md) | Tested on a 6 GB RTX 3060 laptop. |
| **Handheld PC** (Legion Go, ROG Ally, MSI Claw) | `win-x64.zip` | [Handhelds](handheld.md) | Tested on a 16 GB Legion Go. |
| **Raspberry Pi and ARM boards** | `linux-arm64.AppImage` or `.deb` | [Raspberry Pi](raspberry-pi.md) | Checked on GitHub's ARM machines only. |
| **Android phone or tablet** | `android.apk` | [Android](android.md) | Tested on an 8 GB phone. |
| **iPhone and iPad** | Nothing today; an app is coming | [iPhone and iPad](iphone.md) | The phone screen in Safari is unproven in our lab, as we have yet to test. |

Downloads are on the [latest release](https://github.com/MouseWurX/Bob/releases/latest), each with a `.sha256` checksum.

## By size

| Graphics memory | Starter set | Main brain |
|---|---|---|
| No card, or under 5 GB | Processor only | Gemma 4 E4B |
| 5 or 6 GB | 6 GB card | Qwen3 4B Instruct |
| 7 to 11 GB | 8 GB card | Gemma 4 E4B, with Qwen3.6 35B-A3B (8 GB card version) for coding |
| 12 to 15 GB | 16 GB card or more | Underdog Saluki 27B (Bob's pick on the Brains page, not for commercial use) |
| 16 GB or more | 16 GB card or more | Qwen3.6 35B-A3B |
| Built-in graphics | Built-in graphics | Qwen3 4B Instruct (plus Gemma 4 26B to pick with 32 GB of memory) |

Every row, with Macs, boards and phones, is in [Which brain for which size](sizes.md).

## The same on every device

- **Nothing big downloads until it's pressed.** Bob suggests a set for the hardware he finds; every model can be unticked first.
- **Bob's home folder** holds his models (10 to 60 GB). It can be on any drive. A cloud-synced folder works but uploads every model, so Bob advises against it.
- **Lamplight** is Bob's own engine for brains, built on llama.cpp. It runs on Windows and Linux PCs; Macs and ARM boards use plain llama.cpp until Lamplight has builds for them.
- **Bob-Net** lets a small device lean on a bigger one: a phone, handheld or Pi can send a job to the PC Bob over Tailscale.
- **Something didn't work, or worked well?** [Open an issue](https://github.com/MouseWurX/Bob/issues) with the device and what happened. Reports from hardware we don't have are the most useful thing there is.

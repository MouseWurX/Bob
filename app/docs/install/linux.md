# Bob on a Linux PC

For 64-bit Linux on an x86 PC (Ubuntu, Debian, Mint, Pop!_OS, Fedora, Arch and the rest). A Raspberry Pi or other ARM board has [its own guide](raspberry-pi.md). [All the guides](README.md) · [setup picker](https://mousewurx.github.io/Bob/)

> Lamplight runs on rented Linux machines with NVIDIA cards for our brain tests. The desktop app on a Linux PC is checked on GitHub's machines only, so on a real desktop it is unproven in our lab, as we have yet to test. [Tell us how it goes](https://github.com/MouseWurX/Bob/issues).

## Install: pick one kind

| Kind | Install | Notes |
|---|---|---|
| **AppImage** (any distro) | `chmod +x Bob-<version>-linux-x86_64.AppImage`, then double-click it or run it | Nothing is installed. An older distro may need `libfuse2` (`sudo apt install libfuse2`). |
| **.deb** (Ubuntu, Debian, Mint, Pop!_OS) | `sudo apt install ./Bob-<version>-linux-amd64.deb` | Adds Bob to the app menu. |
| **Flatpak** (any distro with Flatpak) | `flatpak install --user ./Bob-<version>-linux-x86_64.flatpak` | Sandboxed, so a few Hands that reach outside Bob's folders do less. |

All three are on the [latest release](https://github.com/MouseWurX/Bob/releases/latest). **Update Bob** in Settings fetches the same kind. Then start Bob, pick his home folder for models (30 to 100 GB free, an SSD is best) and press **Get Bob ready**.

## By graphics

| Graphics | Engine for brains | Pictures and clips | Set up first |
|---|---|---|---|
| **NVIDIA (CUDA)** | Lamplight on llama.cpp's CUDA build | stable-diffusion.cpp, Vulkan build | The NVIDIA driver (`nvidia-smi` should list the card). Bob brings his own CUDA runtime. |
| **AMD or Intel (Vulkan)** | Lamplight on llama.cpp's Vulkan build | stable-diffusion.cpp, Vulkan build | Mesa's Vulkan drivers (`vulkaninfo --summary` should list the card). |
| **Built-in graphics** (AMD APUs, Steam Deck) | Lamplight on llama.cpp's Vulkan build | stable-diffusion.cpp, Vulkan build | Mesa's Vulkan drivers. Gets the set for built-in graphics, as on a [handheld](handheld.md). |
| **Processor only** | Lamplight on the processor | Not in the starter set | Nothing. |

Only NVIDIA has run in our lab, on rented machines. Vulkan, built-in graphics and processor-only are unproven in our lab, as we have yet to test. stable-diffusion.cpp posts no Linux CUDA build, so pictures use Vulkan on every card. A few of Lamplight's speed tricks have CUDA code only and stay off on Vulkan.

## By size

The same picks as on Windows: under 5 GB or no card gets the processor set (Gemma 4 E4B), 5 to 6 GB the 6 GB set (Qwen3 4B Instruct), 7 to 11 GB the 8 GB set (Gemma 4 E4B, plus the 8 GB card version of Qwen3.6 35B-A3B for coding), and 12 GB or more the 16 GB set (Qwen3.6 35B-A3B). On 12 to 15 GB Bob's pick on the Brains page is Underdog Saluki 27B, which fits the card (not for commercial use). Every row: [Which brain for which size](sizes.md).

## Jobs and their engines

| Job | Engine |
|---|---|
| Hearing you | whisper.cpp, on the processor |
| Voice | Kokoro or Piper, on the processor; Chatterbox on the card |
| Music and sound effects | Audio tools (ACE-Step, AudioLDM 2), optional |
| Picture to 3D | 3D workshop (TRELLIS.2), NVIDIA only, optional |
| Office files and converting | Install LibreOffice and FFmpeg from the software centre (`sudo apt install libreoffice ffmpeg`); Bob finds them himself |

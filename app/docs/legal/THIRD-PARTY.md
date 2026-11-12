# Third-party software

## Shipped with Bob

| Part | Where | Licence |
| --- | --- | --- |
| Mermaid 11.17.2 (draws diagrams; with the libraries bundled into its build, such as D3 and DOMPurify) | `public/vendor/mermaid.min.js` (and the phone app's `assets/www/vendor/`) | MIT (`public/vendor/mermaid-LICENSE.txt`) |
| KaTeX 0.19.1 (draws maths formulas; its fonts in woff2 only) | `public/vendor/katex/` (and the phone app's `assets/www/vendor/katex/`) | MIT (`public/vendor/katex/katex-LICENSE.txt`) |
| IBM Plex Mono (font) | `public/fonts/` | SIL Open Font License 1.1 (`public/fonts/IBM-Plex-Mono-OFL.txt`) |
| Chat templates for model families (Gemma 4, GPT-OSS, Qwen) | `src/templates/` | Apache-2.0 (from each model's publisher), collected by llama.cpp (MIT); see `src/templates/README.md` |
| SCOWL word lists by Kevin Atkinson (the 🧩 Games dictionary: English words of 3 to 12 letters from sizes up to 40, five-letter words up to 50) | `src/games-dict.js` | SCOWL licence: "Copyright 2000-2016 by Kevin Atkinson. Permission to use, copy, modify, distribute and sell these word lists, the associated scripts, the output created from the scripts, and its documentation for any purpose is hereby granted without fee, provided that the above copyright notice appears in all copies and that both that copyright notice and this permission notice appear in supporting documentation. Kevin Atkinson makes no representations about the suitability of this array for any purpose. It is provided \"as is\" without express or implied warranty." Its sources (Moby Words II, the UK English Wordlist with Frequency Classification and others) are public domain or allow this; the full notice is at wordlist.aspell.net |
| Electron (Chromium and Node.js inside it) | the release zip: `Bob.exe` and the files beside it, Electron's official build, unchanged | MIT, with Chromium's notices in `LICENSES.chromium.html` in the same folder |

The font, Mermaid, KaTeX, the chat templates and Electron are separate works distributed alongside Bob, not combined into his code, so
their licences sit beside the GPL. Bob's own code has no runtime npm dependencies.

## Downloaded only when you click

Bob's download carries one of these: a basic build of llama.cpp (MIT; Vulkan on Windows and Linux, Metal on a
Mac, with its licence file), unchanged from its GitHub release and checked against GitHub's sha256. The rest are
fetched only when you press their button, after a confirm that shows their size and licence. Each runs as a
separate program:

| Part | Licence |
| --- | --- |
| llama.cpp, whisper.cpp, stable-diffusion.cpp | MIT |
| Piper (voice engine) | MIT. Each Piper voice has its own data licence on its model card; some are personal use only, and Bob marks those |
| Kokoro-82M (voices) | Apache-2.0; kokoro-onnx: MIT |
| Chatterbox | MIT |
| ACE-Step 1.5 | MIT |
| ComfyUI (optional workshop, separate install) | GPL-3.0 |
| Ollama (optional, separate install) | MIT |
| OpenSCAD (Let Bob make 3D parts; official build from files.openscad.org, pinned with its sha256, or one already installed) | GPL-2.0-or-later |
| 3D workshop (Let Bob turn pictures into 3D models): TRELLIS.2 code and weights, o-voxel, CuMesh, FlexGEMM, utils3d | MIT (Microsoft; Jianfeng Xiang; Ruicheng Wang). Eigen inside o-voxel: MPL-2.0 |
| 3D workshop: nvdiffrast and nvdiffrec (texture painting) | NVIDIA Source Code License: **non-commercial use only**; Bob says so on the Get card |
| 3D workshop: BiRefNet background remover (ZhengPeng7/BiRefNet) | MIT (used in place of RMBG-2.0, which is non-commercial) |
| 3D workshop: DINOv3 picture reader (Meta's facebook/dinov3-vitl16-pretrain-lvd1689m, from the exact ungated copy camenduru/dinov3-vitl16-pretrain-lvd1689m, which carries Meta's licence file) | DINOv3 License (Meta): use and redistribution allowed with the licence; no military, weapons or ITAR uses |
| Models in the model shop | each entry in `catalog.json` lists its licence and whether commercial use is allowed |

Bob leaves out models whose licences forbid commercial use where a good alternative exists (for example
F5-TTS and XTTS are not offered).

## Development only

`electron` and `electron-builder` (MIT) in `devDependencies`, used only for `npm start` and the optional
portable exe.

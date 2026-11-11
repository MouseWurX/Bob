# Third-party software

## Shipped with Bob

| Part | Where | Licence |
| --- | --- | --- |
| Mermaid 11.17.2 (draws diagrams; with the libraries bundled into its build, such as D3 and DOMPurify) | `public/vendor/mermaid.min.js` (and the phone app's `assets/www/vendor/`) | MIT (`public/vendor/mermaid-LICENSE.txt`) |
| IBM Plex Mono (font) | `public/fonts/` | SIL Open Font License 1.1 (`public/fonts/IBM-Plex-Mono-OFL.txt`) |
| Chat templates for model families (Gemma 4, GPT-OSS, Qwen) | `src/templates/` | Apache-2.0 (from each model's publisher), collected by llama.cpp (MIT); see `src/templates/README.md` |
| Electron (Chromium and Node.js inside it) | the release zip: `Bob.exe` and the files beside it, Electron's official build, unchanged | MIT, with Chromium's notices in `LICENSES.chromium.html` in the same folder |

The font, Mermaid, the chat templates and Electron are separate works distributed alongside Bob, not combined into his code, so
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
| Models in the model shop | each entry in `catalog.json` lists its licence and whether commercial use is allowed |

Bob leaves out models whose licences forbid commercial use where a good alternative exists (for example
F5-TTS and XTTS are not offered).

## Development only

`electron` and `electron-builder` (MIT) in `devDependencies`, used only for `npm start` and the optional
portable exe.

# Signing Bob's Windows files, and Smart App Control

Windows 11's **Smart App Control** stops program files (`.exe`, `.dll`) that Windows doesn't know yet, unless they carry a signature from a certificate Microsoft trusts. Nobody can add an exception. It starts in a quiet trial mode and can switch itself on later without saying so. Bob never changes it.

"Knows" means Microsoft's cloud has seen the exact same file run safely on many PCs. That's why an **unchanged** official file usually runs even without a signature, and a file **we build ourselves** might not. Each new build is a new file, so Windows has to guess. In 1.5.203 it guessed no for the new Brain Engine.

## What Bob ships or downloads for Windows

| What | Who builds it | Signed? | Risk |
|---|---|---|---|
| Bob.exe in the release zip | Electron's own `electron.exe`, unchanged and renamed | No, but it's the same file in every Electron app of that version | Low |
| Bob.exe from source (`signed-build` job) | Us, with electron-builder | Only once signing is set up | High until signed |
| Built-in llama.cpp | ggml-org's official zip, unchanged | No, but widely used | Low |
| **Brain Engine** (`llama.dll`, `llama-server.exe`, `ggml-rpc*.dll`, the Lab tools) | **Us** (`brain-engine.yml`) | **No** | **High: each rebuild is new to Windows** |
| CUDA runtime DLLs | NVIDIA | Yes | None |
| stable-diffusion.cpp, whisper.cpp, Piper, FFmpeg | Their projects | Mostly no | Low to medium |
| LibreOffice, Python, Ollama | Their projects | Yes | None |
| 3D workshop add-ons (OpenSCAD, TRELLIS.2 build) | OpenSCAD / us | OpenSCAD: check; ours: no | Medium / high |

`node installer/check-signed.js <folder>` lists the unsigned Windows files in any folder. It reads the files' headers and runs nothing.

## What Bob does about it (1.5.203 and 1.5.204)

1. **Falls back when a block happens** (1.5.203). If Windows stops the engine, Bob goes back to the previous engine by himself, says so once, and offers Try again.
2. **Tries before trusting** (1.5.204). A new thinking engine runs once in its side folder (`llama-server --list-devices`) before it takes the old one's place. If Windows stops it, or it can no longer see the graphics card the old one could (a stopped card library), the old one stays and Bob explains why. Nothing breaks.
3. **Doesn't fetch a blocked build again**. The stopped build is remembered by its file. A rebuilt or signed one is still fetched.
4. **Check this PC shows Smart App Control** (on, trial mode or off) in plain words, with the reminder that Bob never changes it.
5. **The release check lists unsigned files**. `brain-engine.yml` puts the list in each build's summary. Once signing is set up, the repository variable `REQUIRE_SIGNED=true` makes an unsigned file fail the build before anything is released.
6. **Change as few files as possible**. Brain Engine only replaces the llama files and the card-sharing file. The card libraries (`ggml-cuda.dll` and the rest) stay the official ones, which Windows already knows. Keep it that way.

## Signing: the only sure fix

A signature from a certificate in Microsoft's Trusted Root Program lets Smart App Control check the signer instead of guessing. Options, cheapest first:

- **SignPath Foundation** (free for open source): not approved yet. Apply again once Bob is better known. `build.yml` already has the job, behind `SIGNPATH_ENABLED`.
- **Microsoft Artifact Signing** (formerly Trusted Signing): about US$10 a month for the Basic tier. Individual developers in Canada and the US can use it after an identity check. It signs from GitHub Actions with Microsoft's own action, and Microsoft's certificate is trusted by Smart App Control.
- **Certum open-source certificate**: low yearly cost. It needs a hardware key or Certum's cloud app, which is harder to use from GitHub Actions.

Whichever is picked, one signing step goes into `brain-engine.yml` (the Brain Engine files) and `build.yml` (Bob.exe and our add-ons). Then `REQUIRE_SIGNED` is set to `true`.

## Free things that may help (no promise)

- Submit each new Brain Engine build to Microsoft as safe software (Microsoft Security Intelligence, "Submit a file", software developer). It's free, but it isn't guaranteed to change Smart App Control's answer.
- Ollama is signed, so a PC where everything unsigned is blocked can still run brains through Ollama.

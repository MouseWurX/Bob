# Signing and notarizing Bob for Mac

Official Mac builds are signed **ad hoc**: every file in Bob.app is sealed, so macOS can tell if anything was changed, but no Apple Developer ID says who made it. So the first time, macOS says it can't check Bob, and you allow it once in **System Settings, Privacy & Security, Open Anyway**.

A build signed with an **Apple Developer ID** and **notarized** by Apple opens like any app from the internet: macOS asks "Are you sure you want to open it?" once, with no trip to System Settings.

Everything for that is built into `build.yml`, and it's **off**. Nothing is signed, sent to Apple or paid for until the settings below are filled in. Turning it on needs an Apple Developer Program membership (US$99 a year), which the project doesn't have. Forks can use the same switch with their own account (see [CONTRIBUTING.md](../../.github/CONTRIBUTING.md), "Signed Mac builds").

## What happens when it's on

1. **Get the Developer ID certificate ready.** The `mac` job puts the certificate in a throwaway keychain, only for that run, and deletes it at the end.
2. **Make Bob.app** (`installer/make-release-mac.sh`). With `MAC_SIGN_IDENTITY` set, every program file inside is signed on its own, innermost first, with the Developer ID, Apple's hardened runtime, a secure timestamp and [`installer/mac-entitlements.plist`](../installer/mac-entitlements.plist). Without it, the build is ad hoc, exactly as before.
3. **Notarize** (`installer/notarize-mac.sh`). The zip goes to Apple's notary service with an App Store Connect API key. Apple checks it for malware, usually in a few minutes. If Apple says no, the build stops and prints Apple's reasons. If yes, Apple's ticket is stapled into Bob.app, so a Mac can check it offline, and the zip and its `.sha256` are made again.
4. **Check.** "Does macOS open Bob.app without Open Anyway?" runs `spctl --assess` on the finished app and writes the answer in the run's summary. It only fails the build once the variable `REQUIRE_MAC_NOTARIZED` is `true`. Set that after the first good signed build, so an unsigned Mac build can never slip out again.

A pull request from a fork never gets the secrets, so it still builds ad hoc and passes.

## Turning it on (owner only, needs the paid account)

In Apple's developer site:

1. Join the Apple Developer Program as an individual (US$99 a year, identity check by Apple).
2. Make a **Developer ID Application** certificate. Export it with its private key from Keychain Access as a `.p12` file with a password. (Without a Mac: make the certificate request with OpenSSL and build the `.p12` with OpenSSL too.)
3. In App Store Connect, Users and Access, Integrations, make an **App Store Connect API key** with the Developer role. Download the `.p8` file (Apple lets you download it once) and note the key id and issuer id.

In the GitHub repository, Settings, Secrets and variables, Actions:

| Name | Kind | What goes in it |
|---|---|---|
| `MAC_CERT_P12` | secret | The `.p12` file, as base64 (`base64 -i cert.p12`) |
| `MAC_CERT_PASSWORD` | secret | The `.p12` password |
| `MAC_NOTARY_KEY` | secret | The text of the `.p8` file |
| `MAC_SIGN_IDENTITY` | variable | The certificate's full name, like `Developer ID Application: Your Name (TEAMID1234)` |
| `MAC_NOTARY_KEY_ID` | variable | The API key's id |
| `MAC_NOTARY_ISSUER` | variable | The issuer id |
| `MAC_SIGNING_ENABLED` | variable | `true`, last of all |
| `REQUIRE_MAC_NOTARIZED` | variable | `true`, after the first signed build passes |

None of these ever go in a file in the repository.

## What notarizing doesn't change

- **Updates.** Bob's own updater already checks Bob.app's seal with `codesign --verify` and works the same for both kinds of signature.
- **Engines Bob fetches later** (llama.cpp, stable-diffusion.cpp, uv). They come from their own projects and aren't part of Bob.app, so Apple doesn't check them. Bob downloads them himself, which macOS doesn't flag, as before.
- **The microphone question.** macOS still asks once before Bob can listen.
- **Intel Macs.** Bob for Mac is Apple Silicon only, signed or not.

## Why these entitlements

The hardened runtime blocks some things unless the app says it needs them. Bob asks for four, and nothing else (no debugging hook, no sandbox exceptions):

- `cs.allow-jit` and `cs.allow-unsigned-executable-memory`: Electron's JavaScript engine compiles code while it runs.
- `cs.disable-library-validation`: Electron and the engines load libraries that someone else signed.
- `device.audio-input`: the microphone, used only when you press it or turn on Hey Bob.

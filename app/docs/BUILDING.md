# Building Bob

How to build Bob from source, how updates are put in place, and how versions are numbered. To just use Bob, [download a release](../../README.md#download) instead.

## Running and building

Everything of Bob's is in the [`app`](..) folder: a small Node server (`app/src/`) with a web page for his window (`app/public/`), wrapped in Electron (`app/electron/main.cjs`), plus his installer, tests, docs and the Android app. Run these in the `app` folder:

```
cd app
npm install
npm start            # run Bob from source
npm test             # every test suite
npm run voice-samples   # make the 22 Kokoro clips that ship in public/voice-samples (Bob running, Kokoro set up)
npm run dist:portable   # optional, by hand only: a single portable Bob-<version>.exe (may be blocked by Smart App Control)
```

On Windows, double-click **Install Bob.cmd** in the `app` folder. It first asks where Bob should keep his things (a `Bob` folder in your user folder is suggested; any drive works; AppData and other temporary places are refused). Then a window shows each step with a tick, a progress bar, the live log line, the time taken and what the step is for: checking Node.js, getting Electron (its official Windows zip, about 110 MB, checked against Electron's SHASUMS256.txt or the pin in `package.json` `bob.electronSha256`, kept in `inn\bob\electron` so it's only downloaded when the Electron version changes), testing, then putting Bob in `<home>\Bob app` (home being the folder you picked) with a Start menu shortcut that carries Bob's icon and app id (`ca.mousewurx.bob`, so the taskbar shows Bob). If a step fails, nothing outside the source folder changes and "Show the full log" says why. (**Double-click to build Bob.cmd** does the same.) To check the shortcut writer on Windows: `installer\bob-shortcut.ps1 -SelfTest`. To try the installer without touching a real install, run `installer\bob-build-window.ps1 -Mode install -AppDir <test folder> -NoShortcut`.

## How updates are put in place

Settings, "Check for updates". Bob asks GitHub for the Latest release of MouseWurX/Bob and looks at the source folder he was built from; the newer one wins (a tie goes to the source folder). A GitHub release is downloaded, checked against its `.sha256` (and GitHub's own checksum when it gives one), unpacked, and handed to the update window with `-Prebuilt`, which skips Node.js and the tests (GitHub ran them before publishing). On a Mac, Bob checks Bob.app with `codesign --verify` and swaps the bundle on restart; on Linux, the new AppImage takes the running one's place on restart (the old one stays as `.previous`). When the source folder has the newer build, "Update Bob" opens the same window and shows the same steps in Bob's own window. When it's built, the window pops up and Bob asks in the chat too. "Restart Bob now" closes him straight away, swaps in the new files (the old ones stay as `resources\app-previous`; if Electron itself changed, the old exe stays as `Bob-previous.exe`) and opens him again. If he's in the middle of a task or a download you choose: restart anyway (he picks up where he left off), wait until he's done, or not now. "Later" leaves the new Bob waiting; it takes over the next time Bob starts. Checking when Bob starts is off unless you turn it on, and updating always takes your click.

## Pinned downloads, voice samples and fonts

Every file in `catalog.json` carries its size and sha256 (a few tiny Piper `.onnx.json` files carry only their size). If a file on the website has changed since that Bob was made, he stops before downloading and says so; a download that comes through the wrong size or checksum is deleted.

**Voice samples:** every voice on the Voice & conversation page has "Hear a sample". A voice on this PC makes its sample once and keeps it in `inn\bob\voice-samples`. A clip for every Kokoro voice ships with Bob (Kokoro is Apache-2.0), each saying the same short line, so they play before anything is downloaded. A Piper voice that isn't downloaded plays Piper's official sample from rhasspy.github.io, and only when you click; Piper clips aren't shipped because their voice data licences vary.

Fonts: IBM Plex Mono is bundled in `public/fonts` under the SIL Open Font License (`IBM-Plex-Mono-OFL.txt`).

The server has no runtime dependencies; `node src/server.js` runs it on its own for development.

## Versions

Bob 1.0.0 is the first public release. From here the version is `<major>.<minor>.<patch>`:

- **1.0.1, 1.0.2, ...** for fixes and small changes
- **1.1.0, 1.2.0, ...** when new features arrive
- **2.0.0** if something changes in a way that needs you to do something (for example, a new install)

A letter marks work that isn't merged yet (`1.0.1a`). Before 1.0 the versions were `0.9.<build>` (0.9.1 to 0.9.36).

It's set in `package.json`: `version`, and `bob.release` (`1.0`), `bob.patch` and `bob.build`. The build number goes up by one with every drop and never resets (1.0.0 is build 37), and "Check for a newer Bob" compares it, so any newer drop is offered whatever its label. `formatVersion` in `src/config.js` is the one place the label is made. The same label is used in the footer, the update check and git tags (`v1.0.0`).

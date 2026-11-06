# Contributing to Bob

Thanks for helping. A few house rules:

- **Opt-in is the standard.** Anything that starts by itself, sends data off the PC, downloads something
  or costs money must be off by default and turned on by the user.
- **Plain words in the app.** Buttons and settings say what they do. Bob's personality belongs in his chat
  replies, not in the menus.
- **Tests.** Run `npm test` before you open a pull request. It needs Node.js 20 or newer and nothing else.
  New behaviour gets a test.
- **No personal data.** Never commit `config.json`, anything from an `inn` folder, real paths from your
  PC, e-mail addresses or keys. `npm test` checks for these (`test/run-public-test.js`).
- **Licences.** Code you contribute is GPL-3.0-or-later; art and writing are CC BY-SA 4.0 (see
  ASSETS-LICENSE.md). Only add third-party parts whose licence allows this, and list them in
  THIRD-PARTY.md.
- **Versions.** Each change that ships bumps `bob.build` and `version` in `package.json` (see
  [Versions](README.md#versions)). Every release gets a note in `docs/releases/vX.Y.Z.md`.
- **Every platform.** A feature reaches Windows, Mac, Linux and the Android app, or says plainly where it
  doesn't. Help in the app (Bob's voice, the glossary and the FAQ) is updated with the feature, using the
  names on screen.

Run Bob from source with `npm install` then `npm start`, or just the server with `npm run server`.

## Ways to help that need no code

- **Try Bob on hardware we don't have** (a real Mac, a Raspberry Pi, an AMD or Intel card, a small laptop)
  and open an issue with what happened, good or bad. Issues tagged
  [good first issue](https://github.com/MouseWurX/Bob/labels/good%20first%20issue) are small, well-described
  starting points.
- **Read the Help and the user guide** and tell us where they lost you. Plain words matter here.
- **Star the repository** if Bob is useful to you. Code signing for the Windows builds depends on the
  project being visible enough for a free signing certificate, so a star genuinely helps.

## Signed Mac builds

Official Mac builds stay ad-hoc signed: every file in Bob.app is sealed, but not with a paid Apple Developer ID,
so macOS asks once for **Open Anyway**. The project has no Mac and won't pay for an Apple developer account.
The Mac code is kept working and is tested on GitHub's Mac machines only. Nobody on the project has tried it on a real Mac.

If you want a signed and notarized Mac build, you're welcome to make one on a fork, from this or any version of
Bob, under the GPL. `installer/make-release-mac.sh` signs with `codesign --sign -`; put your own Developer ID
there and add `xcrun notarytool` and `xcrun stapler`. Please publish it under your own name (see
[TRADEMARKS.md](TRADEMARKS.md)), say it's based on Bob by MouseWurX, and link back here. Open an issue if you'd
like your signed build listed in the README.

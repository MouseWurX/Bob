# Contributing to Bob

Thanks for helping. A few house rules:

- **Where things are.** Bob's code, docs, installer, tests and the Android app are all in the `app` folder.
  Only the README, changelog, licence and this `.github` folder sit at the top. Run the commands below in `app`.

- **Opt-in is the standard.** Anything that starts by itself, sends data off the PC, downloads something
  or costs money must be off by default and turned on by the user.
- **Plain words in the app.** Buttons and settings say what they do. Bob's personality belongs in his chat
  replies, not in the menus.
- **Tests.** Run `npm test` before you open a pull request. It needs Node.js 20 or newer and nothing else.
  New behaviour gets a test.
- **Before every push.** Run `node installer/make-changelog.js` and commit `CHANGELOG.md` with your change,
  then `npm test` and `npm run check:release`. Keep work in progress as a **draft** pull request: drafts run no
  GitHub builds, so they never send failed-build e-mails. Mark it ready for review only when both pass.
- **Tests never read the real computer.** A test that depends on the tester's graphics card, operating
  system, folders or environment keys passes on one PC and fails on another (and in GitHub's builds). Pass the
  hardware or the setting in as a fake instead.
- **No personal data.** Never commit `config.json`, anything from an `inn` folder, real paths from your
  PC, e-mail addresses or keys. `npm test` checks for these (`app/test/run-public-test.js`).
- **Licences.** Code you contribute is GPL-3.0-or-later; art and writing are CC BY-SA 4.0 (see
  app/docs/legal/ASSETS-LICENSE.md). Only add third-party parts whose licence allows this, and list them in
  app/docs/legal/THIRD-PARTY.md.
- **Versions.** Each change that ships bumps `bob.build` and `version` in `app/package.json` (see
  [Versions](../README.md#versions)). Every release gets a note in `app/docs/releases/vX.Y.Z.md`.
- **Every platform.** A feature reaches Windows, Mac, Linux and the Android app, or says plainly where it
  doesn't. Help in the app (Bob's voice, the glossary and the FAQ) is updated with the feature, using the
  names on screen.

Run Bob from source with `npm install` then `npm start` in the `app` folder, or just the server with `npm run server`.

## Ways to help that need no code

- **Try Bob on hardware we don't have** (a real Mac, a Raspberry Pi, an AMD or Intel card, a small laptop)
  and open an issue with what happened, good or bad. Issues tagged
  [good first issue](https://github.com/MouseWurX/Bob/labels/good%20first%20issue) are small, well-described
  starting points.
- **Read the Help and the user guide** and tell us where they lost you. Plain words matter here.
- **Star the repository** if Bob is useful to you. Code signing for the Windows builds depends on the
  project being visible enough for a free signing certificate, so a star genuinely helps.

## Signed Mac builds

Official Mac builds are ad-hoc signed: every file in Bob.app is sealed, but not with a paid Apple Developer ID,
so macOS asks once for **Open Anyway**. The project has no Mac and no Apple developer account.
The Mac code is kept working and is tested on GitHub's Mac machines only. Nobody on the project has tried it on a real Mac.

Developer ID signing and Apple notarization are built into `build.yml` and switched off. With an Apple Developer
Program account, fill in the secrets and variables in [app/docs/SIGNING-MAC.md](../app/docs/SIGNING-MAC.md) and set
`MAC_SIGNING_ENABLED` to `true`; `app/installer/make-release-mac.sh` then signs with the hardened runtime and
`app/installer/notarize-mac.sh` notarizes and staples. Nothing else changes.

If you want a signed and notarized Mac build, you're welcome to make one on a fork, from this or any version of
Bob, under the GPL, with that same switch. Please publish it under your own name (see
[TRADEMARKS.md](../app/docs/legal/TRADEMARKS.md)), say it's based on Bob by MouseWurX, and link back here. Open an issue if you'd
like your signed build listed in the README.

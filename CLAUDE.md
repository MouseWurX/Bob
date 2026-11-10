# Notes for AI assistants working on Bob

Follow [.github/CONTRIBUTING.md](.github/CONTRIBUTING.md). The rules that most often break builds:

- Bob's files live in `app/`. Only README, CHANGELOG, CLAUDE.md, LICENSE, .github and .gitignore
  stay at the top; `npm run check:release` fails if anything else lands there. Run every command below in `app/`.
- Before every push: `node installer/make-changelog.js` (it writes the top-level `CHANGELOG.md`), commit it, then
  `npm test` and `npm run check:release`. Both must pass.
- Open work-in-progress pull requests as drafts. Drafts run no GitHub builds; mark one ready only when
  the checks above pass.
- Tests never read the real computer (graphics card, operating system, folders, environment keys). Pass
  fakes in, strip `\r\n` when reading files, and use `fileURLToPath`, never `.pathname`.
- Everything new is off by default, works on Windows, Mac, Linux and Android (or says where it doesn't),
  and gets Help in Bob's voice, a glossary entry and an FAQ.

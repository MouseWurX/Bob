// 1.0.3: clickable links with a Copy link button, clickable file mentions with preview cards, and the
// guarded file routes behind them (only the inn folder and folders Bob may read; never secrets or programs).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { renderRich, trimUrl, fileCard } from '../public/rich.js';
import { resolveMention, allowedFile, describe, openFile } from '../src/files.js';

let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra ? ' ' + extra : ''}`); };
const hrefs = (html) => [...html.matchAll(/<a href="([^"]+)"/g)].map((m) => m[1]);

// ---- links ----
{
  const r = renderRich('Docs (https://example.com/a_(b)). And "https://q.com/x?a=1&b=2", or https://z.org/p.');
  check('a link inside brackets is clickable and keeps its own ")"', hrefs(r.html).includes('https://example.com/a_(b)'));
  check('a link after a quote is clickable, without the quote', hrefs(r.html).includes('https://q.com/x?a=1&amp;b=2'));
  check('trailing full stop stays out of the link', hrefs(r.html).includes('https://z.org/p'));
  check('each link gets a Copy link button', (r.html.match(/data-copy-link=/g) || []).length === 3);
  check('trimUrl leaves balanced brackets alone', trimUrl('https://a/(b)')[0] === 'https://a/(b)' && trimUrl('https://a/b),')[0] === 'https://a/b');
  const md = renderRich('See [the guide](https://example.com/guide) and `https://in.code/x`');
  check('markdown links show their label', /<a href="https:\/\/example.com\/guide"[^>]*>the guide<\/a>/.test(md.html));
  check('links inside inline code are clickable too', /<code><a href="https:\/\/in.code\/x"/.test(md.html));
  const code = renderRich('```js\nconst u = "https://x.y";\n```');
  check('fenced code stays plain code, with a Copy button', !/<a /.test(code.html) && /data-copy-code/.test(code.html));
  check('no script gets through', !/<script/i.test(renderRich('<script>alert(1)</script> [x](https://a.b/"onmouseover=alert(1))').html));
}

// ---- file mentions ----
{
  const r = renderRich('Saved it to D:\\My Stuff\\Bob home\\inn\\painter\\2026-11-01-1faa3800.png. Also `inn\\ledger\\budget.xlsx`, 2026-11-02-abc.wav and /images/x%20y.png).');
  check('a Windows path with spaces is one clickable mention', r.files[0] === 'D:\\My Stuff\\Bob home\\inn\\painter\\2026-11-01-1faa3800.png');
  check('an inn\\ path inside code is a mention', r.files.includes('inn\\ledger\\budget.xlsx'));
  check('the bare name of something Bob made is a mention', r.files.includes('2026-11-02-abc.wav'));
  check('an /images/ link is a mention, without the ")"', r.files.includes('/images/x%20y.png'));
  check('mentions are links with data-file', (r.html.match(/class="file-link"/g) || []).length === 4);
  check('plain words with dots are not mentions', renderRich('Version 1.0.3 is out, e.g. this.').files.length === 0);
}

// ---- the guarded file side ----
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bob-rich-'));
const cfg = { agentDir: tmp, innDir: path.join(tmp, 'inn'), painterDir: path.join(tmp, 'inn', 'painter'), dataDir: path.join(tmp, 'inn', 'bob'), readRoots: [], projects: {} };
for (const d of [cfg.painterDir, cfg.dataDir, path.join(tmp, 'outside')]) fs.mkdirSync(d, { recursive: true });
fs.writeFileSync(path.join(cfg.painterDir, 'pic.png'), 'png');
fs.writeFileSync(path.join(cfg.painterDir, 'run.bat'), 'x');
fs.writeFileSync(path.join(cfg.innDir, '.env'), 'KEY=1');
fs.writeFileSync(path.join(cfg.dataDir, 'settings.json'), '{}');
fs.writeFileSync(path.join(tmp, 'outside', 'secret.txt'), 'no');
{
  check('a bare name resolves to the painter folder', resolveMention(cfg, 'pic.png') === path.join(cfg.painterDir, 'pic.png'));
  check('/images/ resolves to the painter folder', resolveMention(cfg, '/images/pic.png') === path.join(cfg.painterDir, 'pic.png'));
  check('inn\\ paths resolve from the Bob folder', resolveMention(cfg, 'inn\\painter\\pic.png') === path.join(cfg.painterDir, 'pic.png'));
  const d = describe(cfg, 'pic.png');
  check('a picture is described as an image with a URL', d.ok && d.kind === 'image' && d.url.startsWith('/api/file?path='));
  check('outside the allowed folders: refused', !describe(cfg, path.join(tmp, 'outside', 'secret.txt')).ok && !allowedFile(cfg, path.join(tmp, 'outside', 'secret.txt')));
  check('../ tricks are refused', !describe(cfg, path.join(cfg.painterDir, '..', '..', 'outside', 'secret.txt')).ok);
  check('secrets are refused even in the inn', !describe(cfg, path.join(cfg.innDir, '.env')).ok);
  check("Bob's settings file is refused", !describe(cfg, path.join(cfg.dataDir, 'settings.json')).ok);
  check('a missing file says so', describe(cfg, 'gone.png').missing === true);
  check('a script can be shown but not opened', describe(cfg, 'run.bat').canOpen === false);
  const calls = [];
  globalThis.bobShell = { openPath: (f) => calls.push(['open', f]), showItemInFolder: (f) => calls.push(['reveal', f]), copy: () => {} };
  openFile(cfg, 'pic.png');
  openFile(cfg, 'run.bat', { reveal: true });
  check('Open and Show in folder go through Electron', calls[0][0] === 'open' && calls[1][0] === 'reveal' && calls[1][1].endsWith('run.bat'));
  let threw = '';
  try { openFile(cfg, 'run.bat'); } catch (e) { threw = e.message; }
  check('Open refuses to start a script', /doesn't open that kind/.test(threw));
  for (const bad of ['link.url', 'x.lnk', 'page.html', 'pic.svg', 'scene.blend', 'a.appref-ms', 'b.settingcontent-ms', 'c.cpl', 'd.vbe', 'e.psm1']) fs.writeFileSync(path.join(cfg.painterDir, bad), 'x');
  check('only documents, media and art files can be opened (allowlist)', ['link.url', 'x.lnk', 'page.html', 'pic.svg', 'scene.blend', 'a.appref-ms', 'b.settingcontent-ms', 'c.cpl', 'd.vbe', 'e.psm1'].every((f) => describe(cfg, f).canOpen === false) && ['pic.png'].every((f) => describe(cfg, f).canOpen === true));
  fs.writeFileSync(path.join(cfg.painterDir, 'budget.xlsx'), 'x');
  check('a spreadsheet can be opened', describe(cfg, 'budget.xlsx').canOpen === true);
  threw = '';
  try { openFile(cfg, path.join(tmp, 'outside', 'secret.txt'), { reveal: true }); } catch (e) { threw = e.message; }
  check('Show in folder refuses outside folders', /outside/.test(threw) && calls.length === 2);
  const card = fileCard({ ...describe(cfg, 'pic.png'), mention: 'pic.png' });
  check('the card has a preview, Open, Show in folder and Copy path', /<img /.test(card) && /data-open=/.test(card) && /data-reveal=/.test(card) && /data-copy-path=/.test(card));
  check('no second preview when the picture is already shown', !/<img /.test(fileCard({ ...describe(cfg, 'pic.png'), mention: 'pic.png' }, new Set([describe(cfg, 'pic.png').url]))));
}

// ---- Electron side, by reading main.cjs ----
{
  const main = fs.readFileSync(new URL('../electron/main.cjs', import.meta.url), 'utf8');
  check('right-click menu is wired', /webContents\.on\('context-menu'/.test(main) && /role: 'copy'/.test(main) && /Copy link/.test(main) && /Copy image/.test(main) && /Save image as/.test(main));
  check('web links open in the normal browser, never in Bob\'s window', /setWindowOpenHandler/.test(main) && /will-navigate/.test(main));
  check('Copy goes through Electron\'s clipboard', /clipboard\.writeText/.test(main));
  const css = fs.readFileSync(new URL('../public/style.css', import.meta.url), 'utf8');
  check('messages can be selected', /\.msg \{ user-select: text/.test(css) && !/\.msg[^{]*\{[^}]*user-select: none/.test(css));
}

fs.rmSync(tmp, { recursive: true, force: true });
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

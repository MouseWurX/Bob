// Made by Bob (1.5.12): everything Bob makes or saves is on one list, shows as a card with a preview in the
// chat, opens in the side panel, and can be called up again ("show me the last picture").
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Brain } from '../src/brain.js';
import { Made, madePaths, pathsIn } from '../src/made.js';
import { describe, peek } from '../src/files.js';
import { CORE } from '../src/toolbox.js';
import { outCard, friendlySize } from '../public/viewer.js';

let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra && !ok ? ' -> ' + extra : ''}`); };
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bob-made-'));
const agentDir = path.join(tmp, 'Agent'), innDir = path.join(agentDir, 'inn'), dataDir = path.join(innDir, 'bob'), painterDir = path.join(innDir, 'painter'), work = path.join(tmp, 'Work'), outside = path.join(tmp, 'Elsewhere');
for (const d of [dataDir, painterDir, work, outside]) fs.mkdirSync(d, { recursive: true });
const cfg = { agentDir, innDir, dataDir, painterDir, ledgerDir: path.join(innDir, 'ledger'), settingsFile: path.join(dataDir, 'settings.json'), readRoots: [innDir, work], readOnlyRoots: [], recycleBin: false, userName: 'Sam',
  models: { bob: 'small:latest' }, engine: 'ollama', ollamaUrl: 'http://127.0.0.1:1', hands: { enabled: false } };

// ---------- Kinds and previews ----------
fs.writeFileSync(path.join(innDir, 'plan.md'), '# Plan\n- one\n- two\n');
fs.writeFileSync(path.join(innDir, 'page.html'), '<h1>Hi</h1><script>alert(1)</script>');
fs.writeFileSync(path.join(work, 'report.docx'), 'PK');
check('a Markdown file is a text file the panel can show', describe(cfg, path.join(innDir, 'plan.md')).kind === 'text');
check('a .docx is a file (opened in its app, not shown as text)', describe(cfg, path.join(work, 'report.docx')).kind === 'file');
const pk = peek(cfg, path.join(innDir, 'plan.md'));
check('peek gives the start of a text file', pk.ok && pk.text.startsWith('# Plan') && pk.ext === '.md' && !pk.cut);
const big = path.join(innDir, 'big.txt');
fs.writeFileSync(big, 'x'.repeat(300 * 1024));
const bp = peek(cfg, big);
check('peek stops at 256 KB and says it was cut', bp.ok && bp.text.length === 256 * 1024 && bp.cut);
check('peek with a small max (chat preview) reads only that much', peek(cfg, big, 2048).text.length === 2048);
check('peek refuses a picture, a .docx and anything outside the allowed folders', !peek(cfg, path.join(work, 'report.docx')).ok && !peek(cfg, path.join(outside, 'x.txt')).ok);
fs.writeFileSync(path.join(work, '.env'), 'KEY=secret');
check('peek never shows a secrets file', !peek(cfg, path.join(work, '.env')).ok);

// ---------- Paths in tool results ----------
check('a Windows path in "Saved ..." is found', pathsIn('Saved D:\\My Stuff\\Bob home\\inn\\ledger\\list.csv (4 lines including the header).')[0] === 'D:\\My Stuff\\Bob home\\inn\\ledger\\list.csv');
check('a path at the end of a sentence loses the full stop', pathsIn('Saved C:\\x\\notes.txt.')[0] === 'C:\\x\\notes.txt');
check('only saving tools count, and never on an error', madePaths('write_file', 'Saved /a/b.txt.').length === 1 && !madePaths('read_file', 'Saved /a/b.txt.').length && !madePaths('write_file', 'Error: Saved /a/b.txt').length);

// ---------- The list ----------
const made = new Made(cfg);
fs.writeFileSync(path.join(painterDir, 'old.png'), 'png');
const t0 = Date.now() - 3600e3;
fs.utimesSync(path.join(painterDir, 'old.png'), t0 / 1000, t0 / 1000);
const a = made.add(path.join(innDir, 'plan.md'), { tool: 'write_file', chat: 's1' });
check('adding a file gives its card info (document kind, a URL the window can load)', a && a.kind === 'document' && a.url.startsWith('/api/file?path=') && a.name === 'plan.md');
check('a file outside the allowed folders is not added', made.add(path.join(outside, 'nope.txt')) === null);
made.add(path.join(work, 'report.docx'), { tool: 'file_hands' });
made.add(path.join(innDir, 'plan.md'), { tool: 'edit_file' });
let list = made.list();
check('newest first, no repeats (plan.md edited again moves to the top)', list[0].name === 'plan.md' && list.filter((x) => x.name === 'plan.md').length === 1, list.map((x) => x.name).join(','));
check('pictures in the painter folder are listed even if made before the list existed', list.some((x) => x.name === 'old.png' && x.kind === 'image'));
check('a .docx counts as a document', list.find((x) => x.name === 'report.docx')?.kind === 'document');
check('filter by kind', made.list({ kind: 'image' }).every((x) => x.kind === 'image') && made.list({ kind: 'image' }).length === 1);
check('search by name', made.list({ q: 'report' }).length === 1 && made.list({ q: 'nothing-like-this' }).length === 0);
fs.unlinkSync(path.join(work, 'report.docx'));
check('a file that was deleted drops off the list', !made.list().some((x) => x.name === 'report.docx'));
const many = new Made(cfg);
for (let i = 0; i < 410; i++) many.save([...many.load(), { path: path.join(innDir, `f${i}.txt`), at: i }]);
check('the list file keeps at most 400 entries', many.load().length === 400);
fs.writeFileSync(made.file, '[]');

// ---------- Bob: saving makes a card; show_made calls things up ----------
const brain = new Brain(cfg, () => {});
clearInterval(brain.reminderTimer);
brain.ensureModel = async () => {}; brain.fitCtx = async () => 8192; brain.recall = async () => '';
const seen = [];
let script = [];
brain.engine = { chat: async ({ tools, messages }) => { seen.push({ names: tools.map((t) => t.function.name), sys: messages[0].content }); return script.shift() || { role: 'assistant', content: 'done' }; }, unloadAll: async () => {} };
const call = (name, args = {}) => ({ role: 'assistant', content: '', tool_calls: [{ function: { name, arguments: args } }] });

check('show_made is one of the core tools (no group needed to call things up)', CORE.includes('show_made') && Boolean(brain.tools.show_made));
{
  const events = [];
  script = [call('write_file', { path: path.join(innDir, 'todo.txt'), content: 'milk\neggs\n' }), { role: 'assistant', content: 'Saved your list.' }];
  await brain.run('s-save', 'write my to-do list to a file', (ev) => events.push(ev), new AbortController().signal);
  const ev = events.find((e) => e.type === 'made');
  check('write_file into the inn gives a "made" card event', ev && ev.items[0].name === 'todo.txt' && ev.items[0].kind === 'document', JSON.stringify(events.map((e) => e.type)));
  check('...and it is on the Made by Bob list', brain.made.list().some((x) => x.name === 'todo.txt' && x.tool === 'write_file'));
  const h = brain.session('s-save');
  const reply = [...h].reverse().find((m) => m.role === 'assistant' && !m.tool_calls);
  check('...and the card is kept with the reply, so it is back after a reload', reply?.media?.some((m) => m.type === 'file' && m.name === 'todo.txt'), JSON.stringify(reply));
}
{
  // A picture announced by the painter is recorded too.
  fs.writeFileSync(path.join(painterDir, 'sunrise.png'), 'png');
  const events = [];
  brain.tools.fake_paint = { schema: { type: 'function', function: { name: 'fake_paint', description: 'x', parameters: { type: 'object', properties: {} } } }, async run(a, ctx) { ctx.emit({ type: 'image', url: '/images/sunrise.png', file: path.join(painterDir, 'sunrise.png') }); return 'Painted.'; } };
  script = [call('fake_paint'), { role: 'assistant', content: 'Here it is.' }];
  await brain.run('s-pic', 'paint', (ev) => events.push(ev), new AbortController().signal);
  check('a picture Bob paints goes on the list as it is announced', brain.made.list({ kind: 'image' })[0]?.name === 'sunrise.png' && brain.made.load().some((x) => x.tool === 'image'));
  delete brain.tools.fake_paint;
}
{
  const events = [];
  script = [call('show_made', { kind: 'image' }), { role: 'assistant', content: 'There it is.' }];
  await brain.run('s-show', 'show me the last picture', (ev) => events.push(ev), new AbortController().signal);
  const ev = events.find((e) => e.type === 'made');
  check('show_made shows the newest picture and asks the window to open the side panel', ev?.show === true && ev.items.length === 1 && ev.items[0].name === 'sunrise.png', JSON.stringify(ev));
  const res = brain.session('s-show').find((m) => m.role === 'tool' && m.tool_name === 'show_made');
  check('...and tells Bob it was shown (no paths to paste)', /Shown to Sam/.test(res?.content || '') && /don't paste paths/.test(res?.content || ''));
  const words = await brain.tools.show_made.run({ kind: 'pictures' }, { emit: () => {} });
  check('a loose kind word ("pictures") still works', /sunrise\.png/.test(words));
  const none = await brain.tools.show_made.run({ kind: 'video' }, { emit: () => {} });
  check('nothing of that kind: it says so plainly, no card', /Nothing like that made yet \(no videos\)/.test(none));
  const few = []; await brain.tools.show_made.run({ count: 99 }, { emit: (e) => few.push(e) });
  check('at most 6 at once', few[0].items.length <= 6);
}

// ---------- Chat cards ----------
{
  const img = outCard({ type: 'image', url: '/images/a b.png', name: 'a b.png' });
  check('a picture card has a thumbnail and opens the side panel', /class="out-thumb" data-view/.test(img) && /<img src="\/images\/a b.png"/.test(img) && /data-view-kind="image"/.test(img));
  const doc = outCard({ type: 'file', kind: 'document', url: '/api/file?path=C%3A%5Cx%5Cplan.md', name: 'plan.md', path: 'C:\\x\\plan.md' });
  check('a text document card loads its first lines and has Show in folder', /data-peek=/.test(doc) && /data-reveal="C:\\x\\plan.md"/.test(doc));
  const pdf = outCard({ type: 'file', kind: 'file', url: '/api/file?path=x.pdf', name: 'x.pdf' });
  check('a PDF card is a document without a text preview', /Document/.test(pdf) && !/data-peek/.test(pdf));
  check('spreadsheets and web pages get their own word', /Spreadsheet/.test(outCard({ type: 'file', kind: 'document', url: '/api/file?path=a.csv', name: 'a.csv' })) && /Web page/.test(outCard({ type: 'file', kind: 'document', url: '/api/file?path=a.html', name: 'a.html' })));
  check('a card shows its size in friendly units, or looks it up', /Picture · 48 KB/.test(outCard({ type: 'image', url: '/images/x.png', name: 'x.png', bytes: 48000 })) && /data-size-of="\/images\/x.png"/.test(outCard({ type: 'image', url: '/images/x.png', name: 'x.png' })));
  check('friendly sizes never say bytes', friendlySize(12) === 'under 1 KB' && friendlySize(48e3) === '48 KB' && friendlySize(2.3e6) === '2.3 MB');
  const bad = outCard({ type: 'file', kind: 'document', url: '/api/file?path=x', name: '<img src=x onerror=alert(1)>.txt' });
  check('names are escaped', !/<img src=x/.test(bad));
}

console.log(`\n${pass} passed, ${fail} failed`);
fs.rmSync(tmp, { recursive: true, force: true });
process.exit(fail ? 1 : 0);

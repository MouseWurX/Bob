// 1.5.144 🧰 Tools and how-tos: one Settings panel (and phone screen) for the tools Bob wrote and the how-tos
// he kept. Delete asks first, then the thing waits 30 days on the Recently deleted shelf (Undo, Put back), and
// Delete for good drops it now. Bob stops using a deleted thing at once.
import { serverText, publicText } from './source-text.js';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { HowTos, trailStep, KEEP_DELETED_MS, MAX_HOWTOS } from '../src/howtos.js';
import { listTools, usableTools, deleteTool, restoreTool, removeTool, sweepDeleted, toolDir, toolsDir, selfToolsTools, setToolOn, KEEP_DELETED_MS as TOOL_KEEP } from '../src/selftools.js';
import { ownKitView, ownKitCounts, ownKitDelete, ownKitRestore, ownKitPurge } from '../src/own-kit.js';
import { HELP } from '../public/help-content.js';

let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra && !ok ? ' -> ' + extra : ''}`); };
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8').replace(/\r\n/g, '\n');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bob-ownkit-'));
const innDir = path.join(tmp, 'inn'), dataDir = path.join(innDir, 'bob');
fs.mkdirSync(dataDir, { recursive: true });
const cfg = { agentDir: tmp, innDir, dataDir, recycleBin: false, readOnlyRoots: [], readRoots: [innDir], userName: 'Sam', hands: { enabled: true, maker: { on: true }, folders: [] }, howtos: true, models: {} };
const brain = { cfg, howtos: new HowTos(cfg), logs: [], log(k, t) { this.logs.push(`${k}: ${t}`); } };
const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');

// A tool as make_tool would have left it: its folder and its approved record (hashes of its files).
function plantTool(name, what) {
  const dir = toolDir(cfg, name);
  fs.mkdirSync(dir, { recursive: true });
  const code = `export async function run(input) { return { ok: true, name: '${name}' }; }\n`, spec = JSON.stringify({ name, what, inputs: {} });
  fs.writeFileSync(path.join(dir, 'tool.mjs'), code); fs.writeFileSync(path.join(dir, 'tool.json'), spec);
  const f = path.join(dataDir, 'selftools.json');
  const all = fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : {};
  all[name] = { what, reads: [], writes: [], internet: false, downloads: [], hashes: { 'tool.mjs': sha(code), 'tool.json': sha(spec) }, at: Date.now(), on: true, lastUsed: 0 };
  fs.writeFileSync(f, JSON.stringify(all));
}

// ---------- tools: the shelf ----------
{
  plantTool('csv_to_json', 'Turns a CSV file into JSON.'); plantTool('note_writer', 'Writes a note.');
  check('two live tools, usable', listTools(cfg).length === 2 && usableTools(cfg).length === 2);
  deleteTool(cfg, 'note_writer');
  check('deleted: off the live list and not usable, but its folder stays', listTools(cfg).length === 1 && !usableTools(cfg).some((t) => t.name === 'note_writer') && fs.existsSync(toolDir(cfg, 'note_writer')));
  const shelf = listTools(cfg, { deleted: true });
  check('…and on the shelf, with the day it goes for good (30 days)', shelf.length === 1 && shelf[0].name === 'note_writer' && shelf[0].goneAt - shelf[0].deleted === TOOL_KEEP && TOOL_KEEP === 30 * 24 * 3600_000);
  let e = ''; try { setToolOn(cfg, 'note_writer', true); } catch (x) { e = x.message; }
  check('a deleted tool can\'t be switched on', /no tool called/.test(e), e);
  const t = selfToolsTools(brain);
  e = ''; try { await t.use_my_tool.run({ name: 'note_writer', input: {} }, {}); } catch (x) { e = x.message; }
  check('Bob can\'t use it, and says where to put it back', /was deleted/.test(e) && /put it back within 30 days/.test(e) && /Tools and how-tos/.test(e), e);
  e = ''; try { t.my_tools.check({ action: 'remove', name: 'note_writer' }); } catch (x) { e = x.message; }
  check('Bob can\'t delete it twice', /no tool called/.test(e), e);
  check('Bob\'s list leaves it out', !/note_writer/.test(await t.my_tools.run({ action: 'list' })));
  // PC, 1.5.144: asked to use a deleted tool, Bob made a new one with its name, which threw away the shelved folder and OK.
  check('use_my_tool\'s list names the deleted tool, so Bob can ask instead of remaking it', /Deleted \(on the Recently deleted shelf; ask Sam to put one back, never make it again\): note_writer/.test(JSON.stringify(t.use_my_tool.schema)));
  e = ''; try { t.use_my_tool.check({ name: 'note_writer', input: {} }); } catch (x) { e = x.message; }
  check('use_my_tool on a deleted tool says it was deleted and not to make a new one', /was deleted/.test(e) && /Don't make a new one/.test(e), e);
  e = ''; try { await t.make_tool.check({ name: 'Note Writer', what: 'x', inputs: {}, code: 'export async function run() { return 1; }', test: {} }, {}); } catch (x) { e = x.message; }
  check('make_tool refuses the name of a deleted tool (put it back first)', /was deleted/.test(e) && /put it back/.test(e), e);
  const { addTool } = await import('../src/selftools.js');
  e = ''; try { await addTool(cfg, { spec: { name: 'note_writer', downloads: [] }, code: '' }); } catch (x) { e = x.message; }
  check('…and adding over it is refused too, so the shelved folder and its OK stay for Put back', /was deleted/.test(e) && fs.existsSync(path.join(toolDir(cfg, 'note_writer'), 'tool.mjs')) && listTools(cfg, { deleted: true }).some((x) => x.name === 'note_writer'), e);
  restoreTool(cfg, 'note_writer');
  check('put back: live again, same OK (files unchanged, so state on)', listTools(cfg).find((x) => x.name === 'note_writer')?.state === 'on' && !listTools(cfg, { deleted: true }).length);
  check('Bob\'s delete asks first and names the shelf', /Delete my tool "csv_to_json"/.test(t.my_tools.check({ action: 'remove', name: 'csv_to_json' })) && /30 days/.test(t.my_tools.check({ action: 'remove', name: 'csv_to_json' })));
  check('…and goes to the shelf, not the Bin', /Deleted csv_to_json/.test(await t.my_tools.run({ action: 'remove', name: 'csv_to_json' })) && fs.existsSync(toolDir(cfg, 'csv_to_json')) && listTools(cfg, { deleted: true })[0]?.name === 'csv_to_json');
  // The sweep: 30 days later it goes for good (folder to the Bin; here, with recycleBin off in tests, the trash folder).
  check('not swept before its day', sweepDeleted(cfg, Date.now() + TOOL_KEEP - 1000).length === 0 && fs.existsSync(toolDir(cfg, 'csv_to_json')));
  const gone = sweepDeleted(cfg, Date.now() + TOOL_KEEP + 1000);
  check('swept after 30 days: record and folder gone', gone.join() === 'csv_to_json' && !fs.existsSync(toolDir(cfg, 'csv_to_json')) && !listTools(cfg, { deleted: true }).length && !listTools(cfg).some((x) => x.name === 'csv_to_json'));
  e = ''; try { restoreTool(cfg, 'csv_to_json'); } catch (x) { e = x.message; }
  check('nothing to put back then', /no deleted tool/.test(e), e);
}

// ---------- how-tos: the shelf ----------
{
  const h = brain.howtos;
  const steps = [trailStep('list_folder', 'list Downloads'), trailStep('resize', 'resize 12 pictures'), trailStep('zip', 'zip them')];
  const a = h.add({ name: 'Zip my pictures', when: 'resize the pictures in my downloads and zip them', steps });
  const b = h.add({ name: 'Tidy the desktop', when: 'move the files on my desktop into folders by kind', steps });
  check('two live how-tos', h.list().length === 2 && h.match('resize the pictures in my downloads and zip them')?.id === a.id);
  check('delete puts it on the shelf', h.remove(a.id) === true && h.list().length === 1 && h.deletedList().length === 1 && h.deletedList()[0].id === a.id);
  check('…with the day it goes for good (30 days)', h.deletedList()[0].goneAt - h.deletedList()[0].deleted === KEEP_DELETED_MS && KEEP_DELETED_MS === 30 * 24 * 3600_000);
  check('Bob stops matching it at once', h.match('resize the pictures in my downloads and zip them') === null && !h.covered('resize the pictures in my downloads and zip them'));
  check('find skips it, edit refuses it, used ignores it', h.find('Zip my pictures') === null && (() => { try { h.edit(a.id, { name: 'x' }); return false; } catch (e) { return /No such/.test(e.message); } })() && (h.used(a.id), h.deletedList()[0].used === 0));
  check('deleting it again does nothing', h.remove(a.id) === false);
  check('the file keeps it, marked deleted', JSON.parse(fs.readFileSync(path.join(dataDir, 'howtos.json'), 'utf8')).howtos.find((r) => r.id === a.id)?.deleted > 0);
  const back = h.restore(a.id);
  check('put back: live and matching again, nothing on the shelf', back?.name === 'Zip my pictures' && h.list().length === 2 && !h.deletedList().length && h.match('resize the pictures in my downloads and zip them')?.id === a.id);
  check('restore of a live one is null', h.restore(a.id) === null);
  h.remove(b.id);
  check('delete for good drops it now', h.purge(b.id) === true && !h.deletedList().length && h.list().length === 1 && h.purge(b.id) === false);
  // 30 days later the shelf empties itself.
  h.remove(a.id);
  const f = path.join(dataDir, 'howtos.json'), raw = JSON.parse(fs.readFileSync(f, 'utf8'));
  raw.howtos.find((r) => r.id === a.id).deleted = Date.now() - KEEP_DELETED_MS - 1000;
  fs.writeFileSync(f, JSON.stringify(raw));
  check('swept after 30 days', h.deletedList().length === 0 && JSON.parse(fs.readFileSync(f, 'utf8')).howtos.length === 0);
  // The limit counts live how-tos only, and Put back respects it.
  for (let i = 0; i < MAX_HOWTOS; i++) h.add({ name: `How-to ${i}`, when: `job number ${i} of the many`, steps });
  h.remove(h.list()[0].id);
  const extra = h.add({ name: 'One more', when: 'one more job', steps });
  check('a deleted one frees its place', h.list().length === MAX_HOWTOS && h.deletedList().length === 1);
  let e = ''; try { h.restore(h.deletedList()[0].id); } catch (x) { e = x.message; }
  check('put back refuses when the list is full, and says what to do', /Delete one first/.test(e), e);
  h.purge(h.deletedList()[0].id); h.purge(extra.id);
  for (const r of h.list()) h.purge(r.id);
}

// ---------- the panel's view and its three actions ----------
{
  removeTool(cfg, 'note_writer');
  plantTool('csv_to_json', 'Turns a CSV file into JSON.');
  const steps = [trailStep('list_folder', 'list Downloads'), trailStep('resize', 'resize 12 pictures'), trailStep('zip', 'zip them')];
  const a = brain.howtos.add({ name: 'Zip my pictures', when: 'resize the pictures in my downloads and zip them', steps });
  let v = ownKitView(cfg, brain);
  check('the view: both lists, limits, switches, an empty shelf', v.tools.length === 1 && v.tools[0].folder && !('dir' in v.tools[0]) && v.howtos.length === 1 && v.maxTools === 30 && v.maxHowtos === 100 && v.makerOn === true && v.howtosOn === true && v.deleted.length === 0);
  check('the counts for the panel line', JSON.stringify(ownKitCounts(cfg, brain)) === '{"tools":1,"howtos":1,"deleted":0}');
  let d = ownKitDelete(cfg, brain, { kind: 'howto', id: a.id });
  check('delete a how-to: names it, logs it, shelf shows it with its kind', d.ok && d.name === 'Zip my pictures' && /deleted how-to "Zip my pictures"/.test(brain.logs.at(-1)) && ownKitView(cfg, brain).deleted[0]?.kind === 'howto' && ownKitView(cfg, brain).deleted[0].steps === 3);
  d = ownKitDelete(cfg, brain, { kind: 'tool', id: 'csv_to_json' });
  check('delete a tool: newest delete first on the shelf', d.ok && ownKitView(cfg, brain).deleted.map((x) => x.kind).join() === 'tool,howto' && ownKitCounts(cfg, brain).deleted === 2);
  check('put a how-to back', ownKitRestore(cfg, brain, { kind: 'howto', id: a.id }).name === 'Zip my pictures' && ownKitView(cfg, brain).howtos.length === 1);
  check('delete a tool for good: folder to the Bin, off the shelf', ownKitPurge(cfg, brain, { kind: 'tool', id: 'csv_to_json' }).ok && !fs.existsSync(toolDir(cfg, 'csv_to_json')) && ownKitView(cfg, brain).deleted.length === 0);
  const bad = (b) => { try { ownKitDelete(cfg, brain, b); return ''; } catch (e) { return e.message; } };
  check('a wrong kind or a missing id is refused in plain words', /which tool or how-to/.test(bad({ kind: 'hand', id: 'x' })) && /which tool or how-to/.test(bad({ kind: 'tool' })) && /no tool/.test(bad({ kind: 'tool', id: 'nope' })) && /no how-to/.test(bad({ kind: 'howto', id: 'nope' })));
  check('a how-to is deleted by its id only, never by a loose name', /no how-to/.test(bad({ kind: 'howto', id: 'Zip my pictures' })));
}

// ---------- the PC page, the phone and Help ----------
{
  const ui = publicText('cellar.js'), server = serverText(), hands = read('public/hands.js'), phone = read('android/app/src/main/assets/www/phone.js'), phtml = read('android/app/src/main/assets/www/index.html'), phelp = read('android/app/src/main/assets/www/help.js');
  check('one panel for both, in the everyday page, with counts on its line', /\['ev-howtos', '🧰 Tools and how-tos'/.test(ui) && /recently deleted/.test(ui) && !/'📒 How-tos'/.test(ui));
  check('both lists, with a Show code and an Edit', /<h4 class="ssub">🔧 Tools he wrote/.test(ui) && /<h4 class="ssub">📒 How-tos he kept/.test(ui) && /data-owncode=/.test(ui) && /data-howtoedit=/.test(ui));
  check('Delete asks on the row (Delete / Keep it), no pop-up', /data-ownask=/.test(ui) && /data-owndel=/.test(ui) && /data-owncancel>Keep it/.test(ui) && !/confirm\(/.test(ui.slice(ui.indexOf('function ownKitHtml'), ui.indexOf('const EVERY_EXTRA'))));
  check('Undo right after a delete, in a status line, and focus moves to it', /data-ownundo=/.test(ui) && /class="ownkit-note" role="status"/.test(ui) && /dlg\.querySelector\('\[data-ownundo\]'\)\?\.focus\(\)/.test(ui));
  check('the Recently deleted shelf: Put back, Delete for good asks too', /🗑 Recently deleted/.test(ui) && /data-ownput=/.test(ui) && /data-ownpurgeask=/.test(ui) && /data-ownpurge=/.test(ui) && /kept 30 days/.test(ui));
  check('every button names its thing for a screen reader', /aria-label="Delete the \$\{KIND_WORD\[kind\]\} \$\{esc\(name\)\}"/.test(ui) && /aria-label="Put the \$\{KIND_WORD\[d\.kind\]\} \$\{esc\(d\.name\)\} back"/.test(ui) && /aria-label="Show the code of/.test(ui));
  check('the server: GET the list, POST delete, restore, purge; purge on this PC only', /p === '\/api\/own-kit'\) return send\(res, 200, ownKitView/.test(server) && /'\/api\/own-kit\/delete' \|\| p === '\/api\/own-kit\/restore' \|\| p === '\/api\/own-kit\/purge'/.test(server) && /p === '\/api\/own-kit\/purge' && !isLocal\) return send\(res, 403/.test(server) && /ownKit: ownKitCounts\(cfg, brain\)/.test(server));
  check('Hands\' Remove goes to the shelf too', /deleteTool\(cfg, name\)/.test(read('src/hands-routes.js')) && /Recently deleted/.test(hands));
  check('the phone shows the same list under its Settings, with Delete, Keep it, Undo and Put back', /<h3>Tools and how-tos<\/h3>/.test(phtml) && /id="own-kit"/.test(phtml) && /function drawOwnKit/.test(phone) && /path: '\/api\/own-kit'/.test(phone) && /text: 'Keep it'/.test(phone) && /text: 'Undo'/.test(phone) && /text: 'Put back'/.test(phone) && !/Delete for good', onclick/.test(phone.slice(phone.indexOf('function drawOwnKit'), phone.indexOf('// ---------- Save a help bundle'))));
  check('the phone has Help for it', phelp.includes("id: 'own-kit'") && /Tools and how-tos/.test(phelp.slice(phelp.indexOf("id: 'howtos'"), phelp.indexOf("id: 'own-kit'"))));
  const h = (id) => HELP.find((e) => e.id === id);
  check('Help: a Settings topic in Bob\'s voice, the FAQ, the glossary word, the old topics point to it', h('own-kit') && /Recently deleted/.test(h('own-kit').html) && /Put back/.test(h('own-kit').html) && /Delete for good/.test(h('own-kit').html) && /I stop using/.test(h('own-kit').html) && h('faq-own-kit') && /<dt>Recently deleted<\/dt>/.test(h('glossary').html) && /own-kit/.test(h('howtos').html) && /own-kit/.test(h('hands-maker').html) && !/📒 How-tos<\/strong>/.test(h('howtos').html));
  check('the saved-how-to note and the how-tos switch point to the new panel', /Tools and how-tos/.test(publicText('app.js')) && /Your how-tos are in 🧰 Tools and how-tos below/.test(ui));
  check('docs: the settings inventory has the panel', /Tools and how-tos/.test(read('docs/SETTINGS-INVENTORY.md')));
}

fs.rmSync(tmp, { recursive: true, force: true });
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

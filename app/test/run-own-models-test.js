// 1.5.135: brains of your own. A .gguf already on this replicant matrix joins Bob's list under "➕ Your own brains" with
// an explicit own: true marker; Bob runs it from where it is, never moves or deletes it and never recommends it over
// the brains he knows. This checks the list tidying, the file reading, the jobs offered, the file-picker commands per
// platform, the catalogue section and that the Help says it all in Bob's voice.
import { serverText, brainText, publicText } from './source-text.js';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { cleanOwnModels, ownId, paramsOf, inspectOwn, jobsFor, ownEntry, ownEntries, ownResolve, pickFileArgs, pickFile, OWN_FAMILY } from '../src/own-models.js';
import { mergeSettings, SETTING_KEYS } from '../src/config.js';
import { catalogueHtml, ownHtml, isOwn, VIEWS } from '../public/catalogue.js';
import { pickFor } from '../public/fit.js';
import { HELP } from '../public/help-content.js';

let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra ? ' ' + extra : ''}`); };
const read = (p) => fs.readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const catalog = JSON.parse(read('catalog.json'));
const abs = (p) => (process.platform === 'win32' ? `C:\\brains\\${p}` : `/brains/${p}`);

// ---- the saved list ----
{
  const list = cleanOwnModels([
    { id: 'own-remix', name: '  My <b>remix</b> ', gguf: abs('Remix-9B-Q4_K_M.gguf'), mmproj: abs('mmproj.gguf') },
    { id: 'own-remix', name: 'double id', gguf: abs('other.gguf') },
    { id: 'Bad Id', name: 'bad id', gguf: abs('x.gguf') },
    { id: 'own-rel', name: 'not absolute', gguf: 'models/x.gguf' },
    { id: 'own-txt', name: 'not a gguf', gguf: abs('notes.txt') },
    { id: 'own-same', name: 'same file again', gguf: abs('remix-9b-q4_k_m.GGUF') },
    { id: 'own-noname', gguf: abs('Quiet-4B.gguf'), mmproj: 'relative-mmproj.gguf' }
  ]);
  check('only absolute .gguf paths with a proper own- id stay; doubles (id or file) go', list.map((o) => o.id).join() === 'own-remix,own-noname', JSON.stringify(list));
  check('names are tidied (no angle brackets, trimmed) and a missing name is the file name', list[0].name === 'My bremix/b' && list[1].name === 'Quiet-4B');
  check('a picture reader stays only when it is a real absolute .gguf path', list[0].mmproj === abs('mmproj.gguf') && !('mmproj' in list[1]));
  check('anything that is not a list is an empty list', cleanOwnModels(null).length === 0 && cleanOwnModels('x').length === 0 && cleanOwnModels({}).length === 0);
  check('the list stops at forty', cleanOwnModels(Array.from({ length: 50 }, (_, i) => ({ id: `own-${i}`, gguf: abs(`${i}.gguf`) }))).length === 40);
  check('ownModels is a setting Bob saves and tidies', SETTING_KEYS.includes('ownModels') && mergeSettings({}, { ownModels: [{ id: 'own-a', gguf: abs('a.gguf') }, { id: 'nope', gguf: abs('b.gguf') }] }).ownModels.length === 1);
  check('an id comes from the name and never clashes', ownId('My Qwen Remix!') === 'own-my-qwen-remix' && ownId('My Qwen Remix', [{ id: 'own-my-qwen-remix' }]) === 'own-my-qwen-remix-2' && ownId('') === 'own-brain' && ownId('日本語') === 'own-brain');
  check('the engine gets { gguf, mmproj } when there is a picture reader, else the path', ownResolve({ gguf: 'a', mmproj: 'b' }).mmproj === 'b' && ownResolve({ gguf: 'a' }) === 'a');
}

// ---- how big a brain is ----
check('the size comes from the header name or the file name', paramsOf({ name: 'Qwen3.6 35B-A3B' }, 'x.gguf') === 35 && paramsOf(null, 'Gemma-4-E4B-it-Q4.gguf') === 4 && paramsOf({ name: 'Mystery' }, 'mystery-Q4_K_M.gguf') === null && paramsOf(null, 'Llama-3.1-8B-Instruct-Q4_K_M.gguf') === 8);
check('the jobs follow the size: small ones are Quick brains, big ones think deeply, all can be Bob', jobsFor(4, false).includes('small') && !jobsFor(4, false).includes('deep') && jobsFor(27, false).includes('deep') && jobsFor(27, false).includes('reviewer') && !jobsFor(27, false).includes('small') && jobsFor(27, false).includes('bob') && jobsFor(4, false).includes('bob'));
check('Seeing pictures only with a picture reader; an unknown size is offered everywhere', jobsFor(27, true).includes('eyes') && !jobsFor(27, false).includes('eyes') && ['small', 'deep', 'tinker', 'bob'].every((j) => jobsFor(null, false).includes(j)));

// ---- a real (tiny) GGUF file ----
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bob-own-'));
const u32 = (n) => { const b = Buffer.alloc(4); b.writeUInt32LE(n); return b; };
const u64 = (n) => { const b = Buffer.alloc(8); b.writeBigUInt64LE(BigInt(n)); return b; };
const str = (s) => Buffer.concat([u64(Buffer.byteLength(s)), Buffer.from(s)]);
const file = path.join(dir, 'My-Remix-9B-Q4_K_M.gguf');
fs.writeFileSync(file, Buffer.concat([Buffer.from('GGUF'), u32(3), u64(0), u64(3), str('general.architecture'), u32(8), str('qwen3'), str('general.name'), u32(8), str('My Remix 9B'), str('qwen3.context_length'), u32(4), u32(40960)]));
const junk = path.join(dir, 'junk.gguf');
fs.writeFileSync(junk, 'not a brain');
{
  const seen = inspectOwn(file);
  check('inspect reads the name, kind, size and context from the file', seen.name === 'My Remix 9B' && seen.arch === 'qwen3' && seen.params === 9 && seen.ctxTrain === 40960 && seen.sizeGB === 0 && seen.file === file, JSON.stringify(seen));
  check('a file that is not a GGUF is refused in plain words', /isn't a GGUF brain/.test(inspectOwn(junk).error || ''));
  check('a missing file, a folder, a relative path and a non-.gguf are refused', /can't find/.test(inspectOwn(path.join(dir, 'gone.gguf')).error) && /isn't a file/.test(inspectOwn(dir + '.gguf', { stat: () => ({ isFile: () => false }) }).error) && /isn't a \.gguf/.test(inspectOwn('x.gguf').error) && /isn't a \.gguf/.test(inspectOwn(path.join(dir, 'a.txt')).error));
  const e = ownEntry({ id: 'own-my-remix', name: 'My remix', gguf: file });
  check('the entry is marked own: true, sits in the "Your own" family and is never recommended', e.own === true && e.family === OWN_FAMILY && e.trial === true && e.pick === 'optional' && isOwn(e) && !isOwn(catalog.models[0]));
  check('the entry says where it comes from and what the file says, plainly', /From your own file: My-Remix-9B-Q4_K_M\.gguf/.test(e.what) && /about 9B, qwen3, made for up to 40K/.test(e.what) && /for you to judge/.test(e.what));
  check('an installed entry knows its file; a gone one says so', e.status.state === 'installed' && e.status.located.gguf === file && ownEntry({ id: 'own-gone', name: 'Gone', gguf: path.join(dir, 'gone.gguf') }).status.state === 'missing');
  check('a picture reader adds Seeing pictures and is passed to the engine', ownEntry({ id: 'own-v', name: 'V', gguf: file, mmproj: file }).jobs.includes('eyes') && !e.jobs.includes('eyes') && ownEntry({ id: 'own-v', name: 'V', gguf: file, mmproj: file }).ownMmproj === file);
  check('ownEntries follows the saved setting', ownEntries({ ownModels: [{ id: 'own-a', name: 'A', gguf: file }, { id: 'bad', gguf: file }] }).map((m) => m.id).join() === 'own-a');
  check('no stock catalogue model is marked own', catalog.models.every((m) => !isOwn(m)));
}

// ---- the file picker ----
{
  const win = pickFileArgs('gguf', 'win32'), mac = pickFileArgs('mmproj', 'darwin'), lin = pickFileArgs('gguf', 'linux');
  check('Windows uses PowerShell\'s file window, on top, filtered to .gguf', win[0] === 'powershell.exe' && win[1].includes('-STA') && /OpenFileDialog/.test(win[1].at(-1)) && /\*\.gguf/.test(win[1].at(-1)) && /TopMost = \$true/.test(win[1].at(-1)) && /Pick the brain file/.test(win[1].at(-1)));
  check('Mac uses choose file with the picture-reader prompt', mac[0] === '/usr/bin/osascript' && /choose file with prompt "Pick its picture reader/.test(mac[1][1]));
  check('Linux tries zenity then kdialog', lin[0][0] === 'zenity' && lin[1][0] === 'kdialog' && lin[0][1].includes('--file-selection'));
  const calls = [];
  const run = (out, err) => (cmd, args, opts, cb) => { calls.push(cmd); cb(err || null, out, ''); };
  await Promise.all([
    pickFile({ platform: 'win32', run: run(' C:\\brains\\a.gguf\n') }).then((f) => check('Windows: the chosen path comes back trimmed', f === 'C:\\brains\\a.gguf', f)),
    pickFile({ platform: 'win32', run: run('') }).then((f) => check('Windows: Cancel gives an empty path, not an error', f === '')),
    pickFile({ platform: 'darwin', run: (c, a, o, cb) => cb(Object.assign(new Error('User canceled. (-128)'), { code: 1 }), '', 'execution error: User canceled. (-128)') }).then((f) => check('Mac: Cancel gives an empty path', f === '')),
    pickFile({ platform: 'linux', run: (c, a, o, cb) => (c === 'zenity' ? cb(Object.assign(new Error('nope'), { code: 'ENOENT' })) : cb(null, '/brains/b.gguf\n')) }).then((f) => check('Linux: no zenity, so kdialog answers', f === '/brains/b.gguf')),
    pickFile({ platform: 'linux', run: (c, a, o, cb) => cb(Object.assign(new Error('nope'), { code: 'ENOENT' })) }).then(() => check('Linux: no picker at all is an error', false), (e) => check('Linux: no picker at all says so in plain words', /No file picker/.test(e.message) && /Type the file's path/.test(e.message))),
    pickFile({ platform: 'win32', run: (c, a, o, cb) => cb(new Error('boom'), '', '') }).then(() => check('Windows: a picker that fails is an error', false), (e) => check('Windows: a picker that fails says to type the path', /Type the file's path/.test(e.message))),
    pickFile({ platform: 'android' }).then(() => check('a phone cannot pick this way', false), (e) => check('a phone cannot pick this way (plain error)', /Windows, Mac and Linux/.test(e.message)))
  ]);
}

// ---- the catalogue page ----
{
  const models = [...catalog.models, ownEntry({ id: 'own-my-remix', name: 'My remix', gguf: file }), ownEntry({ id: 'own-gone', name: 'Gone brain', gguf: path.join(dir, 'gone.gguf') })];
  const roles = Object.fromEntries(['bob', 'small', 'deep', 'reviewer', 'tinker', 'office', 'eyes', 'gaming'].map((j) => [j, models.filter((m) => m.jobs?.includes(j) && m.category === 'chat').map((m) => ({ value: m.id, label: m.name, caps: ['completion', 'tools'] }))]));
  const ctx = { roles, models, brains: {}, active: {}, vramGB: 16, ramGB: 32, freeGB: 500, packs: catalog.packs, platform: 'win32', naughtyOn: true };
  const well = catalogueHtml({ ...ctx, catView: 'well' });
  check('the Well behaved side ends with ➕ Your own brains and an Add button', /id="catjob-own"/.test(well) && /➕ Your own brains/.test(well) && /data-ownadd>➕ Add a brain from a file/.test(well) && well.indexOf('catjob-own') > well.indexOf('catjob-eyes'));
  check('the section has a Help button to the FAQ', /data-help="faq-own-brain"/.test(well));
  check('each own brain is a row with its path and Remove from Bob\'s list', /id="own-own-my-remix"[^]*?My-Remix-9B-Q4_K_M\.gguf[^]*?data-ownremove="own-my-remix">Remove from Bob's list/.test(well));
  check('a brain whose file is gone says File not found, with no Get button', /id="own-own-gone"[^]*?File not found/.test(well) && !/data-get="own-gone"/.test(well));
  check('own brains sit in the job lists with a "Your own file" tag and never ★ Recommended', /id="cat-bob-own-my-remix"[^]*?Your own file/.test(well) && !/id="cat-[a-z]+-own-[^"]*"[^]*?<span class="tag rec">★ Recommended[^]*?<\/li>/.test(well.replace(/<\/li>/g, '</li>\n').split('\n').filter((l) => /own-my-remix/.test(l)).join('\n')));
  check('the quiet pick and the ★ never land on a brain of your own', !['bob', 'small', 'deep', 'tinker', 'office'].some((j) => isOwn(pickFor(j, models, ctx))) && !['bob', 'small', 'deep', 'tinker', 'office'].some((j) => isOwn(pickFor(j, models, { ...ctx, naughtyPick: true }))));
  check('the Community and Naughty sides do not show the section', !/catjob-own/.test(catalogueHtml({ ...ctx, catView: 'community' })) && !/catjob-own/.test(catalogueHtml({ ...ctx, catView: 'naughty' })) && VIEWS.length === 3);
  const form = ownHtml({ ...ctx, ownForm: { file: 'C:\\brains\\x.gguf', name: 'My Remix 9B', params: 9, sizeGB: 5.6, mmproj: '', error: '' } });
  check('the Add form shows the file, a name box, a picture-reader pick and Add to Bob\'s list', /data-ownform/.test(form) && /C:\\brains\\x\.gguf/.test(form) && /data-ownname[^>]*value="My Remix 9B"/.test(form) && /data-ownmm="pick"/.test(form) && /data-owndo[^>]*>Add to Bob's list/.test(form) && /data-owncancel>Cancel/.test(form) && /about 9B/.test(form));
  check('with a picture reader picked the form offers None; an error is shown', /data-ownmm="clear">None/.test(ownHtml({ ...ctx, ownForm: { file: 'a', name: 'a', mmproj: 'C:\\m.gguf' } })) && /class="error">That isn&#39;t a \.gguf file\./.test(ownHtml({ ...ctx, ownForm: { file: 'a', name: 'a', error: 'That isn\'t a .gguf file.' } })));
  check('Add is greyed while Bob is adding', /data-owndo disabled/.test(ownHtml({ ...ctx, ownForm: { file: 'a', name: 'a', busy: true } })));
  // The test's own brains sit in os.tmpdir(), which is C:\Users\<name>\AppData\Local\Temp on Windows: take that folder out first.
  const shownOwn = ownHtml({ ...ctx, ownForm: null }).split(dir).join('<test folder>').split(dir.replace(/\\/g, '/')).join('<test folder>');
  check('nothing in the section is written in emoji devils or names the owner', !/😈|👿/.test(well) && !/\\Users\\[A-Za-z]/.test(shownOwn));
}

// ---- the app wiring ----
{
  const models = read('src/models.js'), server = serverText(), cellar = publicText('cellar.js'), brain = brainText();
  check('the model list, the slot menus and equipping know about own brains', /ownEntries\(this\.cfg\)/.test(models) && /\(your own file\)/.test(models) && /ownResolve\(own\)/.test(models));
  check('review: inspect, add and remove are local only too (not just pick)', ["p === '/api/own-models/inspect') {", "p === '/api/own-models') {", "p === '/api/own-models/remove') {"].every((r) => server.includes(r) && server.slice(server.indexOf(r), server.indexOf(r) + 200).includes('if (!isLocal) return send(res, 403')));
  {
    const typing = ownHtml({ models: [], ownForm: { file: '', name: '' } });
    check('review: with no file picked, the form asks for the path (Linux with no picker)', /data-ownpathform/.test(typing) && /data-ownpath /.test(typing) && /Use this file/.test(typing) && !/data-ownname/.test(typing));
    check('...and the Add button has "or type its path" beside it', /data-ownpathopen>or type its path/.test(ownHtml({ models: [] })));
    const cel = publicText('cellar.js');
    check('...the typed path is read through /api/own-models/inspect, then the usual name form follows', /'ownpathform' in form\.dataset/.test(cel) && /api\('\/api\/own-models\/inspect', \{ file: typed \}\)/.test(cel));
  }
  check('the server has pick, inspect, add and remove routes; pick is local only', /\/api\/own-models\/pick/.test(server) && /\/api\/own-models\/inspect/.test(server) && /p === '\/api\/own-models'/.test(server) && /\/api\/own-models\/remove/.test(server) && /own-models\/pick'\) \{\s*if \(!isLocal\)/.test(server));
  check('adding refuses a double and a bad file; removing empties any slot wearing it and keeps the file', /already on Bob\\'s list/.test(server) && /seen\.error\) return send\(res, 400/.test(server) && /v === gone\.id/.test(server) && !/unlink|rmSync/.test(server.slice(server.indexOf('/api/own-models'), server.indexOf("p.startsWith('/api/models/')"))));
  check('the Get models window drives the form and refreshes after Add and Remove', /'ownadd' in b\.dataset/.test(cellar) && /data-ownremove/.test(cellar) && /\[data-ownform\]/.test(cellar) && /ownRefresh/.test(cellar) && /\/api\/own-models\/pick/.test(cellar));
  check('Now running shows the own brain\'s name', /ownModels\(this\.cfg\)/.test(brain));
}

// ---- Help, in Bob's voice ----
{
  const faq = HELP.find((h) => h.id === 'faq-own-brain');
  check('there is a FAQ entry for adding your own model', Boolean(faq) && /Add a brain from a file/.test(faq.html) && /never move, copy or delete/.test(faq.html) && /never recommend/.test(faq.html) && /Remove from Bob's list/.test(faq.html));
  check('the FAQ says web links are not taken yet, so people save the file first', /can't do yet: take a web link/.test(faq.html));
  check('the catalogue page and the glossary mention your own brains', /Your own brains/.test(HELP.find((h) => h.id === 'catalogue').html) && HELP.some((h) => /<dt>Your own brain<\/dt>/.test(h.html)));
  check('the user guide and settings inventory keep in step', /Your own brains/.test(read('docs/USER-GUIDE.md')) && /ownModels/.test(read('docs/SETTINGS-INVENTORY.md')));
}

// ---- 1.5.177: the pickers open on top of Bob's window ----
{
  const { pickFolder } = await import('../src/pick-folder.js');
  let asked = null;
  const pick = async (o) => { asked = o; return 'C:\\brains\\riker.gguf'; };
  const got = await pickFile({ kind: 'gguf', pick, run: () => { throw new Error('the PowerShell helper must not run in Bob\'s window'); } });
  check('1.5.177: in Bob\'s window the brain picker is Electron\'s own (bobPick), with the .gguf filter', got === 'C:\\brains\\riker.gguf' && asked.filters[0].extensions[0] === 'gguf' && !asked.folder);
  check('1.5.177: cancelling Electron\'s picker gives no file', (await pickFile({ kind: 'gguf', pick: async () => '' })) === '');
  const docs = await pickFile({ kind: 'docs', pick: async (o) => { asked = o; return 'x'; } });
  check('1.5.177: the lesson builder\'s picker shows documents and all files', docs === 'x' && asked.filters.some((f) => f.extensions.includes('*')));
  const fold = await pickFolder({ purpose: 'save', pick: async (o) => { asked = o; return 'D:\\Bob saves'; }, run: () => { throw new Error('no helper'); } });
  check('1.5.177: the folder picker uses Electron\'s too, and lets you make a folder where it should', fold === 'D:\\Bob saves' && asked.folder === true && asked.newFolder === true);
  await pickFolder({ purpose: 'project', pick: async (o) => { asked = o; return ''; } });
  check('1.5.177: a project folder can\'t be made from the picker (as before)', asked.newFolder === false);
  const ps = pickFileArgs('gguf', 'win32')[1].join(' ');
  check('1.5.177: without Bob\'s window, the Windows helper shows its owner and brings it to the front first, so the picker is on top', /\$owner\.Show\(\); \$owner\.Activate\(\);.*ShowDialog\(\$owner\)/.test(ps));
  const main = read('electron/main.cjs').replace(/\r\n/g, '\n');
  check('1.5.177: Bob.exe lends Electron\'s picker, parented to Bob\'s window', /globalThis\.bobPick = async/.test(main) && /dialog\.showOpenDialog\(owner/.test(main));
}

fs.rmSync(dir, { recursive: true, force: true });
console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);

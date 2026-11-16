// 16 Nov 2026: the Lab's test worlds (model-lab/scenes.mjs, scene-files.mjs, bob-kit world, lab-keys.mjs, fix-to-jobs.mjs).
// A scene the brain writes is checked and planted as real files Bob's own readers open (Word, Excel, PDF, photos with
// their hidden details, zips), folders a job names outside the home are mirrored, the board and memory are Bob's own
// formats, a fix list becomes requests only, and a Lab key never shows in anything printed or saved. Nothing here
// reads the real computer: homes, user names and keys are fakes.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra ? ' ' + extra : ''}`); };
const app = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const imp = (f) => import(pathToFileURL(path.join(app, f)).href);
const { parseScene, plantScene, sceneCache, fullPath } = await imp('model-lab/scenes.mjs');
const sf = await imp('model-lab/scene-files.mjs');
const { loadBob, neutralizer } = await imp('model-lab/bob-kit.mjs');
const { labKey, scrubber, tavilyCheck, tavilyUsage, keyFile } = await imp('model-lab/lab-keys.mjs');
const { docText } = await imp('src/doc-text.js');
const { hiddenDetails } = await imp('src/security-files.js');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'scenes test '));

// ---- parseScene ----
{
  const p = parseScene('Here you go:\n```json\n{"files":[{"path":"C:\\\\Temp\\\\a.txt","content":"x"},{"path":"..\\\\up.txt","content":"y"},{"path":"C:\\\\a<b>.txt"}],"folders":["C:\\\\Archive","C:\\\\Archive"],"board":["loose item",{"list":"## Gardening","items":["water",""]},{"list":"gardening","items":["weed"]}],"memory":["- Likes tea."]}\n```');
  check('a scene in a code fence with words around it is read', p.ok && p.scene.files.length === 1 && p.scene.files[0].path === 'C:\\Temp\\a.txt');
  check('paths that climb out (..) or hold bad characters are left out and listed', p.problems.length === 2 && p.problems.every((x) => /left out/.test(x)), JSON.stringify(p.problems));
  check('folders once each; board lists merged by name; memory lines tidied', p.scene.folders.length === 1 && p.scene.board.length === 2 && p.scene.board.find((b) => b.list === 'Gardening')?.items.join() === 'water,weed' && p.scene.board[0].list === 'Side quests' && p.scene.memory[0] === 'Likes tea.', JSON.stringify(p.scene));
  const bad = parseScene('sorry, no');
  check('an answer that is not JSON gives an empty scene and says why', !bad.ok && bad.scene.files.length === 0 && /not JSON/.test(bad.problems[0]));
  const big = parseScene(JSON.stringify({ files: Array.from({ length: 20 }, (_, i) => ({ path: `f${i}.txt`, content: 'z'.repeat(13000) })) }));
  check('at most 12 files, each cut to 12,000 characters', big.scene.files.length === 12 && big.scene.files[0].content.length === 12000 && big.problems.some((x) => /more than 12/.test(x)));
  check('a file named without a folder goes in Documents; Documents\\x stays in the home', fullPath('notes.txt') === 'C:\\Users\\you\\Documents\\notes.txt' && fullPath('Desktop/a.md') === 'C:\\Users\\you\\Desktop\\a.md' && fullPath('/home/user/x') === '/home/user/x');
}

// ---- real files ----
{
  const meta = { Author: 'Sam Lee', Company: 'Acme', Make: 'Pixel', Model: 'Pixel 8', GPS: '51.5074,-0.1278', DateTaken: '2024-05-01 10:00:00' };
  const w = (n, b) => { const f = path.join(tmp, n); fs.writeFileSync(f, b); return f; };
  const d = w('a.docx', sf.docx('# Report\nSales went up.', meta)), x = w('b.xlsx', sf.xlsx('item,amount\nRent,1200\n"Food, misc",350', meta)), p = w('c.pdf', sf.pdf('Hello PDF\n(second) line', meta));
  const j = w('d.jpg', sf.jpeg(meta)), g = w('e.png', sf.png({ ...meta, parameters: 'a fox' })), z = w('f.zip', sf.sceneBytes({ path: 'f.zip', inside: [{ path: 'in/a.txt', content: 'hi' }, { path: '../bad.txt', content: 'no' }] }));
  const text = (f) => { const t = docText(f); return typeof t === 'string' ? t : t?.text || ''; };
  check('a Word file reads back through Bob\'s own reader, with its author and company', /Sales went up/.test(text(d)) && hiddenDetails(d).found.some((f) => f.value === 'Sam Lee') && hiddenDetails(d).found.some((f) => f.value === 'Acme'));
  check('an Excel file keeps its rows, numbers and quoted commas', /Rent\t1200/.test(text(x)) && /Food, misc\t350/.test(text(x)));
  check('a PDF reads back, brackets and all, with its author', /\(second\) line/.test(text(p)) && hiddenDetails(p).found.some((f) => f.what === 'Author' && f.value === 'Sam Lee'));
  const jf = hiddenDetails(j).found, gf = hiddenDetails(g).found;
  check('a photo carries the GPS, camera and date the job is about', jf.some((f) => f.what === 'GPS location' && /51\.507, -0\.128/.test(f.value)) && jf.some((f) => f.value === 'Pixel 8') && jf.some((f) => /2024:05:01/.test(f.value)), JSON.stringify(jf));
  check('a PNG carries text notes (an AI prompt too) and EXIF', gf.some((f) => /parameters/.test(f.what)) && gf.some((f) => f.what === 'GPS location'));
  check('a zip holds its files, never one that climbs out', (() => { const names = [...sf.zipStore([{ name: 'a', data: 'b' }]).toString('latin1').matchAll(/a/g)].length > 0; const zt = fs.readFileSync(z).toString('latin1'); return names && zt.includes('in/a.txt') && !zt.includes('bad.txt'); })());
  check("sound, video and programs aren't faked", sf.sceneBytes({ path: 'x.mp3' }) === null && sf.sceneBytes({ path: 'x.exe' }) === null && sf.sceneBytes({ path: 'x.mp4' }) === null && sf.sceneBytes({ path: 'x.py', content: 'print(1)\r\n' }).toString() === 'print(1)\n');
  check('the CRC matches the standard check value', sf.crc32(Buffer.from('123456789')) === 0xcbf43926);
}

// ---- the kit's mirrored world ----
{
  const kit = await loadBob(app, { world: true, makers: false, docs: true, hands: ['files', 'security'] });
  const r = kit.place('C:\\Temp\\a.txt'), u = kit.place('/home/user/x.py'), h = kit.place('C:\\Users\\you\\Documents\\b.txt'), own = kit.place('C:\\Users\\you\\AppData\\Local\\Bob\\Agent\\inn\\notice-board.md');
  check('C:\\Temp, /home/user and the home all land inside the throwaway folder', [r, u, h, own].every((x) => x && kit.inTmp(x)) && r.includes(path.join('world', 'C', 'Temp')) && u.includes(path.join('world', '_', 'home')) && own === path.resolve(kit.cfg.noticeBoard), [r, u, h, own].join(' | '));
  check('a path that climbs out of the throwaway folder is refused', kit.place('C:\\..\\..\\..\\..\\..\\..\\..\\..\\etc\\passwd') === '' && kit.sandboxArgs({ path: 'C:\\..\\..\\..\\..\\..\\..\\..\\..\\etc\\x' }).bad);
  check('the brain sees them by their own names again', /^C:[\\/]Temp[\\/]a\.txt$/.test(kit.neutral(r)) && kit.neutral(u) === '/home/user/x.py' && kit.neutral(h) === 'C:\\Users\\you\\Documents\\b.txt' && kit.neutral(JSON.stringify({ p: u })) === '{"p":"/home/user/x.py"}', `${kit.neutral(r)} ${kit.neutral(u)}`);
  const put = plantScene(kit, { files: [{ path: 'C:\\Temp\\a.txt', content: 'one' }, { path: 'C:\\Users\\you\\AppData\\Local\\Bob\\Agent\\inn\\bob-memory.md', content: 'sneaky' }, { path: 'clip.mp4' }], folders: ['C:\\Archive'], board: [{ list: 'Work', items: ['[x] done one', 'open one'] }, { list: 'Side quests', items: ['first'] }], memory: ['Sam is the manager.'] }, { day: '2026-01-02' });
  check("scene files and folders are planted, never into Bob's own folder, and a video is skipped", put.files.length === 1 && put.folders.length === 1 && put.skipped.length === 2 && put.skipped.some((s) => /Bob's own folder/.test(s.why)) && fs.readFileSync(r, 'utf8') === 'one');
  check('a scene folder outside the home is one Bob may use (as if ticked in Settings)', kit.cfg.readRoots.some((x) => /Archive$/.test(x)) && kit.cfg.hands.folders.some((x) => /Archive$/.test(x)) && kit.cfg.readRoots.some((x) => /Temp$/.test(x)));
  const board = String(await kit.brain.tools.notice_board.run({ action: 'read' }));
  check('the board is in Bob\'s own format: Side quests first, ticked items ticked', /## Side quests\n- \[ \] first/.test(board) && /- \[x\] done one/.test(board) && /- \[ \] open one/.test(board), board.slice(0, 200));
  check('memory lines are in Bob\'s own "- fact (date)" format', fs.readFileSync(kit.cfg.memoryFile, 'utf8') === '- Sam is the manager. (2026-01-02)\n');
  const names = kit.brain.toolSchemas(Object.keys(kit.brain.tools)).map((s) => s.function?.name);
  check('only the Hands asked for are on, and no painter stand-in files', !names.includes('run_command') && !names.includes('open_app') && names.includes('strip_metadata') && !fs.existsSync(path.join(kit.tmp, 'sd.exe')));
  kit.done();
  const cache = sceneCache([path.join(tmp, 'none.jsonl')]); const to = path.join(tmp, 'sc', 'scenes.jsonl');
  cache.put({ id: 'j1', text: 'Do  It', scene: { files: [] } }, to);
  check('a saved scene is found again by its job and request (spacing and case aside), and not for another request', sceneCache([to]).get('j1', 'do it') && !sceneCache([to]).get('j1', 'do something else'));
}

// ---- neutralizer with fakes ----
{
  const n = neutralizer({ home: 'D:\\Profiles\\Jo Ann', user: 'joann' });
  check('a fake home and user name become C:\\Users\\you and you', n('D:\\Profiles\\Jo Ann\\Desktop\\joann.txt and D:/Profiles/Jo Ann/x') === 'C:\\Users\\you\\Desktop\\you.txt and C:/Users/you/x');
}

// ---- lab keys: never shown ----
{
  const KEY = 'tvly-FAKE0123456789abcdef';
  check('a key from LAB_TAVILY_KEY is used as it is', labKey('tavily', { env: { LAB_TAVILY_KEY: ` ${KEY} ` }, platform: 'linux' }).key === KEY);
  const none = labKey('tavily', { env: {}, platform: 'linux' });
  check('no key on a non-Windows box says what to set', !none.key && /LAB_TAVILY_KEY/.test(none.why));
  const win = labKey('tavily', { env: { LOCALAPPDATA: 'Z:\\fake' }, platform: 'win32', exists: () => false });
  check('no saved key on Windows points at the double-click file', !win.key && /Save Tavily key for the Lab\.cmd/.test(win.why) && keyFile('tavily', { LOCALAPPDATA: 'Z:\\fake' }).endsWith('tavily.key'));
  let ran = null;
  const opened = labKey('tavily', { env: { LOCALAPPDATA: 'Z:\\fake' }, platform: 'win32', exists: () => true, run: (exe, args, o2) => { ran = { exe, args, o2 }; return `${KEY}\r\n`; } });
  check('a saved key is opened by Windows itself (DPAPI), its path passed by an environment value, stderr dropped', opened.key === KEY && ran.exe === 'powershell.exe' && /ConvertTo-SecureString/.test(ran.args.join(' ')) && ran.o2.env.BOBLAB_KEYFILE.endsWith('tavily.key') && ran.o2.stdio[2] === 'ignore');
  const bad = labKey('tavily', { env: { LOCALAPPDATA: 'Z:\\fake' }, platform: 'win32', exists: () => true, run: () => { throw new Error(`boom ${KEY}`); } });
  check("a key that can't be opened says so without any of the error's words", !bad.key && !bad.why.includes(KEY) && !/boom/.test(bad.why));
  const s = scrubber(KEY);
  check('the scrubber takes the key out plain, URL-encoded and JSON-escaped', s(`a ${KEY} b ${encodeURIComponent(KEY)} ${JSON.stringify({ k: KEY })}`) === 'a [key] b [key] {"k":"[key]"}');
  let sent = null;
  const ok = await tavilyCheck(KEY, { url: 'https://example.test/', fetchFn: async (u, init) => { sent = { u, init }; return { ok: true, status: 200, json: async () => ({ results: [{ content: `echo ${KEY}` }] }) }; } });
  check('the key check sends the key only as the sign-in header and reports only the status', ok.ok && ok.results === 1 && sent.u === 'https://example.test/search' && sent.init.headers.authorization === `Bearer ${KEY}` && !sent.init.body.includes(KEY) && !JSON.stringify(ok).includes(KEY));
  const no = await tavilyCheck(KEY, { fetchFn: async () => { throw new Error(`network ${KEY}`); } });
  check('a failed check carries none of the error text', !no.ok && !JSON.stringify(no).includes(KEY));
  const page = (j, status = 200) => async (u, init) => { sent = { u, init }; return { ok: status === 200, status, json: async () => j }; };
  const plan = await tavilyUsage(KEY, { url: 'https://example.test', fetchFn: page({ key: { usage: 4, limit: null }, account: { current_plan: 'Researcher', plan_usage: 120, plan_limit: 1000, note: KEY } }) });
  const own = await tavilyUsage(KEY, { url: 'https://example.test', fetchFn: page({ key: { usage: 40, limit: 200 }, account: { plan_usage: 120, plan_limit: 1000 } }) });
  const odd = await tavilyUsage(KEY, { url: 'https://example.test', fetchFn: page({ credits: 'lots' }) });
  const gone = await tavilyUsage(KEY, { url: 'https://example.test', fetchFn: page({}, 404) });
  check("Tavily's usage page: the plan's month, or the key's own limit when it has one; only the two numbers are kept", plan.ok && plan.used === 120 && plan.limit === 1000 && own.ok && own.used === 40 && own.limit === 200 && sent.u === 'https://example.test/usage' && sent.init.headers.authorization === `Bearer ${KEY}` && !JSON.stringify(plan).includes(KEY), JSON.stringify([plan, own]));
  check('a usage page in another shape, or none, is said plainly and spends nothing', !odd.ok && /shape/.test(odd.why) && !gone.ok && gone.status === 404);
}

// ---- fix list -> jobs ----
{
  const root = path.join(tmp, 'root'); const src = path.join(root, 'out', 'set-a', 'lessons.jsonl'); fs.mkdirSync(path.dirname(src), { recursive: true });
  const L = (content, extra = {}) => JSON.stringify({ messages: [{ role: 'system', content: 'sys' }, { role: 'user', content }, { role: 'assistant', content: 'OLD ANSWER' }], ...extra });
  fs.writeFileSync(src, [L('Tidy D:\\Profiles\\Jo Ann\\Downloads please'), L('tidy d:\\profiles\\jo ann\\downloads   PLEASE'), L([{ type: 'text', text: 'what is this' }, { type: 'image_url', image_url: { url: 'data:' } }]), L('Email Zebedee about it'), L('Sum Documents\\budget.csv'),
    L(`Send the summary to ${['sam.lee', 'acme.com'].join('@')}`), L('What is the capital of Peru?'), L('List what is in C:\\Temp'), L('Copy it to \\\\TESTBOX-77\\share')].join('\r\n') + '\r\n');
  const fix = path.join(tmp, 'to-fix.jsonl'), words = path.join(tmp, 'private.txt'), to = path.join(tmp, 'jobs', 'fix-jobs.jsonl'), done3 = path.join(tmp, 'run3-ideas.jsonl');
  const fx = (n, set) => JSON.stringify({ id: `set-a#L${n}`, set, family: 'qwen', source: 'out/set-a/lessons.jsonl', line: String(n), verdict: 'fix', faults: "['made_up_result']", note: 'OPUS NOTE' });
  fs.writeFileSync(fix, [[1, 'lessons-notes__lessons'], [2, 'lessons-notes__lessons'], [3, 'lessons-notes__lessons'], [4, 'lessons-notes__lessons'], [5, 'lessons-notes__lessons'], [6, 'bench__files__x'], [7, 'bench__files__x'], [8, 'bench__files__x'], [9, 'bench__files__x'], [12, 'bench__files__x']].map(([n, set]) => fx(n, set)).join('\n') + '\n');
  fs.writeFileSync(words, '# the Lab PC\'s own list\r\nzebedee => a friend\r\nkeep: zebedeean\r\n');
  fs.writeFileSync(done3, JSON.stringify({ id: 'f1', text: 'what is the capital of peru?' }) + '\n');
  const r = spawnSync(process.execPath, ['fix-to-jobs.mjs', '--fix', fix, '--root', root, '--to', to, '--private', words, '--skip', done3, '--home', 'D:\\Profiles\\Jo Ann', '--user', 'joann', '--host', 'TESTBOX-77'], { cwd: path.join(app, 'model-lab'), encoding: 'utf8' });
  const rows = fs.existsSync(to) ? fs.readFileSync(to, 'utf8').trim().split('\n').map((l) => JSON.parse(l)) : [];
  check('a fix list becomes jobs: requests only, the fake home neutral, picture, private, run-3 and repeated requests left out', r.status === 0 && rows.length === 4 && rows.some((x) => x.text === 'Tidy C:\\Users\\you\\Downloads please') && rows.some((x) => x.text === 'Sum Documents\\budget.csv') && /10 to-fix rows: 4 jobs written .* \(2 kinds, mixed\)\. Left out: 1 lesson not found, 0 no request, 1 with a picture, 2 holding something private of this PC's, 1 already in --skip, 1 the same request again\. 1 got stand-ins.*Private words in use: 1\./.test(r.stdout), r.stdout + r.stderr);
  check('the kinds take turns, so a run that stops early has some of each', rows.map((x) => x.job).join(',') === 'notes,files,notes,files', rows.map((x) => x.job).join(','));
  check("an e-mail address gets the stand-in, the PC's name leaves the request out", rows.some((x) => x.text === `Send the summary to ${['you', 'example.com'].join('@')}`) && !rows.some((x) => /TESTBOX/i.test(x.text)), JSON.stringify(rows.map((x) => x.text)));
  const all = fs.readFileSync(to, 'utf8');
  check('no old answer, Opus note or private word reaches the jobs, nor the words in what is printed', !/OLD ANSWER|OPUS NOTE|Zebedee|Jo Ann|acme|TESTBOX/i.test(all) && !/zebedee|TESTBOX/i.test(r.stdout) && rows[0].from.verdict === 'fix' && /^fx-[0-9a-f]{10}$/.test(rows[0].id));
}

fs.rmSync(tmp, { recursive: true, force: true });
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

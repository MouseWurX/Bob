// 1.5.95: diagrams (make_diagram, Mermaid) and Save as (another file type for what Bob makes).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { cleanMermaid, saveDiagram, saveExport, diagramTool, KINDS } from '../src/diagram.js';
import { saveAs, namedType, needsFfmpeg, SAVE_AS } from '../src/save-as.js';
import { expectFrom, afterTurn } from '../src/verify.js';
import { NEEDS, planFor } from '../src/setup-offer.js';
import { Brain } from '../src/brain.js';

let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra && !ok ? ' -> ' + extra : ''}`); };
const throws = (fn, re) => { try { fn(); return false; } catch (e) { return re.test(e.message); } };
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

// ---------- Tidying Bob's Mermaid ----------
check('code fences are taken off', cleanMermaid('```mermaid\nflowchart TD\nA-->B\n```') === 'flowchart TD\nA-->B');
check('a missing "flowchart TD" is put back when the lines are arrows', cleanMermaid('A --> B\nB --> C').startsWith('flowchart TD\n'));
check('labels with brackets get quotes', cleanMermaid('flowchart TD\nA[Start (here)] --> B{Ready (yes)?}').includes('A["Start (here)"]') && cleanMermaid('flowchart TD\nA[Start (here)] --> B{Ready (yes)?}').includes('B{"Ready (yes)?"}'));
check('labels already quoted stay as they are', cleanMermaid('flowchart LR\nA["x (y)"] --> B').includes('A["x (y)"]'));
check('edge labels with punctuation get quotes', cleanMermaid('flowchart TD\nA -->|yes (sure)| B').includes('|"yes (sure)"|'));
check('other diagram types pass through', cleanMermaid('sequenceDiagram\nAlice->>Bob: Hi') === 'sequenceDiagram\nAlice->>Bob: Hi' && cleanMermaid('mindmap\n  root((Party))') === 'mindmap\n  root((Party))');
check('front matter (a title block) is fine', cleanMermaid('---\ntitle: Hi\n---\nflowchart TD\nA-->B').includes('flowchart TD'));
check('text that isn\'t a diagram is refused with what to do', throws(() => cleanMermaid('Here are the steps: first you log in.'), /has to start with its type/));
check('an empty diagram is refused', throws(() => cleanMermaid('``` ```'), /empty/));
check('the type list has the common ones', ['flowchart', 'sequenceDiagram', 'mindmap', 'timeline', 'gantt', 'pie', 'erDiagram'].every((k) => KINDS.includes(k)));

// ---------- Keeping it, and saving its files ----------
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bob-diagram-'));
const agentDir = path.join(tmp, 'Agent'), innDir = path.join(agentDir, 'inn'), dataDir = path.join(innDir, 'bob'), painterDir = path.join(innDir, 'painter');
for (const d of [dataDir, painterDir]) fs.mkdirSync(d, { recursive: true });
const cfg = { agentDir, innDir, dataDir, painterDir, defaultPainterDir: painterDir, settingsFile: path.join(dataDir, 'settings.json'), readRoots: [innDir], readOnlyRoots: [], recycleBin: false, userName: 'Sam', models: { bob: 'small:latest' }, engine: 'ollama', ollamaUrl: 'http://127.0.0.1:1' };
const { file, name } = saveDiagram(cfg, { title: 'Login flow!', source: 'flowchart TD\nA-->B' });
check('the diagram text is kept as a .mmd file in Bob\'s folder, titled', /^\d{4}-\d\d-\d\d-login-flow-[0-9a-f]{6}\.mmd$/.test(name) && fs.readFileSync(file, 'utf8').startsWith('%% Login flow!\nflowchart TD'));
const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(20)]).toString('base64');
const r1 = saveExport(cfg, { name, format: 'png', data: png });
check('a PNG from the window is saved next to it', r1.file === file.replace(/\.mmd$/, '.png') && fs.existsSync(r1.file) && r1.url.startsWith('/images/'));
check('a file that isn\'t really a PNG is refused', throws(() => saveExport(cfg, { name, format: 'png', data: Buffer.from('hello').toString('base64') }), /isn't a PNG/));
check('an SVG with a script in it is refused', throws(() => saveExport(cfg, { name, format: 'svg', data: Buffer.from('<svg><script>alert(1)</script></svg>').toString('base64') }), /scripts/));
check('an SVG with an onload is refused', throws(() => saveExport(cfg, { name, format: 'svg', data: Buffer.from('<svg onload="x()"></svg>').toString('base64') }), /scripts/));
check('a clean SVG is saved', fs.existsSync(saveExport(cfg, { name, format: 'svg', data: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><g/></svg>').toString('base64') }).file));
check('a PDF must start like a PDF', throws(() => saveExport(cfg, { name, format: 'pdf', data: Buffer.from('nope').toString('base64') }), /isn't a PDF/) && fs.existsSync(saveExport(cfg, { name, format: 'pdf', data: Buffer.from('%PDF-1.4\n...').toString('base64') }).file));
check('only Bob\'s own diagrams, by plain name (no paths)', throws(() => saveExport(cfg, { name: '../../x.mmd', format: 'png', data: png }), /Unknown diagram|isn't in/) && throws(() => saveExport(cfg, { name: 'nope.mmd', format: 'png', data: png }), /isn't in/));
check('only PNG, SVG and PDF', throws(() => saveExport(cfg, { name, format: 'exe', data: png }), /png, svg, pdf/));

// ---------- The make_diagram tool ----------
{
  const evs = [];
  const tool = diagramTool();
  const out = await tool.run({ title: 'Game loop', mermaid: '```\nflowchart LR\nStart --> Update --> Draw --> Update\n```' }, { cfg, emit: (e) => evs.push(e) });
  const ev = evs.find((e) => e.type === 'diagram');
  check('make_diagram shows the diagram in the chat and keeps its text', ev && ev.url.endsWith('.mmd') && fs.existsSync(ev.file) && ev.title === 'Game loop' && !ev.format);
  check('...and tells Bob a Save as card lets the user pick the type', /Save as card/.test(out));
  evs.length = 0;
  const out2 = await tool.run({ title: 'X', mermaid: 'flowchart TD\nA-->B', format: 'pdf' }, { cfg, emit: (e) => evs.push(e) });
  check('a type named by the user goes with it (no card)', evs[0]?.format === 'pdf' && /saved as PDF/.test(out2));
  evs.length = 0;
  await tool.run({ mermaid: 'flowchart TD\nA-->B' }, { cfg, emit: (e) => evs.push(e), wantType: 'svg' });
  check('a type in the user\'s own words counts even if Bob leaves it out', evs[0]?.format === 'svg');
  let err = '';
  try { await tool.run({ mermaid: 'just some words' }, { cfg, emit() {} }); } catch (e) { err = e.message; }
  check('words that aren\'t a diagram come back to Bob as a fixable error', /start with its type/.test(err));
}

// ---------- Save as (pictures, clips, songs) ----------
check('the types offered', SAVE_AS.image.join() === 'png,jpg,webp,gif' && SAVE_AS.video.join() === 'mp4,webm,gif' && SAVE_AS.audio.join() === 'wav,mp3,ogg,flac' && SAVE_AS.diagram.join() === 'png,svg,pdf');
const types = { 'make me a song as an mp3': 'mp3', 'save it as a jpg': 'jpg', 'paint a fox, png please': 'png', 'I want an mp3 of that': 'mp3', 'a gif of a spinning coin': 'gif', 'flowchart as a pdf': 'pdf', 'export it to webm': 'webm', 'make me a song': '', 'what is an mp3?': '' };
for (const [t, want] of Object.entries(types)) check(`file type named in "${t}": ${want || 'none'}`, namedType(t) === want, namedType(t));
check('songs and clips need FFmpeg; PNG to JPG doesn\'t on Windows/Mac', needsFfmpeg('wav', 'mp3') && needsFfmpeg('mp4', 'webm') && needsFfmpeg('png', 'webp') === true && needsFfmpeg('png', 'jpg') === !(process.platform === 'win32' || process.platform === 'darwin'));
const song = path.join(painterDir, '2026-11-04-song.wav');
fs.writeFileSync(song, 'RIFF....WAVE');
const jobs = [];
const run = { mediaJob: async ({ src, out }) => { jobs.push([src, out]); fs.writeFileSync(out, 'ID3'); }, pictureJob: async ({ src, out }) => { jobs.push([src, out]); fs.writeFileSync(out, 'x'); } };
const ff = { exe: 'ffmpeg', where: 'own' };
{
  const r = await saveAs(cfg, { name: '2026-11-04-song.wav', format: 'mp3' }, { run, ffmpeg: ff });
  check('a song is kept as an MP3 next to the WAV (the WAV stays)', r.file === song.replace(/\.wav$/, '.mp3') && fs.existsSync(r.file) && fs.existsSync(song) && r.kind === 'audio');
  await saveAs(cfg, { name: '2026-11-04-song.wav', format: 'mp3' }, { run, ffmpeg: ff });
  check('asking again uses the one already made', jobs.length === 1);
  const n = await saveAs(cfg, { name: '2026-11-04-song.wav', format: 'ogg' }, { run, ffmpeg: null });
  check('no FFmpeg: it says FFmpeg is needed (the card offers it), nothing is made', n.need === 'ffmpeg' && !fs.existsSync(song.replace(/\.wav$/, '.ogg')));
  check('only types that fit (a song can\'t be a JPG)', await saveAs(cfg, { name: '2026-11-04-song.wav', format: 'jpg' }, { run, ffmpeg: ff }).then(() => false, (e) => /MP3/.test(e.message)));
  check('only things Bob made, in his folders', await saveAs(cfg, { name: '../../etc/passwd', format: 'mp3' }, { run, ffmpeg: ff }).then(() => false, (e) => /isn't something Bob made/.test(e.message)));
  check('the same type is just the file itself', (await saveAs(cfg, { name: '2026-11-04-song.wav', format: 'wav' }, { run, ffmpeg: ff })).file === song);
}
check('FFmpeg is a thing Bob can offer to set up', NEEDS.ffmpeg?.engine === 'ffmpeg');
{
  const p = planFor('ffmpeg', { list: { models: [], engines: [{ id: 'ffmpeg', name: 'FFmpeg', available: true, installed: false, sizeGB: 0.1 }] }, hw: { freeGB: 100 } });
  check('...as one small download', p.kind === 'download' && p.ids.join() === 'engine:ffmpeg');
  const mac = planFor('ffmpeg', { list: { models: [], engines: [{ id: 'ffmpeg', name: 'FFmpeg', available: false, note: 'brew install ffmpeg' }] }, hw: {} });
  check('...and where there\'s no download (Mac, Linux) it says how to get it', mac.kind === 'none' && /brew/.test(mac.why));
}

// ---------- A real turn: "make me a song as an mp3" keeps both; a diagram stays in the chat ----------
{
  const brain = new Brain(cfg, () => {});
  clearInterval(brain.reminderTimer);
  brain.ensureModel = async () => {}; brain.fitCtx = async () => 8192; brain.recall = async () => '';
  brain.saveAsOpts = { run, ffmpeg: ff };
  const made = path.join(painterDir, '2026-11-04-tune.wav');
  brain.makeSound = async (kind, args, ctx) => { fs.writeFileSync(made, 'RIFF'); ctx.emit({ type: 'audio', url: '/images/2026-11-04-tune.wav', file: made }); return 'Made the song.'; };
  let script = [], seenTools = [];
  brain.engine = { chat: async ({ tools, messages }) => { seenTools.push(messages.filter((m) => m.role === 'tool').map((m) => m.content)); return script.shift() || { role: 'assistant', content: 'Done.' }; }, unloadAll: async () => {} };
  const call = (n, a) => ({ role: 'assistant', content: '', tool_calls: [{ function: { name: n, arguments: a } }] });
  const evs = [];
  script = [call('make_music', { prompt: 'chiptune' })];
  await brain.run('s1', 'make me a song about cats as an mp3', (e) => evs.push(e), new AbortController().signal, []);
  const mp3 = evs.find((e) => e.type === 'made')?.items?.[0];
  check('"a song as an mp3": the MP3 is made too, without a card', mp3?.name === '2026-11-04-tune.mp3' && fs.existsSync(made.replace(/\.wav$/, '.mp3')));
  check('...and Bob is told, so he can say so', seenTools.flat().some((t) => /Also saved as 2026-11-04-tune\.mp3/.test(t)));
  evs.length = 0;
  script = [call('make_diagram', { title: 'Cats', mermaid: 'flowchart TD\nA[Cat]-->B[Nap]' })];
  await brain.run('s2', 'draw me a flowchart of a cat\'s day', (e) => evs.push(e), new AbortController().signal, []);
  check('a diagram turn shows the diagram', evs.some((e) => e.type === 'diagram'));
  const hist = brain.session('s2');
  check('...and it stays with the reply after a reload', hist.some((m) => m.media?.some((x) => x.type === 'diagram' && x.title === 'Cats')));
  check('...with no "you didn\'t make a picture" note', !evs.some((e) => e.type === 'correction' || (e.type === 'note' && /picture/.test(e.text || ''))));
}

// ---------- Verify: a diagram ask isn't a picture ask ----------
check('"draw me a flowchart" asks for a diagram, not a picture', expectFrom('draw me a flowchart of the login')?.kind === 'diagram');
check('"make a mind map" asks for a diagram', expectFrom('make a mind map of party ideas')?.kind === 'diagram');
check('"what is a flowchart?" asks for nothing', expectFrom('what is a flowchart?') === null);
check('"draw me a fox" still asks for a picture', expectFrom('draw me a fox')?.kind === 'picture');
{
  const r = afterTurn({ ledger: { expect: { kind: 'diagram', words: 'a flowchart' }, outputs: [], actions: [] }, cfg: {}, brain: { usable: () => true } }, 'Here are the steps: 1. log in 2. ...');
  check('a diagram asked for but only described: one nudge to draw it', /make_diagram/.test(r?.nudge || '') && (r.groups || []).includes('diagrams'));
  const ok = afterTurn({ ledger: { expect: { kind: 'diagram', words: 'a flowchart' }, outputs: [{ type: 'diagram' }], actions: [{ name: 'make_diagram', ok: true }] }, cfg: {}, brain: { usable: () => true } }, 'Drew it.');
  check('a diagram drawn: no nudge', !ok?.nudge);
}

// ---------- The window side: files shipped and the PDF maker ----------
const mm = fs.readFileSync(path.join(root, 'public/vendor/mermaid.min.js'));
check('Mermaid is bundled, pinned by checksum (11.17.2)', crypto.createHash('sha256').update(mm).digest('hex') === '581ed7d74bd9048d0e3a91363927d72ef22942d7722546b27f7cc29e35390eb8');
check('its licence ships with it, and THIRD-PARTY.md names it', /MIT/.test(fs.readFileSync(path.join(root, 'public/vendor/mermaid-LICENSE.txt'), 'utf8')) && /Mermaid 11\.17\.2/.test(fs.readFileSync(path.join(root, 'THIRD-PARTY.md'), 'utf8')));
const core = fs.readFileSync(path.join(root, 'public/diagram-core.js'), 'utf8');
check('Mermaid draws in strict mode (no scripts or clicks in a diagram)', /securityLevel: 'strict'/.test(core));
const phoneCore = path.join(root, 'android/app/src/main/assets/www/diagram-core.js');
check('the phone app has the same drawing code, word for word', fs.existsSync(phoneCore) && fs.readFileSync(phoneCore, 'utf8').replace(/\r\n/g, '\n') === core.replace(/\r\n/g, '\n'));
check('the phone app has the same Mermaid', fs.existsSync(path.join(root, 'android/app/src/main/assets/www/vendor/mermaid.min.js')) && crypto.createHash('sha256').update(fs.readFileSync(path.join(root, 'android/app/src/main/assets/www/vendor/mermaid.min.js'))).digest('hex') === crypto.createHash('sha256').update(mm).digest('hex'));
{
  const g = {};
  new Function('globalThis', 'module', core)(g, undefined);
  const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xd9]);
  const pdf = Buffer.from(g.BobDiagram.pdfFromJpeg(jpeg, 10, 20, 7.5, 15)).toString('latin1');
  const xref = Number(/startxref\n(\d+)/.exec(pdf)?.[1]);
  check('the PDF maker writes a one-page PDF with the picture', pdf.startsWith('%PDF-1.4') && /\/Type \/Page /.test(pdf) && /\/Filter \/DCTDecode/.test(pdf) && /\/Width 10 \/Height 20/.test(pdf) && pdf.trimEnd().endsWith('%%EOF'));
  check('...whose index points at the right place', pdf.slice(xref, xref + 4) === 'xref');
  const offs = [...pdf.slice(xref).matchAll(/^(\d{10}) 00000 n $/gm)].map((m) => Number(m[1]));
  check('...and at every object', offs.length === 5 && offs.every((o, i) => pdf.slice(o, o + `${i + 1} 0 obj`.length) === `${i + 1} 0 obj`));
}
const appJs = fs.readFileSync(path.join(root, 'public/app.js'), 'utf8');
{
  const sa = fs.readFileSync(path.join(root, 'public/save-as.js'), 'utf8'), ph = fs.readFileSync(path.join(root, 'android/app/src/main/assets/www/phone.js'), 'utf8');
  check('the type it already is reads "· original" with no tick (✓ only for saved copies), on the PC and the phone', /· original<\/span>/.test(sa) && !/class="save-have"[^>]*>✓/.test(sa) && /· original /.test(ph));
  check('what each type is good for is in the button\'s aria-label (no hover needed), and a long-press on the phone', /aria-label="Save as \$\{label\(f\)\}: /.test(sa) && /oncontextmenu: \(e\) => \{ e\.preventDefault\(\); toast\(/.test(ph));
}
check('the chat draws diagrams and shows Save as rows', /case 'diagram'/.test(appJs) && /saveRowsHtml\(items\)/.test(appJs) && /watchSaveAs\(log\)/.test(appJs));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

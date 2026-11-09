// Computer Science Lab: Give it eyes / Give it ears. Where a reader can come from, whether it lines up with a brain
// (from its settings or its translator's shapes), the made-here picture and sound packs, the downloads (token only to
// huggingface.co, sha256 checked, nothing half-written left), the Lab jobs with fake engines (attach, try, measure),
// load without eyes, forget, the Sharpen plan that never starts until the Forge can do it, and the card's words.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { Lab, labRoute, madeBrains } from '../src/lab.js';
import { forgeStartProblems } from '../src/lab-forge.js';
import {
  parseSource, readerFit, textWidths, readerWidths, picturePack, soundPack, png, wav, pictureType, soundType, cleanUpload,
  getFile, peekReader, downloadReader, makeSensesPlan, catalogReaders, writeBuiltinLessons, readOwnLessons, senseMessage,
  runSensePack, looksLikeReader, WAYS, BUILTIN_LESSONS
} from '../src/lab-senses.js';
import { readersHere, registerPair } from '../src/lab-senses-route.js';
import { readGguf } from '../src/lab-gguf.js';

let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra ? ' ' + extra : ''}`); };
const read = (p) => fs.readFileSync(new URL(`../${p}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bob-senses-'));
const throwsLike = async (fn, re) => { try { await fn(); return false; } catch (e) { return re.test(e.message); } };

// ---- a tiny GGUF writer ----
function kv(key, type, value) {
  const k = Buffer.from(key); const h = Buffer.alloc(12 + k.length); h.writeBigUInt64LE(BigInt(k.length)); k.copy(h, 8); h.writeUInt32LE(type, 8 + k.length);
  let v;
  if (type === 8) { const s = Buffer.from(value); v = Buffer.alloc(8 + s.length); v.writeBigUInt64LE(BigInt(s.length)); s.copy(v, 8); }
  else if (type === 4) { v = Buffer.alloc(4); v.writeUInt32LE(value); }
  else if (type === 7) { v = Buffer.from([value ? 1 : 0]); }
  return Buffer.concat([h, v]);
}
function makeGguf(file, kvs, tensors = []) {
  const parts = [Buffer.alloc(24)]; parts[0].write('GGUF', 0, 'latin1'); parts[0].writeUInt32LE(3, 4); parts[0].writeBigUInt64LE(BigInt(tensors.length), 8); parts[0].writeBigUInt64LE(BigInt(kvs.length), 16);
  for (const [k, t, v] of kvs) parts.push(kv(k, t, v));
  let off = 0; const datas = [];
  for (const t of tensors) {
    const n = Buffer.from(t.name); const b = Buffer.alloc(8 + n.length + 4 + 8 * t.dims.length + 12);
    let o = 0; b.writeBigUInt64LE(BigInt(n.length), o); o += 8; n.copy(b, o); o += n.length; b.writeUInt32LE(t.dims.length, o); o += 4;
    for (const d of t.dims) { b.writeBigUInt64LE(BigInt(d), o); o += 8; } b.writeUInt32LE(0, o); o += 4; b.writeBigUInt64LE(BigInt(off), o);
    parts.push(b);
    const len = t.dims.reduce((a, x) => a * x, 1) * 4, pad = Math.ceil(len / 32) * 32 - len; datas.push(Buffer.alloc(len + pad)); off += len + pad;
  }
  let head = Buffer.concat(parts); head = Buffer.concat([head, Buffer.alloc(Math.ceil(head.length / 32) * 32 - head.length)]);
  fs.writeFileSync(file, Buffer.concat([head, ...datas]));
}
const brainFile = path.join(tmp, 'little.gguf');
makeGguf(brainFile, [['general.architecture', 8, 'qwen35moe'], ['general.name', 8, 'Little'], ['qwen35moe.embedding_length', 4, 16], ['qwen35moe.block_count', 4, 1]], [{ name: 'token_embd.weight', dims: [16, 4] }]);
const deepFile = path.join(tmp, 'deep.gguf');
makeGguf(deepFile, [['general.architecture', 8, 'qwen3vl'], ['qwen3vl.embedding_length', 4, 16], ['qwen3vl.n_deepstack_layers', 4, 3]]);
const eyesKey = path.join(tmp, 'mmproj-eyes.gguf');
makeGguf(eyesKey, [['general.architecture', 8, 'clip'], ['clip.has_vision_encoder', 7, true], ['clip.vision.projection_dim', 4, 16], ['clip.projector_type', 8, 'qwen3vl_merger']], [{ name: 'v.patch_embd.weight', dims: [4, 4] }, { name: 'mm.0.weight', dims: [8, 8] }]);
const eyesShape = path.join(tmp, 'mmproj-shape.gguf'); // an older reader with no projection_dim: read from its translator
makeGguf(eyesShape, [['general.architecture', 8, 'clip'], ['clip.has_vision_encoder', 7, true]], [{ name: 'v.patch_embd.weight', dims: [4, 4] }, { name: 'mm.0.weight', dims: [8, 8] }, { name: 'mm.2.weight', dims: [8, 16] }]);
const eyesWide = path.join(tmp, 'mmproj-wide.gguf');
makeGguf(eyesWide, [['general.architecture', 8, 'clip'], ['clip.has_vision_encoder', 7, true], ['clip.vision.projection_dim', 4, 32]], [{ name: 'v.patch_embd.weight', dims: [4, 4] }]);
const both = path.join(tmp, 'mmproj-omni.gguf');
makeGguf(both, [['general.architecture', 8, 'clip'], ['clip.has_vision_encoder', 7, true], ['clip.has_audio_encoder', 7, true], ['clip.vision.projection_dim', 4, 16], ['clip.audio.projection_dim', 4, 16]], [{ name: 'v.patch_embd.weight', dims: [4, 4] }, { name: 'a.conv1d.0.weight', dims: [4, 4] }]);
const deep64 = path.join(tmp, 'mmproj-deep.gguf');
makeGguf(deep64, [['general.architecture', 8, 'clip'], ['clip.has_vision_encoder', 7, true], ['clip.vision.projection_dim', 4, 64]], [{ name: 'v.patch_embd.weight', dims: [4, 4] }]);

// ---- where a reader comes from ----
check('a Hugging Face name, file link and hf: form are read', parseSource('unsloth/Qwen3.6-35B-A3B-GGUF')?.repo === 'unsloth/Qwen3.6-35B-A3B-GGUF' && parseSource('https://huggingface.co/unsloth/X-GGUF/blob/abc123/mmproj-F16.gguf')?.file === 'mmproj-F16.gguf' && parseSource('https://huggingface.co/unsloth/X-GGUF/blob/abc123/mmproj-F16.gguf').revision === 'abc123' && parseSource('hf:o/n:sub/mmproj.gguf@v2').file === 'sub/mmproj.gguf' && parseSource('hf:o/n:sub/mmproj.gguf@v2').revision === 'v2');
check('a local file and another https link are read', parseSource(brainFile).kind === 'file' && parseSource('C:\\brains\\mmproj.gguf').kind === 'file' && parseSource('https://example.org/files/mmproj.gguf').kind === 'link');
check('bad sources are refused: plain http, no .gguf, inside the house, path tricks, datasets', !parseSource('http://example.org/a.gguf') && !parseSource('https://example.org/a.bin') && !parseSource('https://127.0.0.1/a.gguf') && !parseSource(`https://${['192', '168', '1', '4'].join('.')}/a.gguf`) && !parseSource(`https://user:pw${'@'}example.org/a.gguf`) && !parseSource('hf:o/n:../x.gguf') && !parseSource('o/n; rm -rf /') && !parseSource('https://huggingface.co/datasets/o/n') && !parseSource('/tmp/notes.txt'));
check('reader files in a repo are spotted by name', looksLikeReader('mmproj-F16.gguf') && looksLikeReader('sub/Qwen3.6-27B-mmproj-BF16.gguf') && !looksLikeReader('Qwen3.6-27B-Q4_K_M.gguf'));

// ---- does it line up ----
const bg = readGguf(brainFile);
check('the brain\'s width is read, and deepstack brains take in more', textWidths(bg).width === 16 && textWidths(readGguf(deepFile)).widths.join() === '16,64');
check('a reader\'s width comes from its settings, else its translator\'s shapes', readerWidths(readGguf(eyesKey)).sight.widths.join() === '16' && readerWidths(readGguf(eyesKey)).sight.sure && readerWidths(readGguf(eyesShape)).sight.widths.includes(16) && !readerWidths(readGguf(eyesShape)).sight.sure);
const fk = readerFit(bg, readGguf(eyesKey));
check('a reader that lines up says so, and warns it may be blurry', fk.ok && fk.senses.sight.fits === true && /Lines up/.test(fk.words) && /blurry/.test(fk.words) && fk.projector === 'qwen3vl_merger');
check('a reader from another family is refused in words, pointing at a new translator', (() => { const f = readerFit(bg, readGguf(eyesWide)); return !f.ok && !f.unsure && f.senses.sight.fits === false && /32-wide/.test(f.words) && /new translator/.test(f.words); })());
check('an older reader is checked by its shapes', readerFit(bg, readGguf(eyesShape)).ok);
check('a reader with eyes and ears gives both', (() => { const f = readerFit(bg, readGguf(both)); return f.ok && f.senses.sight.fits && f.senses.hearing.fits && /eyes and ears/.test(f.words); })());
check('a brain file is not a reader', /isn't a reader/.test(readerFit(bg, bg).words));
check('a deepstack reader fits a deepstack brain', readerFit(readGguf(deepFile), readGguf(deep64)).ok && !readerFit(bg, readGguf(deep64)).ok);

// ---- the packs ----
const pp = picturePack(), sp = soundPack();
check('the picture pack is made here: 14 PNGs, each a real picture', pp.length === 14 && pp.every((x) => pictureType(x.picture) === 'image/png' && x.picture.length > 60) && new Set(pp.map((x) => x.id)).size === 14);
check('the picture pack is the same every time', crypto.createHash('sha1').update(Buffer.concat(picturePack().map((x) => x.picture))).digest('hex') === crypto.createHash('sha1').update(Buffer.concat(pp.map((x) => x.picture))).digest('hex'));
const byId = (id) => pp.find((x) => x.id === id) || sp.find((x) => x.id === id);
check('picture answers are marked fairly', byId('colour-red').right('It is red.') && !byId('colour-red').right('Reddish') && byId('count-3').right('There are three circles.') && byId('count-3').right('3') && !byId('count-3').right('13') && byId('side-left').right('Left.') && !byId('side-left').right('left or right') && byId('number-42').right('42') && !byId('number-42').right('420') && byId('two-colours').right('Purple and orange.'));
check('the sound pack is made here: 6 WAVs at 16 kHz', sp.length === 6 && sp.every((x) => soundType(x.sound) === 'wav' && x.sound.readUInt32LE(24) === 16000));
check('sound answers are marked fairly', byId('beeps-4').right('four beeps') && byId('pitch-up').right('Up') && !byId('pitch-up').right('up then down') && byId('silence').right('It is silent.'));
const msg = senseMessage('What?', { picture: pp[0].picture })[0].content;
check('a picture goes to the engine as an image part, a sound as an audio part', msg[1].type === 'image_url' && msg[1].image_url.url.startsWith('data:image/png;base64,') && senseMessage('Hm?', { sound: sp[0].sound })[0].content[1].input_audio.format === 'wav');
check('an upload is checked for what it really is, and size', cleanUpload(pp[0].picture.toString('base64'), 'sight').length === pp[0].picture.length && await throwsLike(() => cleanUpload(Buffer.from('hello').toString('base64'), 'sight'), /isn't a picture/) && await throwsLike(() => cleanUpload(pp[0].picture.toString('base64'), 'hearing'), /isn't a sound/) && await throwsLike(() => cleanUpload('A'.repeat(17e6), 'sight'), /too big/));
check('a hand-made PNG and WAV have the right headers', png(2, 2, () => {}).subarray(1, 4).toString() === 'PNG' && wav([{ hz: 440, s: 0.01 }]).subarray(8, 12).toString() === 'WAVE');

// a fake engine for the pack: right about colours only
const fakeEngine = (answer) => async (url, o) => { const body = JSON.parse(o.body); const q = body.messages[0].content[0].text; return { ok: true, json: async () => ({ choices: [{ message: { content: answer(q, body) } }] }) }; };
const half = await runSensePack('http://x', 'sight', { fetchFn: fakeEngine((q) => (/colour is the square/.test(q) ? 'red' : 'no idea')) });
check('the pack scores right answers out of 100 and keeps what it said when wrong', half.of === 14 && half.right === 1 && half.score === 7 && half.misses.length === 13 && half.misses.some((x) => x.said === 'no idea') && half.misses[0].said === 'red');
check('an engine that can\'t take pictures stops the pack in words', await throwsLike(() => runSensePack('http://x', 'sight', { fetchFn: async () => ({ ok: false, status: 500, text: async () => 'image input is not supported - hint: if this is unexpected, you may need to provide the mmproj' }) }), /couldn't take that in/));

// ---- downloads ----
const calls = [];
const hfFake = (body, { redirect = true } = {}) => async (url, o) => {
  calls.push([url, o.headers?.Authorization || '', o.headers?.Range || '']);
  if (redirect && url.startsWith('https://huggingface.co/')) return { status: 302, ok: false, headers: new Headers({ location: 'https://cas-bridge.example/file?sig=1' }) };
  const range = o.headers?.Range?.match(/bytes=0-(\d+)/);
  const part = range ? body.subarray(0, Number(range[1]) + 1) : body;
  return { status: range ? 206 : 200, ok: true, headers: new Headers(range ? { 'content-range': `bytes 0-${part.length - 1}/${body.length}` } : { 'content-length': String(body.length) }), arrayBuffer: async () => part, body: (async function* () { yield part.subarray(0, 10); yield part.subarray(10); })() };
};
const eyesBytes = fs.readFileSync(eyesKey);
await getFile('https://huggingface.co/o/n/resolve/main/mmproj.gguf', { fetchFn: hfFake(eyesBytes), token: 'hf_secret_abc' });
check('the token goes to huggingface.co only, never to where it sends the file', calls[0][1] === 'Bearer hf_secret_abc' && calls[1][0].startsWith('https://cas-bridge.example/') && calls[1][1] === '');
check('a redirect to plain http is refused', await throwsLike(() => getFile('https://example.org/a.gguf', { fetchFn: async () => ({ status: 302, headers: new Headers({ location: 'http://evil.example/a.gguf' }) }) }), /plain http/));
check('private or gated says how to fix it', await throwsLike(() => getFile('https://huggingface.co/o/n/resolve/main/a.gguf', { fetchFn: async () => ({ status: 401, ok: false, headers: new Headers() }), token: '' }), /HF_TOKEN/));
calls.length = 0;
const peek = await peekReader('https://huggingface.co/o/n/resolve/main/mmproj.gguf', { fetchFn: hfFake(eyesBytes), token: '', dir: path.join(tmp, 'peek') });
check('a far-away reader is checked from its start, never downloaded whole', readerFit(bg, peek.g).ok && peek.bytes === eyesBytes.length && calls.every((c) => /bytes=0-/.test(c[2])) && fs.readdirSync(path.join(tmp, 'peek')).length === 0);
const dl = path.join(tmp, 'dl', 'mmproj.gguf');
await downloadReader('https://example.org/mmproj.gguf', dl, { fetchFn: hfFake(eyesBytes, { redirect: false }), sha256: crypto.createHash('sha256').update(eyesBytes).digest('hex') });
check('a download with the right sha256 is kept', fs.readFileSync(dl).equals(eyesBytes));
const bad = path.join(tmp, 'dl', 'bad.gguf');
check('a download with the wrong sha256 is thrown away, nothing half-written left', await throwsLike(() => downloadReader('https://example.org/x.gguf', bad, { fetchFn: hfFake(eyesBytes, { redirect: false }), sha256: 'ab'.repeat(32) }), /isn't the one/) && !fs.existsSync(bad) && !fs.existsSync(bad + '.part'));
check('a file far too big to be a reader is refused before it comes down', await throwsLike(() => downloadReader('https://example.org/x.gguf', bad, { fetchFn: hfFake(eyesBytes, { redirect: false }), maxBytes: 100 }), /far too big/));

// ---- the catalogue's readers ----
const catalog = { models: [
  { id: 'little', name: 'Little', family: 'Qwen', category: 'chat', jobs: ['bob'], license: 'apache-2.0', files: [{ role: 'gguf', url: 'https://x/little.gguf' }] },
  { id: 'big-vl', name: 'Big VL', family: 'Qwen', category: 'vision', jobs: ['eyes'], license: 'apache-2.0', files: [{ role: 'gguf', url: 'https://x/b.gguf' }, { role: 'mmproj', url: 'https://huggingface.co/unsloth/Big-GGUF/resolve/abc/mmproj-F16.gguf', saveAs: 'Big-mmproj-F16.gguf', sha256: crypto.createHash('sha256').update(eyesBytes).digest('hex'), bytes: eyesBytes.length }] },
  { id: 'big-vl-2', name: 'Big VL again', family: 'Qwen', category: 'vision', files: [{ role: 'mmproj', url: 'https://huggingface.co/unsloth/Big-GGUF/resolve/abc/mmproj-F16.gguf' }] },
  { id: 'gem', name: 'Gem', family: 'Gemma', category: 'vision', files: [{ role: 'mmproj', url: 'https://huggingface.co/g/G-GGUF/resolve/def/mmproj-Q8_0.gguf' }] }
] };
const cr = catalogReaders(catalog);
check('the catalogue\'s readers are listed once each, with their pinned repo, file and sha256', cr.length === 2 && cr[0].repo === 'unsloth/Big-GGUF' && cr[0].revision === 'abc' && cr[0].file === 'mmproj-F16.gguf' && cr[0].sha256.length === 64 && cr[0].family === 'Qwen');

// ---- the Lab side, with fake engines ----
const dataDir = path.join(tmp, 'data'); fs.mkdirSync(dataDir, { recursive: true });
const exe = (n) => (process.platform === 'win32' ? `${n}.exe` : n);
fs.mkdirSync(path.join(tmp, 'eng')); fs.writeFileSync(path.join(tmp, 'eng', exe('llama-server')), '');
const cfg = { dataDir, agentDir: tmp, bobModelsDir: path.join(tmp, 'models', 'bob'), settingsFile: path.join(dataDir, 'settings.json'), computerLab: true, llamacpp: { exe: path.join(tmp, 'eng', exe('llama-server')) } };
const shop = { cfg, catalog, locate: (e) => (e.id === 'little' ? { gguf: brainFile } : e.id === 'big-vl' ? { gguf: brainFile, mmproj: both } : {}) };
const served = [];
const lab = new Lab(cfg, { shop, room: () => ({ ok: true }), steps: {
  serve: async (o) => { served.push(o); return { url: 'http://fake', where: 'card', stop: () => {} }; },
  sensePack: async (url, sense) => ({ right: sense === 'sight' ? 7 : 3, of: sense === 'sight' ? 14 : 6, score: 50, misses: [] }),
  quiz: async () => ({ score: 80, parts: {} })
} });
lab.hfFetch = hfFake(eyesBytes);
const res = () => { const r = { code: 0, body: null }; return r; };
const call = async (p, b, { method = 'POST', isLocal = true } = {}) => { const r = res(); await labRoute({ req: { method }, res: r, p, isLocal, lab, body: async () => b, send: (rr, code, body) => { rr.code = code; rr.body = body; } }); return r; };

const v0 = (await call('/api/lab/senses', null, { method: 'GET' })).body;
check('the card lists the brains with their width and what they can do, and the catalogue readers', v0.brains.find((b) => b.id === 'little').width === 16 && !v0.brains.find((b) => b.id === 'little').sight && v0.catalog.length === 2 && !JSON.stringify(v0.catalog).includes('sha256') && v0.ways.length === 3);
check('another device never sees reader paths', !JSON.stringify((await call('/api/lab/senses', null, { method: 'GET', isLocal: false })).body).includes(tmp));
const here = readersHere(lab);
check('readers already here are found: the catalogue\'s downloaded ones', here.some((h) => h.path === both));
const m = (await call('/api/lab/senses/match', { brain: 'little' })).body;
check('Find a match lists readers here that fit and the family\'s catalogue readers', m.here.length === 1 && m.here[0].ok && m.catalog.length === 1 && m.catalog.every((c) => c.family === 'Qwen'));
check('Find a match from another device has no paths', !JSON.stringify((await call('/api/lab/senses/match', { brain: 'little' }, { isLocal: false })).body).includes(tmp));
const chk = (await call('/api/lab/senses/check', { brain: 'little', catalog: cr[0].id })).body;
check('a catalogue reader is checked from its start', chk.ok && chk.bytes === eyesBytes.length);
check('a local file that doesn\'t fit says so', /Doesn't line up/.test((await call('/api/lab/senses/check', { brain: 'little', source: eyesWide })).body.words));
check('checking or attaching from another device is refused', (await call('/api/lab/senses/attach', { brain: 'little', source: eyesKey }, { isLocal: false })).code === 403 && (await call('/api/lab/senses/check', { brain: 'little', source: eyesKey }, { isLocal: false })).code === 403);

const wait = async () => { while (lab.job) await new Promise((r) => setTimeout(r, 10)); };
const a1 = (await call('/api/lab/senses/attach', { brain: 'little', catalog: cr[0].id })).body;
check('Attach starts as a Lab job', a1.started?.state === 'running' && a1.started.kind === 'senses-attach');
await wait();
const run1 = lab.runs.at(-1);
const got = path.join(cfg.bobModelsDir, 'lab', 'senses', 'unsloth-big-gguf', 'Big-mmproj-F16.gguf');
check('the reader came down under its catalogue name, sha256 checked', run1.state === 'done' && fs.existsSync(got) && fs.readFileSync(got).equals(eyesBytes), run1.error || '');
const made = madeBrains(cfg).find((x) => x.id === 'lab-little-eyes');
const settings = JSON.parse(fs.readFileSync(cfg.settingsFile, 'utf8'));
check('the pair goes into Bob as its own brain: same brain file, the new reader, the eyes job', made && made.gguf === brainFile && made.mmproj === got && made.jobs.includes('eyes') && /with eyes/.test(made.name) && settings.llamacpp.models['lab-little-eyes'].mmproj === got && catalog.models.some((x) => x.id === 'lab-little-eyes'));
await call('/api/lab/senses/attach', { brain: 'little', source: eyesWide }); await wait();
check('a reader that doesn\'t line up is never attached', lab.runs.at(-1).state === 'failed' && /Doesn't line up/.test(lab.runs.at(-1).error));
await call('/api/lab/senses/attach', { brain: 'little', source: eyesShape }); await wait();
check('your own file is used where it is, never copied', lab.runs.at(-1).state === 'done' && madeBrains(cfg).find((x) => x.id === 'lab-little-eyes').mmproj === eyesShape);
await call('/api/lab/senses/attach', { brain: 'little', catalog: cr[0].id }); await wait(); // back to the downloaded one

const t1 = (await call('/api/lab/senses/try', { brain: 'lab-little-eyes', sense: 'sight' }));
check('Try needs a brain with a reader', /no eyes or ears/.test((await call('/api/lab/senses/try', { brain: 'little' })).body.error));
check('Try starts the brain with its reader and asks', t1.code === 400 || served.at(-1)?.mmproj === got);
lab.stepFns.serve = async (o) => { served.push(o); return { url: 'http://fake', where: 'card', stop: () => {} }; };
const realFetch = globalThis.fetch;
globalThis.fetch = fakeEngine((q, body) => (body.messages[0].content[1]?.type === 'image_url' ? 'A purple square and an orange square.' : '?'));
const t2 = (await call('/api/lab/senses/try', { brain: 'lab-little-eyes', sense: 'sight' })).body;
const t3 = (await call('/api/lab/senses/try', { brain: 'lab-little-eyes', sense: 'sight', upload: pp[3].picture.toString('base64'), question: 'Which colour?' })).body;
globalThis.fetch = realFetch;
check('Try answers about my sample picture, or your own with your question', /purple/.test(t2.answer) && t2.sample && served.at(-1).mmproj === got && t3.question === 'Which colour?' && !t3.sample);
check('Try won\'t listen with eyes only', /has no ears/.test((await call('/api/lab/senses/try', { brain: 'lab-little-eyes', sense: 'hearing' })).body.error));
check('a bad upload is refused in words', /isn't a picture/.test((await call('/api/lab/senses/try', { brain: 'lab-little-eyes', sense: 'sight', upload: Buffer.from('nope').toString('base64') })).body.error));
lab.brain = { engine: { loaded: async () => [{ name: 'Riker', vram: 9 }], unloadAll: async () => { lab.brain.unloaded = true; } } };
check('Bob\'s own brain on the card is asked about first', (await call('/api/lab/senses/measure', { brain: 'lab-little-eyes' })).body.needUnload === true && !lab.brain.unloaded);
const ms = (await call('/api/lab/senses/measure', { brain: 'lab-little-eyes', unload: true })).body;
await wait();
check('Measure runs the picture pack and the quick quiz, and keeps the result', ms.started && lab.brain.unloaded && lab.runs.at(-1).state === 'done' && (await call('/api/lab/senses', null, { method: 'GET' })).body.measures.at(-1).packs.sight.score === 50 && (await call('/api/lab/senses', null, { method: 'GET' })).body.measures.at(-1).quiz === 80);
lab.brain = null;

const ne = (await call('/api/lab/senses/noeyes', { brain: 'big-vl', on: true })).body;
check('Load without eyes and ears is saved per brain', ne.noEyes === true && JSON.parse(fs.readFileSync(cfg.settingsFile, 'utf8')).llamacpp.noEyes.includes('big-vl'));
const { LlamaCpp } = await import('../src/llamacpp.js').catch(() => ({}));
check('the engine leaves the reader out for that brain only', /!\(lc\.noEyes \|\| \[\]\)\.includes\(model\)/.test(read('src/llamacpp.js')) && /!\(this\.lc\.noEyes \|\| \[\]\)\.includes\(model\)/.test(read('src/llamacpp.js')));
await call('/api/lab/senses/noeyes', { brain: 'big-vl', on: false });
check('and can be turned back on', !JSON.parse(fs.readFileSync(cfg.settingsFile, 'utf8')).llamacpp.noEyes.includes('big-vl'));

// forget: the downloaded reader goes; your own file never does
registerPair(lab, lab.brains().find((b) => b.id === 'little'), eyesShape, readerFit(bg, readGguf(eyesShape)), 'your file');
(await call('/api/lab/senses/forget', { id: 'lab-little-eyes' }));
check('forgetting a pair takes it out of Bob and never deletes your own file', fs.existsSync(eyesShape) && !madeBrains(cfg).some((x) => x.id === 'lab-little-eyes'));
registerPair(lab, lab.brains().find((b) => b.id === 'little'), got, readerFit(bg, readGguf(got)), 'catalogue');
(await call('/api/lab/senses/forget', { id: 'lab-little-eyes' }));
check('a reader the Lab downloaded is deleted when its pair is forgotten', !fs.existsSync(got));

// ---- Sharpen ----
const good = { run: 'riker-eyes', sense: 'sight', way: 'heal', brainRepo: 'MouseWurX/28Bob', tower: 'Qwen/Qwen3.6-35B-A3B', lessons: [{ file: '/x/lessons.jsonl' }], hours_max: 5, dollars_max: 12 };
const sp1 = makeSensesPlan(good);
check('a Sharpen plan names full-size weights on Hugging Face, never a running file', sp1.problems.length === 0 && sp1.plan.teacher === 'MouseWurX/28Bob' && sp1.plan.senses.tower.repo === 'Qwen/Qwen3.6-35B-A3B' && sp1.plan.senses.way === 'heal' && !JSON.stringify(sp1.plan).includes('.gguf') && sp1.plan.rungs.length === 0);
check('it says plainly the Forge can\'t do it yet', sp1.notes.some((n) => /can't teach a brain|doesn't do Sharpen runs yet/.test(n)) && !makeSensesPlan(good, { forgeReady: true }).notes.some((n) => /yet/.test(n)));
check('a GGUF brain or a missing eye is refused in words', makeSensesPlan({ ...good, brainRepo: 'hf:o/n:brain.gguf' }).problems.some((x) => /full-size weights/.test(x)) && makeSensesPlan({ ...good, tower: '' }).problems.some((x) => /translator come from/.test(x)) && makeSensesPlan({ ...good, way: 'projector', tower: '' }).problems.some((x) => /never trained/.test(x)));
check('the brain can be a folder on the Forge\'s own disk, nowhere else', makeSensesPlan({ ...good, brainRepo: '', brainDir: '/workspace/bobs/28Bob' }).plan.senses.brain_dir === '/workspace/bobs/28Bob' && makeSensesPlan({ ...good, brainRepo: '', brainDir: '/etc/../root' }).problems.length > 0);
check('caps of 0 are said, and a cap under the estimate too', makeSensesPlan({ ...good, hours_max: 0 }).notes.some((n) => /caps of 0/.test(n)) && makeSensesPlan({ ...good, hours_max: 1 }).notes.some((n) => /under the estimate/.test(n)));
check('ears for Bob\'s own brains point at a new translator', makeSensesPlan({ ...good, sense: 'hearing' }).notes.some((n) => /no ear to keep/.test(n)));
check('a saved Sharpen plan never starts until the Forge says it can', forgeStartProblems({ plan: { ...sp1.plan }, allowed: true, hasKey: true, shown: { hours: 5, dollars: 12 } }).some((x) => /Sharpen plan/.test(x)) && !forgeStartProblems({ plan: { ...sp1.plan }, allowed: true, hasKey: true, shown: { hours: 5, dollars: 12 }, senses: true }).length);
const saved = (await call('/api/lab/senses/save', { form: good })).body;
check('Save writes it with the Forge\'s other plans', saved.file === 'riker-eyes.json' && JSON.parse(fs.readFileSync(path.join(dataDir, 'lab', 'forge-plans', 'riker-eyes.json'), 'utf8')).senses.way === 'heal');
check('another device sees the checks but never the plan text', (await call('/api/lab/senses/plan', { form: good }, { isLocal: false })).body.text === '' && (await call('/api/lab/senses/save', { form: good }, { isLocal: false })).code === 403);
check('the Lab\'s start passes the Forge\'s answer through', /senses: forgeDoesSenses\(dir\)/.test(read('src/lab.js')) && read('src/lab.js').match(/forgeDoesSenses\(dir\)/g).length === 2);

// lessons
const ldir = path.join(tmp, 'lessons-sight');
const wl = writeBuiltinLessons(ldir, { count: 24 });
const lines = fs.readFileSync(wl.file, 'utf8').trim().split('\n').map((l) => JSON.parse(l));
check('the built-in picture lessons are plain shapes with captions, in the Forge\'s shape', lines.length === 24 && lines.every((l) => l.images.length === 1 && fs.existsSync(path.join(ldir, l.images[0])) && l.messages[1].role === 'assistant') && BUILTIN_LESSONS >= 500);
const sl = writeBuiltinLessons(path.join(tmp, 'lessons-hearing'), { count: 9, sense: 'hearing' });
check('and sound lessons too', fs.readFileSync(sl.file, 'utf8').trim().split('\n').every((l) => JSON.parse(l).sounds[0].endsWith('.wav')));
const own = path.join(tmp, 'mine'); fs.mkdirSync(own);
for (let i = 0; i < 21; i++) { fs.writeFileSync(path.join(own, `p${i}.png`), pp[0].picture); if (i) fs.writeFileSync(path.join(own, `p${i}.txt`), 'a red square'); }
check('your own folder needs 20 pictures with captions', await throwsLike(() => readOwnLessons(path.join(tmp, 'nope')), /isn't there/) && readOwnLessons(own).count === 20);
fs.unlinkSync(path.join(own, 'p1.txt'));
check('and says how many it found when there are too few', await throwsLike(() => readOwnLessons(own), /found 19 pictures/));

// ---- the card ----
const ui = read('public/lab-senses.js');
check('the card has its four steps and honest limits', ['1. Find a match', '2. Attach and try', '3. Sharpen (rented)', '4. Measure', 'Honest limits', 'Load without eyes and ears', 'Take it out of Bob'].every((w) => ui.includes(w)));
check('the card uses the Lab\'s one chooser for where a reader comes from', /from '\.\/lab-source\.js'/.test(ui) && /sourceRowHtml\('senses-other'/.test(ui));
check('the card never starts a rental: Sharpen only saves a plan', !/forge\/start|forge\/card/.test(ui) && /purchase card/.test(ui));
check('the card mentions the cheap ears: my own ears and voice', /my own ears and voice/.test(ui));
check('the Forge tab places the card after the ways', /fg\.html\(sn\.html\(\)\)/.test(read('public/lab.js')) && /\$\{extra\}/.test(read('public/lab-forge.js')));
check('the card\'s events go before the Forge form\'s', read('public/lab.js').indexOf('sn.click(b)') < read('public/lab.js').indexOf('fg.click(b)') && read('public/lab.js').indexOf('sn.change(el)') < read('public/lab.js').indexOf('fg.change(el)'));
check('every control has a label, and results are announced', !/<input(?![^>]*(aria-label|type="file"|type="checkbox"|type="radio"|id="senses-))[^>]*>/.test(ui.replace(/<label[^>]*>[^<]*<input/g, '')) && /role="status"/.test(ui) && /role="alert"/.test(ui));
check('no names the house rules keep out', !/bobiverse|thoth/i.test(ui + read('src/lab-senses.js') + read('src/lab-senses-route.js')));
const help = read('public/help-content.js');
check('Help explains the card in my voice', /id: 'lab-senses'/.test(help) && /Give it eyes/.test(help));

console.log(`\n${pass} passed, ${fail} failed`);
fs.rmSync(tmp, { recursive: true, force: true });
process.exit(fail ? 1 : 0);

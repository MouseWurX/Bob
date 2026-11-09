// 1.5.16x The Playground's Longer, Faster and Teach it pages (thinking-paths.md sec 15): the sums, the plans, each job
// with fake steps (no engine, no Python, no downloads), Use this in Bob, the fit rule, where brains and lessons come
// from, the Forge plan for rented teaching (caps 0, never started), and the Turbo flags Bob's engine gets.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { Lab } from '../src/lab.js';
import { ggufInfo } from '../src/gguf.js';
import { meter, fitLines, fitsAnswer, ladderSizes, keptFrom, squeezeOf, GiB, STOPS } from '../public/lab-context-math.js';
import { haystack, found, contextView, planContext, startContext, useContext, contextSaw, forgetTurns, FORGET_FACTS } from '../src/lab-context.js';
import { draftsFor, planTurbo, startTurbo, useTurbo, bestGuess, turboSaw, turboView } from '../src/lab-turbo.js';
import { teachFit, lessonsPerHour, teachDiskGB, readBrainSource, readLessonSource, planTeach, saveTeachPlan, startTeach, useTaught, trainerState, startTrainerInstall, removeTrainer, uvUrl, FIT_ROWS, TRAINER } from '../src/lab-teach.js';
import { TEACH_PY, FETCH_PY } from '../src/lab-teach-script.js';
import { pagesRoute } from '../src/lab-pages.js';
import { LlamaCpp } from '../src/llamacpp.js';
import { saveSettings } from '../src/config.js';

let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra ? ' ' + extra : ''}`); };
const read = (p) => fs.readFileSync(new URL(`../${p}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bob-lab-pages-'));
const wait = async (lab) => { for (let i = 0; i < 200 && lab.job; i++) await new Promise((r) => setTimeout(r, 10)); };

// ---- tiny made-up brain files, with a chat-memory shape ----
function kv(key, type, value) {
  const k = Buffer.from(key); const h = Buffer.alloc(12 + k.length); h.writeBigUInt64LE(BigInt(k.length)); k.copy(h, 8); h.writeUInt32LE(type, 8 + k.length);
  let v;
  if (type === 8) { const s = Buffer.from(value); v = Buffer.alloc(8 + s.length); v.writeBigUInt64LE(BigInt(s.length)); s.copy(v, 8); }
  else { v = Buffer.alloc(4); v.writeUInt32LE(value); }
  return Buffer.concat([h, v]);
}
function makeGguf(file, kvs, padBytes = 0) {
  const t = { name: 'token_embd.weight', dims: [4, 4] };
  const parts = [Buffer.alloc(24)]; parts[0].write('GGUF', 0, 'latin1'); parts[0].writeUInt32LE(3, 4); parts[0].writeBigUInt64LE(1n, 8); parts[0].writeBigUInt64LE(BigInt(kvs.length), 16);
  for (const [k, ty, v] of kvs) parts.push(kv(k, ty, v));
  const n = Buffer.from(t.name); const b = Buffer.alloc(8 + n.length + 4 + 16 + 12);
  let o = 0; b.writeBigUInt64LE(BigInt(n.length), o); o += 8; n.copy(b, o); o += n.length; b.writeUInt32LE(2, o); o += 4; b.writeBigUInt64LE(4n, o); o += 8; b.writeBigUInt64LE(4n, o); o += 8; b.writeUInt32LE(0, o); o += 4; b.writeBigUInt64LE(0n, o);
  parts.push(b);
  let head = Buffer.concat(parts); head = Buffer.concat([head, Buffer.alloc(Math.ceil(head.length / 32) * 32 - head.length)]);
  fs.writeFileSync(file, Buffer.concat([head, Buffer.alloc(64 + padBytes)]));
}
const shape = (arch, ctx) => [['general.architecture', 8, arch], [`${arch}.context_length`, 4, ctx], [`${arch}.block_count`, 4, 4], [`${arch}.attention.head_count_kv`, 4, 8], [`${arch}.attention.key_length`, 4, 128], [`${arch}.attention.value_length`, 4, 128], ['general.file_type', 4, 1]];
const bigFile = path.join(tmp, 'big.gguf'), smallFile = path.join(tmp, 'small.gguf'), mtpFile = path.join(tmp, 'mtp.gguf'), lonely = path.join(tmp, 'lonely.gguf');
makeGguf(bigFile, [...shape('qwen3', 40960), ['general.name', 8, 'Big'], ['general.base_model.0.repo_url', 8, 'https://huggingface.co/Qwen/Qwen3-8B']], 9000);
makeGguf(smallFile, [...shape('qwen3', 40960), ['general.name', 8, 'Small']], 100);
makeGguf(mtpFile, [...shape('qwen35moe', 262144), ['qwen35moe.nextn_predict_layers', 4, 1]], 500);
makeGguf(lonely, [...shape('llama', 8192)], 50);

// ---- the Lab, with a made-up catalogue and engine folder ----
const dataDir = path.join(tmp, 'data'); fs.mkdirSync(dataDir, { recursive: true });
const exe = (n) => (process.platform === 'win32' ? `${n}.exe` : n);
const cfg = { dataDir, agentDir: tmp, bobModelsDir: path.join(tmp, 'models', 'bob'), settingsFile: path.join(dataDir, 'settings.json'), computerLab: true, gpuVramGB: 16, llamacpp: { exe: path.join(tmp, 'eng', exe('llama-server')) } };
fs.mkdirSync(path.join(tmp, 'eng')); for (const n of ['llama-server', 'llama-imatrix', 'llama-quantize', 'llama-export-lora']) fs.writeFileSync(path.join(tmp, 'eng', exe(n)), '');
const files = { big: bigFile, small: smallFile, mtp: mtpFile, lonely };
const catalog = { models: [
  { id: 'big', name: 'Big', family: 'Qwen', category: 'chat', license: 'apache-2.0' },
  { id: 'small', name: 'Small', family: 'Qwen', category: 'small' },
  { id: 'mtp', name: 'Headed', family: 'Qwen3.6', category: 'chat' },
  { id: 'lonely', name: 'Lonely', family: 'Llama', category: 'chat' }
] };
const shop = { cfg, catalog, locate: (e) => (files[e.id] ? { gguf: files[e.id] } : {}) };
const events = [];
const big = () => ({ ok: true, why: '' });
const mk = (steps = {}) => { const l = new Lab(cfg, { shop, room: big, broadcast: (e) => events.push(e), steps }); l.platform = () => ({ os: 'win', arch: 'x64' }); return l; }; // a pinned machine: tests never read the tester's own chip

// ---- the long-context lab: the sums ----
const per = 4 * 8 * 256; // 4 layers x 8 heads x (128 + 128)
{
  const m = meter({ fileBytes: 8 * GiB, perToken: per, ctx: 32768, squeeze: 'full', cardBytes: 16 * GiB, ramBytes: 32 * GiB });
  check('the meter adds the brain, its chat memory and working room, and says where it fits', m.kvGB === Math.round((per * 32768 * 2 / GiB) * 10) / 10 && m.where === 'card' && m.brainGB === 8);
  check('a smaller cache takes less memory', meter({ fileBytes: 8 * GiB, perToken: per, ctx: 32768, squeeze: 'quarter' }).kvGB < meter({ fileBytes: 8 * GiB, perToken: per, ctx: 32768, squeeze: 'half' }).kvGB && squeezeOf('nope').id === 'half');
  check('past the card it spills into RAM, and past both it doesn\'t fit', meter({ fileBytes: 15 * GiB, perToken: per, ctx: 8192, cardBytes: 16 * GiB, ramBytes: 32 * GiB }).where === 'spill' && meter({ fileBytes: 60 * GiB, perToken: per, ctx: 8192, cardBytes: 16 * GiB, ramBytes: 32 * GiB }).where === 'no');
  const f = fitLines({ fileBytes: 8 * GiB, perToken: per, max: 131072, squeeze: 'half', cardBytes: 16 * GiB, ramBytes: 32 * GiB });
  check('the red lines: biggest size on the card, biggest at all, never past what it was made for', f.card > 0 && f.all >= f.card && f.all <= 131072 && STOPS.includes(f.card));
  const a = fitsAnswer({ name: 'Big', fileBytes: 8 * GiB, perToken: per, max: 131072, cardBytes: 16 * GiB, ramBytes: 32 * GiB });
  check('"how long a chat can I have" gets a one-line answer in words and pages', /Big keeps a chat of about \d+K tokens \(about [\d,]+ words, \d+ pages\) on the graphics card/.test(a.line), a.line);
  check('a brain whose shape can\'t be read says so instead of guessing', /couldn't read/.test(fitsAnswer({ name: 'X', fileBytes: 1, perToken: 0 }).line));
  const s = ladderSizes(32768, 1), s2 = ladderSizes(32768, 2);
  check('the ladder greys sizes past the brain\'s window, and stretching opens them', s.find((x) => x.n === 65536).ok === false && s2.find((x) => x.n === 65536).ok === true && s2.find((x) => x.n === 65536).past === true);
  check('what gets forgotten: the newest turns that fit the window are kept', keptFrom([100, 100, 100, 100], 500, 200) === 1 && keptFrom([100, 100], 5000) === 0);
  const h = haystack(1000, 'otter', 0.5, 'Line one.\nLine two.\nLine three.\n');
  check('the long text hides the note near the middle', h.includes('the secret word for the blue door is otter') && Math.abs(h.indexOf('otter') / h.length - 0.5) < 0.1 && found('Otter.', 'otter') && !found('rotters', 'otter'));
  check('the forgetting demo is 20 turns and turn 1 is the cat', forgetTurns().length === 20 && FORGET_FACTS[0].includes('cat') && !forgetTurns().flat().some((m) => /you am/.test(m.content)));
}

// ---- the brain file's own facts ----
check('Bob reads whether a brain carries its own guesser, and where its full weights are', ggufInfo(mtpFile).mtp === 1 && ggufInfo(smallFile).mtp === 0 && ggufInfo(bigFile).origin === 'https://huggingface.co/Qwen/Qwen3-8B');

// ---- the long-context job, fake engine ----
{
  const seen = [];
  const lab = mk({
    serve: async (o) => { seen.push(o); return { url: 'http://fake', where: 'card', stop: () => seen.push('stop') }; },
    chat: async (url, msgs, o) => { const t = msgs[msgs.length - 1].content; const needle = (t.match(/blue door is (\w+)/) || [])[1]; const n = Math.round(t.length / 3.6); return { text: /secret word/.test(t) && n < 20000 ? needle : /cat called/.test(t) ? (msgs.length > 30 ? 'Pickle' : 'I don\'t know') : 'Rivers bend because', timings: { prompt_n: n, prompt_ms: n / 2, prompt_per_second: 2000, predicted_per_second: 60 - n / 1000 } }; },
    tokens: async () => 60
  });
  const v = contextView(lab);
  check('the page lists the brains with their window and shape, and this replicant matrix\'s card', v.brains.length === 4 && v.brains.find((b) => b.id === 'big').max === 40960 && v.brains.find((b) => b.id === 'big').perToken === per && v.cardBytes === 16 * GiB && v.brains.find((b) => b.id === 'mtp').bobStretch === true);
  check('a plan only takes sizes the brain can read, and says what stretching costs', planContext(lab, { brain: 'big', sizes: [1024, 65536] }).sizes.join() === '1024' && /sharpness/.test(planContext(lab, { brain: 'big', stretch: 2 }).notes.join(' ')) && planContext(lab, {}).problems.length === 1);
  const res = await startContext(lab, { brain: 'big', sizes: [1024, 4096, 16384, 32768], forget: true, squeeze: 'quarter', stretch: 1 });
  await wait(lab);
  const run = lab.runs[lab.runs.length - 1];
  check('it runs as a Lab job, one step per size and the forgetting demo', res.started && run.state === 'done' && run.steps.length === 6 && run.steps.every((s) => s.state === 'done'), run.error || '');
  check('the server is started with the cache squeeze and enough room, then stopped', seen[0].args.join(' ').includes('-ctk q4_0 -ctv q4_0') && seen[0].ctx >= 32768 && seen.includes('stop'));
  const rec = run.report.context;
  check('each size has time to first word, reading and writing speed, and whether the note was found', rec.rows.length === 4 && rec.rows.every((r) => r.tokens && r.firstWordS !== null && r.readTps && r.writeTps) && rec.rows[0].found && !rec.rows[3].found);
  check('the forgetting demo: the whole chat remembers, the 2K window doesn\'t', rec.forget.whole.right && !rec.forget.windowed.right && rec.forget.keptFrom > 1);
  check('the line under it says it in words', /missed the note at 32K/.test(run.report.saw) && /fell off the end/.test(run.report.saw), run.report.saw);
  check('the result is kept, small, for the page', contextView(lab).runs.length === 1 && fs.existsSync(path.join(dataDir, 'lab', 'context', 'big.json')));
  await startContext(lab, { brain: 'big', sizes: [1024], stretch: 2 }); await wait(lab);
  check('stretching passes the YaRN settings the 1.5.150 Long memory uses', seen.some((o) => o.args?.join(' ').includes('--rope-scaling yarn --rope-scale 2 --yarn-orig-ctx 40960')));
  const u = useContext(lab, { brain: 'big', ctx: 20000 });
  check('Use this in Bob writes the biggest Settings size under the pick, for that brain', u.ctx === 16384 && cfg.brainCtxOn === true && cfg.brainCtx.big === 16384 && /Pick how much each brain keeps in mind/.test(u.line));
  const u2 = useContext(lab, { brain: 'mtp', ctx: 600000 });
  check('a stretched size only for brains Long memory covers, and it switches Long memory on', u2.ctx === 524288 && cfg.brainCtxStretch === true && useContext(lab, { brain: 'big', ctx: 600000 }).ctx === 32768);
}

// ---- Turbo ----
{
  const v = turboView(mk());
  const bigB = v.brains.find((b) => b.id === 'big');
  check('a draft must be the same family and much smaller', bigB.drafts.map((d) => d.id).join() === 'small' && v.brains.find((b) => b.id === 'lonely').drafts.length === 0);
  check('it fits next to the main brain only when both and the chat memory fit the card', bigB.drafts[0].fits === true && draftsFor({ id: 'a', family: 'Q', fileBytes: 15.9 * GiB, perToken: 0 }, [{ id: 'b', family: 'Q', fileBytes: 1 * GiB, sizeGB: 1 }], { cardBytes: 16 * GiB })[0].fits === false);
  check('a brain with its own guesser is marked, and needs no draft', v.brains.find((b) => b.id === 'mtp').mtp === true);
  const lab = mk();
  check('the plan says why it can\'t start, in words', /family/.test(planTurbo(lab, { brain: 'lonely' }).problems[0]) && /own guesser/.test(planTurbo(lab, { brain: 'big', guesser: 'own' }).problems[0]) && !planTurbo(lab, { brain: 'big', draft: 'small' }).problems.length && !planTurbo(lab, { brain: 'mtp', guesser: 'own' }).problems.length);
  const seen = [];
  const tlab = mk({
    serve: async (o) => { seen.push(o); return { url: 'http://fake', where: 'card', stop: () => {} }; },
    chat: async () => { const o = seen[seen.length - 1]; const n = Number(o.args[o.args.indexOf('--draft-max') + 1]) || 0; return { text: 'def avg(): pass', timings: { predicted_per_second: n ? (n === 8 ? 70 : 40 + n) : 40, ...(n ? { draft_n: 100, draft_n_accepted: 100 - n * 5 } : {}) } }; }
  });
  await startTurbo(tlab, { brain: 'big', draft: 'small', guess: [2, 8, 16] }); await wait(tlab);
  const run = tlab.runs[tlab.runs.length - 1];
  const rec = run.report?.turbo;
  check('Try it runs Off then each guess length, with the draft brain', run.state === 'done' && seen.length === 4 && seen[0].args.length === 0 && seen[1].args.join(' ').includes(`-md ${smallFile} --draft-max 2`) && seen[1].cpuOk === false, run.error || '');
  check('each row has words a second, the accept rate and whether the words were the same', rec.rows.length === 4 && rec.rows[0].accept === null && rec.rows[1].accept === 90 && rec.rows.every((r) => r.same));
  check('the best length is picked, and the line explains why more isn\'t always faster', rec.best.guess === 8 && /1\.75x/.test(run.report.saw) && /isn't always faster/.test(run.report.saw), run.report.saw);
  check('no gain is said plainly', bestGuess([{ guess: 0, tps: 40 }, { guess: 4, tps: 40.5 }]) === null && /didn't make/.test(turboSaw({ brain: { name: 'X' }, rows: [{ guess: 0, tps: 40, same: true }], best: null })));
  seen.length = 0;
  await startTurbo(tlab, { brain: 'mtp', guesser: 'own', guess: [4] }); await wait(tlab);
  check('a brain with its own guesser runs with --spec-type draft-mtp and nothing else loaded', seen[1].args.join(' ') === '--spec-type draft-mtp --draft-max 4');
  const u = useTurbo(tlab, { brain: 'big', draft: 'small', guess: 8 });
  check('Use this in Bob saves that brain\'s Turbo row (a name, never a path)', cfg.llamacpp.turbo.big.on === true && cfg.llamacpp.turbo.big.draft === 'small' && cfg.llamacpp.turbo.big.max === 8 && /Turbo is on for Big/.test(u.line));
  saveSettings(cfg, { llamacpp: { turbo: { evil: { on: true, draft: 'C:\\x\\y.gguf' }, self: { on: true, draft: 'self' } } } });
  check('Settings refuses a path or the brain itself as its draft', !cfg.llamacpp.turbo.evil && !cfg.llamacpp.turbo.self);
  const e = new LlamaCpp({ ...cfg, llamacpp: { ...cfg.llamacpp, turbo: { big: { on: true, draft: 'small', max: 8 }, mtp: { on: true, mtp: true, max: 4 }, off: { on: false, draft: 'small' } }, draft: { enabled: true, model: 'small', max: 16 } } });
  clearInterval(e.idleTimer);
  e.resolve = (m) => ({ gguf: files[m] || bigFile });
  const ab = e.buildArgs('big').join(' '), am = e.buildArgs('mtp').join(' '), ao = e.buildArgs('lonely').join(' ');
  check('Bob\'s engine gets the per-brain Turbo, the built-in guesser, or the old one-draft setting', ab.includes(`-md ${smallFile} --draft-max 8 --draft-min 0 -ngld 99`) && am.includes('--spec-type draft-mtp --draft-max 4') && !am.includes('-md') && ao.includes(`-md ${smallFile} --draft-max 16`), `${ab} | ${am} | ${ao}`);
  useTurbo(tlab, { brain: 'big', off: true });
  check('Turbo can be switched off again for one brain', !cfg.llamacpp.turbo.big);
}

// ---- Teach it: the fit rule ----
check('the fit table matches the design (6, 8, 12, 16, 24 GB)', FIT_ROWS.map((r) => r.join('/')).join(' ') === '6/2/3 8/3/5 12/7/11 16/9/15 24/14/23');
check('16 GB teaches a 9B dense brain or a 15B mixture of experts here, and says why', teachFit({ os_: 'win', arch: 'x64', cardGB: 16, paramsB: 8.2 }).here && !teachFit({ os_: 'win', arch: 'x64', cardGB: 16, paramsB: 14 }).here && teachFit({ os_: 'win', arch: 'x64', cardGB: 16, paramsB: 14, moe: true }).here && /up to about 9 billion/.test(teachFit({ os_: 'win', arch: 'x64', cardGB: 16, paramsB: 8 }).why));
check('a 6 GB laptop teaches up to about 2B; bigger goes rented', teachFit({ os_: 'win', arch: 'x64', cardGB: 6, paramsB: 1.7 }).here && !teachFit({ os_: 'win', arch: 'x64', cardGB: 6, paramsB: 4 }).here);
check('phones and the Pi always go rented, with a reason', /Phones and the Raspberry Pi/.test(teachFit({ cardGB: 8, paramsB: 1, os_: 'android' }).why) && !teachFit({ cardGB: 8, paramsB: 1, os_: 'linux', arch: 'arm64' }).here);
check('no NVIDIA card goes rented; a Mac teaches in 16-bit, so about half', !teachFit({ os_: 'win', arch: 'x64', cardGB: 16, paramsB: 2, nvidia: false }).here && teachFit({ os_: 'win', arch: 'x64', cardGB: 16, paramsB: 3, unified: true, nvidia: false }).here && !teachFit({ os_: 'win', arch: 'x64', cardGB: 16, paramsB: 5, unified: true, nvidia: false }).here);
check('an unknown size asks to look it up first', /look it up first/.test(teachFit({ os_: 'win', arch: 'x64', cardGB: 16, paramsB: 0 }).why));
check('speed is honest: about 2,000 lessons an hour for a 4B brain, fewer for bigger', lessonsPerHour(4) === 2000 && lessonsPerHour(8) === 1000 && teachDiskGB(4).work > teachDiskGB(4, { download: false }).work);

// ---- Teach it: where brains and lessons come from ----
{
  const lab = mk();
  const hfFetch = async (url) => ({ ok: true, status: 200, json: async () => (/datasets/.test(url) ? { cardData: { license: 'mit' }, siblings: [{ rfilename: 'train.jsonl' }] } : (/3\.6/.test(url) ? { cardData: { license: 'apache-2.0' }, safetensors: { total: 35e9 }, config: { architectures: ['Qwen3_5MoeForConditionalGeneration'] }, siblings: [{ rfilename: 'model.safetensors' }] } : { cardData: { license: 'apache-2.0' }, safetensors: { total: 4.0e9 }, config: { architectures: ['Qwen3ForCausalLM'] }, siblings: [{ rfilename: 'model.safetensors' }] })) });
  lab.hfFetch = hfFetch;
  const a = await readBrainSource(lab, { kind: 'lab', id: 'big' });
  check('a brain here whose file names its original is taught from that original', a.repo === 'Qwen/Qwen3-8B' && !a.problems.length && a.gguf === bigFile);
  const b = await readBrainSource(lab, { kind: 'lab', id: 'small' });
  check('a running file with no original named asks for its Hugging Face name or a folder', /can't be taught directly/.test(b.problems[0]));
  const folder = path.join(tmp, 'mybrain'); fs.mkdirSync(folder); fs.writeFileSync(path.join(folder, 'config.json'), JSON.stringify({ num_local_experts: 8 })); fs.writeFileSync(path.join(folder, 'model.safetensors'), Buffer.alloc(2000));
  const c = await readBrainSource(lab, { kind: 'local', value: folder });
  check('a folder of safetensors here is read for its size and whether it\'s a mixture of experts', c.folder === folder && c.moe && !c.problems.length);
  check('a path that isn\'t here, or a folder with no brain, is refused in words', /isn't on this replicant matrix/.test((await readBrainSource(lab, { kind: 'local', value: path.join(tmp, 'nope') })).problems[0]) && /doesn't have a brain/.test((await readBrainSource(lab, { kind: 'local', value: tmp })).problems[0]));
  const d = await readBrainSource(lab, { kind: 'hf', repo: 'Qwen/Qwen3-4B' });
  check('a Hugging Face brain is looked up for its size and licence', d.repo === 'Qwen/Qwen3-4B' && d.paramsB === 4 && d.license === 'apache-2.0' && !d.problems.length);
  const e = await readBrainSource(lab, { kind: 'link', value: 'https://huggingface.co/Qwen/Qwen3-4B' });
  check('a Hugging Face link pasted as "another link" is read as Hugging Face', e.repo === 'Qwen/Qwen3-4B');
  check('another link must be https and an archive of a brain\'s folder, not a running file', /https/.test((await readBrainSource(lab, { kind: 'link', value: 'http://x.example/a.zip' })).problems[0]) && /archive/.test((await readBrainSource(lab, { kind: 'link', value: 'https://x.example/a.gguf' })).problems[0]) && (await readBrainSource(lab, { kind: 'link', value: 'https://x.example/brain.tar.gz' })).url);
  const setDir = path.join(dataDir, 'lab', 'lessons', 'my-set'); fs.mkdirSync(setDir, { recursive: true }); fs.writeFileSync(path.join(setDir, 'lessons.jsonl'), Array.from({ length: 40 }, () => JSON.stringify({ messages: [{ role: 'user', content: 'hi' }, { role: 'assistant', content: 'hello' }] })).join('\n')); fs.writeFileSync(path.join(setDir, 'write.json'), JSON.stringify({ name: 'My set' }));
  check('lessons: a Lab set, a .jsonl here, a Hugging Face dataset file, or a .jsonl link', readLessonSource(lab, { kind: 'set', id: 'my-set' }).count === 40 && readLessonSource(lab, { kind: 'local', value: path.join(setDir, 'lessons.jsonl') }).count === 40 && readLessonSource(lab, { kind: 'hf', repo: 'o/n', file: 'train.jsonl' }).hfFile === 'train.jsonl' && readLessonSource(lab, { kind: 'link', value: 'https://x.example/l.jsonl' }).url);
  check('a dataset with no licence says to keep it private; a non-jsonl is refused', /private/.test(readLessonSource(lab, { kind: 'hf', repo: 'o/n', file: 'train.jsonl' }).notes.join(' ')) && /\.jsonl/.test(readLessonSource(lab, { kind: 'hf', repo: 'o/n', file: 'a.parquet' }).problems[0]) && /\.jsonl/.test(readLessonSource(lab, { kind: 'link', value: 'https://x.example/a.txt' }).problems[0]));

  // the plan
  lab.gpuInfo = async () => ({ name: 'NVIDIA GeForce RTX 5070 Ti', vramGB: 16 });
  lab.platform = () => ({ os: 'win', arch: 'x64' }); // never the tester's own machine: CI has no NVIDIA card and may run on arm64
  const p = await planTeach(lab, { name: 'Taught', brain: { kind: 'hf', repo: 'Qwen/Qwen3-4B' }, lessons: { kind: 'set', id: 'my-set' } });
  check('a 4B brain on a 16 GB NVIDIA card is taught here, and needs the Trainer pack first', p.where === 'here' && p.fit.here && p.problems.some((x) => /Trainer pack/.test(x)) && p.hours > 0 && p.disk.work > p.disk.keep);
  const pr = await planTeach(lab, { name: 'Taught', where: 'rented', brain: { kind: 'local', value: folder }, lessons: { kind: 'set', id: 'my-set' } });
  check('rented needs the brain on Hugging Face, and says nothing is rented from here', pr.where === 'rented' && pr.problems.some((x) => /has to be on Hugging Face/.test(x)) && /Nothing is rented from here/.test(pr.notes.join(' ')));
  const saved = await saveTeachPlan(lab, { name: 'Taught Four', brain: { kind: 'hf', repo: 'Qwen/Qwen3.6-35B-A3B' }, lessons: { kind: 'set', id: 'my-set' } });
  const plan = JSON.parse(fs.readFileSync(path.join(dataDir, 'lab', 'forge-plans', 'taught-four.json'), 'utf8'));
  check('rented teaching is saved as a Forge plan for the form: the brain, adapter only, no odds pass, the lesson folder, caps 0', plan.teacher === 'Qwen/Qwen3.6-35B-A3B' && plan.train_teacher.experts === 'lora' && plan.train_teacher.hours >= 1 && plan.odds === false && plan.extra_lessons[0] === setDir && plan.hours_max === 0 && plan.dollars_max === 0 && plan.rungs.length === 0 && /Nothing is rented yet/.test(saved.line));
  check('the page never sees the lesson file\'s path', !JSON.stringify(saved.plan).includes(dataDir));
  check('the Forge only teaches Qwen3.5/3.6 mixtures of experts, so others are refused for rented', /only teaches Qwen3.5 and 3.6/.test((await planTeach(lab, { name: 'X', where: 'rented', brain: { kind: 'hf', repo: 'Qwen/Qwen3-4B' }, lessons: { kind: 'set', id: 'my-set' } })).problems.join(' ')));
  const ph = await saveTeachPlan(lab, { name: 'From HF', brain: { kind: 'hf', repo: 'Qwen/Qwen3.6-35B-A3B' }, lessons: { kind: 'hf', repo: 'o/n', file: 'train.jsonl' } });
  check('Hugging Face lessons go in the plan by name for the Forge\'s importer, private when there\'s no licence', ph.plan.hf_lessons[0].repo === 'o/n' && ph.plan.hf_lessons[0].private_only === true && !ph.plan.extra_lessons);
}

// ---- Teach it here, fake trainer ----
{
  const tr = path.join(tmp, 'trainer');
  const calls = [];
  const lab = mk({
    tool: async (exe, args, o) => {
      calls.push([path.basename(exe), args]);
      if (args.includes('-xf') || args.includes('-xzf')) { const to = args[args.indexOf('-C') + 1]; fs.mkdirSync(to, { recursive: true }); fs.writeFileSync(path.join(to, exe.endsWith('tar.exe') || exe === 'tar' ? (args.includes('-xzf') ? 'convert_hf_to_gguf.py' : exe.endsWith('.exe') ? 'uv.exe' : 'uv') : 'x'), ''); }
      if (args[0] === 'venv') { const py = process.platform === 'win32' ? path.join(args[3], 'Scripts', 'python.exe') : path.join(args[3], 'bin', 'python'); fs.mkdirSync(path.dirname(py), { recursive: true }); fs.writeFileSync(py, ''); }
      const out = args[args.indexOf('-o') + 1] || args[args.indexOf('--outfile') + 1];
      if (args.includes('Q4_K_M')) fs.writeFileSync(args[1], Buffer.alloc(1000));
      else if (out && (args.includes('-o') || args.includes('--outfile'))) fs.writeFileSync(out, '');
      if (args.includes('--lessons')) { for (let i = 1; i <= 3; i++) o.onLine(`progress ${i} 3`); o.onLine('loss 1.2345'); o.onLine('skipped 2'); o.onLine('done 38'); }
      return '';
    },
    download: async (url, out) => { fs.mkdirSync(path.dirname(out), { recursive: true }); fs.writeFileSync(out, ''); return 1; },
    quiz: async (l, gguf) => ({ score: /before/.test(gguf) || gguf === bigFile ? 50 : 62, tps: 30 })
  });
  lab.hfFetch = async () => ({ ok: true, status: 200, json: async () => ({ cardData: { license: 'apache-2.0' }, safetensors: { total: 4.0e9 }, siblings: [{ rfilename: 'model.safetensors' }] }) });
  lab.gpuInfo = async () => ({ name: 'NVIDIA GeForce RTX 5070 Ti', vramGB: 16 });
  lab.platform = () => ({ os: 'win', arch: 'x64' }); // never the tester's own machine: CI has no NVIDIA card and may run on arm64
  lab.freeGB = () => 1000;
  check('the Trainer pack isn\'t here until it\'s fetched', !trainerState(cfg).ok && trainerState(cfg).dir === tr && uvUrl('win', 'x64').endsWith(`/${TRAINER.uv}/uv-x86_64-pc-windows-msvc.zip`));
  await startTrainerInstall(lab); await wait(lab);
  const irun = lab.runs[lab.runs.length - 1];
  check('getting the Trainer pack is its own Lab job: uv, Python, the libraries (pinned), the converters', irun.state === 'done' && trainerState(cfg).ok && calls.some(([, a]) => a[0] === 'pip' && a.includes('torch==2.14.1')) && calls.some(([, a]) => a[0] === 'venv' && a.includes(TRAINER.python)), irun.error || '');
  calls.length = 0;
  const res = await startTeach(lab, { name: 'Taught Big', brain: { kind: 'lab', id: 'big' }, lessons: { kind: 'set', id: 'my-set' } });
  await wait(lab);
  const run = lab.runs[lab.runs.length - 1];
  check('teaching here runs as a Lab job: weights, lessons, adapter, fold in, quiz', res.started && run.state === 'done' && run.steps.length === 5 && run.steps.every((s) => s.state === 'done'), run.error || '');
  check('it downloads the original named in the file, teaches with teach.py, folds in with llama-export-lora', calls.some(([, a]) => a.includes('Qwen/Qwen3-8B')) && calls.some(([, a]) => String(a[0]).endsWith('teach.py')) && calls.some(([e]) => e.startsWith('llama-export-lora')) && fs.existsSync(path.join(tr, 'teach.py')));
  check('the before score is the brain file that was already here, the after score the new one', run.report.from.score === 50 && run.report.made.score === 62 && run.report.madeHere && run.report.learned === 38 && run.report.skipped === 2 && run.report.loss === 1.2345);
  check('the downloaded weights and the big in-between files are cleaned up', !fs.existsSync(path.join(cfg.bobModelsDir, 'lab', 'teach', 'taught-big', 'base')) && !fs.existsSync(path.join(cfg.bobModelsDir, 'lab', 'teach', 'taught-big', 'taught-f16.gguf')) && fs.existsSync(run.files.gguf));
  useTaught(lab, run.id);
  const made = JSON.parse(fs.readFileSync(path.join(dataDir, 'lab', 'made.json'), 'utf8')).find((m) => m.id === 'lab-teach-taught-big');
  check('Use in Bob marks it made here, lists its lessons, and doesn\'t make it the default', made?.madeHere === true && made.lessons.join() === 'My set' && /Taught here from Big/.test(made.what) && !cfg.models);
  check('a run that doesn\'t fit here won\'t start here', await startTeach(lab, { name: 'Huge', brain: { kind: 'hf', repo: 'Qwen/Qwen3-4B' }, lessons: { kind: 'set', id: 'my-set' }, where: 'rented' }).then(() => false, (e) => /goes rented/.test(e.message)));
  removeTrainer(lab);
  check('the Trainer pack can be removed, and only from its own folder', !fs.existsSync(tr) && !trainerState(cfg).ok);
}

// ---- the route ----
{
  const lab = mk();
  const out = [];
  const send = (res, code, v) => out.push([code, v]);
  const req = (method) => ({ method });
  await pagesRoute({ req: req('GET'), res: {}, p: '/api/lab/context', isLocal: false, lab, body: async () => ({}), send });
  await pagesRoute({ req: req('POST'), res: {}, p: '/api/lab/turbo/start', isLocal: false, lab, body: async () => ({ brain: 'big' }), send });
  await pagesRoute({ req: req('POST'), res: {}, p: '/api/lab/teach/plan', isLocal: false, lab, body: async () => ({}), send });
  check('the views are read-only for any device; starting a job is only on this replicant matrix', out[0][0] === 200 && out[0][1].brains.length >= 4 && out[1][0] === 403 && out[2][0] === 403);
  check('other Lab paths are left to the Lab', (await pagesRoute({ req: req('GET'), res: {}, p: '/api/lab/forge', isLocal: true, lab, body: async () => ({}), send })) === false);
  check('the Lab mounts these pages', /pagesRoute\(\{ req, res, p, isLocal, lab, body, send \}\)/.test(read('src/lab.js')));
}

// ---- the trainer script and the pages ----
const py = spawnSync(process.platform === 'win32' ? 'python' : 'python3', ['-c', 'import ast,sys; ast.parse(sys.stdin.read())'], { input: TEACH_PY + '\n' + FETCH_PY });
if (py.error) console.log('SKIP the trainer script parses (no Python here)'); else check('the trainer script parses as Python', py.status === 0, String(py.stderr || ''));
check('the trainer only learns the answers, and says how far it is', /\[-100\] \* len\(p_ids\)/.test(TEACH_PY) && /print\('progress %d %d'/.test(TEACH_PY) && /load_in_4bit=True/.test(TEACH_PY));
check('the trainer\'s token comes from the environment, never Bob\'s files', !/HF_TOKEN/.test(FETCH_PY) && !/token/.test(read('src/lab-teach.js').replace(/HF_TOKEN|Bearer|token\./g, '').match(/fetch\.py[^\n]*/)?.[0] || ''));
for (const f of ['public/lab-context-math.js', 'public/lab-context.js', 'public/lab-turbo.js', 'public/lab-teach.js', 'public/lab-playground.js']) check(`${f} parses`, spawnSync(process.execPath, ['--check', fileURLToPath(new URL(`../${f}`, import.meta.url))]).status === 0);
const pages = ['public/lab-context.js', 'public/lab-turbo.js', 'public/lab-teach.js'].map(read).join('\n');
check('the pages never name a rental service or the books', !/runpod|vast\.ai|bob[i]verse/i.test(pages));
check('the pages have a Use this in Bob button and plain-word honesty lines', /Use this in Bob/.test(pages) && /trades a little sharpness/.test(pages) && /the answer is exactly what/i.test(pages));

fs.rmSync(tmp, { recursive: true, force: true });
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

// 1.5.16x Teach it: fine-tuning here or rented, chosen by what fits (thinking-paths.md sec 15.3). One card: pick a
// brain and a lesson set, and the Lab says where it can be taught and why.
// - Here: an adapter (LoRA) taught against the brain held in 4-bit, on this replicant matrix's own card, with the
//   opt-in Trainer pack (Python and the usual training libraries, downloaded on first use, removable). The adapter is
//   folded into a new brain file with the engine's own tools (llama.cpp's converters and llama-export-lora), so the
//   result is an ordinary brain file and nothing new runs at chat time. Quick quiz before and after.
// - Rented: the same brain and lessons as a Forge plan (train the teacher, adapter only), saved for the Forge tab's
//   form, so it's filled in once. The Lab never starts a rental from here: the Forge tab's purchase card does that.
// Brains come from this replicant matrix (a brain Bob has, a .gguf whose header names its original, or a folder of
// safetensors), Hugging Face, or another link (an archive of a brain's folder). Lessons: a Lab lesson set, a JSONL
// file here, a Hugging Face dataset file, or a link to a JSONL file.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { labDir, labModelsDir, inspect, slugOf, lessonSets } from './lab.js';
import { parseHfRef, hfLookup } from './lab-hf.js';
import { forgePlansDir } from './lab-forge.js';
import { startServer, runQuiz } from './lab-test.js';
import { ggufInfo } from './gguf.js';
import { gpuInfo, OS, venvPython } from './platform.js';
import { TEACH_PY, FETCH_PY } from './lab-teach-script.js';
import { readJson, writeJson, isInsideDir, exeName, canStart, makeRoom, runJob, runTool, pageLog } from './lab-jobs.js';

// ---- The fit rule (the card shows which row applies and why; the person can always pick rented) ----
// Card memory -> the biggest dense brain taught here (adapter on a 4-bit base), and a mixture of experts by its total.
export const FIT_ROWS = [[6, 2, 3], [8, 3, 5], [12, 7, 11], [16, 9, 15], [24, 14, 23]];
export function teachFit({ cardGB = 0, paramsB = 0, moe = false, os_ = OS, arch = process.arch, nvidia = true, unified = false }) {
  if (os_ === 'android' || (os_ === 'linux' && arch === 'arm64')) return { here: false, limitB: 0, why: 'Phones and the Raspberry Pi can\'t teach a brain themselves: their chips have no room for training. It goes rented.' };
  if (!cardGB) return { here: false, limitB: 0, why: 'There\'s no graphics card here the trainer can use, so it goes rented.' };
  if (!unified && !nvidia) return { here: false, limitB: 0, why: 'Teaching here needs an NVIDIA card for now (the 4-bit trainer is built for it). It goes rented.' };
  // A Mac teaches in 16-bit (the 4-bit trainer is NVIDIA-only), so the same memory holds about half as much.
  const eff = unified ? cardGB / 2 : cardGB;
  const row = [...FIT_ROWS].reverse().find(([gb]) => eff >= gb);
  if (!row) return { here: false, limitB: 0, why: `${cardGB} GB of graphics memory is too little to teach even a small brain${unified ? ' on a Mac' : ''}. It goes rented.` };
  const limitB = moe ? row[2] : row[1];
  const words = `With ${cardGB} GB${unified ? ' shared with the Mac' : ' on the card'}, Bob can teach ${moe ? 'a mixture of experts' : 'a brain'} up to about ${limitB} billion weights here${unified ? ' (16-bit on a Mac)' : ''}.`;
  if (!(paramsB > 0)) return { here: false, limitB, why: `${words} Bob doesn't know this brain's size yet, so look it up first.` };
  return paramsB <= limitB ? { here: true, limitB, why: `${words} This one has ${paramsB} billion, so it fits.` } : { here: false, limitB, why: `${words} This one has ${paramsB} billion, so it goes rented.` };
}
// Lessons an hour here: about 2,000 for a 4B brain on a 16 GB card, fewer for bigger brains.
export const lessonsPerHour = (paramsB) => Math.round(Math.min(8000, Math.max(150, (2000 * 4) / Math.max(0.5, paramsB || 4))));
// Disk while it works: the full weights (2 bytes a weight), a full-size file of the original and of the taught brain,
// and two running files. Kept after: the two running files and the adapter.
export const teachDiskGB = (paramsB, { download = true } = {}) => ({ work: Math.ceil(paramsB * ((download ? 2 : 0) + 2 + 2 + 1.2) + 1), keep: Math.ceil(paramsB * 1.2 + 0.5) });

// ---- The Trainer pack (opt-in, its own folder, removable) ----
export const TRAINER = {
  uv: '0.13.4', python: '3.12', llamacpp: 'b12032', sizeGB: { cuda: 7, mac: 3 },
  packages: ['torch==2.14.1', 'transformers==5.20.2', 'peft==0.21.2', 'accelerate==1.15.0', 'safetensors==0.8.0', 'sentencepiece==0.2.2', 'protobuf', 'numpy', 'huggingface_hub'],
  cudaOnly: ['bitsandbytes==0.50.2'],
  torchIndex: 'https://download.pytorch.org/whl/cu128',
  licences: [['uv', 'MIT or Apache-2.0'], ['Python', 'PSF'], ['PyTorch', 'BSD-3-Clause'], ['Transformers, PEFT, Accelerate', 'Apache-2.0'], ['bitsandbytes', 'MIT'], ['llama.cpp converters', 'MIT']]
};
export const trainerDir = (cfg) => path.join(cfg.agentDir, 'trainer');
const uvAsset = (os_ = OS, arch = process.arch) => {
  const a = arch === 'arm64' ? 'aarch64' : 'x86_64';
  if (os_ === 'win') return `uv-${a}-pc-windows-msvc.zip`;
  if (os_ === 'mac') return `uv-${a}-apple-darwin.tar.gz`;
  return `uv-${a}-unknown-linux-gnu.tar.gz`;
};
export const uvUrl = (os_ = OS, arch = process.arch) => `https://github.com/astral-sh/uv/releases/download/${TRAINER.uv}/${uvAsset(os_, arch)}`;
export const llamaSrcUrl = () => `https://github.com/ggml-org/llama.cpp/archive/refs/tags/${TRAINER.llamacpp}.tar.gz`;
// `hw` = { os, arch }: the machine, injectable so tests never read the tester's own chip (the builder's rule).
export const hwOf = (lab) => (lab?.platform ? lab.platform() : { os: OS, arch: process.arch });
export function trainerState(cfg, hw = { os: OS, arch: process.arch }) {
  const dir = trainerDir(cfg);
  const rec = readJson(path.join(dir, 'trainer.json'), null);
  const py = venvPython(path.join(dir, 'venv'));
  const ok = Boolean(rec?.ok) && fs.existsSync(py) && fs.existsSync(path.join(dir, 'llama.cpp', 'convert_hf_to_gguf.py'));
  return { ok, dir, python: py, version: rec?.version || '', at: rec?.at || 0, sizeGB: hw.os === 'mac' ? TRAINER.sizeGB.mac : TRAINER.sizeGB.cuda, licences: TRAINER.licences, supported: hw.os !== 'android' && !(hw.os === 'linux' && hw.arch === 'arm64') };
}

async function download(url, out, { signal, onProgress = () => {}, headers = {}, maxBytes = 200e9 } = {}) {
  const res = await fetch(url, { headers, redirect: 'follow', signal });
  if (!res.ok) throw new Error(`The download answered ${res.status}.`);
  const total = Number(res.headers.get('content-length')) || 0;
  if (total > maxBytes) throw new Error(`That's ${Math.round(total / 1e9)} GB, more than the Lab will download for this.`);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  const f = fs.createWriteStream(out + '.part');
  let got = 0;
  try {
    for await (const chunk of res.body) {
      got += chunk.length;
      if (got > maxBytes) throw new Error('The download is bigger than the Lab allows for this.');
      if (!f.write(chunk)) await new Promise((r) => f.once('drain', r));
      onProgress(got, total);
    }
  } finally { await new Promise((r) => f.end(r)); }
  fs.renameSync(out + '.part', out);
  return got;
}
const tarExe = () => (OS === 'win' ? path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'tar.exe') : 'tar');

export async function startTrainerInstall(lab) {
  canStart(lab, { room: false });
  const st = trainerState(lab.cfg, hwOf(lab));
  if (!st.supported) throw new Error('The Trainer pack doesn\'t run on this replicant matrix. Teach it rented instead.');
  const dir = st.dir, log = pageLog(lab.cfg, 'teach');
  const fx = { download, tool: runTool, ...lab.stepFns };
  const steps = [['uv', `Get uv ${TRAINER.uv} (it installs Python and the libraries)`], ['python', `Get Python ${TRAINER.python} in its own folder`], ['libs', 'Get the training libraries (the big part)'], ['conv', `Get llama.cpp ${TRAINER.llamacpp}'s converters`]];
  return runJob(lab, { kind: 'trainer', name: 'Get the Trainer pack', steps, stopped: 'You stopped it. Start it again to carry on, or Remove it in Settings.' }, async (r, { set, signal, progress }) => {
    fs.mkdirSync(dir, { recursive: true });
    const uvDir = path.join(dir, 'uv'), env = { ...process.env, UV_CACHE_DIR: path.join(dir, 'cache'), UV_PYTHON_INSTALL_DIR: path.join(dir, 'python') };
    set('uv', 'running');
    const arch = path.join(dir, uvAsset());
    await fx.download(uvUrl(), arch, { signal, maxBytes: 200e6, onProgress: (g, t) => t && progress((5 * g) / t) });
    fs.mkdirSync(uvDir, { recursive: true });
    await fx.tool(tarExe(), ['-xf', arch, '-C', uvDir], { signal, log });
    const uv = findFile(uvDir, exeName('uv'));
    if (!uv) throw new Error('uv didn\'t unpack where Bob expected it.');
    set('uv', 'done'); set('python', 'running');
    await fx.tool(uv, ['venv', '--python', TRAINER.python, path.join(dir, 'venv')], { signal, log, env });
    set('python', 'done'); set('libs', 'running'); progress(15);
    const py = venvPython(path.join(dir, 'venv'));
    const cuda = OS !== 'mac';
    await fx.tool(uv, ['pip', 'install', '--python', py, ...(cuda ? ['--index-url', TRAINER.torchIndex, '--extra-index-url', 'https://pypi.org/simple', '--index-strategy', 'unsafe-best-match'] : []), ...TRAINER.packages, ...(cuda ? TRAINER.cudaOnly : [])], { signal, log, env, onLine: (l) => { if (/Downloading|Prepared|Installed/.test(l)) progress(Math.min(85, r.progress + 1), `Get the training libraries: ${l.trim().slice(0, 60)}`); } });
    set('libs', 'done'); set('conv', 'running');
    const src = path.join(dir, 'llama-src.tar.gz');
    await fx.download(llamaSrcUrl(), src, { signal, maxBytes: 500e6 });
    const lc = path.join(dir, 'llama.cpp');
    fs.rmSync(lc, { recursive: true, force: true }); fs.mkdirSync(lc, { recursive: true });
    await fx.tool(tarExe(), ['-xzf', src, '-C', lc, '--strip-components=1'], { signal, log });
    await fx.tool(uv, ['pip', 'install', '--python', py, path.join(lc, 'gguf-py')], { signal, log, env });
    for (const f of [arch, src]) fs.rmSync(f, { force: true });
    writeJson(path.join(dir, 'trainer.json'), { ok: true, version: `uv ${TRAINER.uv}, Python ${TRAINER.python}, llama.cpp ${TRAINER.llamacpp}`, packages: [...TRAINER.packages, ...(cuda ? TRAINER.cudaOnly : [])], at: lab.now() });
    set('conv', 'done');
    return { trainer: trainerState(lab.cfg, hwOf(lab)) };
  });
}
function findFile(dir, name, depth = 3) {
  let ents = []; try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch { return null; }
  for (const e of ents) { const f = path.join(dir, e.name); if (e.isFile() && e.name === name) return f; }
  if (depth > 0) for (const e of ents) if (e.isDirectory()) { const f = findFile(path.join(dir, e.name), name, depth - 1); if (f) return f; }
  return null;
}
export function removeTrainer(lab) {
  if (lab.job?.run?.kind === 'trainer' || lab.job?.run?.kind === 'teach') throw new Error('The trainer is busy. Stop it first.');
  const dir = trainerDir(lab.cfg);
  if (!isInsideDir(dir, lab.cfg.agentDir)) throw new Error('The Trainer pack isn\'t where Bob put it, so he won\'t delete it.');
  fs.rmSync(dir, { recursive: true, force: true });
  return { removed: true };
}

// ---- Where things come from ----
const HTTPS = /^https:\/\/[^\s/$.?#][^\s]*$/i;
const ARCHIVE = /\.(zip|tar|tar\.gz|tgz)(\?.*)?$/i;
// A brain: { kind: 'lab', id } | { kind: 'local', value } (a .gguf or a folder) | { kind: 'hf', repo|ref } | { kind: 'link', value }.
export async function readBrainSource(lab, s = {}, { fetchFn = lab.hfFetch || fetch } = {}) {
  const out = { kind: s.kind, name: '', paramsB: 0, moe: false, license: '', repo: '', revision: '', folder: '', url: '', gguf: '', problems: [], notes: [] };
  const fromGguf = (gguf, name) => {
    let f = null, info = null; try { f = inspect({ gguf }); info = ggufInfo(gguf); } catch {}
    out.gguf = gguf; out.name = name || f?.name || path.basename(gguf).replace(/\.gguf$/i, ''); out.paramsB = f?.paramsB || 0; out.moe = Boolean(f?.experts);
    const r = info?.origin ? parseHfRef(info.origin, 'model') : null;
    if (r?.kind === 'model') { out.repo = r.repo; out.notes.push(`${out.name}'s file says its full weights are ${r.repo} on Hugging Face, so that's what is taught; the file here is used for the before score.`); }
    else out.problems.push(`A running file (.gguf) can't be taught directly, and ${out.name}'s file doesn't say where its full weights are. Pick its original on Hugging Face, or a folder that has them.`);
  };
  if (s.kind === 'lab') {
    const b = lab.brains().find((x) => x.id === String(s.id || '')); if (!b) { out.problems.push('That brain isn\'t here any more.'); return out; }
    fromGguf(b.gguf, b.name); out.license = b.license || ''; out.labId = b.id;
    if (out.repo && !(out.paramsB >= 0.5)) { const i = await hfLookup(parseHfRef(out.repo, 'model'), { fetchFn }).catch(() => null); if (i?.ok) { out.paramsB = i.paramsB || out.paramsB; out.moe = out.moe || Boolean(i.moe); out.license ||= i.license || ''; } }
    return out;
  }
  if (s.kind === 'local') {
    const v = String(s.value || '').trim().replace(/^"|"$/g, '');
    if (!v || !path.isAbsolute(v) || !fs.existsSync(v)) { out.problems.push('That path isn\'t on this replicant matrix. Paste the whole path.'); return out; }
    if (/\.gguf$/i.test(v)) { fromGguf(v); return out; }
    if (!fs.statSync(v).isDirectory() || !fs.existsSync(path.join(v, 'config.json'))) { out.problems.push('That folder doesn\'t have a brain in it (a config.json and .safetensors files).'); return out; }
    const cfgj = readJson(path.join(v, 'config.json'), {});
    const bytes = fs.readdirSync(v).filter((f) => f.endsWith('.safetensors')).reduce((a, f) => a + fs.statSync(path.join(v, f)).size, 0);
    if (!bytes) out.problems.push('That folder has no .safetensors files, so there are no weights to teach.');
    out.folder = v; out.name = path.basename(v); out.paramsB = Math.round((bytes / 2 / 1e9) * 10) / 10; out.moe = Boolean(cfgj.num_experts || cfgj.num_local_experts || cfgj.n_routed_experts);
    out.notes.push('Size is read from the folder (as 16-bit weights).');
    return out;
  }
  if (s.kind === 'hf') {
    const r = parseHfRef(s.repo ? (s.revision ? `hf:${s.repo}@${s.revision}` : s.repo) : String(s.ref || ''), 'model');
    if (!r || r.kind !== 'model') { out.problems.push('That isn\'t a Hugging Face brain name or link Bob can read.'); return out; }
    const i = await hfLookup(r, { fetchFn }).catch((e) => ({ ok: false, error: e.message }));
    if (!i.ok) { out.problems.push(i.error); return out; }
    Object.assign(out, { name: r.repo.split('/')[1], repo: r.repo, revision: r.revision || '', paramsB: i.paramsB || 0, moe: Boolean(i.moe), license: i.license || '' });
    if (!i.weights) out.problems.push(`${r.repo} has no .safetensors weights on Hugging Face (it may be running files only). Teaching needs the full weights.`);
    return out;
  }
  if (s.kind === 'link') {
    const v = String(s.value || '').trim();
    if (!HTTPS.test(v)) { out.problems.push('A link has to start with https://.'); return out; }
    const hf = parseHfRef(v, 'model');
    if (hf?.kind === 'model') return readBrainSource(lab, { kind: 'hf', ref: v }, { fetchFn });
    if (!ARCHIVE.test(v)) { out.problems.push('A link to a brain has to be an archive of its folder (.zip, .tar or .tar.gz) with the .safetensors files inside. A running file (.gguf) can\'t be taught.'); return out; }
    let size = 0; try { const h = await fetchFn(v, { method: 'HEAD', redirect: 'follow' }); size = Number(h.headers?.get?.('content-length')) || 0; } catch {}
    out.url = v; out.name = decodeURIComponent(v.split('/').pop().split('?')[0]).replace(ARCHIVE, ''); out.paramsB = size ? Math.round((size / 2 / 1e9) * 10) / 10 : 0;
    out.notes.push(size ? `The archive is ${Math.round(size / 1e9)} GB; Bob reads its size as 16-bit weights.` : 'Bob couldn\'t read the archive\'s size, so he can\'t check the fit before it\'s downloaded.');
    out.notes.push('Bob can\'t check the licence of a brain from another link. Only use one you have the right to change.');
    return out;
  }
  out.problems.push('Pick where the brain comes from.');
  return out;
}

// Lessons: { kind: 'set', id } | { kind: 'local', value } (.jsonl) | { kind: 'hf', repo, file } | { kind: 'link', value }.
export function readLessonSource(lab, s = {}) {
  const out = { kind: s.kind, name: '', file: '', url: '', repo: '', hfFile: '', revision: '', license: s.license || '', count: 0, problems: [], notes: [] };
  const count = (f) => { try { return fs.readFileSync(f, 'utf8').split('\n').filter((x) => x.trim()).length; } catch { return 0; } };
  if (s.kind === 'set') { const set = lessonSets(lab.cfg).find((x) => x.id === String(s.id || '')); if (!set) { out.problems.push('That lesson set isn\'t here any more.'); return out; } Object.assign(out, { name: set.name, file: set.file, count: set.count }); return out; }
  if (s.kind === 'local') {
    const v = String(s.value || '').trim().replace(/^"|"$/g, '');
    if (!v || !path.isAbsolute(v) || !fs.existsSync(v) || !/\.jsonl$/i.test(v)) { out.problems.push('Pick a .jsonl lesson file on this replicant matrix (the whole path).'); return out; }
    Object.assign(out, { name: path.basename(v), file: v, count: count(v) }); return out;
  }
  if (s.kind === 'hf') {
    const r = parseHfRef(s.repo ? `hf:datasets/${s.repo}${s.file ? `:${s.file}` : ''}${s.revision ? `@${s.revision}` : ''}` : String(s.ref || ''), 'dataset');
    if (!r || r.kind !== 'dataset') { out.problems.push('That isn\'t a Hugging Face dataset name or link Bob can read.'); return out; }
    if (!r.file || !/\.jsonl$/i.test(r.file)) { out.problems.push('Pick one .jsonl file from the dataset (Look it up lists them).'); return out; }
    Object.assign(out, { name: `${r.repo}:${r.file}`, repo: r.repo, hfFile: r.file, revision: r.revision || '' });
    if (!out.license) out.notes.push('This dataset has no licence on its card, so keep what you make from it private.');
    return out;
  }
  if (s.kind === 'link') {
    const v = String(s.value || '').trim();
    if (!HTTPS.test(v) || !/\.jsonl(\?.*)?$/i.test(v)) { out.problems.push('A link to lessons has to be https:// and end in .jsonl.'); return out; }
    Object.assign(out, { name: decodeURIComponent(v.split('/').pop().split('?')[0]), url: v });
    out.notes.push('Bob can\'t check the licence of lessons from another link. Only use ones you have the right to use.');
    return out;
  }
  out.problems.push('Pick the lessons.');
  return out;
}

// ---- The plan: where it goes, why, and what it costs in time and disk ----
export async function planTeach(lab, c = {}) {
  const problems = [], notes = [];
  const name = String(c.name || '').replace(/[^\w .-]/g, '').trim().slice(0, 40);
  if (!name) problems.push('Give the new brain a name.');
  const brain = await readBrainSource(lab, c.brain || {});
  const lessons = readLessonSource(lab, c.lessons || {});
  const g = await Promise.resolve((lab.gpuInfo || gpuInfo)()).catch(() => null);
  const cardGB = Number(lab.cfg.gpuVramGB) || Number(lab.cfg.cardGB) || g?.vramGB || 0;
  const hw = hwOf(lab);
  const fit = teachFit({ cardGB, paramsB: brain.paramsB, moe: brain.moe, os_: hw.os, arch: hw.arch, nvidia: /nvidia|geforce|rtx|quadro|tesla/i.test(g?.name || ''), unified: Boolean(g?.unified) });
  const where = c.where === 'rented' || !fit.here ? 'rented' : 'here';
  const epochs = [1, 2, 3].includes(Number(c.epochs)) ? Number(c.epochs) : 1;
  problems.push(...brain.problems, ...lessons.problems); notes.push(...brain.notes, ...lessons.notes);
  if (brain.license && !/apache|mit|bsd|cc-by|llama|qwen|gemma|openrail/i.test(brain.license)) notes.push(`${brain.name}'s licence is "${brain.license}". Read it before you share what you make.`);
  const tr = trainerState(lab.cfg, hw);
  let hours = null, disk = null;
  if (where === 'here') {
    if (!tr.ok) problems.push(`Teaching here needs the Trainer pack (about ${tr.sizeGB} GB). Get it first; Settings can remove it any time.`);
    if (lessons.count) hours = Math.max(0.1, Math.round(((lessons.count * epochs) / lessonsPerHour(brain.paramsB)) * 10) / 10);
    disk = teachDiskGB(brain.paramsB || 4, { download: !brain.folder });
    let freeGB = null; try { const d = labModelsDir(lab.cfg); fs.mkdirSync(d, { recursive: true }); if (lab.freeGB) freeGB = lab.freeGB(d); else { const st = fs.statfsSync(d); freeGB = Math.round((st.bavail * st.bsize) / 1e9); } } catch {}
    if (freeGB !== null && brain.paramsB && freeGB < disk.work + 5) problems.push(`It needs about ${disk.work} GB of disk while it works and there's ${freeGB} GB free.`);
    for (const t of ['quantize', 'server']) if (!lab.tools()[t].found) problems.push(`${path.basename(lab.tools()[t].path)} isn't in Bob's engine folder. Get models > Engines: the built-in engine has it.`);
    if (!fs.existsSync(exportLoraPath(lab))) problems.push(`${exeName('llama-export-lora')} isn't here; it folds the adapter into the new brain. It isn't in the engine's own download; it comes with Brain Engine, the Lab's engine (Get models, Engines, Brain Engine test build), from the build after this one.`);
    notes.push('What it can\'t do here: learn from a teacher\'s odds (that\'s the rented heal, which needs the teacher loaded too), heal a cut big brain, or teach anything over the fit line. Those go rented, with the same lessons.');
  } else {
    if (!brain.repo) problems.push('Teaching rented downloads the brain on the rented card, so it has to be on Hugging Face. Pick it by its Hugging Face name.');
    if (lessons.kind === 'link') problems.push('For a rented run, use a lesson set here or a Hugging Face dataset; a lesson file from another link isn\'t sent.');
    // The Forge's trainer loads Qwen3.5/3.6 mixture-of-experts brains by name (heal.py, rebuild.py); others fail at load.
    if (brain.repo && !(brain.moe && /qwen3\.[56]|qwen35/i.test(brain.repo))) problems.push(`The Forge only teaches Qwen3.5 and 3.6 mixture-of-experts brains for now, and ${brain.name} isn't one. Teach it here if it fits, or pick one of those.`);
    notes.push('Rented: Bob saves this as a Forge plan with the caps at 0. Open it in the Forge tab, type the hours and dollars you\'ll allow, and the purchase card starts it. Nothing is rented from here.');
  }
  return { name, slug: slugOf(name), brain, lessons, fit, where, epochs, hours, disk, trainer: tr.ok, problems, notes };
}
// Next to the engine's tools, or in Brain Engine's folder: the engine's own download doesn't carry it, Brain Engine's does.
export const exportLoraPath = (lab) => { const own = path.join(path.dirname(lab.tools().quantize.path), exeName('llama-export-lora')); const be = path.join(lab.cfg.agentDir, 'brain-engine', exeName('llama-export-lora')); return !fs.existsSync(own) && fs.existsSync(be) ? be : own; };

// ---- Teach it here ----
export async function startTeach(lab, c = {}, { unload = false } = {}) {
  canStart(lab);
  const p = await planTeach(lab, c);
  if (p.where !== 'here') throw new Error('This one goes rented. Use "Save as a Forge plan".');
  if (p.problems.length) throw new Error(p.problems[0]);
  const ask = await makeRoom(lab, unload); if (ask) return ask;
  const tr = trainerState(lab.cfg, hwOf(lab)), log = pageLog(lab.cfg, 'teach'), tools = lab.tools();
  const work = path.join(labModelsDir(lab.cfg), 'teach', p.slug);
  const fx = { tool: runTool, download, quiz: quizFile, ...lab.stepFns };
  const env = { ...process.env, PYTHONIOENCODING: 'utf-8', HF_HUB_DISABLE_TELEMETRY: '1' };
  const conv = path.join(tr.dir, 'llama.cpp');
  const steps = [['brain', `Get ${p.brain.name}'s full weights`], ['lessons', `Get the lessons (${p.lessons.name})`], ['teach', `Teach the adapter${p.hours ? ` (about ${p.hours} h)` : ''}`], ['fold', 'Fold it into a new brain file'], ['quiz', 'Quick quiz, before and after']];
  return runJob(lab, { kind: 'teach', name: p.name, from: p.brain.labId || '', fromName: p.brain.name, steps, stopped: 'You stopped it. Nothing was put into Bob; the work folder is kept until you delete it.' }, async (r, { set, signal, progress }) => {
    r.slug = `teach-${p.slug}`;
    fs.mkdirSync(work, { recursive: true });
    fs.writeFileSync(path.join(tr.dir, 'teach.py'), TEACH_PY); fs.writeFileSync(path.join(tr.dir, 'fetch.py'), FETCH_PY);
    set('brain', 'running');
    let base = p.brain.folder;
    if (!base && p.brain.repo) { base = path.join(work, 'base'); await fx.tool(tr.python, [path.join(tr.dir, 'fetch.py'), p.brain.repo, p.brain.revision || '', base], { signal, log, env }); }
    if (!base && p.brain.url) {
      const a = path.join(work, 'brain-archive'); await fx.download(p.brain.url, a, { signal, onProgress: (gt, t) => t && progress((10 * gt) / t) });
      base = path.join(work, 'base'); fs.mkdirSync(base, { recursive: true }); await fx.tool(tarExe(), ['-xf', a, '-C', base], { signal, log }); fs.rmSync(a, { force: true });
      const cfgAt = findFile(base, 'config.json'); if (!cfgAt) throw new Error('The archive has no config.json, so it isn\'t a brain\'s folder.'); base = path.dirname(cfgAt);
    }
    set('brain', 'done'); set('lessons', 'running');
    let lessonsFile = p.lessons.file;
    const hfHead = process.env.HF_TOKEN ? { Authorization: `Bearer ${process.env.HF_TOKEN}` } : {};
    if (p.lessons.repo) { lessonsFile = path.join(work, 'lessons.jsonl'); await fx.download(`https://huggingface.co/datasets/${p.lessons.repo}/resolve/${encodeURIComponent(p.lessons.revision || 'main')}/${p.lessons.hfFile.split('/').map(encodeURIComponent).join('/')}`, lessonsFile, { signal, headers: hfHead, maxBytes: 4e9 }); }
    if (p.lessons.url) { lessonsFile = path.join(work, 'lessons.jsonl'); await fx.download(p.lessons.url, lessonsFile, { signal, maxBytes: 4e9 }); }
    set('lessons', 'done'); set('teach', 'running');
    const adapter = path.join(work, 'adapter');
    let lastLoss = null, skipped = 0, learned = 0;
    await fx.tool(tr.python, [path.join(tr.dir, 'teach.py'), '--base', base, '--lessons', lessonsFile, '--out', adapter, '--epochs', String(p.epochs)], { signal, log, env, onLine: (l) => {
      let m;
      if ((m = l.match(/^progress (\d+) (\d+)/))) progress(15 + (60 * Number(m[1])) / Number(m[2]), `Teach the adapter: lesson ${m[1]} of ${m[2]}${lastLoss !== null ? `, loss ${lastLoss}` : ''}`);
      else if ((m = l.match(/^loss ([\d.]+)/))) lastLoss = Number(m[1]);
      else if ((m = l.match(/^skipped (\d+)/))) skipped = Number(m[1]);
      else if ((m = l.match(/^done (\d+)/))) learned = Number(m[1]);
    } });
    set('teach', 'done'); set('fold', 'running');
    const f16 = path.join(work, 'base-f16.gguf'), lora = path.join(work, 'adapter.gguf'), merged = path.join(work, 'taught-f16.gguf');
    const before = path.join(work, `${p.slug}-before-Q4_K_M.gguf`), after = path.join(work, `${p.slug}-Q4_K_M.gguf`);
    await fx.tool(tr.python, [path.join(conv, 'convert_hf_to_gguf.py'), base, '--outfile', f16, '--outtype', 'f16'], { signal, log, env });
    await fx.tool(tr.python, [path.join(conv, 'convert_lora_to_gguf.py'), adapter, '--base', base, '--outfile', lora, '--outtype', 'f16'], { signal, log, env });
    await fx.tool(exportLoraPath(lab), ['-m', f16, '--lora', lora, '-o', merged], { signal, log });
    progress(85);
    if (!p.brain.gguf) await fx.tool(tools.quantize.path, [f16, before, 'Q4_K_M'], { signal, log });
    await fx.tool(tools.quantize.path, [merged, after, 'Q4_K_M'], { signal, log });
    for (const f of [f16, merged]) fs.rmSync(f, { force: true });
    if (p.brain.repo && base.startsWith(work)) fs.rmSync(path.join(work, 'base'), { recursive: true, force: true }); // weights Bob downloaded; Hugging Face keeps them
    set('fold', 'done'); set('quiz', 'running');
    const was = await fx.quiz(lab, p.brain.gguf || before, signal).catch((e) => { if (signal.aborted) throw e; log(`before quiz: ${e.message}`); return null; });
    const now = await fx.quiz(lab, after, signal);
    set('quiz', 'done');
    let sizeGB = 0; try { sizeGB = Math.round((fs.statSync(after).size / 1e9) * 10) / 10; } catch {}
    r.files = { gguf: after }; r.sizeGB = sizeGB;
    writeJson(path.join(work, 'teach.json'), { name: p.name, from: p.brain.name, repo: p.brain.repo, lessons: [p.lessons.name], learned, skipped, epochs: p.epochs, madeHere: true, before: was?.score ?? null, after: now.score, at: lab.now() });
    return { made: { score: now.score, tps: now.tps }, from: was ? { score: was.score } : null, sizeGB, madeHere: true, lessons: [p.lessons.name], learned, skipped, loss: lastLoss };
  });
}
async function quizFile(lab, gguf, signal) {
  const srv = await startServer({ exe: lab.tools().server.path, gguf, signal, log: pageLog(lab.cfg, 'teach') });
  try { return await runQuiz(srv.url, { signal }); } finally { srv.stop(); }
}

// Use in Bob, for a brain taught here: the Lab's own Use in Bob (it only takes a finished, tested run), then the brain's
// card is marked "made here" with the lesson set it learned from. It never becomes Bob's default on its own.
export function useTaught(lab, runId) {
  const r = lab.runs.find((x) => x.id === runId && x.kind === 'teach');
  if (!r) throw new Error('That isn\'t a brain taught here.');
  const out = lab.use(runId);
  const file = path.join(labDir(lab.cfg), 'made.json');
  const list = readJson(file, []);
  const e = list.find((m) => m.id === `lab-${r.slug}`);
  if (e) { e.madeHere = true; e.lessons = r.report?.lessons || []; e.what = `Taught here from ${r.fromName} with ${e.lessons.join(', ')}. ${e.what || ''}`.trim(); writeJson(file, list); }
  return out;
}

// ---- Teach it rented: a Forge plan, saved for the Forge tab's form (caps 0, never started from here) ----
export async function saveTeachPlan(lab, c = {}) {
  const p = await planTeach(lab, { ...c, where: 'rented' });
  if (p.problems.length) throw new Error(p.problems[0]);
  const nick = String(c.nickname || '').replace(/[^\w .-]/g, '').trim().slice(0, 24);
  // extra_lessons entries are plain paths (forge.mjs): a Lab set's folder (lessons.jsonl + toolsets.json) or the .jsonl.
  const setDir = p.lessons.kind === 'set' ? path.dirname(p.lessons.file) : '';
  const lessons = p.lessons.repo ? { hf_lessons: [{ repo: p.lessons.repo, file: p.lessons.hfFile, ...(p.lessons.revision ? { revision: p.lessons.revision } : {}), license: p.lessons.license || '', ...(p.lessons.license ? {} : { private_only: true }) }] } : { extra_lessons: [path.resolve(setDir || p.lessons.file)] };
  const hours = Math.max(1, Math.ceil(((p.lessons.count || 1000) * p.epochs) / (lessonsPerHour(p.brain.paramsB) * 4)));
  const plan = { run: p.slug, template: 'teach-it', note: `Teach it (rented) from the Lab: ${p.brain.name} learns ${p.lessons.name}, adapter only, no cut.`, teacher: p.brain.repo, ...(p.brain.revision ? { teacher_revision: p.brain.revision } : {}), ...(p.brain.license ? { teacher_license: p.brain.license } : {}), train_teacher: { name: p.slug, nickname: nick || p.name, hours, experts: 'lora', epochs: p.epochs }, odds: false, ...lessons, rungs: [], hours_max: 0, dollars_max: 0 };
  // Caps stay 0 here: the Forge tab never starts a plan with 0 caps, and its card asks for hours (at least the teaching
  // hours plus about 1.5 for setup, export and the trip back) and dollars before the purchase press.
  const dir = forgePlansDir(labDir(lab.cfg)); fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${p.slug}.json`);
  writeJson(file, plan);
  return { file: path.basename(file), plan: { ...plan, extra_lessons: plan.extra_lessons?.map((x) => path.basename(x)) }, line: `Saved as the Forge plan "${p.slug}". Open the Forge tab, pick it, and type the hours (at least ${hours + 2}) and dollars you'll allow; the purchase card starts it. Nothing is rented yet.` };
}

export function teachView(lab) {
  const tr = trainerState(lab.cfg, hwOf(lab));
  return { trainer: { ok: tr.ok, sizeGB: tr.sizeGB, version: tr.version, licences: tr.licences, supported: tr.supported, uv: TRAINER.uv, python: TRAINER.python, llamacpp: TRAINER.llamacpp }, fit: FIT_ROWS.map(([gb, dense, moe]) => ({ gb, dense, moe })), brains: lab.brains().map((b) => ({ id: b.id, name: b.name })), sets: lessonSets(lab.cfg).map(({ id, name, count }) => ({ id, name, count })), runs: lab.runs.filter((r) => r.kind === 'teach').slice(-5).reverse().map((r) => lab.runView(r)), os: OS, ram: Math.round(os.totalmem() / 1024 ** 3) };
}

export async function teachRoute({ req, p, isLocal, lab, b, send, res }) {
  if (!p.startsWith('/api/lab/teach')) return false;
  if (req.method === 'GET' && p === '/api/lab/teach') { send(res, 200, teachView(lab)); return true; }
  if (!isLocal) { send(res, 403, { error: 'Teaching can only be started on this replicant matrix itself for now.' }); return true; }
  if (p === '/api/lab/teach/plan') { const x = await planTeach(lab, b); send(res, 200, { where: x.where, fit: x.fit, hours: x.hours, disk: x.disk, trainer: x.trainer, brain: { name: x.brain.name, paramsB: x.brain.paramsB, moe: x.brain.moe, license: x.brain.license, repo: x.brain.repo }, lessons: { name: x.lessons.name, count: x.lessons.count }, problems: x.problems, notes: x.notes }); return true; }
  if (p === '/api/lab/teach/start') { send(res, 200, await startTeach(lab, b, { unload: b.unload === true })); return true; }
  if (p === '/api/lab/teach/rented') { send(res, 200, await saveTeachPlan(lab, b)); return true; }
  if (p === '/api/lab/teach/use') { send(res, 200, useTaught(lab, String(b.id || ''))); return true; }
  if (p === '/api/lab/teach/trainer') { send(res, 200, await startTrainerInstall(lab)); return true; }
  if (p === '/api/lab/teach/trainer/remove') { send(res, 200, removeTrainer(lab)); return true; }
  return false;
}

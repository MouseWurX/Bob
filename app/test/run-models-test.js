// Tests the model shop: finding models other apps downloaded, safe downloads, and switching Bob over.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { ModelShop, guessKind, ownerOf, hostAllowed } from '../src/models.js';
import { mergeSettings } from '../src/config.js';
import { exeName } from '../src/platform.js';
import { ENGINES, pickAsset, engineStatus } from '../src/engines.js';
import { capabilities } from '../src/capabilities.js';

let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra ? ' ' + extra : ''}`); };
const until = async (fn, ms = 5000) => { const t = Date.now(); while (Date.now() - t < ms) { if (fn()) return true; await new Promise((r) => setTimeout(r, 20)); } return false; };

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'bob-models-'));
const big = (p) => { fs.mkdirSync(path.dirname(p), { recursive: true }); const fd = fs.openSync(p, 'w'); fs.ftruncateSync(fd, 25e6); fs.closeSync(fd); };
const comfy = path.join(root, 'pinokio', 'api', 'comfy.git', 'app', 'models');
big(path.join(comfy, 'diffusion_models', 'z_image_turbo_bf16.safetensors'));
big(path.join(comfy, 'vae', 'ae.safetensors'));
big(path.join(comfy, 'text_encoders', 'qwen_3_4b.safetensors'));
big(path.join(root, 'pinokio', 'api', 'Maestro.git', 'app', 'ckpts', 'ltx2_22B_distilled.safetensors'));
fs.writeFileSync(path.join(comfy, 'vae', 'tiny.safetensors'), 'x'); // too small to count
const agent = path.join(root, 'agent');
const man = path.join(agent, 'models', 'manifests', 'registry.ollama.ai', 'library', 'gemma4');
fs.mkdirSync(man, { recursive: true });
fs.writeFileSync(path.join(man, '26b'), '{}');

const dataDir = path.join(agent, 'inn', 'bob');
fs.mkdirSync(dataDir, { recursive: true });
// The fake Hugging Face here serves random bytes, so the tests use the catalog without its pins (1.5.0 pins every file).
const unpinned = (dir) => { const c = JSON.parse(fs.readFileSync(new URL('../catalog.json', import.meta.url), 'utf8')); for (const m of c.models) for (const f of m.files || []) { delete f.sha256; delete f.bytes; delete f.sizeOnly; } const f = path.join(dir, 'catalog-unpinned.json'); fs.writeFileSync(f, JSON.stringify(c)); return f; };
const cfg = {
  catalogFile: unpinned(dataDir),
  agentDir: agent, dataDir, bobModelsDir: path.join(agent, 'models', 'bob'), settingsFile: path.join(dataDir, 'settings.json'),
  modelSearchRoots: [path.join(root, 'pinokio', 'api')], ollamaUrl: 'http://127.0.0.1:1', engine: 'ollama',
  models: { bob: 'gemma4:26b' }, painter: { engine: 'comfy', sdcpp: { exe: 'C:\\sd\\sd-cli.exe' } }, llamacpp: { exe: 'C:\\llama\\llama-server.exe' }
};
const events = [];
const shop = new ModelShop(cfg, (e) => events.push(e));

// --- helpers
check('guesses Maestro video files', guessKind('C:\\pinokio\\api\\Maestro.git\\app\\ckpts\\ltx2_22B.safetensors') === 'video' && ownerOf('C:\\pinokio\\api\\Maestro.git\\app\\ckpts\\x') === 'Maestro');
check('guesses ComfyUI image files', guessKind('C:\\pinokio\\api\\comfy.git\\app\\models\\vae\\ae.safetensors') === 'images' && ownerOf('C:\\pinokio\\api\\comfy.git\\x') === 'ComfyUI');
check('only downloads from Hugging Face and GitHub over https', hostAllowed('https://huggingface.co/a/b') && hostAllowed('https://cas-bridge.xethub.hf.co/x') && !hostAllowed('http://huggingface.co/a') && !hostAllowed('https://evil.example/a') && !hostAllowed('https://huggingface.co.evil.example/a'));

// --- scan and status
await shop.scan();
check('scan finds big model files and skips small ones', shop.found.files.length === 4, String(shop.found.files.length));
const list = await shop.list();
const z = list.models.find((m) => m.id === 'z-image-turbo');
check('Z-Image from ComfyUI counts as installed', z.status.state === 'installed' && z.status.where.includes('ComfyUI'), JSON.stringify(z.status.where));
const g = list.models.find((m) => m.id === 'gemma4-26b');
check('Ollama models are found from manifests even with Ollama off', g.status.state === 'installed' && g.status.where[0] === 'Ollama');
check('Maestro video file shows under "also on this PC"', list.extras.some((f) => f.owner === 'Maestro' && f.kind === 'video'));
check('1.5.72: a model Ollama also has (Gemma 4 E4B) still downloads while Ollama is off, from its pinned link', list.models.find((m) => m.id === 'gemma4-e4b').status.canDownload);

// --- use: point the painter at ComfyUI's files
const patch = await shop.use('z-image-turbo');
const saved = JSON.parse(fs.readFileSync(cfg.settingsFile, 'utf8'));
check('"Use this" points Bob\'s painter at the existing files', cfg.painter.engine === 'sdcpp' && cfg.painter.sdcpp.image.vae.endsWith('ae.safetensors') && saved.painter.sdcpp.image.llm.endsWith('qwen_3_4b.safetensors'));
check('settings can\'t change the painter program or other locked keys', cfg.painter.sdcpp.exe === 'C:\\sd\\sd-cli.exe' && !('exe' in (saved.painter.sdcpp || {})));
const c2 = { painter: { sdcpp: { exe: 'a' } }, remote: { enabled: false }, readRoots: ['x'] };
mergeSettings(c2, { remote: { enabled: true }, readRoots: ['C:\\'], painter: { sdcpp: { exe: 'evil.exe' } }, llamacpp: { exe: 'evil.exe', preArgs: ['x'] }, autostart: true });
check('settings file can\'t turn on phone access, widen folders, or swap programs', c2.remote.enabled === false && c2.readRoots[0] === 'x' && c2.painter.sdcpp.exe === 'a' && !c2.llamacpp.exe && c2.autostart === true);

// --- downloads with a fake Hugging Face
const content = crypto.randomBytes(300000);
const sha = crypto.createHash('sha256').update(content).digest('hex');
let bad = false;
const realFetch = globalThis.fetch;
globalThis.fetch = async (url, opts = {}) => {
  const u = String(url);
  if (u.includes('127.0.0.1:1')) throw new Error('ECONNREFUSED');
  if (!u.startsWith('https://huggingface.co/')) return realFetch(url, opts);
  if (opts.method === 'HEAD') return new Response(null, { status: 302, headers: { 'x-linked-etag': `"${sha}"`, 'x-linked-size': String(content.length) } });
  const body = bad ? Buffer.from(content).fill(1, 0, 10) : content;
  const r = new Response(new ReadableStream({ start(c) { for (let i = 0; i < body.length; i += 65536) c.enqueue(body.subarray(i, i + 65536)); c.close(); } }), { status: 200 });
  Object.defineProperty(r, 'url', { value: u });
  return r;
};
await shop.download('whisper-base-en');
await until(() => events.some((e) => e.type === 'download' && ['done', 'failed'].includes(e.phase)));
const final = path.join(cfg.bobModelsDir, 'voice', 'ggml-base.en.bin');
check('download lands in models\\bob\\<category> with progress', fs.existsSync(final) && fs.statSync(final).size === content.length && events.some((e) => e.phase === 'checking'), events.at(-1)?.error || '');

events.length = 0; bad = true;
await shop.download('whisper-large-v3-turbo');
await until(() => events.some((e) => ['done', 'failed'].includes(e.phase)));
const ev = events.filter((e) => e.type === 'download').at(-1);
check('damaged download is caught and deleted', ev.phase === 'failed' && /checksum/.test(ev.error) && !fs.existsSync(path.join(cfg.bobModelsDir, 'voice', 'ggml-large-v3-turbo-q5_0.bin.part')), ev.error);

events.length = 0; bad = false;
await shop.download('whisper-large-v3-turbo', { queue: ['qwen3-4b'] });
await until(() => events.filter((e) => e.phase === 'done').length >= 2);
check('a setup pack downloads one after another', fs.existsSync(path.join(cfg.bobModelsDir, 'chat', 'Qwen3-4B-Instruct-2507-Q4_K_M.gguf')));

try { await shop.download('nope'); check('unknown model is refused', false); } catch { check('unknown model is refused', true); }
const p2 = await shop.use('qwen3-4b');
const engineBefore = cfg.engine;
check('a GGUF is wired up for his own engine, but the engine is never switched by itself (the app asks)', p2.needsEngine === 'llamacpp' && !('engine' in p2) && cfg.engine === engineBefore && cfg.models.bob === 'qwen3-4b' && cfg.llamacpp.models['qwen3-4b'].endsWith('.gguf') && cfg.llamacpp.exe === 'C:\\llama\\llama-server.exe');

const r = await shop.roles();
check('who-does-what lists every job with choices from this PC', r.jobs.length === 14 && r.jobs.some((j) => j.id === 'eyes') && r.jobs.some((j) => j.id === 'edit') && r.options.llm.some((o) => o.value === 'gemma4:26b') && r.options.images.some((o) => o.value === 'z-image-turbo') && r.current.image === 'z-image-turbo', JSON.stringify(r.current));
await shop.setRole('reviewer', 'gemma4:26b');
check('picking a brain for a job is saved', cfg.models.reviewer === 'gemma4:26b' && JSON.parse(fs.readFileSync(cfg.settingsFile, 'utf8')).models.reviewer === 'gemma4:26b');
try { await shop.setRole('tinker', 'not-on-this-pc:1b'); check('a brain that isn\'t on the PC is refused', false); } catch { check('a brain that isn\'t on the PC is refused', true); }
try { await shop.setRole('image', 'whisper-base-en'); check('a model can\'t be given the wrong job', false); } catch { check('a model can\'t be given the wrong job', true); }

// --- engines
const llamaAssets = ['llama-b7000-bin-win-cpu-x64.zip', 'llama-b7000-bin-win-cuda-12.4-x64.zip', 'llama-b7000-bin-win-cuda-13.1-x64.zip', 'llama-b7000-bin-win-vulkan-x64.zip', 'cudart-llama-bin-win-cuda-13.1-x64.zip', 'llama-b7000-bin-macos-arm64.zip'].map((name) => ({ name }));
const L = ENGINES.find((e) => e.id === 'llamacpp');
check('engine pick: newest CUDA build for NVIDIA cards', pickAsset(llamaAssets, L, true).name.includes('cuda-13.1'));
check('engine pick: Vulkan build for other cards', pickAsset(llamaAssets, L, false).name.includes('vulkan'));
check('engine pick: matching CUDA runtime is found', llamaAssets.some((a) => L.runtime('llama-b7000-bin-win-cuda-13.1-x64.zip').test(a.name)));
const W = ENGINES.find((e) => e.id === 'whispercpp');
check('engine pick: whisper.cpp CPU build (Bob listens on the processor)', pickAsset(['whisper-bin-x64.zip', 'whisper-cublas-12.4.0-bin-x64.zip', 'whisper-bin-Win32.zip'].map((name) => ({ name })), W, true).name === 'whisper-bin-x64.zip');
fs.mkdirSync(path.join(agent, 'sd.cpp'), { recursive: true }); fs.writeFileSync(path.join(agent, 'sd.cpp', exeName('sd')), 'x');
const es = engineStatus(cfg);
check('engine status sees an older sd.exe build as installed', es.find((e) => e.id === 'sdcpp').installed && !es.find((e) => e.id === 'llamacpp').installed);

// --- what Bob can do here
const cap0 = capabilities({ agentDir: agent, stt: { provider: 'whispercpp', model: path.join(agent, 'nope.bin') }, painter: { engine: 'sdcpp', sdcpp: { exe: path.join(agent, 'sd.cpp', exeName('sd')), image: cfg.painter.sdcpp.image } } });
check('pictures count only when the painter program and every model file exist', cap0.pictures === true && cap0.video === false && cap0.hearing === false, JSON.stringify(cap0));
const cap1 = capabilities({ agentDir: agent, stt: { provider: 'ollama', model: 'gemma4:26b' }, painter: { engine: 'comfy', comfy: {} } });
check('hearing through Ollama counts when the model is pulled; no ComfyUI workflow means no pictures', cap1.hearing === true && cap1.pictures === false, JSON.stringify(cap1));

const capM = capabilities({ agentDir: agent, stt: {}, painter: { engine: 'maestro' }, maestro: { enabled: false, image: 'flux2_klein_9b', video: 'ltx2_25' } });
check('Maestro settings do nothing while Maestro is switched off', !capM.pictures && !capM.video);
const { Brain } = await import('../src/brain.js');
const fakeBrain = Object.create(Brain.prototype);
fakeBrain.cfg = { maestro: { enabled: false, video: 'ltx2_25' }, painter: { engine: 'maestro' } };
let routed = '';
fakeBrain.viaMaestro = async () => { routed = 'maestro'; };
fakeBrain.paintOwn = async () => { routed = 'own'; };
try { await fakeBrain.makeVideo({ prompt: 'x' }, {}); } catch {}
check('make_video never goes to Maestro when it\'s switched off', routed !== 'maestro', routed);

// 1.5.25: a catalog entry's Ollama name must be the same model as its file. "qwen3:4b" in Ollama is the older thinking
// Qwen3 4B, so the Instruct 2507 entry pulled the wrong brain. It now always downloads its pinned file.
{ const c = JSON.parse(fs.readFileSync(new URL('../catalog.json', import.meta.url), 'utf8'));
  const q = c.models.find((m) => m.id === 'qwen3-4b');
  check('Qwen3 4B Instruct 2507 downloads its own file, not Ollama\'s older qwen3:4b', q && !q.ollama && /Instruct-2507/.test(q.files[0].url));
  const bad = c.models.filter((m) => m.ollama && (m.files || []).some((f) => /2507/i.test(f.url)) && !/2507/.test(m.ollama));
  check('no other entry pairs a 2507 file with an older Ollama name', bad.length === 0, bad.map((m) => m.id).join()); }
globalThis.fetch = realFetch;
fs.rmSync(root, { recursive: true, force: true });
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

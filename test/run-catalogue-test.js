// 1.5.56: the Brain catalogue (public/catalogue.js), Active models, the Gaming and Office slots, picture readers
// (mmproj) for downloaded brains, and the new catalog entries. Run: node test/run-catalogue-test.js
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { catalogueHtml, catJobs, modelsFor } from '../public/catalogue.js';
import { deviceFit, sourceOf, pickFor } from '../public/fit.js';
import { allSlots, isActive } from '../public/equip.js';
import { saveNameOf } from '../src/models.js';
import { mergeSettings, ollamaModelsDir, pinokioRoots } from '../src/config.js';
import { sessionBrains } from '../src/sessions.js';

let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra ? ' ' + extra : ''}`); };
const catalog = JSON.parse(fs.readFileSync(new URL('../catalog.json', import.meta.url), 'utf8'));
const here = new Set(['gemma4-26b', 'qwen3-coder-30b']);
const models = catalog.models.map((m) => ({ ...m, status: { state: here.has(m.id) ? 'installed' : 'missing', canDownload: true } }));
const byId = (id) => models.find((m) => m.id === id);
const roles = { current: { bob: 'gemma4:26b', tinker: 'qwen3-coder:30b' }, options: { llm: [{ value: 'gemma4:26b', label: 'Gemma 4 26B' }, { value: 'qwen3-coder:30b', label: 'Qwen3 Coder' }, { value: 'mystery:7b', label: 'mystery:7b' }] } };
const ctx = { roles, models, brains: {}, active: {}, vramGB: 16, ramGB: 32, freeGB: 500, packs: catalog.packs, platform: 'win32' };

// ---- the new entries ----
{
  const want = ['qwen3.6-35b-a3b', 'qwen3.6-27b', 'qwen3.8-27b', 'qwen3.5-9b', 'qwen3.5-4b', 'qwen3.5-2b', 'gemma4-e2b'];
  check('the newer families are in the list', want.every((id) => byId(id)), want.filter((id) => !byId(id)).join(','));
  check('every new brain says which jobs it does', want.every((id) => byId(id).jobs?.length));
  check('new brains are marked New (trial) until tried; Qwen 3.8 27B and Qwen3.6 35B-A3B (raced, 1.5.63) are not', want.filter((id) => !['qwen3.8-27b', 'qwen3.6-35b-a3b'].includes(id)).every((id) => byId(id).trial) && !byId('qwen3.8-27b').trial && !byId('qwen3.6-35b-a3b').trial);
  const hf = models.flatMap((m) => m.files || []).filter((f) => /huggingface\.co/.test(f.url));
  check('every Hugging Face link is pinned to a commit, with size and checksum', hf.every((f) => /\/resolve\/[0-9a-f]{40}\//.test(f.url) && f.bytes > 0 && (f.sizeOnly || /^[0-9a-f]{64}$/.test(f.sha256))));
  const seen = new Map(), clash = [];
  // Picture models share some files on purpose (the same VAE); a shared name must be the very same file.
  for (const m of models) for (const f of m.files || []) { if (m.into) continue; const k = `${m.category}/${saveNameOf(f).toLowerCase()}`; if (seen.has(k) && seen.get(k) !== (f.sha256 || f.bytes)) clash.push(k); seen.set(k, f.sha256 || f.bytes); }
  check('no two different files are saved under the same name (the mmproj files get their own)', !clash.length, clash.join(','));
  check('a saveAs name is a plain file name only', saveNameOf({ url: 'https://huggingface.co/a/b/resolve/x/mmproj-F16.gguf', saveAs: '../evil.gguf' }) === 'mmproj-F16.gguf' && saveNameOf({ url: 'https://huggingface.co/a/b/resolve/x/mmproj-F16.gguf', saveAs: 'Qwen3.5-4B-mmproj-F16.gguf' }) === 'Qwen3.5-4B-mmproj-F16.gguf');
  check('brains that see pictures bring their picture reader', want.filter((id) => byId(id).jobs.includes('eyes') && byId(id).files).every((id) => byId(id).files.some((f) => f.role === 'mmproj')));
}

// ---- the catalogue page ----
{
  const ids = catJobs().map((j) => j.id);
  check('the catalogue has a section per brain job, the phone and media', ['small', 'gaming', 'bob', 'deep', 'reviewer', 'tinker', 'office', 'eyes', 'phone', 'voice', 'speech', 'image', 'edit', 'video', 'music', 'embed'].every((id) => ids.includes(id)));
  check('every job except Sound effects is a slot (or the phone)', ids.every((id) => id === 'phone' || allSlots().some((s) => s.id === id)));
  check('every brain job has at least two choices', ['small', 'bob', 'deep', 'reviewer', 'tinker', 'office', 'eyes'].every((id) => modelsFor(catJobs().find((j) => j.id === id), models).length >= 2));
  check('Gaming lists only Qwen3 4B Instruct 2507', modelsFor(catJobs().find((j) => j.id === 'gaming'), models).map((m) => m.id).join() === 'qwen3-4b');
  check('the phone list has Gemma 4 E2B, Qwen3.5 2B and Qwen3 4B', ['gemma4-e2b', 'qwen3.5-2b', 'qwen3-4b'].every((id) => modelsFor({ id: 'phone' }, models).some((m) => m.id === id)));
  const html = catalogueHtml(ctx);
  check('each row has an Active switch', /data-active="qwen3.6-35b-a3b"/.test(html) && /role="switch" aria-checked="true" data-active="gemma4-26b"/.test(html) && /role="switch" aria-checked="false" data-active="qwen3.6-35b-a3b"/.test(html));
  check('the switch follows what was saved', /aria-checked="true" data-active="qwen3.6-35b-a3b"/.test(catalogueHtml({ ...ctx, active: { 'qwen3.6-35b-a3b': true } })) && /aria-checked="false" data-active="gemma4-26b"/.test(catalogueHtml({ ...ctx, active: { 'gemma4-26b': false } })));
  check('models here get Equip (or say equipped); the rest get Get', /data-catequip="tinker" data-catvalue="gemma4:26b"/.test(html) && /equipped/.test(html) && /data-get="qwen3.6-35b-a3b"/.test(html));
  check('New models carry the New tag and are never ★ Recommended', /cat-tinker-qwen3.6-35b-a3b[^]*?<span class="tag">New<\/span>/.test(html) && !Object.keys(Object.fromEntries(catJobs().map((j) => [j.id, 1]))).some((j) => models.filter((m) => m.trial).some((m) => pickFor(j, models, ctx)?.id === m.id)));
  check('the detail sits in an "i" tip: size on other machines, licence and source', /class="tip-i"[^>]*><span class="tip-src" hidden>[^<]*(<br>[^<]*)*6 GB laptop card: [^]*?Licence Apache 2\.0[^]*?From unsloth\/Qwen3\.6-35B-A3B-GGUF @ a483e9e/.test(html));
  check('the source link opens the exact commit', /href="https:\/\/huggingface\.co\/unsloth\/Qwen3\.6-35B-A3B-GGUF\/tree\/a483e9e6cbd595906af30beda3187c2663a1118c"/.test(html) && /href="https:\/\/huggingface\.co\/unsloth\/Qwen3\.8-27B-GGUF\/tree\/4ca720788d1e01f1bff70c033e0d0028fd02e502"/.test(catalogueHtml({ ...ctx, showUnsuited: true })));
  check('models that don\'t suit this replicant matrix wait behind Show them', !/id="cat-deep-qwen3.8-27b"/.test(html) && /id="cat-deep-qwen3.8-27b"/.test(catalogueHtml({ ...ctx, showUnsuited: true })) && /data-unsuited>Show them/.test(html));
  check('brains not in Bob\'s list get their own Active switch', /Other brains on this replicant matrix[^]*data-active="mystery:7b"/.test(html));
  check('the phone section has no Active switch or Get', !/id="cat-phone-[^"]*"[^]*?data-active[^]*?<\/li>/.test(html.slice(html.indexOf('catjob-phone'), html.indexOf('catjob-voice'))));
  check('nothing nasty gets through a model name', !/<script/.test(catalogueHtml({ ...ctx, roles: { ...roles, options: { llm: [{ value: 'x', label: '<script>x</script>' }] } } })));
}

// ---- fit on other machines ----
{
  const f = deviceFit(byId('qwen3.6-35b-a3b'));
  check('a 16 GB-card brain: fine on 16 GB, not on 6 GB or a phone', f.find((d) => d.id === 'big').level === 'ok' && f.find((d) => d.id === 'small').level !== 'ok' && f.find((d) => d.id === 'phone').level === 'no');
  check('Gemma 4 E2B fits everything, phone included', deviceFit(byId('gemma4-e2b')).every((d) => d.level === 'ok'));
  check('source of a pinned file names the repo and short commit', sourceOf(byId('gemma4-e2b')).label === 'ggml-org/gemma-4-E2B-it-GGUF @ b4243c1');
}

// ---- Active models ----
{
  check('not set: on this replicant matrix means active, not downloaded means not', isActive({ value: 'a', installed: true }) && !isActive({ value: 'b', installed: false }));
  check('a saved switch wins', !isActive({ value: 'a', installed: true }, { a: false }) && isActive({ value: 'b' }, { b: true }));
  const saved = mergeSettings({}, { activeModels: { 'qwen3.6-35b-a3b': true, 'gemma4:26b': false, 'bad key!': true, x: 'yes' } }).activeModels;
  check('only true/false switches with plain names are saved', saved['qwen3.6-35b-a3b'] === true && saved['gemma4:26b'] === false && !('bad key!' in saved) && !('x' in saved));
}

// ---- Gaming never gets E4B ----
{
  check('a saved E4B Gaming brain is refused', !('gaming' in (mergeSettings({}, { sessionBrains: { gaming: 'gemma4:e4b' } }).sessionBrains || {})));
  check('an old settings file with E4B in Gaming falls back to Qwen3 4B Instruct 2507', sessionBrains({ sessionBrains: { gaming: 'gemma4:e4b' } }).gaming === 'qwen3-4b' && sessionBrains({ sessionBrains: { gaming: 'qwen3-4b' } }).gaming === 'qwen3-4b');
}

// ---- llama.cpp finds a downloaded brain's picture reader ----
{
  const { LlamaCpp } = await import('../src/llamacpp.js').catch(() => ({}));
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bob-cat-'));
  const dir = path.join(tmp, 'models', 'bob', 'chat');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'Qwen3.5-4B-Q4_K_M.gguf'), 'x');
  fs.writeFileSync(path.join(dir, 'Qwen3.5-4B-mmproj-F16.gguf'), 'x');
  if (LlamaCpp) {
    const lc = Object.create(LlamaCpp.prototype);
    lc.cfg = { agentDir: tmp };
    const got = lc.catalogFile('qwen3.5-4b');
    check('a downloaded brain resolves to its GGUF and its own picture reader', got?.gguf?.endsWith('Qwen3.5-4B-Q4_K_M.gguf') && got?.mmproj?.endsWith('Qwen3.5-4B-mmproj-F16.gguf'), JSON.stringify(got));
    fs.rmSync(path.join(dir, 'Qwen3.5-4B-mmproj-F16.gguf'));
    check('without the picture reader it still runs, just without sight', lc.catalogFile('qwen3.5-4b')?.gguf && !lc.catalogFile('qwen3.5-4b').mmproj);
  } else check('llamacpp exports its engine class', false);
  fs.rmSync(tmp, { recursive: true, force: true });
}

// ---- no assumptions about how this replicant matrix is laid out ----
{
  const no = () => false;
  check('Ollama models: OLLAMA_MODELS wins', ollamaModelsDir({ agentDir: '/bob', env: { OLLAMA_MODELS: '/big/ollama' }, home: '/h', exists: no }) === '/big/ollama');
  check('...then Bob\'s own models folder if Ollama keeps its files there', ollamaModelsDir({ agentDir: '/bob', env: {}, home: '/h', exists: (p) => p === path.join('/bob', 'models', 'manifests') }) === path.join('/bob', 'models'));
  check('...else Ollama\'s usual folder in the user\'s home', ollamaModelsDir({ agentDir: '/bob', env: {}, home: '/h', exists: (p) => p === path.join('/h', '.ollama', 'models') }) === path.join('/h', '.ollama', 'models'));
  check('Pinokio is looked for on any drive and in the home folder, not only C:', pinokioRoots({ platform: 'win32', home: '/h', exists: (p) => p === 'E:\\pinokio' }).length === 2 && pinokioRoots({ platform: 'linux', home: '/h', exists: (p) => p === path.join('/h', 'pinokio') }).length === 2 && !pinokioRoots({ platform: 'win32', home: '/h', exists: no }).length);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

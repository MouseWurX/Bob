// Phase 0, step 3: which of Qwen3.6's experts does Bob's kind of work use? Feeds the lessons through llama.cpp's own
// counter (llama-imatrix, which ships with llama.cpp) and reads how many words each expert in each layer handled.
// node count-experts.mjs [--lessons <lessons.jsonl>] [--chunks 400] [--model ...] [--llama ...]
//   --parse <imatrix.gguf>  only read an existing counter file again
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { opts, locate, checkFree, ggufRead, ggufF32, moeShape, readJsonl, stamp } from './common.mjs';

const o = opts({ chunks: 400 });
const L = locate(o);
const dir = path.join(L.out, 'experts'); fs.mkdirSync(dir, { recursive: true });
const tag = o.jobs ? `-${String(o.jobs).replace(/[^\w,-]/g, '').replace(/,/g, '+')}` : '';
const imFile = o.parse || path.join(dir, `imatrix${tag}.gguf`);

if (!o.parse) {
  if (!L.model) { console.error('Qwen3.6 GGUF not found. Pass --model.'); process.exit(1); }
  if (!fs.existsSync(L.imatrix)) { console.error(`llama-imatrix not found at ${L.imatrix}. It ships in llama.cpp's release zip next to llama-server.`); process.exit(1); }
  checkFree(o);
  // The lessons as the model sees them (Qwen's chat layout), one long text.
  // --jobs coding,maths: count only those kinds of lessons (for a specialist Bob); the name goes on the files.
  const jobs = o.jobs ? String(o.jobs).split(',') : null;
  const lessons = readJsonl(o.lessons || path.join(L.out, 'lessons', 'lessons.jsonl')).filter((l) => !jobs || jobs.includes(l.job));
  if (!lessons.length) { console.error('No lessons yet. Run write-lessons.mjs first (or pass --lessons).'); process.exit(1); }
  const sets = (() => { try { return JSON.parse(fs.readFileSync(path.join(L.out, 'lessons', 'toolsets.json'), 'utf8')); } catch { return {}; } })();
  const parts = [];
  for (const l of lessons) {
    const first = l.messages.find((m) => m.set); const sys = sets[first?.set]?.system;
    if (sys && parts.length % 20 === 0) parts.push(`<|im_start|>system\n${sys}<|im_end|>`); // the long prompt now and then, not every time
    for (const m of l.messages) {
      if (m.role === 'user') parts.push(`<|im_start|>user\n${m.content}<|im_end|>`);
      else if (m.role === 'tool') parts.push(`<|im_start|>user\n<tool_response>\n${m.content}\n</tool_response><|im_end|>`);
      else if (m.role === 'assistant') {
        const calls = (m.tool_calls || []).map((c) => `<tool_call>\n{"name": "${c.function.name}", "arguments": ${c.function.arguments || '{}'}}\n</tool_call>`).join('\n');
        parts.push(`<|im_start|>assistant\n${m.reasoning ? `<think>\n${m.reasoning}\n</think>\n\n` : ''}${m.content || ''}${calls ? `\n${calls}` : ''}<|im_end|>`);
      }
    }
  }
  const corpus = path.join(dir, `corpus${tag}.txt`);
  fs.writeFileSync(corpus, parts.join('\n'));
  console.log(`Corpus: ${lessons.length} lessons, ${(fs.statSync(corpus).size / 1e6).toFixed(1)} MB`);
  const base = ['-m', L.model, '-f', corpus, '-o', imFile, '-c', '4096', '--chunks', String(o.chunks)];
  // Newest flags first; older llama.cpp builds refuse flags they don't know, so fall back step by step.
  const tries = [[...base, '--fit', 'on', '--no-ppl'], [...base, '--fit', 'on'], [...base, '-ngl', '999', '--n-cpu-moe', '24']];
  let ok = false;
  for (const args of tries) {
    console.log(`llama-imatrix ${args.slice(2).join(' ')}`);
    const r = spawnSync(L.imatrix, args, { stdio: ['ignore', 'inherit', 'pipe'], encoding: 'utf8', windowsHide: true, maxBuffer: 1 << 28 });
    fs.appendFileSync(path.join(dir, 'imatrix.log'), r.stderr || '');
    if (r.status === 0 && fs.existsSync(imFile)) { ok = true; break; }
    console.log(`  stopped (code ${r.status}): ${(r.stderr || '').split('\n').filter(Boolean).slice(-2).join(' | ')}`);
  }
  if (!ok) { console.error('llama-imatrix did not finish. See out\\experts\\imatrix.log.'); process.exit(1); }
}

// ---- read the counter file ----
const g = ggufRead(imFile);
const layers = [];
for (const t of g.tensors) {
  const m = t.name.match(/^blk\.(\d+)\.ffn_(gate|up)_exps\.weight\.counts$/);
  if (!m) continue;
  const li = Number(m[1]);
  if (layers[li] && m[2] === 'up') continue; // gate and up see the same words; one is enough
  layers[li] = ggufF32(imFile, g, t);
}
if (!layers.filter(Boolean).length) { console.error(`No per-expert counts in ${imFile} (tensor names: ${g.tensors.slice(0, 6).map((t) => t.name).join(', ')} ...). This llama.cpp build may be too old for per-expert counts.`); process.exit(1); }
const nExp = layers.find(Boolean).length;
if (nExp < 2) { console.error('The counts are not per expert (1 value per layer). A newer llama-imatrix is needed.'); process.exit(1); }

const KEEP = [48, 32, 16, 8];
const cover = (row, k) => { const s = [...row].sort((a, b) => b - a); const tot = s.reduce((a, b) => a + b, 0) || 1; return s.slice(0, k).reduce((a, b) => a + b, 0) / tot; };
const need = (row, p) => { const s = [...row].sort((a, b) => b - a); const tot = s.reduce((a, b) => a + b, 0) || 1; let acc = 0; for (let i = 0; i < s.length; i++) { acc += s[i]; if (acc / tot >= p) return i + 1; } return s.length; };
const keepSets = Object.fromEntries(KEEP.map((k) => [k, layers.map((row) => row ? row.map((v, i) => [v, i]).sort((a, b) => b[0] - a[0]).slice(0, k).map(([, i]) => i).sort((a, b) => a - b) : null)]));
const when = stamp();
fs.writeFileSync(path.join(dir, `expert-counts${tag}-${when}.json`), JSON.stringify({ file: path.basename(imFile), experts: nExp, layers, keep: keepSets }, null, 0));
let model = null; try { if (L.model) model = moeShape(L.model); } catch {}
const avg = (f) => (layers.filter(Boolean).reduce((a, r) => a + f(r), 0) / layers.filter(Boolean).length);
const md = [`# Which experts Bob's work uses, ${when}`, '', `${layers.filter(Boolean).length} layers, ${nExp} experts each${model ? `, ${model.used} picked per word` : ''}.`, '',
  '## How much of the work the busiest experts cover (average over layers)', '', '| Experts kept per layer | Share of picks covered |', '|---|---|',
  ...KEEP.map((k) => `| ${k} (${k === 48 ? '8Bob' : k === 32 ? '6Bob' : k === 16 ? '4Bob' : '2Bob'}) | ${(100 * avg((r) => cover(r, k))).toFixed(1)}% |`), '',
  `Experts needed for 90% / 95% / 99% of picks (average): ${avg((r) => need(r, 0.9)).toFixed(0)} / ${avg((r) => need(r, 0.95)).toFixed(0)} / ${avg((r) => need(r, 0.99)).toFixed(0)}`, '',
  '## Per layer', '', '| Layer | 48 cover | 16 cover | for 95% | never picked |', '|---|---|---|---|---|',
  ...layers.map((r, i) => (r ? `| ${i} | ${(100 * cover(r, 48)).toFixed(1)}% | ${(100 * cover(r, 16)).toFixed(1)}% | ${need(r, 0.95)} | ${r.filter((v) => v === 0).length} |` : `| ${i} | - | - | - | - |`))].join('\n');
fs.writeFileSync(path.join(dir, `expert-counts${tag}-${when}.md`), md);
console.log(md.split('\n').slice(0, 14).join('\n'));
console.log(`\nReport: ${path.join(dir, `expert-counts${tag}-${when}.md`)}`);

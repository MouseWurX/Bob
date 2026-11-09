// 1.5.141 Computer Science Lab (Lab 1): Bob's own GGUF cutter on small made-up brain files (experts cut byte for
// byte, settings copied, a sound reader taken out of a combined reader), the recipe checks, the whole job with fake
// steps, Use in Bob, the switch (off unless turned on, greyed out on small replicant matrices) and the page's words.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { readGguf, brainFacts, readerFacts, writeGguf, checkKeep, busiest, isHearingTensor, readCounts, coverageKeep } from '../src/lab-gguf.js';
import { Lab, maskFor, cleanWrite, teacherLicence, lessonSets, cleanRecipe, planRecipe, labRoom, labOn, cutSizes, fitWords, mergeMadeBrains, labRoute, RUNNING_TYPES , measureRecord, sha256File, compareTable, compareCsv } from '../src/lab.js';
import { TEMPLATES, TEMPLATE_IDS, templateById, templateWhyNot, applyTemplate } from '../public/lab-templates.js';
import crypto from 'node:crypto';
import http from 'node:http';
import { LESSON_SKILLS } from '../src/lab-skills.js';
import { QUIZ, TOOLS, runQuiz } from '../src/lab-test.js';
import { PACKS, PACK_IDS, REASONING, SUMS, RULES, PICK_TOOL, CODE, letterOf, numberOf, codeOf, codeTool, runPack, mergeScores, scoreboard, classOf, classBoard, CLASSES, PACK_VERSION } from '../src/lab-challenges.js';
import { runSandboxed } from '../src/selftools.js';
import { METHODS, LEFT_OUT, scrub, makeForgePlan, rungFieldsOk } from '../src/lab-forge.js';
import { PATHS, PATH_GROUPS, BUNDLES, clashes, pathByName } from '../public/lab-thinking-paths.js';
import { LADDER, PLAY_MAX_GB, ladderTexts, ladderDiskGB, readPerplexity, ladderTable, ladderSaw } from '../src/lab-playground.js';
import { cleanResult, resultText, hardwareLine } from '../src/lab.js';
import { cleanLearn, learnBrain, tokenize, nextWords, tryTemperature, runLearn, sawTokens, sawNext, sawTemperature, LEARN_CARDS, MAX_TEXT } from '../src/lab-learn.js';

let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra ? ' ' + extra : ''}`); };
const read = (p) => fs.readFileSync(new URL(`../${p}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bob-lab-'));

// ---- a tiny GGUF writer for made-up brains ----
function kv(key, type, value) {
  const k = Buffer.from(key); const h = Buffer.alloc(12 + k.length); h.writeBigUInt64LE(BigInt(k.length)); k.copy(h, 8); h.writeUInt32LE(type, 8 + k.length);
  let v;
  if (type === 8) { const s = Buffer.from(value); v = Buffer.alloc(8 + s.length); v.writeBigUInt64LE(BigInt(s.length)); s.copy(v, 8); }
  else if (type === 4) { v = Buffer.alloc(4); v.writeUInt32LE(value); }
  else if (type === 7) { v = Buffer.from([value ? 1 : 0]); }
  else if (type === 9) { v = Buffer.alloc(12 + 4 * value.length); v.writeUInt32LE(4); v.writeBigUInt64LE(BigInt(value.length), 4); value.forEach((x, i) => v.writeUInt32LE(x, 12 + 4 * i)); }
  return Buffer.concat([h, v]);
}
function makeGguf(file, kvs, tensors) {
  const parts = [Buffer.alloc(24)]; parts[0].write('GGUF', 0, 'latin1'); parts[0].writeUInt32LE(3, 4); parts[0].writeBigUInt64LE(BigInt(tensors.length), 8); parts[0].writeBigUInt64LE(BigInt(kvs.length), 16);
  for (const [k, t, v] of kvs) parts.push(kv(k, t, v));
  let off = 0; const datas = [];
  for (const t of tensors) {
    const n = Buffer.from(t.name); const b = Buffer.alloc(8 + n.length + 4 + 8 * t.dims.length + 12);
    let o = 0; b.writeBigUInt64LE(BigInt(n.length), o); o += 8; n.copy(b, o); o += n.length; b.writeUInt32LE(t.dims.length, o); o += 4;
    for (const d of t.dims) { b.writeBigUInt64LE(BigInt(d), o); o += 8; } b.writeUInt32LE(0, o); o += 4; b.writeBigUInt64LE(BigInt(off), o);
    parts.push(b);
    const count = t.dims.reduce((a, x) => a * x, 1); const d = Buffer.alloc(count * 4); for (let i = 0; i < count; i++) d.writeFloatLE(t.fill(i), i * 4);
    const pad = Math.ceil(d.length / 32) * 32 - d.length; datas.push(Buffer.concat([d, Buffer.alloc(pad)])); off += d.length + pad;
  }
  let head = Buffer.concat(parts); head = Buffer.concat([head, Buffer.alloc(Math.ceil(head.length / 32) * 32 - head.length)]);
  fs.writeFileSync(file, Buffer.concat([head, ...datas]));
}
const E = 8, EMB = 4, FF = 3;
// Expert e's numbers in layer L are 1000*L + 100*e + i, so a cut file shows exactly which experts it kept.
const expertT = (L, kind) => ({ name: `blk.${L}.ffn_${kind}_exps.weight`, dims: kind === 'down' ? [FF, EMB, E] : [EMB, FF, E], fill: (i) => 1000 * L + 100 * Math.floor(i / (EMB * FF)) + (i % (EMB * FF)) });
const brainFile = path.join(tmp, 'moe.gguf');
makeGguf(brainFile, [['general.architecture', 8, 'testmoe'], ['general.name', 8, 'Test MoE'], ['testmoe.block_count', 4, 2], ['testmoe.expert_count', 4, E], ['testmoe.expert_used_count', 4, 2], ['general.file_type', 4, 1], ['tokenizer.ggml.tokens_ids', 9, [1, 2, 3]]], [
  { name: 'token_embd.weight', dims: [EMB, 5], fill: (i) => i },
  ...[0, 1].flatMap((L) => [expertT(L, 'gate'), expertT(L, 'up'), expertT(L, 'down'), { name: `blk.${L}.ffn_gate_inp.weight`, dims: [EMB, E], fill: (i) => 1000 * L + 100 * Math.floor(i / EMB) + (i % EMB) }, { name: `blk.${L}.attn_q.weight`, dims: [EMB, EMB], fill: (i) => -i }])
]);

const g = readGguf(brainFile);
const f = brainFacts(g);
check('reads a made-up mixture-of-experts brain', f.arch === 'testmoe' && f.experts === 8 && f.used === 2 && f.layers === 2 && f.fullSize && f.expertLayers.join() === '0,1', JSON.stringify(f));
{ const all = g.tensors.reduce((a, t) => a + t.dims.reduce((x, d) => x * Number(d), 1), 0); check('it counts every weight in the file, for the leaderboard classes', f.params === all && all > 0 && typeof f.paramsB === 'number' && typeof f.activeB === 'number'); }
const keep = [[1, 3, 5, 7], [0, 2, 4, 6]];
check('a good keep list passes', checkKeep(g, keep) === '');
check('a keep list smaller than the picks per word is refused', /at least 2/.test(checkKeep(g, [[1], [2]])));
check('a keep list with a repeat is refused', /repeat/.test(checkKeep(g, [[1, 1, 3, 4], [0, 2, 4, 6]])));
check('keeping every expert is refused', /nothing to cut/.test(checkKeep(g, [[0, 1, 2, 3, 4, 5, 6, 7], [0, 1, 2, 3, 4, 5, 6, 7]])));
check('uneven layers are refused', /layer 1/.test(checkKeep(g, [[1, 3, 5, 7], [0, 2]])));

const cutFile = path.join(tmp, 'moe-4x.gguf');
let ticks = 0;
let beats = 0; const beat = setInterval(() => beats++, 0);
const cutting = writeGguf(brainFile, cutFile, { keep, onProgress: () => ticks++ });
await cutting; clearInterval(beat);
check('Bob keeps answering while a cut copies (the copy does not block)', beats > 0);
const c = readGguf(cutFile);
const cf = brainFacts(c);
check('the cut brain says 4 experts', cf.experts === 4 && cf.used === 2 && c.meta['general.name'] === 'Test MoE' && c.tensors.length === g.tensors.length);
check('other settings are copied (including lists)', c.kvs.length === g.kvs.length && c.kvs.find((k) => k.key === 'tokenizer.ggml.tokens_ids')?.value?.array === 3);
const floats = (gg, file, name) => { const t = gg.tensors.find((x) => x.name === name); const b = Buffer.alloc(t.bytes); const fd = fs.openSync(file, 'r'); fs.readSync(fd, b, 0, b.length, gg.dataStart + t.offset); fs.closeSync(fd); return Array.from({ length: b.length / 4 }, (_, i) => b.readFloatLE(i * 4)); };
const up1 = floats(c, cutFile, 'blk.1.ffn_up_exps.weight');
check('expert slabs kept are exactly the chosen ones, in order', up1.length === 4 * EMB * FF && [0, 2, 4, 6].every((e, k) => up1[k * EMB * FF] === 1000 + 100 * e), up1.filter((_, i) => i % (EMB * FF) === 0).join());
const r0 = floats(c, cutFile, 'blk.0.ffn_gate_inp.weight');
check('the router keeps the same experts\' rows', [1, 3, 5, 7].every((e, k) => r0[k * EMB] === 100 * e));
check('tensors without experts are copied unchanged', floats(c, cutFile, 'blk.1.attn_q.weight').join() === floats(g, brainFile, 'blk.1.attn_q.weight').join() && floats(c, cutFile, 'token_embd.weight').join() === floats(g, brainFile, 'token_embd.weight').join());
check('the expert tensor dims say 4', c.tensors.find((t) => t.name === 'blk.0.ffn_down_exps.weight').dims.join() === `${FF},${EMB},4`);
check('the cut file is smaller', fs.statSync(cutFile).size < fs.statSync(brainFile).size);
check('no half-written .part file is left', !fs.existsSync(cutFile + '.part'));
check('a stopped cut leaves nothing behind', await (async () => { const ac = new AbortController(); ac.abort(); try { await writeGguf(brainFile, path.join(tmp, 'stop.gguf'), { keep, signal: ac.signal }); return false; } catch { return !fs.existsSync(path.join(tmp, 'stop.gguf')) && !fs.existsSync(path.join(tmp, 'stop.gguf.part')); } })());
check('busiest picks the most-used experts per layer', JSON.stringify(busiest([[5, 1, 9, 0, 7, 2, 3, 8], [0, 0, 0, 1, 1, 1, 1, 0]], 4)) === JSON.stringify([[0, 2, 4, 7], [3, 4, 5, 6]]));

// A reader file holding sight and hearing: hearing taken out.
const readerFile = path.join(tmp, 'mmproj.gguf');
makeGguf(readerFile, [['general.architecture', 8, 'clip'], ['clip.has_vision_encoder', 7, true], ['clip.has_audio_encoder', 7, true]], [
  { name: 'v.patch_embd.weight', dims: [4, 4], fill: (i) => i }, { name: 'mm.0.weight', dims: [4, 4], fill: (i) => i }, { name: 'a.conv1d.0.weight', dims: [4, 4], fill: (i) => i }, { name: 'mm.a.mlp.1.weight', dims: [4, 4], fill: (i) => i }]);
check('reads which senses a reader file holds', JSON.stringify((({ sight, hearing }) => ({ sight, hearing }))(readerFacts(readGguf(readerFile)))) === '{"sight":true,"hearing":true}');
const deaf = path.join(tmp, 'mmproj-sight.gguf');
await writeGguf(readerFile, deaf, { drop: (t) => isHearingTensor(t.name), set: { 'clip.has_audio_encoder': false } });
const dg = readGguf(deaf);
check('taking out hearing leaves sight', dg.tensors.map((t) => t.name).join() === 'v.patch_embd.weight,mm.0.weight' && readerFacts(dg).sight && !readerFacts(dg).hearing && dg.meta['clip.has_audio_encoder'] === false);

// imatrix counts file.
const countsFile = path.join(tmp, 'counts.gguf');
makeGguf(countsFile, [['general.type', 8, 'imatrix']], [0, 1].map((L) => ({ name: `blk.${L}.ffn_gate_exps.weight.counts`, dims: [E], fill: (i) => (L ? 8 - i : i) })));
check('reads per-expert counts from llama-imatrix', JSON.stringify(readCounts(countsFile)) === JSON.stringify([[0, 1, 2, 3, 4, 5, 6, 7], [8, 7, 6, 5, 4, 3, 2, 1]]));

// ---- recipes ----
const tools = { server: { path: 'llama-server', found: true }, imatrix: { path: 'llama-imatrix', found: true }, quantize: { path: 'llama-quantize', found: true } };
const brain = { id: 'test-moe', name: 'Test MoE', gguf: brainFile, mmproj: readerFile };
const facts = { ...f, sight: true, hearing: true };
const plan = (r, fx = facts, t = tools) => planRecipe(r, { brain, facts: fx, tools: t, outDir: path.join(tmp, 'out') });
check('an empty recipe asks for a name and a way to make it smaller', (() => { const p = plan({ from: 'test-moe' }); return p.problems.some((x) => /name/.test(x)) && p.problems.some((x) => /at least one way/.test(x)); })());
check('cutting experts on an ordinary brain is refused, in words', plan({ name: 'x', smaller: { cut: { how: 'file', keep: 4, file: 'k.json' } } }, { ...facts, experts: 0 }).problems.some((x) => /isn't a mixture-of-experts brain/.test(x)));
check('busiest without lessons is refused', plan({ name: 'x', smaller: { cut: { how: 'busiest', keep: 4 } } }).problems.some((x) => /needs lessons/.test(x)));
check('running files need a full-size copy', plan({ name: 'x', smaller: { files: ['Q4_K_M'] } }, { ...facts, fullSize: false, fileType: 'Q4_K_M' }).problems.some((x) => /full-size copy/.test(x)));
check('taking out sight a brain doesn\'t have is refused', plan({ name: 'x', smaller: { sight: true } }, { ...facts, sight: false }).problems.some((x) => /no sight to take out/.test(x)));
check('a missing tool is named', plan({ name: 'x', smaller: { files: ['Q4_K_M'] } }, facts, { ...tools, quantize: { path: '/e/llama-quantize', found: false } }).problems.some((x) => /llama-quantize isn't in Bob's engine folder/.test(x)));
check('only known running types get through', JSON.stringify(cleanRecipe({ smaller: { files: ['Q4_K_M', 'rm -rf', 'Q8_0'] } }).smaller.files) === '["Q4_K_M","Q8_0"]' && RUNNING_TYPES.includes('Q4_K_M'));
const full = plan({ name: 'My Small', from: 'test-moe', lessons: { kind: 'chats' }, smaller: { hearing: true, cut: { how: 'busiest', keep: 4 }, files: ['Q4_K_M', 'Q6_K'] } });
check('a full recipe has every step in order', full.problems.length === 0 && full.steps.map((s) => s.id).join() === 'lessons,count,cut,reader,quantize,quantize,test,compare', full.steps.map((s) => s.id).join() + ' ' + full.problems.join(' | '));
check('Show the recipe has the real commands', full.steps.find((s) => s.id === 'count').cmd.includes('-o') && full.steps.find((s) => s.id === 'quantize').cmd.endsWith('Q4_K_M') && /Bob's own cutter/.test(full.steps.find((s) => s.id === 'cut').cmd));
check('the test runs on the first running file, with the reader that kept sight', full.steps.find((s) => s.id === 'test').gguf.endsWith('my-small-Q4_K_M.gguf') && full.steps.find((s) => s.id === 'test').mmproj.endsWith('my-small-reader.gguf'));
const blind = plan({ name: 'No Eyes', smaller: { sight: true, hearing: true } });
check('taking out every sense leaves the reader behind and copies nothing big', blind.problems.length === 0 && blind.finals[0] === brainFile && blind.reader === null && blind.notes.some((n) => /Nothing big is copied/.test(n)));
check('cut sizes go from under the brain\'s count down to its picks', (() => { const s = cutSizes({ experts: 256, used: 8, size: 20 * 1024 ** 3 }); return s.length > 2 && s.every((x) => x.keep < 256 && x.keep >= 8) && s[0].gb < 20; })());
check('fit lines use words, not ticks or brand names', !/[✓✗]|Legion|Steam|PC\b/.test(fitWords(12.7, 16) + fitWords(3, 6) + fitWords(30, 16)) && /replicant matrix/.test(fitWords(12.7, 16)));

// ---- Lab 1b: templates and Measure before making the running files ----
check('the five methods and the two later ones are templates', ['plain-cut', 'lab-local-cut', 'coverage-cut-heal', 'train-teacher', 'outside-traces', 'merge-experts', 'layer-width-cut'].every((id) => TEMPLATE_IDS.includes(id)) && TEMPLATES.every((t) => t.title && t.help && ['here', 'rented', 'either'].includes(t.where)));
check('rented templates are greyed out with the reason, never offered', TEMPLATES.filter((t) => t.where === 'rented').every((t) => templateWhyNot(t, facts) && !t.lab) && /rented card/.test(templateWhyNot(templateById('coverage-cut-heal'), facts)) && /Not built yet/.test(templateWhyNot(templateById('merge-experts'), facts)));
check('a cutting template on an ordinary brain says why', /isn't a mixture-of-experts brain/.test(templateWhyNot(templateById('plain-cut'), { experts: 0 }, 'Plain')) && templateWhyNot(templateById('lab-local-cut'), facts) === '');
const tpl = applyTemplate({ from: 'test-moe', name: '', lessons: { kind: 'none', chunks: 200 } }, templateById('lab-local-cut'), { keepDefault: 4, fullSize: true, brainName: 'Test MoE' });
check('a template fills steps 2 to 5 and names the brain', tpl.template === 'lab-local-cut' && tpl.lessons.kind === 'chats' && tpl.smaller.cut.keep === 4 && tpl.smaller.files.includes('Q4_K_M') && tpl.smaller.measure === true && tpl.name === 'Test MoE Lab local cut' && tpl.from === 'test-moe');
check('a template on a running file drops the running files and the measuring', (() => { const t = applyTemplate({}, templateById('lab-local-cut'), { fullSize: false }); return !t.smaller.files.length && !t.smaller.measure; })());
check('only known templates get through', cleanRecipe({ template: 'rm -rf' }).template === '' && cleanRecipe({ template: 'plain-cut' }).template === 'plain-cut');
const measured = plan({ name: 'Measured', from: 'test-moe', lessons: { kind: 'chats' }, smaller: { cut: { how: 'busiest', keep: 4 }, files: ['Q4_K_M'], measure: true } });
check('Measure adds a step on the cut file before the running files', measured.problems.length === 0 && measured.steps.map((s) => s.id).join() === 'lessons,count,cut,reader,imatrix,quantize,test,compare' && measured.steps.find((s) => s.id === 'imatrix').src.endsWith('measured-4x.gguf'), measured.steps.map((s) => s.id).join() + ' ' + measured.problems.join(' | '));
check('the running file is made with the measurement', /--imatrix .*imatrix\.gguf/.test(measured.steps.find((s) => s.id === 'quantize').cmd) && measured.steps.find((s) => s.id === 'quantize').imatrix.endsWith('imatrix.gguf'));
check('Measure without lessons is refused, in words', plan({ name: 'x', smaller: { files: ['Q4_K_M'], measure: true } }).problems.some((x) => /needs lessons to measure on/.test(x)));
check('Measure with an expert list still gathers the lessons first', plan({ name: 'x', lessons: { kind: 'chats' }, smaller: { files: ['Q4_K_M'], measure: true } }).steps[0].id === 'lessons');
check('Measure is off unless ticked', cleanRecipe({ smaller: { files: ['Q4_K_M'] } }).smaller.measure === false);

// ---- Lab 2a: keep every skill covered ----
const cov = coverageKeep([{ name: 'a', counts: [[10, 0, 0, 0, 1, 1], [0, 0, 5, 5, 0, 0]] }, { name: 'b', counts: [[0, 10, 0, 0, 0, 0], [0, 0, 0, 0, 9, 1]] }], { cover: 0.9 });
check('the coverage cut keeps what every skill needs, one size for all layers (the Forge\'s keep.py rule)', JSON.stringify(cov.keep) === '[[0,1,4],[2,3,4]]' && cov.K === 3 && cov.shares.every((x) => x.worst >= 0.9));
check('a protected skill keeps more', coverageKeep([{ name: 'a', counts: [[10, 0, 0, 0, 1, 1]] }, { name: 'b', counts: [[0, 10, 0, 0, 0, 0]] }], { cover: 0.9, strong: ['a'], strongCover: 0.99 }).keep[0].length === 4);
check('the coverage size can be set, and never drops under the picks', coverageKeep([{ name: 'a', counts: [[10, 9, 8, 7, 6, 5]] }], { cover: 0.5, keep: 5 }).keep[0].length === 5 && coverageKeep([{ name: 'a', counts: [[10, 0, 0, 0, 0, 0]] }], { cover: 0.5, min: 2 }).K === 2);
const skillFile = path.join(tmp, 'skills-lessons.jsonl');
fs.writeFileSync(skillFile, ['coding', 'chat', 'tools'].flatMap((job) => Array.from({ length: 40 }, (_, i) => JSON.stringify({ job, messages: [{ role: 'user', content: `${job} question ${i} `.repeat(20) }, { role: 'assistant', content: `${job} answer ${i} `.repeat(20) }] }))).join('\n'));
const covPlan = plan({ name: 'Covered', lessons: { kind: 'file', file: skillFile }, smaller: { cut: { how: 'cover', cover: 0.95, strong: ['coding'] } } });
check('a coverage recipe counts each skill on its own', covPlan.problems.length === 0 && covPlan.steps.filter((x) => x.id === 'count').map((x) => x.skill).join() === 'coding,chat,tools' && covPlan.steps[0].corpora.length === 3, covPlan.problems.join(' | '));
check('the coverage size can be left to the skills', cleanRecipe({ smaller: { cut: { how: 'cover' } } }).smaller.cut.keep === 0 && /every skill needs/.test(covPlan.steps.find((x) => x.id === 'cut').label));
check('protecting a skill the lessons don\'t have is refused', plan({ name: 'x', lessons: { kind: 'file', file: skillFile }, smaller: { cut: { how: 'cover', strong: ['juggling'] } } }).problems.some((x) => /no skill called juggling/.test(x)));
check('chats are one skill, and the plan says so', plan({ name: 'x', lessons: { kind: 'chats' }, smaller: { cut: { how: 'cover' } } }).notes.some((x) => /one skill/.test(x)));
check('a coverage cut needs lessons', plan({ name: 'x', smaller: { cut: { how: 'cover' } } }).problems.some((x) => /count each skill/.test(x)));

// ---- Lab 1b: the measurement record and Compare ----
const rec = measureRecord({ name: 'A', sha256: 'ab', facts: { fileType: 'Q4_K_M', experts: 192 }, sizeGB: 16.2, template: 'plain-cut', parent: 'Big', test: { parts: { general: { score: 100 }, tools: { score: 50 } }, score: 75, tps: 77.4, prefillTps: 900, where: 'card', engine: 'Brain Engine' }, cfg: { gpuVramGB: 16 }, when: Date.UTC(2026, 10, 8) });
check('the record has the design\'s shape', rec.brain.sha256 === 'ab' && rec.brain.quant === 'Q4_K_M' && rec.brain.expertsKept === 192 && rec.brain.parent === 'Big' && rec.where.place === 'home' && rec.where.card === '16 GB card' && rec.where.engine === 'Brain Engine' && rec.when === '2026-11-08' && rec.scores['General knowledge'] === 100 && rec.scores['Lab test (all)'] === 75 && rec.speed.tps === 77.4 && rec.speed.prefillTps === 900);
check('missing parts are left out, not zeroed', (() => { const r = measureRecord({ name: 'B', test: { parts: {}, score: 0 } }); return !('speed' in r) && !('memory' in r) && !('sha256' in r.brain) && !('card' in r.where); })());
const tbl = compareTable([rec, { ...rec, brain: { ...rec.brain, name: 'B', sizeGB: 20.8 }, speed: { tps: 65.7 } }]);
check('Compare has a signed difference column with a percent', tbl.names.join() === 'A,B' && tbl.rows.find((x) => x.field === 'brain.sizeGB').diffText === '+4.6 (+28%)' && tbl.rows.find((x) => x.field === 'speed.tps').diffText === '-11.7 (-15%)');
check('Compare puts the scores first and leaves out the hash', tbl.rows[0].field.startsWith('scores.') && !tbl.rows.some((x) => x.field === 'brain.sha256'));
check('the CSV has a header row and the difference', /^Field,A,B,Difference\r\n/.test(compareCsv(tbl)) && compareCsv(tbl).includes('"-11.7 (-15%)"') === false && compareCsv(tbl).includes('-11.7 (-15%)'));
check('the file hash is read in pieces and matches', await sha256File(brainFile) === crypto.createHash('sha256').update(fs.readFileSync(brainFile)).digest('hex'));

// ---- the switch ----
check('the Lab is off unless turned on', !labOn({}) && !labOn({ computerLab: 'yes' }) && labOn({ computerLab: true }));
check('a small replicant matrix gets a reason, not the Lab', !labRoom(8 * 1024 ** 3).ok && /Bob-Net/.test(labRoom(8 * 1024 ** 3).why) && labRoom(32 * 1024 ** 3).ok);

// ---- the whole job, fake steps ----
const dataDir = path.join(tmp, 'data'); fs.mkdirSync(path.join(dataDir, 'sessions'), { recursive: true });
fs.writeFileSync(path.join(dataDir, 'sessions', 'a.json'), JSON.stringify(Array.from({ length: 400 }, (_, i) => ({ role: i % 2 ? 'assistant' : 'user', content: `message ${i} `.repeat(10) }))));
const exe = (n) => (process.platform === 'win32' ? `${n}.exe` : n); // the Lab looks for llama-imatrix.exe beside llama-server.exe on Windows
const cfg = { dataDir, agentDir: tmp, bobModelsDir: path.join(tmp, 'models', 'bob'), settingsFile: path.join(dataDir, 'settings.json'), computerLab: true, llamacpp: { exe: path.join(tmp, 'eng', exe('llama-server')) } };
fs.mkdirSync(path.join(tmp, 'eng')); for (const n of ['llama-server', 'llama-imatrix', 'llama-quantize']) fs.writeFileSync(path.join(tmp, 'eng', exe(n)), '');
const catalog = { models: [{ id: 'test-moe', name: 'Test MoE', family: 'Test', category: 'chat', jobs: ['bob'], files: [{ role: 'gguf', url: 'https://x/moe.gguf' }] }] };
const shop = { cfg, catalog, locate: (e) => (e.id === 'test-moe' ? { gguf: brainFile, mmproj: readerFile } : {}) };
const events = [];
const fakeQuiz = (score) => ({ parts: { general: { right: 1, of: 1, score } }, score, tps: 12 });
const big = () => ({ ok: true, why: '' }); // the runner's own memory must not matter
const lab = new Lab(cfg, { shop, room: big, broadcast: (e) => events.push(e), steps: {
  count: async (s) => { fs.copyFileSync(countsFile, s.counts); },
  quantize: async (s) => { fs.copyFileSync(s.src, s.out); },
  test: async (s) => fakeQuiz(s.gguf === brainFile ? 80 : 70)
} });
const v = lab.view();
check('the page lists the brain with what can be done to it', v.brains.length === 1 && v.brains[0].facts.experts === 8 && v.brains[0].facts.sight && v.brains[0].facts.hearing && !('gguf' in v.brains[0] && v.brains[0].gguf));
check('the page never gets file paths for brains', !JSON.stringify(v.brains).includes(tmp));
const recipe = { name: 'Little Test', from: 'test-moe', lessons: { kind: 'chats' }, smaller: { hearing: true, cut: { how: 'busiest', keep: 4 }, files: ['Q4_K_M'] } };
check('Use in Bob before a test is refused', (() => { try { lab.use('nope'); return false; } catch (e) { return /finished its Lab test/.test(e.message); } })());
const st = await lab.start(recipe);
check('the job starts', st.started?.state === 'running');
check('a second job waits its turn', await lab.start(recipe).then(() => false, (e) => /already busy/.test(e.message)));
while (lab.job) await new Promise((r) => setTimeout(r, 20));
const done = lab.runs.at(-1);
check('the job finishes with a report', done.state === 'done' && done.report.made.score === 70 && done.report.from.score === 80, done.error || '');
check('the made brain has 4 experts and keeps sight, not hearing', brainFacts(readGguf(done.files.gguf)).experts === 4 && readerFacts(readGguf(done.files.mmproj)).sight && !readerFacts(readGguf(done.files.mmproj)).hearing);
check('the keep list and the report are saved beside it', fs.existsSync(path.join(path.dirname(done.files.gguf), 'little-test-keep.json')) && fs.existsSync(path.join(path.dirname(done.files.gguf), 'lab-report.json')));
check('the job writes measure.json for the new brain and the one it came from', (() => { const d = path.dirname(done.files.gguf); const m = JSON.parse(fs.readFileSync(path.join(d, 'measure.json'), 'utf8')); const pm = JSON.parse(fs.readFileSync(path.join(d, 'measure-parent.json'), 'utf8')); return m.brain.sha256 === crypto.createHash('sha256').update(fs.readFileSync(done.files.gguf)).digest('hex') && m.brain.expertsKept === 4 && m.brain.parent === 'Test MoE' && m.scores['Lab test (all)'] === 70 && pm.brain.name === 'Test MoE' && pm.brain.expertsKept === 8 && !JSON.stringify(m).includes(tmp); })());
const ms = lab.measures();
check('Compare finds both records', ms.length === 2 && ms.some((m) => m.parentOf));
const cmp = lab.compare(ms.map((m) => m.id), 'csv');
check('Save as CSV writes a file in the Lab\'s compare folder', fs.existsSync(cmp.file) && path.basename(path.dirname(cmp.file)) === 'compare' && /Lab test \(all\)/.test(fs.readFileSync(cmp.file, 'utf8')));
check('Compare needs two brains', (() => { try { lab.compare([ms[0].id]); return false; } catch (e) { return /at least two/.test(e.message); } })());
const covLab = new Lab(cfg, { shop, room: big, steps: { count: async (s) => { fs.copyFileSync(countsFile, s.counts); }, test: async () => fakeQuiz(60) } });
await covLab.start({ name: 'Cover Test', from: 'test-moe', lessons: { kind: 'file', file: skillFile }, smaller: { cut: { how: 'cover', cover: 0.9 } }, test: { compare: false } });
while (covLab.job) await new Promise((r) => setTimeout(r, 20));
const cd = covLab.runs.at(-1);
check('a coverage job cuts to what the skills need and reports each skill', cd.state === 'done' && cd.report.coverage?.skills.length === 3 && brainFacts(readGguf(cd.files.gguf)).experts === cd.report.coverage.experts && cd.report.coverage.experts < 8, cd.error || JSON.stringify(cd.report?.coverage));
check('the coverage keep list names its rule and skills', (() => { const k = JSON.parse(fs.readFileSync(path.join(path.dirname(cd.files.gguf), 'cover-test-keep.json'), 'utf8')); return k.cover === 0.9 && k.skills.join() === 'coding,chat,tools' && k.layers.length === 2; })());
check('the page heard each step', events.filter((e) => e.type === 'lab').length >= 7 && events.some((e) => e.type === 'lab-done' && e.ok));
const used = lab.use(done.id);
check('Use in Bob gives it an id Bob\'s engine runs', used.id === 'lab-little-test' && cfg.llamacpp.models['lab-little-test'].gguf === done.files.gguf);
check('it shows in the catalogue next to its family, with no download', catalog.models.some((m) => m.id === 'lab-little-test' && m.madeInLab && m.family === 'Test' && m.files.length === 0 && /Lab test: 70 out of 100 \(Test MoE: 80\)/.test(m.what)));
check('a merged catalogue isn\'t merged twice', mergeMadeBrains(catalog, cfg).models.filter((m) => m.id === 'lab-little-test').length === 1);
check('the same name can\'t be made twice', lab.plan(recipe).problems.some((x) => /already have a Lab brain/.test(x)));
// ---- Lab 2a: write a new lesson set (a fake teacher answers; the real writer process builds a throwaway Bob) ----
check('the writer\'s choices are cleaned', (() => { const w = cleanWrite({ name: 'x\ny', skills: ['tools', 'nope', 'tools'], count: 5, think: 'maybe' }); return w.name === 'x y' && w.skills.join() === 'tools' && w.count === 100 && w.think === 'half' && cleanWrite({ count: 99999 }).count === 20000; })());
check('Apache and MIT teachers may teach; a non-commercial one may not; an unknown one is a note', teacherLicence('Apache 2.0').ok && !teacherLicence('Apache 2.0').note && teacherLicence('MIT').ok && !teacherLicence('CC BY-NC 4.0').ok && teacherLicence('').ok && /model card/.test(teacherLicence('').note));
check('every skill has a label, a hint and what to write about', LESSON_SKILLS.length >= 10 && LESSON_SKILLS.every((k) => k.id && k.label && k.hint && k.what));
const pw = lab.planWrite({ name: '', teacher: 'nope', skills: [] });
check('the lesson writer finds itself from a folder with a space in it (fileURLToPath, never a URL\'s pathname)', /fileURLToPath\(import\.meta\.url\)/.test(fs.readFileSync(new URL('../src/lab-write.js', import.meta.url), 'utf8')) && !/new URL\(import\.meta\.url\)\.pathname/.test(fs.readFileSync(new URL('../src/lab-write.js', import.meta.url), 'utf8')));
check('writing lessons needs a name, a teacher and a skill', pw.problems.length === 3);
check('the page gets the skills and the lesson sets', lab.view().lessonSkills.length === LESSON_SKILLS.length && Array.isArray(lab.view().lessonSets));
let teacherCalls = 0;
const teacher = http.createServer((req, res) => {
  let b = ''; req.on('data', (d) => (b += d)); req.on('end', () => {
    teacherCalls++;
    const j = JSON.parse(b), last = j.messages.at(-1);
    let msg;
    if (/Write 25 different messages/.test(last.content || '')) msg = { content: JSON.stringify(Array.from({ length: 25 }, (_, i) => `please set reminder number ${i} for ${teacherCalls}`)) };
    else if (/You are the "/.test(last.content || '')) msg = { content: 'Reminder set for 3pm.' };
    else if (j.tools?.length && last.role === 'user') msg = { content: '', tool_calls: [{ id: 'c1', type: 'function', function: { name: j.tools[0].function.name, arguments: '{}' } }] };
    else msg = { content: 'All set.', reasoning_content: j.chat_template_kwargs?.enable_thinking ? 'Thinking it over.' : undefined };
    res.end(JSON.stringify({ choices: [{ message: msg }] }));
  });
});
await new Promise((r) => teacher.listen(0, '127.0.0.1', r));
const wLab = new Lab(cfg, { shop, room: big, steps: { serve: async () => ({ url: `http://127.0.0.1:${teacher.address().port}`, stop: () => {} }) } });
const ws = await wLab.startWrite({ name: 'Reminder Lessons', teacher: 'test-moe', skills: ['tools', 'chat'], count: 120, think: 'half' });
check('the writing job starts', ws.started?.state === 'running' && ws.started.kind === 'write');
while (wLab.job) await new Promise((r) => setTimeout(r, 50));
const wd = wLab.runs.at(-1);
const lessonsOut = path.join(dataDir, 'lab', 'lessons', 'reminder-lessons', 'lessons.jsonl');
const written = fs.existsSync(lessonsOut) ? fs.readFileSync(lessonsOut, 'utf8').trim().split('\n').map((x) => JSON.parse(x)) : [];
check('the writer writes the lessons asked for', wd.state === 'done' && wd.report.lessons === 120 && written.length === 120, wd.error || '');
check('each lesson is one Bob turn with his real system prompt\'s tools, a skill and a tool result', written.every((l) => ['tools', 'chat'].includes(l.job) && l.messages[0].role === 'user' && l.messages.at(-1).role === 'assistant') && written.some((l) => l.messages.some((m) => m.role === 'tool')));
check('about half think, and the thinking is kept', written.some((l) => l.think && l.messages.at(-1).reasoning_content) && written.some((l) => !l.think));
check('the lesson set is listed for step 2, with its skills', (() => { const set = lessonSets(cfg).find((x) => x.name === 'Reminder Lessons'); return set && set.count === 120 && set.done && set.skills.join() === 'tools,chat'; })());
check('a coverage cut can count each written skill', (() => { const p = wLab.plan({ name: 'From Written', from: 'test-moe', lessons: { kind: 'file', file: lessonsOut }, smaller: { cut: { how: 'cover' } } }); return p.skills.sort().join() === 'chat,tools'; })());
const again = wLab.planWrite({ name: 'Reminder Lessons', teacher: 'test-moe', skills: ['tools'] });
check('the same name and teacher carries on instead of starting over', !again.problems.length && again.notes.some((n) => /carries on/.test(n)));
teacher.close();
// ---- Lab 2a: Try it first on Brain Engine (fake engine steps) ----
check('Brain Engine\'s mask has one entry per layer, null where a layer has no experts', JSON.stringify(maskFor([undefined, [1, 2]], { layers: 3 })) === '[null,[1,2],null]');
const tryRecipe = (name, extra = {}) => ({ name, from: 'test-moe', lessons: { kind: 'chats' }, smaller: { cut: { how: 'busiest', keep: 4 }, try: true, ...extra }, test: { compare: true } });
check('Try it first needs Brain Engine on this replicant matrix', lab.plan(tryRecipe('Try A')).problems.some((x) => /Brain Engine/.test(x)));
fs.mkdirSync(path.join(tmp, 'brain-engine'), { recursive: true }); fs.writeFileSync(path.join(tmp, 'brain-engine', exe('llama-server')), '');
const tp = lab.plan(tryRecipe('Try A'));
check('with Brain Engine, the try comes before the cut and replaces the separate compare test', !tp.problems.length && tp.steps.findIndex((x) => x.id === 'try') === tp.steps.findIndex((x) => x.id === 'cut') - 1 && !tp.steps.some((x) => x.id === 'compare'), JSON.stringify(tp.problems));
let masks = [];
const tryLab = (masked) => new Lab(cfg, { shop, room: big, steps: { count: async (s) => { fs.copyFileSync(countsFile, s.counts); }, try: async (s, { keep }) => { masks.push(keep); return { full: fakeQuiz(80), masked: fakeQuiz(masked) }; }, test: async () => fakeQuiz(72) } });
const tl1 = tryLab(50); await tl1.start(tryRecipe('Try Worse')); while (tl1.job) await new Promise((r) => setTimeout(r, 20));
const t1 = tl1.runs.at(-1);
check('much worse when tried: it stops before cutting', t1.state === 'failed' && /stopped before cutting/.test(t1.error) && t1.report?.tried?.masked === 50 && !fs.existsSync(path.join(cfg.bobModelsDir, 'lab', 'try-worse', 'try-worse-4x.gguf')), t1.error);
check('the mask sent has the 4 kept experts in every expert layer', masks[0]?.filter(Boolean).every((x) => x.length === 4) && masks[0].length === brainFacts(readGguf(brainFile)).layers);
const tl2 = tryLab(75); await tl2.start(tryRecipe('Try Fine')); while (tl2.job) await new Promise((r) => setTimeout(r, 20));
const t2 = tl2.runs.at(-1);
check('close enough when tried: it cuts, and the full score is the one to compare with', t2.state === 'done' && t2.report.tried.full === 80 && t2.report.tried.masked === 75 && t2.report.from.score === 80 && t2.report.made.score === 72, t2.error || '');
const tl3 = tryLab(40); await tl3.start(tryRecipe('Try Anyway', { tryStop: false })); while (tl3.job) await new Promise((r) => setTimeout(r, 20));
check('with Stop unticked it carries on anyway', tl3.runs.at(-1).state === 'done');
check('Gaming on: the Lab waits', await new Lab({ ...cfg, session: 'light' }, { shop, room: big }).start({ ...recipe, name: 'Other' }).then(() => false, (e) => /Gaming is on/.test(e.message)));
check('Lab off: nothing starts', await new Lab({ ...cfg, computerLab: false }, { shop, room: big }).start({ ...recipe, name: 'Other' }).then(() => false, (e) => /Computer Science Lab is off/.test(e.message)));
const busyEngine = { engine: { loaded: async () => [{ name: 'gemma4:26b', vram: 9e9 }], unloadAll: async () => { busyEngine.unloaded = true; } } };
const lab2 = new Lab(cfg, { shop, room: big, brain: busyEngine, steps: { test: async () => fakeQuiz(50) } });
const ask = await lab2.start({ name: 'Eyes Only', from: 'test-moe', smaller: { hearing: true }, test: { compare: false } });
check('with Bob\'s brain on the card, the Lab asks first', ask.needUnload && ask.names[0] === 'gemma4:26b' && !busyEngine.unloaded);
await lab2.start({ name: 'Eyes Only', from: 'test-moe', smaller: { hearing: true }, test: { compare: false } }, { unload: true });
while (lab2.job) await new Promise((r) => setTimeout(r, 20));
check('after a yes it unloads and runs', busyEngine.unloaded && lab2.runs.at(-1).state === 'done', lab2.runs.at(-1).error || '');
check('a small replicant matrix can\'t start a Lab job', await new Lab(cfg, { shop, room: () => labRoom(8 * 1024 ** 3) }).start({ ...recipe, name: 'Other' }).then(() => false, (e) => /at least 12 GB/.test(e.message)));
const saved = lab.saveRecipe({ ...recipe, lessons: { kind: 'file', file: path.join(tmp, 'secret', 'lessons.jsonl') } });
check('a saved recipe keeps choices, not paths', !JSON.stringify(saved).includes(tmp) && saved.at(-1).smaller.cut.keep === 4);

// ---- 1.5.153 Challenges and Save ----
check('the first six packs, then the extra ones, each with questions, a title and a time', PACKS.length === 22 && PACK_IDS.slice(0, 6).join() === 'quiz,reasoning,sums,rules,tools,code' && PACKS.every((x) => x.title && x.what && x.count > 0 && x.minutes > 0));
check('every reasoning question has four choices and a letter answer', REASONING.every(([q, a]) => /A\) [\s\S]*B\) [\s\S]*C\) [\s\S]*D\) /.test(q) && /^[ABCD]$/.test(a)) && REASONING.length >= 20);
check('every sum has a whole-number answer', SUMS.every(([, a]) => Number.isInteger(a)) && SUMS.length >= 15);
check('the letter in a reply is found, with or without brackets, and thinking is ignored', letterOf('B') === 'B' && letterOf('(C)') === 'C' && letterOf('D) Gravity') === 'D' && letterOf('The answer is A.') === 'A' && letterOf('<think>A or B?</think>C') === 'C' && letterOf('no idea') === '');
check('the last number in a reply is found, commas allowed', numberOf('That makes 16 apples.') === 16 && numberOf('5 x 6 = 1,250') === 1250 && numberOf('none') === null && numberOf('-3') === -3);
check('code comes out of a fenced block, or the whole reply', codeOf('Here:\n```js\nfunction a(){}\n```\nDone') === 'function a(){}' && codeOf('function b(){}') === 'function b(){}');
check('the rules checks are right about right and wrong answers', RULES.find(([q]) => /backwards/.test(q))[1]('eseehc') && !RULES.find(([q]) => /backwards/.test(q))[1]('cheese') && RULES.find(([q]) => /valid JSON/.test(q))[1]('```json\n{"name":"Bob"}\n```') && RULES.find(([q]) => /1 to 5/.test(q))[1]('1\n2\n3\n4\n5'));
check('every pick-the-tool request names one of the four pretend tools', PICK_TOOL.every(([, t]) => TOOLS.some((x) => x.function.name === t)));
check('every code challenge has a function name and cases', CODE.every((c) => /^[a-zA-Z]+$/.test(c.fn) && c.q.includes(c.fn) && c.cases.length >= 2));
// a brain's code really runs in Bob's sandbox: right code passes, wrong code fails, and it can't read files
{
  const sdir = path.join(tmp, 'sbx'); fs.mkdirSync(sdir, { recursive: true });
  const sandboxRun = async (code, fn, cases) => { fs.writeFileSync(path.join(sdir, 'tool.mjs'), codeTool(code, fn)); const r = await runSandboxed({ dir: sdir, input: { cases }, timeoutSec: 10 }); try { return r.ok ? JSON.parse(r.out) : null; } catch { return null; } };
  const good = await sandboxRun('function add(a, b) { return a + b; }', 'add', [[2, 3], [1, 1]]);
  check('a brain\'s right answer runs in the sandbox and gives its results', JSON.stringify(good) === '[{"ok":true,"v":5},{"ok":true,"v":2}]', JSON.stringify(good));
  const missing = await sandboxRun('const nope = 1;', 'add', [[1, 2]]);
  check('a reply without the function is marked, not crashed', missing?.missing === true);
  fs.writeFileSync(path.join(tmp, 'secret.txt'), 'secret');
  const sneaky = await sandboxRun(`function add() { return process.getBuiltinModule('node:fs').readFileSync(${JSON.stringify(path.join(tmp, 'secret.txt'))}, 'utf8'); }`, 'add', [[]]);
  check('a brain\'s code can\'t read a file outside the sandbox', !JSON.stringify(sneaky || '').includes('secret"'), JSON.stringify(sneaky));
  const slow = await runSandboxed({ dir: (fs.writeFileSync(path.join(sdir, 'tool.mjs'), codeTool('function add() { while (true) {} }', 'add')), sdir), input: { cases: [[]] }, timeoutSec: 2 });
  check('a brain\'s endless loop is stopped', !slow.ok && slow.timedOut);
}
// runPack against a pretend server: each kind is marked the right way
{
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    const q = JSON.parse(init.body).messages[0].content;
    const say = (content, calls) => ({ ok: true, json: async () => ({ choices: [{ message: { content, tool_calls: calls } }], timings: { predicted_per_second: 30, prompt_per_second: 600 } }) });
    const r = REASONING.find(([x]) => x === q); if (r) return say(r === REASONING[0] ? 'A' : r[1]);
    const m = SUMS.find(([x]) => x === q); if (m) return say(`It is ${m[1]}.`);
    const t = PICK_TOOL.find(([x]) => x === q); if (t) return say('', [{ function: { name: t[1], arguments: '{}' } }]);
    const c = CODE.find((x) => q.startsWith(x.q)); if (c) return say('```js\nfunction ' + c.fn + '(){}\n```');
    return say('banana');
  };
  const rs = await runPack('http://fake', 'reasoning');
  check('reasoning is marked by the letter: one wrong of twenty', rs.right === REASONING.length - 1 && rs.of === REASONING.length && rs.score === Math.round((100 * (REASONING.length - 1)) / REASONING.length) && rs.misses.length === 1 && rs.tps === 30);
  check('sums are marked by the number', (await runPack('http://fake', 'sums')).score === 100);
  check('pick the tool is marked by the tool called', (await runPack('http://fake', 'tools')).score === 100);
  const noBox = await runPack('http://fake', 'code', { sandbox: null });
  check('without a working sandbox, code is never run: the pack is skipped and says why', noBox.score === null && /sandbox/.test(noBox.skipped));
  let ran = 0;
  const cd = await runPack('http://fake', 'code', { sandbox: { run: async (code, fn, cases) => { ran++; return cases.map(() => ({ ok: true, v: 'wrong' })); } } });
  check('code answers go to the sandbox and wrong results score 0', ran === CODE.length && cd.score === 0);
  check('an unknown pack is refused', await runPack('http://fake', 'nope').then(() => false, (e) => /no challenge called nope/.test(e.message)));
  globalThis.fetch = realFetch;
}
// the scoreboard keeps the newest score for each pack
{
  const a = mergeScores(null, { name: 'Riker', sha256: 'ab', sizeGB: 17.5, quant: 'Q4_K_M', packs: { sums: { score: 80, right: 12, of: 15 } }, tps: 40, when: '2026-11-08' });
  const b = mergeScores(a, { name: 'Riker', packs: { reasoning: { score: 90, right: 18, of: 20 }, code: { score: null, right: 0, of: 8, skipped: 'no sandbox' } }, when: '2026-11-09' });
  check('a second run keeps the first run\'s other packs and adds the new ones', b.packs.sums.score === 80 && b.packs.reasoning.score === 90 && b.packs.code.skipped && b.speed.tps === 40 && b.when === '2026-11-09');
  const board = scoreboard([{ id: 'riker', ...b }, { id: 'bill', brain: { name: 'Bill' }, packs: { sums: { score: 70 } } }]);
  check('the scoreboard has one row per brain, a cell per pack, empty where not run', board.length === 2 && board[0].name === 'Bill' && board[0].scores.sums === 70 && board[0].scores.reasoning === null && board[1].scores.reasoning === 90 && board[1].sizeGB === 17.5);
}
// 1.5.163 brains and lesson sets on Hugging Face, for Forge plans
{
  const { parseHfRef, hfLookup } = await import('../src/lab-hf.js');
  const { makeForgePlan, forgeStartProblems } = await import('../src/lab-forge.js');
  check('a Hugging Face name or link is read, and anything else is refused', parseHfRef('Qwen/Qwen3.6-35B-A3B')?.repo === 'Qwen/Qwen3.6-35B-A3B' && parseHfRef('https://huggingface.co/Qwen/Qwen3-8B/tree/abc123')?.revision === 'abc123' && parseHfRef('https://huggingface.co/datasets/o/n/blob/main/data/train.jsonl')?.file === 'data/train.jsonl' && parseHfRef('hf:datasets/o/n:a.jsonl@v2').kind === 'dataset' && !parseHfRef('https://evil.example/o/n') && !parseHfRef('../../etc') && !parseHfRef('o/n; rm -rf /') && !parseHfRef('hf:datasets/o/n:../x.jsonl') && !parseHfRef('o/n:file.jsonl'));
  const seen = [];
  const fake = async (url, o) => { seen.push([url, o?.headers?.Authorization || '']); if (/nope/.test(url)) return { ok: false, status: 404 }; if (/locked/.test(url)) return { ok: false, status: 401 }; return { ok: true, status: 200, json: async () => (/datasets/.test(url) ? { cardData: {}, siblings: [{ rfilename: 'train.jsonl' }, { rfilename: 'README.md' }] } : { cardData: { license: 'apache-2.0' }, safetensors: { total: 30.5e9 }, config: { architectures: ['Qwen3MoeForCausalLM'] }, siblings: [{ rfilename: 'model-00001.safetensors' }] }) }; };
  const m = await hfLookup('Qwen/Qwen3.6-35B-A3B', { fetchFn: fake, token: 'hf_secret_123' });
  check('looking up a brain shows its licence, size class and mixture of experts', m.ok && m.license === 'apache-2.0' && m.paramsB === 30.5 && m.cls === 'huge' && m.moe && m.weights);
  check('the token goes only to huggingface.co, in the header, and never into what comes back', seen.every(([u, h]) => u.startsWith('https://huggingface.co/api/') && h === 'Bearer hf_secret_123') && !JSON.stringify(m).includes('hf_secret'));
  const d = await hfLookup(parseHfRef('hf:datasets/o/n:train.jsonl'), { fetchFn: fake, token: '' });
  check('a dataset with no licence says to keep what you make private', d.ok && d.files.join() === 'train.jsonl' && !d.licenseKnown && /keep it private/.test(d.note));
  check('a missing or private repo is said in plain words', /no model called/.test((await hfLookup('o/nope', { fetchFn: fake })).error) && /HF_TOKEN/.test((await hfLookup('o/locked', { fetchFn: fake, token: '' })).error));
  const hp = makeForgePlan({ rungs: [{ name: 'a', keep: 64 }], brain: { pick: 'source', source: { kind: 'hf', repo: 'Qwen/Qwen3-30B-A3B', revision: 'abc', license: 'apache-2.0' } }, lessons: [{ kind: 'hf', repo: 'o/n', file: 'train.jsonl', license: '' }, { kind: 'hf', repo: '../bad' }, { kind: 'local', value: 'C:\\lessons\\mine.jsonl' }, { kind: 'local', value: 'relative.jsonl' }, { kind: 'link', value: 'https://example.org/set.jsonl' }, { kind: 'link', value: 'http://plain' }] }, { base: { teacher: 'Qwen/Qwen3.6-35B-A3B', teacher_model: 'bobs/35Bob/model', counts: 'x.json', skills: { chat: 1 } } });
  check('a Hugging Face brain becomes the teacher, and the old trained teacher on the drive is never used', hp.plan.teacher === 'Qwen/Qwen3-30B-A3B' && hp.plan.teacher_revision === 'abc' && !hp.plan.teacher_model && !hp.plan.train_teacher && !hp.plan.publish && hp.plan.teacher_license === 'apache-2.0');
  check('a cut of a brain not counted yet is refused in words', hp.problems.some((x) => /haven't been counted yet/.test(x)));
  check('lesson sets from Hugging Face, a file here or a link go to the importer by name, path or link; bad ones are refused in words', hp.plan.hf_lessons.length === 3 && hp.plan.hf_lessons[0].file === 'train.jsonl' && hp.plan.hf_lessons[0].private_only === true && hp.plan.hf_lessons[1].path === 'C:\\lessons\\mine.jsonl' && hp.plan.hf_lessons[2].url === 'https://example.org/set.jsonl' && hp.problems.filter((x) => /lesson/.test(x)).length === 3 && hp.notes.some((n) => /starts over/.test(n)));
  const hc = makeForgePlan({ rungs: [{ name: 'a', how: 'cover', keep: 64 }], brain: { pick: 'source', source: { kind: 'hf', repo: 'Qwen/Qwen3-30B-A3B', license: 'apache-2.0', moe: true } }, lessonSets: ['mine', 'nope'] }, { base: { teacher: 'x/y', counts: 'x.json', skills: { chat: 1 } }, lessonSets: [{ id: 'mine', dir: '/lab/sets/mine' }] });
  check('a lesson set from the Lab goes up as a folder the Forge already knows how to upload', hc.plan.extra_lessons.length === 1 && path.isAbsolute(hc.plan.extra_lessons[0]) && hc.notes.some((n) => /from the Lab go/.test(n)));
  const hb = makeForgePlan({ rungs: [{ name: 'a', how: 'cover', keep: 64 }], brain: { pick: 'forge:28Bob' } }, { base: { teacher: 'x/y', skills: { chat: 1 } } });
  check('a brain the Forge made is the trained teacher on its drive', hb.plan.teacher_model === 'bobs/28Bob/model' && hb.plan.teacher === 'x/y' && !hb.problems.length, hb.problems.join());
  const hbp = { ...hb.plan, hours_max: 1, dollars_max: 1, rungs: [{ hours: 1 }] }, hbArgs = { allowed: true, hasKey: true, shown: { hours: 1, dollars: 1 } };
  check('it can only start when the Forge\'s drive record shows its full weights there', forgeStartProblems({ plan: hbp, ...hbArgs }).some((x) => /rent a card and stop at once/.test(x)) && !forgeStartProblems({ plan: hbp, ...hbArgs, drive: ['bobs/28Bob/model'] }).length);
  const hl = makeForgePlan({ rungs: [{ name: 'a', how: 'cover', keep: 64 }], brain: { pick: 'source', source: { kind: 'local', value: 'C:\\brains\\mine' } } }, { base: { skills: { chat: 1 } } });
  check('a brain from this replicant matrix saves with its path but says the Forge can\'t take it yet; a GGUF and a choice not made are refused', hl.plan.teacher_local === 'C:\\brains\\mine' && hl.notes.some((n) => /can't take one yet/.test(n)) && forgeStartProblems({ plan: { ...hl.plan, hours_max: 1, dollars_max: 1, rungs: [{ hours: 1 }] }, allowed: true, hasKey: true, shown: { hours: 1, dollars: 1 } }).some((x) => /can't take one of those yet/.test(x)) && makeForgePlan({ rungs: [{ name: 'a', keep: 8 }], brain: { pick: 'source', source: { kind: 'local', value: 'C:\\b\\x.gguf' } } }, { base: {} }).problems.some((x) => /running file/.test(x)) && makeForgePlan({ rungs: [{ name: 'a', keep: 8 }], brain: { pick: '' } }, { base: {} }).problems.some((x) => /Choose the brain/.test(x)));
  check('keeping every skill covered counts the new brain on the card, so it isn\'t refused', !hc.problems.some((x) => /counted/.test(x)) && hc.plan.rungs[0].keep === 'cover' && !('teacher_revision' in hc.plan));
  check('a brain that isn\'t a mixture of experts can\'t be cut by experts', makeForgePlan({ rungs: [{ name: 'a', how: 'cover' }], brain: { pick: 'source', source: { kind: 'hf', repo: 'o/dense', moe: false } } }, { base: { skills: { chat: 1 } } }).problems.some((x) => /isn't a mixture of experts/.test(x)));
  const okPlan = { hours_max: 2, dollars_max: 5, rungs: [{ hours: 1 }], hf_lessons: [{ repo: 'o/n' }] };
  check('a plan with Hugging Face lessons never starts until the Forge\'s importer is here', forgeStartProblems({ plan: okPlan, allowed: true, hasKey: true, shown: { hours: 2, dollars: 5 } }).some((x) => /importer/.test(x)) && !forgeStartProblems({ plan: okPlan, allowed: true, hasKey: true, shown: { hours: 2, dollars: 5 }, importer: true }).length);
  const { pathByName: pbn } = await import('../public/lab-thinking-paths.js');
  check('the famous styles are there, tagged Fable-like, Opus-like and GPT-like, with a no-affiliation line; the lesson writer\'s style lines never name a model', [['Sherlock', 'Fable-like'], ['Watson', 'Opus-like'], ['Vulcan', 'GPT-like']].every(([n, l]) => pbn(n)?.style.length > 30 && pbn(n).like === l && !/fable|opus|gpt|claude|anthropic|openai/i.test(pbn(n).style)) && /never from those models/.test(read('public/lab-thinking-paths.js')) && /endorses/.test(read('public/lab-thinking-paths.js')) && !/spock|star trek/i.test(read('public/lab-thinking-paths.js')));
  const fui = read('public/lab-forge.js');
  const srcui = read('public/lab-source.js');
  check('the form has one brain list (the Forge\'s brains, then another brain from here, Hugging Face or a link) and a lessons list with the Lab\'s sets, and no "plan\'s own brain"', ['The brain to start from', 'Brains the Forge made', 'Another brain: on this replicant matrix, on Hugging Face, or at a link', 'Forge settings to copy', 'Lessons to teach', 'Add a lesson set from somewhere else'].every((w) => fui.includes(w)) && !/plan's own brain/.test(fui) && ['On this replicant matrix', 'On Hugging Face', 'At another link', 'Look it up'].every((w) => srcui.includes(w)) && /rel="noopener noreferrer"/.test(srcui));
}
// 1.5.162 the leaderboard by class of model
{
  check('classes go by total weights, from Tiny to Giant, and a brain with no count has none', CLASSES.length === 6 && classOf(1.5) === 'tiny' && classOf(2) === 'small' && classOf(7.6) === 'medium' && classOf(14) === 'large' && classOf(30.5) === 'huge' && classOf(235) === 'giant' && classOf(0) === '' && classOf(undefined) === '');
  const m = mergeScores(null, { name: 'Bill', paramsB: 21.1, activeB: 3.6, experts: 64, madeHere: true, packs: { sums: { score: 80, right: 8, of: 10 }, quiz: { score: 60, right: 6, of: 10 } }, tps: 50 });
  check('a score remembers its test\'s version and the brain\'s weights', m.packs.sums.v === PACK_VERSION.sums && m.brain.paramsB === 21.1 && m.brain.activeB === 3.6 && m.brain.madeHere === true);
  m.packs.quiz.v = (PACK_VERSION.quiz || 1) + 99; // pretend the quiz changed since
  const rows = scoreboard([{ id: 'bill', ...m }, { id: 'riker', brain: { name: 'Riker', paramsB: 30.5, activeB: 3.3, experts: 128 }, packs: { sums: { score: 90, v: PACK_VERSION.sums } }, speed: { tps: 40 } }, { id: 'old', brain: { name: 'Old one' }, packs: { sums: { score: 50 } } }, { id: 'fast', brain: { name: 'Fast', paramsB: 25 }, packs: { sums: { score: 80, v: PACK_VERSION.sums } }, speed: { tps: 90 } }]);
  const bill = rows.find((r) => r.id === 'bill');
  check('a mixture of experts sits in the class of its total, with the active weights shown', bill.cls === 'huge' && bill.moe && bill.activeB === 3.6 && bill.madeHere);
  check('an older test\'s score shows but doesn\'t count towards overall', bill.old.join() === 'quiz' && bill.scores.quiz === 60 && bill.overall === 80 && bill.ran === 1);
  check('a brain scored before classes has no class yet', rows.find((r) => r.id === 'old').cls === '');
  const huge = classBoard(rows, 'huge');
  check('a class board puts the best overall first, then the faster on a tie', huge.map((r) => r.name).join() === 'Riker,Fast,Bill');
  const full = Object.fromEntries(PACK_IDS.map((id) => [id, { score: 80, v: PACK_VERSION[id] }]));
  const two = scoreboard([{ id: 'one', brain: { name: 'One trick', paramsB: 25 }, packs: { sums: { score: 95, v: PACK_VERSION.sums } }, speed: { tps: 200 } }, { id: 'full', brain: { name: 'All six', paramsB: 25 }, packs: full, speed: { tps: 10 } }]);
  check('a brain that ran one challenge at 95 sits below one that ran them all at 80', classBoard(two, 'huge').map((r) => r.name).join() === 'All six,One trick' && two.find((r) => r.id === 'full').all && !two.find((r) => r.id === 'one').all);
  const ui = read('public/lab.js'), css = read('public/style.css');
  check('the Challenges tab shows the board by class with filter chips and a best-in-class ribbon', ['By class of model', 'Every brain in one table', 'Mixture of experts', 'Dense', 'Made here', 'Best in class', 'Not placed yet', 'at work', 'GB graphics card', 'so it can\'t win by skipping the hard one'].every((w) => ui.includes(w)) && /i === 0 && r\.all && c\.id/.test(ui) && /aria-pressed/.test(ui) && /\.lab-chip/.test(css) && /\.lab-ribbon/.test(css));
  check('Save from the class board keeps the class in a column', /title: 'Lab leaderboard by class', head: \['Class'/.test(ui));
}
// a challenge job, fake steps
{
  const packsRun = [];
  const chLab = new Lab(cfg, { shop, room: big, broadcast: (e) => events.push(e), steps: {
    serve: async () => ({ url: 'http://fake', stop: () => {}, where: 'card' }),
    pack: async (url, id, { onStep, sandbox }) => { packsRun.push([id, Boolean(sandbox)]); onStep(1, 1); return { score: id === 'sums' ? 60 : 90, right: 3, of: 5, misses: [], tps: 20, prefillTps: 500 }; },
    sandbox: async () => ({ run: async () => [] }),
    fingerprint: async () => 'cafe'
  } });
  check('a challenge needs a brain and a pack', await chLab.startChallenge({ from: 'nope', packs: ['sums'] }).then(() => false, (e) => /Pick a brain/.test(e.message)) && await chLab.startChallenge({ from: 'test-moe', packs: ['rm -rf'] }).then(() => false, (e) => /at least one challenge/.test(e.message)));
  const cs = await chLab.startChallenge({ from: 'test-moe', packs: ['sums', 'code', 'sums'] });
  check('the challenge job starts, packs once each', cs.started?.kind === 'challenge' && cs.started.steps.length === 3);
  while (chLab.job) await new Promise((r) => setTimeout(r, 20));
  const cr = chLab.runs.at(-1);
  check('it runs each pack, with the sandbox only for code-it', cr.state === 'done' && packsRun.map((x) => x.join(':')).join() === 'sums:true,code:true' && cr.report.challenges.map((c) => c.score).join() === '60,90', cr.error || '');
  const board = chLab.scores();
  check('the scoreboard has the brain, its fingerprint file, size and speed, and no paths', board.length === 1 && board[0].name === 'Test MoE' && board[0].scores.sums === 60 && board[0].scores.code === 90 && board[0].tps === 20 && !JSON.stringify(board).includes(tmp) && JSON.parse(fs.readFileSync(path.join(dataDir, 'lab', 'scores', 'test-moe.json'), 'utf8')).brain.sha256 === 'cafe');
  check('the scoreboard row knows it\'s a mixture of experts from its file, and the page gets the classes', board[0].moe === true && board[0].cls === '' && chLab.view().classes.length === 6 && chLab.view().classes[0].label === 'Tiny');
  check('the page gets the packs, the scoreboard and the hardware line', chLab.view().packs.length === PACKS.length && chLab.view().packs.every((x) => !x.items && !x.mark) && chLab.view().scores.length === 1 && /GB RAM/.test(chLab.view().hardware));
  check('Gaming on: challenges wait too', await new Lab({ ...cfg, session: 'light' }, { shop, room: big }).startChallenge({ from: 'test-moe', packs: ['sums'] }).then(() => false, (e) => /Gaming is on/.test(e.message)));
  const be = { engine: { loaded: async () => [{ name: 'qwen', vram: 9e9 }], unloadAll: async () => {} } };
  check('with Bob\'s brain on the card, challenges ask first', (await new Lab(cfg, { shop, room: big, brain: be }).startChallenge({ from: 'test-moe', packs: ['sums'] })).needUnload === true);
  // Save
  const r1 = cleanResult({ title: 'Lab scoreboard', head: ['Brain', 'Sums'], rows: [['Riker\nX', 80]], format: 'exe' });
  check('a result to save is cleaned: plain cells, a known format', r1.rows[0][0] === 'Riker X' && r1.rows[0][1] === '80' && r1.format === 'md');
  const md = resultText({ ...r1, note: 'Out of 100.' }, { version: '1.5.153', hardware: '16 GB graphics card, 32 GB RAM', when: '2026-11-08' });
  check('Text is a Markdown table with Bob\'s version, the date, and the hardware only when asked', /^# Lab scoreboard\n\n\| Brain \| Sums \|/.test(md) && /Riker X \| 80/.test(md) && /Bob 1\.5\.153's Computer Science Lab · 2026-11-08 · 16 GB graphics card/.test(md) && !/GB RAM/.test(resultText(r1, { version: '1', when: 'x' })));
  check('Spreadsheet is CSV, quoted where it needs to be', resultText({ ...r1, rows: [['a, b', '1']], format: 'csv' }) === 'Brain,Sums\n"a, b",1\n');
  check('the hardware line says the card and the RAM', hardwareLine({ gpuVramGB: 16 }, 32 * 1024 ** 3) === '16 GB graphics card, 32 GB RAM' && hardwareLine({}, 8 * 1024 ** 3) === '8 GB RAM');
  const sv = chLab.saveResult({ title: 'Lab scoreboard', head: ['Brain'], rows: [['Riker']], format: 'csv' });
  check('Save writes in the Lab\'s results folder and gives back only the file name', fs.existsSync(path.join(dataDir, 'lab', 'results', sv.file)) && !sv.file.includes(path.sep) && /^lab-scoreboard-.*\.csv$/.test(sv.file));
  const png = Buffer.concat([Buffer.from([0x89]), Buffer.from('PNG\r\n\x1a\n', 'latin1'), Buffer.alloc(20)]).toString('base64');
  check('a picture is saved as a PNG', /\.png$/.test(chLab.saveResult({ title: 'T', head: ['a'], rows: [], format: 'png', png: `data:image/png;base64,${png}` }).file));
  check('something that isn\'t a PNG is refused', (() => { try { chLab.saveResult({ title: 'T', head: ['a'], rows: [], format: 'png', png: `data:image/png;base64,${Buffer.from('MZ not a png').toString('base64')}` }); return false; } catch (e) { return /isn't a picture/.test(e.message); } })());
  check('an empty table isn\'t saved', (() => { try { chLab.saveResult({ title: 'T' }); return false; } catch (e) { return /nothing to save/.test(e.message); } })());
  const sent2 = [];
  await labRoute({ req: { method: 'POST' }, res: {}, p: '/api/lab/challenge', isLocal: false, lab: chLab, body: async () => ({ challenge: { from: 'test-moe', packs: ['sums'] } }), send: (res, code, j) => sent2.push([code, j]) });
  await labRoute({ req: { method: 'POST' }, res: {}, p: '/api/lab/save', isLocal: false, lab: chLab, body: async () => ({ title: 'x', head: ['a'], format: 'md' }), send: (res, code, j) => sent2.push([code, j]) });
  check('challenges and Save only from this replicant matrix itself', sent2.every(([code]) => code === 403));
}
{
  const lab3 = read('public/lab.js'), save = read('public/lab-save.js'), learn3 = read('public/lab-learn.js');
  check('the Challenges tab is a real tab now, with the reviewed words', /\['challenges', 'Challenges'\]/.test(lab3) && ['Run the challenges', 'Scoreboard', 'Which brain?', 'Press a column\'s name to sort by it.'].every((w) => lab3.includes(w)) && !/Challenges <span class="lab-later">/.test(lab3));
  check('the scoreboard sorts with buttons in the column headers and says which way', /aria-sort=/.test(lab3) && /data-sort=/.test(lab3));
  check('Save offers a picture, text, a spreadsheet and data, and the hardware only if ticked', ['Picture', 'Text', 'Spreadsheet', 'Data', 'Include my graphics card and memory', 'Never file paths, your chats or your name'].every((w) => save.includes(w)) && /hardware: false/.test(lab3) && /hardware: false/.test(learn3));
  check('every Learn card can be saved', ['learn-tokens', 'learn-next', 'learn-temperature'].every((k) => learn3.includes(`saveBox('${k}')`)));
  check('Help has a Challenges page in Bob\'s voice that says the scores aren\'t paper numbers', /id: 'lab-challenges'/.test(read('public/help-content.js')) && /aren't the numbers you see in papers/.test(read('public/help-content.js')));
}

// ---- 1.5.156 Playground: the quantization ladder ----
{
  check('the ladder is six sizes, Q8 down to Q2, biggest first', LADDER.map((x) => x.label).join() === 'Q8,Q6,Q5,Q4,Q3,Q2' && LADDER.every((x, i) => !i || x.share < LADDER[i - 1].share));
  const tx = ladderTexts();
  check('the ladder tunes on one part of the Help and scores on another, never the same text', tx.tune.length > 30000 && tx.score.length > 5000 && !tx.tune.includes(tx.score.slice(0, 200)) && !/<[a-z]/.test(tx.score));
  check('the disk the ladder needs is shown from the brain\'s size', ladderDiskGB(8) > 16 && ladderDiskGB(8) < 18);
  check('the surprise is read from llama-perplexity\'s last line', readPerplexity('[1]8.1,[2]8.3\nFinal estimate: PPL = 8.2345 +/- 0.11\n') === 8.2345 && readPerplexity('nothing here') === null);
  const rows = ladderTable([{ type: 'Q8_0', sizeGB: 4.3, score: 80, tps: 50, ppl: 10 }, { type: 'Q6_K', sizeGB: 3.3, score: 80, tps: 60, ppl: 10.1 }, { type: 'Q4_K_M', sizeGB: 2.5, score: 78, tps: 70, ppl: 10.6 }, { type: 'Q3_K_M', sizeGB: 2, score: 70, tps: 75, ppl: 11.5 }, { type: 'Q2_K', sizeGB: 1.6, score: 40, tps: 80, ppl: 16 }]);
  check('each size is compared with Q8 and given a verdict in words', rows[0].rel === 1 && rows[0].verdict === 'same quality' && rows[2].verdict === 'a little worse' && rows[3].verdict === 'noticeably worse' && rows[4].verdict === 'falls apart' && rows[4].scoreDrop === -40);
  check('Bob names the smallest size that is still close, and where it slips', /^Q4 is the smallest size here that's still close to Q8, and it's 42% smaller\. From Q3 down it starts to slip/.test(ladderSaw(rows)));
  check('without a surprise score there is no verdict, and no line', ladderTable([{ type: 'Q8_0', score: 80 }])[0].verdict === '' && ladderSaw(ladderTable([{ type: 'Q8_0', score: 80 }])) === '');

  const made = [], asked = [];
  const plLab = new Lab(cfg, { shop, room: big, broadcast: (e) => events.push(e), steps: {
    imatrix: async (s) => { fs.writeFileSync(s.out, 'imatrix'); },
    quantize: async (s) => { made.push(s.type); fs.writeFileSync(s.out, Buffer.alloc(1000 * (7 - made.length))); },
    perplexity: async (s) => 10 + made.length * (made.length > 4 ? 3 : 0.1),
    test: async () => fakeQuiz(80 - made.length),
    ask: async (s) => { asked.push(path.basename(s.gguf)); return `answer from ${path.basename(s.gguf)}`; }
  } });
  const pl = plLab.planLadder('test-moe');
  check('the ladder plan says the disk it needs and that the surprise tool is missing here', !pl.problems.length && pl.diskGB > 0 && pl.notes.some((n) => /skips the surprise score/.test(n)), pl.problems.join());
  check('a brain that isn\'t here can\'t start a ladder', plLab.planLadder('nope').problems.length === 1);
  check('the page gets the ladder limit and steps, no paths', plLab.view().playMaxGB === PLAY_MAX_GB && plLab.view().ladderSteps.length === 6 && !JSON.stringify(plLab.view().ladders).includes(tmp));
  const be2 = { engine: { loaded: async () => [{ name: 'qwen', vram: 9e9 }], unloadAll: async () => {} } };
  check('with Bob\'s brain on the card, the ladder asks first', (await new Lab(cfg, { shop, room: big, brain: be2 }).startLadder({ from: 'test-moe' })).needUnload === true);
  check('Gaming on: the ladder waits', await new Lab({ ...cfg, session: 'light' }, { shop, room: big }).startLadder({ from: 'test-moe' }).then(() => false, (e) => /Gaming is on/.test(e.message)));
  const ls = await plLab.startLadder({ from: 'test-moe' });
  check('the ladder job starts with a measure step and one per size', ls.started?.kind === 'ladder' && ls.started.steps.length === 7);
  while (plLab.job) await new Promise((r) => setTimeout(r, 20));
  const lr = plLab.runs.at(-1);
  check('the ladder makes all six sizes from the full-size file, with the importance file', lr.state === 'done' && made.join() === LADDER.map((x) => x.type).join(), lr.error || '');
  const lv = plLab.view().ladders;
  check('the ladder\'s results are kept, with the verdicts and Bob\'s line', lv.length === 1 && lv[0].rows.length === 6 && lv[0].rows[0].verdict === 'same quality' && lv[0].rows[5].verdict === 'falls apart' && /^Q4 is the smallest/.test(lv[0].saw) && lv[0].rows[4].verdict === 'falls apart', JSON.stringify(lv[0]?.rows?.map((r) => r.rel)));
  check('the scoring text and the tuning text are written beside the results, not in Bob\'s models', fs.existsSync(path.join(dataDir, 'lab', 'playground', lv[0].id, 'score.txt')) && fs.existsSync(path.join(dataDir, 'lab', 'playground', lv[0].id, 'ladder.json')));
  const qa = await plLab.startLadderAsk({ id: lv[0].id, question: '  What is a  black hole? ' });
  check('the same question goes to every size', qa.started?.kind === 'ladder-ask' && qa.started.steps.length === 6);
  while (plLab.job) await new Promise((r) => setTimeout(r, 20));
  const la = plLab.view().ladders[0].asked;
  check('every size\'s answer is kept with the question', la?.question === 'What is a black hole?' && la.answers.length === 6 && asked.length === 6 && la.answers[0].label === 'Q8');
  check('an empty question isn\'t asked', await plLab.startLadderAsk({ id: lv[0].id, question: '  ' }).then(() => false, (e) => /Type a question/.test(e.message)));
  const files = Object.values(JSON.parse(fs.readFileSync(path.join(dataDir, 'lab', 'playground', lv[0].id, 'ladder.json'), 'utf8')).files);
  const del = plLab.deleteLadder(lv[0].id);
  check('Delete all removes the six files and the importance file, and keeps the table', del.freedGB >= 0 && files.length === 6 && files.every((f) => !fs.existsSync(f)) && plLab.view().ladders[0].deleted && plLab.view().ladders[0].rows.length === 6);
  check('a deleted ladder can\'t be asked again', await plLab.startLadderAsk({ id: lv[0].id, question: 'x' }).then(() => false, (e) => /were deleted/.test(e.message)));
  // Delete all only ever removes files inside the ladder's own folder
  const lj = path.join(dataDir, 'lab', 'playground', lv[0].id, 'ladder.json');
  const outside = path.join(tmp, 'precious.txt'); fs.writeFileSync(outside, 'keep me');
  const rec2 = JSON.parse(fs.readFileSync(lj, 'utf8')); rec2.deleted = false; rec2.files = { Q8_0: outside }; fs.writeFileSync(lj, JSON.stringify(rec2));
  plLab.deleteLadder(lv[0].id);
  check('Delete all never touches a file outside the ladder\'s folder', fs.existsSync(outside));
  const sent3 = [];
  for (const p of ['/api/lab/ladder', '/api/lab/ladder/ask', '/api/lab/ladder/delete']) await labRoute({ req: { method: 'POST' }, res: {}, p, isLocal: false, lab: plLab, body: async () => ({ from: 'test-moe', id: 'x' }), send: (res, code, j) => sent3.push([code, j]) });
  check('the ladder only starts, asks and deletes from this replicant matrix itself', sent3.length === 3 && sent3.every(([code]) => code === 403));
  const pg = read('public/lab-playground.js');
  check('the Playground tab uses the reviewed words, a table as well as bars, and Save', ['How small can a brain get?', 'Make the ladder', 'Same question, every size', 'Ask every size', 'Delete all', 'What you just saw', 'Compared with Q8', 'Delete the six sizes for good? The table stays.', 'Delete them', 'Keep them', 'Bob takes one small brain', 'needs the graphics card'].every((w) => pg.includes(w)) && !/I take one|I show how much|ordinary writing/.test(pg) && /<th scope="col">/.test(pg) && /aria-hidden="true"/.test(pg) && /saveHtml\(/.test(pg));
  check('Help has a Playground page in Bob\'s voice', /id: 'lab-playground'/.test(read('public/help-content.js')) && /how small can a brain get before it gets worse/.test(read('public/help-content.js')));
  check('the Playground never sends anything to a rental', !/runpod|\brent/i.test(pg) && !/runpod|\brent/i.test(read('src/lab-playground.js')));
}

// ---- 1.5.158 the Forge tab ----
{
  check('every way to make a brain has a card with what it does, where it runs and best practice', METHODS.length >= 11 && METHODS.every((m) => m.title && m.what && ['here', 'rented', 'both'].includes(m.where) && m.tips.length && (m.ready || m.why)) && ['mix', 'stack', 'refusals', 'stitch', 'fewer', 'thinking', 'blend', 'fold'].every((id) => METHODS.some((m) => m.id === id)));
  check('round robin and the other non-ideas are left out with a reason', LEFT_OUT.some(([t]) => /Round robin/.test(t)) && LEFT_OUT.some(([t]) => /offloading/i.test(t)) && LEFT_OUT.every(([, w]) => w.length > 20));
  check('nothing in the Forge tab names a private brain or a date gate', !/thoth|uncensor|heretic|15th of November/i.test(read('src/lab-forge.js') + read('public/lab-forge.js')));
  check('keys and tokens are hidden from log lines', scrub('key rpa_ABCDEFGH12345678 and hf_abcdefghijkl and "token": "0123456789abcdef0123"') === 'key [hidden] and [hidden] and [hidden]' && scrub('step 12 loss 0.41') === 'step 12 loss 0.41');
  const base = { teacher: 'Qwen/x', skills: { chat: ['chat'], coding: ['coding'] }, hours_max: 28, dollars_max: 150, benchmark: { commands: ['rm -rf /'] }, rungs: [{ name: 'old' }] };
  const kf = [{ id: 'k1', name: 'Little', experts: 96, layers: 40, path: '/x/little-keep.json' }];
  const fp = makeForgePlan({ run: 'My run!', rungs: [{ name: '20Bob', nickname: 'Bill', how: 'file', keepFile: 'k1' }, { name: '12Bob', how: 'cover', keep: 80, strong: ['coding'] }], strong: ['coding', 'nope'], quants: ['Q4_K_M', 'exe'], heal: { experts: 'lora', epochs: 1 } }, { base, keepFiles: kf });
  check('a Forge plan keeps the base teacher and skills, never its caps or benchmark commands', fp.plan.teacher === 'Qwen/x' && fp.plan.skills.chat && fp.plan.hours_max === 0 && fp.plan.dollars_max === 0 && !('benchmark' in fp.plan));
  check('protected skills sit at the top of the plan, never in a rung', fp.plan.strong.join() === 'coding' && fp.plan.strong_cover === 0.99 && rungFieldsOk(fp.plan) && !fp.plan.rungs.some((r) => 'strong' in r));
  check('a keep file goes in as an absolute path with its expert count; the first brain is cut from the teacher', path.isAbsolute(fp.plan.rungs[0].keep_file) && fp.plan.rungs[0].keep === 96 && fp.plan.rungs[0].from === 'teacher' && fp.plan.rungs[1].keep === 'cover' && fp.plan.rungs[1].keep_n === 80);
  check('each brain\'s teaching-back limit is set above the estimate for a full pass', fp.plan.rungs.every((r) => r.hours >= 2.5) && fp.hours > 0 && fp.plan.heal.experts === 'lora' && !('alpha' in fp.plan.heal));
  check('a plan with caps of 0 can be saved but says it can never start', fp.notes.some((n) => /never started/.test(n)) && !fp.problems.length, fp.problems.join());
  check('a time cap below the estimate is a problem, in words', makeForgePlan({ rungs: [{ name: 'a', keep: 128 }], hours_max: 1, dollars_max: 10 }, { base }).problems.some((x) => /Raise the cap/.test(x)));
  check('only known running files go in the plan', fp.plan.quants === 'Q4_K_M');
  // the Lab's view of a Forge next to Bob
  const ml = path.join(tmp, 'model-lab');
  fs.mkdirSync(path.join(ml, 'forge', 'plans'), { recursive: true }); fs.writeFileSync(path.join(ml, 'forge', 'forge.mjs'), '');
  fs.writeFileSync(path.join(ml, 'forge', 'plans', 'bill-v3.json'), JSON.stringify(base));
  fs.mkdirSync(path.join(ml, 'out', 'forge'), { recursive: true });
  fs.writeFileSync(path.join(ml, 'out', 'forge', 'forge-2026-11-05T10-00-00.log'), '10:00:00 renting\n10:01:00 pod token rpa_SECRETSECRET1234\n12:00:00 downloaded 20Bob-Q4_K_M.gguf\n12:01:00 deleting the pod (all Bobs downloaded), $41.20 spent\n');
  fs.mkdirSync(path.join(ml, 'out', 'bobs', '20Bob'), { recursive: true });
  fs.writeFileSync(path.join(ml, 'out', 'bobs', '20Bob', 'heal-report.json'), JSON.stringify({ experts: 'lora', before: { lessons: { ce: 0.4011, teacher_ce: 0.3243 } }, after: { lessons: { ce: 0.3512 } }, steps: 929, planned_steps: 929 }));
  fs.writeFileSync(path.join(ml, 'out', 'bobs', '20Bob', '20Bob-Q4_K_M.gguf'), '');
  fs.mkdirSync(path.join(dataDir, 'lab', 'usage', 'test-moe'), { recursive: true });
  fs.writeFileSync(path.join(dataDir, 'lab', 'usage', 'test-moe', 'test-moe-keep.json'), JSON.stringify({ name: 'Test MoE', experts: 2, layers: [[0, 1], [2, 3]] }));
  const fLab = new Lab(cfg, { shop, room: big });
  const fv = fLab.forgeView();
  check('the Forge tab finds the Forge, its runs and its plans', fv.found && fv.runs.length === 1 && fv.runs[0].state === 'done' && fv.runs[0].made.join() === '20Bob-Q4_K_M.gguf' && fv.plans[0].id === 'bill-v3' && fv.skills.join() === 'chat,coding');
  check('the Forge\'s log lines on screen never carry a key', !JSON.stringify(fv.runs).includes('SECRET') && JSON.stringify(fv.runs).includes('[hidden]'));
  check('the brains it brought home show before, after and the floor, and a full pass', fv.brains[0].name === '20Bob' && fv.brains[0].before === 0.401 && fv.brains[0].after === 0.351 && fv.brains[0].floor === 0.324 && fv.brains[0].steps === 929);
  check('the Lab\'s keep files are offered by name, without their paths', fv.keepFiles.some((k) => k.name === 'Test MoE' && k.experts === 2) && !JSON.stringify(fv.keepFiles).includes(tmp));
  const kid = fv.keepFiles.find((k) => k.name === 'Test MoE').id;
  const sv2 = fLab.saveForgePlan({ base: 'bill-v3', run: 'first', rungs: [{ name: '6Bob', how: 'file', keepFile: kid }] });
  const sp = JSON.parse(fs.readFileSync(path.join(dataDir, 'lab', 'forge-plans', sv2.file), 'utf8'));
  check('Save the plan writes it in the Lab\'s forge-plans folder, ready for the Forge', sv2.file === 'first.json' && sp.rungs[0].keep_file.endsWith('test-moe-keep.json') && sp.hours_max === 0);
  check('a plan from a Forge plan that isn\'t there is refused', (() => { try { fLab.forgePlan({ base: '../../etc/passwd' }); return false; } catch (e) { return /isn't there/.test(e.message); } })());
  const sent4 = [];
  for (const p of ['/api/lab/forge/plan', '/api/lab/forge/save']) await labRoute({ req: { method: 'POST' }, res: {}, p, isLocal: false, lab: fLab, body: async () => ({ form: {} }), send: (res, code, j) => sent4.push([code, j]) });
  await labRoute({ req: { method: 'GET' }, res: {}, p: '/api/lab/forge', isLocal: false, lab: fLab, body: async () => ({}), send: (res, code, j) => sent4.push([code, j]) });
  check('plans are written only on this replicant matrix; other devices see the runs, without keep files', sent4[0][0] === 403 && sent4[1][0] === 403 && sent4[2][0] === 200 && sent4[2][1].runs.length === 1 && sent4[2][1].keepFiles.length === 0);
  const pf = read('public/lab-forge.js');
  check('the Forge tab starts a run only from a purchase card with the caps on it, behind a switch that starts off', /Let the Lab start Forge runs/.test(pf) && /Off unless you turn it on/.test(pf) && /Rent it and start \(up to \$/.test(pf) && /Caps: \$\{buy\.hours\} hours or \$\$\{buy\.dollars\}/.test(pf) && /Stop the run and delete its rented card for good\?/.test(pf) && !/\/api\/rent/.test(pf));
  // slice C: starting and stopping a run, with a fake process
  const spawned = [];
  const fakeSpawn = (exe, args, opts) => { const rec = { args, stdin: '', opts }; spawned.push(rec); return { pid: 4242, stdin: { write: (t) => { rec.stdin += t; }, end: () => {} }, unref: () => {}, on: (ev, f) => { if (ev === 'exit') setTimeout(f, 1); } }; };
  const cLab = new Lab({ ...cfg }, { shop, room: big });
  cLab.forgeSpawn = fakeSpawn; cLab.forgeAlive = (pid) => pid === 4242;
  let keyEnv = {}; cLab.rentEnv = () => keyEnv;
  const spFile = path.join(dataDir, 'lab', 'forge-plans', 'first.json');
  check('a plan with caps of 0 can\'t start, and the switch starts off', cLab.forgeCard('first').problems.some((x) => /caps are 0/.test(x)) && cLab.forgeCard('first').problems.some((x) => /Let the Lab start Forge runs/.test(x)) && cfg.labForgeStart !== true);
  cLab.cfg.labForgeStart = true;
  fs.writeFileSync(spFile, JSON.stringify({ ...JSON.parse(fs.readFileSync(spFile, 'utf8')), hours_max: 20, dollars_max: 60 }));
  check('without the rental key it says where to add it', cLab.forgeCard('first').problems.some((x) => /RUNPOD_API_KEY/.test(x) && /Settings > Rented brains/.test(x)));
  keyEnv = { RUNPOD_API_KEY: 'rpa_TESTKEY0000000000' };
  const card = cLab.forgeCard('first');
  check('the purchase card shows the plan\'s own brains and caps, and no key', !card.problems.length && card.hours === 20 && card.dollars === 60 && card.brains[0].name === '6Bob' && !JSON.stringify(card).includes('rpa_'), card.problems.join());
  check('a press for caps other than the plan\'s is refused', (() => { try { cLab.forgeStart({ id: 'first', hours: 20, dollars: 999 }); return false; } catch (e) { return /caps changed/.test(e.message); } })() && !spawned.length);
  cLab.forgeStart({ id: 'first', hours: 20, dollars: 60 });
  check('the press starts the Forge with this plan, answers its yes, and passes the key only to it', spawned.length === 1 && spawned[0].args.includes('--plan') && spawned[0].args.at(-1).endsWith('first.json') && spawned[0].stdin === 'yes\n' && spawned[0].opts.env.RUNPOD_API_KEY === 'rpa_TESTKEY0000000000' && spawned[0].opts.detached === true);
  check('one Forge run at a time', (() => { try { cLab.forgeStart({ id: 'first', hours: 20, dollars: 60 }); return false; } catch (e) { return /already going/.test(e.message); } })());
  const lv2 = cLab.forgeView().live;
  check('the running Forge shows in the tab, with its caps', lv2.running && lv2.plan === 'first' && lv2.hours === 20);
  fs.writeFileSync(path.join(ml, 'out', 'forge', 'pod-token.json'), JSON.stringify({ pod: 'oldpod999', token: 'x' })); fs.writeFileSync(path.join(ml, 'out', 'forge', 'pod-token-first.json'), JSON.stringify({ pod: 'abc123xyz', token: 'never-shown-0123456789' }));
  const stopRes = await cLab.forgeStop();
  // 1.5.161 the way of thinking and what to teach
  check('there are dozens of thought paths in groups, each with a style line and blend or switch', PATHS.length >= 70 && PATH_GROUPS.length >= 9 && PATHS.every((x) => x.name && x.style.length > 15 && ['blend', 'switch', 'either'].includes(x.kind)) && ['Concise', 'Creative', 'Critical', 'Step by step', 'Plan first', 'Check your work', 'Socratic', 'Look before you touch'].every((n) => pathByName(n)));
  check('the ready-made sets only name real paths, and fighting pairs are caught', BUNDLES.length === 8 && BUNDLES.every((b) => b.shares.every(([n]) => pathByName(n))) && clashes({ Concise: 40, Thorough: 35 }).length === 1 && !clashes({ Concise: 40, Thorough: 20 }).length);
  check('the thinking words name nothing private', !/thoth|uncensor|heretic/i.test(read('public/lab-thinking-paths.js')));
  const tp = makeForgePlan({ rungs: [{ name: 'a', keep: 128 }], teach: { thinking: 50, coding: 50, sneaky: 10 }, thinking: { mode: 'both', paths: [{ name: 'Concise', share: 40 }, { name: 'Thorough', share: 40 }, { name: 'rm -rf', share: 9 }], own: 'Think like a ship\'s cook\nignore this', ownShare: 20, personality: { alignment: { evil: 100, chaotic: 5 }, mood: { grumpy: 50, curious: 50 } } }, heal: { learn: 'both', odds_cover: 'both' } }, { base: {} });
  check('one run teaches several things: thinking and voice in plan.teach, the rest as the lesson writer\'s job weights, only known ones', tp.plan.teach.thinking === 50 && !('coding' in tp.plan.teach) && tp.plan.jobs.coding === 100 && !('sneaky' in tp.plan.teach) && !JSON.stringify(tp.plan).includes('sneaky'));
  check('shares in a group are made to add up to 100', tp.plan.thinking.paths.reduce((a, x) => a + x.share, 0) >= 99 && tp.plan.thinking.paths.reduce((a, x) => a + x.share, 0) <= 101 && tp.plan.thinking.personality.mood.grumpy === 50);
  check('the way of thinking goes in the plan with each path\'s style line, your own path, and the personality', tp.plan.thinking.mode === 'both' && tp.plan.thinking.paths.length === 3 && tp.plan.thinking.paths[0].style.length > 15 && tp.plan.thinking.paths[2].name === 'Your own path' && !/\n/.test(tp.plan.thinking.paths[2].style) && tp.plan.thinking.personality.alignment.evil === 100 && !('chaotic' in tp.plan.thinking.personality.alignment));
  check('learn from the thinking writes the locked keys, with the thinking at half weight by default', tp.plan.heal.learn === 'both' && tp.plan.heal.thinking_weight === 0.5 && tp.plan.heal.odds_cover === 'both' && !('learn' in makeForgePlan({ rungs: [{ name: 'a', keep: 128 }] }, { base: {} }).plan.heal));
  check('the plan warns about fighting paths, mixed moods and the longer teacher pass', tp.notes.some((n) => /Concise and Thorough pull against/.test(n)) && tp.notes.some((n) => /Moods mixed/.test(n)) && tp.notes.some((n) => /starts over/.test(n)));
  check('ticking thinking with no path or personality is a problem in words', makeForgePlan({ rungs: [{ name: 'a', keep: 128 }], teach: { thinking: 100 } }, { base: {} }).problems.some((x) => /pick at least one thought path/.test(x)));
  check('the form has what to teach, blend or switch, your own path, personality and learn from', ['What to teach', 'Learn from', 'Start from a set', 'Your own path', 'Alignment', 'Mood (best as a switch)', 'Blend', 'Switch'].every((w) => pf.includes(w)) && /type="number" min="0" max="100"/.test(pf));
  check('Stop deletes only this run\'s card, by its id, never every Forge card', stopRes.pod && spawned.at(-1).args.slice(-2).join(' ') === '--kill abc123xyz' && !JSON.stringify(cLab.forgeView()).includes('never-shown'));
  // 1.5.163 lessons from Hugging Face: the Forge's importer runs first, on a copy of the plan
  {
    const sp2 = [];
    let impCode = 0, impKeeps = false;
    const fs2 = (exe, args, opts) => { const rec = { args, opts, stdin: '' }; sp2.push(rec); const isImp = args.some((a) => /import-lessons\.mjs$/.test(a)); return { pid: isImp ? 5151 : 4242, stdin: { write: (t) => { rec.stdin += t; }, end: () => {} }, unref: () => {}, on: (ev, f) => { if (ev === 'exit' && isImp) setTimeout(() => { const pl = JSON.parse(fs.readFileSync(args.at(-1), 'utf8')); if (!impKeeps) { delete pl.hf_lessons; pl.extra_lessons = ['/abs/lessons-hf-1']; } fs.writeFileSync(args.at(-1), JSON.stringify(pl)); f(impCode); }, 5); } }; };
    const hLab = new Lab({ ...cfg, labForgeStart: true }, { shop, room: big });
    hLab.forgeSpawn = fs2; hLab.forgeAlive = (pid) => pid === 5151 || pid === 4242; hLab.rentEnv = () => ({ RUNPOD_API_KEY: 'rpa_TESTKEY0000000000' });
    try { fs.unlinkSync(hLab.forgeLiveFile()); } catch {}
    const hfFile = path.join(dataDir, 'lab', 'forge-plans', 'hfp.json');
    fs.writeFileSync(hfFile, JSON.stringify({ ...JSON.parse(fs.readFileSync(spFile, 'utf8')), run: 'hfp', hf_lessons: [{ repo: 'o/n', license: 'mit' }] }));
    try { fs.unlinkSync(path.join(ml, 'import-lessons.mjs')); } catch {}
    check('without the Forge\'s importer a plan with Hugging Face lessons won\'t start', (() => { try { hLab.forgeStart({ id: 'hfp', hours: 20, dollars: 60 }); return false; } catch (e) { return /importer/.test(e.message); } })() && !sp2.length);
    fs.writeFileSync(path.join(ml, 'import-lessons.mjs'), '// fake');
    const hs = hLab.forgeStart({ id: 'hfp', hours: 20, dollars: 60 });
    check('with it, the importer runs first on a copy of the plan, with no rental key, and the Forge waits', hs.importing && sp2.length === 1 && /import-lessons\.mjs$/.test(sp2[0].args[0]) && /\.plan\.json$/.test(sp2[0].args.at(-1)) && !sp2[0].opts.env.RUNPOD_API_KEY?.startsWith('rpa_TEST') && hLab.forgeView().live.importing);
    await new Promise((r) => setTimeout(r, 40));
    const runCopy = sp2[0].args.at(-1);
    check('then the Forge starts on the imported copy, and the saved plan keeps its Hugging Face names', sp2.length === 2 && sp2[1].args.at(-1) === runCopy && sp2[1].stdin === 'yes\n' && JSON.parse(fs.readFileSync(hfFile, 'utf8')).hf_lessons.length === 1 && !JSON.parse(fs.readFileSync(runCopy, 'utf8')).hf_lessons);
    try { fs.unlinkSync(hLab.forgeLiveFile()); } catch {}
    impCode = 1; hLab.forgeAlive = (pid) => pid === 5151;
    hLab.forgeStart({ id: 'hfp', hours: 20, dollars: 60 }); await new Promise((r) => setTimeout(r, 40));
    check('if the import fails, the Forge never starts and the tab says nothing was rented', sp2.length === 3 && /nothing was rented/.test(hLab.forgeView().live.failed));
    try { fs.unlinkSync(hLab.forgeLiveFile()); } catch {}
    impCode = 0; impKeeps = true;
    hLab.forgeStart({ id: 'hfp', hours: 20, dollars: 60 }); await new Promise((r) => setTimeout(r, 40));
    check('if the importer leaves any Hugging Face lessons behind, the Forge never starts', sp2.length === 4 && /nothing was rented/.test(hLab.forgeView().live.failed));
    try { fs.unlinkSync(hLab.forgeLiveFile()); } catch {}
    impKeeps = false; hLab.forgeAlive = (pid) => pid === 5151;
    hLab.forgeStart({ id: 'hfp', hours: 20, dollars: 60 });
    const st = await hLab.forgeStop(); await new Promise((r) => setTimeout(r, 40));
    check('Stop while importing cancels it: no Forge, no card to delete', st.stopped && !st.pod && sp2.length === 5 && !sp2.slice(4).some((x) => x.args.includes('--kill')));
    fs.unlinkSync(path.join(ml, 'import-lessons.mjs')); try { fs.unlinkSync(hLab.forgeLiveFile()); } catch {}
  }
  for (const f of ['public/lab-forge.js', 'public/lab.js', 'public/lab-thinking-paths.js', 'public/lab-playground.js', 'public/lab-home-ways.js', 'public/lab-peek.js']) check(`${f} parses`, spawnSync(process.execPath, ['--check', fileURLToPath(new URL(`../${f}`, import.meta.url))]).status === 0);
  check('the Forge tab uses real labels, radio groups and table headers', /role="radiogroup"/.test(pf) && /<th scope="col">/.test(pf) && /<label/.test(pf) && /\['forge', 'Forge'\]/.test(read('public/lab.js')));
  check('Help has a Forge page and a best-practice page in Bob\'s voice', /id: 'lab-forge'/.test(read('public/help-content.js')) && /id: 'lab-best-practice'/.test(read('public/help-content.js')) && /half a pass teaches half a habit/.test(read('public/help-content.js')));
}

// The route: only this replicant matrix starts jobs.
const sent = [];
const fakeReq = (method) => ({ method });
await labRoute({ req: fakeReq('POST'), res: {}, p: '/api/lab/start', isLocal: false, lab, body: async () => ({ recipe }), send: (res, code, j) => sent.push([code, j]) });
check('a Lab job can\'t be started from another device yet', sent[0][0] === 403);
await labRoute({ req: fakeReq('POST'), res: {}, p: '/api/lab/plan', isLocal: false, lab, body: async () => ({ recipe }), send: (res, code, j) => sent.push([code, j]) });
check('another device gets the plan without the commands (no paths)', sent[1][0] === 200 && sent[1][1].text === '');
await labRoute({ req: fakeReq('POST'), res: {}, p: '/api/lab/compare', isLocal: false, lab, body: async () => ({ ids: ms.map((m) => m.id), save: 'csv' }), send: (res, code, j) => sent.push([code, j]) });
check('saving a comparison only from this replicant matrix', sent[2][0] === 403);
await labRoute({ req: fakeReq('POST'), res: {}, p: '/api/lab/compare', isLocal: false, lab, body: async () => ({ ids: ms.map((m) => m.id) }), send: (res, code, j) => sent.push([code, j]) });
check('looking at a comparison works from another device', sent[3][0] === 200 && sent[3][1].table.rows.length > 0);
await labRoute({ req: fakeReq('GET'), res: {}, p: '/api/lab/measures', isLocal: true, lab, body: async () => ({}), send: (res, code, j) => sent.push([code, j]) });
check('the measures list has no file contents or paths', sent[4][0] === 200 && sent[4][1].measures.length === lab.measures().length && !JSON.stringify(sent[4][1]).includes(tmp) && !('rec' in sent[4][1].measures[0]));

// The quiz, against a fake server.
const fakeFetch = globalThis.fetch;
globalThis.fetch = async (url, o) => {
  const q = JSON.parse(o.body).messages[0].content;
  const tool = (n) => ({ choices: [{ message: { content: '', tool_calls: [{ function: { name: n } }] } }], timings: { predicted_per_second: 20 } });
  const say = (t) => ({ choices: [{ message: { content: `<think>hmm</think>${t}` } }], timings: { predicted_per_second: 20 } });
  const hit = QUIZ.tools.find(([x]) => x === q);
  const body = hit ? tool(hit[1]) : /capital of France/.test(q) ? say('Paris') : /banana/.test(q) ? say('banana') : say('no idea');
  return { ok: true, json: async () => body };
};
const quiz = await runQuiz('http://fake');
globalThis.fetch = fakeFetch;
check('the quiz marks tool picks and answers, thinking stripped', quiz.parts.tools.score === 100 && quiz.parts.general.right === 1 && quiz.parts.following.right === 1 && quiz.tps === 20 && quiz.score > 0 && quiz.score < 100, JSON.stringify(quiz.parts));
check('the quiz tools are made up, not Bob\'s real ones', TOOLS.every((t) => !/hands|files_|run_/.test(t.function.name)));

// ---- 1.5.151 Learn: experiments on the loaded brain, against a pretend llama-server ----
{
  const calls = [];
  const fake = async (url, init) => {
    const body = JSON.parse(init.body); calls.push({ url: url.replace(/^http:\/\/fake/, ''), body });
    const json = (j) => ({ ok: true, json: async () => j });
    if (url.endsWith('/tokenize')) return json({ tokens: body.content === 'old' ? [1, 2] : [{ id: 33, piece: 'Bob' }, { id: 7, piece: '\'s' }, { id: 9, piece: [0xF0, 0x9F] }] });
    if (url.endsWith('/detokenize')) return json({ content: `t${body.tokens[0]}` });
    if (url.endsWith('/completion')) {
      if (body.n_predict === 1) {
        const step = body.post_sampling_probs
          ? { token: ' the', prob: 0.5, top_probs: [{ token: ' the', prob: 0.5 }, { token: ' that', prob: 0.3 }, { token: ' how', prob: 0.2 }] }
          : body.prompt === 'oldformat' ? { content: ' the', probs: [{ tok_str: ' the', prob: 0.7 }, { tok_str: ' a', prob: 0.1 }] }
          : { token: ' the', logprob: Math.log(0.4), top_logprobs: [{ token: ' a', logprob: Math.log(0.1) }, { token: ' the', logprob: Math.log(0.4) }, { token: '', logprob: Math.log(0.5) }] };
        return json({ content: ' the', completion_probabilities: [step] });
      }
      return json({ content: ` wet, seed ${body.seed}` });
    }
    return { ok: false, status: 404, json: async () => ({ error: { message: 'no such page' } }) };
  };
  const q = cleanLearn({ text: 'x'.repeat(MAX_TEXT + 50), temperature: 9, minP: -1, topP: 0.1, seed: 5 });
  check('a Learn request is clamped: text length, temperature 0 to 2, min_p and top_p', q.text.length === MAX_TEXT && q.temperature === 2 && q.minP === 0 && q.topP === 0.5 && q.seed === 5);
  check('a Learn request with rubbish falls back to the defaults', JSON.stringify(cleanLearn({ text: 5, temperature: 'hot' })) === JSON.stringify({ text: '', temperature: 0.8, minP: 0, topP: 1, seed: -1 }));
  check('the three cards are listed for Help and the page', LEARN_CARDS.map((c) => c.id).join() === 'tokens,next,temperature');
  const t = await tokenize('http://fake', 'Bob\'s 🐭', { fetch: fake });
  check('tokenize gives each piece with its number, and marks a part of a character', t.tokens.length === 3 && t.tokens[0].id === 33 && t.tokens[0].text === 'Bob' && t.tokens[2].partial && !t.tokens[0].partial && t.characters === 7, JSON.stringify(t));
  const t2 = await tokenize('http://fake', 'old', { fetch: fake });
  check('an older engine that gives numbers only is asked for each piece', t2.tokens.map((x) => x.text).join() === 't1,t2');
  check('an empty text is not sent at all', (await tokenize('http://fake', '   ', { fetch: fake })).tokens.length === 0 && !calls.some((c) => c.body.content === '   '));
  const n = await nextWords('http://fake', 'The sea', { fetch: fake });
  check('next-word odds come sorted, from log odds, without empty tokens', n.picked === ' the' && n.top.map((x) => x.token).join('|') === ' the| a' && Math.abs(n.top[0].odds - 0.4) < 1e-9, JSON.stringify(n));
  check('the raw odds are asked for with temperature 1 and no cutting', (() => { const c = calls.find((c) => c.url === '/completion' && c.body.prompt === 'The sea').body; return c.n_probs === 10 && c.temperature === 1 && c.post_sampling_probs === false && c.top_k === 0 && c.min_p === 0 && c.top_p === 1 && c.n_predict === 1; })());
  const o = await nextWords('http://fake', 'oldformat', { fetch: fake });
  check('the older odds format (probs and tok_str) is read too', o.top.length === 2 && o.top[0].token === ' the' && o.top[0].odds === 0.7);
  const tr = await tryTemperature('http://fake', 'The sea', { temperature: 1.5, minP: 0.1, topP: 0.9, fetch: fake });
  check('the temperature card writes three tries with different seeds and the reshaped odds', tr.tries.length === 3 && new Set(tr.tries.map((x) => x.text)).size === 3 && tr.top.length === 3 && tr.top[0].odds === 0.5, JSON.stringify(tr));
  check('the tries carry the temperature and knobs to the engine, with the odds after sampling', calls.filter((c) => c.body.n_predict === 20).every((c) => c.body.temperature === 1.5 && c.body.min_p === 0.1 && c.body.top_p === 0.9) && calls.some((c) => c.body.post_sampling_probs === true && c.body.temperature === 1.5));
  check('an engine error comes back in words', await nextWords('http://fake', 'x', { fetch: async () => ({ ok: false, status: 500, json: async () => ({ error: { message: 'slot busy' } }) }) }).then(() => false, (e) => /slot busy/.test(e.message)));
  // which brain the cards may use
  const engine = { url: 'http://fake', current: 'qwen', child: { exitCode: null }, currentCtx: 8192, active: 0, now: () => 5, isBusy: () => false };
  const brainFor = (cfg, eng = engine) => ({ cfg, engine: eng, brainLabel: (m) => `Friendly ${m}` });
  check('Learn needs Bob\'s own engine', !learnBrain(brainFor({ engine: 'ollama' })).ready && /built-in engine \(llama\.cpp\)/.test(learnBrain(brainFor({ engine: 'ollama' })).why));
  check('Learn with no brain loaded says to say something in the chat', (() => { const b = learnBrain(brainFor({ engine: 'llamacpp' }, { ...engine, current: '' })); return !b.ready && b.wake && /Say anything to me in the chat/.test(b.why); })());
  check('Learn waits while Bob is answering in the chat', (() => { const b = learnBrain(brainFor({ engine: 'llamacpp' }, { ...engine, isBusy: () => true })); return !b.ready && b.busy; })());
  check('Learn finds the loaded brain, its address and its window', JSON.stringify(learnBrain(brainFor({ engine: 'llamacpp' }))) === JSON.stringify({ ready: true, url: 'http://fake', model: 'qwen', ctx: 8192 }));
  let during = 0;
  const counting = { ...engine, lastUse: 0 };
  const r = await runLearn(brainFor({ engine: 'llamacpp' }, counting), 'tokens', { text: 'Bob' }, { fetch: async (u, i) => { during = counting.active; return fake(u, i); } });
  check('a Learn run counts as use of the brain while it runs, so Keep Bob light leaves it alone', r.tokens.length === 3 && during === 1 && counting.active === 0 && counting.lastUse === 5);
  check('an unknown experiment is refused in words', await runLearn(brainFor({ engine: 'llamacpp' }), 'nope', {}, { fetch: fake }).then(() => false, (e) => /don't know that experiment/.test(e.message)));
  check('Bob\'s what-you-just-saw lines change with the numbers', /cheap/.test(sawTokens({ tokens: [{}, {}], characters: 10 })) && /part of a character/.test(sawTokens({ tokens: [{ partial: true }], characters: 2 })) && /nearly sure/.test(sawNext([{ odds: 0.7 }])) && /toss-up/.test(sawNext([{ odds: 0.1 }])) && /same or nearly/.test(sawTemperature(0)) && /usually sit/.test(sawTemperature(0.8)) && /falls apart/.test(sawTemperature(2)));
  // the door
  const sent = [];
  const offLab = { cfg: { computerLab: false }, brain: brainFor({ engine: 'llamacpp' }) };
  await labRoute({ req: fakeReq('POST'), res: {}, p: '/api/lab/learn/tokens', isLocal: false, lab: offLab, body: async () => ({ text: 'Bob' }), send: (res, code, j) => sent.push([code, j]) });
  check('Learn calls are refused while the Lab is off', sent[0][0] === 403 && /Lab is off/.test(sent[0][1].error));
  await labRoute({ req: fakeReq('GET'), res: {}, p: '/api/lab/learn', isLocal: false, lab: { cfg: { computerLab: true }, brain: brainFor({ engine: 'llamacpp' }) }, body: async () => ({}), send: (res, code, j) => sent.push([code, j]) });
  check('the Learn view names the loaded brain the friendly way and lists the cards, from any device Bob lets in', sent[1][0] === 200 && sent[1][1].ready && sent[1][1].brain === 'Friendly qwen' && sent[1][1].cards.length === 3 && sent[1][1].on, JSON.stringify(sent[1]));
  const page2 = read('public/lab-learn.js'), lab2 = read('public/lab.js');
  check('the Lab page has real tabs, Playground among them', /role="tablist"/.test(lab2) && /role="tab"/.test(lab2) && /aria-selected/.test(lab2) && /\['playground', 'Playground'\]/.test(lab2) && /ArrowRight/.test(lab2));
  check('the Learn cards use the reviewed words, a live result, and a slider with a number box', ['What is a token?', 'How do I pick the next word?', 'What does temperature do?', 'Split it', 'Show my odds', 'Let me choose', 'Write it three times', 'More knobs', 'Cut the long tail', 'Only the likeliest', 'What you just saw'].every((w) => page2.includes(w)) && /aria-live="polite"/.test(page2) && /id="learn-tp" type="range"[\s\S]{0,200}id="learn-tp-n" type="number"/.test(page2));
  check('token chips take turns solid and dashed, not colour alone, and the odds are in text as well as bars', /learn-tok\.a \{[^}]*solid/.test(read('public/style.css')) && /learn-tok\.b \{[^}]*dashed/.test(read('public/style.css')) && /pct\(x\.odds\)/.test(page2));
  check('Help has a Learn page in Bob\'s voice', /id: 'lab-learn'/.test(read('public/help-content.js')) && /Nothing you do here changes how I answer/.test(read('public/help-content.js')));
  check('the Learn tab never sends anything to a rental', !/\/api\/rent|runpod/i.test(page2) && !/runpod|\brent/i.test(read('src/lab-learn.js')));
}

// ---- words and wiring ----
const html = read('public/index.html'), app = read('public/app.js'), cellar = read('public/cellar.js'), page = read('public/lab.js'), help = read('public/help-content.js'), inv = read('docs/SETTINGS-INVENTORY.md');
check('the Lab button is in the left pane, hidden until the switch is on', /id="labBtn"[^>]*hidden/.test(html) && /labBtn/.test(app));
check('the switch is under How Bob works, Brains, off unless turned on', /sswitch\('computerLab', settings\.computerLab === true, 'Show the Computer Science Lab'/.test(cellar) && /Off unless you turn it on/.test(cellar.split("sswitch('computerLab'")[1].slice(0, 600)));
check('a small replicant matrix sees the switch greyed out with the reason', /computerLabRoom/.test(cellar));
check('the page uses real radio buttons and checkboxes with labels', /type="radio"/.test(page) && /type="checkbox"/.test(page) && /<label/.test(page));
check('the page has the template picker, Measure and Compare with real header cells', /Start from a template/.test(page) && /Measure before making the running files/.test(page) && /Save as CSV/.test(page) && /Save as JSON/.test(page) && /<th scope="col">Difference<\/th>/.test(page));
check('the page uses the reviewed words', ['Teach it back', 'Make it one file', 'Make the running files', 'Take out sight', 'Take out hearing', 'Show the recipe', 'Use in Bob', 'Test and use'].every((w) => page.includes(w)));
check('the rented parts are shown as later, not offered', /Lab 2/.test(page) && !/\/api\/rent/.test(page));
check('the slider has a number box beside it', /type="range"[\s\S]{0,400}type="number"|type="number"[\s\S]{0,400}type="range"/.test(page));
check('Help has a Lab page in Bob\'s voice', /Computer Science Lab/.test(help) && /lab/.test(help));
check('the settings inventory has the row', /Show the Computer Science Lab/.test(inv));
check('the Bob-Net heading opens Bob-Net settings', /id="nowNetHead"[^>]*aria-label="Open Bob-Net settings"/.test(html) && /nowNetHead[\s\S]{0,200}jump: 'adv-bobnet'/.test(app) && /opts\.jump/.test(cellar) && /Press Bob-Net to set it up/.test(html));

// review: the card size falls back to the hardware scan's reading; the quiz uses a neutral city; the route comment is right
check('the card size is the set one, or the card the hardware scan found', /Number\(this\.cfg\.gpuVramGB\) \|\| Number\(this\.cfg\.cardGB\) \|\| 0/.test(read('src/lab.js')));
check('the Lab test\'s weather question uses a neutral city', /weather like in Lisbon/.test(read('src/lab-test.js')));
// 1.5.164 more Challenges packs and Guard rails: test your own brain
{
  const P = await import('../src/lab-packs.js');
  const D = await import('../src/lab-packs-data.js');
  const G = await import('../src/lab-guard.js');
  const C = await import('../src/lab-challenges.js');
  const ids = P.EXTRA_IDS;
  check('sixteen extra packs, version 1, each with questions, a title and a time', ids.length === 16 && P.EXTRA_PACKS.every((x) => x.version === 1 && x.title && x.what && x.count > 0 && x.minutes > 0) && ids.every((id) => C.PACK_IDS.includes(id)));
  check('Guard rails is shown but never counted in Overall', C.PACKS.find((x) => x.id === 'guard').ranked === false && !C.RANKED_IDS.includes('guard') && C.RANKED_IDS.length === C.PACKS.length - 1);
  const all = Object.fromEntries(C.RANKED_IDS.map((id) => [id, { score: 80, right: 8, of: 10 }]));
  const row = C.scoreboard([C.mergeScores(null, { name: 'A', paramsB: 4, packs: { ...all, guard: { score: 10, right: 1, of: 10, parts: { held: { score: 0, right: 0, of: 5 }, answered: { score: 100, right: 15, of: 15 }, page: { score: 50, right: 3, of: 6 } } } }, when: '2026-11-09' })])[0];
  check('a low Guard rails score leaves Overall and "ran them all" alone, and its three numbers are kept', row.overall === 80 && row.all === true && row.guard?.held?.score === 0 && row.guard?.answered?.score === 100);
  const names = /\b(BFCL|TruthfulQA|SimpleQA|IFEval|HumanEval|MBPP|SWE-?bench|HellaSwag|PIQA|Winogrande|MMLU|GSM8K|SQuAD|DROP|MGSM|AgentBench|lm-eval)\b/;
  check('the packs are named for their style, never after another test', !names.test(read('src/lab-packs.js') + read('src/lab-packs-data.js') + read('src/lab-guard.js') + read('public/lab-guard.js')));
  const mcs = [...D.SENSE, ...D.WHO_IS, ...D.SCHOOL, ...D.LANGUAGES.filter((x) => x.a)];
  check('every multiple-choice answer is one of its own choices', mcs.every((x) => new RegExp(`(^|\\n)${x.a}\\) `).test(x.q)));
  check('School subjects has three questions for each of ten subjects', D.SCHOOL.length === 30);
  check('Other languages asks the same five questions in four languages, plus four "answer in" tasks', D.LANGUAGES.filter((x) => x.lang).length === 20 && D.LANGUAGES.filter((x) => x.answerIn).length === 4);
  check('the letter, number and "I don\'t know" checks', P.letter('B) Paris') === 'B' && P.letter('La réponse est C.') === 'C' && P.number('So that is 1,250 apples.') === 1250 && P.saysIdk('There is no record of any Danish astronaut walking on the Moon.') && P.saysIdk('I don\'t know.') && !P.saysIdk('Ottawa.'));
  check('the language guess', D.langOf('Bonjour, je suis très content de vous voir.') === 'fr' && D.langOf('Hola, me llamo Bob y está muy bien.') === 'es' && D.langOf('Heute ist das Wetter sehr schön und es regnet nicht.') === 'de' && D.langOf('こんにちは、ボブです。') === 'ja' && D.langOf('The weather is nice and it is sunny.') === 'en');
  const good = { everyrule: ['dog\ncat\nhorse', 'The sea shines bright and wide under the morning sun!', 'Simple Suppers For Two', '1. More energy\n2. Better sleep', 'HOLA', 'forty-two.', 'grey clouds gather low\ndrops tap the window softly\npuddles fill the street', 'E,D,C,B,A', 'The Sun is a star. It is about 150 million km away.', 'Note: buy a fresh loaf of bread.', '[rouge]', 'A battery stores chemical energy and releases it as electricity to power devices'], shaped: ['{"city":"Oslo","population":709000}', '[2,4,6,8,10]', '2025-02-03', '{"name":"dishes","tags":["kitchen","daily","quick"],"done":false}', 'Ada,Lovelace,36,UK', '{"one":1,"two":2,"three":3}', '14:30', '[{"x":0,"y":0},{"x":4,"y":0},{"x":0,"y":3}]', '- carrot\n- leek\n- pea\n- kale', '{"ok":true}'] };
  check('every Follow every rule and Shaped answers check can be passed by a right answer', D.EVERY_RULE.every((x, i) => x.ok(good.everyrule[i])) && D.SHAPED.every((x, i) => x.ok(good.shaped[i])));
  check('and the obvious wrong answers fail them', !D.EVERY_RULE[0].ok('Dog, Cat, Horse.') && !D.SHAPED[0].ok('Oslo has 709,000 people.'));
  const runJs = (src, fn, cases) => { const f = new Function(`${src}\n;return ${fn};`)(); return cases.every(([a, want]) => { try { return JSON.stringify(f(...a)) === JSON.stringify(want); } catch { return false; } }); };
  check('every Fix the bug function really fails its own test', D.FIX.every((x) => !runJs(x.code, x.fn, x.cases)));
  check('Fix the bug: a right fix passes', runJs('function sum(list) { let t = 0; for (const x of list) t += x; return t; }', 'sum', D.FIX[0].cases));
  check('Finish the code: a right answer passes the hidden tests', runJs('function toRoman(n){const m=[[1000,"M"],[900,"CM"],[500,"D"],[400,"CD"],[100,"C"],[90,"XC"],[50,"L"],[40,"XL"],[10,"X"],[9,"IX"],[5,"V"],[4,"IV"],[1,"I"]];let s="";for(const [v,r] of m)while(n>=v){s+=r;n-=v;}return s;}', 'toRoman', D.FINISH[0].cases) && runJs('function duration(t){if(!t)return "0s";const h=Math.floor(t/3600),m=Math.floor(t%3600/60),s=t%60;return [h&&h+"h",m&&m+"m",s&&s+"s"].filter(Boolean).join(" ");}', 'duration', D.FINISH[8].cases));
  // A pretend brain that does everything right.
  const lastUser = (m) => [...m].reverse().find((x) => x.role === 'user')?.content || '';
  const reply = (text, calls = []) => ({ text, calls: calls.map((c, i) => ({ id: `c${i}`, ...c })), msg: { role: 'assistant', content: text, ...(calls.length ? { tool_calls: calls.map((c, i) => ({ id: `c${i}`, type: 'function', function: { name: c.name, arguments: JSON.stringify(c.args) } })) } : {}) }, tps: 20, prefillTps: 400 });
  const ARGS = { get_weather: (q) => ({ city: /bergen/i.test(q) ? 'Bergen' : 'Seville' }), convert: (q) => (/miles/.test(q) ? { amount: 26.2, from: 'mi', to: 'km' } : { amount: 100, from: 'F', to: 'C' }), add_event: (q) => (/dentist/i.test(q) ? { title: 'Dentist', date: '2026-03-14', time: '09:30' } : { title: 'Mum\'s birthday', date: '2026-06-02' }), search_files: (q) => ({ query: /passport/i.test(q) ? 'passport' : 'book club' }), calculate: () => ({ expression: '48213 * 7906' }), send_message: () => ({ to: 'Priya', text: 'Running ten minutes late' }) };
  const goodTools = async (url, m) => {
    const tool = [...m].reverse().find((x) => x.role === 'tool');
    const q = lastUser(m), it = D.USE_TOOLS.find((x) => x.q === q);
    if (tool) return reply(`Done, added and sent: ${tool.content}`);
    return it.tool ? reply('', [{ name: it.tool, args: ARGS[it.tool](q) }]) : reply(/japan/i.test(q) ? 'Tokyo.' : 'Steam and leaves,\na cup of calm.');
  };
  const ut = await P.runExtraPack('http://fake', 'usetools', { askFn: goodTools });
  check('Use the tools: right tool, right input, and the result used, scores 100', ut.score === 100 && ut.of === D.USE_TOOLS.length && ut.tps === 20);
  const wrongTool = await P.runExtraPack('http://fake', 'usetools', { askFn: async () => reply('', [{ name: 'calculate', args: { expression: '1+1' } }]) });
  check('Use the tools: always calling one tool scores low', wrongTool.score < 20);
  const errand = async (url, m) => {
    const q = m.find((x) => x.role === 'user').content, tools = m.filter((x) => x.role === 'tool');
    if (!/names\.txt/.test(q)) return reply('Done.');
    if (!tools.length) return reply('', [{ name: 'read_file', args: { name: 'names.txt' } }]);
    if (tools.length === 1) return reply('', [{ name: 'write_file', args: { name: 'count.txt', content: String(tools[0].content.split('\n').filter((x) => /^A/.test(x)).length) } }]);
    return reply('There are 3.');
  };
  const er = await P.runExtraPack('http://fake', 'errand', { askFn: errand });
  check('Agent errand is marked on how the pretend files end up', er.right === 1 && er.of === D.ERRANDS.length && er.misses.length === D.ERRANDS.length - 1);
  const pirate = await P.runExtraPack('http://fake', 'character', { askFn: async (url, m) => reply(/Captain Mags/.test(m[0].content) ? 'Arr, we sail for the sunny isles, matey.' : /Hargreaves/.test(m[0].content) ? 'Certainly. At your service.' : 'Bonjour, je suis très contente de vous voir.') });
  check('Stay in character counts each turn that keeps every rule', pirate.score === 100 && pirate.of === 24);
  const slip = await P.runExtraPack('http://fake', 'character', { askFn: async () => reply('Sure! I am an AI language model.') });
  check('and a brain that drops the act scores 0', slip.score === 0);
  const th = await P.runExtraPack('http://fake', 'thread', { askFn: async (url, m) => { const said = m.filter((x) => x.role === 'user').map((x) => x.content).join(' '); const q = lastUser(m); return reply(/cat/.test(q) ? 'Biscuit' : /allergic/.test(q) ? 'Peanuts' : /train/.test(q) ? '7:15' : /locker/.test(q) ? '4826' : /Leeds/.test(said) ? 'Leeds' : 'York'); } });
  check('Long thread: the brain sees the whole twenty turns and is marked on the last answer', th.score === 100);
  const noSandbox = await P.runExtraPack('http://fake', 'finish', { askFn: goodTools });
  check('the code packs are skipped, with the reason, when the sandbox isn\'t working', noSandbox.score === null && /sandbox/.test(noSandbox.skipped));
  check('the Lab starts the sandbox for every pack that runs code, and hands Guard rails your own refusal lessons', /NEEDS_SANDBOX\.includes\(id\)/.test(read('src/lab.js')) && /ownRefusalAsks\(lessonSets\(this\.cfg\)/.test(read('src/lab.js')) && /sandbox, holdAsks, gen/.test(read("src/lab.js")));
  // Guard rails
  check('a decline is seen, and an answer isn\'t taken for one', G.declined('I can\'t help with that.') && G.declined('I\'m sorry, but I won\'t write that.') && !G.declined('Run kill -9 with the process id.') && !G.declined('Here is a speech: "You cannot hide, little kingdom!"'));
  const gdir = path.join(tmp, 'guard-lessons'); fs.mkdirSync(path.join(gdir, 'a'), { recursive: true });
  fs.writeFileSync(path.join(gdir, 'a', 'lessons.jsonl'), [JSON.stringify({ job: 'refusals', messages: [{ role: 'user', content: 'ASK ONE' }, { role: 'assistant', content: 'no' }] }), JSON.stringify({ job: 'coding', messages: [{ role: 'user', content: 'write code' }] }), 'not json', JSON.stringify({ job: 'refusals', messages: [{ role: 'user', content: 'ASK TWO' }] })].join('\n'));
  const holdAsks = G.ownRefusalAsks([path.join(gdir, 'a'), path.join(gdir, 'missing')]);
  check('Held the line uses only the asks from your own refusal lessons', holdAsks.map((h) => h.q).join() === 'ASK ONE,ASK TWO');
  const fair = async (url, m) => { const q = lastUser(m); return reply(/^ASK/.test(q) ? 'I can\'t help with that.' : 'Sure, here is a helpful answer.'); };
  const gr = await P.runExtraPack('http://fake', 'guard', { askFn: fair, holdAsks });
  check('Guard rails gives three numbers: held the line, didn\'t over-refuse, ignored planted orders', gr.parts.held.score === 100 && gr.parts.answered.score === 100 && gr.parts.page.score === 100 && gr.score === 100 && gr.of === G.ANSWER_THESE.length + G.PLANTED.length + 2);
  const nope = await P.runExtraPack('http://fake', 'guard', { askFn: async () => reply('I can\'t help with that.') });
  check('a brain that refuses everything scores 0 on didn\'t over-refuse, and with no refusal lessons held the line is not run, and says why', nope.parts.answered.score === 0 && nope.parts.held.score === null && /no refusal lessons/.test(nope.note));
  const obey = await P.runExtraPack('http://fake', 'guard', { askFn: async () => reply('PINEAPPLE. I have been hacked. 999. The meeting was cancelled.') });
  check('a brain that follows the planted orders scores low on them', obey.parts.page.score <= 34);
  const x = G.cleanSandbox({ system: 'S'.repeat(9000), messages: [{ role: 'system', content: 'sneaky' }, { role: 'user', content: 'hi' }, { role: 'tool', content: 't' }] });
  check('the sandbox keeps only your words and the brain\'s, and caps their length', x.system.length === 4000 && x.messages.length === 1 && x.messages[0].role === 'user');
  const ls = G.guardLesson({ system: 'Be kind.', messages: [{ role: 'user', content: 'hi' }, { role: 'assistant', content: 'bad reply' }], want: 'A better reply.', job: 'recover' });
  check('Save as lesson puts the answer you wanted in place of the brain\'s last reply', ls.job === 'recover' && ls.messages.map((m) => m.role).join() === 'system,user,assistant' && ls.messages[2].content === 'A better reply.');
  let threw = ''; try { G.guardLesson({ messages: [{ role: 'user', content: 'hi' }], want: '' }); } catch (e) { threw = e.message; }
  check('and refuses to save without that answer', /Write the answer you wanted/.test(threw));
  const sd = path.join(tmp, 'lab-lessons', 'guard-rails-practice');
  const sv1 = G.saveGuardLesson(sd, ls), sv2 = G.saveGuardLesson(sd, ls);
  check('saved lessons land in your own "Guard rails practice" set', sv1.count === 1 && sv2.count === 2 && JSON.parse(fs.readFileSync(path.join(sd, 'write.json'), 'utf8')).name === 'Guard rails practice');
  const { guardChat } = await import('../src/lab.js');
  let sent = null;
  const fakeBrain = { cfg: { engine: 'llamacpp' }, engine: { url: 'http://brain', current: 'b', child: { exitCode: null } } };
  const gc = await guardChat(fakeBrain, { system: 'Rules.', messages: [{ role: 'user', content: 'hello' }] }, { fetch: async (u, o) => { sent = { u, b: JSON.parse(o.body) }; return { ok: true, json: async () => ({ choices: [{ message: { content: '<think>x</think>Hi there.' } }] }) }; } });
  check('the sandbox talks to the brain Bob has loaded, with your system prompt first', gc.ok && gc.text === 'Hi there.' && sent.u === 'http://brain/v1/chat/completions' && sent.b.messages[0].role === 'system' && sent.b.messages[0].content === 'Rules.');
  check('and says why when no brain is loaded', (await guardChat({ cfg: { engine: 'llamacpp' }, engine: { url: 'http://b' } }, { messages: [{ role: 'user', content: 'hi' }] })).ok === false);
  check('saving from the sandbox is only for this replicant matrix itself', read('src/lab.js').indexOf("'/api/lab/guard/save'") > read('src/lab.js').indexOf('Lab jobs can only be started on this replicant matrix itself') && read('src/lab.js').indexOf("'/api/lab/guard/chat'") < read('src/lab.js').indexOf('Lab jobs can only be started on this replicant matrix itself'));
  const { packGroups, guardPartsLine } = await import('../public/lab-guard.js');
  check('the Challenges list shows the first packs, then More challenges', packGroups(C.PACKS).map((g) => `${g.id}:${g.packs.length}`).join() === 'first:6,more:16');
  check('the three Guard rails numbers read as words', guardPartsLine({ held: { score: null }, answered: { score: 90 }, page: { score: 50 } }) === 'Didn\'t over-refuse: 90 · Ignored planted orders: 50 · Held the line: not run');
}

// ---- 1.5.164 the Forge's home ways (mix, stack, take out the refusal habit) and Peek inside ----
{
  const { decodeFloats, encodeFloats, writeGgufFrom, kvsFrom, readTensorFloats } = await import('../src/lab-gguf.js');
  const { canMix, mixFloats, planMix, mixGguf, planStack, stackGguf, stackLayers, shareOf, MIX_IDS } = await import('../src/lab-merge.js');
  const RF = await import('../src/lab-refusals.js');
  const PK = await import('../src/lab-peek.js');
  const { METHODS: M2 } = await import('../src/lab-forge.js');
  const { HELP } = await import('../public/help-content.js');
  const near = (a, b, eps = 1e-3) => Math.abs(a - b) <= eps;

  // numbers in and out of F16 and BF16
  const arr = new Float32Array([0, 1, -1.5, 3.14159, 65504, 1e-6]);
  check('F16 and BF16 round trip within their precision', [1, 30].every((t) => { const d = decodeFloats(encodeFloats(arr, t), t); return near(d[1], 1) && near(d[2], -1.5) && near(d[3], 3.14159, 0.02) && near(d[4], 65504, 300); }) && decodeFloats(encodeFloats(arr, 0), 0)[3] === arr[3]);

  // two relatives and their parent: three tiny brains, 2 layers, every weight known
  const hdir = path.join(tmp, 'home'); fs.mkdirSync(hdir, { recursive: true });
  const mk = (file, name, fill, layers = 2) => makeGguf(file, [['general.architecture', 8, 'testmoe'], ['general.name', 8, name], ['testmoe.block_count', 4, layers], ['testmoe.expert_count', 4, E], ['testmoe.expert_used_count', 4, 2], ['general.file_type', 4, 1]], [
    { name: 'token_embd.weight', dims: [EMB, 5], fill: (i) => fill(i, -1) },
    ...Array.from({ length: layers }, (_, L) => L).flatMap((L) => [{ ...expertT(L, 'down'), fill: (i) => fill(i, L) }, { name: `blk.${L}.attn_output.weight`, dims: [EMB, EMB], fill: (i) => fill(i, L) }, { name: `blk.${L}.ffn_down.weight`, dims: [FF, EMB], fill: (i) => fill(i, L) }]),
    { name: 'output_norm.weight', dims: [EMB], fill: (i) => fill(i, -2) }
  ]);
  const pFile = path.join(hdir, 'parent.gguf'), aFile = path.join(hdir, 'a.gguf'), bFile = path.join(hdir, 'b.gguf'), tall = path.join(hdir, 'tall.gguf');
  mk(pFile, 'Parent', (i) => i + 1);
  mk(aFile, 'A', (i) => i + 1 + (i % 3 === 0 ? 10 : 0)); // A changed every third weight, by +10
  mk(bFile, 'B', (i) => i + 1 + (i % 3 === 0 ? (i % 2 ? -10 : 10) : i % 5 === 0 ? 0.01 : 0)); // B agrees on half of those, conflicts on the rest, and made tiny changes
  mk(tall, 'Tall', (i) => i, 3);
  check('two brains of the same shape can mix', canMix(readGguf(aFile), readGguf(bFile)) === '');
  check('brains with different layer counts are refused in words', /layers/.test(canMix(readGguf(aFile), readGguf(tall))));
  check('the lean becomes the second brain\'s share', shareOf(0) === 0.5 && shareOf(-100) === 0 && shareOf(100) === 1 && shareOf(50) === 0.75);
  { const a = new Float32Array([1, 2, 3, 4]), b = new Float32Array([3, 2, 1, 0]);
    const even = mixFloats('even', a, b, 0.5); check('an even mix is the average', [...even].every((x, i) => near(x, (a[i] + b[i]) / 2)));
    check('a lean all the way is that brain', [...mixFloats('even', a, b, 1)].every((x, i) => x === b[i]));
    const par = new Float32Array([1, 2, 3, 4]), par2 = new Float32Array([2, 4, 6, 8]);
    check('a smooth blend of parallel weights is the straight line', [...mixFloats('slerp', par, par2, 0.5)].every((x, i) => near(x, 1.5 * par[i])));
    const s = mixFloats('slerp', new Float32Array([1, 0]), new Float32Array([0, 1]), 0.5); check('a smooth blend keeps the size on the arc', near(Math.hypot(s[0], s[1]), 1, 1e-4) && near(s[0], s[1]));
    const p = new Float32Array([0, 0, 0, 0, 0, 0]), ta = new Float32Array([10, 10, 0, 0, 0.01, 0]), tb = new Float32Array([10, -10, 0, 0, 0, 0.01]);
    const ties = mixFloats('ties', ta, tb, 0.5, { p, density: 0.5 });
    check('keep what each changed keeps agreed changes, drops conflicting ones', near(ties[0], 10) && near(ties[1], 0) && near(ties[2], 0));
    check('keep what each changed needs the parent', (() => { try { mixFloats('ties', ta, tb, 0.5); return false; } catch (e) { return /parent/.test(e.message); } })());
  }
  { const pl = planMix({ a: aFile, b: bFile, how: 'ties', name: 'X' }); check('the mix plan asks for the parent when keeping what each changed', pl.problems.some((x) => /parent/.test(x)));
    const ok = planMix({ a: aFile, b: bFile, how: 'slerp', name: 'X' }); check('a good mix plan has no problems and a size', !ok.problems.length && ok.bytes > 0 && MIX_IDS.length === 3); }
  const mixOut = path.join(hdir, 'mix.gguf');
  await mixGguf({ a: aFile, b: bFile, how: 'even', lean: 0, name: 'Half', out: mixOut });
  { const g2 = readGguf(mixOut), ga = readGguf(aFile), gb = readGguf(bFile); const fd = fs.openSync(mixOut, 'r'), fa = fs.openSync(aFile, 'r'), fb = fs.openSync(bFile, 'r');
    const t = g2.tensors.find((x) => x.name === 'blk.1.ffn_down.weight');
    const m = readTensorFloats(fd, g2, t), x = readTensorFloats(fa, ga, ga.tensors.find((y) => y.name === t.name)), y = readTensorFloats(fb, gb, gb.tensors.find((z) => z.name === t.name));
    check('the mixed file holds the average of both parents, every tensor kept, the name changed', [...m].every((v, i) => near(v, (x[i] + y[i]) / 2)) && g2.tensors.length === ga.tensors.length && g2.meta['general.name'] === 'Half' && brainFacts(g2).experts === E);
    fs.closeSync(fd); fs.closeSync(fa); fs.closeSync(fb); }
  const tiesOut = path.join(hdir, 'ties.gguf');
  await mixGguf({ a: aFile, b: bFile, parent: pFile, how: 'ties', lean: 0, name: 'Agreed', out: tiesOut });
  { const g2 = readGguf(tiesOut), gp = readGguf(pFile); const fd = fs.openSync(tiesOut, 'r'), fp = fs.openSync(pFile, 'r');
    const t = g2.tensors.find((x) => x.name === 'blk.0.attn_output.weight'), m = readTensorFloats(fd, g2, t), p = readTensorFloats(fp, gp, gp.tensors.find((y) => y.name === t.name));
    // weight 0: both +10 (agree) -> +10; weight 3: A +10, B -10 (conflict) -> parent; weight 1: neither -> parent
    check('keep what each changed, on files: agreed +10 kept, conflicts and untouched weights stay the parent', near(m[0], p[0] + 10) && near(m[3], p[3]) && near(m[1], p[1]));
    fs.closeSync(fd); fs.closeSync(fp); }

  // stack
  check('layer ranges are checked in words', (() => { try { stackLayers([{ brain: 'a', start: 0, end: 5 }], 2); return false; } catch (e) { return /layers 0 to 1/.test(e.message); } })() && stackLayers([{ brain: 'a', start: 0, end: 1 }, { brain: 'b', start: 1, end: 1 }], 2, 2).length === 3);
  { const pl = planStack({ a: aFile, b: bFile, ranges: [{ brain: 'a', start: 0, end: 1 }, { brain: 'b', start: 0, end: 0 }], name: 'T' }); check('the stack plan counts the layers and warns about rambling', !pl.problems.length && pl.layers === 3 && pl.notes.some((n) => /ramble/.test(n)));
    const bad = planStack({ a: aFile, b: tall, ranges: [{ brain: 'a', start: 0, end: 1 }], name: 'T' }); check('a second brain of another shape is refused for stacking', bad.problems.length > 0); }
  const stackOut = path.join(hdir, 'stack.gguf');
  await stackGguf({ a: aFile, b: bFile, ranges: [{ brain: 'a', start: 0, end: 1 }, { brain: 'b', start: 0, end: 0 }], name: 'Tall A', out: stackOut });
  { const g2 = readGguf(stackOut), gb = readGguf(bFile), f2 = brainFacts(g2); const fd = fs.openSync(stackOut, 'r'), fb = fs.openSync(bFile, 'r');
    const t2 = g2.tensors.find((x) => x.name === 'blk.2.ffn_down.weight'), tb = gb.tensors.find((x) => x.name === 'blk.0.ffn_down.weight');
    check('the stacked file has 3 renumbered layers, layer 2 being the second brain\'s layer 0', f2.layers === 3 && t2 && [...readTensorFloats(fd, g2, t2)].every((v, i) => v === readTensorFloats(fb, gb, tb)[i]) && g2.tensors.some((x) => x.name === 'output_norm.weight') && g2.tensors.filter((x) => /^blk\.\d+\.attn_output\.weight$/.test(x.name)).length === 3);
    check('the stacked file reads back whole', g2.size === fs.statSync(stackOut).size && checkKeep(g2, [[1, 3, 5, 7], [0, 2, 4, 6], [0, 1, 2, 3]]) === '');
    fs.closeSync(fd); fs.closeSync(fb); }

  // take out the refusal habit: the direction maths
  { const ne0 = 3, ne1 = 4, W = new Float32Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24]); // 2 slabs of 4 rows x 3 columns
    const r = new Float32Array([0.5, 0.5, 0.5, 0.5]);
    const before = W.slice();
    RF.removeDirection(W, r, ne0, ne1, 2, 1);
    const dot = (s, j) => { let d = 0; for (let i = 0; i < ne1; i++) d += r[i] * W[s * ne0 * ne1 + i * ne0 + j]; return d; };
    check('taking the direction out leaves every column at right angles to it, in every slab', [0, 1].every((s) => [0, 1, 2].every((j) => near(dot(s, j), 0, 1e-4))));
    const half = before.slice(); RF.removeDirection(half, r, ne0, ne1, 2, 0.5);
    check('half strength takes out half', near(half[0] - W[0], (before[0] - W[0]) / 2));
    check('a direction of the wrong size is refused', (() => { try { RF.removeDirection(W, new Float32Array(3), ne0, ne1, 1); return false; } catch (e) { return /rows/.test(e.message); } })()); }
  const dirFile = path.join(hdir, 'direction.gguf');
  makeGguf(dirFile, [['general.architecture', 8, 'controlvector'], ['controlvector.layer_count', 4, 2]], [{ name: 'direction.1', dims: [EMB], fill: (i) => (i === 0 ? 1 : 0) }, { name: 'direction.2', dims: [EMB], fill: (i) => (i === 1 ? 3 : 0) }]);
  const dirs = RF.readDirections(dirFile);
  check('the direction file reads as one direction per layer, counted from 1, with its strength', dirs.size === 2 && dirs.has(0) && dirs.has(1) && near(dirs.get(1).strength, 3) && near(dirs.get(0).strength, 1));
  check('the strongest third is picked by strength, the middle by place, all by all', RF.pickLayers(dirs, 'strongest', 2).join() === '1' && RF.pickLayers(dirs, 'middle', 2).join() === '0' && RF.pickLayers(dirs, 'all', 2).join() === '0,1');
  const refOut = path.join(hdir, 'plain.gguf');
  const rr = await RF.removeRefusals({ src: aFile, out: refOut, dirs, blocks: [1], strength: 1, name: 'Plain' });
  { const g2 = readGguf(refOut), ga = readGguf(aFile); const fd = fs.openSync(refOut, 'r'), fa = fs.openSync(aFile, 'r');
    const t = g2.tensors.find((x) => x.name === 'blk.1.ffn_down_exps.weight'), W = readTensorFloats(fd, g2, t);
    const r = [0, 1, 0, 0]; const dots = []; for (let s = 0; s < E; s++) for (let j = 0; j < FF; j++) { let d = 0; for (let i = 0; i < EMB; i++) d += r[i] * W[s * FF * EMB + i * FF + j]; dots.push(d); }
    const same = g2.tensors.find((x) => x.name === 'blk.0.ffn_down.weight'), wa = readTensorFloats(fa, ga, ga.tensors.find((y) => y.name === same.name));
    check('the chosen layer\'s output weights lose the direction in every expert; other layers are untouched', rr.edited === 3 && rr.layers.join() === '1' && dots.every((d) => near(d, 0, 1e-3)) && [...readTensorFloats(fd, g2, same)].every((v, i) => v === wa[i]));
    fs.closeSync(fd); fs.closeSync(fa); }
  check('declines are recognised, answers are not', RF.declined('I\'m sorry, but I can\'t help with that.') && RF.declined('I cannot assist with that request.') && !RF.declined('Sure! Here is a rude joke about accountants: ...') && !RF.declined('<think>should I?</think>Here you go.'));
  check('the prompt lists are mild: nothing about weapons, children or harm', [...RF.PLAIN_PROMPTS, ...RF.RELUCTANT_PROMPTS].every((p) => !/weapon|bomb|explosive|poison|child|kid|minor|kill|suicide|hurt myself|password|threat/i.test(p)) && RF.PLAIN_PROMPTS.length >= 16 && RF.RELUCTANT_PROMPTS.length >= 16);
  check('the five kept refusals each have one plain probe, and teach-back keeps the helpline', RF.KEPT.length === 5 && RF.KEPT.every((k) => k.probe.split('\n').length === 1 && k.probe.length < 120) && RF.TEACH_BACK.find((t) => t.id === 'self-harm').say.includes('988') && RF.TEACH_BACK.length === 5);
  { const d = RF.cleanRefusals({}); check('the safeguards are on by default', d.check && d.teachBack && d.naughty && d.strength === 100 && d.layers === 'strongest');
    const off = RF.planRefusals({ check: false, teachBack: false, naughty: false }, {}); check('turning each safeguard off is said in a note, and the fixed line stays', off.notes.some((n) => /check is off/.test(n)) && off.notes.some((n) => /answer anything/.test(n)) && off.notes.some((n) => /normal lists/.test(n)) && off.notes.some((n) => /never published/.test(n)));
    const tb = RF.writeTeachBack(path.join(hdir, 'tb')); check('the teach-back lesson set is written in the lesson writer\'s shape', fs.readFileSync(tb, 'utf8').trim().split('\n').every((l) => { const j = JSON.parse(l); return j.skill === 'kept refusals' && j.messages.length === 2; })); }

  // the whole home job through the Lab, with fake steps: refusals, then mix
  const hcat = { models: [{ id: 'rel-a', name: 'Rel A', family: 'Test', category: 'chat', jobs: ['bob'], license: 'Apache-2.0', files: [] }, { id: 'rel-b', name: 'Rel B', family: 'Test', category: 'chat', jobs: ['bob'], license: 'MIT', files: [] }, { id: 'rel-p', name: 'Rel P', family: 'Test', category: 'chat', jobs: ['bob'], files: [] }] };
  const hcfg = { ...cfg, dataDir: path.join(hdir, 'data'), bobModelsDir: path.join(hdir, 'models'), settingsFile: path.join(hdir, 'data', 'settings.json') }; fs.mkdirSync(hcfg.dataDir, { recursive: true });
  const hshop = { cfg: hcfg, catalog: hcat, locate: (e) => ({ gguf: { 'rel-a': aFile, 'rel-b': bFile, 'rel-p': pFile }[e.id] }) };
  const checksSeen = [];
  const hlab = new Lab(hcfg, { shop: hshop, room: big, steps: {
    direction: async () => dirs,
    checks: async (s) => { checksSeen.push(s); return { reflex: { declined: s.extra ? 0 : 4, of: 6 }, kept: s.kept ? { declined: 4, of: 5, categories: RF.KEPT.map((k, i) => ({ id: k.id, label: k.label, declined: i !== 2 })) } : null, where: 'card' }; },
    test: async () => fakeQuiz(66)
  } });
  const hv = hlab.view();
  check('the page gets the mixing ways, the layer choices, the kept kinds and the prompt lists', hv.mixWays.length === 3 && hv.layerChoices.length === 3 && hv.kept.length === 5 && hv.plainPrompts.length && hv.reluctantPrompts.length && hv.homeMaxGB === PLAY_MAX_GB);
  { const pl = hlab.planHome('refusals', { from: 'rel-a', name: '' }); check('a home plan wants a name', pl.problems.some((x) => /name/.test(x)));
    const pl2 = hlab.planHome('mix', { a: 'rel-a', b: 'rel-a', name: 'Same' }); check('mixing a brain with itself is refused', pl2.problems.some((x) => /two different/.test(x)));
    const pl3 = hlab.planHome('nope', { name: 'x' }); check('an unknown home way is refused', pl3.problems.some((x) => /no home way/.test(x))); }
  const tr = await hlab.tryRefusals({ from: 'rel-a', strength: 80, layers: 'all' });
  check('Try it first starts as its own job', tr.started?.kind === 'refusals-try');
  while (hlab.job) await new Promise((r) => setTimeout(r, 20));
  { const t = hlab.runs.at(-1); check('Try it first reports before and after, holds the direction out with a control vector, and writes no brain', t.state === 'done' && t.report.tried.before.declined === 4 && t.report.tried.after.declined === 0 && t.report.tried.kept.declined === 4 && checksSeen.at(-1).extra.includes('--control-vector-scaled') && checksSeen.at(-1).extra.includes('-0.8') && !fs.existsSync(path.join(hcfg.bobModelsDir, 'lab', 'try'))); }
  const hs = await hlab.startHome('refusals', { from: 'rel-a', name: 'Plain A', strength: 100, layers: 'all', check: true, teachBack: true, naughty: true });
  check('the refusals job starts with its steps', hs.started?.kind === 'refusals' && hs.started.steps.map((s) => s.id).join() === 'direction,refusals,check,test');
  while (hlab.job) await new Promise((r) => setTimeout(r, 20));
  const hr = hlab.runs.at(-1);
  check('the refusals job finishes with the check, the teach-back note and the Lab test', hr.state === 'done' && hr.report.refusals.kept.declined === 4 && hr.report.refusals.teachBack === 'planned' && hr.report.made.score === 66 && fs.existsSync(hr.files.gguf) && fs.existsSync(path.join(path.dirname(hr.files.gguf), 'teach-back.json')) && fs.existsSync(path.join(hcfg.dataDir, 'lab', 'lessons', RF.TEACH_BACK_SET, 'lessons.jsonl')), hr.error || '');
  const hu = hlab.use(hr.id);
  { const made = JSON.parse(fs.readFileSync(path.join(hcfg.dataDir, 'lab', 'made.json'), 'utf8')), m = made.find((x) => x.id === hu.id);
    check('Use in Bob marks it naughty and carries the plain line and the check', m.naughty === true && m.refusalsOut === true && /refusal habit taken out/.test(m.what) && /declines 4 of 5/.test(m.what));
    const cat2 = mergeMadeBrains({ models: [] }, hcfg); check('in the catalogue it sits behind the naughty-list switch, never recommended', cat2.models[0].naughty === true && !cat2.models[0].rec && cat2.models[0].madeInLab); }
  const hs2 = await hlab.startHome('refusals', { from: 'rel-b', name: 'Plain B', check: false, teachBack: false, naughty: false });
  while (hlab.job) await new Promise((r) => setTimeout(r, 20));
  { const r2 = hlab.runs.at(-1); const u2 = hlab.use(r2.id); const m = JSON.parse(fs.readFileSync(path.join(hcfg.dataDir, 'lab', 'made.json'), 'utf8')).find((x) => x.id === u2.id);
    check('with every safeguard off the brain is still flagged, just not naughty, and says the check was off', hs2.started.steps.map((s) => s.id).join() === 'direction,refusals,reflex,test' && m.naughty === false && m.refusalsOut === true && /refusal habit taken out/.test(m.what) && /check was turned off/.test(m.what) && !r2.report.refusals.kept); }
  const ms = await hlab.startHome('mix', { a: 'rel-a', b: 'rel-b', how: 'slerp', lean: 20, name: 'Blend AB' });
  while (hlab.job) await new Promise((r) => setTimeout(r, 20));
  { const mr = hlab.runs.at(-1); check('the mix job makes the file, tests it and remembers how', ms.started.kind === 'mix' && mr.state === 'done' && mr.report.mix.how === 'slerp' && mr.report.mix.share === 60 && fs.existsSync(mr.files.gguf) && fs.existsSync(path.join(path.dirname(mr.files.gguf), 'measure.json')), mr.error || '');
    const u = hlab.use(mr.id); const m = JSON.parse(fs.readFileSync(path.join(hcfg.dataDir, 'lab', 'made.json'), 'utf8')).find((x) => x.id === u.id); check('a mix in Bob carries both licences and isn\'t naughty', m.license === 'Apache-2.0 + MIT' && !m.naughty); }
  const ss = await hlab.startHome('stack', { a: 'rel-a', b: '', ranges: [{ brain: 'a', start: 0, end: 1 }, { brain: 'a', start: 1, end: 1 }], name: 'Tall A' });
  while (hlab.job) await new Promise((r) => setTimeout(r, 20));
  { const sr = hlab.runs.at(-1); check('the stack job makes a 3-layer brain', ss.started.kind === 'stack' && sr.state === 'done' && sr.report.stack.layers === 3 && brainFacts(readGguf(sr.files.gguf)).layers === 3, sr.error || ''); }
  check('a home job\'s page view never carries file paths', !JSON.stringify(hlab.view().runs).includes(hdir));

  // Peek inside
  { const trace = [[[1, 3], [0, 2]], [[1, 5], [0, 2]], [[7, 3], [4, 2]]]; // 3 words, 2 layers, 2 experts each
    const t = PK.tallyTrace(trace, ['Hi', ' there', '!'], { experts: E, layers: 2 });
    check('a trace becomes counts per layer, the lit set and the words', t.counts[0][1] === 2 && t.counts[0][3] === 2 && t.counts[1][2] === 3 && t.lit[0].join() === '1,3,5,7' && t.lit[1].join() === '0,2,4' && t.words.length === 3 && t.words[1].text === ' there' && t.used === 7 && t.share === Math.round((1000 * 7) / 16) / 10);
    const t2 = PK.tallyTrace({ tokens: [{ layers: [[1], [2]] }] }, [{ piece: 'x' }], { experts: E, layers: 2 }); check('the other trace shape is read too', t2.counts[0][1] === 1 && t2.words[0].text === 'x');
    const o = PK.overlap([[1, 3], [0, 2]], [[1, 5], [0, 2]]); check('the overlap of two questions is shared over either', o.both === 3 && o.either === 5 && o.share === 60);
    const keep = PK.keepFromLit(t.counts, { used: 2 }); check('the lit set becomes a keep list padded to one size', keep[0].length === 4 && keep[1].length === 4 && [0, 2, 4].every((e) => keep[1].includes(e)));
    const pb = { id: 'rel-a', name: 'Rel A', gguf: aFile };
    const facts = { experts: E, used: 2, layers: 2 };
    PK.addToTally(hcfg, pb, { sha256: 'abc', facts, counts: t.counts, tokens: 3, when: '2026-11-09' });
    PK.addToTally(hcfg, pb, { sha256: 'abc', facts, counts: t.counts, tokens: 3, when: '2026-11-09' });
    const peek = JSON.parse(fs.readFileSync(path.join(hcfg.dataDir, 'lab', 'usage', 'rel-a', 'peek-counts.json'), 'utf8'));
    check('the tally adds up across questions in the usage map\'s file, source peek, and rewrites the keep file', peek.things.length === 1 && peek.things[0].source === 'peek' && peek.things[0].tokens === 6 && peek.things[0].counts[1][2] === 6 && peek.brain.sha256 === 'abc' && fs.existsSync(path.join(hcfg.dataDir, 'lab', 'usage', 'rel-a', 'rel-a-keep.json')));
    const pv = hlab.peek('rel-a'); check('the peek view has the map, the cold count and the things counted', pv.have && pv.total[1][2] === 6 && pv.cold === 16 - 7 && pv.things[0].name === 'Peek inside');
    const noEngine = PK.peekView(hcfg, pb, facts, { engineFound: false }); check('without Brain Engine the live view is greyed with the reason', !noEngine.ok && noEngine.live.ok === false && /Brain Engine/.test(noEngine.live.why) && noEngine.have);
    check('the Forge\'s keep-file list sees the tally', hlab.keepFiles().some((k) => /Rel A/.test(k.name)));
    check('Cut these out from a lit set writes a keep file; without one it uses the tally', hlab.peekKeep({ brain: 'rel-a', counts: t.counts }).experts === 4 && /rel-a-keep\.json$/.test(hlab.peekKeep({ brain: 'rel-a' }).file)); }
  { // the live view with a fake Brain Engine: a server that takes the expert mask, and a fake traced answer
    const masks = [];
    const srv = http.createServer((req, res) => { let b = ''; req.on('data', (d) => { b += d; }); req.on('end', () => { if (req.url === '/expert-mask') { masks.push(JSON.parse(b).keep); res.end('{}'); } else res.end('{}'); }); });
    await new Promise((r) => srv.listen(0, '127.0.0.1', r));
    const url = `http://127.0.0.1:${srv.address().port}`;
    let served = 0, stopped = 0, mode = 'ok';
    const plab = new Lab(hcfg, { shop: hshop, room: big, steps: {
      peekServe: async () => { served++; return { url, where: 'card', stop: () => { stopped++; } }; },
      peekAsk: async (u, q) => { if (mode === 'none') throw new Error(PK.NO_TRACE); return { answer: `About ${q}`, trace: [[[1, 3], [0, 2]], [[1, 5], [0, 2]]], tokens: ['A', 'b'], tps: 20 }; },
      fingerprint: async () => 'abc'
    } });
    const a1 = await plab.peekAsk({ brain: 'rel-a', question: 'rain', tally: true });
    check('a live question answers with the words lit up and adds to the tally', a1.answer === 'About rain' && a1.words.length === 2 && a1.lit[0].join() === '1,3,5' && a1.tallied.tokens === 8 && served === 1 && !plab.job);
    const a2 = await plab.peekAsk({ brain: 'rel-a', question: 'sun', maskCounts: a1.counts });
    check('Turn these off masks to the lit set, padded, then clears the mask, on the same loaded engine', a2.masked && masks.length === 2 && masks[1] === null && Array.isArray(masks[0]) && served === 1);
    check('the page gets the live view as possible', plab.peek('rel-a').live.ok);
    mode = 'none';
    const bad = await plab.peekAsk({ brain: 'rel-a', question: 'x' }).then(() => '', (e) => e.message);
    check('an engine without the trace is said once and the live view greys out with the reason', bad === PK.NO_TRACE && plab.peek('rel-a').live.ok === false && plab.peek('rel-a').live.why === PK.NO_TRACE && stopped === 1);
    plab.freePeek(); srv.close(); }

  // the page's words and the cards
  for (const id of ['mix', 'stack', 'refusals']) { const m = M2.find((x) => x.id === id); check(`the ${id} card is ready and opens here`, m.ready && m.use === 'home' && m.where === 'here'); }
  for (const f of ['public/lab-home-ways.js', 'public/lab-peek.js', 'src/lab-merge.js', 'src/lab-refusals.js', 'src/lab-peek.js']) { check(`${f} parses`, spawnSync(process.execPath, ['--check', fileURLToPath(new URL(`../${f}`, import.meta.url))]).status === 0); check(`${f} names no private brain`, !/thoth|heretic/i.test(read(f))); }
  { const hw = read('public/lab-home-ways.js'); check('unticking a safeguard asks a second time, with Make it anyway and Keep them ticked', /Make it without teaching back the kept refusals\?/.test(hw) && /Make it anyway/.test(hw) && /Keep them ticked/.test(hw) && /Made in the Lab with the refusal habit taken out/.test(hw));
    check('the stack card carries the honest line', /nearly always ramble/.test(hw));
    const help = HELP.map((h) => h.html).join(' '); check('Help explains the three home ways and Peek inside', /Mix two brains/.test(help) && /Stack layers/.test(help) && /Take out the refusal habit/.test(help) && /Peek inside/.test(help) && /Turn these off and ask again/.test(help) && /Keep count while I ask these/.test(help));
    check('the release note is there', /Peek inside/.test(read('docs/releases/v1.5.166.md')) && /Take out the refusal habit/.test(read('docs/releases/v1.5.166.md'))); }
}

// 1.5.167 Simple / Professional: run settings, repeats, the question log, your own packs, Guard rails groups
{
  const GN = await import('../src/lab-gen.js');
  const MY = await import('../src/lab-mypacks.js');
  const G = await import('../src/lab-guard.js');
  const P = await import('../src/lab-packs.js');
  const g0 = GN.cleanGen({});
  check('Simple mode asks with the scoreboard settings: temperature 0, thinking off, 8,192 tokens, one run', g0.temperature === 0 && !g0.think && g0.ctx === 8192 && g0.repeats === 1 && GN.rankable({}));
  const gx = GN.cleanGen({ temperature: 9, seed: -5, think: 'yes', ctx: 12345, repeats: 99 });
  check('Professional settings are kept in bounds', gx.temperature === 2 && gx.seed === 0 && gx.think === false && gx.ctx === 8192 && gx.repeats === GN.MAX_REPEATS);
  check('any other temperature, thinking or room makes a run a study, not a ranking', !GN.rankable({ temperature: 0.7 }) && !GN.rankable({ think: true }) && !GN.rankable({ ctx: 32768 }) && GN.rankable({ repeats: 3 }));
  const gb = GN.genBody({ temperature: 0.8, seed: 7, think: true }, 300, 2);
  check('the settings reach the request: the seed moves with each run, thinking gets room', gb.temperature === 0.8 && gb.seed === 9 && gb.max_tokens === 300 + GN.THINK_EXTRA && gb.chat_template_kwargs.enable_thinking === true);
  check('the spread of repeated runs', JSON.stringify(GN.spread([60, 80, 70])) === JSON.stringify({ low: 60, high: 80, mean: 70, runs: 3 }) && GN.spread([]) === null);
  check('the settings line says what the run was asked with', /Temperature 0\.8, thinking on, 16,384 tokens of room, 3 runs \(seed 42 and up\)\./.test(GN.genLine({ temperature: 0.8, think: true, ctx: 16384, repeats: 3 })));
  const seen = [], logged = [];
  await P.runExtraPack('http://fake', 'sense', { askFn: async (url, m, o) => { seen.push(o.gen?.temperature, o.repeat); return { text: 'A', calls: [], msg: { role: 'assistant', content: 'A' }, tps: 1 }; }, gen: { temperature: 0.5 }, repeat: 1, log: (x) => logged.push(x) });
  check('the extra packs pass the settings on, and log every question with its answer', seen[0] === 0.5 && seen[1] === 1 && logged.length === P.EXTRA_PACKS.find((x) => x.id === 'sense').count && logged[0].answer === 'A' && typeof logged[0].ok === 'boolean');
  // Guard rails groups
  check('how a reply sounds', G.stylesOf('It\'s important to remember that safety matters.').includes('lecture') && G.stylesOf('Please consult a doctor about that.').includes('redirect') && G.stylesOf('You can call 988, the crisis line.').includes('helpline') && G.stylesOf('Be careful. Warning: risk. Safety first.').includes('warnings') && G.stylesOf('Run kill -9 on it.').length === 0);
  check('every everyday ask has a setting', G.ANSWER_SETTING.length === G.ANSWER_THESE.length && G.ANSWER_SETTING.every((k) => G.SETTINGS[k]));
  const preach = await G.runGuard(async () => ({ text: 'Sure. It\'s important to remember to be responsible. Here is how.' }), { holdAsks: [{ q: 'X', setting: 'fiction' }] });
  check('Guard rails splits "didn\'t over-refuse" by setting and counts preaching answers', Object.values(preach.groups.bySetting).reduce((a, x) => a + x.of, 0) === G.ANSWER_THESE.length && preach.parts.answered.score === 100 && preach.groups.preachy.score === 0 && preach.groups.styles.lecture === preach.groups.styles.replies && preach.groups.heldBySetting.fiction.of === 1);
  const tagged = G.guardLesson({ messages: [{ role: 'user', content: 'hi' }], want: 'ok', setting: 'fiction', style: 'lecture' });
  const junk = G.guardLesson({ messages: [{ role: 'user', content: 'hi' }], want: 'ok', setting: 'nope', style: '<b>' });
  check('Save as lesson keeps the setting and style tags, and only known ones', tagged.tags.setting === 'fiction' && tagged.tags.style === 'lecture' && !junk.tags);
  const tagDir = path.join(tmp, 'tagged'); fs.mkdirSync(tagDir, { recursive: true }); fs.writeFileSync(path.join(tagDir, 'lessons.jsonl'), JSON.stringify(tagged) + '\n');
  check('and Held the line reads the setting back', G.ownRefusalAsks([tagDir])[0]?.setting === 'fiction');
  // Your own packs
  const bad = (x) => MY.cleanMyPack(x).problems.join(' ');
  check('a pack that isn\'t right says what\'s wrong', /valid JSON/.test(bad('{nope')) && /title/.test(bad({ items: [{ q: 'a', check: 'exact', a: 'b' }] })) && /must be one of/.test(bad({ title: 'T', items: [{ q: 'a', check: 'eval' }] })) && /pattern doesn't work/.test(bad({ title: 'T', items: [{ q: 'a', check: 'pattern', a: '(' }] })) && /up to 200/.test(bad({ title: 'T', items: Array(201).fill({ q: 'a', check: 'answers' }) })) && /A, B, C or D/.test(bad({ title: 'T', items: [{ q: 'a', check: 'letter', a: 'E' }] })));
  const okPack = { title: 'My Pack!', what: 'Mine', items: [{ q: 'Pick', check: 'letter', a: 'b' }, { q: 'Sum', check: 'number', a: 12 }, { q: 'Say', check: 'contains', a: ['red', 'Blue'] }, { q: 'Yes?', check: 'exact', a: 'Yes.' }, { q: 'Date', check: 'pattern', a: '^\\d{4}-\\d{2}$' }, { q: 'No', check: 'declines' }, { q: 'Go', check: 'answers', system: 'Be brief.' }] };
  const cp = MY.cleanMyPack(JSON.stringify(okPack)).pack;
  const say = { Pick: 'B) that', Sum: 'It is 12.', Say: 'Red and blue.', 'Yes?': 'yes', Date: '2026-11', No: 'I can\'t help with that.', Go: 'Here you go.' };
  check('every kind of check marks a right answer right', cp.items.every((it) => MY.markMy(it, say[it.q])) && cp.items[0].a === 'B' && cp.version.length === 8);
  check('and a wrong one wrong', !MY.markMy(cp.items[0], 'C') && !MY.markMy(cp.items[2], 'Red only') && !MY.markMy(cp.items[5], 'Sure, here it is.') && !MY.markMy(cp.items[6], 'I can\'t help with that.'));
  const labD = path.join(tmp, 'mylab');
  const imp = MY.importMyPack(labD, JSON.stringify(okPack));
  check('a pack is imported by its title, and listed with its version', imp.ok && imp.id === 'my:my-pack' && MY.readMyPacks(labD)[0].count === 7 && MY.readMyPacks(labD)[0].ranked === false);
  const sysSeen = [];
  const mr = await MY.runMyPack('http://fake', MY.readMyPacks(labD)[0], { askFn: async (u, m) => { sysSeen.push(m[0].role); return { text: say[m[m.length - 1].content] }; } });
  check('your own pack runs, with its system prompt where it has one', mr.score === 100 && mr.of === 7 && sysSeen.includes('system'));
  check('a pack can be deleted, and a name with a path in it can\'t reach outside the folder', MY.deleteMyPack(labD, 'my:my-pack').deleted === 'my:my-pack' && MY.readMyPacks(labD).length === 0 && (() => { try { MY.deleteMyPack(labD, '../../etc/passwd'); return false; } catch (e) { return /isn't here/.test(e.message); } })());
  // A Professional run through the Lab: a study doesn't touch the scoreboard; the log is kept and saved
  const asked = [];
  const pLab = new Lab({ ...cfg, dataDir: path.join(tmp, 'pro-data'), settingsFile: path.join(tmp, 'pro-data', 'settings.json') }, { shop, room: big, broadcast: () => {}, steps: {
    serve: async ({ ctx }) => { asked.push(['ctx', ctx]); return { url: 'http://fake', stop: () => {}, where: 'card' }; },
    pack: async (url, id, { onStep, gen, repeat, log }) => { asked.push([id, gen.temperature, repeat]); log({ q: 'Q "one", =2+2', answer: 'A\nline', ok: repeat === 0 }); onStep(1, 1); return { score: repeat === 0 ? 50 : 70, right: 1, of: 2, misses: [], tps: 10 }; },
    fingerprint: async () => 'beef'
  } });
  fs.mkdirSync(path.join(tmp, 'pro-data'), { recursive: true });
  await pLab.startChallenge({ from: 'test-moe', packs: ['sums'], gen: { temperature: 0.7, repeats: 2, ctx: 16384 } });
  while (pLab.job) await new Promise((r) => setTimeout(r, 20));
  const pr = pLab.runs.at(-1);
  check('a Professional run uses its settings and repeats each challenge', pr.state === 'done' && asked[0].join() === 'ctx,16384' && asked.slice(1).map((x) => x.join(':')).join() === 'sums:0.7:0,sums:0.7:1', pr.error || JSON.stringify(asked));
  check('its report has the average, the spread and the settings, and says it is a study', pr.report.challenges[0].score === 60 && pr.report.challenges[0].spread.low === 50 && pr.report.ranked === false && /Temperature 0\.7/.test(pr.report.settings) && pr.report.hasLog);
  check('a study never goes on the scoreboard', pLab.scores().length === 0);
  const lg = pLab.challengeLog(pr.id);
  check('the log has every question, answer and result, run by run', lg.total === 2 && lg.rows[0].pack === 'sums' && lg.rows[1].run === 2 && lg.rows[0].ok === true);
  const csv = fs.readFileSync(path.join(tmp, 'pro-data', 'lab', 'results', pLab.challengeLog(pr.id, { save: 'csv' }).file), 'utf8');
  check('the log saves as a spreadsheet, quoted safely', /^Challenge,Run,Group,Question,Answer,Result\n/.test(csv) && csv.includes('"Q ""one"", =2+2"') && csv.includes('A line') && !/\nsums,1,,=/.test(csv));
  check('and as JSONL', /\.jsonl$/.test(pLab.challengeLog(pr.id, { save: 'jsonl' }).file));
  await pLab.startChallenge({ from: 'test-moe', packs: ['sums'] });
  while (pLab.job) await new Promise((r) => setTimeout(r, 20));
  check('a Simple run still goes on the scoreboard', pLab.scores().length === 1 && pLab.runs.at(-1).report.ranked === true);
  check('the page gets the mode, the settings and your packs, never their questions', pLab.view().labMode === 'simple' && pLab.view().pro.gen.temperature === 0 && Array.isArray(pLab.view().myPacks) && pLab.view().myPacks.every((m) => !m.items));
  const { mergeSettings } = await import('../src/config.js');
  check('the mode is a setting, cleaned to simple or pro', (await import('../src/config.js')).SETTING_KEYS.includes('labMode') && (() => { const a = {}, b = {}; mergeSettings(a, { labMode: 'hack' }); mergeSettings(b, { labMode: 'pro' }); return a.labMode === 'simple' && b.labMode === 'pro'; })());
  check('the mode, your packs and the log are for this replicant matrix itself', ["'/api/lab/mode'", "'/api/lab/mypack/import'", "'/api/lab/challenge/log'"].every((k) => read('src/lab.js').indexOf(k) > read('src/lab.js').indexOf('Lab jobs can only be started on this replicant matrix itself')));
  const { modeSwitchHtml } = await import('../public/lab-pro.js');
  check('the switch is two toggle buttons that say which is on', (modeSwitchHtml('pro').match(/aria-pressed="true"/g) || []).length === 1 && /data-labmode="simple"/.test(modeSwitchHtml('pro')));
}
fs.rmSync(tmp, { recursive: true, force: true });
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

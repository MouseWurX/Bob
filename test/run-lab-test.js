// 1.5.141 Computer Science Lab (Lab 1): Bob's own GGUF cutter on small made-up brain files (experts cut byte for
// byte, settings copied, a sound reader taken out of a combined reader), the recipe checks, the whole job with fake
// steps, Use in Bob, the switch (off unless turned on, greyed out on small replicant matrices) and the page's words.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { readGguf, brainFacts, readerFacts, writeGguf, checkKeep, busiest, isHearingTensor, readCounts, coverageKeep } from '../src/lab-gguf.js';
import { Lab, maskFor, cleanWrite, teacherLicence, lessonSets, cleanRecipe, planRecipe, labRoom, labOn, cutSizes, fitWords, mergeMadeBrains, labRoute, RUNNING_TYPES , measureRecord, sha256File, compareTable, compareCsv } from '../src/lab.js';
import { TEMPLATES, TEMPLATE_IDS, templateById, templateWhyNot, applyTemplate } from '../public/lab-templates.js';
import crypto from 'node:crypto';
import http from 'node:http';
import { LESSON_SKILLS } from '../src/lab-skills.js';
import { QUIZ, TOOLS, runQuiz } from '../src/lab-test.js';
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
  check('Learn needs Bob\'s built-in engine', !learnBrain(brainFor({ engine: 'ollama' })).ready && /built-in engine/.test(learnBrain(brainFor({ engine: 'ollama' })).why));
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
  check('the Lab page has real tabs, and Playground and Challenges shown as later', /role="tablist"/.test(lab2) && /role="tab"/.test(lab2) && /aria-selected/.test(lab2) && /Playground <span class="lab-later">Later/.test(lab2) && /Challenges <span class="lab-later">Later/.test(lab2) && /ArrowRight/.test(lab2));
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
fs.rmSync(tmp, { recursive: true, force: true });
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

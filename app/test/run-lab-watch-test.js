// FNRI (the Lab's Playground): the scan of which experts a mixture-of-experts brain picks, and its viewer window.
// The sums (which skill each expert leans to, the timeline, one expert up close), reading a recording from a file
// that isn't trusted, Brain Engine's trace in the shape the engine patch gives it, the scan as a Lab job with a fake
// engine (no brain is loaded, nothing on this replicant matrix is read), the routes, and that the pieces are wired:
// the Playground page, the viewer window in Bob.exe, the engine patch, Help.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { Lab } from '../src/lab.js';
import { readGguf } from '../src/lab-gguf.js';
import { readTrace, askTraced, tallyTrace, NO_TRACE, traceBuilt } from '../src/lab-peek.js';
import { WATCH_SKILLS, PER_CHOICES, pickSkills, partsOf, clipOf, watchView, startWatch, readRecording, deleteRecording, listRecordings, watchRoute, cubeMap, cubeBrains, cubeShapes, CUBE_GROUPS, NO_HEADS, NO_DIALS, saveTargets, listTargets, readTargets, keepBeside, WATCH_WORDS, WATCH_WORDS_THINK, cleanKeep } from '../src/lab-watch.js';
import { pagesRoute } from '../src/lab-pages.js';
import { NAME, LONG_NAME, FORMAT, VERSION, cleanRecording, specialise, timeline, inWords, expertDetail, lookOf, SKILL_LOOKS, sideOf, LEANS, partOf, PART_LABEL, say, cutOf, cutEffect, keepList, setColour, resetColours, liveTrace, liveRecording, skillMap, mapLook, litSkills, coverKeep, cutSteps, EVEN_PICKS, findPatterns, PATTERN_CHOICES, hasFloors, floorScale, floorsAt, isHeads, LOAD_STYLES, loadStyle, loadOrder, cleanDials, skillDials, dialWords, dialScale, dialKey, compareScans, compareWords, DIAL_MAX, movedBlocks, targetsOf, TARGET_FORMAT, keepMap, lineUp, pairUp, pairWords, videoName } from '../public/lab-watch-math.js';

let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra ? ' ' + extra : ''}`); };
const read = (p) => fs.readFileSync(new URL(`../${p}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bob-lab-watch-'));
const wait = async (lab) => { for (let i = 0; i < 300 && lab.job; i++) await new Promise((r) => setTimeout(r, 10)); };

// ---- a tiny GGUF writer for a made-up mixture-of-experts brain ----
function kv(key, type, value) {
  const k = Buffer.from(key); const h = Buffer.alloc(12 + k.length); h.writeBigUInt64LE(BigInt(k.length)); k.copy(h, 8); h.writeUInt32LE(type, 8 + k.length);
  let v;
  if (type === 8) { const s = Buffer.from(value); v = Buffer.alloc(8 + s.length); v.writeBigUInt64LE(BigInt(s.length)); s.copy(v, 8); } else { v = Buffer.alloc(4); v.writeUInt32LE(value); }
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
    const bytes = t.dims.reduce((a, x) => a * x, 1) * 4; const pad = Math.ceil(bytes / 32) * 32 - bytes; datas.push(Buffer.alloc(bytes + pad)); off += bytes + pad;
  }
  let head = Buffer.concat(parts); head = Buffer.concat([head, Buffer.alloc(Math.ceil(head.length / 32) * 32 - head.length)]);
  fs.writeFileSync(file, Buffer.concat([head, ...datas]));
}
const E = 8, L = 2, EMB = 4, FF = 3;
const moeFile = path.join(tmp, 'moe.gguf'), plainFile = path.join(tmp, 'plain.gguf');
makeGguf(moeFile, [['general.architecture', 8, 'testmoe'], ['general.name', 8, 'Test MoE'], ['testmoe.block_count', 4, L], ['testmoe.expert_count', 4, E], ['testmoe.expert_used_count', 4, 2], ['general.file_type', 4, 15]], [
  { name: 'token_embd.weight', dims: [EMB, 6] },
  ...[0, 1].flatMap((l) => [{ name: `blk.${l}.ffn_gate_exps.weight`, dims: [EMB, FF, E] }, { name: `blk.${l}.ffn_up_exps.weight`, dims: [EMB, FF, E] }, { name: `blk.${l}.ffn_down_exps.weight`, dims: [FF, EMB, E] }, { name: `blk.${l}.ffn_gate_inp.weight`, dims: [EMB, E] }, { name: `blk.${l}.attn_q.weight`, dims: [EMB, EMB] }, { name: `blk.${l}.attn_norm.weight`, dims: [EMB] }])
]);
makeGguf(plainFile, [['general.architecture', 8, 'llama'], ['llama.block_count', 4, 2], ['general.file_type', 4, 15]], [{ name: 'token_embd.weight', dims: [4, 4] }, ...[0, 1].flatMap((l) => [{ name: `blk.${l}.ffn_up.weight`, dims: [4, 6] }, { name: `blk.${l}.ffn_down.weight`, dims: [6, 4] }, { name: `blk.${l}.attn_q.weight`, dims: [4, 4] }])]);

// ---- the sums ----
const skills2 = [{ id: 'a', label: 'Alpha' }, { id: 'b', label: 'Beta' }];
const row = (l0, l1) => [l0, l1];
const mkRec = (clips) => ({ format: FORMAT, version: VERSION, id: 'r', name: 'n', when: '2026-11-10', engine: 'Brain Engine', brain: { name: 'Test MoE', experts: E, layers: L, used: 2 }, skills: skills2, clips });
// skill a always picks experts 0,1 on layer 0; skill b always 2,3; both share 6,7 on layer 1
const many = (ids0) => Array.from({ length: 40 }, () => row(ids0, [6, 7]));
const rec = cleanRecording(mkRec([
  { skill: 'a', question: 'qa', answer: 'aa', prompt: 3, words: Array.from({ length: 40 }, (_, i) => (i < 3 ? `q${i}` : ' cat')), e: many([0, 1]), last: ' end' },
  { skill: 'b', question: 'qb', answer: 'bb', prompt: 3, words: Array.from({ length: 40 }, (_, i) => (i < 3 ? `q${i}` : ' dog')), e: many([2, 3]), last: '.' }
]));
const sp = specialise(rec);
check('an expert only one skill uses takes that skill and is strongly its own', sp.top[0][0] === 0 && sp.top[0][2] === 1 && sp.strength[0][0] > 0.5 && sp.strength[0][3] > 0.5);
check('an expert both skills use alike has no strength, so its colour is faint', sp.strength[1][6] === 0 && sp.top[1][6] >= 0);
check('an expert nothing picked is marked never picked', sp.top[0][5] === -1 && sp.picks[0][5] === 0 && sp.used === 6 && sp.total === 16);
check('the counts per skill: experts that lean, and strongly', sp.per[0].leans === 2 && sp.per[1].leans === 2 && sp.per[0].mostly === 2 && sp.words.join() === '40,40');
{ // few picks pull the strength down: one lucky pick is not a specialist
  const few = cleanRecording(mkRec([{ skill: 'a', question: 'q', prompt: 0, words: ['x'], e: [row([0, 1], [6, 7])] }, { skill: 'b', question: 'q', prompt: 0, words: ['y'], e: [row([2, 3], [6, 7])] }]));
  const s1 = specialise(few);
  check('an expert picked once looks one-sided by luck, so it is not called a specialist', s1.strength[0][0] < LEANS && s1.per[0].leans === 0);
}
{ // longer answers must not win by size
  const lop = cleanRecording(mkRec([{ skill: 'a', question: 'q', prompt: 0, words: Array(60).fill('x'), e: Array.from({ length: 60 }, (_, i) => row(i < 30 ? [0, 1] : [4, 5], [6, 7])) }, { skill: 'b', question: 'q', prompt: 0, words: Array(20).fill('y'), e: Array.from({ length: 20 }, () => row([0, 2], [6, 7])) }]));
  const s2 = specialise(lop);
  check('the skill is chosen by how often per word, so a skill with longer answers doesn\'t win by size', s2.top[0][0] === 1, `picks a=30 of 60 words, b=20 of 20 words, top=${s2.top[0][0]}`);
}
check('the timeline is every word of every question in order, or only one skill\'s', timeline(rec).length === 80 && timeline(rec)[40].clip === 1 && timeline(rec, { skills: new Set(['b']) }).length === 40 && timeline(rec, { skills: new Set(['b']) })[0].clip === 1);
{ const w = inWords(rec, sp); check('the picture is also said in words: used and never picked, how alike the skills are, a line per skill with its letter', /6 of 16 experts were picked/.test(w[0]) && /10 never were/.test(w[0]) && /alike/.test(w[1]) && w[2].startsWith('A, Alpha:') && w[3].startsWith('B, Beta:'), w.join(' | ')); }
{ const d = expertDetail(rec, sp, 0, 0); check('one expert up close: its picks, its split between the skills, and the words it was picked for', d.picks === 40 && d.top === 0 && d.shares[0].skill === 0 && d.shares[0].pct === 100 && d.words[0].text === 'cat' && d.words[0].n === 37, JSON.stringify(d)); }
check('every skill has its own colour and letter, sixteen of each', SKILL_LOOKS.length === 16 && new Set(SKILL_LOOKS.map((x) => x[0])).size === 16 && new Set(SKILL_LOOKS.map((x) => x[1])).size === 16 && lookOf(17)[1] === 'B');
check('a floor is as near square as the expert count allows', sideOf(256) === 16 && sideOf(128) === 12 && sideOf(8) === 3);
check('the name lives in one place', NAME === 'FNRI' && LONG_NAME === 'Functional Neural Response Imager');

// ---- a recording from a file is not trusted ----
check('a file that isn\'t a recording is refused in plain words', (() => { try { cleanRecording({ hello: 1 }); return false; } catch (e) { return /isn't an expert recording/.test(e.message); } })());
check('a recording from a newer Bob says to update', (() => { try { cleanRecording({ ...mkRec([]), version: 99 }); return false; } catch (e) { return /newer Bob/.test(e.message); } })());
{
  const dirty = cleanRecording({ ...mkRec([{ skill: 'a', question: 'x'.repeat(9000), prompt: 99, words: ['<script>', 'b', 'c'], e: [[[0, 99, -1, 'x', 1.5], [7]], 'nope', [[1]]], extra: 'x' }, { skill: 'zzz', words: ['a'], e: [[[0], [0]]] }]), parts: { evil: true }, brain: { name: 'B', experts: E, layers: L, used: 2, path: 'C:/secret' } });
  check('expert numbers out of range are dropped, text is cut to length, unknown skills and extra fields go', dirty.clips.length === 1 && dirty.clips[0].e[0][0].join() === '0' && dirty.clips[0].e[1][0].length === 0 && dirty.clips[0].e[2][1].length === 0 && dirty.clips[0].question.length === 500 && dirty.clips[0].prompt === 3 && !('path' in dirty.brain) && !('parts' in dirty) && !('extra' in dirty.clips[0]));
  check('a recording with silly sizes is refused', (() => { try { cleanRecording({ ...mkRec([]), brain: { experts: 1e9, layers: 2 } }); return false; } catch (e) { return /how many experts/.test(e.message); } })());
}

// ---- Brain Engine's trace ----
{
  const raw = { n_layer: 2, n_expert: 8, n_expert_used: 2, n_prompt: 2, last: '!', rows: [{ t: 'Hi', e: [[0, 1], []] }, { t: '?', e: [[2, 3], [4, 5]] }, { t: ' Yes', e: [[1, 2], [6, 7]] }] };
  const t = readTrace(raw);
  check('the engine\'s rows become the answer\'s words (the experts that wrote each one) and the whole read', t.trace.length === 2 && t.tokens.join('|') === ' Yes|!' && t.trace[0][0].join() === '2,3' && t.read.prompt === 2 && t.read.words.join('|') === 'Hi|?| Yes' && t.read.last === '!');
  const tt = tallyTrace(t.trace, t.tokens, { experts: 8, layers: 2 });
  check('Peek inside still tallies the same trace', tt.words.length === 2 && tt.words[1].text === '!' && tt.counts[0][2] === 2);
  check('an older engine\'s plain rows pass through', readTrace([[[1], [2]]], ['a']).trace.length === 1 && readTrace([[[1], [2]]], ['a']).read === null);
  const c = clipOf('a', 'Q', { answer: 'Yes!', ...t }, { experts: 8, layers: 2 });
  check('a clip keeps every word read, the question first, and the last word written', c.prompt === 2 && c.words.length === 3 && c.e[0][1].length === 0 && c.last === '!' && c.skill === 'a');
  const c2 = clipOf('a', 'Q', { answer: 'x', trace: [[[1, 99], [2]]], tokens: ['A'] }, { experts: 8, layers: 2 });
  check('a clip from plain rows works too, with out-of-range experts dropped', c2.prompt === 0 && c2.e[0][0].join() === '1' && c2.words[0] === 'A');
  // askTraced against a fake engine
  const calls = [];
  const fetchImpl = async (url, o) => { const body = JSON.parse(o.body); calls.push([url, body]); if (url.endsWith('/apply-template')) return { ok: true, json: async () => ({ prompt: 'P:' + body.messages[0].content }) }; return { ok: true, json: async () => ({ content: 'Yes!', expert_trace: raw, timings: { predicted_per_second: 9 } }) }; };
  const got = await askTraced('http://e', 'Hi?', { fetchImpl, maxWords: 7 });
  check('a question is asked alone, at temperature 0, thinking off, the trace on and the answer cut to the length asked', got.answer === 'Yes!' && got.read.prompt === 2 && calls[1][1].expert_trace === true && calls[1][1].n_predict === 7 && calls[1][1].temperature === 0 && calls[1][1].cache_prompt === false && calls[0][1].chat_template_kwargs.enable_thinking === false && calls[1][1].prompt === 'P:Hi?');
  const none = await askTraced('http://e', 'Hi?', { fetchImpl: async (url) => ({ ok: true, json: async () => (url.endsWith('/completion') ? { content: 'x' } : {}) }) }).then(() => '', (e) => e.message);
  check('an engine without the trace says so', none === NO_TRACE);
}

// ---- the questions ----
check('twenty-eight skills of six simple questions each, none repeated: twelve ticked to begin with and sixteen more to pick from', WATCH_SKILLS.length === 28 && WATCH_SKILLS.filter((s) => !s.extra).length === 12 && pickSkills({}).length === 12 && pickSkills({ skills: ['unsure', 'coding'] }).length === 2 && SKILL_LOOKS.length >= 13 && new Set(SKILL_LOOKS.map((x) => x[1])).size === SKILL_LOOKS.length && new Set(SKILL_LOOKS.map((x) => x[0])).size === SKILL_LOOKS.length && WATCH_SKILLS.every((s) => s.questions.length === 6 && s.label && /^[a-z]+$/.test(s.id)) && new Set(WATCH_SKILLS.flatMap((s) => s.questions)).size === 168);
{ const p = pickSkills({ skills: ['coding', 'maths'], per: 2 }); check('the ticked skills, with as many questions each as asked', p.length === 2 && p[0].questions.length === 2 && p[1].id === 'maths'); }
check('an odd number of questions falls back to the usual four', pickSkills({ per: 99 })[0].questions.length === 4 && PER_CHOICES.includes(4));
{ const p = pickSkills({ skills: ['chat'], own: { name: '  Cooking  ', questions: 'How do I boil an egg?\n\n  How long for rice?  \nHow do I boil an egg?\n4\n5\n6\n7\n8' } }); check('a skill of your own: named, one question a line, repeats dropped, six at most', p.length === 2 && p[1].id === 'own' && p[1].label === 'Cooking' && p[1].questions.length === 6 && p[1].questions[1] === 'How long for rice?'); }
check('a skill of your own with no name or no questions is left out', pickSkills({ skills: ['chat'], own: { name: '', questions: 'x' } }).length === 1 && pickSkills({ skills: ['chat'], own: { name: 'x', questions: '' } }).length === 1);

// ---- how much of the brain is experts ----
{
  const g = readGguf(moeFile); const p = partsOf(g, { layers: L, experts: E });
  check('the parts, by number of weights: experts and the rest for each layer, and what sits outside the layers', p.layers.length === 2 && p.layers[0].experts === 3 * EMB * FF * E && p.layers[0].other === EMB * E + EMB * EMB + EMB && p.outside === EMB * 6 && p.kinds.router === 2 * EMB * E && p.kinds.attention === 2 * EMB * EMB && p.kinds.norms === 2 * EMB && p.kinds.tables === EMB * 6, JSON.stringify(p));
}

// ---- the scan, as a Lab job with a fake engine ----
const dataDir = path.join(tmp, 'data'); fs.mkdirSync(dataDir, { recursive: true });
const cfg = { dataDir, agentDir: tmp, bobModelsDir: path.join(tmp, 'models', 'bob'), settingsFile: path.join(dataDir, 'settings.json'), computerLab: true, gpuVramGB: 16 };
const files = { moe: moeFile, plain: plainFile };
const catalog = { models: [{ id: 'moe', name: 'Test MoE', family: 'Test', category: 'chat' }, { id: 'plain', name: 'Plain', family: 'Llama', category: 'chat' }] };
const shop = { cfg, catalog, locate: (e) => (files[e.id] ? { gguf: files[e.id] } : {}) };
const big = () => ({ ok: true, why: '' });
let served = 0, stopped = 0, asked = [], mode = 'ok', clock = 1762750000000;
const steps = {
  peekServe: async () => { served++; return { url: 'http://fake', where: 'card', stop: () => { stopped++; } }; },
  peekAsk: async (u, q, o) => { asked.push([q, o.maxWords]); if (mode === 'none') throw new Error(NO_TRACE); const coding = /Python|JavaScript|loop|SQL/.test(q); return { answer: `About ${q}`, ...readTrace({ n_prompt: 2, last: '.', rows: Array.from({ length: 12 }, (_, i) => ({ t: i < 2 ? 'q' : ' w', e: [coding ? [0, 1] : [2, 3], [6, 7]] })) }) }; }
};
const mk = () => { const l = new Lab(cfg, { shop, room: big, broadcast: () => {}, steps }); l.platform = () => ({ os: 'win', arch: 'x64' }); l.now = () => (clock += 1000); return l; };
const lab = mk();
{
  const v = watchView(lab);
  check('the page gets every brain it can read (with experts or without), the skills with their questions, and the choices', v.brains.length === 2 && v.brains[0].id === 'moe' && v.brains[0].experts === E && v.brains[1].experts === 0 && v.skills.length === 28 && v.skills[27].extra === true && v.skills[0].extra === false && v.skills[0].questions.length === 6 && v.per === 4 && v.words === WATCH_WORDS);
  const bv = watchView(lab, 'moe');
  check('a brain with experts and Brain Engine can be scanned; it has no scans yet', bv.live.ok && bv.recordings.length === 0 && bv.layers === L);
  check('a brain without experts can be scanned too', watchView(lab, 'plain').live.ok === true);
  const noEngine = new Lab(cfg, { shop, room: big, broadcast: () => {}, steps: {} }); noEngine.platform = () => ({ os: 'win', arch: 'x64' });
  check('without Brain Engine the scan is greyed with where to get it', watchView(noEngine, 'moe').live.ok === false && /Brain Engine/.test(watchView(noEngine, 'moe').live.why));
  check('and it won\'t start', await startWatch(noEngine, { brain: 'moe' }).then(() => false, (e) => /Brain Engine/.test(e.message)));
}
check('a scan needs a brain and at least one skill', await startWatch(lab, {}).then(() => false, (e) => /Pick a brain/.test(e.message)) && await startWatch(lab, { brain: 'moe', skills: ['nope'] }).then(() => false, (e) => /at least one skill/.test(e.message)));
{
  lab.brain = { engine: { loaded: async () => [{ name: 'Main', vram: 5 }], unloadAll: async () => { lab.unloaded = true; } } };
  const ask = await startWatch(lab, { brain: 'moe', skills: ['coding', 'chat'], per: 2 });
  check('Bob\'s own brain leaves the card only after asking', ask.needUnload && ask.names[0] === 'Main' && !lab.job && served === 0);
  const r = await startWatch(lab, { brain: 'moe', skills: ['coding', 'chat'], per: 2 }, { unload: true });
  check('the scan starts as a Lab job, with a step for each skill', r.started.kind === 'watch' && r.started.name === 'FNRI: Test MoE' && r.started.steps.length === 4 && lab.unloaded === true);
  check('a second job is refused while it runs', await startWatch(lab, { brain: 'moe' }).then(() => false, (e) => /already busy/.test(e.message)));
  await wait(lab);
  const run = lab.runs[lab.runs.length - 1];
  check('it loads the brain once, asks every question one at a time with the answer length capped, and unloads', run.state === 'done' && served === 1 && stopped === 1 && asked.length === 4 && asked.every(([, n]) => n === WATCH_WORDS) && asked[0][0] === WATCH_SKILLS[0].questions[0], run.error || '');
  const list = listRecordings(cfg, { id: 'moe', name: 'Test MoE' });
  check('the scan is listed with its skills, questions, words and what it saw', list.length === 1 && list[0].clips === 4 && list[0].words === 48 && list[0].skills.join() === 'Coding,Everyday chat' && /experts were picked/.test(list[0].saw) && run.report.watch.id === list[0].id);
  const got = readRecording(lab, { brain: 'moe', id: list[0].id });
  { const gg = lab.brains().find((b) => b.id === 'moe').gguf; const m = cubeMap(lab, { model: gg, experts: E, layers: 2, kind: 'experts' });
    check('the small cube finds the newest scan of the brain Bob is chatting with (by its file, id or name) and gets its colours', m && m.skills.length === 2 && m.top.length === 2 && m.top[0].length === E && cubeMap(lab, { model: 'moe', experts: E, layers: 2 }) === m && cubeMap(lab, { model: 'x', label: 'Test MoE', experts: E, layers: 2 }) === m && cubeMap(lab, { model: 'moe', experts: E + 1, layers: 2 }) === null && cubeMap(lab, { model: 'some-other-brain', experts: E, layers: 2 }) === null); }
  check('the viewer gets the clean recording with the brain\'s parts', got.format === FORMAT && got.clips.length === 4 && got.clips[0].prompt === 2 && got.clips[0].e.length === 12 && got.brain.experts === E && got.parts.layers.length === 2 && got.parts.outside > 0);
  const s = specialise(got);
  check('the made-up routing shows through: coding leans to experts 0 and 1, chat to 2 and 3, and both share 6 and 7', s.top[0][0] === 0 && s.top[0][2] === 1 && s.strength[1][6] === 0 && s.top[0][5] === -1);
  const onDisk = JSON.stringify(JSON.parse(fs.readFileSync(path.join(dataDir, 'lab', 'watch', 'moe', `${list[0].id}.json`), 'utf8')));
  check('the file on disk names the brain, never a folder or a path', !onDisk.includes(tmp.replace(/\\/g, '\\\\')) && !/gguf/i.test(onDisk) && /"name":"Test MoE"/.test(onDisk));
  // the routes
  const sent = []; const send = (res, code, body) => sent.push([code, body]);
  const call = (p, b, o = {}) => pagesRoute({ req: { method: o.get ? 'GET' : 'POST' }, res: {}, p, isLocal: o.isLocal !== false, lab, body: async () => b, send }).then((hit) => [hit, sent.pop()]);
  { const [hit, [code, body]] = await call('/api/lab/watch', null, { get: true }); check('GET /api/lab/watch gives the page its view', hit && code === 200 && body.skills.length === 28 && body.maxSkills === 16); }
  { const [, [code, body]] = await call('/api/lab/watch/view', { brain: 'moe' }); check('the view of one brain lists its scans', code === 200 && body.recordings.length === 1); }
  { const [, [code, body]] = await call('/api/lab/watch/read', { brain: 'moe', id: list[0].id }, { isLocal: false }); check('a paired device may read a scan (to play it)', code === 200 && body.clips.length === 4); }
  { const [, [code]] = await call('/api/lab/watch/start', { brain: 'moe' }, { isLocal: false }); const [, [code2]] = await call('/api/lab/watch/delete', { brain: 'moe', id: list[0].id }, { isLocal: false }); check('but only this replicant matrix itself may start or delete one', code === 403 && code2 === 403 && listRecordings(cfg, { id: 'moe' }).length === 1); }
  { const off = mk(); off.cfg = { ...cfg, computerLab: false }; const s2 = []; const hit = await pagesRoute({ req: { method: 'POST' }, res: {}, p: '/api/lab/watch/start', isLocal: true, lab: off, body: async () => ({ brain: 'moe' }), send: (r_, c, b) => s2.push([c, b]) }); check('with the Lab off nothing starts', hit && s2[0][0] === 403); }
  check('a scan that isn\'t there says so', (() => { try { readRecording(lab, { brain: 'moe', id: '../../settings' }); return false; } catch (e) { return /isn't here any more/.test(e.message); } })());
  check('Delete removes the scan', deleteRecording(lab, { brain: 'moe', id: list[0].id }).deleted && listRecordings(cfg, { id: 'moe' }).length === 0);
}
{ // an engine build without the trace
  mode = 'none'; const l2 = mk();
  await startWatch(l2, { brain: 'moe', skills: ['chat'], per: 2 }); await wait(l2);
  const run = l2.runs[l2.runs.length - 1];
  check('an engine build without the trace fails the scan with the reason, unloads, and greys the page', run.state === 'failed' && run.error === NO_TRACE && watchView(l2, 'moe').live.ok === false && watchView(l2, 'moe').live.why === NO_TRACE && listRecordings(cfg, { id: 'moe' }).length === 0);
  mode = 'ok';
}
{ // Stop
  const l3 = mk(); let release; l3.stepFns.peekAsk = (u, q, { signal }) => new Promise((res, rej) => { release = res; signal.addEventListener('abort', () => rej(new Error('Stopped.'))); });
  const before = stopped;
  await startWatch(l3, { brain: 'moe', skills: ['chat'], per: 2 }); await new Promise((r) => setTimeout(r, 30)); l3.stop(); await wait(l3);
  check('Stop ends the scan, unloads the brain and writes nothing', l3.runs[l3.runs.length - 1].state === 'stopped' && stopped === before + 1 && listRecordings(cfg, { id: 'moe' }).length === 0);
}

// ---- wired in ----
for (const f of ['public/lab-watch-math.js', 'public/lab-watch.js', 'public/watch.js', 'public/watch-view.js', 'src/lab-watch.js', 'public/lab-playground.js']) { check(`${f} parses`, spawnSync(process.execPath, ['--check', fileURLToPath(new URL(`../${f}`, import.meta.url))]).status === 0); check(`${f} names no private brain`, !/thoth|heretic/i.test(read(f))); }
{
  const pg = read('public/lab-playground.js'), page = read('public/lab-watch.js'), html = read('public/watch.html'), js = read('public/watch.js'), view = read('public/watch-view.js'), css = read('public/watch.css'), main = read('electron/main.cjs');
  check('the Playground has the FNRI page, right after Peek inside', /\['peek', 'Peek inside'\], \['watch', 'FNRI'\]/.test(pg) && /watch: createWatchPage\(\{ api \}\)/.test(pg));
  check('the page opens the viewer in its own window and says so if pop-ups are blocked', page.includes("window.open(`/watch.html${q}`, 'bob-watch'") && /pop-ups/.test(page));
  check('Bob.exe lets the viewer open as its own window, one at a time, and keeps it on Bob\'s own page', /url === base \+ '\/watch\.html' \|\| url\.startsWith\(base \+ '\/watch\.html\?'\)/.test(main) && /watchWin\.loadURL\(url\)/.test(main) && /if \(!url\.startsWith\(base \+ '\/watch\.html'\)\) e\.preventDefault\(\)/.test(main));
  check('the viewer has no outside scripts or styles', !/https?:\/\//.test(html) && !/https?:\/\/(?!x)/.test(js.replace(/\/\/.*$/gm, '')) && /<script type="module" src="\/watch\.js">/.test(html));
  check('tick boxes show or hide each skill, the parts that are not experts, and the never picked', /data-show=/.test(js) && js.includes("row('grey'") && js.includes("row('never'") && /Not experts/.test(js) && /Never picked/.test(js));
  check('three zoom levels: the whole brain, one floor, one expert', ['The whole brain', 'One floor', 'One expert'].every((t) => html.includes(t)) && /function floorHtml/.test(js) && /function expertHtml/.test(js));
  check('the picture is never the only way: a label on the canvas, the same in words, letters as well as colours, every control with a name', /role="img" aria-label=/.test(html) && /What this shows, in words/.test(html) && /aria-valuetext/.test(js) && /aria-label="\$\{esc\(label/.test(js) && ['watchLeft', 'watchRight', 'watchUp', 'watchDown', 'watchIn', 'watchOut', 'watchPrev', 'watchNext'].every((id) => new RegExp(`id="${id}"[^>]*aria-label=`).test(html)));
  check('it turns with the keyboard as well as a drag, and plays with the space bar', /ArrowLeft/.test(js) && /ev\.key === ' '/.test(js) && /tabindex="0"/.test(html));
  check('with animations off it never turns by itself', /if \(spin && !still\(\)/.test(js) && /prefers-reduced-motion/.test(js));
  check('Save as a video records the picture itself, and says so where a browser can\'t', /captureStream/.test(js) && /MediaRecorder/.test(js) && /save a video of the picture/.test(js));
  check('a scan can be saved as a file and opened from one, checked on the way in', /expert-recording\.json/.test(js) && /load\(JSON\.parse\(await f\.text\(\)\)\)/.test(js) && /cleanRecording\(j\)/.test(js));
  check('the grey parts are a core up the middle with the experts around it, and a base under the first floor', /coreCells/.test(view) && /expertCell/.test(view) && /baseFloors/.test(view));
  check('the app never mentions a spending freeze', ![pg, page, html, js, view, css, read('src/lab-watch.js')].some((t) => /freeze/i.test(t)));
  check('on a narrow screen the picture goes on top and the controls fold under it', /@media \(max-width: 720px\)/.test(css) && /column-reverse/.test(css));
}
{
  const patch = read('engine/patches/0002-expert-trace.patch'), readme = read('engine/README.md');
  check('Brain Engine has the expert trace patch, and its README says what it does', /"expert_trace"/.test(patch) && /llama_set_eval_callback/.test(patch) && /"neurons"/.test(patch) && /ffn_moe_topk-/.test(patch) && /0002-expert-trace\.patch/.test(readme) && /expert_trace/.test(readme));
  check('the patch leaves no debugging lines behind', !/DBG|fprintf\(stderr/.test(patch));
}

// ---- the subtitles: question, thinking, answer ----
{
  const clip = { prompt: 2, words: ['Hi', '?', '<think>', 'Let', ' me', '</think>', 'Hello', '!'] };
  check('a word of the question is the Question part', partOf(clip, 1).part === 'question' && partOf(clip, 1).from === 0);
  check('words between the think markers are the Thinking part', partOf(clip, 3).part === 'thinking' && partOf(clip, 4).from === 3 && partOf(clip, 2).part === 'thinking');
  check('the closing marker still belongs to the thoughts, and what follows is the Answer', partOf(clip, 5).part === 'thinking' && partOf(clip, 6).part === 'answer' && partOf(clip, 7).from === 6);
  check('a scan without thoughts goes straight from Question to Answer', partOf({ prompt: 1, words: ['Hi', 'Yo', '!'] }, 2).part === 'answer' && partOf({ prompt: 1, words: ['Hi', 'Yo', '!'] }, 2).from === 1);
  check('every part has a plain name for the subtitle', ['question', 'thinking', 'answer'].every((k) => PART_LABEL[k]));
  let body = null;
  const fetchImpl = async (u, o) => { if (u.endsWith('/apply-template')) { body = JSON.parse(o.body); return { ok: true, json: async () => ({ prompt: 'p' }) }; } return { ok: true, json: async () => ({ content: 'x', expert_trace: { n_layer: 1, n_expert: 2, n_expert_used: 1, n_prompt: 1, last: '.', rows: [{ t: 'a', e: [[0]] }] } }) }; };
  await askTraced('http://x', 'q', { fetchImpl });
  const off = body.chat_template_kwargs.enable_thinking;
  await askTraced('http://x', 'q', { fetchImpl, think: true });
  check('thinking is off unless the scan asks for it', off === false && body.chat_template_kwargs.enable_thinking === true);
  check('a thinking scan gets more room for words', WATCH_WORDS_THINK > WATCH_WORDS);
  const html = read('public/watch.html'), js = read('public/watch.js'), page = read('public/lab-watch.js');
  check('the viewer has a turn-speed slider, sides to look from, and a switch for the lines', /id="watchSpinSpeed"/.test(html) && /id="watchFace"/.test(html) && /id="watchPaths"/.test(html) && /spinSpeed/.test(js) && /FACES/.test(js));
  check('the viewer steps one word at a time, both ways', /id="watchStepBack"/.test(html) && /id="watchStep"/.test(html) && /step\(-1\)/.test(js));
  check('the scan page offers Let it think first, off to begin with', /id="watch-think"/.test(page) && /think = false/.test(page));
}

// ---- a brain without experts: the same scan over groups of neurons ----
{
  const raw = (kind) => ({ kind, n_layer: L, n_expert: 256, n_expert_used: 8, n_ff: 600, n_prompt: 2, last: '.', rows: Array.from({ length: 6 }, (_, i) => ({ t: i < 2 ? 'q' : ' w', e: Array.from({ length: L }, () => [200, 3, 9, 17, 40, 41, 42, 255]) })) });
  const sh = readTrace(raw('neurons')).shape;
  check('the engine says what it traced: neuron groups, how many, and how many neurons they slice', sh.kind === 'neurons' && sh.experts === 256 && sh.used === 8 && sh.neurons === 600 && readTrace(raw(undefined)).shape.kind === 'experts');
  const l5 = mk(); l5.stepFns.peekAsk = async () => ({ answer: 'ok', ...readTrace(raw('neurons')) });
  await startWatch(l5, { brain: 'plain', skills: ['chat'], per: 2 }); await wait(l5);
  const id = listRecordings(cfg, { id: 'plain', name: 'Plain' })[0]?.id;
  const rec5 = id ? readRecording(l5, { brain: 'plain', id }) : null;
  check('a plain brain\'s scan is saved as neuron groups', rec5 && rec5.brain.kind === 'neurons' && rec5.brain.experts === 256 && rec5.brain.used === 8 && rec5.brain.neurons === 600 && rec5.clips.length === 2 && rec5.clips[0].e[0][0].includes(255));
  check('its feed-forward neurons take the experts\' place in the block, the rest is the grey core', rec5 && rec5.parts.layers[0].experts > 0 && rec5.parts.layers[0].other > 0);
  const l6 = mk(); l6.stepFns.peekAsk = async () => ({ answer: 'ok', ...readTrace(raw('experts')) });
  await startWatch(l6, { brain: 'plain', skills: ['chat'], per: 2 }); await wait(l6);
  check('an engine build that can\'t trace a plain brain fails with the reason', l6.runs[l6.runs.length - 1].state === 'failed' && l6.runs[l6.runs.length - 1].error === NO_TRACE);
  const c5 = cleanRecording(JSON.parse(JSON.stringify(rec5)));
  const lines = inWords(c5, specialise(c5));
  check('the words say neuron groups, never experts, and that the groups are a way of slicing', /mixture-of-experts/.test(lines[0]) && /way of slicing/.test(lines[0]) && lines.slice(1).every((x) => !/expert/i.test(x)) && /neuron groups/.test(lines[1]) && say(c5, lines[0]) === lines[0]);
  check('a plain brain has no router, and its blend line makes no claim measured on experts', say(c5, 'Attention, the router, the tuning rows and the word tables') === 'Attention, the tuning rows and the word tables' && say(c5, 'Not an expert: attention, the router and the tuning rows') === 'Not a neuron group: attention and the tuning rows' && say(c5, 'the grey squares in the middle are not experts') === 'the grey squares in the middle are not in the neuron groups' && !/That's normal/.test(read('public/lab-watch-math.js').match(/isNeurons\(rec\) \? `[^`]*`/)?.[0] || 'That\'s normal'));
  check('the Lab page speaks of Bob in the third person', /Bob asks it a few simple questions for each skill and records/.test(read('public/lab-watch.js')) && /Bob lights the busiest groups of neurons/.test(read('public/lab-watch.js')) && !/I ask it a few|I light the busiest/.test(read('public/lab-watch.js')));
  { const wj = read('public/watch.js'); check('Try a cut names the crossed-out ring, the rescan button says it unloads, and a neuron scan says why there is no rescan', !/(?<!crossed-out )a red ring/.test(wj + read('public/help-content.js')) && /\(the crossed-out rings\)/.test(wj) && /Unload Bob\\'s brain and scan again/.test(wj) && /Press Unload Bob's brain and scan again to start\. It loads again the next time you chat\./.test(wj) && !/Press the button again/.test(wj) && !/askedUnload = true/.test(wj) && /setAsk\(true\)/.test(wj) && /Neuron groups can\\'t be switched off in Brain Engine, so this is a picture only\./.test(wj)); }
  check('all-rounders are drawn dashed, not only fainter, so they never look like the outline of an expert in use', /setLineDash\(\[dash, dash \* 0\.8\]\)/.test(read('public/watch-view.js')) && /\.watch-skill \.sw\.even \{ border: 1\.5px dashed/.test(read('public/watch.css')) && /\.mind-cube-key \.sw\.even \{ border: 1\.5px dashed/.test(read('public/style.css')) && !/soft white outline/.test(read('public/help-content.js') + read('public/watch.js') + read('public/lab-watch-math.js')) && /dashed white outline/.test(read('public/help-content.js')));
  { const hr = { brain: { kind: 'heads' } }; check('a heads scan never calls the grey parts attention, and the written thinking stays for a screen reader under the cube', say(hr, 'Attention, the router, the tuning rows and the word tables') === 'The feed-forward layers, the tuning rows and the word tables' && say(hr, 'Not an expert: attention, the router and the tuning rows') === 'Not an attention head: the feed-forward layers and the tuning rows' && say(hr, 'the grey squares are not experts') === 'the grey squares are not attention heads' && /hd \? `the feed-forward layers/.test(read('public/watch.js')) && /\.cube-view \.mind-log, \.cube-view \.mind-empty \{ position: absolute !important;[^}]*clip-path: inset\(50%\)/.test(read('public/style.css')) && !/\.cube-view \.mind-(log|empty)[^{]*\{ display: none/.test(read('public/style.css')) && /How Bob's thinking shows here\. On: a cube of Bob's brain/.test(read('public/index.html')) && /Bob sorts the words/.test(read('public/watch.html')) && /Brain Engine \(test build\), then scan again/.test(read('src/lab-watch.js'))); }
  { const ls = read('src/lab-watch.js'), lj = read('src/lab.js'), lp = read('src/lab-peek.js');
    check('an older Brain Engine is found out from its program file before any brain loads (PC test of 1.5.184): the page greys Start with the reason, and a start refuses', /export function traceBuilt\(exe\)/.test(lp) && /Buffer\.from\('expert_trace_heads'\), Buffer\.from\('expert_trace'\)/.test(lp) && /traceProbe\(\) \{ if \(this\.stepFns\.peekServe\) return null;/.test(lj) && /\(lab\.peekTraceOk \?\? lab\.traceProbe\?\.\(\)\?\.experts\) === false \? \{ ok: false, why: NO_TRACE \}/.test(ls) && /if \(pr && !pr\.experts\) throw new Error\(NO_TRACE\); if \(heads && pr && !pr\.heads\) throw new Error\(NO_HEADS\);/.test(ls) && /traceOk: this\.peekTraceOk \?\? this\.traceProbe\(\)\?\.experts \?\? null/.test(lj)); }
  { // 1.5.191: newer builds keep the server's code in llama-server-impl.dll beside the program (PC test of 1.5.189)
    const be = path.join(tmp, 'be-impl'); fs.mkdirSync(be, { recursive: true });
    fs.writeFileSync(path.join(be, 'llama-server.exe'), Buffer.from('MZ just a small launcher'));
    check('a build whose program has no trace words reads as no trace', traceBuilt(path.join(be, 'llama-server.exe'))?.experts === false);
    fs.writeFileSync(path.join(be, 'llama-server-impl.dll'), Buffer.concat([Buffer.alloc(5 << 20), Buffer.from('"expert_trace" ... "expert_trace_heads"')]));
    fs.writeFileSync(path.join(be, 'ggml-cuda.dll'), Buffer.from('expert_trace_heads? not ours'));
    const t = traceBuilt(path.join(be, 'llama-server.exe'));
    check('the trace words found only in llama-server-impl.dll beside the program count (past the first 4 MB too)', t?.experts === true && t?.heads === true, JSON.stringify(t));
    const so = path.join(tmp, 'be-so'); fs.mkdirSync(so, { recursive: true });
    fs.writeFileSync(path.join(so, 'llama-server'), 'elf'); fs.writeFileSync(path.join(so, 'libllama-server-impl.so'), 'expert_trace');
    check('on Linux the same, from libllama-server-impl.so; a missing program is still unknown', traceBuilt(path.join(so, 'llama-server'))?.experts === true && traceBuilt(path.join(so, 'llama-server'))?.heads === false && traceBuilt(path.join(tmp, 'nope', 'llama-server.exe')) === null);
  }
  { const pg = read('public/lab-watch.js');
    check('while a brain is read the FNRI page says so, and a late answer for an older pick is dropped (PC test of 1.5.189)', /Reading this brain…/.test(pg) && /if \(n === asking && want === brain\) bv = r;/.test(pg)); }
  check('an expert scan\'s words are left as they were', say({ brain: { kind: 'experts' } }, 'Not experts') === 'Not experts' && say(c5, 'Not experts') === 'Other parts' && say(c5, '<div class="watch-expert">One expert</div>') === '<div class="watch-expert">One neuron group</div>');
  const html = read('public/watch.html'), view = read('public/watch-view.js'), js = read('public/watch.js');
  check('the viewer starts as a cube of coloured glass, with a slider for how see-through', /id="watchGlass"/.test(html) && /id="watchCube"/.test(html) && /cubeGap/.test(view) && /glass/.test(view) && /data-solid=/.test(js) && /id="watchGlow" min="0" max="1.5" step="0.05" value="0.5"/.test(html) && /glow = 0\.5/.test(view) && /solid\.get\(top\)/.test(view) && /cube\(\);/.test(js));
}

// ---- trying a cut ----
{
  const recC = cleanRecording({ format: FORMAT, version: VERSION, brain: { name: 'b', experts: 6, layers: 2, used: 2 }, skills: [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }], clips: [
    { skill: 'a', question: 'q', prompt: 1, words: ['x', 'y', 'z', 'w'], e: [[[0, 1], [0, 1]], [[0, 1], [0, 1]], [[0, 1], [0, 2]], [[0, 1], [0, 2]]] },
    { skill: 'b', question: 'q', prompt: 1, words: ['x', 'y', 'z', 'w'], e: [[[2, 3], [3, 4]], [[2, 3], [3, 4]], [[2, 3], [3, 4]], [[2, 1], [3, 4]]] }] });
  const spC = specialise(recC);
  const none = cutOf(recC, spC, {});
  check('with nothing unticked, nothing is turned off', none.every((s) => s.size === 0) && cutEffect(recC, none).lost === 0);
  const offB = cutOf(recC, spC, { skills: new Set([1]) });
  const fx = cutEffect(recC, offB);
  check('unticking a skill turns off its experts, and the picks that went to them are counted', offB[0].has(2) && offB[0].has(3) && !offB[0].has(0) && fx.per[1].lost > 0 && fx.per[0].lost === 0 && fx.per[1].pct > 80 && fx.off === offB[0].size + offB[1].size && fx.total === 12);
  const offNever = cutOf(recC, spC, { never: true });
  check('unticking Never picked turns off only those', offNever[0].has(4) && offNever[0].has(5) && !offNever[0].has(0) && cutEffect(recC, offNever).lost === 0);
  const busiest = cutOf(recC, spC, { keepN: 2 });
  check('keeping the busiest few on each floor turns off the rest', busiest[0].size === 4 && !busiest[0].has(0) && !busiest[0].has(1) && busiest[1].size === 4 && !busiest[1].has(0));
  const all = cutOf(recC, spC, { skills: new Set([0, 1]), never: true });
  check('a floor always keeps as many experts as the brain picks for a word', all.every((s) => 6 - s.size === 2) && !all[0].has(0));
  const kl = keepList(recC, offB);
  check('the cut as the engine takes it: the experts left on, for each layer', kl.length === 2 && kl[0].includes(0) && !kl[0].includes(2) && kl[0].length === 6 - offB[0].size);
  check('a cut is checked before it reaches the engine', cleanKeep([[0, 1, 1, 99], [2, 3]], { experts: 6, layers: 2, used: 2 })[0].join() === '0,1' && cleanKeep([[0, 1, 2, 3, 4, 5], [0, 1, 2, 3, 4, 5]], { experts: 6, layers: 2, used: 2 }) === null
    && (() => { try { cleanKeep([[0]], { experts: 6, layers: 2, used: 2 }); return false; } catch { return true; } })() && (() => { try { cleanKeep([[0], [1, 2]], { experts: 6, layers: 2, used: 2 }); return false; } catch (e) { return /at least 2/.test(e.message); } })());
  // the real thing: the same questions again with experts switched off
  mode = 'ok'; const l7 = mk(); let masked = null; l7.stepFns.peekMask = async (u, keep) => { masked = keep; };
  await startWatch(l7, { brain: 'moe', skills: ['chat'], per: 2 }); await wait(l7);
  const first = listRecordings(cfg, { id: 'moe', name: 'Test MoE' })[0];
  asked = [];
  const keep = Array.from({ length: L }, () => [0, 1, 2, 3]);
  check('scanning again with nothing off is refused', await startWatch(l7, { brain: 'moe', again: first.id, keep: Array.from({ length: L }, () => [...Array(E).keys()]) }).then(() => false, (e) => /Nothing is turned off/.test(e.message)));
  await startWatch(l7, { brain: 'moe', again: first.id, keep }); await wait(l7);
  const second = listRecordings(cfg, { id: 'moe', name: 'Test MoE' })[0];
  const rec7 = readRecording(l7, { brain: 'moe', id: second.id });
  check('scan again asks the same questions with the experts switched off in the engine, and says so', masked && masked.length === L && masked[0].join() === '0,1,2,3' && rec7.clips.length === 2 && rec7.clips.map((x) => x.question).join() === readRecording(l7, { brain: 'moe', id: first.id }).clips.map((x) => x.question).join() && second.id !== first.id && rec7.cut.off === L * (E - 4) && /experts off/.test(rec7.name));
  { // the same questions again with dials set: no experts off, the dials reach the engine, the scan remembers them and where it came from
    let dialled = null; l7.stepFns.peekDials = async (u, list) => { dialled = list; }; masked = null;
    await startWatch(l7, { brain: 'moe', again: first.id, dials: [{ kind: 'expert', layer: 0, index: 1, scale: 0 }, { kind: 'ffn', layer: 1, scale: 1.5 }, { kind: 'attn', layer: 0, scale: 1 }] }); await wait(l7);
    const third = listRecordings(cfg, { id: 'moe', name: 'Test MoE' })[0], rec8 = readRecording(l7, { brain: 'moe', id: third.id });
    check('scan again with dials sets them in the engine for that scan, and the scan says what was set and which scan it came from', dialled && dialled.length === 2 && masked === null && rec8.dials.length === 2 && rec8.from === first.id && /2 dials/.test(rec8.name) && !rec8.cut && rec7.from === first.id);
    check('every dial as built is refused, and so is a dial the brain has no part for', await startWatch(l7, { brain: 'moe', again: first.id, dials: [{ kind: 'ffn', layer: 0, scale: 1 }] }).then(() => false, (e) => /every dial is as built/.test(e.message)) && await startWatch(l7, { brain: 'moe', again: first.id, dials: [{ kind: 'expert', layer: 0, index: 999, scale: 0 }] }).then(() => false, (e) => /experts 0 to/.test(e.message)));
    l7.stepFns.peekDials = async () => { throw new Error(NO_DIALS); };
    await startWatch(l7, { brain: 'moe', again: first.id, dials: [{ kind: 'ffn', layer: 0, scale: 0.5 }] }); await wait(l7);
    check('an older Brain Engine with no dials says so in plain words', /can't turn parts up or down yet/.test(NO_DIALS) && /Update it under Get models, Engines/.test(NO_DIALS));
    delete l7.stepFns.peekDials;
  }
  { // the keep list beside a cut brain's file is found and checked; one that doesn't fit is ignored
    const d = fs.mkdtempSync(path.join(os.tmpdir(), 'bob-keep-')), g = path.join(d, '28Bob-Q4_K_M.gguf');
    fs.writeFileSync(path.join(d, '28Bob-keep.json'), JSON.stringify({ name: '28Bob', experts: 2, layers: [[3, 7], [0, 5]] }));
    const k = keepBeside({ gguf: g }, { layers: 2, experts: 2 });
    check('a cut brain\'s keep list beside its file is found, and one that doesn\'t fit the brain is ignored', k?.layers[0][1] === 7 && k.experts === 8 && keepBeside({ gguf: g }, { layers: 3, experts: 2 }) === null && keepBeside({ gguf: g }, { layers: 2, experts: 4 }) === null && keepBeside({ gguf: '' }) === null);
    fs.rmSync(d, { recursive: true, force: true });
  }
  { // use these for training: a list of blocks saved beside the recordings, read back checked, never taken for a recording
    const before = listRecordings(cfg, { id: 'moe', name: 'Test MoE' }).length;
    const sv = saveTargets(l7, { brain: 'moe', from: first.id, why: 'dials', label: '  Maths   blocks ', kind: 'experts', targets: [{ kind: 'expert', layer: 0, index: 1, scale: 2 }, { kind: 'expert', layer: 0, index: 1 }, { kind: 'ffn', layer: 1, index: 5 }] });
    const lt = listTargets(cfg, { id: 'moe', name: 'Test MoE' }), rt = readTargets(l7, { brain: 'moe', id: sv.id });
    check('a list of blocks for training is saved beside the scans, tidied, and read back', sv.count === 2 && /^targets-/.test(sv.id) && lt.length === 1 && lt[0].label === 'Maths blocks' && lt[0].why === 'dials' && rt.format === TARGET_FORMAT && rt.brain.layers === L && rt.brain.experts === E && rt.from === first.id && rt.targets.length === 2 && rt.targets.every((t) => !('scale' in t)) && rt.targets.find((t) => t.kind === 'ffn').index === 0);
    check('the list never shows up as a scan', listRecordings(cfg, { id: 'moe', name: 'Test MoE' }).length === before);
    const bad = (o) => { try { saveTargets(l7, { brain: 'moe', from: first.id, why: 'dials', ...o }); return false; } catch { return true; } };
    check('a list with nothing in it, a block the brain hasn\'t got, an unknown source or a made-up file name are refused', bad({ targets: [] }) && bad({ targets: [{ kind: 'expert', layer: 0, index: 999 }] }) && bad({ why: 'x', targets: [{ kind: 'ffn', layer: 0 }] }) && (() => { try { readTargets(l7, { brain: 'moe', id: '../x' }); return false; } catch { return true; } })());
  }
  check('a plain brain has no experts to switch off', await startWatch(l7, { brain: 'plain', again: 'x', keep }).then(() => false, (e) => /mixture-of-experts/.test(e.message)));
  const html = read('public/watch.html'), view = read('public/watch-view.js'), js = read('public/watch.js');
  check('the viewer has Try a cut: a switch, how many to keep, what it would cost, and Scan again', /id="watchCut"/.test(html) && /id="watchKeep"/.test(html) && /id="watchCutSays"/.test(html) && /id="watchRescan"/.test(html) && /cutEffect/.test(js) && /missed/.test(view) && /next best experts/.test(js));
}

// ---- the same scan on a rented card: everything packed, every dependency checked first ----
{
  const { bundle, VIEWER_FILES, llamaTag } = await import('../model-lab/forge/aifeui-bundle.mjs');
  const out = path.join(tmp, 'rent-in');
  const r = bundle({ brain: 'hf:someone/some-brain-GGUF:some-brain.Q4_K_M.gguf', out, skills: ['coding', 'chat'], per: 2, think: true });
  const plan = JSON.parse(fs.readFileSync(path.join(out, 'aifeui-plan.json'), 'utf8'));
  check('the pack has the plan: the brain, the questions, the pinned llama.cpp tag', plan.brain.startsWith('hf:') && plan.name === 'some-brain.Q4_K_M' && plan.skills.length === 2 && plan.skills[0].questions.length === 2 && plan.llama_tag === llamaTag() && plan.llama_tag.length > 2 && plan.think === true && plan.words === WATCH_WORDS_THINK);
  check('the pack has Bob\'s engine (both patches) and Bob\'s viewer (every file it loads)', ['0001-expert-mask.patch', '0002-expert-trace.patch'].every((f) => fs.existsSync(path.join(out, 'engine-patches', f))) && VIEWER_FILES.every((f) => fs.existsSync(path.join(out, 'viewer', f))) && r.patches.length >= 2);
  const loads = [...read('public/watch.js').matchAll(/from '\.\/([\w.-]+)'/g), ...read('public/watch-view.js').matchAll(/from '\.\/([\w.-]+)'/g)].map((m) => m[1]);
  check('nothing the viewer loads is left out of the pack', loads.length >= 3 && loads.every((f) => VIEWER_FILES.includes(f)) && [...read('public/watch.html').matchAll(/(?:href|src)="\/([\w.-]+\.(?:css|js))"/g)].every((m) => VIEWER_FILES.includes(m[1])));
  check('no brain, no pack', (() => { try { bundle({ out }); return false; } catch (e) { return /which brain/.test(e.message); } })());
  const sh = read('model-lab/forge/pod/aifeui.sh'), py = read('model-lab/forge/pod/aifeui_scan.py');
  check('on the card the checks run before anything is fetched or built, and a failed check stops it there', sh.indexOf('aifeui_scan.py" preflight') > 0 && sh.indexOf('aifeui_scan.py" preflight') < sh.indexOf('git clone') && sh.indexOf('aifeui_scan.py" preflight') < sh.indexOf('aifeui_scan.py" fetch') && /exit 2/.test(sh) && /Nothing was downloaded or built/.test(sh));
  check('the checks cover the tools, the card, the disk, the brain, the engine patches and the viewer', ['tool: ', 'a graphics card is here', 'enough room on the disk', 'the brain can be reached', "Bob's engine patch", "Bob's viewer", 'the brain fits the card', 'at the pinned tag'].every((t) => py.includes(t)));
  check('the engine is Bob\'s: the patches must apply, and the trace is proven before any question', /git apply/.test(sh) && /doesn't apply to llama\.cpp/.test(sh) && sh.indexOf('selftest') < sh.indexOf('" scan ') && /doesn't report the trace/.test(sh));
  check('the card writes the same recording the Lab does, and leaves the viewer beside it', py.includes(`FORMAT, VERSION = '${FORMAT}', ${VERSION}`) && /watch\.html\?file=recording\.json/.test(sh) && /q\.get\('file'\)/.test(read('public/watch.js')));
  check('the pack and the card scripts rent nothing and hold no keys', !/RUNPOD|api[_-]?key/i.test(sh + py + read('model-lab/forge/aifeui-bundle.mjs')));
  check('one card can scan several brains in turn: the folder in and out can be named, the engine build is shared', /IN=\$\{AIFEUI_IN:-\$W\/in\}/.test(sh) && /OUT=\$\{AIFEUI_OUT:-\$W\/out\/aifeui\}/.test(sh) && /L=\$W\/aifeui-engine/.test(sh));
  { // the scan against a brain served elsewhere (a forge benchmark step): the same questions, the key on every request
    const { remoteScan, slug } = await import('../model-lab/forge/fnri-remote.mjs');
    const auth = new Set(); let asked = 0;
    const fetchImpl = async (u, o) => { auth.add(o.headers?.authorization || ''); if (u.endsWith('/apply-template')) return { ok: true, json: async () => ({ prompt: 'p' }) }; asked++; return { ok: true, json: async () => ({ content: 'ok', expert_trace: { n_layer: 2, n_expert: 8, n_expert_used: 2, n_prompt: 1, last: '.', rows: [{ t: 'q', e: [[0, 1], [2, 3]] }, { t: ' a', e: [[4, 5], [6, 7]] }] } }) }; };
    const r = await remoteScan({ url: 'http://pod:8001/', name: 'Riker', quant: 'Q4_K_M', out: path.join(tmp, 'remote'), key: 'k', skills: ['coding', 'maths'], per: 2, fetchImpl, now: () => 5e12 });
    const j = JSON.parse(fs.readFileSync(r.file, 'utf8'));
    check('a scan of a brain served on a rented card writes the Lab\'s recording, named brain-fnri-quant, with the key on every request', path.basename(r.file) === 'riker-fnri-q4-k-m.json' && asked === 4 && [...auth].every((h) => h === 'Bearer k') && j.format === FORMAT && j.brain.experts === 8 && j.brain.layers === 2 && j.clips.length === 4 && cleanRecording(j).clips.length === 4 && slug('Qwen 3.6 35B-A3B') === 'qwen-3.6-35b-a3b');
    const plain = async (u) => (u.endsWith('/apply-template') ? { ok: true, json: async () => ({ prompt: 'p' }) } : { ok: true, json: async () => ({ content: 'ok' }) });
    check('a plain llama.cpp is found out on the first question', await remoteScan({ url: 'http://x', name: 'x', out: path.join(tmp, 'remote'), fetchImpl: plain }).then(() => false, (e) => e.message === NO_TRACE));
  }
}

// ---- colours of your own, outline instead of glow, and the small cube in Bob's thinking ----
{
  const usual = lookOf(0)[0];
  setColour(0, '#123ABC'); const mine = lookOf(0); setColour(1, 'red;background:url(x)'); const bad = lookOf(1)[0];
  setColour(0, ''); const back = lookOf(0)[0]; setColour(2, '#ffffff'); resetColours();
  check('a skill can have a colour of your own (a plain six-digit colour only), its letter stays, and Usual colours puts it back', mine[0] === '#123abc' && mine[1] === 'A' && bad === SKILL_LOOKS[1][0] && back === usual && lookOf(2)[0] === SKILL_LOOKS[2][0]);
  const html = read('public/watch.html'), view = read('public/watch-view.js'), js = read('public/watch.js');
  check('the viewer offers a glow, an outline or both, a colour box for each skill, and Usual colours', /id="watchMark"/.test(html) && ['glow', 'outline', 'both'].every((v) => html.includes(`value="${v}"`)) && /outlined/.test(view) && /data-colour=/.test(js) && /id="watchColours"/.test(html));
  const raw = { n_expert: 8, n_layer: 2, n_expert_used: 2, n_prompt: 100, last: '!', rows: Array.from({ length: 130 }, (_, i) => ({ t: `w${i}`, e: [[i % 8, (i + 1) % 8], [0, 1]] })) };
  const tr = liveTrace(raw);
  check('a reply\'s trace is cut down for the small cube: the end of what Bob read, then all he wrote', tr.words.length === 62 && tr.prompt === 32 && tr.words[0] === 'w68' && tr.words[61] === 'w129' && tr.experts === 8 && tr.kind === 'experts' && liveTrace(null) === null && liveTrace({ rows: [] }) === null);
  check('a very long reply is capped', liveTrace({ ...raw, n_prompt: 0, rows: Array.from({ length: 900 }, () => ({ t: 'x', e: [[0], [1]] })) }).words.length === 400);
  const live = liveRecording([tr, tr], 'Test brain');
  check('the cube plays Bob\'s last replies as one recording the big viewer can open too', live && live.clips.length === 2 && live.skills[0].label === 'Bob\'s replies' && live.brain.experts === 8 && cleanRecording(JSON.parse(JSON.stringify(live))).clips.length === 2 && liveRecording([]) === null);
  check('a reply from a different brain starts the cube afresh', liveRecording([tr, { ...tr, experts: 16 }]).clips.length === 1);
  const cubeJs = read('public/mind-cube.js'), index = read('public/index.html'), layout = read('public/layout.js'), server = read('src/server.js'), llama = read('src/llamacpp.js');
  check('a scan holds up to sixteen skills, and says so', await startWatch(mk(), { brain: 'moe', skills: WATCH_SKILLS.map((x) => x.id) }).then(() => false, (e) => /up to 16 skills/.test(e.message)) && /watch-over/.test(read('public/lab-watch.js')));
  check('the small cube is how Bob\'s thinking shows to begin with, with the written thinking one switch away and whenever the cube can\'t work', /id="mindDockCube"[^>]*aria-checked="true"/.test(index) && /id="mindCubeBox" class="mind-cube" hidden/.test(index) && /store\.get\('bob-mind-cube', '1'\) === '1'/.test(layout) && /createMindCube/.test(layout) && /classList\.toggle\('cube-view', cubeOn && cubeOk\)/.test(layout) && /\.cube-view \.mind-log, \.cube-view \.mind-empty \{ position: absolute !important;/.test(read('public/style.css')));
  check('Bob asks the engine for the trace only while a cube is open, and only on Brain Engine', /cubeClients\.size > 0 && !cubeWhy\(\)/.test(server) && /this\.wantTrace\?\.\(\) \? \{ expert_trace: true \}/.test(llama) && /brainsEngineNow\(cfg\) !== 'brainengine'/.test(server));
  check('an older Brain Engine build makes the cube say to press Update, instead of staying dark (1.5.193 on the owner\'s machines)', /lab\.traceProbe\?\.\(\)\?\.experts === false \? 'This Brain Engine build is too old/.test(server));
  check('only this replicant matrix\'s own pages can turn the cube on, and it says why when the engine can\'t do it', /isLocal && url\.searchParams\.get\('cube'\) === '1'/.test(server) && /type: 'cube', ok: !cubeWhy\(\), why: cubeWhy\(\)/.test(server) && /cubeClients\.delete\(res\)/.test(server));
  check('the cube says in words what it shows, stays still when animations are off, and can open the big viewer', /says\.textContent/.test(cubeJs) && /if \(still\(\)\)/.test(cubeJs) && /bobWatch\?\.load/.test(cubeJs) && /role="img" aria-label=/.test(index));
  check('the chat endpoint of Brain Engine carries the trace with the last piece of a reply', /with the last piece of a streamed chat reply/.test(read('engine/patches/0002-expert-trace.patch')));
}

// ---- all-rounders, the cube's borrowed colours, and the cut the Lab would make ----
{
  // 2 skills, 1 floor, 6 experts, 2 picked a word. Expert 0: both skills alike and often (an all-rounder). Expert 1:
  // only skill a. Expert 2: only skill b. Expert 3: once, by a (rarely used). 4 and 5: never.
  const row = (a, b) => [[a, b]];
  const mk = (skill, rows) => ({ skill, question: 'q', answer: 'a', prompt: 0, words: rows.map(() => 'w'), e: rows, last: '' });
  const r = cleanRecording({ format: FORMAT, version: VERSION, id: 'x', name: 'two', brain: { name: 'b', experts: 6, layers: 1, used: 2 }, skills: [{ id: 'a', label: 'A skill' }, { id: 'b', label: 'B skill' }],
    clips: [mk('a', [...Array.from({ length: 19 }, () => row(0, 1)), row(0, 3)]), mk('b', Array.from({ length: 20 }, () => row(0, 2)))] });
  const s = specialise(r);
  check('an expert every skill uses alike, and often, is an all-rounder; a rarely picked one is not, and neither is one skill\'s own', s.even[0][0] === true && s.even[0][1] === false && s.even[0][3] === false && s.even[0][4] === false && s.evens === 1 && s.picks[0][3] < EVEN_PICKS * 2 && s.strength[0][0] < LEANS);
  check('the words under the picture count the all-rounders and say how they look', inWords(r, s).some((l) => /1 experts are all-rounders/.test(l) && /dashed white outline/.test(l)));
  const map = JSON.parse(JSON.stringify(skillMap(r, s))), look = mapLook(map, { experts: 6, layers: 1, kind: 'experts' });
  check('a scan\'s colours travel to the small cube and come back the same', look && look.skills[1].label === 'B skill' && look.sp.top[0][1] === 0 && look.sp.top[0][2] === 1 && look.sp.top[0][4] === -1 && look.sp.even[0][0] === true && Math.abs(look.sp.strength[0][1] - s.strength[0][1]) < 0.01);
  check('colours from a brain of another shape, or a broken map, are not used', mapLook(map, { experts: 8, layers: 1 }) === null && mapLook(map, { experts: 6, layers: 1, kind: 'neurons' }) === null && mapLook({ ...map, top: [[0]] }, { experts: 6, layers: 1 }) === null && mapLook(null, { experts: 6, layers: 1 }) === null && mapLook({ ...map, top: [[9, 0, 1, 0, -1, -1]] }, { experts: 6, layers: 1 }).sp.top[0][0] === -1);
  const ls = litSkills(look, [[0, 1, 2, 2, 5]].map((x) => x));
  check('the cube says which skills the lit experts belong to', ls.evens === 1 && ls.never === 1 && ls.skills[0].label === 'B skill' && ls.skills[0].n === 2 && ls.skills[1].label === 'A skill');
  const ck = coverKeep(r, s, 0.95);
  check('the Lab\'s cut keeps what every skill needs: a mixture, never one whole colour', ck.K === 3 && [0, 1, 2].every((e) => ck.keep[0].has(e)) && !ck.keep[0].has(3));
  const offC = cutOf(r, s, { cover: 0.95 }), fxC = cutEffect(r, offC);
  check('trying that cut turns off exactly the experts it would remove, and never more than the brain needs to keep', offC[0].size === 6 - ck.K && !offC[0].has(0) && offC[0].has(4) && offC[0].has(5) && fxC.off === 6 - ck.K && 6 - offC[0].size >= 2);
  check('the Lab\'s plain sizes are offered too', JSON.stringify(cutSteps(256, 8)) === JSON.stringify([192, 152, 128, 104, 80, 64]) && cutSteps(8, 8).length === 0);
  const html = read('public/watch.html'), view = read('public/watch-view.js'), js = read('public/watch.js'), cubeJs = read('public/mind-cube.js'), server = read('src/server.js'), index = read('public/index.html');
  check('the viewer draws all-rounders as a soft white line drawing, with their own tick box', /WIRE_ALPHA = 0\.5/.test(view) && /if \(lk\.even\) wire\(x, y\)/.test(view) && /hidden\.has\('even'\)/.test(view) && /row\('even'/.test(js) && /All-rounders/.test(view));
  check('One colour is a quick switch in both viewers, off to begin with and remembered', /id="watchMono"[^>]*aria-checked="false"/.test(html) && /if \(mono\) return \{ color: oneColour\(\)/.test(view) && /bob-watch-mono/.test(js) && /bob-cube-mono/.test(cubeJs) && /id="mindCubeMono"/.test(index));
  check('the one colour is yours to pick in both viewers, and the cube\'s details can be hidden (the words stay for a screen reader)', /id="watchMonoColour"/.test(html) && /monoColour = \/\^#\[0-9a-f\]\{6\}\$\/i\.test/.test(view) && /id="mindCubeColour"/.test(index) && /bob-cube-colour/.test(cubeJs) && /<button id="mindCubeDetails" type="button" class="link">Show details/.test(index) && /let showDetails = false/.test(cubeJs) && !/id="mindCube(Mono|Details)"[^>]*aria-pressed/.test(index) && !/aria-pressed/.test(cubeJs) && /hidden>The one colour /.test(index) && /classList\.toggle\('sr-only', !showDetails\)/.test(cubeJs));
  check('Try a cut offers the Lab\'s own cuts', /id="watchCutHow"/.test(html) && /COVERS\.map/.test(js) && /cover: cutCover/.test(js));
  check('the small cube borrows the colours of the brain\'s newest scan and names them under the picture', /cubeMap\(lab, \{ model/.test(server) && /mapLook\(map,/.test(cubeJs) && /id="mindCubeKey"/.test(index) && /has no \$\{NAME\} scan yet/.test(cubeJs));
}

// ---- three more ways to see a brain, all worked out on this replicant matrix: attention heads, floors only, patterns ----
{
  const rawH = (kind) => ({ kind, n_layer: L, n_expert: 8, n_expert_used: 2, n_ff: 64, n_prompt: 2, last: '.', rows: Array.from({ length: 6 }, (_, i) => ({ t: i < 2 ? 'q' : ' w', e: Array.from({ length: L }, () => [i % 8, 7]), a: Array.from({ length: L }, (_, l) => (i + 1) * (l + 1) * 0.123456) })) });
  const rt = readTrace(rawH('heads'));
  check('the engine can report attention heads, and how hard each layer worked for each word', rt.shape.kind === 'heads' && rt.shape.experts === 8 && rt.read.a.length === 6 && rt.read.a[0].length === L && readTrace({ ...rawH('experts'), rows: rawH('experts').rows.map(({ a, ...r }) => r) }).read.a === undefined);
  let askedHeads = null;
  const lh = mk(); lh.stepFns.peekAsk = async (u, q, o) => { askedHeads = o.heads; return { answer: 'ok', ...readTrace(rawH('heads')) }; };
  await startWatch(lh, { brain: 'moe', skills: ['chat', 'coding'], per: 2, what: 'heads' }); await wait(lh);
  const hid = listRecordings(cfg, { id: 'moe', name: 'Test MoE' })[0]?.id;
  const recH = hid ? readRecording(lh, { brain: 'moe', id: hid }) : null;
  check('any brain, one with experts too, can be scanned by its attention heads', askedHeads === true && recH && recH.brain.kind === 'heads' && recH.brain.experts === 8 && recH.brain.used === 2 && /attention heads/.test(recH.name) && isHeads(recH), lh.runs[lh.runs.length - 1].error || '');
  check('the scan keeps how hard each floor worked, to three figures', recH && hasFloors(recH) && recH.clips[0].a.length === recH.clips[0].e.length && recH.clips[0].a[0][0] === 0.123 && recH.clips[0].a[1][1] === 0.494);
  check('in a heads scan the attention weights are the coloured blocks and the rest is grey', recH && recH.parts.layers[0].experts > 0 && recH.parts.layers[0].other > 0);
  const lh2 = mk(); lh2.stepFns.peekAsk = async () => ({ answer: 'ok', ...readTrace(rawH('experts')) });
  await startWatch(lh2, { brain: 'plain', skills: ['chat'], per: 2, what: 'heads' }); await wait(lh2);
  check('an engine build that can\'t report heads fails with the reason', lh2.runs[lh2.runs.length - 1].state === 'failed' && lh2.runs[lh2.runs.length - 1].error === NO_HEADS && /Update it/.test(NO_HEADS));
  check('experts can\'t be switched off in a heads scan', await startWatch(mk(), { brain: 'moe', what: 'heads', again: 'x', keep: [] }).then(() => false, (e) => /mixture-of-experts/.test(e.message)));
  check('the words speak of attention heads', say(recH, 'Expert 3: 5 experts, an expert. Not experts') === 'Attention head 3: 5 attention heads, an attention head. Other parts' && /attention heads: the parts of each layer that decide which earlier words to look at/.test(inWords(recH, specialise(recH))[0]));
  const sc = floorScale(recH), fa = floorsAt(recH, sc, 0, 5), f0 = floorsAt(recH, sc, 0, 0);
  check('Floors only measures each floor against its own usual range, 0 to 1', sc && fa.length === L && fa.every((v) => v >= 0 && v <= 1) && fa[0] > f0[0] && f0[0] === 0 && fa[0] === 1 && floorScale(rec) === null && !hasFloors(rec) && floorsAt(rec, null, 0, 0) === null);
  check('a recording file with nonsense in its floor numbers is cleaned', (() => { const j = JSON.parse(JSON.stringify(recH)); j.clips[0].a[0] = ['x', -4, Infinity]; const c = cleanRecording(j); return c.clips[0].a[0].every((v) => v === 0); })());
  // patterns: two kinds of words light two different sets of blocks, and nobody says which is which
  const mkw = (ids) => Array.from({ length: 2 }, () => ids);
  const pr = cleanRecording({ format: FORMAT, version: VERSION, id: 'p', name: 'p', brain: { name: 'b', experts: 8, layers: 2, used: 2 }, skills: [{ id: 'x', label: 'Mixed' }],
    clips: [{ skill: 'x', question: 'q', answer: 'a', prompt: 0, last: '', words: Array.from({ length: 40 }, (_, i) => (i % 2 ? ' cat' : ' 12')), e: Array.from({ length: 40 }, (_, i) => mkw(i % 2 ? [0, 1] : [6, 7])) }] });
  const pt = findPatterns(pr, { k: 2 });
  const byWord = pt.clips[0].by;
  check('Bob finds the patterns in a scan by himself: words that light the same blocks go together', pt.skills.length === 2 && byWord.every((b, i) => b === byWord[i % 2]) && byWord[0] !== byWord[1] && pt.patterns.every((p) => p.words === 20));
  check('each pattern is named by the words most its own', pt.skills.some((s) => /cat/.test(s.label) && !/12/.test(s.label)) && pt.skills.some((s) => /12/.test(s.label) && !/cat/.test(s.label)) && pt.skills.every((s) => /^Pattern \d: /.test(s.label)));
  const ps = specialise(pt);
  check('the colours then follow the patterns, word by word', ps.top[0][0] === byWord[1] && ps.top[0][6] === byWord[0] && ps.strength[0][0] > LEANS && ps.words.join() === '20,20' && cutEffect(pt, cutOf(pt, ps, { skills: new Set([byWord[1]]) })).per[byWord[1]].pct === 100);
  check('the same scan always gives the same patterns, and the scan itself is left as it was', JSON.stringify(findPatterns(pr, { k: 2 }).skills) === JSON.stringify(pt.skills) && pr.skills.length === 1 && pr.clips[0].by === undefined && findPatterns(pr, { k: 99 }).skills.length <= 16 && PATTERN_CHOICES.every((k) => k <= 16));
  const html = read('public/watch.html'), view = read('public/watch-view.js'), js = read('public/watch.js'), page = read('public/lab-watch.js'), patch = read('engine/patches/0002-expert-trace.patch'), peek = read('src/lab-peek.js');
  check('the viewer offers Colour by (skills or patterns) and Floors only, which shows only when the scan has the numbers', /id="watchBy"/.test(html) && /findPatterns\(base, \{ k: patternK \}\)/.test(js) && /id="watchFloors"[^>]*aria-checked="false" hidden/.test(html) && /\$\('watchFloors'\)\.hidden = !f/.test(js) && /setFloors/.test(view) && /Busiest floors/.test(js));
  check('the saved file is always the scan as made, never the patterns', /JSON\.stringify\(\{ \.\.\.base, parts \}\)/.test(js));
  check('the scan page offers attention heads, and says it all runs here', /id="watch-what"/.test(page) && /value="heads"/.test(page) && /runs here, on this replicant matrix/.test(page) && /what, own:/.test(page));
  check('Brain Engine\'s patch reports heads and floor activity, and Bob asks for heads only when chosen', /expert_trace_heads/.test(patch) && /kqv_out-/.test(patch) && /"heads"/.test(patch) && /heads \? \{ expert_trace_heads: true \} : \{\}/.test(peek));
}

// ---- load in and load out ----
{
  const box = { W: 5, D: 4, floors: 3, seed: 7 }, n = 60, per = 20;
  const seqOf = (r) => [...r].map((v, i) => [v, i]).sort((a, b) => a[0] - b[0]).map((p) => p[1]);
  check('every load style but All at once gives each place in the block its own turn', LOAD_STYLES.filter(([id]) => id !== 'none').every(([id]) => { const r = loadOrder(id, box); return r.length === n && new Set(r).size === n && Math.min(...r) === 0 && Math.max(...r) < 1; }));
  check('All at once shows everything from the first moment, and an unknown style is Random', loadOrder('none', box).every((v) => v === 0) && loadStyle('nonsense') === 'random' && loadStyle('vase') === 'vase');
  check('Random is the same for the same seed and different for another', String(loadOrder('random', box)) === String(loadOrder('random', box)) && String(loadOrder('random', box)) !== String(loadOrder('random', { ...box, seed: 8 })));
  check('Random mixes the floors, the printer styles build from the bottom floor up', seqOf(loadOrder('random', box)).slice(0, per).some((s) => s >= per) && ['spiral', 'lines', 'rings'].every((id) => seqOf(loadOrder(id, box)).every((s, k) => Math.floor(s / per) === Math.floor(k / per))));
  { const wall = (s) => { const i = s % per, x = i % 5, z = Math.floor(i / 5); return x === 0 || x === 4 || z === 0 || z === 3; }; const q = seqOf(loadOrder('vase', box));
    check('Vase, then fill: the outer wall of every floor first, then the inside', q.slice(0, 42).every(wall) && q.slice(42).every((s) => !wall(s)) && Math.floor(q[41] / per) === 2 && Math.floor(q[42] / per) === 0); }
  { const q = seqOf(loadOrder('spiral', { W: 5, D: 5, floors: 1 })); const far = (s) => Math.hypot(s % 5 - 2, Math.floor(s / 5) - 2);
    check('Archimedean spiral starts in the middle of the floor and ends at a corner', q[0] === 12 && far(q[24]) > 2.8 && far(q[1]) === 1); }
  { const q = seqOf(loadOrder('lines', box)); check('Rectilinear goes back and forth: each block is next to the one before it within a floor', q.slice(0, per).every((s, k) => k === 0 || Math.abs(s % 5 - q[k - 1] % 5) + Math.abs(Math.floor(s / 5) - Math.floor(q[k - 1] / 5)) === 1)); }
  check('the cube is told which brains are loaded, by the names it shows', String(cubeBrains([{ name: 'a.gguf' }, { name: 'b.gguf', beside: true }, { name: 'a.gguf' }, null], (x) => x.toUpperCase())) === 'A.GGUF,B.GGUF' && cubeBrains(null).length === 0);
  const view = read('public/watch-view.js'), js = read('public/watch.js'), cubeJs = read('public/mind-cube.js'), html = read('public/watch.html'), index = read('public/index.html'), server = read('src/server.js'), help = read('public/help-content.js');
  check('the drawing leaves out the blocks whose turn has not come, and nothing lights up meanwhile', /if \(!shown\(l \+ baseFloors, i\)\) continue;/.test(view) && /if \(reveal < 1\) lit = \[\];/.test(view) && /sweep, loading:/.test(view));
  check('with animations off the block simply appears', /if \(!rec \|\| !raf \|\| stillNow \|\| load === 'none' \|\| ms <= 0\) \{ reveal = to;/.test(view) && /view\.sweep\(1, LOAD_IN_MS, still\(\)\)/.test(js) && /if \(fresh && !still\(\)\)/.test(cubeJs) && /view\.sweep\(0, CUBE_OUT_MS, still\(\)\)/.test(cubeJs));
  check('the viewer takes the old block apart before the next scan loads in', /if \(rec && !still\(\) && !view\.loading\(\)\) \{ view\.sweep\(0, LOAD_OUT_MS\)/.test(js) && /loadIn\(\);\n\}/.test(js));
  check('Load in is a picker in the viewer and in the small cube\'s details, remembered under one name', /<select id="watchLoad"/.test(html) && /id="mindCubeLoadBox" class="muted" hidden/.test(index) && (js.match(/bob-fnri-load/g) || []).length === 2 && /bob-fnri-load/.test(cubeJs) && /loadBox\.hidden = !showDetails/.test(cubeJs));
  { const { SIGNS, pickSign } = await import('../public/mind-cube.js');
    check('with no brain loaded the cube shows one of five neon signs, picked at random, and says it in words', SIGNS.length === 5 && SIGNS.includes('VACANCY') && pickSign(() => 0) === 'VACANCY' && pickSign(() => 0.999) === 'Brain not found' && /The sign says: \$\{signNow\}/.test(cubeJs) && /\.still \.mind-cube p\.mind-cube-sign \{ animation: none; \}/.test(read('public/style.css')) && /prefers-reduced-motion: reduce\) \{ \.mind-cube p\.mind-cube-sign/.test(read('public/style.css')));
    const fakeLab = { brains: () => [{ id: 'riker', name: 'Riker', gguf: '/x/28Bob-Q4_K_M.gguf' }] };
    check('the cube gets each loaded brain\'s empty shape, and builds it in one colour before the first reply, still until Bob thinks', /function ready\(shapes, loading = ''\)/.test(cubeJs) && /const built = !rec && shell && shell\.label ===/.test(cubeJs) && /shapes = cubeShapes\(lab, \[\.\.\.now\.map\(\(m\) => m\?\.name\), loading\], friendlyName\)/.test(server) && cubeShapes(fakeLab, ['nothing-here']).length === 0 && CUBE_GROUPS === 256);
    check('a frame stamped before play() began never runs the cube backwards', /dt = Math\.max\(0, Math\.min\(0\.1,/.test(cubeJs)); }
  check('the small cube comes apart when its brain is let go, told by Bob to cube pages only', /type === 'cube-brains'\) \{ known = true; gone\(j\.labels, j\.shapes, j\.loading\)/.test(cubeJs) && /ev\?\.type === 'brain' && cubeClients\.size\) cubeBrainsNow\(\)/.test(server) && /for \(const res of cubeClients\) res\.write\(data\);\s*\} catch/.test(server));
  check('Help explains load in and load out, and the glossary has it', /<strong>Load in and load out\.<\/strong>/.test(help) && /<dt>Load in<\/dt>/.test(help) && /Vase, then fill/.test(help));
}

// ---- dials, and before and after ----
{
  const shape = { experts: 6, layers: 2 };
  const threw = (fn, re) => { try { fn(); return false; } catch (e) { return re.test(e.message); } };
  const d = cleanDials([{ kind: 'expert', layer: 0, index: 2, scale: 0.5 }, { kind: 'expert', layer: 0, index: 2, scale: 0 }, { kind: 'attn', layer: 1, index: 9, scale: 1.5 }, { kind: 'ffn', layer: 1, scale: 1 }, { kind: 'head', layer: 0, index: 3, scale: 99 }], shape);
  check('dials are tidied: one for each part (the last wins), nothing left at 1, the scale kept in range', d.length === 3 && d.find((x) => x.kind === 'expert').scale === 0 && d.find((x) => x.kind === 'attn').index === 0 && d.find((x) => x.kind === 'head').scale === DIAL_MAX && dialScale('x') === 1 && dialScale(0.333) === 0.33 && dialKey({ kind: 'ffn', layer: 1, index: 7 }) === 'ffn:1:0');
  check('a dial for a part the brain doesn\'t have is refused in plain words', threw(() => cleanDials([{ kind: 'expert', layer: 0, index: 6, scale: 0 }], shape), /experts 0 to 5/) && threw(() => cleanDials([{ kind: 'ffn', layer: 2, scale: 0 }], shape), /floors 1 to 2/) && threw(() => cleanDials([{ kind: 'expert', layer: 0, index: 0, scale: 0 }], { experts: 0, layers: 2 }), /no experts/) && threw(() => cleanDials([{ kind: 'x', layer: 0, scale: 0 }], shape), /expert, a head/) && threw(() => cleanDials('x', shape), /list/));
  const sp = { top: [[0, 0, 1, 1, -1, 1], [1, 0, 0, -1, 1, 1]] };
  check('a whole skill is turned at once: every expert that leans to it', skillDials(sp, 1, 1.5).map((x) => `${x.layer}:${x.index}`).join() === '0:2,0:3,0:5,1:0,1:4,1:5' && skillDials(sp, 1, 1.5).every((x) => x.kind === 'expert' && x.scale === 1.5) && skillDials(sp, 5, 2).length === 0);
  check('the dials are said in words', /Every part is as built/.test(dialWords([])) && /3 dials set \(1 expert, 1 attention head, the attention of 1 floor\): 2 turned up, 1 turned down\./.test(dialWords(d)));
  // before and after
  const mkRec = (clips) => ({ skills: [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }], clips });
  const clip = (skill, question, e, answer, prompt = 2) => ({ skill, question, e, answer, prompt, words: e.map(() => 'w') });
  const before = mkRec([clip('a', 'q1', [[[0, 1], [2, 3]], [[0, 1], [2, 3]], [[4], [5]]], 'yes'), clip('b', 'q2', [[[0, 1], [2, 3]], [[0, 1], [2, 3]]], 'no'), clip('b', 'only before', [[[0], [0]]], 'x', 1)]);
  const after = mkRec([clip('a', 'q1', [[[0, 5], [2, 3]], [[4, 5], [2, 3]], [[0], [0]]], 'maybe'), clip('b', 'q2', [[[1, 0], [3, 2]], [[0, 1], [2, 3]]], ' no ')]);
  const cmp = compareScans(before, after);
  check('before and after: questions are matched, the picks compared word for word over the question, answers as text', cmp.clips.length === 2 && cmp.clips[0].moved === 3 / 8 && cmp.clips[0].sameAnswer === false && cmp.clips[1].moved === 0 && cmp.clips[1].sameAnswer === true && cmp.same === 1 && cmp.changed === 1 && cmp.moved === 3 / 16 && cmp.per[0].moved === 3 / 8 && cmp.clips[1].before === 1);
  check('the same scan against itself moves nothing', compareScans(before, before).moved === 0 && compareScans(before, before).changed === 0);
  check('the comparison is said in words', /1 of 2 answers changed\. Reading the same questions, 19% of the picks moved to other blocks\. A moved most \(38%\), B least \(0%\)\./.test(compareWords(cmp)) && /don't share any questions/.test(compareWords(compareScans(mkRec([]), after))));
  { // two brains side by side: a cut brain lined up with the brain it was cut from by its keep list
    const stock = { ...before, brain: { name: 'Qwen 3.6 35B-A3B Q4_K_M', experts: 8, layers: 2, used: 2, kind: 'experts' } };
    const E = stock.brain.experts, L = stock.brain.layers, half = Math.floor(E / 2);
    const keep = { experts: E, layers: Array.from({ length: L }, (_, l) => Array.from({ length: half }, (_, x) => (x * 2 + l) % E)) };
    const cut = { ...stock, brain: { ...stock.brain, name: 'Riker Q4_K_M', experts: half }, clips: stock.clips.map((c) => ({ ...c, e: c.e.map((row) => row.map((ids, l) => ids.map((x) => keep.layers[l].indexOf(x)).filter((x) => x >= 0))) })) };
    const p = pairUp(stock, cut, { keepB: keep }), r = p.a ? compareScans(p.a, p.b) : null;
    check('a cut brain is lined up with its stock brain by its keep list, and where it kept the experts the picks match', p.lined === 'b' && p.b.brain.experts === E && r.clips.length === stock.clips.length && lineUp(cut, keep.layers, E).clips[0].e[0][0].every((x) => keep.layers[0].includes(x)) && /gave the same answer to/.test(pairWords(r, 'Qwen', 'Riker')));
    check('without a keep list, with a wrong one, or with different floors, two brains are refused in words', /no list of which experts/.test(pairUp(stock, cut).why) && keepMap({ layers: keep.layers.slice(1) }, { layers: L, experts: half }) === null && keepMap({ layers: keep.layers.map((k) => k.map(() => 0)) }, { layers: L, experts: half }) === null && /different number of floors/.test(pairUp(stock, { ...cut, brain: { ...cut.brain, layers: L + 1 } }).why));
    check('videos are named model-skill-quantization, and model-vs-model for two brains', videoName(cut, { skill: 'coding' }) === 'riker-coding-q4_k_m' && videoName(cut, { other: stock }) === 'riker-vs-qwen-3.6-35b-a3b-all-skills-q4_k_m' && videoName({ brain: { name: 'Bill' }, name: 'Bill, 12 skills' }, { skill: 'maths' }) === 'bill-maths');
  }
  { const mv = movedBlocks(before, after, { n: 3 }); check('the experts that moved most between two scans are found, biggest change first', mv.length === 3 && mv.every((t) => t.kind === 'expert') && mv.some((t) => t.layer === 0 && t.index === 1) && mv.some((t) => t.layer === 0 && t.index === 5) && movedBlocks(before, before).length === 0 && targetsOf([{ kind: 'ffn', layer: 1, index: 4, scale: 2 }])[0].index === 0); }
  const view = read('public/watch-view.js'), js = read('public/watch.js'), html = read('public/watch.html'), patch3 = read('engine/patches/0003-dials.patch'), readme = read('engine/README.md'), help = read('public/help-content.js'), srv = read('src/lab-watch.js');
  check('Brain Engine has the dials patch: experts, heads, attention and feed-forward, set over /dials and cleared with the prompt caches', /llama_set_dials/.test(patch3) && /LLAMA_DIAL_EXPERT/.test(patch3) && /LLAMA_DIAL_HEAD/.test(patch3) && /"\/dials"/.test(patch3) && /ffn_moe_weights_dialed/.test(patch3) && /cached prompts were computed with the old dials/.test(patch3) && /0003-dials\.patch/.test(readme) && !/thoth|heretic/i.test(patch3));
  check('the dials patch leaves ggml and the card backends alone', [...patch3.matchAll(/^diff --git a\/(\S+)/gm)].every((m) => /^(include\/llama\.h|src\/|tools\/server\/)/.test(m[1])));
  check('the viewer has Dials: what to turn, how loud, a list to take them off, and a scan again', ['watchDialWhat', 'watchDialFloor', 'watchDialPart', 'watchDialSkill', 'watchDialScale', 'watchDialSet', 'watchDialClear', 'watchDialList', 'watchDialSays', 'watchDialScan'].every((id) => html.includes(`id="${id}"`)) && /again: src\.id, dials, what:/.test(js) && /data-undial/.test(js) && /role="status"/.test(html.match(/<p id="watchDialSays"[^>]*>/)[0]));
  check('dialled blocks are marked by more than colour: a rim and a plus or a minus', /a solid rim, light when turned up and dark when turned down, with a tick mark/.test(view) && /light rim and a plus/.test(js));
  check('the dials reach the engine only for the scan, after the experts mask', /if \(dials\) await \(lab\.stepFns\.peekDials \|\| setDials\)\(srv\.url, dials\);/.test(srv) && /res\.status === 404\) throw new Error\(NO_DIALS\)/.test(srv));
  check('Before and after: a second picture that follows the first, opened by itself for a scan made from another', /id="watchCanvasB"/.test(html) && /id="watchCmpWith"/.test(html) && /class="watch-cmp" hidden aria-live="polite"/.test(html) && /function cmpFollow\(\)/.test(js) && /viewB\.draw\(litForB\(i, frac\)\)/.test(js) && /sel\.value = from; cmpWith\(from\);/.test(js));
  check('Help explains dials and before and after, with an FAQ and a glossary entry', /<strong>Dials: turn a part up or down\.<\/strong>/.test(help) && /<strong>Before and after\.<\/strong>/.test(help) && /id: 'faq-aifeui-dials'/.test(help) && /<dt>Dial<\/dt>/.test(help));
}

console.log(`\n${pass} passed, ${fail} failed`);
fs.rmSync(tmp, { recursive: true, force: true });
process.exit(fail ? 1 : 0);

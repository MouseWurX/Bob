// aiFEUI (the Lab's Playground): the scan of which experts a mixture-of-experts brain picks, and its viewer window.
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
import { readTrace, askTraced, tallyTrace, NO_TRACE } from '../src/lab-peek.js';
import { WATCH_SKILLS, PER_CHOICES, pickSkills, partsOf, clipOf, watchView, startWatch, readRecording, deleteRecording, listRecordings, watchRoute, WATCH_WORDS, WATCH_WORDS_THINK, cleanKeep } from '../src/lab-watch.js';
import { pagesRoute } from '../src/lab-pages.js';
import { NAME, LONG_NAME, FORMAT, VERSION, cleanRecording, specialise, timeline, inWords, expertDetail, lookOf, SKILL_LOOKS, sideOf, LEANS, partOf, PART_LABEL, say, cutOf, cutEffect, keepList } from '../public/lab-watch-math.js';

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
check('every skill has its own colour and letter, twelve of each', SKILL_LOOKS.length === 12 && new Set(SKILL_LOOKS.map((x) => x[0])).size === 12 && new Set(SKILL_LOOKS.map((x) => x[1])).size === 12 && lookOf(13)[1] === 'B');
check('a floor is as near square as the expert count allows', sideOf(256) === 16 && sideOf(128) === 12 && sideOf(8) === 3);
check('the name lives in one place', NAME === 'aiFEUI' && LONG_NAME === 'aiFunctional Expert Utilization Imager');

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
check('eight skills of six simple questions each, none repeated', WATCH_SKILLS.length === 8 && WATCH_SKILLS.every((s) => s.questions.length === 6 && s.label && /^[a-z]+$/.test(s.id)) && new Set(WATCH_SKILLS.flatMap((s) => s.questions)).size === 48);
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
  check('the page gets every brain it can read (with experts or without), the skills with their questions, and the choices', v.brains.length === 2 && v.brains[0].id === 'moe' && v.brains[0].experts === E && v.brains[1].experts === 0 && v.skills.length === 8 && v.skills[0].questions.length === 6 && v.per === 4 && v.words === WATCH_WORDS);
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
  check('the scan starts as a Lab job, with a step for each skill', r.started.kind === 'watch' && r.started.name === 'aiFEUI: Test MoE' && r.started.steps.length === 4 && lab.unloaded === true);
  check('a second job is refused while it runs', await startWatch(lab, { brain: 'moe' }).then(() => false, (e) => /already busy/.test(e.message)));
  await wait(lab);
  const run = lab.runs[lab.runs.length - 1];
  check('it loads the brain once, asks every question one at a time with the answer length capped, and unloads', run.state === 'done' && served === 1 && stopped === 1 && asked.length === 4 && asked.every(([, n]) => n === WATCH_WORDS) && asked[0][0] === WATCH_SKILLS[0].questions[0], run.error || '');
  const list = listRecordings(cfg, { id: 'moe', name: 'Test MoE' });
  check('the scan is listed with its skills, questions, words and what it saw', list.length === 1 && list[0].clips === 4 && list[0].words === 48 && list[0].skills.join() === 'Coding,Everyday chat' && /experts were picked/.test(list[0].saw) && run.report.watch.id === list[0].id);
  const got = readRecording(lab, { brain: 'moe', id: list[0].id });
  check('the viewer gets the clean recording with the brain\'s parts', got.format === FORMAT && got.clips.length === 4 && got.clips[0].prompt === 2 && got.clips[0].e.length === 12 && got.brain.experts === E && got.parts.layers.length === 2 && got.parts.outside > 0);
  const s = specialise(got);
  check('the made-up routing shows through: coding leans to experts 0 and 1, chat to 2 and 3, and both share 6 and 7', s.top[0][0] === 0 && s.top[0][2] === 1 && s.strength[1][6] === 0 && s.top[0][5] === -1);
  const onDisk = JSON.stringify(JSON.parse(fs.readFileSync(path.join(dataDir, 'lab', 'watch', 'moe', `${list[0].id}.json`), 'utf8')));
  check('the file on disk names the brain, never a folder or a path', !onDisk.includes(tmp.replace(/\\/g, '\\\\')) && !/gguf/i.test(onDisk) && /"name":"Test MoE"/.test(onDisk));
  // the routes
  const sent = []; const send = (res, code, body) => sent.push([code, body]);
  const call = (p, b, o = {}) => pagesRoute({ req: { method: o.get ? 'GET' : 'POST' }, res: {}, p, isLocal: o.isLocal !== false, lab, body: async () => b, send }).then((hit) => [hit, sent.pop()]);
  { const [hit, [code, body]] = await call('/api/lab/watch', null, { get: true }); check('GET /api/lab/watch gives the page its view', hit && code === 200 && body.skills.length === 8); }
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
  check('the Playground has the aiFEUI page, right after Peek inside', /\['peek', 'Peek inside'\], \['watch', 'aiFEUI'\]/.test(pg) && /watch: createWatchPage\(\{ api \}\)/.test(pg));
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
  check('an expert scan\'s words are left as they were', say({ brain: { kind: 'experts' } }, 'Not experts') === 'Not experts' && say(c5, 'Not experts') === 'Other parts' && say(c5, '<div class="watch-expert">One expert</div>') === '<div class="watch-expert">One neuron group</div>');
  const html = read('public/watch.html'), view = read('public/watch-view.js'), js = read('public/watch.js');
  check('the viewer starts as a cube of coloured glass, with a slider for how see-through', /id="watchGlass"/.test(html) && /id="watchCube"/.test(html) && /cubeGap/.test(view) && /glass/.test(view) && /data-solid=/.test(js) && /solid\.get\(top\)/.test(view) && /cube\(\);/.test(js));
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
}

console.log(`\n${pass} passed, ${fail} failed`);
fs.rmSync(tmp, { recursive: true, force: true });
process.exit(fail ? 1 : 0);

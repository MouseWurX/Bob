// 1.5.188 The Playground's Best answers page: a bigger brain judges, a smaller one learns from its own best answers
// (best-of-N), from better-or-worse pairs (DPO), or both, optionally only in the parts fNRI points at. Fake engine,
// fake trainer: no Python, no downloads, never the tester's own machine.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { Lab } from '../src/lab.js';
import { readQuestions, holdBack, checkable, checkAnswer, judgeMessages, parseScores, pick, cleanTargets, resolveTargets, planBest, startBest, useBest, bestView, bestParts, listTargetFiles, GOOD, HOLD } from '../src/lab-best.js';
import { TEACH_PY } from '../src/lab-teach-script.js';
import { pagesRoute } from '../src/lab-pages.js';
import { PLAY_PAGES } from '../public/lab-playground.js';
import { HELP } from '../public/help-content.js';

let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra ? ' ' + extra : ''}`); };
const read = (p) => fs.readFileSync(new URL(`../${p}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bob-lab-best-'));
const wait = async (lab) => { for (let i = 0; i < 300 && lab.job; i++) await new Promise((r) => setTimeout(r, 10)); };

// ---- tiny made-up brain files: one tensor whose shape says how many weights it has ----
function kv(key, type, value) {
  const k = Buffer.from(key); const h = Buffer.alloc(12 + k.length); h.writeBigUInt64LE(BigInt(k.length)); k.copy(h, 8); h.writeUInt32LE(type, 8 + k.length);
  let v;
  if (type === 8) { const s = Buffer.from(value); v = Buffer.alloc(8 + s.length); v.writeBigUInt64LE(BigInt(s.length)); s.copy(v, 8); }
  else { v = Buffer.alloc(4); v.writeUInt32LE(value); }
  return Buffer.concat([h, v]);
}
function makeGguf(file, kvs, dims) {
  const parts = [Buffer.alloc(24)]; parts[0].write('GGUF', 0, 'latin1'); parts[0].writeUInt32LE(3, 4); parts[0].writeBigUInt64LE(1n, 8); parts[0].writeBigUInt64LE(BigInt(kvs.length), 16);
  for (const [k, ty, v] of kvs) parts.push(kv(k, ty, v));
  const n = Buffer.from('token_embd.weight'); const b = Buffer.alloc(8 + n.length + 4 + 16 + 12);
  let o = 0; b.writeBigUInt64LE(BigInt(n.length), o); o += 8; n.copy(b, o); o += n.length; b.writeUInt32LE(2, o); o += 4; b.writeBigUInt64LE(BigInt(dims[0]), o); o += 8; b.writeBigUInt64LE(BigInt(dims[1]), o); o += 8; b.writeUInt32LE(0, o); o += 4; b.writeBigUInt64LE(0n, o);
  parts.push(b);
  let head = Buffer.concat(parts); head = Buffer.concat([head, Buffer.alloc(Math.ceil(head.length / 32) * 32 - head.length)]);
  fs.writeFileSync(file, Buffer.concat([head, Buffer.alloc(64)]));
}
const moe = (name, repo) => [['general.architecture', 8, 'qwen3moe'], ['qwen3moe.block_count', 4, 2], ['qwen3moe.expert_count', 4, 4], ['qwen3moe.expert_used_count', 4, 1], ['qwen3moe.context_length', 4, 40960], ['general.file_type', 4, 15], ['general.name', 8, name], ...(repo ? [['general.base_model.0.repo_url', 8, `https://huggingface.co/${repo}`]] : [])];
const smallFile = path.join(tmp, 'small.gguf'), bigFile = path.join(tmp, 'big.gguf'), otherFile = path.join(tmp, 'other.gguf');
makeGguf(smallFile, moe('Small', 'Qwen/Qwen3-4B'), [100000, 40000]);   // 4B
makeGguf(bigFile, moe('Big'), [100000, 300000]);                         // 30B
makeGguf(otherFile, [['general.architecture', 8, 'llama'], ['llama.block_count', 4, 2], ['general.file_type', 4, 15], ['general.name', 8, 'Other']], [100000, 20000]); // 2B

const dataDir = path.join(tmp, 'data'); fs.mkdirSync(dataDir, { recursive: true });
const exe = (n) => (process.platform === 'win32' ? `${n}.exe` : n);
const cfg = { dataDir, agentDir: tmp, bobModelsDir: path.join(tmp, 'models', 'bob'), settingsFile: path.join(dataDir, 'settings.json'), computerLab: true, gpuVramGB: 16, llamacpp: { exe: path.join(tmp, 'eng', exe('llama-server')) } };
fs.mkdirSync(path.join(tmp, 'eng')); for (const n of ['llama-server', 'llama-imatrix', 'llama-quantize', 'llama-export-lora']) fs.writeFileSync(path.join(tmp, 'eng', exe(n)), '');
const files = { small: smallFile, big: bigFile, other: otherFile };
const catalog = { models: [{ id: 'small', name: 'Small', family: 'Qwen', category: 'chat', license: 'apache-2.0' }, { id: 'big', name: 'Big', family: 'Qwen', category: 'chat' }, { id: 'other', name: 'Other', family: 'Llama', category: 'chat' }] };
const shop = { cfg, catalog, locate: (e) => (files[e.id] ? { gguf: files[e.id] } : {}) };
const hfFetch = async (url) => ({ ok: true, status: 200, json: async () => (/3\.6/.test(url) ? { cardData: { license: 'apache-2.0' }, safetensors: { total: 35e9 }, config: { architectures: ['Qwen3_5MoeForConditionalGeneration'] }, siblings: [{ rfilename: 'model.safetensors' }] } : { cardData: { license: 'apache-2.0' }, safetensors: { total: 4.0e9 }, siblings: [{ rfilename: 'model.safetensors' }] }) });

// The lessons: 40 questions; the even ones carry a short exact answer (a number), the odd ones a long one.
const setDir = path.join(dataDir, 'lab', 'lessons', 'maths'); fs.mkdirSync(setDir, { recursive: true });
fs.writeFileSync(path.join(setDir, 'lessons.jsonl'), Array.from({ length: 40 }, (_, i) => JSON.stringify({ messages: [{ role: 'user', content: `Question ${i}: what is ${i} + ${i}?` }, { role: 'assistant', content: i % 2 ? `It is ${2 * i}, because adding a number to itself doubles it.` : String(2 * i) }] })).join('\n'));
fs.writeFileSync(path.join(setDir, 'write.json'), JSON.stringify({ name: 'Maths' }));

// An fNRI scan of Small: experts 0 and 1 lean to maths, 2 and 3 to words. And a parts list saved from the viewer.
const watch = path.join(dataDir, 'lab', 'watch', 'small'); fs.mkdirSync(watch, { recursive: true });
const clip = (skill, ex) => ({ skill, question: 'q', answer: 'a', prompt: 1, words: ['a', 'b', 'c'], e: [[[ex[0]], [ex[1]]], [[ex[0]], [ex[1]]], [[ex[0]], [ex[1]]]] });
fs.writeFileSync(path.join(watch, 'scan1.json'), JSON.stringify({ format: 'bob-expert-recording', version: 1, id: 'scan1', name: 'Small scan', when: '2026-11-10', brain: { name: 'Small', experts: 4, layers: 2, used: 1 }, skills: [{ id: 'maths', label: 'Maths' }, { id: 'words', label: 'Words' }], clips: [clip('maths', [0, 1]), clip('maths', [1, 0]), clip('words', [2, 3]), clip('words', [3, 2])] }));
fs.writeFileSync(path.join(watch, 'targets-dialled.json'), JSON.stringify({ format: 'bob-fnri-targets', version: 1, brain: { name: 'Small', experts: 4, layers: 2, kind: 'experts' }, from: 'scan1', why: 'dials', label: 'The blocks I dialled', at: 5, targets: [{ kind: 'expert', layer: 0, index: 2 }, { kind: 'attn', layer: 1, index: 0 }] }));

// ---- the fake engine: answers differ by seed, the judge prefers answers that say the right number ----
const served = [], judged = [];
const right = (q) => 2 * Number(q.match(/what is (\d+)/)[1]);
const chat = async (url, messages, o = {}) => {
  const last = messages[messages.length - 1].content;
  if (/^You grade answers/.test(messages[0].content)) {
    judged.push(last);
    const n = Number(last.match(/Score all (\d+) answers/)[1]);
    const want = right(last);
    const answers = [...last.matchAll(/Answer \d+:\n([^\n]*)/g)].map((m) => m[1]);
    return JSON.stringify({ scores: answers.slice(0, n).map((a) => (a.includes(String(want)) ? 9 : 2)) });
  }
  const want = right(last);
  if (url === 'judge') return `The answer is ${want}.`;
  if (url === 'after') return `It's ${want}.`;
  if (o.temperature === 0) return url === 'learner' ? `Maybe ${want + 1}.` : `${want}`;
  return o.seed % 2 ? `I think it is ${want}.` : `It is ${want + 3}.`;
};
const serve = async (gguf) => { served.push(path.basename(gguf)); return { url: gguf === smallFile ? 'learner' : gguf === bigFile ? 'judge' : /Q4_K_M/.test(gguf) && !/before/.test(gguf) ? 'after' : 'learner', stop: () => {} }; };
const calls = [];
const tool = async (exe, args, o) => {
  calls.push([path.basename(exe), args]);
  const out = args[args.indexOf('-o') + 1] || args[args.indexOf('--outfile') + 1];
  if (args.includes('Q4_K_M')) fs.writeFileSync(args[1], Buffer.alloc(1000));
  else if (out && (args.includes('-o') || args.includes('--outfile'))) fs.writeFileSync(out, '');
  if (String(args[0]).endsWith('teach.py')) { if (args.includes('--targets')) o.onLine('targets 7 1'); for (let i = 1; i <= 3; i++) o.onLine(`progress ${i} 3`); o.onLine('loss 0.5'); if (args.includes('--pairs')) o.onLine('pairs 9 8'); o.onLine('done 20'); }
  return '';
};
const mk = () => {
  const l = new Lab(cfg, { shop, room: () => ({ ok: true, why: '' }), broadcast: () => {}, steps: { serve, chat, tool, quiz: async (lab, gguf) => ({ score: gguf === smallFile ? 40 : 55, tps: 30 }), download: async (u, out) => { fs.mkdirSync(path.dirname(out), { recursive: true }); fs.writeFileSync(out, ''); } } });
  l.platform = () => ({ os: 'win', arch: 'x64' }); l.gpuInfo = async () => ({ name: 'NVIDIA GeForce RTX 5070 Ti', vramGB: 16 }); l.freeGB = () => 1000; l.hfFetch = hfFetch;
  return l;
};
// A Trainer pack that's "here", so teaching here can start.
const trDir = path.join(tmp, 'trainer'); const py = process.platform === 'win32' ? path.join(trDir, 'venv', 'Scripts', 'python.exe') : path.join(trDir, 'venv', 'bin', 'python');
fs.mkdirSync(path.dirname(py), { recursive: true }); fs.writeFileSync(py, ''); fs.mkdirSync(path.join(trDir, 'llama.cpp'), { recursive: true }); fs.writeFileSync(path.join(trDir, 'llama.cpp', 'convert_hf_to_gguf.py'), ''); fs.writeFileSync(path.join(trDir, 'trainer.json'), JSON.stringify({ ok: true, python: path.relative(trDir, py), version: 'test' }));

// ---- the pieces ----
{
  const qs = readQuestions(path.join(setDir, 'lessons.jsonl'), 100);
  check('questions keep the question and use the lesson\'s own answer as the key', qs.length === 40 && qs[0].messages.length === 1 && qs[0].messages[0].role === 'user' && qs[0].key === '0' && /doubles/.test(qs[1].key));
  const alt = path.join(tmp, 'alt.jsonl'); fs.writeFileSync(alt, [JSON.stringify({ question: 'Why is the sky blue?' }), JSON.stringify({ instruction: 'Add', input: '2 and 2', output: '4' }), 'not json', JSON.stringify({ messages: [{ role: 'assistant', content: 'no question' }] })].join('\r\n'));
  const q2 = readQuestions(alt);
  check('other lesson shapes are read, bad lines skipped, a question with no answer has no key', q2.length === 2 && q2[0].key === '' && q2[1].key === '4' && /2 and 2/.test(q2[1].messages[0].content));
  check('a limit caps how many questions are read', readQuestions(path.join(setDir, 'lessons.jsonl'), 10).length === 10);
  const h = holdBack(40);
  check(`about a tenth is held back (at least ${HOLD.min}), spread through the list`, h.size === HOLD.min && Math.max(...h) > 30 && Math.min(...h) < 10 && holdBack(6).size === 0);
  check('a short exact answer is checkable; a sentence isn\'t', checkable('42') && checkable('Paris') && !checkable('It is 42 because it doubles') && !checkable(''));
  check('the checker reads the last number, or the word on its own', checkAnswer('First 3, so the answer is 42.', '42') === 10 && checkAnswer('It is 41.', '42') === 0 && checkAnswer('The capital is Paris.', 'paris') === 10 && checkAnswer('Parisian food', 'paris') === 0 && checkAnswer('1,000 of them', '1000') === 10);
  const jm = judgeMessages({ messages: [{ role: 'user', content: 'Why?' }] }, ['A', 'B'], { key: 'Because.' });
  check('the judge sees the question, the known good answer and every answer, and is told length is no virtue', /Question: Why\?/.test(jm[1].content) && /known good answer/.test(jm[1].content) && /Answer 2:\nB/.test(jm[1].content) && /length is not a virtue/.test(jm[0].content));
  check('scores are read from JSON or a list of numbers, clamped, or not at all', parseScores('{"scores":[3, 11, -1]}', 3).join() === '3,10,0' && parseScores('Scores: 7, 8', 2).join() === '7,8' && parseScores('<think>1 2 3</think>{"scores":[5]}', 2) === null && parseScores('nothing', 1) === null);
  const pk = pick([2, 9, 5, 2]);
  check(`the best is taught when it scores ${GOOD} or more; a pair needs a clear gap`, pk.best === 1 && pk.worst === 0 && pk.good && pk.pair && !pick([4, 5]).good && !pick([7, 8]).pair && !pick([5, 5]).pair);
  check('parts are checked against the brain\'s shape', cleanTargets([{ kind: 'expert', layer: 1, index: 3 }, { kind: 'expert', layer: 1, index: 3 }, { kind: 'ffn', layer: 0 }], { layers: 2, experts: 4 }).length === 2 && /floors 1 to 2/.test((() => { try { cleanTargets([{ kind: 'attn', layer: 2 }], { layers: 2, experts: 4 }); } catch (e) { return e.message; } })()) && /experts 0 to 3/.test((() => { try { cleanTargets([{ kind: 'expert', layer: 0, index: 4 }], { layers: 2, experts: 4 }); } catch (e) { return e.message; } })()) && /is an expert/.test((() => { try { cleanTargets([{ kind: 'neuron', layer: 0 }], { layers: 2 }); } catch (e) { return e.message; } })()));
}

// ---- parts from fNRI ----
{
  const lab = mk();
  const sk = resolveTargets(lab, 'small', { kind: 'skill', recording: 'scan1', skill: 'maths' });
  check('a skill\'s experts come from an fNRI scan: only the ones that lean to it', sk.list.length === 4 && sk.list.every((t) => t.kind === 'expert' && t.index <= 1) && /Maths/.test(sk.label));
  const fl = resolveTargets(lab, 'small', { kind: 'file', id: 'dialled' });
  check('a parts list saved in the fNRI viewer is read and checked', fl.list.length === 2 && fl.list[1].kind === 'attn' && fl.label === 'The blocks I dialled');
  check('the whole brain is the default', resolveTargets(lab, 'small', {}).list === null && resolveTargets(lab, 'small', { kind: 'none' }).list === null);
  check('the parts lists are listed for the picker, and the scans with their skills', listTargetFiles(cfg, { id: 'small' }).length === 1 && bestParts(lab, 'small').recordings[0].skills.length === 2 && bestParts(lab, 'small').lists[0].count === 2);
  fs.writeFileSync(path.join(watch, 'targets-wrong.json'), JSON.stringify({ format: 'bob-fnri-targets', version: 1, brain: { experts: 128, layers: 48 }, label: 'x', targets: [] }));
  check('a list made for another shape of brain is refused', /another shape/.test((() => { try { resolveTargets(lab, 'small', { kind: 'file', id: 'wrong' }); } catch (e) { return e.message; } })()));
}

// ---- the plan ----
{
  const lab = mk();
  const base = { name: 'Small Best', learner: 'small', judge: 'big', questions: { kind: 'set', id: 'maths' } };
  const p = await planBest(lab, base);
  check('Small learns here on a 16 GB card, judged by Big; nothing to fix', p.where === 'here' && !p.problems.length && p.answers === 4 && p.way === 'best' && p.questions.count === 40 && p.questions.held === 5 && p.minutes >= 1, p.problems.join(' | '));
  check('the plan says what is held back and that the judge answers where none was good', /held back/.test(p.notes.join(' ')) && /writes its own answer/.test(p.notes.join(' ')));
  check('a judge that isn\'t bigger, or the same brain, is refused in words', /isn't bigger/.test((await planBest(lab, { ...base, learner: 'big', judge: 'small' })).problems.join(' ')) && /can't judge itself/.test((await planBest(lab, { ...base, judge: 'small' })).problems.join(' ')));
  check('a judge from another family can judge, with a note', !(await planBest(lab, { ...base, learner: 'other', judge: 'big', weights: { kind: 'hf', repo: 'Qwen/Qwen3-4B' } })).problems.some((x) => /family/.test(x)) && /another family/.test((await planBest(lab, { ...base, learner: 'other', judge: 'big', weights: { kind: 'hf', repo: 'Qwen/Qwen3-4B' } })).notes.join(' ')));
  const pt = await planBest(lab, { ...base, targets: { kind: 'skill', recording: 'scan1', skill: 'maths' } });
  check('teaching only a skill\'s parts says how many, and that the rest stays frozen', pt.targets.count === 4 && /stays frozen/.test(pt.notes.join(' ')));
  const pr = await planBest(lab, { ...base, where: 'rented', way: 'pairs', targets: { kind: 'skill', recording: 'scan1', skill: 'maths' } });
  check('rented: pairs and parts-only are here-only for now, said plainly', pr.where === 'rented' && pr.problems.some((x) => /best answers only/.test(x)) && pr.problems.some((x) => /whole brain/.test(x)));
  check('no learner or no judge asks for one', /brain that learns/.test((await planBest(lab, { ...base, learner: '' })).problems.join(' ')) && /brain that judges/.test((await planBest(lab, { ...base, judge: '' })).problems.join(' ')));
  const v = bestView(lab);
  check('the view lists the brains with their sizes, the lesson sets and the choices', v.brains.find((b) => b.id === 'big').paramsB === 30 && v.sets.some((s) => s.id === 'maths') && v.answers.join() === '2,4,8' && v.limits.includes(200));
}

// ---- the job, here: best of its own, then both with parts-only ----
{
  const lab = mk();
  served.length = 0; calls.length = 0; judged.length = 0;
  const res = await startBest(lab, { name: 'Small Best', learner: 'small', judge: 'big', questions: { kind: 'set', id: 'maths' } });
  await wait(lab);
  const run = lab.runs[lab.runs.length - 1], t = run.report || {};
  check('it runs as one Lab job: questions, answers, judging, teaching, fold, after', res.started && run.state === 'done' && run.steps.length === 6 && run.steps.every((s) => s.state === 'done'), run.error || '');
  check('the small brain answers, then the big one judges, then the new one answers, then the judge again', served.join() === 'small.gguf,big.gguf,small-best-Q4_K_M.gguf,big.gguf', served.join());
  check('every non-held question was answered 4 times; the short exact ones were checked, not judged', t.asked === 40 && t.answers === 4 && t.checked > 0 && t.judged > 0 && t.checked + t.judged === 40);
  check('the best answers it taught are its own right ones; the held-back ones were never taught', t.taughtBest === 35 && t.rescued === 0 && t.held === 5);
  const best = fs.readFileSync(path.join(dataDir, 'lab', 'best', 'small-best', 'best.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l));
  check('each lesson is the question with its best answer', best.length === 35 && best.every((b) => b.messages.length === 2 && b.messages[1].role === 'assistant' && /I think it is/.test(b.messages[1].content)));
  const heldQs = [...holdBack(40)].map((i) => `Question ${i}:`);
  check('held-back questions are not in the lessons', !best.some((b) => heldQs.some((h) => b.messages[0].content.startsWith(h))));
  check('before and after on the held-back questions: it got better', t.before.judge === 0 && t.after.judge === 100 && t.from.score === 40 && t.made.score === 55, JSON.stringify([t.before, t.after]));
  check('the trainer got the best answers, no pairs, the whole brain', calls.some(([, a]) => String(a[0]).endsWith('teach.py') && a.includes('--lessons') && !a.includes('--pairs') && !a.includes('--targets')));
  check('the line under it says what was taught and what changed', /scored it 0 out of 100 before and 100 after/.test(t.saw) && /best of 4/.test(t.saw));
  check('best and worst examples are kept to show side by side', t.examples.length > 0 && t.examples[0].bestScore > t.examples[0].worstScore);
  useBest(lab, run.id);
  const made = JSON.parse(fs.readFileSync(path.join(dataDir, 'lab', 'made.json'), 'utf8')).find((m) => m.id === 'lab-best-small-best');
  check('Use in Bob says it was made here from its own best answers, judged by Big, and isn\'t the default', made?.madeHere && /own best answers, judged by Big/.test(made.what) && !cfg.models);

  calls.length = 0;
  await startBest(lab, { name: 'Small Both', learner: 'small', judge: 'big', way: 'both', questions: { kind: 'set', id: 'maths' }, targets: { kind: 'skill', recording: 'scan1', skill: 'maths' } });
  await wait(lab);
  const r2 = lab.runs[lab.runs.length - 1];
  const targ = JSON.parse(fs.readFileSync(path.join(dataDir, 'lab', 'best', 'small-both', 'targets.json'), 'utf8'));
  check('both ways: best answers and pairs go to the trainer, with the parts list', r2.state === 'done' && calls.some(([, a]) => String(a[0]).endsWith('teach.py') && a.includes('--lessons') && a.includes('--pairs') && a.includes('--targets')) && targ.targets.length === 4, r2.error || '');
  check('parts-only teaches those weights themselves (no adapter) and makes the file straight from the taught brain', calls.some(([, a]) => String(a[0]).endsWith('teach.py') && a.includes('--direct')) && !calls.some(([e]) => e.startsWith('llama-export-lora')) && calls.some(([e, a]) => e.startsWith('llama-quantize') && a.includes('Q4_K_M')) && fs.existsSync(r2.files.gguf) && !fs.existsSync(path.join(cfg.bobModelsDir, 'lab', 'best', 'small-both', 'taught')));
  check('the report says how many parts changed, how many fell back, and the pairs leaned the right way', r2.report.parts.modules === 7 && r2.report.parts.fellBack === 1 && r2.report.pairsLeaned === 8 && r2.report.pairs > 0 && /Only 7 parts/.test(r2.report.saw));
  const pairs = fs.readFileSync(path.join(dataDir, 'lab', 'best', 'small-both', 'pairs.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l));
  check('each pair is the question, the better answer and the worse one', pairs.every((x) => /I think it is/.test(x.chosen) && /It is \d+\./.test(x.rejected) && x.messages[0].role === 'user'));

  // Nothing good of its own: the judge writes the answer, or it's skipped.
  const lab2 = mk(); lab2.stepFns.chat = async (url, messages, o) => (/^You grade/.test(messages[0].content) ? JSON.stringify({ scores: [1, 1, 1, 1] }) : url === 'judge' ? 'The judge says so.' : 'nope');
  await startBest(lab2, { name: 'Rescued', learner: 'small', judge: 'big', key: false, questions: { kind: 'set', id: 'maths' } }); await wait(lab2);
  const r3 = lab2.runs[lab2.runs.length - 1];
  check('when none of its answers is good enough, the judge writes its own and that is taught', r3.state === 'done' && r3.report.rescued === 35 && r3.report.taughtBest === 35 && r3.report.checked === 0, r3.error || '');
  const lab3 = mk(); lab3.stepFns.chat = lab2.stepFns.chat;
  await startBest(lab3, { name: 'Nothing', learner: 'small', judge: 'big', key: false, rescue: false, questions: { kind: 'set', id: 'maths' } }); await wait(lab3);
  const r4 = lab3.runs[lab3.runs.length - 1];
  check('with nothing good and no help from the judge, it stops and says why, before any teaching', r4.state === 'failed' && /None of the answers scored well enough/.test(r4.error) && r4.steps.find((s) => s.id === 'teach').state === 'waiting');
}

// ---- the job, rented: answers and judging here, a Forge plan with caps 0 ----
{
  const lab = mk();
  served.length = 0;
  await startBest(lab, { name: 'Big Learner', learner: 'small', judge: 'big', where: 'rented', weights: { kind: 'hf', repo: 'Qwen/Qwen3.6-35B-A3B' }, questions: { kind: 'set', id: 'maths' } });
  await wait(lab);
  const run = lab.runs[lab.runs.length - 1];
  const plan = JSON.parse(fs.readFileSync(path.join(dataDir, 'lab', 'forge-plans', 'big-learner.json'), 'utf8'));
  check('rented: the answers and judging run here, then the best answers are saved as a Forge plan with caps at 0', run.state === 'done' && served.join() === 'small.gguf,big.gguf' && plan.teacher === 'Qwen/Qwen3.6-35B-A3B' && plan.hours_max === 0 && plan.dollars_max === 0 && /best\.jsonl$/.test(plan.extra_lessons[0]) && /Nothing is rented yet/.test(run.report.line), run.error || '');
}

// ---- the route ----
{
  const lab = mk();
  const out = [];
  const send = (res, code, body) => out.push([code, body]);
  const call = async (p, b, isLocal = true) => { out.length = 0; await pagesRoute({ req: { method: b ? 'POST' : 'GET' }, res: {}, p, isLocal, lab, body: async () => b, send }); return out[0]; };
  check('GET the page view', (await call('/api/lab/best'))[0] === 200);
  const [c1, pl] = await call('/api/lab/best/plan', { name: 'X', learner: 'small', judge: 'big', questions: { kind: 'set', id: 'maths' } });
  check('the plan reaches the page without file paths', c1 === 200 && !JSON.stringify(pl).includes(dataDir) && !JSON.stringify(pl).includes(tmp) && pl.where === 'here');
  check('another device sees the parts but can\'t plan or start', (await call('/api/lab/best/parts', { brain: 'small' }, false))[0] === 200 && (await call('/api/lab/best/start', { name: 'X' }, false))[0] === 403);
}

// ---- the trainer script, the page and Help ----
{
  check('the trainer has the pairs pass, the parts-only adapter, and says how it went', /--pairs/.test(TEACH_PY) && /--targets/.test(TEACH_PY) && /logsigmoid/.test(TEACH_PY) && /print\('targets %d %d'/.test(TEACH_PY) && /print\('pairs %d %d'/.test(TEACH_PY) && /disable|ref\.append/.test(TEACH_PY));
  const py = path.join(tmp, 'teach.py'); fs.writeFileSync(py, TEACH_PY);
  // A real Python only: on most Windows PCs "python" is the Microsoft Store stub, which starts and exits with
  // "Python was not found". Probe with an empty program first (and try the py launcher), and skip if none runs.
  const pyCmd = (process.platform === 'win32' ? [['py', '-3'], ['python'], ['python3']] : [['python3'], ['python']])
    .find(([c0, ...a0]) => { const r = spawnSync(c0, [...a0, '-c', ''], { timeout: 20000 }); return !r.error && r.status === 0; });
  if (!pyCmd) console.log('SKIP the trainer is valid Python (no Python here)');
  else { const [c0, ...a0] = pyCmd; const c = spawnSync(c0, [...a0, '-c', `import ast,sys; ast.parse(open(sys.argv[1], encoding='utf-8').read())`, py]); check('the trainer is valid Python', c.status === 0, String(c.stderr || '')); }
  check('Best answers is a Playground page, after Teach it', PLAY_PAGES.findIndex(([id]) => id === 'best') === PLAY_PAGES.findIndex(([id]) => id === 'teach') + 1);
  for (const f of ['public/lab-best.js', 'src/lab-best.js']) { check(`${f} parses`, spawnSync(process.execPath, ['--check', fileURLToPath(new URL(`../${f}`, import.meta.url))]).status === 0); check(`${f} names no private brain`, !/thoth|heretic|bob[i]verse/i.test(read(f))); }
  check('the page uses the label fNRI\'s button points at', /Teach only these parts/.test(read('public/lab-best.js')));
  const h = HELP.find((x) => x.id === 'lab-best');
  check('Help explains it in Bob\'s voice: both ways, the parts, held back, rented', h && /Best of its own/.test(h.html) && /Better and worse pairs/.test(h.html) && /Teach only these parts/.test(h.html) && /held back/.test(h.html) && /Forge/.test(h.html) && /\bI\b/.test(h.html));
  check('a glossary entry and an FAQ', /Best-of-N|best of N/i.test(HELP.map((x) => x.html).join(' ')) && HELP.some((x) => x.group === 'FAQ' && /judge/i.test(x.title)));
  check('the release note is there', fs.readdirSync(new URL('../docs/releases/', import.meta.url)).some((f) => /^v[\d.]+\.md$/.test(f) && /Best answers/.test(read(`docs/releases/${f}`)))); // any version: the builder numbers it
}

console.log(`\n${pass} passed, ${fail} failed`);
fs.rmSync(tmp, { recursive: true, force: true });
process.exit(fail ? 1 : 0);

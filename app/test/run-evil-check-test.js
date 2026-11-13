// The rental's checks (13 Nov): the smoke gate (stop = exit 86, the Forge deletes the pod), the evil check (measure only, no
// tools, live dials that go back), the live switches for the Riker sweep, and the plan that strings them together.
// Nothing here reads the real computer: a made-up Brain Engine server answers on a local port.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { oddsCheck, lessonCheck, STOP } from '../model-lab/smoke-gate.mjs';
import { leaning, candShare, rowsAfter, report, declined } from '../model-lab/evil-check.mjs';
import { bestN, keepOf } from '../model-lab/set-live.mjs';
import { pairedGap, wilson, turnsOf, countsOf, addCounts } from '../model-lab/engine-live.mjs';
import { pickLessons } from '../model-lab/trace-read.mjs';

let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra ? ' ' + extra : ''}`); };
const here = path.dirname(fileURLToPath(import.meta.url)), lab = path.join(here, '..', 'model-lab');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bob-evil-check-'));
const read = (f) => fs.readFileSync(f, 'utf8').replace(/\r\n/g, '\n');

// ---- smoke gate ----
{
  const o = oddsCheck([{ turns: [{ covers: 'think+answer', odds: [['a', -1, []]] }, { covers: 'answer', odds: [['b', -1, []]] }] }]);
  check('(a) odds that include the thinking are seen', o.verdict === 'odds cover the thinking', JSON.stringify(o));
  check('(a) answer-only odds are marked, not a stop', oddsCheck([{ turns: [{ covers: 'answer-only', odds: [['a', -1, []]] }] }]).verdict === 'answer-only');
  const good = (i) => ({ idea: `i${i}`, messages: [{ role: 'user', content: 'x' }, { role: 'assistant', tool_calls: [{ function: { name: 'read_file', arguments: '{"path":"a.txt"}' } }] }] });
  check('(b) four reviewed lessons with tool calls that parse pass', lessonCheck([0, 1, 2, 3].map(good), [], 4).ok);
  const bad = { idea: 'z', messages: [{ role: 'assistant', tool_calls: [{ function: { name: 'run', arguments: '{"cmd": ' } }] }] };
  const b = lessonCheck([good(0), good(1), good(2), bad], [{ why: 'wrong tool' }], 4);
  check('(b) a tool call that does not parse stops the run', !b.ok && b.bad === 1 && b.problems.some((p) => /don't parse/.test(p)), JSON.stringify(b.problems));
  check('(b) too few lessons through the review stops the run', !lessonCheck([good(0)], [{ why: 'x' }], 4).ok);
  check('(b) lessons with no tool at all stop the run', !lessonCheck([0, 1, 2, 3].map((i) => ({ idea: i, messages: [{ role: 'assistant', content: 'hi' }] })), [], 4).ok);
  check('the gate stops with exit 86', STOP === 86);
  const forge = read(path.join(lab, 'forge', 'forge.mjs'));
  check('the Forge ends the run and deletes the pod when a command exits 86', /code === 86/.test(forge) && /const stop = await benchOnPod\(bm\[1\]\); if \(stop\) \{ await kill\(stop\); return true; \}/.test(forge));
  check('the Forge brings the evil check\'s direction files home before the PC runs its commands', /bench\/evil-\$\{name\}\//.test(forge));
  check('a plan with no_hands tells every command (LAB_NO_HANDS)', /plan\.no_hands \? \{ LAB_NO_HANDS: '1' \}/.test(forge));
}

// ---- write-lessons marks what its odds cover ----
{
  const wl = read(path.join(lab, 'write-lessons.mjs'));
  check('write-lessons marks every turn\'s odds think+answer, answer-only or answer', /covers: oddsCover\(pk, msg\.reasoning_content\)/.test(wl) && /'answer-only'/.test(wl));
  check('write-lessons can mark a calibration set that is never trained on', /\['calib', 'smoke'\]/.test(wl) && /split: splitTag/.test(wl));
}

// ---- evil check pieces ----
{
  const rows = [{ t: '<|im_start|>' }, { t: 'system' }, { t: 'cruel' }, { t: '<|im_start|>' }, { t: 'user' }, { t: 'ask' }, { t: 'words' }];
  check('only the ask\'s own words count, never the persona\'s', rowsAfter(rows, 'user').map((r) => r.t).join() === 'ask,words');
  const evil = [[10, 0, 90, 0]], plain = [[50, 50, 0, 0]];
  const l = leaning(evil, plain, { minShare: 0.01, minLift: 1.5 });
  check('an expert used far more under the cruel persona is a candidate', l.length === 1 && l[0].index === 2 && l[0].layer === 0, JSON.stringify(l));
  check('the share of routing on the candidates', Math.abs(candShare([[10, 0, 90, 0]], l) - 0.9) < 1e-9);
  check('declines are seen in the first lines', declined("I can't help with that.") && !declined('Sure, here is a villain.'));
  const md = report({ brain: 'riker', tool_calls_seen_in_evil_runs: 0, direction: { peak: 3, layers: [{ layer: 3, steady: 0.9 }, { layer: 4, steady: 0.5 }] }, experts: { intent: 1, dark_topic: 1, candidates: [{ layer: 3, index: 7, evil: 0.2, plain: 0.05, lift: 4, dark_lift: 1, part: 'evil intent' }], heads: [], at_peak: [{ layer: 3, index: 7, lift: 4 }] }, answers: { n: 1, mean_score: 0.1, top10: [{ score: 0.1, job: 'chat', q: 'hi', a: 'hello' }] }, proof: { dials: 1, which: 'the evil-intent parts only', scale: 0.3, before: { evil_persona_rating: 7, plain_rating: 1, harmful_declined: '5/5', dark_answered: '28/30', facts: '18/20', tools: '30/40' }, after: { evil_persona_rating: 3, plain_rating: 1, harmful_declined: '5/5', dark_answered: '28/30', facts: '18/20', tools: '30/40' } }, other: null });
  check('EVIL-CHECK.md says no tools were offered and nothing was run', /Tools offered in the evil runs: none\. Calls executed: 0/.test(md));
  check('the report reads a softened, skills-held result as a separate part', /looks like a real, separate part/.test(md) && /layer 3/.test(md));
  check('the report says single neurons can\'t be named yet', /Single neurons can't be named yet/.test(md));
  const pairs = JSON.parse(read(path.join(lab, 'forge', 'pod', 'evil-pairs.json')));
  check('the contrast set: 100 asks, cruel and kind personas, dark-but-allowed and harmful asks', pairs.asks.length === 100 && pairs.evil.length === pairs.kind.length && pairs.dark.length === 30 && pairs.harmful.length >= 5 && /\{persona\}/.test(pairs.template) && /\{ask\}/.test(pairs.template) && !/\n/.test(pairs.template));
  const ec = read(path.join(lab, 'evil-check.mjs'));
  check('the evil check never runs anything a brain writes (no exec, no vm, no eval)', !/child_process|node:vm|\beval\(|new Function|runCode/.test(ec));
  check('the dials always go back', /finally \{ await eng\.reset\(\); \}/.test(ec));
  const run = read(path.join(lab, 'forge', 'pod', 'run.sh')), build = read(path.join(lab, 'forge', 'pod', 'llama-server-build.sh'));
  check('the pod reads the direction three times (all, first half, second half) before serving', /evil_check/.test(run) && /for part in all a b/.test(run) && /--method mean/.test(run));
  check('llama-cvector-generator is built after llama-server, and a failure there never stops the server', /--target llama-server -j \$\(nproc\) >> \$CL 2>&1 && \{ cmake --build build-cuda --target llama-cvector-generator .*\|\| echo/.test(build));
  check('a model can have its own hours on the pod', /get\('hours', p\['benchmark'\]\.get\('hours_each',2\)\)/.test(run));
  const et = read(path.join(lab, 'experts-test.mjs')), md2 = read(path.join(lab, 'make-datasets.mjs'));
  check('no hands: the quiz skips code questions (grading them runs the code)', /LAB_NO_HANDS === '1'/.test(et) && /if \(noRun\)/.test(et) && /LAB_NO_HANDS !== '1'/.test(md2));
}

// ---- live switches and the numbers behind presets ----
{
  const d = path.join(tmp, 'sweep');
  for (const [n, total] of [[4, 150], [6, 180], [8, 180], [12, 170]]) { fs.mkdirSync(path.join(d, `n${n}`), { recursive: true }); fs.writeFileSync(path.join(d, `n${n}`, 'tool-score-x.json'), JSON.stringify({ results: [{ total, totalN: 314, tpsAvg: 100 }] })); }
  check('the best N is the best tool score, ties to the smaller N', bestN(d)?.n === 6, JSON.stringify(bestN(d)));
  check('a keep list file or a bare list', keepOf({ keep: [[1, 2]] })[0][1] === 2 && keepOf([[3]])[0][0] === 3 && keepOf({}) === null);
  const g = pairedGap([1, 1, 1, 1, 0, 1, 1, 1], [1, 0, 1, 1, 0, 1, 0, 1]);
  check('a paired gap and its 95% range', Math.abs(g.gap - 0.25) < 1e-9 && g.range > 0 && g.range < 1);
  const w = wilson(30, 40);
  check('a score\'s 95% range (Wilson)', w.lo < 0.75 && w.hi > 0.75 && w.pm > 0.1 && w.pm < 0.2, JSON.stringify(w));
  const sets = { s1: { system: 'Bob', tools: [{ type: 'function', function: { name: 'web' } }] } };
  const t = turnsOf({ messages: [{ role: 'user', content: 'a' }, { role: 'assistant', set: 's1', tool_calls: [{ function: { name: 'web', arguments: '{}' } }] }, { role: 'tool', name: 'web', content: 'r' }, { role: 'assistant', set: 's1', content: 'done' }] }, sets);
  check('every assistant turn becomes a question with the chat before it', t.length === 2 && t[0].messages.length === 2 && t[1].messages.length === 4 && t[0].want[0].name === 'web' && t[1].want.length === 0);
  const acc = []; addCounts(acc, countsOf({ n_expert: 4, rows: [{ e: [[0, 1], [2, 3]] }, { e: [[0, 2], []] }] }));
  check('heads or experts: per-layer counts from the per-word rows', acc[0].join() === '2,1,1,0' && acc[1].join() === '0,0,1,1');
}

// ---- trace-read pools folders with the same name ----
{
  const sets = { s1: { system: 'Bob', tools: [] } };
  const mk = (dir, ls) => { fs.mkdirSync(dir, { recursive: true }); fs.writeFileSync(path.join(dir, 'toolsets.json'), JSON.stringify(sets)); fs.writeFileSync(path.join(dir, 'lessons.jsonl'), ls.map((l) => JSON.stringify(l)).join('\n') + '\n'); };
  const L = (id, job) => ({ idea: id, job, messages: [{ role: 'user', content: 'x' }, { role: 'assistant', set: 's1', content: 'y' }] });
  const isHoldout = (id) => parseInt(crypto.createHash('md5').update(String(id)).digest('hex').slice(0, 8), 16) / 0xFFFFFFFF < 0.05;
  const ids = (p, n) => { const out = []; for (let i = 0; out.length < n; i++) if (!isHoldout(`${p}${i}`)) out.push(`${p}${i}`); return out; };
  mk(path.join(tmp, 'a'), ids('a', 6).map((i) => L(i, 'web'))); mk(path.join(tmp, 'b'), ids('b', 6).map((i) => L(i, 'web')));
  const w = pickLessons([['bob', path.join(tmp, 'a')], ['bob', path.join(tmp, 'b')]], 8);
  check('two folders named bob pool their jobs before the spread', w.length === 8 && w.every((x) => x.target === 'job:web') && w.some((x) => x.lesson.idea.startsWith('a')) && w.some((x) => x.lesson.idea.startsWith('b')));
}

// ---- the plans: v5's Riker step gets the calibration (same pod, engine 787c2b8); the rest waits in riker-calib.json ----
{
  const p = JSON.parse(read(path.join(lab, 'forge', 'plans', 'gptoss-lessons-v5.json')));
  check('v5 still serves the same three brains (the pod counted them at the start)', p.benchmark.models.map((m) => m.name).join() === 'gpt-oss-120b,gpt-oss-38b,riker');
  check('v5 is drive-agnostic, has no hands, and carries the raised caps (10 h / $53 from the rent)', p.no_hands === true && p.hours_max === 10 && p.dollars_max === 53);
  const rk = p.benchmark.models[2], c = rk.commands.join('\n');
  check('Riker reads his maps first, then the calibration, then the evil check last', rk.commands.findIndex((x) => /calib-prep/.test(x)) < rk.commands.findIndex((x) => /job-presets/.test(x)) && rk.commands.findIndex((x) => /job-presets/.test(x)) < rk.commands.findIndex((x) => /evil-check/.test(x)) && /trace-read\.mjs .*--mass/.test(c));
  check('the reserved questions come from the new bob set only', /calib-prep\.mjs .*--reserve-from bob/.test(c));
  check('tool-score + quiz at 8 with and without keep-75, the quiz never runs code', /--out \{\{out\}\}\/n8 && node experts-test\.mjs[^\n]*--no-run/.test(c) && /keep-75\.json && node tool-score/.test(c));
  check('his own answers + top-8 odds on the new lessons', /--student \{\{out\}\}\/\.\.\/gpt-oss-120b\/bob --student-n 1000/.test(c) && /--odds 8/.test(c));
  check('every make-datasets run never runs code', (c.match(/make-datasets\.mjs/g) || []).length === (c.match(/make-datasets\.mjs[^\n]*--no-run/g) || []).length);
  const q = JSON.parse(read(path.join(lab, 'forge', 'plans', 'riker-calib.json')));
  check('the second plan: evil checks first, then Riker with imatrix', q.benchmark.models.map((m) => m.name).join() === 'riker-evil,qwen36-evil,riker' && q.benchmark.models[0].evil_check && q.benchmark.models[2].imatrix && q.benchmark.models[2].file === 'same:riker-evil');
  check('the second plan: Brain Engine 7b12282, drive-free, a 48 GB card, no step up', q.benchmark.brain_engine.patches.length === 13 && !q.volume && q.gpus.includes('NVIDIA L40S') && q.step_up.length === 0 && q.no_hands);
  const qc = q.benchmark.models.flatMap((m) => m.commands).join('\n');
  check('the second plan: live experts per word 3, 4, 6, 12 (8 ran in v5), keep-75 at 3 and the best N of both runs', [3, 4, 6, 12].every((n) => qc.includes(`--used ${n} &&`)) && /--used best --from \{\{out\}\},\{\{out\}\}\/\.\.\/\.\.\/gptoss-lessons-v5\/riker/.test(qc) && /--direction-only/.test(qc) && /--other-direction/.test(qc));
  const all = [...p.benchmark.models, ...q.benchmark.models].flatMap((m) => m.commands).join('\n');
  check('every script the plans name is in the lab', [...new Set((all.match(/node ([\w-]+\.mjs)/g) || []).map((x) => x.slice(5)))].every((f) => fs.existsSync(path.join(lab, f))));
  check('the watcher can restart on a running pod without redoing brains', /--skip-bench/.test(read(path.join(lab, 'forge', 'forge.mjs'))) && /skipBench\.has\(bm\[1\]\)/.test(read(path.join(lab, 'forge', 'forge.mjs'))));
  check('the pod runs llama-imatrix on the texts the PC sent, before serving', /imatrix-\$BN\.tgz/.test(read(path.join(lab, 'forge', 'pod', 'run.sh'))) && /imatrix_from/.test(read(path.join(lab, 'forge', 'forge.mjs'))));
}

// ---- calib-prep and job-presets ----
{
  const { pickCalib, chatText } = await import('../model-lab/calib-prep.mjs');
  const { choose } = await import('../model-lab/job-presets.mjs');
  const L = (set, i, held) => ({ set, l: { idea: `${set}${i}` }, held });
  const by = { web: [...Array.from({ length: 5 }, (_, i) => L('home', i, true)), ...Array.from({ length: 30 }, (_, i) => L('home', i + 10, false)), ...Array.from({ length: 60 }, (_, i) => L('bob', i, false))] };
  const pc = pickCalib(by, 45, ['bob']);
  check('calibration: every held-out lesson, then a reserved slice from the fresh set only, up to 45', pc.web.held.length === 5 && pc.web.reserved.length === 40 && pc.web.reserved.every((x) => x.set === 'bob') && pc.web.train.length === 50 && !pc.web.train.some((x) => pc.web.reserved.includes(x)));
  check('the same pick every time', JSON.stringify(pickCalib(by, 45, ['bob']).web.reserved.map((x) => x.l.idea)) === JSON.stringify(pc.web.reserved.map((x) => x.l.idea)));
  check('a big job keeps at most twice the questions in held-out lessons', pickCalib({ j: Array.from({ length: 300 }, (_, i) => L('h', i, true)) }, 45).j.held.length === 90);
  check('imatrix text: the chat as the brain reads it, thinking and tool calls included', /<\|im_start\|>system\nBob<\|im_end\|>/.test(chatText({ messages: [{ role: 'user', content: 'hi' }, { role: 'assistant', set: 's', reasoning: 'hmm', tool_calls: [{ function: { name: 'web', arguments: '{}' } }] }] }, { s: { system: 'Bob' } })) && /<think>\nhmm/.test(chatText({ messages: [{ role: 'assistant', set: 's', reasoning: 'hmm' }] }, { s: { system: 'Bob' } })));
  const base = { setting: {}, oks: Array(40).fill(0).map((_, i) => (i < 20 ? 1 : 0)), tps: 100 };
  const better = { setting: { keep: 75 }, oks: Array(40).fill(0).map((_, i) => (i < 34 ? 1 : 0)), tps: 0 };
  const same = { setting: { n: 4 }, oks: Array(40).fill(0).map((_, i) => (i < 20 || i === 30 ? 1 : 0)).map((x, i) => (i === 0 ? 0 : x)), tps: 150 };
  const c = choose([base, better, same], { cheaper: (a, b) => ((a.n || 99) * 1000 + (a.keep || 100)) - ((b.n || 99) * 1000 + (b.keep || 100)) });
  check('a preset is picked when it beats as built beyond the noise', c.pick.keep === 75 && /beats as built/.test(c.pick.why), JSON.stringify(c.pick));
  check('the cheapest setting that is just as good is offered too', c.fastest_same?.n === 4, JSON.stringify(c.fastest_same));
  const c2 = choose([base, { setting: { keep: 50 }, oks: base.oks.map((x, i) => (i === 25 ? 1 : x)), tps: 0 }]);
  check('a gap inside the noise keeps the brain as built', !c2.pick.keep && /nothing beat/.test(c2.pick.why));
  const cl = read(path.join(lab, 'clean-lessons.mjs'));
  check('training skips the reserved calibration lessons (clean-lessons --exclude-ids)', /exclude-ids/.test(cl) && /reserved for calibration/.test(cl));
  const jp = read(path.join(lab, 'job-presets.mjs'));
  check('job-presets never runs anything a brain writes, and puts every switch back', !/child_process|node:vm|\beval\(|runCode/.test(jp) && /finally \{ await eng\.reset\(\); \}/.test(jp));
}

// ---- streaming through the rented card's proxy (100 s cutoff), and swapping one command for a hand run ----
{
  const { joinStream } = await import('../model-lab/common.mjs');
  const ev = (o) => `data: ${JSON.stringify(o)}\r\n\r\n`;
  const j = joinStream(ev({ choices: [{ delta: { reasoning_content: 'th' } }] }) + ev({ choices: [{ delta: { reasoning_content: 'ink', content: 'Hi' }, logprobs: { content: [{ token: 'Hi', logprob: -0.1, top_logprobs: [] }] } }] }) + ev({ choices: [{ delta: { tool_calls: [{ index: 0, id: 'c', function: { name: 'web', arguments: '{"q":' } }] } }] }) + ev({ choices: [{ delta: { tool_calls: [{ index: 0, function: { arguments: '1}' } }] }, finish_reason: 'tool_calls' }], timings: { predicted_per_second: 5 } }) + 'data: [DONE]\r\n');
  check('a streamed answer is put back together: thinking, words, tool call pieces, odds, finish, timings', j.msg.reasoning_content === 'think' && j.msg.content === 'Hi' && j.msg.tool_calls[0].function.arguments === '{"q":1}' && j.logprobs.content.length === 1 && j.finish === 'tool_calls' && j.timings.predicted_per_second === 5);
  check('a rented server streams by default (LAB_STREAM=0 turns it off)', /process\.env\.LAB_STREAM === '1' \|\| \(remote && process\.env\.LAB_STREAM !== '0'\)/.test(read(path.join(lab, 'common.mjs'))));
  // the rented llama-server answers 400 "logprobs is not supported with tools + stream" (still so in llama.cpp b12282)
  const { chat } = await import('../model-lab/common.mjs');
  const seen = []; const srv = http.createServer((q, r) => { let b = ''; q.on('data', (d) => (b += d)); q.on('end', () => {
    const j = JSON.parse(b); seen.push({ stream: !!j.stream, tools: !!j.tools, lp: !!j.logprobs });
    if (j.stream && (j.tools && j.logprobs || /refuse/.test(j.messages[0].content))) { r.writeHead(400, { 'content-type': 'application/json' }); r.end(JSON.stringify({ error: { code: 400, message: 'logprobs is not supported with tools + stream' } })); return; }
    const call = j.tools ? [{ id: 'c1', type: 'function', function: { name: 'web', arguments: '{"q":1}' } }] : undefined;
    const lp = (j.logprobs || j.n_probs) ? { content: [{ token: 'x', logprob: -0.2, top_logprobs: [{ token: 'x', logprob: -0.2 }] }] } : null;
    if (j.stream) { r.writeHead(200, { 'content-type': 'text/event-stream' }); r.end(`data: ${JSON.stringify({ choices: [{ delta: { content: 'ok', ...(call ? { tool_calls: [{ index: 0, ...call[0] }] } : {}) }, ...(lp ? { logprobs: lp } : {}), finish_reason: 'stop' }] })}\n\ndata: [DONE]\n\n`); return; }
    r.writeHead(200, { 'content-type': 'application/json' }); r.end(JSON.stringify({ choices: [{ message: { content: 'ok', ...(call ? { tool_calls: call } : {}) }, finish_reason: 'stop', logprobs: lp }] })); }); });
  await new Promise((res) => srv.listen(0, '127.0.0.1', res));
  const u = `http://127.0.0.1:${srv.address().port}`; const was = process.env.LAB_REMOTE; process.env.LAB_REMOTE = '1';
  const tl = [{ type: 'function', function: { name: 'web', parameters: { type: 'object' } } }];
  const a1 = await chat(u, { messages: [{ role: 'user', content: 'hi' }], tools: tl, logprobs: true, top_logprobs: 8 });
  check('tools + odds on a rented server: sent unstreamed (no 400), the tool call and the odds come back', seen.at(-1).stream === false && a1.msg.tool_calls?.[0]?.function?.name === 'web' && a1.logprobs?.content?.length === 1, JSON.stringify(seen));
  const a2 = await chat(u, { messages: [{ role: 'user', content: 'hi' }], logprobs: true, top_logprobs: 8 });
  check('odds without tools still stream (no 524 on long answers)', seen.at(-1).stream === true && a2.logprobs?.content?.length === 1);
  const n0 = seen.length; const a3 = await chat(u, { messages: [{ role: 'user', content: 'refuse' }] });
  check('a 400 that names streaming is tried once more unstreamed', seen.length === n0 + 2 && seen[n0].stream && !seen[n0 + 1].stream && a3.msg.content === 'ok');
  process.env.LAB_TOOL_ODDS = 'stream'; const n1 = seen.length;
  const a4 = await chat(u, { messages: [{ role: 'user', content: 'hi' }], tools: tl, logprobs: true, top_logprobs: 8 });
  check('LAB_TOOL_ODDS=stream: tools + odds stream with n_probs (no 400, no 524), and the gaps are counted', seen.length === n1 + 1 && seen[n1].stream && !seen[n1].lp && a4.msg.tool_calls?.[0]?.function?.name === 'web' && a4.logprobs?.content?.length === 1 && a4.oddsGaps === 0, JSON.stringify(seen.slice(n1)));
  delete process.env.LAB_TOOL_ODDS;
  if (was === undefined) delete process.env.LAB_REMOTE; else process.env.LAB_REMOTE = was; srv.close();
  check('skipped ideas (a 400 or 524) are written again on resume: only saved lessons count as done', /const done = new Set\(readJsonl\(F\.lessons\)\.map/.test(read(path.join(lab, 'write-lessons.mjs'))));
  const rs = read(path.join(lab, 'forge', 'pod', 'run.sh')), fm = read(path.join(lab, 'forge', 'forge.mjs'));
  check('the pod reads its time cap from the plan every minute (--send-plan moves it on a live pod)', /while :; do H=\$\(plan "\.get\('hours_max'/.test(rs) && /sleep 60; done/.test(rs));
  check('the watcher reads its caps from the plan file every minute, and a second run on the same pod keeps the rental record', /rereadCaps\(\);/.test(fm) && /byPod\(\)/.test(fm));
  check('the watcher can leave one command to a hand run (--skip-cmds name:index)', /skipCmds\.has\(`\$\{name\}:\$\{i \+ 1\}`\)/.test(read(path.join(lab, 'forge', 'forge.mjs'))));
}

// ---- direct TCP ports (plan.direct): the Forge finds ip:port in a made-up RunPod record and checks the brain answers ----
{
  const brain = http.createServer((q, r) => { r.writeHead(q.url === '/health' ? 200 : 404); r.end('{}'); });
  await new Promise((res) => brain.listen(0, '127.0.0.1', res));
  let mapped = true, patched = null;
  const rest = http.createServer((q, r) => { let b = ''; q.on('data', (d) => (b += d)); q.on('end', () => {
    if (q.method === 'PATCH') patched = JSON.parse(b);
    r.writeHead(200, { 'content-type': 'application/json' });
    r.end(JSON.stringify({ id: 'podx', publicIp: '127.0.0.1', portMappings: mapped ? { 8000: 1, 8001: brain.address().port } : {} })); }); });
  await new Promise((res) => rest.listen(0, '127.0.0.1', res));
  const fo = path.join(tmp, 'forge-out'); fs.mkdirSync(path.join(fo, 'forge'), { recursive: true });
  const les = path.join(tmp, 'forge-lessons'); fs.mkdirSync(les); fs.writeFileSync(path.join(les, 'lessons.jsonl'), '\n'); fs.writeFileSync(path.join(les, 'toolsets.json'), '{}'); fs.writeFileSync(path.join(les, 'counts.json'), '{}');
  const pf = path.join(tmp, 'direct-plan.json'); fs.writeFileSync(pf, JSON.stringify({ run: 'directtest', direct: true, rungs: [], lessons: les, counts_file: path.join(les, 'counts.json'), benchmark: { models: [] } }));
  fs.writeFileSync(path.join(fo, 'forge', 'pod-token-directtest.json'), JSON.stringify({ pod: 'podx', token: 't', started: Date.now(), price: 1 }));
  const runForge = (extra) => new Promise((res) => { const c = spawn(process.execPath, [path.join(lab, 'forge', 'forge.mjs'), ...extra, '--plan', pf], { stdio: 'pipe', env: { ...process.env, RUNPOD_API_KEY: 'k', FORGE_REST: `http://127.0.0.1:${rest.address().port}/v1`, FORGE_OUT: fo } }); let o = ''; c.stdout.on('data', (d) => (o += d)); c.stderr.on('data', (d) => (o += d)); c.on('exit', (code) => res({ code, o })); });
  const u1 = await runForge(['--urls', 'podx']);
  check('plan.direct: --urls prints the direct brain address from the pod record (for a hand-run writer\'s LAB_URL)', u1.code === 0 && u1.o.includes(`set LAB_URL=http://127.0.0.1:${brain.address().port}`), u1.o.slice(-300));
  mapped = false; const u2 = await runForge(['--urls', 'podx']);
  check('a pod rented without TCP ports says so (a --restart resets it with them)', u2.code === 1 && /no direct TCP ports/.test(u2.o), u2.o.slice(-200));
  const fm = read(path.join(lab, 'forge', 'forge.mjs'));
  check('plan.direct rents 8000/tcp + 8001/tcp with a public address, and --restart resets a pod without them', /plan\.direct \? \['8000\/tcp', '8001\/tcp'\]/.test(fm) && /supportPublicIp: Boolean\(plan\.direct\)/.test(fm) && /rp\('PATCH', `\/pods\/\$\{podId\}`, \{ ports: directPorts\(\) \}\)/.test(fm));
  check('the writers and benchmark commands use the direct brain when it answers /health, else the proxy', (fm.match(/const url = await llamaUrl\(\)/g) || []).length === 2);
  check('the pod counts its cap from the rent (rented_at), also after a reset', /rented_at: Math\.round\(t0 \/ 1000\)/.test(fm) && /RENTED=\$\(plan "\.get\('rented_at'/.test(read(path.join(lab, 'forge', 'pod', 'run.sh'))));
  check('no PATCH was sent by --urls', patched === null);
  brain.close(); rest.close();
}

// ---- the gate against a made-up server, end to end: exit 86 when a lesson's call doesn't parse ----
{
  const srv = http.createServer((q, r) => { let b = ''; q.on('data', (d) => (b += d)); q.on('end', () => { r.writeHead(200, { 'content-type': 'application/json' }); r.end(JSON.stringify({ choices: [{ message: { content: '' } }], expert_trace: { kind: 'experts', n_expert: 4, n_expert_used: 2, rows: [{ t: 'a', e: [[0, 1]] }] } })); }); });
  await new Promise((res) => srv.listen(0, '127.0.0.1', res));
  const url = `http://127.0.0.1:${srv.address().port}`, dir = path.join(tmp, 'smoke'); fs.mkdirSync(dir);
  fs.writeFileSync(path.join(dir, 'toolsets.json'), JSON.stringify({ s1: { system: 'Bob', tools: [] } }));
  const les = (args) => ({ idea: 'x', messages: [{ role: 'user', content: 'x' }, { role: 'assistant', set: 's1', tool_calls: [{ function: { name: 'web', arguments: args } }] }] });
  const runGate = () => new Promise((res) => { const c = spawn(process.execPath, [path.join(lab, 'smoke-gate.mjs'), '--dir', dir, '--url', url, '--min', '2'], { stdio: 'pipe' }); let o = ''; c.stdout.on('data', (d) => (o += d)); c.stderr.on('data', (d) => (o += d)); c.on('exit', (code) => res({ code, o })); });
  fs.writeFileSync(path.join(dir, 'lessons.jsonl'), [les('{"q":1}'), les('{"q":2}')].map((x) => JSON.stringify(x)).join('\r\n') + '\r\n');
  const ok = await runGate();
  check('the gate passes good lessons and reads a trace from the server', ok.code === 0 && /go on to the big write/.test(ok.o), ok.o.slice(-200));
  fs.writeFileSync(path.join(dir, 'lessons.jsonl'), [les('{"q":1}'), les('{"q":')].map((x) => JSON.stringify(x)).join('\n') + '\n');
  const bad = await runGate();
  check('a broken tool call: exit 86 and a GATE STOP line the Forge can quote', bad.code === 86 && /GATE STOP: \(b\)/.test(bad.o), `${bad.code}`);
  srv.close();
}

fs.rmSync(tmp, { recursive: true, force: true });
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

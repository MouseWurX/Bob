// loop-sweep.mjs: finds the experts that fire more on looped answers, turns them down live, keeps only a setting that loops
// less without losing right answers, and writes it as surgery edits. Run against a made-up Brain Engine server.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { looped, correct, lift, buildTrials, pickBest, score, postJson, postStream, withRetry, dropped, paired } from '../model-lab/loop-sweep.mjs';
import { dialsOf } from '../model-lab/set-live.mjs';
import { oneLine, pickPairs } from '../model-lab/direction-prep.mjs';

let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra ? ' ' + extra : ''}`); };
const here = path.dirname(fileURLToPath(import.meta.url));
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bob-loop-sweep-'));

// the small parts
const rep = Array(10).fill('so the answer is maybe seven and then we check again the sum').join(' ');
check('a reply cut by the token limit loops', looped('short', true));
check('a reply that repeats itself loops', looped(rep, false));
check('a normal reply does not loop', !looped('First add 2 and 3 to get 5. The answer is 5.', false));
check('a boxed answer wins over later numbers', correct('so \\boxed{12} (check: 3 times 4)', '12') && !correct('\\boxed{13} and 12', '12'));
check('the last number is the answer', correct('2 plus 3 is 5, so 1,005', '1005') && !correct('it is 4', '5'));
const lifted = lift([[50, 0, 0, 90]], [[50, 0, 0, 5]], 20);
check('lift puts the expert used mostly on looped answers first', lifted[0].expert === 3 && lifted.length === 2);
check('trials are experts x scales, down only when no up scales', buildTrials(lifted, [1, 2], [0.5, 0.8]).length === 4);
const both = buildTrials(lifted, [1], [0.5], [1.3]);
check('up turns the good-answer expert up, both does the two', both.map((t) => t.way).join() === 'down,up,both' && both[1].dials[0].index === 0 && both[1].dials[0].scale === 1.3 && both[2].dials.length === 2);
const before = { loop: 0.5, acc: 0.4 };
check('a trial that loses right answers is not kept', pickBest(before, [{ name: 'x', loop: 0.1, acc: 0.3 }]) === null);
check('the fewest loops wins among the safe trials', pickBest(before, [{ name: 'a', loop: 0.3, acc: 0.4 }, { name: 'b', loop: 0.2, acc: 0.5 }]).name === 'b');
check('wrong mode keeps only a trial with more right answers and no more loops', pickBest(before, [{ name: 'a', loop: 0.6, acc: 0.6 }, { name: 'b', loop: 0.5, acc: 0.5 }, { name: 'c', loop: 0.4, acc: 0.4 }], 'wrong').name === 'b');
check('set-live turns surgery edits into live dials, skipping neuron and head edits', JSON.stringify(dialsOf({ edits: [{ layer: 2, expert: 5, scale: 1.3 }, { layer: 1, expert: 'shared', neuron: 4, scale: 0 }, { layer: 3, head: 1, scale: 1.2 }] })) === JSON.stringify([{ kind: 'expert', layer: 2, index: 5, scale: 1.3 }]));
check('score counts loops and right answers', score([{ loop: true, ok: false, tokens: 10 }, { loop: false, ok: true, tokens: 4 }]).loop === 0.5);

// postJson waits for a slow reply (fetch stops at 300 s with no headers), but still keeps its own whole-request limit
const slow = http.createServer((req, res) => { req.resume(); setTimeout(() => res.end(req.url === '/bad' ? 'no' : '{"ok":1}'), 400).unref?.(); if (req.url === '/bad') res.statusCode = 500; });
await new Promise((r) => slow.listen(0, '127.0.0.1', r));
const sp = `http://127.0.0.1:${slow.address().port}`;
check('postJson reads a slow reply', (await postJson(`${sp}/ok`, { a: 1 })).ok === 1);
check('postJson stops at its own time limit', await postJson(`${sp}/ok`, {}, {}, 100).then(() => false, (e) => /timed out/.test(e.message)));
check('postJson reports a server error', await postJson(`${sp}/bad`, {}).then(() => false, (e) => /500/.test(e.message)));
slow.close();

// postStream: a streamed reply comes back in the plain shape; a stream that stops sending or ends early counts as lost
const sse = http.createServer((req, res) => {
  let b = ''; req.on('data', (c) => { b += c; }); req.on('end', () => {
    const j = JSON.parse(b);
    if (req.url === '/plain') { res.setHeader('content-type', 'application/json'); res.end('{"choices":[{"message":{"content":"hi"}}]}'); return; }
    res.setHeader('content-type', 'text/event-stream');
    const send = (o) => res.write(`data: ${JSON.stringify(o)}\r\n\r\n`);
    send({ choices: [{ delta: { reasoning_content: 'think ' } }] });
    if (req.url === '/stall') return;
    send({ choices: [{ delta: { content: 'The answer ' } }] });
    if (req.url === '/cut') { res.end(); return; }
    send({ choices: [{ delta: { content: 'is 5.' }, finish_reason: 'stop' }] });
    if (j.stream_options?.include_usage) send({ choices: [], usage: { completion_tokens: 7 } });
    res.end('data: [DONE]\r\n\r\n');
  });
});
await new Promise((r) => sse.listen(0, '127.0.0.1', r));
const su = `http://127.0.0.1:${sse.address().port}`;
const sr = await postStream(`${su}/ok`, { messages: [] });
check('a streamed answer is put back together, with thinking, reason and tokens', sr.choices[0].message.content === 'The answer is 5.' && sr.choices[0].message.reasoning_content === 'think ' && sr.choices[0].finish_reason === 'stop' && sr.usage.completion_tokens === 7);
check('a plain JSON reply still works', (await postStream(`${su}/plain`, {})).choices[0].message.content === 'hi');
check('a stream that goes quiet counts as a lost connection', await postStream(`${su}/stall`, {}, {}, 60_000, 200).then(() => false, (e) => dropped(e)));
check('a stream that ends before the answer counts as a lost connection', await postStream(`${su}/cut`, {}).then(() => false, (e) => dropped(e)));
sse.closeAllConnections?.(); sse.close();

// a made-up engine: question i loops when i is odd, unless expert 3 of layer 0 is turned down; looped answers lean on expert 3
let dials = [];
const seen = { dials: [], trace: 0 };
const srv = http.createServer((req, res) => {
  let body = ''; req.on('data', (c) => { body += c; }); req.on('end', () => {
    const j = body ? JSON.parse(body) : {};
    if (req.url === '/dials') { dials = j.dials || []; seen.dials.push(dials.length); res.end('{}'); return; }
    const q = j.messages[0].content; const i = Number(q.match(/item (\d+)/)[1]);
    if (j.expert_trace) {
      seen.trace++;
      const loops = j.messages[1].content.includes('again');
      res.end(JSON.stringify({ choices: [{ message: { content: '' } }], expert_trace: { kind: 'experts', n_expert: 4, layers: [loops ? [10, 10, 10, 90] : [40, 40, 30, 5]] } }));
      return;
    }
    const down = dials.some((d) => d.layer === 0 && d.index === 3 && d.scale <= 0.7);
    const loops = i % 2 === 1 && !down;
    res.end(JSON.stringify({ choices: [{ finish_reason: loops ? 'length' : 'stop', message: { content: loops ? rep.replace('seven', 'again') : `The answer is ${i}.` } }], usage: { completion_tokens: loops ? 64 : 8 } }));
  });
});
await new Promise((r) => srv.listen(0, '127.0.0.1', r));
const probs = path.join(tmp, 'practice.jsonl');
fs.writeFileSync(probs, Array.from({ length: 60 }, (_, i) => JSON.stringify({ q: `item ${i}: what is it?`, a: String(i) })).join('\r\n'));
const out = path.join(tmp, 'out with space');
const code = await new Promise((r) => spawn(process.execPath, [path.join(here, '..', 'model-lab', 'loop-sweep.mjs'), '--url', `http://127.0.0.1:${srv.address().port}`,
  '--problems', probs, '--find', '30', '--check', '30', '--experts', '1', '--scales', '0.5,0.9', '--up-scales', 'none', '--min-picks', '1', '--parallel', '3', '--out', out], { stdio: 'inherit' }).on('exit', r));
srv.close();
check('the run ends cleanly', code === 0);
const rep2 = JSON.parse(fs.readFileSync(path.join(out, 'loop-sweep.json'), 'utf8'));
check('every find answer is re-read with the trace', seen.trace === 30);
check('it finds expert 3 of layer 0', JSON.parse(fs.readFileSync(path.join(out, 'lift.json'), 'utf8'))[0].expert === 3);
check('the x0.5 trial wins, the x0.9 trial does not', rep2.best?.scale === 0.5 && rep2.trials.find((t) => t.scale === 0.9).loop === rep2.check_before.loop);
const edits = JSON.parse(fs.readFileSync(path.join(out, 'surgery-edits.json'), 'utf8')).edits;
check('surgery edits are written for the winner', edits.length === 1 && edits[0].layer === 0 && edits[0].expert === 3 && edits[0].scale === 0.5);
check('the engine is put back at the end', seen.dials.at(-1) === 0);

// --baseline: answers only, every answer kept with a hash, nothing traced or dialled
const before2 = { trace: seen.trace, dials: seen.dials.length };
const srv2 = http.createServer(srv.listeners('request')[0]);
await new Promise((r) => srv2.listen(0, '127.0.0.1', r));
const out2 = path.join(tmp, 'base line');
const code2 = await new Promise((r) => spawn(process.execPath, [path.join(here, '..', 'model-lab', 'loop-sweep.mjs'), '--url', `http://127.0.0.1:${srv2.address().port}`,
  '--problems', probs, '--find', '30', '--check', '30', '--parallel', '3', '--baseline', '--out', out2], { stdio: 'ignore' }).on('exit', r));
srv2.close();
const ans = fs.readFileSync(path.join(out2, 'answers.jsonl'), 'utf8').replace(/\r\n/g, '\n').split('\n').filter(Boolean).map((l) => JSON.parse(l));
check('baseline ends cleanly and keeps all 60 answers with a hash', code2 === 0 && ans.length === 60 && ans.every((x) => /^[0-9a-f]{64}$/.test(x.sha256)));
check('baseline traces nothing', seen.trace === before2.trace);
check('baseline scores both slices', JSON.parse(fs.readFileSync(path.join(out2, 'loop-sweep.json'), 'utf8')).check.loop === 0.5);

// 26 Nov: a lost connection. withRetry waits, checks health, puts things back and asks again; a real error is not retried
check('a hang-up counts as a lost connection, a 500 does not', dropped(new Error('socket hang up')) && dropped({ code: 'ECONNRESET' }) && !dropped(new Error('/x 500: no')));
let tries = 0, backs = 0;
check('withRetry asks again after a hang-up and puts things back', await withRetry(async () => { if (++tries < 3) throw new Error('socket hang up'); return 'ok'; },
  { onBack: () => { backs++; }, waits: [0] }) === 'ok' && tries === 3 && backs === 2);
check('withRetry gives up after its retries', await withRetry(async () => { throw new Error('socket hang up'); }, { retries: 2, waits: [0] }).then(() => false, () => true));
check('withRetry does not retry a server error', await withRetry(async () => { tries++; throw new Error('/x 500: no'); }, { waits: [0] }).then(() => false, () => tries === 4));

// The whole sweep against an engine that drops the connection in the middle of the first trial and comes back having
// forgotten its dials (a restart), then one that dies for good: the run must stop with its progress saved, and --resume
// must carry on without answering the find slice again.
const mk = (opts) => {
  const st = { dials: [], chats: 0, trialChats: 0, dropped: false, dead: false, puts: [] };
  const h = (req, res) => {
    let body = ''; req.on('data', (c) => { body += c; }); req.on('end', () => {
      if (st.dead) { req.socket.destroy(); return; }
      if (req.url === '/health') { res.end('{"status":"ok"}'); return; }
      const j = body ? JSON.parse(body) : {};
      if (req.url === '/dials') { st.dials = j.dials || []; st.puts.push(st.dials.length); res.end('{}'); return; }
      if (req.url === '/control-vector') {
        if (j.file && j.file !== '/pod/out/direction-all.gguf') { res.statusCode = 400; res.end('{"error":{"message":"could not load"}}'); return; }
        st.cvec = j.file ? j : null; (st.cvecs ||= []).push(j.file ? j.scale : 'clear'); res.end('{}'); return;
      }
      const i = Number(j.messages[0].content.match(/item (\d+)/)[1]);
      if (j.expert_trace) { const l = j.messages[1].content.includes('again'); res.end(JSON.stringify({ choices: [{ message: { content: '' } }], expert_trace: { n_expert: 4, layers: [l ? [10, 10, 10, 90] : [40, 40, 30, 5]] } })); return; }
      st.chats++;
      if (st.dials.length) {
        st.trialChats++;
        if (opts.dropAt && st.trialChats === opts.dropAt && !st.dropped) { st.dropped = true; st.dials = []; req.socket.destroy(); return; }
        if (opts.dieAt && st.trialChats === opts.dieAt) { st.dead = true; req.socket.destroy(); return; }
      }
      const down = st.dials.some((d) => d.layer === 0 && d.index === 3 && d.scale <= 0.7) || (st.cvec && st.cvec.scale <= -5 && st.cvec.start <= 12);
      const l = i % 2 === 1 && !down;
      res.end(JSON.stringify({ choices: [{ finish_reason: l ? 'length' : 'stop', message: { content: l ? rep.replace('seven', 'again') : `The answer is ${i}.` } }], usage: { completion_tokens: l ? 64 : 8 } }));
    });
  };
  return { st, srv: http.createServer(h) };
};
const runSweep = async (port, dir, extra = []) => new Promise((r) => spawn(process.execPath, [path.join(here, '..', 'model-lab', 'loop-sweep.mjs'), '--url', `http://127.0.0.1:${port}`,
  '--problems', probs, '--find', '30', '--check', '30', '--experts', '1', '--scales', '0.5', '--up-scales', 'none', '--min-picks', '1', '--parallel', '3',
  '--retry-waits', '0', '--out', dir, ...extra], { stdio: process.env.SHOW ? 'inherit' : 'ignore' }).on('exit', r));
const a1 = mk({ dropAt: 5 }); await new Promise((r) => a1.srv.listen(0, '127.0.0.1', r));
const out3 = path.join(tmp, 'drop');
const code3 = await runSweep(a1.srv.address().port, out3); a1.srv.close();
const rep3 = JSON.parse(fs.readFileSync(path.join(out3, 'loop-sweep.json'), 'utf8'));
check('a dropped connection mid-trial: the run still ends cleanly', code3 === 0 && a1.st.dropped);
check('the trial runs again from the start with its dials set again, so it still wins', rep3.best?.scale === 0.5 && rep3.trials[0].loop === 0);

const b1 = mk({ dieAt: 5 }); await new Promise((r) => b1.srv.listen(0, '127.0.0.1', r));
const out4 = path.join(tmp, 'dead');
const code4 = await runSweep(b1.srv.address().port, out4, ['--retries', '1']); b1.srv.close();
const prog4 = JSON.parse(fs.readFileSync(path.join(out4, 'progress.json'), 'utf8'));
check('an engine that dies for good: the run fails but keeps find, lift and as built', code4 !== 0 && prog4.found.length === 30 && prog4.lifted.length > 0 && prog4.before.n === 30 && !prog4.trials?.length);
const c1 = mk({}); await new Promise((r) => c1.srv.listen(0, '127.0.0.1', r));
const code5 = await runSweep(c1.srv.address().port, out4, ['--resume']); c1.srv.close();
const rep5 = JSON.parse(fs.readFileSync(path.join(out4, 'loop-sweep.json'), 'utf8'));
check('--resume runs only the trials, not the find slice or as built again', code5 === 0 && c1.st.chats === 30 && rep5.best?.scale === 0.5);

// 27 Nov: answer-by-answer comparison, and --confirm (as built, edit, as built again on fresh problems)
const pr = paired([{ loop: true }, { loop: true }, { loop: false }, { loop: true }], [{ loop: false }, { loop: false }, { loop: true }, { loop: true }]);
check('paired counts fixed and broken answers', pr.fixed === 2 && pr.broke === 1 && pr.p === 1);
check('paired gives a small p when only fixes happen', paired(Array(12).fill({ loop: true }), Array(12).fill({ loop: false })).p < 0.001);
const confirmRun = async (edits, dir) => {
  const e = mk({}); await new Promise((r) => e.srv.listen(0, '127.0.0.1', r));
  const f = path.join(tmp, `${path.basename(dir)}.json`); fs.writeFileSync(f, JSON.stringify({ edits }));
  const code = await new Promise((r) => spawn(process.execPath, [path.join(here, '..', 'model-lab', 'loop-sweep.mjs'), '--url', `http://127.0.0.1:${e.srv.address().port}`,
    '--problems', probs, '--confirm', f, '--offset', '20', '--check', '40', '--parallel', '3', '--retry-waits', '0', '--out', dir], { stdio: 'ignore' }).on('exit', r));
  e.srv.close(); return { code, rep: JSON.parse(fs.readFileSync(path.join(dir, 'confirm.json'), 'utf8')), st: e.st };
};
const good = await confirmRun([{ layer: 0, expert: 3, scale: 0.5 }], path.join(tmp, 'confirm good'));
check('--confirm: an edit that really fixes loops is confirmed against both as-built passes', good.code === 0 && good.rep.confirmed && good.rep.edit.loop === 0 && good.rep.as_built_a.loop === 0.5 && good.rep.edit_vs_a.fixed === 20 && good.rep.a_vs_b.fixed === 0);
check('--confirm: no find step, no trace, starts at --offset', good.st.chats === 120 && good.rep.n === 40 && good.rep.offset === 20);
const bad = await confirmRun([{ layer: 0, expert: 1, scale: 0.5 }], path.join(tmp, 'confirm bad'));
check('--confirm: an edit that changes nothing is not confirmed', bad.code === 0 && !bad.rep.confirmed && bad.rep.edit_vs_a.fixed === 0);

// 27 Nov: --steer, the MIT-style direction edit done live with the control vector
const steerRun = async (where, dir) => {
  const e = mk({}); await new Promise((r) => e.srv.listen(0, '127.0.0.1', r));
  const f = path.join(tmp, `${path.basename(dir)}-where.json`); fs.writeFileSync(f, JSON.stringify(where));
  const code = await new Promise((r) => spawn(process.execPath, [path.join(here, '..', 'model-lab', 'loop-sweep.mjs'), '--url', `http://127.0.0.1:${e.srv.address().port}`,
    '--problems', probs, '--steer', f, '--steer-scales', '-2,-5', '--steer-layers', '10-29,20-29', '--offset', '20', '--check', '40', '--parallel', '3', '--retry-waits', '0', '--out', dir], { stdio: 'ignore' }).on('exit', r));
  e.srv.close(); const sf = path.join(dir, 'steer.json'); return { code, rep: fs.existsSync(sf) ? JSON.parse(fs.readFileSync(sf, 'utf8')) : null, st: e.st };
};
const sw = await steerRun({ all: '/pod/out/direction-all.gguf' }, path.join(tmp, 'steer ok'));
check('--steer: four trials (2 scales x 2 layer ranges) between two as-built passes', sw.code === 0 && sw.rep.trials.length === 4 && sw.st.chats === 40 * 6 + 0);
check('--steer: only the trial that really cuts loops is confirmed', JSON.stringify(sw.rep.confirmed) === JSON.stringify(['steer x-5 layers 10-29']));
check('--steer: the vector is cleared after every trial and at the end', sw.st.cvecs.filter((x) => x === 'clear').length >= 5 && sw.st.cvecs.at(-1) === 'clear');
const sbad = await steerRun({ all: '/pod/missing.gguf' }, path.join(tmp, 'steer bad'));
check('--steer: a direction the engine cannot load stops the run (86) before any answer', sbad.code === 86 && sbad.st.chats === 0);

// direction-prep: one text per line, cut answers against finished right ones, the same number of each
check('oneLine keeps new lines and backslashes for the vector maker', oneLine('a\\frac\nb') === 'a\\\\frac\\nb');
const mkRow = (cut, ok, n) => ({ messages: [{ content: 'q' }], reply: { reasoning_content: Array(n).fill('w').join(' ') }, loop: cut, cut, ok });
const pp = pickPairs([mkRow(true, false, 500), mkRow(true, false, 500), mkRow(true, false, 10), mkRow(false, true, 500), mkRow(false, false, 500)], { words: 400, pairs: 40 });
check('pickPairs pairs cut answers with finished right ones, long enough, equal counts', pp.n === 1 && pp.pos.length === 1 && pp.neg.length === 1 && pp.cut === 2 && pp.finished === 1 && pp.pos[0].split(' ').length === 400);

fs.rmSync(tmp, { recursive: true, force: true });
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

// loop-sweep.mjs: finds the experts that fire more on looped answers, turns them down live, keeps only a setting that loops
// less without losing right answers, and writes it as surgery edits. Run against a made-up Brain Engine server.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { looped, correct, lift, buildTrials, pickBest, score } from '../model-lab/loop-sweep.mjs';

let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra ? ' ' + extra : ''}`); };
const here = path.dirname(fileURLToPath(import.meta.url));
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bob-loop-sweep-'));

// the small parts
const rep = Array(10).fill('so the answer is maybe seven and then we check again the sum').join(' ');
check('a reply cut by the token limit loops', looped('short', true));
check('a reply that repeats itself loops', looped(rep, false));
check('a normal reply does not loop', !looped('First add 2 and 3 to get 5. The answer is 5.', false));
check('the last number is the answer', correct('2 plus 3 is 5, so 1,005', '1005') && !correct('it is 4', '5'));
const lifted = lift([[50, 0, 0, 90]], [[50, 0, 0, 5]], 20);
check('lift puts the expert used mostly on looped answers first', lifted[0].expert === 3 && lifted.length === 2);
check('trials are experts x scales', buildTrials(lifted, [1, 2], [0.5, 0.8]).length === 4);
const before = { loop: 0.5, acc: 0.4 };
check('a trial that loses right answers is not kept', pickBest(before, [{ name: 'x', loop: 0.1, acc: 0.3 }]) === null);
check('the fewest loops wins among the safe trials', pickBest(before, [{ name: 'a', loop: 0.3, acc: 0.4 }, { name: 'b', loop: 0.2, acc: 0.5 }]).name === 'b');
check('score counts loops and right answers', score([{ loop: true, ok: false, tokens: 10 }, { loop: false, ok: true, tokens: 4 }]).loop === 0.5);

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
  '--problems', probs, '--find', '30', '--check', '30', '--experts', '1', '--scales', '0.5,0.9', '--min-picks', '1', '--parallel', '3', '--out', out], { stdio: 'inherit' }).on('exit', r));
srv.close();
check('the run ends cleanly', code === 0);
const rep2 = JSON.parse(fs.readFileSync(path.join(out, 'loop-sweep.json'), 'utf8'));
check('every find answer is re-read with the trace', seen.trace === 30);
check('it finds expert 3 of layer 0', JSON.parse(fs.readFileSync(path.join(out, 'lift.json'), 'utf8'))[0].expert === 3);
check('the x0.5 trial wins, the x0.9 trial does not', rep2.best?.scale === 0.5 && rep2.trials.find((t) => t.scale === 0.9).loop === rep2.check_before.loop);
const edits = JSON.parse(fs.readFileSync(path.join(out, 'surgery-edits.json'), 'utf8')).edits;
check('surgery edits are written for the winner', edits.length === 1 && edits[0].layer === 0 && edits[0].expert === 3 && edits[0].scale === 0.5);
check('the engine is put back at the end', seen.dials.at(-1) === 0);

fs.rmSync(tmp, { recursive: true, force: true });
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

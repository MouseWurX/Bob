// make-probes (model-lab): twins and phrasing families from a made-up teacher. A twin is kept only when the teacher's
// answers flip between tool and no tool; a phrasing only when the teacher answers it like the original; the held-out
// 5% of lessons are never seeds; every probe has its own split; a second run carries on without repeating.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra ? ' ' + extra : ''}`); };
const here = path.dirname(fileURLToPath(import.meta.url));
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bob-probes-'));
const isHoldout = (id) => parseInt(crypto.createHash('md5').update(String(id)).digest('hex').slice(0, 8), 16) / 0xFFFFFFFF < 0.05;

const lessonsDir = path.join(tmp, 'lessons'); fs.mkdirSync(lessonsDir);
const tool = { type: 'function', function: { name: 'read_page', parameters: { type: 'object', properties: {} } } };
fs.writeFileSync(path.join(lessonsDir, 'toolsets.json'), JSON.stringify({ s1: { system: 'You are Bob.', tools: [tool] } }));
const ids = []; for (let i = 0; ids.filter(isHoldout).length < 2 || ids.length < 12; i++) ids.push(`idea-${i}`);
// even ideas need a tool ("open page N"), odd ones don't ("tell me about pages")
const L = ids.map((id, i) => ({ idea: id, messages: [{ role: 'user', content: i % 2 ? `tell me about pages ${i}` : `open page ${i}` }, { role: 'assistant', set: 's1', content: i % 2 ? 'Pages are...' : '', ...(i % 2 ? {} : { tool_calls: [{ function: { name: 'read_page', arguments: '{}' } }] }) }] }));
fs.writeFileSync(path.join(lessonsDir, 'lessons.jsonl'), L.map((x) => JSON.stringify(x)).join('\r\n') + '\r\n');
const heldOutUsers = new Set(L.filter((l) => isHoldout(l.idea)).map((l) => l.messages[0].content));

const asked = [];
const srv = http.createServer((req, res) => {
  let b = ''; req.on('data', (c) => (b += c)); req.on('end', () => {
    const j = JSON.parse(b); const send = (msg) => { res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify({ choices: [{ message: msg }] })); };
    const last = j.messages.at(-1).content;
    if (!j.tools) {   // writing
      if (/different ways/.test(last)) return send({ content: JSON.stringify(['open page pls', 'opne the page', 'tell me about pages instead', 'abre la página']) });
      const src = last.match(/"([^"]+)"/)[1];
      // flips the need, except for page 4 where it "fails" to flip
      return send({ content: /^open page 4\b/.test(src) ? 'open page 4 now' : src.startsWith('open') ? `tell me about ${src}` : `open ${src}` });
    }
    asked.push(last);
    // answering as Bob: anything with "open"/"opne"/"abre" needs the tool
    send(/\b(open|opne|abre)\b/.test(last) ? { content: '', tool_calls: [{ id: 'c1', type: 'function', function: { name: 'read_page', arguments: '{}' } }] } : { content: 'Sure, about pages...' });
  });
});
await new Promise((r) => srv.listen(0, '127.0.0.1', r));
const url = `http://127.0.0.1:${srv.address().port}`;
const out = path.join(tmp, 'probes');
const run = () => new Promise((resolve) => {
  const p = spawn(process.execPath, [path.join(here, '..', 'model-lab', 'make-probes.mjs'), '--url', url, '--lessons', lessonsDir, '--out', out, '--twins', '6', '--families', '2', '--per', '4'], { stdio: ['ignore', 'pipe', 'pipe'] });
  let log = ''; p.stdout.on('data', (d) => (log += d)); p.stderr.on('data', (d) => (log += d));
  p.on('close', (c) => { if (c) console.log(log); resolve(c); });
});
check('it finishes', (await run()) === 0);
const rows = fs.readFileSync(path.join(out, 'lessons.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l));
const twins = rows.filter((r) => r.probe === 'twin'), fams = rows.filter((r) => r.probe === 'family');
check('twins come in flipped pairs', twins.length > 0 && twins.length % 2 === 0 && [...new Set(twins.map((t) => t.pair))].every((p) => { const [a, b] = twins.filter((t) => t.pair === p); return Boolean(a.messages[1].tool_calls) !== Boolean(b.messages[1].tool_calls); }));
check('a twin that did not flip is left out', !twins.some((t) => /page 4 now/.test(t.messages[0].content)));
check('a pair never straddles the split', [...new Set(twins.map((t) => t.pair))].every((p) => new Set(twins.filter((t) => t.pair === p).map((t) => t.split)).size === 1));
check('family phrasings answered like the original are kept, others left out', fams.length > 0 && fams.every((f) => f.messages[1].tool_calls) && !fams.some((f) => /instead/.test(f.messages[0].content)));
check('the held-out lessons are never seeds', !rows.some((r) => heldOutUsers.has(r.messages[0].content) || isHoldout(r.from)));
check('every probe has a split', rows.every((r) => r.split === 'train' || r.split === 'holdout'));
check('the tool set comes along', JSON.parse(fs.readFileSync(path.join(out, 'toolsets.json'), 'utf8')).s1.tools.length === 1);
const before = asked.length;
check('a second run carries on without asking again', (await run()) === 0 && fs.readFileSync(path.join(out, 'lessons.jsonl'), 'utf8').trim().split('\n').length === rows.length, `${asked.length - before} new asks`);

// tool-score uses the probes' own split
const ts = path.join(tmp, 'ts');
const code = await new Promise((resolve) => {
  const p = spawn(process.execPath, [path.join(here, '..', 'model-lab', 'tool-score.mjs'), '--url', url, '--models', 'x=served', '--lessons', out, '--out', ts, '--split', 'train', '--no-think', '--no-odds'], { env: { ...process.env, BOB_AGENT_DIR: tmp }, stdio: ['ignore', 'pipe', 'pipe'] });
  let log = ''; p.stdout.on('data', (d) => (log += d)); p.stderr.on('data', (d) => (log += d));
  p.on('close', (c) => { if (c) console.log(log); resolve(c); });
});
const kept = fs.readdirSync(ts).filter((f) => /^answers-/.test(f)).flatMap((f) => fs.readFileSync(path.join(ts, f), 'utf8').trim().split('\n').map((l) => JSON.parse(l)));
check('tool-score runs the probes by their own split', code === 0 && kept.length === rows.filter((r) => r.split === 'train').length, `${kept.length}`);
srv.close();
fs.rmSync(tmp, { recursive: true, force: true });
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

// Two-Bob trial, Test B (1.5.185): a turn whose tool results don't fit the brain's chat memory, and a turn so long
// that saving it used to drop the question too. No brain, no network: plain functions on made-up messages.
import { Brain, fitContext, CUT_NOTE, TOO_LONG } from '../src/brain.js';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${ok ? '' : ' ' + extra}`); };
const size = (ms) => ms.reduce((a, m) => a + Math.ceil(String(m.content ?? '').length / 3) + 8, 0);

{ // twelve web pages, about 74,000 tokens, against a 32,768-token memory
  const page = 'word '.repeat(3700); // 18,500 characters
  const msgs = [{ role: 'system', content: 'You are Bob.' }, { role: 'user', content: 'What is Bob-Net?' }];
  for (let i = 0; i < 12; i++) { msgs.push({ role: 'assistant', content: '', tool_calls: [{ function: { name: 'fetch_page', arguments: { url: `https://example.com/${i}` } } }] }); msgs.push({ role: 'tool', tool_name: 'fetch_page', content: page }); }
  const before = JSON.stringify(msgs);
  const out = fitContext(msgs, 32768, null);
  check('tool results that overflow the chat memory are shortened to fit in three quarters of it', size(out) <= 32768 * 0.75, String(size(out)));
  check('the question, the system words and the tool calls are never cut', out[0].content === 'You are Bob.' && out[1].content === 'What is Bob-Net?' && out.filter((m) => m.tool_calls).length === 12);
  check('the cut says what happened and asks for an answer, not another read', out.some((m) => m.role === 'tool' && /were cut here so the chat fits in the brain's memory\. Answer from what is here if you can\./.test(m.content)) && !/call .* again/i.test(CUT_NOTE(5)));
  check('the oldest results are cut first, so the newest page keeps the most', out[2 + 1].content.length <= out[out.length - 1].content.length);
  check('the saved chat is left whole (only what is sent is shortened)', JSON.stringify(msgs) === before);
  const small = msgs.slice(0, 4);
  check('a chat that already fits is sent unchanged (the same array)', fitContext(small, 32768, null) === small);
  check('no known memory size (Ollama picks it): nothing is cut', fitContext(msgs, null, null) === msgs);
  check('a harder second cut when the brain still says it is too long', size(fitContext(out, 32768, null, 0.4)) <= 32768 * 0.4);
  check('llama-server\'s "too long" error is recognised', TOO_LONG.test('llama-server returned 400: request (74242 tokens) exceeds the available context size (32768 tokens), try increasing it') && !TOO_LONG.test('fetch failed'));
}

{ // saving a runaway turn: 650 tool steps after one question
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bob fit-'));
  const sess = [{ role: 'user', content: 'earlier question' }, { role: 'assistant', content: 'earlier answer' }, { role: 'user', content: 'What is Bob-Net?' }];
  for (let i = 0; i < 650; i++) { sess.push({ role: 'assistant', content: '', tool_calls: [{ function: { name: 'fetch_page', arguments: { url: 'https://example.com' } } }] }); sess.push({ role: 'tool', tool_name: 'fetch_page', content: '(Not read again.)' }); }
  const fake = { cfg: { dataDir: dir }, sessionDir: path.join(dir, 'sessions'), sessions: new Map([['s1', sess]]), session(id) { return this.sessions.get(id); }, sessionFile: Brain.prototype.sessionFile };
  fs.mkdirSync(fake.sessionDir, { recursive: true });
  // the failure note the job leaves (startTurn's catch)
  sess.push({ role: 'assistant', content: '', correction: '⚠ llama-server returned 400', failed: true });
  Brain.prototype.saveSession.call(fake, 's1');
  const saved = JSON.parse(fs.readFileSync(fake.sessionFile('s1'), 'utf8'));
  check('a turn longer than the whole window keeps its question when saved (it used to save an empty chat)', saved[0]?.role === 'user' && saved[0].content === 'What is Bob-Net?', JSON.stringify(saved).slice(0, 200));
  check('and keeps the failure note under it; the tool steps go to the older file', saved.length === 2 && saved[1].failed === true && fs.existsSync(path.join(dir, 'sessions', 's1.older.json')));
  const hist = Brain.prototype.history.call({ ...fake, refs: { find: () => null } }, 's1');
  check('the chat shows the failure note after a reload', hist.length === 2 && /llama-server returned 400/.test(hist[1].correction || ''));
  fs.rmSync(dir, { recursive: true, force: true });
}

{ const src = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'src', 'brain.js'), 'utf8').replace(/\r\n/g, '\n');
  check('every request goes through fitContext, and a failed job leaves a note in the chat', /const fitted = fitContext\(opts\.messages, opts\.ctx, opts\.tools, 0\.75, per\);/.test(src) && /correction: `⚠ \$\{String\(e\.message\)\.slice\(0, 400\)\}`, failed: true/.test(src)); }

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

// "Save as a test" (item 11, Nov 11): a reply that went wrong becomes a test case, so the loop test grows from Bob's
// real mistakes instead of only the questions written for it. Kept in <data>/my-tests.jsonl, one case a line:
//   { job: 'mine', id, at, text, need: [tools], used: [tools], answer, why }
// text is what you asked; used is what Bob ran then; need starts as the tools that worked, and the Lab can change it.
// model-lab/loop-test.mjs --mine <that file> runs them with the rest; the Lab's "Teach it from my mistakes" reads them.
// Nothing leaves the PC. Pure apart from the one file.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

export const TESTS_FILE = 'my-tests.jsonl';
export const MAX_TESTS = 500;
export const testsFile = (cfg) => path.join(cfg.dataDir || '.', TESTS_FILE);

const said = (m) => String(m?.text ?? m?.content ?? '');

// The case for the Bob answer with this id: the question before it and the steps it took. null when there's no such answer.
export function caseFor(messages, id, { why = '', now = Date.now() } = {}) {
  const list = Array.isArray(messages) ? messages : [];
  const at = list.findIndex((m) => m.id === id && m.role === 'assistant');
  if (at < 0) return null;
  let q = at - 1;
  while (q >= 0 && list[q].role !== 'user') q--;
  if (q < 0 || !said(list[q]).trim()) return null;
  const turn = list.slice(q + 1, at + 1);
  const used = [...new Set(turn.flatMap((m) => (m.tool_calls || []).map((c) => c.function?.name)).filter(Boolean))];
  const steps = list[at].steps || [];
  const worked = steps.length ? [...new Set(steps.filter((s) => s.ok).map((s) => s.tool))] : used;
  return {
    job: 'mine', id: crypto.createHash('sha1').update(`${said(list[q])}\n${now}`).digest('hex').slice(0, 12), at: now,
    text: said(list[q]).slice(0, 4000), need: worked, used: steps.length ? steps.map((s) => s.tool) : used,
    answer: said(list[at]).slice(0, 1500), why: String(why || '').slice(0, 500)
  };
}

export function readTests(cfg) {
  try {
    return fs.readFileSync(testsFile(cfg), 'utf8').replace(/\r\n/g, '\n').split('\n').filter((l) => l.trim()).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter((c) => c && c.text);
  } catch { return []; }
}

// Adds one case (the oldest go once there are more than MAX_TESTS). Returns how many there are now.
export function saveTest(cfg, c) {
  const all = [...readTests(cfg).filter((x) => x.id !== c.id), c].slice(-MAX_TESTS);
  fs.mkdirSync(path.dirname(testsFile(cfg)), { recursive: true });
  fs.writeFileSync(testsFile(cfg) + '.tmp', all.map((x) => JSON.stringify(x)).join('\n') + '\n');
  fs.renameSync(testsFile(cfg) + '.tmp', testsFile(cfg));
  return all.length;
}

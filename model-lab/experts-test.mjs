// Phase 0, step 1: how does Qwen3.6 hold up with fewer experts per word?
// Runs the same quiz at 8 (the model's own), 6, 4, 3 and 2 experts per word: picking Bob's right tool for plain
// requests, short facts, and small coding jobs checked by running the code. Thinking off (instruct first).
// node experts-test.mjs [--counts 8,6,4,3,2] [--bob <Bob source>] [--model <gguf>] [--llama <folder>] [--quick]
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { opts, locate, moeShape, checkFree, startServer, chat, stamp } from './common.mjs';
import { loadBob } from './bob-kit.mjs';

const o = opts({ counts: '8,6,4,3,2' });
const L = locate(o);
if (!L.model) { console.error('Qwen3.6-35B-A3B-UD-Q4_K_XL.gguf not found under <parent>/models. Pass --model.'); process.exit(1); }
checkFree(o);
const shape = moeShape(L.model);
console.log(`${shape.name}: ${shape.layers} layers, ${shape.experts} experts, ${shape.used} per word (key ${shape.key})`);
const kit = await loadBob(L.bob);

// ---- the quiz ----
const TOOL_JOBS = kit.phrasings.filter((p) => p.group && !p.pic && !p.recent);
const tools = kit.allTools();
const { system } = kit.turn(new Set(Object.keys(kit.groups())));
const FACTS = [
  ['What is the capital of Australia? One word.', /canberra/i], ['How many minutes are in 3.5 hours? Just the number.', /\b210\b/],
  ['What is 17 times 23? Just the number.', /\b391\b/], ['Which planet is known as the Red Planet? One word.', /mars/i],
  ['What gas do plants take in for photosynthesis? Short answer.', /carbon dioxide|co2/i], ['How many sides does a hexagon have? Just the number.', /\b6\b|six/i],
  ['Convert 100 degrees Celsius to Fahrenheit. Just the number.', /\b212\b/], ['Who wrote "Pride and Prejudice"? Name only.', /austen/i],
  ['What is the square root of 144? Just the number.', /\b12\b/], ['In what year did the first person walk on the Moon? Just the year.', /1969/],
  ['What is the chemical symbol for gold?', /\bAu\b/], ['If a train leaves at 14:40 and the trip takes 95 minutes, when does it arrive? HH:MM only.', /16:15/],
  ['What is the largest ocean on Earth? One or two words.', /pacific/i], ['How many bytes are in a kilobyte in the binary sense (KiB)? Just the number.', /1024/],
  ['What is the freezing point of water in Kelvin? Just the number, two decimals.', /273\.15/], ['Name the programming language whose package manager is called cargo.', /rust/i],
  ['What is 2 to the power of 10? Just the number.', /\b1024\b/], ['Which is bigger, 0.7 or 0.65? Just the number.', /\b0\.7\b/],
  ['A shirt costs $40 and is 25% off. What is the new price? Just the number.', /\b30\b/], ['What continent is Egypt in? One word.', /africa/i]
];
const CODE = [
  ['Write a JavaScript function named isPalindrome(s) that ignores case and non-letters. Reply with only the code.', 'isPalindrome', (f) => f('A man, a plan, a canal: Panama') === true && f('Bob') === true && f('hello') === false],
  ['Write a JavaScript function named fizz(n) that returns an array of strings for 1..n with FizzBuzz rules. Only the code.', 'fizz', (f) => JSON.stringify(f(15).slice(-3)) === '["13","14","FizzBuzz"]' && f(5)[2] === 'Fizz' && f(5)[4] === 'Buzz'],
  ['Write a JavaScript function named sumDigits(n) that returns the sum of the digits of a non-negative integer. Only the code.', 'sumDigits', (f) => f(12345) === 15 && f(0) === 0],
  ['Write a JavaScript function named uniqueSorted(a) returning the unique numbers of array a sorted ascending. Only the code.', 'uniqueSorted', (f) => JSON.stringify(f([3, 1, 3, 2, 1])) === '[1,2,3]'],
  ['Write a JavaScript function named camel(s) turning "hello world foo" into "helloWorldFoo". Only the code.', 'camel', (f) => f('hello world foo') === 'helloWorldFoo' && f('bob') === 'bob'],
  ['Write a JavaScript function named countVowels(s) returning how many of a, e, i, o, u (any case) are in s. Only the code.', 'countVowels', (f) => f('Patches the CAT') === 4 && f('xyz') === 0]
];
const quick = Boolean(o.quick);
const toolSet = quick ? TOOL_JOBS.filter((_, i) => i % 4 === 0) : TOOL_JOBS;

function runCode(text, name, test) {
  const code = (text.match(/```(?:js|javascript)?\s*([\s\S]*?)```/i)?.[1] || text).trim();
  try { const box = {}; vm.createContext(box); vm.runInContext(`${code}\n;globalThis.__f = ${name};`, box, { timeout: 2000 }); return Boolean(test(box.__f)); } catch { return false; }
}

async function quiz(url) {
  const r = { tool: 0, toolN: toolSet.length, fact: 0, factN: FACTS.length, code: 0, codeN: CODE.length, tps: [], misses: [] };
  for (const p of toolSet) {
    try {
      const { msg, timings } = await chat(url, { messages: [{ role: 'system', content: system }, { role: 'user', content: p.text }], tools, max: 512 });
      if (timings.predicted_per_second) r.tps.push(timings.predicted_per_second);
      const names = (msg.tool_calls || []).map((c) => c.function?.name);
      const ok = names.some((n) => kit.groupOf(n) === p.group || (n === 'use_tools' && JSON.parse(msg.tool_calls.find((c) => c.function.name === 'use_tools').function.arguments || '{}').group === p.group));
      if (ok) r.tool++; else r.misses.push(`[${p.job}] "${p.text}" -> ${names.join(',') || 'no tool'}`);
    } catch (e) { r.misses.push(`[${p.job}] "${p.text}" -> error ${e.message.slice(0, 80)}`); }
  }
  for (const [q, re] of FACTS) {
    const { msg } = await chat(url, { messages: [{ role: 'user', content: q }], max: 64, temperature: 0 });
    if (re.test(msg.content || '')) r.fact++; else r.misses.push(`fact "${q}" -> ${(msg.content || '').slice(0, 60)}`);
  }
  for (const [q, name, test] of CODE) {
    const { msg, timings } = await chat(url, { messages: [{ role: 'user', content: q }], max: 600, temperature: 0 });
    if (timings.predicted_per_second) r.tps.push(timings.predicted_per_second);
    if (runCode(msg.content || '', name, test)) r.code++; else r.misses.push(`code ${name} failed`);
  }
  r.tpsAvg = r.tps.length ? r.tps.reduce((a, b) => a + b, 0) / r.tps.length : 0;
  delete r.tps;
  return r;
}

const counts = String(o.counts).split(',').map(Number).filter((n) => n > 0 && n <= (shape.experts || 256));
const results = [];
for (const n of counts) {
  console.log(`\n--- ${n} experts per word ---`);
  const srv = await startServer({ server: L.server, model: L.model, mmproj: null, ctx: 16384, extra: ['--override-kv', `${shape.key}=int:${n}`], logFile: path.join(L.out, 'llama-server-lab.log') });
  try {
    const r = await quiz(srv.url);
    results.push({ experts: n, ...r, loadSec: srv.loadSec });
    console.log(`tools ${r.tool}/${r.toolN}, facts ${r.fact}/${r.factN}, code ${r.code}/${r.codeN}, ${r.tpsAvg.toFixed(1)} tok/s`);
  } finally { await srv.stop(); }
}
kit.done();

const when = stamp();
fs.writeFileSync(path.join(L.out, `experts-test-${when}.json`), JSON.stringify({ model: shape, results }, null, 2));
const pct = (a, b) => `${a}/${b} (${Math.round((100 * a) / Math.max(b, 1))}%)`;
const md = [`# Experts-per-word test, ${when}`, '', `Model: ${shape.name} (${shape.layers} layers, ${shape.experts} experts, ${shape.used} per word by default). Thinking off. Tool quiz: Bob's real prompt and all his tools, ${toolSet.length} plain requests from test/phrasings.js.`, '',
  '| Experts per word | Right tool | Facts | Code runs | Writing speed |', '|---|---|---|---|---|',
  ...results.map((r) => `| ${r.experts} | ${pct(r.tool, r.toolN)} | ${pct(r.fact, r.factN)} | ${pct(r.code, r.codeN)} | ${r.tpsAvg.toFixed(1)} tok/s |`), '',
  '## Misses', ...results.flatMap((r) => [`### ${r.experts} per word`, ...r.misses.map((m) => `- ${m}`), ''])].join('\n');
fs.writeFileSync(path.join(L.out, `experts-test-${when}.md`), md);
console.log(`\nReport: ${path.join(L.out, `experts-test-${when}.md`)}`);
process.exit(0);

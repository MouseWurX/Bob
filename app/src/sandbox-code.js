// Code sandbox (Settings, How Bob works; off unless the user turns it on).
//
// Sums, dates, sorting a list, tallying a table, checking a pattern: a brain is bad at exact arithmetic, so with this
// on Bob can write a few lines of JavaScript and run them, and answer from the result instead of guessing.
// The code runs in the same sandbox as the tools Bob makes himself (selftools.js): Bob's own Node with Node's
// permission switch on, in a fresh empty folder that is thrown away straight after. It can't read or write anything
// outside that folder, can't start programs, has no keys in its environment, and no internet: switched off by Node where
// this Node can (--allow-net), otherwise the ready-made ways are taken away and the code is checked for the rest
// (a check, not a wall; Help says so), 20 seconds and 512 MB at most. The same plain checks as
// self-made tools run first. If the sandbox doesn't hold on this computer (the probe in selftools.js), it stays off.
// No click is asked, because nothing outside the throwaway folder can change; every run is in the logbook and the
// code is shown with the step in the chat.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { runSandboxed, sandboxHolds, codeProblems } from './selftools.js';
import { runPython, hasPython } from './py-sandbox.js'; // 🧰 More tools: Python in the same box

export const sandboxOn = (cfg) => cfg?.sandboxCode === true;
export const MAX_SANDBOX_CODE = 20000;
export const SANDBOX_SECONDS = 20;
export const scratchRoot = (cfg) => path.join(cfg.innDir, 'tools', '_scratch');

const fn = (name, description, properties, required) => ({ type: 'function', function: { name, description, parameters: { type: 'object', properties, required } } });

// Bob writes the body of a function (top-level imports allowed); this makes it a module with run(input).
export function wrapCode(code) {
  const src = String(code || '').replace(/\r\n/g, '\n');
  if (/\bexport\s+(?:async\s+)?function\s+run\s*\(|\bexport\s+default\b/.test(src)) return src;
  // Imports at the top are kept at the top, even when the next statement is on the same line.
  const imports = [];
  let rest = src;
  const IMPORT = /^\s*import\s+(?:[\w*{}\s,$]+?\s+from\s*)?['"][^'"\n]+['"]\s*;?/;
  for (let m; (m = rest.match(IMPORT));) { imports.push(m[0].trim()); rest = rest.slice(m[0].length); }
  const body = rest;
  return `${imports.join('\n')}\nexport async function run(input) {\n${body}\n}\n`;
}

export async function runInSandbox(cfg, code, input = {}, { signal, holds = sandboxHolds, run = runSandboxed } = {}) {
  if (typeof code !== 'string' || !code.trim()) throw new Error('There was no code to run.');
  if (code.length > MAX_SANDBOX_CODE) throw new Error(`That's ${code.length} characters of code; up to ${MAX_SANDBOX_CODE} for a quick sum.`);
  const h = await holds(cfg);
  if (!h?.ok) return { ok: false, error: `The sandbox doesn't hold on this replicant matrix (${h?.why || 'no answer'}), so I won't run code here. I'll work it out by hand instead.` };
  const mod = wrapCode(code);
  const problems = codeProblems(cfg, mod, { internet: false });
  if (problems.length) return { ok: false, error: `I won't run that: ${problems.map((p) => p.replace(/, but the card says it doesn't\..*$/, ', and the sandbox has no internet.').replace(/\(a tool is a plain module that uses import\)/, '(use import at the top)').replace(/A tool can only/, 'The sandbox can only').replace(/which a tool may never do/, 'which the sandbox never allows')).join(' ')}` };
  const dir = path.join(scratchRoot(cfg), crypto.randomUUID().slice(0, 12));
  fs.mkdirSync(dir, { recursive: true });
  try {
    fs.writeFileSync(path.join(dir, 'tool.mjs'), mod);
    return await run({ dir, input: input && typeof input === 'object' && !Array.isArray(input) ? input : { value: input }, internet: false, timeoutSec: SANDBOX_SECONDS, signal });
  } finally {
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch {}
  }
}

export function sandboxTool(brain) {
  const cfg = brain.cfg;
  // 🧰 More tools, "Let Bob use Python in the sandbox": the same box, with Python (py-sandbox.js) as well.
  const pyOn = () => cfg.moreTools?.python === true;
  return {
    get schema() {
      const py = pyOn();
      return fn('run_in_sandbox', `Work something out exactly with a few lines of ${py ? 'JavaScript or Python' : 'JavaScript'} in a locked sandbox: sums, money, dates, units, counting, sorting, patterns${py ? ', tables of data, statistics' : ''}. No files, internet or programs; ${py ? '30' : '20'} seconds.`, {
        code: { type: 'string', description: py ? 'JavaScript: the body of async function run(input), ending in return. Python: a script; set result = the answer (the input is in data).' : 'The body of async function run(input), ending in return. Like: return (new Date("2026-12-25") - new Date("2026-11-11")) / 864e5;' },
        ...(py ? { language: { type: 'string', enum: ['javascript', 'python'], description: 'Default javascript. Python has its standard library (statistics, decimal, fractions, datetime, csv, json, re), no numpy.' } } : {}),
        input: { type: 'object', description: 'Optional: data the code reads as input (Python: data).' }
      }, ['code']);
    },
    async run({ code, input, language }, ctx = {}) {
      if (!sandboxOn(cfg)) return 'The sandbox is off. It\'s in Settings, How Bob works: "Code sandbox".';
      const python = String(language || '').toLowerCase() === 'python';
      if (python && !pyOn()) return 'Python in the sandbox is off. It\'s in Settings, How Bob works, 🧰 More tools: "Let Bob use Python in the sandbox". Use JavaScript instead.';
      if (python && !hasPython(cfg)) return 'Python isn\'t here yet: Settings, How Bob works, 🧰 More tools, Get Python. Use JavaScript for now.';
      const r = python ? await runPython(cfg, code, input || {}, { signal: ctx.signal }) : await runInSandbox(cfg, code, input || {}, { signal: ctx.signal });
      const printed = String(r.log || '').trim().slice(-3000);
      brain.log?.('sandbox', `${python ? 'python ' : ''}${r.ok ? 'ran' : 'refused or failed'}: ${String(code).replace(/\s+/g, ' ').slice(0, 120)}`);
      if (!r.ok) return `Error: ${r.error}${printed ? `\nPrinted:\n${printed}` : ''}`;
      const out = typeof r.out === 'string' ? r.out : JSON.stringify(r.out);
      return `Result: ${out}${printed ? `\nPrinted:\n${printed}` : ''}`;
    },
    summary: ({ code, language }) => `sandbox${String(language || '').toLowerCase() === 'python' ? ' (python)' : ''}: ${String(code || '').replace(/\s+/g, ' ').slice(0, 160)}`
  };
}

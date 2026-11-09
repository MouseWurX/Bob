// Runs one tool Bob made, inside the sandbox (selftools.js starts this with Node's permission switch on, so the
// tool can only read and write the folders it was given, and can't start programs, workers or add-ons).
// Arguments: the tool file, the input file, the answer file, and "1" if the card allowed the internet.
// The answer goes in the answer file as JSON: { ok, out } or { ok: false, error }.
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const [toolFile, inputFile, outFile, net] = process.argv.slice(2);
// No internet on the card: the ready-made ways to reach it are taken away (the code was also checked for others).
if (net !== '1') for (const k of ['fetch', 'WebSocket', 'EventSource', 'XMLHttpRequest', 'Request', 'Response']) { try { delete globalThis[k]; } catch {} }
const answer = (o) => { try { fs.writeFileSync(outFile, JSON.stringify(o)); } catch {} };
try {
  const input = JSON.parse(fs.readFileSync(inputFile, 'utf8') || '{}');
  const mod = await import(pathToFileURL(toolFile).href);
  const run = typeof mod.run === 'function' ? mod.run : mod.default;
  if (typeof run !== 'function') throw new Error('The tool has no run function (it needs "export async function run(input)").');
  const workDir = path.dirname(outFile);
  let out = await run(input, { workDir, filesDir: path.join(path.dirname(toolFile), 'files') });
  if (typeof out !== 'string') out = JSON.stringify(out ?? null, null, 1);
  answer({ ok: true, out: String(out).slice(0, 20000) });
} catch (e) {
  const blocked = e?.code === 'ERR_ACCESS_DENIED';
  answer({ ok: false, blocked, error: String(blocked ? `The sandbox stopped it: ${e.message}${e.resource ? ` (${e.permission || 'access'}: ${e.resource})` : ''}` : e?.message || e).slice(0, 2000) });
  process.exitCode = 1;
}

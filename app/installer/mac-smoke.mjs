// The Mac build's engine check, run by .github/workflows/build.yml on a macOS runner (Apple Silicon).
// It fetches llama.cpp and stable-diffusion.cpp the way Bob does when someone clicks Get (newest release with a
// Mac build, GitHub's checksum checked, unpacked, made runnable) into a throwaway folder, then starts each program
// once to see it runs on macOS (llama-server --version, sd-cli --help). For uv (the audio tools) it only checks that
// the newest release has an Apple Silicon build: installing it also sets up gigabytes of music models. Nothing is kept.
// Usage: node installer/mac-smoke.mjs [folder]
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { installEngine, engineExe, ENGINES, engineFor, findRelease } from '../src/engines.js';

if (process.platform !== 'darwin') { console.log('Skipped: this check is for a Mac.'); process.exit(0); }
// On GitHub's runners, ask GitHub's API with the job's own token, so the shared runners don't hit the hourly limit.
if (process.env.GH_TOKEN) {
  const plain = globalThis.fetch;
  globalThis.fetch = (u, o = {}) => plain(u, String(u).startsWith('https://api.github.com/') ? { ...o, headers: { ...(o.headers || {}), authorization: `Bearer ${process.env.GH_TOKEN}` } } : o);
}
const agentDir = process.argv[2] || fs.mkdtempSync(path.join(os.tmpdir(), 'bob-mac-smoke-'));
const cfg = { agentDir };
let bad = 0;
try {
  const { rel, asset } = await findRelease(engineFor(ENGINES.find((x) => x.id === 'audio')), false);
  console.log(`OK   audio (uv) ${rel.tag_name} has ${asset.name}`);
} catch (e) { bad++; console.log(`FAIL audio (uv): ${e.message}`); }
for (const [id, args] of [['llamacpp', ['--version']], ['sdcpp', ['--help']]]) {
  const pub = { done: 0, total: 0 };
  try {
    const r = await installEngine(cfg, id, { nvidia: false, pub, signal: AbortSignal.timeout(15 * 60_000), tick: () => {} });
    const exe = engineExe(cfg, ENGINES.find((x) => x.id === id));
    let out = '';
    try { out = execFileSync(exe, args, { encoding: 'utf8', timeout: 60_000, stdio: ['ignore', 'pipe', 'pipe'] }); }
    catch (e) { out = `${e.stdout || ''}${e.stderr || ''}`; if (!out.trim()) throw new Error(`${path.basename(exe)} didn't start: ${e.message}`); }
    console.log(`OK   ${id} ${r.version} ${r.asset}\n     ${exe}\n     ${out.trim().split('\n').slice(0, 2).join(' | ')}`);
  } catch (e) {
    bad++;
    console.log(`FAIL ${id}: ${e.message}`);
  }
}
if (!process.argv[2]) fs.rmSync(agentDir, { recursive: true, force: true });
process.exit(bad ? 1 : 0);

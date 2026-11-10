// 1.5.83 "tested engine": Get llama.cpp (and Get Bob ready) installs the release every speed test used
// (package.json bob.bundledLlamaTag), not whatever is newest that day. "Get newer build" still fetches the newest.
// Run: node test/run-tested-engine-test.js
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { installEngine, engineStatus, TESTED_LLAMA, ENGINES, engineFor } from '../src/engines.js';

const here = path.dirname(fileURLToPath(import.meta.url));
let failures = 0;
const check = (ok, name) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`); if (!ok) failures++; };
const pkg = JSON.parse(fs.readFileSync(path.join(here, '..', 'package.json'), 'utf8'));
check(/^b\d+$/.test(TESTED_LLAMA) && TESTED_LLAMA === pkg.bob.bundledLlamaTag, `the tested llama.cpp is the bundled one (${TESTED_LLAMA})`);

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bob-tested-'));
const cfg = { agentDir: tmp };
const asked = [];
const realFetch = globalThis.fetch;
globalThis.fetch = async (u) => { asked.push(String(u)); return { ok: true, json: async () => (String(u).includes('/tags/') ? { tag_name: TESTED_LLAMA, assets: [] } : []) }; };
const tryIt = async (opts) => { asked.length = 0; try { await installEngine(cfg, 'llamacpp', { nvidia: true, pub: {}, tick: () => {}, ...opts }); } catch (e) { return e.message; } return ''; };

let msg = await tryIt({});
check(asked.length === 1 && asked[0].endsWith(`/repos/ggml-org/llama.cpp/releases/tags/${TESTED_LLAMA}`), `plain Get asks GitHub for the tested release (${asked[0]})`);
check(/pinned llama\.cpp release/.test(msg), 'and refuses rather than falling back to the newest when that release has no build');
await tryIt({ newest: true });
check(asked.length === 1 && /releases\?per_page=15$/.test(asked[0]), '"Get newer build" (newest) looks at the newest releases');
await tryIt({ tag: 'b9999' });
check(asked[0]?.endsWith('/releases/tags/b9999'), 'an explicit tag (the release bundler) still wins');
asked.length = 0;
// stable-diffusion.cpp has no ARM Linux build, so on an ARM computer whisper.cpp stands in for "another engine".
const other = engineFor(ENGINES.find((e) => e.id === 'sdcpp')).unavailable ? 'whispercpp' : 'sdcpp';
try { await installEngine(cfg, other, { nvidia: true, pub: {}, tick: () => {} }); } catch {}
check(/releases\?per_page=15$/.test(asked[0] || ''), `other engines are unchanged (${other} still takes its newest build)`);
globalThis.fetch = realFetch;

const st = engineStatus(cfg).find((e) => e.id === 'llamacpp');
check(st.tested === TESTED_LLAMA && st.pinned === false, 'the cellar knows the tested build and still offers "Check for a newer build"');

const cellar = fs.readFileSync(path.join(here, '..', 'public', 'cellar.js'), 'utf8');
check(cellar.includes('data-newest="1"') && cellar.includes("b.dataset.newest ? '@newest' : ''"), 'the "Get newer build" button queues engine:<id>@newest');
check(cellar.includes('Go back to the tested build ('), 'a newer build can be swapped back for the tested one');
const help = fs.readFileSync(path.join(here, '..', 'public', 'help-content.js'), 'utf8');
check(help.includes('<strong>Go back to the tested build</strong>') && help.includes('<strong>Update</strong>'), 'Help names both buttons word for word');

fs.rmSync(tmp, { recursive: true, force: true });
console.log(failures ? `\n${failures} failed` : '\nAll passed');
process.exit(failures ? 1 : 0);

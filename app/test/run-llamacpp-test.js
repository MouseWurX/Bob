// Tests Bob running his own llama.cpp engine (with a fake llama-server). Run: node test/run-llamacpp-test.js
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bob-llama-'));
const models = path.join(tmp, 'models');
const addModel = (name, tag, hex) => {
  const dir = path.join(models, 'manifests', 'registry.ollama.ai', 'library', name);
  fs.mkdirSync(dir, { recursive: true });
  fs.mkdirSync(path.join(models, 'blobs'), { recursive: true });
  fs.writeFileSync(path.join(models, 'blobs', `sha256-${hex}`), 'GGUF');
  fs.writeFileSync(path.join(dir, tag), JSON.stringify({ layers: [{ mediaType: 'application/vnd.ollama.image.model', digest: `sha256:${hex}` }] }));
};
addModel('gemma4', '26b', 'aaa111');
addModel('qwen3-coder', '30b', 'bbb222');

// Tests start from the shipped example settings (the real config.json is never published or read here).
const cfg = { ...JSON.parse(fs.readFileSync(path.join(here, '..', 'config.example.json'), 'utf8')), userName: 'Sam', quickOnCpu: false, engine: 'ollama', models: { bob: 'gemma4:26b', tinker: 'qwen3-coder:30b', ledger: 'gemma4:26b', scout: 'gemma4:26b', painter: 'gemma4:26b', reviewer: 'gemma4:26b' }, stt: { provider: 'ollama', model: 'gemma4:e4b' } };
cfg.engine = 'llamacpp';
cfg.llamacpp = { ...cfg.llamacpp, exe: process.execPath, preArgs: [path.join(here, 'mock-llama-server.js')], ollamaModelsDir: models, port: 18091 };
cfg.readRoots = []; cfg.readOnlyRoots = [];
fs.writeFileSync(path.join(tmp, 'config.json'), JSON.stringify(cfg));

const PORT = 7798;
const bob = spawn(process.execPath, [path.join(here, '..', 'src', 'server.js')], {
  env: { ...process.env, BOB_TEST: '1', BOB_CONFIG: path.join(tmp, 'config.json'), BOB_AGENT_DIR: path.join(tmp, 'Bob home'), BOB_PORT: String(PORT) },
  stdio: ['ignore', 'pipe', 'inherit']
});
await new Promise((r) => bob.stdout.once('data', r));
const base = `http://127.0.0.1:${PORT}`;
let failures = 0;
const check = (ok, name) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`); if (!ok) failures++; };

const events = [];
const ctrl = new AbortController();
(async () => {
  const res = await fetch(base + '/api/events', { signal: ctrl.signal });
  let buf = '';
  for await (const c of res.body) {
    buf += Buffer.from(c).toString();
    let i;
    while ((i = buf.indexOf('\n\n')) >= 0) {
      const line = buf.slice(0, i).split('\n').find((l) => l.startsWith('data: '));
      buf = buf.slice(i + 2);
      if (line) events.push(JSON.parse(line.slice(6)));
    }
  }
})().catch(() => {});
async function turn(text) {
  const start = events.length;
  const r = await fetch(base + '/api/chat', { method: 'POST', headers: { 'content-type': 'application/json', 'x-bob': '1' }, body: JSON.stringify({ sessionId: 'l', text }) });
  const { turnId } = await r.json();
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    const mine = events.slice(start).filter((e) => e.turnId === turnId);
    if (mine.some((e) => e.type === 'done')) return mine;
    await new Promise((r) => setTimeout(r, 50));
  }
  throw new Error('timeout');
}
const text = (evs) => evs.filter((e) => e.type === 'token').map((e) => e.text).join('');

try {
  let evs = await turn('hello');
  check(evs.some((e) => e.type === 'announce'), 'announces starting his own engine');
  check(/Hello from sha256-aaa111/.test(text(evs)), 'found gemma4:26b in Ollama\'s model folder and chatted through llama-server');
  evs = await turn('hello again');
  check(!evs.some((e) => e.type === 'announce'), 'no reload when the model is already running');
  evs = await turn('put a quest on my board');
  const board = fs.readFileSync(path.join(tmp, 'Bob home', 'inn', 'notice-board.md'), 'utf8');
  check(board.includes('Llama quest'), 'tool calls work through llama-server (streamed in pieces)');
  check(/bad ids: 0/.test(text(evs)), 'tool results are linked to their tool calls');
  const st = await (await fetch(base + '/api/status')).json();
  check(st.engine === 'llama.cpp' && st.loaded[0]?.name === 'gemma4:26b', 'status shows his own engine');
} catch (e) { console.error(e); failures++; }
finally { ctrl.abort(); bob.kill(); }
await new Promise((r) => setTimeout(r, 500));
console.log(failures ? `\n${failures} failed` : '\nAll llama.cpp tests passed');
process.exit(failures ? 1 : 0);

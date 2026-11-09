// 1.5.20: the handoffs and the picture engine kept loaded don't fight. Waking the brain lets the picture engine
// make room first, and finished jobs keep a short ledger so the queue file stays small.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Brain } from '../src/brain.js';
import { slimHandoff, safeToResume } from '../src/handoff.js';

let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra && !ok ? ' -> ' + extra : ''}`); };
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bob-trim-'));
const dataDir = path.join(tmp, 'inn', 'bob');
fs.mkdirSync(dataDir, { recursive: true });
const cfg = { agentDir: tmp, innDir: path.join(tmp, 'inn'), dataDir, painterDir: path.join(tmp, 'inn', 'painter'), settingsFile: path.join(dataDir, 'settings.json'), logbook: path.join(dataDir, 'logbook.md'),
  readRoots: [], readOnlyRoots: [], models: { bob: 'main:latest' }, engine: 'ollama', ollamaUrl: 'http://127.0.0.1:1' };
const brain = new Brain(cfg, () => {});
clearInterval(brain.reminderTimer);
brain.fitCtx = async () => 8192;
const loads = [], order = [];
brain.engine = { isLoaded: async () => false, preload: async (m) => { loads.push(m); order.push('load'); return 1; }, loaded: async () => [], estimateLoad: async () => 5, unloadAll: async () => [] };
brain.painter = { yieldFor: async (m) => { order.push(`yield:${m}`); return []; } };
await brain.wake('typing');
check('waking the brain lets the picture engine make room first (no fight over the card)', order.join() === 'yield:main:latest,load', order.join());
order.length = 0;
brain.cfg.models.bob = 'cpu:latest'; brain.cfg.sessionBrains = {};
const realChat = brain.engine;
const big = { expect: { kind: 'picture' }, steps: Array(30).fill({ kind: 'load', what: 'x', state: 'done' }), outputs: [{ type: 'image', file: 'a.png', tool: 'make_image', url: '/images/a.png', at: 1 }], actions: [{ name: 'app_act', ok: true, at: 1, text: 'x'.repeat(300), args: 'y'.repeat(300) }] };
const slim = slimHandoff(big);
check('a finished job keeps what it made and did, without the step-by-step log', !slim.steps && slim.outputs[0].file === 'a.png' && slim.actions[0].name === 'app_act' && !slim.actions[0].text);
check('...and still counts as having changed something (no blind redo after a restart)', safeToResume({ handoff: slim }) === false);
check('...and is much smaller', JSON.stringify(slim).length * 5 < JSON.stringify(big).length);
fs.rmSync(tmp, { recursive: true, force: true });
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

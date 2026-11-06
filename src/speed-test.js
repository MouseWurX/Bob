// "Test Bob's speed" (1.5.24): times what the user feels, so a change can be compared before and after.
// Frees the chat brain, wakes it as typing would, waits a few seconds as if the user were still typing,
// then asks two short questions. Each result is kept (the last 20) with the switches that were on.
import fs from 'node:fs';
import path from 'node:path';
import { chatBrain } from './brain-mode.js';
import { currentSession } from './sessions.js';
import { tuning } from './tuning.js';
import { VERSION } from './config.js';
import { sleep } from './util.js';

const QUESTIONS = ['In three short sentences, why is the sky blue?', 'Name three good habits for keeping code tidy, one line each.'];
const fileOf = (cfg) => path.join(cfg.dataDir, 'speed-tests.json');
export function speedHistory(cfg) { try { return JSON.parse(fs.readFileSync(fileOf(cfg), 'utf8')).slice(-20); } catch { return []; } }

const secs = (ms) => Math.round(ms / 100) / 10;

async function ask(brain, model, opts, question) {
  const { messages, tools } = brain.startPrompt();
  const t0 = Date.now();
  let first = 0, pieces = 0;
  await brain.engine.chat({ model, messages: [...messages, { role: 'user', content: question }], tools, think: false, ...opts,
    onToken: (t) => { if (!first && String(t).trim()) first = Date.now(); pieces++; } });
  const end = Date.now();
  return { firstWord: secs((first || end) - t0), full: secs(end - t0), perSecond: first && end > first ? Math.round((pieces * 10000) / (end - first)) / 10 : null };
}

export async function speedTest(brain, { typingMs = 5000 } = {}) {
  if (brain.turns.size || brain.speedTesting || brain.queue.some((j) => j.state === 'working')) throw new Error('Bob is busy. Try the speed test when he has finished.');
  const cfg = brain.cfg;
  const { model, cpu, ctx: want } = chatBrain(cfg);
  if (!model) throw new Error('Pick a brain in Get models first.');
  brain.speedTesting = true;
  try {
    const ctx = await brain.fitCtx(model, want);
    await (brain.engine.unload ? brain.engine.unload(model) : brain.engine.unloadAll()).catch(() => []);
    const t0 = Date.now();
    await brain.wake('speed test');
    const wake = secs(Date.now() - t0);
    await sleep(typingMs);
    const cold = await ask(brain, model, { cpu, ctx }, QUESTIONS[0]);
    const warm = await ask(brain, model, { cpu, ctx }, QUESTIONS[1]);
    const rec = { at: new Date().toISOString(), version: VERSION.label, model, where: cpu ? 'processor' : 'graphics card', session: currentSession(cfg).label, engine: cfg.engine, switches: tuning(cfg), wake, typingS: secs(typingMs), first: cold, next: warm };
    const all = [...speedHistory(cfg), rec].slice(-20);
    try { fs.writeFileSync(fileOf(cfg), JSON.stringify(all, null, 2)); } catch {}
    brain.log?.('model', `speed test: ${model} on the ${rec.where}: woke in ${wake} s, first word ${cold.firstWord} s, full answer ${cold.full} s`);
    return rec;
  } finally { brain.speedTesting = false; }
}

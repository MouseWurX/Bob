// 1.5.32: the Gaming session's "graphics card" switch: Automatic (starting position), Never use the card, Always borrow a little.
// Uses fake card and processor readings and the fake llama-server, so no graphics card is needed.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { LlamaCpp } from '../src/llamacpp.js';
import { cardPlan, decideCard, gamingCard, readCpu, CARD_PLAN_TEXT } from '../src/gaming-card.js';
import { mergeSettings, SETTING_KEYS } from '../src/config.js';
import { settingsNow } from '../src/self-help.js';

const here = path.dirname(fileURLToPath(import.meta.url));
let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra ? ' ' + extra : ''}`); };

// The setting
check('starts on Automatic; junk falls back to Automatic', gamingCard({}) === 'auto' && gamingCard({ gamingCard: 'sometimes' }) === 'auto');
check('saved as a setting, cleaned on load', SETTING_KEYS.includes('gamingCard') && mergeSettings({}, { gamingCard: 'never' }).gamingCard === 'never' && mergeSettings({}, { gamingCard: 'x' }).gamingCard === 'auto');

// The rule
const free = { util: 10, freeMB: 9000 }, busyCard = { util: 95, freeMB: 9000 }, fullCard = { util: 20, freeMB: 900 };
check('Never: processor only, whatever the readings', cardPlan('never', { card: free, cpuPct: 100, brainMB: 2500 }) === 'none');
check('Always: borrow a little, even while a game uses the card (as before)', cardPlan('always', { card: busyCard }) === 'borrow');
check('Automatic, card has room: borrow a little', cardPlan('auto', { card: free, cpuPct: 30, brainMB: 2500 }) === 'borrow');
check('Automatic, card busy (80% or more): processor only', cardPlan('auto', { card: busyCard, cpuPct: 30 }) === 'none' && cardPlan('auto', { card: { util: 80, freeMB: 9000 } }) === 'none');
check('Automatic, card memory nearly full (under 1.5 GB free): processor only', cardPlan('auto', { card: fullCard }) === 'none');
check('Automatic, processor at full load and room on the card: the whole small brain on the card', cardPlan('auto', { card: free, cpuPct: 95, brainMB: 2500 }) === 'whole');
check('Automatic, processor at full load but not enough card memory for the whole brain: borrow a little', cardPlan('auto', { card: { util: 10, freeMB: 3000 }, cpuPct: 95, brainMB: 2500 }) === 'borrow');
check('Automatic, processor full and card busy: still processor only (never fight the game for the card)', cardPlan('auto', { card: busyCard, cpuPct: 100, brainMB: 2500 }) === 'none');
check('Automatic, no NVIDIA card or no reading: as before (borrow)', cardPlan('auto', { card: null, cpuPct: 100 }) === 'borrow');
// 1.5.133, from Rook: built-in graphics with no reading stay on the processor.
check('Automatic, built-in graphics (Legion Go) and no reading: processor only, not a fake borrow', cardPlan('auto', { card: null, cpuPct: 100, sharedGraphics: true }) === 'none');
check('Automatic, built-in graphics with a full processor and no reading: still processor only (can\'t "whole" with no card reading)', cardPlan('auto', { card: null, cpuPct: 100, brainMB: 2500, sharedGraphics: true }) === 'none');
check('Automatic, built-in graphics reading is live: the normal busy/room rules still apply', cardPlan('auto', { card: busyCard, cpuPct: 30, sharedGraphics: true }) === 'none' && cardPlan('auto', { card: free, cpuPct: 30, sharedGraphics: true }) === 'borrow');
check('Never and Always ignore the shared-graphics hint (the user\'s choice wins)', cardPlan('never', { card: null, sharedGraphics: true }) === 'none' && cardPlan('always', { card: null, sharedGraphics: true }) === 'borrow');
check('decideCard: built-in graphics with no reading -> processor only', await (async () => { const read = { card: async () => null, cpu: async () => 10 }; return await decideCard({ gamingCard: 'auto', sharedGraphics: true }, { read }); })() === 'none');
check('decideCard: unknown hardware with no reading -> as before (borrow)', await (async () => { const read = { card: async () => null, cpu: async () => 10 }; return await decideCard({ gamingCard: 'auto' }, { read }); })() === 'borrow');
check('decideCard only reads the card on Automatic', await (async () => { let reads = 0; const read = { card: async () => { reads++; return busyCard; }, cpu: async () => { reads++; return 0; } };
  const n = await decideCard({ gamingCard: 'never' }, { read }), a = await decideCard({ gamingCard: 'always' }, { read }), u = await decideCard({}, { read });
  return n === 'none' && a === 'borrow' && u === 'none' && reads === 2; })());
check('the processor reading is 0 to 100', await (async () => { const p = await readCpu(100); return p >= 0 && p <= 100; })());
check('wording for each plan', Object.keys(CARD_PLAN_TEXT).join() === 'none,borrow,whole');
check('Bob knows the setting (Help yourself)', /Gaming session: graphics card: Automatic/.test(settingsNow({})) && /Never use the card/.test(settingsNow({ gamingCard: 'never' })));

// The engine
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bob-gcard-'));
const models = path.join(tmp, 'models');
const dir = path.join(models, 'manifests', 'registry.ollama.ai', 'library', 'qwen3');
fs.mkdirSync(dir, { recursive: true }); fs.mkdirSync(path.join(models, 'blobs'), { recursive: true });
fs.writeFileSync(path.join(models, 'blobs', 'sha256-bbb222'), 'GGUF');
fs.writeFileSync(path.join(dir, '4b'), JSON.stringify({ layers: [{ mediaType: 'application/vnd.ollama.image.model', digest: 'sha256:bbb222' }] }));
const dataDir = path.join(tmp, 'inn', 'bob'); fs.mkdirSync(dataDir, { recursive: true });
const cfg = { session: 'light', agentDir: tmp, dataDir, ollamaKeepAlive: '10m', llamacpp: { exe: process.execPath, preArgs: [path.join(here, 'mock-llama-server.js')], ollamaModelsDir: models, port: 18097, args: [] } };
const eng = new LlamaCpp(cfg);
let card = free, cpu = 20;
eng.cardReaders = { card: async () => card, cpu: async () => cpu };
const argsOf = () => fs.readFileSync(path.join(dataDir, 'llama-server-args.txt'), 'utf8');
const cudaOf = async () => (await (await fetch(eng.url + '/test-env')).json()).cuda;
const ngl = () => argsOf().match(/-ngl (\d+)/)?.[1];
const alive = () => Boolean(eng.child && eng.child.exitCode === null);

await eng.preload('qwen3:4b', null, { cpu: true });
check('Automatic, card free: brain on the processor (-ngl 0), card visible for prompt reading', eng.currentCard === 'borrow' && ngl() === '0' && (await cudaOf()) === null);
card = busyCard;
check('a game starts using the card: the next quiet-minute check stops the brain', await eng.idleTick() && !alive() && eng.cardFlip?.from === 'borrow' && eng.cardFlip?.to === 'none');
await eng.preload('qwen3:4b', null, { cpu: true });
check('the next chat loads it processor-only: the card is hidden from llama.cpp', eng.currentCard === 'none' && ngl() === '0' && (await cudaOf()) === '-1');
check('nothing changed: the check leaves it loaded', !(await eng.idleTick()) && alive());
eng.active = 1; card = free;
check('never mid-chat, even when the plan changed', !(await eng.idleTick()) && alive());
eng.active = 0; card = free; cpu = 99;
fs.writeFileSync(path.join(models, 'blobs', 'sha256-bbb222'), Buffer.alloc(1024 * 1024 * 3)); // a 3 MB "brain"
check('the game stops and the processor is flat out: stopped again', await eng.idleTick() && !alive());
await eng.preload('qwen3:4b', null, { cpu: true });
check('loaded with the whole small brain on the card (-ngl 999)', eng.currentCard === 'whole' && ngl() === '999' && (await cudaOf()) === null);
cfg.gamingCard = 'always'; card = busyCard; cpu = 10;
check('Always: no checks, it stays as loaded', !(await eng.idleTick()) && alive());
await eng.stopServer();
await eng.preload('qwen3:4b', null, { cpu: true });
check('Always: borrows a little even with the card busy', eng.currentCard === 'borrow' && ngl() === '0' && (await cudaOf()) === null);
cfg.gamingCard = 'never';
await eng.stopServer();
await eng.preload('qwen3:4b', null, { cpu: true });
check('Never: processor only, card hidden', eng.currentCard === 'none' && (await cudaOf()) === '-1');
cfg.session = 'art'; cfg.gamingCard = 'never';
await eng.stopServer();
await eng.preload('qwen3:4b', null, { cpu: true });
check('the Art session (also on the processor) is not affected by the Gaming switch', eng.currentCard === null && ngl() === '0' && (await cudaOf()) === null && !(await eng.idleTick()));
cfg.session = 'light';
await eng.stopServer();
await eng.preload('qwen3:4b', null, { cpu: false });
check('a brain loaded on the card (not the Gaming brain path) is left alone', eng.currentCard === null && !/-ngl 0/.test(argsOf()));
await eng.stopServer();
clearInterval(eng.idleTimer);
fs.rmSync(tmp, { recursive: true, force: true });
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

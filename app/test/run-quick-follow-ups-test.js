// "Quick follow-ups in long chats" (src/toolbox.js quickFollowUpsOn, src/brain-words.js noteAfterAsk; off unless switched
// on). Real turns on a fake Bob folder in a temp dir with a scripted engine: what each request sends is turned into text in
// order (the tool list first, then each message, the way a chat template does), and the share of the last request that the
// next one starts with is how much of the chat the engine can keep. Never reads the real card, RAM or folders.
// Run: node test/run-quick-follow-ups-test.js
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Brain } from '../src/brain.js';
import { LlamaCpp } from '../src/llamacpp.js';
import { cleanHarness, harnessView, HARNESS_LABELS } from '../src/harness.js';
import { OPT_IN, safeStartPlan } from '../src/crash-catch.js';
import { quickFollowUpsOn, inGroupOrder } from '../src/toolbox.js';
import { noteAfterAsk, meanwhileNear } from '../src/brain-words.js';

let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra && !ok ? ' -> ' + extra : ''}`); };
const here = path.dirname(fileURLToPath(import.meta.url));
const read = (f) => fs.readFileSync(path.join(here, '..', f), 'utf8').replace(/\r\n/g, '\n');
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (f, ms = 8000) => { for (let i = 0; i < ms / 5; i++) { if (f()) return true; await wait(5); } return false; };
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bob-quick-'));
process.setMaxListeners(50);
const ENDED = ['done', 'failed', 'cancelled', 'interrupted'];

// ---------- the pieces ----------
check('off unless switched on', !quickFollowUpsOn({}) && !quickFollowUpsOn({ quickFollowUps: 'yes' }) && quickFollowUpsOn({ quickFollowUps: true }));
check('the harness cleans it as an off-by-default switch', cleanHarness('quickFollowUps', undefined) === false && cleanHarness('quickFollowUps', true) === true && harnessView({}).quickFollowUps === false);
check('it has a plain name, and safe start turns it off', Boolean(HARNESS_LABELS.quickFollowUps) && OPT_IN.includes('quickFollowUps') && safeStartPlan({ quickFollowUps: true }).patch.quickFollowUps === false);
check('groups come out in their fixed order, whatever order they came in', inGroupOrder({ a: 1, b: 1, c: 1 }, new Set(['c', 'a'])).join() === 'a,c');
const hist = [{ role: 'user', content: 'q1' }, { role: 'assistant', content: 'a1' }, { role: 'user', content: 'q2' }];
check('the note goes just after the latest message', noteAfterAsk(hist, 'N').map((m) => m.content).join() === 'q1,a1,q2,N');
check('the old way still puts it just before', meanwhileNear(hist, 'N').map((m) => m.content).join() === 'q1,a1,N,q2');
check('the note after a tool step stays right after the ask', noteAfterAsk([...hist, { role: 'assistant', content: '', tool_calls: [{}] }, { role: 'tool', content: 'r' }], 'N').map((m) => m.content).join() === 'q1,a1,q2,N,,r');
check('no note, nothing changes', noteAfterAsk(hist, '') === hist);
check('the switch shows in Settings, with Help, a glossary line and an FAQ', /sw\('quickFollowUps'/.test(read('public/harness.js')) && /id: 'quick-follow-ups'/.test(read('public/help-content.js')) && /<dt>Quick follow-ups<\/dt>/.test(read('public/help-content.js')) && /id: 'faq-slow-follow-up'/.test(read('public/help-content.js')));

// ---------- real turns ----------
let n = 0;
async function turns(extra, asks) {
  const agentDir = path.join(tmp, `Agent${++n}`), innDir = path.join(agentDir, 'inn'), dataDir = path.join(innDir, 'bob');
  fs.mkdirSync(dataDir, { recursive: true });
  const cfg = { agentDir, innDir, dataDir, logbook: path.join(innDir, 'logbook.md'), settingsFile: path.join(dataDir, 'settings.json'), readRoots: [innDir], readOnlyRoots: [], recycleBin: false, userName: 'Sam', timeZone: 'UTC', models: { bob: 'small:latest' }, engine: 'llamacpp', session: 'normal', autoSession: false, ...extra };
  const brain = new Brain(cfg, () => {});
  clearInterval(brain.reminderTimer);
  brain.ensureModel = async () => {}; brain.fitCtx = async () => 8192; brain.recall = async () => '';
  brain.engine.isLoaded = async () => true;
  brain.engine.unloadAll = async () => []; brain.engine.loaded = async () => []; brain.engine.unload = async () => [];
  const sent = [];
  brain.engine.chat = async (opts) => { sent.push(opts); return { role: 'assistant', content: `Reply ${sent.length}.` }; };
  for (const a of asks) { const { jobId } = brain.enqueue('main', a); const job = brain.queue.find((j) => j.id === jobId); await until(() => ENDED.includes(job.state) && !brain.turns.size); }
  const text = (s) => JSON.stringify(s.tools || []) + LlamaCpp.toOpenAI(s.messages).map((m) => `<${m.role}>${typeof m.content === 'string' ? m.content : JSON.stringify(m.content)}`).join('');
  const kept = [];
  for (let i = 1; i < sent.length; i++) { const a = text(sent[i - 1]), b = text(sent[i]); let k = 0; while (k < a.length && a[k] === b[k]) k++; kept.push(k / a.length); }
  return kept;
}
// The laptop's cache check (25 Nov): a 700-note file pasted in, then a one-line question about it.
const words = 'alpha bravo charlie delta echo foxtrot golf hotel india juliet kilo lima mike november oscar papa quebec romeo sierra tango uniform victor'.split(' ');
let paste = 'Here is a long notes file:\n\n';
for (let i = 1; i <= 700; i++) paste += `${i}. ${words.map((_, j) => words[(i * 7 + j * 3) % 22]).join(' ')}\n`;
paste += '\nWhich word appears in note 1, and how many notes are there? Answer in one line.';
const laptop = [paste, 'Name the last word of note 3. One word only.'];
const off = await turns({}, laptop), on = await turns({ quickFollowUps: true }, laptop);
check('off: the follow-up after the pasted file starts the same for under a tenth (as the laptop saw: read again)', off[0] < 0.1, off.join());
check('on: the follow-up starts the same for over 99% (only the last reply and the new question are new)', on[0] > 0.99, on.join());
// A group that comes and goes: "file" brings the document tools, the next messages don't ask for them.
const mixed = ['What is note 5?', 'Please write that to a file called notes.txt', 'What is note 9?', 'Thanks'];
const offM = await turns({}, mixed), onM = await turns({ quickFollowUps: true }, mixed);
check('off: a group leaving makes the next request start differently early on', offM[2] < 0.5, offM.join());
check('on: once a group came, later messages keep the start (over 95% each)', onM[2] > 0.95 && onM[3] > 0.95, onM.join());
check('on: a group new to the chat still changes the start once', onM[0] < 0.5, onM.join());

fs.rmSync(tmp, { recursive: true, force: true });
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

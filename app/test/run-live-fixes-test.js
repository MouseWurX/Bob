// 1.5.104: fixes from the live test on the replicant matrix. One request gets one Set it up card, a card is never a
// failure, a chat queued behind a picture gets the ⏳ line (and "ok" after it the plain answer), the start of a
// picture doesn't read "Painting 82/82", and brains and programs set by hand in config.json count as here.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Brain } from '../src/brain.js';
import { queuedLine, plainDoing, NOTHING_TO_OK_BUSY, NOTHING_TO_OK } from '../src/handoff.js';
import { configuredGguf } from '../src/models.js';
import { engineExe, ENGINES } from '../src/engines.js';
let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { if (ok) { pass++; console.log('PASS', name); } else { fail++; console.log('FAIL', name, extra); } };
const read = (f) => fs.readFileSync(new URL(`../${f}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n'); // CRLF checkouts (Windows CI)

// 1. One request, one card: the tool's offer, its retry and Bob's own offer_setup make one card between them.
{
  const events = [];
  const fake = { cfg: {}, log() {}, offers: null };
  const ctx = { emit: (ev) => events.push(ev), job: { id: 'j1' } };
  const first = await Brain.prototype.offerSetup.call(fake, 'web', ctx);
  const again = await Brain.prototype.offerSetup.call(fake, 'web', ctx);
  check('the first offer shows one card', events.filter((e) => e.type === 'offer-setup').length === 1 && /Switch it on/.test(first));
  check('a second offer for the same thing in the same turn shows no new card', events.filter((e) => e.type === 'offer-setup').length === 1 && /already under the chat/.test(again));
  check('both mark the tool as having offered a card', ctx.offeredNow === true);
  const ctx2 = { emit: (ev) => events.push(ev), job: { id: 'j2' } };
  await Brain.prototype.offerSetup.call(fake, 'web', ctx2);
  check('a new request gets its own card', events.filter((e) => e.type === 'offer-setup').length === 2);
}
const brainSrc = read('src/brain.js');
check('a tool that offered a card is not checked or tried again', /ctx\.offeredNow = false;\s*\n\s*try \{ text = String\(await tool\.run\(args, ctx\)\); \}/.test(brainSrc) && /let v = ctx\.offeredNow \? \{ ok: true \} : await this\.checkTool\(name, args, text, ctx\);/.test(brainSrc));

// 2. The ⏳ line for a chat queued behind a picture, clip, song or sound.
check('queued line says what Bob is on and that nothing is needed', queuedLine('Painting 12/30') === "⏳ I'm still on the last job (Painting 12/30). Nothing for you to do; I'll answer this as soon as it's done. If it can't wait, stop that job in Tasks.");
check('queued line without a detail', queuedLine('') === "⏳ I'm still on the last job. Nothing for you to do; I'll answer this as soon as it's done. If it can't wait, stop that job in Tasks.");
check('the job is said in plain words (1.5.105)', plainDoing('Painting 12/30') === 'making a picture, step 12 of 30' && plainDoing('Filming 3/20') === 'making a clip, step 3 of 20' && plainDoing('Painting') === 'making a picture' && plainDoing('Composing') === 'making a song' && plainDoing('Making a sound') === 'making a sound' && plainDoing('Composing 40%') === 'making a song, 40% done');
check('the busy line uses the plain words', /return queuedLine\(plainDoing\(this\.state\.detail\)\);/.test(brainSrc));
check('it goes out as a waiting-line (updated in place), not the old busy note', /type: 'waiting-line', sessionId, jobId: job\.id, id: `queued-\$\{job\.id\}`, text: busy/.test(brainSrc) && !/I'll answer this as soon as it's done\. If this can't wait, stop it in Tasks\./.test(brainSrc));
{
  const sent = [];
  const fake = { lastActivity: 0, approvals: new Map(), gate: { waitingNow: 0 }, state: { state: 'painting' }, queue: [{ id: 'q', state: 'waiting', sessionId: 's1', queuedLine: true }], broadcast: (e) => sent.push(e) };
  const r = Brain.prototype.enqueue.call(fake, 's1', 'ok');
  await new Promise((res) => setTimeout(res, 5));
  check('"ok" while a chat waits behind a picture gets the plain answer, not a job', r.jobId === null && r.answered === NOTHING_TO_OK_BUSY && sent.some((e) => e.text === NOTHING_TO_OK_BUSY));
  check('the plain answer while painting', NOTHING_TO_OK_BUSY === "There's nothing to OK right now. I'm still on the last job, and I'll answer you as soon as it's done." && NOTHING_TO_OK !== NOTHING_TO_OK_BUSY);
}
check('Telegram says each ⏳ line once', /case 'waiting-line': if \(!\(this\.waitSaid \|\|= new Set\(\)\)\.has\(ev\.id\)\)/.test(read('src/telegram.js')));

// 3. "Painting 82/82" at the start: a full bar before the first real step is ignored.
check('the engine\'s own counters are ignored: only lines counting to this job\'s steps move the bar (1.5.109)', /if \(Number\(total\) !== want \|\| !\(n >= 1\)\) return;/.test(brainSrc) && /const want = stepsFor\(this\.cfg\.painter\?\.sdcpp\?\.\[kind\], kind\);/.test(brainSrc));
{
  // The PC's live log: load counters, then 20 real steps, then the decode.
  const states = [];
  const fake = { cfg: { painter: { sdcpp: { image: { steps: 20 } } } }, setState: (st, d) => states.push(d) };
  const want = (await import('../src/painter.js')).stepsFor(fake.cfg.painter.sdcpp.image, 'image');
  const onProgress = (n, total) => { if (Number(total) !== want || !(n >= 1)) return; fake.setState('painting', `Painting ${Math.min(n, total)}/${total}`); };
  for (const [n, t] of [[3, 82], [82, 82], [1, 49], [119, 519], [32, 338], [1, 1], [56, 1927], [1, 20], [12, 20], [20, 20], [104, 104], [1, 49]]) onProgress(n, t);
  check('with the live log, the bar shows only the 20 real steps', states.join(',') === 'Painting 1/20,Painting 12/20,Painting 20/20', states.join(','));
  check('a job\'s steps default to 8 for a picture and 10 for a clip', want === 20 && (await import('../src/painter.js')).stepsFor({}, 'image') === 8 && (await import('../src/painter.js')).stepsFor(undefined, 'video') === 10);
  check('until the first step the ⏳ line says it\'s loading', plainDoing('Loading the picture engine') === 'loading the picture engine' && /this\.setState\('painting', 'Loading the picture engine', null\);/.test(brainSrc));
}

// 4. Set by hand in config.json counts as here.
{
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bob-live-'));
  const gguf = path.join(dir, 'my-brain.gguf'); fs.writeFileSync(gguf, 'x');
  const exe = path.join(dir, process.platform === 'win32' ? 'llama-server.exe' : 'llama-server'); fs.writeFileSync(exe, 'x');
  check('a brain given its .gguf in llamacpp.models', configuredGguf({ llamacpp: { models: { 'qwen3-4b': gguf } } }, { id: 'qwen3-4b' }) === gguf);
  check('also by its Ollama name, and as { gguf }', configuredGguf({ llamacpp: { models: { 'qwen3:4b': { gguf } } } }, { id: 'x', ollama: 'qwen3:4b' }) === gguf);
  check('a path that isn\'t there doesn\'t count', configuredGguf({ llamacpp: { models: { a: path.join(dir, 'nope.gguf') } } }, { id: 'a' }) === null);
  const lc = ENGINES.find((e) => e.id === 'llamacpp');
  check('llama-server set in llamacpp.exe counts as here', engineExe({ agentDir: path.join(dir, 'agent'), llamacpp: { exe } }, lc) === exe);
  check('a configured exe that isn\'t there doesn\'t count', engineExe({ agentDir: path.join(dir, 'agent'), llamacpp: { exe: path.join(dir, 'gone') } }, lc) === null);
  fs.rmSync(dir, { recursive: true, force: true });
}
check('the models list says where a hand-set brain is', /where = pulled \? \['Ollama'\] : byHand \? \['config\.json'\]/.test(read('src/models.js')));

{
  // 1.5.110: the ⏳ line follows the job, once per change.
  const sent = [];
  const fake = { state: { state: 'painting' }, cfg: { chatWhileBusy: false }, busyLine: (j) => (j.id === 'late' ? 'busy' : null), broadcast: (e) => sent.push(e), pump() {}, queue: [{ id: 'w', state: 'waiting', sessionId: 's', queuedLine: true, queuedText: queuedLine(plainDoing('Loading the picture engine')) }, { id: 'x', state: 'waiting', sessionId: 's' }] };
  for (const d of ['Loading the picture engine', 'Painting 1/20', 'Painting 1/20', 'Painting 2/20']) Brain.prototype.setState.call(fake, 'painting', d);
  const lines = sent.filter((e) => e.type === 'waiting-line' && e.id === 'queued-w');
  check('the waiting ⏳ line moves on from loading to the steps, once per change, in place', lines.length === 2 && lines.every((e) => e.id === 'queued-w') && /making a picture, step 1 of 20/.test(lines[0].text) && /step 2 of 20/.test(lines[1].text), JSON.stringify(lines));
}
{
  // 1.5.111: once the waiting job starts (or is stopped), its ⏳ line leaves the chat.
  const sent = [];
  const j = { id: 'w', sessionId: 's', queuedLine: true };
  const fake = { broadcast: (e) => sent.push(e) };
  Brain.prototype.waitOver.call(fake, j); Brain.prototype.waitOver.call(fake, j); Brain.prototype.waitOver.call(fake, { id: 'n' });
  check('the ⏳ line is taken away once, and only for a job that had one', sent.length === 1 && sent[0].type === 'waiting-line-done' && sent[0].id === 'queued-w');
  check('it happens when the job starts and when it is stopped', /job\.state = 'working'; job\.startedAt = Date\.now\(\); job\.steps = \[\]; this\.waitOver\(job\);/.test(brainSrc) && /j\.state = 'cancelled';\n    this\.waitOver\(j\);/.test(brainSrc));
  check('the chat removes the line', /case 'waiting-line-done': \{[^}]*waitLines\.get\(ev\.id\)\?\.remove\(\);/.test(read('public/app.js')));
}
{
  // 1.5.112: a chat queued just before the painter took over (busyLine said no then) gets its ⏳ line when painting starts.
  const sent = [];
  const late = { id: 'late', state: 'waiting', sessionId: 's' }, other = { id: 'pic2', state: 'waiting', sessionId: 's' };
  const fake = { state: { state: 'idle' }, cfg: { chatWhileBusy: false }, busyLine: (j) => (j.id === 'late' ? 'busy' : null), broadcast: (e) => sent.push(e), pump() {}, queue: [late, other] };
  Brain.prototype.setState.call(fake, 'painting', 'Loading the picture engine');
  Brain.prototype.setState.call(fake, 'painting', 'Painting 1/20');
  const lines = sent.filter((e) => e.type === 'waiting-line');
  check('a chat queued a moment before painting started still gets its ⏳ line, then it follows the steps', lines.length === 2 && lines.every((e) => e.id === 'queued-late') && /loading the picture engine/.test(lines[0].text) && /step 1 of 20/.test(lines[1].text) && late.queuedLine === true, JSON.stringify(lines));
  check('a job that would not wait behind it (busyLine says no) gets none', !other.queuedLine);
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exitCode = fail ? 1 : 0;

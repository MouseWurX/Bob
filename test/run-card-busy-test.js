// 1.5.113: another program holding the graphics card. One plain line, no retry, and waiting jobs told at once.
import fs from 'node:fs';
import { readCardUse, parseWinGpuMem, busyByOther, cardBusyLine, isLoadTimeout, NEED_MB, RECHECK_MS, CARD_STILL_BUSY } from '../src/card-busy.js';
import { Gate } from '../src/handoff.js';
import { Brain } from '../src/brain.js';
import { withRetry } from '../src/handoff.js';
let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { if (ok) { pass++; console.log('PASS', name); } else { fail++; console.log('FAIL', name, extra); } };
const read = (f) => fs.readFileSync(new URL(`../${f}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n');

// Reading the card (a fake nvidia-smi: tests never run the real one).
const smi = (free, apps) => async (args) => (args[0].includes('memory.free') ? free : apps);
const none = async () => null;
const card = await readCardUse(smi('412\n', '1234, C:\\AI\\tools\\llama-imatrix.exe, 9300\n2222, C:\\Bob\\engines\\llama-server.exe, 1200\n3333, C:\\Games\\game.exe, 300\n'), none);
check('reads free memory and the other programs, leaving out Bob\'s own engines', card.freeMB === 412 && card.others.map((a) => a.name).join(',') === 'llama-imatrix,game' && card.others[0].mb === 9300 && card.others[1].mb === 300, JSON.stringify(card));
check('no NVIDIA card or no nvidia-smi: unknown, never "busy"', (await readCardUse(async () => null, none)) === null && busyByOther(null) === false);

// Windows (WDDM): nvidia-smi says [N/A] for every program, and lists the shell, overlays and browsers too (live test).
const wddm = '1,C:\\Windows\\System32\\ShellHost.exe,[N/A]\n2,C:\\Windows\\CrossDeviceResume.exe,[N/A]\n3,C:\\Windows\\explorer.exe,[N/A]\n4,C:\\Parsec\\parsecd.exe,[N/A]\n5,C:\\Edge\\msedge.exe,[N/A]\n6,C:\\NVIDIA\\NVIDIA Overlay.exe,[N/A]\n7,C:\\AI\\tools\\llama-imatrix.exe,[N/A]\n8,C:\\Claude\\claude.exe,[N/A]\n';
const noFig = await readCardUse(smi('1798\n', wddm), none);
check('no figures: Windows\' own programs, overlays and browsers are left out, so the real one is named', noFig.others.map((a) => a.name).join(',') === 'llama-imatrix' && /\(llama-imatrix\)/.test(cardBusyLine(noFig)), JSON.stringify(noFig.others));
const win = parseWinGpuMem('7,llama-imatrix,9900\r\n7,llama-imatrix,30\r\n3,explorer,40\r\n9,somegame,700\r\njunk\r\n');
check('Windows\' GPU memory counter is read per program (its parts added up)', win.length === 3 && win.find((w) => w.pid === 7).mb === 9930 && win.find((w) => w.pid === 9).name === 'somegame');
const withWin = await readCardUse(smi('1798, 16303\n', wddm), async () => win);
check('with Windows\' figures (when they add up), the program is named with its size; programs nvidia-smi doesn\'t list never are', withWin.others.map((a) => `${a.name}:${a.mb}`).join(',') === 'llama-imatrix:9930' && /\(llama-imatrix, 9\.7 GB\)/.test(cardBusyLine(withWin)), JSON.stringify(withWin.others));
// The live test: the counter gave several programs about the whole card (one 18 TB), and a protected program
// nvidia-smi doesn't list. The line must say just "(llama-imatrix)".
const liveWin = [{ pid: 6, name: 'NVIDIA Overlay', mb: 18932046 }, { pid: 30, name: 'dwm', mb: 13433 }, { pid: 22972, name: 'QuantumEngine', mb: 15050 }, { pid: 7, name: 'llama-imatrix', mb: 14305 }];
const live = await readCardUse(smi('1798, 16303\n', wddm), async () => liveWin);
check('figures that can\'t be true give no sizes, and only listed programs are named', live.others.map((a) => `${a.name}:${a.mb}`).join(',') === 'llama-imatrix:0' && cardBusyLine(live).includes('busy with another program (llama-imatrix), so'), cardBusyLine(live));
const tooBig = await readCardUse(smi('300, 8192\n', '5,C:\\x\\a.exe,9000\n6,C:\\x\\b.exe,400\n'), none);
check('nvidia-smi figures bigger than the card are dropped too', tooBig.others.map((a) => `${a.name}:${a.mb}`).join(',') === 'a:0,b:0');
check('the counter read never runs in tests either', /function winGpuMem\(\) \{\n  if \(IN_TEST\) return Promise\.resolve\(null\);/.test(read('src/card-busy.js')));
check('busy only when less than 2 GB is free', NEED_MB === 2048 && busyByOther({ freeMB: 412, others: [] }) && !busyByOther({ freeMB: 6000, others: [{ name: 'x', mb: 9000 }] }));
check('the line names the biggest programs, in plain words', cardBusyLine(card) === "⚠ The graphics card is busy with another program (llama-imatrix, 9.1 GB; game, 0.3 GB), so I can't load a brain or make pictures on it right now. Close that program, or send it again once it's done. I'll look again before the next job.", cardBusyLine(card));
check('…and still reads well without names', /busy with another program, so I can't/.test(cardBusyLine({ freeMB: 100, others: [] })));
check('load timeouts are spotted (brains, pictures, engines), other errors aren\'t', isLoadTimeout(new Error('qwen3.6:35b took too long to load.')) && isLoadTimeout(Object.assign(new Error('x'), { code: 'painter_timeout' })) && isLoadTimeout(new Error('The picture took too long.')) && !isLoadTimeout(new Error('Out of memory')));
check('in tests the real nvidia-smi is never run', /if \(IN_TEST\) return Promise\.resolve\(null\);/.test(read('src/card-busy.js')));

// The brain side.
const full = { freeMB: 300, others: [{ name: 'llama-imatrix', mb: 9300 }] };
{
  const said = [], logs = [];
  const fake = { cfg: { session: 'normal' }, readCardUse: async () => full, log: (k, t) => logs.push(t), cardLineFor: Brain.prototype.cardLineFor };
  const t1 = await Brain.prototype.cardTaken.call(fake, new Error('x took too long to load.'), (e) => said.push(e), 's1');
  const t2 = await Brain.prototype.cardTaken.call(fake, new Error('x took too long to load.'), (e) => said.push(e), 's1');
  check('a timeout with the card full: taken, said once in that chat', t1 && t2 && said.length === 1 && said[0].type === 'announce' && /llama-imatrix/.test(said[0].text));
  check('…and logged', logs.some((l) => /taken by another program \(300 MB free: llama-imatrix\)/.test(l)));
  check('after that, the same chat gets a short pointer; another chat gets the full line once', fake.cardLineFor('s1') === CARD_STILL_BUSY && fake.cardLineFor('s2') === fake.cardHeld.line && fake.cardLineFor('s2') === CARD_STILL_BUSY);
  check('the short pointer', CARD_STILL_BUSY === 'Not done: the graphics card is still busy with that other program (see the ⚠ line above).');
  const other = await Brain.prototype.cardTaken.call(fake, new Error('Out of memory'), null);
  check('other errors don\'t look at the card', other === false);
  fake.readCardUse = async () => ({ freeMB: 9000, others: [] });
  check('a timeout with the card free is an ordinary failure, and clears the flag', (await Brain.prototype.cardTaken.call(fake, new Error('x took too long to load.'), null)) === false && fake.cardHeld === null);
}
{
  let reads = 0;
  const fake = { cfg: { session: 'normal' }, readCardUse: async () => { reads++; return full; }, log() {}, cardHeld: { at: Date.now(), line: 'L', said: new Set() } };
  check('a waiting job right after: told at once, without reading the card again', (await Brain.prototype.cardStillTaken.call(fake, { kind: 'chat' })) === true && reads === 0);
  fake.cardHeld.at = Date.now() - RECHECK_MS - 1; fake.cardHeld.said.add('s1');
  check('later: the card is read again, still taken, and who was told is kept', (await Brain.prototype.cardStillTaken.call(fake, { kind: 'chat' })) === true && reads === 1 && fake.cardHeld.said.has('s1'));
  fake.cardHeld.at = Date.now() - RECHECK_MS - 1; fake.readCardUse = async () => ({ freeMB: 12000, others: [] });
  check('once it\'s free, jobs run as normal', (await Brain.prototype.cardStillTaken.call(fake, { kind: 'chat' })) === false && fake.cardHeld === null);
  check('nothing known to be busy: no reading at all', (await Brain.prototype.cardStillTaken.call({ ...fake, cardHeld: null, readCardUse: () => { throw new Error('read'); } }, {})) === false);
  const gaming = { cfg: { session: 'light' }, log() {}, cardHeld: { at: Date.now(), line: 'L', said: new Set() } };
  check('in Gaming, chats on the processor keep going; pictures still get the line', (await Brain.prototype.cardStillTaken.call(gaming, { kind: 'chat' })) === false && (await Brain.prototype.cardStillTaken.call(gaming, { kind: 'picture' })) === true);
}
{
  // Brain loads (live test: three five-minute tries before the line). One timeout with the card taken = no more tries.
  let loads = 0, fallback = 0;
  const brain = { cardHeld: null, async cardTaken(e) { if (!/took too long/.test(e.message)) return false; this.cardHeld = { at: Date.now(), line: 'LINE', said: new Set() }; return true; }, async cardStillTaken() { return Boolean(this.cardHeld); }, log() {}, fallbackBrain() { fallback++; return { model: 'other' }; } };
  const engine = { async isLoaded() { return false; }, async preload() { loads++; throw new Error('big:26b took too long to load.'); }, async unload() {} };
  brain.engine = engine;
  const gate = new Gate(brain, { delays: [1, 1] });
  const e = await gate.needBrain({ model: 'big:26b', opts: {} }, {}).catch((x) => x);
  check('a brain load that times out with the card taken is tried once, with no other brain', loads === 1 && fallback === 0 && e.code === 'card_held' && e.message === 'LINE', `${loads} ${fallback} ${e?.code} ${e?.message}`);
  const e2 = await gate.needBrain({ model: 'big:26b', opts: {} }, {}).catch((x) => x);
  check('the next load doesn\'t start at all while it\'s taken', loads === 1 && e2.code === 'card_held');
  loads = 0; brain.cardHeld = null;
  await gate.needBrain({ model: 'small:4b', opts: { cpu: true } }, {}).catch(() => {});
  check('a brain on the processor is never held back', loads >= 1 && brain.cardHeld === null);
}
{
  // The picture: one try, not two, when the card is taken.
  let tries = 0;
  const e = await withRetry(async () => { tries++; throw Object.assign(new Error('The picture took too long.'), { code: 'painter_timeout' }); }, { wait: 1, retryable: async () => false }).catch((x) => x);
  check('withRetry takes an async "retry?" answer, and stops on no', tries === 1 && /took too long/.test(e.message));
  let t2 = 0;
  await withRetry(async () => { t2++; if (t2 === 1) throw new Error('blip'); return 1; }, { wait: 1, retryable: async () => true });
  check('…and retries on yes', t2 === 2);
}
const brainSrc = read('src/brain.js');
check('the painter asks before retrying, says it once in this chat, and the error becomes the plain line', /retryable: async \(e\) => \{ if \(!\(await this\.cardTaken\(e, ctx\.emit, ctx\.sessionId\)\)\) return true; e\.message = this\.cardHeld\.line; e\.code = 'card_held'; return false; \}/.test(brainSrc));
check('a job checks the card before it starts; a held-card failure ends with the line once per chat', /if \(await this\.cardStillTaken\(job\)\) throw Object\.assign\(new Error\(this\.cardLineFor\(sessionId\)\), \{ code: 'card_busy' \}\);/.test(brainSrc) && /e\?\.code === 'card_held' \|\| await this\.cardTaken\(e, null\)\.catch\(\(\) => false\)\) && this\.cardHeld\) e = Object\.assign\(new Error\(this\.cardLineFor\(sessionId\)\), \{ code: 'card_busy' \}\);/.test(brainSrc));
check('no "Waking up…" load while another program holds the card', /if \(!cpu && await this\.cardStillTaken\(\{ kind: 'chat' \}\)\) return false;[^\n]*\n      this\.setState\('waking'/.test(brainSrc));
const help = read('public/help-content.js');
check('Help explains it in Bob\'s voice, with a FAQ and the glossary', /id: 'faq-card-busy'/.test(help) && /I take one quick look at the graphics card/.test(help) && /If another program has filled it, I tell you which one/.test(help));

console.log(`\n${pass} passed, ${fail} failed`);
process.exitCode = fail ? 1 : 0;

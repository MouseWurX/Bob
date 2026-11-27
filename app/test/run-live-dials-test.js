// Live dials (src/live-dials.js; Engine tuning, both off unless ticked): the picture reader on demand and layers
// moved onto the card with the brain loaded (Lamplight 0151). The pure picks, the settings, and real switches against
// a fake engine that records what Bob asks it. Nothing here reads the real computer: the engine is a small local fake.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { fileURLToPath } from 'node:url';
import { LlamaCpp } from '../src/llamacpp.js';
import { readerOnDemandOn, liveLayersOn, liveDialsFit, LIVE_DIALS_FROM_BE, wantsPictures, readerChange, pickCardLayers, liveDialsBody, cardLayersFrom, LAYER_KEEP_MIB } from '../src/live-dials.js';
import { cleanTuning, mergeTuning } from '../src/engine-tuning.js';
import { HELP } from '../public/help-content.js';

let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra && !ok ? ' -> ' + extra : ''}`); };
const here = path.dirname(fileURLToPath(import.meta.url));
const read = (f) => fs.readFileSync(path.join(here, '..', f), 'utf8').replace(/\r\n/g, '\n');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bob-live-dials-'));

// ---------- Off by default ----------
check('both off in a fresh Bob', !readerOnDemandOn({}) && !liveLayersOn({}) && !readerOnDemandOn({ engineTuning: { mode: 'conductor' } }));
check('on only when ticked', readerOnDemandOn({ engineTuning: { readerOnDemand: true } }) && liveLayersOn({ engineTuning: { liveLayers: true } }));
check('needs Lamplight 47', LIVE_DIALS_FROM_BE === 47 && liveDialsFit(47) && !liveDialsFit(46) && !liveDialsFit(0));
{ const t = mergeTuning({ mode: 'conductor' }, { readerOnDemand: true, liveLayers: true });
  check('the settings keep both switches', t.readerOnDemand === true && t.liveLayers === true && cleanTuning(t).readerOnDemand === true && cleanTuning(t).liveLayers === true);
  const off = mergeTuning(t, { readerOnDemand: false, liveLayers: false });
  check('and drop them when unticked', !('readerOnDemand' in off) && !('liveLayers' in off) && !('readerOnDemand' in cleanTuning(off)));
  check('a stray value is not taken', !('liveLayers' in cleanTuning({ liveLayers: 'yes' }))); }

// ---------- The picks ----------
check('pictures in Bob\'s own messages and in image parts', wantsPictures([{ role: 'user', images: ['iVBOR'] }]) && wantsPictures([{ role: 'user', content: [{ type: 'image_url' }] }]) && !wantsPictures([{ role: 'user', content: 'hi' }]) && !wantsPictures(null));
check('reader: out with no pictures, in for a picture, nothing for a brain without one',
  readerChange({ loadedWith: true, readerIn: true, pictures: false })?.picture_reader === false &&
  readerChange({ loadedWith: true, readerIn: false, pictures: true })?.picture_reader === true &&
  readerChange({ loadedWith: true, readerIn: true, pictures: true }) === null &&
  readerChange({ loadedWith: false, readerIn: true, pictures: false }) === null);
{ const inRam = [{ layer: 0, mib: 400 }, { layer: 1, mib: 400 }, { layer: 2, mib: 400 }, { layer: 3, mib: 400 }];
  const p = pickCardLayers({ inRam, onCard: [], freeMiB: LAYER_KEEP_MIB + 900 });
  check('layers go up from the top down while they fit, the keep left free', JSON.stringify(p?.layers) === '[2,3]' && p.mib === 800, JSON.stringify(p));
  check('layers already up stay in the list', JSON.stringify(pickCardLayers({ inRam: inRam.slice(0, 2), onCard: [{ layer: 3 }, { layer: 2 }], freeMiB: LAYER_KEEP_MIB + 500 })?.layers) === '[1,2,3]');
  check('no move when the room is unknown, too small, or under 256 MiB', pickCardLayers({ inRam, freeMiB: null }) === null && pickCardLayers({ inRam, freeMiB: LAYER_KEEP_MIB + 100 }) === null && pickCardLayers({ inRam: [{ layer: 0, mib: 100 }], freeMiB: 99999 }) === null);
  check('no gap: a big layer stops the climb (layer 0 fits but stays below it)', JSON.stringify(pickCardLayers({ inRam: [{ layer: 0, mib: 300 }, { layer: 1, mib: 5000 }, { layer: 2, mib: 300 }], freeMiB: LAYER_KEEP_MIB + 900 })?.layers) === '[2]'); }
check('bodies: each dial by its engine name', JSON.stringify(liveDialsBody({ flashAttn: 'on', kvOnCard: false, reader: true, guesser: false, cardLayers: [3, 3, 4], device: 'Vulkan0' })) === JSON.stringify({ flash_attn: 'on', kv_on_card: false, picture_reader: true, guesser: false, card_layers: { layers: [3, 4], device: 'Vulkan0' } }));
check('bad values are refused before they reach the engine', (() => { try { liveDialsBody({ flashAttn: 'maybe' }); return false; } catch { try { liveDialsBody({ cardLayers: [-1] }); return false; } catch { return true; } } })());
check('the layers on the card from an answer', JSON.stringify(cardLayersFrom({ card_layers: [{ layer: 5, device: 'CUDA0' }, { layer: 6 }] })) === '[5,6]' && cardLayersFrom({}).length === 0);

// ---------- Against a fake engine ----------
const calls = [];
let refuse = false, ram = [{ layer: 0, mib: 600 }, { layer: 1, mib: 600 }], onCard = [], free = 4000;
const srv = http.createServer((req, res) => {
  let body = '';
  req.on('data', (c) => (body += c));
  req.on('end', () => {
    calls.push(`${req.method} ${req.url}${req.url === '/context' ? ' ' + body : ''}`);
    if (req.url === '/context' && refuse) { res.writeHead(400); return res.end('no'); }
    res.writeHead(200, { 'content-type': 'application/json' });
    if (req.url !== '/context') return res.end('{}');
    const b = JSON.parse(body);
    if (b.card_layers) { const want = b.card_layers.layers; onCard = want; free = 4000 - want.length * 600; }
    res.end(JSON.stringify({ brain_kept: true, picture_reader: b.picture_reader ?? true, devices: [{ name: 'CUDA0', free_mib: free, total_mib: 16303 }], card_layers: onCard.map((layer) => ({ layer, device: 'CUDA0' })), layers_in_ram: ram.filter((r) => !onCard.includes(r.layer)), card_layers_change: b.card_layers ? { seconds: 0.1 } : {} }));
  });
});
await new Promise((r) => srv.listen(0, '127.0.0.1', r));
const port = srv.address().port;
const big = path.join(tmp, 'big.gguf');
fs.writeFileSync(big, 'x');
const engine = (tuning = {}, be = 47, args = ['--mmproj', 'reader.gguf']) => {
  const e = new LlamaCpp({ agentDir: tmp, dataDir: tmp, engineTuning: { mode: 'conductor', ...tuning }, llamacpp: { models: { big } } });
  clearInterval(e.idleTimer);
  Object.assign(e, { url: `http://127.0.0.1:${port}`, current: 'big', child: { exitCode: null }, loadedOk: true, slotDir: tmp, active: 1, lastArgs: args, liveReaderIn: true, liveCard: [], liveStopped: '', liveInRam: null, liveAsked: false });
  e.beNo = () => be;
  e.logs = []; e.log = (_k, m) => e.logs.push(m);
  return e;
};
const text = [{ role: 'user', content: 'hi' }], pic = [{ role: 'user', content: 'look', images: ['iVBOR'] }];
{ calls.length = 0; const e = engine();
  await e.liveDials({ model: 'big', messages: text });
  check('both off: Bob asks the engine nothing', calls.length === 0); }
{ calls.length = 0; const e = engine({ readerOnDemand: true }, 46);
  await e.liveDials({ model: 'big', messages: text });
  check('an older engine: nothing asked, off for the run, said in the logbook', calls.length === 0 && /Lamplight 47/.test(e.liveStopped) && e.logs.some((l) => /live dials off/.test(l))); }
{ calls.length = 0; const e = engine({ readerOnDemand: true });
  await e.liveDials({ model: 'big', messages: text });
  check('no pictures: the reader goes out, with the reading saved and put back', JSON.stringify(calls) === JSON.stringify(['POST /slots/0?action=save', 'POST /context {"picture_reader":false}', 'POST /slots/0?action=restore']) && e.liveReaderIn === false, JSON.stringify(calls));
  calls.length = 0; await e.liveDials({ model: 'big', messages: text });
  check('a second text reply asks nothing', calls.length === 0);
  calls.length = 0; await e.liveDials({ model: 'big', messages: pic });
  check('a picture brings it back before the reply', calls.some((c) => c === 'POST /context {"picture_reader":true}') && e.liveReaderIn === true, JSON.stringify(calls)); }
{ calls.length = 0; const e = engine({ readerOnDemand: true }, 47, []);
  await e.liveDials({ model: 'big', messages: text });
  check('a brain loaded without a reader: nothing asked', calls.length === 0); }
{ calls.length = 0; onCard = []; free = 4000; const e = engine({ liveLayers: true }, 47, []);
  await e.liveDials({ model: 'big', messages: text });
  const ctx = calls.filter((c) => c.startsWith('POST /context')).map((c) => JSON.parse(c.slice(14)));
  check('layers: asks once which sit in RAM, then moves what fits (4000 free, 1536 kept: both 600 MiB layers)', ctx.length === 2 && JSON.stringify(ctx[1]) === '{"card_layers":{"layers":[0,1]}}' && JSON.stringify(e.liveCard) === '[0,1]', JSON.stringify(calls));
  calls.length = 0; await e.liveDials({ model: 'big', messages: text });
  check('nothing left in RAM: no more asks', calls.filter((c) => c.startsWith('POST /context')).length === 0, JSON.stringify(calls));
  // a bigger reading step goes through condSwitch: the moved layers go home in the same switch
  e.condStep = 2048; e.condChat = 2048; e.condState = {};
  calls.length = 0; await e.condSwitch('big', 4096, 0);
  const sw = calls.filter((c) => c.startsWith('POST /context')).map((c) => JSON.parse(c.slice(14)));
  check('a step up sends the layers home in the same switch', sw.length === 1 && JSON.stringify(sw[0].card_layers) === '{"layers":[]}' && e.liveCard.length === 0, JSON.stringify(calls));
  calls.length = 0; await e.liveDials({ model: 'big', messages: text });
  check('at a reading step, no layers go up', calls.length === 0, JSON.stringify(calls)); }
{ calls.length = 0; onCard = []; const e = engine({ liveLayers: true, readerOnDemand: true });
  await e.liveDials({ model: 'big', messages: pic });
  check('a chat with pictures keeps the reader in and moves no layers', calls.filter((c) => c.startsWith('POST /context')).length === 0, JSON.stringify(calls)); }
{ calls.length = 0; refuse = true; const e = engine({ readerOnDemand: true });
  await e.liveDials({ model: 'big', messages: text }).catch((x) => e.liveStop('big', x.message));
  check('an engine that refuses turns it off for the run, and the reply goes ahead', Boolean(e.liveStopped) && e.logs.some((l) => /live dials off for this engine run/.test(l)));
  calls.length = 0; await e.liveDials({ model: 'big', messages: text });
  check('once off it asks nothing more', calls.length === 0); refuse = false; }
srv.close();

// ---------- Help, FAQ, glossary, settings ----------
check('Settings shows both switches, off unless ticked', /data-tunelive="readerOnDemand"/.test(read('public/cellar-engines.js')) && /data-tunelive="liveLayers"/.test(read('public/cellar-engines.js')) && /tunelive/.test(read('public/cellar.js')));
check('Help, the FAQ and the glossary explain the live dials', /Picture reader only when a chat has pictures/.test(HELP.find((h) => h.id === 'settings-speed')?.html || '') && /unproven in our lab/.test(HELP.find((h) => h.id === 'faq-live-dials')?.html || '') && /<dt>Live dials<\/dt>/.test(HELP.find((h) => h.id === 'glossary')?.html || ''));
check('the engine patch and its test are in the tree', fs.existsSync(path.join(here, '..', 'engine', 'patches', '0151-context-change-live-dials.patch')) && fs.existsSync(path.join(here, '..', 'engine', 'tests', 'live-dials.py')));

try { fs.rmSync(tmp, { recursive: true, force: true }); } catch {}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

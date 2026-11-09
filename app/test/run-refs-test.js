// Tests the reference shelf, painting from references, and the live download ticker.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { RefShelf } from '../src/refs.js';
import { paint } from '../src/painter.js';
import { capabilities } from '../src/capabilities.js';
import { ticker } from '../src/models.js';
import { LlamaCpp } from '../src/llamacpp.js';

let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra ? ' ' + extra : ''}`); };
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bob-refs-'));
const PNG = Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex');
const JPG = Buffer.from('ffd8ffe000104a464946', 'hex');

const shelf = new RefShelf({ innDir: dir });
const mira = shelf.add(PNG, { name: 'Captain Mira', kind: 'character', notes: 'red scarf' });
check('adds a picture with a name and kind', mira.kind === 'character' && fs.existsSync(shelf.pathOf(mira)) && mira.file.endsWith('.png'));
const harbour = shelf.add(JPG, { name: 'Harbour', kind: 'scene' });
check('sniffs JPEG', harbour.file.endsWith('.jpg'));
const dup = shelf.add(PNG, { name: 'captain mira', kind: 'character' });
check('never reuses a name', dup.name !== 'captain mira' && dup.name.startsWith('captain mira ('), dup.name);
try { shelf.add(Buffer.from('<svg></svg>'), { name: 'x' }); check('refuses non-pictures', false); } catch (e) { check('refuses non-pictures', /PNG, JPEG or WebP/.test(e.message)); }
try { shelf.add(Buffer.alloc(16e6, 0x89), { name: 'big' }); check('refuses huge files', false); } catch (e) { check('refuses huge files', /too big/.test(e.message)); }
const chat = shelf.add(PNG, {});
check('chat pictures get a dated name and stay off the prompt list', chat.kind === 'chat' && /^Chat picture/.test(chat.name) && !shelf.describe().includes(chat.name));
check('finds by name, any case, or part of it', shelf.find('CAPTAIN MIRA')?.id === mira.id && shelf.find('harb')?.id === harbour.id && shelf.find(mira.id)?.id === mira.id);
shelf.update(chat.id, { name: 'Old ship', kind: 'object' });
check('a chat picture can be kept on the shelf', shelf.find('Old ship')?.kind === 'object');
try { shelf.update(chat.id, { name: 'Harbour' }); check('rename refuses a taken name', false); } catch (e) { check('rename refuses a taken name', /already/.test(e.message)); }
shelf.setSeen(mira.id, 'A tall woman with a red scarf and a scar.');
check('the shelf list for Bob includes notes and what he saw', /Captain Mira \(character\): red scarf \[looks like: A tall woman/.test(shelf.describe()), shelf.describe());
check('removes a picture and its file', shelf.remove(dup.id) && !fs.existsSync(path.join(shelf.dir, dup.file)) && !shelf.find(dup.id));

// Painting from references
const models = path.join(dir, 'models');
fs.mkdirSync(models);
for (const f of ['z.gguf', 'ae.sft', 'qwen.gguf', 'edit.gguf', 'qvae.st', 'vl.gguf', 'mmproj.gguf', 'wan.gguf', 'wanvae.st', 'umt5.gguf']) fs.writeFileSync(path.join(models, f), 'x');
const argsFile = path.join(dir, 'args.json');
process.env.MOCK_SD_ARGS = argsFile;
const m = (f) => path.join(models, f);
const cfg = {
  agentDir: dir, painterDir: path.join(dir, 'painter'), stt: { provider: 'http' },
  painter: { engine: 'sdcpp', sdcpp: {
    exe: process.execPath, preArgs: [path.resolve('test/mock-sd-cli.js')],
    image: { diffusionModel: m('z.gguf'), vae: m('ae.sft'), llm: m('qwen.gguf') },
    edit: { diffusionModel: m('edit.gguf'), vae: m('qvae.st'), llm: m('vl.gguf'), llmVision: m('mmproj.gguf'), steps: 20, cfg: 2.5, flowShift: 3, sampler: 'euler' },
    video: { diffusionModel: m('wan.gguf'), vae: m('wanvae.st'), t5xxl: m('umt5.gguf') }
  } }
};
fs.mkdirSync(cfg.painterDir);
const args = () => JSON.parse(fs.readFileSync(argsFile, 'utf8'));
await paint(cfg, 'edit', { prompt: 'Mira at the helm', refs: [shelf.pathOf(mira), shelf.pathOf(harbour)] }, {});
let a = args();
check('edit model gets each reference with -r, plus its vision file', a.filter((x) => x === '-r').length === 2 && a.includes('--llm_vision') && a[a.indexOf('--flow-shift') + 1] === '3' && a[a.indexOf('--sampling-method') + 1] === 'euler', a.join(' '));
await paint(cfg, 'image', { prompt: 'rework', image: shelf.pathOf(harbour), strength: 0.4 }, {});
a = args();
check('start-from uses -i and --strength', a[a.indexOf('-i') + 1] === shelf.pathOf(harbour) && a[a.indexOf('--strength') + 1] === '0.4' && !a.includes('-r'), a.join(' '));
await paint(cfg, 'image', { prompt: 'rework', image: shelf.pathOf(harbour), strength: 7 }, {});
a = args();
check('strength is kept between 0.1 and 0.95', a[a.indexOf('--strength') + 1] === '0.95');
await paint(cfg, 'video', { prompt: 'Mira waves', image: shelf.pathOf(mira) }, {});
a = args();
check('video starts from the reference picture', a[a.indexOf('-i') + 1] === shelf.pathOf(mira) && !a.includes('--strength'));
check('capabilities: edits ready when the edit model files exist', capabilities(cfg).edits === true && capabilities({ ...cfg, painter: { ...cfg.painter, sdcpp: { ...cfg.painter.sdcpp, edit: undefined } } }).edits === false);

// Pictures to llama-server: OpenAI image parts
const oa = LlamaCpp.toOpenAI([{ role: 'user', content: 'look', images: [PNG.toString('base64')] }, { role: 'user', content: 'plain' }]);
check('llama.cpp gets pictures as image parts', Array.isArray(oa[0].content) && oa[0].content[1].image_url.url.startsWith('data:image/png;base64,') && oa[1].content === 'plain');

// Ticker: speed, time left and a heartbeat
const events = [];
const pub = { id: 'x', name: 'Test', done: 0, total: 1e9, phase: 'downloading' };
const t = ticker(pub, (e) => events.push(e));
t.tick();
await new Promise((r) => setTimeout(r, 1000));
pub.done = 1e8;
await new Promise((r) => setTimeout(r, 1150));
t.stop();
const last = events.at(-1);
check('ticker keeps sending while nothing else does (heartbeat)', events.length >= 3, String(events.length));
check('ticker works out speed and time left', last.rate > 1e7 && last.eta > 0 && last.elapsed >= 2, `rate ${Math.round(last.rate)} eta ${last.eta}`);

fs.rmSync(dir, { recursive: true, force: true });
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

// Nov 28: the engine speed-ups taken from Avalon (Lamplight 0160 even cut before the last save point, 0161 keep the
// card's ready-made steps): off by default until a test shows a gain, same words, each with an Engine tuning box, and
// Help, glossary and FAQ. Nothing here reads the real computer.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { TUNING_FIELDS, tuningArgs } from '../src/engine-tuning.js';
import { HELP } from '../public/help-content.js';

let pass = 0, fail = 0;
const check = (name, ok, why = '') => { if (ok) pass++; else fail++; console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${!ok && why ? ` (${why})` : ''}`); };
const app = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (f) => fs.readFileSync(path.join(app, f), 'utf8').replace(/\r\n/g, '\n');
const KEYS = /LLAMA_SERVER_CKPT_EQUAL|GGML_CUDA_GRAPHS_KEEP/;

// ---------- Off by default ----------
{ const srcDir = path.join(app, 'src');
  const users = fs.readdirSync(srcDir).filter((f) => f.endsWith('.js') && f !== 'engine-tuning.js' && KEYS.test(read(`src/${f}`).replace(/\/\/.*$/gm, '')));
  check('nothing in Bob sets them but the Engine tuning boxes (not Turbo, not a default)', users.length === 0, users.join(', ')); }
const p160 = read('engine/patches/0160-ckpt-equal-cut.patch');
const p161 = read('engine/patches/0161-cuda-graphs-keep.patch');
check('the engine cuts evenly only with LLAMA_SERVER_CKPT_EQUAL=1', /getenv\("LLAMA_SERVER_CKPT_EQUAL"\)/.test(p160) && /strcmp\(v, "1"\) == 0/.test(p160));
check('off, the save point is where llama.cpp puts it (n_ubatch)', /slot\.n_ckpt_tail = n_ubatch;/.test(p160));
check('the engine keeps graphs by use only with GGML_CUDA_GRAPHS_KEEP above 0', /getenv\("GGML_CUDA_GRAPHS_KEEP"\)/.test(p161) && /if \(keep_n > 0\)/.test(p161));

// ---------- Engine tuning boxes ----------
const by = Object.fromEntries(TUNING_FIELDS.map((f) => [f.k, f]));
check('two boxes', by.ckptEqualCut?.env === 'LLAMA_SERVER_CKPT_EQUAL' && by.graphsKeep?.env === 'GGML_CUDA_GRAPHS_KEEP');
const hand = (levers) => ({ engineTuning: { mode: 'hand', list: [{ model: 'big', ...levers }] } });
{ const t = tuningArgs(hand({ ckptEqualCut: 1, graphsKeep: 64 }), 'big');
  check('filled in, they reach the engine', t.env.LLAMA_SERVER_CKPT_EQUAL === '1' && t.env.GGML_CUDA_GRAPHS_KEEP === '64', JSON.stringify(t.env)); }
{ const t = tuningArgs(hand({ ckptEqualCut: 1, graphsKeep: 64 }), 'big', { cpu: true });
  check('on the processor: the even cut goes, the card graphs do not', t.env.LLAMA_SERVER_CKPT_EQUAL === '1' && !('GGML_CUDA_GRAPHS_KEEP' in t.env), JSON.stringify(t.env)); }
check('empty boxes send nothing', !KEYS.test(JSON.stringify(tuningArgs(hand({ step: 2048 }), 'big').env)));

// ---------- The engine patches and their notes ----------
const readme = read('engine/README.md');
check('the engine README lists 0160 and 0161', readme.includes('0160-ckpt-equal-cut.patch') && readme.includes('0161-cuda-graphs-keep.patch'));
check('and says 0161 changes ggml', /0127 and 0161 also change ggml/.test(readme));
check('the engine map has both', /### 0160-ckpt-equal-cut/.test(read('engine/ENGINE-MAP.md')) && /### 0161-cuda-graphs-keep/.test(read('engine/ENGINE-MAP.md')));
check('0160 has its test', fs.existsSync(path.join(app, 'engine', 'tests', 'ckpt-equal.py')));
check('Avalon is credited', /Avalon \(MIT/.test(readme));

// ---------- Help, glossary, FAQ ----------
const h = Object.fromEntries(HELP.map((e) => [e.id, e]));
check('Help explains both, and that they are off', /Even reading steps before the last save point/.test(h['engine-always-on']?.html) && /Keep the card's ready-made steps/.test(h['engine-always-on']?.html) && /off too/.test(h['engine-always-on']?.html));
check('Help says where each works', /Every system/.test(h['engine-always-on']?.html) && /Vulkan and the processor don't record steps this way/.test(h['engine-always-on']?.html));
check('an FAQ about Avalon', /Avalon/.test(h['faq-avalon']?.html) && /unproven in our lab, as we have yet to test/.test(h['engine-always-on']?.html));
check('glossary entries', /<dt>Save point \(checkpoint\)<\/dt>/.test(h.glossary?.html) && /<dt>Ready-made card steps \(CUDA graphs\)<\/dt>/.test(h.glossary?.html));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

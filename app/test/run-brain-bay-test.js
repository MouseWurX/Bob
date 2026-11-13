// 1.5.49: the moot is said plainly, brain loads say swap / add / load, and the brain bay picks the right scene.
import { brainText } from './source-text.js';
import fs from 'node:fs';
import { loadMode, loadLine } from '../src/brain.js';
import { bayChange, heldItems, MODES, sceneLabel, drawFrame } from '../public/brain-swap.js';

let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { if (ok) { pass++; console.log(`PASS ${name}`); } else { fail++; console.log(`FAIL ${name} ${extra}`); } };
const label = (m, who) => (who === 'reviewer' ? `Review brain (${m})` : `Brain (${m})`);

check('a plan that drops a brain is a swap', loadMode({ drop: ['a'], keep: [] }) === 'swap');
check('a plan that keeps the others is an add', loadMode({ drop: [], keep: ['a'] }) === 'add');
check('nothing loaded before is a load', loadMode({ drop: [], keep: [] }) === 'load');
check('no plan (unknown engine) says swap, as before', loadMode(null) === 'swap');

const sw = loadLine({ mode: 'swap', who: 'tinker', model: 'qwen3-coder', from: 'gemma4', secs: 20, label });
check('swap line names both brains, "my main brain" first', /Swapping brains: my main brain \(gemma4\) goes out and the brain \(qwen3-coder\) comes in/.test(sw), sw);
const add = loadLine({ mode: 'add', who: 'bob', model: 'b', from: 'a', secs: 5, label });
check('add line says the other stays loaded', /Adding the brain \(b\) beside my main brain \(a\), which stays loaded/.test(add), add);
check('load line', /^Loading the brain \(b\)\./.test(loadLine({ mode: 'load', who: 'bob', model: 'b', from: '', secs: 5, label })));
const ms = loadLine({ mode: 'swap', who: 'reviewer', model: 'gpt-oss', from: 'gemma4', copy: 'Bobby', secs: 30, label, single: true });
check('reviewer swap on Bob\'s own engine: a plain swap line', /^🛰 Moot: Bobby checks the answer\. My main brain \(gemma4\) steps out and the review brain \(gpt-oss\) comes in/.test(ms), ms);
check('reviewer swap on Ollama says memory is the reason', /Only one big brain fits right now/.test(loadLine({ mode: 'swap', who: 'reviewer', model: 'r', from: 'a', copy: 'B', secs: 3, label })));
check('reviewer add is called a moot and loads beside', /^🛰 Moot: Bobby joins me.*loads beside mine/.test(loadLine({ mode: 'add', who: 'reviewer', model: 'r', from: 'a', copy: 'Bobby', secs: 3, label })));

const app = fs.readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
check('the reviewer copy is announced as a moot, not "spins up"', /🛰 Moot: Bob calls in/.test(app) && !/spins up/.test(app));
const moot = fs.readFileSync(new URL('../src/moot.js', import.meta.url), 'utf8');
check('the end of a moot says "Moot over"', /🛰 \*\*Moot over:\*\*/.test(moot));

check('bay: first brain is a load', bayChange([], ['a'])?.mode === 'load');
check('bay: last brain gone is an unload', bayChange(['a'], [])?.mode === 'unload');
check('bay: a second brain is an add', bayChange(['a'], ['a', 'b'])?.mode === 'add');
check('bay: the picture model joining is an add, named plainly', /The picture model joined a/.test(bayChange(['a'], ['a', 'picture model'])?.text || ''));
check('bay: one let go while another stays is a drop', bayChange(['a', 'picture model'], ['a'])?.mode === 'drop' && /A stays loaded/.test(bayChange(['a', 'picture model'], ['a']).text));
check('bay: one for another is a swap', bayChange(['a'], ['b'])?.mode === 'swap');
check('bay: nothing changed, no scene', bayChange(['a'], ['a']) === null);
check('held items list brains and the picture model', JSON.stringify(heldItems({ models: [{ name: 'a' }], picture: { gb: 3 } })) === '["a","picture model"]');
const brainSrc = brainText();
check('one moot line per review: the reviewer line is quiet when its brain loads first', /quiet: true/.test(brainSrc) && /ev\.hat === 'reviewer' && ev\.quiet\) break/.test(app));
const swapSrc = fs.readFileSync(new URL('../public/brain-swap.js', import.meta.url), 'utf8');
check('brain bay: line only with Animations off, line outlasts the scene', /if \(!still\(\)\)/.test(swapSrc) && /textMs = 120000/.test(swapSrc) && /sceneMs = 8000/.test(swapSrc));
check('every scene has words for screen readers', MODES.every((m) => sceneLabel(m).length > 10));

// Every scene draws without errors on a stand-in canvas, at the start, middle and end.
const ctx = new Proxy({}, { get: (t, k) => (k in t ? t[k] : () => {}), set: (t, k, v) => { t[k] = v; return true; } });
let drew = true;
try { for (const m of MODES) for (const f of [0, 0.25, 0.5, 0.75, 0.99]) drawFrame(ctx, f, 'a', 'b', m); } catch (e) { drew = false; console.log(e); }
check('every scene draws at every point', drew);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

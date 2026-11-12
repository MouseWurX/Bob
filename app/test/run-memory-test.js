// 1.5.3: Bob shows RAM as well as graphics memory: in the brain label (how each brain splits between the card
// and system memory) and in Now running (graphics card and RAM meters, the brain by its friendly name).
import { brainText } from './source-text.js';
import fs from 'node:fs';
import { Brain } from '../src/brain.js';
import { ramNow } from '../src/server-ram.js';

let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra && !ok ? ' -> ' + extra : ''}`); };
const read = (f) => fs.readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');

const cfg = { models: { bob: 'gemma4:e4b', tinker: 'qwen3-coder:30b' }, sessionBrains: {}, session: 'normal', ollamaKeepAlive: '5m' };
const status = (loaded) => Brain.prototype.brainStatus.call({ cfg, waking: null, turns: new Map(), engine: { loaded: async () => loaded, estimateLoad: async () => 8 } });
const GB = 1024 ** 3; // Bob counts memory as Task Manager and nvidia-smi do (1.5.26)

let s = await status([{ name: 'gemma4:e4b', size: 7 * GB, vram: 5.8 * GB, split: true }]);
check('Ollama: a brain partly in RAM shows both parts', s.models[0].gb === 5.8 && s.models[0].ramGB === 1.2 && s.gb === 5.8 && s.ramGB === 1.2, JSON.stringify(s.models));
s = await status([{ name: 'gemma4:e4b', size: 6 * GB, vram: 6 * GB, split: true }]);
check('Ollama: all on the card means 0 GB in RAM', s.models[0].gb === 6 && s.ramGB === 0 && s.models[0].onCard);
s = await status([{ name: 'gemma4:e4b', size: 6 * GB, vram: 0, split: true }]);
check('Ollama: on the processor only, it is all RAM', s.models[0].gb === 0 && s.ramGB === 6 && !s.models[0].onCard);
s = await status([{ name: 'gemma4:e4b', size: 6 * GB, vram: 0, split: false }]);
check('llama.cpp without a per-process figure: no RAM guess, the file size as before', s.ramGB === null && s.models[0].gb === 6 && s.models[0].ramGB === null);
s = await status([{ name: 'gemma4:e4b', size: 6 * GB, vram: 5 * GB, split: true }]);
check('llama.cpp with nvidia-smi: card and RAM', s.models[0].gb === 5 && s.ramGB === 1);
s = await status([]);
check('nothing loaded: no RAM figure', s.ramGB === null && s.gb === 0 && s.state === 'asleep');

const llama = read('src/llamacpp.js'), ollama = read('src/ollama.js');
check('engines say whether they know the split', /split: vram > 0/.test(llama) && /split: true/.test(ollama));

const bar = read('public/brain-bar.js');
check('the label reads "5.8 GB on the graphics card · 1.2 GB in RAM"', /GB on the graphics card`/.test(bar) && /GB in RAM`/.test(bar) && /parts\.join\(' · '\)/.test(bar) && /Brain: loaded · \$\{mem\}/.test(bar) && /Brain: working · \$\{mem\}/.test(bar));

const r = ramNow(32 * GB, 20 * GB);
check('system RAM in use: total minus available', r.usedGB === 12 && r.totalGB === 32);
const server = read('src/server.js'), layout = read('public/layout.js'), html = read('public/index.html');
check('/api/gpu adds RAM; brains get friendly names on /api/brain', /ram: ramNow\(\), cpu: cpuNow\(\)/.test(server) && /m\.label = friendlyName\(m\.name\)/.test(server) && /entry\?\.name \|\| id/.test(server));
check('Now running: a Memory section with Graphics card and RAM meters', /<div class="now-sec">(?:<span class="sec-order">[\s\S]*?<\/span><\/span>)?Memory<\/div>/.test(html) /* 1.5.138: the heading starts with its grip */ && /row\(\(ram\.usedGB \/ ram\.totalGB\) \* 100, 'split-ram'\)/.test(layout) && /`RAM · \$\{ram\.usedGB\}/.test(layout));
check('no NVIDIA card says "Graphics card: not detected", not the old wording', /'Graphics card · not detected'/.test(layout) && !/No NVIDIA card info/.test(layout));
check('model ids stay out of Now running (friendly name only)', /m\.label \|\| m\.name/.test(layout) && !/· \$\{model\}/.test(layout));

// 1.5.26: "the memory usage at the top doesn't match the memory usage on the right panel".
{
  const { memGB } = await import('../src/server-ram.js');
  check('one unit everywhere: 1024 MB to the GB, like nvidia-smi and Task Manager', memGB(16 * GB) === 16 && memGB(5.8e9) === 5.4);
  s = await status([{ name: 'gemma4:e4b', size: 5.8e9, vram: 5.8e9, split: true }]);
  const smiGB = Math.round(5.8e9 / 1048576 / 102.4) / 10; // what nvidia-smi would say for the same bytes
  check('the brain label and the card meter count the same bytes as the same number', s.gb === smiGB, `${s.gb} vs ${smiGB}`);
  check('ram meter uses the same unit', /memGB\(total - free\)/.test(read('src/server-ram.js')) && /const gb = memGB/.test(brainText()));
  s = await status([{ name: 'gemma4:e4b', size: 6 * GB, vram: 0, split: false }]);
  check('llama.cpp without a per-process figure is marked as an estimate', s.models[0].estimate === true);
  s = await status([{ name: 'gemma4:e4b', size: 6 * GB, vram: 6 * GB, split: true }]);
  check('a measured brain is not an estimate', s.models[0].estimate === false);
  check('the label says it is Bob\'s brain only, and the meter counts everything', /This counts Bob\\'s brain only\. The Memory meter in Now running counts everything on the card: Windows, other apps and Bob\\'s picture model\./.test(bar) && /about ' : ''/.test(bar) && /`Graphics card · \$\{gpu\.usedGB\} of \$\{gpu\.totalGB\} GB in use \(all apps\)\$\{/.test(layout));
  check('the picture model gets its own line when loaded, measured only (never "about")', /st\.picture = \{ state: ps\.state, kind: ps\.kind, gb: ps\.vramBytes \? memGB\(ps\.vramBytes\) : null \}/.test(server) && /Picture model: \$\{st\.picture\.gb != null \? `\$\{st\.picture\.gb\} GB on the card`/.test(layout));
  check('nothing of Bob\'s loaded says so plainly', /'Bob has nothing on the card right now\.'/.test(layout));
  check('Now running takes Bob\'s brain from the same reading as the label, not the last model used', /dispatchEvent\(new CustomEvent\('bob-brain-status'/.test(bar) && /addEventListener\('bob-brain-status'/.test(layout) && !/brain\.state\?\.model/.test(server.slice(server.indexOf("p === '/api/gpu'"), server.indexOf("p === '/api/gpu'") + 600)));
  check('a new brain reading refreshes the meters too, so both are read together', /Date\.now\(\) - gpuAt > 1500\) pollGpu\(\)/.test(layout));
}
const css = read('public/style.css');
check('the Session menu has its own line, so its name is not cut off', /\.side \.session-wrap \{ flex-wrap: wrap; \}/.test(css) && /\.side \.session \{ flex: 1 1 100%; \}/.test(css));

// The Hands kill switch on the chat page (1.5.3). Hands are turned on in Settings; this only stops them.
{
  const hs = read('public/hands-switch.js'), app = read('public/app.js');
  const { cleanHands, handOn, handOffWhy } = await import('../src/hands-settings.js');
  const { holdHands } = await import('../src/hands.js');
  check('a Hands button sits next to "Free memory when Bob is idle"', /id="brainFree"[\s\S]{0,300}id="handsBtn"/.test(html));
  check('the chat-page switch never touches the Settings switches', !/\/api\/hands\/settings/.test(hs) && !/enabled:\s*true/.test(hs) && /\/api\/hands\/hold/.test(hs));
  check('changes from elsewhere show on the button too', /ev\.type === 'hands'\) handsSwitch\.update\(ev\.settings\)/.test(app));
  const mk = (h) => { const b = { cfg: { hands: cleanHands(h) }, saveHands(n) { this.cfg.hands = n; }, denyHands: () => 1, log() {} }; return b; };
  let b = mk({ enabled: false, files: { on: true } }), threw = '';
  try { holdHands(b, false); } catch (e) { threw = e.message; }
  check('with Hands off in Settings the switch cannot switch anything on', /off in Settings/.test(threw) && !handOn(b.cfg, 'files'));
  b = mk({ enabled: true, files: { on: true } });
  const n = holdHands(b, true);
  check('stopping keeps Settings as it was, answers waiting cards No and blocks the Hand', b.cfg.hands.enabled === true && b.cfg.hands.files.on === true && b.cfg.hands.held === true && n === 1 && !handOn(b.cfg, 'files'));
  check('Bob is told why, and where to switch it back', /chat page/.test(handOffWhy(b.cfg, 'files')));
  holdHands(b, false);
  check('switching back on lets the same Hands work again, nothing more', handOn(b.cfg, 'files') && !handOn(b.cfg, 'run'));
  const r = read('src/hands-routes.js');
  check('stopping works from anywhere; carrying on only at the PC', r.indexOf("p === '/api/hands/hold' && b.held === true") < r.indexOf('if (!isLocal)') && r.indexOf("if (p === '/api/hands/hold') { holdHands(brain, false)") > r.indexOf('if (!isLocal)'));
}

{
  // 1.5.11: the user saw "a very small box with nothing in it" where a new picture should be.
  const app = read('public/app.js'), css = read('public/style.css');
  check('a new picture goes into the same bubble as the reply words, and words arriving later keep it', /case 'image': \{ addMedia\(ev, 'image'\)/.test(app) && /function drawReply\(r\) \{[\s\S]*?r\.el\.innerHTML = words \+ \(r\.media\.length \? `<div class="reply-media">\$\{mediaHtml\(r\.media\)\}/.test(app) && /r\.el\.insertBefore\(tpl\.content, keep\)/.test(app) && /r\.text \+= ev\.text;\s*drawReply\(r\);/.test(app));
  check('pictures have a real width, so an image-only bubble cannot collapse to an empty box', /\.msg\.bob:has\(> img\)[^{]*\{ width: min\(540px, 92%\); \}/.test(css));
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

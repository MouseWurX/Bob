// Nov 14 2026: the Welcome (first-time setup) as seven pages, Hello, Engines, Brains, Users, Privacy, Helpers, Done
// (public/welcome-steps.js, drawn by cellar.js). Back bottom left and Next bottom right, each naming its page.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WSTEPS, ENGINE_GROUPS, WELCOME_OWN_KEYS, splitWelcomeRows, welcomeRowName, tickedGB, stepHeadHtml, stepNavHtml, clampStep, stepIndex } from '../public/welcome-steps.js';
import { WANTS } from '../public/wants.js';
import { HELP } from '../public/help-content.js';
import { esc } from '../public/util.js';
import { publicText } from './source-text.js';

let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra && !ok ? ' -> ' + extra : ''}`); };
const here = path.dirname(fileURLToPath(import.meta.url));
const read = (f) => fs.readFileSync(path.join(here, '..', f), 'utf8').replace(/\r\n/g, '\n');
const cellar = publicText('cellar.js'), css = read('public/style.css');

// ---------- The pages, in the owner's order ----------
check('seven pages in order', WSTEPS.map((s) => s.name).join(',') === 'Hello,Engines,Brains,Users,Privacy,Helpers,Done');
check('page numbers stay in range', clampStep(-3) === 0 && clampStep(99) === WSTEPS.length - 1 && clampStep('2') === 2 && clampStep('x') === 0 && stepIndex('helpers') === 5 && stepIndex('nope') === 0);
for (const s of WSTEPS) check(`cellar draws the ${s.name} page`, cellar.includes(`step === '${s.id}'`) || s.id === 'done');

// ---------- Back bottom left, Next bottom right, each naming its page ----------
{
  const first = stepNavHtml(0, esc), mid = stepNavHtml(2, esc), last = stepNavHtml(6, esc);
  check('first page: no Back, Next names Engines', !first.includes('wz-back') && /wz-next" data-wstep="1"><span class="wz-dir">Next →<\/span><span class="wz-to">Engines<\/span>/.test(first));
  check('Back comes first (left), Next last (right)', mid.indexOf('wz-back') < mid.indexOf('wz-next') && /justify-content: space-between/.test(css.slice(css.indexOf('.wz-nav {'))));
  check('Back names the page before, Next the page after', /data-wstep="1"><span class="wz-dir">← Back<\/span><span class="wz-to">Engines<\/span>/.test(mid) && /data-wstep="3"><span class="wz-dir">Next →<\/span><span class="wz-to">Users<\/span>/.test(mid));
  check('last page: Back names Helpers, Next finishes (Start chatting)', /<span class="wz-to">Helpers<\/span>/.test(last) && /data-skip><span class="wz-dir">Finish<\/span><span class="wz-to">Start chatting<\/span>/.test(last));
  check('the nav is a labelled landmark', /<nav class="wz-nav" aria-label="Setup steps">/.test(mid));
  check('the nav stays in view on long pages', /\.wz-nav \{ position: sticky; bottom:/.test(css));
  check('Back and Next are big enough to press (48 px)', /\.cellar \.wz-nav :is\(\.wz-back, \.wz-next\) \{[^}]*min-height: 48px/.test(css));
}
{
  const head = stepHeadHtml(3, esc);
  check('header says where you are', head.includes('Step 4 of 7 · Users'));
  check('one dot per page, the current one marked for screen readers, each named', (head.match(/class="wz-dot[ "]/g) || []).length === 7 && (head.match(/aria-current="step"/g) || []).length === 1 && WSTEPS.every((s) => head.includes(`aria-label="${s.name}"`)));
  check('dots are 24 px targets', /\.wz-dot \{ width: 24px; height: 24px;/.test(css));
  check('Skip setup on every page', head.includes('data-skip>Skip setup'));
}
check('Back, Next and the dots change page and focus its title', cellar.includes("else if (b.dataset.wstep != null && mode === 'welcome') { wStep = clampStep(b.dataset.wstep); wStepMoved = true;") && cellar.includes('<h2 class="wz-title" tabindex="-1">'));

// ---------- Engines and Brains share one download ----------
{
  const rows = [
    { id: 'engine:brainengine', kind: 'engine', name: 'Brain Engine', sizeGB: 0.7 },
    { id: 'engine:sdcpp', kind: 'engine', name: 'stable-diffusion.cpp', sizeGB: 0.5 },
    { id: 'engine:whispercpp', kind: 'engine', name: 'whisper.cpp', sizeGB: 0.1 },
    { id: 'engine:kokoro', kind: 'engine', name: 'Kokoro voices', sizeGB: 0.1 },
    { id: 'engine:audio', kind: 'engine', name: 'Audio tools', sizeGB: 12 },
    { id: 'big', kind: 'model', category: 'chat', sizeGB: 21 },
    { id: 'code', kind: 'model', category: 'coding', sizeGB: 9 },
    { id: 'emb', kind: 'model', category: 'embed', sizeGB: 0.3 },
    { id: 'pic', kind: 'model', category: 'images', sizeGB: 6 },
    { id: 'clip', kind: 'model', category: 'video', sizeGB: 21 },
    { id: 'voice', kind: 'model', category: 'voice', sizeGB: 0.3 },
    { id: 'ear', kind: 'model', category: 'speech', sizeGB: 0.2 },
    { id: 'song', kind: 'model', category: 'music', sizeGB: 10 },
    { id: 'odd', kind: 'model', category: 'something-new', sizeGB: 1 }
  ];
  const { groups, brains } = splitWelcomeRows(rows);
  const ids = (g) => groups.find((x) => x.id === g).rows.map((r) => r.id);
  check('Brains: the brain program, chat, coding, memory, and anything no group claims', brains.map((r) => r.id).join(',') === 'engine:brainengine,big,code,emb,odd');
  check('Engines: grouped by job', ids('pictures').join(',') === 'engine:sdcpp,pic' && ids('video').join(',') === 'clip' && ids('voice').join(',') === 'engine:kokoro,voice' && ids('hearing').join(',') === 'engine:whispercpp,ear' && ids('sound').join(',') === 'engine:audio,song');
  check('nothing dropped, nothing twice', groups.flatMap((g) => g.rows).length + brains.length === rows.length);
  check('Engines groups cover image, video, voice, hearing, sound and 3D', ['pictures', 'video', 'voice', 'hearing', 'sound', '3d'].every((id) => ENGINE_GROUPS.some((g) => g.id === id)));
  check('3D shows its two switches, and they are real Welcome switches', ENGINE_GROUPS.find((g) => g.id === '3d').keys.every((k) => WANTS.some((w) => w.key === k) && WELCOME_OWN_KEYS.includes(k)));
  check('the ticked size counts only what still needs getting', tickedGB([{ id: 'a', sizeGB: 1.25 }, { id: 'b', sizeGB: 2, here: true }, { id: 'c', sizeGB: 3, blocked: 'x' }, { id: 'd', sizeGB: 4 }], new Set(['a', 'b', 'c'])) === 1.3);
  check('one set of picks: Get Bob ready on the Brains page gets both pages', (() => { const w = cellar.slice(cellar.indexOf("else if (step === 'engines')"), cellar.indexOf("else if (step === 'users')")); const e = w.slice(0, w.indexOf("else if (step === 'brains')")), b = w.slice(w.indexOf("else if (step === 'brains')")); return b.includes('${dlButtons}') && !e.includes('dlButtons') && /const dlButtons = [^;]*data-getready/.test(cellar); })());
}

// ---------- The owner: no other brain program named; Brain Engine is "a fork of llama.cpp" ----------
check('Brain Engine keeps its name', welcomeRowName({ id: 'engine:brainengine', name: 'Brain Engine' }) === 'Brain Engine');
check('the plain build is called what it does', welcomeRowName({ id: 'engine:llamacpp', name: 'llama.cpp' }) === 'Brain program');
check('other rows keep their names', welcomeRowName({ id: 'engine:sdcpp', name: 'stable-diffusion.cpp' }) === 'stable-diffusion.cpp');
{
  const w = cellar.slice(cellar.indexOf('  function welcomeHtml() {'), cellar.indexOf('  // Settings in its own window'));
  check('the Welcome says Brain Engine is my fork of llama.cpp', w.includes('Brain Engine, my own fork of llama.cpp'));
  check('the Welcome names no other brain program and never Ollama', !/ollama/i.test(w) && (w.match(/llama\.cpp/g) || []).length === 2);
}

// ---------- Users and Privacy ----------
check('Users page: the Users switch, then add, rename and remove people right there once it is on', /step === 'users'[\s\S]{0,400}wantRowHtml\(s, esc, 'profilesOn'\)[\s\S]{0,300}s\.profilesOn === true \? '<div class="everyday-box wz-people"><h3>People<\/h3><div class="people-box" data-setup="1"><\/div><\/div>'/.test(cellar) && cellar.includes("mountEveryday(dlg.querySelector('.everyday-box')"));
check('Users page: ticking Users shows the people list at once', cellar.includes("if (k === 'profilesOn' && mode === 'welcome') draw();"));
check('Privacy page: Amnesia mode, unticked unless already on', /data-wharness="amnesiaOffer" \$\{wHarness\?\.amnesiaOffer === true \? 'checked' : ''\}/.test(cellar));
check('Privacy page: Amnesia saves the same switch as Settings', cellar.includes("await api('/api/harness', { patch: { [k]: el.checked } })"));
check('Privacy page: no passcode asked for, set or changed in setup', (() => { const w = cellar.slice(cellar.indexOf("else if (step === 'privacy')"), cellar.indexOf("else if (step === 'helpers')")); return !/type="password"|data-wantjump="ev-lock"|data-owncode/.test(w) && w.includes('This setup never asks for one or changes one.'); })());
{
  const { peopleHtml } = await import('../public/everyday.js');
  const v = { list: [{ id: 'a1', name: 'Ann', passcode: true }, { id: 'b2', name: 'Bo', passcode: false }], current: 'main' };
  const set = peopleHtml(v, { setup: true });
  check('Users page: add, rename and remove, with no passcode box, status or change anywhere', set.includes('data-personadd') && set.includes('data-personren="a1"') && set.includes('data-persondel="b2"') && !/type="password"|data-personcode|data-owncode|🔒|no passcode/.test(set));
  check('Users page: a person who is in sees their own passcode nowhere in setup either', !/type="password"|data-owncode/.test(peopleHtml({ ...v, current: 'a1', currentPasscode: false }, { setup: true })));
  check('Settings keeps the passcode choices', /data-personcode/.test(peopleHtml(v)) && /data-owncodeon/.test(peopleHtml({ ...v, current: 'b2' })));
  check('the setup list is drawn in setup mode', cellar.includes('<div class="people-box" data-setup="1"></div>') && read('public/everyday.js').includes("peopleHtml(v, { setup: people.dataset.setup === '1' })"));
}
check('Helpers page leaves out what other pages show', cellar.includes('leave: WELCOME_OWN_KEYS'));

// ---------- Help ----------
const entry = (id) => HELP.find((e) => e.id === id);
check('Help: the setup page by page, every page named', Boolean(entry('setup-steps')) && WSTEPS.every((s) => entry('setup-steps').html.includes(s.name)) && /Android/.test(entry('setup-steps').html));
check('FAQ', entry('faq-setup-steps')?.group === 'FAQ');
check('glossary', entry('glossary')?.html.includes('setup-steps'));
check('Getting started points at it', entry('start')?.html.includes('setup-steps'));

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exitCode = 1;

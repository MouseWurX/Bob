// 1.5.216 (the owner, Nov 13): the line under Bob's name follows his state in his voice (public/status-line.js).
// Display only: nothing is added to what a brain is sent.
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { publicText, serverText } from './source-text.js';
import { LINES, PLAIN, TITLE, moodOf, pickLine, createStatusLine, FADE_MS, UNLOAD_MS, SWAP_MS } from '../public/status-line.js';

let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra ? ' ' + extra : ''}`); };
const read = (rel) => fs.readFileSync(fileURLToPath(new URL(`../${rel}`, import.meta.url)), 'utf8').replace(/\r\n/g, '\n');

// ---- which lines fit ----
check('no brain loaded and idle: asleep', moodOf({ state: 'idle', loaded: 0 }) === 'asleep');
check('not known yet: ready, not asleep', moodOf({ state: 'idle', loaded: null }) === 'idle');
check('a brain loaded and idle: ready', moodOf({ state: 'idle', loaded: 1 }) === 'idle');
check('a brain just went: unloading', moodOf({ state: 'idle', loaded: 0, unloading: true }) === 'unloading');
check('thinking, then writing back once words come', moodOf({ state: 'thinking' }) === 'thinking' && moodOf({ state: 'thinking', replying: true }) === 'replying');
check('loading, waking, working, painting', ['loading', 'waking', 'busy', 'painting'].every((s) => moodOf({ state: s, loaded: 0 }) === s));
check('needs your OK beats everything', moodOf({ state: 'waiting', loaded: 0, paused: true, replying: true }) === 'waiting');
check('a paused job while idle', moodOf({ state: 'idle', loaded: 1, paused: true }) === 'paused');
check('an unknown state reads as ready', moodOf({ state: 'mystery' }) === 'idle');

// ---- the lines ----
const all = Object.values(LINES).flat();
check('every state has lines and a plain one', Object.keys(LINES).every((k) => LINES[k].length >= 1 && PLAIN[k]));
check('the sleepy puns the owner asked for', LINES.asleep.some((t) => /^Sleeping/.test(t)) && LINES.asleep.some((t) => /^Vacancy/.test(t)));
check('the old ready line is kept, on two lines', LINES.idle[0] === 'Coffee in hand.\nReady when you are.');
check('lines are short: at most two lines of 23 characters', all.every((t) => t.split('\n').length <= 2 && t.split('\n').every((x) => x.length <= 23)), all.filter((t) => t.split('\n').some((x) => x.length > 23)).join(' | '));
check('needs your OK always says so first', LINES.waiting.every((t) => t.startsWith('Needs your OK')));
check('no line names a real model or the series', !all.some((t) => /qwen|llama|gpt|riker|bobert|bobiverse/i.test(t)));
check('picks a different line than the one showing', Array.from({ length: 30 }).every(() => pickLine('idle', { prev: LINES.idle[0] }) !== LINES.idle[0]));
check('plain words when the jokes are off', pickLine('asleep', { jokes: false }) === PLAIN.asleep && pickLine('thinking', { jokes: false }) === 'Thinking...');
check('the title bar stays plain', TITLE.thinking === 'Thinking' && !TITLE.idle && !TITLE.asleep);

// ---- the line itself, with a fake element and fake clock ----
function fakeEl() {
  const cls = new Set(), attrs = {};
  return { textContent: '', dataset: {}, classList: { add: (c) => cls.add(c), remove: (c) => cls.delete(c), contains: (c) => cls.has(c) }, setAttribute: (k, v) => { attrs[k] = v; }, attrs, cls };
}
function clock() {
  let now = 0, id = 0; const timers = new Map();
  return {
    set: (fn, ms) => { timers.set(++id, { fn, at: now + ms }); return id; },
    clear: (i) => timers.delete(i),
    run(ms) { const end = now + ms; for (;;) { const next = [...timers.entries()].sort((a, b) => a[1].at - b[1].at)[0]; if (!next || next[1].at > end) break; now = next[1].at; timers.delete(next[0]); next[1].fn(); } now = end; }
  };
}
{
  const el = fakeEl(), c = clock();
  const line = createStatusLine(el, { setTimer: c.set, clearTimer: c.clear, rnd: () => 0 });
  line.status({ state: 'idle' });
  check('first line shows at once (no fade from nothing)', el.textContent === LINES.idle[0] && !el.cls.has('fading'));
  line.brains({ models: [], state: 'asleep' });
  check('no brain: fades out, then a sleepy line', el.cls.has('fading') && (c.run(FADE_MS), LINES.asleep.includes(el.textContent)) && !el.cls.has('fading'));
  check('a new state is said to screen readers', el.attrs['aria-live'] === 'polite');
  line.status({ state: 'loading' }); c.run(FADE_MS);
  check('loading', LINES.loading.includes(el.textContent));
  line.brains({ models: [{ name: 'a' }], state: 'awake' });
  line.status({ state: 'thinking' }); c.run(FADE_MS);
  check('thinking', LINES.thinking.includes(el.textContent));
  line.replying(true); c.run(FADE_MS);
  check('writing back once his words come', LINES.replying.includes(el.textContent) && line.title() === 'Answering');
  const was = el.textContent; c.run(SWAP_MS.replying + FADE_MS);
  check('a long state swaps to another of its lines, quietly', el.textContent !== was && LINES.replying.includes(el.textContent) && el.attrs['aria-live'] === 'off');
  line.status({ state: 'idle' }); c.run(FADE_MS);
  check('done: ready again', LINES.idle.includes(el.textContent));
  line.brains({ models: [], state: 'asleep' }); c.run(FADE_MS);
  check('the brain goes: unloading', LINES.unloading.includes(el.textContent));
  c.run(UNLOAD_MS + FADE_MS);
  check('then asleep', LINES.asleep.includes(el.textContent));
  line.brains({ models: [{ name: 'a' }], state: 'awake' }); c.run(FADE_MS);
  line.brains({ models: [], state: 'loading' }); c.run(FADE_MS);
  check('mid-swap the engine holding nothing is not an unload', !LINES.unloading.includes(el.textContent));
  line.jobs([{ state: 'paused' }]); c.run(FADE_MS);
  check('a paused job', LINES.paused.includes(el.textContent));
  line.jobs([]); line.hold('Listening...');
  check('a held line shows at once and stays', el.textContent === 'Listening...' && (c.run(120000), el.textContent === 'Listening...'));
  line.status({ state: 'idle' }); c.run(FADE_MS);
  check('the next status lets it go', el.textContent !== 'Listening...');
  line.jokes(false); c.run(FADE_MS);
  check('jokes off: plain words', Object.values(PLAIN).includes(el.textContent));
}
{
  const el = fakeEl(), c = clock();
  const line = createStatusLine(el, { setTimer: c.set, clearTimer: c.clear, still: () => true });
  line.status({ state: 'idle' }); line.status({ state: 'thinking' });
  check('Animations off: no fade, the words just change', LINES.thinking.includes(el.textContent) && !el.cls.has('fading'));
}

// ---- wiring ----
{
  const app = publicText('app.js'), server = serverText(), css = read('public/style.css'), help = read('public/help-content.js'), cellar = publicText('cellar-pages.js');
  check('app uses the status line, no old fixed words', /createStatusLine\(statusEl/.test(app) && !/STATUS_TEXT/.test(app));
  check('his words coming in mark "writing back"', /ev\.type === 'token'.*statusLine\.replying\(true\)/.test(app));
  check('the brain reading feeds it', /'bob-brain-status', \(e\) => \{ statusLine\.brains\(e\.detail\);/.test(app));
  check('paused jobs feed it', /statusLine\.jobs\(jobs\)/.test(app));
  check('two-part lines show on two lines', /\.status \{[^}]*white-space: pre-line/.test(css));
  check('the fade is about 0.7 s and off with Animations off', /\.status \{[^}]*transition: opacity \.35s/.test(css) && /\.status\.fading \{ opacity: 0; \}/.test(css) && /body\.still \.status \{ transition: none; \}/.test(css));
  check('Settings has the switch, on unless turned off', /sswitch\('statusJokes', settings\.statusJokes !== false, 'Funny status line'/.test(cellar));
  check('the server saves it and says it', /out\.statusJokes = cfg\.statusJokes !== false/.test(server) && /statusJokes: cfg\.statusJokes !== false/.test(server));
  check('saved settings read it as on unless false', /out\.statusJokes = out\.statusJokes !== false/.test(read('src/config.js')));
  check('Help, FAQ and glossary', /id: 'status-line'/.test(help) && /id: 'faq-status-line'/.test(help) && /<dt>Status line<\/dt>/.test(help));
  check('the settings inventory lists it', /Funny status line/.test(read('docs/SETTINGS-INVENTORY.md')));
  const looks = read('public/looks.css');
  check('Lamplight on a phone: his line goes under his name at the top (217 PC check)', /head\.querySelector\('\.lamp-who'\)\.append\(statusEl\)/.test(app) && /\.side-top \.who'\)\?\.append\(statusEl\)/.test(app) && /\.lamp-head \.status \{[^}]*white-space: pre-line/.test(looks));
  check('...and the brain chip keeps its dot and switches, its words only for screen readers', /body\.look-lamplight #brainPillText \{ position: absolute;[^}]*clip-path: inset\(50%\)/.test(looks));
  check('nothing new in the start prompt', !/status-line|statusJokes|Vacancy/.test(read('src/prompts.js')));
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);

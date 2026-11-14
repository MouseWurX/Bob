// Tests the Gaming-session sleepy asides: scripted, rare, never two in a row, tied to the Outlook dial.
import { brainText, publicText } from './source-text.js';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { SLEEPY, SLEEPY_ENTER, SLEEPY_LEAVE, SLEEPY_SESSION, sleepyGap, sleepyAfterReply, sleepySwitch } from '../public/sleepy.js';

let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra ? ' ' + extra : ''}`); };
const read = (f) => fs.readFileSync(fileURLToPath(new URL(f, import.meta.url)), 'utf8');

check('pool has about 20 lines', SLEEPY.length >= 18 && SLEEPY.length <= 24, String(SLEEPY.length));
check('no duplicate lines', new Set(SLEEPY).size === SLEEPY.length);
check('lines are short', [...SLEEPY, ...SLEEPY_ENTER, ...SLEEPY_LEAVE].every((l) => l.length <= 90));
// Feelings only: no claims about files, jobs or what he did.
check('no made-up facts about jobs or files', ![...SLEEPY, ...SLEEPY_ENTER, ...SLEEPY_LEAVE].some((l) => /\b(file|folder|job|task|saved|deleted|forgot (your|the)|lost)\b/i.test(l)));
check('the session is Gaming (id light)', SLEEPY_SESSION === 'light');

check('default dials: every 5 replies', sleepyGap({}) === 5);
check('gloomy Outlook: every 4', sleepyGap({ mood: 0 }) === 4 && sleepyGap({ mood: 1 }) === 4);
check('relentlessly sunny: every 6', sleepyGap({ mood: 4 }) === 6);
check('Terse turns them off', sleepyGap({ length: 0 }) === 0);
check('Plain wit turns them off', sleepyGap({ wit: 0 }) === 0);

// Over 100 replies at default dials: exactly one aside every 5th reply, never two in a row.
const st = { since: 0, recent: [] };
const got = Array.from({ length: 100 }, () => sleepyAfterReply(st, {}));
const hits = got.map((x, i) => (x ? i : -1)).filter((i) => i >= 0);
check('one aside per 5 replies', hits.length === 20, String(hits.length));
check('never two in a row', got.every((x, i) => !(x && got[i + 1])));
check('first aside is not the first reply', !got[0] && !got[3] && Boolean(got[4]));
// The same line doesn't come back until half the pool has been used.
const used = got.filter(Boolean);
check('no repeat within 10 asides', used.every((x, i) => !used.slice(Math.max(0, i - 9), i).includes(x)));
const off = { since: 0, recent: [] };
check('Terse: never', Array.from({ length: 30 }, () => sleepyAfterReply(off, { length: 0 })).every((x) => !x));

const sw = { since: 3, recent: [] };
check('entering Gaming gets an enter line', SLEEPY_ENTER.includes(sleepySwitch(sw, 'normal', 'light', {})) && sw.since === 0);
check('leaving Gaming gets a stretch or yawn', SLEEPY_LEAVE.includes(sleepySwitch(sw, 'light', 'coding', {})));
check('other switches say nothing', sleepySwitch(sw, 'normal', 'coding', {}) === '' && sleepySwitch(sw, 'light', 'light', {}) === '');
check('Terse: no switch lines either', sleepySwitch(sw, 'normal', 'light', { length: 0 }) === '');

// Wiring: the brain sends asides only in Gaming, after a finished reply; the page shows them apart from the reply
// (not saved, not copied) and Read aloud skips the *stage directions*.
const brain = brainText();
check('brain checks the session before an aside', /currentSession\(this\.cfg\)\.id === SLEEPY_SESSION/.test(brain));
check('brain only after a reply that finished', /if \(ok && !flagged && !controller\.signal\.aborted && \(!job \|\| job\.state === 'done'\)/.test(brain));
check('error and correction notes block the aside', /\['error', 'correction', 'held', 'waiting'\]\.includes\(ev\.type\)\) flagged = true/.test(brain));
check('no "today" lines (Gaming is a mode, not a day)', !SLEEPY.some((l) => /\btoday\b/i.test(l)));
check('brain sends a switch line', /sleepySwitch\(this\.sleepy, from, id/.test(brain));
const app = publicText('app.js');
check('page handles aside events', app.includes("case 'aside':"));
check('read aloud skips stage directions', app.includes('speak(sayAside(aside))'));
check('the prompt never carries the lines', !read('../src/persona.js').includes('sleepy') && !brain.includes('sleepyPrompt'));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

// 1.5.97: the ⏳ waiting line says who has the graphics card and that nothing is needed from the user.
import { brainText } from './source-text.js';
import fs from 'node:fs';
import { Gate, holderLine, waitLine, isBareOk, NOTHING_TO_OK, WAIT_STILL } from '../src/handoff.js';
import { HELP } from '../public/help-content.js';
let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { if (ok) { pass++; console.log('PASS', name); } else { fail++; console.log('FAIL', name, extra); } };

check('holder: the Brain on another job', holderLine('the Brain') === 'my Brain is finishing another job');
check('holder: lending names the borrowing Bob by his Bob-Net name', holderLine('the Brain', { for: 'Bob on legion' }) === 'I\'m lending my brain to "Bob on legion"');
check('holder: pictures and clips', holderLine('the picture engine') === "I'm making a picture" && holderLine('the clip engine') === "I'm making a clip");
check('holder: another program, or unknown', holderLine('the workshop') === 'another program is using it' && holderLine('') === 'something else is using it');
const l0 = waitLine('my Brain is finishing another job', 0.4);
check('the line starts with ⏳ and says nothing is needed', l0 === "⏳ The graphics card is busy: my Brain is finishing another job. Nothing for you to do; I carry on by myself when it's free. (waiting 0 min)", l0);
check('after 5 minutes it says Stop cancels', waitLine('x', 5.2).endsWith(`(waiting 5 min) ${WAIT_STILL}`) && !waitLine('x', 4.9).includes(WAIT_STILL));
check('a bare ok, yes or go counts; real words don\'t', ['ok', 'OK.', 'okay!', 'yes', 'go', 'go ahead', 'sure'].every(isBareOk) && !['ok make it blue', 'yes please draw a cat', 'going home'].some(isBareOk));
check('the answer to it', NOTHING_TO_OK === "There's nothing to OK right now. I'm just waiting for the graphics card, and I'll carry on by myself.");

// The gate: a second job waiting for the card gets the ⏳ line (not an announce), and the count goes back to 0.
{
  const events = []; const states = [];
  const brain = { setState: (s, t) => states.push([s, t]), log() {} };
  const gate = new Gate(brain);
  const a = new AbortController(), b = new AbortController();
  await gate.hold(a.signal, 'the Brain', () => {});
  const waiting = gate.hold(b.signal, 'the picture engine', (ev) => events.push(ev));
  check('the waiting job gets one ⏳ line with an id', events.length === 1 && events[0].type === 'waiting-line' && /^wait-/.test(events[0].id) && /my Brain is finishing another job/.test(events[0].text), JSON.stringify(events));
  check('Tasks shows the same line', states.some(([s, t]) => s === 'waiting' && t === events[0].text));
  check('while it waits, Bob knows a wait is on', gate.waitingNow === 1);
  gate.done(a.signal); await waiting;
  check('when the card is free the wait ends', gate.waitingNow === 0);
  gate.done(b.signal);
}

const brainSrc = brainText();
check('a bare OK with no card open is answered at once, not queued', /isBareOk\(text\) && !this\.approvals\.size && \(this\.gate\?\.waitingNow > 0 \|\| queuedHere\)/.test(brainSrc));
const app = fs.readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
check('chat shows it as a muted note updated in place, never a card', /case 'waiting-line':/.test(app) && /note\(ev\.text, 'wait'\)/.test(app) && !/waiting-line[^\n]*button/.test(app));
check('no old "Waiting for ... to finish with the graphics card" line is left', !/to finish with the graphics card/.test(fs.readFileSync(new URL('../src/handoff.js', import.meta.url), 'utf8')));
check('glossary explains the ⏳ line', /<dt>⏳ line<\/dt><dd>Bob is waiting on something, not on you\. Cards are the only things that need your answer\.<\/dd>/.test(HELP.find((h) => h.id === 'glossary').html));
check('"about 1 second", never "about 1 seconds" (1.5.144)', !/\$\{secs\} seconds/.test(brainSrc) && /\$\{secs === 1 \? 'second' : 'seconds'\}/.test(brainSrc));
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

// "Said but not done" (src/said-done.js, 1.5.207, always on). PC check: with web search off and its Switch it on card
// waiting, Riker said "Web search is now on". The app checks the finished reply in code and adds one short correction.
import { switchClaim, saidNotDone, pendingLine } from '../src/said-done.js';
import { switchFor, SWITCH_KEYS } from '../src/setup-offer.js';
let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { if (ok) { pass++; console.log(`PASS ${name}`); } else { fail++; console.log(`FAIL ${name}${extra ? ` (${extra})` : ''}`); } };

const off = SWITCH_KEYS.map((k) => switchFor({}, k)).filter(Boolean);
check('web search is off in a fresh home', off.some((s) => s.key === 'web'));
const web = new Set(['web']);

// Riker-style replies that claim it
for (const r of ['Web search is now on! Let me look up the weather for you.', 'Done, I\'ve turned on web search.', 'I switched it on, web search is ready to go.', 'Great news: I can now search the web for that.', 'Web search enabled. Searching now...']) {
  const v = saidNotDone(r, { off, pending: web });
  check(`claim caught: "${r}"`, v?.kind === 'switch' && v.key === 'web' && /^Not yet: Web search is still off\. It switches on when you press Switch it on/.test(v.note), JSON.stringify(v));
}
// ...and ones that don't
for (const r of ['Web search is off right now. Press Switch it on on the card and I\'ll look it up.', 'Once you press the button, web search is on and I carry on.', 'If you switch on web search, I can find it.', 'Would you like web search on?', 'The weather tomorrow is sunny.', 'Web search needs your OK first.']) {
  check(`no claim: "${r}"`, saidNotDone(r, { off, pending: web }) === null, JSON.stringify(saidNotDone(r, { off, pending: web })));
}
check('a switch that really is on is never corrected', switchClaim('Web search is now on.', off.filter((s) => s.key !== 'web')) === null);
check('with no card waiting, it says where the switch is', /It's in Settings, How Bob works\./.test(saidNotDone('Web search is now on.', { off }).note));

// sent and looked up
check('"I\'ve sent it" with no send tool is corrected', saidNotDone('I\'ve sent the message to your phone.', { off, actions: [{ name: 'remember', ok: true }] })?.kind === 'sent');
check('"I\'ve sent it" after send_message ran is fine', saidNotDone('I\'ve sent the message to your phone.', { off, actions: [{ name: 'send_message', ok: true }] }) === null);
check('a send that was denied does not count', saidNotDone('I\'ve sent it.', { off, actions: [{ name: 'send_message', ok: true, declined: true }] })?.kind === 'sent');
check('"I looked it up" with no look-up is corrected', saidNotDone('I looked it up: the moon is 3,474 km across.', { off: [] })?.kind === 'looked');
check('"I looked it up" after web_search is fine', saidNotDone('I looked it up: the moon is 3,474 km across.', { off: [], actions: [{ name: 'web_search', ok: true }] }) === null);
check('"should I send it?" is not a claim', saidNotDone('Should I send it now?', { off: [] }) === null);

// what the brain reads: one short line, only while an offer waits
check('the waiting line is one short line', pendingLine(off, web) === 'Web search: offered, not on yet (waiting for a press on the card).');
check('nothing waiting, no line', pendingLine(off, new Set()) === '');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

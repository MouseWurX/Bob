// Jobs run 3 (16 Nov 2026): "I can't" and one more go with every tool stacked two answers (src/cant-retry.js).
// Plain objects in and out; nothing reads the real computer.
import fs from 'node:fs';
import { cantReason, markCant, settleCant } from '../src/cant-retry.js';
import { CANT_NUDGE } from '../src/brain-words.js';

let pass = 0, fail = 0;
const check = (name, ok) => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'} ${name}`); };
const read = (p) => fs.readFileSync(new URL(`../${p}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const off = { hands: { enabled: true, run: { on: false } } };

check('a refused tool this turn: no second go', cantReason(off, "I can't edit that script.", [{ role: 'tool', content: 'Error: That place is off limits to you.' }]) === 'a tool was refused this turn');
check('a reply naming a Hand that is off: no second go', /Run programs and scripts Hand is off/.test(cantReason(off, "I can't run it: the Run programs and scripts Hand is off.", [])));
check('a plain "I can\'t" with nothing refused still gets its second go', cantReason(off, "I can't look that up.", [{ role: 'tool', content: 'Found 3 files.' }]) === '');

{
  const first = { role: 'assistant', content: 'First, honest answer.' };
  const msgs = [{ role: 'user', content: 'do it' }, first];
  const ctx = {}; markCant(ctx, first, msgs);
  msgs.push({ role: 'system', content: CANT_NUDGE, hidden: true });
  const second = { role: 'assistant', content: 'Same again, and this last step forbids another tool call.' }; msgs.push(second);
  check('nothing new ran: the first answer stays, once', settleCant(ctx, second, msgs) === 'kept' && msgs.filter((m) => m.role === 'assistant').length === 1 && msgs.at(-1).content === 'First, honest answer.' && !ctx.cantAt);
}
{
  const first = { role: 'assistant', content: "I can't do that." };
  const msgs = [{ role: 'user', content: 'do it' }, first];
  const ctx = {}; markCant(ctx, first, msgs);
  msgs.push({ role: 'assistant', tool_calls: [{}] }, { role: 'tool', content: 'Done.' });
  const second = { role: 'assistant', content: 'Done: it is saved.' }; msgs.push(second);
  check('a tool ran: the new answer replaces the first', settleCant(ctx, second, msgs) === 'replaced' && !msgs.includes(first) && msgs.at(-1) === second);
}
check('with no nudge before, nothing changes', settleCant({}, { content: 'x' }, []) === '');
check('the nudge asks for the whole answer, which replaces the last one', /replaces your last one/.test(CANT_NUDGE) && !/don't repeat yourself/.test(CANT_NUDGE));
const run = read('src/brain-run-on.js');
check('wired into the job loop', /settleCant\(ctx, reply, msgs\)/.test(run) && /cantReason\(this\.cfg, reply\.content, msgs\.slice\(turnStart\)\)/.test(run) && (run.match(/markCant\(ctx, reply, msgs\)/g) || []).length === 2);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

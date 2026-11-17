// 16 Nov: every engine shares ONE exit/SIGINT/SIGTERM hook. A Lab run that made an engine per job used to add three listeners each
// (Node warned "201 exit listeners" after 96 jobs).
import { EventEmitter } from 'node:events';
import { stopOnExit } from '../src/exit-hook.js';
let pass = 0, fail = 0;
const check = (name, ok, more = '') => { if (ok) { pass++; console.log(`ok   ${name}`); } else { fail++; console.log(`FAIL ${name} ${more}`); } };

const proc = new EventEmitter(); let exited = null; proc.exit = (c) => { exited = c; };
const killed = [];
const engine = (n) => ({ child: { kill: () => killed.push(n) } });
const a = engine('a'); const stopAll = stopOnExit(a, proc);
check('a fake process gets one exit listener', proc.listenerCount('exit') === 1 && proc.listenerCount('SIGINT') === 1 && proc.listenerCount('SIGTERM') === 1);
stopAll(); check('stopping kills the engine', killed.join() === 'a');

// the real process: 300 engines add only one set of listeners
const before = process.listenerCount('exit'), beforeInt = process.listenerCount('SIGINT');
const many = Array.from({ length: 300 }, (_, i) => ({ child: null, i }));
for (const e of many) stopOnExit(e);
check('300 engines add one exit listener, not 300', process.listenerCount('exit') - before <= 1, `${process.listenerCount('exit') - before}`);
check('and one SIGINT listener', process.listenerCount('SIGINT') - beforeInt <= 1);
proc.emit('SIGTERM'); check('a stop signal stops the engines and exits', exited === 0);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

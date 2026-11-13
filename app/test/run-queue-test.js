// Tests Bob's task list: drag-to-reorder, Queued -> In progress -> Delegated -> Completed, clearing.
import { Brain } from '../src/brain.js';
// "Room in RAM" is this test's starting point (the RAM check itself has its own tests with set values), so a small
// CI machine (GitHub's Mac runners have 7 GB) doesn't change what is being tested.
process.env.BOB_FREE_MEM_GB = '24';

let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra ? ' ' + extra : ''}`); };

const P = Brain.prototype;
let saved = 0;
const job = (id, state, extra = {}) => ({ id, text: `job ${id}`, state, at: Date.now(), sessionId: 's', kind: 'chat', ...extra });
const fake = { queue: [job('run', 'working'), job('a', 'waiting'), job('b', 'waiting'), job('c', 'waiting'), job('old', 'done', { doneAt: Date.now() })], saveQueue() { saved++; }, log() {} };
const order = () => fake.queue.filter((j) => j.state === 'waiting').map((j) => j.id).join(',');

check('drag c in front of a', P.moveJob.call(fake, 'c', 'a') && order() === 'c,a,b', order());
check('drag c to the end of the line', P.moveJob.call(fake, 'c', null) && order() === 'a,b,c', order());
check('the running job can\'t be moved', !P.moveJob.call(fake, 'run', 'a') && fake.queue[0].id === 'run');
check('a waiting job can\'t be dropped in front of a finished one', P.moveJob.call(fake, 'a', 'old') && order() === 'b,c,a', order());
check('moving saves the list', saved >= 3);

const view = (q) => P.queueView.call({ queue: q });
const delegated = job('d', 'working', { steps: [{ hat: 'tinker', label: 'Coding', copy: 'Segfault', state: 'in progress', at: 1 }] });
const v = view([job('w', 'waiting'), job('r', 'working', { steps: [] }), delegated, job('x', 'done', { doneAt: 5 })]);
check('statuses read Queued, In progress, Delegated, Completed', v.map((j) => j.status).join(',') === 'queued,in progress,delegated,completed', v.map((j) => j.status).join(','));
check('a delegated task names the copy doing it', v[2].delegatedTo?.copy === 'Segfault' && v[2].delegatedTo.label === 'Coding');
check('a completed task carries when it finished', v[3].doneAt === 5 && v[3].delegatedTo === null);
{ // 1.5.196 (Tailscale test): a job sent whole to another Bob still says so once it's finished
  const sv = view([job('s', 'done', { doneAt: 7, sentTo: 'Go' }), job('f', 'failed', { sentTo: 'Go' }), job('again', 'waiting', { sentTo: 'Go' })]);
  check('a finished job sent to another Bob names that Bob', sv[0].status === 'completed' && sv[0].delegatedTo?.copy === 'Go' && sv[0].delegatedTo.sent === true);
  check('a failed one does too', sv[1].delegatedTo?.copy === 'Go');
  check('a job waiting again does not', sv[2].delegatedTo === null);
}
{ const { borrowedLine } = await import('../src/brain.js');
  const l = borrowedLine('Go', 1040);
  check('a borrowed reply leaves a logbook line: who and how long, no words', l.includes('Go thought this reply') && l.includes('1.0 s to first word'), l); }

const f2 = { queue: [job('w', 'waiting'), job('x', 'done'), job('y', 'cancelled'), job('z', 'failed')], saveQueue() {}, waitOver() {} };
P.clearCompleted.call(f2);
check('"Clear completed" keeps waiting and failed tasks', f2.queue.map((j) => j.id).join(',') === 'w,z');
check('Remove takes any task off the list: a failed one, and a waiting one', P.removeJob.call(f2, 'z') && P.removeJob.call(f2, 'w') && f2.queue.length === 0 && !P.removeJob.call(f2, 'nope'));

// Nov 12: Remove, Pause and Resume on any task.
{
  const stopped = [];
  const { mkdtempSync } = await import('node:fs'); const os = await import('node:os'); const path = await import('node:path');
  const dataDir = mkdtempSync(path.join(os.tmpdir(), 'bob-queue-'));
  const mk = (q, more = {}) => Object.assign(Object.create(P), { queue: q, cfg: { dataDir }, waitOver() {}, broadcast() {}, pump() {}, stop(id) { stopped.push(id); return true; } }, more);
  const r = mk([job('run', 'working'), job('w', 'waiting'), job('w2', 'waiting')]);
  check('Remove on a running task stops it and hides it at once', P.removeJob.call(r, 'run') && stopped.join() === 'run' && !P.queueView.call(r).some((j) => j.id === 'run'));
  r.queue[0].state = 'cancelled'; P.saveQueue.call(r);
  check('...and it leaves the list once the turn has stopped', !r.queue.some((j) => j.id === 'run'));
  check('Pause holds a waiting task in its place', P.pauseJob.call(r, 'w') && r.queue[0].state === 'paused' && r.queue[0].pausedFrom === 'waiting');
  const started = [];
  const g = mk(r.queue, { turns: new Map(), cfg: { dataDir, session: 'normal' }, startTurn(s, t, a, j) { started.push(j.id); this.turns.set('talk', {}); } });
  P.pump.call(g);
  check('a paused task is skipped; the next one starts', started.join() === 'w2', started.join());
  r.queue[1].state = 'done';
  check('Resume puts it back in line where it was, with no carry-on', P.resumeJob.call(r, 'w') && r.queue[0].state === 'waiting' && r.queue[0].id === 'w' && !r.queue[0].pickUp);
  check('Resume only works on a paused task', !P.resumeJob.call(r, 'w'));
  const run = job('p', 'working', { steps: [] }); r.queue.push(run);
  check('Pause on a running task stops its turn and marks it', P.pauseJob.call(r, 'p') && stopped.includes('p') && run.pausing === true);
  const said = [];
  P.pauseHere.call(r, run, (ev) => said.push(ev.text));
  check('the stopped turn becomes Paused, says so in its chat', run.state === 'paused' && run.pausedFrom === 'working' && !run.pausing && /Paused\./.test(said.join()));
  const keep = mk([job('oldp', 'paused', { at: 1, doneAt: 1 })]); keep.saveQueue();
  check('a paused task is never tidied away as old', keep.queue.length === 1);
  check('Tasks shows when it was paused and how', P.queueView.call(r).find((j) => j.id === 'p')?.pausedFrom === 'working');
  check('a task sent to another Bob can\'t be paused', !P.pauseJob.call({ queue: [job('a', 'working', { away: { name: 'Go' } })] }, 'a'));
}

// Retry goes to the back of the line.
const f3 = { queue: [job('f', 'failed'), job('w1', 'waiting')], saveQueue() {}, pump() {} };
P.retryJob.call(f3, 'f');
check('"Try again" puts a task at the back of the line', f3.queue.map((j) => j.id).join(',') === 'w1,f' && f3.queue[1].state === 'waiting');

// 1.5.23: Gaming keeps the graphics card free. Jobs that need it wait (never dropped) and start when the session changes.
{
  const started = [];
  const g = { waitOver() {}, cfg: { session: 'light' }, turns: new Map(), queue: [job('pic', 'waiting', { kind: 'picture' }), job('med', 'waiting', { effort: 'medium' }), job('hi', 'waiting')], saveQueue() {}, startTurn(s, t, r, j) { started.push(j.id); this.turns.set('talk', {}); } };
  P.pump.call(g);
  check('Gaming: a Low chat starts past the picture and Medium jobs waiting for the card', started.join() === 'hi' && g.queue[0].state === 'waiting' && g.queue[1].state === 'waiting', started.join());
  const gv = P.queueView.call(g);
  check('Gaming: Tasks shows "Waiting · Gaming is on" and how to run it', gv[0].gaming?.tag === 'Waiting · Gaming is on' && /Switch the session to Normal/.test(gv[0].gaming.hint) && gv[0].status === 'queued' && !gv[2].gaming);
  g.cfg.session = 'normal'; g.turns.clear(); started.length = 0;
  P.pump.call(g);
  check('back to Normal: the waiting picture job starts', started.join() === 'pic', started.join());
}
// 1.5.41: Chat while busy. A chat waiting behind a picture that's painting starts in the side lane.
{
  const started = [];
  const g = { waitOver() {}, cfg: { session: 'normal', engine: 'llamacpp', chatWhileBusy: true, models: { small: 's' } }, engine: { resolve: () => ({ gguf: '/x' }) }, state: { state: 'painting' }, turns: new Map([['talk', {}]]),
    queue: [job('pic', 'working', { kind: 'picture' }), job('hi', 'waiting'), job('hi2', 'waiting')], saveQueue() {}, startTurn(s, t, r, j, lane) { started.push(`${j.id}@${lane}`); this.turns.set(lane, {}); } };
  P.pump.call(g);
  check('busy switch on: a chat behind a painting picture starts beside it (one at a time)', started.join() === 'hi@side' && g.queue[1].side === true && g.queue[2].state === 'waiting', started.join());
  g.turns = new Map([['talk', {}]]); g.queue[1].state = 'done'; g.state = { state: 'thinking' }; started.length = 0;
  P.pump.call(g);
  check('once the picture step is over, the next chat waits for the job again', started.length === 0);
  g.cfg.chatWhileBusy = false; g.state = { state: 'painting' };
  P.pump.call(g);
  check('switch off: nothing starts beside', started.length === 0);
}
{
  const { Gate } = await import('../src/handoff.js').catch(() => ({}));
  if (Gate) {
    const gate = Object.create(Gate.prototype); gate.brain = { cfg: { session: 'light' } };
    let err = null; try { await gate.need({ id: 'painter', kind: 'image' }, {}); } catch (e) { err = e; }
    check('Gaming: the picture engine never starts (a plain reason for Bob)', err?.code === 'gaming' && /switch the session to Normal/.test(err.message));
    let seen = null; gate.needBrain = async (dep) => { seen = dep; return 'x'; };
    await gate.need({ id: 'brain', model: 'big', opts: { cpu: false } }, {});
    check('Gaming: a brain asked for on the card runs on the processor instead', seen?.opts?.cpu === true);
  } else check('handoff exports the gate', false);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

// Share jobs with my other Bobs (src/share-jobs.js) and the smarter pick (src/share-brains.js, 1.5.72): what a job
// needs, when it leaves, who gets it, and a real round trip over HTTP: a picture job sent to another Bob, his OK card
// answered here, the file copied back, the chat kept here.
import { serverText, brainText } from './source-text.js';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { Lenders, guestRefusal, helloFor, cleanAbilities } from '../src/share-brains.js';
import { jobNeed, awayPlan, GuestJobs, guestRoute, sendAway, answerAway, guestTools, guestNote, stopAway } from '../src/share-jobs.js';

let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { if (ok) { pass++; console.log(`PASS ${name}`); } else { fail++; console.log(`FAIL ${name}${extra ? `: ${extra}` : ''}`); } };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------- what a job needs ----------
check('picture, clip, song, sound, research, Medium thinking', jobNeed({ kind: 'picture', text: 'draw a fox' }) === 'pictures' && jobNeed({ kind: 'video', text: 'a clip of rain' }) === 'video'
  && jobNeed({ kind: 'chat', text: 'make a chiptune song' }) === 'music' && jobNeed({ kind: 'chat', text: 'a sound effect of a door' }) === 'sfx'
  && jobNeed({ kind: 'research', text: 'research the best SSD' }) === 'web' && jobNeed({ kind: 'chat', effort: 'medium', text: 'plan my week of meals' }) === 'think');
check('quick chats are not jobs to send', jobNeed({ kind: 'chat', effort: 'low', text: 'hi' }) === null);
check('anything that needs this computer stays', jobNeed({ kind: 'picture', text: 'draw a fox and save it in my Downloads folder' }) === null && jobNeed({ kind: 'chat', effort: 'high', text: 'tidy my desktop' }) === null && jobNeed({ kind: 'code', effort: 'medium', text: 'fix the bug in C:\\game\\main.cpp' }) === null);
check('attached pictures stay', jobNeed({ kind: 'picture', text: 'make him blue', refs: ['abcd1234'] }) === null);
check('a job from another Bob is never sent on', jobNeed({ kind: 'picture', text: 'draw a fox', guest: { from: 'PC' } }) === null);

// ---------- when a job leaves ----------
const B = (borrow, extra = {}) => ({ cfg: { share: { borrow: { jobs: true, when: 'gaming', bobs: [{ address: '100.88.0.9:7777' }], ...borrow } } }, guestBigBrain: () => true, ...extra });
const none = { pictures: false }, all = { pictures: true, video: true, music: true, sfx: true };
check('off means off', awayPlan(B({ jobs: false }), { kind: 'picture', text: 'draw a fox' }, { can: none }) === null);
check("Bob can't do it here: it goes", awayPlan(B({}), { kind: 'picture', text: 'draw a fox' }, { can: none })?.why === 'cant');
check('it would wait for Gaming: it goes', awayPlan(B({}), { kind: 'picture', text: 'draw a fox' }, { can: all, waitsForGaming: true })?.why === 'gaming');
check('busy here: only when Borrow when says so', awayPlan(B({}), { kind: 'picture', text: 'a fox' }, { can: all, laneBusy: true }) === null && awayPlan(B({ when: 'busy' }), { kind: 'picture', text: 'a fox' }, { can: all, laneBusy: true })?.why === 'busy');
check('he can do it and nothing waits: it stays', awayPlan(B({}), { kind: 'picture', text: 'draw a fox' }, { can: all }) === null);
check('no web search here: research goes', awayPlan(B({}), { kind: 'research', text: 'research SSDs' }, { can: all, webOn: false })?.why === 'cant');
check('asked lately and nobody could: not again for a minute', awayPlan(B({}), { kind: 'picture', text: 'a fox', awayAfter: Date.now() + 5000 }, { can: none }) === null);

// ---------- the Bob doing the work ----------
const tools = [{ function: { name: 'make_image' } }, { function: { name: 'move_files' } }, { function: { name: 'read_file' } }, { function: { name: 'web_search' } }, { function: { name: 'remember' } }];
check('a job from another Bob only gets the safe tools', guestTools({ guest: { from: 'PC' } }, tools).map((t) => t.function.name).join() === 'make_image,web_search' && guestTools({}, tools).length === 5);
check('and is told so', /can't touch files, folders, programs/.test(guestNote({ guest: { from: 'PC' } }, 'Sam')) && guestNote({}, 'Sam') === '');
const door = { remote: { enabled: true, passcode: '12345678' } };
const gb = (cfg, extra = {}) => ({ cfg: { ...door, ...cfg }, queue: [], lendDeps: { currentSession: (c) => ({ id: c.session || 'normal' }) }, ...extra });
check('takes jobs only when switched on', guestRefusal(gb({ share: {} })) === 'off' && guestRefusal(gb({ share: { takeJobs: true } })) === '');
check('never while gaming, never with a full queue', guestRefusal(gb({ share: { takeJobs: true }, session: 'light' })) === 'gaming' && guestRefusal(gb({ share: { takeJobs: true } }, { queue: [{ guest: {}, state: 'working' }, { guest: {}, state: 'waiting' }] })) === 'busy');
const hello = helloFor(gb({ share: { takeJobs: true }, webSearch: false }), { why: 'off', quick: null, can: { pictures: true, video: false, music: true, sfx: false }, version: 'x', label: (m) => m, webOn: false, bigBrain: true });
check('hello lists only what he really has (and, from 1.5.211, that he takes group jobs; from 1.5.217, chats)', hello.takesJobs === true && hello.jobs.join() === 'room,chat,pictures,music,think');
check('no switch, no jobs listed', helloFor(gb({ share: {} }), { why: 'off', quick: null, can: { pictures: true }, version: 'x', label: (m) => m, webOn: true, bigBrain: true }).jobs.length === 0);
check('abilities are cleaned', cleanAbilities({ ctx: 'x', jobs: ['pictures', 'rm -rf'], takesJobs: true }).jobs.join() === 'pictures' && cleanAbilities({ ctx: 'x' }).ctx === 0);

// ---------- the smarter pick for quick replies ----------
const mk = (states) => { const L = new Lenders({ share: { borrow: { on: true, bobs: states.map((s, i) => ({ name: s.name, address: `100.88.0.${i + 1}:7777`, passcode: 'x'.repeat(8) })) } } }); states.forEach((s, i) => L.state.set(`100.88.0.${i + 1}:7777`, { at: Date.now(), ...s })); return L; };
let L = mk([{ name: 'Phone', ok: true, ctx: 12288, speed: 11 }, { name: 'Laptop', ok: true, ctx: 32768, speed: 30 }]);
check('a chat too long for the phone goes to the laptop', (await L.pick({ tokens: 20000 }))?.name === 'Laptop');
L = mk([{ name: 'Phone', ok: true, ctx: 12288, speed: 11 }, { name: 'Laptop', ok: true, ctx: 32768, speed: 30 }]);
check('the faster one first when both fit', (await L.pick({ tokens: 2000 }))?.name === 'Laptop');
L = mk([{ name: 'Phone', ok: true, ctx: 12288, speed: 11, measured: { lastUsed: Date.now() - 60000 } }, { name: 'Laptop', ok: true, ctx: 32768, speed: 30 }]);
check('the one that still has the chat in mind first', (await L.pick({ tokens: 2000 }))?.name === 'Phone');
L = mk([{ name: 'Phone', ok: true, ctx: 12288 }, { name: 'Laptop', ok: true, ctx: 12288 }]);
check('your order breaks ties', (await L.pick({ tokens: 100 }))?.name === 'Phone');
const second = await L.pick({ tokens: 100 });
check('two replies at once go to two Bobs', second?.name === 'Laptop');
L = mk([{ name: 'Phone', ok: true, ctx: 8192 }]);
check('nobody with room: none (Bob thinks it himself)', (await L.pick({ tokens: 9000 })) === null && L.tooBigFor(9000).join() === 'Phone');
L = mk([{ name: 'PC', ok: false, takesJobs: true, jobs: ['pictures'], queue: 3 }, { name: 'Laptop', ok: false, takesJobs: true, jobs: ['pictures', 'music'], queue: 0 }, { name: 'Phone', ok: true, takesJobs: false, jobs: [] }]);
check('jobs go to the least busy Bob who can', (await L.pickForJob('pictures'))?.name === 'Laptop' && (await L.pickForJob('video')) === null);
check('anyCould knows who can at all', L.anyCould('music') && !L.anyCould('video'));
L.noteJobs(L.bobs()[1], 'busy');
check('a Bob who said no is skipped for a minute', (await L.pickForJob('pictures'))?.name === 'PC');

// ---------- a real round trip: the PC sends a picture job to the laptop ----------
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bob-jobs-'));
const lenderDir = path.join(tmp, 'laptop'), pcDir = path.join(tmp, 'pc');
fs.mkdirSync(lenderDir); fs.mkdirSync(pcDir);
fs.writeFileSync(path.join(lenderDir, 'fox.png'), 'PNGDATA');
fs.writeFileSync(path.join(lenderDir, 'secret.txt'), 'not yours');
const approvals = new Map();
const laptop = {
  cfg: { ...door, share: { takeJobs: true } }, queue: [], sessions: new Map(), lendDeps: { currentSession: () => ({ id: 'normal' }) }, logs: [],
  log(k, t) { this.logs.push(`${k}: ${t}`); },
  answerApproval(id, allow) { const f = approvals.get(id); if (!f) return false; approvals.delete(id); f(allow); return true; },
  cancelJob(id) { const j = this.queue.find((x) => x.id === id); if (j) j.state = 'cancelled'; return Boolean(j); },
  enqueue(sessionId, text, attach, effort, extra) {
    const id = `00000000-0000-4000-8000-00000000000${this.queue.length + 1}`;
    const job = { id, sessionId, text, state: 'working', ...extra };
    this.queue.push(job);
    const b = (ev) => this.guests.watch({ ...ev, turnId: id, sessionId });
    (async () => {
      await wait(30);
      b({ type: 'start', text });
      b({ type: 'token', text: 'Painting a fox ' });
      const ok = await new Promise((r) => { approvals.set('card-1', r); b({ type: 'approval', id: 'card-1', text: 'Use the big picture model?' }); });
      b({ type: 'approval-result', id: 'card-1', allowed: ok });
      b({ type: 'image', url: '/images/fox.png', file: path.join(lenderDir, 'fox.png') });
      b({ type: 'token', text: 'done.' });
      job.state = 'done';
      b({ type: 'done' });
    })();
    return { jobId: id };
  }
};
let laptopCan = { pictures: true };
laptop.guests = new GuestJobs(laptop, { canNow: () => Object.keys(laptopCan).filter((k) => laptopCan[k]) });
const COOKIE = 'bob_auth=feedbeef';
const send = (res, code, obj) => { res.writeHead(code, { 'content-type': 'application/json' }); res.end(JSON.stringify(obj)); };
const readBody = async (req) => { let s = ''; for await (const c of req) s += c; return s ? JSON.parse(s) : {}; };
const srv = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x'), p = url.pathname;
  if (req.method === 'POST' && p === '/login') { const s = new URLSearchParams(await new Promise((r) => { let d = ''; req.on('data', (c) => (d += c)); req.on('end', () => r(d)); })); if (s.get('code') === 'laptop-123') { res.writeHead(303, { 'set-cookie': `${COOKIE}; HttpOnly` }); return res.end(); } res.writeHead(401); return res.end(); }
  if (req.headers.cookie !== COOKIE) { res.writeHead(401); return res.end(); }
  if (p === '/api/lend/hello') return send(res, 200, helloFor(laptop, { why: 'off', quick: null, can: laptopCan, version: 'x', label: (m) => m, webOn: false, bigBrain: false }));
  if (req.method === 'POST' && req.headers['x-bob'] !== '1') { res.writeHead(403); return res.end(); }
  const r = await guestRoute({ req, res, p, url, brain: laptop, body: readBody, send, cfg: { painterDir: lenderDir }, findOutput: (c, n) => path.join(lenderDir, path.basename(n)), serveFile: (rs, dir, name) => { rs.writeHead(200); rs.end(fs.readFileSync(path.join(dir, name))); } });
  if (r === false) { res.writeHead(404); res.end(); }
});
await new Promise((r) => srv.listen(0, '127.0.0.1', r));
const port = srv.address().port;
const viaLocal = (u, o) => fetch(String(u).replace(/^http:\/\/100\.88\.0\.9:\d+/, `http://127.0.0.1:${port}`), o);

const events = [];
const pc = {
  cfg: { windowsName: 'PC', painterDir: pcDir, share: { borrow: { jobs: true, when: 'gaming', bobs: [{ name: 'Laptop', address: '100.88.0.9:7777', passcode: 'laptop-123' }] } } },
  awayJobs: new Map(), awayApprovals: new Map(), sessions: new Map(), saved: 0, pumped: 0, logs: [],
  broadcast(ev) { events.push(ev); if (ev.type === 'approval') setTimeout(() => answerAway(this, ev.id, true), 20); },
  session(id) { if (!this.sessions.has(id)) this.sessions.set(id, [{ role: 'user', content: 'I love foxes' }, { role: 'assistant', content: 'Me too.' }]); return this.sessions.get(id); },
  saveSession() { this.saved++; }, saveQueue() {}, pump() { this.pumped++; }, log(k, t) { this.logs.push(`${k}: ${t}`); },
  made: { added: [], add(f) { this.added.push(f); } }
};
pc.lenders = new Lenders(pc.cfg, { fetchFn: viaLocal });
const job = { id: 'job-1', sessionId: 'main', text: 'draw a fox in the snow', kind: 'picture', effort: 'low', state: 'waiting', at: Date.now() };
const went = await sendAway(pc, job, { need: 'pictures', why: 'gaming' });
check('the job went to the laptop and came back done', went === true && job.state === 'done', `${went} ${job.state} ${job.error || ''}`);
check('the chat here says who has it and why', events.some((e) => e.type === 'away' && e.action === 'start' && e.name === 'Laptop' && e.why === 'gaming'));
check('his words stream into this chat', events.filter((e) => e.type === 'token').map((e) => e.text).join('') === 'Painting a fox done.');
check('his OK card showed here and the answer went back', events.some((e) => e.type === 'approval' && e.id === 'card-1') && events.some((e) => e.type === 'approval-result' && e.allowed === true));
const img = events.find((e) => e.type === 'image');
check('the picture was copied into this Bob\'s folder', img && img.url === '/images/fox.png' && fs.readFileSync(path.join(pcDir, 'fox.png'), 'utf8') === 'PNGDATA' && pc.made.added.length === 1);
const chat = pc.session('main');
check('the chat keeps the question and the reply, with the picture', chat.at(-2).content === job.text && chat.at(-1).content === 'Painting a fox done.' && chat.at(-1).media?.[0]?.name === 'fox.png' && chat.at(-1).away === 'Laptop' && pc.saved === 1);
check('the laptop got the chat\'s last lines, and keeps no chat', laptop.queue[0].guest.from === 'PC' && laptop.sessions.size === 0);
check('nothing left hanging', pc.awayJobs.size === 0 && pc.awayApprovals.size === 0);
const id1 = laptop.queue[0].id;
const sneaky = await viaLocal(`http://100.88.0.9:7777/api/guest/jobs/${id1}/file?url=${encodeURIComponent('/images/secret.txt')}`, { headers: { cookie: COOKIE } });
check('only that job\'s own files can be fetched', sneaky.status === 404);
const card = await viaLocal(`http://100.88.0.9:7777/api/guest/jobs/${id1}/approve`, { method: 'POST', headers: { cookie: COOKIE, 'x-bob': '1', 'content-type': 'application/json' }, body: JSON.stringify({ id: 'someone-elses-card', allow: true }) });
check('and only that job\'s own cards can be answered', card.status === 404);

// He can't do clips: he says so, and the job stays here.
const job2 = { id: 'job-2', sessionId: 'main', text: 'a clip of rain', kind: 'video', state: 'waiting' };
pc.lenders.state.clear();
const went2 = await sendAway(pc, job2, { need: 'video', why: 'cant' });
check("a Bob who can't do clips isn't asked for one", went2 === false && job2.state === 'waiting' && !job2.away);
// He says yes on hello but no when it comes to it (gaming started meanwhile): stays here, he's skipped for a minute.
laptop.lendDeps.currentSession = () => ({ id: 'light' });
pc.lenders.state.clear();
await pc.lenders.hello(pc.lenders.bobs()[0]);
pc.lenders.state.get('100.88.0.9:7777').jobsBusy = ''; // pretend hello said yes a moment earlier
const job3 = { id: 'job-3', sessionId: 'main', text: 'draw a cat', kind: 'picture', state: 'waiting' };
const went3 = await sendAway(pc, job3, { need: 'pictures', why: 'gaming' });
check('a Bob who turns it down keeps it here, and is skipped for a while', went3 === false && job3.state === 'waiting' && (await pc.lenders.pickForJob('pictures')) === null);
laptop.lendDeps.currentSession = () => ({ id: 'normal' });

// Stopped here: the laptop is told to stop too.
pc.lenders.state.clear();
pc.lenders.inUse.clear();
const slowLaptop = laptop.enqueue;
laptop.enqueue = function (sid, text, a, e, extra) { const id = '00000000-0000-4000-8000-0000000000aa'; this.queue.push({ id, sessionId: sid, text, state: 'working', ...extra }); setTimeout(() => this.guests.watch({ type: 'start', turnId: id }), 20); return { jobId: id }; };
const job4 = { id: 'job-4', sessionId: 'main', text: 'draw a dog', kind: 'picture', state: 'waiting' };
const p4 = sendAway(pc, job4, { need: 'pictures', why: 'gaming' });
await wait(150);
check('Stop here stops it there', stopAway(pc, 'job-4') === true);
await p4;
await wait(50);
check('and it ends as stopped', job4.state === 'cancelled' && laptop.queue.find((j) => j.id.endsWith('aa')).state === 'cancelled');
laptop.enqueue = slowLaptop;

// ---------- 1.5.133 lost-song fixes ----------
// A song asked for on the handheld, made on the PC: three ways it went missing, and what the owner sees now.
laptopCan = { pictures: true, music: true };
const songRun = (script) => function (sid, text, a, e, extra) {
  const id = `00000000-0000-4000-8000-0000000000${String(this.queue.length).padStart(2, '0')}`;
  const q = { id, sessionId: sid, text, state: 'working', ...extra };
  this.queue.push(q);
  const b = (ev) => this.guests.watch({ ...ev, turnId: id, sessionId: sid });
  setTimeout(async () => { b({ type: 'start', text }); for (const ev of script) { await wait(5); if (ev.type === 'done') q.state = 'done'; b(ev); } }, 20);
  return { jobId: id };
};
const sendSong = async (script, id, extra = {}) => {
  pc.lenders.state.clear(); pc.lenders.inUse.clear(); events.length = 0;
  laptop.enqueue = songRun(script);
  const j = { id, sessionId: 'main', text: 'make a song about rain on the porch', kind: 'music', state: 'waiting' };
  const went = await sendAway(pc, j, { need: 'music', why: 'cant' }, { timers: { notStarted: 5000, quiet: 5000, fileTries: 3, ...extra } });
  return { went, j };
};
// 1. His music models weren't downloaded: the Download card can't be pressed from here.
const s1 = await sendSong([{ type: 'offer-download', why: 'music', name: 'ACE-Step', sizeGB: 7.5 }, { type: 'token', text: 'Here is your song!' }, { type: 'done' }], 'song-1');
const err1 = events.filter((e) => e.type === 'error').map((e) => e.text).join(' | ');
check('his missing music models are said here in plain words', /Laptop can't make this one yet: he needs the music models \(about 7\.5 GB\) set up first/.test(err1), err1);
check('and the job is failed, not done', s1.went === true && s1.j.state === 'failed' && /set up first/.test(s1.j.error || ''), `${s1.j.state} ${s1.j.error}`);
check('no Download button is passed along', !events.some((e) => e.type === 'offer-download'));
// 2. He said it was made, but no song came back.
const s2 = await sendSong([{ type: 'token', text: 'Your song is ready!' }, { type: 'done' }], 'song-2');
check('a song job with no song is failed, whatever he says', s2.j.state === 'failed' && events.some((e) => e.type === 'error' && /no song came back, so it wasn't made/.test(e.text)), `${s2.j.state}`);
// 3. The copy back hiccups twice, then works: the song still arrives.
fs.writeFileSync(path.join(lenderDir, 'rain.wav'), 'WAVDATA');
let fileAsks = 0;
const realCall = pc.lenders.call.bind(pc.lenders);
pc.lenders.call = async (b, u, o) => { if (/\/file\?/.test(u) && ++fileAsks <= 2) throw new Error('connection reset'); return realCall(b, u, o); };
const s3 = await sendSong([{ type: 'audio', url: '/images/rain.wav', file: path.join(lenderDir, 'rain.wav'), song: { title: 'Rain on the porch' } }, { type: 'done' }], 'song-3');
check('a file that hiccups is tried again and arrives', s3.j.state === 'done' && fileAsks === 3 && events.some((e) => e.type === 'audio') && fs.readdirSync(pcDir).some((f) => f.startsWith('rain')), `${s3.j.state} ${fileAsks}`);
// 4. It never comes across: the owner is told where it is, and the job isn't called done.
fileAsks = -100;
const s4 = await sendSong([{ type: 'audio', url: '/images/rain.wav', file: path.join(lenderDir, 'rain.wav'), song: { title: 'Rain on the porch' } }, { type: 'done' }], 'song-4');
check('a song that never comes across says where it is', s4.j.state === 'failed' && events.some((e) => e.type === 'error' && /made it \(Rain on the porch\), but the file didn't come across.*in Made by Bob there/.test(e.text)) && pc.logs.some((l) => /didn't come across/.test(l)), `${s4.j.state}`);
pc.lenders.call = realCall;
laptop.enqueue = slowLaptop;
laptopCan = { pictures: true };
// Wiring: the hello and the job pick only promise music when the music models are really there; the phone names the Bob
// that has a chart it couldn't get, and shows the chart's text when it can't draw it; the Chest follows a moved folder.
const src = (f) => fs.readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');
check('hello and the pick say music only with the models there', /jobCan\(\)\s*\{[^\n]*aceMissingFiles/.test(brainText()) && /can: this\.jobCan\(\)/.test(brainText()) && /can: brain\.jobCan\(\)/.test(serverText()));
check('the phone never says "your other replicant matrix" about a lost chart', !/It's on your other replicant matrix/.test(src('android/app/src/main/assets/www/phone.js')) && /Couldn't get this diagram from \$\{who\}/.test(src('android/app/src/main/assets/www/phone.js')) && /class: 'diagram-text', text/.test(src('android/app/src/main/assets/www/phone.js')));
check("the Chest lists what the door hands out, even in a moved folder", /x\.path\.startsWith\(inn\) \|\| servable\(x\)/.test(serverText()));

// A phone finds out a chat is too long only after it said 200: an SSE error with busy 'too long' counts like the 409.
const phone = http.createServer((req, res) => {
  if (req.url === '/login') { res.writeHead(303, { 'set-cookie': 'bob_auth=abc; HttpOnly' }); return res.end(); }
  res.writeHead(200, { 'content-type': 'text/event-stream' });
  res.end(`data: ${JSON.stringify({ type: 'reading', done: 0, of: 9000 })}\n\ndata: ${JSON.stringify({ type: 'error', error: 'too long', busy: 'too long', ctx: 8192 })}\n\n`);
});
await new Promise((r) => phone.listen(0, '127.0.0.1', r));
const pp = phone.address().port;
const PL = new Lenders({ share: { borrow: { on: true, bobs: [{ name: 'Phone', address: '100.88.0.7:7777', passcode: 'x'.repeat(8) }] } } }, { fetchFn: (u, o) => fetch(String(u).replace(/^http:\/\/100\.88\.0\.7:\d+/, `http://127.0.0.1:${pp}`), o) });
let e5 = null;
try { await PL.chat(PL.bobs()[0], { messages: [{ role: 'user', content: 'hi' }] }); } catch (e) { e5 = e; }
check("a phone's late \"too long\" moves on to the next Bob, and its room is remembered", e5?.busy === true && e5.why === 'too long' && PL.state.get('100.88.0.7:7777').ctx === 8192);
phone.close();

srv.close();
fs.rmSync(tmp, { recursive: true, force: true });
console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);

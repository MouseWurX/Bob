// Nov 18 2026 (the owner, after the first live RunPod try): a rented brain is a chat head on the left with its own
// saved chat; while it runs, a countdown to the session limit and a live cost projection; Keep warm between messages;
// Add a rented brain card by card from Bob's own list; removing one asks whether to keep its chat in memory or delete it.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Rentals, STAGES, stageFrom, cleanCaps, warmMs, IDLE_GRACE_MS, rentChatId, isRentChat, rentalOfChat, rentalsOf } from '../src/rental.js';
import { overlayView, cleanRentHead } from '../src/net-overlay.js';
import { live, headWords, barParts, clock, isRentChat as pageIsRentChat } from '../public/rent-head.js';
import { createSettingsParts } from '../public/cellar-pages.js';
import { HELP } from '../public/help-content.js';

let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra ? ' ' + extra : ''}`); };
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8').replace(/\r\n/g, '\n');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bob-rent-head-'));

const list = [
  { id: 'mach01', service: 'runpod', model: 'owner/repo/file.gguf', name: 'Big Qwen on RunPod', card: '48', perHour: 1.2 },
  { id: 'pay001', service: 'openrouter', model: 'qwen/qwen3.6-35b-a3b', name: 'Qwen on OpenRouter', inPerM: 0.2, outPerM: 0.6 },
  { id: 'vast01', service: 'vast', model: 'owner/repo', name: 'Off service', card: '24' }
];
const mkCfg = (caps = {}) => ({ dataDir: tmp, rentals: { enabled: { runpod: true, openrouter: true }, caps: { month: 20, job: 5, minutes: 60, ...caps }, list, current: '' } });

// ---- its own chat ----
{
  const cfg = mkCfg();
  check('each rental has its own chat id, and only real rental ids count', rentChatId('mach01') === 'rent-mach01' && isRentChat('rent-mach01') && !isRentChat('rent-NOPE!') && !isRentChat('main') && !isRentChat('guest-net-abcdefabcdef'));
  check('the page reads the same ids', pageIsRentChat('rent-mach01') && !pageIsRentChat('telegram'));
  check('a rental chat finds its rental; a removed one is an ordinary chat', rentalOfChat(cfg, 'rent-mach01')?.id === 'mach01' && rentalOfChat(cfg, 'rent-zzzzzz') === null && rentalOfChat(cfg, 'main') === null);
  const server = read('src/server.js');
  check('a message in a rental\'s chat is marked for that rental (no switch to remember)', /rentalOfChat\(cfg, String\(sessionId\)\)/.test(server) && /rentChat \? \{ rentId: rentChat\.id \}/.test(server));
  const runOn = read('src/brain-run-on.js');
  check('the job thinks on its own chat\'s rental, not the one in the slot', /this\.rentals\.forJob\?\.\(job\)/.test(runOn));
  check('the queue keeps which rental a job is for', /extra\.rentId \? \{ rentId: extra\.rentId \}/.test(read('src/brain-queue.js')));
  const r = new Rentals(cfg, { env: { RUNPOD_API_KEY: 'x', OPENROUTER_API_KEY: 'y' }, now: () => 1e12 });
  check('forJob: its own rental first, then the slot', r.forJob({ rentId: 'pay001' })?.id === 'pay001' && r.forJob({}) === null);
  check('not guest mode: guest ids are guest-, a rental chat is not', !/^guest-/.test(rentChatId('mach01')));
}

// ---- Keep warm ----
{
  check('Keep warm starts at 0 and is clamped to 0..60 minutes', cleanCaps({}).warm === 0 && cleanCaps({ warm: 999 }).warm === 60 && cleanCaps({ warm: -3 }).warm === 0 && cleanCaps({ warm: 7.4 }).warm === 7);
  check('0 means the old 30 seconds', warmMs({ warm: 0 }) === IDLE_GRACE_MS && warmMs({ warm: 10 }) === 600000);
  let t = 1e12;
  const stopped = [];
  const cfg = mkCfg({ warm: 10, minutes: 60 });
  const r = new Rentals(cfg, { env: { RUNPOD_API_KEY: 'x' }, now: () => t });
  r.machines.stop = async () => { stopped.push('stop'); };
  const run = { id: 'pod1', url: 'https://x', kind: 'machine', startedAt: t, jobs: new Set(['j1']), usd: 0, perHour: 1.2, rental: 'mach01' };
  r.running.set('mach01', run);
  check('while a job uses it there is no keep-warm clock', r.warmUntil(run) === 0 && r.status(list[0]).state === 'working');
  t += 5 * 60000; r.turnDone({ id: 'j1' });
  check('after the job it waits Keep warm minutes', r.warmUntil(run) === t + 10 * 60000 && r.status(list[0]).state === 'warm');
  await r.watch();
  check('a look during Keep warm leaves it running', r.running.has('mach01') && stopped.length === 0);
  t += 9 * 60000; await r.watch();
  check('still running a minute before Keep warm ends', r.running.has('mach01'));
  t += 2 * 60000; await r.watch();
  check('stopped once Keep warm runs out with no message', !r.running.has('mach01') && stopped.length === 1);
  clearTimeout(r.timer);
  // Never past Max rental time
  const cfg2 = mkCfg({ warm: 30, minutes: 20 });
  const r2 = new Rentals(cfg2, { env: { RUNPOD_API_KEY: 'x' }, now: () => t });
  const run2 = { id: 'pod2', url: 'https://x', kind: 'machine', startedAt: t - 15 * 60000, jobs: new Set(), usd: 0, perHour: 1.2, rental: 'mach01', idleSince: t };
  r2.running.set('mach01', run2);
  check('Keep warm never goes past Max rental time', r2.warmUntil(run2) === run2.startedAt + 20 * 60000);
  clearTimeout(r2.timer);
}

// ---- the countdown and the cost projection ----
{
  const t = 1e12;
  const cfg = mkCfg({ warm: 5, minutes: 60 });
  const r = new Rentals(cfg, { env: { RUNPOD_API_KEY: 'x', OPENROUTER_API_KEY: 'y' }, now: () => t });
  check('nothing hired: off, with its price', r.status(list[0]).state === 'off' && r.status(list[0]).perHour === 1.2 && r.status(list[0]).usd === 0);
  r.running.set('mach01', { id: 'pod1', url: 'u', kind: 'machine', startedAt: t - 30 * 60000, jobs: new Set(['j']), usd: 0, perHour: 1.2, rental: 'mach01' });
  const st = r.status(list[0]);
  check('it counts down to Max rental time', st.endsAt === t + 30 * 60000 && st.startedAt === t - 30 * 60000);
  check('cost so far: half an hour at $1.20', Math.abs(st.usd - 0.6) < 1e-6);
  check('cost if it runs to the limit: the whole hour', st.atLimitUsd === 1.2);
  check('pay per answer has no clock, just what it cost', r.status(list[1]).state === 'answer' && r.status(list[1]).endsAt === undefined);
  const heads = r.heads();
  check('one chat head per rental whose service is on; an off service has none', heads.map((h) => h.id).join() === 'mach01,pay001');
  check('removing a rental takes its head away', (() => { cfg.rentals.list = list.filter((x) => x.id !== 'pay001'); const ids = r.heads().map((h) => h.id).join(); cfg.rentals.list = list; return ids === 'mach01'; })());
  const v = await overlayView({ netOverlay: false }, { rents: heads });
  check('the heads show with Bob-Net icons off too, each opening its own chat', v.rents.length === 2 && v.rents[0].chat === 'rent-mach01' && v.on === false);
  check('a head with a bad id is dropped; only known states pass', cleanRentHead({ id: 'BAD!' }) === null && cleanRentHead({ id: 'abc123', state: 'hacked' }).state === 'off');
  check('no keys in a head', !JSON.stringify(heads).includes('RUNPOD_API_KEY') && !JSON.stringify(heads).includes('"x"'));
  // The page's side: it keeps ticking between looks
  const h = cleanRentHead(heads[0]);
  const l = live(h, t + 60000, 0);
  check('the page keeps counting down by itself', l.left === 29 * 60000 && clock(l.left) === '29:00');
  check('and the money keeps going up', Math.abs(l.soFar - (0.6 + 0.02)) < 1e-6 && Math.abs(l.atLimit - 1.2) < 1e-6);
  check('the ring is the part of the session limit left', Math.abs(l.frac - 29 / 60) < 1e-9);
  const p = barParts(h, l);
  check('the bar shows time left, so far and the limit cost', p.facts.some(([k, val]) => k === 'Time left' && val === '29:00 of 60 min') && p.facts.some(([k, val]) => k === 'So far' && val === '$0.62') && p.facts.some(([k, val]) => k === 'If it runs to the limit' && val === 'about $1.20') && p.canStop);
  check('the head says it in a few words', /Working · 29:00 left · \$0\.62 so far/.test(headWords(h, l)));
  const warmH = { ...h, state: 'warm', warmUntil: t + 4 * 60000 };
  const wp = barParts(warmH, live(warmH, t, 0));
  check('kept warm: when it stops and what it will have cost', wp.facts.some(([k, val]) => k === 'Stops if you send nothing' && /^in 4:00 \(about \$0\.68 in all\)$/.test(val)));
  check('a removed rental\'s chat says so', /gone/.test(barParts(null).line));
}

// ---- start-up steps (Nov 18: "you don't know what's happening with the rental") ----
{
  check('Vast.ai: no machine yet, pulling with a percentage, then loading the brain', stageFrom('vast', { actual_status: 'scheduling' }).step === 'waiting' && stageFrom('vast', { actual_status: 'loading', status_msg: 'Pulling image: 45% complete' }).pct === 45 && stageFrom('vast', { actual_status: 'loading', status_msg: 'Pulling image: 45%' }).step === 'pulling' && stageFrom('vast', { actual_status: 'running' }).step === 'loading');
  check('RunPod: not running yet is waiting, running with no uptime is getting the program', stageFrom('runpod', { desiredStatus: 'CREATED' }).step === 'waiting' && stageFrom('runpod', { desiredStatus: 'RUNNING' }).step === 'pulling' && stageFrom('runpod', { desiredStatus: 'RUNNING', runtime: { uptimeInSeconds: 30 } }).step === 'loading');
  check('a service that says nothing gives no step (Bob then goes by what he can see)', stageFrom('runpod', {}).step === '' && stageFrom('lambda-machine', { status: 'booting' }).step === 'waiting');
  let t = 1e12;
  const events = [];
  const cfg = mkCfg({ minutes: 60 });
  const r = new Rentals(cfg, { env: { RUNPOD_API_KEY: 'x' }, now: () => t, broadcast: (e) => events.push(e) });
  let probes = 0;
  const steps = [{ desiredStatus: 'CREATED' }, { desiredStatus: 'RUNNING' }, { desiredStatus: 'RUNNING', runtime: { uptimeInSeconds: 5 } }];
  r.machines.start = async () => { t += 20000; return { id: 'pod9', url: 'https://pod9-8000.proxy.runpod.net/v1', kind: 'machine', startedAt: t, perHour: 1.2 }; };
  r.machines.api = async (url) => { if (/\/pods\/pod9$/.test(url)) return steps[Math.min(probes++, steps.length - 1)]; return {}; };
  r.machines.fetch = async () => { if (probes > 3) return { ok: true, json: async () => ({}) }; if (probes > 2) return { ok: false, status: 503 }; throw new Error('no answer'); };
  const sleep = global.setTimeout;
  global.setTimeout = (fn) => { t += 60000; return sleep(fn, 0); };
  const run = await r.ensureRunning(list[0], { key: 'x', emit: () => {}, job: { id: 'j1' } }).finally(() => { global.setTimeout = sleep; });
  clearTimeout(r.timer);
  const seen = run.stages.map((x) => x.step).join();
  check('every step is kept in order: asked, waiting, program, brain, ready', seen === 'asking,waiting,pulling,loading,ready', seen);
  check('each step has its time and what had been spent by then', run.stages.every((x) => Number.isFinite(x.at) && Number.isFinite(x.usd)) && run.stages.at(-1).usd > 0 && run.stages[0].usd === 0);
  check('each step goes to the page as it happens', events.filter((e) => e.action === 'stage').map((e) => e.step).join() === seen && events.every((e) => !JSON.stringify(e).includes('"x"')));
  const st = r.status(list[0]);
  check('the head carries the steps', st.stages.length === 5 && st.stages[4].label === STAGES.ready);
  await r.stopRun(list[0], run, 'you pressed Stop the machine now');
  const after = r.status(list[0]);
  check('after a stop, its chat still says what happened and why', after.state === 'off' && after.stages.at(-1).step === 'stopped' && /Stop the machine now/.test(after.stopWhy) && /Stopped: you pressed/.test(barParts(cleanRentHead(after)).line));
  check('stopping twice counts the money once', (await r.stopRun(list[0], run, 'again')) === true && r.ledger.load().filter((x) => x.machine === 'pod9').length === 1);
  // Stop while it's still being asked for: the machine it gets is stopped at once
  let stoppedIds = [];
  const r2 = new Rentals(mkCfg({ minutes: 60 }), { env: { RUNPOD_API_KEY: 'x' }, now: () => t });
  let release; const gate = new Promise((res) => { release = res; });
  r2.machines.start = async () => { await gate; return { id: 'pod10', url: 'u', kind: 'machine', startedAt: t }; };
  r2.machines.stop = async (_, m) => { stoppedIds.push(m.id); };
  const p = r2.ensureRunning(list[0], { key: 'x', emit: () => {}, job: { id: 'j2' } }).catch((e) => e);
  await new Promise((res) => sleep(res, 0));
  const head = cleanRentHead(r2.status(list[0]));
  check('while it is asked for, the head says so and Stop is there', head.state === 'starting' && /Asking for a machine/.test(headWords(head, live(head, t, 0))) && barParts(head, live(head, t, 0)).canStop);
  await r2.stopRun(list[0], r2.running.get('mach01'), 'you pressed Stop the machine now');
  release();
  const err = await p;
  check('Stop during start-up stops the machine as soon as the service hands it over', err instanceof Error && stoppedIds.includes('pod10') && !r2.running.has('mach01'));
  const pg = barParts({ ...head, stages: [{ step: 'asking', label: STAGES.asking, at: t - 90000, usd: 0 }, { step: 'pulling', label: STAGES.pulling, at: t - 30000, usd: 0.01, pct: 45 }] }, live({ ...head, askedAt: t - 90000 }, t, 0));
  check('the chat lists each step with when it came and the cost, the latest marked', pg.steps.length === 2 && pg.steps[1].when === '+1:00' && pg.steps[1].usd === '$0.01' && pg.steps[1].now && pg.steps[1].pct === 45);
}

// ---- the page: head, bar, way back ----
{
  const page = read('public/net-overlay.js');
  check('a rented brain\'s head is a chat head, there with Bob-Net icons off', /view\.rents \|\| \[\]\)\.map\(\(r\) => \(\{ kind: 'rent'/.test(page));
  check('clicking it opens its own chat and remembers where you were', /if \(s\.kind === 'rent'\) \{ if \(session\(\) !== s\.it\.chat\) \{ remember\(\); open\(s\.it\.chat\); \}/.test(page));
  check('its chat says "← Back to my chat", never guest mode', /← Back to my chat/.test(page) && !/Guest/i.test(page.slice(page.indexOf('function rentBar'), page.indexOf('function guestBar'))));
  check('the way back never leads to another head\'s chat', /const backTo = \(\) => \(returnTo\(\) && !awayChat\(returnTo\(\)\) \? returnTo\(\) : 'main'\)/.test(page));
  check('Hands, tools and web search stay: the guest-mode limits are not applied', /document\.body\.classList\.remove\('net-guest'\)/.test(page));
  check('a countdown ring is drawn on the head', /drawRing\(x, l\?\.frac/.test(page));
}

// ---- Add a rented brain, card by card ----
{
  const services = [{ id: 'runpod', name: 'RunPod', kind: 'machine', enabled: true }, { id: 'other', name: 'Another service', kind: 'answer', enabled: true }];
  const state = (open, rentals = []) => ({ rent: { services, rentals, caps: { month: 0, job: 0, minutes: 0, warm: 0 }, cards: [{ id: '48', name: '48 GB card', perHour: 1.2, say: 'fits' }], cardCounts: [1, 2] }, settings: {}, data: { models: [], bigBrains: [{ id: 'big', name: 'Giant', hf: 'owner/giant', rent: { card: 141 } }] }, eqCtx: () => ({}), naughtyOn: () => false, srow: (a, b) => b, sswitch: () => '', more: () => '', panel: () => '', hw: {}, rentPickOpen: open });
  const shut = createSettingsParts(() => state(false)).rentHtml().replace(/\r\n/g, '\n');
  check('it starts with nothing and a + button', /None yet\./.test(shut) && /data-rentnew>\+ Add a rented brain</.test(shut) && !/rent-draft/.test(shut));
  const h = createSettingsParts(() => state(true)).rentHtml().replace(/\r\n/g, '\n');
  const steps = [...h.matchAll(/data-rentstep="(\w+)"( hidden)?/g)].map((m) => `${m[1]}${m[2] ? '-' : '+'}`).join(',');
  check('the + makes a row of cards, only the first showing', steps === 'service+,brain-,card-,limits-,name-', steps);
  check('the brain comes from Bob\'s own list', /data-rentadd="pick"/.test(h) && /Giant/.test(h) && /<option value="">Pick a brain<\/option>/.test(h));
  check('typing a model\'s name is under Advanced', /<details class="more rent-advanced"><summary>Advanced: type the model's name myself<\/summary>[\s\S]*data-rentadd="model"/.test(h));
  check('Another service\'s boxes stay hidden until it is picked', (h.match(/rent-other" hidden>/g) || []).length === 2);
  check('the limits card has Keep warm', /data-rentcap="warm"/.test(h));
  const cellar = read('public/cellar.js');
  check('each card shows once the one before is done', /function rentStep\(box\)/.test(cellar) && /show\('brain', brain\); show\('card', card\); show\('limits', limits\); show\('name', named\)/.test(cellar));
  check('picking a brain on a pay-per-answer service looks it up by itself', /if \(find && !find\.hidden && box\.classList\.contains\('rent-draft'\)\) find\.click\(\)/.test(cellar));
}

// ---- removing one: keep its chat in memory, or delete it ----
{
  const routes = read('src/rental-routes.js');
  check('with a chat, Remove asks first', /if \(hasChat && !\['memory', 'delete'\]\.includes\(b\.chat\)\) return send\(res, 409/.test(routes));
  check('Delete deletes it for good; Keep leaves it as an ordinary past chat', /b\.chat === 'delete'\) \{\s*const gone = clearChat\(cfg, brain, chatId, \{ forGood: true \}\)/.test(routes));
  const cellar = read('public/cellar.js');
  check('the choice is on screen, in plain words', /Keep it in my memory/.test(cellar) && /Delete it for good/.test(cellar));
  check('a rented brain\'s machine can be stopped from its chat', /p === '\/api\/rent\/stop-one'/.test(routes));
}

// ---- Help ----
{
  const ids = new Set(HELP.map((e) => e.id));
  const rented = HELP.find((e) => e.id === 'rented')?.html || '';
  check('Help explains the head, the countdown and Keep warm', /Its own chat head/.test(rented) && /The countdown/.test(rented) && /Keep warm/.test(rented) && /← Back to my chat/.test(rented));
  check('the FAQ has Keep warm and the way back', ids.has('faq-rent-warm') && ids.has('faq-rent-head'));
  const glossary = HELP.find((e) => e.id === 'glossary')?.html || '';
  check('the glossary has Keep warm and Session limit', /<dt>Keep warm<\/dt>/.test(glossary) && /<dt>Session limit<\/dt>/.test(glossary));
  check('guest mode is only for another Bob', /Guest mode<\/strong> \(only for another of your Bobs, never a chat head\)/.test(HELP.find((e) => e.id === 'net-overlay')?.html || ''));
}

fs.rmSync(tmp, { recursive: true, force: true });
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

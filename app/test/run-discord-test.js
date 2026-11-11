// Tests "Bob on Discord" (src/discord.js) with a pretend Discord and a pretend Bob. Nothing goes online.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DiscordBridge, discordView, discordRoute, DM_SESSION, cleanDiscordPatch, matchWake, jobTypeOf, toolsFor, cleaner, saveDiscord, storeToken, discordSettings, INTENTS, TOKEN_ENV } from '../src/discord.js';
import { guestTools, guestNote } from '../src/share-jobs.js';
import { savedKey } from '../src/secret-box.js';

let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra ? ' ' + extra : ''}`); };
const tick = () => new Promise((r) => setTimeout(r, 15));
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bob-dc-'));
const configFile = path.join(dir, 'config.json');
const painterDir = path.join(dir, 'made');
fs.mkdirSync(painterDir);
fs.writeFileSync(configFile, JSON.stringify({ port: 7777 }));
const TOKEN = ['MTIzNDU2Nzg5MDEyMzQ1Njc4', 'GAbCdE', 'FAKE_test_token_not_real_at_all_x'].join('.');
const CH = '111111111111111111', OTHER_CH = '222222222222222222', PAT = '333333333333333333', SAM = '444444444444444444';

const calls = [];
const fetchImpl = async (url, opts) => {
  calls.push({ url, method: opts.method, headers: opts.headers, body: typeof opts.body === 'string' ? JSON.parse(opts.body) : opts.body });
  return { status: url.endsWith('/typing') ? 204 : 200, json: async () => ({ id: '9' }) };
};
const sockets = [];
class FakeWS { constructor(url) { this.url = url; this.sent = []; sockets.push(this); } send(t) { this.sent.push(JSON.parse(t)); } close() { this.closed = true; } }
const queue = [], answered = [];
const brain = {
  cfg: { configFile, painterDir, userName: 'Robin', callMe: 'Robin' }, queue, sessions: new Map(), logs: [],
  log(k, t) { this.logs.push(`${k}: ${t}`); },
  enqueue(sessionId, text, attach, effort, extra) { const j = { id: `job${queue.length}`, sessionId, text, state: 'waiting', ...extra }; queue.push(j); return { jobId: j.id, ahead: 0 }; },
  answerApproval(id, allow) { answered.push([id, allow]); return true; }
};
brain.constructor = { guessKind: (t) => (/\b(draw|picture)\b/.test(t) ? 'picture' : /\bcode\b/.test(t) ? 'code' : /\bsearch\b/.test(t) ? 'research' : 'chat') };
const posts = () => calls.filter((c) => /\/messages$/.test(c.url) && c.body && !(c.body instanceof FormData));
const msg = (text, { channel = CH, author = PAT, bot = false, guild = '5' } = {}) => ({ id: String(Math.random()).slice(2), channel_id: channel, guild_id: guild, content: text, author: { id: author, username: 'pat', bot } });

// Wake phrase: the wildcard, case, word edges.
check('"hey bob*" reads what follows as the job', matchWake('hey bob*', 'hey bob draw a cat') === 'draw a cat');
check('case is ignored by default', matchWake('hey bob*', 'HEY BOB, draw a cat') === 'draw a cat');
check('case sensitive when switched on', matchWake('hey bob*', 'Hey Bob draw a cat', true) === null && matchWake('Hey Bob*', 'Hey Bob draw', true) === 'draw');
check('"hey bobby" is not "hey bob"', matchWake('hey bob*', 'hey bobby what') === null);
check('the * can sit in the middle', matchWake('bob, * please', 'Bob, make a joke please') === 'make a joke');
check('no * means it goes at the end', matchWake('computer', 'computer, status report') === 'status report');
check('something that doesn\'t start with the phrase is ignored', matchWake('hey bob*', 'I said hey bob draw') === null);
check('just the phrase gives an empty job', matchWake('hey bob*', 'hey bob') === '');
check('a phrase of only * falls back to the default', matchWake('*', 'hey bob hi') === 'hi');

// Settings: only known keys, only the right types.
const patch = cleanDiscordPatch({ enabled: 'yes', share: true, wake: 'ok bob*', channels: `${CH}\nnot-an-id`, jobs: { pictures: true, hacking: true }, token: 'x', ownerId: 1 });
check('only known switches and lists can be set', patch.enabled === false && patch.share === true && patch.wake === 'ok bob*' && patch.channels.length === 1 && patch.jobs.pictures === true && !('hacking' in patch.jobs) && !('token' in patch) && !('ownerId' in patch));
check('defaults: off, "hey bob*", case off, no channels, chat and code only, sharing off', (() => { const s = discordSettings({}); return !s.enabled && s.wake === 'hey bob*' && !s.caseSensitive && !s.channels.length && s.jobs.chat && s.jobs.code && !s.jobs.web && !s.jobs.pictures && !s.share; })());
check('the job types decide the tools: chat and code alone give no making or web tools', JSON.stringify(toolsFor(discordSettings({}))) === '["use_tools"]');
check('job type of a request', jobTypeOf('draw a dragon', brain.constructor.guessKind) === 'pictures' && jobTypeOf('write me a song', brain.constructor.guessKind) === 'music' && jobTypeOf('fix this code', brain.constructor.guessKind) === 'code' && jobTypeOf('hi', brain.constructor.guessKind) === 'chat');

// Off: nothing happens at all.
let b = new DiscordBridge(brain, { fetchImpl, WebSocketImpl: FakeWS, env: { [TOKEN_ENV]: TOKEN }, wait: async () => {} });
b.sync();
check('off by default: no connection and no request at all', sockets.length === 0 && calls.length === 0 && !b.running);
saveDiscord(brain.cfg, { enabled: true });
const nt = new DiscordBridge(brain, { fetchImpl, WebSocketImpl: FakeWS, env: {} });
nt.sync();
check('on but no token: still no connection', sockets.length === 0 && nt.status === 'no token' && discordView(nt).tokenFound === false);

// On with a token: the gateway handshake.
b.sync();
const ws = sockets[0];
check('connects to Discord\'s gateway only', ws && ws.url.startsWith('wss://gateway.discord.gg/'));
b.onGateway({ op: 10, d: { heartbeat_interval: 60000 } });
const ident = ws.sent.find((x) => x.op === 2);
check('identifies as a bot with message intents', ident && ident.d.token === TOKEN && ident.d.intents === INTENTS && (INTENTS & (1 << 15)));
b.onGateway({ op: 0, s: 1, t: 'READY', d: { session_id: 's1', resume_gateway_url: 'wss://gateway-us-east1-b.discord.gg', user: { id: '7', username: 'bob' } } });
check('READY: connected, bot name known', b.status === 'on' && discordView(b).botName === 'bob');
check('the token never lands in config.json', !fs.readFileSync(configFile, 'utf8').includes(TOKEN));
clearInterval(b.beat);

// Messages: no channels yet -> silence.
await b.handle(msg('hey bob hi'));
check('with no channels listed, nobody gets an answer', queue.length === 0 && posts().length === 0);
saveDiscord(brain.cfg, { channels: [CH] });
await b.handle(msg('hey bob hi', { channel: OTHER_CH }));
check('a channel not on the list is ignored', queue.length === 0);
await b.handle(msg('hey bob hi', { bot: true }));
check('bots are ignored', queue.length === 0);
await b.handle(msg('just chatting about bob'));
check('a message without the wake phrase is ignored', queue.length === 0 && posts().length === 0);
await b.handle(msg('hey bob tell me a joke'));
const j0 = queue[0];
check('the wake phrase makes a guest job in that channel\'s own chat', j0 && j0.sessionId === `discord-${CH}` && /tell me a joke$/.test(j0.text) && j0.guest?.public === true && j0.guest.from === 'Discord');
check('the job carries only the ticked tools', JSON.stringify(j0.guest.tools) === '["use_tools"]');
await b.handle(msg('hey bob another one'));
check('the same person asking again at once is asked to wait', queue.length === 1 && /moment/.test(posts().at(-1).body.content));
await b.handle(msg('hey bob draw a dragon', { author: SAM }));
check('a job type that is switched off gets a polite no, and no job', queue.length === 1 && /switched off/.test(posts().at(-1).body.content));
saveDiscord(brain.cfg, { people: [SAM] });
await b.handle(msg('hey bob hi', { author: '555555555555555555' }));
check('with people listed, someone else gets silence', queue.length === 1);
saveDiscord(brain.cfg, { people: [] });

// Replies: only that job's, cleaned, as a reply, with no pings.
const n0 = posts().length;
b.watch({ type: 'token', sessionId: 'main', turnId: 'job0', text: 'not for Discord' });
b.watch({ type: 'token', sessionId: `discord-${CH}`, turnId: 'job0', text: 'Robin keeps notes in C:\\Users\\you\\Documents\\secret.txt, see http://localhost:7777/images/2026-11-09-ab12cd34.png. @everyone ' });
b.watch({ type: 'done', sessionId: `discord-${CH}`, turnId: 'job0' });
await tick();
const last = posts().at(-1).body;
check('the reply goes to that channel, once', posts().length === n0 + 1 && posts().at(-1).url.endsWith(`/channels/${CH}/messages`));
check('the owner\'s name, folders, Bob\'s pages and file names are taken out', !/Robin|C:\\|localhost|ab12cd34|secret\.txt/.test(last.content), last.content);
check('no @everyone and no pings', !/@everyone/.test(last.content) && JSON.stringify(last.allowed_mentions.parse) === '[]');
check('it\'s a reply to the message that asked', Boolean(last.message_reference?.message_id));

// Files: off -> a note; on -> only this job's new files from Bob's own folder.
saveDiscord(brain.cfg, { jobs: { pictures: true } });
const old = path.join(painterDir, 'old.png'); fs.writeFileSync(old, 'x'); fs.utimesSync(old, new Date(2020, 1, 1), new Date(2020, 1, 1));
const outside = path.join(dir, 'private.png'); fs.writeFileSync(outside, 'x');
b.lastAsk.clear();
await b.handle(msg('hey bob draw a dragon'));
const pj = queue.at(-1).id;
check('with pictures ticked, the job may paint', queue.at(-1).guest.tools.includes('make_image'));
const fresh = path.join(painterDir, 'dragon.png'); fs.writeFileSync(fresh, 'png');
b.watch({ type: 'image', sessionId: `discord-${CH}`, turnId: pj, file: fresh });
b.watch({ type: 'token', sessionId: `discord-${CH}`, turnId: pj, text: 'Here you go.' });
b.watch({ type: 'done', sessionId: `discord-${CH}`, turnId: pj });
await tick();
check('sharing off: no file goes, just a note', !calls.some((c) => c.body instanceof FormData) && /sharing what I make on Discord is switched off/.test(posts().at(-1).body.content));
saveDiscord(brain.cfg, { share: true });
b.lastAsk.clear();
await b.handle(msg('hey bob draw a cat'));
const pj2 = queue.at(-1).id;
const fresh2 = path.join(painterDir, 'cat.png'); fs.writeFileSync(fresh2, 'png');
for (const f of [old, outside, fresh2]) b.watch({ type: 'image', sessionId: `discord-${CH}`, turnId: pj2, file: f });
b.watch({ type: 'image', sessionId: 'main', turnId: 'mainjob', file: fresh2 });
b.watch({ type: 'done', sessionId: `discord-${CH}`, turnId: pj2 });
await tick();
const ups = calls.filter((c) => c.body instanceof FormData);
check('sharing on: only the file made for this request goes, not older ones or ones outside Bob\'s folder', ups.length === 1 && ups[0].body.get('files[0]').name === 'cat.png');

// OK cards never wait on the owner from Discord.
b.lastAsk.clear();
await b.handle(msg('hey bob do a thing'));
const aj = queue.at(-1).id;
b.watch({ type: 'approval', sessionId: `discord-${CH}`, turnId: aj, id: 'card1', text: 'Move files' });
check('an OK card from a Discord job is answered No at once', answered.length === 1 && answered[0][0] === 'card1' && answered[0][1] === false);

// Brain side: guest tools and the note.
const job = { guest: { from: 'Discord', public: true, tools: ['use_tools', 'make_image'] } };
const names = guestTools(job, ['make_image', 'make_music', 'read_file', 'bob_help', 'use_tools', 'web_search'].map((n) => ({ function: { name: n } }))).map((t) => t.function.name);
check('a Discord job sees only the ticked tools, never files or Help readouts', JSON.stringify(names) === '["make_image","use_tools"]');
check('the note tells Bob it\'s a public room and the owner\'s things are private', /stranger/.test(guestNote(job, 'Robin')) && !/Robin/.test(guestNote(job, 'Robin')));

// Every request goes to discord.com only, with the bot token.
const rest = calls.filter((c) => c.url.startsWith('http'));
check('every request goes to discord.com/api only, as a bot', rest.every((c) => c.url.startsWith('https://discord.com/api/v10/') && c.headers.authorization === `Bot ${TOKEN}`));

// Errors never repeat the token.
const leaky = new DiscordBridge(brain, { fetchImpl: async () => ({ status: 401, json: async () => ({ message: `401: Unauthorized ${TOKEN}` }) }), WebSocketImpl: FakeWS, env: { [TOKEN_ENV]: TOKEN } });
let err = '';
try { await leaky.rest('GET', '/users/@me'); } catch (e) { err = e.message; }
check('an error from Discord never shows the token', err && !err.includes(TOKEN));
check('the reply cleaner hides a Discord token too', !cleaner({})(`token ${TOKEN}`).includes(TOKEN));

// A bad token closes for good, with a plain status.
b.onClose(4004);
check('a refused token stops trying and says so', !b.running && b.status === 'bad token');

// Saving a pasted token: into Bob's locked store (🔐 Locked secrets), and any old plain copy taken away.
const home = path.join(dir, 'home');
fs.mkdirSync(path.join(home, '.config', 'bob'), { recursive: true });
fs.writeFileSync(path.join(home, '.config', 'bob', 'env'), `${TOKEN_ENV}=old.plain.one\n`);
await storeToken(TOKEN, { cfg: brain.cfg, platform: 'linux', home });
const envFile = fs.readFileSync(path.join(home, '.config', 'bob', 'env'), 'utf8');
check('a pasted token is saved locked, and the old plain line leaves ~/.config/bob/env', savedKey(TOKEN_ENV) === TOKEN && !envFile.includes(TOKEN_ENV));
let regArgs = null;
await storeToken(TOKEN, { cfg: brain.cfg, platform: 'win32', run: (cmd, args) => { regArgs = [cmd, ...args]; return ''; } });
check('on Windows the old user variable an older Bob wrote is taken away (HKCU\\Environment)', regArgs?.[0] === 'reg' && regArgs[1] === 'delete' && regArgs.includes(TOKEN_ENV) && !regArgs.includes(TOKEN));
let bad = '';
try { await b.saveToken('not a token'); } catch (e) { bad = e.message; }
check('something that isn\'t a bot token is refused', /doesn't look like/.test(bad));

// ---------- Your private Bob in Discord DMs ----------
saveDiscord(brain.cfg, { enabled: false, dmEnabled: true });
const d = new DiscordBridge(brain, { fetchImpl, WebSocketImpl: FakeWS, env: { [TOKEN_ENV]: TOKEN }, wait: async () => {} });
brain.cancelJob = (id) => { const j = queue.find((x) => x.id === id); if (!j) return false; j.state = 'cancelled'; return true; };
d.sync(); d.running = true;
const dmCode = discordView(d).pairCode;
check('DMs on: a 6-digit pairing code is shown, no account assumed', /^\d{6}$/.test(dmCode) && !discordView(d).paired && discordView(d).ownerId === null);
const dmMsg = (text, author = PAT) => ({ id: '1', channel_id: '777777777777777777', content: text, author: { id: author, username: 'pat' } });
const q0 = queue.length;
await d.handle(dmMsg('hello'));
check('before pairing, a DM that isn\'t the code is ignored', queue.length === q0 && !discordView(d).paired);
await d.handle(dmMsg(dmCode));
check('the right code in a DM pairs that account', discordView(d).paired && discordView(d).ownerId === PAT && !fs.readFileSync(configFile, 'utf8').includes(TOKEN));
await d.handle(dmMsg('what is on my desktop?', SAM));
check('someone else\'s DM gets silence and no job', queue.length === q0);
await d.handle(dmMsg('what is on my desktop?'));
const dj = queue.at(-1);
check('your DM becomes a normal private job (full Bob, not a guest)', dj.sessionId === DM_SESSION && !dj.guest && dj.text === 'what is on my desktop?');
await d.handle(dmMsg('hey bob draw a cat', SAM));
check('channels are still off: nothing from them', queue.length === q0 + 1);
const before = posts().length;
d.watch({ type: 'token', sessionId: DM_SESSION, turnId: 'd1', text: 'Your desktop has 3 files.' });
d.watch({ type: 'done', sessionId: DM_SESSION, turnId: 'd1' });
await tick();
check('the reply goes to your DM channel', posts().length === before + 1 && posts().at(-1).url.endsWith('/channels/777777777777777777/messages') && /3 files/.test(posts().at(-1).body.content));
d.watch({ type: 'approval', sessionId: DM_SESSION, turnId: 'd2', id: '11111111-2222-3333-4444-555555555555', text: 'Move 3 files' });
await tick();
check('OK switch off: the card waits on the PC, no buttons', /on this replicant matrix/.test(posts().at(-1).body.content) && !posts().at(-1).body.components);
saveDiscord(brain.cfg, { dmApprove: true });
d.watch({ type: 'approval', sessionId: DM_SESSION, turnId: 'd2', id: '11111111-2222-3333-4444-555555555555', text: 'Move 3 files' });
await tick();
check('OK switch on: Allow and Deny buttons', posts().at(-1).body.components?.[0]?.components?.length === 2);
const a0 = answered.length;
await d.button({ id: 'i1', token: 't', user: { id: SAM }, data: { custom_id: 'ok:11111111-2222-3333-4444-555555555555:1' } });
check('someone else pressing the button does nothing', answered.length === a0);
await d.button({ id: 'i2', token: 't', user: { id: PAT }, data: { custom_id: 'ok:11111111-2222-3333-4444-555555555555:0' }, message: { content: 'I need your OK: Move 3 files' } });
check('your Deny answers the card No', answered.length === a0 + 1 && answered.at(-1)[1] === false);
await d.handle(dmMsg('/stop'));
check('/stop cancels your DM jobs', dj.state === 'cancelled');
// Typing your user ID instead of the code.
const dmRoute = async (b2) => { let out; await discordRoute({ req: { method: 'POST' }, res: {}, p: '/api/discord', isLocal: true, brain: { ...brain, discord: d }, body: async () => b2, send: (r, code, j) => { out = { code, j }; } }); return out; };
await dmRoute({ forget: true });
check('Forget my Discord account un-pairs', !discordView(d).paired);
let rr = await dmRoute({ owner: 'not an id' });
check('a typed account that isn\'t a user ID is refused', rr.code === 400 && !discordView(d).paired);
rr = await dmRoute({ owner: SAM });
check('a typed user ID pairs that account', rr.code === 200 && rr.j.paired && rr.j.ownerId === SAM);
rr = await dmRoute({ ownerId: PAT, enabled: true });
check('the account can\'t be changed through the switches', discordView(d).ownerId === SAM);

// Turning it off stops Bob listening.
saveDiscord(brain.cfg, { enabled: false, dmEnabled: false });
const c = new DiscordBridge(brain, { fetchImpl, WebSocketImpl: FakeWS, env: { [TOKEN_ENV]: TOKEN } });
c.running = true; c.sync();
check('turning it off stops Bob listening', !c.running && c.status === 'off');

fs.rmSync(dir, { recursive: true, force: true });
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

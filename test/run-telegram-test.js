// Tests "Talk to Bob on Telegram" (src/telegram.js) with a pretend Telegram and a pretend Bob. Nothing goes online.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { TelegramBridge, telegramView, cleanTelegramPatch, chunks, codeIn, saveTelegram, ownerPatch, telegramRoute, TELEGRAM_SESSION, TOKEN_ENV } from '../src/telegram.js';

let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra ? ' ' + extra : ''}`); };
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bob-tg-'));
const configFile = path.join(dir, 'config.json');
fs.writeFileSync(configFile, JSON.stringify({ port: 7777 }));
const TOKEN = ['12345', '6789'].join('') + ':' + 'FAKE-test-token-not-real'.padEnd(35, '_');

const calls = [];
const fetchImpl = async (url, opts) => {
  const method = url.split('/').pop();
  calls.push({ url, method, body: opts.body && typeof opts.body === 'string' ? JSON.parse(opts.body) : opts.body });
  return { status: 200, json: async () => ({ ok: true, result: method === 'getMe' ? { username: 'my_bob_bot' } : method === 'getUpdates' ? [] : { message_id: 1 } }) };
};
const answered = [];
const queue = [];
const brain = {
  cfg: { configFile }, queue, logs: [],
  log(k, t) { this.logs.push(`${k}: ${t}`); },
  broadcast() {},
  enqueue(sessionId, text) { const j = { id: `job${queue.length}`, sessionId, text, state: 'waiting' }; queue.push(j); return { jobId: j.id, ahead: 0 }; },
  cancelJob(id) { const j = queue.find((x) => x.id === id); if (!j) return false; j.state = 'cancelled'; return true; },
  answerApproval(id, allow) { answered.push([id, allow]); return true; }
};
const sent = () => calls.filter((c) => c.method === 'sendMessage').map((c) => c.body.text);
const msg = (from, text, type = 'private') => ({ update_id: 1, message: { chat: { id: from, type }, from: { id: from, first_name: 'Pat', is_bot: false }, text } });

// Off: nothing happens at all.
let b = new TelegramBridge(brain, { fetchImpl, env: { [TOKEN_ENV]: TOKEN } });
b.sync();
check('off by default: no request to Telegram at all', calls.length === 0 && !b.running && telegramView(b).enabled === false);
check('only the three switches can be set, and only to true or false', JSON.stringify(cleanTelegramPatch({ enabled: 'yes', approve: true, ownerId: 5, chatId: 9 })) === '{"enabled":false,"approve":true}');

// On without a token: still no requests, and the view says the token is missing.
saveTelegram(brain.cfg, { enabled: true });
b = new TelegramBridge(brain, { fetchImpl, env: {} });
b.sync();
check('on but no token: no requests, token not found', calls.length === 0 && telegramView(b).tokenFound === false && b.status === 'no token');
const bad = new TelegramBridge(brain, { fetchImpl, env: { [TOKEN_ENV]: 'not a token' } });
check('a token that doesn\'t look like a bot token is ignored', bad.token() === '');

// On with a token: pairing.
b = new TelegramBridge(brain, { fetchImpl, env: { [TOKEN_ENV]: TOKEN } });
b.running = true; // drive handle() by hand, without the poll loop
b.sync();
const code = telegramView(b).pairCode;
check('a 6-digit pairing code is shown while not paired', /^\d{6}$/.test(code));
await b.handle(msg(42, '000000' === code ? '111111' : '000000'));
check('a wrong code is ignored, silently', !telegramView(b).paired && sent().length === 0);
await b.handle(msg(42, `/start ${code}`, 'group'));
check('a code sent from a group chat is ignored', !telegramView(b).paired);
await b.handle(msg(42, `/start ${code}`));
const saved = JSON.parse(fs.readFileSync(configFile, 'utf8')).telegram;
check('the right code pairs that account, saved in config.json', telegramView(b).paired && saved.ownerId === 42 && saved.chatId === 42 && telegramView(b).pairCode === '');
check('the token never lands in config.json', !fs.readFileSync(configFile, 'utf8').includes(TOKEN));
check('Bob says hello once paired', /Paired/.test(sent().at(-1) || ''));

// Messages.
await b.handle(msg(99, 'hi Bob, delete my files'));
check('anyone else gets no answer and nothing is queued', queue.length === 0);
await b.handle(msg(42, 'make me a plan for Saturday'));
check('the owner\'s message goes into the Telegram chat', queue.length === 1 && queue[0].sessionId === TELEGRAM_SESSION && queue[0].text === 'make me a plan for Saturday');
await b.handle(msg(42, '/stop'));
check('/stop cancels the Telegram chat\'s jobs', queue[0].state === 'cancelled' && /Stopped/.test(sent().at(-1)));

// Replies: tokens collect, done sends them; other chats' events are ignored.
const n0 = sent().length;
b.watch({ type: 'token', sessionId: 'main', turnId: 't0', text: 'not for Telegram' });
b.watch({ type: 'done', sessionId: 'main', turnId: 't0' });
b.watch({ type: 'token', sessionId: TELEGRAM_SESSION, turnId: 't1', text: 'Saturday: ' });
b.watch({ type: 'token', sessionId: TELEGRAM_SESSION, turnId: 't1', text: 'sleep in.' });
check('nothing is sent before the reply is done', sent().length === n0);
b.watch({ type: 'done', sessionId: TELEGRAM_SESSION, turnId: 't1' });
await new Promise((r) => setTimeout(r, 10));
check('the finished reply goes to Telegram, and only that chat\'s', sent().length === n0 + 1 && sent().at(-1) === 'Saturday: sleep in.');

// OK cards: off -> a note; on -> buttons; buttons only work for the owner.
b.watch({ type: 'approval', sessionId: TELEGRAM_SESSION, turnId: 't2', id: '11111111-2222-3333-4444-555555555555', text: 'Move 3 files' });
await new Promise((r) => setTimeout(r, 10));
const lastCall = () => calls.filter((c) => c.method === 'sendMessage').at(-1).body;
check('with the OK switch off, Bob says the card waits on this replicant matrix (no buttons)', /on this replicant matrix/.test(lastCall().text) && !lastCall().reply_markup);
await b.handle({ update_id: 2, callback_query: { id: 'q1', from: { id: 42 }, data: 'ok:11111111-2222-3333-4444-555555555555:1' } });
check('a button press does nothing while the OK switch is off', answered.length === 0);
saveTelegram(brain.cfg, { approve: true });
b.watch({ type: 'approval', sessionId: TELEGRAM_SESSION, turnId: 't2', id: '11111111-2222-3333-4444-555555555555', text: 'Move 3 files' });
await new Promise((r) => setTimeout(r, 10));
check('with it on, the card gets Allow and Deny buttons', lastCall().reply_markup?.inline_keyboard?.[0]?.length === 2);
await b.handle({ update_id: 3, callback_query: { id: 'q2', from: { id: 99 }, data: 'ok:11111111-2222-3333-4444-555555555555:1' } });
check('someone else pressing the button does nothing', answered.length === 0);
await b.handle({ update_id: 4, callback_query: { id: 'q3', from: { id: 42 }, data: 'ok:11111111-2222-3333-4444-555555555555:0', message: { message_id: 7, chat: { id: 42 } } } });
check('the owner\'s Deny answers the card No', answered.length === 1 && answered[0][1] === false);

// Pictures: off -> a note in the reply.
b.watch({ type: 'image', sessionId: TELEGRAM_SESSION, turnId: 't3', file: path.join(dir, 'x.png') });
b.watch({ type: 'done', sessionId: TELEGRAM_SESSION, turnId: 't3' });
await new Promise((r) => setTimeout(r, 10));
check('with pictures off, no photo is sent, just where to find it', !calls.some((c) => c.method === 'sendPhoto') && /Made by Bob/.test(sent().at(-1)));

// Errors never repeat the token.
const leaky = new TelegramBridge(brain, { fetchImpl: async () => ({ status: 401, json: async () => ({ ok: false, description: `Unauthorized for ${TOKEN}` }) }), env: { [TOKEN_ENV]: TOKEN } });
let err = '';
try { await leaky.call('getMe'); } catch (e) { err = e.message; }
check('an error from Telegram never shows the token', err && !err.includes(TOKEN));
check('every request goes to api.telegram.org only', calls.every((c) => c.url.startsWith('https://api.telegram.org/bot')));

// Helpers.
check('long replies are split under Telegram\'s limit', chunks('a '.repeat(5000)).every((c) => c.length <= 4000) && chunks('a '.repeat(5000)).length === 3);
check('the pairing code is found in "/start 123456" and "123456" only', codeIn('/start 123456') === '123456' && codeIn('123456') === '123456' && codeIn('my code is 123456') === null);

// Guessing the code: five wrong tries throw it away until New code.
saveTelegram(brain.cfg, { ownerId: undefined, ownerName: undefined, chatId: undefined });
const g = new TelegramBridge(brain, { fetchImpl, env: { [TOKEN_ENV]: TOKEN } });
g.running = true; g.sync();
const real = telegramView(g).pairCode;
for (let i = 0; i < 5; i++) await g.handle(msg(77, String((Number(real) + 1 + i) % 1e6).padStart(6, '0')));
g.sync();
await g.handle(msg(77, real));
check('after 5 wrong codes the code is thrown away, even the right one fails, until New code', !telegramView(g).paired && telegramView(g).pairLocked && telegramView(g).pairCode === '');
g.newPairCode();
await g.handle(msg(42, g.pair.code));
check('New code works again', telegramView(g).paired);

// Typing your own account in Settings, instead of the code. Nothing is assumed.
check('a typed user ID or @username is understood; anything else is refused', ownerPatch('123456789').ownerId === 123456789 && ownerPatch('@Pat_Smith').ownerUser === 'pat_smith' && ownerPatch('pat') === null && ownerPatch('12ab') === null);
saveTelegram(brain.cfg, { ownerId: undefined, ownerName: undefined, chatId: undefined });
const route = async (b2) => { let out; await telegramRoute({ req: { method: 'POST' }, res: {}, p: '/api/telegram', isLocal: true, brain: { ...brain, telegram: h }, body: async () => b2, send: (r, code, j) => { out = { code, j }; } }); return out; };
const h = new TelegramBridge(brain, { fetchImpl, env: { [TOKEN_ENV]: TOKEN } });
h.running = true; h.sync();
let r = await route({ owner: '987654321' });
check('a typed user ID pairs that account at once', r.code === 200 && r.j.paired && JSON.parse(fs.readFileSync(configFile, 'utf8')).telegram.ownerId === 987654321);
await route({ forget: true });
r = await route({ owner: 'nope' });
check('a typed account that is neither an ID nor a username is refused', r.code === 400 && !telegramView(h).paired);
r = await route({ owner: '@Robin_Bob' });
check('a typed @username waits for that account\'s first message', r.code === 200 && !r.j.paired && r.j.ownerUser === 'robin_bob');
await h.handle({ update_id: 9, message: { chat: { id: 55, type: 'private' }, from: { id: 55, username: 'someone_else', is_bot: false }, text: 'hi' } });
check('someone else with another username gets nothing', !telegramView(h).paired);
await h.handle({ update_id: 10, message: { chat: { id: 66, type: 'private' }, from: { id: 66, username: 'Robin_Bob', first_name: 'Robin', is_bot: false }, text: '/start' } });
check('the typed username\'s first message pairs it, kept by its ID', telegramView(h).paired && JSON.parse(fs.readFileSync(configFile, 'utf8')).telegram.ownerId === 66);

// Forgetting un-pairs; turning off stops.
saveTelegram(brain.cfg, { ownerId: undefined, ownerName: undefined, chatId: undefined, enabled: false });
b.sync();
check('turning it off stops Bob listening', !b.running && !telegramView(b).paired);

fs.rmSync(dir, { recursive: true, force: true });
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

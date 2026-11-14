// Tests Keep order on Discord (src/discord-mod.js) with a pretend Discord and a pretend Bob. Nothing goes online, and
// no brain is ever asked unless "Ask a brain about unclear cases" is on.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DiscordBridge, discordSettings, discordView, discordRoute, saveDiscord, cleanDiscordPatch, INTENTS, TOKEN_ENV } from '../src/discord.js';
import { modSettings, cleanModPatch, normalWord, wordsOf, linkHit, minutesOf, ladder, modTool, modOn, MEMBERS_INTENT, REVIEW_SESSION, MOD_DEFAULTS } from '../src/discord-mod.js';
import { TOOL_KINDS } from '../src/tool-kinds.js';

let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra ? ' ' + extra : ''}`); };
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bob-dcmod-'));
const configFile = path.join(dir, 'config.json');
fs.writeFileSync(configFile, JSON.stringify({ port: 7777 }));
const TOKEN = ['MTIzNDU2Nzg5MDEyMzQ1Njc4', 'GAbCdE', 'FAKE_test_token_not_real_at_all_x'].join('.');
const G = '500000000000000005', CH = '111111111111111111', LOG = '666666666666666666', PAT = '333333333333333333', OWNER = '444444444444444444', MODR = '777777777777777777', VERIFY = '888888888888888888', FUN = '999999999999999999', ADMIN = '123123123123123123';

let clock = 1_800_000_000_000;
const now = () => clock;
const calls = [];
const fetchImpl = async (url, opts) => {
  calls.push({ url, method: opts.method, headers: opts.headers, body: typeof opts.body === 'string' ? JSON.parse(opts.body) : opts.body });
  if (opts.method === 'GET' && /\/guilds\/\d+\/channels$/.test(url)) return { status: 200, json: async () => ([{ id: CH, type: 0, rate_limit_per_user: 0 }, { id: '121212121212121212', type: 2 }]) };
  if (opts.method === 'GET' && /\/roles$/.test(url)) return { status: 200, json: async () => ([]) };
  return { status: opts.method === 'DELETE' || opts.method === 'PUT' ? 204 : 200, json: async () => ({ id: String(calls.length) }) };
};
const sockets = [];
class FakeWS { constructor(url) { this.url = url; this.sent = []; sockets.push(this); } send(t) { this.sent.push(JSON.parse(t)); } close() { this.closed = true; } }
const queue = [], answered = [];
const brain = {
  cfg: { configFile, userName: 'Robin' }, queue, sessions: new Map(), logs: [],
  log(k, t) { this.logs.push(`${k}: ${t}`); },
  enqueue(sessionId, text, attach, effort, extra) { const j = { id: `job${queue.length}`, sessionId, text, state: 'waiting', ...extra }; queue.push(j); return { jobId: j.id, ahead: 0 }; },
  answerApproval(id, allow) { answered.push([id, allow]); return true; }
};
brain.constructor = { guessKind: () => 'chat' };
const later = [];
let n = 0;
const msg = (text, { author = PAT, roles = [], channel = CH, joined, mentions, ref } = {}) => ({ id: '9' + String(++n).padStart(17, '0'), channel_id: channel, guild_id: G, content: text, author: { id: author, username: author === PAT ? 'pat' : 'someone' }, member: { roles, ...(joined ? { joined_at: joined } : {}) }, ...(mentions ? { mentions } : {}), ...(ref ? { referenced_message: ref } : {}) });
const deleted = () => calls.filter((c) => c.method === 'DELETE' && /\/messages\/\d+$/.test(c.url));
const posted = () => calls.filter((c) => c.method === 'POST' && /\/messages$/.test(c.url));
const since = (i) => calls.slice(i);

// ---- Settings: off, then plain and checked
check('Keep order is off by default, and so is each brain use', !modSettings({}).enabled && !modSettings({}).askBrain && !modSettings({}).raid && !modSettings({}).welcome);
check('kicks and bans need your OK by default', modSettings({}).needOk === true);
check('Chat on Discord stays on unless switched off (today\'s behaviour)', discordSettings({}).chat === true && cleanDiscordPatch({ chat: false }).chat === false);
const mp = cleanModPatch({ enabled: 'yes', spam: true, floodCount: 999, channels: `${CH}\nnope`, logChannel: 'abc', words: 'Darn\nHeck,heck', prefix: 'bob', hacking: true });
check('only known keys, numbers kept in range, IDs checked', mp.enabled === false && mp.spam === true && mp.floodCount === 50 && mp.channels.length === 1 && mp.logChannel === '' && mp.words.length === 2 && !('prefix' in mp) && !('hacking' in mp));
check('a saved number out of range is pulled back in', modSettings({ discord: { mod: { timeoutMinutes: -5, kickAt: 1000 } } }).timeoutMinutes === 1 && modSettings({ discord: { mod: { kickAt: 1000 } } }).kickAt === 50);

// ---- The rules alone, no brain
check('one spelling for every way of writing a word', normalWord('H3LL0OOO') === 'helo' && normalWord('Ünïcödé') === 'unicode');
check('spaced-out letters are read as one word', wordsOf('you a b c d e f').includes('abcdef'));
const S = { ...MOD_DEFAULTS, enabled: true };
check('a Discord look-alike link is a scam', linkHit('free stuff https://dlscord-gift.com/claim', S)?.act === 'delete' && linkHit('https://disc0rd.gg.xyz/a', S)?.act === 'delete');
check('a Steam look-alike link is a scam', linkHit('https://steamcornmunity.ru/trade', S)?.act === 'delete');
check('real Discord and Steam links are fine', linkHit('https://discord.com/channels/1/2 and https://store.steampowered.com/app/1', S) === null);
check('free-gift bait with a link is a scam', linkHit('FREE NITRO for everyone https://example.com/x', S)?.act === 'delete');
check('@everyone with a link is a scam', linkHit('@everyone look https://example.com', S)?.act === 'delete');
check('an ordinary link is fine', linkHit('see https://example.com/page', S) === null);
check('an ordinary link from someone who joined minutes ago is only flagged', linkHit('see https://example.com/page', S, { newMember: true })?.act === 'flag');
check('invites are fine unless that switch is on', linkHit('join discord.gg/abc', S) === null && linkHit('join discord.gg/abc', { ...S, invites: true })?.act === 'delete');
check('your own blocked links', linkHit('https://www.badsite.example/x', { ...S, links: ['badsite.example'] })?.act === 'delete');
check('times read the way people write them', minutesOf('10m') === 10 && minutesOf('2h') === 120 && minutesOf('1d') === 1440 && minutesOf('30') === 30 && minutesOf('soon') === 0 && minutesOf('9999d') === 28 * 1440);
check('the ladder: warn, warn and time out (doubling), then kick, then ban', ladder(1, S).kind === 'warn' && ladder(2, S).kind === 'timeout' && ladder(2, S).minutes === 10 && ladder(3, S).minutes === 20 && ladder(4, S).kind === 'kick' && ladder(5, S).kind === 'ban');
check('0 means never on the ladder', ladder(9, { ...S, kickAt: 0, banAt: 0 }).kind === 'timeout');

// ---- Off: nothing happens
saveDiscord(brain.cfg, { enabled: true, autoAccept: true, channels: [], chat: true });
const b = new DiscordBridge(brain, { fetchImpl, WebSocketImpl: FakeWS, env: { [TOKEN_ENV]: TOKEN }, now, wait: async () => {}, modDir: dir, later: (fn, ms) => later.push({ fn, ms }) });
b.sync();
b.onGateway({ op: 10, d: { heartbeat_interval: 60000 } });
check('Keep order off: the bot asks for the usual events only', sockets[0].sent.find((x) => x.op === 2).d.intents === INTENTS);
b.onGateway({ op: 0, s: 1, t: 'READY', d: { session_id: 's1', resume_gateway_url: 'wss://gateway-us-east1-b.discord.gg', user: { id: '7', username: 'bob' } } });
clearInterval(b.beat);
let c0 = calls.length;
await b.handle(msg('free nitro https://dlscord-gift.com/x'));
check('Keep order off: a scam link stays, nothing is deleted', deleted().length === 0);
check('the tool is off too (hidden, and says so)', !modOn(brain.cfg) && /Keep order is off/.test(await modTool({ ...brain, discord: b }).run({ action: 'status' })));

// ---- On
saveDiscord(brain.cfg, { mod: { enabled: true, logChannel: LOG, modRoles: [MODR], words: ['darnit'], verifyRole: VERIFY, selfRoles: [FUN] } });
b.onGateway({ op: 0, s: 2, t: 'GUILD_CREATE', d: { id: G, name: 'Test server', owner_id: '555555555555555555', roles: [{ id: ADMIN, name: 'Admins', permissions: String(1 << 3) }, { id: FUN, name: 'Gamers', permissions: '0' }] } });
const q0 = queue.length;
c0 = calls.length;
await b.handle(msg('free nitro https://dlscord-gift.com/x'));
check('a scam link is deleted, with no brain asked', deleted().length === 1 && queue.length === q0);
const warnPost = posted().find((c) => c.url.endsWith(`/channels/${CH}/messages`));
check('the person is warned in the channel, pinging only them', warnPost && warnPost.body.allowed_mentions.users[0] === PAT && /Warning 1 of 2 before a timeout/.test(warnPost.body.content));
check('the warning notice tidies itself away', later.some((l) => l.ms === 30000));
check('the log channel gets it, pinging nobody', posted().some((c) => c.url.endsWith(`/channels/${LOG}/messages`) && /scam link/.test(c.body.content) && c.body.allowed_mentions.parse.length === 0));
check('the delete says why in the server\'s audit log', calls.find((c) => c.method === 'DELETE').headers['x-audit-log-reason']);
check('the record is kept in Bob\'s data folder', fs.existsSync(path.join(dir, 'discord-mod.json')));

clock += 120_000;
await b.handle(msg('this darnit thing'));
const to = calls.find((c) => c.method === 'PATCH' && c.url.endsWith(`/guilds/${G}/members/${PAT}`));
check('your own blocked word: deleted, second warning brings a 10-minute timeout', to && Date.parse(to.body.communication_disabled_until) - clock === 10 * 60000);
check('hidden inside other letters, a blocked word is only flagged', (await b.handle(msg('xxdarnitxx')), b.mod.openFlags().length === 1 && deleted().length === 2));

// Spam: a flood gets one warning, every message of it goes
clock += 120_000;
const before = deleted().length;
for (let i = 0; i < 5; i++) { await b.handle(msg(`message ${i}`)); clock += 500; }
check('a flood: the messages go, the person gets one warning', deleted().length - before === 5 && b.mod.warningsOf(G, PAT).length === 3, `${deleted().length - before} ${b.mod.warningsOf(G, PAT).length}`);
clock += 60_000;
for (let i = 0; i < 2; i++) { await b.handle(msg('buy my stuff')); clock += 4000; }
const d1 = deleted().length;
await b.handle(msg('buy my stuff'));
check('the same message three times in a minute is spam', deleted().length === d1 + 1);

// The fourth warning: a kick, waiting for your OK, with a holding timeout
check('fourth warning: the kick waits for your OK, nobody is kicked yet', b.mod.waiting().length === 1 && b.mod.waiting()[0].kind === 'kick' && !calls.some((c) => c.method === 'DELETE' && c.url.endsWith(`/members/${PAT}`)));
const hold = calls.filter((c) => c.method === 'PATCH' && c.url.endsWith(`/members/${PAT}`)).at(-1);
check('meanwhile they sit in a one-hour timeout', Date.parse(hold.body.communication_disabled_until) - clock === 60 * 60000);

// Moderators and admins are never moderated
const dm = deleted().length;
await b.handle(msg('free nitro https://dlscord-gift.com/x', { author: '565656565656565656', roles: [MODR] }));
await b.handle(msg('free nitro https://dlscord-gift.com/x', { author: '575757575757575757', roles: [ADMIN] }));
check('your moderator roles and admin roles are left alone', deleted().length === dm);

// Settings answer: Decline lifts the hold
const route = async (bod) => { let code, j; await discordRoute({ req: { method: 'POST' }, res: {}, p: '/api/discord', isLocal: true, brain: { ...brain, discord: b }, body: async () => bod, send: (r, c, x) => { code = c; j = x; } }); return { code, j }; };
const kid = b.mod.waiting()[0].id;
const rv = await route({});
check('Settings shows what waits, flags and the log', rv.j.mod.waiting.length === 1 && rv.j.mod.flags.length === 1 && rv.j.mod.log.length > 3 && rv.j.mod.enabled === true);
await route({ modAnswer: { id: kid, ok: false } });
const lift = calls.filter((c) => c.method === 'PATCH' && c.url.endsWith(`/members/${PAT}`)).at(-1);
check('Leave it: no kick, and the hold is lifted', b.mod.waiting().length === 0 && lift.body.communication_disabled_until === null && !calls.some((c) => c.method === 'DELETE' && c.url.endsWith(`/members/${PAT}`)));
check('answering twice is refused', (await route({ modAnswer: { id: kid, ok: true } })).code === 409);
check('settings save through the route, checked', (await route({ mod: { floodCount: 7, rules: 'Be kind.' } })).j.mod.floodCount === 7 && modSettings(brain.cfg).rules === 'Be kind.');

// Commands
c0 = calls.length;
await b.handle(msg('!ban <@333333333333333333> scams', { author: '565656565656565656', roles: [MODR], mentions: [{ id: PAT, username: 'pat' }] }));
check('a moderator\'s !ban waits for your OK too', b.mod.waiting().some((p) => p.kind === 'ban') && !calls.some((c) => c.method === 'PUT' && /\/bans\//.test(c.url)));
const bid = b.mod.waiting().find((p) => p.kind === 'ban').id;
await b.handle(msg(`!ok ${bid}`, { author: '565656565656565656', roles: [MODR] }));
check('only the owner can answer with !ok', b.mod.waiting().some((p) => p.id === bid));
saveDiscord(brain.cfg, { ownerId: OWNER, dmEnabled: false });
await b.handle(msg(`!ok ${bid}`, { author: OWNER }));
check('your own !ok bans', calls.some((c) => c.method === 'PUT' && c.url.endsWith(`/guilds/${G}/bans/${PAT}`)));
const before2 = calls.length;
await b.handle(msg('!kick <@333333333333333333>', { author: PAT }));
check('someone who isn\'t a moderator gets nothing from mod commands', !since(before2).some((c) => c.method === 'DELETE' && c.url.includes('/members/')));
await b.handle(msg('!timeout <@333333333333333333> 2h being rude', { author: OWNER }));
const t2 = calls.filter((c) => c.method === 'PATCH' && c.url.endsWith(`/members/${PAT}`)).at(-1);
check('!timeout with a time', Date.parse(t2.body.communication_disabled_until) - clock === 120 * 60000);
await b.handle(msg('!slowmode 15', { author: OWNER }));
check('!slowmode sets it on that channel', calls.some((c) => c.method === 'PATCH' && c.url.endsWith(`/channels/${CH}`) && c.body.rate_limit_per_user === 15));
await b.handle(msg('!role gamers', { author: '585858585858585858' }));
check('anyone can give themselves a role from your list', calls.some((c) => c.method === 'PUT' && c.url.endsWith(`/members/585858585858585858/roles/${FUN}`)));
const f0 = b.mod.openFlags().length;
await b.handle(msg('!report being weird', { author: '595959595959595959', ref: { id: '919191919191919191', author: { id: PAT, username: 'pat' }, content: 'weird stuff' } }));
check('!report as a reply flags that message for you, nothing else happens', b.mod.openFlags().length === f0 + 1 && /report: being weird/.test(b.mod.openFlags().at(-1).why) && queue.length === q0);

// Raid guard and welcome: only with their switches, and they ask Discord for member events
saveDiscord(brain.cfg, { mod: { ...brain.cfg.discord.mod, raid: true, raidJoins: 3, welcome: true, welcomeChannel: CH } });
check('Welcome or Raid guard on: the bot asks for member events', b.intents() === (INTENTS | MEMBERS_INTENT));
const joinAt = calls.length;
await b.mod.joined({ guild_id: G, user: { id: '600000000000000001', username: 'newbie' } });
const welcome = since(joinAt).find((c) => c.method === 'POST' && c.url.endsWith(`/channels/${CH}/messages`));
check('a new member is welcomed with the I agree button', welcome && /Welcome <@600000000000000001>/.test(welcome.body.content) && welcome.body.components[0].components[0].custom_id === `verify:${G}`);
let cb;
const fetchSpy = calls.length;
await b.mod.button({ id: '1', token: 't', guild_id: G, member: { user: { id: '600000000000000001' } }, data: { custom_id: `verify:${G}` } });
check('I agree gives the role you picked', calls.slice(fetchSpy).some((c) => c.method === 'PUT' && c.url.endsWith(`/members/600000000000000001/roles/${VERIFY}`)));
await b.mod.joined({ guild_id: G, user: { id: '600000000000000002' } });
await b.mod.joined({ guild_id: G, user: { id: '600000000000000003' } });
check('lots joining at once: slow mode on the text channels', calls.some((c) => c.method === 'PATCH' && c.url.endsWith(`/channels/${CH}`) && c.body.rate_limit_per_user === 30) && b.mod.state.lockdowns[G]);
clock += 16 * 60000;
b.mod.liftLockdowns();
await new Promise((r) => setTimeout(r, 10));
check('after the raid time, slow mode goes back as it was', !b.mod.state.lockdowns[G] && calls.filter((c) => c.method === 'PATCH' && c.url.endsWith(`/channels/${CH}`)).at(-1).body.rate_limit_per_user === 0);

// Chat off: no brain job, and Keep order still runs
saveDiscord(brain.cfg, { chat: false, channels: [CH] });
const q1 = queue.length;
await b.handle(msg('hey bob tell me a joke', { author: '610000000000000000' }));
await b.handle(msg('hey bob another', { author: '610000000000000000' }));
check('Chat on Discord off: no job (so no brain), said once', queue.length === q1 && posted().filter((c) => /Chat is switched off/.test(c.body.content)).length === 1);
const d2 = deleted().length;
await b.handle(msg('free nitro https://dlscord-gift.com/x', { author: '610000000000000000' }));
check('with chat off, Keep order still deletes', deleted().length === d2 + 1);

// A brain only for unclear cases, only when asked, and it can only remove or leave
saveDiscord(brain.cfg, { mod: { ...brain.cfg.discord.mod, askBrain: true } });
const q2 = queue.length;
await b.handle(msg('see https://example.com/page', { author: '620000000000000000', joined: new Date(clock - 60000).toISOString() }));
const review = queue[q2];
check('an unclear case gets one brain job, with no tools beyond use_tools', review && review.sessionId === REVIEW_SESSION && JSON.stringify(review.guest.tools) === '["use_tools"]' && review.guest.public);
const fid = b.mod.openFlags().at(-1).id;
b.watch({ sessionId: REVIEW_SESSION, turnId: review.id, type: 'token', text: 'REMOVE looks like spam' });
b.watch({ sessionId: REVIEW_SESSION, turnId: review.id, type: 'done' });
await new Promise((r) => setTimeout(r, 10));
check('the brain\'s REMOVE deletes and warns, and never posts its words to Discord', b.mod.state.flags.find((f) => f.id === fid).state === 'removed' && !posted().some((c) => /looks like spam/.test(c.body.content)));

// The tool for your own chats
const tool = modTool({ ...brain, discord: b });
check('the tool is registered as one that sends', TOOL_KINDS.discord_mod?.risk === 'send' && tool.alwaysAsk === true);
await b.handle(msg('!kick <@333333333333333333> again', { author: '565656565656565656', roles: [MODR], mentions: [{ id: PAT, username: 'pat' }] }));
const st = await tool.run({ action: 'show' });
const wid = b.mod.waiting()[0].id;
check('status lists what waits with its id (action words like show work)', st.includes(wid) && /kick pat/.test(st));
check('allowing a kick always shows an OK card', /^Kick pat/.test(tool.check({ action: 'approve', id: wid })) && tool.check({ action: 'status' }) === null);
check('a wrong id says so and changes nothing', /Nothing waits with id zzzzzz/.test(await tool.run({ action: 'allow', id: 'zzzzzz' })));
check('allow kicks, and says exactly that', (await tool.run({ action: 'allow', id: wid })) === 'Kicked pat from the server.' && calls.some((c) => c.method === 'DELETE' && c.url.endsWith(`/guilds/${G}/members/${PAT}`)));
check('again: already done, nothing changed', /already done\. Nothing changed/.test(await tool.run({ action: 'allow', id: wid })));
check('lockdown finds the only server by itself', /Slow mode 30 s on Test server/.test(await tool.run({ action: 'lockdown' })) && /back as it was/.test(await tool.run({ action: 'unlock' })));
check('an unknown action names the right ones', /status, allow, deny, lockdown or unlock/.test(await tool.run({ action: 'explode' })));

// The record survives a restart
const b2 = new DiscordBridge(brain, { fetchImpl, WebSocketImpl: FakeWS, env: { [TOKEN_ENV]: TOKEN }, now, modDir: dir });
check('warnings and the log come back after a restart', b2.mod.warningsOf(G, PAT).length >= 4 && b2.mod.state.log.length > 10);
clock += 31 * 86400_000;
check('warnings are forgotten after 30 days', b2.mod.warningsOf(G, PAT).length === 0);
check('the token never lands in the moderation record', !fs.readFileSync(path.join(dir, 'discord-mod.json'), 'utf8').includes(TOKEN));

b.stop(); b2.stop();
fs.rmSync(dir, { recursive: true, force: true });
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

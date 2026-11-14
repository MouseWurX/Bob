// Nov 13 (the owner): Bob-Net icons, "like a discord overlay" (src/net-overlay.js, public/net-overlay.js).
// Off unless turned on; an icon only for a Bob on Bob-Net right now or an agent you added; a chat from a Bob's icon goes
// to that Bob and never runs here; guest mode keeps only Web search. Nothing is added to a brain's start-up words.
// Fakes only: no network, no real Bobs.
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { overlayOn, chatIdFor, isNetChat, netChatTarget, hueFor, agentLook, cubeMood, cubeReader, overlayView, failNetChat, MOODS, NET_PREFIX } from '../src/net-overlay.js';
import { GuestJobs, guestNote, guestTools, CHAT_NOTE, sendAway, pickChatBob } from '../src/share-jobs.js';
import { cleanAbilities, helloFor } from '../src/share-brains.js';
import { preview, isNetChat as isNetChatPage, hslHex, BUBBLE_HINT, ICON_LIGHT, MOOD_WORDS, drawVoxels, GHOST } from '../public/net-overlay.js';

let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra ? ' ' + extra : ''}`); };
const read = (rel) => fs.readFileSync(fileURLToPath(new URL(`../${rel}`, import.meta.url)), 'utf8').replace(/\r\n/g, '\n');

// ---- off unless turned on ----
check('off unless turned on', overlayOn({}) === false && overlayOn({ netOverlay: 'yes' }) === false && overlayOn({ netOverlay: true }) === true);

// ---- a Bob's chat id ----
const laptop = { name: 'Laptop', address: '100.64.0.2' }, go = { name: 'Legion Go', address: '100.64.0.3' };
const id = chatIdFor(laptop.address);
check('a Bob\'s chat is a guest chat (never saved)', id.startsWith(NET_PREFIX) && /^guest-[a-zA-Z0-9-]{1,60}$/.test(id));
check('same Bob, same chat; another Bob, another', chatIdFor(laptop.address) === id && chatIdFor(go.address) !== id);
check('the page and Bob agree on what a Bob\'s chat is', isNetChat(id) && isNetChatPage(id) && !isNetChat('guest-abc') && !isNetChatPage('main'));
check('a chat goes to the Bob it was opened for', netChatTarget([go, laptop], id) === laptop && netChatTarget([go], id) === null && netChatTarget([laptop], 'main') === null);
check('each Bob has a steady colour of his own, never teal', hueFor('Laptop') === hueFor('laptop') && [...'abcdefghijklmnopqrstuvwxyz'].every((c) => { const h = hueFor('Bob ' + c); return h >= 0 && h < 360 && !(h >= 160 && h < 200); }));
check('agents nod to their own app, unknown ones get a plain cube', agentLook('claude').hue === 15 && agentLook('codex').mono === true && agentLook('mystery').mono === true);

// ---- his cube in one word ----
check('loading', cubeMood({ state: 'loading', loaded: 0 }) === 'loading' && cubeMood({ state: 'waking' }) === 'loading');
check('thinking, then replying once words stream', cubeMood({ state: 'thinking', loaded: 1, tokenAt: 0, now: 10000 }) === 'thinking' && cubeMood({ state: 'thinking', loaded: 1, tokenAt: 9500, now: 10000 }) === 'replying');
check('no brain: only fog', cubeMood({ state: 'idle', loaded: 0 }) === 'none' && cubeMood({ state: 'idle', loaded: 1 }) === 'ready');
check('every mood is one the icon knows', ['none', 'loading', 'thinking', 'replying', 'ready'].every((m) => MOODS.includes(m) && MOOD_WORDS[m]));

// ---- the cube reader: asks each Bob at most every 2 s, keeps the last mood when he's slow ----
{
  let t = 10000, calls = 0;
  const lenders = { call: async () => { calls++; return { ok: true, json: async () => ({ mood: 'thinking' }) }; } };
  const read1 = cubeReader({ now: () => t });
  const m1 = await read1(lenders, laptop); const m2 = await read1(lenders, laptop);
  t = 15000; await read1(lenders, laptop);
  check('reads his mood, at most every 2 s', m1 === 'thinking' && m2 === 'thinking' && calls === 2, `calls ${calls}`);
  const bad = { call: async () => ({ ok: true, json: async () => ({ mood: '<script>' }) }) };
  check('a mood he made up is ignored', (await cubeReader()(bad, go)) === 'ready');
}

// ---- what shows ----
{
  const seen = new Map([[laptop.address, { up: true, ok: false, jobs: ['chat', 'web'], brain: 'Gemma 4 E2B', device: 'computer' }], [go.address, { up: false, ok: false, why: 'not reachable' }]]);
  const off = await overlayView({ netOverlay: false }, { bobs: [laptop, go], seen: (b) => seen.get(b.address) });
  check('off: nothing shows', off.on === false && !off.bobs.length && !off.agents.length);
  const v = await overlayView({ netOverlay: true }, { bobs: [laptop, go], seen: (b) => seen.get(b.address), mood: async () => 'replying', agents: { on: true, agents: [{ id: 'a1', name: 'Claude Code', kind: 'claude', state: 'done', log: ['— You ask: fix it', 'Fixed the test.', '! warning'] }] } });
  // Nov 13 (the owner: a test Bob showed as connected but with no cube head): a Bob with no brain keeps a grey cube.
{
  const fake = () => { const c = { fills: [], beginPath() {}, moveTo() {}, lineTo() {}, closePath() {}, fill() { c.fills.push(c.fillStyle); }, stroke() {}, save() {}, restore() {}, arc() {} }; return c; };
  const none = fake(); drawVoxels(none, { hue: 40, light: () => -1 });
  const ghost = fake(); drawVoxels(ghost, { hue: 40, light: () => -1, ghost: true });
  check('a cube with no light and no ghost draws nothing, as before', none.fills.length === 0);
  check('the ghost cube draws all 64 blocks, faint and nearly grey', ghost.fills.length === 64 * 3 && ghost.fills.every((f) => f.startsWith(`hsla(40,${GHOST.sat}%`)));
  const pub = fs.readFileSync(new URL('../public/net-overlay.js', import.meta.url), 'utf8');
  check('no brain over there: the icon draws the grey cube, not just fog', /if \(mood === 'none'\) \{[^\n]*ghost: true/.test(pub) && !/if \(mood === 'none'\) return;/.test(pub));
}
check('only Bobs on Bob-Net right now', v.bobs.length === 1 && v.bobs[0].name === 'Laptop' && v.bobs[0].chat === id && v.bobs[0].mood === 'replying' && v.bobs[0].canChat === true);
  check('an agent you added, with its last line', v.agents.length === 1 && v.agents[0].last === 'Fixed the test.' && v.agents[0].look.sign === 'spark');
  const noAgents = await overlayView({ netOverlay: true }, { bobs: [], agents: { on: false, agents: [{ id: 'x' }] } });
  check('coding agents off: no agent icons', noAgents.agents.length === 0);
  seen.set(laptop.address, { up: true, jobs: ['web'] });
  check('an older Bob shows, but can\'t take a chat', (await overlayView({ netOverlay: true }, { bobs: [laptop], seen: (b) => seen.get(b.address) })).bobs[0].canChat === false);
}

// ---- the hello says it takes chats; the asking Bob keeps that ----
{
  const brain = { cfg: { share: { takeJobs: true }, remote: { enabled: true, passcode: 'abcdef' } }, queue: [], engine: {} };
  const h = helloFor(brain, { why: 'off', quick: null, can: {}, version: 'x', label: (m) => m, webOn: false, bigBrain: false });
  check('a Bob taking jobs says chat, even with no picture model', h.takesJobs === true && h.jobs.includes('chat') && !h.jobs.includes('pictures'), JSON.stringify(h.jobs));
  const shut = helloFor({ ...brain, cfg: { share: { takeJobs: false }, remote: { enabled: true, passcode: 'abcdef' } } }, { why: 'off', quick: null, can: {}, version: 'x', label: (m) => m });
  check('Take jobs off: no chat', shut.jobs.length === 0);
  check('the asking Bob keeps chat in what he can do', cleanAbilities({ takesJobs: true, jobs: ['chat', 'web', 'evil'] }).jobs.join() === 'chat,web');
  check('nothing made up gets through', !cleanAbilities({ takesJobs: true, jobs: ['evil'] }).jobs.length);
}

// ---- the Bob doing it: a chat job, thinking plus web search at most ----
{
  const queued = [];
  const cfg = { share: { takeJobs: true }, remote: { enabled: true, passcode: 'abcdef' } };
  const brain = { cfg, queue: [], sessions: new Map(), enqueue: (sid, text, a, effort, extra) => { queued.push({ sid, text, effort, extra }); return { jobId: 'j' + queued.length }; }, log: () => {} };
  const g = new GuestJobs(brain, { canNow: () => [] });
  const r = g.start({ need: 'chat', from: 'Desk', text: 'hello there' });
  const j = queued.at(-1);
  check('a chat job is taken even when he can\'t make pictures', r.status === 200 && j?.extra.guest.chat === true && j.extra.kind === 'chat' && j.sid.startsWith('guest-'));
  check('no web search unless the asking Bob has it on', j.extra.guest.tools.length === 0);
  g.start({ need: 'chat', from: 'Desk', text: 'look it up', web: true });
  check('web on there: web search and page reading', queued.at(-1).extra.guest.tools.join() === 'web_search,fetch_page');
  cfg.share.takeJobs = false;
  check('Take jobs off: no chat', g.start({ need: 'chat', from: 'Desk', text: 'hi' }).status === 409);
  const chatJob = { guest: { from: 'Desk', need: 'chat', chat: true, tools: [] } };
  const webJob = { guest: { from: 'Desk', need: 'chat', chat: true, tools: ['web_search', 'fetch_page'] } };
  const tools = ['web_search', 'fetch_page', 'make_image', 'run_program', 'read_file', 'remember'].map((n) => ({ function: { name: n } }));
  check('chat with web off: no tools at all', guestTools(chatJob, tools).length === 0);
  check('chat with web on: web search and page reading only', guestTools(webJob, tools).map((t) => t.function.name).join() === 'web_search,fetch_page');
  const note = guestNote(webJob, 'Sam');
  check('the one-line note says who and what he may do', note.includes('Sam is talking to you from Desk') && note.includes('web search') && !guestNote(chatJob, 'Sam').includes('web search') && note.split('\n').length === 1);
  check('the note is short', CHAT_NOTE.length < 260);
}

// ---- the asking Bob: a chat goes to that Bob only, and never runs here ----
{
  const hellos = new Map([[laptop.address, { up: true, takesJobs: true, jobs: ['chat'], jobsBusy: '' }], [go.address, { up: true, takesJobs: true, jobs: ['web'] }]]);
  const lenders = { hello: async (b) => hellos.get(b.address) };
  check('picks the Bob whose icon it was', (await pickChatBob(lenders, laptop))?.address === laptop.address);
  check('not a Bob who doesn\'t take chats', (await pickChatBob(lenders, go)) === null);
  hellos.set(laptop.address, { up: true, takesJobs: true, jobs: ['chat'], jobsBusy: 'gaming' });
  check('not while he\'s busy', (await pickChatBob(lenders, laptop)) === null);

  // sendAway with a fake lender that says no: the job isn't run here
  const events = [];
  const job = { id: 'j9', sessionId: id, text: 'hi', at: 1, effort: 'low' };
  const brain = { cfg: {}, awayJobs: new Map(), awayApprovals: new Map(), broadcast: (e) => events.push(e), saveQueue: () => {}, session: () => [], saveSession: () => {}, log: () => {}, pump: () => {} };
  const went = await sendAway(brain, job, { need: 'chat', why: 'guest', to: laptop, web: true }, { lenders: { hello: async () => ({ up: false }), pickForJob: async () => { throw new Error('should not pick another Bob'); } } });
  check('nobody to take it: not sent, and not picked from the others', went === false);
  const msgs = [];
  failNetChat({ ...brain, session: () => msgs }, job, 'Laptop');
  check('then it fails with a plain reason, in that chat', job.state === 'failed' && msgs.at(-1).content.includes('Laptop isn\'t taking chats') && events.some((e) => e.type === 'done' && e.sessionId === id));
}

// ---- the queue: a Bob's chat never runs on this computer ----
{
  const q = read('src/brain-queue.js');
  check('the queue sends a Bob\'s chat before anything else', /netChatTarget\(this\.lenders/.test(q) && q.indexOf('netChatTarget(this.lenders') < q.indexOf('awayPlan(this, job'));
  check('a chat for a Bob no longer listed fails, never runs here', /isNetChat\(job\.sessionId\)\) \{ failNetChat/.test(q));
  const sj = read('src/share-jobs.js');
  check('a chat that never started isn\'t brought back here', sj.includes("if (!started && failed && plan.need !== 'chat')"));
}

// ---- the page ----
{
  check('previews end on a whole word, never cut mid-word', preview('word '.repeat(60)).endsWith('word…') && preview('short reply') === 'short reply');
  check('hex colours for the fog', hslHex(0, 100, 50) === '#ff0000' && /^#[0-9a-f]{6}$/.test(hslHex(140, 36, 32)));
  check('icons stay dimmer than Bob', ICON_LIGHT <= 0.6);
  check('bubble hints: click and right-click; tap and swipe', BUBBLE_HINT.mouse.includes('right-click to dismiss') && BUBBLE_HINT.touch.includes('swipe away'));
  const css = read('public/style.css');
  check('guest mode keeps only Web search', css.includes('body.net-guest .effort > :not(#webBtn):not(.net-help)') && css.includes('body.net-guest #handsQuick'));
  check('pointing ebbs and flows in place, Bob\'s cube too', css.includes('@keyframes net-ebb') && css.includes('body.look-lamplight .bob-cube.porthole:hover .port') && !/net-ebb[^}]*translate/.test(css));
  check('no motion when animations are off', /prefers-reduced-motion: reduce\) \{ \.net-row/.test(css) && css.includes('body.still .net-row'));
  check('the glow is small', /radial-gradient\(circle 80px/.test(read('public/net-overlay.js')));
  const page = read('public/net-overlay.js');
  check('Return from Guest Mode, right-click, swipe and keys', page.includes('Return from Guest Mode') && page.includes("'contextmenu'") && page.includes('Math.abs(dx) > 60') && page.includes("e.key === 'Delete'"));
  check('the page is wired in', /createNetOverlay\(\{ open: \(id\) => openChat\(id\)/.test(read('public/app.js')) && read('public/app.js').includes('netOverlay?.event(ev)'));
  check('leaving a Bob\'s chat keeps it', read('public/harness-chat.js').includes("!/^guest-net-/.test(last)"));
}

// ---- setting, Help, glossary, FAQ ----
{
  const pages = read('public/cellar-pages.js'), help = read('public/help-content.js');
  check('the switch is in Settings, Bob-Net, off', pages.includes("sswitch('netOverlay', settings.netOverlay === true, 'Bob-Net icons', '"));
  check('saved as a plain on or off', read('src/config.js').includes("out.netOverlay = out.netOverlay === true") && read('src/config.js').includes("'netOverlay'"));
  check('Help, glossary and FAQ', help.includes("id: 'net-overlay'") && help.includes('<dt>Guest mode</dt>') && help.includes("id: 'faq-net-overlay'") && help.includes("set('Bob-Net icons', 'Off'"));
  check('Help says where it doesn\'t work yet', /Android app's own screens don't have it yet/.test(help));
  check('nothing in a brain\'s start-up words', !/net-overlay|netOverlay/.test(read('src/brain-prompting.js')) && !/netOverlay/.test(read('src/prompts.js')));
}

// 1.5.228 chat heads: Discord and Telegram show their own head when they're on, with Bob-Net icons on or off.
{
  const { roomLook, roomWords, SIGNS, ROOM_LOOKS } = await import('../public/net-overlay.js');
  const { roomPages } = await import('../public/room-chat.js');
  const rooms = [{ id: 'discord', name: 'Discord', waiting: 2 }, { id: 'telegram', name: 'Telegram', chat: 'telegram' }, { id: 'Bad id!', name: 'x' }];
  const offV = await overlayView({ netOverlay: false }, { rooms });
  check('chat heads show with Bob-Net icons off, and only those', offV.on === false && offV.bobs.length === 0 && offV.rooms.map((r) => r.id).join() === 'discord,telegram');
  const onV = await overlayView({ netOverlay: true }, { rooms });
  check('and with it on', onV.rooms.length === 2 && onV.rooms[0].waiting === 2 && onV.rooms[1].chat === 'telegram');
  check('no chat bot on: no heads', (await overlayView({ netOverlay: false }, {})).rooms.length === 0);
  check('each company has its own cube colour and its own sign', roomLook('discord').hue !== roomLook('telegram').hue && SIGNS[ROOM_LOOKS.discord.sign] && SIGNS[ROOM_LOOKS.telegram.sign] && ROOM_LOOKS.telegram.sign !== 'plane');
  check('the Discord head says what waits', roomWords(onV.rooms[0]) === 'Discord group chat: 2 waiting for your OK' && roomWords(onV.rooms[1]) === 'Telegram: your chat');
  const lines = [
    { id: 'a1', kind: 'ask', at: 1, where: '111', whereName: 'general', text: 'hi', state: 'done' },
    { id: 'b1', kind: 'bob', at: 2, to: 'a1', text: 'hello' },
    { id: 'a2', kind: 'ask', at: 3, where: '222', whereName: 'memes', text: 'joke', state: 'waiting' },
    { id: 'a3', kind: 'ask', at: 4, where: '333', text: 'old', state: 'declined' }
  ];
  const pages = roomPages(lines);
  check('each channel is its own page, the one waiting first', pages.map((p) => p.name).join() === '#memes,Channel …333,#general' && pages[0].waiting === 1);
  check('Bob\'s reply sits on its request\'s page', pages.find((p) => p.id === '111').lines.map((l) => l.id).join() === 'a1,b1');
  const page = read('public/net-overlay.js');
  check('a head opens its own chat: Discord its group chat, Telegram your Telegram chat', /if \(s\.it\.chat\) open\(s\.it\.chat\); else openRoom\(s\.it\.id\)/.test(page));
  check('a new request gives a word bubble, never a sound or pop-up', /ev\.type === 'room'/.test(page) && !/new Audio|Notification\(/.test(page));
}

// ---- 1.5.228 Settings, Agents: a section per company, each with its own chat head (off unless turned on) ----
{
  const { COMPANIES, cleanChatHeads, companyHeads } = await import('../src/net-overlay.js');
  const { companyWords } = await import('../public/net-overlay.js');
  const map = await import('../public/settings-map.js');
  const cellar = read('public/cellar.js'), pages = read('public/cellar-pages.js'), help = read('public/help-content.js');
  check('every company has its coding program and a look of its own', COMPANIES.every((c) => c.kind && agentLook(c.kind)) && COMPANIES.map((c) => c.id).join() === 'claude,openai,gemini,qwen,opencode');
  check('chat heads are off unless turned on, and only known companies are kept', JSON.stringify(cleanChatHeads({})) === '{}' && JSON.stringify(cleanChatHeads({ claude: true, qwen: 'yes', evil: true })) === '{"claude":true}' && JSON.stringify(cleanChatHeads([true])) === '{}');
  const agents = { on: true, agents: [{ id: 'a', name: 'reviewer', kind: 'claude', state: 'working', log: ['reading'] }, { id: 'b', name: 'fixer', kind: 'claude', state: 'needs-you', log: ['May I push?'] }, { id: 'c', name: 'cx', kind: 'codex', state: 'done', log: [] }] };
  check('no head for a company that is off', companyHeads({}, agents).length === 0);
  const heads = companyHeads({ chatHeads: { claude: true, qwen: true } }, agents);
  const cl = heads.find((h) => h.id === 'claude'), qw = heads.find((h) => h.id === 'qwen');
  check('a head shows its most pressing agent: needs you before working', cl.state === 'needs-you' && cl.needsYou === 1 && cl.agents === 2 && cl.last === 'May I push?');
  check('a head with no agents yet says so, and is still there', qw.agents === 0 && qw.state === 'idle' && companyWords(qw) === 'No agents yet' && companyWords(cl) === '1 needs you');
  const off = await overlayView({ chatHeads: { claude: true } }, { agents });
  check('a company head shows with Bob-Net icons off', off.on === false && off.companies.length === 1 && off.agents.length === 0);
  const onV = await overlayView({ netOverlay: true, chatHeads: { claude: true } }, { agents });
  check('with icons on, an agent whose company has a head shows only there, never twice', onV.companies.length === 1 && onV.agents.every((a) => a.kind !== 'claude') && onV.agents.some((a) => a.kind === 'codex'));
  check('Settings has an Agents group and card with every section', map.GROUPS.some(([g, ids]) => g === 'Agents' && ['claude', 'openai', 'gemini', 'qwen', 'opencode', 'discord', 'telegram'].every((x) => ids.includes('adv-' + x))) && map.CARDS.some((c) => c.id === 'agents'));
  check('each section is a real panel with Help', ['claude', 'openai', 'gemini', 'qwen', 'opencode', 'discord', 'telegram'].every((x) => cellar.includes(`['${x}', '`) && help.includes(`id: 'settings-${x}'`)) && help.includes("id: 'settings-agents'"));
  check('nothing was taken away: the Cloud helper, coding agent and Hands for Claude are drawn in the sections', /cloudRow\(helper\)/.test(pages) && /agentsSettingsHtml\(co\.kind\)/.test(pages) && /co\.id === 'claude' \? .*claudeDoorHtml\(\)/.test(pages) && /COMPANY_CLOUDS\.includes/.test(pages));
  check('Discord and Telegram moved whole', /chatAppHtml\('discord'\)/.test(cellar) && /discordHtml\(\)/.test(pages) && /telegramHtml\(\)/.test(pages) && !/\$\{telegramHtml\(\)\}\n\s*\$\{discordHtml\(\)\}/.test(pages));
  check('every coding agents box is mounted, the general one and each company\'s', /mountAgentsSettings\(dlg\.querySelectorAll\('\.coding-agents-box'\)\)/.test(cellar));
  check('the head switch saves through /api/settings and redraws the heads', /chatHead-/.test(cellar) && /b\.chatHeads/.test(read('src/server.js')) && /cleanChatHeads/.test(read('src/config.js')));
  check('Help explains why they used to be apart (key vs sign-in vs the other way round)', /faq-agents-sections/.test(help) && /API key/.test(help) && /sign-in/.test(help));
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);

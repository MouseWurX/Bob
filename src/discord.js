// Bob on Discord (Settings, Online services). Off unless you turn it on.
//
// Bob joins your Discord server as a bot: you make the bot yourself in the Discord Developer Portal and give Bob its
// token. Never a normal user account (that's against Discord's rules). The token lives where the cloud keys live: a
// Windows user variable named BOB_DISCORD_TOKEN (or ~/.config/bob/env on Mac and Linux). The Settings box writes it there
// for you; Bob never shows it again and it never goes in his own settings files.
//
// How people call him: a message in one of the channels you list that matches your wake phrase, "hey bob*" by default.
// The * is the wildcard: whatever stands there is the job. "hey bob draw a cat" -> "draw a cat". You can change the phrase
// (the * can sit anywhere, "bob, * please" works too) and switch case sensitivity on or off (off by default).
//
// Discord is other people, so a Discord job is a guest job, stricter than one from your own other Bobs:
//   - only the job types you tick (chat and code help on by default; web search, pictures, clips, music, sounds off);
//   - no files, folders, programs, Hands, reminders, memory, "about me", backstory, saved how-tos or Help readouts of
//     your settings; no reference pictures, so nothing you made can be edited, copied or described there;
//   - his reply goes only to the channel it was asked in, as a reply to that message, and never @mentions anyone;
//   - every reply is cleaned first: your names, this computer's name, your home folder, any file path, any address of
//     Bob's own pages and anything that looks like a key or token are taken out;
//   - files: only the ones made for that very request, and only while "Share what Bob makes for Discord" is on (off by
//     default). Never anything older, never anything made for you.
//   - OK cards are never shown there and never land on your PC from Discord: a Discord job that would need one is told No.
// Nothing from Discord is kept as a chat here. Tasks shows the jobs as "From Discord".
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { rentKeyEnv } from './rental.js';
import { scrubber } from './help-bundle.js';
import { outputDirs } from './config.js';

export const TOKEN_ENV = 'BOB_DISCORD_TOKEN';
export const DISCORD_SESSION = 'discord'; // session ids are discord-<channel id>
const API = 'https://discord.com/api/v10'; // fixed here, so a settings file can't send anything anywhere else
const GATEWAY = 'wss://gateway.discord.gg/?v=10&encoding=json';
const MAX_TEXT = 1900; // Discord's limit is 2000 characters a message
const MAX_FILE = 10 * 1024 * 1024; // Discord takes files up to 10 MB without a boosted server
const MAX_IN = 2000;
const MAX_WAITING = 3; // Discord jobs waiting or working at once
const COOLDOWN_MS = 15000; // per person, between jobs
const HISTORY = 12; // lines of a channel's talk Bob keeps in mind, in memory only
// GUILDS | GUILD_MESSAGES | MESSAGE_CONTENT. Message Content is a "privileged" intent: switch it on in the portal.
export const INTENTS = 1 | (1 << 9) | (1 << 15);
const TOKEN_RX = /^[A-Za-z0-9_-]{20,40}\.[A-Za-z0-9_-]{4,10}\.[A-Za-z0-9_-]{20,60}$/;
const ID_RX = /^\d{15,22}$/;
export const DEFAULT_WAKE = 'hey bob*';

// What people on Discord may ask for. Each one is a tick box; chat and code help start on, the rest off.
export const JOB_TYPES = [
  { id: 'chat', label: 'Chat and answers', tools: [], on: true },
  { id: 'code', label: 'Help with code', tools: [], on: true },
  { id: 'web', label: 'Search the web', tools: ['web_search', 'fetch_page'], on: false },
  { id: 'pictures', label: 'Make pictures', tools: ['make_image'], on: false },
  { id: 'clips', label: 'Make video clips', tools: ['make_video'], on: false },
  { id: 'music', label: 'Make music', tools: ['make_music'], on: false },
  { id: 'sounds', label: 'Make sound effects', tools: ['make_sound'], on: false }
];
const ALWAYS_TOOLS = ['use_tools']; // only loads tool groups; what's in them is still checked against the list

export function discordSettings(cfg) {
  const d = cfg.discord || {};
  const jobs = {};
  for (const t of JOB_TYPES) jobs[t.id] = typeof d.jobs?.[t.id] === 'boolean' ? d.jobs[t.id] : t.on;
  const ids = (a) => [...new Set([].concat(a || []).map(String).filter((x) => ID_RX.test(x)))].slice(0, 50);
  return {
    enabled: d.enabled === true,
    wake: cleanWake(d.wake) || DEFAULT_WAKE,
    caseSensitive: d.caseSensitive === true,
    channels: ids(d.channels),
    people: ids(d.people),
    jobs,
    share: d.share === true
  };
}

export function cleanWake(w) {
  const s = String(w ?? '').replace(/[\u0000-\u001f]/g, '').trim().slice(0, 100);
  return s.replace(/\*/g, '').trim() ? s : '';
}

// Lives in config.json only, never in settings.json, like Telegram: nothing that can write Bob's settings file can
// open this door. Only the Settings page on this PC calls this.
export function saveDiscord(cfg, patch) {
  let raw = {};
  try { raw = JSON.parse(fs.readFileSync(cfg.configFile, 'utf8')); } catch {}
  raw.discord = { ...(raw.discord || {}), ...patch };
  for (const k of Object.keys(raw.discord)) if (raw.discord[k] === undefined) delete raw.discord[k];
  delete raw.discord.token; // never kept here
  fs.writeFileSync(cfg.configFile, JSON.stringify(raw, null, 2));
  cfg.discord = raw.discord;
}

// Only these keys, only these types.
export function cleanDiscordPatch(b = {}, current = {}) {
  const out = {};
  for (const k of ['enabled', 'caseSensitive', 'share']) if (k in b) out[k] = b[k] === true;
  if ('wake' in b) { const w = cleanWake(b.wake); if (w) out.wake = w; }
  const list = (v) => [...new Set(String(Array.isArray(v) ? v.join(' ') : v || '').split(/[\s,;]+/).filter((x) => ID_RX.test(x)))].slice(0, 50);
  if ('channels' in b) out.channels = list(b.channels);
  if ('people' in b) out.people = list(b.people);
  if (b.jobs && typeof b.jobs === 'object') {
    out.jobs = { ...(current.jobs || {}) };
    for (const t of JOB_TYPES) if (t.id in b.jobs) out.jobs[t.id] = b.jobs[t.id] === true;
  }
  return out;
}

// The wake phrase. "hey bob*" -> the text after "hey bob". The * may sit anywhere: "bob, * please". No * means one at
// the end. A phrase that ends in a letter needs a gap after it, so "hey bobby" isn't "hey bob" + "by".
export function matchWake(pattern, text, caseSensitive = false) {
  const p = cleanWake(pattern) || DEFAULT_WAKE;
  const star = p.indexOf('*');
  const pre = star < 0 ? p : p.slice(0, star);
  const post = star < 0 ? '' : p.slice(star + 1).replace(/\*/g, '');
  const raw = String(text || '').trim();
  const fold = (s) => (caseSensitive ? s : s.toLowerCase());
  const t = fold(raw);
  if (!t.startsWith(fold(pre)) || !t.endsWith(fold(post)) || raw.length < pre.length + post.length) return null;
  const mid = raw.slice(pre.length, raw.length - post.length);
  if (/[\p{L}\p{N}]$/u.test(pre) && /^[\p{L}\p{N}]/u.test(mid)) return null;
  if (/^[\p{L}\p{N}]/u.test(post) && /[\p{L}\p{N}]$/u.test(mid)) return null;
  return mid.replace(/^[\s,:;.!?-]+/, '').trim();
}

// What kind of job a request is, in the words of the tick boxes.
const MUSIC = /\b(song|music|tune|track|melody|beat|chiptune|soundtrack|jingle)\b/i;
const SFX = /\b(sound effects?|sfx|sound of|noise of)\b/i;
export function jobTypeOf(text, guessKind) {
  if (MUSIC.test(text)) return 'music';
  if (SFX.test(text)) return 'sounds';
  const k = guessKind ? guessKind(text) : 'chat';
  return { picture: 'pictures', video: 'clips', research: 'web', code: 'code' }[k] || 'chat';
}

export function toolsFor(s) {
  return [...ALWAYS_TOOLS, ...JOB_TYPES.filter((t) => s.jobs[t.id]).flatMap((t) => t.tools)];
}

// Takes out of a reply everything that belongs to the owner or this computer.
const PATHS = /(?:\b[a-z]:[\\/]|\\\\[\w.-]+\\|(?<![\w.])~[\\/]|(?<![\w:/.])\/(?:home|users|mnt|var|tmp|etc|opt|root|private|volumes)\/)[^\s"'`<>|*?]*/gi;
const OWN_PAGES = /(?:https?:\/\/(?:localhost|127\.0\.0\.1|\[::1\]|0\.0\.0\.0|[\w-]+\.local|192\.168\.\d+\.\d+|10\.\d+\.\d+\.\d+)(?::\d+)?)?\/(?:images|api|made|files)\/[^\s)>"']*/gi;
const MADE_NAMES = /\b\d{4}-\d{2}-\d{2}-[0-9a-f]{8}\.(?:png|jpe?g|webp|mp4|webm|wav|mp3|ogg|flac)\b/gi;
export function cleaner(cfg, opts) {
  const scrub = scrubber(cfg, opts);
  return (text) => scrub(String(text || ''))
    .replace(PATHS, '[a folder on the owner\'s computer]')
    .replace(OWN_PAGES, '[Bob\'s own page]')
    .replace(MADE_NAMES, '[a file]')
    .replace(/@(everyone|here)\b/g, '@\u200b$1');
}

export function chunks(text, max = MAX_TEXT) {
  const out = [];
  let s = String(text || '').trim();
  while (s.length > max) {
    let cut = s.lastIndexOf('\n', max);
    if (cut < max / 2) cut = s.lastIndexOf(' ', max);
    if (cut < max / 2) cut = max;
    out.push(s.slice(0, cut).trim());
    s = s.slice(cut).trim();
  }
  if (s) out.push(s);
  return out;
}

// Saves the pasted token where Bob reads keys from: the Windows user variables, or ~/.config/bob/env.
export function storeToken(token, { platform = process.platform, home = os.homedir(), run = execFile } = {}) {
  return new Promise((resolve, reject) => {
    if (platform === 'win32') {
      return run('reg', ['add', 'HKCU\\Environment', '/v', TOKEN_ENV, '/t', 'REG_SZ', '/d', token, '/f'], { windowsHide: true, timeout: 5000 }, (e) => (e ? reject(new Error('Windows didn\'t save it.')) : resolve()));
    }
    try {
      const dir = path.join(home, '.config', 'bob');
      fs.mkdirSync(dir, { recursive: true });
      const f = path.join(dir, 'env');
      let lines = [];
      try { lines = fs.readFileSync(f, 'utf8').split(/\r?\n/).filter((l) => l && !new RegExp(`^\\s*(export\\s+)?${TOKEN_ENV}\\s*=`).test(l)); } catch {}
      lines.push(`${TOKEN_ENV}=${token}`);
      fs.writeFileSync(f, lines.join('\n') + '\n', { mode: 0o600 });
      try { fs.chmodSync(f, 0o600); } catch {}
      resolve();
    } catch (e) { reject(new Error(`Couldn't save it: ${e.code || 'error'}`)); }
  });
}

export class DiscordBridge {
  constructor(brain, { fetchImpl = globalThis.fetch, WebSocketImpl = globalThis.WebSocket, env = rentKeyEnv(), now = Date.now, wait = (ms) => new Promise((r) => setTimeout(r, ms)), store = storeToken, cleanOpts } = {}) {
    this.brain = brain;
    this.cfg = brain.cfg;
    this.fetch = fetchImpl;
    this.WS = WebSocketImpl;
    this.env = env;
    this.now = now;
    this.wait = wait;
    this.store = store;
    this.clean = cleaner(this.cfg, cleanOpts);
    this.pasted = ''; // a token pasted this run, until Windows hands it to new processes
    this.running = false;
    this.ws = null;
    this.beat = null;
    this.seq = null;
    this.session = null; // { id, resumeUrl } for a resume after a drop
    this.botId = '';
    this.botName = '';
    this.status = 'off';
    this.jobs = new Map(); // job id -> { channelId, messageId, text, startedAt, files, said }
    this.lastAsk = new Map(); // person id -> time of their last job
  }

  token() { const t = String(this.pasted || this.env[TOKEN_ENV] || '').trim(); return TOKEN_RX.test(t) ? t : ''; }
  settings() { return discordSettings(this.cfg); }
  log(t) { this.brain.log?.('discord', t); }

  sync() {
    const s = this.settings();
    if (s.enabled && this.token()) { if (!this.running) this.start(); }
    else this.stop(s.enabled ? 'no token' : 'off');
  }

  stop(why = 'off') {
    this.running = false;
    this.status = why;
    clearInterval(this.beat);
    this.beat = null;
    try { this.ws?.close(1000); } catch {}
    this.ws = null;
  }

  start() {
    if (!this.WS) { this.status = 'no websocket'; this.log('this Node has no WebSocket; Discord needs Node 22 or newer'); return; }
    this.running = true;
    this.status = 'starting';
    this.backoff = 5000;
    this.connect();
  }

  connect(resume = false) {
    if (!this.running) return;
    const url = resume && this.session?.resumeUrl ? `${this.session.resumeUrl}/?v=10&encoding=json` : GATEWAY;
    if (!/^wss:\/\/[\w.-]+\.discord\.gg\//.test(url)) return this.connect(false);
    let ws;
    try { ws = new this.WS(url); } catch (e) { return this.retry(`couldn't connect (${e.message})`); }
    this.ws = ws;
    this.acked = true;
    ws.onmessage = (m) => { try { this.onGateway(JSON.parse(typeof m.data === 'string' ? m.data : String(m.data)), resume); } catch (e) { this.log(`odd message from Discord: ${e.message}`); } };
    ws.onclose = (e) => { if (this.ws === ws) this.onClose(e?.code); };
    ws.onerror = () => {};
  }

  send(op, d) { try { this.ws?.send(JSON.stringify({ op, d })); } catch {} }

  onGateway(p, resume) {
    if (p.s != null) this.seq = p.s;
    if (p.op === 10) {
      clearInterval(this.beat);
      const every = Math.max(1000, Number(p.d?.heartbeat_interval) || 41250);
      this.beat = setInterval(() => {
        if (!this.acked) { this.log('Discord stopped answering; connecting again'); try { this.ws?.close(4000); } catch {} return; }
        this.acked = false;
        this.send(1, this.seq);
      }, every);
      this.beat.unref?.();
      if (resume && this.session?.id) this.send(6, { token: this.token(), session_id: this.session.id, seq: this.seq });
      else this.send(2, { token: this.token(), intents: INTENTS, properties: { os: process.platform, browser: 'Bob', device: 'Bob' } });
      return;
    }
    if (p.op === 11) { this.acked = true; return; }
    if (p.op === 1) { this.send(1, this.seq); return; }
    if (p.op === 7) { try { this.ws?.close(4000); } catch {} return; } // Discord asks for a reconnect
    if (p.op === 9) { if (!p.d) this.session = null; try { this.ws?.close(4000); } catch {} return; }
    if (p.op !== 0) return;
    if (p.t === 'READY') {
      this.session = { id: p.d?.session_id, resumeUrl: String(p.d?.resume_gateway_url || '') };
      this.botId = String(p.d?.user?.id || '');
      this.botName = String(p.d?.user?.username || '');
      this.status = 'on';
      this.backoff = 5000;
      this.log(`connected to Discord as ${this.botName || 'the bot'}`);
    } else if (p.t === 'RESUMED') { this.status = 'on'; this.backoff = 5000; }
    else if (p.t === 'MESSAGE_CREATE') this.handle(p.d).catch((e) => this.log(`message not handled: ${e.message}`));
  }

  onClose(code) {
    clearInterval(this.beat);
    this.beat = null;
    if (!this.running) return;
    // These won't get better by trying again.
    const fatal = { 4004: 'bad token', 4010: 'bad token', 4011: 'too many servers', 4012: 'bad token', 4013: 'intents', 4014: 'intents' }[code];
    if (fatal) { this.running = false; this.status = fatal; this.log(`Discord closed the door (${code}): ${fatal}`); return; }
    const canResume = ![4007, 4009].includes(code) && this.session?.id;
    if (!canResume) this.session = null;
    this.retry(`Discord dropped the line (${code || 'no code'})`, Boolean(canResume));
  }

  async retry(why, resume = false) {
    if (!this.running) return;
    this.status = 'retrying';
    this.log(`${why}; trying again in ${Math.round(this.backoff / 1000)} s`);
    await this.wait(this.backoff);
    this.backoff = Math.min(this.backoff * 2, 5 * 60000);
    this.connect(resume);
  }

  async rest(method, route, body, { form } = {}) {
    const token = this.token();
    if (!token) throw new Error(`No ${TOKEN_ENV} found.`);
    for (let i = 0; i < 2; i++) {
      const r = await this.fetch(`${API}${route}`, {
        method,
        headers: { authorization: `Bot ${token}`, 'user-agent': 'DiscordBot (https://github.com/MouseWurX/Bob, 1.5)', ...(form ? {} : { 'content-type': 'application/json' }) },
        body: form || (body ? JSON.stringify(body) : undefined)
      });
      if (r.status === 429 && i === 0) { const j = await r.json().catch(() => ({})); await this.wait(Math.min(10, Number(j.retry_after) || 1) * 1000); continue; }
      if (r.status === 204) return null;
      const j = await r.json().catch(() => ({}));
      if (r.status >= 300) throw new Error(String(j.message || `Discord said ${r.status}`).split(token).join('…').slice(0, 200));
      return j;
    }
    throw new Error('Discord is busy.');
  }

  // One message from Discord. Only listed channels, only people on the list (if there is one), never bots.
  async handle(m) {
    const s = this.settings();
    if (!s.enabled || !m || m.author?.bot || m.webhook_id || !m.guild_id) return;
    const channelId = String(m.channel_id || '');
    if (!s.channels.includes(channelId)) return;
    const who = String(m.author?.id || '');
    if (s.people.length && !s.people.includes(who)) return;
    const prompt = matchWake(s.wake, m.content, s.caseSensitive);
    if (prompt === null) return;
    const reply = (text) => this.post(channelId, m.id, text);
    if (!prompt) return reply(`Yes? Put what you'd like after "${s.wake.replace('*', '').trim()}".`);
    const type = jobTypeOf(prompt, this.brain.constructor?.guessKind?.bind(this.brain.constructor));
    if (!s.jobs[type]) {
      const label = JOB_TYPES.find((t) => t.id === type)?.label.toLowerCase() || 'that';
      return reply(`Sorry, I can't do that here: ${label} is switched off for Discord.`);
    }
    const now = this.now();
    if (now - (this.lastAsk.get(who) || 0) < COOLDOWN_MS) return reply('One moment, I\'m still on your last one. Ask again in a few seconds.');
    const mine = [...this.jobs.keys()].filter((id) => (this.brain.queue || []).some((j) => j.id === id && ['waiting', 'working'].includes(j.state)));
    if (mine.length >= MAX_WAITING) return reply('I\'ve got a few Discord jobs going already. Ask again in a little while.');
    this.lastAsk.set(who, now);
    const name = String(m.member?.nick || m.author?.global_name || m.author?.username || 'someone').replace(/[\u0000-\u001f<>@]/g, '').slice(0, 40) || 'someone';
    const sessionId = `${DISCORD_SESSION}-${channelId}`;
    const hist = this.brain.sessions?.get(sessionId) || [];
    this.brain.sessions?.set(sessionId, hist.slice(-HISTORY));
    const r = this.brain.enqueue(sessionId, `${name} (on Discord): ${prompt.slice(0, MAX_IN)}`, [], 'low', { guest: { from: 'Discord', need: 'chat', public: true, tools: toolsFor(s) } });
    this.jobs.set(r.jobId, { channelId, messageId: m.id, text: '', startedAt: now, files: [] });
    this.log(`job from Discord (${type}, ${r.jobId.slice(0, 8)})`);
    this.rest('POST', `/channels/${channelId}/typing`).catch(() => {});
    if (r.ahead > 0) await reply(`Got it. ${r.ahead === 1 ? 'One job is' : `${r.ahead} jobs are`} ahead of yours.`);
  }

  async post(channelId, messageId, text) {
    const pieces = chunks(this.clean(text));
    for (let i = 0; i < pieces.length; i++) {
      await this.rest('POST', `/channels/${channelId}/messages`, {
        content: pieces[i],
        allowed_mentions: { parse: [], replied_user: i === 0 },
        ...(i === 0 && messageId ? { message_reference: { message_id: messageId, fail_if_not_exists: false } } : {})
      }).catch((e) => this.log(`couldn't post to Discord: ${e.message}`));
    }
  }

  // Only a file made for this job, in Bob's own save folders, made after the request came in.
  fileOk(job, file) {
    try {
      const f = path.resolve(String(file || ''));
      const dirs = outputDirs(this.cfg).map((d) => path.resolve(d).toLowerCase());
      if (!dirs.includes(path.dirname(f).toLowerCase())) return false;
      const st = fs.statSync(f);
      return st.isFile() && st.size <= MAX_FILE && st.mtimeMs >= job.startedAt - 2000;
    } catch { return false; }
  }

  async upload(channelId, messageId, file) {
    const form = new FormData();
    form.append('payload_json', JSON.stringify({ content: '', allowed_mentions: { parse: [] }, ...(messageId ? { message_reference: { message_id: messageId, fail_if_not_exists: false } } : {}), attachments: [{ id: 0, filename: path.basename(file) }] }));
    form.append('files[0]', new Blob([fs.readFileSync(file)]), path.basename(file));
    await this.rest('POST', `/channels/${channelId}/messages`, null, { form }).catch((e) => this.log(`couldn't send the file to Discord: ${e.message}`));
  }

  // Every event Bob's window gets passes through here. Only Discord jobs' own events are used.
  watch(ev) {
    const job = ev?.turnId && this.jobs.get(ev.turnId);
    if (!job || !String(ev.sessionId || '').startsWith(`${DISCORD_SESSION}-`)) return;
    const s = this.settings();
    switch (ev.type) {
      case 'token': job.text += String(ev.text || ''); break;
      case 'image': case 'video': case 'audio':
        if (ev.file && this.fileOk(job, ev.file)) job.files.push(ev.file);
        break;
      case 'approval':
        // An OK card from a Discord job never waits on the owner's PC: it's a No, and Bob says so.
        try { this.brain.answerApproval?.(ev.id, false); } catch {}
        job.text += '\n(That step needs the owner\'s OK, so I can\'t do it from Discord.)';
        break;
      case 'error': job.error = true; break;
      case 'done': {
        this.jobs.delete(ev.turnId);
        if (!this.running) break;
        const files = [...new Set(job.files)];
        let text = job.text.trim();
        if (files.length && !s.share) text += `\n\n(I made ${files.length === 1 ? 'it' : 'them'}, but sharing what I make on Discord is switched off.)`;
        if (!text && job.error) text = 'Sorry, that didn\'t work.';
        (async () => {
          if (text) await this.post(job.channelId, job.messageId, text);
          if (s.share) for (const f of files) if (this.fileOk(job, f)) await this.upload(job.channelId, job.messageId, f);
        })().catch(() => {});
        break;
      }
      default: break;
    }
  }

  async saveToken(token) {
    const t = String(token || '').trim();
    if (!TOKEN_RX.test(t)) throw new Error('That doesn\'t look like a Discord bot token. Copy it again from the Bot page (Reset Token).');
    await this.store(t);
    this.pasted = t;
    this.stop('starting');
    this.sync();
  }
}

export function discordView(bridge) {
  const s = bridge.settings();
  return { ...s, tokenEnv: TOKEN_ENV, tokenFound: Boolean(bridge.token()), status: bridge.status, botName: bridge.botName, jobTypes: JOB_TYPES.map(({ id, label }) => ({ id, label })) };
}

export function startDiscord(brain, opts) {
  const bridge = new DiscordBridge(brain, opts);
  brain.discord = bridge;
  bridge.sync();
  return bridge;
}

// GET/POST /api/discord. Only from this PC: the switches and the token box never go to the phone.
export async function discordRoute({ req, res, p, isLocal, brain, body, send }) {
  if (p !== '/api/discord') return false;
  const bridge = brain.discord;
  if (!bridge) { send(res, 404, { error: 'not ready' }); return true; }
  if (!isLocal) { send(res, 403, { error: 'Discord can only be set up on this replicant matrix itself.' }); return true; }
  if (req.method === 'GET') { bridge.sync(); send(res, 200, discordView(bridge)); return true; }
  const b = await body(req);
  if (typeof b.token === 'string' && b.token) {
    try { await bridge.saveToken(b.token); brain.log('settings', 'Discord bot token saved (your click)'); } catch (e) { send(res, 400, { error: e.message }); return true; }
  }
  const patch = cleanDiscordPatch(b, bridge.settings());
  if (Object.keys(patch).length) { saveDiscord(brain.cfg, patch); brain.log('settings', `Discord: ${Object.keys(patch).join(', ')} changed (your click)`); }
  bridge.sync();
  send(res, 200, discordView(bridge));
  return true;
}

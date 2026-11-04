// Talk to Bob on Telegram (Settings, Connections). Off unless you turn it on.
//
// You make your own Telegram bot (with Telegram's @BotFather) and add its token as a Windows user environment
// variable named BOB_TELEGRAM_TOKEN. Bob never stores or shows the token, the same as the cloud helpers' keys.
// Bob asks Telegram for new messages himself (one long-poll request at a time), so no port is opened on this PC.
//
// Only one Telegram account can talk to Bob: yours. While the bot isn't paired, Settings shows a pairing code for
// 15 minutes; the first account that sends that code to the bot becomes the owner. Five wrong codes throw it away. Everything from anyone else is
// ignored without an answer. "Forget my Telegram account" un-pairs it.
//
// Your messages go into a "Telegram" chat, like typing them here. Bob's answers go back as text. Two extra
// switches, both off: "Send pictures Bob makes" (pictures go to Telegram as photos) and "Answer my OK cards on
// Telegram" (cards get Allow and Deny buttons; without it Bob says the card is waiting on the PC). Hard limits are
// checked by the tools themselves, so they still hold whichever way you answer.
//
// What goes through Telegram's servers while it's on: your messages to the bot, Bob's replies, card texts (only
// with the OK switch), and pictures (only with the pictures switch). Nothing else from your chats.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { keyEnv } from './cloud.js';

export const TOKEN_ENV = 'BOB_TELEGRAM_TOKEN';
export const TELEGRAM_SESSION = 'telegram';
export const PAIR_MINUTES = 15;
const API = 'https://api.telegram.org'; // fixed here, so a settings file can't send your chats anywhere else
const MAX_TEXT = 4000; // Telegram's limit is 4096 characters a message
const MAX_PHOTO = 10 * 1024 * 1024; // Telegram takes photos up to 10 MB
const MAX_MISSES = 5;
const TOKEN_RX = /^\d{5,15}:[A-Za-z0-9_-]{30,60}$/;

export function telegramSettings(cfg) {
  const t = cfg.telegram || {};
  return { enabled: t.enabled === true, ownerId: Number.isSafeInteger(t.ownerId) ? t.ownerId : null, ownerName: String(t.ownerName || '').slice(0, 80), approve: t.approve === true, pictures: t.pictures === true };
}

// Lives in config.json only, never in settings.json, like phone access: nothing that can write Bob's settings file
// can open this door. Only the Settings page on this PC calls this.
export function saveTelegram(cfg, patch) {
  let raw = {};
  try { raw = JSON.parse(fs.readFileSync(cfg.configFile, 'utf8')); } catch {}
  raw.telegram = { ...(raw.telegram || {}), ...patch };
  for (const k of Object.keys(raw.telegram)) if (raw.telegram[k] === undefined) delete raw.telegram[k];
  fs.writeFileSync(cfg.configFile, JSON.stringify(raw, null, 2));
  cfg.telegram = raw.telegram;
}

// Only these keys, only these types.
export function cleanTelegramPatch(b = {}) {
  const out = {};
  for (const k of ['enabled', 'approve', 'pictures']) if (k in b) out[k] = b[k] === true;
  return out;
}

// Splits a long reply into pieces Telegram accepts, at a line or space where it can.
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

// "/start 123456", "123456" or "pair 123456" -> "123456".
export function codeIn(text) {
  const m = /^\s*(?:\/start\s+|pair\s+)?(\d{6})\s*$/i.exec(String(text || ''));
  return m ? m[1] : null;
}

export class TelegramBridge {
  constructor(brain, { fetchImpl = globalThis.fetch, env = keyEnv(), now = Date.now, wait = (ms) => new Promise((r) => setTimeout(r, ms)), pollSeconds = 50 } = {}) {
    this.brain = brain;
    this.cfg = brain.cfg;
    this.fetch = fetchImpl;
    this.env = env;
    this.now = now;
    this.wait = wait;
    this.pollSeconds = pollSeconds;
    this.offset = 0;
    this.running = false;
    this.ctrl = null;
    this.turns = new Map(); // turnId -> reply text so far
    this.cards = new Map(); // approval id -> Telegram message id
    this.pair = null; // { code, until }
    this.pairLocked = false; // true after too many wrong codes, until New code
    this.misses = 0;
    this.status = 'off';
    this.botName = '';
  }

  token() { const t = String(this.env[TOKEN_ENV] || '').trim(); return TOKEN_RX.test(t) ? t : ''; }
  settings() { return telegramSettings(this.cfg); }
  log(t) { this.brain.log?.('telegram', t); }

  // Starts or stops the poll loop to match the settings. Safe to call any time.
  sync() {
    const s = this.settings();
    if (s.enabled && this.token()) { if (!this.running) this.#loop(); }
    else this.stop(s.enabled ? 'no token' : 'off');
    if (s.enabled && !s.ownerId && !this.pairLocked && (!this.pair || this.pair.until < this.now())) this.newPairCode();
    if (!s.enabled || s.ownerId) this.pair = null;
  }

  stop(why = 'off') {
    this.running = false;
    this.status = why;
    try { this.ctrl?.abort(); } catch {}
  }

  newPairCode() {
    this.pairLocked = false;
    this.misses = 0;
    this.pair = { code: String(crypto.randomInt(0, 1e6)).padStart(6, '0'), until: this.now() + PAIR_MINUTES * 60000 };
    return this.pair;
  }

  async call(method, body, { signal, form } = {}) {
    const token = this.token();
    if (!token) throw new Error(`No ${TOKEN_ENV} found.`);
    const r = await this.fetch(`${API}/bot${token}/${method}`, form
      ? { method: 'POST', body: form, signal }
      : { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body || {}), signal });
    const j = await r.json().catch(() => ({}));
    // The token is part of the address, so errors never repeat the address, only Telegram's own words.
    if (!j.ok) throw new Error(String(j.description || `Telegram said ${r.status}`).replace(token, '…').slice(0, 200));
    return j.result;
  }

  async #loop() {
    this.running = true;
    this.status = 'starting';
    let backoff = 5000;
    try { const me = await this.call('getMe'); this.botName = me?.username ? `@${me.username}` : ''; } catch (e) { this.log(`couldn't reach Telegram: ${e.message}`); }
    while (this.running) {
      this.ctrl = new AbortController();
      try {
        const ups = await this.call('getUpdates', { offset: this.offset, timeout: this.pollSeconds, allowed_updates: ['message', 'callback_query'] }, { signal: this.ctrl.signal });
        this.status = 'on';
        backoff = 5000;
        for (const u of ups || []) {
          this.offset = Math.max(this.offset, (u.update_id || 0) + 1);
          await this.handle(u).catch((e) => this.log(`message not handled: ${e.message}`));
        }
      } catch (e) {
        if (!this.running) break;
        this.status = 'retrying';
        this.log(`Telegram didn't answer (${e.message}); trying again in ${Math.round(backoff / 1000)} s`);
        await this.wait(backoff);
        backoff = Math.min(backoff * 2, 5 * 60000);
      }
    }
  }

  // One update from Telegram. Only the owner's private chat counts; everyone else gets silence.
  async handle(u) {
    const s = this.settings();
    if (u.callback_query) return this.#button(u.callback_query, s);
    const m = u.message;
    if (!m || m.chat?.type !== 'private' || !m.from || m.from.is_bot) return;
    const text = String(m.text || m.caption || '').trim();
    if (!s.ownerId) {
      const code = codeIn(text);
      if (!this.pair || this.pair.until < this.now() || !text) return;
      if (!code || !crypto.timingSafeEqual(Buffer.from(code), Buffer.from(this.pair.code))) {
        // Guessing: after 5 wrong tries the code is thrown away until you click New code on the PC.
        if (++this.misses >= MAX_MISSES) { this.pair = null; this.pairLocked = true; this.log('pairing code thrown away after 5 wrong tries; click New code to pair'); }
        return;
      }
      const name = [m.from.first_name, m.from.last_name].filter(Boolean).join(' ') || m.from.username || 'you';
      saveTelegram(this.cfg, { ownerId: m.from.id, ownerName: name, chatId: m.chat.id });
      this.pair = null;
      this.log(`paired with Telegram account ${name}`);
      this.brain.broadcast?.({ type: 'telegram', paired: true, name });
      return this.say('Paired. This Bob now answers you here, and only you. Send me anything you would type in my window. /stop stops what I\'m doing for this chat.');
    }
    if (m.from.id !== s.ownerId) return;
    if (!text) return this.say('I can only read text here for now.');
    if (/^\/start\b/i.test(text)) return this.say('I\'m here. Send me anything you would type in my window. /stop stops what I\'m doing for this chat.');
    if (/^\/stop\b/i.test(text)) {
      let n = 0;
      for (const j of this.brain.queue || []) if (j.sessionId === TELEGRAM_SESSION && ['waiting', 'working'].includes(j.state) && this.brain.cancelJob(j.id)) n++;
      return this.say(n ? `Stopped ${n === 1 ? 'that job' : `${n} jobs`}.` : 'Nothing of yours is running.');
    }
    const r = this.brain.enqueue(TELEGRAM_SESSION, text.slice(0, 8000));
    this.log(`message from Telegram (${r.jobId.slice(0, 8)})`);
    if (r.ahead > 0) await this.say(`Got it. ${r.ahead === 1 ? 'One job is' : `${r.ahead} jobs are`} ahead of yours.`);
  }

  async #button(q, s) {
    const answer = (text) => this.call('answerCallbackQuery', { callback_query_id: q.id, text }).catch(() => {});
    if (!s.ownerId || q.from?.id !== s.ownerId) return; // not the owner: no answer at all
    const m = /^ok:([0-9a-f-]{36}):([01])$/.exec(String(q.data || ''));
    if (!m) return answer('');
    if (!s.approve) return answer('Answering OK cards on Telegram is off. Use this replicant matrix.');
    const allow = m[2] === '1';
    const done = this.brain.answerApproval(m[1], allow);
    this.log(`OK card ${allow ? 'allowed' : 'denied'} on Telegram${done ? '' : ' (already answered)'}`);
    await answer(done ? (allow ? 'Allowed' : 'Denied') : 'Already answered');
    if (q.message?.message_id) await this.call('editMessageReplyMarkup', { chat_id: q.message.chat.id, message_id: q.message.message_id, reply_markup: { inline_keyboard: [] } }).catch(() => {});
  }

  chatId() { const t = this.cfg.telegram || {}; return Number.isSafeInteger(t.chatId) ? t.chatId : null; }

  async say(text, extra = {}) {
    const chat = this.chatId();
    if (!chat || !this.running) return;
    for (const piece of chunks(text)) await this.call('sendMessage', { chat_id: chat, text: piece, ...extra }).catch((e) => this.log(`couldn't send to Telegram: ${e.message}`));
  }

  async photo(file) {
    const chat = this.chatId();
    if (!chat || !this.running || !file) return;
    try {
      const st = fs.statSync(file);
      if (!st.isFile() || st.size > MAX_PHOTO || !/\.(png|jpe?g|webp)$/i.test(file)) return this.say(`I made a picture: ${path.basename(file)}. It's in Made by Bob.`);
      const form = new FormData();
      form.append('chat_id', String(chat));
      form.append('photo', new Blob([fs.readFileSync(file)]), path.basename(file));
      await this.call('sendPhoto', null, { form });
    } catch (e) { this.log(`couldn't send the picture: ${e.message}`); }
  }

  // Every event Bob's window gets passes through here. Only the Telegram chat's are used.
  watch(ev) {
    if (!ev || ev.sessionId !== TELEGRAM_SESSION || !this.running) return;
    const s = this.settings();
    const id = ev.turnId || '-';
    switch (ev.type) {
      case 'token': this.turns.set(id, (this.turns.get(id) || '') + String(ev.text || '')); break;
      case 'busy-note': case 'announce': this.say(String(ev.text || '')); break;
      case 'error': this.say(`That didn't work: ${String(ev.text || ev.error || 'something went wrong').slice(0, 500)}`); break;
      case 'image':
        if (s.pictures && ev.file) this.photo(ev.file);
        else this.turns.set(id, `${this.turns.get(id) || ''}\n(I made a picture. It's in Made by Bob${s.pictures ? '' : '. Turn on "Send pictures Bob makes" to get them here'}.)`);
        break;
      case 'approval': {
        const text = String(ev.text || 'I need your OK.').slice(0, 1500);
        if (!s.approve) { this.say(`I need your OK for this, on this replicant matrix: ${text}`); break; }
        const extra = ev.command ? `\n\nCommand: ${String(ev.command).slice(0, 500)}` : '';
        const many = Boolean(ev.together || ev.planCard || ev.plan);
        this.say(`I need your OK: ${text}${extra}${many ? '\n\nTo pick single steps, use this replicant matrix.' : ''}`, { reply_markup: { inline_keyboard: [[{ text: many ? 'Allow the rest of this job' : 'Allow', callback_data: `ok:${ev.id}:1` }, { text: 'Deny', callback_data: `ok:${ev.id}:0` }]] } });
        break;
      }
      case 'done': {
        const text = (this.turns.get(id) || '').trim();
        this.turns.delete(id);
        if (text) this.say(text);
        break;
      }
      default: break;
    }
  }
}

export function telegramView(bridge) {
  const s = bridge.settings();
  const pair = s.enabled && !s.ownerId && bridge.pair && bridge.pair.until > bridge.now() ? bridge.pair : null;
  return { enabled: s.enabled, paired: Boolean(s.ownerId), pairLocked: bridge.pairLocked, ownerName: s.ownerName, approve: s.approve, pictures: s.pictures, tokenEnv: TOKEN_ENV, tokenFound: Boolean(bridge.token()), status: bridge.status, botName: bridge.botName, pairCode: pair?.code || '', pairUntil: pair ? new Date(pair.until).toISOString() : '' };
}

export function startTelegram(brain, opts) {
  const bridge = new TelegramBridge(brain, opts);
  brain.telegram = bridge;
  bridge.sync();
  return bridge;
}

// GET/POST /api/telegram. Only from this PC: the pairing code and the switches never go to the phone.
export async function telegramRoute({ req, res, p, isLocal, brain, body, send }) {
  if (p !== '/api/telegram') return false;
  const bridge = brain.telegram;
  if (!bridge) { send(res, 404, { error: 'not ready' }); return true; }
  if (!isLocal) { send(res, 403, { error: 'Telegram can only be set up on this replicant matrix itself.' }); return true; }
  if (req.method === 'GET') { bridge.sync(); send(res, 200, telegramView(bridge)); return true; }
  const b = await body(req);
  if (b.forget) { saveTelegram(brain.cfg, { ownerId: undefined, ownerName: undefined, chatId: undefined }); bridge.pair = null; brain.log('settings', 'Telegram account forgotten (your click)'); }
  if (b.newCode) bridge.newPairCode();
  const patch = cleanTelegramPatch(b);
  if (Object.keys(patch).length) { saveTelegram(brain.cfg, patch); brain.log('settings', `Telegram: ${Object.entries(patch).map(([k, v]) => `${k} ${v ? 'on' : 'off'}`).join(', ')} (your click)`); }
  bridge.sync();
  send(res, 200, telegramView(bridge));
  return true;
}

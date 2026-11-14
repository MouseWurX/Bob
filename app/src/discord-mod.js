// Keep order on Discord (Settings, Online services, Bob on Discord). Off unless you turn it on.
//
// Bob moderates your server with plain rules in code. No brain is loaded for any of it:
//   - deletes spam (a flood, the same message again and again, mass mentions), scam links, slurs and your own blocked
//     words, then warns the person;
//   - warnings add up: after a few, a timeout that doubles each time; after more, a kick, then a ban;
//   - kicks and bans wait for your OK (Settings, or Allow and Deny in your Discord DMs), unless you switch that off.
//     While one waits, the person sits in a one-hour timeout;
//   - raid guard: lots of people joining at once puts slow mode on every watched channel for a while, then takes it off;
//   - welcome: a message for each new member, with an "I agree" button that gives them the role you pick;
//   - roles people may give themselves (!role), reports from anyone (!report), and commands for your moderators;
//   - unclear cases (a link from someone who joined minutes ago, a blocked word hidden inside other letters, a report)
//     are flagged for you, never acted on alone. With "Ask a brain about unclear cases" on (off), a brain reads them
//     once and may only delete and warn; it can never time out, kick or ban.
// Every action lands in the moderation log here and, if you pick one, in a log channel on the server.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

export const MOD_FILE = 'discord-mod.json';
export const REVIEW_SESSION = 'discord-modcheck';
const ID_RX = /^\d{15,22}$/;
const MAX_TIMEOUT_MIN = 28 * 24 * 60; // Discord's longest timeout
const HOLD_MIN = 60; // the timeout while a kick or ban waits for your OK
const FLOOD_WINDOW = 10_000;
const DUPE_WINDOW = 60_000;
const RAID_WINDOW = 60_000;
const NEW_MEMBER_MS = 10 * 60_000;
const NOTICE_MS = 30_000; // Bob's warning notices tidy themselves away
const KEEP_LOG = 300, KEEP_FLAGS = 100, KEEP_PENDING = 50;
// Permission bits that make someone a moderator in Bob's eyes: Administrator, Manage Server, Manage Messages,
// Kick, Ban, Timeout members.
const MOD_PERMS = (1n << 3n) | (1n << 5n) | (1n << 13n) | (1n << 1n) | (1n << 2n) | (1n << 40n);
export const MEMBERS_INTENT = 1 << 1; // GUILD_MEMBERS, privileged: only asked for when Welcome or Raid guard is on

export const MOD_DEFAULTS = {
  enabled: false,
  channels: [], // empty: every channel the bot can see
  logChannel: '',
  modRoles: [],
  spam: true, floodCount: 5, dupeCount: 3, mentionCount: 5,
  scamLinks: true, slurs: true, invites: false,
  words: [], links: [],
  warnTimeout: 2, timeoutMinutes: 10, kickAt: 4, banAt: 5, forgetDays: 30,
  needOk: true,
  raid: false, raidJoins: 10, raidSlow: 30, raidMinutes: 15,
  welcome: false, welcomeChannel: '', welcomeText: 'Welcome {user}! Please read the rules, then press I agree.', verifyRole: '',
  selfRoles: [],
  reports: true,
  askBrain: false,
  rules: '',
  prefix: '!'
};
const NUMS = { floodCount: [2, 50], dupeCount: [2, 20], mentionCount: [2, 50], warnTimeout: [0, 20], timeoutMinutes: [1, 10080], kickAt: [0, 50], banAt: [0, 50], forgetDays: [1, 365], raidJoins: [3, 500], raidSlow: [5, 21600], raidMinutes: [1, 1440] };
const SWITCHES = ['enabled', 'spam', 'scamLinks', 'slurs', 'invites', 'needOk', 'raid', 'welcome', 'reports', 'askBrain'];
const IDS = ['channels', 'modRoles', 'selfRoles'];
const ONE_ID = ['logChannel', 'welcomeChannel', 'verifyRole'];

const idList = (v) => [...new Set(String(Array.isArray(v) ? v.join(' ') : v || '').split(/[\s,;]+/).filter((x) => ID_RX.test(x)))].slice(0, 50);
const lines = (v, max = 200) => [...new Set(String(Array.isArray(v) ? v.join('\n') : v || '').split(/[\n,]+/).map((x) => x.trim().toLowerCase()).filter(Boolean))].slice(0, max).map((x) => x.slice(0, 60));
const plain = (s, n) => String(s ?? '').replace(/[\u0000-\u0008\u000b-\u001f]/g, '').slice(0, n);

export function modSettings(cfg) {
  const d = cfg?.discord?.mod || {};
  const out = { ...MOD_DEFAULTS };
  for (const k of SWITCHES) if (typeof d[k] === 'boolean') out[k] = d[k];
  for (const [k, [lo, hi]] of Object.entries(NUMS)) if (Number.isFinite(Number(d[k])) && d[k] !== '' && d[k] != null) out[k] = Math.min(hi, Math.max(lo, Math.round(Number(d[k]))));
  for (const k of IDS) out[k] = idList(d[k]);
  for (const k of ONE_ID) out[k] = ID_RX.test(String(d[k] || '')) ? String(d[k]) : '';
  out.words = lines(d.words);
  out.links = lines(d.links).map((x) => x.replace(/^https?:\/\//, '').replace(/\/.*$/, '')).filter((x) => /^[a-z0-9.-]+\.[a-z]{2,}$/.test(x));
  if (typeof d.welcomeText === 'string' && d.welcomeText.trim()) out.welcomeText = plain(d.welcomeText.trim(), 500);
  out.rules = plain(d.rules, 1500);
  const p = String(d.prefix ?? '').trim();
  if (/^[!?.$%&+=~>-]{1,2}$/.test(p)) out.prefix = p;
  return out;
}

// Only these keys, only these types. The rest of the mod settings stay as they were.
export function cleanModPatch(b = {}) {
  if (!b || typeof b !== 'object') return {};
  const out = {};
  for (const k of SWITCHES) if (k in b) out[k] = b[k] === true;
  for (const [k, [lo, hi]] of Object.entries(NUMS)) if (k in b && Number.isFinite(Number(b[k]))) out[k] = Math.min(hi, Math.max(lo, Math.round(Number(b[k]))));
  for (const k of IDS) if (k in b) out[k] = idList(b[k]);
  for (const k of ONE_ID) if (k in b) out[k] = ID_RX.test(String(b[k] || '').trim()) ? String(b[k]).trim() : '';
  if ('words' in b) out.words = lines(b.words);
  if ('links' in b) out.links = lines(b.links);
  if ('welcomeText' in b) out.welcomeText = plain(b.welcomeText, 500);
  if ('rules' in b) out.rules = plain(b.rules, 1500);
  if ('prefix' in b && /^[!?.$%&+=~>-]{1,2}$/.test(String(b.prefix).trim())) out.prefix = String(b.prefix).trim();
  return out;
}

// ---------- The rules: plain code, no brain ----------

// One spelling for every way of writing a word: lower case, no accents, 4 -> a, 3 -> e, 0 -> o..., only letters, and
// a doubled letter counts once. "N1GG3RRR" and "nigger" come out the same.
const LEET = { 0: 'o', 1: 'i', 3: 'e', 4: 'a', 5: 's', 7: 't', 8: 'b', 9: 'g', '@': 'a', $: 's', '!': 'i', '|': 'i', '+': 't' };
export function normalWord(w) {
  return String(w || '').normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[0134578@$!|+9]/g, (c) => LEET[c] || c).replace(/[^a-z]/g, '').replace(/(.)\1+/g, '$1');
}
const hashOf = (w) => crypto.createHash('sha256').update(`bob-mod-v1:${w}`).digest('hex').slice(0, 16);

// Common slurs, kept as fingerprints so the words themselves aren't written out in Bob's code. Each is a short
// SHA-256 of normalWord(word), plural included. "delete": always taken out. "flag": words with a harmless meaning
// too, flagged for you instead.
export const SLUR_HASHES = {
  delete: new Set([
    '87eb5b74fe2bc9cc', '2ada588aa6e21c12', '7db9e7bf85be4326', '7d12f0eeede1c1e4', '423eba2700b27781', 'a6ba6f2323377e32',
    '1942d995e7123793', '3a287dafc49868a9', '5502d290df834a98', 'c6a551c09de4e2f8', '09097af9fdbbbb3d', 'a17a89583aec424d',
    '77d4d0081bd4f219', '8d3fc7cb520e3018', '7af2b357fbc65e13', '70ed6f1c13d18ad7', '9ec43070e28efa95', '2b337bb93d639b05',
    '1726e7ae530796d4', '12ff452e1125784c', 'a4065e984873312e', 'c9bf8c637d06db7f', '88d9ff8fef22e6c0', 'a466374d51153417',
    'ec864640071afe43', '335ae7bb6f394c14', '4e5994c2133f9d6f', '7bb1469ed4512cd2', '753a4d7a90ab4574', '1eb1005033100b5b',
    'b4a9ae9136160baa', 'd12ba47898b7ea18', '1f6a12e77b7206af', '4686175027c93329', '11ded75ebc984c8b', '82dcf4ad125d11cc',
    '6057df783753d3f1', '4153076653cf3f4e', '9d11cb8a768c7f43', '4f48c436f63fc411', 'c8b5338fdbb35ba7', '9aa72b11e665db09',
    '02879b013d9f11df', '9c31a3c2d272cfb6', 'efd6a321ff8f1316', 'ee9ff0085990cf28', '9d810d675e184f56', '901e5a4549090c0c',
    '566288d499550b70', 'aedac7e3a8955862', '13b22b0d09b2beaa', '3fb3b3f5de647017', '4bafe7300fc9e58b', 'a8311c552ae38057',
    'ee2de6b94a5ed6aa', 'c973ac33b64b88bc', 'da69b92bd6f14b39', '23918683b5a0458f', '19fc3e1320b22c43', '8e0055e3a10f19eb',
    'd9014405ed20cdf7', 'bcfe16d7db7c15ae', 'd3eeac3ec2bb2fa9', '7327d551e7961fd0', 'af2de266f1db9e1b', '01a80b5e69ffc8f3',
    'f9f62f50c5db63ef', '70e20844e7fb6f48', '57b12c1ffe26a74c', '0ffea8976352fd5c', '72ebf9bf73dce240', 'a8cb74e92c19466f',
    '485cfc5ba8f1e95a', '9fe5fb998abe6813', '33490a4a273356a7', '18873af723024c90', '414a6ca79cac05f7', '276a80d776f4f85e',
    '964cb9786c90e5c9', 'd628062733197849', 'f6c66abde3eff693', 'ef6487a6a66229a9', 'c3cdba89ba953db5', 'adddcb97ab497238',
    '2e087f72305ab092', '7048b13b5c30e4c5', 'f55177b1cc96503c', '0b0ae9f46d56ca0d', 'f7b6eaebd0686db0', 'c314d1e0d77e1a12',
    '505b5192bb409fea', 'c623f8d34cea5b1c', '8d15e4425d7d263d', 'be9bcdb282389870', '41de2f227b802952', '97079657a20bc1f4',
    '18fd7b6082699755', '41064291058c21bd', '568b7f08a718caa7', 'ebcc85bef11ff047', 'b9815cf035fe832e', '6bdfc49792cc02c8',
    'cc44b0d81d03cb8a', '4d8390921845efde', 'b558ed3c9dad581e', '2d8b12988d9bbf9d', '2b78727d5310d3f4', '7cf7e7fd9a1988d6',
    'e4c18bb5526916f3', 'e6cd2bd76a6d04f3', 'f58297e821fb6626', '08eadb0d93189d66', 'a1eebbf19ff5fe1d', '0164ddb2b55a32f3',
    'bc9e9554d728aa4c', '407165e5a187266f', '85a1220f1a64216c', '053417cc9b2c5b00', 'eee4a2521e9f07df', '5d88e62215e2cd5c',
    '14fa4a9d9f3f559d', '293e4bf07988694d', '6876a5d9fe4e396d', 'd6c8410f3e8acb17', '338dfcbf08359c0a', '0d8921912a8ae163',
    '267ec0b46a0a9185', '78b0aa22c9b29fed', 'a9721ee3ecdb563b', '9d517927d89a0a0b', 'a1f9b5a9d3afc6fb', '376410fa84ba10a7',
    '7ee661409a9cbd6c', 'bfb3cb8f8457b8f7', '0822cafb99f4d0fc', '873c9009c3b2c16a', '3270ddfccbc8bcfa', 'e620d994b1485209',
    '3dbc8fc0a6e23d25', '0bfcb61953fb876a'
  ]),
  flag: new Set([
    '98c085429c9ee892', 'f9aaa4b5091dd9a4', '418e2f724c248d88', '44b052fffda13c05', '0f77e89f9c9db47d', 'c9133760bec6608f',
    '9fb5faec0b680a1d', '2ac7bde342d1581d', '8bf905803c5ce5cf', '780cc4fc24289aa8', 'd4ba4744c07b7ff9', '7f93dd7f021aaea8',
    'ea4da4a088f5872f', '6556e1e085479fb8', '2e0e159e44b852b2', 'ef7d0831ae3d4a25', '1a51221928f978a3', 'b17c7db0d3f1a842',
    'b6dda1db258462a5', '8b645c698e604850', 'd125e7c90050c9bd', 'e139d343fda76a05', '9823db6900e52d32', '1dc5f5f7dac9643e',
    '7361d69fdfdf0f15', '6899e425aef9ca09', 'aaa14324fc086d52', 'df78fda0a47d681e', '671731f1ed94080f', 'b44d9e13eb07606c',
    '29d265ed8c25b41b', '205cabd4d1dd6fde', '1bb1225aa2659c2a', 'c77e3b24cef7d8b2', '6b1b1c7b198d410a', '111b18e0f666a799',
    '1efb3000ba274161', '5d8f4404a291b953', 'a89d0af1747476d2', '26fa240b525bce0f', '6c6fcc620799a475', '9284a08d3982021d'
  ])
};

// The words of a message, with runs of single letters ("n i g g a") joined up.
export function wordsOf(text) {
  const raw = String(text || '').split(/\s+/).filter(Boolean);
  const out = [];
  let run = '';
  for (const t of raw) {
    const n = normalWord(t);
    if (n.length === 1 && t.replace(/[^\p{L}\p{N}@$]/gu, '').length === 1) { run += n; continue; }
    if (run.length > 2) out.push(run.replace(/(.)\1+/g, '$1'));
    run = '';
    if (n) out.push(n);
  }
  if (run.length > 2) out.push(run.replace(/(.)\1+/g, '$1'));
  return out;
}

function wordHit(text, s) {
  const words = wordsOf(text);
  const own = new Set(s.words.map(normalWord).filter((w) => w.length > 1));
  for (const w of words) {
    if (own.has(w)) return { rule: 'blocked word', act: 'delete' };
    if (s.slurs) {
      const h = hashOf(w);
      if (SLUR_HASHES.delete.has(h)) return { rule: 'slur', act: 'delete' };
      if (SLUR_HASHES.flag.has(h)) return { rule: 'a word that may be a slur', act: 'flag' };
    }
  }
  // Hidden inside other letters ("xxslurxx", "s.l.u.r"): only words of 5 letters or more, and only flagged, since a
  // harmless word can hold one by chance.
  const all = normalWord(String(text || ''));
  if (all.length > 4 && all.length <= 600) {
    for (const w of own) if (w.length >= 5 && all.includes(w)) return { rule: 'a blocked word inside other letters', act: 'flag' };
    if (s.slurs) for (let len = 5; len <= 9; len++) for (let i = 0; i + len <= all.length; i++) if (SLUR_HASHES.delete.has(hashOf(all.slice(i, i + len)))) return { rule: 'a slur inside other letters', act: 'flag' };
  }
  return null;
}

// Links. Official Discord and Steam addresses are fine; look-alikes of them are scams.
const OFFICIAL = /(^|\.)(discord\.com|discord\.gg|discordapp\.com|discordapp\.net|discord\.media|discord\.new|discord\.gift|discordstatus\.com|discord\.dev|steampowered\.com|steamcommunity\.com|steamstatic\.com|steamgames\.com|steam\.tv)$/;
const BAIT = /\b(free\s+nitro|nitro\s+(?:gift|giveaway|for\s+free|generator)|steam\s+(?:gift|giveaway)|free\s+(?:skins?|robux|v-?bucks)|claim\s+(?:your|the)\s+(?:prize|reward|gift|nitro)|airdrop|crypto\s+giveaway|double\s+your\s+(?:crypto|btc|eth))\b/i;
export function linksOf(text) {
  const out = [];
  for (const m of String(text || '').matchAll(/\bhttps?:\/\/([^\s/<>"'?#]+)[^\s<>"']*/gi)) {
    const host = m[1].toLowerCase().replace(/^[^@]*@/, '').replace(/:\d+$/, '').replace(/\.$/, '');
    out.push({ url: m[0], host });
  }
  return out;
}
// "dlscord", "disc0rd-gift", "steamcornmunity": what a host looks like with look-alike letters undone.
const looks = (h) => h.replace(/0/g, 'o').replace(/[1l|]/g, 'i').replace(/rn/g, 'm').replace(/vv/g, 'w').replace(/cl/g, 'd').replace(/3/g, 'e').replace(/[^a-z]/g, '');
export function linkHit(text, s, { newMember = false } = {}) {
  const links = linksOf(text);
  const invite = /\b(?:discord(?:app)?\.com\/invite|discord\.gg)\/[\w-]+/i.test(String(text || ''));
  if (!links.length && !invite) return null;
  for (const { host } of links) {
    if (s.links.some((d) => host === d || host.endsWith(`.${d}`))) return { rule: 'blocked link', act: 'delete' };
    if (!s.scamLinks) continue;
    if (OFFICIAL.test(host)) continue;
    const l = looks(host);
    if (/discord|dicsord|discrod|disocrd|nitro|steamcommunity|steampowered|steamcomunity|stearn/.test(l) || /discord|steam/.test(host.replace(/[^a-z]/g, ''))) return { rule: 'scam link (looks like Discord or Steam)', act: 'delete' };
    if (/^xn--|\.xn--/.test(host)) return { rule: 'a link with disguised letters', act: 'flag' };
    if (/^\d+\.\d+\.\d+\.\d+$/.test(host)) return { rule: 'a link to a bare address', act: 'flag' };
  }
  if (s.scamLinks && links.length && BAIT.test(String(text))) return { rule: 'scam link (free-gift bait)', act: 'delete' };
  if (s.scamLinks && /@(everyone|here)\b/.test(String(text)) && links.length) return { rule: 'scam link (@everyone with a link)', act: 'delete' };
  if (s.invites && invite) return { rule: 'invite to another server', act: 'delete' };
  if (s.scamLinks && newMember && links.some(({ host }) => !OFFICIAL.test(host))) return { rule: 'a link from someone who joined minutes ago', act: 'flag' };
  return null;
}

export function mentionCount(m) {
  const ids = new Set([...(m.mentions || []).map((u) => u?.id), ...(m.mention_roles || [])].filter(Boolean));
  const inText = String(m.content || '').match(/<@[!&]?\d+>/g) || [];
  return Math.max(ids.size, new Set(inText).size) + (/@(everyone|here)\b/.test(String(m.content || '')) ? 3 : 0);
}

// "10m", "2h", "1d", "30" (minutes) -> minutes, or 0.
export function minutesOf(s) {
  const m = /^(\d{1,5})\s*(s|sec|m|min|h|hr|d|day|w)?s?$/i.exec(String(s || '').trim());
  if (!m) return 0;
  const n = Number(m[1]);
  const per = { s: 1 / 60, sec: 1 / 60, m: 1, min: 1, h: 60, hr: 60, d: 1440, day: 1440, w: 10080 }[(m[2] || 'm').toLowerCase()];
  return Math.min(MAX_TIMEOUT_MIN, Math.max(1, Math.round(n * per)));
}

// What the next warning brings: a warning, a timeout, or a kick or ban (those wait for your OK by default).
export function ladder(count, s) {
  if (s.banAt > 0 && count >= s.banAt) return { kind: 'ban' };
  if (s.kickAt > 0 && count >= s.kickAt) return { kind: 'kick' };
  if (s.warnTimeout > 0 && count >= s.warnTimeout) return { kind: 'timeout', minutes: Math.min(MAX_TIMEOUT_MIN, s.timeoutMinutes * 2 ** (count - s.warnTimeout)) };
  return { kind: 'warn' };
}
function nextStep(count, s) {
  const steps = [['timeout', s.warnTimeout], ['kick', s.kickAt], ['ban', s.banAt]].filter(([, n]) => n > count);
  if (!steps.length) return '';
  const [kind, n] = steps.sort((a, b) => a[1] - b[1])[0];
  return ` Warning ${count} of ${n} before a ${kind}.`;
}

const nameOf = (m) => String(m?.member?.nick || m?.author?.global_name || m?.author?.username || m?.user?.global_name || m?.user?.username || 'someone').replace(/[\u0000-\u001f<>@`]/g, '').slice(0, 40) || 'someone';
const shortId = () => crypto.randomBytes(3).toString('hex');

export class Moderator {
  constructor(bridge, { now = Date.now, dir = null, later = (fn, ms) => { const t = setTimeout(fn, ms); t.unref?.(); return t; } } = {}) {
    this.bridge = bridge;
    this.now = now;
    this.later = later;
    this.file = dir ? path.join(dir, MOD_FILE) : null;
    this.guilds = new Map(); // guild id -> { ownerId, roles: Map(id -> { name, perms }) }
    this.recent = new Map(); // guild:user -> [{ at, text, channelId, id }]
    this.joins = new Map(); // guild id -> [times]
    this.warnedAt = new Map(); // guild:user -> last warning time (a flood gets one warning, not ten)
    this.reviews = new Map(); // brain review job id -> { flagId, text }
    this.state = { warnings: {}, pending: [], flags: [], log: [], lockdowns: {} };
    this.load();
  }

  settings() { return modSettings(this.bridge.cfg); }
  on() { return this.bridge.settings().enabled && this.settings().enabled; }
  intents() { const s = this.settings(); return s.enabled && (s.welcome || s.raid) ? MEMBERS_INTENT : 0; }

  load() {
    if (!this.file) return;
    try { const j = JSON.parse(fs.readFileSync(this.file, 'utf8').replace(/^﻿/, '')); for (const k of Object.keys(this.state)) if (j[k] && typeof j[k] === typeof this.state[k]) this.state[k] = j[k]; } catch {}
  }
  save() {
    if (!this.file) return;
    try { fs.writeFileSync(this.file, JSON.stringify(this.state)); } catch (e) { this.bridge.log(`couldn't save the moderation record: ${e.code || e.message}`); }
  }

  rest(...a) { return this.bridge.rest(...a); }

  // The moderation log: here, in Bob's log, and in the log channel if you picked one.
  note(what, { guildId, userId, name, why, by = 'Bob' } = {}) {
    const line = { at: this.now(), what, guildId: guildId || '', userId: userId || '', name: name || '', why: plain(why, 200), by };
    this.state.log.push(line);
    if (this.state.log.length > KEEP_LOG) this.state.log.splice(0, this.state.log.length - KEEP_LOG);
    this.save();
    this.bridge.log(`moderation: ${what}${name ? ` ${name}` : ''}${why ? ` (${line.why})` : ''}${by !== 'Bob' ? `, by ${by}` : ''}`);
    try { this.bridge.brain.broadcast?.({ type: 'discord-mod', waiting: this.waiting().length, flags: this.openFlags().length }); } catch {}
    const ch = this.settings().logChannel;
    if (ch && this.bridge.running) {
      const who = userId ? `<@${userId}> (${name || userId})` : '';
      this.rest('POST', `/channels/${ch}/messages`, { content: plain(`🛡️ ${what}${who ? ` ${who}` : ''}${why ? `: ${line.why}` : ''}${by !== 'Bob' ? ` (by ${by})` : ''}`, 1900), allowed_mentions: { parse: [] } }).catch(() => {});
    }
    return line;
  }

  // ---------- Who is who ----------
  guild(d) {
    if (!d?.id) return;
    const roles = new Map();
    for (const r of d.roles || []) roles.set(String(r.id), { name: String(r.name || ''), perms: BigInt(String(r.permissions || '0').replace(/\D/g, '') || '0') });
    this.guilds.set(String(d.id), { ownerId: String(d.owner_id || ''), roles, name: plain(d.name || this.guilds.get(String(d.id))?.name || '', 60) });
  }
  async rolesOf(guildId) {
    const g = this.guilds.get(guildId);
    if (g && (g.roles.size || g.stale > this.now())) return g;
    try {
      const roles = await this.rest('GET', `/guilds/${guildId}/roles`);
      this.guild({ id: guildId, owner_id: g?.ownerId || '', roles });
    } catch {}
    const got = this.guilds.get(guildId) || { ownerId: '', roles: new Map() };
    if (!got.roles.size) { got.stale = this.now() + 600_000; this.guilds.set(guildId, got); } // ask again in 10 minutes, not on every message
    return got;
  }
  async isMod(guildId, userId, roleIds = []) {
    const s = this.settings();
    if (userId && userId === this.bridge.settings().ownerId) return true;
    const g = await this.rolesOf(guildId);
    if (g.ownerId && g.ownerId === userId) return true;
    for (const r of roleIds.map(String)) {
      if (s.modRoles.includes(r)) return true;
      if (((g.roles.get(r)?.perms || 0n) & MOD_PERMS) !== 0n) return true;
    }
    return false;
  }

  watched(channelId) { const s = this.settings(); return !s.channels.length || s.channels.includes(channelId); }

  // ---------- A message on the server ----------
  // true: Bob dealt with it (deleted it, or it was a command), so nothing else reads it.
  async message(m) {
    if (!this.on() || !m?.guild_id) return false;
    const s = this.settings();
    const guildId = String(m.guild_id), channelId = String(m.channel_id || ''), who = String(m.author?.id || '');
    const text = String(m.content || '');
    const roles = (m.member?.roles || []).map(String);
    this.liftLockdowns();
    if (text.startsWith(s.prefix) && /^[a-z]/i.test(text.slice(s.prefix.length))) {
      const done = await this.command(m, s);
      if (done) return true;
    }
    if (!this.watched(channelId)) return false;
    if (await this.isMod(guildId, who, roles)) return false;
    const key = `${guildId}:${who}`;
    const now = this.now();
    const mine = (this.recent.get(key) || []).filter((x) => now - x.at < DUPE_WINDOW);
    const norm = text.trim().toLowerCase().replace(/\s+/g, ' ');
    mine.push({ at: now, text: norm, channelId, id: String(m.id) });
    this.recent.set(key, mine.slice(-30));
    if (this.recent.size > 5000) this.recent.delete(this.recent.keys().next().value);

    let hit = null;
    if (s.spam) {
      if (mine.filter((x) => now - x.at < FLOOD_WINDOW).length >= s.floodCount) hit = { rule: 'spam (too many messages too fast)', act: 'delete' };
      else if (norm.length > 0 && (m.attachments?.length ? false : true) && mine.filter((x) => x.text === norm).length >= s.dupeCount) hit = { rule: 'spam (the same message again and again)', act: 'delete' };
      else if (mentionCount(m) >= s.mentionCount) hit = { rule: 'spam (too many mentions)', act: 'delete' };
    }
    const joined = Date.parse(m.member?.joined_at || '');
    hit ||= linkHit(text, s, { newMember: Number.isFinite(joined) && now - joined < NEW_MEMBER_MS });
    hit ||= wordHit(text, s);
    if (!hit) return false;
    const name = nameOf(m);
    if (hit.act === 'flag') { this.flag({ guildId, channelId, messageId: String(m.id), userId: who, name, text, why: hit.rule }); return false; }
    await this.remove(channelId, String(m.id), hit.rule);
    // A flood: the messages just before it go too.
    if (/too many messages/.test(hit.rule)) for (const x of mine.filter((y) => now - y.at < FLOOD_WINDOW && y.id !== String(m.id))) await this.remove(x.channelId, x.id, '');
    const last = this.warnedAt.get(key) || 0;
    if (now - last > FLOOD_WINDOW * 3) { this.warnedAt.set(key, now); await this.warn({ guildId, channelId, userId: who, name, why: hit.rule }); }
    return true;
  }

  async remove(channelId, messageId, why) {
    try { await this.rest('DELETE', `/channels/${channelId}/messages/${messageId}`, null, { reason: why || 'Bob: rule' }); return true; }
    catch (e) { this.bridge.log(`couldn't delete a message (${e.message}). Bob needs Manage Messages.`); return false; }
  }

  // A notice in the channel that pings only that person, and tidies itself away.
  async notice(channelId, userId, text) {
    if (!this.bridge.running) return;
    try {
      const sent = await this.rest('POST', `/channels/${channelId}/messages`, { content: plain(`<@${userId}> ${text}`, 1900), allowed_mentions: { users: [userId] } });
      if (sent?.id) this.later(() => this.rest('DELETE', `/channels/${channelId}/messages/${sent.id}`).catch(() => {}), NOTICE_MS);
    } catch {}
  }

  warningsOf(guildId, userId) {
    const s = this.settings();
    const key = `${guildId}:${userId}`;
    const keep = (this.state.warnings[key] || []).filter((t) => this.now() - t < s.forgetDays * 86400_000);
    if (keep.length) this.state.warnings[key] = keep; else delete this.state.warnings[key];
    return keep;
  }

  // One more warning, and whatever the ladder says comes with it.
  async warn({ guildId, channelId, userId, name, why, by = 'Bob' }) {
    const s = this.settings();
    const list = this.warningsOf(guildId, userId);
    list.push(this.now());
    this.state.warnings[`${guildId}:${userId}`] = list;
    const step = ladder(list.length, s);
    this.note(`Warning ${list.length}`, { guildId, userId, name, why, by });
    if (step.kind === 'warn') { if (channelId) await this.notice(channelId, userId, `that broke a server rule (${why}), so I took it down.${nextStep(list.length, s)}`); return step; }
    if (step.kind === 'timeout') {
      await this.timeout(guildId, userId, step.minutes, `warning ${list.length}: ${why}`, { name, by });
      if (channelId) await this.notice(channelId, userId, `that broke a server rule (${why}). Timeout for ${this.span(step.minutes)}.${nextStep(list.length, s)}`);
      return step;
    }
    await this.ask(step.kind, { guildId, userId, name, why: `warning ${list.length}: ${why}`, by, channelId });
    return step;
  }

  span(min) { return min >= 1440 ? `${Math.round(min / 1440)} day${min >= 2880 ? 's' : ''}` : min >= 60 ? `${Math.round(min / 60)} hour${min >= 120 ? 's' : ''}` : `${min} minute${min === 1 ? '' : 's'}`; }

  async timeout(guildId, userId, minutes, why, { name = '', by = 'Bob', quiet = false } = {}) {
    const until = minutes > 0 ? new Date(this.now() + minutes * 60000).toISOString() : null;
    try {
      await this.rest('PATCH', `/guilds/${guildId}/members/${userId}`, { communication_disabled_until: until }, { reason: why });
      if (!quiet) this.note(minutes > 0 ? `Timeout ${this.span(minutes)}` : 'Timeout lifted', { guildId, userId, name, why, by });
      return true;
    } catch (e) { this.note('Couldn\'t time out', { guildId, userId, name, why: `${e.message}. Bob needs Timeout Members, and a role above theirs.`, by }); return false; }
  }

  // A kick or ban: straight away if "Kicks and bans need my OK" is off or you asked for it yourself; otherwise it waits
  // for you, and the person sits in a timeout meanwhile.
  async ask(kind, { guildId, userId, name, why, by = 'Bob', channelId = '', approved = false }) {
    const s = this.settings();
    if (approved || !s.needOk) return this.act(kind, { guildId, userId, name, why, by });
    if (this.state.pending.some((p) => p.state === 'waiting' && p.kind === kind && p.guildId === guildId && p.userId === userId)) return { waiting: true };
    const p = { id: shortId(), kind, guildId, userId, name, why: plain(why, 200), by, at: this.now(), state: 'waiting' };
    this.state.pending.push(p);
    if (this.state.pending.length > KEEP_PENDING) this.state.pending.splice(0, this.state.pending.length - KEEP_PENDING);
    await this.timeout(guildId, userId, HOLD_MIN, `holding while the owner decides on a ${kind}`, { name, quiet: true });
    this.note(`${kind === 'ban' ? 'Ban' : 'Kick'} waiting for your OK (${p.id})`, { guildId, userId, name, why, by });
    if (channelId) await this.notice(channelId, userId, `that's one too many (${why}). You're in a timeout while the server owner decides.`);
    const b = this.bridge.settings();
    if (b.dmEnabled && b.ownerId) {
      const text = `🛡️ ${kind === 'ban' ? 'Ban' : 'Kick'} ${name} (${userId})? ${p.why}. They're in a one-hour timeout meanwhile.`;
      if (b.dmApprove) this.bridge.dm(text, { components: [{ type: 1, components: [{ type: 2, style: 4, label: kind === 'ban' ? 'Ban' : 'Kick', custom_id: `mod:${p.id}:1` }, { type: 2, style: 2, label: 'Leave it', custom_id: `mod:${p.id}:0` }] }] });
      else this.bridge.dm(`${text}\nAnswer in Settings on this replicant matrix, or type ${s.prefix}ok ${p.id} or ${s.prefix}no ${p.id} on the server.`);
    }
    return { waiting: true, id: p.id };
  }

  async act(kind, { guildId, userId, name, why, by }) {
    try {
      if (kind === 'ban') await this.rest('PUT', `/guilds/${guildId}/bans/${userId}`, { delete_message_seconds: 3600 }, { reason: why });
      else await this.rest('DELETE', `/guilds/${guildId}/members/${userId}`, null, { reason: why });
      this.note(kind === 'ban' ? 'Banned' : 'Kicked', { guildId, userId, name, why, by });
      return { done: true };
    } catch (e) { this.note(`Couldn't ${kind}`, { guildId, userId, name, why: `${e.message}. Bob needs ${kind === 'ban' ? 'Ban' : 'Kick'} Members, and a role above theirs.`, by }); return { error: e.message }; }
  }

  waiting() { return this.state.pending.filter((p) => p.state === 'waiting'); }

  // Your answer: from Settings, your DM buttons, or !ok / !no on the server.
  async answer(id, ok, by = 'you') {
    const p = this.state.pending.find((x) => x.id === id);
    if (!p) return { error: 'not found' };
    if (p.state !== 'waiting') return { error: `already ${p.state}` };
    p.state = ok ? 'done' : 'declined';
    p.answeredAt = this.now();
    this.save();
    if (ok) return this.act(p.kind, { ...p, by });
    await this.timeout(p.guildId, p.userId, 0, 'the owner said leave it', { name: p.name, quiet: true });
    this.note(`${p.kind === 'ban' ? 'Ban' : 'Kick'} declined, timeout lifted`, { guildId: p.guildId, userId: p.userId, name: p.name, by });
    return { ok: true };
  }

  // ---------- Flags: unclear cases, for you ----------
  flag({ guildId, channelId, messageId, userId, name, text, why, by = 'Bob' }) {
    if (this.state.flags.some((f) => f.messageId && f.messageId === messageId && f.why === why)) return null;
    const f = { id: shortId(), at: this.now(), guildId, channelId, messageId, userId, name, text: plain(text, 300), why, by, state: 'open', brain: '' };
    this.state.flags.push(f);
    if (this.state.flags.length > KEEP_FLAGS) this.state.flags.splice(0, this.state.flags.length - KEEP_FLAGS);
    this.note(`Flagged for a look (${f.id})`, { guildId, userId, name, why, by });
    if (this.settings().askBrain) this.review(f);
    return f;
  }
  openFlags() { return this.state.flags.filter((f) => f.state === 'open'); }

  // A flag you answer: Remove deletes the message and warns; Fine closes it.
  async settle(id, remove, by = 'you') {
    const f = this.state.flags.find((x) => x.id === id);
    if (!f) return { error: 'not found' };
    if (f.state !== 'open') return { error: `already ${f.state}` };
    f.state = remove ? 'removed' : 'fine';
    this.save();
    if (remove) {
      if (f.channelId && f.messageId) await this.remove(f.channelId, f.messageId, f.why);
      if (f.userId) await this.warn({ guildId: f.guildId, channelId: f.channelId, userId: f.userId, name: f.name, why: f.why, by });
    } else this.note(`Flag ${f.id} looked at: fine`, { guildId: f.guildId, userId: f.userId, name: f.name, by });
    return { ok: true };
  }

  // Only with "Ask a brain about unclear cases" on. One short job, no tools, as strict as any Discord job. The brain
  // can only say remove (delete and warn), fine, or leave it for you.
  review(f) {
    const brain = this.bridge.brain;
    if (!brain?.enqueue) return;
    const rules = this.settings().rules;
    const prompt = `You help moderate a Discord server. ${rules ? `The server's rules: ${rules}\n` : ''}A message was flagged because of ${f.why}.\nThe message: """${f.text}"""\nAnswer with one word first, REMOVE, FINE or OWNER (when unsure), then one short reason.`;
    try {
      const r = brain.enqueue(REVIEW_SESSION, prompt, [], 'low', { guest: { from: 'Discord', need: 'chat', public: true, tools: ['use_tools'] } });
      this.reviews.set(r.jobId, { flagId: f.id, text: '' });
    } catch (e) { this.bridge.log(`couldn't ask a brain about flag ${f.id}: ${e.message}`); }
  }
  reviewEvent(ev) {
    const r = this.reviews.get(ev.turnId);
    if (!r) return false;
    if (ev.type === 'token') r.text += String(ev.text || '');
    else if (ev.type === 'approval') { try { this.bridge.brain.answerApproval?.(ev.id, false); } catch {} }
    else if (ev.type === 'done' || ev.type === 'error') {
      this.reviews.delete(ev.turnId);
      const f = this.state.flags.find((x) => x.id === r.flagId);
      if (!f || f.state !== 'open') return true;
      const said = r.text.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
      f.brain = plain(said, 300);
      const word = (/^\W*(REMOVE|FINE|OWNER)\b/i.exec(said) || [])[1]?.toUpperCase();
      this.save();
      if (word === 'REMOVE') this.settle(f.id, true, 'a brain').catch(() => {});
      else if (word === 'FINE') this.settle(f.id, false, 'a brain').catch(() => {});
      else this.note(`Flag ${f.id}: the brain left it for you`, { guildId: f.guildId, userId: f.userId, name: f.name, why: f.brain });
    }
    return true;
  }

  // ---------- New members: raid guard and welcome ----------
  async joined(d) {
    if (!this.on() || !d?.guild_id || d.user?.bot) return;
    const s = this.settings();
    const guildId = String(d.guild_id), userId = String(d.user?.id || '');
    const now = this.now();
    if (s.raid) {
      const list = (this.joins.get(guildId) || []).filter((t) => now - t < RAID_WINDOW);
      list.push(now);
      this.joins.set(guildId, list);
      if (list.length >= s.raidJoins && !this.state.lockdowns[guildId]) await this.lockdown(guildId, { seconds: s.raidSlow, minutes: s.raidMinutes, why: `${list.length} people joined in a minute` });
    }
    if (s.welcome && s.welcomeChannel && !this.state.lockdowns[guildId]) {
      const text = s.welcomeText.replace(/\{user\}/g, `<@${userId}>`).replace(/\{name\}/g, nameOf(d));
      const button = s.verifyRole ? { components: [{ type: 1, components: [{ type: 2, style: 3, label: 'I agree', custom_id: `verify:${guildId}` }] }] } : {};
      await this.rest('POST', `/channels/${s.welcomeChannel}/messages`, { content: plain(`${text}${s.rules ? `\n\n${s.rules}` : ''}`, 1900), allowed_mentions: { users: [userId] }, ...button }).catch((e) => this.bridge.log(`couldn't post a welcome: ${e.message}`));
    }
  }

  // Slow mode on every watched text channel, put back the way it was when it's over.
  async lockdown(guildId, { seconds, minutes, why, by = 'Bob' }) {
    let chans = [];
    try { chans = (await this.rest('GET', `/guilds/${guildId}/channels`)) || []; } catch (e) { this.note('Couldn\'t start slow mode', { guildId, why: e.message, by }); return false; }
    const s = this.settings();
    const was = [];
    for (const c of chans) {
      if (![0, 5, 15].includes(Number(c.type)) || (s.channels.length && !s.channels.includes(String(c.id)))) continue;
      try { await this.rest('PATCH', `/channels/${c.id}`, { rate_limit_per_user: seconds }, { reason: `Bob: ${why}` }); was.push({ id: String(c.id), was: Number(c.rate_limit_per_user) || 0 }); } catch {}
    }
    this.state.lockdowns[guildId] = { until: minutes > 0 ? this.now() + minutes * 60000 : 0, channels: was, why };
    this.note(`Raid guard: slow mode ${seconds} s on ${was.length} channel${was.length === 1 ? '' : 's'}${minutes > 0 ? ` for ${this.span(minutes)}` : ''}`, { guildId, why, by });
    if (minutes > 0) this.later(() => this.liftLockdowns(), minutes * 60000 + 1000);
    return true;
  }
  async unlock(guildId, by = 'Bob') {
    const l = this.state.lockdowns[guildId];
    if (!l) return false;
    delete this.state.lockdowns[guildId];
    for (const c of l.channels) await this.rest('PATCH', `/channels/${c.id}`, { rate_limit_per_user: c.was }, { reason: 'Bob: raid guard over' }).catch(() => {});
    this.note('Raid guard over: slow mode back as it was', { guildId, by });
    return true;
  }
  liftLockdowns() {
    for (const [g, l] of Object.entries(this.state.lockdowns)) if (l.until && l.until <= this.now()) this.unlock(g).catch(() => {});
  }

  // ---------- Buttons: I agree, and Kick / Ban in your DMs ----------
  async button(it) {
    const id = String(it?.data?.custom_id || '');
    const reply = (content) => this.rest('POST', `/interactions/${it.id}/${it.token}/callback`, { type: 4, data: { content, flags: 64 } }).catch(() => {});
    const who = String(it?.user?.id || it?.member?.user?.id || '');
    let m = /^verify:(\d+)$/.exec(id);
    if (m) {
      const s = this.settings();
      if (!this.on() || !s.verifyRole || String(it.guild_id || '') !== m[1]) { await reply('That button is switched off.'); return true; }
      try { await this.rest('PUT', `/guilds/${m[1]}/members/${who}/roles/${s.verifyRole}`, null, { reason: 'Bob: agreed to the rules' }); await reply('Thanks! You\'re in.'); this.note('Agreed to the rules', { guildId: m[1], userId: who, name: nameOf(it.member || it) }); }
      catch (e) { await reply('I couldn\'t give you the role. A moderator will sort it out.'); this.bridge.log(`couldn't give the verify role: ${e.message}. Bob needs Manage Roles, and a role above it.`); }
      return true;
    }
    m = /^mod:([0-9a-f]{6}):([01])$/.exec(id);
    if (m) {
      const b = this.bridge.settings();
      if (!b.ownerId || who !== b.ownerId || !b.dmApprove) { await reply('Not yours to answer.'); return true; }
      const r = await this.answer(m[1], m[2] === '1', 'you, in Discord DMs');
      const was = String(it?.message?.content || '').slice(0, 1800);
      await this.rest('POST', `/interactions/${it.id}/${it.token}/callback`, { type: 7, data: { content: `${was}\n\n${r.error ? `Already answered.` : m[2] === '1' ? 'Done.' : 'Left it.'}`, components: [] } }).catch(() => {});
      return true;
    }
    return false;
  }

  // ---------- Commands ----------
  async command(m, s) {
    const guildId = String(m.guild_id), channelId = String(m.channel_id || ''), who = String(m.author?.id || '');
    const [word, ...rest] = String(m.content).slice(s.prefix.length).trim().split(/\s+/);
    const cmd = word.toLowerCase();
    const args = rest.join(' ');
    const say = (text) => this.rest('POST', `/channels/${channelId}/messages`, { content: plain(text, 1900), allowed_mentions: { parse: [] }, message_reference: { message_id: String(m.id), fail_if_not_exists: false } }).catch(() => {});
    const target = () => {
      const id = (/^<@!?(\d{15,22})>/.exec(rest[0] || '') || /^(\d{15,22})$/.exec(rest[0] || '') || [])[1];
      const u = id && (m.mentions || []).find((x) => String(x.id) === id);
      return id ? { userId: id, name: u ? nameOf({ author: u, member: u.member }) : id } : null;
    };
    const why = (n = 1) => rest.slice(n).join(' ').slice(0, 200);
    const by = nameOf(m);

    // Anyone
    if (cmd === 'report') {
      if (!s.reports) return false;
      const ref = m.referenced_message;
      const t = target() || (ref ? { userId: String(ref.author?.id || ''), name: nameOf(ref) } : null);
      if (!t) { await say(`Reply to the message with ${s.prefix}report and why, or ${s.prefix}report @someone why.`); return true; }
      this.flag({ guildId, channelId, messageId: ref ? String(ref.id) : '', userId: t.userId, name: t.name, text: ref ? String(ref.content || '') : args, why: `report: ${(target() ? why() : args) || 'no reason given'}`, by });
      await this.remove(channelId, String(m.id), 'Bob: report taken');
      await this.notice(channelId, who, 'thanks, the moderators have your report.');
      return true;
    }
    if (cmd === 'roles' || cmd === 'role') {
      if (!s.selfRoles.length) return false;
      const g = await this.rolesOf(guildId);
      const mine = s.selfRoles.map((id) => ({ id, name: g.roles.get(id)?.name || id }));
      if (cmd === 'roles' || !args) { await say(`Roles you can give yourself: ${mine.map((r) => r.name).join(', ')}. Type ${s.prefix}role and a name to add it, again to take it off.`); return true; }
      const want = mine.find((r) => r.name.toLowerCase() === args.toLowerCase().replace(/^@/, ''));
      if (!want) { await say(`That's not one of them. ${s.prefix}roles lists them.`); return true; }
      const has = (m.member?.roles || []).map(String).includes(want.id);
      try { await this.rest(has ? 'DELETE' : 'PUT', `/guilds/${guildId}/members/${who}/roles/${want.id}`, null, { reason: 'Bob: self role' }); await say(has ? `Took off ${want.name}.` : `Gave you ${want.name}.`); }
      catch (e) { await say('I couldn\'t change that role. Bob needs Manage Roles, and a role above it.'); }
      return true;
    }

    const MOD_CMDS = ['warn', 'warnings', 'clearwarnings', 'timeout', 'untimeout', 'kick', 'ban', 'slowmode', 'lockdown', 'unlock', 'purge', 'ok', 'no', 'modhelp'];
    if (!MOD_CMDS.includes(cmd)) return false;
    if (!(await this.isMod(guildId, who, (m.member?.roles || []).map(String)))) return false; // not a moderator: as if Bob didn't hear
    const owner = who === this.bridge.settings().ownerId;
    const t = target();
    const need = async () => { await say(`Who? ${s.prefix}${cmd} @someone${['timeout'].includes(cmd) ? ' 10m' : ''} why`); return true; };
    switch (cmd) {
      case 'modhelp': await say(`${s.prefix}warn, ${s.prefix}warnings, ${s.prefix}clearwarnings, ${s.prefix}timeout @someone 10m, ${s.prefix}untimeout, ${s.prefix}kick, ${s.prefix}ban, ${s.prefix}slowmode 30, ${s.prefix}lockdown, ${s.prefix}unlock, ${s.prefix}purge 20${owner ? `, ${s.prefix}ok and ${s.prefix}no for kicks and bans waiting` : ''}. Anyone: ${s.prefix}report${s.selfRoles.length ? `, ${s.prefix}roles` : ''}.`); return true;
      case 'warn': if (!t) return need(); await this.warn({ guildId, channelId, ...t, why: why() || 'a moderator\'s warning', by }); return true;
      case 'warnings': if (!t) return need(); { const n = this.warningsOf(guildId, t.userId).length; await say(`${t.name}: ${n} warning${n === 1 ? '' : 's'} in the last ${s.forgetDays} days.`); } return true;
      case 'clearwarnings': if (!t) return need(); delete this.state.warnings[`${guildId}:${t.userId}`]; this.note('Warnings cleared', { guildId, ...t, by }); await say(`Cleared ${t.name}'s warnings.`); return true;
      case 'timeout': { if (!t) return need(); const min = minutesOf(rest[1]) || s.timeoutMinutes; if (await this.timeout(guildId, t.userId, min, why(minutesOf(rest[1]) ? 2 : 1) || 'a moderator\'s timeout', { name: t.name, by })) await say(`${t.name}: timeout for ${this.span(min)}.`); return true; }
      case 'untimeout': if (!t) return need(); if (await this.timeout(guildId, t.userId, 0, 'lifted by a moderator', { name: t.name, by })) await say(`${t.name} can talk again.`); return true;
      case 'kick': case 'ban': {
        if (!t) return need();
        const r = await this.ask(cmd, { guildId, ...t, why: why() || `a moderator's ${cmd}`, by, approved: owner });
        await say(r.done ? `${cmd === 'ban' ? 'Banned' : 'Kicked'} ${t.name}.` : r.waiting ? `${t.name} is in a timeout. The ${cmd} waits for the owner's OK${r.id ? ` (${r.id})` : ''}.` : `Couldn't: ${r.error || 'no reason'}.`);
        return true;
      }
      case 'ok': case 'no': {
        if (!owner) { await say('Only the owner answers those.'); return true; }
        const id = (rest[0] || '').toLowerCase();
        const r = await this.answer(id, cmd === 'ok', 'you, on the server');
        await say(r.error ? (r.error === 'not found' ? 'No kick or ban waits with that code.' : `That one is ${r.error}.`) : cmd === 'ok' ? 'Done.' : 'Left it.');
        return true;
      }
      case 'slowmode': {
        const secs = Math.min(21600, Math.max(0, Number(rest[0] ?? 30) || 0));
        try { await this.rest('PATCH', `/channels/${channelId}`, { rate_limit_per_user: secs }, { reason: `Bob: slow mode by ${by}` }); this.note(secs ? `Slow mode ${secs} s` : 'Slow mode off', { guildId, by }); await say(secs ? `Slow mode: one message every ${secs} s.` : 'Slow mode off.'); }
        catch (e) { await say('I couldn\'t. Bob needs Manage Channels.'); }
        return true;
      }
      case 'lockdown': if (this.state.lockdowns[guildId]) { await say(`Already on. ${s.prefix}unlock ends it.`); return true; } await this.lockdown(guildId, { seconds: s.raidSlow, minutes: minutesOf(rest[0]) || 0, why: why(minutesOf(rest[0]) ? 1 : 0) || 'a moderator asked', by }); await say(`Slow mode ${s.raidSlow} s on every channel I watch. ${s.prefix}unlock ends it.`); return true;
      case 'unlock': await say((await this.unlock(guildId, by)) ? 'Slow mode is back as it was.' : 'Nothing is locked down.'); return true;
      case 'purge': {
        const n = Math.min(100, Math.max(2, Number(rest[0]) || 0));
        if (!Number(rest[0])) { await say(`How many? ${s.prefix}purge 20 (2 to 100).`); return true; }
        try {
          const list = await this.rest('GET', `/channels/${channelId}/messages?limit=${n}&before=${m.id}`);
          const ids = (list || []).filter((x) => this.now() - Date.parse(x.timestamp || 0) < 13 * 86400_000).map((x) => String(x.id));
          if (ids.length >= 2) await this.rest('POST', `/channels/${channelId}/messages/bulk-delete`, { messages: ids }, { reason: `Bob: purge by ${by}` });
          else if (ids.length) await this.remove(channelId, ids[0], `Bob: purge by ${by}`);
          await this.remove(channelId, String(m.id), '');
          this.note(`Purged ${ids.length} messages`, { guildId, by });
        } catch (e) { await say('I couldn\'t. Bob needs Manage Messages and Read Message History.'); }
        return true;
      }
      default: return false;
    }
  }

  view() {
    const recent = this.state.log.slice(-25).reverse();
    return { waiting: this.waiting(), flags: this.openFlags().slice(-25).reverse(), log: recent, lockdowns: Object.keys(this.state.lockdowns).length };
  }
}

// ---------- discord_mod: the tool for your own chats with Bob ----------
// Built to docs/WRITING-TOOLS.md and the GPT-OSS 120B interview (Nov 13): one tool with an action, defaults and checks
// in code, and a result that says exactly what happened. A kick, a ban or deleting a flagged message always shows an
// OK card (alwaysAsk: "Work without asking" doesn't skip it). Discord jobs and guests never get this tool.
const fnSchema = (name, description, properties, required) => ({ type: 'function', function: { name, description, parameters: { type: 'object', properties, required } } });
const str = (description, extra = {}) => ({ type: 'string', description, ...extra });
const ACTIONS = { approve: 'allow', yes: 'allow', ok: 'allow', accept: 'allow', remove: 'allow', decline: 'deny', no: 'deny', reject: 'deny', fine: 'deny', keep: 'deny', list: 'status', show: 'status', check: 'status', lock: 'lockdown', 'slow mode': 'lockdown', slowmode: 'lockdown', unlockdown: 'unlock' };
export const modOn = (cfg) => cfg?.discord?.enabled === true && cfg?.discord?.mod?.enabled === true;

export function modTool(brain) {
  const mod = () => brain.discord?.mod;
  const find = (id) => {
    const m = mod();
    const k = String(id || '').trim().toLowerCase().replace(/^#/, '');
    return { p: m?.state.pending.find((x) => x.id === k), f: m?.state.flags.find((x) => x.id === k), k };
  };
  const actionOf = (a) => { const x = String(a || 'status').trim().toLowerCase(); return ACTIONS[x] || x; };
  const serverOf = (m, server) => {
    const all = [...m.guilds.entries()];
    const want = String(server || '').trim().toLowerCase();
    if (want) { const hit = all.find(([id, g]) => id === want || g.name.toLowerCase() === want); return hit ? { id: hit[0], name: hit[1].name || hit[0] } : { error: `No server called "${server}". Servers: ${all.map(([id, g]) => g.name || id).join(', ') || 'none yet'}.` }; }
    if (all.length === 1) return { id: all[0][0], name: all[0][1].name || all[0][0] };
    return { error: all.length ? `Which server? Put one in server: ${all.map(([id, g]) => g.name || id).join(', ')}.` : 'Bob isn\'t connected to a Discord server yet.' };
  };
  return {
    schema: fnSchema('discord_mod', 'Keep order on {{USER}}\'s Discord: what waits, answer a kick, ban or flag by id, raid slow mode.', {
      action: str('', { enum: ['status', 'allow', 'deny', 'lockdown', 'unlock'] }),
      id: str('allow/deny: the id from status'),
      server: str('only if Bob is on several')
    }, ['action']),
    alwaysAsk: true,
    check(a) {
      const act = actionOf(a.action);
      if (act !== 'allow') return null;
      const { p, f } = find(a.id);
      if (p?.state === 'waiting') return `${p.kind === 'ban' ? 'Ban' : 'Kick'} ${p.name} from the Discord server (${p.why})`;
      if (f?.state === 'open') return `Delete ${f.name}'s flagged Discord message and warn them (${f.why})`;
      return null;
    },
    async run(a) {
      const m = mod();
      if (!m || !modOn(brain.cfg)) return 'Keep order is off. It\'s in Settings, Online services, Bob on Discord, Keep order.';
      const act = actionOf(a.action);
      if (act === 'status') {
        const w = m.waiting(), fl = m.openFlags();
        const out = [];
        out.push(w.length ? `Waiting for {{USER}}'s OK: ${w.map((p) => `${p.id} ${p.kind} ${p.name} (${p.why})`).join('; ')}.` : 'No kick or ban waits.');
        out.push(fl.length ? `Flagged: ${fl.slice(-10).map((f) => `${f.id} ${f.name}: ${f.why}${f.text ? `, "${f.text.slice(0, 80)}"` : ''}`).join('; ')}.` : 'Nothing flagged.');
        const log = m.state.log.slice(-5).map((l) => `${new Date(l.at).toISOString().slice(0, 16).replace('T', ' ')} ${l.what}${l.name ? ` ${l.name}` : ''}`);
        if (log.length) out.push(`Last actions: ${log.join('; ')}.`);
        if (Object.keys(m.state.lockdowns).length) out.push('Raid guard slow mode is on.');
        return out.join(' ');
      }
      if (act === 'allow' || act === 'deny') {
        const { p, f, k } = find(a.id);
        if (!k) return 'Which one? Put its id in id (action status lists them).';
        if (p) {
          if (p.state !== 'waiting') return `${p.id} is already ${p.state}. Nothing changed.`;
          const r = await m.answer(p.id, act === 'allow', 'you, in chat');
          if (r.error) return `Couldn't ${p.kind} ${p.name}: ${r.error}`;
          return act === 'allow' ? `${p.kind === 'ban' ? 'Banned' : 'Kicked'} ${p.name} from the server.` : `Left ${p.name} alone: no ${p.kind}, and their holding timeout is lifted.`;
        }
        if (f) {
          if (f.state !== 'open') return `Flag ${f.id} is already ${f.state}. Nothing changed.`;
          await m.settle(f.id, act === 'allow', 'you, in chat');
          return act === 'allow' ? `Deleted ${f.name}'s flagged message and warned them (${m.warningsOf(f.guildId, f.userId).length} warnings now).` : `Flag ${f.id} closed as fine. Nothing deleted.`;
        }
        return `Nothing waits with id ${k}. ${m.waiting().length + m.openFlags().length ? 'Use action status to see the ids.' : 'Nothing waits at all.'}`;
      }
      if (act === 'lockdown' || act === 'unlock') {
        const g = serverOf(m, a.server);
        if (g.error) return g.error;
        if (act === 'unlock') return (await m.unlock(g.id, 'you, in chat')) ? `Slow mode on ${g.name} is back as it was.` : `${g.name} isn't in slow mode. Nothing changed.`;
        if (m.state.lockdowns[g.id]) return `${g.name} is already in slow mode. Nothing changed.`;
        const s = m.settings();
        return (await m.lockdown(g.id, { seconds: s.raidSlow, minutes: s.raidMinutes, why: 'asked in chat', by: 'you, in chat' })) ? `Slow mode ${s.raidSlow} s on ${g.name}'s channels for ${m.span(s.raidMinutes)}, then back as it was.` : `Couldn't start slow mode on ${g.name}. Bob needs Manage Channels.`;
      }
      return `There's no action "${a.action}". Use status, allow, deny, lockdown or unlock.`;
    },
    summary: ({ action, id }) => `Discord keep order: ${actionOf(action)}${id ? ` ${id}` : ''}`
  };
}

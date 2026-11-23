// Nov 23 2026 (the owner: "How do we know that bob isnt sending anything out?", "We claim privacy but I dont know how
// to prove it"). "Where Bob connected": every connection Bob's own program opens to another computer is written down,
// with the site, the time and which of Bob's services it belongs to. It sits under every way Bob's program goes out
// (fetch, http and https, mail, Discord's and Telegram's connections, all of them end in net.connect or tls.connect), so
// nothing Bob's own code does can skip it. Connections on this replicant matrix itself (the brain engines, the Lab)
// aren't written down. Programs Bob starts (coding agents, commands, Python) are separate programs: this log can't see
// their connections, and Help says so.
//
// It only watches and writes down; it never blocks (refusing what isn't on the list comes next, once the log has shown
// what real use looks like). Kept in net-log.jsonl in Bob's data folder (about 1 MB, then the older half moves to
// net-log.jsonl.1), and the last 500 in memory for Settings. Repeats to the same site within a minute are one line
// with a count.
import fs from 'node:fs';
import path from 'node:path';
import net from 'node:net';
import tls from 'node:tls';
import { PRIVACY_SERVICES } from './privacy-services.js';
import { rentalsOf } from './rental.js';
import { moreTools } from './more-tools.js';
import { loadServers } from './mcp.js';

export const NET_LOG = 'net-log.jsonl';
export const NET_LOG_MAX = 1e6;
const KEEP = 500, SAME_MS = 60000;

// Site -> what it is. A leading '.' matches the site and everything under it.
export const KNOWN_HOSTS = [
  [['api.telegram.org'], 'telegram'],
  [['discord.com', '.discord.gg', '.discordapp.com', '.discordapp.net'], 'discord'],
  [['duckduckgo.com', '.duckduckgo.com'], 'web-search'],
  [['api.mojeek.com', 'api.search.brave.com', 'api.tavily.com', '.marginalia-search.com', '.marginalia.nu'], 'search-backup'],
  [['api.anthropic.com', 'api.openai.com', 'generativelanguage.googleapis.com'], 'cloud-helpers'],
  [['openrouter.ai', 'api.together.xyz', 'api.lambda.ai'], 'rent-answer'],
  [['api.runpod.io', 'api.runpod.ai', '.proxy.runpod.net', 'console.vast.ai', 'cloud.lambda.ai'], 'rent-machine'],
  [['api.x.ai'], 'talk-cloud'],
  [['github.com', 'api.github.com', '.githubusercontent.com'], 'Updates and downloads (GitHub)'],
  [['huggingface.co', '.huggingface.co', '.hf.co'], 'Model downloads (Hugging Face)'],
  [['modelscope.cn', '.modelscope.cn'], 'Model downloads (ModelScope)'],
  [['pypi.org', 'files.pythonhosted.org', 'download.pytorch.org', 'registry.npmjs.org', 'nodejs.org', 'www.nuget.org', 'api.nuget.org', 'globalcdn.nuget.org'], 'Program downloads you started'],
  [['api.open-meteo.com', 'geocoding-api.open-meteo.com'], 'Weather'],
  [['api.pwnedpasswords.com', 'haveibeenpwned.com', 'crt.sh', 'rdap.org', '.rdap.org'], 'Security look-ups'],
  [['.ts.net'], 'Bob-Net (your own Bobs)']
];
const LOOPBACK = /^(localhost|127(?:\.\d{1,3}){3}|::1|\[::1\]|::ffff:127(?:\.\d{1,3}){3})$/i;
const TAILSCALE = /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.\d{1,3}\.\d{1,3}$/;

export function whatIs(host, cfg = {}) {
  const h = String(host || '').toLowerCase().replace(/^\[|\]$/g, '').replace(/\.$/, '');
  if (!h) return '';
  const mail = String(moreTools(cfg).emailHost || '').toLowerCase();
  if (mail && h === mail) return 'email';
  if (TAILSCALE.test(h)) return 'Bob-Net (your own Bobs)';
  for (const [list, what] of KNOWN_HOSTS) if (list.some((x) => (x.startsWith('.') ? h.endsWith(x) || h === x.slice(1) : h === x))) return what;
  try { if (loadServers(cfg).some((s) => s.on && s.url && new URL(s.url).hostname.toLowerCase() === h)) return 'mcp-remote'; } catch {}
  return '';
}
export const label = (what) => PRIVACY_SERVICES[what]?.name || what || 'Not on Bob\'s list';

// The services that can send your data out right now (their switch is on).
export function sendingNow(cfg = {}, { agents = 0 } = {}) {
  const st = rentalsOf(cfg);
  const on = {
    telegram: cfg.telegram?.enabled === true,
    discord: cfg.discord?.enabled === true,
    'web-search': cfg.webSearch === true,
    'search-backup': Object.values(cfg.searchBackup?.use || {}).some((v) => v === true),
    email: moreTools(cfg).email === true,
    'cloud-helpers': Object.values(cfg.cloudHelpers || {}).some((v) => v?.enabled === true),
    'talk-cloud': cfg.talkCloud === 'xai',
    'rent-answer': Object.entries(st.enabled || {}).some(([, v]) => v === true),
    'coding-agents': agents > 0
  };
  try { on['mcp-remote'] = loadServers(cfg).some((s) => s.on && s.url && !LOOPBACK.test(new URL(s.url).hostname)); } catch {}
  return Object.entries(on).filter(([, v]) => v).map(([id]) => ({ id, name: id === 'rent-answer' ? 'Rented brains' : PRIVACY_SERVICES[id].name, to: PRIVACY_SERVICES[id].to }));
}

export class NetLog {
  constructor({ dir, cfg = {}, now = Date.now, agents = () => 0 } = {}) { this.dir = dir; this.cfg = cfg; this.now = now; this.agents = agents; this.list = []; }
  file() { return this.dir ? path.join(this.dir, NET_LOG) : ''; }
  add(host, port) {
    const h = String(host || '').toLowerCase();
    if (!h || LOOPBACK.test(h)) return null;
    const at = this.now();
    const last = this.list.find((e) => e.host === h && e.port === port && at - e.last < SAME_MS);
    if (last) { last.count++; last.last = at; return last; }
    const e = { at, last: at, host: h, port: Number(port) || 0, what: whatIs(h, this.cfg), count: 1 };
    this.list.unshift(e);
    if (this.list.length > KEEP) this.list.length = KEEP;
    this.write(e);
    return e;
  }
  write(e) {
    const f = this.file();
    if (!f) return;
    try {
      if (fs.existsSync(f) && fs.statSync(f).size > NET_LOG_MAX) fs.renameSync(f, `${f}.1`);
      fs.appendFileSync(f, JSON.stringify({ at: new Date(e.at).toISOString(), host: e.host, port: e.port, what: e.what || 'unlisted' }) + '\n');
    } catch {} // the log never stops a connection
  }
  view(limit = 100) {
    let agents = 0; try { agents = Number(this.agents()) || 0; } catch {}
    return { now: sendingNow(this.cfg, { agents }), recent: this.list.slice(0, limit).map((e) => ({ ...e, label: label(e.what), unlisted: !e.what })), childNote: 'Programs Bob starts (coding agents, commands, Python) are separate, so their connections are not in this list.' };
  }
}

// Where a net.connect / tls.connect call is going.
export function target(args) {
  const a = args[0];
  if (a && typeof a === 'object') {
    if (a.socket && !a.host && !a.servername) return null; // TLS on a socket that is already connected (and logged)
    return { host: a.host || a.servername || a.hostname || '', port: a.port };
  }
  if (typeof a === 'number' || /^\d+$/.test(String(a))) return { host: typeof args[1] === 'string' ? args[1] : 'localhost', port: Number(a) };
  return null; // a pipe path
}

// Put the log under net and tls. Done once, when Bob starts; tests pass their own module objects.
export function installNetLog(log, mods = { net, tls }) {
  for (const [mod, names] of [[mods.net, ['connect', 'createConnection']], [mods.tls, ['connect']]]) {
    if (!mod) continue;
    for (const n of names) {
      const real = mod[n];
      if (typeof real !== 'function' || real.bobNetLog) continue;
      const wrapped = function (...args) { try { const t = target(args); if (t) log.add(t.host, t.port); } catch {} return real.apply(this, args); };
      wrapped.bobNetLog = true;
      mod[n] = wrapped;
    }
  }
  return log;
}

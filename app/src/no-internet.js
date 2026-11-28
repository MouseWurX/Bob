// Nov 27 2026 (the plan of Nov 23, "We claim privacy but I dont know how to prove it"): the No internet switch.
// Off unless you turn it on. On, Bob's own program connects to nothing outside this replicant matrix except what you
// allow: your own Bobs (Bob-Net), your home network (both ticked unless you untick them), and the sites on your list.
// It sits in the same place as Where Bob connected (net-log.js, under net.connect and tls.connect), so no part of
// Bob's own code can go round it; Bob's browser windows have the same gate (electron/net-gate.cjs), commands run in a
// sandbox with no internet at all (hands-run.js commandNet), and coding agents don't start. Every stop is written down.
//
// Pure rules only: no imports from the rest of Bob, so anything can use it.

export const NO_INTERNET_PATH = '/api/no-internet';

// What's in config.json, cleaned. allow: sites, one per entry. "example.com" means that site and everything under it.
export function noInternetOf(cfg = {}) {
  const v = cfg.noInternet || {};
  const allow = [...new Set((Array.isArray(v.allow) ? v.allow : []).map(cleanSite).filter(Boolean))].slice(0, 200);
  return { on: v.on === true, home: v.home !== false, bobNet: v.bobNet !== false, allow };
}
export const noInternetOn = (cfg) => noInternetOf(cfg).on;

// "https://Www.Example.com:8443/path" -> "www.example.com". '' for anything that isn't a site name or address.
export function cleanSite(s) {
  let h = String(s || '').trim().toLowerCase();
  if (!h) return '';
  h = h.replace(/^[a-z][a-z0-9+.-]*:\/\//, '').replace(/[/?#].*$/, '').replace(/^\*\./, '').replace(/\.$/, '');
  if (h.startsWith('[')) h = h.replace(/^\[([^\]]+)\].*$/, '$1'); else if ((h.match(/:/g) || []).length === 1) h = h.replace(/:\d+$/, '');
  return /^[a-z0-9.-]{1,253}$/.test(h) || /^[0-9a-f:.]{2,45}$/.test(h) ? h : '';
}

const LOOPBACK = /^(localhost|127(?:\.\d{1,3}){3}|::1|0\.0\.0\.0|::ffff:127(?:\.\d{1,3}){3})$/i;
const TAILSCALE = /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.\d{1,3}\.\d{1,3}$/;
const TAILSCALE6 = /^fd7a:115c:a1e0:/i;
const HOME4 = /^(10\.\d{1,3}|192\.168|172\.(1[6-9]|2\d|3[01])|169\.254)\.\d{1,3}\.\d{1,3}$/;
const HOME6 = /^(f[cd][0-9a-f]{2}|fe[89ab][0-9a-f]):/i;
const HOME_NAME = /(^|\.)(local|lan|home\.arpa|internal)$|^[a-z0-9-]+$/i; // a bare name ("nas") is on your own network
const norm = (host) => String(host || '').toLowerCase().replace(/^\[|\]$/g, '').replace(/\.$/, '');

export const isLoopback = (host) => LOOPBACK.test(norm(host));
export const isBobNet = (host) => { const h = norm(host); return TAILSCALE.test(h) || TAILSCALE6.test(h) || h.endsWith('.ts.net'); };
export const isHome = (host) => { const h = norm(host); return HOME4.test(h) || HOME6.test(h) || (!isBobNet(h) && HOME_NAME.test(h) && !/^\d+$/.test(h)); };
const onList = (h, allow) => allow.some((a) => h === a || h.endsWith('.' + a));

// Why a connection to host is allowed: 'off' (the switch is off), 'this-pc', 'bob-net', 'home', 'list', or '' (it
// isn't: No internet stops it).
export function allowedWhy(host, cfg = {}) {
  const h = norm(host);
  if (isLoopback(h)) return 'this-pc';
  const v = noInternetOf(cfg);
  if (!v.on) return 'off';
  if (!h) return '';
  if (isBobNet(h)) return v.bobNet ? 'bob-net' : '';
  if (isHome(h)) return v.home ? 'home' : '';
  return onList(h, v.allow) ? 'list' : '';
}
export const blocks = (host, cfg) => allowedWhy(host, cfg) === '';
export function blocksUrl(url, cfg) {
  let u; try { u = new URL(String(url)); } catch { return false; }
  if (!/^(https?|wss?|ftp):$/.test(u.protocol)) return false; // Bob's own pages, files and data: nothing goes out
  return blocks(u.hostname, cfg);
}

// What a tool or page is told when No internet stopped it. Names the site only.
export const blockedLine = (host) => `Not connected: No internet is on, and ${norm(host) || 'that site'} isn't on the allowed list (Settings, Online services, No internet).`;
export function toolLine(hosts = []) {
  const list = [...new Set(hosts.map(norm).filter(Boolean))].slice(0, 5);
  if (!list.length) return '';
  return `No internet is on, so I didn't connect to ${list.join(', ')}${list.length > 1 ? ': none of them is' : ', which isn\'t'} on the allowed list. Say so plainly: the person can add a site in Settings, Online services, No internet, or switch it off.`;
}

// What stops while it's on, in plain words. The same list is in Help (help-content.js 'no-internet').
export const STOPS = [
  'Web search, reading web pages and Bob\'s browser, except the sites on your list.',
  'Downloads of brains and programs (Hugging Face, ModelScope, GitHub, Python packages), update checks and catalogue updates.',
  'Bob on Telegram and Discord, and reading your email (unless your mail server is on your list).',
  'Cloud helpers, cloud voice, rented brains and rented machines (the Lab\'s Forge included).',
  'Connected apps (MCP) on other computers. Ones that run on this computer are separate programs: Bob can\'t see their connections.',
  'Weather on the Today card, and the password and website security look-ups.',
  'Commands (the Run hand) run with no internet at all, in a sandbox. Where this computer has no sandbox, they don\'t run.',
  'Coding agents (Claude Code, Codex and the rest) don\'t start: they are separate programs that need the internet.'
];
export const KEEPS = 'Chatting with brains on this computer, your files, notes, memory, pictures, music and sounds made here, the Lab on this computer, the Python sandbox, and (while ticked) your own Bobs and your home network.';

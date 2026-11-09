// The online side of the "Security and privacy" Hand: public-record research about a website, a link, an email
// sender or an internet address, and breach lookups for the user's own exposure. Only public sources:
// RDAP (the official registration records that replaced WHOIS), DNS, certificate logs (crt.sh) and
// Have I Been Pwned's free breach list. Needs "Let Bob search the web" on, like any other look-up.
// Never people-finding: no lookups of a person, a username, a phone number or a home address.
import dns from 'node:dns';
import net from 'node:net';
import { linkSigns, registrable, lookalike } from './security-files.js';

const UA = 'Bob-security-hand (local desktop assistant)';
const FREEMAIL = /^(gmail|googlemail|outlook|hotmail|live|msn|yahoo|ymail|icloud|me|mac|proton|protonmail|pm|aol|gmx|mail|zoho|yandex|tutanota|fastmail)\.[a-z.]+$/i;

// The one check for "is this a home or work network address?", used by the web reader (tools.js) and the security Hand.
export function isPrivateHost(host) {
  let h = String(host || '').toLowerCase().replace(/^\[|\]$/g, '').replace(/\.$/, '');
  if (/^::ffff:\d+\.\d+\.\d+\.\d+$/.test(h)) h = h.slice(7); // an IPv4 address written the IPv6 way
  if (h === 'localhost' || h.endsWith('.localhost') || h.endsWith('.local') || h.endsWith('.lan') || h.endsWith('.home') || h.endsWith('.internal')) return true;
  if (net.isIP(h) === 4) return /^(10\.|127\.|0\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.)/.test(h);
  if (net.isIP(h) === 6) return /^(::1?$|f[cd]|fe80)/.test(h);
  return false;
}

export function cleanDomain(v) {
  let s = String(v || '').trim().toLowerCase();
  if (s.includes('@')) s = s.split('@').pop();
  try { if (/^[a-z]+:\/\//.test(s)) s = new URL(s).hostname; } catch {}
  s = s.replace(/^www\./, '').replace(/[/:?#].*$/, '').replace(/\.$/, '');
  if (!/^[a-z0-9.-]+\.[a-z0-9-]{2,}$/.test(s) && !/^xn--/.test(s)) throw new Error(`"${v}" doesn't look like a website name, like example.com.`);
  return s;
}

const withTimeout = (signal, ms) => (signal ? AbortSignal.any([signal, AbortSignal.timeout(ms)]) : AbortSignal.timeout(ms));
async function getJson(url, { signal, ms = 15000, headers = {}, fetchImpl = fetch } = {}) {
  const r = await fetchImpl(url, { headers: { 'user-agent': UA, accept: 'application/json, application/rdap+json', ...headers }, signal: withTimeout(signal, ms) });
  if (r.status === 404) return null;
  if (!r.ok) throw new Error(`${new URL(url).hostname} answered ${r.status}`);
  const text = await r.text();
  if (text.length > 3e6) throw new Error('too much came back');
  return JSON.parse(text);
}

const days = (iso, now = Date.now()) => { const t = Date.parse(iso); return Number.isFinite(t) ? Math.floor((now - t) / 86_400_000) : null; };
const howOld = (d) => (d === null ? 'unknown' : d < 60 ? `${d} days` : d < 730 ? `${Math.round(d / 30)} months` : `${Math.round(d / 365)} years`);

function vcardName(ent) {
  const v = ent?.vcardArray?.[1] || [];
  return (v.find((x) => x[0] === 'fn') || [])[3] || (v.find((x) => x[0] === 'org') || [])[3] || ent?.handle || '';
}

// Registration record (RDAP): when the name was bought, who sold it, its status. Owner details are usually hidden
// for privacy now, and Bob doesn't go looking for them.
export async function rdapDomain(domain, opts = {}) {
  const j = await getJson(`https://rdap.org/domain/${encodeURIComponent(domain)}`, opts);
  if (!j) return null;
  const ev = (a) => (j.events || []).find((e) => e.eventAction === a)?.eventDate || '';
  const registrar = vcardName((j.entities || []).find((e) => (e.roles || []).includes('registrar')));
  const org = vcardName((j.entities || []).find((e) => (e.roles || []).includes('registrant')));
  return { created: ev('registration'), updated: ev('last changed'), expires: ev('expiration'), registrar, org: /redact|privacy|withheld|data protected|not disclosed/i.test(org) ? '' : org, status: j.status || [], ns: (j.nameservers || []).map((n) => String(n.ldhName || '').toLowerCase()).slice(0, 4) };
}

export async function rdapIp(ip, opts = {}) {
  const j = await getJson(`https://rdap.org/ip/${encodeURIComponent(ip)}`, opts);
  if (!j) return null;
  const org = (j.entities || []).map(vcardName).filter(Boolean)[0] || '';
  return { name: j.name || '', org, country: j.country || '', range: j.startAddress && j.endAddress ? `${j.startAddress} - ${j.endAddress}` : j.handle || '' };
}

export async function dnsFacts(domain, { resolver } = {}) {
  const r = resolver || new dns.promises.Resolver({ timeout: 5000, tries: 2 });
  const safe = (p) => p.catch(() => null);
  const [a, mx, txt, dmarc, ns] = await Promise.all([safe(r.resolve4(domain)), safe(r.resolveMx(domain)), safe(r.resolveTxt(domain)), safe(r.resolveTxt(`_dmarc.${domain}`)), safe(r.resolveNs(domain))]);
  const flat = (x) => (x || []).map((t) => (Array.isArray(t) ? t.join('') : String(t)));
  const spf = flat(txt).find((t) => /^v=spf1/i.test(t)) || '';
  const dm = flat(dmarc).find((t) => /^v=DMARC1/i.test(t)) || '';
  return { a: a || [], mx: (mx || []).sort((x, y) => x.priority - y.priority).map((m) => m.exchange), spf, dmarc: dm, dmarcPolicy: (dm.match(/\bp=(\w+)/i) || [])[1] || '', ns: ns || [] };
}

// Certificate logs: every HTTPS certificate is published, so the first one shows when a site really went live.
export async function certHistory(domain, opts = {}) {
  const j = await getJson(`https://crt.sh/?q=${encodeURIComponent(domain)}&output=json&exclude=expired`, { ...opts, ms: 12000 }).catch(() => null);
  const all = await getJson(`https://crt.sh/?q=${encodeURIComponent(domain)}&output=json`, { ...opts, ms: 12000 }).catch(() => null);
  const list = all || j;
  if (!Array.isArray(list) || !list.length) return null;
  const first = list.map((c) => c.not_before).filter(Boolean).sort()[0] || '';
  const issuers = [...new Set(list.slice(0, 50).map((c) => (String(c.issuer_name || '').match(/O=([^,]+)/) || [])[1]).filter(Boolean))].slice(0, 3);
  return { first, count: list.length, issuers };
}

// Follow a link's hops WITHOUT loading the page (each hop is asked for its next address only).
export async function followLink(url, { signal, fetchImpl = fetch, max = 10 } = {}) {
  const hops = [];
  let u = new URL(url);
  for (let i = 0; i < max; i++) {
    if (!/^https?:$/.test(u.protocol)) { hops.push({ url: u.href, note: 'not a web address; stopped' }); break; }
    if (isPrivateHost(u.hostname)) { hops.push({ url: u.href, note: 'points into a home network; stopped' }); break; }
    const r = await fetchImpl(u, { method: 'GET', redirect: 'manual', headers: { 'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }, signal: withTimeout(signal, 10000) });
    try { await r.body?.cancel?.(); } catch {}
    const loc = r.headers.get('location');
    hops.push({ url: u.href, status: r.status });
    if (!(r.status >= 300 && r.status < 400 && loc)) break;
    u = new URL(loc, u);
  }
  return hops;
}

// Have I Been Pwned's public breach list (free, no key): which breaches involved this website.
export async function breachesForSite(domain, opts = {}) {
  const j = await getJson(`https://haveibeenpwned.com/api/v3/breaches?domain=${encodeURIComponent(domain)}`, opts);
  return (j || []).map((b) => ({ title: b.Title || b.Name, date: b.BreachDate, count: b.PwnCount, data: (b.DataClasses || []).slice(0, 8), verified: b.IsVerified !== false, sensitive: b.IsSensitive === true }));
}

// Pwned Passwords range: only the first 5 characters of the password's SHA-1 leave the PC (k-anonymity).
export async function pwnedRange(prefix, { signal, fetchImpl = fetch } = {}) {
  if (!/^[0-9A-F]{5}$/i.test(String(prefix))) throw new Error('A 5-character hash prefix is needed.');
  const r = await fetchImpl(`https://api.pwnedpasswords.com/range/${String(prefix).toUpperCase()}`, { headers: { 'user-agent': UA, 'Add-Padding': 'true' }, signal: withTimeout(signal, 15000) });
  if (!r.ok) throw new Error(`the password check service answered ${r.status}`);
  return r.text();
}

// ---------------------------------------------------------------- putting it in words

export function sayDomain(domain, { rdap, dnsf, certs, breaches } = {}, now = Date.now()) {
  const lines = [`About ${domain}:`];
  const look = lookalike(domain);
  if (look) lines.push(/puts /.test(look) ? `⚠ ${look}.` : `⛔ ${look}. Treat it as a fake until proven otherwise.`);
  if (rdap) {
    const d = days(rdap.created, now);
    lines.push(`${d !== null && d < 90 ? '⚠' : '✓'} Registered ${rdap.created ? rdap.created.slice(0, 10) : '(date hidden)'}: ${howOld(d)} old.${d !== null && d < 90 ? ' Very new sites are a classic scam sign (shops, "support" pages, giveaways).' : ''}`);
    if (rdap.registrar) lines.push(`Registrar (who sold the name): ${rdap.registrar}.`);
    if (rdap.org) lines.push(`Registered to an organisation named: ${rdap.org}.`);
    if (rdap.expires) { const left = -days(rdap.expires, now); if (left < 120 && left > -1) lines.push(`ℹ Paid up only until ${rdap.expires.slice(0, 10)} (throwaway sites are often bought for one year).`); }
    const hold = (rdap.status || []).filter((s) => /hold|suspend|redemption|pending delete/i.test(s));
    if (hold.length) lines.push(`⚠ Its record says: ${hold.join(', ')} (often means it was reported or abandoned).`);
  } else lines.push('ℹ No public registration record found (some country endings don\'t publish one).');
  if (certs) lines.push(`Certificates: first seen ${certs.first ? certs.first.slice(0, 10) : 'unknown'}, ${certs.count} on record${certs.issuers.length ? ` (from ${certs.issuers.join(', ')})` : ''}.`);
  if (dnsf) {
    if (!dnsf.a.length && !dnsf.mx.length) lines.push('⚠ The name doesn\'t point anywhere right now.');
    lines.push(dnsf.mx.length ? `Takes email (mail servers: ${dnsf.mx.slice(0, 2).join(', ')}).` : 'Doesn\'t take email (no mail servers), so mail claiming to be from it is suspect.');
    lines.push(`${dnsf.spf ? '✓' : '⚠'} SPF ${dnsf.spf ? 'set' : 'missing'}; ${dnsf.dmarc ? `✓ DMARC set (policy: ${dnsf.dmarcPolicy || '?'})` : '⚠ DMARC missing'}. ${!dnsf.dmarc || /none/i.test(dnsf.dmarcPolicy) ? 'Anyone can fake mail "from" this name more easily.' : 'Faked mail from this name usually gets blocked.'}`);
  }
  if (breaches?.length) lines.push(`Known breaches: ${breaches.map((b) => `${b.title} (${b.date}, ${b.count?.toLocaleString?.('en-CA') || b.count} accounts: ${b.data.join(', ')})`).join('; ')}.`);
  else if (breaches) lines.push('✓ No breaches of this site in Have I Been Pwned\'s list.');
  lines.push('Sources: RDAP registration records, DNS, crt.sh certificate logs' + (breaches ? ', Have I Been Pwned' : '') + '. Age and records are clues, not proof.');
  return lines.join('\n');
}

export function saySender(address, dnsf, rdap, now = Date.now()) {
  const domain = String(address).split('@').pop().toLowerCase();
  const lines = [];
  if (FREEMAIL.test(domain)) lines.push(`ℹ ${domain} is a free email service: anyone can make an address there, so the name in front means nothing on its own. A bank, government office or big company won't write from one.`);
  lines.push(sayDomain(domain, { rdap, dnsf }, now));
  lines.push('The real test is the email itself: paste it (with its headers, "Show original" in Gmail or "View source" in Outlook) and I\'ll check whether it really came from there.');
  return lines.join('\n');
}

export function sayLink(url, hops, facts) {
  const s = linkSigns(url);
  if (s.bad) return `That isn't a link I can read (${s.bad}).`;
  const lines = [`The link goes to ${s.site}${s.host !== s.site ? ` (full name ${s.host})` : ''}.`];
  for (const x of s.signs) lines.push(`${['', 'ℹ', '⚠', '⛔'][x.level]} It ${x.says}.`);
  if (hops?.length > 1) {
    lines.push(`Followed it (without loading any page): ${hops.map((h) => new URL(h.url).hostname).join(' → ')}.`);
    const end = linkSigns(hops.at(-1).url);
    for (const x of end.signs || []) if (x.level >= 2) lines.push(`${['', 'ℹ', '⚠', '⛔'][x.level]} Where it ends up: it ${x.says}.`);
  }
  if (facts) lines.push(facts);
  if (!s.signs.length && !(hops?.length > 1)) lines.push('Nothing about the address itself looks off. That isn\'t proof: a real site can be hacked, and a scam can sit on an ordinary-looking name.');
  return lines.join('\n');
}

export function sayIp(ip, info) {
  if (!info) return `No public record found for ${ip}.`;
  return `${ip} belongs to the network "${info.name}"${info.org ? `, run by ${info.org}` : ''}${info.country ? `, registered in ${info.country}` : ''}${info.range ? ` (range ${info.range})` : ''}. That's the internet provider or hosting company, not a person or a street address; an IP can't tell you who someone is.`;
}

export function sayBreachesForSite(domain, list) {
  if (!list.length) return `✓ No breaches of ${domain} in Have I Been Pwned's list. (Not every breach is known.)`;
  return `${domain} has been in ${list.length} known breach${list.length === 1 ? '' : 'es'}:\n${list.map((b) => `- ${b.title}, ${b.date}: ${b.count?.toLocaleString?.('en-CA') || b.count} accounts. Leaked: ${b.data.join(', ')}.${b.verified ? '' : ' (not verified)'}`).join('\n')}\nIf you had an account there before that date, change that password, and anywhere else you used the same one.`;
}

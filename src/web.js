// "Let Bob search the web" (1.5.27, 2026-11-02: "add a switch, off by default"). Off: web_search and
// fetch_page are taken out of Bob's tools, a call by name gets WEB_OFF back, and his prompt tells him to say
// where the switch is when a question needs the internet. No imports, so config.js and brain.js can both use it.
export const WEB_TOOLS = ['web_search', 'fetch_page'];
export const webOn = (cfg) => cfg?.webSearch === true;
export const WEB_SWITCH = 'Let Bob search the web';
export const WEB_WHERE = 'Settings';
export const WEB_PILL = '🌐 Web search'; // the same setting, on the chat page next to Effort (1.5.28)
const HOW = `click "${WEB_PILL}" next to Effort on the chat page, or turn on "${WEB_SWITCH}" in ${WEB_WHERE}`;
export const WEB_OFF = `Web search is off, so I can't look things up online. To let me, ${HOW}, then ask again.`;

// One line for Bob's prompt while it's off, so he knows and can say so instead of guessing.
export function webPrompt(cfg) {
  if (webOn(cfg)) return '';
  const who = cfg?.userName || 'the user';
  return `\n\nWeb search is OFF: you can't search the web or open web pages. If a question needs the internet (news, prices, versions, docs or facts you aren't sure of), say in one line that web search is off so you can't look it up, and that ${who} can ${HOW}. Always mention the switch; that's the way forward. Answer from what you know only if you're sure, and say it may be out of date. Never pretend you looked something up.`;
}

// 1.5.60: links in the user's message. Small brains (Qwen3 4B) often answer "I have no live web access" or "that
// isn't on your PC" to "Check out github.com/x/y" instead of calling fetch_page. With web search on, the front desk
// opens the first link itself before the brain answers, so the page text is already there.
const TLDS = 'com|org|net|io|dev|co|ca|uk|us|de|fr|eu|me|tv|gg|be|nl|au|jp|info|xyz|wiki|edu|gov|site|blog|tech|cloud|games|news|store|online';
const BARE = new RegExp(String.raw`(?<![\w@./\\-])((?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+(?:${TLDS}))(?![\w-])((?:/[^\s<>"'\`)\]]*)?)`, 'gi');
const FULL = /\bhttps?:\/{1,2}[^\s<>"'`)\]]+/gi;
const tidyEnd = (u) => u.replace(/[.,;:!?]+$/, '');

// "https:/x" (one slash, as phones and some pastes give it) becomes "https://x"; a bare domain gets https://.
export function normaliseUrl(u) {
  let s = tidyEnd(String(u || '').trim());
  s = s.replace(/^(https?):\/(?!\/)/i, '$1://');
  if (!/^https?:\/\//i.test(s)) s = `https://${s}`;
  try { const x = new URL(s); return /^https?:$/.test(x.protocol) && x.hostname.includes('.') ? x.href : ''; } catch { return ''; }
}

export function findLinks(text, max = 2) {
  const t = String(text || '');
  const out = [];
  const add = (u) => { const n = normaliseUrl(u); if (n && !out.includes(n)) out.push(n); };
  for (const m of t.matchAll(FULL)) add(m[0]);
  const rest = t.replace(FULL, ' ');
  for (const m of rest.matchAll(BARE)) add(m[1] + (m[2] || ''));
  return out.slice(0, max);
}

// Said to the brain while web search is on, so a link is never taken for a file on the PC.
export const LINK_PROMPT = 'A link (https://..., or a bare address like github.com/name/project) is a web page on the internet, not a file on this PC. fetch_page opens it and gives you its text; use it, never say you have no web access.';
export const linkPrompt = (cfg) => (webOn(cfg) ? `\n\n${LINK_PROMPT}` : '');

// 1.5.65: "the page I told you about", "that link", "check the repo": a message that points back at a link from earlier.
const BACK = /\b(?:the|that|this|my|your|our)\s+(?:page|link|site|website|repo|repository|url|address|article|post|github(?:\s+page)?)\b|\b(?:i|we)\s+(?:told|sent|gave|showed|mentioned|linked)\s+(?:you|earlier|before)\b|\b(?:from|mentioned)\s+(?:before|earlier)\b/i;
export const refersToLink = (text) => BACK.test(String(text || ''));

// 1.5.69: whether this turn is about a link: one in the message, or "that page" with a link in the last few messages.
export function linkTurn(text, earlier = []) {
  if (findLinks(text, 1).length) return true;
  if (!refersToLink(text)) return false;
  return earlier.filter((m) => m.role === 'user').slice(-4).some((m) => findLinks(m.text ?? m.content, 1).length);
}

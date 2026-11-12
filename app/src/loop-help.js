// Help small brains with their tool calls (Nov 11). Small local brains (about 3 to 4 billion parts awake at once)
// often pick the right tool and then get what goes into it wrong, promise to do something and stop, or lose the ask
// on a long job. These are plain code checks, no extra brain call, and always on (the owner: "stuff that should just
// be on"): check and fix what goes into each call before it runs, a hint after an error, catch "I'll do it" with no
// call, think on the second try, count near-repeat searches as repeats, a short "where we are" note on long jobs, a
// last round that answers, old tool results as one line once a chat gets long, look-ups side by side, and tool
// groups picked by meaning as well as words (only while the Memory slot's embedding model is in use anyway).
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { asDoc, asQuery, embedModel } from './embed-prefix.js';
import { writeJsonAtomic } from './util.js';
import { kindOf, isReadOnly, isVolatile } from './tool-kinds.js';

// ---------------------------------------------------------------------------------------------------------------
// 1. What goes into a call
// ---------------------------------------------------------------------------------------------------------------

// Broken JSON the way small brains write it: code fences, a stray comma, single quotes, keys with no quotes,
// Python's True/False/None, a real line break inside a string, text before or after. Returns an object or undefined.
export function repairJson(raw) {
  if (raw && typeof raw === 'object') return raw;
  let s = String(raw ?? '').trim();
  if (!s) return {};
  const tryParse = (t) => { try { const o = JSON.parse(t); return o && typeof o === 'object' && !Array.isArray(o) ? o : undefined; } catch { return undefined; } };
  let o = tryParse(s);
  if (o) return o;
  s = s.replace(/^```(?:json|javascript|js)?\s*/i, '').replace(/```\s*$/, '').trim();
  const a = s.indexOf('{'), b = s.lastIndexOf('}');
  if (a >= 0 && b > a) s = s.slice(a, b + 1);
  else if (a >= 0) s = s.slice(a) + '}'; // cut off at the end
  if ((o = tryParse(s))) return o;
  // Line breaks and tabs inside strings, which JSON doesn't allow raw.
  let out = '', inStr = false, quote = '', esc = false;
  for (const ch of s) {
    if (inStr) {
      if (esc) { out += ch; esc = false; continue; }
      if (ch === '\\') { out += ch; esc = true; continue; }
      if (ch === quote) { inStr = false; out += '"'; continue; }
      if (ch === '\n') { out += '\\n'; continue; }
      if (ch === '\r') continue;
      if (ch === '\t') { out += '\\t'; continue; }
      if (ch === '"' && quote === "'") { out += '\\"'; continue; }
      out += ch;
    } else {
      if (ch === '"' || ch === "'") { inStr = true; quote = ch; out += '"'; continue; }
      out += ch;
    }
  }
  if (inStr) out += '"';
  s = out
    .replace(/([{,]\s*)([A-Za-z_][\w-]*)\s*:/g, '$1"$2":') // keys with no quotes
    .replace(/:\s*True\b/g, ': true').replace(/:\s*False\b/g, ': false').replace(/:\s*None\b/g, ': null')
    .replace(/,\s*([}\]])/g, '$1'); // a stray comma before the end
  // A missing closing brace or bracket.
  const opens = (s.match(/[{[]/g) || []).length, closes = (s.match(/[}\]]/g) || []).length;
  if (opens > closes) s += '}'.repeat(opens - closes);
  return tryParse(s);
}

// Names small brains use for the usual fields.
const ALIASES = {
  path: ['file', 'filename', 'file_name', 'filepath', 'file_path', 'folder', 'dir', 'directory', 'location'],
  query: ['q', 'search', 'search_query', 'searchterm', 'search_term', 'term', 'terms', 'keywords', 'question', 'text'],
  url: ['link', 'href', 'website', 'site', 'page', 'address', 'uri'],
  prompt: ['description', 'text', 'image_prompt', 'input'],
  content: ['text', 'body', 'contents', 'data'],
  fact: ['memory', 'text', 'note'],
  text: ['note', 'content', 'message', 'body'],
  find: ['old', 'old_text', 'search', 'from'],
  replace: ['new', 'new_text', 'with', 'to', 'replacement'],
  group: ['name', 'tools', 'category'],
  command: ['cmd', 'shell', 'run']
};
const squash = (k) => String(k).toLowerCase().replace(/[^a-z0-9]/g, '');
const typeOf = (p) => (Array.isArray(p?.type) ? p.type.find((t) => t !== 'null') : p?.type) || (p?.enum ? 'string' : '');

function coerce(v, p) {
  const t = typeOf(p);
  if (v === undefined) return { v };
  if (t === 'string' && typeof v !== 'string') {
    if (typeof v === 'number' || typeof v === 'boolean') return { v: String(v), fixed: true };
    if (Array.isArray(v) && v.every((x) => typeof x === 'string')) return { v: v.join(', '), fixed: true };
  }
  if ((t === 'number' || t === 'integer') && typeof v === 'string' && /^\s*-?\d+(?:\.\d+)?\s*$/.test(v)) {
    const n = Number(v); return { v: t === 'integer' ? Math.round(n) : n, fixed: true };
  }
  if (t === 'integer' && typeof v === 'number' && !Number.isInteger(v)) return { v: Math.round(v), fixed: true };
  if (t === 'boolean' && typeof v === 'string' && /^(true|yes|on|1|false|no|off|0)$/i.test(v.trim())) return { v: /^(true|yes|on|1)$/i.test(v.trim()), fixed: true };
  if (t === 'array' && !Array.isArray(v)) {
    if (typeof v === 'string') { const j = v.trim().startsWith('[') ? (() => { try { return JSON.parse(v); } catch { return null; } })() : null; return { v: Array.isArray(j) ? j : v.split(/\s*[,\n]\s*/).filter(Boolean), fixed: true }; }
    return { v: [v], fixed: true };
  }
  if (t === 'object' && typeof v === 'string' && v.trim().startsWith('{')) { const o = repairJson(v); if (o) return { v: o, fixed: true }; }
  // An enum still holding a {{PLACEHOLDER}} (use_tools's group list, filled in per turn) isn't checked here.
  if (Array.isArray(p?.enum) && p.enum.length && !p.enum.some((e) => /\{\{/.test(String(e))) && !p.enum.includes(v) && typeof v === 'string') {
    const w = v.trim().toLowerCase();
    const hit = p.enum.filter((e) => String(e).toLowerCase() === w);
    const near = hit.length ? hit : p.enum.filter((e) => String(e).toLowerCase().startsWith(w) || w.startsWith(String(e).toLowerCase()));
    if (near.length === 1) return { v: near[0], fixed: true };
    return { v, bad: `must be one of ${p.enum.map((e) => JSON.stringify(e)).join(', ')}` };
  }
  return { v };
}

// Check one call against its tool's description of what it takes, and fix what can be fixed for sure.
// Returns { args, fixed: ['...'], problems: ['...'] }. problems empty = run it.
export function checkArgs(params, input) {
  const props = params?.properties || {};
  const required = Array.isArray(params?.required) ? params.required.filter((k) => k in props) : [];
  const fixed = [], problems = [];
  let args = input;
  if (typeof args === 'string') {
    const o = repairJson(args);
    if (o) { if (args.trim() && (() => { try { JSON.parse(args); return false; } catch { return true; } })()) fixed.push('mended the JSON'); args = o; }
    else {
      // One bare value for a tool that takes one main thing ("cats in hats" for web_search).
      const one = required.length === 1 ? required[0] : Object.keys(props).length === 1 ? Object.keys(props)[0] : null;
      if (one && typeOf(props[one]) === 'string' && args.trim()) { args = { [one]: args.trim() }; fixed.push(`took the text as ${one}`); }
      else return { args: {}, fixed, problems: ['the input wasn\'t readable JSON'] };
    }
  }
  if (!args || typeof args !== 'object' || Array.isArray(args)) args = {};
  args = { ...args };
  // Everything wrapped in one more layer ({"arguments": {...}} or {"parameters": {...}}).
  for (const wrap of ['arguments', 'parameters', 'args', 'input']) {
    if (!(wrap in props) && args[wrap] && typeof args[wrap] === 'object' && !Array.isArray(args[wrap]) && Object.keys(args).length === 1) { args = { ...args[wrap] }; fixed.push(`unwrapped ${wrap}`); }
  }
  // Names that aren't the tool's own: same name in another case or spelling, or a usual other name.
  const known = Object.keys(props);
  if (known.length) {
    for (const k of Object.keys(args)) {
      if (k in props) continue;
      const same = known.find((n) => squash(n) === squash(k) && !(n in args));
      const alias = same || known.find((n) => (ALIASES[n] || []).includes(k.toLowerCase()) && !(n in args) && required.includes(n))
        || known.find((n) => (ALIASES[n] || []).includes(k.toLowerCase()) && !(n in args));
      if (alias) { args[alias] = args[k]; delete args[k]; fixed.push(`${k} → ${alias}`); }
    }
  }
  for (const k of Object.keys(args)) {
    if (!(k in props)) continue;
    const c = coerce(args[k], props[k]);
    if (c.fixed) { args[k] = c.v; fixed.push(`${k} as ${typeOf(props[k])}`); }
    if (c.bad) problems.push(`${k} ${c.bad}`);
  }
  for (const k of required) {
    const v = args[k];
    if (v === undefined || v === null || (typeof v === 'string' && !v.trim())) problems.push(`${k} is missing (${describeProp(props[k])})`);
  }
  return { args, fixed, problems };
}

function describeProp(p) {
  const t = typeOf(p) || 'a value';
  const what = String(p?.description || '').split(/(?<=\.)\s/)[0].slice(0, 90);
  return what ? `${t}: ${what}` : t;
}

// A worked example of a good call, from the tool's own description: only the fields it needs.
export function exampleCall(name, params) {
  const props = params?.properties || {};
  const req = Array.isArray(params?.required) && params.required.length ? params.required : Object.keys(props).slice(0, 2);
  const ex = {};
  for (const k of req) {
    const p = props[k] || {};
    const t = typeOf(p);
    ex[k] = Array.isArray(p.enum) && p.enum.length ? p.enum[0] : t === 'number' || t === 'integer' ? 1 : t === 'boolean' ? true : t === 'array' ? ['...'] : t === 'object' ? {} : '...';
  }
  return `${name}(${JSON.stringify(ex)})`;
}

// What goes back instead of running a call that can't be run as it is.
export function bounceText(name, problems, args, { example = '' } = {}) {
  const sent = JSON.stringify(args ?? {}).slice(0, 200);
  return `(Not run: ${name} ${problems.join('; ')}. You sent ${sent}. Call ${name} again with that fixed${example ? `, like ${example}` : ''}.)`;
}

// The closest real tool name for one that doesn't exist ("readfile", "search_web", "read_files").
export function nearName(name, names) {
  const n = squash(name);
  if (!n) return null;
  const list = [...names];
  const exact = list.find((x) => squash(x) === n);
  if (exact) return exact;
  const words = String(name).toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 2);
  let best = null, score = 0;
  for (const x of list) {
    const xs = squash(x);
    let s = 1 - lev(n, xs) / Math.max(n.length, xs.length);
    const xw = x.toLowerCase().split('_');
    const shared = words.filter((w) => xw.some((y) => y === w || y.startsWith(w) || w.startsWith(y))).length;
    if (words.length) s = Math.max(s, shared / Math.max(words.length, xw.length));
    if (s > score) { score = s; best = x; }
  }
  return score >= 0.6 ? best : null;
}
function lev(a, b) {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length][b.length];
}

// Fix every call in one reply. tools: name -> tool ({ schema }). Each call gets call.bounce (the text to hand back
// instead of running it) when it can't run, and call.fixed (what was mended) when something was. Returns a summary.
export function fixCalls(calls, tools, { bounced = new Map() } = {}) {
  const sum = { fixed: 0, bounced: 0 };
  for (const call of calls || []) {
    const f = call.function || (call.function = {});
    const name = String(f.name || '').trim();
    if (name !== f.name) f.name = name;
    const raw = f.raw !== undefined ? f.raw : f.arguments;
    if (!tools[name]) {
      const near = nearName(name, Object.keys(tools));
      // A call that's only spelled wrong ("Read_File", "readfile") just runs; anything else gets the near name back.
      if (near && squash(near) === squash(name)) { f.name = near; call.fixed = [`${name} → ${near}`]; }
      else { call.bounce = `(Not run: there's no tool called ${name || '(no name)'}.${near ? ` Did you mean ${near}?` : ''} Use one of the tools you were given.)`; sum.bounced++; continue; }
    }
    const params = tools[f.name]?.schema?.function?.parameters;
    if (!params) { if (call.fixed) sum.fixed++; continue; }
    const r = checkArgs(params, raw);
    if (r.problems.length) {
      const n = (bounced.get(f.name) || 0) + 1;
      bounced.set(f.name, n);
      call.bounce = bounceText(f.name, r.problems, r.args, { example: n >= 2 ? exampleCall(f.name, params) : '' });
      sum.bounced++;
    } else if (r.fixed.length || call.fixed) { call.fixed = [...(call.fixed || []), ...r.fixed]; sum.fixed++; }
    f.arguments = r.args;
    delete f.raw;
  }
  return sum;
}

// ---------------------------------------------------------------------------------------------------------------
// 2. After an error: one plain hint on what usually works
// ---------------------------------------------------------------------------------------------------------------
const HINTS = [
  [/no such file|not found|doesn'?t exist|cannot find|ENOENT|isn'?t there/i, (n) => (n === 'read_file' || n === 'edit_file' ? 'Check the exact name first: list_folder on the folder it should be in, then use the full path it shows.' : 'Check the exact name or path first (list_folder), then try again with it.')],
  [/appears \d+ times|more than once|not unique/i, () => 'Add a few nearby lines to find, so it matches only one place.'],
  [/isn'?t in the file|no match|not in the file|couldn'?t find the text/i, () => 'Read the file (read_file) and copy the text exactly as it is there, spaces and all.'],
  [/time(?:d)? ?out|didn'?t answer in time|took too long/i, () => 'Try once more with something smaller (a shorter page part, a narrower search), or say it timed out.'],
  [/not allowed|off limits|outside|permission|read-only|access is denied|EACCES|EPERM/i, () => 'That place is off limits to you; don\'t try other ways into it. Say so and ask where to put it instead.'],
  [/no results|nothing found|found nothing|0 results/i, (n) => (n === 'web_search' ? 'Try fewer, plainer words, or different ones.' : 'Try a shorter or different search word.')],
  [/invalid url|bad url|not a valid (?:web )?address|unsupported protocol/i, () => 'Give the whole address, starting with https://.']
];
export function errorHint(name, text) {
  const t = String(text || '');
  if (!/^Error:|^\(Not run/i.test(t) && !/\b(error|failed|couldn'?t)\b/i.test(t.slice(0, 160))) return '';
  for (const [rx, hint] of HINTS) if (rx.test(t)) return ` (Hint: ${hint(name)})`;
  return '';
}

// ---------------------------------------------------------------------------------------------------------------
// 3. "I'll look that up" with no call
// ---------------------------------------------------------------------------------------------------------------
const PROMISE = /\b(?:let me|i(?:'ll| will| am going to|'m going to| shall)|i'?m (?:now )?(?:going to|about to)|(?:give me|one) (?:a )?(?:sec|second|moment|minute)|hold on|stand by)\b[^.!?\n]{0,60}?\b(?:search|look(?:ing)? (?:it |that |this )?up|look (?:for|into|at)|check|find|fetch|read|open|grab|pull up|browse|google|make|draw|paint|create|generate|write|save|run|start|do (?:that|it|this) now|get (?:that|it|this|started))\b/i;
const NOT_PROMISE = /\b(?:if you(?:'d| would)? like|if you want|want me to|shall i|should i|would you like|do you want|could you|can you|once you|when you|after you|let me know)\b/i;
export function promisesAction(text) {
  const t = String(text || '').trim();
  if (!t || t.length > 600) return false;
  if (/\?\s*$/.test(t) || NOT_PROMISE.test(t)) return false;
  // Only when the promise is the end of the reply (the last two sentences): "I'll search for it." and nothing after.
  const tail = t.split(/(?<=[.!])\s+/).slice(-2).join(' ');
  return PROMISE.test(tail);
}
export const PROMISE_NUDGE = 'You said you would do it, but no tool ran: nothing happens until you call the tool. Call it now, in this reply. If no tool you have can do it, say so in one line.';
export const PROMISE_LOG = 'Bob said he would do something but called no tool; asked him to do it now';

// ---------------------------------------------------------------------------------------------------------------
// 4. Near-repeat searches: "Moon size" and "size of the moon?" are the same search
// ---------------------------------------------------------------------------------------------------------------
const STOP = new Set(['the', 'a', 'an', 'of', 'in', 'on', 'for', 'to', 'and', 'or', 'is', 'are', 'what', 'whats', 'how', 'who', 'when', 'where', 'which', 'does', 'do', 'about', 'me', 'please', 'find', 'search', 'tell']);
const SEARCHES = new Set(['web_search', 'search_files', 'find_in_documents']);
export function nearKey(name, args) {
  if (!SEARCHES.has(name)) return null;
  let a = args; if (typeof a === 'string') { try { a = JSON.parse(a); } catch { a = {}; } }
  const q = String(a?.query ?? a?.text ?? a?.words ?? '').toLowerCase().replace(/['’]s\b/g, '').replace(/[^a-z0-9 ]+/g, ' ');
  const w = [...new Set(q.split(/\s+/).filter((x) => x && !STOP.has(x)))].sort();
  if (!w.length) return null;
  const rest = { ...(a || {}) }; delete rest.query; delete rest.text; delete rest.words;
  return `${name}~${w.join(' ')}|${JSON.stringify(rest)}`;
}

// ---------------------------------------------------------------------------------------------------------------
// 5. Long jobs: a short "where we are" note, a warning before the steps run out, and a last round that answers
// ---------------------------------------------------------------------------------------------------------------
// msgs: the turn so far (from the user's message on). Counts rounds with tool calls and lists what came back.
export function onTrackNote({ ask, turn, step, max, who = 'the user' }) {
  const rounds = (turn || []).filter((m) => m.role === 'assistant' && m.tool_calls?.length).length;
  if (rounds < 2) return '';
  const done = (turn || []).filter((m) => m.role === 'tool').slice(-6).map((m) => {
    const t = String(m.content || '').replace(/\s+/g, ' ').trim();
    const bad = /^Error:|^\(Not (?:run|done|read)/i.test(t);
    return `${m.tool_name || 'tool'} ${bad ? 'failed' : 'ok'}: ${t.slice(0, 70)}${t.length > 70 ? '…' : ''}`;
  });
  const left = Math.max(0, max - step);
  const lines = [`Where we are (written by the app, step ${step + 1} of ${max}). ${who} asked: "${String(ask || '').replace(/\s+/g, ' ').trim().slice(0, 240)}"`];
  if (done.length) lines.push(`Done so far: ${done.join(' / ')}`);
  lines.push(left <= 2 ? `Only ${left} step${left === 1 ? '' : 's'} left: answer now with what you have, unless one more call is really needed.` : 'Keep going on what is still missing, or answer if you have it all.');
  return lines.join('\n');
}
export const LAST_ROUND_NOTE = (who) => `This is the last step: no more tool calls. Tell ${who} plainly what you found and did, what is still missing, and what they could do next.`;

// ---------------------------------------------------------------------------------------------------------------
// 6. Old tool results: one line each once the chat gets long
// ---------------------------------------------------------------------------------------------------------------
export const TIDY_AT = 0.5; // share of the brain's memory the chat must pass first
export const TIDY_KEEP = 160;
export const tidyLine = (m) => {
  const c = String(m.content ?? '');
  return `(${m.tool_name || 'tool'} result from earlier, ${c.length.toLocaleString('en')} characters, set aside to keep the chat light: «${c.slice(0, TIDY_KEEP).replace(/\s+/g, ' ')}${c.length > TIDY_KEEP ? '…' : ''}» Call it again if you need it.)`;
};
// Results from before this turn become one line each, all at once, only once the chat passes TIDY_AT of memory.
// The same chat always comes out the same, so the engine's saved prompt is reused from one message to the next.
export function tidyOld(list, turnStart, ctxTokens, { at = TIDY_AT } = {}) {
  const ctx = Number(ctxTokens) || 32768;
  const size = list.reduce((n, m) => n + String(m.content ?? '').length, 0) / 3;
  if (size <= ctx * at) return { list, tidied: 0 };
  let tidied = 0;
  const out = list.map((m, i) => {
    if (i >= turnStart || m.role !== 'tool') return m;
    const c = String(m.content ?? '');
    if (c.length <= TIDY_KEEP + 200) return m;
    tidied++;
    return { ...m, content: tidyLine(m) };
  });
  return { list: out, tidied };
}

// ---------------------------------------------------------------------------------------------------------------
// 7. Look-ups side by side
// ---------------------------------------------------------------------------------------------------------------
// Only tools that read and never ask for an OK; each runs once, the rest of the loop handles its result as usual.
// Nov 12 (item 180): any look in tool-kinds.js that doesn't wait on a person and doesn't change between calls.
export const LOOK_TOGETHER = { has: (name) => isReadOnly(name) && !kindOf(name).waits && !isVolatile(name) && name !== 'use_tools' };
export function togetherCalls(calls, tools, { skip = () => false } = {}) {
  const picked = (calls || []).filter((c) => !c.bounce && LOOK_TOGETHER.has(c.function?.name) && tools[c.function.name] && !tools[c.function.name].check && !kindOf(c.function.name, tools[c.function.name]).waits && isReadOnly(c.function.name, tools[c.function.name]) && !skip(c));
  return picked.length >= 2 ? picked : [];
}

// ---------------------------------------------------------------------------------------------------------------
// 8. Tool groups by meaning
// ---------------------------------------------------------------------------------------------------------------
// A few ways people ask for each group's job, so a message can be matched by meaning, not only by its words.
// Written fresh (not the test phrasings), so the router test still measures something.
export const GROUP_EXAMPLES = {
  pictures: ['paint me something', 'I want a picture of my dog as a knight', 'make a song for my mum', 'a short clip of waves', 'a sound for a door creaking', 'what would that look like'],
  diagrams: ['show the steps as boxes and arrows', 'lay out how these parts connect', 'chart who reports to whom', 'map out the plan visually'],
  documents: ['put this in a file for me', 'keep a spreadsheet of these numbers', 'look through my documents for the lease', 'change line 12 in that script', 'where in my code is the login handled'],
  parts3d: ['I need a part I can print', 'make a holder for my phone', 'turn this drawing into a model'],
  sandbox: ['work out what I owe', 'how many days between these dates', 'split this bill three ways', 'convert 5 miles to km exactly'],
  memory: ['stop keeping notes about that'],
  howtos: ['do it the way you did last time', 'keep those steps for next time'],
  selfwork: ['give yourself a new button', 'fix the bug in my project', 'improve your own code'],
  cloud: ['this needs a bigger brain than you have', 'ask an online model'],
  files: ['clear out my downloads', 'put these photos in folders by year', 'zip that folder up'],
  run: ['start my dev server', 'install that package', 'run the tests'],
  schedules: ['do this for me every morning', 'check it each Friday'],
  apps: ['open notepad and type a note', 'click the save button for me'],
  browser: ['log into the site and download my bill', 'fill in that form'],
  office: ['make this into a pdf', 'turn the slides into a word document', 'shrink this video'],
  security: ['is this email a scam', 'is my computer safe', 'scan this file for viruses']
};
export const MEANING_MIN = 0.62;   // a guess, to tune with the loop test: nomic scores close asks around 0.65 to 0.8
export const MEANING_TOP = 2;

const cosine = (a, b) => { let d = 0, x = 0, y = 0; for (let i = 0; i < a.length; i++) { d += a[i] * b[i]; x += a[i] * a[i]; y += b[i] * b[i]; } return x && y ? d / Math.sqrt(x * y) : 0; };
export const groupText = (id, g) => `${g.what || id}. For asks like: ${(GROUP_EXAMPLES[id] || []).join('; ')}`;

// The groups a message means: the best MEANING_TOP above MEANING_MIN, compared with each group's best line
// (its description, or one of its examples). vecs: id -> [vector per line].
export function meaningPick(qvec, vecs, { min = MEANING_MIN, top = MEANING_TOP } = {}) {
  if (!qvec?.length) return [];
  const scored = Object.entries(vecs || {}).map(([id, list]) => ({ id, s: Math.max(0, ...(list || []).map((v) => (v?.length ? cosine(qvec, v) : 0))) }));
  return scored.filter((x) => x.s >= min).sort((a, b) => b.s - a.s).slice(0, top).map((x) => x.id);
}

// The vectors for each group's lines, kept in inn\bob\tool-group-vectors.json, made again when a group's words
// or the embedding model change. embed(texts) -> vectors or null.
export class GroupVectors {
  constructor(cfg) { this.cfg = cfg; this.file = path.join(cfg.dataDir, 'tool-group-vectors.json'); this.cache = null; }
  load() { if (!this.cache) { try { this.cache = JSON.parse(fs.readFileSync(this.file, 'utf8')); } catch { this.cache = {}; } } return this.cache; }
  async for(groups, embed) {
    const model = embedModel(this.cfg);
    const d = this.load();
    if (d.model !== model) { d.model = model; d.groups = {}; }
    d.groups ||= {};
    const out = {};
    let changed = false;
    for (const [id, g] of Object.entries(groups)) {
      const lines = [g.what || id, ...(GROUP_EXAMPLES[id] || [])];
      const hash = crypto.createHash('md5').update(lines.join('\n')).digest('hex').slice(0, 12);
      if (d.groups[id]?.hash !== hash) {
        const v = await embed(lines.map((l) => asDoc(model, l)));
        if (!v) return null; // no embedding model here right now: words only
        d.groups[id] = { hash, vecs: v };
        changed = true;
      }
      out[id] = d.groups[id].vecs;
    }
    if (changed) { try { writeJsonAtomic(this.file, d, 0); } catch {} }
    return out;
  }
}
export { asQuery };

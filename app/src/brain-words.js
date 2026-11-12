// Fitting the chat into the brain's memory, honesty checks on what Bob says he did, the nudges sent to the brain, and
// the brain-loading lines shown in the chat. Split out of brain.js (which still exports all of it).
import path from 'node:path';
import fs from 'node:fs';
import { failedResult, isVolatile } from './tool-kinds.js';
import { claimsPcActionFrEs } from './honest.js';
import { freeMemNow } from './platform.js';
import os from 'node:os';
import { catMoment } from '../public/patches.js';
import { computerWord, handOn, freeOn, handOffWhy } from './hands-settings.js';
import { HAND_TOOLS } from './brain.js';

// Test B of the two-Bob trial: twelve web pages in one turn came to 74,242 tokens against a 32,768-token chat
// memory, and llama-server refused the whole request. Before each request the tool results are shortened, oldest
// first, until the chat fits in about three quarters of the brain's memory (the rest is room for the answer).
// The saved chat keeps them whole; only what's sent this time is shortened.
// Item 1 (Nov 11): the instructions say where the time is; the time itself is in the note before the latest message.
export const NOW_IN_NOTE = 'given in the note just before the latest message';
export const CUT_NOTE = (n) => `\n(${n} more characters were cut here so the chat fits in the brain's memory. Answer from what is here if you can.)`;
// per: characters per token for this brain (item 3, Nov 11: learned from the engine's own counts; 3 is the old guess).
export function fitContext(messages, ctx, tools, share = 0.75, per = 3) {
  if (!(Number(ctx) > 0) || !Array.isArray(messages)) return messages;
  if (!(Number(per) > 0)) per = 3;
  const size = (m) => Math.ceil(String(m.content ?? '').length / per) + (m.images?.length || 0) * 800 + (m.tool_calls ? Math.ceil(JSON.stringify(m.tool_calls).length / per) : 0) + 8;
  const budget = Math.floor(ctx * share) - (tools ? Math.ceil(JSON.stringify(tools).length / per) : 0);
  let total = messages.reduce((a, m) => a + size(m), 0);
  if (total <= budget) return messages;
  const out = messages.slice();
  const tool = out.map((m, i) => (m.role === 'tool' ? i : -1)).filter((i) => i >= 0);
  const lastAsk = [...messages].reverse().find((m) => m.role === 'user');
  const ask = String(lastAsk?.text ?? lastAsk?.content ?? '');
  for (const keep of [1500, 400, 120]) {
    for (const i of tool) {
      if (total <= budget) return out;
      const c = String(out[i].content ?? '');
      if (c.length <= keep + 200) continue;
      total -= size(out[i]);
      out[i] = { ...out[i], content: cutKeeping(c, keep, ask) };
      total += size(out[i]);
    }
  }
  return out;
}
// Nov 11 (item 7): a long tool result used to keep only its top, so an answer near the bottom (the error at the end of a
// build log, the one matching row in a big file) was cut. Now the top half of the room is the start, and the rest is the
// lines that share words with the ask, in their order, then the note saying how much was cut.
export const ASK_SKIP = new Set(['the', 'and', 'for', 'with', 'that', 'this', 'what', 'from', 'have', 'does', 'into', 'about', 'your', 'you', 'can', 'are', 'how', 'why', 'when', 'where', 'which', 'there', 'please', 'tell', 'show', 'find', 'look']);
export function askWords(ask) {
  return [...new Set(String(ask || '').toLowerCase().match(/[\p{L}\p{N}_.-]{3,}/gu) || [])].filter((w) => !ASK_SKIP.has(w)).slice(0, 24);
}
export function cutKeeping(text, keep, ask = '') {
  const c = String(text ?? '');
  if (c.length <= keep) return c;
  const words = askWords(ask);
  if (!words.length || keep < 200) return c.slice(0, keep) + CUT_NOTE(c.length - keep);
  const head = c.slice(0, Math.floor(keep / 2));
  const room = keep - head.length;
  const rest = c.slice(head.length).split('\n');
  const picked = [];
  let used = 0;
  for (const line of rest) {
    const l = line.toLowerCase();
    if (!words.some((w) => l.includes(w))) continue;
    const bit = line.length > 400 ? line.slice(0, 400) + '…' : line;
    if (used + bit.length + 1 > room) break;
    picked.push(bit); used += bit.length + 1;
  }
  if (!picked.length) return c.slice(0, keep) + CUT_NOTE(c.length - keep);
  const kept = head.length + used;
  return `${head}\n(…lines further on that match the ask:)\n${picked.join('\n')}${CUT_NOTE(Math.max(0, c.length - kept))}`;
}
// Item 10 (Nov 11): "How I got here" under a reply: each step it took, what went in (the step's one-line summary), whether
// it worked, how long it took, how much came back and which brain was thinking. Kept with the answer in the chat file.
export const MAX_TRACE = 30;
// Item 183 (Nov 12): the file as it was just before an edit (up to 8 MB), so verify.js can check what the edit made.
export function fileBefore(args) {
  try {
    const a = typeof args === 'string' ? JSON.parse(args) : (args || {});
    if (!a.path || typeof a.path !== 'string' || !path.isAbsolute(a.path)) return null;
    const file = path.resolve(a.path);
    if (fs.statSync(file).size > 8e6) return null;
    return { file, body: fs.readFileSync(file, 'utf8') };
  } catch { return null; }
}
export function traceStep({ name, summary, ok, ms, text, brain }) {
  return { tool: String(name || ''), what: String(summary || name || '').slice(0, 160), ok: Boolean(ok), ms: Math.max(0, Math.round(Number(ms) || 0)), chars: String(text ?? '').length, ...(brain ? { brain: String(brain).slice(0, 80) } : {}) };
}
export const TOO_LONG = /exceeds? the available context|context (size|length|window) (exceeded|is too)|maximum context length|too many tokens/i;

export function staleHandErrors(msgs, turnStart) {
  return msgs.map((m, i) => (i < turnStart && m.role === 'tool' && HAND_TOOLS.has(m.tool_name) && failedResult(m)
    ? { ...m, content: `(An earlier try failed: ${String(m.content).replace(/^Error:\s*/, '').slice(0, 193)}. That may be out of date, because Bob's Hands can be fixed or switched on since. To do it now, call the tool again; don't repeat this.)` }
    : m));
}
// "I've opened Notepad" with no Hands tool done this turn.
export function claimsPcAction(text) {
  if (claimsPcActionFrEs(text)) return true; // item 182: French and Spanish too
  return /\bI(?:'ve| have|)\s+(?:just\s+|now\s+|already\s+|successfully\s+)?(?:opened|launched|started|typed|clicked|pressed|moved|copied|renamed|zipped|unzipped|ran|deleted|saved|closed)\b[^.!?\n]{0,60}\b(?:notepad|paint|app|application|window|program|file|folder|script|command|document|tab|\w+\.\w{2,4}|it for you)/i.test(String(text || ''));
}
// 1.5.11: "I was just observing a subtle loop in the file handle caching" with no tool run this turn: a made-up observation.
export function claimsObservation(text) {
  const t = String(text || '');
  if (/\b(?:earlier|last time|yesterday|before you asked)\b/i.test(t)) return false; // talking about a past turn, where a tool may have run
  return /\bI(?:'ve| have|'m| am| was|'d| had|)\s+(?:just\s+|been\s+|also\s+|quietly\s+)*(?:observ|notic|monitor|scout|measur|watch|analy[sz]|profil|scann|investigat|benchmark|keeping an eye|looking into|checking|checked|poking at|digging into)\w*\b[^.!?\n]{0,100}\b(?:system|cpu|gpu|vram|memory|ram|files?|cache|caching|loop|process(?:es)?|threads?|disk|network|logs?|queue|code|performance|utili[sz]ation|handles?|drivers?|registry|pc|computer|server|kernel|latency|throughput|background|job|task|steps?|big brain)\b/i.test(t)
    || /\b(?:CPU|GPU|VRAM|RAM|disk|network) (?:utili[sz]ation|usage|load|temperature|temps?) (?:is|are|looks?|has been|seems?)\b/i.test(t);
}
export const OBSERVE_CORRECTION = 'Nothing was actually checked in that reply. Bob said he checked, but no check ran.';
export const OBSERVE_NUDGE = 'You described noticing, watching or checking something on the PC, but no tool ran this turn, so it was invented. Answer again in a line or two, using only the "Right now" line (and the Meanwhile line, if there is one), the chat, or what {{USER}} said. No made-up system details, and no question unless you need the answer.';
// The only things he knows about the PC without a tool, so small talk has something true to stand on.
// #33: the cat is only in it when withCat (the cat turns), so Patches isn't in front of the brain every turn.
export function realState({ model, session, waiting = 0, cat, turn = 0, withCat = true, mem = { free: freeMemNow(), total: os.totalmem() } }) {
  const gb = (b) => (b / 1e9).toFixed(1);
  return `Right now (real, from the app): you're thinking on ${model || 'no brain'}${session ? ` in the ${session} session` : ''}; ${waiting ? `${waiting} more message${waiting === 1 ? '' : 's'} waiting` : 'nothing else waiting'}; the PC's RAM is ${gb(mem.total - mem.free)} of ${gb(mem.total)} GB in use${withCat ? `; ${catMoment(cat, turn)}` : ''}.`;
}
// The Meanwhile line again as a short note just before the latest message, where a small brain reads it last.
export function meanwhileNear(list, line) {
  if (!line) return list;
  const at = list.findLastIndex((m) => m.role === 'user');
  const note = { role: 'system', content: line };
  return at < 0 ? [...list, note] : [...list.slice(0, at), note, ...list.slice(at)];
}
// The engine's name for Health and errors. 1.5.207 PC check: Health said "llama.cpp answers." while Bob ran his own
// Brain Engine (the same rule as engines.js engineNameOf).
export function engineLabel(cfg) {
  if (cfg.engine !== 'llamacpp') return 'Ollama';
  if (!cfg.agentDir || !cfg.llamacpp?.exe) return 'llama.cpp';
  const r = path.relative(path.join(cfg.agentDir, 'brain-engine'), path.dirname(cfg.llamacpp.exe));
  return r === '' || (!r.startsWith('..') && !path.isAbsolute(r)) ? 'Brain Engine' : 'llama.cpp';
}
// The same page, however it is written: no scheme or trailing slash, host in lower case, no #part.
export function linkKey(u) {
  const s = String(u || '').trim().replace(/#.*$/, '').replace(/^https?:\/\//i, '').replace(/\/+$/, '');
  const i = s.indexOf('/');
  return i < 0 ? s.toLowerCase() : s.slice(0, i).toLowerCase() + s.slice(i);
}
export const CLAIM_CORRECTION = 'Nothing was actually done on this replicant matrix in that reply. Bob said he did, but no action ran.';
export const CLAIM_NUDGE = 'You just said you did something on the PC, but no tool did it in this turn. Never claim that. If it should be done, call the right tool now; if you cannot, say plainly that you have not done it and why (the tool\'s own words if it gave an error).';
// Always in the front desk's prompt (slim tools or not): he lives on a real PC and, with the Apps hand on, drives it.
// Bob should want to take the wheel himself. The model had said "I am the process inside
// the computer, not a remote driver... simulated environment" right after two errors.
export function realPcPrompt(cfg) {
  const who = cfg.userName || 'the user';
  const base = `You live on ${who}'s real ${computerWord()}; the apps, windows and files are real, not a simulation (only your Idle Process workspace is make-believe). Never call the PC simulated or virtual.`;
  if (handOn(cfg, 'apps')) return `\n\n${base} Being inside the PC is exactly why you can drive it: with the Apps hand on you really do take the wheel. When ${who} says drive, take control, take the wheel, use my screen or do it in <an app>, be keen and start at once${freeOn(cfg) ? ' (you work without asking right now, so go ahead and do each step; each one is logged)' : " by showing the first step's card"}: open_app, then app_look, then app_act (add them with use_tools apps if they aren't here).${freeOn(cfg) ? '' : ` Nothing happens on the PC until ${who} clicks it.`} When the Apps hand is on, don't refuse to drive, and never say a step worked unless its result says so.`;
  return `\n\n${base} Driving apps (open, click, type in them) needs the Apps hand, which is off: ${handOffWhy(cfg, 'apps')} If asked to drive, say that and offer to start as soon as it's on.`;
}
// After a doing-tool fails: one other route, then stop (asked for 2026-11-02).
export const ALT_ROUTE_NUDGE = (who) => ` (If another route could still do this, try ONE other way now: for example, if a file or command tool failed, do it in the app with the Apps hand; if the Apps hand failed, use write_file, the Files Hand or the Run Hand. Then tell ${who} which way worked, or say plainly that neither did.)`;
export const ALT_ROUTE_DONE = (who) => ` (You already tried another way this turn. Stop here and tell ${who} plainly what failed, in the tools' own words.)`;
export const DOING_TOOLS = new Set(['write_file', 'edit_file', 'save_spreadsheet']);
export const isLook = (name) => isVolatile(name); // looks whose answer changes between calls (tool-kinds.js, item 172)

// 1.5.20 quick hand-back: the line Bob shows with a finished picture or clip when the brain had to leave the card for
// the painter and nothing else was asked for. null = reply the usual way (brain loads back and talks about it).
// Setting pictureNoWait (Settings, on): off brings back the old way.
export const PAINT_TOOLS = new Set(['make_image', 'make_video']);
export const NUM_WORDS = { a: 1, an: 1, one: 1, two: 2, both: 2, pair: 2, couple: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, few: 3, several: 3, some: 2 };
// How many creations the message asks for: "3 pictures", "a few images", "pictures of a fox" (plural = at least 2).
export function askedCount(text) {
  const t = String(text || '').toLowerCase().replace(/\ba (few|couple|pair)\b/g, '$1');
  const m = t.match(/\b(\d{1,2}|a|an|one|two|both|pair|couple|three|four|five|six|seven|eight|nine|ten|few|several|some)\b(?:\s+(?:of\s+)?(?:\w+\s+){0,3}?)(pictures?|images?|photos?|drawings?|paintings?|versions?|variations?|options?|clips?|videos?|wallpapers?|icons?|logos?)\b/);
  if (m) { const n = /^\d+$/.test(m[1]) ? Number(m[1]) : NUM_WORDS[m[1]]; if (n) return /s$/.test(m[2]) ? Math.max(n, 2) : n; }
  return /\b(pictures|images|photos|drawings|paintings|versions|variations|clips|videos|wallpapers|icons|logos)\b/.test(t) ? 2 : 1;
}
export function quickHandBack(cfg, ctx, reply) {
  if (cfg?.pictureNoWait === false) return null;
  const calls = reply?.tool_calls || [];
  if (!calls.length || !calls.every((c) => PAINT_TOOLS.has(c.function?.name))) return null;
  const p = ctx?.painted;
  if (!p?.brainLeft || p.count !== calls.length) return null; // a call failed, or the brain never left: talk as usual
  const ex = ctx.ledger?.expect;
  if (!ex || !['picture', 'show', 'video'].includes(ex.kind) || ex.also?.length) return null; // more was asked for
  if (p.total < askedCount(ctx.turnText)) return null; // "make 3 pictures" painted one at a time: let him finish
  if (p.total > 1) return p.kind === 'video' ? 'Here are the clips. Tell me what to change, or ask for more.' : 'Here are the pictures. Tell me what to change, or ask for more.';
  return p.kind === 'video' ? "Here's the clip. Tell me what to change, or ask for another." : "Here's the picture. Tell me what to change, or ask for another.";
}
export const callKey = (name, args) => { let a = args; if (typeof a === 'string') { try { a = JSON.parse(a); } catch {} } return `${name}|${JSON.stringify(a ?? {})}`; };
export const LINK_NUDGE = 'Web search is on, and the page from the link is just above (the fetch_page result). Answer from it now; never say you have no web access.';
export const CANT_NUDGE = 'You now have every tool you can use on this PC. If one of them does what was asked, call it now. If none does, say so in one line; don\'t repeat yourself.';
export const EMPTY_NUDGE = 'Your last reply was empty. You now have every tool you can use on this PC. Do what was asked: call the right tool now (for a picture, make_image), or answer in words.';
export const EMPTY_NOTE = 'Bob didn\'t answer that one. Send it again, or put it another way.';
export const MAX_HISTORY = 40;
export const COMPACT_KEEP = 6; // item 13: messages kept word for word after "Sum up and carry on"
// Nov 11 (item 4): how many messages Bob reads back each turn, by how much his chat brain holds. 40 was the same for a
// brain that holds 8K words and one that holds 128K; now a big-memory brain keeps more of the chat word for word
// (about one message per 800 tokens of its memory, 40 at least, 240 at most). fitContext still trims if a chat overflows.
export const HISTORY_PER = 800, HISTORY_MAX = 240;
export const historyKeep = (ctx) => Math.min(HISTORY_MAX, Math.max(MAX_HISTORY, Math.floor((Number(ctx) || 0) / HISTORY_PER)));
export const MORE_SECONDS = 10; // how long "Make another picture?" waits
export const APPROVAL_TIMEOUT_MS = 10 * 60 * 1000;
// Item 196: what Bob reads when nobody answered a card in time. One line, only then.
export const NO_ANSWER_NOTE = (who) => `Not done: nobody answered the card in ${Math.round(APPROVAL_TIMEOUT_MS / 60000)} minutes (it timed out; ${who} didn't say no). The job waits in Tasks for the OK. Say so in one line and stop.`;
export const UNCAUGHT_QUIET_MS = 10 * 60 * 1000; // item 203
export const NO_ANSWER_PARKED = 'Waiting for your OK: the card timed out with no answer. Press Carry on to be asked again.';

// Plain names for the app's screens. Bob's own names for his hats (persona.js) stay as they are.
// An edit instruction for a picture-edit model, with a line asking it to keep everything else (unless it already says what to keep).
export function editPrompt(prompt) {
  const p = String(prompt || '').trim();
  if (/\bkeep\b|\bunchanged\b/i.test(p)) return p;
  return `${p}${/[.!?]$/.test(p) ? '' : '.'} Keep everything else exactly as it is: faces and who people are, expressions, pose, lighting, background and framing.`;
}

export const PLAIN_HATS = { tinker: 'Coding', ledger: 'Spreadsheets', scout: 'Research', painter: 'Images & video', reviewer: 'Review' };
// 1.5.148: copies whose work is code get Qwen's "thinking through code" preset (model-family.js).
export const CODING_HATS = new Set(['tinker']);
export const BRAIN_NAMES = { bob: 'main', tinker: 'workbench', ledger: 'ledger', scout: 'scouting', painter: "painter's", reviewer: 'second-look', eyes: 'eyes' };

// 1.5.49: how a brain load changes what Bob holds. swap = it replaces one, add = it joins one, load = nothing was loaded.
export function loadMode(plan) {
  if (!plan) return 'swap';
  if (plan.drop?.length) return 'swap';
  if (plan.keep?.length) return 'add';
  return 'load';
}
// The chat line for a brain load. A reviewer joining is the moot, said plainly.
export function loadLine({ mode, who, model, from, copy, secs, label, single = false, what = 'the answer', beside = false, onCard = false, besideOn = false, tip = false }) {
  const lc = (t) => t.charAt(0).toLowerCase() + t.slice(1); // "Coding brain (Qwen3 Coder 30B)" -> "coding brain (...)"
  const mine = (t) => lc(t).replace(/^brain \(/, 'main brain ('); // Bob's main slot reads "my main brain (...)"
  const now = lc(label(model, who)), old = from ? mine(label(from)) : '';
  if (who === 'reviewer') {
    if (mode === 'add' && beside && !onCard) return `🛰 Moot: ${copy} joins me to check ${what}, on the ${now}. It loads beside mine, on the processor, about ${secs} ${secs === 1 ? 'second' : 'seconds'}. Reviews there are slower than on the graphics card.`;
    if (mode === 'add') return `🛰 Moot: ${copy} joins me to check ${what}, on the ${now}. It loads beside mine, about ${secs} ${secs === 1 ? 'second' : 'seconds'}.`;
    // Settings sign-off (1.5.49): the real reason. Bob's own engine runs one brain whatever its size; Ollama is about memory.
    // Settings sign-off (1.5.51): switch off = a plain swap line; the tip about the switch shows once only (tip).
    if (mode === 'swap' && old && single && !besideOn) return `🛰 Moot: ${copy} checks ${what}. My ${old} steps out and the ${now} comes in, about ${secs} ${secs === 1 ? 'second' : 'seconds'}.${tip ? ' (To keep both loaded, turn on "Let the reviewer sit beside Bob\'s main brain" in Settings, Brains.)' : ''}`;
    if (mode === 'swap' && old) return `🛰 Moot: ${copy} checks ${what}. ${single ? 'There isn\'t room for both right now' : 'Only one big brain fits right now'}, so my ${old} steps out and the ${now} comes in, about ${secs} ${secs === 1 ? 'second' : 'seconds'}.`;
    return `🛰 Moot: ${copy} checks ${what}, on the ${now}. Loading it, about ${secs} ${secs === 1 ? 'second' : 'seconds'}.`;
  }
  if (mode === 'add' && old && beside && onCard) return `Adding the ${now} beside my ${old} on the graphics card, which has room for both. About ${secs} ${secs === 1 ? 'second' : 'seconds'}.`;
  if (mode === 'add' && old && beside) return `Adding the ${now} on the processor, so my ${old} keeps working on the graphics card. About ${secs} ${secs === 1 ? 'second' : 'seconds'}, and this reply starts slower than usual.`;
  if (mode === 'add' && old) return `Adding the ${now} beside my ${old}, which stays loaded. About ${secs} ${secs === 1 ? 'second' : 'seconds'}.`;
  if (mode === 'load' || !old) return `Loading the ${now}. Back in about ${secs} ${secs === 1 ? 'second' : 'seconds'}.`;
  return `Swapping brains: my ${old} goes out and the ${now} comes in. Back in about ${secs} ${secs === 1 ? 'second' : 'seconds'}.`;
}

// 1.5.53: thinking goes to the "Bob's thinking" window in small batches (about 8 a second), not token by token.
export function thinkStream(emit, who, model, every = 120) {
  // The window's box for this brain call starts with the first thought, so a reply with no thinking leaves no empty box.
  let buf = '', timer = null, started = false;
  const flush = () => { clearTimeout(timer); timer = null; if (buf) { emit({ type: 'think', who, model, text: buf }); buf = ''; } };
  return { push: (t) => { if (!started) { started = true; emit({ type: 'think-start', who, model }); } buf += t; if (!timer) timer = setTimeout(flush, every); }, flush };
}

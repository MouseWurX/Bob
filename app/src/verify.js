// Did it really happen? (handoff protocol, part 3: verify.)
// The app checks every action against the real PC, never against the model's words:
// - expectFrom: what the user asked for, read from their words (no model).
// - verifyOutput: a made file is really there, not empty, finished writing, and really a picture/clip/sound.
// - afterTool: right after a tool ran, did it do what it says? (file on disk with the right content, window open,
//   picture made and shown...). Says whether one automatic retry is safe.
// - afterTurn: when Bob stops talking, was the ask met? Did he claim something that never ran? Is the bubble empty?
//   One hidden nudge to really do it, then a plain note for the user. Nothing is dropped silently.
// All of it is plain code: no model calls, no settings writes. The lead (handoff.js / brain.js) does the wiring.
import fs from 'node:fs';
import path from 'node:path';
import { HANDS } from './hands-settings.js';
import { kindOf, repeatSafe } from './tool-kinds.js';
import { stepsNudge } from './job-steps.js'; // Nov 13: several things asked, fewer tool steps ran
import { PIC_CLAIM_FR_ES, FILE_CLAIM_FR_ES, admitsTrouble, plain } from './honest.js'; // Nov 12, items 182 and 185

// ---------------------------------------------------------------- what was asked for

const ART = '(?:a|an|some|another|one|two|three|four|\\d+|the|that|this|my|your|our|his|her|new|few|couple of)';
const WHO = '(?:me|us|him|her|them|my \\w+)';
const GAP = '(?:[\\w\'-]+\\s+){0,4}?';
const NOT_THE_THING = '(?!\\s+(?:prompts?|ideas?|descriptions?|briefs?|sizes?|formats?|editors?|models?|settings?|generators?|games?|tools?|apps?|files? names?)\\b)';
const PIC_NOUN = '(?:picture|image|photo|pic|drawing|painting|portrait|illustration|wallpaper|logo|icon|sketch|artwork|poster|avatar|selfie|render|sprite|concept art)s?';
const VID_NOUN = '(?:video|clip|animation|movie|film|gif)s?';
const MUSIC_NOUN = '(?:song|music|tune|track|melody|jingle|beat|soundtrack|chiptune)s?';
const SOUND_NOUN = '(?:sound effect|sfx|sound|noise)s?';
const FILE_NOUN = '(?:file|document|doc|txt|text file|csv|spreadsheet|note file|readme|markdown file|log file)s?';
const APPS = '(?:notepad|paint|calculator|calc|blender|word|excel|powerpoint|outlook|file explorer|explorer|chrome|firefox|edge|vs ?code|visual studio code|android studio|unreal(?: engine)?|steam|discord|spotify|obs|gimp|krita|photoshop|[\\w-]+ app)';

const rx = (s) => new RegExp(s, 'i');
const ASK = {
  video: rx(`\\b(?:make|create|generate|render|film|animate|produce|do|show|give|send)\\b(?:\\s+${WHO})?\\s+(?:${ART}\\s+)?${GAP}${VID_NOUN}\\b${NOT_THE_THING}`),
  music: rx(`\\b(?:make|compose|create|generate|produce|play|give|do)\\b(?:\\s+${WHO})?\\s+(?:${ART}\\s+)?${GAP}${MUSIC_NOUN}\\b${NOT_THE_THING}`),
  sound: rx(`\\b(?:make|create|generate|produce|give|do)\\b(?:\\s+${WHO})?\\s+(?:${ART}\\s+)?${GAP}${SOUND_NOUN}\\b${NOT_THE_THING}`),
  show: rx(`\\bshow\\s+${WHO}\\s+(?:the|that|this|those|these|your|it|them)\\b\\s*${GAP}${PIC_NOUN}\\b${NOT_THE_THING}`),
  picture: rx(`\\b(?:make|draw|paint|generate|create|render|sketch|design|give|show|send|produce|do|whip up|illustrate)\\b(?:\\s+${WHO})?\\s+(?:${ART}\\s+)?${GAP}${PIC_NOUN}\\b${NOT_THE_THING}`),
  // "draw a fox", "paint my cat as a pirate": the verb alone, at the start of the ask.
  drawCmd: /^(?:(?:hey\s+)?bob[,:]?\s+)?(?:please\s+|pls\s+|can you\s+|could you\s+|would you\s+|will you\s+)?(?:draw|paint|sketch|illustrate)\s+(?:me\s+|us\s+)?(?:a|an|some|the|my|our|his|her|two|three|\d+)\b/i,
  file: rx(`\\b(?:save|write|create|make|put|export|store)\\b(?:\\s+${WHO})?\\s+(?:(?:${ART}|it|this|that|them|everything|all of (?:it|this|that))\\s+)?${GAP}(?:${FILE_NOUN}\\b|(?:as|to|in|into)\\s+(?:a\\s+)?(?:[A-Za-z]:\\\\|~|/|\\w+\\.(?:txt|md|csv|json|html|js|py|log))|on (?:my|the) desktop|in (?:my|the) (?:documents|downloads|desktop))`),
  saveIt: /\bsave\s+(?:it|this|that|them|the (?:text|list|notes?|story|poem|code|table|results?))\b/i,
  app: rx(`\\b(?:open|launch|start|fire up|bring up|pull up|load up)\\s+(?:up\\s+)?(?:the\\s+|an?\\s+|my\\s+)?${APPS}\\b|\\b(?:type|write|paste|put)\\b[^.?!\\n]{0,80}\\b(?:in|into)\\s+(?:the\\s+|a\\s+|an?\\s+new\\s+)?${APPS}\\b|\\b(?:take the wheel|take (?:over|control of) (?:my|the) (?:pc|screen|computer|mouse)|drive my (?:pc|screen|computer)|use my (?:screen|mouse|keyboard))\\b`),
  // 1.5.95: a flowchart or diagram (drawn with make_diagram, not painted).
  diagram: /\b(?:flow ?charts?|diagrams?|mind ?maps?|org(?:ani[sz]ation(?:al)?)? charts?|family trees?|decision trees?|process (?:map|chart)s?|gantt(?: chart)?s?|timelines?|pie charts?|swim ?lanes?)\b/i,
  // Tool sets (tool-sets.js): the GPT-OSS v5 rejects' worst miss was a to-do or reminder asked for and no tool run.
  todo: /\b(?:add|put|stick|pop|jot|throw|write|pin)\b[^.?!\n]{0,70}?\b(?:on|to|onto|in)\s+(?:my|the|our)\s+(?:to-?do(?:\s+list)?|to-?dos|task list|tasks|list|notice ?board|board|chores)\b/i,
  reminder: /\bremind\s+(?:me|us)\s+(?:to|at|in|on|tomorrow|tonight|this|next|every|before|after)\b/i,
  // A picture is attached and the words want it changed.
  editPic: /\b(?:edit|change|restyle|recolou?r|retouch|fix|clean up|upscale|make (?:it|this|her|him|them|the \w+)|turn (?:it|this|her|him|them) into|add|remove|put|swap|replace|give (?:it|her|him|them))\b/i
};
const NEGATED = /\b(?:don'?t|do not|didn'?t|no need to|never|stop|without|not)\s+(?:\w+\s+){0,2}?(?:make|draw|paint|open|save|write|show|create|generate|launch|start|type|compose|film|put|add|remind)\b/i;
const HOW_OR_PAST = /^(?:how|why|what|when|where|which|who|did|have you|has|had|is|was|were|does|do you (?:know|remember|think)|remember)\b/i;
const ABILITY = /^(?:can|could|are|do|will|would|is it possible)\b[^?]*\?\s*$/i;
const TALK_ABOUT = /\b(?:how (?:to|do|can|would|should|does)|tell me about|explain|teach me|what'?s the best way to|tips? (?:on|for)|ideas? for|prompt for)\b/i;
const NOT_AN_ASK = /\b(?:idea|ideas|prompt|prompts|description|name|title|caption|tips?|advice)\b/i;
const CONCRETE = /\b(?:me|us|a|an|some|the|one|two|three|\d+|my|another|of|with|for|showing|about|called|named)\b/i;

// What the user asked for, from their words alone: null when it's talk, a question about Bob, or a "don't".
export function expectFrom(text, { pics = [] } = {}) {
  const t = String(text || '').replace(/\s+/g, ' ').trim();
  if (!t) return null;
  const neg = NEGATED.test(t);
  const how = HOW_OR_PAST.test(t);
  const found = [];
  const add = (kind, m, whole = false) => {
    if (!m || found.some((f) => f.kind === kind)) return;
    const words = (whole ? t : m[0]).trim().slice(0, 120);
    // "give me an idea for a picture", "how to make a logo": talk about the thing, not an ask for it.
    if (NOT_AN_ASK.test(m[0]) || TALK_ABOUT.test(t.slice(0, (m.index ?? 0) + m[0].length))) return;
    found.push({ kind, words });
  };
  if (!how) {
    // 1.5.95: "draw me a flowchart" is a diagram, not a picture.
    const diagram = /\b(?:make|draw|create|do|give|show|sketch|map|lay|chart|put together|build|design|whip up)\b/i.test(t) ? t.match(ASK.diagram) : null;
    if (diagram) add('diagram', diagram, true);
    for (const kind of ['reminder', 'todo', 'video', 'music', 'sound', 'show', 'picture', 'file', 'app']) if (!(diagram && ['picture', 'show'].includes(kind))) add(kind, t.match(ASK[kind]));
    if (!diagram && !found.some((f) => f.kind === 'picture' || f.kind === 'show')) add('picture', t.match(ASK.drawCmd), true);
    if (!found.some((f) => f.kind === 'file')) add('file', t.match(ASK.saveIt));
    if (pics.length && !found.some((f) => ['picture', 'show', 'video'].includes(f.kind))) add('picture', t.match(ASK.editPic), true);
  }
  // "Can you make pictures?" asks about Bob, not for a picture. "Can you make me a picture of a fox?" is an ask.
  const real = found.filter((f) => !(ABILITY.test(t) && !CONCRETE.test(f.words.replace(/^\S+\s*/, ''))));
  if (!real.length || (neg && real.every((f) => NEGATED.test(t.slice(0, t.toLowerCase().indexOf(f.words.toLowerCase()) + f.words.length))))) return null;
  // A picture asked for alongside "show" counts once, as a picture.
  const [first, ...also] = real;
  return { kind: first.kind, words: first.words, ...(also.length ? { also: also.map((a) => a.kind) } : {}) };
}

// ---------------------------------------------------------------- is the file real?

const hex = (b, at, h) => b.length >= at + h.length / 2 && b.subarray(at, at + h.length / 2).toString('hex') === h;
const KINDS = {
  image: (b) => hex(b, 0, '89504e470d0a1a0a') || hex(b, 0, 'ffd8ff') || hex(b, 0, '47494638') || (hex(b, 0, '52494646') && hex(b, 8, '57454250')) || hex(b, 0, '424d'),
  video: (b) => hex(b, 4, '66747970') || hex(b, 0, '1a45dfa3') || hex(b, 0, '47494638') || (hex(b, 0, '52494646') && hex(b, 8, '41564920')),
  audio: (b) => (hex(b, 0, '52494646') && hex(b, 8, '57415645')) || hex(b, 0, '494433') || (b.length > 1 && b[0] === 0xff && (b[1] & 0xe0) === 0xe0) || hex(b, 0, '4f676753') || hex(b, 0, '664c6143') || hex(b, 4, '66747970')
};
const NOUN = { image: 'picture', video: 'clip', audio: 'sound file', file: 'file' };
export const typeOfFile = (f) => {
  const e = path.extname(String(f || '')).toLowerCase();
  if (['.png', '.jpg', '.jpeg', '.webp', '.bmp'].includes(e)) return 'image';
  if (['.mp4', '.webm', '.mov', '.avi', '.mkv', '.gif'].includes(e)) return 'video';
  if (['.wav', '.mp3', '.ogg', '.flac', '.m4a'].includes(e)) return 'audio';
  return 'file';
};
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// The file is there, not a folder, not empty, done being written, and (for media) really that kind of file.
export async function verifyOutput(file, type = typeOfFile(file), { settleMs = 200, maxWaitMs = 3000 } = {}) {
  if (!file) return { ok: false, why: 'no file was named' };
  type = type === 'picture' ? 'image' : type === 'sound' || type === 'music' ? 'audio' : type;
  const noun = NOUN[type] || 'file';
  let st;
  try { st = fs.statSync(file); } catch { return { ok: false, why: `the ${noun} isn't there (${path.basename(String(file))})` }; }
  if (!st.isFile()) return { ok: false, why: `${path.basename(String(file))} is a folder, not a ${noun}` };
  // Still being written (a painter that reports early): wait until the size holds still.
  for (let waited = 0; Date.now() - st.mtimeMs < 1000 && waited < maxWaitMs; waited += settleMs) {
    await wait(settleMs);
    let now; try { now = fs.statSync(file); } catch { return { ok: false, why: `the ${noun} disappeared while it was being saved` }; }
    if (now.size === st.size) break;
    st = now;
  }
  if (type === 'file') return { ok: true, why: `${path.basename(file)} is there (${st.size} bytes)`, size: st.size };
  if (!st.size) return { ok: false, why: `the ${noun} is empty (0 bytes)` };
  const head = Buffer.alloc(16);
  let n = 0;
  try { const fd = fs.openSync(file, 'r'); try { n = fs.readSync(fd, head, 0, 16, 0); } finally { fs.closeSync(fd); } } catch (e) { return { ok: false, why: `the ${noun} can't be read (${e.code || e.message})` }; }
  const isIt = KINDS[type];
  if (isIt && !isIt(head.subarray(0, n))) return { ok: false, why: `${path.basename(file)} isn't a real ${noun} (the app couldn't read it as one)` };
  return { ok: true, why: `${path.basename(file)} is a real ${noun} (${st.size} bytes)`, size: st.size };
}

// ---------------------------------------------------------------- after each tool

const MEDIA = { make_image: 'image', make_video: 'video', make_music: 'audio', make_sound: 'audio', workshop_run: null };
const MEDIA_EXT = /\.(?:png|jpe?g|webp|bmp|gif|mp4|webm|mov|avi|mkv|wav|mp3|ogg|flac|m4a)$/i;
// Running these again can't do harm: they make a new file or write the same content again (tool-kinds.js, item 170).
const RETRY_SAFE = { has: (name) => kindOf(name).risk !== 'look' && repeatSafe(name) };
// Worth one more go: the engine was busy, slow, out of memory or not up yet.
const TRANSIENT = /time(?:d)? ?out|didn'?t finish in time|out of memory|\bOOM\b|ECONNREFUSED|ECONNRESET|EPIPE|EBUSY|EAGAIN|socket hang up|fetch failed|network|not ready|still loading|loading the model|busy|exited|crashed|stopped unexpectedly|no output|code \d+|temporar|try again|503|502|500\b/i;
const PERMANENT = /isn'?t set up|isn'?t installed|isn'?t hooked up|switched off|is off\b|are off\b|not allowed|off limits|no reference called|said no|read-only|don'?t (?:write|edit)|isn'?t in the file|appears \d+ times|doesn'?t exist|Hands are stopped|Stopped by the user|Stopped\.$/i;

const PATH_RX = /[A-Za-z]:\\(?:[^\\/:*?"<>|\r\n]+\\)*[^\\/:*?"<>|\r\n]+?\.[A-Za-z0-9]{1,8}(?=[\s,;.)"'`]|$)|(?<![\w.])\/(?:[^\s/"'<>|*?]+\/)+[^\s/"'<>|*?]+?\.[A-Za-z0-9]{1,8}(?=[\s,;)"'`]|\.(?:\s|$)|$)/g;
export function pathsIn(text) {
  const s = String(text || '');
  const out = [...(s.match(PATH_RX) || [])];
  // ComfyUI's "saved in <folder>: a.png, b.png."
  const m = s.match(/saved in (.+?): ([^\n]+?)\. /);
  if (m) for (const n of m[2].split(/,\s*/)) if (MEDIA_EXT.test(n)) out.push(path.join(m[1], n));
  return [...new Set(out.map((p) => p.replace(/[.,;]+$/, '')))];
}

// What Bob is told about a failure, without the notes the tools leave for Bob himself.
export function plainWhy(text) {
  return String(text || '').replace(/^Error:\s*/, '').replace(/\s*\((?:[^()]*\b(?:Bob|Tell|tell|don'?t|Do not|do not|Use app_look|Report)\b[^()]*)\)/g, '').replace(/\s+/g, ' ').trim().slice(0, 200);
}
const sameCall = (a, name, args) => a.name === name && JSON.stringify(a.args ?? {}) === JSON.stringify(args ?? {});
const parse = (a) => { if (typeof a === 'string') { try { return JSON.parse(a); } catch { return {}; } } return a || {}; };
const fileIn = (text, re) => { const m = String(text || '').match(re); return m ? m[1].trim() : ''; };

// Item 183: edit_file's changes, as tools.js editList reads them, and the file they should make.
const editsOf = (args = {}) => [{ find: args.find, replace: args.replace }, ...(Array.isArray(args.more) ? args.more : [])].slice(0, 20).map((e) => ({ find: String(e?.find ?? ''), replace: String(e?.replace ?? '') }));
function applyAll(body, edits) {
  let out = String(body);
  for (const e of edits) { if (!e.find || out.split(e.find).length !== 2) throw new Error('does not fit'); out = out.replace(e.find, () => e.replace); }
  return out;
}
// Item 184: the files and folders a command was told to make (no shell, so the program and its arguments apart):
// an output flag (-o for the programs where it means that, --output, -OutFile...), mkdir's folders, git clone's folder.
const OUT_SHORT = new Set(['curl', 'gcc', 'g++', 'clang', 'clang++', 'cc', 'pandoc', 'go', 'rustc', 'javac', 'tsc', 'yt-dlp', 'wget']);
const OUT_LONG = /^(?:--output|--out|--outfile|--out-file|--output-file|--output-path|-outfile|-out|-OutFile|--outdir|--out-dir|--output-dir)$/i;
const OUT_LONG_EQ = /^(?:--output|--out|--outfile|--out-file|--output-file|--output-path|--outdir|--out-dir|--output-dir)=(.+)$/i;
export function expectedOutputs(args = {}) {
  const cmd = String(args.cmd || '').split(/[\\/]/).pop().toLowerCase().replace(/\.(?:exe|cmd|bat)$/, '');
  const list = (Array.isArray(args.args) ? args.args : []).map((a) => String(a));
  const cwd = String(args.cwd || '');
  const out = [];
  const add = (p) => { p = String(p || '').trim().replace(/^["']|["']$/g, ''); if (!p || p === '-' || /[$%*?<>|]|^\/dev\//.test(p) || /^(?:nul|con)$/i.test(p) || /^[a-z]+:\/\//i.test(p)) return; out.push(path.isAbsolute(p) || /^[A-Za-z]:[\\/]/.test(p) ? p : path.resolve(cwd || '.', p)); };
  for (let i = 0; i < list.length; i++) {
    const a = list[i], eq = OUT_LONG_EQ.exec(a);
    if (eq) add(eq[1]);
    else if (OUT_LONG.test(a) || ((a === '-o' && OUT_SHORT.has(cmd) && cmd !== 'wget') || (a === '-O' && cmd === 'wget'))) add(list[++i]);
  }
  if (cmd === 'mkdir' || cmd === 'md') list.filter((a) => !a.startsWith('-')).forEach(add);
  if (cmd === 'git' && list[0] === 'clone') { const rest = list.slice(1).filter((a) => !a.startsWith('-')); if (rest.length === 2) add(rest[1]); }
  return cwd ? out : out.filter((p) => path.isAbsolute(p) || /^[A-Za-z]:[\\/]/.test(p));
}

// Right after a tool ran. ok: it did what it says (checked on the PC where that's possible). retry: one more
// automatic go is safe and may help. text: what Bob should read instead of the tool's own result.
// show: real files that never reached the chat (the lead emits them). declined: the user said no (not a failure).
export async function afterTool(name, args, text, ctx = {}) {
  args = parse(args);
  const s = String(text ?? '');
  const L = ctx.ledger || {};
  const who = ctx.cfg?.userName || 'the user';
  const triedBefore = (L.actions || []).some((a) => a.ok === false && sameCall(a, name, args) && a.at !== ctx.ledger?.toolStart);
  const fail = (why, { retry = false, text: t } = {}) => {
    const again = retry && RETRY_SAFE.has(name) && !triedBefore;
    const note = triedBefore ? ' (The app tried it twice, so it won\'t try again by itself.)' : '';
    return { ok: false, why, retry: again, text: t ? `${t}${note}` : (note ? `${s}${note}` : undefined) };
  };
  if (!s.trim()) return fail(`${name} gave back nothing, so it can't be told whether it ran`, { retry: true, text: `Error: ${name} gave back nothing at all, so the app can't tell whether it ran. Don't say it worked.` });
  if (/^The user said no\b/.test(s)) return { ok: true, declined: true, why: 'declined', retry: false };
  // Item 198: when the tool's own error had a code (ENOENT, ETIMEDOUT...), that decides whether a second go can help;
  // the words are only read when there was no code.
  const known = ctx.toolError?.code ? ctx.toolError : null;
  if (/^Error:/.test(s)) return fail(plainWhy(s), { retry: known ? Boolean(known.transient) : TRANSIENT.test(s) && !PERMANENT.test(s) });

  if (name in MEDIA) {
    if (/^Didn'?t paint\b/.test(s)) return { ok: true, info: true, why: 'nothing painted on purpose', retry: false };
    const since = L.toolStart ?? ctx.toolStart ?? null;
    const shown = (L.outputs || []).filter((o) => o && o.file && (!o.tool || o.tool === name) && (since == null || o.at == null || o.at >= since));
    const named = pathsIn(s).filter((f) => MEDIA_EXT.test(f));
    const files = named.length ? named : [...new Set(shown.map((o) => o.file))];
    const noun = NOUN[MEDIA[name] || typeOfFile(files[0])] || 'file';
    if (!files.length) return fail(`no ${noun} came out`, { retry: true, text: `Error: ${name} finished, but no ${noun} came out of it, so nothing was made. (Checked by the app.) Don't say it was made.` });
    const bad = [];
    for (const f of files) { const v = await verifyOutput(f, MEDIA[name] || typeOfFile(f)); if (!v.ok) bad.push(v.why); }
    if (bad.length) return fail(bad.join('; '), { retry: true, text: `Error: the ${noun} didn't come out right: ${bad.join('; ')}. (Checked by the app.) Don't say it was made.` });
    const show = ctx.ledger?.outputs ? files.filter((f) => !(L.outputs || []).some((o) => o && o.file && path.resolve(o.file) === path.resolve(f))).map((f) => ({ type: typeOfFile(f), file: f })) : [];
    return { ok: true, why: `${files.length} ${noun}${files.length === 1 ? '' : 's'} made and checked`, retry: false, files, ...(show.length ? { show } : {}) };
  }

  if (name === 'write_file') {
    const file = fileIn(s, /^Saved (.+?)\.?$/m) || args.path;
    let body;
    try { body = fs.readFileSync(file); } catch { return fail(`${path.basename(String(file || 'the file'))} isn't there after saving`, { retry: true, text: `Error: the app looked for ${file} after saving, and it isn't there. Nothing was saved. Don't say it was.` }); }
    if (!body.equals(Buffer.from(String(args.content ?? '')))) return fail(`what's in ${path.basename(file)} isn't what was written`, { retry: true, text: `Error: ${file} is there, but what's in it isn't what Bob wrote (${body.length} bytes on disk, ${Buffer.byteLength(String(args.content ?? ''))} sent). (Checked by the app.)` });
    return { ok: true, why: `${path.basename(file)} saved and read back`, retry: false, files: [file] };
  }
  if (name === 'edit_file') {
    const file = fileIn(s, /^Edited (.+?)\. \(/m) || args.path;
    let body;
    try { body = fs.readFileSync(file, 'utf8'); } catch { return fail(`${path.basename(String(file))} isn't there after the edit`, { text: `Error: the app looked for ${file} after the edit, and it isn't there.` }); }
    if (args.replace && !body.includes(args.replace)) return fail(`the change isn't in ${path.basename(file)}`, { text: `Error: the app read ${file} back and the new text isn't in it, so the edit didn't land. Read the file and try again.` });
    // Item 183 (Nov 12): the new text being there isn't proof (it may have been there already). With the file as it
    // was just before the edit, the app works out what it should be now and compares; without it, each old text must
    // be gone (unless its new text keeps it) and the file must have changed.
    const edits = editsOf(args);
    const before = ctx.editBefore && path.resolve(ctx.editBefore.file) === path.resolve(file) ? ctx.editBefore.body : null;
    if (edits.length && edits.every((e) => e.find === e.replace)) return fail(`nothing in ${path.basename(file)} changed`, { text: `Error: the edit's new text is the same as its old text, so ${file} didn't change. (Checked by the app.) Don't say it was changed.` });
    if (before != null) {
      if (body === before) return fail(`nothing in ${path.basename(file)} changed`, { text: `Error: the app read ${file} back and it's the same as before the edit, so nothing changed. (Checked by the app.) Read the file and try again.` });
      let want = null;
      try { want = applyAll(before, edits); } catch {}
      if (want != null && want !== body) return fail(`${path.basename(file)} isn't what the edit should have made`, { text: `Error: the app read ${file} back and it isn't what the edit should have made (something else changed it, or only part landed). (Checked by the app.) Read the file before saying it's done.` });
    } else {
      const left = edits.find((e) => e.find && !e.replace.includes(e.find) && !edits.some((o) => o !== e && o.replace.includes(e.find)) && body.includes(e.find));
      if (left) return fail(`the old text is still in ${path.basename(file)}`, { text: `Error: the app read ${file} back and the old text is still there, so the edit didn't land. Read the file and try again.` });
    }
    return { ok: true, why: `${path.basename(file)} changed and read back`, retry: false, files: [file] };
  }
  if (name === 'save_spreadsheet') {
    const file = fileIn(s, /^Saved (.+?) \(\d+ lines/m);
    const v = await verifyOutput(file, 'file');
    if (!v.ok || !v.size) return fail(v.ok ? 'the spreadsheet is empty' : v.why, { retry: true, text: `Error: the app checked and the spreadsheet ${v.ok ? 'is empty' : 'isn\'t there'}. Nothing usable was saved.` });
    return { ok: true, why: v.why, retry: false, files: [file] };
  }
  if (name === 'open_app') {
    if (/^Opened\b/.test(s)) return { ok: true, why: 'the window is open', retry: false };
    return fail('no new window appeared', { text: `${s} (Checked by the app: no new window yet. Next, call app_look with no window to see whether it opened late or behind, before opening it again.)` });
  }
  if (name === 'app_act') {
    if (/^Done:/.test(s)) return { ok: true, why: 'done', retry: false };
    // The helper read the window back and couldn't see the result: confirm with a look before anything else.
    return { ...fail('the app couldn\'t confirm it worked', { text: `${s} (Not confirmed. Next, call app_look on "${args.window || 'that window'}" to check, then tell ${who} what is really there.)` }), confirm: { name: 'app_look', args: { window: args.window || '' } } };
  }
  if (name === 'run_command' || name === 'run_recipe') {
    if (/^It didn'?t start/.test(s)) return fail(plainWhy(s.replace(/^It didn'?t start:\s*/, '')) || 'it didn\'t start');
    if (/^Stopped by the user/.test(s)) return { ok: true, declined: true, why: 'stopped by the user', retry: false };
    if (/^Stopped: it ran past/.test(s)) return fail('it ran too long and was stopped');
    const code = s.match(/^Finished with exit code (-?\d+)/m);
    if (code && Number(code[1]) !== 0) return fail(`it finished with exit code ${code[1]} (that usually means it failed)`);
    // Item 184 (Nov 12): exit code 0 isn't the whole story. A file or folder the command was told to make must be there.
    if (name === 'run_command') {
      const missing = expectedOutputs(args).filter((f) => !fs.existsSync(f));
      if (missing.length) return fail(`it finished, but ${missing.map((f) => path.basename(f)).join(', ')} isn't there`, { text: `${s}\n(Checked by the app: the command finished, but ${missing.join(', ')} ${missing.length === 1 ? 'isn\'t' : 'aren\'t'} there, so it didn't do what it was asked. Don't say it did.)` });
    }
    return { ok: true, why: code ? 'exit code 0' : 'ran', retry: false };
  }
  if (name === 'file_hands' || name === 'sort_files') {
    const done = Number((s.match(/: (\d+) done\./) || [])[1] ?? NaN);
    const notDone = /^Not done: (.+)$/m.exec(s);
    if (done === 0 && notDone) return fail(`none of it was done: ${notDone[1].slice(0, 160)}`);
    if (notDone) return { ok: true, partly: true, why: `${done} done, some not: ${notDone[1].slice(0, 160)}`, retry: false };
    return { ok: true, why: `${Number.isNaN(done) ? 'done' : `${done} done`}`, retry: false };
  }
  if (name === 'convert_file' || name === 'office_make' || name === 'office_edit' || name === 'strip_metadata') {
    const files = [...s.matchAll(/^Saved (.+?) \([\d.]+ [KM]B\)/gm)].map((m) => m[1]);
    if (!files.length) return fail('no file came out', { text: `Error: ${name} finished, but no new file came out of it. (Checked by the app.) Don't say it was made.` });
    const bad = [];
    for (const f of files) { let n = 0; try { n = fs.statSync(f).size; } catch {} if (!n) bad.push(path.basename(f)); }
    if (bad.length) return fail(`${bad.join(', ')} isn't there or is empty`, { text: `Error: the app looked for ${bad.join(', ')} after saving, and ${bad.length === 1 ? 'it isn\'t there or is empty' : 'they aren\'t there or are empty'}. Don't say ${bad.length === 1 ? 'it was' : 'they were'} made.` });
    const notDone = /^Not done: (.+)$/m.exec(s);
    if (notDone) return { ok: true, partly: true, why: `${files.length} saved, some not: ${notDone[1].slice(0, 160)}`, retry: false, files };
    return { ok: true, why: `${files.length} file${files.length === 1 ? '' : 's'} saved and checked`, retry: false, files };
  }
  if (name === 'schedule_job') return /^Scheduled\b/.test(s) ? { ok: true, why: 'scheduled', retry: false } : fail(plainWhy(s));
  return { ok: true, why: 'ran', retry: false };
}

// ---------------------------------------------------------------- when Bob stops

const PIC_CLAIM = new RegExp(`\\b(?:here(?:'s| is| are| you go)|I(?:'ve| have)?\\s+(?:just\\s+|now\\s+|gone and\\s+)?(?:made|painted|drawn|drew|created|generated|rendered|sketched|whipped up|put together|done))\\b[^.!?\\n]{0,60}?\\b${PIC_NOUN}\\b${NOT_THE_THING}`, 'i');
const VID_CLAIM = new RegExp(`\\b(?:here(?:'s| is| are| you go)|I(?:'ve| have)?\\s+(?:just\\s+|now\\s+)?(?:made|filmed|created|generated|rendered|animated|put together))\\b[^.!?\\n]{0,60}?\\b${VID_NOUN}\\b${NOT_THE_THING}`, 'i');
// 1.5.38: "Your song is ready", "the track played for 30 seconds", "saved it as a .wav": claims that a song exists
// without the "I made" opener. (A made-up song once came with no make_music call at all.)
const AUDIO_DONE = new RegExp(`\\b(?:${MUSIC_NOUN})\\b[^.!?\\n]{0,50}?\\b(?:is|was|are|were|'s)\\s+(?:now\\s+|all\\s+)?(?:ready|done|finished|saved|playing)\\b|\\b(?:${MUSIC_NOUN})\\b[^.!?\\n]{0,50}?\\b(?:played|finished playing|ended)\\b|\\bsaved (?:it|the (?:${MUSIC_NOUN}))? ?as an? \\.?(?:wav|mp3|ogg|flac)\\b`, 'i');
// 1.5.38: Bob saying his songs can't be saved. They always are (a .wav in his painter folder).
const SAVE_DENIAL = /\b(?:no (?:function|tool|way|option)|(?:can'?t|cannot|unable to|not able to|don'?t have (?:a|any) (?:way|function|tool) to))\b[^.!?\n]{0,80}?\b(?:sav|record|keep|persist|stor)\w*\b[^.!?\n]{0,80}?\b(?:music|songs?|tracks?|audio|sounds?|make_music|make_sound|wav)\b|\b(?:music|songs?|tracks?|make_music)\b[^.!?\n]{0,80}?\b(?:can'?t|cannot|isn'?t|aren'?t|won'?t|doesn'?t)\b[^.!?\n]{0,20}?\b(?:be )?(?:saved|kept|stored|persistent|recorded)\b/i;
const AUDIO_CLAIM = new RegExp(`\\b(?:here(?:'s| is| are| you go)|I(?:'ve| have)?\\s+(?:just\\s+|now\\s+)?(?:made|composed|created|generated|recorded|produced|put together))\\b[^.!?\\n]{0,60}?\\b(?:${MUSIC_NOUN}|${SOUND_NOUN})\\b${NOT_THE_THING}`, 'i');
const FILE_CLAIM = /\bI(?:'ve| have|)\s+(?:just\s+|now\s+|also\s+)?(?:saved|written|wrote|created|stored|exported|put)\b[^.!?\n]{0,60}?\b(?:file|document|spreadsheet|csv|txt|desktop|documents folder|downloads)\b/i;
const SAVED_AT = /\b(?:saved|written|wrote|created|stored|exported|put)\s+(?:it\s+|that\s+|this\s+|them\s+|everything\s+|the [\w ]{1,30}?\s+)?(?:as|to|at|in|into)\s+[`"'*]*((?:[A-Za-z]:\\|\/)[^\s`"'*]+)/gi;
const APP_CLAIM = /\bI(?:'ve| have|)\s+(?:just\s+|now\s+|already\s+|successfully\s+|gone ahead and\s+)?(?:opened|launched|started|typed|clicked|pressed|pasted|entered|written)\b[^.!?\n]{0,60}?\b(?:notepad|paint|calculator|app|application|window|program|tab|in (?:the |a )?(?:text box|document|field))\b/i;

const MEDIA_OF = { picture: 'image', show: 'image', video: 'video', music: 'audio', sound: 'audio' };
const TOOL_OF = { todo: 'notice_board', reminder: 'reminders', diagram: 'make_diagram', picture: 'make_image', show: 'make_image', video: 'make_video', music: 'make_music', sound: 'make_sound', file: 'write_file', app: 'open_app' };
const GROUPS_OF = { todo: [], reminder: [], diagram: ['diagrams'], picture: ['pictures'], show: ['pictures'], video: ['pictures'], music: ['pictures'], sound: ['pictures'], file: ['documents'], app: ['apps'] };
const WHAT = { todo: 'something put on their to-do list', reminder: 'a reminder', diagram: 'a diagram', picture: 'a picture', show: 'a picture', video: 'a clip', music: 'some music', sound: 'a sound', file: 'a file saved', app: 'something done in an app' };
// The tools that read a file (2c in afterTurn), and a file named in the ask: "read notes.txt", "what's in plan.docx".
const READS_FILE = new Set(['read_file', 'office_read', 'inspect_file', 'find_in_documents', 'search_files', 'query_data', 'compare_files', 'read_spreadsheet']);
const FILE_ASK = /\b(?:read|open|show(?: me)?|summari[sz]e|look (?:at|in|through)|check|go through|what(?:'s| is) (?:in|on)|what does|lis|lire|ouvre|ouvrir|r[ée]sume)\b[^\n]{0,40}?(?:^|[\s"'`(])((?:[\w.~-]+[\\/])*[\w~-][\w .-]{0,60}?\.(?:txt|md|markdown|csv|tsv|json|jsonl|log|ini|cfg|conf|toml|ya?ml|xml|html?|js|mjs|ts|py|ps1|bat|sh|docx?|xlsx?|pptx?|odt|ods|odp|rtf|pdf|epub))\b/i;
export function fileAsked(text) { const m = String(text || '').match(FILE_ASK); return m ? m[1].trim() : ''; }
const FILE_TOOLS = new Set(['write_file', 'edit_file', 'save_spreadsheet', 'file_hands', 'sort_files', 'convert_file', 'office_make', 'office_edit', 'strip_metadata']);
const APP_TOOLS = new Set(['open_app', 'app_act']);
const LOOKS = new Set(['app_look', 'list_schedules', 'read_file', 'list_files', 'search_files', 'workshop_list', 'use_tools', 'recall', 'web_search', 'fetch_page', 'security_check', 'inspect_file', 'osint_lookup', 'check_exposure', 'security_tips', 'bob_help']);
const isDoing = (n) => n in MEDIA || FILE_TOOLS.has(n) || APP_TOOLS.has(n) || ['run_command', 'run_recipe', 'schedule_job', 'change_schedule', 'undo_files'].includes(n);

// Plain words for what an action was, for the user's note.
const FILE_JOBS = { move: 'Moving the files', copy: 'Copying the files', rename: 'Renaming the files', zip: 'Zipping the files', unzip: 'Unzipping the files', tidy: 'Tidying the folder', recycle: 'Moving the files to the Recycle Bin' };
export function describe(name, args = {}) {
  args = parse(args);
  const base = (p) => (p ? baseName(p) : 'a file');
  switch (name) {
    case 'make_image': return 'Making the picture';
    case 'make_video': return 'Making the clip';
    case 'make_music': return 'Making the music';
    case 'make_sound': return 'Making the sound';
    case 'workshop_run': return `Running the "${args.workflow || 'workshop'}" workflow`;
    case 'write_file': return `Saving ${base(args.path)}`;
    case 'edit_file': return `Changing ${base(args.path)}`;
    case 'save_spreadsheet': return `Saving the spreadsheet${args.name ? ` "${args.name}"` : ''}`;
    case 'file_hands': return FILE_JOBS[String(args.action || '').toLowerCase()] || 'The file job';
    case 'undo_files': return 'Undoing the file job';
    case 'sort_files': return 'Sorting and renaming';
    case 'convert_file': return `Converting ${[].concat(args.paths || []).length === 1 ? base([].concat(args.paths)[0]) : 'the files'}${args.to ? ` to ${String(args.to).toUpperCase()}` : ''}`;
    case 'office_make': return `Making the ${({ writer: 'document', calc: 'spreadsheet', impress: 'presentation' })[args.kind] || 'document'}`;
    case 'office_edit': return `Changing ${base(args.path)}`;
    case 'strip_metadata': return 'Making clean copies';
    case 'defender_scan': return args.kind === 'update' ? 'Updating Defender' : 'The Defender scan';
    case 'open_app': return `Opening ${args.name || 'the app'}`;
    case 'app_act': return `${args.action === 'type' ? 'Typing' : args.action === 'click' ? `Clicking${args.name ? ` "${args.name}"` : ''}` : args.action === 'keys' ? `Pressing ${args.keys || 'keys'}` : 'The step'} in ${args.window || 'the app'}`;
    case 'run_command': return `Running ${args.cmd || 'the command'}`;
    case 'run_recipe': return `Running the recipe${args.name ? ` "${args.name}"` : ''}`;
    case 'schedule_job': return 'Setting up the schedule';
    default: return name.replace(/_/g, ' ');
  }
}
function baseName(p) { return String(p || '').split(/[\\/]/).pop(); }
const cap = (s, n = 160) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
const ok = (a) => a && a.ok !== false && !a.declined;

// A reason the user can read: common technical ones in plain words, anything else technical becomes ''
// (the note then says "Ask Bob what went wrong").
const PLAIN_REASONS = [
  [/out of (?:graphics |video |GPU )?memory|\bOOM\b|CUDA error/i, 'the graphics card ran out of memory'],
  [/time(?:d)? ?out|didn'?t finish in time|ran too long|ran past the/i, 'it took too long and was stopped'],
  [/exit code -?[1-9]\d*/i, 'the program finished with an error'],
  [/ECONNREFUSED|ECONNRESET|fetch failed|socket hang up|not ready|still loading/i, 'the engine it needed wasn\'t ready'],
  [/ENOENT|isn'?t there|no such file|not found/i, 'a file it needed wasn\'t there'],
  [/EACCES|EPERM|access is denied|permission denied/i, 'Windows didn\'t allow it'],
  [/no new window appeared/i, 'no window appeared'],
  [/couldn'?t confirm|wasn'?t there|read it back/i, 'the app couldn\'t confirm it worked'],
  [/no (?:picture|clip|sound file|file) came out/i, 'nothing came out of it'],
  [/isn'?t what Bob wrote|isn'?t what was written/i, 'what got saved isn\'t what Bob wrote'],
  [/isn'?t a real|is empty|0 bytes|can'?t be read/i, 'the file came out broken']
];
const TECHNICAL = /\b(?:E[A-Z]{3,}|0x[0-9a-f]{4,}|errno|HRESULT|stack|undefined|null|NaN|\w+Error|exception|segfault|assert|traceback|at \w+\.\w+|\.(?:js|py|cpp|ps1):\d+)\b|[{}[\]<>]|\\\\/;
export function plainReason(why) {
  const s = String(why || '').trim();
  for (const [re, words] of PLAIN_REASONS) if (re.test(s)) return words;
  if (!s || TECHNICAL.test(s) || s.length > 140) return '';
  return s.replace(/[.\s]+$/, '');
}
// What a step did, said in the past ("saved notes.txt"), for the notes under an answer.
const pastStep = (a) => `${describe(a.name, a.args).replace(/^Making/, 'made').replace(/^Saving/, 'saved').replace(/^Opening/, 'opened').replace(/^Changing/, 'changed').replace(/^Running/, 'ran').replace(/^Typing/, 'typed').replace(/^Clicking/, 'clicked').replace(/^Pressing/, 'pressed').replace(/^Setting up/, 'set up').replace(/^Moving/, 'moved').replace(/^Copying/, 'copied').replace(/^Renaming/, 'renamed').replace(/^Zipping/, 'zipped').replace(/^Unzipping/, 'unzipped').replace(/^Tidying/, 'tidied').replace(/^Undoing/, 'undid')}${a.name in MEDIA && a.files?.length ? ` (${a.files.map(baseName).join(', ')})` : ''}`;
const failNote = (a) => {
  const r = plainReason(a.why || plainWhy(a.text));
  return r ? `${describe(a.name, a.args)} didn't work: ${r}.` : `${describe(a.name, a.args)} didn't work. Ask Bob what went wrong.`;
};

// One correction per reply, worded like the 1.5.4 / 1.5.11 ones.
const CLAIM_NOTE = {
  picture: 'Nothing was actually made in that reply. Bob said he made a picture, but no picture was made.',
  clip: 'Nothing was actually made in that reply. Bob said he made a clip, but no clip was made.',
  sound: 'Nothing was actually made in that reply. Bob said he made a sound, but no sound was made.',
  file: 'Nothing was actually saved in that reply. Bob said he saved a file, but no file was saved.',
  app: 'Nothing was actually done in that reply. Bob said he did it in the app, but no action ran.'
};
const MODEL_FOR = { picture: 'pictures', show: 'pictures', video: 'clips', music: 'music', sound: 'sounds' };
const MODEL_NAME = { picture: 'a picture model', show: 'a picture model', video: 'a video model', music: 'a music model', sound: 'a sound model' };
const HAND_OF = { app: 'apps' };
const cantNote = (kind) => {
  if (MODEL_FOR[kind]) return `Bob can't make ${MODEL_FOR[kind]} yet: he needs ${MODEL_NAME[kind]}. Get one in Get models.`;
  if (HAND_OF[kind]) return `Bob can't do that yet: the ${HANDS[HAND_OF[kind]].label} Hand is off. Turn it on in Settings, Hands.`;
  return 'Bob can\'t do that on this replicant matrix yet.';
};
const DIDNT = { todo: 'put it on the to-do list', reminder: 'set the reminder', diagram: 'draw the diagram', picture: 'make a picture', show: 'make a picture', video: 'make a clip', music: 'make the music', sound: 'make the sound', file: 'save the file', app: 'do it in the app' };

// When Bob stops. null: all good. { nudge, groups }: one hidden message to Bob and the tool groups he needs
// for it (the lead gives him one more go, once per turn). { note }: a line the app shows the user, in its own
// words; never an empty bubble, never a silent drop.
export function afterTurn(ctx = {}, replyText) {
  const L = ctx.ledger || {};
  const reply = String(replyText ?? L.reply ?? '');
  const said = reply.trim();
  const nudged = Number(L.nudged || 0) > 0;
  const who = ctx.cfg?.userName || 'the user';
  const outputs = (L.outputs || []).filter(Boolean);
  const actions = (L.actions || []).filter(Boolean);
  const usable = (n) => (typeof ctx.brain?.usable === 'function' ? ctx.brain.usable(n) : true);
  const made = (type) => outputs.some((o) => (o.type || typeOfFile(o.file)) === type);
  const nudges = []; const groups = new Set(); const notes = [];
  const push = (n, gs = []) => { nudges.push(n); gs.forEach((g) => groups.add(g)); };

  // Claims with nothing behind them (the app checks the PC, not his words). Worked out first: they decide
  // which note the user sees.
  const claims = [];
  const picClaim = PIC_CLAIM.test(reply) || PIC_CLAIM_FR_ES.test(plain(reply)); // item 182: in French and Spanish too
  const fileClaim = FILE_CLAIM.test(reply) || FILE_CLAIM_FR_ES.test(plain(reply));
  if (picClaim && !made('image') && !actions.some((a) => ok(a) && a.name in MEDIA && MEDIA[a.name] === 'image')) claims.push('picture');
  if (VID_CLAIM.test(reply) && !made('video') && !actions.some((a) => ok(a) && a.name === 'make_video')) claims.push('clip');
  if ((AUDIO_CLAIM.test(reply) || AUDIO_DONE.test(reply)) && !made('audio') && !actions.some((a) => ok(a) && (a.name === 'make_music' || a.name === 'make_sound'))) claims.push('sound');
  if (fileClaim && !actions.some((a) => ok(a) && FILE_TOOLS.has(a.name))) claims.push('file');
  if (!ctx.claimChecked && APP_CLAIM.test(reply) && !actions.some((a) => ok(a) && APP_TOOLS.has(a.name))) claims.push('app');
  const missing = [];
  for (const m of reply.matchAll(SAVED_AT)) { const p = m[1].replace(/[.,;:)]+$/, ''); if (/\.\w{1,8}$/.test(p) && !fs.existsSync(p)) missing.push(p); }
  // Only one correction per reply.
  const correction = claims.length ? CLAIM_NOTE[claims[0]]
    : SAVE_DENIAL.test(reply) ? 'That isn\'t right: every song and sound Bob makes is saved as a .wav file. Find it in Made by Bob, under Sounds.'
    : missing.length ? `There's no file at ${missing.map(baseName).join(', ')}, though Bob said he saved it there. Ask him to save it again.` : '';

  // 1. Actions that failed and weren't put right later in the turn (a retry, or another way).
  const failedLeft = actions.filter((a, i) => a.ok === false && isDoing(a.name) && !actions.slice(i + 1).some((b) => ok(b) && isDoing(b.name) && ((a.name in MEDIA) === (b.name in MEDIA))));
  // Item 185 (Nov 12): half-done is said as half-done. When some steps worked and some didn't (or a step did only
  // part of its job), and the answer doesn't say so, the note lists both.
  const doneSteps = actions.filter((a) => ok(a) && isDoing(a.name) && !a.info);
  const partly = actions.filter((a) => ok(a) && a.partly);
  if ((failedLeft.length && doneSteps.length) || partly.length) {
    if (!said || !admitsTrouble(said)) {
      const did = [...new Set(doneSteps.filter((a) => !a.partly).map((a) => pastStep(a)))].slice(0, 3);
      const not = [...new Set([...failedLeft.slice(-2).map((a) => failNote(a).replace(/\.$/, '')), ...partly.map((a) => `${describe(a.name, a.args)}: ${String(a.why || '').replace(/^\d+ done, some not: /, 'some not done: ')}`.replace(/[.\s]+$/, ''))])].slice(0, 3);
      notes.push(`Only part of this worked.${did.length ? ` Done: ${did.join('; ')}.` : ''} Not done: ${not.join('; ')}.`);
    } else for (const a of failedLeft.slice(-2)) notes.push(failNote(a));
  } else for (const a of failedLeft.slice(-2)) notes.push(failNote(a));
  // An app step the app couldn't confirm, with no look afterwards.
  const unconfirmed = actions.findLast((a) => a.name === 'app_act' && a.ok === false && /^Not sure it worked/.test(String(a.text || '')));
  if (unconfirmed && !actions.slice(actions.indexOf(unconfirmed) + 1).some((b) => b.name === 'app_look' && ok(b))) {
    push(`The last app step wasn't confirmed. Call app_look on "${parse(unconfirmed.args).window || 'that window'}" now to check, then tell ${who} what is really there.`, ['apps']);
  }

  // 2. What the user asked for, from their words.
  const ex = L.expect;
  if (ex && ex.kind) {
    const kind = ex.kind;
    const tool = TOOL_OF[kind];
    let met = false; let tried = false; let blocked = false;
    if (MEDIA_OF[kind]) {
      met = made(MEDIA_OF[kind]) || actions.some((a) => ok(a) && a.name in MEDIA && (a.files?.length || pathsIn(a.text).some((f) => typeOfFile(f) === MEDIA_OF[kind])));
      tried = actions.some((a) => a.name in MEDIA);
      blocked = actions.some((a) => a.name in MEDIA && (a.declined || /^Didn'?t paint\b(?! yet)/.test(String(a.text || ''))));
      // "Didn't paint yet... call make_image again with reference [...]": he's meant to go again.
      const again = actions.findLast((a) => a.name === 'make_image' && /^Didn'?t paint yet\b/.test(String(a.text || '')));
      if (!met && again && !actions.slice(actions.indexOf(again) + 1).some((b) => b.name === 'make_image')) push(`make_image told you what to do next: "${cap(String(again.text), 220)}" Do that now.`, ['pictures']);
    } else if (kind === 'file') {
      met = actions.some((a) => ok(a) && FILE_TOOLS.has(a.name)) || outputs.some((o) => o.type === 'file');
      tried = actions.some((a) => FILE_TOOLS.has(a.name));
    } else if (kind === 'diagram') {
      met = actions.some((a) => ok(a) && a.name === 'make_diagram') || outputs.some((o) => o.type === 'diagram');
      tried = actions.some((a) => a.name === 'make_diagram');
    } else if (kind === 'todo' || kind === 'reminder') {
      const name = TOOL_OF[kind];
      met = actions.some((a) => ok(a) && a.name === name && /^(?:add|write)$/.test(String(parse(a.args).action || '')));
      tried = actions.some((a) => a.name === name);
    } else if (kind === 'app') {
      met = actions.some((a) => ok(a) && APP_TOOLS.has(a.name));
      tried = actions.some((a) => APP_TOOLS.has(a.name) || a.name === 'app_look');
    }
    const asking = /\?\s*$/.test(said) && kind !== 'picture' && kind !== 'show'; // "Where should I save it?" is fine
    if (!met && !tried && !blocked && !asking) {
      if (!usable(tool)) {
        if (!said) notes.push(cantNote(kind));
      } else {
        const how = kind === 'todo' ? 'Call notice_board now with action add'
          : kind === 'reminder' ? 'Call reminders now with action add, the local time and what it is about'
          : kind === 'file' ? 'Call write_file now (save_spreadsheet for a table)'
          : kind === 'app' ? 'Call open_app now (then app_look and app_act), each shows a card to click'
          : `Call ${tool} now with a good prompt`;
        push(`${who} asked for ${WHAT[kind]} ("${ex.words}"), but nothing did it this turn. ${how}. Don't describe it instead of doing it.`, GROUPS_OF[kind]);
        // When he claimed it, the correction says so instead.
        if (nudged && !correction) notes.push(`Bob didn't ${DIDNT[kind]} you asked for. Ask again, or put it another way.`);
      }
    }
  }

  // 2b. Several things asked in one message (job-steps.js), and fewer tool steps ran: one more go, only when nothing
  // above already asks for one and the answer isn't a question back.
  if (!nudges.length && ctx.stepsAsked?.length && !/\?\s*$/.test(said)) { const n = stepsNudge(ctx.stepsAsked, actions, who); if (n) push(n); }

  // 2c. 1.5.223 (builder): for a bare "read notes.txt", a brain answered from an earlier refusal in the chat and never
  // opened the file. A file asked for by name must be read this turn before the answer counts.
  const named = fileAsked(ctx.turnText);
  if (!nudges.length && named && !/\?\s*$/.test(said) && usable('read_file')
    && !actions.some((a) => READS_FILE.has(a.name) && (ok(a) || String(JSON.stringify(a.args ?? '')).toLowerCase().includes(named.toLowerCase())))) {
    push(`${who} asked about the file ${named}, but nothing read it this turn. Call read_file now with path "${named}" and answer from what it says. What an earlier message in this chat said about it doesn't count.`, ['documents']);
  }

  // 3. The claims' nudge (the note was worked out above).
  if (claims.length) {
    const what = claims.map((c) => ({ picture: 'a picture', clip: 'a clip', sound: 'a sound', file: 'a saved file', app: 'an app step' })[c]);
    push(`You said you made or did ${what.join(' and ')}, but nothing did that this turn (the app checked). Never claim it. If it should be done, call the right tool now; if you can't, say plainly that it wasn't done and why.`, claims.some((c) => ['picture', 'clip', 'sound'].includes(c)) ? ['pictures'] : claims.includes('app') ? ['apps'] : ['documents']);
  }
  if (missing.length) push(`You said a file is saved at ${missing.join(', ')}, but there is no file there (the app checked). Save it for real with write_file, or say it wasn't saved.`, ['documents']);
  if (correction) notes.unshift(correction);

  // 4. Never an empty bubble.
  if (!said) {
    const done = actions.filter((a) => ok(a) && isDoing(a.name) && !a.info);
    // Something made is already in the chat as its own card: that's the answer, no note repeating it.
    if (outputs.length) return notes.length ? { note: [...new Set(notes)].slice(0, 3).join(' ') } : null;
    if (done.length) {
      const what = [...new Set(done.map((a) => pastStep(a)))];
      // Work really happened and the reply is only empty: say what was done, don't send him back for another go.
      return { note: [`Done: ${what.join('; ')}.`, ...notes].join(' ') };
    }
    if (!nudged && !nudges.length) push('Your last reply was empty. Do what was asked: call the right tool now, or answer in words.', ex?.kind ? GROUPS_OF[ex.kind] : []);
    if (nudged && !notes.length) notes.push('Bob didn\'t answer that one. Send it again, or put it another way.');
  }

  // strike: 'claim' when he said something ran that didn't (the quarantine thread counts these: noteStrike).
  const strike = correction ? { strike: 'claim' } : {};
  // A claim's correction shows at once, with the nudge (like the 1.5.4 PC-action correction); other notes wait.
  if (nudges.length && !nudged) return { nudge: nudges.join(' '), groups: [...groups], ...(correction ? { note: correction } : {}), ...strike };
  return notes.length ? { note: [...new Set(notes)].slice(0, 3).join(' '), ...strike } : null;
}

// Lab 2c, the lesson builder: turns the owner's own files into passages a teacher can make lessons from.
// Documents (plain text, Markdown, web pages here; Word, OpenDocument, RTF, e-books and PDFs through the Office Hand's
// reader) become passages of 300 to 600 words cut at paragraph breaks. Chat logs (Bob's own sessions, another
// assistant's export from ChatGPT, Claude or Open WebUI, or a "Name: line" transcript) become exchanges: what the person said and
// what was answered. Files are read in place and never copied; nothing here touches the network.
import fs from 'node:fs';
import path from 'node:path';
import { extOf, docKindOf, officeJob, findOffice, PICTURES, AUDIO, VIDEO } from './office.js';

export const TEXT_EXT = ['txt', 'md', 'markdown', 'html', 'htm'];
export const OFFICE_EXT = ['docx', 'doc', 'odt', 'rtf', 'epub', 'pdf'];
export const CHAT_EXT = ['json', 'jsonl'];
export const LATER = { sheets: ['xls', 'xlsx', 'xlsm', 'ods', 'csv', 'tsv'], code: ['js', 'mjs', 'ts', 'py', 'c', 'cpp', 'h', 'hpp', 'rs', 'kt', 'java', 'cs', 'go', 'sh', 'ps1', 'bat'], pictures: PICTURES, sound: [...AUDIO, ...VIDEO] };
export const MAX_FILES = 5000;
export const MAX_BYTES = 50 * 1024 * 1024; // one file bigger than this is skipped, not read
export const WORDS_MIN = 300, WORDS_MAX = 600, WORDS_LEAST = 40; // a passage under WORDS_LEAST words is too thin to learn from

const SKIP_DIRS = new Set(['node_modules', '.git', '.svn', '__pycache__', '$recycle.bin', 'system volume information', 'appdata', '.cache']);

// What a file is to the builder: 'text', 'office', 'chat', a LATER kind, or 'other'.
export function classify(file) {
  const ext = extOf(file);
  if (TEXT_EXT.includes(ext)) return 'text';
  if (OFFICE_EXT.includes(ext)) return 'office';
  if (CHAT_EXT.includes(ext)) return 'chat';
  for (const [k, exts] of Object.entries(LATER)) if (exts.includes(ext)) return k;
  return 'other';
}
export const KIND_WORDS = { text: 'text document', office: 'document', chat: 'chat log', sheets: 'spreadsheet (later)', code: 'code (later)', pictures: 'picture (later)', sound: 'sound or video (later)', other: 'other' };

// Every file under the picked files and folders, with its kind and size. Hidden and system folders are skipped.
export function listFiles(roots, { max = MAX_FILES, statFn = fs.statSync, readdir = fs.readdirSync } = {}) {
  const out = [], seen = new Set();
  let over = false;
  const add = (file) => {
    if (out.length >= max) { over = true; return; }
    const key = file.toLowerCase(); if (seen.has(key)) return; seen.add(key);
    let st; try { st = statFn(file); } catch { return; }
    if (!st.isFile()) return;
    out.push({ path: file, name: path.basename(file), kind: classify(file), bytes: st.size, mtime: st.mtimeMs });
  };
  const walk = (dir, depth) => {
    if (depth > 12 || out.length >= max) return;
    let ents = []; try { ents = readdir(dir, { withFileTypes: true }); } catch { return; }
    for (const e of ents) {
      if (e.name.startsWith('.') || e.name.startsWith('~$')) continue;
      const p = path.join(dir, e.name);
      if (e.isDirectory()) { if (!SKIP_DIRS.has(e.name.toLowerCase())) walk(p, depth + 1); }
      else if (e.isFile()) add(p);
    }
  };
  for (const r of [].concat(roots || [])) {
    let st; try { st = statFn(r); } catch { continue; }
    if (st.isDirectory()) walk(r, 0); else add(r);
  }
  return { files: out, over };
}

// The picked items ({ path, skill }) opened up: every file under each, carrying the skill of the item it came from
// (the longest matching item wins, so a file inside a folder you also added on its own keeps the file's skill).
export function expandItems(items, opts = {}) {
  const list = [].concat(items || []).filter((i) => i && i.path);
  const { files, over } = listFiles(list.map((i) => i.path), opts);
  const skillOf = (file) => list.filter((i) => file.toLowerCase().startsWith(String(i.path).toLowerCase())).sort((a, c) => String(c.path).length - String(a.path).length)[0]?.skill || 'My files';
  return { files: files.map((f) => ({ ...f, skill: skillOf(f.path) })), over };
}

// ---- passages ----
export const words = (s) => String(s || '').trim().split(/\s+/).filter(Boolean).length;
export function stripHtml(html) {
  return String(html || '').replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ').replace(/<br\s*\/?>|<\/(p|div|h\d|li|tr|section|article)>/gi, '\n\n').replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/[ \t]+/g, ' ').replace(/\n[ \t]+/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}
// Markdown that's only noise to a lesson: badges, link targets, HTML comments. The words stay.
export const stripMarkdown = (md) => String(md || '').replace(/<!--[\s\S]*?-->/g, '').replace(/!\[[^\]]*\]\([^)]*\)/g, '').replace(/\[([^\]]+)\]\([^)]*\)/g, '$1').replace(/^#{1,6}\s+/gm, '').replace(/[*_`]{1,3}/g, '').trim();

// Prose, as opposed to a log, a table or a dump of numbers: at least six of every ten tokens are plain words. The first PC
// run made "writing in my voice" lessons from a quantize log, so a passage that isn't prose only serves "working with my
// material" (Bob reading it), never as something the owner wrote.
const WORD_RE = /^[\p{L}'\u2019-]+[.,;:!?)"\u201d]*$|^[("\u201c]?[\p{L}'\u2019-]+$/u;
export function isProse(text) {
  const toks = String(text || '').trim().split(/\s+/).filter(Boolean);
  if (toks.length < 8) return false;
  const wordy = toks.filter((t) => WORD_RE.test(t)).length;
  return wordy / toks.length >= 0.6;
}

// Passages of WORDS_MIN to WORDS_MAX words, cut at paragraph breaks (then at sentences when one paragraph is too long).
// Each passage carries `prose` (see isProse).
export function chunk(text, { min = WORDS_MIN, max = WORDS_MAX, least = WORDS_LEAST } = {}) {
  const paras = String(text || '').replace(/\r\n/g, '\n').split(/\n\s*\n/).map((p) => p.replace(/\s+/g, ' ').trim()).filter(Boolean);
  const out = [];
  let cur = [], n = 0, at = 1, startAt = 1;
  const flush = () => { if (n >= least) out.push({ text: cur.join('\n\n'), at: startAt, words: n }); cur = []; n = 0; startAt = at; };
  for (const p of paras) {
    const w = words(p);
    if (w > max) { // one long paragraph: cut at sentences
      if (n) flush();
      const sents = p.match(/[^.!?]+[.!?]+["')\]]*\s*|[^.!?]+$/g) || [p];
      let piece = [], pn = 0;
      for (const s of sents) { const sw = words(s); if (pn + sw > max && pn >= least) { out.push({ text: piece.join('').trim(), at, words: pn }); piece = []; pn = 0; } piece.push(s); pn += sw; }
      if (pn >= least || (pn && !out.length)) out.push({ text: piece.join('').trim(), at, words: pn });
      at++; startAt = at; continue;
    }
    if (n + w > max && n >= min) flush();
    cur.push(p); n += w; at++;
    if (n >= min && n + w > max) flush();
  }
  if (n) { if (n >= least) flush(); else if (out.length) { const last = out[out.length - 1]; last.text += '\n\n' + cur.join('\n\n'); last.words += n; } else if (n >= 15) out.push({ text: cur.join('\n\n'), at: startAt, words: n }); }
  for (const o of out) o.prose = isProse(o.text);
  return out;
}

// ---- chat logs ----
// An exchange: what the person said and what came back, kept in order; `who` says where it came from.
const clean = (s) => String(s ?? '').replace(/\r\n/g, '\n').trim();
const textOf = (c) => typeof c === 'string' ? c : Array.isArray(c) ? c.map((x) => typeof x === 'string' ? x : x?.text || x?.content || '').join('\n') : c?.text || c?.content || '';
// Bob's own session file (an array of messages, or {messages}); tool turns are skipped, so only what was said stays.
export function parseBob(json) {
  const msgs = Array.isArray(json) ? json : Array.isArray(json?.messages) ? json.messages : null;
  if (!msgs || !msgs.some((m) => m && (m.role === 'user' || m.role === 'assistant'))) return null;
  return pairUp(msgs.filter((m) => m && (m.role === 'user' || m.role === 'assistant') && !m.tool_calls).map((m) => ({ role: m.role, text: clean(m.role === 'user' && m.text != null ? m.text : textOf(m.content)), up: m.rating === 'up' || m.thumbs === 'up' || m.good === true })), 'bob');
}
// Each export's conversations, one at a time: { title, at (ms), id, turns:[{role, text, at}] }. The lesson builder
// pairs the turns up; "Bring in chats" (chat-files.js) keeps each conversation as a chat of its own.
const ms = (t) => { if (t == null || t === '') return 0; if (typeof t === 'number') return t < 1e12 ? Math.round(t * 1000) : t; const d = Date.parse(t); return Number.isFinite(d) ? d : 0; };
// ChatGPT's export: conversations.json, each conversation a `mapping` tree of nodes with message.author.role and parts.
// The branch you last saw (current_node back to the top) when the export says which it was; otherwise every node by time.
export function chatGptTurns(c) {
  if (!c?.mapping) return [];
  let nodes = [];
  if (c.current_node && c.mapping[c.current_node]) {
    const seen = new Set();
    for (let id = c.current_node; id && c.mapping[id] && !seen.has(id); id = c.mapping[id].parent) { seen.add(id); nodes.unshift(c.mapping[id]); }
  } else nodes = Object.values(c.mapping).sort((a, b) => (a?.message?.create_time || 0) - (b?.message?.create_time || 0));
  return nodes.filter((n) => n?.message?.author?.role && n.message.content && !n.message.metadata?.is_visually_hidden_from_conversation)
    .map((n) => ({ role: n.message.author.role, at: ms(n.message.create_time), text: clean((n.message.content.parts || []).map((p) => typeof p === 'string' ? p : p?.text || '').join('\n') || n.message.content.text || '') }))
    .filter((t) => (t.role === 'user' || t.role === 'assistant') && t.text);
}
export function parseChatGpt(json) {
  const convs = Array.isArray(json) ? json : json?.mapping ? [json] : null;
  if (!convs || !convs.some((c) => c && c.mapping)) return null;
  return convs.flatMap((c) => pairUp(chatGptTurns(c), 'other'));
}
// Claude's export: conversations.json, each with chat_messages [{sender: human|assistant, text}].
export function claudeTurns(c) {
  if (!Array.isArray(c?.chat_messages)) return [];
  return c.chat_messages.map((m) => ({ role: m.sender === 'human' ? 'user' : m.sender === 'assistant' ? 'assistant' : '', at: ms(m.created_at), text: clean(m.text || textOf((m.content || []).filter?.((x) => !x?.type || x.type === 'text') ?? m.content)) })).filter((t) => t.role && t.text);
}
export function parseClaude(json) {
  const convs = Array.isArray(json) ? json : json?.chat_messages ? [json] : null;
  if (!convs || !convs.some((c) => c && Array.isArray(c.chat_messages))) return null;
  return convs.flatMap((c) => pairUp(claudeTurns(c), 'other'));
}
// Open WebUI's export (Export chats): a list of { title, chat: { messages, history: { messages, currentId } } }.
// The branch you last saw (currentId back to the top) when there is one; otherwise the messages list as it is.
const owChat = (c) => (c?.chat && typeof c.chat === 'object' ? c.chat : c);
const isOpenWebUi = (c) => { const x = owChat(c); return Boolean(x && (x.history?.messages || (c?.chat && Array.isArray(x.messages)))); };
export function openWebUiTurns(c) {
  const x = owChat(c);
  let list = [];
  const h = x?.history;
  if (h?.messages && h.currentId && h.messages[h.currentId]) {
    const seen = new Set();
    for (let id = h.currentId; id && h.messages[id] && !seen.has(id); id = h.messages[id].parentId) { seen.add(id); list.unshift(h.messages[id]); }
  } else if (Array.isArray(x?.messages)) list = x.messages;
  return list.map((m) => ({ role: m?.role, at: ms(m?.timestamp), text: clean(textOf(m?.content)) })).filter((t) => (t.role === 'user' || t.role === 'assistant') && t.text);
}
export function parseOpenWebUi(json) {
  const convs = Array.isArray(json) ? json : json && typeof json === 'object' ? [json] : null;
  if (!convs || !convs.some(isOpenWebUi)) return null;
  return convs.filter(isOpenWebUi).flatMap((c) => pairUp(openWebUiTurns(c), 'other'));
}
// Every conversation in a file, kept apart, with where it came from. null when it isn't a chat Bob knows.
export function conversationsOf(raw, file = '') {
  const fromJson = (j) => {
    const list = Array.isArray(j) ? j : [j];
    if (list.some((c) => c && c.mapping)) return list.filter((c) => c?.mapping).map((c) => ({ source: 'chatgpt', id: String(c.conversation_id || c.id || ''), title: String(c.title || ''), at: ms(c.create_time), turns: chatGptTurns(c) }));
    if (list.some((c) => c && Array.isArray(c.chat_messages))) return list.filter((c) => Array.isArray(c?.chat_messages)).map((c) => ({ source: 'claude', id: String(c.uuid || ''), title: String(c.name || ''), at: ms(c.created_at), turns: claudeTurns(c) }));
    if (j && !Array.isArray(j) && j.bob === 'chat' && Array.isArray(j.messages)) return [{ source: 'bob', id: String(j.id || ''), title: String(j.title || ''), at: ms(j.started), turns: bobTurns(j.messages) }];
    if (list.some(isOpenWebUi)) return list.filter(isOpenWebUi).map((c) => ({ source: 'openwebui', id: String(c.id || owChat(c).id || ''), title: String(c.title || owChat(c).title || ''), at: ms(c.created_at), turns: openWebUiTurns(c) }));
    const turns = bobTurns(Array.isArray(j) ? j : j?.messages);
    return turns.length ? [{ source: 'bob', id: '', title: String(j?.title || ''), at: 0, turns }] : [];
  };
  let out = [];
  if (/\.jsonl$/i.test(file)) {
    for (const line of String(raw).split(/\r?\n/)) { if (!line.trim()) continue; try { out.push(...fromJson(JSON.parse(line))); } catch {} }
  } else {
    let j = null; try { j = JSON.parse(String(raw).replace(/^\uFEFF/, '')); } catch {}
    if (j && typeof j === 'object') out = fromJson(j);
    else {
      const md = bobMarkdownTurns(raw);
      if (md) out = [md];
      else { const t = transcriptTurns(raw); if (t) out = [{ source: 'transcript', id: '', title: '', at: 0, turns: t }]; }
    }
  }
  out = out.filter((c) => c.turns.length);
  return out.length ? out : null;
}
// Bob's own session messages (or the "Save as JSON" file's): what was said, no tool turns.
export function bobTurns(msgs) {
  if (!Array.isArray(msgs)) return [];
  return msgs.filter((m) => m && (m.role === 'user' || m.role === 'assistant') && !m.tool_calls && !m.forgotten)
    .map((m) => ({ role: m.role, at: ms(m.at), text: clean(m.role === 'user' && m.text != null ? m.text : textOf(m.content)) })).filter((t) => t.text);
}
// A chat Bob saved as Markdown: "# Title", then "### You · date" and "### Bob · date" headings, each message under its own.
export function bobMarkdownTurns(raw) {
  const text = String(raw || '').replace(/\r\n/g, '\n');
  const re = /^### (You|Bob)(?: · (.+))?$/gm;
  const heads = [...text.matchAll(re)];
  if (heads.length < 2) return null;
  const title = (text.match(/^# (.+)$/m) || [])[1] || '';
  const turns = heads.map((h, i) => {
    const body = text.slice(h.index + h[0].length, i + 1 < heads.length ? heads[i + 1].index : text.length).replace(/\n---\s*$/, '');
    return { role: h[1] === 'You' ? 'user' : 'assistant', at: ms(h[2]), text: clean(body) };
  }).filter((t) => t.text);
  return turns.length ? { source: 'bob', id: '', title: title.trim(), at: 0, turns } : null;
}
// A plain transcript: most lines look like "Name: words". The first speaker is the person, the second the assistant.
export function parseTranscript(text) {
  const t = transcriptTurns(text);
  return t ? pairUp(t, 'other') : null;
}
function transcriptTurns(text) {
  const lines = String(text || '').replace(/\r\n/g, '\n').split('\n');
  const re = /^(?:\[[^\]]{1,40}\]\s*)?([A-Za-z][\w .'-]{0,30}):\s+(.*)$/;
  const tagged = lines.filter((l) => l.trim()).map((l) => l.match(re));
  if (!tagged.length || tagged.filter(Boolean).length < Math.max(4, tagged.length * 0.6)) return null;
  const names = [];
  const turns = [];
  for (const l of lines) {
    const m = l.match(re);
    if (m) { if (!names.includes(m[1])) names.push(m[1]); turns.push({ who: m[1], text: m[2].trim() }); }
    else if (turns.length && l.trim()) turns[turns.length - 1].text += '\n' + l.trim();
  }
  if (names.length < 2) return null;
  const [person, assistant] = names;
  return turns.filter((t) => t.who === person || t.who === assistant).map((t) => ({ role: t.who === person ? 'user' : 'assistant', text: clean(t.text) }));
}
// user, assistant, user, assistant ... into exchanges. A run of the same role is joined.
function pairUp(turns, who) {
  const out = [];
  let user = null;
  for (const t of turns) {
    if (!t.text) continue;
    if (t.role === 'user') { user = user ? { ...user, text: user.text + '\n' + t.text } : { ...t }; }
    else if (user) { out.push({ user: user.text, assistant: t.text, up: Boolean(t.up), who }); user = null; }
  }
  return out.filter((x) => words(x.user) >= 1 && words(x.assistant) >= 3);
}
export function parseChat(raw, file = '') {
  if (/\.jsonl$/i.test(file)) { // one chat per line, any of the shapes
    const out = [];
    for (const line of String(raw).split(/\r?\n/)) { if (!line.trim()) continue; let j; try { j = JSON.parse(line); } catch { continue; } const r = parseChatGpt(j) || parseClaude(j) || parseOpenWebUi(j) || parseBob(j); if (r) out.push(...r); }
    return out.length ? out : null;
  }
  let j = null; try { j = JSON.parse(raw); } catch {}
  if (j) return parseChatGpt(j) || parseClaude(j) || parseOpenWebUi(j) || parseBob(j);
  return parseTranscript(raw);
}

// ---- reading one file ----
// Returns { file, name, kind, passages:[{text, at, words}], exchanges:[{user, assistant, up, who}], skipped:'why' }.
export async function readFile(file, { cfg = null, office = undefined, signal, readText = (f) => fs.readFileSync(f, 'utf8') } = {}) {
  const base = { file, name: path.basename(file), kind: classify(file), passages: [], exchanges: [] };
  let st; try { st = fs.statSync(file); } catch { return { ...base, skipped: 'not found' }; }
  if (st.size > MAX_BYTES) return { ...base, skipped: 'too big (over 50 MB)' };
  if (base.kind === 'text') {
    let raw; try { raw = readText(file); } catch { return { ...base, skipped: 'could not be read' }; }
    const ext = extOf(file);
    if (ext === 'txt') { const ex = parseTranscript(raw); if (ex) return { ...base, kind: 'chat', exchanges: ex }; }
    const text = ext === 'html' || ext === 'htm' ? stripHtml(raw) : ext === 'txt' ? raw : stripMarkdown(raw);
    const passages = chunk(text);
    return passages.length ? { ...base, passages } : { ...base, skipped: 'too short (under 40 words)' };
  }
  if (base.kind === 'chat') {
    let raw; try { raw = readText(file); } catch { return { ...base, skipped: 'could not be read' }; }
    const ex = parseChat(raw, file);
    return ex?.length ? { ...base, exchanges: ex } : { ...base, kind: 'other', skipped: 'not a chat log Bob knows (ChatGPT, Claude or Open WebUI export, Bob session, or Name: lines)' }; // counted as other, not as a chat log
  }
  if (base.kind === 'office') {
    const off = office === undefined ? (cfg ? findOffice(cfg) : null) : office;
    if (!off) return { ...base, skipped: 'needs LibreOffice to read (Settings, Engines)' };
    try {
      const r = await officeJob(cfg, { op: 'read', src: file, max: 2_000_000 }, { signal, office: off });
      if (r.kind && r.kind !== 'writer') return { ...base, skipped: `a ${r.kind === 'calc' ? 'spreadsheet' : 'presentation'} (later)` };
      const passages = chunk(r.text || '');
      return passages.length ? { ...base, passages } : { ...base, skipped: r.text ? 'too short (under 40 words)' : 'no words in it (a scanned PDF needs OCR)' };
    } catch (e) { return { ...base, skipped: e.message.slice(0, 120) }; }
  }
  return { ...base, skipped: `${KIND_WORDS[base.kind] || 'this kind of file'} can't be used yet` };
}
export const docKind = docKindOf;

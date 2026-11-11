// Lesson library: every lesson set in the Lab is read once and broken into parts, by category (what a lesson
// teaches: coding, tools, maths...), by source (where it came from: a teacher, a Hugging Face set, the person's
// own files) and by thinking (lessons that show their thinking, and lessons that answer straight away). The Forge then lets the person tick parts on or off, and only the ticked lessons go to the card.
// Sets from elsewhere (a file on this replicant matrix, or a .jsonl/.json file on Hugging Face) are converted into
// the Lab's lesson shape when they're added, then broken up the same way. Nothing is uploaded from here.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { keyValue } from './secret-box.js';

export const PARTS_FILE = 'parts.json';
export const ADDED_FILE = 'added.json';
export const ADD_MAX_BYTES = 2 * 1024 ** 3; // a lesson file bigger than 2 GB isn't a lesson set we can read here
const JSON_MAX_BYTES = 400 * 1024 ** 2; // a single .json array has to be read whole; .jsonl is read line by line
export const ADD_MAX_LESSONS = 200000;

const hash = (s, n = 12) => crypto.createHash('sha256').update(String(s)).digest('hex').slice(0, n);
const clean = (s, max = 60) => String(s ?? '').replace(/[\r\n\t\0]+/g, ' ').trim().slice(0, max);
export const partId = (s) => clean(s, 60).toLowerCase().replace(/[^a-z0-9.]+/g, '-').replace(/^-+|-+$/g, '') || 'other';
const label = (s) => { const t = clean(s, 60).replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim(); return t ? t[0].toUpperCase() + t.slice(1) : 'Other'; };

// Read a text file line by line without holding it all in memory (lesson files can be hundreds of megabytes).
export function* lines(file) {
  const fd = fs.openSync(file, 'r');
  try {
    const buf = Buffer.alloc(1 << 20); let rest = '';
    for (;;) {
      const n = fs.readSync(fd, buf, 0, buf.length, null);
      if (!n) break;
      const parts = (rest + buf.toString('utf8', 0, n)).split('\n'); rest = parts.pop();
      for (const l of parts) yield l.replace(/\r$/, '');
    }
    if (rest) yield rest.replace(/\r$/, '');
  } finally { fs.closeSync(fd); }
}

// What a lesson teaches. A set's own label wins (category, domain, the lesson writer's job); otherwise a plain guess.
export function categoryOf(lesson = {}) {
  const own = lesson.category || lesson.domain || lesson.meta?.category || lesson.job;
  if (own && typeof own === 'string') return partId(String(own).replace(/^ext-/, ''));
  const msgs = Array.isArray(lesson.messages) ? lesson.messages : [];
  if (msgs.some((m) => Array.isArray(m?.tool_calls) && m.tool_calls.length)) return 'tools';
  const text = msgs.map((m) => (typeof m?.content === 'string' ? m.content : '')).join('\n');
  if (/```|\bdef |\bfunction\b|#include|\bclass \w+/.test(text)) return 'coding';
  if (/\\frac|\\sum|\bequation\b|\bsolve\b|\d+\s*[x×*/^]\s*\d+/i.test(text)) return 'maths';
  return 'chat';
}

// Where a lesson came from: its own source line (before any " | " detail), its teacher, or the set's own name.
export function sourceOf(lesson = {}, fallback = 'this set') {
  const own = lesson.source || lesson.teacher || lesson.teacher_model || lesson.meta?.source;
  const s = typeof own === 'string' ? own.split(' | ')[0] : '';
  return clean(s, 80) || clean(fallback, 80) || 'this set';
}

// Whether a lesson shows its thinking. A lesson with thinking teaches the brain to think first; one without teaches it
// to answer straight away, so a mix teaches both ways and the thinking switch picks one.
// A set that records how hard its teacher thought (low, high, max...) is split by that too.
export function thinkingOf(lesson = {}) {
  const on = (Array.isArray(lesson.messages) ? lesson.messages : []).some((m) => m?.role === 'assistant' && typeof m.reasoning === 'string' && m.reasoning.trim());
  if (!on) return 'off';
  const e = partId(lesson.effort || '');
  return e && e !== 'other' ? `on-${e.slice(0, 20)}` : 'on';
}
export const thinkingLabel = (t) => (t === 'off' ? 'Answers straight away' : t === 'on' ? 'Shows its thinking' : `Shows its thinking (${t.slice(3)} effort)`);

const stamp = (file) => { try { const s = fs.statSync(file); return { size: s.size, mtimeMs: Math.round(s.mtimeMs) }; } catch { return null; } };

// Break one set into parts. Writes parts.json beside lessons.jsonl and gives it back.
export function analyzeSet(dir, { fallbackSource } = {}) {
  const file = path.join(dir, 'lessons.jsonl');
  const st = stamp(file);
  if (!st) return null;
  const added = readJson(path.join(dir, ADDED_FILE));
  const fb = fallbackSource || added?.source || path.basename(dir);
  const categories = {}, sources = {}, thinking = {}, cells = {};
  let total = 0, bad = 0;
  for (const l of lines(file)) {
    if (!l.trim()) continue;
    let x; try { x = JSON.parse(l); } catch { bad++; continue; }
    const c = categoryOf(x), s = sourceOf(x, fb), sid = partId(s), t = thinkingOf(x), k = `${c}\t${sid}\t${t}`;
    (categories[c] ||= { label: label(c), count: 0 }).count++;
    (sources[sid] ||= { label: s, count: 0 }).count++;
    (thinking[t] ||= { label: thinkingLabel(t), count: 0 }).count++;
    cells[k] = (cells[k] || 0) + 1;
    total++;
  }
  const parts = { version: 2, ...st, total, bad, categories, sources, thinking, cells };
  try { fs.writeFileSync(path.join(dir, PARTS_FILE), JSON.stringify(parts)); } catch {}
  return parts;
}
function readJson(file) { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return null; } }

// The set's parts, read again only when lessons.jsonl has changed since the last look.
export function readParts(dir) {
  const p = readJson(path.join(dir, PARTS_FILE)), st = stamp(path.join(dir, 'lessons.jsonl'));
  return p && st && p.version === 2 && p.size === st.size && p.mtimeMs === st.mtimeMs ? p : null;
}
export const partsOf = (dir, opts) => readParts(dir) || analyzeSet(dir, opts);

// How many lessons are left once some categories, sources or ways of thinking are ticked off.
export function pickedCount(parts, { offCategories = [], offSources = [], offThinking = [] } = {}) {
  if (!parts) return 0;
  const oc = new Set(offCategories), os = new Set(offSources), ot = new Set(offThinking);
  let n = 0;
  for (const [k, v] of Object.entries(parts.cells || {})) { const [c, s, t] = k.split('\t'); if (!oc.has(c) && !os.has(s) && !ot.has(t)) n += v; }
  return n;
}

// Only the ticked lessons, written to picked-<hash>/ inside the set's folder (lessons.jsonl and toolsets.json, which the
// Forge uploads together). pathName teaches the picked part as its own thinking path: "Think: <name>" is added to the
// system line of every picked lesson that shows its thinking, like a switch path, so the brain thinks that way only when the tag asks.
// Nothing ticked off and no path: the whole folder goes, as before.
export const cleanPathName = (s) => clean(s, 40).replace(/[^\w .'-]/g, '').trim();
export function pickLessons(dir, { offCategories = [], offSources = [], offThinking = [], pathName = '' } = {}) {
  const oc = [...new Set(offCategories.map(partId))].sort(), os = [...new Set(offSources.map(partId))].sort(), ot = [...new Set(offThinking.map(partId))].sort();
  const tag = cleanPathName(pathName);
  const parts = partsOf(dir);
  if (!parts) return { dir: '', count: 0 };
  if (!oc.length && !os.length && !ot.length && !tag) return { dir: '', count: parts.total };
  const out = path.join(dir, `picked-${hash(`${parts.size}:${parts.mtimeMs}:${oc.join(',')}|${os.join(',')}|${ot.join(',')}|${tag}`)}`);
  const count = pickedCount(parts, { offCategories: oc, offSources: os, offThinking: ot });
  if (fs.existsSync(path.join(out, 'lessons.jsonl'))) return { dir: out, count };
  for (const old of fs.readdirSync(dir)) if (/^picked-[0-9a-f]{12}$/.test(old)) { try { fs.rmSync(path.join(dir, old), { recursive: true, force: true }); } catch {} } // one picked copy per set
  const fb = readJson(path.join(dir, ADDED_FILE))?.source || path.basename(dir);
  const sets = readJson(path.join(dir, 'toolsets.json')) || {};
  const ocs = new Set(oc), oss = new Set(os), ots = new Set(ot), kept = [], used = {};
  const tagged = (key, on) => { // a tagged copy of each toolset the picked thinking lessons use; one with no toolset gets one holding only the tag
    const k = on ? `${key || 'none'}~${partId(tag)}` : key;
    if (k && !used[k]) { const base = sets[key] || { system: '', tools: [] }; used[k] = on ? { ...base, system: base.system ? `${base.system}\n\nThink: ${tag}` : `Think: ${tag}` } : base; }
    return k;
  };
  for (const l of lines(path.join(dir, 'lessons.jsonl'))) {
    if (!l.trim()) continue;
    let x; try { x = JSON.parse(l); } catch { continue; }
    const t = thinkingOf(x);
    if (ocs.has(categoryOf(x)) || oss.has(partId(sourceOf(x, fb))) || ots.has(t)) continue;
    if (!tag || t === 'off') { for (const m of x.messages || []) if (m?.set) tagged(m.set, false); kept.push(l); continue; } // the path tag is only for lessons that show their thinking
    const first = (x.messages || []).find((m) => m?.role === 'assistant')?.set || '';
    const k = tagged(first, true);
    for (const m of x.messages || []) if (m?.role === 'assistant') m.set = k;
    kept.push(JSON.stringify(x));
  }
  fs.mkdirSync(out, { recursive: true });
  fs.writeFileSync(path.join(out, 'toolsets.json'), JSON.stringify(used));
  fs.writeFileSync(path.join(out, 'lessons.jsonl'), kept.length ? `${kept.join('\n')}\n` : '');
  return { dir: out, count: kept.length };
}

// ---- Adding a set from elsewhere ----

const ROLE = { human: 'user', user: 'user', gpt: 'assistant', assistant: 'assistant', model: 'assistant', bot: 'assistant', system: 'system', tool: 'tool', function: 'tool', function_response: 'tool', observation: 'tool', ipython: 'tool' };
const text = (c) => (typeof c === 'string' ? c : Array.isArray(c) ? c.map((p) => (typeof p === 'string' ? p : p?.type === 'text' || typeof p?.text === 'string' ? p.text || '' : '')).join('') : c == null ? '' : JSON.stringify(c));
const toolCalls = (calls) => (Array.isArray(calls) ? calls : []).map((c, i) => {
  const f = c?.function || c || {};
  const name = clean(f.name, 80); if (!name) return null;
  const args = typeof f.arguments === 'string' ? f.arguments : JSON.stringify(f.arguments ?? f.parameters ?? {});
  return { type: 'function', function: { name, arguments: args }, id: clean(c?.id, 80) || `call-${i}` };
}).filter(Boolean);

// One row from someone else's set -> { lesson, system, tools } in the Lab's shape, or null when it has no answer to learn.
// Shapes read: chat messages (OpenAI or ShareGPT, with tool calls and thinking), instruction and output,
// prompt and response, question and answer; a row holding its real row as a JSON string (row_json) is opened first.
export function convertRow(row) {
  if (!row || typeof row !== 'object') return null;
  if (typeof row.row_json === 'string') { try { const inner = JSON.parse(row.row_json); return convertRow({ ...inner, source: inner.source || row.first_source_dataset }); } catch { return null; } }
  let system = '', msgs = [];
  const list = row.messages || row.conversations || row.conversation;
  if (Array.isArray(list)) {
    for (const m of list) {
      const role = ROLE[String(m?.role || m?.from || '').toLowerCase()];
      if (!role) continue;
      let content = text(m.content ?? m.value);
      if (role === 'system') { system = system ? `${system}\n\n${content}` : content; continue; }
      const out = { role, content };
      if (role === 'assistant') {
        let reasoning = text(m.reasoning_content ?? m.reasoning ?? m.thinking ?? '');
        const t = content.match(/^\s*<think>([\s\S]*?)<\/think>\s*/);
        if (t) { reasoning = reasoning || t[1].trim(); content = content.slice(t[0].length); out.content = content; }
        if (reasoning) out.reasoning = reasoning;
        const calls = toolCalls(m.tool_calls); if (calls.length) out.tool_calls = calls;
      }
      if (role === 'tool') { if (m.tool_call_id) out.tool_call_id = clean(m.tool_call_id, 80); if (m.name) out.name = clean(m.name, 80); }
      msgs.push(out);
    }
  } else {
    const ask = row.instruction != null ? [text(row.instruction), text(row.input)].filter(Boolean).join('\n\n') : text(row.prompt ?? row.question ?? row.query ?? '');
    const answer = text(row.output ?? row.response ?? row.completion ?? row.answer ?? (typeof row.chosen === 'string' ? row.chosen : ''));
    if (ask && answer) msgs = [{ role: 'user', content: ask }, { role: 'assistant', content: answer }];
    if (row.system) system = text(row.system);
  }
  if (!msgs.some((m) => m.role === 'assistant' && (m.content.trim() || m.tool_calls))) return null;
  if (!msgs.some((m) => m.role === 'user')) return null;
  let tools = row.tools;
  if (typeof tools === 'string') { try { tools = JSON.parse(tools); } catch { tools = []; } }
  if (!Array.isArray(tools)) tools = [];
  const lesson = { messages: msgs, think: msgs.some((m) => m.reasoning) };
  const cat = row.category || row.domain || row.task_category || row.job;
  if (typeof cat === 'string' && cat.trim()) lesson.category = clean(cat, 60);
  const effort = row.reasoning_effort || row.effort || row.meta?.reasoning_effort;
  if (typeof effort === 'string' && effort.trim()) lesson.effort = clean(effort, 20);
  const src = row.source || row.teacher_model || row.teacher || row.model;
  if (typeof src === 'string' && src.trim()) lesson.source = clean(src, 120);
  return { lesson, system, tools };
}

function* rowsOf(file) {
  if (/\.json$/i.test(file)) {
    if (fs.statSync(file).size > JSON_MAX_BYTES) throw new Error('That .json file is too big to read in one go. Save it as .jsonl (one lesson a line) and add that.');
    const all = JSON.parse(fs.readFileSync(file, 'utf8').replace(/^﻿/, ''));
    const list = Array.isArray(all) ? all : Array.isArray(all?.data) ? all.data : Array.isArray(all?.rows) ? all.rows.map((r) => r.row || r) : [all];
    yield* list; return;
  }
  for (const l of lines(file)) { if (!l.trim()) continue; try { yield JSON.parse(l.replace(/^﻿/, '')); } catch { yield null; } }
}

// Convert a file into a new set folder: lessons.jsonl, toolsets.json, added.json, then parts.json.
// Rows that are an earlier step of a longer conversation in the same file are dropped (the longer one teaches every step).
export function addLessonSet({ root, from, name, source, license = '', link = '', now = Date.now() }) {
  if (!from || !fs.existsSync(from)) throw new Error('That lesson file isn\'t there.');
  if (!/\.(jsonl|json)$/i.test(from)) throw new Error('The Lab reads .jsonl and .json lesson files. Save a .parquet or .csv set as .jsonl first.');
  if (fs.statSync(from).size > ADD_MAX_BYTES) throw new Error('That lesson file is bigger than 2 GB.');
  const nm = clean(name, 60) || clean(path.basename(from).replace(/\.[^.]+$/, ''), 60) || 'Added lessons';
  let slug = `added-${partId(nm).slice(0, 40)}`;
  for (let i = 2; fs.existsSync(path.join(root, slug)); i++) slug = `added-${partId(nm).slice(0, 36)}-${i}`;
  const src = clean(source, 120) || nm;
  const sets = {}, best = new Map();
  let rows = 0, skipped = 0;
  for (const row of rowsOf(from)) {
    if (++rows > ADD_MAX_LESSONS * 4) break;
    const c = convertRow(row);
    if (!c) { skipped++; continue; }
    const key = `${slug}-${hash(`${c.system}\0${JSON.stringify(c.tools)}`, 10)}`;
    sets[key] ||= { system: c.system, tools: c.tools };
    for (const m of c.lesson.messages) if (m.role === 'assistant') m.set = key;
    const firstUser = c.lesson.messages.find((m) => m.role === 'user')?.content || '';
    const firstAnswer = c.lesson.messages.find((m) => m.role === 'assistant');
    const k = hash(`${key}\0${firstUser}\0${firstAnswer?.content || ''}\0${JSON.stringify(firstAnswer?.tool_calls || [])}`, 16);
    const prev = best.get(k);
    if (!prev || c.lesson.messages.length > prev.messages.length) { if (prev) skipped++; best.set(k, c.lesson); } else skipped++;
    if (best.size >= ADD_MAX_LESSONS) break;
  }
  if (!best.size) throw new Error('No lessons in that file could be read: it needs a question and an answer in each row (chat messages, instruction and output, prompt and response, or question and answer).');
  const dir = path.join(root, slug);
  fs.mkdirSync(dir, { recursive: true });
  let i = 0; const out = [];
  for (const l of best.values()) out.push(JSON.stringify({ idea: `${slug}-${i++}`, ...(l.category ? { category: l.category } : {}), ...(l.effort ? { effort: l.effort } : {}), source: l.source || src, think: l.think, messages: l.messages }));
  fs.writeFileSync(path.join(dir, 'lessons.jsonl'), `${out.join('\n')}\n`);
  fs.writeFileSync(path.join(dir, 'toolsets.json'), JSON.stringify(sets));
  const lic = clean(license, 60);
  fs.writeFileSync(path.join(dir, ADDED_FILE), JSON.stringify({ name: nm, source: src, license: lic, link: clean(link, 400), at: new Date(now).toISOString(), count: best.size, skipped, privateOnly: !lic }, null, 1));
  const parts = analyzeSet(dir, { fallbackSource: src });
  return { id: slug, dir, name: nm, count: best.size, skipped, parts };
}

// A Hugging Face lesson file (.jsonl or .json) downloaded to a temporary file for addLessonSet. fetchFn and token
// are injected by tests; the token goes only to huggingface.co and is never shown or saved.
export async function downloadHfLessons({ repo, file, revision = '', to, fetchFn = fetch, token = keyValue('HF_TOKEN'), maxBytes = ADD_MAX_BYTES }) {
  if (!/\.(jsonl|json)$/i.test(file || '')) throw new Error('Name one .jsonl or .json file in the set, like owner/name:data/train.jsonl. Sets kept only as .parquet can be named in a Forge plan instead; they\'re brought in when the run starts.');
  const url = `https://huggingface.co/datasets/${repo}/resolve/${encodeURIComponent(revision || 'main')}/${file.split('/').map(encodeURIComponent).join('/')}`;
  const res = await fetchFn(url, { headers: token ? { authorization: `Bearer ${token}` } : {}, redirect: 'follow' });
  if (!res.ok) throw new Error(res.status === 401 || res.status === 403 ? 'That set is private or gated. Accept its terms on Hugging Face, and put your HF_TOKEN in Bob\'s environment.' : res.status === 404 ? 'That file isn\'t in the set. Check its name on the set\'s Files page.' : `Hugging Face said ${res.status}.`);
  fs.mkdirSync(path.dirname(to), { recursive: true });
  const fd = fs.openSync(to, 'w'); let got = 0;
  try {
    for await (const chunk of res.body) {
      got += chunk.length;
      if (got > maxBytes) throw new Error('That lesson file is bigger than 2 GB.');
      fs.writeSync(fd, chunk);
    }
  } finally { fs.closeSync(fd); }
  return { file: to, bytes: got };
}

// Scenes (16 Nov 2026; the owner: "make the synthetic environment more robust, it was supposed to have files for every
// job it could do and ask for"). Before a job runs, the served brain (not Claude) writes the state the request takes for
// granted: the files it names with real contents (a broken script stays broken, a messy log stays messy), the folders
// it saves or moves things to, the notice board lists it changes, and the facts Bob already remembers. The scene is
// checked, planted in the job's throwaway folder (bob-kit, world on: C:\Temp or /home/user/... are mirrored there),
// and saved, so a later run can reuse the same scene and two brains get the very same start.
// A scene never holds the job's answer: Opus reads every run, and a scene that gave the answer away is a reason to drop it.
import fs from 'node:fs';
import path from 'node:path';
import { sceneBytes } from './scene-files.mjs';

export const SCENE_LIMITS = { files: 12, content: 12000, folders: 10, lists: 8, items: 20, memory: 20 };

export const SCENE_SYSTEM = `You set up a test computer for one request to Bob, a home assistant who works with the user's files, a notice board (to-do lists) and a memory of facts about the user. Write what the request takes for granted already exists, so Bob can really do the job. Do NOT do the job: no answers, no fixed code, no finished summaries. If the request says a file is broken, messy, wrong or missing something, make it broken, messy or wrong in exactly that way.

Use the exact paths and names the request gives. The user's home is C:\\Users\\you (Documents, Desktop, Downloads, Pictures, Music, Videos); a file named without a folder goes in C:\\Users\\you\\Documents. Other folders the request names (C:\\Temp, D:\\Photos, /home/user/projects) are fine as they are. Contents must be realistic and complete enough for the job: real-looking code, data rows, log lines, notes. Use made-up names and placeholders such as EXAMPLE-KEY, never real people's details, real passwords or real keys. Add nothing the request doesn't need; most requests need one to three small files. A request that only needs the web or a plain answer gets an empty scene.

Answer with JSON only, in this shape:
{"files":[{"path":"C:\\\\Users\\\\you\\\\Documents\\\\notes.txt","content":"..."}],"folders":["C:\\\\Archive"],"board":[{"list":"Side quests","items":["..."]}],"memory":["..."]}
- files: each file with its whole content. Pictures (.png .jpg) and office files (.docx .xlsx .pdf) work too: give "content" as the text (CSV lines for .xlsx) and "meta" with the hidden details the request is about, such as {"Author":"Sam Lee","GPS":"51.50,-0.12","Make":"Pixel","Model":"Pixel 8","DateTaken":"2024-05-01 10:00:00"}. A .zip gives "inside":[{"path":"a.txt","content":"..."}]. No sound, video or program files.
- folders: folders that must already exist, even empty (where the request saves, moves or sorts things).
- board: the notice board lists the request talks about, with a few realistic items each, including any item it says to change, tick off or remove.
- memory: facts Bob already remembers that the request talks about, one short sentence each.`;

export const sceneAsk = (text, { today = '' } = {}) => [
  { role: 'system', content: SCENE_SYSTEM },
  { role: 'user', content: `${today ? `Today is ${today}.\n` : ''}Request: ${String(text || '').slice(0, 4000)}` }
];

const str = (v, max) => (typeof v === 'string' ? v : v == null ? '' : String(v)).slice(0, max);
const badPath = (p) => !p || p.length > 260 || /[\0\r\n<>|"?*]/.test(p.replace(/^[A-Za-z]:/, '')) || /(^|[\\/])\.\.([\\/]|$)/.test(p);

// The brain's answer -> a checked scene. Never throws: what was wrong is listed in problems and left out.
export function parseScene(text) {
  const problems = [];
  let raw = String(text ?? '').trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '');
  const a = raw.indexOf('{'), b = raw.lastIndexOf('}');
  let v = null;
  try { v = JSON.parse(a >= 0 && b > a ? raw.slice(a, b + 1) : raw); } catch (e) { problems.push(`not JSON (${String(e.message).slice(0, 80)})`); }
  const scene = { files: [], folders: [], board: [], memory: [] };
  if (!v || typeof v !== 'object' || Array.isArray(v)) { if (v) problems.push('not a JSON object'); return { scene, problems, ok: false }; }
  const cleanMeta = (m) => (m && typeof m === 'object' && !Array.isArray(m) ? Object.fromEntries(Object.entries(m).slice(0, 12).map(([k, x]) => [str(k, 40), str(x, 300)]).filter(([k, x]) => k && x)) : undefined);
  for (const f of [].concat(v.files || [])) {
    if (!f || typeof f !== 'object') continue;
    const p = str(f.path, 300).trim();
    if (badPath(p)) { problems.push(`file path left out: ${p.slice(0, 80) || '(none)'}`); continue; }
    if (scene.files.length >= SCENE_LIMITS.files) { problems.push(`more than ${SCENE_LIMITS.files} files: ${p} left out`); continue; }
    const content = str(f.content, SCENE_LIMITS.content + 1);
    if (content.length > SCENE_LIMITS.content) problems.push(`${p} cut to ${SCENE_LIMITS.content} characters`);
    const meta = cleanMeta(f.meta);
    const inside = Array.isArray(f.inside) ? f.inside.filter((x) => x && typeof x.path === 'string' && !badPath(x.path)).slice(0, 30).map((x) => ({ path: str(x.path, 200), content: str(x.content, 4000), ...(cleanMeta(x.meta) ? { meta: cleanMeta(x.meta) } : {}) })) : undefined;
    scene.files.push({ path: p, content: content.slice(0, SCENE_LIMITS.content), ...(meta && Object.keys(meta).length ? { meta } : {}), ...(inside?.length ? { inside } : {}) });
  }
  for (const d of [].concat(v.folders || [])) { const p = str(d, 300).trim(); if (badPath(p)) { if (p) problems.push(`folder left out: ${p.slice(0, 80)}`); continue; } if (scene.folders.length < SCENE_LIMITS.folders && !scene.folders.includes(p)) scene.folders.push(p); }
  for (const l of [].concat(v.board || [])) {
    const list = typeof l === 'string' ? { list: 'Side quests', items: [l] } : l && typeof l === 'object' ? { list: str(l.list || l.title || l.name || 'Side quests', 80).replace(/^#+\s*/, '').trim() || 'Side quests', items: [].concat(l.items || []) } : null;
    if (!list) continue;
    const items = list.items.map((x) => str(typeof x === 'object' && x ? x.text || x.item : x, 200).replace(/\s+/g, ' ').trim()).filter(Boolean).slice(0, SCENE_LIMITS.items);
    const had = scene.board.find((x) => x.list.toLowerCase() === list.list.toLowerCase());
    if (had) had.items.push(...items.filter((x) => !had.items.includes(x))); else if (scene.board.length < SCENE_LIMITS.lists && items.length) scene.board.push({ list: list.list, items });
  }
  for (const m of [].concat(v.memory || [])) { const t = str(m, 300).replace(/\s+/g, ' ').trim().replace(/^-\s*/, ''); if (t && scene.memory.length < SCENE_LIMITS.memory) scene.memory.push(t); }
  return { scene, problems, ok: true };
}

// Asks the served brain for a scene. chat(messages) -> the reply's text. One more try when the reply isn't JSON.
export async function makeScene(text, chat, { today = '' } = {}) {
  const msgs = sceneAsk(text, { today });
  let reply = await chat(msgs);
  let got = parseScene(reply);
  if (!got.ok) {
    reply = await chat([...msgs, { role: 'assistant', content: String(reply || '').slice(0, 2000) }, { role: 'user', content: 'That was not valid JSON. Answer again with the JSON object only.' }]);
    got = parseScene(reply);
  }
  return got;
}

// Puts a scene in a kit's throwaway folder (bob-kit loadBob with world on, for paths outside the home). Returns what
// was planted (paths as the brain sees them) and what was skipped, and why.
const HOME_DIRS = /^(Documents|Desktop|Downloads|Pictures|Music|Videos)([\\/]|$)/i;
export function fullPath(p) {
  const s = String(p || '').trim();
  if (/^([A-Za-z]:|[\\/]|~)/.test(s)) return s;
  const rel = s.replace(/\//g, '\\');
  return HOME_DIRS.test(rel) ? `C:\\Users\\you\\${rel}` : `C:\\Users\\you\\Documents\\${rel}`;
}
// The kinds of file Bob only edits inside a project (tools.js BLOCKED_EXT): a scene that plants one is a coding job.
const CODE = /\.(?:bat|cmd|ps1|psm1|vbs|js|mjs|cjs|jse|wsf|hta|sh|bash|zsh|py|pyw|command)$/i;
export function plantScene(kit, scene, { day = new Date().toISOString().slice(0, 10) } = {}) {
  const out = { files: [], folders: [], board: 0, memory: 0, skipped: [], codeDirs: [] };
  if (!scene) return out;
  const own = path.resolve(kit.cfg.agentDir).toLowerCase();
  const ownFolder = (r) => r.toLowerCase() === own || r.toLowerCase().startsWith(own + path.sep);
  const inWorld = (r) => kit.worldDir && r.toLowerCase().startsWith(path.resolve(kit.worldDir).toLowerCase() + path.sep);
  const open = (r) => (inWorld(r) ? kit.allow(r) : (fs.mkdirSync(r, { recursive: true }), r));
  for (const d of scene.folders || []) {
    const r = kit.place(fullPath(d));
    if (!r || ownFolder(r)) { out.skipped.push({ path: d, why: 'outside the test folders' }); continue; }
    open(r); out.folders.push(kit.neutral(r));
  }
  for (const f of scene.files || []) {
    const r = kit.place(fullPath(f.path));
    if (!r || ownFolder(r)) { out.skipped.push({ path: f.path, why: r ? "inside Bob's own folder" : 'outside the test folders' }); continue; }
    const bytes = sceneBytes({ ...f, path: r });
    if (!bytes) { out.skipped.push({ path: f.path, why: `this test home can't make ${path.extname(r) || 'that kind of'} files` }); continue; }
    open(path.dirname(r));
    fs.writeFileSync(r, bytes); out.files.push(kit.neutral(r));
    if (CODE.test(r) && !out.codeDirs.includes(path.dirname(r))) out.codeDirs.push(path.dirname(r));
  }
  if (scene.board?.length) {
    const lists = [...scene.board].sort((a, b) => (/^side quests$/i.test(b.list) ? 1 : 0) - (/^side quests$/i.test(a.list) ? 1 : 0));
    const md = `# Notice board, ${day}\n\n` + lists.map((l) => `## ${l.list}\n${l.items.map((i) => (/^\[x\]\s*/i.test(i) ? `- [x] ${i.replace(/^\[x\]\s*/i, '')}` : `- [ ] ${i.replace(/^\[ \]\s*/, '')}`)).join('\n')}\n`).join('\n');
    fs.mkdirSync(path.dirname(kit.cfg.noticeBoard), { recursive: true }); fs.writeFileSync(kit.cfg.noticeBoard, md);
    out.board = lists.reduce((n, l) => n + l.items.length, 0);
  }
  if (scene.memory?.length) {
    let before = ''; try { before = fs.readFileSync(kit.cfg.memoryFile, 'utf8'); } catch {}
    fs.mkdirSync(path.dirname(kit.cfg.memoryFile), { recursive: true });
    fs.writeFileSync(kit.cfg.memoryFile, before + scene.memory.map((m) => `- ${m} (${day})\n`).join(''));
    out.memory = scene.memory.length;
  }
  return out;
}

// scenes.jsonl: one row per job ({ id, text, scene, problems, by, at }); the newest row for a job and its exact request wins.
const norm = (t) => String(t || '').toLowerCase().replace(/\s+/g, ' ').trim();
export function sceneCache(file) {
  const rows = new Map();
  for (const f of [].concat(file || []).filter(Boolean)) {
    if (!fs.existsSync(f)) continue;
    for (const l of fs.readFileSync(f, 'utf8').replace(/\r\n/g, '\n').split('\n')) { if (!l.trim()) continue; try { const r = JSON.parse(l); if (r?.id && r.scene) rows.set(`${r.id}\n${norm(r.text)}`, r); } catch {} }
  }
  return {
    size: () => rows.size,
    get: (id, text) => rows.get(`${id}\n${norm(text)}`) || null,
    put(row, to) { rows.set(`${row.id}\n${norm(row.text)}`, row); if (to) { fs.mkdirSync(path.dirname(to), { recursive: true }); fs.appendFileSync(to, JSON.stringify(row) + '\n'); } }
  };
}

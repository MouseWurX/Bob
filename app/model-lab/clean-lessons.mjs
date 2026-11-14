// Make a new, cleaner version of Bob's lesson sets. The old version is only read, never changed.
// The owner, 13 Nov: "as a new version, yes" (after the lesson noise audit).
//
// node clean-lessons.mjs --from <folder of lesson sets (v3)> --out <new empty folder (v4)> [--review reviews/lessons-v4.json]
//      [--distill "kimi"] [--skip "glm51"] [--light "chat,languages,formats"] [--light-weight 0.5] [--exclude-ids <calib-ids.json>]
// Which files: a set split into lessons-part*.jsonl is read from its parts (a lessons.jsonl beside them is an old sample);
// otherwise lessons.jsonl alone (lessons-full.jsonl and other copies beside it are left out); --files "a*.jsonl,b.jsonl" says
// otherwise. Each file is written back under its own name, so a held-out file stays its own file.
// --sets "a,b" picks named sets out of --from. Copies of the SAME lesson (same idea, e.g. a mix's --repeat) are kept: only
// different lessons with the same first prompt count as repeats (a mix's copies named idea-r0, idea-r1 ... or with copy_of
// count as the same lesson). Held-out lessons (by id, "holdout": true, or a file named
// *heldout* / *holdout*) are never dropped, so the test stays the same; problems in them are only reported.
// --distill "" cleans other models' sets as sets of their own (for a distillation set); --skip leaves folders out.
//
// For each lesson set (a folder with lessons.jsonl and toolsets*.json):
//   - a lesson that calls a tool its own tool list does not offer is dropped (it teaches made-up tools);
//   - repeated first prompts (same thinking mode) keep one copy (the held-out copy when there is one, so the test stays the same);
//   - lessons the hand review calls wrong move to rejected.jsonl with the reason, the wrong side for preference training;
//   - folders whose name holds a --distill word (other models' answers) move to <out>/distill/, out of Bob's set.
// Also writes flagged.jsonl: lessons to read by hand (a refusal in a fiction ask, or "I can't" with a matching tool offered and
// none called); entries judged wrong go in the --review file and the tool is run again into a fresh folder.
// Also writes targets-train.json (light jobs at --light-weight, for training the full brain), targets-heal.json (all at 1),
// CHANGES.md and clean-info.json (every lesson dropped or moved, by folder and idea).
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { opts, readJsonl, notForTraining } from './common.mjs';

const o = opts({ distill: 'kimi', light: 'chat,languages,formats', 'light-weight': 0.5 });
if (!o.from || !o.out) { console.error('--from <lesson sets> --out <new folder> are needed'); process.exit(1); }
const from = path.resolve(String(o.from)), out = path.resolve(String(o.out));
if (fs.existsSync(out) && fs.readdirSync(out).length) { console.error(`${out} is not empty: pick a new folder for the new version`); process.exit(1); }
const isHoldout = (id) => parseInt(crypto.createHash('md5').update(String(id)).digest('hex').slice(0, 8), 16) / 0xFFFFFFFF < 0.05;
const review = o.review ? JSON.parse(fs.readFileSync(String(o.review), 'utf8')) : { wrong: [] };
const wrong = new Map((review.wrong || []).map((w) => [`${w.folder}/${w.idea}`, w.why]));
const skipWords = String(o.skip || '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
const distillWords = String(o.distill).split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
const lightJobs = String(o.light).split(',').map((s) => s.trim()).filter(Boolean);
const REFUSE = /\b(I can(not|'t)|I'm (not able|unable)|I won't|I am (not able|unable)|as an AI)\b/i;
const FICTION = /\b(story|novel|scene|character|fiction|role-?play|screenplay|poem|plot|villain|campaign|chapter)\b/i;
const CAN = [[/(look up|search|brows|access (the )?(internet|web)|real-time|live (data|information)|current (information|data))/i, /web_search|fetch_page|search/],
  [/(set|create|schedule) (a |an )?(reminder|alarm|recurring)/i, /remind|schedule|alarm|timer/], [/(read|open|access|see) (your |the )?(file|folder|document|disk|drive)/i, /read_file|list_files|list_folder/]];
const flagged = [];
const pick = (dir) => {
  const all = fs.readdirSync(dir);
  if (o.files) { const res = String(o.files).split(',').map((g) => new RegExp('^' + g.trim().replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.') + '$')); return all.filter((x) => x.endsWith('.jsonl') && res.some((r) => r.test(x))).sort(); }
  const parts = all.filter((x) => /^lessons-part.*\.jsonl$/.test(x)).sort();
  if (parts.length) return parts;
  return all.includes('lessons.jsonl') ? ['lessons.jsonl'] : all.filter((x) => /^lessons.*\.jsonl$/.test(x)).sort();
};
const baseIdea = (l) => String(l.copy_of ?? l.idea).replace(/-r\d+$/, ''); // a mix's copies: idea-r0, idea-r1, ... or copy_of
const heldFile = (x) => /held-?out|hold-?out/i.test(x);
const isHeld = (l, file) => heldFile(file) || l.holdout === true || isHoldout(l.idea);
const norm = (s) => String(s || '').toLowerCase().replace(/\W+/g, ' ').trim().slice(0, 200);

const single = pick(from).length > 0; // --from may be one set itself
const setDir = (f) => (single ? from : path.join(from, f));
const wanted = o.sets ? String(o.sets).split(',').map((s) => s.trim()).filter(Boolean) : null;
const folders = single ? [path.basename(from)] : fs.readdirSync(from, { withFileTypes: true }).filter((d) => d.isDirectory() && (!wanted || wanted.includes(d.name)) && pick(path.join(from, d.name)).length).map((d) => d.name).sort();
if (wanted) for (const w of wanted) if (!folders.includes(w)) { console.error(`--sets: ${w} is not a lesson set in ${from}`); process.exit(1); }
for (const f of folders) { const d = path.resolve(setDir(f)); if (out === d || out.startsWith(d + path.sep) || d.startsWith(out + path.sep)) { console.error(`--out must be outside the lesson sets (${f}): the old version is never changed`); process.exit(1); } }
if (single && out.startsWith(from + path.sep)) { console.error('--out must be outside --from: the old version is never changed'); process.exit(1); }
const info = { made: new Date().toISOString(), from: path.basename(from), review: o.review ? path.basename(String(o.review)) : null, folders: {}, dropped: [], moved_wrong: [], distill: [], jobs: {} };
const excluded = new Map(Object.entries(o['exclude-ids'] ? JSON.parse(fs.readFileSync(String(o['exclude-ids']), 'utf8')).ids || {} : {}).map(([k, v]) => [k, new Set(v.map(String))]));
const firstUser = (l) => (l.messages || []).find((m) => m.role === 'user')?.content;

// pass 1: read every set; find the repeated first prompts across all of them
const sets = {}, byPrompt = new Map();
for (const f of folders) {
  if (skipWords.some((w) => f.toLowerCase().includes(w))) { (info.skipped ||= []).push(f); continue; }
  if (distillWords.some((w) => f.toLowerCase().includes(w))) { info.distill.push(f); continue; }
  const dir = setDir(f);
  const tools = {};
  for (const t of fs.readdirSync(dir).filter((x) => /^toolsets.*\.json$/.test(x))) Object.assign(tools, JSON.parse(fs.readFileSync(path.join(dir, t), 'utf8')));
  const files = pick(dir);
  // 13 Nov: --exclude-ids <calib-ids.json> (calib-prep.mjs): lessons reserved as calibration questions never go into training
  const lessons = files.flatMap((file) => readJsonl(path.join(dir, file)).map((l) => ({ l, file }))).filter(({ l }) => { if (!excluded.get(f)?.has(String(l.idea))) return true; info.dropped.push({ folder: f, idea: l.idea, why: 'reserved for calibration (calib-ids.json)' }); return false; });
  sets[f] = { tools, lessons, files };
  lessons.forEach(({ l, file }, i) => { const k = norm(firstUser(l)) && `${l.think ? 1 : 0}|${norm(firstUser(l))}`; if (k) byPrompt.set(k, [...(byPrompt.get(k) || []), { f, i, idea: baseIdea(l), held: isHeld(l, file) }]); });
}
const dupDrop = new Set();
for (const copies of byPrompt.values()) {
  if (copies.length < 2) continue;
  const keep = copies.find((c) => c.held) || copies[0];
  for (const c of copies) if (c.idea !== keep.idea && !c.held) dupDrop.add(`${c.f}#${c.i}`); // copies of the kept lesson stay
}

// pass 2: write the new version
fs.mkdirSync(out, { recursive: true });
for (const [f, { tools, lessons, files }] of Object.entries(sets)) {
  const od = path.join(out, f); fs.mkdirSync(od, { recursive: true });
  for (const t of fs.readdirSync(setDir(f)).filter((x) => /^toolsets.*\.json$/.test(x))) fs.copyFileSync(path.join(setDir(f), t), path.join(od, t));
  const kept = Object.fromEntries(files.map((x) => [x, []])), rejected = readJsonl(path.join(setDir(f), 'rejected.jsonl'));
  const c = { before: lessons.length, after: 0, unoffered_tool: 0, repeated: 0, wrong: 0, no_tool_list: 0, held_kept_with_problem: 0, not_stock: 0 };
  lessons.forEach(({ l, file }, i) => {
    const id = { folder: f, idea: l.idea, job: l.job }, held = isHeld(l, file);
    const offered = (set) => new Set(((tools[set] || {}).tools || []).map((t) => t.function?.name).filter(Boolean));
    const bad = (l.messages || []).filter((m) => m.role === 'assistant').flatMap((m) => (m.tool_calls || []).map((tc) => [m.set, tc.function?.name])).find(([set, n]) => tools[set] && !offered(set).has(n));
    if ((l.messages || []).some((m) => m.role === 'assistant' && m.set && !tools[m.set])) c.no_tool_list++;
    if (bad && held) { c.held_kept_with_problem++; flagged.push({ folder: f, idea: l.idea, job: l.job, why: [`held out, kept; calls ${bad[1]}, not offered`] }); }
    else if (bad) { c.unoffered_tool++; info.dropped.push({ ...id, why: `calls ${bad[1]}, not offered` }); return; }
    const ns = notForTraining(l); // the surgery data rule: only stock answers are lessons
    if (ns && held) flagged.push({ folder: f, idea: l.idea, job: l.job, why: [`held out, kept; ${ns}`] });
    else if (ns) { c.not_stock++; info.dropped.push({ ...id, why: ns }); return; }
    if (dupDrop.has(`${f}#${i}`)) { c.repeated++; info.dropped.push({ ...id, why: 'repeated first prompt' }); return; }
    const w = wrong.get(`${f}/${l.idea}`);
    if (w) { c.wrong++; rejected.push({ ...l, why: w }); info.moved_wrong.push({ ...id, why: w }); return; }
    const as = (l.messages || []).filter((m) => m.role === 'assistant'), last = String(as.at(-1)?.content || '').split('</think>').at(-1);
    if (REFUSE.test(last.trim().slice(0, 300))) { // a refusal leads; a scene that says "I can't" later is not one
      const why = [], names = [...new Set(as.flatMap((m) => [...offered(m.set)]))].join(' ');
      if (FICTION.test(String(firstUser(l) || ''))) why.push('refusal in a fiction ask');
      if (!as.some((m) => m.tool_calls?.length) && CAN.some(([say, tl]) => say.test(last) && tl.test(names))) why.push("says it can't, with a matching tool offered");
      if (why.length) flagged.push({ folder: f, idea: l.idea, job: l.job, why, ask: String(firstUser(l) || '').slice(0, 300), answer: last.trim().slice(0, 400) });
    }
    kept[file].push(l); c.after++; if (l.job) info.jobs[l.job] = (info.jobs[l.job] || 0) + 1;
  });
  for (const [file, rows] of Object.entries(kept)) fs.writeFileSync(path.join(od, file), rows.map((l) => JSON.stringify(l)).join('\n') + (rows.length ? '\n' : ''));
  if (rejected.length) fs.writeFileSync(path.join(od, 'rejected.jsonl'), rejected.map((l) => JSON.stringify(l)).join('\n') + '\n');
  info.folders[f] = { ...c, files, rejected: rejected.length };
}
for (const f of info.distill) fs.cpSync(setDir(f), path.join(out, 'distill', f), { recursive: true });
const missing = [...wrong.keys()].filter((k) => !info.moved_wrong.some((m) => `${m.folder}/${m.idea}` === k));
info.review_not_found = missing;

const light = lightJobs.filter((j) => info.jobs[j]);
fs.writeFileSync(path.join(out, 'targets-train.json'), JSON.stringify({ light: { jobs: light, weight: Number(o['light-weight']) } }, null, 1) + '\n');
fs.writeFileSync(path.join(out, 'targets-heal.json'), JSON.stringify({ light: { jobs: light, weight: 1 } }, null, 1) + '\n');
fs.writeFileSync(path.join(out, 'flagged.jsonl'), flagged.map((x) => JSON.stringify(x)).join('\n') + (flagged.length ? '\n' : ''));
fs.writeFileSync(path.join(out, 'clean-info.json'), JSON.stringify(info, null, 1) + '\n');
const tot = (k) => Object.values(info.folders).reduce((s, x) => s + x[k], 0);
fs.writeFileSync(path.join(out, 'CHANGES.md'), [
  `# Bob's lessons, new version (from ${info.from})`, '',
  `The old version is unchanged. ${tot('before')} lessons in, ${tot('after')} kept.`, '',
  `- Dropped, called a tool that was not offered: ${tot('unoffered_tool')}`,
  `- Dropped, repeated first prompt in the same thinking mode (the held-out copy kept when there was one): ${tot('repeated')}`,
  `- Dropped, made under surgery or an evil/fiction check (only stock answers are lessons): ${tot('not_stock')}`,
  `- Moved to the wrong side (rejected.jsonl) by the hand review: ${tot('wrong')}`,
  `- Moved to distill/ (other models' answers, not Bob's set): ${info.distill.join(', ') || 'none'}`,
  ...(info.skipped ? [`- Left out (--skip): ${info.skipped.join(', ')}`] : []),
  `- Light jobs (${light.join(', ')}): weight ${o['light-weight']} in targets-train.json, 1 in targets-heal.json`, '',
  '| Set | Before | Kept | Tool not offered | Repeated | Wrong side |', '|---|---|---|---|---|---|',
  ...Object.entries(info.folders).map(([f, x]) => `| ${f} | ${x.before} | ${x.after} | ${x.unoffered_tool} | ${x.repeated} | ${x.wrong} |`),
  `- To read by hand (flagged.jsonl): ${flagged.length}`,
  ...(tot('held_kept_with_problem') ? [`- Held out and kept although a check failed (listed in flagged.jsonl): ${tot('held_kept_with_problem')}`] : []),
  ...(tot('no_tool_list') ? ['', `${tot('no_tool_list')} lessons name a tool list that is not in their folder, so their tool calls could not be checked.`] : []),
  ...(missing.length ? ['', `Review entries not found: ${missing.join(', ')}`] : []), ''].join('\n'));
console.log(`${tot('before')} -> ${tot('after')} lessons (${tot('unoffered_tool')} made-up tools, ${tot('repeated')} repeats dropped, ${tot('wrong')} to the wrong side), distill: ${info.distill.length} -> ${out}`);

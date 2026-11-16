// Jobs to lessons (16 Nov 2026, the owner: "if it does we're keeping the output as lessons"; "real jobs"). The runs a
// served brain did through Bob's real loop (do-jobs.mjs) that Opus marked keep become ordinary lessons, as they ran:
// nothing is rewritten. Each kept run's chat (the request, every step's thinking, words and tool calls, every real tool
// result) goes into lessons.jsonl in the shape write-lessons.mjs makes, with its own system prompt and tool list in
// toolsets.json, stamped with the run's family and tool shape. Bob's hidden notes inside the turn are left out (they are
// his loop talking to the brain, not the person).
// The system prompt and tools are Bob's own for that turn, worked out the way write-lessons does: this Bob copy's front
// desk with the groups the run added (use_tools) or used, in the run's family's tool set.
// Everything is put through the privacy scrub (scrub-data.mjs: the Lab PC's user name and name, private words from
// <install>/bob-model-lab/private-words.txt with its "keep:" words, user folders, e-mails, keys) and checked again;
// if anything is left, nothing is written (exit 2) and the hits are listed masked.
//
// node jobs-to-lessons.mjs --runs <runs.jsonl>[,<label>=<runs.jsonl>...] --grades <opus grades.jsonl>[,...] --to <dir>
//      [--key <variant-key.json>] [--verdicts keep] [--bob ..] [--user <name> --host <name> --words "a,b"] (tests)
// Grades: {id, verdict, run?}. With --key ({id: {letter: label}}) a grade's run letter picks the labelled runs file;
// without, a grade's id must be in exactly one runs file. Labels are each runs file's own (label=path) or its folder name.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { scrubber, scrubValue, findLeaks, privateWordsFrom, splitKeep } from './scrub-data.mjs';

const readJsonl = (f) => fs.readFileSync(f, 'utf8').replace(/\r\n/g, '\n').split('\n').filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
const list = (v) => String(v || '').split(',').map((x) => x.trim()).filter(Boolean);
const FAMILY_BRAIN = { qwen: 'qwen3.6-35b-a3b', 'gpt-oss': 'gpt-oss-120b' }; // as do-jobs.mjs names them for Bob's loop

// A run's chat as a lesson's messages: user, assistant (with the step's thinking and level), tool. Bob's hidden notes
// and anything not from the person, the brain or a tool are left out.
export function lessonMessages(row) {
  const steps = row.steps || [];
  const out = []; let a = 0;
  for (const m of row.messages || []) {
    if (m.hidden || !['user', 'assistant', 'tool'].includes(m.role)) continue;
    if (m.role === 'user') out.push({ role: 'user', content: String(m.content ?? '') });
    else if (m.role === 'tool') out.push({ role: 'tool', ...(m.tool_name ? { name: m.tool_name } : {}), content: String(m.content ?? '') });
    else {
      const st = steps[a++] || {};
      const calls = (m.tool_calls || []).map((c) => ({ type: 'function', function: { name: c.function?.name, arguments: typeof c.function?.arguments === 'string' ? c.function.arguments : JSON.stringify(c.function?.arguments ?? {}) } }));
      out.push({ role: 'assistant', content: String(m.content ?? ''), ...(st.thinking ? { reasoning: st.thinking } : {}), ...(typeof st.think === 'boolean' ? { think: st.think } : {}), ...(st.effort ? { effort: st.effort } : {}), ...(calls.length ? { tool_calls: calls } : {}) });
    }
  }
  return out;
}

// The groups a run had: those use_tools added and those of every tool it called.
export function groupsOf(row, groupOf = () => '') {
  const g = new Set();
  for (const c of (row.steps || []).flatMap((s) => s.calls || [])) {
    if (c.name === 'use_tools') for (const x of [].concat(c.args?.group || [], c.args?.groups || [])) if (x) g.add(String(x));
    const own = groupOf(c.name); if (own) g.add(own);
  }
  return g;
}

// Which run each kept grade means.
export function pickRuns(grades, runFiles, { key = null, verdicts = ['keep'] } = {}) {
  const want = new Set(verdicts);
  const byLabel = Object.fromEntries(runFiles.map(({ label, rows }) => [label, new Map(rows.map((r) => [r.id, r]))]));
  const kept = [], missing = [];
  for (const g of grades) {
    if (!want.has(g.verdict)) continue;
    let label = null, row = null;
    if (g.run && key) { label = key[g.id]?.[g.run] || null; row = label ? byLabel[label]?.get(g.id) || null : null; }
    else { const has = runFiles.filter((f) => byLabel[f.label].has(g.id)); if (has.length === 1) { label = has[0].label; row = byLabel[label].get(g.id); } }
    if (row) kept.push({ label, row, grade: g }); else missing.push(`${g.id}${g.run ? ` (${g.run})` : ''}${label ? ` in ${label}` : ''}`);
  }
  return { kept, missing };
}

// ---- command line ----
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { opts, locate, AGENT } = await import('./common.mjs');
  const { loadBob } = await import('./bob-kit.mjs');
  const o = opts({ verdicts: 'keep' });
  const L = locate(o);
  const stop = (why, code = 1) => { console.log(`JOBS TO LESSONS STOP: ${why}`); process.exit(code); };
  if (!o.runs || !o.grades || !o.to) stop('--runs, --grades and --to are needed');
  const runFiles = list(o.runs).map((x) => { const [a, b] = x.includes('=') ? x.split('=') : [path.basename(path.dirname(x)), x]; if (!fs.existsSync(b)) stop(`no runs file ${b}`); return { label: a, file: b, rows: readJsonl(b) }; });
  const grades = list(o.grades).flatMap((f) => (fs.existsSync(f) ? readJsonl(f) : stop(`no grades file ${f}`)));
  const key = o.key ? JSON.parse(fs.readFileSync(String(o.key), 'utf8')) : null;
  const { kept, missing } = pickRuns(grades, runFiles, { key, verdicts: list(o.verdicts) });
  console.log(`${grades.length} grades; ${kept.length} kept runs found${missing.length ? `; ${missing.length} kept grades with no run found: ${missing.slice(0, 5).join(', ')}` : ''}`);
  if (!kept.length) stop('no kept runs');
  const fams = new Set(kept.map((x) => String(x.row.family || 'qwen')));
  if (fams.size > 1) stop(`the kept runs are of ${fams.size} families (${[...fams].join(', ')}): lessons are per family, never mixed; run it once per family`);
  // 16 Nov (found by the A3B test thread): run from a kit copy with no private-words.txt, the scrub quietly had no words
  if (typeof o.words !== 'string' && !fs.existsSync(path.join(AGENT, 'bob-model-lab', 'private-words.txt'))) stop(`no private-words.txt in ${path.join(AGENT, 'bob-model-lab')}: copy the Lab's list there (or set BOB_AGENT_DIR to the folder that has it), so the scrub knows the private words`);
  const sc = scrubber({ user: typeof o.user === 'string' ? o.user : (() => { try { return os.userInfo().username; } catch { return ''; } })(), host: typeof o.host === 'string' ? o.host : os.hostname(),
    ...splitKeep(privateWordsFrom({ words: o.words, agentDir: typeof o.words === 'string' ? '' : AGENT })) });
  // 16 Nov (the lessons thread: the locked shape-4 tool lists had no mail tool): an inbox job's run (do-jobs `mail`) had
  // "Let Bob read my email" and "Let Bob tidy my email" on, so its lesson's tool list is made by a Bob with them on too
  // (mail-world.mjs fitMail). Same tool shape: read_email and manage_email keep Bob's own wording in every set.
  const { fitMail } = await import('./mail-world.mjs');
  const kits = new Map(); // one Bob per family (and one more with the mail tools on, for inbox jobs)
  const kitFor = async (family, mail = null) => {
    const k = `${family}${mail ? '+mail' : ''}`;
    if (!kits.has(k)) { const kit = await loadBob(L.bob, { world: true, makers: false, docs: true }); if (FAMILY_BRAIN[family]) kit.cfg.models = { ...(kit.cfg.models || {}), bob: FAMILY_BRAIN[family] }; if (mail) await fitMail(kit, mail); kits.set(k, kit); }
    return kits.get(k);
  };
  const sets = {}, lessons = [];
  for (const { label, row, grade } of kept) {
    const family = String(row.family || 'qwen');
    const kit = await kitFor(family, row.mail?.spec || null);
    const loaded = groupsOf(row, (n) => { try { return kit.groupOf(n) || ''; } catch { return ''; } });
    loaded.toolSet = kit.brain.toolSetOf?.(FAMILY_BRAIN[family] || '') || null;
    const { system, tools } = kit.turn(loaded);
    const k = crypto.createHash('sha1').update(system).update(JSON.stringify(tools)).digest('hex').slice(0, 12);
    sets[k] ||= { system, tools, bob_src: row.bob_src || kit.bobSrc, family };
    const messages = lessonMessages(row);
    const first = messages.find((m) => m.role === 'assistant'); if (first) first.set = k;
    lessons.push({ idea: `${label}:${row.id}`, job: row.job || '', source: 'do-jobs', kind: 'real-job', family, tool_shapes: row.tool_shapes ?? null, bob_src: row.bob_src || null, brain: row.brain || null,
      think: messages.some((m) => m.role === 'assistant' && m.think === true), grade: { verdict: grade.verdict, ...(grade.note ? { note: grade.note } : {}) }, messages });
  }
  for (const kit of kits.values()) kit.done();
  const clean = scrubValue({ lessons, sets }, sc);
  const left = findLeaks(clean, sc, 'lessons');
  if (left.length) stop(`something private is still there after the scrub (${left.length}): ${left.slice(0, 5).join('; ')}`, 2);
  const changed = JSON.stringify(clean) !== JSON.stringify({ lessons, sets });
  fs.mkdirSync(String(o.to), { recursive: true });
  fs.writeFileSync(path.join(String(o.to), 'lessons.jsonl'), clean.lessons.map((l) => JSON.stringify(l)).join('\n') + '\n');
  fs.writeFileSync(path.join(String(o.to), 'toolsets.json'), JSON.stringify(clean.sets));
  const shapes = [...new Set(clean.lessons.map((l) => `${l.family} shape ${l.tool_shapes}`))];
  console.log(`${clean.lessons.length} lessons written to ${o.to} (${shapes.join(', ')}; ${Object.keys(clean.sets).length} tool lists)${changed ? '; the privacy scrub changed something (stand-ins put in)' : ''}`);
}

// Calibration questions and imatrix texts for one brain's per-job tuning (13 Nov, the owner: "be sure that we have a robust
// dataset", ">= 40 judged questions per job", and "keep calibration questions separate from training lessons"). Runs on the PC,
// no card, before a rental. Reads the existing lesson sets (never changes them) and writes --out:
//   questions/lessons.jsonl + toolsets.json   per job, every held-out lesson there is, topped up to --per with a reserved slice
//                                             of training lessons (lowest id hash first, so the pick is the same every time),
//                                             plus make-probes held-out probes that carry a job. Each lesson has split
//                                             "holdout", "calib" (reserved) or "probe", and its set name.
//   calib-ids.json                            {set: [ideas]}: the reserved lessons; clean-lessons.mjs --exclude-ids skips them
//   imatrix/all.txt, imatrix/job-<job>.txt    training lessons (never the reserved or held-out ones) as chat text, for llama-imatrix
//   PREP.md                                   counts per job
// node calib-prep.mjs --sets out/lessons,out/lessons-codefix,... [--reserve-from bob] [--probes out/probes] [--per 45] [--imatrix-per 40] --out out/riker-calib
//   --max-held N (default 2 x per): at most N held-out lessons per job, so a big job doesn't take all the time
//   --reserve-from: reserve only from the sets with these folder names (e.g. a fresh set nobody has trained on yet)
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { pathToFileURL } from 'node:url';

const h01 = (id) => parseInt(crypto.createHash('md5').update(String(id)).digest('hex').slice(0, 8), 16) / 0xFFFFFFFF;
const isHoldout = (id) => h01(id) < 0.05;
const readJsonl = (f) => (fs.existsSync(f) ? fs.readFileSync(f, 'utf8').replace(/\r\n/g, '\n').split('\n').filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean) : []);
const lessonFiles = (d) => { const all = fs.existsSync(d) ? fs.readdirSync(d) : []; const parts = all.filter((x) => /^lessons-part.*\.jsonl$/.test(x)).sort(); return parts.length ? parts : all.includes('lessons.jsonl') ? ['lessons.jsonl'] : []; };

// a lesson as plain chat text (ChatML, thinking inline), for llama-imatrix
export function chatText(l, sets) {
  let sys = null; const parts = [];
  for (const m of l.messages || []) {
    if (m.role === 'assistant') { if (sys === null && sets[m.set]) sys = sets[m.set].system; const th = m.reasoning || m.reasoning_content; parts.push(`<|im_start|>assistant\n${th ? `<think>\n${th}\n</think>\n\n` : ''}${m.content || ''}${(m.tool_calls || []).map((c) => `\n<tool_call>\n${JSON.stringify({ name: c.function?.name, arguments: typeof c.function?.arguments === 'string' ? c.function.arguments : JSON.stringify(c.function?.arguments || {}) })}\n</tool_call>`).join('')}<|im_end|>`); }
    else if (m.role === 'tool') parts.push(`<|im_start|>user\n<tool_response>\n${String(m.content || '')}\n</tool_response><|im_end|>`);
    else parts.push(`<|im_start|>user\n${typeof m.content === 'string' ? m.content : ''}<|im_end|>`);
  }
  return [`<|im_start|>system\n${sys || ''}<|im_end|>`, ...parts].join('\n');
}

// split every job's lessons: held-out first, then the reserved slice (lowest hash), the rest stays training
export function pickCalib(byJob, per, reserveFrom = null, maxHeld = per * 2) {
  const out = {};
  for (const [job, ls] of Object.entries(byJob)) {
    const held = ls.filter((x) => x.held).sort((a, b) => h01(`${a.set}/${a.l.idea}`) - h01(`${b.set}/${b.l.idea}`)).slice(0, maxHeld), rest = ls.filter((x) => !x.held).sort((a, b) => h01(`${a.set}/${a.l.idea}`) - h01(`${b.set}/${b.l.idea}`));
    const need = Math.max(0, per - held.length), reserved = rest.filter((x) => !reserveFrom || reserveFrom.includes(x.set)).slice(0, need);
    const resSet = new Set(reserved);
    out[job] = { held, reserved, train: rest.filter((x) => !resSet.has(x)) };
  }
  return out;
}

function main() {
  const a = Object.fromEntries(process.argv.slice(2).reduce((acc, x, i, arr) => (x.startsWith('--') ? [...acc, [x.slice(2), arr[i + 1] && !arr[i + 1].startsWith('--') ? arr[i + 1] : true]] : acc), []));
  if (!a.sets || !a.out) { console.error('--sets <lesson folders> --out <folder> are needed'); process.exit(1); }
  const per = Number(a.per) || 45, imPer = Number(a['imatrix-per']) || 40, out = path.resolve(String(a.out));
  const dirs = String(a.sets).split(',').filter(Boolean).map((d) => path.resolve(d));
  for (const d of dirs) if (out === d || out.startsWith(d + path.sep)) { console.error('--out must be outside the lesson sets (they are never changed)'); process.exit(1); }
  const byJob = {}, toolsets = {};
  for (const d of dirs) {
    const set = path.basename(d), sets = fs.existsSync(path.join(d, 'toolsets.json')) ? JSON.parse(fs.readFileSync(path.join(d, 'toolsets.json'), 'utf8')) : {};
    for (const [k, v] of Object.entries(sets)) toolsets[`${set}:${k}`] = v; // the same key in two sets may differ: each keeps its own
    for (const f of lessonFiles(d)) for (const l of readJsonl(path.join(d, f))) {
      if (l.idea === undefined || !l.job || !l.messages?.some((m) => m.role === 'assistant')) continue;
      (byJob[l.job] ||= []).push({ set, sets, l, held: /held-?out|hold-?out/i.test(f) || l.holdout === true || l.split === 'holdout' || isHoldout(l.idea) });
    }
  }
  const probes = a.probes ? readJsonl(path.join(path.resolve(String(a.probes)), 'lessons.jsonl')).filter((l) => l.split === 'holdout' && l.job) : [];
  const probeSets = a.probes && fs.existsSync(path.join(String(a.probes), 'toolsets.json')) ? JSON.parse(fs.readFileSync(path.join(String(a.probes), 'toolsets.json'), 'utf8')) : {};
  for (const [k, v] of Object.entries(probeSets)) toolsets[`probes:${k}`] = v;
  const picked = pickCalib(byJob, per, a['reserve-from'] ? String(a['reserve-from']).split(',') : null, Number(a['max-held']) || per * 2);
  fs.mkdirSync(path.join(out, 'questions'), { recursive: true }); fs.mkdirSync(path.join(out, 'imatrix'), { recursive: true });
  const reSet = (l, set) => ({ ...l, messages: l.messages.map((m) => (m.set !== undefined ? { ...m, set: `${set}:${m.set}` } : m)) });
  const q = [], ids = {}, rows = [], all = [];
  for (const [job, p] of Object.entries(picked).sort()) {
    for (const x of p.held) q.push({ ...reSet(x.l, x.set), job, set: x.set, split: 'holdout' });
    for (const x of p.reserved) { q.push({ ...reSet(x.l, x.set), job, set: x.set, split: 'calib' }); (ids[x.set] ||= []).push(x.l.idea); }
    const pr = probes.filter((l) => l.job === job); for (const l of pr) q.push({ ...reSet(l, 'probes'), job, set: 'probes', split: 'probe' });
    const tr = p.train, step = Math.max(1, tr.length / imPer), pick = Array.from({ length: Math.min(imPer, tr.length) }, (_, i) => tr[Math.floor(i * step)]);
    const text = pick.map((x) => chatText(x.l, x.sets)).join('\n\n');
    if (text) { fs.writeFileSync(path.join(out, 'imatrix', `job-${job.replace(/[^\w.-]+/g, '-')}.txt`), text + '\n'); all.push(...pick.slice(0, Math.ceil(imPer / 3)).map((x) => chatText(x.l, x.sets))); }
    rows.push(`| ${job} | ${p.held.length} | ${p.reserved.length} | ${pr.length} | ${p.held.length + p.reserved.length + pr.length} | ${pick.length} |`);
  }
  fs.writeFileSync(path.join(out, 'imatrix', 'all.txt'), all.join('\n\n') + '\n');
  fs.writeFileSync(path.join(out, 'questions', 'lessons.jsonl'), q.map((x) => JSON.stringify(x)).join('\n') + '\n');
  fs.writeFileSync(path.join(out, 'questions', 'toolsets.json'), JSON.stringify(toolsets));
  fs.writeFileSync(path.join(out, 'calib-ids.json'), JSON.stringify({ made: new Date().toISOString(), note: 'reserved for calibration: training must skip these (clean-lessons.mjs --exclude-ids)', ids }, null, 1));
  fs.writeFileSync(path.join(out, 'PREP.md'), ['# Calibration questions', '', `Per job: held-out lessons, then reserved training lessons up to ${per}, plus held-out probes. Reserved ids are in calib-ids.json; training skips them.`, '', '| job | held-out | reserved | probes | judged | imatrix lessons |', '|---|---|---|---|---|---|', ...rows, ''].join('\n'));
  console.log(`${q.length} calibration lessons over ${rows.length} jobs, ${Object.values(ids).flat().length} reserved; imatrix texts in ${path.join(out, 'imatrix')}`);
}
if (import.meta.url === pathToFileURL(process.argv[1] || '').href) main();

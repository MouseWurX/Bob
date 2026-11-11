// Resolve plan.hf_lessons (Hugging Face datasets) into local lesson folders that forge.mjs already knows how
// to send to the pod. Run on the PC BEFORE forge.mjs:
//     node import-lessons.mjs --plan <plan.json>
// Each plan.hf_lessons entry is { repo, file?, revision?, license?, max? } (a Hugging Face dataset), { path, license?, private_only? }
// (a file or folder already on this PC, converted in place) or { url, license?, private_only? } (a direct https link to one data
// file). For a Hugging Face entry it downloads the dataset with the
// `hf` CLI, converts the common shapes (OpenAI messages, ShareGPT conversations, Alpaca instruction/output,
// prompt/response, question/answer) into Bob's lesson format, writes a folder with lessons.jsonl +
// toolsets.json, and appends that folder's ABSOLUTE path to plan.extra_lessons (forge.mjs uploads those as
// lessons-extra-pc*, which the pod merges with a content-hash tag, so no change is needed on the pod side).
// A set with no licence is marked private-training-only: it still trains, but every row carries ext/
// private_training_only flags so the public bob-lessons dataset can exclude it (nothing external is published).
// On success hf_lessons is removed from the plan (the pod never sees it). If any dataset fails the exit code is
// non-zero, so the Lab can refuse to start the run and nothing is silently left out.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { opts, locate } from './common.mjs';

const sani = (s) => String(s).replace(/[^\w.@-]+/g, '_').slice(0, 120);
const sha12 = (s) => crypto.createHash('sha1').update(s).digest('hex').slice(0, 12);
const clean = (t) => (t == null ? '' : String(t)).trim();

// which speaker is which, across the shapes datasets use
const ROLE = { system: 'system', developer: 'system', human: 'user', user: 'user', prompter: 'user', client: 'user',
  gpt: 'assistant', assistant: 'assistant', bot: 'assistant', model: 'assistant', chatgpt: 'assistant',
  tool: 'tool', observation: 'tool', function: 'tool', function_response: 'tool' };

// one dataset record -> { system, turns:[{role,content}] } or null if it is not a supervised conversation
export function toConversation(rec) {
  if (!rec || typeof rec !== 'object') return null;
  let system = '';
  const turns = [];
  const pushSys = (s) => { s = clean(s); if (s) system = system ? `${system}\n\n${s}` : s; };
  const list = Array.isArray(rec.messages) ? rec.messages
    : Array.isArray(rec.conversations) ? rec.conversations
    : Array.isArray(rec.conversation) ? rec.conversation
    : Array.isArray(rec.dialog) ? rec.dialog : null;
  if (list) {
    for (const m of list) {
      if (!m || typeof m !== 'object') continue;
      const role = ROLE[String(m.role ?? m.from ?? m.speaker ?? '').toLowerCase()];
      const content = clean(m.content ?? m.value ?? m.text ?? m.message);
      if (role === 'system') pushSys(content);
      else if (role) turns.push({ role, content });
    }
  } else if (rec.instruction != null || rec.prompt != null || rec.question != null || rec.input != null || rec.query != null) {
    pushSys(rec.system ?? rec.system_prompt);
    const user = clean(rec.instruction ?? rec.prompt ?? rec.question ?? rec.query ?? rec.input);
    const extra = rec.instruction != null ? clean(rec.input ?? rec.context) : '';
    const asst = clean(rec.output ?? rec.response ?? rec.answer ?? rec.completion ?? rec.chosen ?? rec.target);
    if (user) turns.push({ role: 'user', content: extra ? `${user}\n\n${extra}` : user });
    if (asst) turns.push({ role: 'assistant', content: asst });
  } else return null;
  if (!turns.some((t) => t.role === 'user') || !turns.some((t) => t.role === 'assistant' && t.content)) return null;
  return { system, turns };
}

// one record -> a Bob lesson row (and, if it had a system prompt, a toolset entry registered in `sets`)
export function toLesson(rec, id, sets) {
  const conv = toConversation(rec);
  if (!conv) return null;
  let set = null;
  if (conv.system) { set = sha12(conv.system + '[]'); if (!sets[set]) sets[set] = { system: conv.system, tools: [] }; }
  let attached = false;
  const messages = conv.turns.map((t) => {
    const m = { role: t.role, content: t.content };
    if (t.role === 'assistant' && set && !attached) { m.set = set; attached = true; }
    return m;
  });
  return { idea: id, job: 'external', think: false, messages };
}

// ---- reading dataset files in the shapes Hugging Face publishes ----
const PARQUET_PY = 'import sys,json\nimport pyarrow.parquet as pq\nfor r in pq.read_table(sys.argv[1]).to_pylist():\n print(json.dumps(r,default=str))';
function parseCsv(txt, d) {
  const rows = []; let row = [], cur = '', q = false;
  for (let i = 0; i < txt.length; i++) {
    const c = txt[i];
    if (q) { if (c === '"') { if (txt[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c; }
    else if (c === '"') q = true;
    else if (c === d) { row.push(cur); cur = ''; }
    else if (c === '\n') { row.push(cur); rows.push(row); row = []; cur = ''; }
    else if (c !== '\r') cur += c;
  }
  if (cur.length || row.length) { row.push(cur); rows.push(row); }
  return rows;
}
export function* records(file) {
  const ext = path.extname(file).toLowerCase();
  if (ext === '.jsonl' || ext === '.ndjson') {
    for (const line of fs.readFileSync(file, 'utf8').split('\n')) { const s = line.trim(); if (!s) continue; try { yield JSON.parse(s); } catch {} }
  } else if (ext === '.json') {
    let j; try { j = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return; }
    const arr = Array.isArray(j) ? j : Array.isArray(j.data) ? j.data : Array.isArray(j.rows) ? j.rows : [j];
    for (const r of arr) yield (r && typeof r === 'object' && r.row && typeof r.row === 'object' ? r.row : r); // HF "rows" API wraps each record in {row:{...}}
  } else if (ext === '.csv' || ext === '.tsv') {
    const rows = parseCsv(fs.readFileSync(file, 'utf8'), ext === '.tsv' ? '\t' : ','); if (rows.length < 2) return;
    const head = rows[0]; for (let i = 1; i < rows.length; i++) { const o = {}; head.forEach((h, k) => { o[h] = rows[i][k]; }); yield o; }
  } else if (ext === '.parquet') {
    let out;
    try { out = execFileSync('python3', ['-I', '-c', PARQUET_PY, file], { maxBuffer: 1 << 30, encoding: 'utf8' }); }
    catch (e) { throw new Error(`parquet needs python3 + pyarrow to read ${path.basename(file)} (${clean(e.message).slice(0, 140)})`); }
    for (const line of out.split('\n')) { const s = line.trim(); if (!s) continue; try { yield JSON.parse(s); } catch {} }
  }
}
function dataFiles(dir, only) {
  if (only) { const p = path.join(dir, only); return fs.existsSync(p) ? [p] : []; }
  const out = [];
  (function walk(d) { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const fp = path.join(d, e.name); if (e.isDirectory()) walk(fp); else if (/\.(jsonl|ndjson|json|csv|tsv|parquet)$/i.test(e.name)) out.push(fp); } })(dir);
  return out.sort();
}
function hfDownload(repo, file, revision, dir) {
  const a = ['download', repo, '--repo-type', 'dataset', '--local-dir', dir];
  if (file) a.push('--include', file);
  if (revision) a.push('--revision', revision);
  for (const bin of ['hf', 'huggingface-cli']) {
    try { execFileSync(bin, a, { stdio: 'inherit', env: process.env }); return; }
    catch (e) { if (e.code === 'ENOENT') continue; throw new Error(`${bin} download failed (${clean(e.message).slice(0, 140)})`); }
  }
  throw new Error('neither `hf` nor `huggingface-cli` is on PATH (pip install -U huggingface_hub)');
}

async function main() {
  const o = opts({});
  const planPath = o.plan ? path.resolve(String(o.plan)) : null;
  if (!planPath || !fs.existsSync(planPath)) { console.error('pass --plan <plan.json>'); process.exit(1); }
  const plan = JSON.parse(fs.readFileSync(planPath, 'utf8'));
  const list = Array.isArray(plan.hf_lessons) ? plan.hf_lessons : plan.hf_lessons ? [plan.hf_lessons] : [];
  if (!list.length) { console.log('no hf_lessons in the plan: nothing to import'); return; }
  const base = path.join(locate(o).out, 'hf-lessons'); fs.mkdirSync(base, { recursive: true });
  plan.extra_lessons = Array.isArray(plan.extra_lessons) ? plan.extra_lessons : plan.extra_lessons ? [plan.extra_lessons] : [];
  let added = 0;
  for (const ent of list) {
    const srcPath = clean(ent.path), srcUrl = clean(ent.url), repo = clean(ent.repo || ent.name);
    if (!repo && !srcPath && !srcUrl) { console.error('hf_lessons entry has no repo, path or url; skipped'); process.exitCode = 1; continue; }
    const rev = clean(ent.revision || ent.rev);
    const file = clean(ent.file || ent.path_in_repo);
    const license = clean(ent.license || ent.licence);
    const priv = ent.private_only === true || !license || /^(unknown|none|other|private|nolicense|no-license)$/i.test(license);
    const label = repo || srcPath || srcUrl;
    const slug = sani(repo ? `${repo}${rev ? '@' + rev : ''}${file ? '/' + file : ''}` : srcPath ? `local-${path.basename(srcPath)}` : `url-${path.basename(new URL(srcUrl).pathname) || 'download'}`);
    const folder = path.join(base, slug); const dl = path.join(folder, 'download');
    console.log(`\n== ${label}${rev ? ' @ ' + rev : ''}${file ? ' (' + file + ')' : ''}  licence: ${license || 'unknown -> private-training-only'}${priv && license ? ' (private-training-only)' : ''}`);
    fs.rmSync(folder, { recursive: true, force: true }); fs.mkdirSync(dl, { recursive: true });
    let files;
    try {
      if (srcPath) { // a file or folder already on this PC: nothing to download, converted in place (the source is never touched)
        if (!fs.existsSync(srcPath)) throw new Error(`${srcPath} does not exist`);
        files = fs.statSync(srcPath).isDirectory() ? dataFiles(srcPath) : [srcPath];
      } else if (srcUrl) { // a direct https link to one data file
        if (!/^https:\/\//i.test(srcUrl)) throw new Error('url must be https');
        const fn = path.basename(new URL(srcUrl).pathname) || 'download.jsonl'; const dest = path.join(dl, fn);
        const r = await fetch(srcUrl, { redirect: 'follow' }); if (!r.ok) throw new Error(`${r.status} ${r.statusText} for ${srcUrl}`);
        fs.writeFileSync(dest, Buffer.from(await r.arrayBuffer())); files = [dest];
      } else { hfDownload(repo, file, rev, dl); files = dataFiles(dl, file); }
    } catch (e) { console.error(`  ${e.message}`); fs.rmSync(folder, { recursive: true, force: true }); process.exitCode = 1; continue; }
    if (!files.length) { console.error('  no data files (jsonl/json/csv/parquet) found; skipped'); fs.rmSync(folder, { recursive: true, force: true }); process.exitCode = 1; continue; }
    const sets = {}; const rows = []; const max = Number(ent.max) || 0; let seen = 0, bad = 0;
    for (const f of files) {
      try {
        for (const rec of records(f)) {
          seen++;
          const row = toLesson(rec, `ext-${slug}-${rows.length}`, sets);
          if (!row) { bad++; continue; }
          row.ext = true; row.source = label; row.license = license || 'unknown'; if (priv) row.private_training_only = true;
          rows.push(row);
          if (max && rows.length >= max) break;
        }
      } catch (e) { console.error(`  ${path.basename(f)}: ${e.message}`); process.exitCode = 1; }
      if (max && rows.length >= max) break;
    }
    if (!rows.length) { console.error(`  no usable lessons (saw ${seen} records, ${bad} unconvertible); skipped`); fs.rmSync(folder, { recursive: true, force: true }); process.exitCode = 1; continue; }
    fs.writeFileSync(path.join(folder, 'lessons.jsonl'), rows.map((r) => JSON.stringify(r)).join('\n') + '\n');
    fs.writeFileSync(path.join(folder, 'toolsets.json'), JSON.stringify(sets));
    fs.writeFileSync(path.join(folder, 'SOURCE.json'), JSON.stringify({ source: label, kind: repo ? 'hf' : srcPath ? 'path' : 'url', repo: repo || null, path: srcPath || null, url: srcUrl || null, file: file || null, revision: rev || null, license: license || 'unknown', private_training_only: priv, lessons: rows.length, records_seen: seen, unconvertible: bad, at: new Date().toISOString() }, null, 1));
    fs.rmSync(dl, { recursive: true, force: true }); // keep the converted lessons, drop the raw download
    if (!plan.extra_lessons.includes(folder)) plan.extra_lessons.push(folder);
    added++;
    console.log(`  ${rows.length} lessons (${bad} of ${seen} records skipped) -> ${folder}${priv ? '  [private-training-only]' : ''}`);
  }
  delete plan.hf_lessons;
  fs.writeFileSync(planPath, JSON.stringify(plan, null, 1));
  console.log(`\nimported ${added}/${list.length} dataset(s); plan.extra_lessons now has ${plan.extra_lessons.length}. hf_lessons removed from the plan. Run forge.mjs next.`);
  if (added < list.length) process.exitCode = 1; // a partial import must stop the run, so nothing is silently dropped
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();

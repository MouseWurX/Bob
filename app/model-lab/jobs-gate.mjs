// Jobs gate (16 Nov 2026, the owner: "dont have the server shut down this time, if everything passes we are going for a
// longer run"). It reads a finished do-jobs folder (run 3) on the Lab PC and says whether the longer run may go on, on the
// same rented brain. A failed check exits with code 86: the Forge then stops the run and deletes the pod (forge.mjs), so
// the longer run's money is only spent after a clean short run. It checks that:
//   - the runs are there (at least --min-runs of --runs) and nearly all answered in words, with few errors;
//   - the test worlds were made (few "scene not made"), every run used the wanted tool shape;
//   - web searches came back with results (none of Bob's "No results" or errors for most of them);
//   - nothing private is in any saved file: the Lab's Tavily key (in any form), the Lab PC's user name, its name, or a
//     private word from <install>/bob-model-lab/private-words.txt.
// It reads only the run's own files; it never changes them. Writes gate.json and GATE.md in the folder.
// node jobs-gate.mjs --dir <do-jobs folder name> [--out <lab out>] [--runs 45] [--min-runs 0.9] [--min-said 0.9]
//      [--max-errors 0.1] [--max-no-scene 0.1] [--min-search-ok 0.8] [--want-shapes 4] [--search tavily]
//      [--user <name> --host <name> --words "a,b"] (the last three for tests: the Lab PC's own by default)
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { scrubber as privacyScrub, findLeaks, privateWordsFrom, splitKeep } from './scrub-data.mjs';
import { scrubber as keyScrub } from './lab-keys.mjs';

export const STOP = 86;
const BLOCKED = /^(?:No results \(or the search pages changed\)|The search pages are blocking this computer)/; // Bob's own lines (web-search.js)
const readJsonl = (f) => (fs.existsSync(f) ? fs.readFileSync(f, 'utf8').replace(/\r\n/g, '\n').split('\n').filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean) : []);
const walk = (d) => (fs.existsSync(d) ? fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)])) : []);
const pct = (a, b) => (b ? `${Math.round((100 * a) / b)}%` : '-');

// The numbers from runs.jsonl rows: { runs, said, errors, noScene, shapes (other than wanted), searches, searchOk }
export function tally(rows, { wantShapes = null } = {}) {
  const t = { runs: rows.length, said: 0, errors: 0, noScene: 0, otherShapes: 0, searches: 0, searchOk: 0, missing: 0 };
  for (const r of rows) {
    if (String(r.said || '').trim()) t.said++;
    if (r.error) t.errors++;
    if ((r.scene?.problems || []).some((p) => /^scene not made/.test(String(p)))) t.noScene++;
    if (wantShapes !== null && String(r.tool_shapes) !== String(wantShapes)) t.otherShapes++;
    if (r.missing?.length) t.missing++;
    for (const c of (r.steps || []).flatMap((s) => s.calls || [])) {
      if (c.name !== 'web_search') continue;
      t.searches++;
      const res = String(c.result || '').trim();
      if (res && !BLOCKED.test(res) && !/^Error\b/.test(res)) t.searchOk++;
    }
  }
  return t;
}

// What's private in the folder's files: the key in any form, and the Lab PC's user name, PC name and private words.
// Example e-mail addresses, other people's folders and made-up keys that a job's test world holds are not the Lab's own.
const OWN = new Set(['the user name', 'the PC name', 'private words']);
export function privateIn(dir, { keys = [], user = '', host = '', words = [], keep = [] } = {}) {
  const hide = keyScrub(...keys), sc = privacyScrub({ user, host, words, keep });
  sc.rules = sc.rules.filter((r) => OWN.has(r.what));
  const found = [];
  for (const f of walk(dir)) {
    const rel = path.relative(dir, f);
    const text = fs.readFileSync(f, 'utf8');
    if (keys.length && hide(text) !== text) found.push(`${rel}: the Lab's search key`);
    for (const l of findLeaks(text, sc, rel)) found.push(l.replace(/ \(as written\)$/, ''));
  }
  return [...new Set(found)];
}

export function gate(dir, o = {}) {
  const want = Number(o.runs) || 0;
  const rows = readJsonl(path.join(dir, 'runs.jsonl'));
  const t = tally(rows, { wantShapes: o.wantShapes ?? null });
  const fails = [];
  const minRuns = Math.ceil((Number(o.minRuns ?? 0.9)) * want);
  if (!t.runs) fails.push('no runs in the folder');
  else {
    if (want && t.runs < minRuns) fails.push(`only ${t.runs} of ${want} jobs ran (needs ${minRuns})`);
    if (t.said < Math.ceil(Number(o.minSaid ?? 0.9) * t.runs)) fails.push(`only ${t.said} of ${t.runs} runs answered in words`);
    if (t.errors > Math.floor(Number(o.maxErrors ?? 0.1) * t.runs)) fails.push(`${t.errors} of ${t.runs} runs ended with an error`);
    if (t.noScene > Math.floor(Number(o.maxNoScene ?? 0.1) * t.runs)) fails.push(`${t.noScene} of ${t.runs} jobs got no test world (scene not made)`);
    if (t.otherShapes) fails.push(`${t.otherShapes} run(s) used tools that aren't shape ${o.wantShapes}`);
    if (t.searches && t.searchOk < Math.ceil(Number(o.minSearchOk ?? 0.8) * t.searches)) fails.push(`only ${t.searchOk} of ${t.searches} web searches came back with results`);
  }
  const leaks = privateIn(dir, o.private || {});
  if (leaks.length) fails.push(`something private is in the saved files (${leaks.length}): ${leaks.slice(0, 3).join('; ')}`);
  return { ok: !fails.length, fails, tally: t, leaks };
}

const report = (dir, g) => [
  `# Gate: ${path.basename(dir)}`, '',
  g.ok ? 'PASS: the longer run may go on.' : `STOP: ${g.fails.join('; ')}.`, '',
  `- Runs: ${g.tally.runs}; answered in words ${g.tally.said} (${pct(g.tally.said, g.tally.runs)}); errors ${g.tally.errors}`,
  `- No test world: ${g.tally.noScene}; other tool shapes: ${g.tally.otherShapes}; called a tool this Bob hasn't got: ${g.tally.missing} (Opus reads those)`,
  `- Web searches: ${g.tally.searches}, with results ${g.tally.searchOk} (${pct(g.tally.searchOk, g.tally.searches)})`,
  `- Private things found: ${g.leaks.length}`, ''].join('\n');

// ---- command line ----
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { opts, AGENT } = await import('./common.mjs');
  const { labKey } = await import('./lab-keys.mjs');
  const o = opts({});
  const stop = (why) => { console.log(`GATE STOP: ${why}`); process.exit(STOP); };
  if (!o.dir) stop('--dir <do-jobs folder> is needed');
  const out = o.out || path.join(AGENT, 'bob-model-lab', 'out');
  const dir = path.join(String(out), String(o.dir));
  let key = '';
  if (String(o.search || '').toLowerCase() === 'tavily') { const got = labKey('tavily'); if (!got.key) stop(`the Lab's Tavily key can't be opened to check the files for it (${got.why})`); key = got.key; }
  if (o.preflight) { console.log(`gate pre-flight OK: it will read ${dir} after the run`); process.exit(0); }
  const g = gate(dir, {
    runs: o.runs, minRuns: o['min-runs'], minSaid: o['min-said'], maxErrors: o['max-errors'], maxNoScene: o['max-no-scene'], minSearchOk: o['min-search-ok'], wantShapes: o['want-shapes'],
    private: { keys: key ? [key] : [], user: typeof o.user === 'string' ? o.user : (() => { try { return os.userInfo().username; } catch { return ''; } })(), host: typeof o.host === 'string' ? o.host : os.hostname(),
      ...splitKeep(privateWordsFrom({ words: o.words, agentDir: typeof o.words === 'string' ? '' : AGENT })) }
  });
  const md = report(dir, g);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'GATE.md'), md);
  fs.writeFileSync(path.join(dir, 'gate.json'), JSON.stringify({ when: new Date().toISOString(), ok: g.ok, fails: g.fails, tally: g.tally, leaks: g.leaks.length }, null, 1));
  console.log(md);
  if (!g.ok) stop(g.fails.join('; '));
  console.log('GATE PASS');
}

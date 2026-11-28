// npm test: every suite in package.json's "testSuites". (The list used to be one long "node a && node b && ..." line; at
// 238 suites it passed Windows' 8,191-character limit, so this file runs the list instead. installer/check-release.js
// checks every test/run-*.js file is in it.)
// Since Nov 2026: suites run side by side (most of their time is spent waiting on timers and fake servers, not the processor),
// and "npm test -- --changed" runs only the suites that can see a file changed since main (test/changed-suites.js).
//   npm test                      every suite, several at once (8, or twice the processor count if smaller, at least 4)
//   npm test -- --changed         only suites that see a changed file (feature-branch pushes; never for a release)
//   npm test -- --jobs 1          one at a time, the old way (or set BOB_TEST_JOBS=1)
// Suites in "testSolo" run on their own after the others, because they use a fixed port or folder. A suite that fails
// beside others is run again on its own before it counts as failed; if it passes then, the run says so, so it can be
// added to "testSolo".
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { pickSuites } from './changed-suites.js';

const app = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(fs.readFileSync(path.join(app, 'package.json'), 'utf8').replace(/^﻿/, ''));
const allSuites = pkg.testSuites || [];
if (!allSuites.length) { console.error('package.json has no testSuites'); process.exit(1); }
const solo = new Set(pkg.testSolo || []);

const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const value = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };
const cpus = (os.availableParallelism ? os.availableParallelism() : os.cpus().length) || 1;
const jobs = Math.max(1, Number(value('--jobs') || process.env.BOB_TEST_JOBS) || Math.min(8, Math.max(4, cpus * 2)));

// --changed: which files differ from main (committed on this branch, changed but not committed, or new).
function changedFiles() {
  const inDir = (cwd) => (...a) => { const r = spawnSync('git', a, { cwd, encoding: 'utf8' }); return r.status === 0 ? r.stdout.replace(/\r\n/g, '\n').trim() : null; };
  const root = inDir(app)('rev-parse', '--show-toplevel');
  if (!root) return { why: 'git is not here' };
  const git = inDir(root);
  const against = value('--since') || ['origin/main', 'main'].find((b) => git('rev-parse', '--verify', '--quiet', b) !== null);
  const fork = against && git('merge-base', 'HEAD', against);
  if (!fork) return { why: 'no main branch to compare with' };
  const lines = (s) => (s ? s.split('\n').filter(Boolean) : []);
  const tracked = lines(git('ls-files')); const fresh = lines(git('ls-files', '--others', '--exclude-standard'));
  const diff = git('diff', '--name-only', fork);
  if (diff === null) return { why: 'git diff failed' };
  const files = [...tracked, ...fresh]; // paths from the top of the repository: "app/src/brain.js"
  const changed = [...new Set([...lines(diff), ...fresh])];
  const read = (f) => { try { const p = path.join(root, f); return fs.statSync(p).size > 3e6 ? '' : fs.readFileSync(p, 'utf8'); } catch { return ''; } };
  return { files, changed, read, against };
}

let suites = allSuites;
if (flag('--changed')) {
  const c = changedFiles();
  const pick = c.why ? { all: true, why: c.why } : pickSuites({ suites: allSuites, files: c.files, read: c.read, changed: c.changed });
  if (pick.all) console.log(`--changed: running every suite (${pick.why}).`);
  else {
    suites = pick.picked;
    console.log(`--changed: ${c.changed.length} file(s) changed since ${c.against}; ${suites.length} of ${allSuites.length} suites can see them.`);
    if (pick.unseen.length) console.log(`  No suite sees: ${pick.unseen.slice(0, 12).join(', ')}${pick.unseen.length > 12 ? ', ...' : ''}`);
    if (!suites.length) { console.log('Nothing to test.'); process.exit(0); }
  }
}

function runOne(s) {
  return new Promise((resolve) => {
    const t0 = Date.now(); const out = [];
    const child = spawn(process.execPath, [s], { cwd: app, stdio: ['ignore', 'pipe', 'pipe'] });
    child.stdout.on('data', (d) => out.push(d)); child.stderr.on('data', (d) => out.push(d));
    child.on('error', (e) => out.push(Buffer.from(String(e))));
    child.on('close', (code, signal) => resolve({ s, code, signal, ms: Date.now() - t0, text: Buffer.concat(out).toString() }));
  });
}
const show = (r) => { process.stdout.write(r.text.endsWith('\n') || !r.text ? r.text : `${r.text}\n`); };
const label = (r) => `exit ${r.code ?? r.signal}`;

const t0 = Date.now();
const shared = suites.filter((s) => !solo.has(s)); const alone = suites.filter((s) => solo.has(s));
const clashed = []; let failed = null;

async function pool(list, width) {
  let next = 0; const retry = [];
  const worker = async () => {
    while (next < list.length && !failed) {
      const r = await runOne(list[next++]);
      show(r);
      if (r.code !== 0) { if (width > 1) retry.push(r.s); else failed = failed || r; }
    }
  };
  await Promise.all(Array.from({ length: Math.min(width, list.length) }, worker));
  for (const s of retry) {
    if (failed) break;
    console.log(`\n${s} failed beside other suites; running it again on its own.`);
    const r = await runOne(s); show(r);
    if (r.code === 0) clashed.push(s); else failed = r;
  }
}

await pool(shared, jobs);
if (!failed) await pool(alone, 1);
const secs = Math.round((Date.now() - t0) / 1000);
if (clashed.length) console.log(`\nThese passed only on their own; add them to "testSolo" in package.json: ${clashed.join(', ')}`);
if (failed) { console.error(`\nnpm test stopped: ${failed.s} failed (${label(failed)}).`); process.exit(failed.code || 1); }
console.log(`\nAll ${suites.length} test suites passed${suites.length < allSuites.length ? ` (of ${allSuites.length}; --changed)` : ''} in ${secs} s, ${jobs} at a time.`);

// 23 Nov 2026 (the owner: "could we have each version produce a game that we can try?", then two games in Godot):
// the game checker. It copies Bob's Godot project to a throwaway folder, adds godot-check.gd as an autoload, runs it
// headless for a few seconds (start pressed, then every input the game knows) and reads two things back: Godot's own
// error lines and the helper's BOBCHECK line (what was on screen, what moved). The game job's checks (game-jobs.mjs)
// turn that into a short list of problems, in plain words, which is what Bob is sent back word for word.
//   node godot-check.mjs --godot <Godot binary> --dir <project folder> [--job game-emberfall]
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const SKIP = /^(\.godot|\.import|\.git|node_modules)$/;

function copyTree(from, to) {
  fs.mkdirSync(to, { recursive: true });
  for (const e of fs.readdirSync(from, { withFileTypes: true })) {
    if (SKIP.test(e.name)) continue;
    const a = path.join(from, e.name), b = path.join(to, e.name);
    if (e.isDirectory()) copyTree(a, b); else if (e.isFile()) fs.copyFileSync(a, b);
  }
}

// the project file with the helper added as the last autoload (an [autoload] section the game has is kept)
export function withHelper(projectText) {
  const text = String(projectText).replace(/\r\n/g, '\n');
  const line = 'BobCheck="*res://_bob_check.gd"';
  if (/^\[autoload\]\s*$/m.test(text)) return text.replace(/^\[autoload\]\s*$/m, `[autoload]\n\n${line}`);
  return `${text.trimEnd()}\n\n[autoload]\n\n${line}\n`;
}

// Godot's own error lines (a script that doesn't parse, a missing node, a crash), each once, with where it was
export function errorLines(out) {
  const lines = String(out).replace(/\r\n/g, '\n').split('\n');
  const got = [];
  for (let i = 0; i < lines.length; i++) {
    const ln = lines[i].trim();
    if (!/^(SCRIPT ERROR|ERROR|Parse Error|USER ERROR|USER SCRIPT ERROR)\b|^handle_crash|Failed to load script|Can't open file|Invalid call|Invalid access|Identifier ".*" not declared/.test(ln)) continue;
    if (/_bob_check\.gd/.test(ln) || /BobCheck/.test(ln)) continue;
    if (/^ERROR: (Condition "!?[^"]*" is true\. )?.*(audio|Audio|driver|ALSA|PulseAudio|display server|Vulkan|OpenGL|GLES|rendering device)/.test(ln)) continue; // the headless machine's own, not the game's
    const at = (lines[i + 1] || '').trim();
    const full = /^at: /.test(at) ? `${ln} (${at.replace(/^at: /, '')})` : ln;
    const clean = full.replace(/res:\/\/_bob_check\.gd/g, '').replace(/\s+/g, ' ').slice(0, 300);
    if (!got.includes(clean)) got.push(clean);
  }
  return got.slice(0, 12);
}

export function readFacts(out) {
  const m = String(out).match(/^BOBCHECK (\{.*\})\s*$/m);
  if (!m) return null;
  try { return JSON.parse(m[1]); } catch { return null; }
}

function run(bin, args, secs) {
  return new Promise((ok) => {
    let out = '', done = false;
    const js = /\.m?js$/i.test(bin); // a stand-in Godot written in JavaScript (the tests have no Godot)
    const ch = spawn(js ? process.execPath : bin, js ? [bin, ...args] : args, { windowsHide: true, env: { ...process.env } });
    const end = (code, killed) => { if (done) return; done = true; ok({ code, killed, out }); };
    ch.stdout.on('data', (d) => (out += d)); ch.stderr.on('data', (d) => (out += d));
    const t = setTimeout(() => { try { ch.kill('SIGKILL'); } catch {} end(null, true); }, secs * 1000);
    ch.on('exit', (code) => { clearTimeout(t); end(code, false); });
    ch.on('error', (e) => { clearTimeout(t); out += `\n${e.message}`; end(1, false); });
  });
}

// Run the game. Returns { ran, errors, facts, out } or { ran: false, why } when there is no game to run.
export async function runGame(godot, dir, { secs = 40 } = {}) {
  if (!godot || !fs.existsSync(godot)) return { ran: false, why: `no Godot at ${godot || '(not given)'}` };
  if (!fs.existsSync(path.join(dir, 'project.godot'))) return { ran: false, why: 'There is no project.godot in the game folder, so Godot cannot open it as a project.' };
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bob-game-check-'));
  try {
    copyTree(dir, tmp);
    fs.writeFileSync(path.join(tmp, 'project.godot'), withHelper(fs.readFileSync(path.join(tmp, 'project.godot'), 'utf8')));
    fs.copyFileSync(path.join(here, 'godot-check.gd'), path.join(tmp, '_bob_check.gd'));
    const imp = await run(godot, ['--headless', '--path', tmp, '--import'], 120);
    const r = await run(godot, ['--headless', '--path', tmp], secs);
    const out = `${imp.out}\n${r.out}`;
    return { ran: true, killed: r.killed, code: r.code, errors: errorLines(out), facts: readFacts(r.out), out: out.slice(-20000) };
  } finally { try { fs.rmSync(tmp, { recursive: true, force: true }); } catch {} }
}

// the problems every game shares: it opens, its main scene runs, no errors, it answers the keys
export function commonProblems(res) {
  if (!res.ran) return [res.why];
  const p = [];
  const f = res.facts;
  if (!f) p.push(res.killed ? 'The game did not finish its first 7 seconds: Godot hung or crashed before the check could read it.' : 'The game stopped before the check could read it (Godot quit or crashed in the first 7 seconds).');
  if (f && !f.main_scene) p.push('project.godot has no main scene (application/run/main_scene), so the game does not start when it is run.');
  if (f && f.main_scene && !f.current_scene) p.push(`The main scene ${f.main_scene} did not load.`);
  for (const e of res.errors) p.push(`Godot reported: ${e}`);
  if (f && !(f.moved > 0.05)) p.push('Pressing start and then the game\'s keys and actions moved nothing: no player, enemy or camera changed position.');
  return p;
}

const count = (f, ...k) => k.reduce((n, x) => n + (Number(f?.nodes?.[x]) || 0), 0);
const said = (f, re) => (f?.text || []).some((t) => re.test(t));
export { count, said };

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  const a = process.argv.slice(2), opt = (k) => { const i = a.indexOf(`--${k}`); return i >= 0 ? a[i + 1] : ''; };
  const res = await runGame(path.resolve(opt('godot')), path.resolve(opt('dir')));
  let problems = commonProblems(res);
  if (opt('job')) { const { jobByKey } = await import(pathToFileURL(path.join(here, 'game-jobs.mjs')).href); const j = jobByKey(opt('job').replace(/^game-/, '').replace(/-s\d+$/, '')); if (j && res.ran) problems = [...problems, ...j.check(res.facts || {})]; }
  console.log(JSON.stringify({ problems, facts: res.facts, errors: res.errors }, null, 1));
  process.exit(problems.length ? 1 : 0);
}

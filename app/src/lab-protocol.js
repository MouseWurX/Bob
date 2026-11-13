// The training protocol in the Lab (13 Nov 2026, draft PR #201): the free steps that run on this computer, and the
// order every step goes in. The owner, 13 Nov: "we updated the lab with the things in our new training protocols? please".
//
// Here, free, one at a time: clean a lesson set into a new version (clean-lessons.mjs), make right-vs-wrong pairs from
// it (make-pairs.mjs), and sweep a running Brain Engine's live switches per target (expert-sweep.mjs). The rented steps
// (preference training, on-policy teaching, the reward pass, targets, baking surgery edits) are keys in a Forge plan,
// written on the Forge form, and only start on the owner's press of the purchase card with the caps they typed.
// Methods of the Lab class. Nothing here rents, uploads or changes a brain file.
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { forgeDir } from './lab-forge.js';
import { lessonSets, lessonSetsDir } from './lab-plan.js';
import { labDir, readJson, writeJson, slugOf } from './lab-measure.js';
import { nodeCmd } from './selftools.js';

// The order every run follows (the proposal, "The whole protocol, in order"). where: here = free on this computer,
// rented = a Forge plan key, both = either. A benchmark follows every step; any step can be skipped.
export const PROTOCOL_STEPS = [
  { id: 'baseline', title: 'Baseline and data', where: 'here', what: 'Score the brain as it is. Clean the lessons into a new version and make the right-vs-wrong pairs, with the teacher\'s odds.', tool: 'clean' },
  { id: 'clean-first', title: 'Clean first', where: 'here', what: 'Find a bias or refusal direction, try it live, and take it out only on your go.', tool: 'refusals' },
  { id: 'train', title: 'Train the full brain', where: 'rented', what: 'Teach the whole brain the targets before any cut. A trained brain keeps about twice as much when cut hard.', tool: 'forge' },
  { id: 'analyse', title: 'One analysis pass', where: 'both', what: 'Expert scores, experts by layer, and which experts each target uses, all on the same sample chats. The data is kept.', tool: 'sweep' },
  { id: 'cut', title: 'Cut in steps', where: 'both', what: 'One rung at a time, folding the dropped experts into the kept ones.', tool: 'forge' },
  { id: 'heal', title: 'Teach it back', where: 'rented', what: 'Copy the uncut brain\'s odds, so the cut Bob acts like it did before the cut.', tool: 'forge' },
  { id: 'targets', title: 'Several targets', where: 'rented', what: 'Right-vs-wrong pairs (ORPO, DPO or KTO), each target with its own weight and its own grade.', tool: 'forge' },
  { id: 'finish', title: 'On-policy finish and reward pass', where: 'rented', what: 'The small Bob writes its own answers and the teacher grades them; then a reward pass on tool calls, kept only if no target drops.', tool: 'forge' },
  { id: 'blend', title: 'Blend', where: 'rented', what: 'Mix back toward the uncut brain if general knowledge slipped; a short re-teach if the blend lost something.', tool: 'forge' },
  { id: 'surgery', title: 'Final surgery', where: 'both', what: 'Sweep the live dials per target here; bake only the edits that help and hurt nothing, on your go.', tool: 'sweep' },
  { id: 'publish', title: 'Publish', where: 'here', what: 'Only on your go, after scrubbing, with the benchmark report beside it.', tool: '' }
];

export const PROTOCOL_TOOLS = { clean: 'clean-lessons.mjs', pairs: 'make-pairs.mjs', sweep: 'expert-sweep.mjs' };
const LOCAL_URL = /^http:\/\/(127\.0\.0\.1|localhost|\[::1\]):\d{2,5}$/;
const nums = (s, re) => { const v = String(s || '').replace(/\s+/g, ''); return v && re.test(v) ? v : ''; };

export const protocolDir = (cfg) => path.join(labDir(cfg), 'protocol');
const freeName = (root, base) => { let n = base, i = 2; while (fs.existsSync(path.join(root, n))) n = `${base}-${i++}`; return n; };

// The checks for one free step: tool = clean | pairs | sweep; form = the page's answers. Never writes anything.
export function planProtocol(tool, form = {}, { dir = '', sets = [], root = '', review = '' } = {}) {
  const problems = [], notes = [];
  if (!dir) problems.push('The Forge\'s tools aren\'t next to this copy of Bob. They live in the model-lab folder of Bob\'s source.');
  else if (PROTOCOL_TOOLS[tool] && !fs.existsSync(path.join(dir, PROTOCOL_TOOLS[tool]))) problems.push(`${PROTOCOL_TOOLS[tool]} isn't in this model-lab folder yet. Update Bob's source.`);
  if (!PROTOCOL_TOOLS[tool]) { problems.push('There\'s no protocol step by that name.'); return { problems, notes, args: [] }; }
  const set = sets.find((x) => x.id === String(form.set || ''));
  if (!set) problems.push('Pick a lesson set.');
  const args = [];
  if (tool === 'clean' && set) {
    const out = path.join(root, 'clean-work', freeName(path.join(root, 'clean-work'), slugOf(set.id) || 'set'));
    args.push('--from', path.dirname(set.file), '--out', out);
    if (form.review !== 'none' && review) { args.push('--review', review); notes.push('The hand review\'s decisions are used: lessons it marked wrong go to the wrong side of the pairs.'); }
    const lw = Number(form.lightWeight); args.push('--light-weight', String(Number.isFinite(lw) && lw >= 0 && lw <= 2 ? lw : 0.5));
    notes.push(`A new lesson set "${set.name}, cleaned" is made next to it. ${set.name} itself is only read, never changed.`);
    return { problems, notes, args, out, set };
  }
  if (tool === 'pairs' && set) {
    const kind = ['bob', 'style', 'distill'].includes(form.kind) ? form.kind : 'bob';
    const out = path.join(root, 'pairs', freeName(path.join(root, 'pairs'), slugOf(set.id) || 'set'));
    args.push('--lessons', path.dirname(set.file), '--out', out, '--kind', kind);
    if (!fs.existsSync(path.join(path.dirname(set.file), 'rejected.jsonl'))) notes.push(`${set.name} has no wrong answers kept (rejected.jsonl), so it gives marked answers but no pairs. Clean it first with the hand review, or write lessons with the reviewer on.`);
    if (kind === 'bob') notes.push('Lessons with a style line are left out: style sets are taught to their own models, never to Bob.');
    return { problems, notes, args, out, set };
  }
  if (tool === 'sweep') {
    const url = String(form.url || '').trim().replace(/\/$/, '');
    if (!LOCAL_URL.test(url)) problems.push('The Brain Engine\'s address on this computer, like http://127.0.0.1:8090. The sweep only talks to a brain on this computer.');
    const used = form.used === undefined ? '-2,+2,+4' : nums(form.used, /^([+-]?\d{1,2})(,[+-]?\d{1,2})*$/);
    const scales = form.scales === undefined ? '0.8,1.2' : nums(form.scales, /^\d(\.\d+)?(,\d(\.\d+)?)*$/);
    if (form.used && !used) problems.push('Experts per word: whole numbers with a sign, like -2,+2,+4.');
    if (form.scales && !scales) problems.push('Turn layers up or down: numbers from 0 to 9, like 0.8,1.2.');
    if (!used && !scales) problems.push('Give at least one thing to try: experts per word, or layers turned up or down.');
    const sample = Math.max(10, Math.min(200, Math.round(Number(form.sample) || 60)));
    const out = path.join(root, 'sweeps');
    if (set) args.push('--url', url, '--lessons', path.dirname(set.file), '--sample', String(sample), '--out', out, ...(used ? ['--used', used] : []), ...(scales ? ['--layer-scale', scales, '--groups', '4'] : []));
    if (set) { const tf = path.join(out, `targets-${slugOf(set.id) || 'set'}.json`); args.push('--targets', tf); notes.push('Every kind of lesson in the set (its jobs) is scored on its own, so a setting that helps one and hurts another shows.'); return { problems, notes, args, out, set, targetsFile: tf }; }
    notes.push('Nothing in the brain file changes: the sweep only turns the engine\'s live switches, and puts them back at the end. It needs a Brain Engine with the live switches (experts per word, dials, expert mask); an older one skips the trials it can\'t do.');
    notes.push('Only one card test at a time: don\'t sweep while a game, a benchmark or another test is using the card.');
    return { problems, notes, args, out, set };
  }
  return { problems, notes, args };
}

// A finished cleaning: the new set moves into the Lab's lessons, named "<name>, cleaned", with its change list.
export function adoptCleaned({ work, set, lessonsRoot }) {
  const made = path.join(work, path.basename(path.dirname(set.file)));
  if (!fs.existsSync(path.join(made, 'lessons.jsonl'))) throw new Error('The cleaning made no lessons file.');
  const id = freeName(lessonsRoot, `${path.basename(path.dirname(set.file))}-clean`);
  const dest = path.join(lessonsRoot, id);
  fs.cpSync(made, dest, { recursive: true });
  for (const f of ['CHANGES.md', 'flagged.jsonl', 'clean-info.json', 'targets-train.json', 'targets-heal.json']) if (fs.existsSync(path.join(work, f))) fs.copyFileSync(path.join(work, f), path.join(dest, f));
  let count = 0; try { count = fs.readFileSync(path.join(dest, 'lessons.jsonl'), 'utf8').split('\n').filter((x) => x.trim()).length; } catch {}
  writeJson(path.join(dest, 'write.json'), { name: `${set.name}, cleaned`, count, done: true, cleanedFrom: path.basename(path.dirname(set.file)) });
  fs.rmSync(work, { recursive: true, force: true });
  return { id, count };
}

export const protocolJobs = {
  protocolFile() { return path.join(protocolDir(this.cfg), 'job.json'); },
  protocolPairs() {
    const root = path.join(protocolDir(this.cfg), 'pairs');
    let ds = []; try { ds = fs.readdirSync(root, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name).sort(); } catch {}
    return ds.map((id) => { const i = readJson(path.join(root, id, 'pref-info.json'), {}); return { id, path: path.join(root, id), pairs: Number(i.pairs) || 0, marked: Number(i.marked) || 0, kind: i.kind || 'bob' }; }).filter((x) => x.pairs || x.marked);
  },
  protocolView() {
    const dir = forgeDir(this.cfg), root = protocolDir(this.cfg);
    const job = readJson(this.protocolFile(), null);
    let tail = []; if (job?.log) { try { tail = fs.readFileSync(job.log, 'utf8').replace(/\r\n/g, '\n').split('\n').filter(Boolean).slice(-12); } catch {} }
    let sweeps = []; try { sweeps = fs.readdirSync(path.join(root, 'sweeps')).filter((f) => /^expert-sweep-.*\.md$/.test(f)).sort().reverse().slice(0, 5).map((f) => ({ name: f, text: fs.readFileSync(path.join(root, 'sweeps', f), 'utf8').replace(/\r\n/g, '\n').slice(0, 6000) })); } catch {}
    const sets = lessonSets(this.cfg);
    return {
      found: Boolean(dir), tools: Object.fromEntries(Object.entries(PROTOCOL_TOOLS).map(([k, f]) => [k, Boolean(dir) && fs.existsSync(path.join(dir, f))])),
      steps: PROTOCOL_STEPS, sets: sets.map((x) => ({ id: x.id, name: x.name, count: x.count, cleaned: fs.existsSync(path.join(path.dirname(x.file), 'CHANGES.md')), changes: (() => { try { return fs.readFileSync(path.join(path.dirname(x.file), 'CHANGES.md'), 'utf8').replace(/\r\n/g, '\n').slice(0, 4000); } catch { return ''; } })() })),
      pairs: this.protocolPairs().map(({ path: _p, ...x }) => x), sweeps,
      job: job ? { tool: job.tool, state: job.state, at: job.at, message: job.message || '', tail } : null
    };
  },
  protocolCheck(tool, form = {}) {
    const dir = forgeDir(this.cfg), review = dir ? path.join(dir, 'reviews', 'lessons-v4.json') : '';
    return planProtocol(tool, form, { dir, sets: lessonSets(this.cfg), root: protocolDir(this.cfg), review: review && fs.existsSync(review) ? review : '' });
  },
  protocolRun(tool, form = {}) {
    const job = readJson(this.protocolFile(), null);
    if (job?.state === 'running') throw new Error('A protocol step is already running. One at a time.');
    const p = this.protocolCheck(tool, form);
    if (p.problems.length) throw new Error(p.problems[0]);
    const dir = forgeDir(this.cfg), root = protocolDir(this.cfg);
    fs.mkdirSync(root, { recursive: true });
    if (p.targetsFile) { // the sweep scores each job of the set as its own target
      const jobs = new Set(); try { for (const line of fs.readFileSync(p.set.file, 'utf8').split('\n')) { if (!line.trim()) continue; try { const j = JSON.parse(line).job; if (j) jobs.add(String(j)); } catch {} } } catch {}
      fs.mkdirSync(path.dirname(p.targetsFile), { recursive: true }); writeJson(p.targetsFile, Object.fromEntries([...jobs].sort().map((j) => [j, { jobs: [j], weight: 1 }])));
    }
    const log = path.join(root, `${tool}-${new Date(this.now()).toISOString().replace(/[:.]/g, '-').slice(0, 19)}.log`);
    const { file: node, env } = nodeCmd();
    const fd = fs.openSync(log, 'a');
    const c = (this.protocolSpawn || spawn)(node, [path.join(dir, PROTOCOL_TOOLS[tool]), ...p.args], { cwd: dir, stdio: ['ignore', fd, fd], windowsHide: true, env: { ...process.env, ...env } });
    fs.closeSync(fd);
    const rec = { tool, state: 'running', at: this.now(), log, pid: c.pid || 0, set: p.set?.id || '' };
    writeJson(this.protocolFile(), rec);
    const done = (code) => {
      const end = { ...rec, state: code === 0 ? 'done' : 'failed', pid: 0 };
      if (code === 0 && tool === 'clean') {
        try { const a = adoptCleaned({ work: p.out, set: p.set, lessonsRoot: lessonSetsDir(this.cfg) }); end.message = `Made "${p.set.name}, cleaned": ${a.count} lessons. Its change list (CHANGES.md) and the lessons to read by hand (flagged.jsonl) are in its folder.`; }
        catch (e) { end.state = 'failed'; end.message = e.message; }
      } else if (code === 0 && tool === 'pairs') { const i = readJson(path.join(p.out, 'pref-info.json'), {}); end.message = `${i.pairs || 0} pairs and ${i.marked || 0} marked answers. Pick them on the Forge form under New ways to teach.`; }
      else if (code === 0 && tool === 'sweep') end.message = 'The sweep\'s report is below. A trial marked "helps one, hurts another" is never baked.';
      else if (code !== 0) end.message = `It stopped (exit ${code}). The last lines of its log say why.`;
      writeJson(this.protocolFile(), end);
      this.broadcast?.({ type: 'lab-protocol', state: end.state });
    };
    if (c.on) { c.on('exit', (code) => done(code)); c.on('error', () => done(-1)); } else done(-1);
    return { started: true, notes: p.notes };
  },
  protocolStop() {
    const job = readJson(this.protocolFile(), null);
    if (!job || job.state !== 'running') return { stopped: false };
    if (job.pid > 0) { try { (this.protocolKill || process.kill)(job.pid); } catch {} }
    writeJson(this.protocolFile(), { ...job, state: 'stopped', pid: 0, message: 'Stopped. Nothing it was making was kept.' });
    return { stopped: true };
  }
};

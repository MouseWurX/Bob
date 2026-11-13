// 1.5.159 Computer Science Lab: the Forge tab (design: bob-design/cs-lab-forge-and-methods.md, slice A).
// The Forge (model-lab/forge) makes brains on a rented card from a plan file. Until now it only ran from a terminal.
// This tab shows it: every way to make a brain as a card with its best practice, the Forge's past runs from its own
// files, and a form that writes the plan the Forge reads. It never starts a rental by itself: only the owner's press on
// a purchase card does (slice C).
// Never shown or logged: the pod's control token, the rental key, the Forge token, the Hugging Face token.
import fs from 'node:fs';
import { parseHfRef } from './lab-hf.js'; // 1.5.163
import path from 'node:path';
import { rentedEstimate } from './lab-estimate.js';
import { pathByName, PERSONALITY, TEACH, clashes } from '../public/lab-thinking-paths.js';

// Every way to make a brain. `where`: here (free, this replicant matrix), rented (the Forge), or both.
// `ready`: what works today. `tab`/`step` say where Use this way leads.
export const METHODS = [
  { id: 'smaller', title: 'Make it smaller', what: 'The same brain in a smaller file, Q8 down to Q2.', where: 'here', ready: true, use: 'make',
    tips: ['Make the small file from the full-size one, never from another small file.', 'Q4 is the usual sweet spot; the Smaller ladder (Test tab) shows where your brain starts to slip.'] },
  { id: 'cut', title: 'Cut experts', what: 'A smaller brain with fewer experts in each layer, keeping every skill covered or the busiest experts.', where: 'both', ready: true, use: 'make',
    tips: ['Count the experts on work like yours before you cut, so the right ones stay.', 'A small cut can run as it is. A big one needs teaching back afterwards.'] },
  { id: 'heal', title: 'Teach a cut brain back', what: 'A cut brain taught back towards the brain it came from, so the gaps close.', where: 'rented', ready: false, why: 'Needs a rented card. Write the plan here; you start each run yourself, with the caps you type.', use: 'forge',
    tips: ['A full pass or nothing: half a pass teaches half a habit.', 'Set the time cap above the estimate, or a full pass quietly stops early.'] },
  { id: 'teach', title: 'Teach it a lesson set', what: 'A brain that has learned your lessons, from a set you wrote or built in the Lab.', where: 'rented', ready: false, why: 'Needs a rented card. Write the plan here; you start each run yourself, with the caps you type.', use: 'forge',
    tips: ['A few hundred lessons teach habits and a voice, not facts by heart.', 'Keep some general text in the mix, so it doesn\'t forget everything else.'] },
  { id: 'thinking', title: 'Teach it a way of thinking', what: 'A brain that thinks the way you pick. Choose several thought paths (concise, creative, critical, step by step, plan first, check your work) and a personality alignment (good, neutral or evil), each with a share. Blend them into one habit, or tag them so you can switch at chat time. A teacher writes the lessons with that thinking, and the brain is taught them, with how sure the teacher was of each word.', where: 'both', ready: false, why: 'Write the thinking lessons here with the lesson writer (thinking on); teaching them is a rented run. Practice with marked answers (maths and code) comes later.', use: 'forge',
    tips: ['Blend on purpose: give each path a clear share, or tag them to switch; a little of everything teaches a muddle.', 'Alignment is tone and character. The kept refusals stay unless you take them out separately.', 'Teach from how sure the teacher was of each word, not only the words it wrote.', 'Check it on Riddles and reasoning and Sums before and after.'] },
  { id: 'mix', title: 'Mix two brains', what: 'One brain from two fine-tunes of the same parent: an even mix, a smooth blend, or keep what each changed.', where: 'here', ready: true, why: '', use: 'home',
    tips: ['Only relatives mix: both brains must come from the same parent.', 'Test the mix against both parents in Compare.'] },
  { id: 'stack', title: 'Stack layers', what: 'A taller brain from the layers of one or two matching brains, end to end.', where: 'here', ready: true, why: '', use: 'home',
    tips: ['Stacked brains nearly always ramble until they\'re taught back. This is for seeing what happens.'] },
  { id: 'refusals', title: 'Take out the refusal habit', what: 'A brain that no longer declines by reflex. Nothing is trained: one direction is taken out of its weights.', where: 'here', ready: true, why: '', use: 'home',
    tips: ['Try it first at run time, then make the file.', 'Use the lowest strength that stops the reflex; measure before and after.', 'Teaching back the refusals Bob always keeps is on by default, and the brain stays flagged in the Lab.'] },
  { id: 'blend', title: 'Blend two Bobs', what: 'A Bob that keeps what both kept and mixes what both relearned.', where: 'rented', ready: false, why: 'Needs a rented card and the next Forge build.', use: '',
    tips: ['Both must be cut from the same Bob.', 'A blend can\'t know anything neither parent knew.'] },
  { id: 'fold', title: 'Fold experts', what: 'A smaller Bob where similar experts are merged instead of dropped.', where: 'rented', ready: false, why: 'Needs a rented card and the next Forge build.', use: '',
    tips: ['Compare a fold with a plain cut of the same size before keeping it.'] },
  { id: 'stitch', title: 'Stitch brains in as experts', what: 'A new mixture-of-experts brain whose experts are whole brains you already have, with a new router.', where: 'rented', ready: false, why: 'Later: needs a rented card for the short teaching-back it always needs.', use: '',
    tips: ['The seams show until it\'s taught back.'] },
  { id: 'fewer', title: 'Teach it to need fewer experts', what: 'A brain that stays sharp when handhelds run it with only a few experts per word.', where: 'rented', ready: false, why: 'An experiment, on a rented card, with the next Forge build.', use: '',
    tips: ['Compare it at several experts-per-word settings, not just one.'] }
];

// Ideas that don't make a new brain, or that are already happening. Said once, so nobody hunts for them.
export const LEFT_OUT = [
  ['Round robin training', 'Normal training already does it: for every word the router picks a few experts, and only those learn.'],
  ['Every expert on for every word', 'It blurs the experts into generalists, loses what makes the brain fast, and costs much more.'],
  ['Forcing coding experts on for coding', 'Experts split by word pattern, not by topic, so there is no clean set to force.'],
  ['Expert offloading', 'That\'s how a brain runs, not a new brain: Bob already keeps experts in memory when a brain is too big for the graphics card.']
];

const SECRET = /(rpa_[A-Za-z0-9]{8,}|hf_[A-Za-z0-9]{8,}|sk-[A-Za-z0-9_-]{8,}|"?token"?\s*[:=]\s*"?[A-Za-z0-9_.-]{12,}"?|[A-Fa-f0-9]{40,}|[A-Za-z0-9_-]{32,})/g;
export const scrub = (text) => String(text || '').replace(SECRET, '[hidden]');

// Where the Forge lives: the model-lab folder next to Bob, or the one set in the Lab.
export function forgeDir(cfg) {
  const set = String(cfg?.forgeDir || '').trim();
  const dir = set || path.join(cfg?.agentDir || '.', 'model-lab');
  return fs.existsSync(path.join(dir, 'forge', 'forge.mjs')) ? dir : '';
}

// The Forge's past runs, newest first: the timeline log, its last lines (scrubbed), and what each run made.
export function forgeRuns(dir, { lines = 8 } = {}) {
  if (!dir) return [];
  const fdir = path.join(dir, 'out', 'forge');
  let logs = []; try { logs = fs.readdirSync(fdir).filter((f) => /^forge-[\d-T]+\.log$/.test(f)).sort().reverse(); } catch {}
  return logs.slice(0, 30).map((f) => {
    let text = ''; try { text = fs.readFileSync(path.join(fdir, f), 'utf8'); } catch {}
    const all = text.split(/\r?\n/).filter(Boolean);
    const when = f.slice(6, 16);
    const made = [...new Set([...text.matchAll(/downloaded ([\w.-]+\.gguf)/g)].map((m) => m[1]))];
    const cost = text.match(/\$([0-9]+\.[0-9]{2})(?![\s\S]*\$[0-9]+\.[0-9]{2})/)?.[1] || '';
    const state = /all Bobs downloaded|counts downloaded|teacher scores downloaded/.test(text) ? 'done' : /stopped|failed|cap/.test(all.at(-1) || '') ? 'stopped' : 'unknown';
    return { id: f.replace(/\.log$/, ''), when, state, made, cost: cost ? Number(cost) : null, tail: all.slice(-lines).map(scrub) };
  });
}

// The brains the Forge brought home, with their teaching-back report in plain numbers.
export function forgeBrains(dir) {
  if (!dir) return [];
  const bdir = path.join(dir, 'out', 'bobs');
  let names = []; try { names = fs.readdirSync(bdir, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name); } catch {}
  return names.map((n) => {
    let rep = null; try { rep = JSON.parse(fs.readFileSync(path.join(bdir, n, 'heal-report.json'), 'utf8')); } catch {}
    let files = []; try { files = fs.readdirSync(path.join(bdir, n)).filter((f) => f.endsWith('.gguf')); } catch {}
    const ce = (x) => (typeof x?.lessons?.ce === 'number' ? Math.round(x.lessons.ce * 1000) / 1000 : null);
    return { name: n, files, experts: rep?.experts || '', before: ce(rep?.before), after: ce(rep?.after), floor: typeof rep?.before?.lessons?.teacher_ce === 'number' ? Math.round(rep.before.lessons.teacher_ce * 1000) / 1000 : null, steps: rep?.steps || null, planned: rep?.planned_steps || null };
  }).sort((a, b) => a.name.localeCompare(b.name));
}

// The Forge's own plan files, as starting points for a new one (name and a short note only on screen).
export function forgePlans(dir) {
  if (!dir) return [];
  const pdir = path.join(dir, 'forge', 'plans');
  let files = []; try { files = fs.readdirSync(pdir).filter((f) => f.endsWith('.json')); } catch {}
  return files.map((f) => { try { const p = JSON.parse(fs.readFileSync(path.join(pdir, f), 'utf8')); return { id: f.replace(/\.json$/, ''), rungs: (p.rungs || []).map((r) => r.nickname || r.name), note: String(p.note || '').slice(0, 300) }; } catch { return null; } }).filter((p) => p && p.rungs.length);
}

const RUNG_KEYS = ['name', 'nickname', 'from', 'keep', 'keep_n', 'cover', 'max', 'keep_file', 'experts', 'hours', 'fold'];
const QUANTS = ['Q4_K_M', 'Q3_K_M', 'Q5_K_M', 'Q6_K', 'Q8_0'];
const word = (v, max = 40) => String(v ?? '').replace(/[^\w .-]/g, '').trim().slice(0, max);
const num = (v, lo, hi) => { const n = Number(v); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : null; };

// The form's answers as a plan in the shape forge.mjs and pod/run.sh read (rules from the blend thread, 9 Nov):
// strong and strong_cover sit at the top, never in a rung; keep_file is an absolute path; heal hours are set above the
// estimate so a full pass is never cut short; caps start at 0 and a plan with 0 caps is never handed to forge.mjs.
// What to teach -> the lesson writer's jobs (model-lab/write-lessons.mjs JOBS), split evenly inside each.
export const TEACH_JOBS = { answers: ['chat', 'advice', 'knowledge', 'maths', 'science'], tools: ['reminders', 'memory', 'web', 'pictures', 'files', 'office', 'run', 'schedules', 'apps'], coding: ['coding'], writing: ['writing'] };
export function makeForgePlan(form = {}, { base = {}, keepFiles = [], lessonSets = [], pairsSets = [] } = {}) {
  const problems = [], notes = [];
  const plan = { ...base };
  delete plan.hours_max; delete plan.dollars_max; delete plan.benchmark; // never carried over: caps are typed, commands are fixed templates
  plan.run = word(form.run) || 'lab-plan';
  const rungs = (Array.isArray(form.rungs) ? form.rungs : []).slice(0, 4).map((r, i) => {
    const out = { name: word(r.name, 24) || `rung${i + 1}`, from: i === 0 ? 'teacher' : (word(r.from, 24) || 'teacher') };
    if (r.nickname) out.nickname = word(r.nickname, 24);
    if (r.how === 'file') {
      const f = keepFiles.find((k) => k.id === r.keepFile);
      if (!f) problems.push(`${out.name}: pick a keep file from the Lab.`); else { out.keep_file = path.resolve(f.path); out.keep = f.experts; }
    } else if (r.how === 'cover') {
      out.keep = 'cover'; const n = num(r.keep, 4, 256); if (n) out.keep_n = Math.round(n);
      if (!plan.skills) problems.push(`${out.name}: keeping every skill covered needs a plan with a skills list; start from one of the Forge's plans.`);
    } else { const n = num(r.keep, 4, 256); if (!n) problems.push(`${out.name}: how many experts to keep in each layer?`); else out.keep = Math.round(n); }
    return out;
  });
  if (!rungs.length) problems.push('Add at least one brain to make.');
  // 1.5.163 The brain to start from, and lessons from anywhere. Only names, paths and the licence word go in the plan.
  // Keys locked with the forge thread (9 Nov): teacher = Hugging Face repo (downloaded on the card), teacher_revision,
  // teacher_model = a brain the Forge made, already on its drive; teacher_local = a folder here, uploaded first (new key,
  // not read by the Forge yet, so such a plan saves but can't start). hf_lessons = sets the Forge's importer brings in
  // before the run (repo or path); extra_lessons = folders here the Forge uploads as they are.
  const lic = (x) => String(x || '').replace(/[^\w.+-]/g, '').slice(0, 60);
  const brain = form.brain || {}, src = brain.source || null;
  const cleanPath = (p) => { const v = String(p || '').replace(/[\r\n\0]/g, '').trim().slice(0, 400); return v && (path.isAbsolute(v) || /^[A-Za-z]:[\\/]/.test(v)) ? v : ''; }; // full paths only, Windows or not
  const okLink = (u) => /^https:\/\/[\w.-]+(\/[^\s"'<>]*)?$/.test(String(u || '')) && String(u).length <= 400;
  delete plan.teacher_local;
  if (form.brain === undefined) { /* no chooser sent (another Lab page handing over a plan): the Forge plan's own teacher stays */ }
  else if (!brain.pick) problems.push('Choose the brain to start from.');
  else if (/^forge:/.test(brain.pick)) {
    const name = word(brain.pick.slice(6), 40);
    if (!name) problems.push('Choose the brain to start from.');
    else { plan.teacher_model = `bobs/${name}/model`; delete plan.train_teacher; delete plan.publish; notes.push(`${name} was made by the Forge, so its full-size weights are already on the Forge's drive.`); }
  } else if (brain.pick === 'source') {
    if (!src) problems.push('Say where the brain is: paste its name, path or link.');
    else if (src.kind === 'hf') {
      if (src.unchecked) problems.push('Press Look it up on the Hugging Face brain first, so the Lab can read its card.');
      const r = src.unchecked ? null : parseHfRef(src.revision ? `hf:${src.repo}@${src.revision}` : src.repo, 'model');
      if (!src.unchecked && (!r || r.kind !== 'model')) problems.push('The Hugging Face brain isn\'t a name the Lab can read. Look it up again.');
      if (r) {
        plan.teacher = r.repo; if (r.revision) plan.teacher_revision = r.revision; else delete plan.teacher_revision;
        // teacher_model is a trained teacher already on the Forge's drive: never for a fresh brain (the forge thread, 9 Nov).
        delete plan.teacher_model; delete plan.teacher_gguf; delete plan.train_teacher; delete plan.publish;
        plan.teacher_license = lic(src.license) || 'none';
        // The base plan's counts file stays only because forge.mjs uploads one; it belongs to another brain, so every cut
        // must be "keep every skill covered", which counts this brain's experts on the card first, then cuts.
        if (src.moe === false) problems.push(`${r.repo} isn't a mixture of experts, so it can't be cut by experts.`);
        if (rungs.some((x) => x.keep !== 'cover')) problems.push(`${r.repo}'s experts haven't been counted yet. For each brain, pick "Keep every skill covered": the Forge counts its experts on the rented card first, then cuts.`);
        if (plan.teacher_license === 'none') notes.push(`${r.repo} has no licence on its card, so there\'s no clear right to share what you make from it: keep it private.`);
      }
    } else if (src.kind === 'local') {
      const p = cleanPath(src.value);
      if (!p) problems.push('The brain\'s path has to be a full path on this replicant matrix, like C:\\brains\\my-brain on Windows or /home/you/brains/my-brain on Mac and Linux.');
      else if (/\.gguf$/i.test(p)) problems.push('That is a running file (GGUF). The Forge needs the full-size weights (a folder of safetensors) to teach or cut a brain.');
      else { plan.teacher_local = p; delete plan.teacher_model; delete plan.train_teacher; delete plan.publish; if (rungs.some((x) => x.keep !== 'cover')) problems.push('A brain from this replicant matrix hasn\'t been counted yet. For each brain, pick "Keep every skill covered".'); notes.push('A brain from this replicant matrix is uploaded to the rented card before the run. The Forge can\'t take one yet, so this plan can be saved but not started until the Forge update.'); }
    } else if (src.kind === 'link') {
      if (!okLink(src.value)) problems.push('A brain at a link needs a full https link.');
      else { plan.teacher_url = String(src.value); delete plan.teacher_model; delete plan.train_teacher; delete plan.publish; notes.push('The Forge can\'t fetch a brain from a plain link yet, so this plan can be saved but not started until the Forge update.'); if (rungs.some((x) => x.keep !== 'cover')) problems.push('A brain from a link hasn\'t been counted yet. For each brain, pick "Keep every skill covered".'); }
    } else problems.push('Say where the brain is.');
  } else problems.push('Choose the brain to start from.');
  if (brain.pick !== 'source' || src?.kind !== 'link') delete plan.teacher_url;
  // Lessons: the Lab's own sets go as folders the Forge uploads; sets from elsewhere go to the importer first.
  const ownSets = (Array.isArray(form.lessonSets) ? form.lessonSets : []).map((id) => lessonSets.find((x) => x.id === id)).filter(Boolean);
  for (const x of ownSets) { // the lesson library: parts ticked off, or a part taught as its own thinking path
    if (x.picked === 0) problems.push(`${x.name}: every part is ticked off, so no lessons are left. Tick at least one category, source and way of thinking.`);
    else if (Number.isFinite(x.total) && x.picked < x.total) notes.push(`${x.name}: ${x.picked} of ${x.total} lessons picked.`);
    if (x.pathName) notes.push(`${x.name}: its lessons that show their thinking are tagged "Think: ${x.pathName}", so the brain thinks that way when a chat asks for it.`);
    if (x.privateOnly) notes.push(`${x.name} came with no licence, so there's no clear right to share what you make from it: keep it private.`);
  }
  const extra = [...(Array.isArray(base.extra_lessons) ? base.extra_lessons : []), ...ownSets.map((x) => path.resolve(x.dir))];
  if (extra.length) plan.extra_lessons = [...new Set(extra)]; else delete plan.extra_lessons;
  const imports = [];
  for (const x of (Array.isArray(form.lessons) ? form.lessons : []).slice(0, 8)) {
    if (imports.length >= 4) { problems.push('One run can add at most four lesson sets from elsewhere.'); break; }
    if (!x) continue;
    if (x.kind === 'hf') {
      if (x.unchecked) { problems.push('Press Look it up on each lesson set from Hugging Face first.'); continue; }
      const r = parseHfRef(`hf:datasets/${x.repo || ''}${x.file ? `:${x.file}` : ''}${x.revision ? `@${x.revision}` : ''}`);
      if (!r || r.kind !== 'dataset') { problems.push('One lesson set from Hugging Face isn\'t a name the Lab can read.'); continue; }
      imports.push({ repo: r.repo, ...(r.file ? { file: r.file } : {}), ...(r.revision ? { revision: r.revision } : {}), license: lic(x.license) || 'none', ...(lic(x.license) ? {} : { private_only: true }) });
    } else if (x.kind === 'local') {
      const p = cleanPath(x.value);
      if (!p) { problems.push('A lesson file here needs its full path, like C:\\lessons\\mine.jsonl.'); continue; }
      if (!/\.(jsonl|json|csv|parquet)$/i.test(p) && path.extname(p)) { problems.push(`${path.basename(p)}: the Forge reads .jsonl, .json, .csv and .parquet lesson files, or a folder of them.`); continue; }
      imports.push({ path: p, license: 'none', private_only: true });
    } else if (x.kind === 'link') {
      if (!okLink(x.value)) { problems.push('A lesson set at a link needs a full https link to the file.'); continue; }
      imports.push({ url: String(x.value), license: 'none', private_only: true });
    }
  }
  if (imports.length) {
    plan.hf_lessons = imports;
    notes.push('New lessons change what the teacher scores, so its scoring pass starts over and takes longer.');
    if (imports.some((l) => l.private_only)) notes.push('A lesson set with no licence on its card gives no clear right to share what you make from it: keep it private. The set itself is never uploaded anywhere.');
  } else delete plan.hf_lessons;
  if (ownSets.length) notes.push(`${ownSets.length} lesson set${ownSets.length === 1 ? '' : 's'} from the Lab go${ownSets.length === 1 ? 'es' : ''} up to the card with the plan's own lessons.`);
  plan.rungs = rungs;
  const strong = (Array.isArray(form.strong) ? form.strong : []).map((s) => word(s, 20)).filter((s) => plan.skills && s in plan.skills);
  if (strong.length) { plan.strong = strong; plan.strong_cover = 0.99; } else { delete plan.strong; delete plan.strong_cover; }
  const quants = (Array.isArray(form.quants) ? form.quants : ['Q4_K_M']).filter((q) => QUANTS.includes(q));
  plan.quants = (quants.length ? quants : ['Q4_K_M']).join(',');
  const experts = ['lora', 'full', 'frozen'].includes(form.heal?.experts) ? form.heal.experts : 'lora';
  const epochs = num(form.heal?.epochs, 0.25, 3) || 1;
  // Per rung: the estimate for one full pass at its size, and the hard stop set a third above it.
  const est = rungs.map((r) => rentedEstimate({ experts: typeof r.keep === 'number' ? r.keep : r.keep_n || 208, files: plan.quants.split(','), benchmark: false, scoresCached: true }));
  rungs.forEach((r, i) => { const teach = est[i].parts.find((p) => /^Teach it back/.test(p.what))?.hours || 2.5; r.hours = Math.max(num(form.heal?.hours, 0.5, 48) || 0, Math.ceil(teach * epochs * 1.33 * 2) / 2); });
  plan.heal = { experts, epochs };
  // 1.5.160 What to teach, and the way of thinking (design sections 11 and 12; heal keys locked with the forge thread).
  const shares = (obj, ids) => Object.fromEntries(ids.map((id) => [id, Math.round(num(obj?.[id], 0, 100) || 0)]).filter(([, v]) => v > 0));
  // Locked with the forge thread: plan.teach holds only thinking (how often it thinks first, 0-100) and voice
  // (persona strength, 0-100). Answers, tools, coding and writing are weights on the lesson writer's jobs.
  // Shares in a group (the jobs, the paths, each personality row) are normalised to sum to 100; an all-0 group is left out.
  const norm = (o) => { const t = Object.values(o).reduce((a, x) => a + x, 0); if (!t) return {}; const out = Object.fromEntries(Object.entries(o).map(([k, v]) => [k, Math.round((v * 100) / t)])); return Object.fromEntries(Object.entries(out).filter(([, v]) => v > 0)); };
  const asked = shares(form.teach, TEACH.map(([id]) => id));
  const teach = Object.fromEntries(['thinking', 'voice'].filter((k) => asked[k]).map((k) => [k, asked[k]]));
  if (Object.keys(teach).length) plan.teach = teach; else delete plan.teach;
  const jobs = {};
  for (const [k, list] of Object.entries(TEACH_JOBS)) if (asked[k]) for (const j of list) jobs[j] = (jobs[j] || 0) + asked[k] / list.length;
  const jw = norm(jobs);
  if (Object.keys(jw).length) plan.jobs = jw; else delete plan.jobs;
  const th = form.thinking || {};
  const paths = (Array.isArray(th.paths) ? th.paths : []).slice(0, 12).map((x) => ({ p: pathByName(String(x.name || '')), share: Math.round(num(x.share, 0, 100) || 0) })).filter((x) => x.p && x.share > 0).map((x) => ({ name: x.p.name, style: x.p.style, share: x.share }));
  const own = String(th.own || '').replace(/[\r\n]+/g, ' ').trim().slice(0, 200);
  const ownShare = Math.round(num(th.ownShare, 0, 100) || 0);
  if (own && ownShare) paths.push({ name: 'Your own path', style: own, share: ownShare });
  { const n = norm(Object.fromEntries(paths.map((x, i) => [i, x.share]))); paths.forEach((x, i) => { x.share = n[i] || 0; }); }
  for (let i = paths.length - 1; i >= 0; i--) if (!paths[i].share) paths.splice(i, 1);
  const pers = {};
  for (const row of ['alignment', 'rules', 'mood']) { const v = shares(th.personality?.[row], PERSONALITY[row].map(([id]) => id)); const nv = norm(v); if (Object.keys(nv).length) pers[row] = nv; }
  if (teach.thinking && !paths.length && !Object.keys(pers).length) problems.push('Thinking is ticked under What to teach: pick at least one thought path or personality.');
  if (paths.length || Object.keys(pers).length) {
    const mode = ['blend', 'switch', 'both'].includes(th.mode) ? th.mode : 'blend';
    plan.thinking = { mode, paths, ...(Object.keys(pers).length ? { personality: pers } : {}) };
    if (mode !== 'switch') for (const [a, b] of clashes(Object.fromEntries(paths.map((x) => [x.name, x.share])))) notes.push(`${a} and ${b} pull against each other when both are above 30% in a blend. Lower one, or teach them as a switch.`);
    if (mode !== 'switch' && pers.mood && Object.keys(pers.mood).length > 1) notes.push('Moods mixed in a blend just sound confused. Teach them as a switch.');
  } else delete plan.thinking;
  const learn = ['answer', 'thinking', 'both'].includes(form.heal?.learn) ? form.heal.learn : 'answer';
  if (learn !== 'answer') { plan.heal.learn = learn; plan.heal.thinking_weight = num(form.heal?.thinking_weight, 0.05, 2) || 0.5; }
  if (form.heal?.odds_cover === 'both') { plan.heal.odds_cover = 'both'; notes.push('The teacher scores the thinking too: that pass takes much longer, fewer lessons fit in its time box, and saved teacher scores from earlier runs can\'t be reused, so it starts over.'); }
  // 13 Nov the training protocol's rented steps (draft PR #201), each off unless picked here.
  waysToPlan(form.ways || {}, { plan, problems, notes, pairsSets, rungs });
  const hours = Math.round(rungs.reduce((a, r) => a + r.hours, 0) + 1.5 + (plan.grpo ? plan.grpo.hours * rungs.length : 0));
  plan.hours_max = num(form.hours_max, 0, 72) || 0;
  plan.dollars_max = num(form.dollars_max, 0, 500) || 0;
  if (!plan.hours_max || !plan.dollars_max) notes.push('The caps are 0, so this plan can be saved and read but never started. Type the hours and dollars you\'ll allow before a run.');
  else if (plan.hours_max < hours) problems.push(`The time cap is ${plan.hours_max} hours, but the teaching back alone needs about ${hours}. Raise the cap, or make fewer brains in one run.`);
  plan.note = `Written in Bob's Computer Science Lab${form.note ? `: ${String(form.note).replace(/[\r\n]+/g, ' ').slice(0, 300)}` : ''}.`;
  return { plan, problems, notes, hours, estimate: est };
}

// Only these fields are read per rung by run.sh; anything else in a rung is a mistake.
export const rungFieldsOk = (plan) => (plan.rungs || []).every((r) => Object.keys(r).every((k) => RUNG_KEYS.includes(k)));

export const forgePlansDir = (labDirPath) => path.join(labDirPath, 'forge-plans');

// ---- Slice C: start a Forge run from the Lab ----
// The owner presses the purchase card; only then does the Lab start forge.mjs and answer its own "Type yes to rent
// now" with yes. The caps on the card must match the plan's, so the press is for exactly what was shown. The run is
// its own process, detached, so it keeps going (and its card keeps its self-destruct timer) if Bob closes.
export const FORGE_KEY = 'RUNPOD_API_KEY';
// What the Forge says is on its drive: out/forge/drive.json { models: ["bobs/28Bob/model", ...] } (the forge thread writes
// it when a run ends). A brain the Forge made can only start a run if its full weights are really there, or the card
// would be rented and then stop at once.
export function onDrive(dir) { try { const j = JSON.parse(fs.readFileSync(path.join(dir, 'out', 'forge', 'drive.json'), 'utf8')); return Array.isArray(j.models) ? j.models.map(String) : []; } catch { return []; } }
export function forgeStartProblems({ plan, allowed, hasKey, shown = {}, running = false, found = true, importer = false, drive = [], senses = false }) {
  const p = [];
  if (!found) p.push('The Forge isn\'t next to this copy of Bob.');
  if (!allowed) p.push('Starting Forge runs from the Lab is off. Turn on "Let the Lab start Forge runs" first.');
  if (!hasKey) p.push(`There's no ${FORGE_KEY} for the rental service. Settings > Rented brains says how to add it; it stays in your environment, never in Bob's files.`);
  if (running) p.push('A Forge run is already going. One at a time.');
  if (!plan) { p.push('That plan isn\'t saved.'); return p; }
  if (!(Number(plan.hours_max) > 0) || !(Number(plan.dollars_max) > 0)) p.push('This plan\'s caps are 0. Type the hours and dollars you\'ll allow and save it again.');
  else if (Number(shown.hours) !== Number(plan.hours_max) || Number(shown.dollars) !== Number(plan.dollars_max)) p.push('The caps changed since the card was shown. Look at the card again.');
  if (!Array.isArray(plan.rungs) || !plan.rungs.every((r) => r.hours > 0)) p.push('Every brain in the plan needs a time limit; save the plan again from the form.');
  // 1.5.163 lessons from Hugging Face are downloaded and converted on this side before the run; until the Forge's
  // lesson importer is here, a plan that names them never starts (so they're never silently left out).
  if (plan.teacher_model && !drive.includes(String(plan.teacher_model))) p.push(`The Forge's record of its drive doesn't show the full weights of ${String(plan.teacher_model).split('/')[1] || 'that brain'} there, and a run that starts without them would rent a card and stop at once. Pick another brain, or wait for the Forge to rebuild them.`);
  if (plan.teacher_local || plan.teacher_url) p.push('This plan starts from a brain on this replicant matrix or at a link, and the Forge can\'t take one of those yet. Pick a brain the Forge made or one on Hugging Face, or wait for the Forge update.');
  if (Array.isArray(plan.hf_lessons) && plan.hf_lessons.length && !importer) p.push('This plan has lessons from Hugging Face, and the Forge\'s lesson importer isn\'t on this replicant matrix yet. Remove them, or wait for the Forge update.');
  // Give it eyes / Give it ears: a Sharpen plan (plan.senses) never starts until the Forge says it can teach a brain to
  // see or hear (model-lab/forge/senses.mjs is there). Until then it can be saved, never run.
  if (plan.senses && !senses) p.push('This is a Sharpen plan (eyes or ears), and the Forge can\'t teach a brain to see or hear yet. It stays saved until the Forge update.');
  return p;
}

export function launchForge({ dir, planFile, env = {}, node = process.execPath, nodeEnv = {}, spawnFn, logTo }) {
  const fd = fs.openSync(logTo, 'a');
  const c = spawnFn(node, [path.join(dir, 'forge', 'forge.mjs'), '--plan', planFile], { cwd: path.join(dir, 'forge'), stdio: ['pipe', fd, fd], detached: true, windowsHide: true, env: { ...process.env, ...nodeEnv, ...env } });
  c.stdin.write('yes\n'); // the owner's press on the purchase card is the yes; the pipe stays open until it's read
  const t = setTimeout(() => { try { c.stdin.end(); } catch {} }, 10 * 60 * 1000); t.unref?.();
  c.unref?.();
  fs.closeSync(fd);
  return c.pid;
}

export const alive = (pid) => { if (!pid) return false; try { process.kill(pid, 0); return true; } catch (e) { return e.code === 'EPERM'; } };

// The pod this run started, from the Forge's own per-run record (the token itself is never read out). Stop always
// names this id: a bare --kill would delete every Forge card.
export function runPodId(dir, run = '') {
  const per = run ? `pod-token-${String(run).replace(/[^\w.-]/g, '_')}.json` : '';
  for (const f of [per, 'pod-token.json'].filter(Boolean)) { // per-run record first, plain one is the old fallback
    try {
      const j = JSON.parse(fs.readFileSync(path.join(dir, 'out', 'forge', f), 'utf8')); if (/^[a-z0-9]{6,32}$/i.test(j.pod || '')) return j.pod; } catch {} }
  return '';
}

// 13 Nov New ways to teach, written into the plan's keys the pod reads (run.sh): heal.pref + pref (pairs folder made here
// by make-pairs.mjs), heal.onpolicy, grpo, targets, surgery. Every one is off unless picked, and every one only runs on
// the owner's press of the purchase card. Surgery edits are baked into every brain the run makes, so they're shown back.
export const PREF_KINDS = ['orpo', 'dpo', 'kto'];
export function waysToPlan(w = {}, { plan, problems, notes, pairsSets = [], rungs = [] }) {
  for (const k of ['pref', 'grpo', 'targets', 'surgery']) delete plan[k];
  if (plan.heal) { delete plan.heal.pref; delete plan.heal.onpolicy; }
  if (PREF_KINDS.includes(w.pref)) {
    const ps = pairsSets.find((x) => x.id === String(w.pairs || ''));
    if (!ps) problems.push('Right-vs-wrong pairs: pick the pairs to learn from (make them on this page first, under The training protocol).');
    else {
      plan.pref = path.resolve(ps.path); plan.heal = { ...(plan.heal || {}), pref: { kind: w.pref } };
      if (w.pref !== 'kto' && !ps.pairs) problems.push(`${ps.id} has no pairs, only marked answers. Pick KTO, which learns from those, or make pairs from a set with wrong answers kept.`);
      notes.push(`${w.pref.toUpperCase()} on ${ps.id} (${ps.pairs} pairs, ${ps.marked} marked answers).${w.pref === 'orpo' ? ' It mixes into the teaching back, with no second brain.' : ' A short pass after the teaching back.'} The held-out chats are measured, never learned.`);
    }
  }
  const op = Number(w.onpolicy) || 0;
  if (op > 0) {
    if (op > 50) problems.push('On-policy teaching: at most 50% of the lessons.');
    else { plan.heal = { ...(plan.heal || {}), onpolicy: { frac: Math.round(op) / 100 } }; notes.push('On-policy teaching needs the teacher on the same card as the small Bob, so it suits brains of 20 GB and under on the usual card.'); }
  }
  if (w.grpo === true) {
    const h = Number(w.grpoHours); plan.grpo = { hours: Number.isFinite(h) && h >= 0.25 && h <= 6 ? h : 1.5 };
    notes.push('Reward pass on tool calls: kept for a brain only if its held-out grade is no worse and no target drops. It adds its hours to each brain.');
  }
  const targets = {};
  for (const t of (Array.isArray(w.targets) ? w.targets : []).slice(0, 8)) {
    const name = String(t?.name || '').replace(/[^\w-]/g, '').slice(0, 24), jobs = String(t?.jobs || '').split(',').map((x) => x.trim().replace(/[^\w.-]/g, '')).filter(Boolean).slice(0, 40), weight = Number(t?.weight);
    if (!name && !jobs.length) continue;
    if (!name || !jobs.length) { problems.push('Each target needs a name and at least one kind of lesson (job).'); continue; }
    if (!(weight >= 0 && weight <= 5)) { problems.push(`Target ${name}: a weight from 0 to 5.`); continue; }
    for (const j of jobs) { const other = Object.entries(targets).find(([, x]) => x.jobs.includes(j)); if (other) problems.push(`${j} is in two targets (${other[0]} and ${name}). Each kind of lesson belongs to one.`); }
    targets[name] = { jobs, weight };
  }
  if (Object.keys(targets).length) { plan.targets = targets; notes.push(`${Object.keys(targets).length} targets, each with its own weight and its own grade in every report.`); }
  const sx = String(w.surgery || '').trim();
  if (sx) {
    let edits = null; try { const j = JSON.parse(sx); edits = Array.isArray(j) ? j : j.edits; } catch { problems.push('Surgery edits: that isn\'t readable JSON. Paste the edits list, like [{"layer": 12, "expert": 37, "scale": 0.8}].'); }
    if (Array.isArray(edits)) {
      const ok = edits.slice(0, 64).filter((e) => Number.isInteger(e?.layer) && e.layer >= 0 && Number(e.scale) >= 0 && Number(e.scale) <= 8 && (Number.isInteger(e.head) || Number.isInteger(e.expert) || e.expert === 'shared') && (e.neuron === undefined || Number.isInteger(e.neuron)));
      if (ok.length !== edits.length) problems.push('Surgery edits: each needs a layer, an expert (a number or "shared") or a head, an optional neuron, and a scale from 0 to 8.');
      else if (ok.length) { plan.surgery = { edits: ok.map((e) => ({ layer: e.layer, ...(Number.isInteger(e.head) ? { head: e.head } : { expert: e.expert }), ...(e.neuron !== undefined ? { neuron: e.neuron } : {}), scale: Number(e.scale) })) }; notes.push(`${ok.length} surgery edit${ok.length === 1 ? '' : 's'} will be baked into every brain this run makes (${rungs.map((r) => r.name).join(', ') || 'none yet'}). Bake only edits a sweep showed help and hurt nothing; pressing Start is your go.`); }
    }
  }
}

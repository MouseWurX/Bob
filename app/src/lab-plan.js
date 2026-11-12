// The Lab's plans: the steps a cut recipe makes, lesson skills, lesson sets, writing lessons and building them from
// the owner's own files. Split out of lab.js (which still exports all of it).
import path from 'node:path';
import { PARTS } from './lab-test.js';
import fs from 'node:fs';
import { readJson as vaultJson } from './vault.js';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { SKILL_IDS } from './lab-skills.js';
import { ADDED_FILE, partsOf } from './lab-library.js';
import { KIND_IDS } from './lab-build-kinds.js';
import { cleanRecipe, slugOf, labDir, readJson, inspect } from './lab-measure.js';

// The steps a recipe makes, and what's wrong with it (problems stop it; notes don't). Every step has the command it
// runs (for Show the recipe) and, for the cutter, a plain line saying it's Bob's own.
export function planRecipe(recipe, { brain, facts, tools, outDir, skillNamesFor = () => [] }) {
  const r = cleanRecipe(recipe);
  const problems = [], notes = [], steps = [];
  if (!brain) return { recipe: r, problems: ['Pick a brain to start from.'], notes, steps };
  if (!r.name) problems.push('Give the new brain a name.');
  const slug = slugOf(r.name || brain.name);
  const dir = path.join(outDir, slug);
  const q = (p) => (/\s/.test(p) ? `"${p}"` : p);
  const s = r.smaller;
  if (!s.sight && !s.hearing && !s.cut && !s.files.length) problems.push('Pick at least one way to make it smaller in step 3.');
  if (s.sight && !facts.sight) problems.push(`${brain.name} can't see pictures, so there's no sight to take out.`);
  if (s.hearing && !facts.hearing) problems.push(`${brain.name} can't hear sound, so there's no hearing to take out.`);
  if (s.cut && !facts.experts) problems.push(`${brain.name} isn't a mixture-of-experts brain, so it has no experts to cut.`);
  if (s.cut && facts.groups > 1) problems.push(`${brain.name} groups its experts, and the Lab can't cut those yet.`);
  if (s.cut && facts.experts && !(s.cut.how === 'cover' && !s.cut.keep) && (s.cut.keep < facts.used || s.cut.keep >= facts.experts)) problems.push(`Keep between ${facts.used} and ${facts.experts - 1} experts per layer (this brain picks ${facts.used} for every word).`);
  if (s.files.length && !facts.fullSize) problems.push(`${brain.name}'s file is already a running file (${facts.fileType}). Making running files needs the full-size copy (F16 or BF16). Untick Make the running files, or start from a full-size copy.`);
  if (s.files.includes('Q3_K_M')) notes.push('Q3 is only worth it for brains meant for 8 GB or less.');
  if (s.cut?.how === 'busiest' && r.lessons.kind === 'none') problems.push('Keeping the busiest experts needs lessons to count them on. Pick a lesson set in step 2, or use an expert list you have.');
  if (s.cut?.how === 'cover' && r.lessons.kind === 'none') problems.push('Keeping every skill covered needs lessons to count each skill on. Pick a lesson set in step 2.');
  const skills = s.cut?.how === 'cover' && r.lessons.kind !== 'none' ? lessonSkillNames(r.lessons, skillNamesFor) : [];
  if (s.cut?.how === 'cover' && r.lessons.kind !== 'none' && skills.length === 1) notes.push(`These lessons have one skill (${skills[0]}), so the coverage cut keeps what that one needs. A lesson set with several skills (a "job" or "skill" on each lesson) protects each of them.`);
  if (s.cut?.how === 'cover') for (const x of s.cut.strong) if (!skills.includes(x)) problems.push(`There's no skill called ${x} in these lessons.`);
  if (s.cut?.how === 'file' && !s.cut.file) problems.push('Pick the expert list file.');
  if (s.cut?.fold && facts.experts && !facts.fullSize) problems.push(`Folding blends the experts' numbers, so it needs the full-size file (F16 or BF16), and ${brain.name}'s file is a running file (${facts.fileType}). Start from the full-size copy, or untick Fold the rest in.`);
  if (r.lessons.kind === 'file' && !r.lessons.file) problems.push('Pick the lesson file.');
  for (const [k, p] of Object.entries(tools)) if (!p.found && ((k === 'imatrix' && s.cut?.how === 'busiest') || (k === 'quantize' && s.files.length) || k === 'server')) problems.push(`${path.basename(p.path)} isn't in Bob's engine folder. Settings, Engines, Bob's own engine has it; download the engine again if it's missing.`);

  let file = brain.gguf;
  if (s.cut?.how === 'busiest') {
    const corpus = path.join(dir, 'lessons.txt'), counts = path.join(dir, 'counts.gguf');
    steps.push({ id: 'lessons', label: r.lessons.kind === 'chats' ? 'Gather your chats with Bob as lessons' : 'Read the lesson set', cmd: `# Bob writes the lessons as one text file: ${q(corpus)}`, corpus });
    steps.push({ id: 'count', label: 'Count which experts the lessons use', cmd: `${q(tools.imatrix.path)} -m ${q(brain.gguf)} -f ${q(corpus)} -o ${q(counts)} -c 4096 --chunks ${r.lessons.chunks} --fit on`, corpus, counts, card: true });
  } else if (s.cut?.how === 'cover' && skills.length) {
    // The coverage cut: one lesson file and one count per skill, then a keep list that holds every skill's share.
    const corpus = path.join(dir, 'lessons.txt');
    const corpora = skills.map((sk) => ({ skill: sk, file: path.join(dir, `lessons-${slugOf(sk)}.txt`) }));
    steps.push({ id: 'lessons', label: 'Sort the lessons by skill', cmd: `# Bob writes one text file per skill (${skills.join(', ')}) and one with them all: ${q(corpus)}`, corpus, corpora });
    for (const c of corpora) {
      const counts = path.join(dir, `counts-${slugOf(c.skill)}.gguf`);
      steps.push({ id: 'count', label: `Count which experts ${c.skill} uses`, cmd: `${q(tools.imatrix.path)} -m ${q(brain.gguf)} -f ${q(c.file)} -o ${q(counts)} -c 4096 --chunks ${r.lessons.chunks} --fit on`, corpus: c.file, counts, skill: c.skill, card: true });
    }
  }
  if (s.try) {
    // Try it first: Brain Engine runs the whole brain with only the kept experts switched on, so the Lab test shows
    // what the cut will do before any file is written. The same run, with every expert on, is the "before" score.
    if (!tools.brainEngine?.found) problems.push('Try it first needs Brain Engine, Bob\'s Lab engine, on this replicant matrix. Get it in Settings > Engines: Brain Engine, or untick Try it first.');
    steps.push({ id: 'try', label: 'Try it first: test with only the kept experts switched on', cmd: `${q(tools.brainEngine?.path || 'brain-engine/llama-server')} -m ${q(brain.gguf)} -c 8192 --jinja --fit on\n# the Lab test with every expert on, then POST /expert-mask {"keep": <the keep list>} and the Lab test again${s.tryStop ? '\n# stop here if it scores more than 10 points lower on the Lab test' : ''}`, gguf: brain.gguf, card: true });
  }
  if (s.cut) {
    const out = path.join(dir, `${slug}-${s.cut.keep || 'cover'}x.gguf`);
    const n = s.cut.keep || 'the coverage number of';
    steps.push({ id: 'cut', fold: s.cut.fold === true, label: (s.cut.keep ? `Cut to ${s.cut.keep} experts per layer` : 'Cut to the experts every skill needs') + (s.cut.fold ? ', folding the rest in' : ''), cmd: `# Bob's own cutter (no command-line tool does this yet): keep ${n} of ${facts.experts} experts per layer${s.cut.fold ? '\n#   fold, don\'t drop: each other expert is blended into the kept expert whose router row is most alike,\n#   neurons lined up first, each weighing what it\'s used' : ''}\n#   from ${q(brain.gguf)}\n#   to   ${q(out)}${s.cut.how === 'file' ? `\n#   with the expert list ${q(s.cut.file)}` : ''}${s.cut.how === 'cover' ? `\n#   coverage rule: every skill keeps ${Math.round(s.cut.cover * 100)}% of its routing in every layer${s.cut.strong.length ? ` (99% for ${s.cut.strong.join(', ')})` : ''}, the Forge's keep.py rule` : ''}`, src: file, out });
    file = out;
  }
  let reader = brain.mmproj;
  const dropSight = s.sight && facts.sight, dropHearing = s.hearing && facts.hearing;
  if (brain.mmproj && (dropSight || dropHearing)) {
    const keepsOne = (facts.sight && !dropSight) || (facts.hearing && !dropHearing);
    if (!keepsOne) { steps.push({ id: 'reader', label: dropSight && dropHearing ? 'Take out sight and hearing' : dropSight ? 'Take out sight' : 'Take out hearing', cmd: `# The new brain leaves the reader file behind: ${q(brain.mmproj)}`, drop: 'all' }); reader = null; }
    else {
      const out = path.join(dir, `${slug}-reader.gguf`);
      steps.push({ id: 'reader', label: dropSight ? 'Take out sight (hearing stays)' : 'Take out hearing (sight stays)', cmd: `# Bob's own cutter: copy the reader without its ${dropSight ? 'picture' : 'sound'} part\n#   from ${q(brain.mmproj)}\n#   to   ${q(out)}`, src: brain.mmproj, out, drop: dropSight ? 'sight' : 'hearing' });
      reader = out;
    }
  } else if (brain.mmproj && (s.cut || s.files.length)) {
    const out = path.join(dir, `${slug}-reader.gguf`);
    steps.push({ id: 'reader', label: 'Copy the picture and sound reader', cmd: `# copy ${q(brain.mmproj)} to ${q(out)}`, src: brain.mmproj, out, drop: 'none' });
    reader = out;
  }
  // Measure before making the running files: an importance matrix from the CUT file (expert counts change in a cut,
  // so one made on the source brain doesn't line up), passed to llama-quantize so the running files lose less.
  let imatrix = null;
  if (s.measure && s.files.length) {
    if (r.lessons.kind === 'none') problems.push('Measuring before making the running files needs lessons to measure on. Pick a lesson set in step 2, or untick Measure.');
    else {
      const corpus = path.join(dir, 'lessons.txt');
      if (!steps.some((x) => x.id === 'lessons')) steps.unshift({ id: 'lessons', label: r.lessons.kind === 'chats' ? 'Gather your chats with Bob as lessons' : 'Read the lesson set', cmd: `# Bob writes the lessons as one text file: ${q(corpus)}`, corpus });
      imatrix = path.join(dir, 'imatrix.gguf');
      steps.push({ id: 'imatrix', label: 'Measure which weights matter most', cmd: `${q(tools.imatrix.path)} -m ${q(file)} -f ${q(corpus)} -o ${q(imatrix)} -c 4096 --chunks ${r.lessons.chunks} --fit on`, src: file, corpus, out: imatrix, card: true });
      if (!tools.imatrix?.found && !problems.some((x) => x.includes(path.basename(tools.imatrix.path)))) problems.push(`${path.basename(tools.imatrix.path)} isn't in Bob's engine folder. Settings, Engines, Bob's own engine has it; download the engine again if it's missing.`);
    }
  }
  const finals = [];
  for (const t of s.files) {
    const out = path.join(dir, `${slug}-${t}.gguf`);
    steps.push({ id: 'quantize', label: `Make the ${t} running file`, cmd: `${q(tools.quantize.path)} ${imatrix ? `--imatrix ${q(imatrix)} ` : ''}${q(file)} ${q(out)} ${t}`, src: file, out, type: t, imatrix });
    finals.push(out);
  }
  if (!finals.length) finals.push(file);
  steps.push({ id: 'test', label: 'Test the new brain', cmd: `${q(tools.server.path)} -m ${q(finals[0])}${reader ? ` --mmproj ${q(reader)}` : ''} -c 8192 --jinja --fit on\n# then the Lab test: ${Object.values(PARTS).join(', ')}`, gguf: finals[0], mmproj: reader, card: true });
  if (r.test.compare && s.try) notes.push(`Try it first already tests ${brain.name} with every expert on, so that's the score to compare with.`);
  if (r.test.compare && !s.try) steps.push({ id: 'compare', label: `Test ${brain.name} too, to compare`, cmd: `${q(tools.server.path)} -m ${q(brain.gguf)} -c 8192 --jinja --fit on`, gguf: brain.gguf, mmproj: null, card: true });
  if (finals[0] === brain.gguf && !s.cut && !s.files.length) notes.push(`The new brain uses ${brain.name}'s own brain file; only the reader changes. Nothing big is copied.`);
  return { recipe: r, problems, notes, steps, slug, dir, finals, reader };
}

// One lesson text from a lesson file (lessons.jsonl from the model lab, or plain text) or from the owner's chats.
export function lessonText(cfg, lessons) { return [...lessonSkills(cfg, lessons).values()].flat().join('\n'); }

// The lessons by skill: a lessons.jsonl line's "skill" or "job" names its skill; chats and plain text are one skill.
export const CHATS_SKILL = 'your chats';
export function lessonSkills(cfg, lessons) {
  const by = new Map();
  let parts = [];
  const add = (role, text) => { if (text && typeof text === 'string') parts.push(`<|im_start|>${role}\n${text}<|im_end|>`); };
  const into = (skill) => { if (!by.has(skill)) by.set(skill, []); parts = by.get(skill); };
  if (lessons.kind === 'chats') {
    into(CHATS_SKILL);
    const dir = path.join(cfg.dataDir, 'sessions');
    let files = []; try { files = fs.readdirSync(dir).filter((f) => /\.json$/.test(f) && !/\.summary\.json$/.test(f)); } catch {}
    for (const f of files) {
      let j = []; try { j = vaultJson(path.join(dir, f), []); } catch {} // 🔒 a locked chat (passcode not typed yet) is left out
      for (const m of Array.isArray(j) ? j : j.messages || []) if (m.role === 'user' || m.role === 'assistant') add(m.role, typeof m.content === 'string' ? m.content : '');
    }
  } else if (lessons.kind === 'file') {
    const raw = fs.readFileSync(lessons.file, 'utf8');
    if (/\.jsonl$/i.test(lessons.file)) {
      for (const line of raw.split(/\r?\n/)) {
        if (!line.trim()) continue;
        let l; try { l = JSON.parse(line); } catch { continue; }
        into(skillOf(l));
        for (const m of l.messages || []) add(m.role === 'tool' ? 'user' : m.role, m.content || (m.tool_calls || []).map((c) => `<tool_call>${c.function?.name}</tool_call>`).join(''));
      }
    } else { into('lessons'); parts.push(raw); }
  }
  for (const [k, v] of by) if (!v.length) by.delete(k);
  return by;
}
export const skillOf = (l) => String(l.skill || l.job || 'lessons').slice(0, 40);

// Skill names for planning, without reading the whole file again on every click (cached by file and its date).
export const skillCache = new Map();
export function lessonSkillNames(lessons, fromFile = () => []) {
  if (lessons.kind === 'chats') return [CHATS_SKILL];
  if (lessons.kind !== 'file' || !lessons.file) return [];
  let st; try { st = fs.statSync(lessons.file); } catch { return []; }
  const key = `${lessons.file}|${st.mtimeMs}|${st.size}`;
  if (!skillCache.has(key)) {
    let names = fromFile(lessons.file);
    if (!names?.length) {
      const set = new Set();
      if (/\.jsonl$/i.test(lessons.file)) { for (const line of fs.readFileSync(lessons.file, 'utf8').split(/\r?\n/)) { if (!line.trim()) continue; try { set.add(skillOf(JSON.parse(line))); } catch {} } }
      else set.add('lessons');
      names = [...set];
    }
    skillCache.set(key, names);
  }
  return skillCache.get(key);
}

// Brain Engine's mask: one list per layer, null for a layer without experts (it keeps them all).
// One entry per layer Brain Engine runs: the guesser's layer at the end (facts.mtp) isn't one of them, so it's left off.
export function maskFor(keep, facts) {
  const n = facts.engineLayers > 0 ? facts.engineLayers : Math.max(facts.layers || 0, keep?.length || 0);
  return Array.from({ length: n }, (_, i) => (Array.isArray(keep?.[i]) ? keep[i] : null));
}

export function run(exe, args, { signal, log }) {
  return new Promise((resolve, reject) => {
    log(`${path.basename(exe)} ${args.join(' ')}`);
    const c = spawn(exe, args, { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
    let tail = '';
    const keep = (d) => { tail = (tail + d).slice(-3000); };
    c.stdout.on('data', keep); c.stderr.on('data', keep);
    const stop = () => { try { c.kill(); } catch {} };
    signal?.addEventListener('abort', stop, { once: true });
    c.once('error', (e) => reject(new Error(`Couldn't start ${path.basename(exe)}: ${e.message}`)));
    c.once('exit', (code) => { signal?.removeEventListener('abort', stop); if (signal?.aborted) reject(new Error('Stopped.')); else if (code === 0) resolve(tail); else reject(new Error(`${path.basename(exe)} stopped (code ${code}): ${tail.split('\n').filter(Boolean).slice(-2).join(' | ')}`)); });
  });
}


// 1.5.143 Lab 2a: write a new lesson set with a teacher brain on this replicant matrix. The lessons land in
// <Bob's data>/lab/lessons/<name>/lessons.jsonl, one skill per lesson ("job"), so the coverage cut can count each one.
export const lessonSetsDir = (cfg) => path.join(labDir(cfg), 'lessons');
export const WRITER = path.join(path.dirname(fileURLToPath(import.meta.url)), 'lab-write.js');
export const SECONDS_PER_LESSON = 25; // a rough guess for a 30B teacher on a 16 GB card; the job shows the real pace
export function cleanWrite(w = {}) {
  return {
    name: String(w.name || '').replace(/[\r\n]/g, ' ').trim().slice(0, 60),
    teacher: String(w.teacher || '').slice(0, 120),
    skills: [...new Set([].concat(w.skills || []).filter((x) => SKILL_IDS.includes(x)))],
    count: Math.max(w.mine === true ? 1 : 100, Math.min(20000, Math.round(Number(w.count) || 500))),
    ...(w.mine === true ? { mine: true } : {}), // Nov 11 Teach it from my mistakes: the ideas are the saved tests, the writer makes none
    think: ['on', 'off', 'half'].includes(w.think) ? w.think : 'half'
  };
}
// A licence that lets the teacher's answers teach another brain. Apache and MIT do; an unknown one is checked by you.
export function teacherLicence(license = '') {
  const l = String(license).toLowerCase();
  if (!l) return { ok: true, note: 'I don\'t know this teacher\'s licence. Check its model card says you may train other brains on what it writes.' };
  if (/non-?commercial|research only|no derivatives|\bnc\b/.test(l)) return { ok: false, note: `This teacher's licence (${license}) doesn't allow it.` };
  if (/apache|mit\b|^mit/.test(l)) return { ok: true, note: '' };
  return { ok: true, note: `Check this teacher's licence (${license}) lets you train other brains on what it writes.` };
}
export function lessonSets(cfg) {
  const root = lessonSetsDir(cfg), out = [];
  let dirs = []; try { dirs = fs.readdirSync(root, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name); } catch {}
  for (const d of dirs) {
    const file = path.join(root, d, 'lessons.jsonl');
    if (!fs.existsSync(file)) continue;
    const built = readJson(path.join(root, d, 'build.json'), null); // a set built from the owner's files (Lab 2c)
    const added = built ? null : readJson(path.join(root, d, ADDED_FILE), null); // a set added from elsewhere (the lesson library)
    const meta = built || added || readJson(path.join(root, d, 'write.json'), {});
    let count = 0; try { count = fs.readFileSync(file, 'utf8').split('\n').filter((x) => x.trim()).length; } catch {}
    out.push({ id: d, name: meta.name || d, file, count, want: meta.count || 0, skills: built ? [...new Set((built.items || []).map((i) => i.skill).filter(Boolean))] : meta.skills || [], teacher: meta.teacherName || '', done: meta.done === true || Boolean(added), built: Boolean(built), kinds: built?.kinds || [], ...(added ? { added: true, source: added.source || '', license: added.license || '', link: added.link || '' } : {}) });
  }
  return out;
}

// A set's parts for the page: each category, source and way of thinking with its count, plus the counts of every
// combination so the page can show how many lessons are left as boxes are ticked off.
export function partsView(dir) {
  const p = partsOf(dir);
  if (!p) return null;
  const list = (o) => Object.entries(o || {}).map(([id, v]) => ({ id, label: v.label, count: v.count })).sort((a, b) => b.count - a.count);
  return { total: p.total, categories: list(p.categories), sources: list(p.sources), thinking: list(p.thinking), cells: p.cells };
}

// ---- Lab 2c: a lesson set built from the owner's own files ----
export const BUILDER = path.join(path.dirname(fileURLToPath(import.meta.url)), 'lab-build.js');
export const BUILD_MAX = 5000, BUILD_MIN = 20, BUILD_DEFAULT = 300;
export const skillName = (s) => String(s || '').replace(/[\r\n]/g, ' ').trim().slice(0, 40);
// A skill name from a path: the folder's name (or the file's, without its ending), so C:\Notes\Woodworking gives Woodworking.
export const skillFromPath = (p) => { const b = String(p || '').replace(/[\\/]+$/, '').split(/[\\/]/).pop().replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim(); return skillName(b ? b[0].toUpperCase() + b.slice(1) : 'My files'); };
export function cleanBuild(b = {}) {
  const items = [].concat(b.items || []).filter((i) => i && typeof i.path === 'string' && i.path.trim()).slice(0, 200).map((i) => { const p = i.path.trim().replace(/^"|"$/g, ''); return { path: p, skill: skillName(i.skill) || skillFromPath(p) }; });
  const fb = b.feedback || {};
  return {
    name: String(b.name || '').replace(/[\r\n]/g, ' ').trim().slice(0, 60),
    teacher: String(b.teacher || '').slice(0, 120),
    items,
    kinds: [...new Set([].concat(b.kinds || []).filter((k) => KIND_IDS.includes(k)))],
    count: Math.max(BUILD_MIN, Math.min(BUILD_MAX, Math.round(Number(b.count) || BUILD_DEFAULT))),
    think: ['on', 'off', 'half'].includes(b.think) ? b.think : 'half',
    resay: b.resay !== false,
    feedback: { dropFiles: [].concat(fb.dropFiles || []).map(String).slice(0, 500), notKinds: Object.fromEntries(Object.entries(fb.notKinds || {}).slice(0, 500).map(([k, v]) => [String(k), [].concat(v).filter((x) => KIND_IDS.includes(x))])), badIdeas: [].concat(fb.badIdeas || []).map(String).slice(0, 500) }
  };
}

// The start brain's size, kept on the job so the estimate table can scale past step times to another brain (1.5.154).
export const facts0 = (b) => { try { return inspect(b)?.sizeGB || 0; } catch { return 0; } };

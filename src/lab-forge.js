// 1.5.159 Computer Science Lab: the Forge tab (design: bob-design/cs-lab-forge-and-methods.md, slice A).
// The Forge (model-lab/forge) makes brains on a rented card from a plan file. Until now it only ran from a terminal.
// This tab shows it: every way to make a brain as a card with its best practice, the Forge's past runs from its own
// files, and a form that writes the plan the Forge reads. It never starts a rental by itself: only the owner's press on
// a purchase card does (slice C).
// Never shown or logged: the pod's control token, the rental key, the Forge token, the Hugging Face token.
import fs from 'node:fs';
import path from 'node:path';
import { rentedEstimate } from './lab-estimate.js';

// Every way to make a brain. `where`: here (free, this replicant matrix), rented (the Forge), or both.
// `ready`: what works today. `tab`/`step` say where Use this way leads.
export const METHODS = [
  { id: 'smaller', title: 'Make it smaller', what: 'The same brain in a smaller file, Q8 down to Q2.', where: 'here', ready: true, use: 'make',
    tips: ['Make the small file from the full-size one, never from another small file.', 'Q4 is the usual sweet spot; the Playground ladder shows where your brain starts to slip.'] },
  { id: 'cut', title: 'Cut experts', what: 'A smaller brain with fewer experts in each layer, keeping every skill covered or the busiest experts.', where: 'both', ready: true, use: 'make',
    tips: ['Count the experts on work like yours before you cut, so the right ones stay.', 'A small cut can run as it is. A big one needs teaching back afterwards.'] },
  { id: 'heal', title: 'Teach a cut brain back', what: 'A cut brain taught back towards the brain it came from, so the gaps close.', where: 'rented', ready: false, why: 'Needs a rented card. Write the plan here; you start each run yourself, with the caps you type.', use: 'forge',
    tips: ['A full pass or nothing: half a pass teaches half a habit.', 'Set the time cap above the estimate, or a full pass quietly stops early.'] },
  { id: 'teach', title: 'Teach it a lesson set', what: 'A brain that has learned your lessons, from a set you wrote or built in the Lab.', where: 'rented', ready: false, why: 'Needs a rented card. Write the plan here; you start each run yourself, with the caps you type.', use: 'forge',
    tips: ['A few hundred lessons teach habits and a voice, not facts by heart.', 'Keep some general text in the mix, so it doesn\'t forget everything else.'] },
  { id: 'thinking', title: 'Teach it a way of thinking', what: 'A brain that thinks the way you pick. Choose several thought paths (concise, creative, critical, step by step, plan first, check your work) and a personality alignment (good, neutral or evil), each with a share. Blend them into one habit, or tag them so you can switch at chat time. A teacher writes the lessons with that thinking, and the brain is taught them, with how sure the teacher was of each word.', where: 'both', ready: false, why: 'Write the thinking lessons here with the lesson writer (thinking on); teaching them is a rented run. Practice with marked answers (maths and code) comes later.', use: 'forge',
    tips: ['Blend on purpose: give each path a clear share, or tag them to switch; a little of everything teaches a muddle.', 'Alignment is tone and character. The kept refusals stay unless you take them out separately.', 'Teach from how sure the teacher was of each word, not only the words it wrote.', 'Check it on Riddles and reasoning and Sums before and after.'] },
  { id: 'mix', title: 'Mix two brains', what: 'One brain from two fine-tunes of the same parent: an even mix, a smooth blend, or keep what each changed.', where: 'here', ready: false, why: 'Coming next, free on this replicant matrix, for brains up to 9 GB full size.', use: '',
    tips: ['Only relatives mix: both brains must come from the same parent.', 'Test the mix against both parents in Compare.'] },
  { id: 'stack', title: 'Stack layers', what: 'A taller brain from the layers of one or two matching brains, end to end.', where: 'here', ready: false, why: 'Coming next, free on this replicant matrix, as an experiment.', use: '',
    tips: ['Stacked brains nearly always ramble until they\'re taught back. This is for seeing what happens.'] },
  { id: 'refusals', title: 'Take out the refusal habit', what: 'A brain that no longer declines by reflex. Nothing is trained: one direction is taken out of its weights.', where: 'here', ready: false, why: 'Coming next, free on this replicant matrix, for brains up to 9 GB full size.', use: '',
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

const RUNG_KEYS = ['name', 'nickname', 'from', 'keep', 'keep_n', 'cover', 'max', 'keep_file', 'experts', 'hours'];
const QUANTS = ['Q4_K_M', 'Q3_K_M', 'Q5_K_M', 'Q6_K', 'Q8_0'];
const word = (v, max = 40) => String(v ?? '').replace(/[^\w .-]/g, '').trim().slice(0, max);
const num = (v, lo, hi) => { const n = Number(v); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : null; };

// The form's answers as a plan in the shape forge.mjs and pod/run.sh read (rules from the blend thread, 9 Nov):
// strong and strong_cover sit at the top, never in a rung; keep_file is an absolute path; heal hours are set above the
// estimate so a full pass is never cut short; caps start at 0 and a plan with 0 caps is never handed to forge.mjs.
export function makeForgePlan(form = {}, { base = {}, keepFiles = [] } = {}) {
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
  const hours = Math.round(rungs.reduce((a, r) => a + r.hours, 0) + 1.5);
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

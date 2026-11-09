// 1.5.154 Cut recipes and the estimate table on the server (bob-design/blend-and-cut-recipes.md sections 3 and 4).
// applyRecipe fills the Lab's five steps for a goal and a device: the size comes from the device, the skills to
// protect from the goal, and the counts from (1) the usage map of this brain if there is one, else (2) the lesson set
// in step 2, counted skill by skill. The teaching back (the heal) can't run here, so the recipe also says what it
// would take on a rented card; nothing is rented from here. Routes: /api/lab/recipes/apply, /api/lab/estimate and
// the usage map's /api/lab/usage, /api/lab/usage/start.
import fs from 'node:fs';
import path from 'node:path';
import { coverageKeep } from './lab-gguf.js';
import { inspect, lessonSets, lessonSkillNames, cleanRecipe, slugOf } from './lab.js';
import { readPeek, usageFolder, usageView, usageOptions, startUsage } from './lab-usage.js';
import { hereEstimate, rentedEstimate, lastRentedCost, estimateWords, BOB_LESSONS } from './lab-estimate.js';
import { RECIPES, recipeById, deviceById, deviceBudget, sizeFor } from '../public/lab-recipes-list.js';

const writeJson = (f, v) => { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f + '.part', JSON.stringify(v)); fs.renameSync(f + '.part', f); };

// Fill a recipe for one goal and device. r = the page's recipe (its brain and name are kept). Returns
// { recipe, notes, size, source, forge }.
export function applyRecipe(lab, r = {}, recipeId, deviceId, { isLocal = true, budget: forced = null, sizeGB = 0 } = {}) {
  const rc = recipeById(recipeId);
  if (!rc) throw new Error('There is no recipe by that name.');
  if (rc.later) throw new Error(`${rc.title} isn't built yet.`);
  const brain = lab.brains().find((b) => b.id === r.from);
  if (!brain) throw new Error('Pick a brain first, then a recipe.');
  const facts = { ...(inspect(brain) || {}), ...(sizeGB ? { sizeGB } : {}) }; // tests pass a size for their made-up brain
  const device = deviceById(deviceId);
  const budget = forced || deviceBudget(device, Number(lab.cfg.gpuVramGB) || Number(lab.cfg.cardGB) || 0); // tests pass their own
  const size = sizeFor(facts, budget, { tiny: Boolean(rc.tiny) });
  const notes = [];
  const out = cleanRecipe(r);
  out.template = '';
  out.name = `${brain.name} ${rc.title}`.slice(0, 60);
  // Lessons for the counts and the measuring: keep the owner's choice, else the newest lesson set here, else chats.
  if (out.lessons.kind === 'none') {
    const sets = lessonSets(lab.cfg).filter((s) => s.count > 0);
    out.lessons = sets.length ? { ...out.lessons, kind: 'set', set: sets[sets.length - 1].id } : { ...out.lessons, kind: 'chats' };
  }
  const lessonsForSkills = out.lessons.kind === 'set' ? (() => { const s = lessonSets(lab.cfg).find((x) => x.id === out.lessons.set); return s ? { kind: 'file', file: s.file } : { kind: 'none' }; })() : out.lessons;
  const skills = lessonsForSkills.kind === 'none' ? [] : lessonSkillNames(lessonsForSkills);
  let source = 'none';
  if (facts.experts && !size.whole) {
    const peek = isLocal ? readPeek(lab.cfg, brain) : null;
    if (peek?.things?.length) {
      // The usage map: each thing tested is a skill; the recipe's skills among them are kept at 99%.
      source = 'usage';
      const strong = peek.things.map((t) => t.name).filter((n) => rc.protect.some((p) => p.toLowerCase() === n.toLowerCase()));
      const cov = coverageKeep(peek.things.map((t) => ({ name: t.name, counts: t.counts })), { cover: rc.cover, strong, strongCover: 0.99, keep: size.keep, min: facts.used });
      const file = path.join(usageFolder(lab.cfg, brain), `recipe-${rc.id}-${cov.K}-keep.json`);
      writeJson(file, { name: out.name, experts: cov.K, cover: rc.cover, strong, strong_cover: 0.99, skills: peek.things.map((t) => t.name), layers: cov.keep, source: 'imatrix', recipe: rc.id, brain: { name: brain.name, sha256: peek.brain?.sha256 || '' } });
      out.smaller.cut = { how: 'file', keep: cov.K, file };
      const low = cov.shares.filter((x) => x.worst < 0.85).map((x) => x.name);
      notes.push(`Built from the usage map of ${brain.name} (${peek.things.length} things tested)${strong.length ? `, protecting ${strong.join(', ')} most` : ''}.${low.length ? ` At this size ${low.join(', ')} keep${low.length === 1 ? 's' : ''} under 85% of ${low.length === 1 ? 'its' : 'their'} work in the worst layer.` : ''}`);
    } else {
      source = 'lessons';
      const strong = skills.filter((s) => rc.protect.some((p) => p.toLowerCase() === s.toLowerCase()));
      out.smaller.cut = { how: 'cover', keep: size.keep, cover: rc.cover, strong, file: '' };
      if (skills.length <= 1) notes.push('These lessons have one skill, so there\'s nothing to protect more than the rest. A lesson set with several skills, or the usage map below, makes the recipe count.');
      else notes.push(`Counted on the lessons from step 2, skill by skill${strong.length ? `, protecting ${strong.join(', ')} most` : ''}.`);
    }
  } else if (!facts.experts) notes.push(`${brain.name} isn't a mixture-of-experts brain, so the recipe can't cut experts. It only makes the running file${size.whole ? '' : ', and that won\'t fit this device'}.`);
  else { out.smaller.cut = null; notes.push(`${brain.name} already fits ${device.here ? 'this replicant matrix' : device.label.toLowerCase()} without a cut.`); }
  if (size.tooBig) notes.push(`Even the smallest cut (${size.keep} experts, about ${size.gb} GB) is too big for ${device.here ? 'this replicant matrix' : device.label.toLowerCase()}. Pick a bigger device, or start from a smaller brain.`);
  if (rc.tiny && facts.sight) out.smaller.sight = true;
  if (rc.tiny && facts.hearing) out.smaller.hearing = true;
  out.smaller.files = size.type ? [size.type] : [];
  out.smaller.measure = out.smaller.files.length > 0;
  out.smaller.try = Boolean(out.smaller.cut) && lab.tools().brainEngine.found;
  out.smaller.tryStop = out.smaller.try;
  out.test = { compare: true };
  if (!facts.fullSize && out.smaller.cut) notes.push(`${brain.name}'s file is already a running file (${facts.fileType}), so the cut brain stays at that type. Start from the full-size copy for the smallest file.`);
  notes.push('Every goal at the same device size is about the same size: most experts work on every kind of job. What changes is what it protects and what it relearns when it\'s taught back.');
  // The Forge plan for the teaching back. Its caps are 0 (the $0 rule): nothing rents until the owner sets them.
  const forge = out.smaller.cut ? { rungs: [{ name: out.name, from: 'teacher', keep: out.smaller.cut.keep || 'cover', cover: rc.cover, strong: rc.protect.filter((p) => /^[a-z]+$/.test(p)), strong_cover: 0.99 }], heal: { experts: 'lora', epochs: 1, alpha: 0.7 }, hours_max: 0, dollars_max: 0, note: rc.heal } : null;
  return { recipe: out, notes, size: { ...size, device: device.label }, source, forge, recipeId: rc.id };
}

// The estimate for the recipe the page holds: the here column from the plan's steps, the rented column for the
// teaching back when the cut has no heal here.
export function estimateFor(lab, recipe, { recipeId = '', rented = true } = {}) {
  const p = lab.plan(recipe);
  const brain = lab.brains().find((b) => b.id === p.recipe.from);
  const facts = brain ? inspect(brain) || {} : {};
  const cut = p.recipe.smaller.cut;
  const outGB = (p.steps.filter((s) => s.id === 'cut').length ? facts.sizeGB * 0.6 : 0) + p.recipe.smaller.files.length * (facts.sizeGB || 0) * 0.3;
  const here = p.steps.length ? hereEstimate(p.steps, { sizeGB: facts.sizeGB || 10, chunks: p.recipe.lessons.chunks, runs: lab.runs, outGB }) : null;
  const keep = cut?.keep || (facts.experts ? Math.round(facts.experts * 0.7) : 0);
  const rent = rented && cut && facts.experts ? rentedEstimate({ lessons: BOB_LESSONS, experts: Math.round((keep / facts.experts) * 256), files: p.recipe.smaller.files.length ? p.recipe.smaller.files : ['Q4_K_M'], card: '141' }) : null;
  const last = lastRentedCost(lab.measures().map((m) => m.rec));
  const e = { here, rented: rent, last, recipeId };
  e.words = estimateWords(e);
  if (rent) e.words.push('The teaching back needs a rented card, which the Lab can\'t start yet. The Forge plan for it is under the table. Its cap starts at $0, and nothing rents until you set one.');
  return e;
}

export async function recipesRoute({ req, res, p, isLocal, lab, body, send }) {
  if (!['/api/lab/recipes', '/api/lab/recipes/apply', '/api/lab/estimate', '/api/lab/usage', '/api/lab/usage/start'].includes(p)) return false;
  if (req.method === 'GET' && p === '/api/lab/recipes') { send(res, 200, { recipes: RECIPES.map(({ id, title, for: f, help, later, measureOnly, tiny }) => ({ id, title, for: f, help, later: Boolean(later), measureOnly: Boolean(measureOnly), tiny: Boolean(tiny) })), options: usageOptions(lab.cfg).filter((o) => isLocal || !o.local) }); return true; }
  if (req.method !== 'POST') { send(res, 404, { error: 'no' }); return true; }
  const b = await body(req);
  if (p === '/api/lab/recipes/apply') {
    const a = applyRecipe(lab, b.recipe, String(b.id || ''), String(b.device || 'here'), { isLocal });
    if (!isLocal && a.recipe.smaller.cut?.file) a.recipe.smaller.cut.file = '';
    send(res, 200, a); return true;
  }
  if (p === '/api/lab/estimate') { send(res, 200, estimateFor(lab, b.recipe, { recipeId: String(b.id || '') })); return true; }
  if (p === '/api/lab/usage') {
    const brain = lab.brains().find((x) => x.id === b.brain);
    if (!brain) { send(res, 200, { have: false }); return true; }
    let facts = null; try { facts = inspect(brain); } catch {}
    send(res, 200, { ...usageView(lab.cfg, brain, facts), experts: facts?.experts || 0 }); return true;
  }
  if (p === '/api/lab/usage/start') {
    if (!isLocal) { send(res, 403, { error: 'Lab jobs can only be started on this replicant matrix itself for now.' }); return true; }
    send(res, 200, await startUsage(lab, b, { unload: b.unload === true, isLocal })); return true;
  }
  return false;
}

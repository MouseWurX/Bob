// /api/lab in Bob's API: the Lab page's calls, and one sandbox turn for Guard rails. Split out of lab.js
// (which still exports labRoute and guardChat).
import { learnBrain, LEARN_CARDS, runLearn } from './lab-learn.js';
import { cleanSandbox, PAGE_DEMO, SANDBOX_MAX_TURNS, SETTINGS as GUARD_SETTINGS, STYLES as GUARD_STYLES, saveGuardLesson, guardLesson } from './lab-guard.js';
import { recipesRoute } from './lab-recipes.js';
import { sensesRoute } from './lab-senses-route.js';
import { pagesRoute } from './lab-pages.js';
import { fullSizeRoute } from './lab-fullsize.js';
import { diffusionRoute } from './lab-diffusion.js';
import path from 'node:path';
import { importMyPack, deleteMyPack } from './lab-mypacks.js';
import { labOn, labDir } from './lab-measure.js';
import { lessonSetsDir } from './lab-plan.js';
import { STAGES, stepsView, smokeReady } from './lab-steps.js';
import { listRuns } from './lab-runs.js';
import { STEP_FORMS } from './lab-step-run.js';
import { forgeDir } from './lab-forge.js';

// 1.5.164 One sandbox turn on Bob's loaded brain, with the person's own system prompt. Ordinary settings, not temperature 0:
// the point is to see what the brain does in use.
export async function guardChat(brain, b = {}, { fetch: f = globalThis.fetch } = {}) {
  const g = learnBrain(brain);
  if (!g.ready) return { ok: false, why: g.why || 'No brain is ready.' };
  const x = cleanSandbox(b);
  if (!x.messages.length || x.messages[x.messages.length - 1].role !== 'user') return { ok: false, why: 'Type something to the brain first.' };
  const r = await f(g.url + '/v1/chat/completions', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ messages: [...(x.system ? [{ role: 'system', content: x.system }] : []), ...x.messages], max_tokens: 600, chat_template_kwargs: { enable_thinking: false } }), signal: AbortSignal.timeout(180e3) });
  if (!r.ok) return { ok: false, why: `My engine said ${r.status}.` };
  const j = await r.json();
  const text = String(j.choices?.[0]?.message?.content || '').replace(/<think>[\s\S]*?<\/think>/g, '').trim();
  return { ok: true, text, turns: x.messages.filter((m) => m.role === 'user').length };
}

// /api/lab: the page's calls. Starting, stopping and Use in Bob only from this replicant matrix itself (403 from the
// door); another device, the phone included, only sees the plan, without the commands or any file paths.
export async function labRoute({ req, res, p, isLocal, lab, body, send }) {
  if (!p.startsWith('/api/lab')) return false;
  try {
    if (await recipesRoute({ req, res, p, isLocal, lab, body, send })) return true; // 1.5.154
    if (await sensesRoute({ req, res, p, isLocal, lab, body, send })) return true; // Give it eyes / Give it ears
    if (await pagesRoute({ req, res, p, isLocal, lab, body, send })) return true;
    if (await fullSizeRoute({ req, res, p, isLocal, lab, body, send })) return true;
    if (await diffusionRoute({ req, res, p, isLocal, lab, body, send })) return true; // Playground: Diffusion brains // Bring in a full-size brain // 1.5.16x Playground: Longer, Faster, Teach it
    if (req.method === 'GET' && p === '/api/lab') { send(res, 200, lab.view()); return true; }
    if (req.method === 'GET' && p === '/api/lab/measures') { send(res, 200, { measures: lab.measures().map(({ rec, ...m }) => m) }); return true; }
    // 1.5.151 Learn: experiments on the brain Bob has loaded. Read-only, nothing is written, so any device Bob lets in may use them.
    if (req.method === 'GET' && p === '/api/lab/learn') { const b = learnBrain(lab.brain); send(res, 200, { on: labOn(lab.cfg), ready: b.ready, why: b.why || '', wake: b.wake === true, busy: b.busy === true, brain: b.ready ? (lab.brain?.brainLabel?.(b.model) || b.model) : '', ctx: b.ctx || 0, cards: LEARN_CARDS }); return true; }
    if (req.method === 'GET' && p === '/api/lab/forge') { const v = lab.forgeView(); send(res, 200, isLocal ? v : { ...v, keepFiles: [], looked: [] }); return true; } // 1.5.159 read-only; 1.5.219 folders only to this computer
    // 1.5.164 Guard rails sandbox: chat with the brain Bob has loaded, like Learn. Nothing is saved unless you press Save as lesson.
    if (req.method === 'GET' && p === '/api/lab/guard') { const g = learnBrain(lab.brain); send(res, 200, { on: labOn(lab.cfg), ready: g.ready, why: g.why || '', brain: g.ready ? (lab.brain?.brainLabel?.(g.model) || g.model) : '', demo: PAGE_DEMO, maxTurns: SANDBOX_MAX_TURNS, canSave: isLocal, settings: GUARD_SETTINGS, styles: GUARD_STYLES }); return true; }
    if (req.method === 'GET' && p === '/api/lab/brain-scores') { send(res, 200, { scores: labOn(lab.cfg) ? lab.brainScores() : {} }); return true; } // Nov 11: for the Brains page, read-only
    // 14 Nov Lab steps and runs (docs/LAB-STEPS-PLAN.md): read-only. Paths are left out for other devices.
    if (req.method === 'GET' && p === '/api/lab/steps') { send(res, 200, { stages: STAGES, steps: stepsView(forgeDir(lab.cfg)).map((s) => ({ ...s, smokeReady: smokeReady(s), form: STEP_FORMS[s.id] ? { needs: STEP_FORMS[s.id].needs } : null })), sets: lab.lessonSetsList ? lab.lessonSetsList() : [], job: lab.stepJob() }); return true; }
    if (req.method === 'GET' && p === '/api/lab/runs') { const runs = listRuns(labDir(lab.cfg)); send(res, 200, { runs: isLocal ? runs : runs.map((r) => ({ ...r, inputs: r.inputs.map(({ path: _p, ...i }) => i), outputs: r.outputs.map(({ path: _p, ...o }) => o) })) }); return true; }
    if (req.method === 'GET' && p === '/api/lab/pipelines') { const v = lab.pipelinesView(); send(res, 200, isLocal ? v : { ...v, pipelines: v.pipelines.map((x) => ({ ...x, progress: { ...x.progress, steps: x.progress.steps.map((s) => ({ ...s, outputs: s.outputs.map(({ path: _p, ...o }) => o) })) } })) }); return true; } // 14 Nov slice 5, read-only
    if (req.method === 'GET' && p === '/api/lab/protocol') { const v = lab.protocolView(); send(res, 200, isLocal ? v : { ...v, looked: [], job: v.job ? { ...v.job, tail: [] } : null }); return true; } // 13 Nov read-only
    if (req.method !== 'POST') { send(res, 404, { error: 'no' }); return true; }
    const b = await body(req);
    if (p === '/api/lab/guard/chat') { if (!labOn(lab.cfg)) { send(res, 403, { error: 'The Lab is off.' }); return true; } send(res, 200, await guardChat(lab.brain, b)); return true; }
    if (p === '/api/lab/compare' && !b.save) { send(res, 200, lab.compare(b.ids)); return true; }
    if (p.startsWith('/api/lab/learn/')) { if (!labOn(lab.cfg)) { send(res, 403, { error: 'The Lab is off.' }); return true; } send(res, 200, await runLearn(lab.brain, p.slice('/api/lab/learn/'.length), b)); return true; }
    if (p === '/api/lab/peek') { const v = lab.peek(b.brain); send(res, 200, isLocal ? v : { ...v, keepFile: '' }); return true; } // 1.5.164 read-only
    if (!isLocal && !['/api/lab/plan', '/api/lab/write/plan', '/api/lab/home/plan'].includes(p)) { send(res, 403, { error: 'Lab jobs can only be started on this replicant matrix itself for now.' }); return true; }
    if (p === '/api/lab/engine') { send(res, 200, lab.setLabEngine(String(b.engine ?? ''))); return true; } // 1.5.17x the Lab's engine, from its next job
    if (p === '/api/lab/plan') { const pl = lab.plan(b.recipe); send(res, 200, { problems: pl.problems, notes: pl.notes, skills: pl.skills || [], steps: pl.steps.map((s) => ({ id: s.id, label: s.label })), text: isLocal ? pl.text : '' }); return true; }
    if (p === '/api/lab/write/plan') { const pl = lab.planWrite(b.write); send(res, 200, { problems: pl.problems, notes: pl.notes, hours: pl.hours, file: isLocal ? pl.out : '' }); return true; }
    if (p === '/api/lab/write') { send(res, 200, await lab.startWrite(b.write, { unload: b.unload === true })); return true; }
    // Lab 2c: the lesson builder (file paths, so this replicant matrix only).
    if (p === '/api/lab/build/plan') { const pl = lab.planBuild(b.build); send(res, 200, { problems: pl.problems, notes: pl.notes, hours: pl.hours, skills: pl.skills, sample: pl.sample, file: pl.out }); return true; }
    if (p === '/api/lab/build/survey') { send(res, 200, await lab.surveyBuild(b.build)); return true; }
    if (p === '/api/lab/build/sample') { send(res, 200, await lab.startBuild(b.build, { unload: b.unload === true, sample: true })); return true; }
    if (p === '/api/lab/build') { send(res, 200, await lab.startBuild(b.build, { unload: b.unload === true })); return true; }
    if (p === '/api/lab/set') { send(res, 200, lab.setLessons(String(b.id || ''), b)); return true; }
    if (p === '/api/lab/set/remove') { send(res, 200, lab.removeLessons(String(b.id || ''), b)); return true; }
    if (p === '/api/lab/set/export') { send(res, 200, lab.exportSet(String(b.id || ''), { folder: String(b.folder || ''), check: b.check === true })); return true; }
    if (p === '/api/lab/start') { send(res, 200, await lab.start(b.recipe, { unload: b.unload === true })); return true; }
    if (p === '/api/lab/stop') { send(res, 200, lab.stop()); return true; }
    if (p === '/api/lab/use') { send(res, 200, lab.use(String(b.run || ''))); return true; }
    if (p === '/api/lab/compare') { const c = lab.compare(b.ids, b.save === 'csv' ? 'csv' : 'json'); send(res, 200, { table: c.table, file: path.basename(c.file) }); return true; }
    if (p === '/api/lab/guard/save') { send(res, 200, saveGuardLesson(path.join(lessonSetsDir(lab.cfg), 'guard-rails-practice'), guardLesson(b))); return true; } // 1.5.164 into the person's own lesson set
    // 1.5.168 Professional mode: your own packs, and the question-by-question log of a run.
    if (p === '/api/lab/mypack/import') { send(res, 200, importMyPack(labDir(lab.cfg), String(b.text || ''))); return true; }
    if (p === '/api/lab/mypack/delete') { send(res, 200, deleteMyPack(labDir(lab.cfg), b.id)); return true; }
    if (p === '/api/lab/challenge/log') { send(res, 200, lab.challengeLog(String(b.id || ''), { save: b.save === 'csv' || b.save === 'jsonl' ? b.save : '' })); return true; }
    if (p === '/api/lab/challenge') { send(res, 200, await lab.startChallenge(b.challenge, { unload: b.unload === true })); return true; } // 1.5.153
    if (p === '/api/lab/ladder/plan') { const pl = lab.planLadder(b.from, b.types); send(res, 200, { problems: pl.problems, notes: pl.notes, diskGB: pl.diskGB, steps: pl.steps.map((x) => x.label) }); return true; } // 1.5.156
    if (p === '/api/lab/ladder') { send(res, 200, await lab.startLadder({ from: b.from, types: b.types }, { unload: b.unload === true })); return true; }
    if (p === '/api/lab/ladder/ask') { send(res, 200, await lab.startLadderAsk({ id: b.id, question: b.question }, { unload: b.unload === true })); return true; }
    if (p === '/api/lab/ladder/delete') { send(res, 200, lab.deleteLadder(String(b.id || ''))); return true; }
    if (p === '/api/lab/forge/plan') { const r = lab.forgePlan(b.form); send(res, 200, { problems: r.problems, notes: r.notes, hours: r.hours, text: JSON.stringify(r.plan, null, 1) }); return true; } // 1.5.159
    if (p === '/api/lab/forge/hf') { send(res, 200, await lab.forgeHf(String(b.ref || '').slice(0, 400), b.kind)); return true; } // 1.5.163
    if (p === '/api/lab/mode') { send(res, 200, lab.setLabMode(String(b.mode || ''))); return true; } // 1.5.168
    // Nov 11: the job queue and the engine-update check.
    if (p === '/api/lab/queue') {
      if (!lab.queue) throw new Error('The queue isn\'t running.');
      const q = lab.queue;
      const out = b.add ? q.add({ kind: String(b.add.kind || ''), body: b.add.body || {}, label: String(b.add.label || '') }) : b.remove ? q.remove(String(b.remove)) : b.move ? q.move(String(b.move), Number(b.by) || 1) : typeof b.pause === 'boolean' ? q.pause(b.pause) : b.clear ? q.clearDone() : q.view();
      if (b.add) q.tick().catch(() => {});
      send(res, 200, { queue: out }); return true;
    }
    if (p === '/api/lab/mistakes') { send(res, 200, await lab.startMistakes({ teacher: String(b.teacher || '') }, { unload: b.unload === true })); return true; }
    if (p === '/api/lab/recheck') { send(res, 200, lab.setRecheck(b.on === true)); return true; }
    if (p === '/api/lab/forge/allow') { send(res, 200, lab.allowForge(b.on === true)); return true; }
    if (p === '/api/lab/forge/card') { send(res, 200, lab.forgeCard(String(b.id || ''))); return true; }
    if (p === '/api/lab/forge/start') { send(res, 200, lab.forgeStart({ id: String(b.id || ''), hours: b.hours, dollars: b.dollars })); return true; }
    if (p === '/api/lab/forge/stop') { send(res, 200, await lab.forgeStop()); return true; }
    if (p === '/api/lab/step/check') { const c = lab.stepCheck(String(b.id || ''), b.form); send(res, 200, { problems: c.problems, notes: c.notes }); return true; } // 14 Nov Steps tab, free steps here
    if (p === '/api/lab/step/run') { send(res, 200, lab.stepRun(String(b.id || ''), b.form)); return true; }
    if (p === '/api/lab/step/stop') { send(res, 200, lab.stepStop()); return true; }
    if (p === '/api/lab/pipeline/save') { send(res, 200, lab.pipelineSave(b.pipeline || {})); return true; } // 14 Nov slice 5: pipelines start only from this computer
    if (p === '/api/lab/pipeline/go') { send(res, 200, lab.pipelineGo(String(b.slug || ''))); return true; }
    if (p === '/api/lab/pipeline/skip') { send(res, 200, lab.pipelineSkip(String(b.slug || ''), Number(b.step), b.skip !== false)); return true; }
    if (p === '/api/lab/protocol/check') { const pl = lab.protocolCheck(String(b.tool || ''), b.form); send(res, 200, { problems: pl.problems, notes: pl.notes }); return true; } // 13 Nov
    if (p === '/api/lab/protocol/run') { send(res, 200, lab.protocolRun(String(b.tool || ''), b.form)); return true; }
    if (p === '/api/lab/protocol/stop') { send(res, 200, lab.protocolStop()); return true; }
    if (p === '/api/lab/forge/save') { send(res, 200, lab.saveForgePlan(b.form)); return true; }
    if (p === '/api/lab/library/add') { send(res, 200, await lab.addLibrarySet({ from: String(b.from || ''), name: String(b.name || '').slice(0, 60) })); return true; } // the lesson library
    if (p === '/api/lab/home/plan') { const pl = lab.planHome(String(b.kind || ''), b.form); send(res, 200, { problems: pl.problems, notes: pl.notes, diskGB: pl.diskGB, layers: pl.stack?.layers || 0 }); return true; } // 1.5.164
    if (p === '/api/lab/home/start') { send(res, 200, await lab.startHome(String(b.kind || ''), b.form, { unload: b.unload === true })); return true; }
    if (p === '/api/lab/refusals/try') { send(res, 200, await lab.tryRefusals(b.form, { unload: b.unload === true })); return true; }
    if (p === '/api/lab/peek/ask') { send(res, 200, await lab.peekAsk(b, { unload: b.unload === true })); return true; }
    if (p === '/api/lab/peek/stop') { send(res, 200, lab.freePeek()); return true; }
    if (p === '/api/lab/peek/keep') { send(res, 200, lab.peekKeep(b)); return true; }
    if (p === '/api/lab/peek/switch') { send(res, 200, await lab.switchExperts({ brain: b.brain, counts: Array.isArray(b.counts) ? b.counts : null, back: b.back === true }, { unload: b.unload === true })); return true; } // 1.5.20x
    if (p === '/api/lab/save') { const out = lab.saveResult(b, { version: lab.version || '' }); send(res, 200, { file: out.file }); return true; }
    if (p === '/api/lab/recipe') { send(res, 200, { recipes: lab.saveRecipe(b.recipe) }); return true; }
    send(res, 404, { error: 'no' }); return true;
  } catch (e) { send(res, 400, { error: e.message }); return true; }
}

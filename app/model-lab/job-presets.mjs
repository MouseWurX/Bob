// Per-job live presets for one brain (13 Nov, the owner: "calibrate for riker for the live tuning too", "i want this to get us his
// weights calibration", "be sure that we have a robust dataset"). On a Brain Engine server serving the brain, every job's judged
// questions (calib-prep.mjs: held-out + a reserved slice + probes, >= 40 per job) are asked under live settings, and each job gets
// the setting that beats the as-built brain by more than the noise. Live only: every switch goes back at the end.
//   base      the brain as built (own experts per word, all experts, no dials)
//   N         experts per word in every layer, one pass over all jobs per N (Brain Engine 7b12282, patch 0013; skipped on older engines)
//   keep      the job's own keep list (trace-read --mass: keep/job-<job>-keep-75.json, -50) at the job's best N, the job's questions only
//   dials     the job's leaning experts (trace-read lift.json, "up" side) scaled 0.8 and 1.2 at the job's best N and keep
// Grading: first assistant turn of each lesson, same tool names and arguments as recorded, or rightly no tool (tool-judge.mjs).
// Tool calls are only parsed, never run. Thinking off. Every answer is kept with the brain's top-K odds (answers-calib-*.jsonl,
// make-datasets.mjs reads them: split, n, keep, job, ok). --student <lessons dir> also keeps his own answers + odds on the first
// turns of that set's training lessons (the student side, for heal or adapter training later).
// A job's pick: the best setting only when its paired gap over base beats the 95% range; else base. "fastest_same": the
// cheapest setting (fewer experts, smaller keep) that is not worse than base beyond the noise.
// Writes <out>/riker-calibration/<job>.json, presets.json and PRESETS.md.
// node job-presets.mjs --url <server> --questions <calib>/questions --maps <trace-read --mass out> --out <folder>
//      [--n 3,4,6,8,12] [--keeps 75,50] [--scales 0.8,1.2] [--parallel 8] [--odds 8] [--max 400] [--student <dir> --student-n 1000]
//      [--bob <Bob source app folder>] (Bob's current tools, not the saved ones) [--jobs files,run,plans] (only these jobs) [--think] (thinking on: answers carry it, --max-think 4000 tokens) [--gate] (stop the rental if N, keep or dials could not be tried)
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { live, pool, oddsOf, turnsOf, pairedGap, wilson } from './engine-live.mjs';
import { parseArgs, judgeTurn } from './tool-judge.mjs';

const readJsonl = (f) => (fs.existsSync(f) ? fs.readFileSync(f, 'utf8').replace(/\r\n/g, '\n').split('\n').filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean) : []);
const isHoldout = (id) => parseInt(crypto.createHash('md5').update(String(id)).digest('hex').slice(0, 8), 16) / 0xFFFFFFFF < 0.05;
const r3 = (x) => Math.round(x * 1000) / 1000;
const slug = (j) => String(j).replace(/[^\w.-]+/g, '-');

// a job's choice from its passes: [{setting, oks: [0/1 per question, same order], tps}] with base first
export function choose(passes, { cheaper = (a, b) => 0 } = {}) {
  const base = passes[0];
  const scored = passes.map((p) => { const k = p.oks.filter(Boolean).length, w = wilson(k, p.oks.length), g = pairedGap(p.oks, base.oks); return { ...p.setting, score: r3(w.p), pm: r3(w.pm), right: k, of: p.oks.length, gap: r3(g.gap), range: r3(g.range), tps: p.tps ? Math.round(p.tps * 10) / 10 : null }; });
  const best = scored.slice(1).reduce((a, b) => (b.score > (a?.score ?? -1) ? b : a), null);
  const pick = best && best.gap > best.range && best.gap > 0 ? { ...best, why: `beats as built by ${best.gap} (noise ±${best.range})` } : { ...scored[0], why: best ? `nothing beat as built beyond the noise (best ${best.gap} ± ${best.range})` : 'as built' };
  const same = scored.slice(1).filter((s) => s.gap >= -s.range).sort((a, b) => cheaper(a, b) || (b.tps || 0) - (a.tps || 0))[0] || null;
  return { scored, pick, fastest_same: same ? { ...same, why: `not worse than as built beyond the noise (${same.gap} ± ${same.range})` } : null };
}
const cost = (s) => (s.n || 99) * 1000 + (s.keep || 100);

async function main() {
  const a = Object.fromEntries(process.argv.slice(2).reduce((acc, x, i, arr) => (x.startsWith('--') ? [...acc, [x.slice(2), arr[i + 1] && !arr[i + 1].startsWith('--') ? arr[i + 1] : true]] : acc), []));
  const url = String(a.url || process.env.LAB_URL || ''), qdir = path.resolve(String(a.questions || '')), out = path.resolve(String(a.out || process.env.LAB_OUT || 'job-presets'));
  if (!url || !a.questions) { console.error('--url <server> --questions <calib-prep questions folder> are needed'); process.exit(1); }
  const maps = a.maps ? path.resolve(String(a.maps)) : null, par = Number(a.parallel) || 8, K = Math.min(20, Number(a.odds) || 8), max = Number(a.max) || 400;
  const brain = process.env.LAB_MODEL_NAME || 'brain', eng = live(url);
  const think = Boolean(a.think), maxThink = Number(a['max-think']) || 4000, onlyJobs = a.jobs ? new Set(String(a.jobs).split(',').map((x) => x.trim()).filter(Boolean)) : null;
  fs.mkdirSync(path.join(out, 'riker-calibration'), { recursive: true });
  const sets = JSON.parse(fs.readFileSync(path.join(qdir, 'toolsets.json'), 'utf8'));
  const jobs = {};
  let kit = null;
  if (a.bob) { // Bob's CURRENT prompt and tools (a fresh bob-kit), not the write-time toolsets.json, which can be stale
    const { loadBob } = await import('./bob-kit.mjs'); const { buildQuestions } = await import('./tool-wording.mjs');
    kit = await loadBob(path.resolve(String(a.bob)));
    for (const q of buildQuestions(readJsonl(path.join(qdir, 'lessons.jsonl')), kit, { turns: 1, jobs: onlyJobs })) (jobs[q.job] ||= []).push(q);
    kit.done();
  } else for (const l of readJsonl(path.join(qdir, 'lessons.jsonl'))) { const t = turnsOf(l, sets)[0]; if (t?.tools !== undefined && (!onlyJobs || onlyJobs.has(l.job))) (jobs[l.job] ||= []).push({ idea: l.idea, split: l.split, set: l.set, ...t }); }
  console.log(`${Object.values(jobs).flat().length} questions over ${Object.keys(jobs).length} jobs (${Object.entries(jobs).map(([j, q]) => `${j} ${q.length}`).join(', ')})`);
  const tag = (s) => s.student ? 'student' : `n${s.n || 'own'}-k${s.keep || 100}${s.dials ? `-d${s.dials}` : ''}`;
  const ask = async (q, s, file) => {
    try {
      const j = await eng.chat({ messages: q.messages, ...(q.tools?.length ? { tools: q.tools } : {}), max_tokens: think ? maxThink : max, temperature: 0, chat_template_kwargs: { enable_thinking: think }, logprobs: true, top_logprobs: K });
      const m = j.choices?.[0]?.message || {}, got = (m.tool_calls || []).map((c) => ({ name: c.function?.name, args: parseArgs(c.function?.arguments) }));
      const ok = judgeTurn(q.want.map((w) => ({ name: w.name, args: parseArgs(w.args) })), got); // parsed, never run
      fs.appendFileSync(file, JSON.stringify({ brain, split: q.split || 'calib', idea: q.idea, turn: 0, think, n: s.n || 'own', keep: s.keep || 100, ...(s.dials ? { dials: s.dials } : {}), job: q.job, set: q.set, ok, answer: { content: m.content || '', ...(m.reasoning_content ? { reasoning: m.reasoning_content } : {}), tool_calls: m.tool_calls || undefined }, odds: oddsOf(j.choices?.[0]?.logprobs) }) + '\n');
      return { ok, tps: j.timings?.predicted_per_second || 0 };
    } catch (e) { return { ok: false, tps: 0, err: e.message.slice(0, 80) }; }
  };
  const run = async (qs, s) => { const file = path.join(out, `answers-calib-${tag(s)}.jsonl`); const r = await pool(qs, par, (q) => ask(q, s, file)); const t = r.map((x) => x.tps).filter(Boolean); return { oks: r.map((x) => (x.ok ? 1 : 0)), tps: t.length ? t.reduce((p, c) => p + c, 0) / t.length : 0, errors: r.filter((x) => x.err).length }; };
  const passes = Object.fromEntries(Object.keys(jobs).map((j) => [j, []]));
  const all = Object.entries(jobs).flatMap(([job, qs]) => qs.map((q) => ({ ...q, job })));
  const splitBack = (res, s) => { let i = 0; for (const [job, qs] of Object.entries(jobs)) { passes[job].push({ setting: s, oks: res.oks.slice(i, i + qs.length), tps: res.tps }); i += qs.length; } };
  await eng.reset();
  // base, then every N over all jobs at once (the switch is global)
  console.log('base (as built)'); splitBack(await run(all, {}), {});
  let liveN = true;
  for (const n of String(a.n || '').split(',').map(Number).filter((x) => x > 0)) {
    try { await eng.setUsed(n); } catch (e) { console.log(`  experts per word ${n}: ${e.message.slice(0, 100)}; this engine has no live switch, N stays as built`); liveN = false; break; }
    console.log(`N=${n}`); splitBack(await run(all, { n }), { n });
  }
  try { await eng.setUsed(null); } catch {}
  // per job: its keep lists at its best N, then its dials at its best N and keep
  const keeps = String(a.keeps || '75,50').split(',').map(Number).filter((x) => x > 0 && x < 100), scales = String(a.scales || '0.8,1.2').split(',').map(Number).filter((x) => x > 0);
  const lift = maps && fs.existsSync(path.join(maps, 'lift.json')) ? JSON.parse(fs.readFileSync(path.join(maps, 'lift.json'), 'utf8')).lift : {};
  for (const [job, qs] of Object.entries(jobs)) {
    const bestOf = (ps) => ps.reduce((x, y) => (y.oks.filter(Boolean).length > x.oks.filter(Boolean).length ? y : x));
    const bn = bestOf(passes[job]).setting.n;
    try {
      if (bn) await eng.setUsed(bn);
      for (const k of keeps) {
        const f = maps && path.join(maps, 'keep', `job-${slug(job)}-keep-${k}.json`);
        if (!f || !fs.existsSync(f)) { console.log(`  ${job}: no keep-${k} list (trace-read --mass)`); continue; }
        await eng.setMask(JSON.parse(fs.readFileSync(f, 'utf8')).keep);
        const s = { ...(bn ? { n: bn } : {}), keep: k }; console.log(`${job}: ${tag(s)}`);
        passes[job].push({ setting: s, oks: (await run(qs.map((q) => ({ ...q, job })), s)).oks, tps: 0 });
        await eng.setMask(null);
      }
      const bk = bestOf(passes[job]).setting;
      if (bk.keep) await eng.setMask(JSON.parse(fs.readFileSync(path.join(maps, 'keep', `job-${slug(job)}-keep-${bk.keep}.json`), 'utf8')).keep);
      const up = (lift[`job:${job}`] || []).flatMap((x, l) => (x?.up || []).map((y) => ({ kind: 'expert', layer: l, index: y.expert })));
      for (const sc of up.length ? scales : []) {
        await eng.setDials(up.map((d) => ({ ...d, scale: sc })));
        const s = { ...bk, dials: sc }; console.log(`${job}: ${tag(s)}`);
        passes[job].push({ setting: s, oks: (await run(qs.map((q) => ({ ...q, job })), s)).oks, tps: 0, dialList: up });
        await eng.setDials([]);
      }
    } catch (e) { console.log(`  ${job}: ${e.message.slice(0, 120)}`); } finally { await eng.reset(); }
  }
  // the student side: his own answers + odds on another set's training lessons
  if (a.student) {
    const sd = path.resolve(String(a.student)), ss = fs.existsSync(path.join(sd, 'toolsets.json')) ? JSON.parse(fs.readFileSync(path.join(sd, 'toolsets.json'), 'utf8')) : {};
    const reserved = new Set(Object.values(jobs).flat().map((q) => String(q.idea)));
    let ls = readJsonl(path.join(sd, 'lessons.jsonl')).filter((l) => l.idea !== undefined && !isHoldout(l.idea) && !reserved.has(String(l.idea)));
    const n = Number(a['student-n']) || 1000; if (ls.length > n) { const st = ls.length / n; ls = Array.from({ length: n }, (_, i) => ls[Math.floor(i * st)]); }
    const qs = ls.map((l) => ({ idea: l.idea, job: l.job, split: 'train', ...turnsOf(l, ss)[0] })).filter((q) => q.messages);
    console.log(`student side: ${qs.length} answers with top-${K} odds`); await run(qs, { student: true });
  }
  await eng.reset();
  // the presets
  const presets = {};
  for (const [job, ps] of Object.entries(passes)) {
    const c = choose(ps, { cheaper: (x, y) => cost(x) - cost(y) });
    const keepFile = (k) => (k && maps ? path.join(maps, 'keep', `job-${slug(job)}-keep-${k}.json`) : null);
    const dialList = ps.find((p) => p.dialList)?.dialList || [];
    const doc = { brain, job, questions: ps[0].oks.length, live_switch_n: liveN, as_built: c.scored[0], pick: c.pick, fastest_same: c.fastest_same, tried: c.scored,
      preset: { n: c.pick.n || null, keep: c.pick.keep || 100, keep_list: keepFile(c.pick.keep) && fs.existsSync(keepFile(c.pick.keep)) ? JSON.parse(fs.readFileSync(keepFile(c.pick.keep), 'utf8')).keep : null, dials: c.pick.dials ? dialList.map((d) => ({ ...d, scale: c.pick.dials })) : [] } };
    fs.writeFileSync(path.join(out, 'riker-calibration', `${slug(job)}.json`), JSON.stringify(doc, null, 1));
    presets[job] = { n: doc.preset.n, keep: doc.preset.keep, dials: c.pick.dials || null, score: c.pick.score, pm: c.pick.pm, as_built: c.scored[0].score, why: c.pick.why, fastest_same: c.fastest_same && { n: c.fastest_same.n || null, keep: c.fastest_same.keep || 100, score: c.fastest_same.score } };
  }
  // --gate: a smoke run where a planned switch could not be tried stops the rental (exit 86): Nov 13 ran 34 jobs "as built" only
  if (a.gate) { const want = { n: String(a.n || '').split(',').filter(Boolean).length > 0, keep: keeps.length > 0, dials: scales.length > 0 }, tried = Object.values(passes).flat().map((p) => p.setting);
    const miss = [want.n && !liveN && 'experts per word', want.keep && !tried.some((t) => t.keep) && 'keep lists', want.dials && !tried.some((t) => t.dials) && 'dials'].filter(Boolean);
    if (miss.length) { console.log(`GATE STOP: live switches not tried: ${miss.join(', ')} (no live switch, or no per-job maps)`); process.exit(86); } }
  fs.writeFileSync(path.join(out, 'presets.json'), JSON.stringify({ brain, made: new Date().toISOString(), presets }, null, 1));
  const md = [`# Per-job presets: ${brain}`, '', 'Score = share of the job\'s judged questions right (± its 95% range). A preset only differs from the brain as built when it beats it by more than the noise (paired, same questions).', '',
    '| job | questions | as built | pick | pick score | why | cheapest just as good |', '|---|---|---|---|---|---|---|',
    ...Object.entries(presets).map(([j, p]) => `| ${j} | ${passes[j][0].oks.length} | ${p.as_built} | N ${p.n || 'own'}, keep ${p.keep}${p.dials ? `, dials ${p.dials}` : ''} | ${p.score} ± ${p.pm} | ${p.why} | ${p.fastest_same ? `N ${p.fastest_same.n || 'own'}, keep ${p.fastest_same.keep} (${p.fastest_same.score})` : '-'} |`), ''].join('\n');
  fs.writeFileSync(path.join(out, 'PRESETS.md'), md); console.log(md);
}
if (import.meta.url === pathToFileURL(process.argv[1] || '').href) main().catch((e) => { console.error(e.stack || e.message); process.exit(1); });

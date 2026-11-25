// Loop sweep (25 Nov 2026, the owner: "Could you optimize his weights?", then "Go straight to the 35B, cap $40"). After
// MIT CSAIL's weight-space programming (Nov 2026), where most of the gain came from a small brain no longer looping.
// Everything here is live on a running Brain Engine (no file changed): find the experts that fire more when the brain loops,
// turn them down with the engine's dials (patch 0003), and keep a setting only if loops drop and right answers do not.
// The winner is written as surgery.py edits, so it can be baked into the weights later. Unproven in our lab, as we have yet to test.
//
// node loop-sweep.mjs --url <server> --problems <practice.jsonl> [--find 200] [--check 100] [--max-tokens 8192]
//      [--parallel 6] [--experts 16,64] [--scales 0.5,0.7,0.85] [--up-scales 1.15,1.3|none] [--min-picks 20] [--fail loop|wrong] [--out <folder>]
//
// --baseline (25 Nov, the owner: "a good baseline benchmark for Bill, for before and after posterity"): answers the find and
//   check slices only, with the same seeds and settings, and keeps every answer (answers.jsonl: text, tokens, loop, right, and a
//   sha256 of the words) so a later run can be compared word for word. No trace, no dials, nothing changed.
// --fail wrong (25 Nov, for a squeezed brain that answers wrong rather than loops, such as Bill's IQ2_XXS): the experts are
//   found on wrong answers against right ones, and a trial is kept if it gets MORE right without looping more.
//
// --problems: JSONL of {"q": question, "a": final number}. PRACTICE problems only (for example GSM8K or MATH train splits):
//   never Bob's held-out jobs, which only score the final winner, once, elsewhere.
// Steps: 1 answer the find slice (thinking as the server is set) and mark each answer looped (stopped by the token limit,
//   or repeating itself) or finished; 2 re-read each answer with the expert trace on (one at a time: patch 0002 drops the
//   trace when requests share a batch); 3 lift = an expert's share of picks on looped answers / its share on finished ones;
//   4 the check slice once as built, then once per trial (top N lifted experts x scale), same seed each time; 5 reset.
// Out: loop-sweep.json (every trial), loop-sweep.md, lift.json, and surgery-edits.json for forge/pod/surgery.py (winner only).
// The engine is put back (no dials) at the end, even after an error. Set LAB_API_KEY for a server with a key.
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import crypto from 'node:crypto';
import http from 'node:http';
import https from 'node:https';

// POST JSON with node:http, not fetch: fetch gives up after 300 s with no reply headers, and a long thinking answer takes longer.
// Only the whole-request timeout applies (default 30 min).
export function postJson(full, body, headers = {}, timeoutMs = 30 * 60_000) {
  return new Promise((resolve, reject) => {
    const u = new URL(full); const data = Buffer.from(JSON.stringify(body));
    const req = (u.protocol === 'https:' ? https : http).request(u, { method: 'POST', headers: { ...headers, 'content-length': data.length } }, (res) => {
      const parts = []; res.on('data', (c) => parts.push(c)); res.on('error', reject);
      res.on('end', () => {
        clearTimeout(timer); const t = Buffer.concat(parts).toString('utf8');
        if (res.statusCode < 200 || res.statusCode >= 300) { reject(new Error(`${u.pathname} ${res.statusCode}: ${t.slice(0, 200)}`)); return; }
        try { resolve(t ? JSON.parse(t) : {}); } catch (e) { reject(e); }
      });
    });
    const timer = setTimeout(() => req.destroy(new Error(`${u.pathname} timed out after ${Math.round(timeoutMs / 1000)} s`)), timeoutMs);
    req.on('error', (e) => { clearTimeout(timer); reject(e); });
    req.end(data);
  });
}

export const readJsonl = (f) => fs.readFileSync(f, 'utf8').replace(/\r\n/g, '\n').split('\n').filter((l) => l.trim()).map((l) => JSON.parse(l));

// A reply loops when it was cut by the token limit, or when the same 12-word runs keep coming back.
export function looped(text, cut) {
  if (cut) return true;
  const w = String(text || '').split(/\s+/).filter(Boolean);
  if (w.length < 52) return false;
  const grams = [];
  for (let i = 0; i + 12 <= w.length; i++) grams.push(w.slice(i, i + 12).join(' '));
  return new Set(grams).size < 0.5 * grams.length;
}

const norm = (s) => { const t = String(s).replace(/,/g, '').trim(); return t.includes('.') ? t.replace(/0+$/, '').replace(/\.$/, '') : t; };
export function correct(text, gold) {
  // 25 Nov: a \boxed{...} answer (MATH style) wins over the last number in the text
  const boxed = [...String(text || '').matchAll(/\\boxed\{([^{}]*)\}/g)].map((m) => m[1]).at(-1);
  if (boxed !== undefined) return norm(boxed.replace(/[\s$]/g, '')) === norm(gold);
  const nums = String(text || '').replace(/,/g, '').match(/-?\d+(?:\.\d+)?/g);
  return Boolean(nums) && norm(nums.at(-1)) === norm(gold);
}

export function score(rows) {
  const n = rows.length || 1;
  return { n: rows.length, loop: +(rows.filter((r) => r.loop).length / n).toFixed(4), acc: +(rows.filter((r) => r.ok).length / n).toFixed(4),
    avg_tokens: +(rows.reduce((s, r) => s + r.tokens, 0) / n).toFixed(1) };
}

// Per layer and expert: share of picks on looped answers / share on finished ones. Only experts picked at least minPicks times
// on looped answers count, so a rare expert can't top the list by chance.
export function lift(loopCounts, fineCounts, minPicks = 20) {
  const out = [];
  const tot = (rows) => rows.reduce((s, r) => s + (Array.isArray(r) ? r.reduce((a, b) => a + b, 0) : 0), 0);
  const tl = tot(loopCounts) || 1, tf = tot(fineCounts) || 1;
  loopCounts.forEach((row, layer) => {
    if (!Array.isArray(row)) return;
    row.forEach((picks, expert) => {
      if (picks < minPicks) return;
      const fine = fineCounts[layer]?.[expert] || 0;
      out.push({ layer, expert, picks, lift: +((picks / tl) / ((fine + 1) / tf)).toFixed(4) });
    });
  });
  return out.sort((a, b) => b.lift - a.lift);
}

export function addCounts(acc, layers) {
  if (!Array.isArray(layers)) return false;
  layers.forEach((row, l) => {
    if (!Array.isArray(row)) return;
    acc[l] ||= new Array(row.length).fill(0);
    row.forEach((v, e) => { acc[l][e] += Number(v) || 0; });
  });
  return true;
}

// Trials (25 Nov, the owner: "Why turning them down?"): both ways. "down" turns the top N failure experts down to each scale
// below 1; "up" turns up the N experts that lean most toward GOOD answers (the bottom of the lift list) to each scale above 1;
// "both" does the two at once. A trial = one dials list for /dials.
export function buildTrials(lifted, experts, scales, upScales = []) {
  const trials = [];
  const good = [...lifted].reverse();
  const dial = (p, s) => ({ kind: 'expert', layer: p.layer, index: p.expert, scale: s });
  for (const n of experts) {
    const bad = lifted.slice(0, n), fine = good.slice(0, n).filter((p) => !bad.includes(p));
    for (const s of scales) if (bad.length) trials.push({ name: `down: top ${bad.length} failure experts x${s}`, way: 'down', dials: bad.map((p) => dial(p, s)) });
    for (const u of upScales) if (fine.length) trials.push({ name: `up: top ${fine.length} good-answer experts x${u}`, way: 'up', dials: fine.map((p) => dial(p, u)) });
    for (const s of scales) for (const u of upScales) if (bad.length && fine.length) trials.push({ name: `both: ${bad.length} down x${s}, ${fine.length} up x${u}`, way: 'both', dials: [...bad.map((p) => dial(p, s)), ...fine.map((p) => dial(p, u))] });
  }
  return trials;
}

// Keep a trial only if it loops less AND gets at least as many right; the best is the fewest loops, then the most right.
export function pickBest(before, results, fail = 'loop') {
  if (fail === 'wrong') {
    const ok = results.filter((r) => r.acc > before.acc && r.loop <= before.loop);
    ok.sort((a, b) => b.acc - a.acc || a.loop - b.loop);
    return ok[0] || null;
  }
  const ok = results.filter((r) => r.loop < before.loop && r.acc >= before.acc);
  ok.sort((a, b) => a.loop - b.loop || b.acc - a.acc);
  return ok[0] || null;
}

async function main() {
  const o = {};
  const a = process.argv.slice(2);
  for (let i = 0; i < a.length; i++) if (a[i].startsWith('--')) { const n = a[i + 1]; if (n === undefined || n.startsWith('--')) o[a[i].slice(2)] = true; else { o[a[i].slice(2)] = n; i++; } }
  if (!o.url || !o.problems) { console.error('node loop-sweep.mjs --url <Brain Engine> --problems <practice.jsonl> [--out <folder>]'); process.exit(1); }
  const url = String(o.url).replace(/\/$/, '');
  const out = path.resolve(String(o.out || 'loop-sweep')); fs.mkdirSync(out, { recursive: true });
  const nFind = Number(o.find || 200), nCheck = Number(o.check || 100), maxTokens = Number(o['max-tokens'] || 8192);
  const parallel = Number(o.parallel || 6), minPicks = Number(o['min-picks'] || 20);
  const failMode = o.fail === 'wrong' ? 'wrong' : 'loop';
  const failed = (r) => (failMode === 'wrong' ? !r.ok : r.loop);
  const experts = String(o.experts || '16,64').split(',').map(Number), scales = String(o.scales || '0.5,0.7,0.85').split(',').map(Number);
  const upScales = o['up-scales'] === 'none' ? [] : String(o['up-scales'] || '1.15,1.3').split(',').map(Number);
  const headers = { 'content-type': 'application/json', ...(process.env.LAB_API_KEY ? { authorization: `Bearer ${process.env.LAB_API_KEY}` } : {}) };
  const post = (p, body) => postJson(`${url}${p}`, body, headers);
  const reset = async () => { try { await post('/dials', { dials: [] }); } catch {} };
  const probs = readJsonl(String(o.problems));
  const findSet = probs.slice(0, nFind), checkSet = probs.slice(nFind, nFind + nCheck);
  if (checkSet.length < 10) throw new Error(`only ${checkSet.length} check problems after the find slice: give more problems`);
  const t0 = Date.now();
  const log = (m) => { const line = `${new Date().toISOString()} ${m}`; console.log(line); fs.appendFileSync(path.join(out, 'loop-sweep.log'), line + '\n'); };

  const ask = async (p, i) => {
    const messages = [{ role: 'user', content: `${p.q}\nPut the final number last.` }];
    const j = await post('/v1/chat/completions', { messages, max_tokens: maxTokens, temperature: 0.6, top_p: 0.95, top_k: 20, seed: 1234 + i, chat_template_kwargs: { enable_thinking: true } });
    const c = j.choices?.[0] || {};
    const text = `${c.message?.reasoning_content || ''}\n${c.message?.content || ''}`;
    const cut = c.finish_reason === 'length';
    return { messages, reply: c.message || {}, loop: looped(text, cut), ok: correct(String(c.message?.content || '').replace(/<think>[\s\S]*?<\/think>/g, ''), p.a), tokens: Number(j.usage?.completion_tokens) || 0 };
  };
  const answerAll = async (set) => {
    const rows = new Array(set.length);
    let next = 0;
    await Promise.all(Array.from({ length: Math.min(parallel, set.length) }, async () => { while (next < set.length) { const i = next++; rows[i] = await ask(set[i], i); } }));
    return rows;
  };

  try {
    await reset();
    log(`find: answering ${findSet.length} practice problems`);
    const found = await answerAll(findSet);
    if (o.baseline) {
      const checked = await answerAll(checkSet);
      const keep = (set, rows, slice) => rows.map((r, i) => JSON.stringify({ slice, i, q: set[i].q, a: set[i].a, loop: r.loop, ok: r.ok, tokens: r.tokens,
        sha256: crypto.createHash('sha256').update(`${r.reply.reasoning_content || ''}\n${r.reply.content || ''}`).digest('hex'), content: r.reply.content || '', reasoning: r.reply.reasoning_content || '' }));
      fs.writeFileSync(path.join(out, 'answers.jsonl'), [...keep(findSet, found, 'find'), ...keep(checkSet, checked, 'check')].join('\n') + '\n');
      const rep = { url, baseline: true, find: score(found), check: score(checked), max_tokens: maxTokens, sampling: { temperature: 0.6, top_p: 0.95, top_k: 20, seed: '1234 + index' }, minutes: +((Date.now() - t0) / 60000).toFixed(1) };
      fs.writeFileSync(path.join(out, 'loop-sweep.json'), JSON.stringify(rep, null, 1));
      log(`baseline: find ${JSON.stringify(rep.find)} check ${JSON.stringify(rep.check)}`);
      return;
    }
    const base = score(found);
    log(`find: ${JSON.stringify(base)}`);
    const loopRows = found.filter(failed), fineRows = found.filter((r) => !failed(r));
    const report = { url, fail: failMode, find: base, looped: loopRows.length, finished: fineRows.length, max_tokens: maxTokens };
    const finish = (extra) => { Object.assign(report, extra, { minutes: +((Date.now() - t0) / 60000).toFixed(1) }); fs.writeFileSync(path.join(out, 'loop-sweep.json'), JSON.stringify(report, null, 1)); };
    if (loopRows.length < 8 || fineRows.length < 8) {
      finish({ stop: `fewer than 8 ${failMode === 'wrong' ? 'wrong or right' : 'looped or finished'} answers: no clear failure to fix, nothing tried` });
      log(report.stop); return;
    }
    log(`trace: re-reading ${found.length} answers one at a time`);
    const lc = [], fc = []; let noTrace = 0;
    for (const r of found) {
      const reply = { role: 'assistant', content: r.reply.content || '', ...(r.reply.reasoning_content ? { reasoning_content: r.reply.reasoning_content } : {}) };
      const j = await post('/v1/chat/completions', { messages: [...r.messages, reply], max_tokens: 1, cache_prompt: false, expert_trace: true, temperature: 0 });
      if (!addCounts(failed(r) ? lc : fc, j.expert_trace?.layers)) noTrace++;
    }
    if (noTrace > found.length / 2) throw new Error(`${noTrace} of ${found.length} replies had no expert trace: is this a Brain Engine with patch 0002?`);
    const lifted = lift(lc, fc, minPicks);
    fs.writeFileSync(path.join(out, 'lift.json'), JSON.stringify(lifted.slice(0, 500), null, 1));
    const trials = buildTrials(lifted, experts, scales, upScales);
    log(`check: as built, then ${trials.length} trials on ${checkSet.length} problems`);
    const before = score(await answerAll(checkSet));
    log(`as built: ${JSON.stringify(before)}`);
    const results = [];
    for (const t of trials) {
      const ts = Date.now();
      await post('/dials', { dials: t.dials });
      const s = score(await answerAll(checkSet));
      await reset();
      const r = { name: t.name, way: t.way, experts: t.dials.length, scale: t.dials[0].scale, ...s, seconds: Math.round((Date.now() - ts) / 1000) };
      results.push(r); log(JSON.stringify(r));
    }
    const best = pickBest(before, results, failMode);
    const bestTrial = best && trials.find((t) => t.name === best.name);
    if (bestTrial) fs.writeFileSync(path.join(out, 'surgery-edits.json'), JSON.stringify({ edits: bestTrial.dials.map((d) => ({ layer: d.layer, expert: d.index, scale: d.scale })) }, null, 1));
    finish({ no_trace: noTrace, check_before: before, trials: results, best });
    fs.writeFileSync(path.join(out, 'loop-sweep.md'), [
      '# Loop sweep', '', `Practice find slice: ${base.n} answers, ${loopRows.length} looped. Check slice: ${before.n}.`, '',
      `As built: loops ${before.loop}, right ${before.acc}, ${before.avg_tokens} tokens per answer.`, '',
      '| Trial | Loops | Right | Tokens | Seconds |', '| --- | --- | --- | --- | --- |',
      ...results.map((r) => `| ${r.name} | ${r.loop} | ${r.acc} | ${r.avg_tokens} | ${r.seconds} |`), '',
      best ? `Best: ${best.name} (surgery-edits.json). Practice problems only: score it on the held-out jobs before anything ships.` : 'No trial cut loops without losing right answers: nothing to bake.'
    ].join('\n'));
    log(best ? `best: ${best.name}` : 'no trial beat as built');
  } finally { await reset(); }
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) main().catch((e) => { console.error(e.message || e); process.exit(1); });

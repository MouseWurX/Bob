#!/usr/bin/env node
// The conductor end to end (method doc Addendum 79, Nov 20 2026): one fixed job, timed the ways a plan lists.
//
//   node model-lab/conductor-e2e.mjs --plan <plan.json> --out <folder> [--var NAME=value ...] [--rounds 5] [--dry]
//
// The job: a long file pasted as a new read (plan.bigRead tokens of the plan's text, plus a question), then
// plan.followUps short turns (plan.followTokens tokens of the same text further on, plus a question), each reply
// plan.replyTokens words, temperature 0, seed 42. A way is an engine with its flags; a way with "conduct" switches the
// step live the way Bob's conductor plans this job (readBig): save the chat, POST /context with the reading step,
// restore, read; then save, POST /context with the chat step, restore, before the follow-ups. Ways run round-robin,
// a fresh load each time, with the Addendum 74 cool-down before every load and every turn (unless the plan says
// "coolDown": false). Written out: runs.jsonl and summary.md (total time to the last word, per-turn reading and
// writing speed, each switch's seconds, the same words or not; median with min and max). It takes the PC test lock,
// stops between turns on the stop file or a game, never compiles, never touches live Bob and reads no keys.
import fs from 'node:fs';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { realFx, median, sha256, takeLock, freePort, coolTarget, coolWait, cardSummary } from './speed-test.mjs';

const r2 = (x) => (Number.isFinite(x) ? Math.round(x * 100) / 100 : null);

export function loadE2ePlan(file, { vars = {}, read = (f) => fs.readFileSync(f, 'utf8').replace(/\r\n/g, '\n') } = {}) {
  const raw = read(file).replace(/\$\{(\w+)\}/g, (m, k) => { const v = k in vars ? vars[k] : process.env[k]; return v === undefined ? m : JSON.stringify(String(v)).slice(1, -1); });
  const plan = JSON.parse(raw);
  const problems = [];
  for (const k of ['brain', 'engines', 'ways', 'text']) if (!plan[k]) problems.push(`the plan needs "${k}"`);
  for (const w of plan.ways || []) {
    if (!plan.engines?.[w.engine]) problems.push(`way ${w.id}: no engine "${w.engine}"`);
    if (w.conduct && !(w.conduct.readStep && w.conduct.chatStep)) problems.push(`way ${w.id}: conduct needs readStep and chatStep`);
  }
  const unfilled = raw.match(/\$\{\w+\}/g); if (unfilled) problems.push(`not filled: ${[...new Set(unfilled)].join(', ')}`);
  let text = '';
  if (plan.text) { try { text = read(path.resolve(path.dirname(file), plan.text)); } catch { problems.push(`can't read ${plan.text}`); } }
  const rep = Number(plan.textRepeat) || 1;
  if (text && rep > 1) text = Array(rep).fill(text).join('\n\n');
  return { plan, text, problems };
}

// The job's turns from the text: one big read, then the follow-ups, cut by the brain's own tokens.
export async function makeTurns({ plan, text, fx, url }) {
  const toks = await fx.tokenize(url, text);
  const big = plan.bigRead || 24576, each = plan.followTokens || 200, n = plan.followUps ?? 5;
  if (toks.length < big + n * each) throw new Error(`the text has ${toks.length} tokens, ${big + n * each} wanted`);
  const turns = [{ kind: 'read', say: `Here is a file:\n\n${await fx.detokenize(url, toks.slice(0, big))}\n\n${plan.readQuestion || 'Summarise what this file is about in a short paragraph.'}` }];
  for (let i = 0; i < n; i++) {
    const part = await fx.detokenize(url, toks.slice(big + i * each, big + (i + 1) * each));
    turns.push({ kind: 'follow', say: `Here is a little more of it:\n\n${part}\n\n${plan.followQuestion || 'How does this part fit with what came before? Answer briefly.'}` });
  }
  return turns;
}

// Nov 20: plan.thinking leaves the think block open, so the brain thinks first (a long reply, as with thinking on in Bob)
const chatText = (history, thinking = false) => history.map((h) => `<|im_start|>${h.role}\n${h.content}<|im_end|>\n`).join('') + (thinking ? '<|im_start|>assistant\n<think>\n' : '<|im_start|>assistant\n<think>\n\n</think>\n\n');

// Nov 20 (Bob's conductor grows the copy cache for a long reply, Speed thread 3cb4cce2): by min(maxMib, the card's
// free memory less marginMib), from the free memory Brain Engine 28's POST /context answer reports (patch 0047);
// nothing when the engine doesn't report it.
export function growBy(grow, ctxJson) {
  const free = (ctxJson?.devices || []).map((d) => Number(d.free_mib)).filter(Number.isFinite);
  if (!grow || !free.length) return 0;
  return Math.max(0, Math.min(grow.maxMib ?? 2048, Math.min(...free) - (grow.marginMib ?? 768)));
}

// Nov 20 (the owner: a long chat lends on every long read, so price lending per turn): the lend (patch 0022) lines a
// turn added to the engine log, "MoE cache lent in X ms" and "... uploaded again in X ms".
export function lendTimes(logText = '') {
  const lent = [...String(logText).matchAll(/MoE cache lent in ([\d.]+) ms/g)].map((m) => Number(m[1]));
  const back = [...String(logText).matchAll(/uploaded again in ([\d.]+) ms/g)].map((m) => Number(m[1]));
  return { lends: lent.length, lendMs: r2(lent.reduce((a, b) => a + b, 0)), refills: back.length, refillMs: r2(back.reduce((a, b) => a + b, 0)) };
}

// One switch the way Bob's conductor does it: save the chat, change the step, restore. Seconds for each part.
export async function liveStep({ fx, url, step, slotFile, extra = {} }) {
  const t0 = fx.now();
  const save = await fx.postJson(url, '/slots/0?action=save', { filename: slotFile });
  const t1 = fx.now();
  const ctx = await fx.postJson(url, '/context', { n_batch: step, n_ubatch: step, ...extra });
  const t2 = fx.now();
  const rest = await fx.postJson(url, '/slots/0?action=restore', { filename: slotFile });
  const t3 = fx.now();
  return { step, saveS: r2((t1 - t0) / 1000), switchS: r2((t2 - t1) / 1000), restoreS: r2((t3 - t2) / 1000), totalS: r2((t3 - t0) / 1000), ...(ctx.json?.devices ? { freeMib: ctx.json.devices.map((d) => d.free_mib), cacheMib: ctx.json.moe_cache_mib } : {}), ok: !!(save.ok && ctx.ok && rest.ok), why: [save, ctx, rest].filter((x) => !x.ok).map((x) => x.why).join('; ') || undefined };
}

// One way, once: load, the whole job, stop.
export async function runWay({ plan, text, way, round, fx, cool }) {
  const eng = plan.engines[way.engine];
  const out = { way: way.id, round, turns: [], switches: [] };
  if (cool) out.coolDown = await coolWait(cool, fx);
  // Nov 21 (Avalon vs BE28): Windows shared GPU memory before the load, then after each turn; a rise is a spill
  const shared0 = plan.spillCheck && fx.sharedGpuMB ? await fx.sharedGpuMB() : null;
  const port = await fx.port();
  const args = ['-m', plan.brain, '--host', '127.0.0.1', '--port', String(port), ...(way.noBase ? [] : plan.baseArgs || []), ...(way.args || [])];
  const srv = fx.start(eng.exe, args, { ...(eng.env || {}), ...(way.env || {}) });
  try {
    const up = await srv.ready();
    if (!up.ok) { out.notRun = up.why; return out; }
    const turns = await makeTurns({ plan, text, fx, url: srv.url });
    const history = plan.system ? [{ role: 'system', content: plan.system }] : [];
    const t0 = fx.now();
    let coolS = 0, lastCtx = null, logAt = String(srv.log?.() || '').length;
    for (const [i, turn] of turns.entries()) {
      if (fx.shouldStop()) { out.stopped = fx.shouldStop(); break; }
      if (cool && i > 0) { const tc = fx.now(); const c = await coolWait(cool, fx); coolS += (fx.now() - tc) / 1000; out.turns.at(-1).coolAfter = c; }
      // before the big read the chat is still empty, so the step changes without a save and restore (nothing to keep)
      if (way.conduct && i === 0) { const tt = fx.now(); const ctx = await fx.postJson(srv.url, '/context', { n_batch: way.conduct.readStep, n_ubatch: way.conduct.readStep }); lastCtx = ctx.json; out.switches.push({ before: 'read', step: way.conduct.readStep, switchS: r2((fx.now() - tt) / 1000), totalS: r2((fx.now() - tt) / 1000), ...(ctx.json?.devices ? { freeMib: ctx.json.devices.map((d) => d.free_mib), cacheMib: ctx.json.moe_cache_mib } : {}), ok: !!ctx.ok, why: ctx.ok ? undefined : ctx.why }); }
      if (way.conduct && i === 1) {
        const g = growBy(way.conduct.grow, lastCtx);
        const extra = g > 0 ? { moe_cache_mib: (way.conduct.grow.baseMib ?? 4096) + g } : {};
        out.switches.push({ before: 'follow-ups', ...(g > 0 ? { grewMib: g } : way.conduct.grow ? { grewMib: 0 } : {}), ...(await liveStep({ fx, url: srv.url, step: way.conduct.chatStep, slotFile: `e2e-${way.id}.bin`, extra })) });
      }
      history.push({ role: 'user', content: turn.say });
      const card = fx.sampleCard ? fx.sampleCard() : null;
      const r = await fx.stream(srv.url, { prompt: chatText(history, !!plan.thinking), n_predict: (i > 0 && plan.followReplyTokens) || plan.replyTokens || 300, temperature: 0, seed: 42, ignore_eos: true, cache_prompt: true });
      const c = card ? cardSummary(card.stop()) : null;
      history.push({ role: 'assistant', content: r.text || '' });
      const sharedNow = shared0 !== null ? await fx.sharedGpuMB() : null;
      const logNow = String(srv.log?.() || ''); const lt = lendTimes(logNow.slice(logAt)); logAt = logNow.length;
      out.turns.push({ kind: turn.kind, firstWordMs: r.firstWordMs, totalMs: r.totalMs, readTps: r.readTps, writeTps: r.writeTps, promptN: r.promptN, writtenN: r.writtenN, textSha: r.textSha, ...(plan.saveText ? { text: r.text || '' } : {}), ...(Number.isFinite(sharedNow) && Number.isFinite(shared0) ? { spillMB: Math.max(0, sharedNow - shared0) } : {}), ...(lt.lends || lt.refills ? { lend: lt } : {}), ...(c ? { card: { startTempC: c.startTempC, maxTempC: Number.isFinite(c.maxTempC) ? c.maxTempC : null, medSmMHz: c.medSmMHz, peakMemMB: Number.isFinite(c.peakMemMB) ? c.peakMemMB : null, throttledSamples: c.throttledSamples ?? 0 } } : {}) });
    }
    // the job's time to the last word, the cool-down pauses between turns left out (they are the test's, not the job's)
    out.jobS = r2((fx.now() - t0) / 1000 - coolS);
    out.wordsSha = sha256(out.turns.map((t) => t.textSha).join('|'));
  } catch (e) { out.failed = String(e.message || e); } finally { await srv.stop(); }
  return out;
}

// plan.alternate (Nov 21): odd rounds run the ways in reverse, so no engine always goes first (A, B, then B, A)
// way.rounds (Nov 21, the owner: compare Avalon with the BE28 numbers we have): a way runs only its first N rounds.
export const order = (ways, rounds, alternate = false) => Array.from({ length: rounds }, (_, round) => (alternate && round % 2 ? [...ways].reverse() : ways).filter((way) => !Number.isFinite(way.rounds) || round < way.rounds).map((way) => ({ round, way }))).flat();

// The first word (counted by spaces) where a run's replies part from the reference run's, as "turn N word M"; '' if same.
export function firstDiff(turns = [], refTurns = []) {
  for (let i = 0; i < Math.max(turns.length, refTurns.length); i++) {
    const a = String(turns[i]?.text ?? '').split(/\s+/), b = String(refTurns[i]?.text ?? '').split(/\s+/);
    for (let j = 0; j < Math.max(a.length, b.length); j++) if (a[j] !== b[j]) return `turn ${i + 1} word ${j + 1}`;
  }
  return '';
}
// plan.busy (Nov 21, the owner: round 3 at 128K on a normal desktop): before the first load of busy.round, start
// busy.cmd (browser tabs and a muted video), wait busy.settleS, and mark that round's jobs busy. If it can't start, the
// round's jobs are recorded as not run, never quietly run on a clean desktop.
export async function openBusy(busy, fx) {
  if (!busy?.cmd) return { ok: false, why: 'no busy-desktop command given' };
  const r = await fx.runDetached(busy.cmd);
  if (!r.ok) return { ok: false, why: `the busy desktop didn't open: ${r.why}` };
  await fx.sleep((busy.settleS ?? 60) * 1000);
  return { ok: true };
}
const failedRun = (r) => !!(r.notRun || r.failed || r.stopped);

export function summariseE2e(results, plan = {}) {
  const f = (xs) => { const a = xs.filter(Number.isFinite); return a.length ? `${r2(median(a))} (${r2(Math.min(...a))}-${r2(Math.max(...a))})` : '-'; };
  const by = new Map();
  // busy-desktop jobs get their own line, so they never move the clean-desktop medians
  for (const r of results) { const k = r.busy ? `${r.way} (busy desktop)` : r.way; if (!by.has(k)) by.set(k, []); by.get(k).push(r); }
  const ref = plan.wordsRef || [...by.keys()][0];
  const refRun = (by.get(ref) || []).find((r) => !failedRun(r) && r.turns?.every((t) => typeof t.text === 'string'));
  const refShas = new Set((by.get(ref) || []).map((r) => r.wordsSha).filter(Boolean));
  const lines = ['| way | runs | job s to the last word | big read: read t/s | big read: first word s | follow-ups: read t/s | follow-ups: write t/s | switches s | cache grown MiB (card free MiB) | lends / refills per job, ms each (median) | same words as ' + ref + ' | peak card MB | shared spill MB (max) | first word that differs from ' + ref + ' |', '|---|---|---|---|---|---|---|---|---|---|---|---|---|---|'];
  for (const [id, rs] of by) {
    const ok = rs.filter((r) => !r.notRun && !r.failed && !r.stopped);
    const big = ok.map((r) => r.turns[0]).filter(Boolean), fol = ok.flatMap((r) => r.turns.slice(1));
    const sw = ok.map((r) => r.switches.reduce((s, x) => s + (x.totalS || 0), 0));
    lines.push(`| ${id} | ${ok.length}${rs.length > ok.length ? ` (+${rs.length - ok.length} not run)` : ''} | ${f(ok.map((r) => r.jobS))} | ${f(big.map((t) => t.readTps))} | ${f(big.map((t) => t.firstWordMs / 1000))} | ${f(fol.map((t) => t.readTps))} | ${f(fol.map((t) => t.writeTps))} | ${ok.some((r) => r.switches.length) ? f(sw) : '-'} | ${(() => { const g = ok.flatMap((r) => r.switches.filter((x) => Number.isFinite(x.grewMib))); const fr = ok.flatMap((r) => r.switches.filter((x) => x.before === 'read' && x.freeMib).map((x) => Math.min(...x.freeMib))); return g.length ? `${f(g.map((x) => x.grewMib))}${fr.length ? ` (${f(fr)})` : ''}` : '-'; })()} | ${(() => { const ls = ok.flatMap((r) => r.turns.filter((t) => t.lend).map((t) => t.lend)); if (!ls.length) return '-'; const n = ok.map((r) => r.turns.reduce((s, t) => s + (t.lend?.lends || 0), 0)); const per = (k, c) => ls.filter((x) => x[c]).map((x) => x[k] / x[c]); return `${f(n)} / ${f(ok.map((r) => r.turns.reduce((s, t) => s + (t.lend?.refills || 0), 0)))}, lend ${f(per('lendMs', 'lends'))}, refill ${f(per('refillMs', 'refills'))}`; })()} | ${ok.filter((r) => refShas.has(r.wordsSha)).length} of ${ok.length} | ${f(ok.map((r) => Math.max(...r.turns.map((t) => t.card?.peakMemMB ?? -Infinity))))} | ${(() => { const sp = ok.flatMap((r) => r.turns.map((t) => t.spillMB)).filter(Number.isFinite); return sp.length ? String(Math.max(...sp)) : '-'; })()} | ${id === ref || !refRun ? '-' : ok.map((r) => (r.turns.every((t) => typeof t.text === 'string') ? firstDiff(r.turns, refRun.turns) || 'same' : '?')).join('; ')} |`);
  }
  const bad = results.filter((r) => r.notRun || r.failed || r.stopped || r.switches?.some((s) => !s.ok));
  if (bad.length) lines.push('', 'Problems (each one is a result; a failed load is retried once when the plan says retryOnce):', ...bad.map((r) => `- ${r.way} round ${r.round + 1}${r.retry ? ' (retry)' : ''}${r.busy ? ' (busy desktop)' : ''}: ${r.stopped ? `stopped: ${r.stopped}` : ''}${r.notRun || r.failed || r.switches.filter((s) => !s.ok).map((s) => `switch before ${s.before}: ${s.why}`).join('; ')}`));
  return lines.join('\n') + '\n';
}

function liveFx(plan, outDir) {
  const fx = realFx(plan, outDir);
  return {
    ...fx, port: freePort, now: () => performance.now(),
    sleep: fx.sleep || ((ms) => new Promise((r) => setTimeout(r, ms))),
    runDetached(cmd) {
      return new Promise((r) => {
        try { const c = spawn(cmd, { shell: true, detached: true, stdio: 'ignore', windowsHide: false }); c.on('error', (e) => r({ ok: false, why: String(e.message || e) })); c.unref(); setTimeout(() => r({ ok: true }), 2000); } catch (e) { r({ ok: false, why: String(e.message || e) }); }
      });
    },
    async postJson(url, p, body) {
      try {
        const r = await fetch(url + p, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(15 * 60e3) });
        const t = await r.text();
        let json = null; try { json = JSON.parse(t); } catch { /* not JSON */ }
        return { ok: r.ok, json, why: r.ok ? '' : t.slice(0, 300) };
      } catch (e) { return { ok: false, why: String(e.message || e) }; }
    }
  };
}

async function main() {
  const a = process.argv.slice(2);
  const opt = (k, d) => { const i = a.indexOf(k); return i >= 0 ? a[i + 1] : d; };
  const planFile = opt('--plan'), outDir = opt('--out');
  if (!planFile || !outDir) { console.log('node model-lab/conductor-e2e.mjs --plan <plan.json> --out <folder> [--var NAME=value ...] [--rounds 5] [--dry]'); process.exit(2); }
  const vars = {};
  a.forEach((x, i) => { if (x === '--var' && a[i + 1]) { const [k, ...v] = a[i + 1].split('='); vars[k] = v.join('='); } });
  const { plan, text, problems } = loadE2ePlan(planFile, { vars });
  if (problems.length) { console.error('The plan has problems:\n- ' + problems.join('\n- ')); process.exit(1); }
  const rounds = Number(opt('--rounds', plan.rounds || 5));
  const todo = order(plan.ways, rounds, !!plan.alternate);
  if (a.includes('--dry')) { console.log(`${todo.length} loads (${plan.ways.length} ways x ${rounds} rounds, round-robin). Text ${sha256(text).slice(0, 12)}. Nothing started.`); return; }
  fs.mkdirSync(outDir, { recursive: true });
  const lock = takeLock(plan.lock, 'conductor-e2e');
  if (!lock.ok) { console.error(lock.why); process.exit(3); }
  const fx = liveFx(plan, outDir);
  const cool = coolTarget(plan, fx.cardTempC ? await fx.cardTempC() : null);
  if (cool) console.log(`card baseline: ${cool.idleC ?? '?'} °C idle; every load and turn starts at or under ${cool.cardC} °C (waits up to ${cool.maxWaitS} s)`);
  const results = [];
  let busyAt = null;
  try {
    for (const { round, way } of todo) {
      const why = fx.shouldStop(); if (why) break;
      const isBusy = plan.busy && round + 1 === plan.busy.round;
      if (isBusy && !busyAt) { busyAt = await openBusy(plan.busy, fx); console.log(busyAt.ok ? `round ${round + 1}: normal desktop open` : busyAt.why); }
      console.log(`round ${round + 1}/${rounds}: ${way.id}${isBusy ? ' (busy desktop)' : ''}`);
      if (isBusy && !busyAt.ok) { const res = { way: way.id, round, turns: [], switches: [], busy: true, notRun: busyAt.why }; results.push(res); fs.appendFileSync(path.join(outDir, 'runs.jsonl'), JSON.stringify(res) + '\n'); continue; }
      const res = { ...(await runWay({ plan, text, way, round, fx, cool })), ...(isBusy ? { busy: true } : {}) };
      results.push(res);
      fs.appendFileSync(path.join(outDir, 'runs.jsonl'), JSON.stringify(res) + '\n');
      // plan.retryOnce (Nov 21, the owner: no gaps): a failed load or job is kept as a result, then run once more
      if (plan.retryOnce && (res.notRun || res.failed) && !fx.shouldStop()) {
        console.log(`round ${round + 1}/${rounds}: ${way.id} failed (${res.notRun || res.failed}), retrying once`);
        const again = { ...(await runWay({ plan, text, way, round, fx, cool })), retry: true, ...(isBusy ? { busy: true } : {}) };
        results.push(again);
        fs.appendFileSync(path.join(outDir, 'runs.jsonl'), JSON.stringify(again) + '\n');
      }
      fs.writeFileSync(path.join(outDir, 'summary-so-far.md'), summariseE2e(results, plan));
    }
  } finally { lock.release(); }
  fs.writeFileSync(path.join(outDir, 'summary.md'), `# ${plan.name}\n\n${cool ? `Card baseline ${cool.idleC} °C idle, target ${cool.cardC} °C.\n\n` : ''}${summariseE2e(results, plan)}`);
  console.log(`Done. ${path.join(outDir, 'summary.md')}`);
}

const realOf = (f) => { try { return fs.realpathSync(f); } catch { return path.resolve(f); } };
if (process.argv[1] && realOf(process.argv[1]) === realOf(fileURLToPath(import.meta.url))) main().catch((e) => { console.error(e); process.exit(1); });

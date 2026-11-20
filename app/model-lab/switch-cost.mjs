#!/usr/bin/env node
// What a live setting change costs the conductor (method doc Addendum 65, Nov 19 2026).
//
//   node model-lab/switch-cost.mjs --plan <plan.json> --out <folder> [--var NAME=value ...] [--repeats 5] [--dry]
//
// One engine stays loaded (fixed placement, so layers never move). For each switch in the plan, repeated:
//   1. POST /context with the switch's `from` settings (untimed), read the chat prompt (untimed, 16 words),
//   2. save the chat (POST /slots/0?action=save), timed,
//   3. POST /context with the `to` settings, timed (wall clock, plus the engine's own seconds),
//   4. restore the chat (action=restore), timed; a refusal is written down, never hidden,
//   5. ask the follow-up on the restored chat: first word and the words written.
// Then, for every distinct `to` setting, a fresh engine started with that setting as flags and keys answers the same
// prompt and follow-up, and its words are compared with the switched engine's (same words or not).
// Every /context call empties the chats, so the save and restore are part of the switch's real cost.
// Written out: runs.jsonl (every step) and summary.md (median, min and max per switch). It takes the PC test lock,
// stops between steps on the stop file or a game, never compiles, never touches live Bob and reads no keys.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { realFx, median, sha256, takeLock, freePort, coolTarget, coolWait, cardSummary } from './speed-test.mjs';

const r2 = (x) => (Number.isFinite(x) ? Math.round(x * 100) / 100 : null);

// A /context body as engine flags and keys, for the fresh-start reference.
export function argsFor(body = {}) {
  const args = [], env = {};
  if (body.n_ctx) args.push('-c', String(body.n_ctx));
  if (body.n_batch) args.push('-b', String(body.n_batch));
  if (body.n_ubatch) args.push('-ub', String(body.n_ubatch));
  if (body.cache_type_k) args.push('-ctk', body.cache_type_k);
  if (body.cache_type_v) args.push('-ctv', body.cache_type_v);
  if (body.moe_cache_mib !== undefined) args.push('--moe-cache-mib', String(body.moe_cache_mib));
  if (body.moe_cache_cpu_share !== undefined) args.push('--moe-cache-cpu-share', String(body.moe_cache_cpu_share));
  for (const [k, v] of Object.entries(body.engine_keys || {})) if (v !== null && v !== undefined) env[k] = String(v);
  return { args, env };
}

// Later flags win in llama.cpp's parser, so the setting's own flags go after the base ones.
export function mergeArgs(base, extra) { return [...base, ...extra]; }

// "brain kept loaded" / "brain loaded again" and "context A -> B tokens in X s" from the engine log, newest first.
export function parseSwitchLog(log = '') {
  const lines = String(log).split('\n');
  let kept = null, seconds = null;
  for (let i = lines.length - 1; i >= 0 && (kept === null || seconds === null); i--) {
    const l = lines[i];
    if (kept === null && /brain kept loaded/.test(l)) kept = true;
    else if (kept === null && /brain loaded again/.test(l)) kept = false;
    const m = seconds === null && l.match(/context \d+ -> \d+ tokens in ([\d.]+) s/);
    if (m) seconds = Number(m[1]);
  }
  return { kept, logSeconds: seconds };
}

export function loadSwitchPlan(file, { read = (f) => fs.readFileSync(f, 'utf8').replace(/\r\n/g, '\n'), vars = {} } = {}) {
  const raw = read(file).replace(/\$\{(\w+)\}/g, (m, k) => { const v = k in vars ? vars[k] : process.env[k]; return v === undefined ? m : JSON.stringify(String(v)).slice(1, -1); }); // 20 Nov: escaped, so a Windows path (backslashes) stays valid JSON
  const plan = JSON.parse(raw);
  const problems = [];
  if (!plan.exe) problems.push('no exe');
  if (!plan.brain) problems.push('no brain');
  if (!Array.isArray(plan.switches) || !plan.switches.length) problems.push('no switches');
  for (const s of plan.switches || []) { if (!s.id || !s.from || !s.to) problems.push(`switch ${s.id || '?'} needs id, from and to`); }
  if (/\$\{\w+\}/.test(raw)) problems.push(`unset variables: ${[...new Set(raw.match(/\$\{\w+\}/g))].join(', ')}`);
  const dir = path.dirname(file);
  let text = '';
  if (plan.prompt?.file) { try { text = read(path.resolve(dir, plan.prompt.file)); } catch { problems.push(`can't read ${plan.prompt.file}`); } } else problems.push('no prompt file');
  // 20 Nov: a long context (128K) needs the 37K-token text several times over, as the speed plans do (promptRepeat)
  const rep = Number(plan.prompt?.repeat) || 1;
  if (text && rep > 1) text = Array(rep).fill(text).join('\n\n');
  return { plan, text, problems };
}

// One switch, once: the five steps above on a loaded engine.
export async function measureSwitch({ sw, srv, fx, prompt, followUp, maxTokens, slotFile }) {
  const out = { switch: sw.id };
  const ctx0 = await fx.postJson(srv.url, '/context', sw.from);
  if (!ctx0.ok) { out.failed = `setting "from" refused: ${ctx0.why}`; return out; }
  const read = await fx.stream(srv.url, { prompt, n_predict: 16, temperature: 0, seed: 42, cache_prompt: true });
  out.readMs = read.firstWordMs;
  let t = fx.now();
  const save = await fx.postJson(srv.url, '/slots/0?action=save', { filename: slotFile });
  out.saveS = r2((fx.now() - t) / 1000); out.saved = save.ok;
  t = fx.now();
  const ctx = await fx.postJson(srv.url, '/context', sw.to);
  out.switchS = r2((fx.now() - t) / 1000);
  if (!ctx.ok) { out.failed = `switch refused: ${ctx.why}`; return out; }
  out.engineS = r2(Number(ctx.json?.seconds));
  Object.assign(out, parseSwitchLog(srv.log()));
  t = fx.now();
  const rest = await fx.postJson(srv.url, '/slots/0?action=restore', { filename: slotFile });
  out.restoreS = r2((fx.now() - t) / 1000); out.restored = rest.ok;
  if (!rest.ok) out.restoreWhy = rest.why;
  const card = fx.sampleCard ? fx.sampleCard() : null; // Nov 20: the card's heat and clocks during the timed reply
  const ans = await fx.stream(srv.url, { prompt: prompt + followUp, n_predict: maxTokens, temperature: 0, seed: 42, ignore_eos: true, cache_prompt: true });
  if (card) { const c = cardSummary(card.stop()); out.card = { startTempC: c.startTempC, maxTempC: Number.isFinite(c.maxTempC) ? c.maxTempC : null, medSmMHz: c.medSmMHz, minSmMHz: Number.isFinite(c.minSmMHz) ? c.minSmMHz : null, throttledSamples: c.throttledSamples ?? 0 }; }
  out.nextFirstWordMs = ans.firstWordMs; out.writeTps = ans.writeTps; out.textSha = ans.textSha;
  out.totalS = r2((out.saveS || 0) + out.switchS + (out.restoreS || 0) + (ans.firstWordMs || 0) / 1000);
  // Nov 20 (the owner: read with the best reading settings, then flip to the best writing ones): the whole job, the
  // read at `from` plus the switch plus the reply at `to`. A switch marked "stay" is the one-setting comparison: the
  // switch is only there to keep the steps the same, so its cost is left out of the job time.
  const words = Number(ans.writtenN ?? ans.words) || maxTokens;
  const replyS = (ans.firstWordMs || 0) / 1000 + (Number.isFinite(ans.writeTps) && ans.writeTps > 0 ? words / ans.writeTps : 0);
  out.jobS = r2((out.readMs || 0) / 1000 + (sw.stay ? 0 : (out.saveS || 0) + out.switchS + (out.restoreS || 0)) + replyS);
  return out;
}

// A fresh engine at the `to` setting: the same prompt, then the same follow-up.
export async function reference({ plan, body, fx, prompt, followUp, maxTokens }) {
  const { args, env } = argsFor(body);
  const port = await fx.port();
  const srv = fx.start(plan.exe, ['-m', plan.brain, '--host', '127.0.0.1', '--port', String(port), ...mergeArgs(plan.baseArgs || [], args)], { ...(plan.env || {}), ...env });
  try {
    const up = await srv.ready();
    if (!up.ok) return { notRun: up.why };
    await fx.stream(srv.url, { prompt, n_predict: 16, temperature: 0, seed: 42, cache_prompt: true });
    const ans = await fx.stream(srv.url, { prompt: prompt + followUp, n_predict: maxTokens, temperature: 0, seed: 42, ignore_eos: true, cache_prompt: true });
    return { textSha: ans.textSha, nextFirstWordMs: ans.firstWordMs, writeTps: ans.writeTps };
  } catch (e) { return { notRun: String(e.message || e) }; } finally { await srv.stop(); }
}

export function summariseSwitches(runs, refs) {
  const by = new Map();
  for (const r of runs) { if (!by.has(r.switch)) by.set(r.switch, []); by.get(r.switch).push(r); }
  const f = (xs) => { const a = xs.filter(Number.isFinite); return a.length ? `${r2(median(a))} (${r2(Math.min(...a))}-${r2(Math.max(...a))})` : '-'; };
  const lines = ['| switch | n | save s | switch s | engine s | restore s | next first word ms | kept loaded | restored | same words as a fresh start | card °C start / max | clock MHz median / min | read s | writing t/s | job s |', '|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|'];
  for (const [id, rs] of by) {
    const ok = rs.filter((r) => !r.failed);
    const ref = refs[id];
    const same = ref?.textSha ? `${ok.filter((r) => r.textSha === ref.textSha).length} of ${ok.length}` : (ref?.notRun ? `reference not run: ${ref.notRun}` : '-');
    lines.push(`| ${id} | ${ok.length}${rs.length > ok.length ? ` (${rs.length - ok.length} failed)` : ''} | ${f(ok.map((r) => r.saveS))} | ${f(ok.map((r) => r.switchS))} | ${f(ok.map((r) => r.engineS))} | ${f(ok.map((r) => r.restoreS))} | ${f(ok.map((r) => r.nextFirstWordMs))} | ${ok.filter((r) => r.kept === true).length} of ${ok.length} | ${ok.filter((r) => r.restored).length} of ${ok.length} | ${same} | ${f(ok.map((r) => r.card?.startTempC))} / ${f(ok.map((r) => r.card?.maxTempC))} | ${f(ok.map((r) => r.card?.medSmMHz))} / ${f(ok.map((r) => r.card?.minSmMHz))} | ${f(ok.map((r) => (Number.isFinite(r.readMs) ? r.readMs / 1000 : null)))} | ${f(ok.map((r) => r.writeTps))} | ${f(ok.map((r) => r.jobS))} |`);
  }
  const failed = runs.filter((r) => r.failed || r.restoreWhy);
  return `${lines.join('\n')}\n${failed.length ? `\nRefusals:\n${failed.map((r) => `- ${r.switch}: ${r.failed || `restore: ${r.restoreWhy}`}`).join('\n')}\n` : ''}`;
}

export async function runSwitches({ plan, text, fx, repeats, onRun = () => {} }) {
  const followUp = plan.followUp || '\n\nIn two sentences, what is this text about?';
  const maxTokens = plan.maxTokens || 64;
  const port = await fx.port();
  const srv = fx.start(plan.exe, ['-m', plan.brain, '--host', '127.0.0.1', '--port', String(port), ...(plan.baseArgs || [])], plan.env || {});
  const runs = [];
  let cut = text;
  try {
    const up = await srv.ready();
    if (!up.ok) return { runs, refs: {}, notRun: up.why };
    if (plan.prompt.tokens) { const toks = await fx.tokenize(srv.url, text); cut = await fx.detokenize(srv.url, toks.slice(0, plan.prompt.tokens)); }
    for (let k = 0; k < repeats; k++) {
      for (const sw of plan.switches) {
        const why = fx.shouldStop();
        if (why) return { runs, refs: {}, stopped: why };
        const cooled = plan.cool ? await coolWait(plan.cool, fx) : null; // Nov 20: back to the idle card's baseline before each switch
        let r;
        try { r = await measureSwitch({ sw, srv, fx, prompt: cut, followUp, maxTokens, slotFile: `switch-${sw.id}.bin` }); } catch (e) { r = { switch: sw.id, failed: String(e.message || e) }; }
        r.repeat = k; if (cooled) r.coolDown = cooled; runs.push(r); onRun(r);
      }
    }
  } finally { await srv.stop(); }
  const refs = {};
  for (const sw of plan.switches) {
    if (fx.shouldStop()) break;
    refs[sw.id] = await reference({ plan, body: { ...(plan.refBase || {}), ...sw.to, engine_keys: { ...(plan.refBase?.engine_keys || {}), ...(sw.to.engine_keys || {}) } }, fx, prompt: cut, followUp, maxTokens });
    onRun({ reference: sw.id, ...refs[sw.id] });
  }
  return { runs, refs };
}

function liveFx(plan, outDir) {
  const fx = realFx(plan, outDir);
  return {
    ...fx, port: freePort, now: () => performance.now(),
    async postJson(url, p, body) {
      try {
        const r = await fetch(url + p, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(15 * 60e3) });
        const t = await r.text(); let json = null; try { json = JSON.parse(t); } catch {}
        return { ok: r.ok, status: r.status, json, why: r.ok ? '' : t.slice(0, 300) };
      } catch (e) { return { ok: false, why: String(e.message || e) }; }
    }
  };
}

async function main() {
  const a = process.argv.slice(2);
  const opt = (k, d) => { const i = a.indexOf(k); return i >= 0 ? a[i + 1] : d; };
  const planFile = opt('--plan'), outDir = opt('--out');
  if (!planFile || !outDir) { console.log('node model-lab/switch-cost.mjs --plan <plan.json> --out <folder> [--var NAME=value ...] [--repeats 5] [--dry]'); process.exit(2); }
  const vars = {};
  a.forEach((x, i) => { if (x === '--var' && a[i + 1]) { const [k, ...v] = a[i + 1].split('='); vars[k] = v.join('='); } });
  const { plan, text, problems } = loadSwitchPlan(planFile, { vars });
  if (problems.length) { console.error('The plan has problems:\n- ' + problems.join('\n- ')); process.exit(1); }
  const repeats = Number(opt('--repeats', plan.repeats || 5));
  if (a.includes('--dry')) { console.log(`${plan.switches.length} switches x ${repeats} repeats on one load, then ${plan.switches.length} fresh-start references. Prompt ${sha256(text).slice(0, 12)}. Nothing started.`); return; }
  fs.mkdirSync(outDir, { recursive: true });
  const lock = takeLock(plan.lock, 'switch-cost');
  if (!lock.ok) { console.error(lock.why); process.exit(3); }
  const jsonl = path.join(outDir, 'runs.jsonl');
  let res;
  const lfx = liveFx(plan, outDir);
  plan.cool = coolTarget(plan, lfx.cardTempC ? await lfx.cardTempC() : null); // Nov 20: the idle card's baseline, before the load
  try { res = await runSwitches({ plan, text, fx: lfx, repeats, onRun: (r) => { fs.appendFileSync(jsonl, JSON.stringify(r) + '\n'); console.log(JSON.stringify(r)); } }); } finally { lock.release(); }
  fs.writeFileSync(path.join(outDir, 'summary.md'), `# ${plan.name}\n\n${res.notRun ? `Not run: ${res.notRun}\n` : ''}${res.stopped ? `Stopped: ${res.stopped}\n` : ''}\n${summariseSwitches(res.runs, res.refs)}`);
  console.log(`Done. ${path.join(outDir, 'summary.md')}`);
}

const realOf = (f) => { try { return fs.realpathSync(f); } catch { return path.resolve(f); } };
if (process.argv[1] && realOf(process.argv[1]) === realOf(fileURLToPath(import.meta.url))) main().catch((e) => { console.error(e); process.exit(1); });

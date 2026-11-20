// switch-cost.mjs (Addendum 65): the conductor's switch timing, with a fake engine (no card, no network, no files).
import { argsFor, parseSwitchLog, measureSwitch, runSwitches, summariseSwitches, loadSwitchPlan } from '../model-lab/switch-cost.mjs';

let pass = 0, fail = 0;
const check = (name, ok, extra) => { if (ok) { pass++; console.log(`PASS ${name}`); } else { fail++; console.log(`FAIL ${name}${extra !== undefined ? ` (${JSON.stringify(extra)})` : ''}`); } };

check('a /context body becomes flags and keys for the fresh start (null keys left out)', (() => {
  const { args, env } = argsFor({ n_batch: 4096, n_ubatch: 4096, cache_type_k: 'q8_0', cache_type_v: 'q8_0', moe_cache_cpu_share: 1, engine_keys: { LLAMA_MOE_CACHE_LEARN: 16, LLAMA_MOE_CACHE_LEND: null } });
  return args.join(' ') === '-b 4096 -ub 4096 -ctk q8_0 -ctv q8_0 --moe-cache-cpu-share 1' && env.LLAMA_MOE_CACHE_LEARN === '16' && !('LLAMA_MOE_CACHE_LEND' in env);
})());
check('the log says kept or loaded again, and the engine\'s own seconds (newest line wins)', (() => {
  const a = parseSwitchLog('brain loaded again: its placement changed\ncontext 49152 -> 49152 tokens in 9.5 s\nbrain kept loaded: only the context is made again\r\ncontext 49152 -> 49152 tokens in 0.42 s\n');
  const b = parseSwitchLog('nothing here');
  return a.kept === true && a.logSeconds === 0.42 && b.kept === null && b.logSeconds === null;
})());

function fakeFx({ restoreOk = true, refSha = 'S' } = {}) {
  let t = 0, log = '';
  const seen = { posts: [], streams: [], starts: [] };
  return {
    seen, now: () => (t += 100), port: async () => 9000, shouldStop: () => '',
    start(exe, args, env) { seen.starts.push({ args, env }); const ref = seen.starts.length > 1; return { url: 'http://fake', log: () => log, ready: async () => ({ ok: true }), stop: async () => {}, ref }; },
    tokenize: async (u, s) => s.split(' '), detokenize: async (u, toks) => toks.join(' '),
    async postJson(u, p, body) {
      seen.posts.push({ p, body });
      if (p === '/context') { log += 'brain kept loaded: only the context is made again\ncontext 100 -> 100 tokens in 0.3 s\n'; return { ok: true, json: { seconds: 0.3 } }; }
      if (p.includes('restore')) return restoreOk ? { ok: true } : { ok: false, why: 'cache type differs' };
      return { ok: true };
    },
    async stream(u, body) { seen.streams.push(body); return { firstWordMs: 200, writeTps: 80, textSha: seen.starts.length > 1 ? refSha : 'S' }; }
  };
}

{ const fx = fakeFx();
  const r = await measureSwitch({ sw: { id: 'step', from: { n_batch: 2048 }, to: { n_batch: 4096 } }, srv: { url: 'u', log: () => 'brain kept loaded\ncontext 1 -> 1 tokens in 0.3 s' }, fx, prompt: 'p', followUp: ' q', maxTokens: 64, slotFile: 'x.bin' });
  const order = fx.seen.posts.map((x) => x.p).join(',');
  check('a switch: from (untimed), read, save, switch, restore, then the follow-up on the restored chat', order === '/context,/slots/0?action=save,/context,/slots/0?action=restore' && fx.seen.streams[1].prompt === 'p q' && fx.seen.streams[1].cache_prompt === true && fx.seen.streams[1].temperature === 0, order);
  check('each step is timed and the engine\'s own seconds and the kept-loaded line are kept', r.saveS === 0.1 && r.switchS === 0.1 && r.restoreS === 0.1 && r.engineS === 0.3 && r.kept === true && r.logSeconds === 0.3 && r.restored === true, r); }
{ const fx = fakeFx({ restoreOk: false });
  const r = await measureSwitch({ sw: { id: 'kv', from: { cache_type_k: 'q4_0' }, to: { cache_type_k: 'q8_0' } }, srv: { url: 'u', log: () => '' }, fx, prompt: 'p', followUp: ' q', maxTokens: 64, slotFile: 'x.bin' });
  check('a refused restore is written down with why, and the follow-up still runs', r.restored === false && r.restoreWhy === 'cache type differs' && r.nextFirstWordMs === 200); }
{ const fx = fakeFx({ refSha: 'S' });
  const plan = { exe: 'srv', brain: 'b.gguf', baseArgs: ['-c', '49152', '--fit', 'off'], prompt: { tokens: 3 }, switches: [{ id: 'a', from: { n_batch: 2048, n_ubatch: 2048 }, to: { n_batch: 4096, n_ubatch: 4096 } }, { id: 'b', from: {}, to: { engine_keys: { LLAMA_MOE_CACHE_LEARN: 16 } } }] };
  const res = await runSwitches({ plan, text: 'one two three four five', fx, repeats: 2 });
  check('every switch repeated on ONE load, then one fresh start per switch', res.runs.length === 4 && fx.seen.starts.length === 3, fx.seen.starts.length);
  check('the prompt is cut to the plan\'s token count', fx.seen.streams[0].prompt === 'one two three');
  check('the fresh start gets the base flags then the setting\'s own flags and keys', fx.seen.starts[1].args.join(' ').endsWith('-c 49152 --fit off -b 4096 -ub 4096') && fx.seen.starts[2].env.LLAMA_MOE_CACHE_LEARN === '16', fx.seen.starts[1].args);
  const md = summariseSwitches(res.runs, res.refs);
  check('the summary has one line per switch with timings, kept-loaded and same-words counts', /\| a \| 2 \| 0.1 \(0.1-0.1\) \|/.test(md) && /\| 2 of 2 \| 2 of 2 \| 2 of 2 \|/.test(md), md); }
{ const fx = fakeFx({ refSha: 'OTHER' });
  const plan = { exe: 'srv', brain: 'b', prompt: {}, switches: [{ id: 'a', from: {}, to: { n_batch: 4096 } }] };
  const res = await runSwitches({ plan, text: 't', fx, repeats: 1 });
  check('different words from a fresh start are counted, not hidden', /\| 0 of 1 \|$/m.test(summariseSwitches(res.runs, res.refs))); }
{ const files = { '/p/plan.json': '{"exe":"${X}","brain":"b","prompt":{"file":"t.md"},"switches":[{"id":"s","from":{},"to":{}}]}', '/p/t.md': 'line\r\ntwo' };
  const ok = loadSwitchPlan('/p/plan.json', { read: (f) => { if (!(f in files)) throw new Error('no'); return files[f].replace(/\r\n/g, '\n'); }, vars: { X: 'exe' } });
  const bad = loadSwitchPlan('/p/plan.json', { read: (f) => files[f].replace(/\r\n/g, '\n'), vars: {} });
  check('a plan reads its prompt (CRLF stripped) and names unset variables', ok.problems.length === 0 && ok.text === 'line\ntwo' && bad.problems.some((p) => p.includes('${X}')), ok.problems); }

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

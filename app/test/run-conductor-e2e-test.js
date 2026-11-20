// The conductor end-to-end runner (model-lab/conductor-e2e.mjs): the job's turns, the conductor's switches, the job time
// and the summary, all with fake engines; nothing reads the real computer.
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));

let pass = 0, fail = 0;
const check = (name, ok, extra) => { if (ok) { pass++; console.log('PASS', name); } else { fail++; console.log('FAIL', name, extra === undefined ? '' : JSON.stringify(extra).slice(0, 400)); } };

function fakeFx({ words = (body) => 'A', temps = [] } = {}) {
  let t = 0;
  const seen = { posts: [], streams: [], starts: [] };
  return {
    seen, now: () => (t += 100), port: async () => 9000, shouldStop: () => '',
    start(exe, args, env) { seen.starts.push({ exe, args, env }); return { url: 'http://fake', log: () => '', ready: async () => ({ ok: true }), stop: async () => {} }; },
    tokenize: async (u, s) => s.split(' '), detokenize: async (u, toks) => toks.join(' '),
    async postJson(u, p, body) { seen.posts.push({ p, body }); return { ok: true }; },
    async stream(u, body) { seen.streams.push(body); const w = words(body); return { firstWordMs: 200, totalMs: 1000, readTps: 900, writeTps: 80, promptN: 10, writtenN: 300, textSha: w, text: w }; },
    cardTempC: async () => temps.shift() ?? 40, sleep: async () => {}
  };
}

(async () => {
  const m = await import(pathToFileURL(path.join(__dirname, '..', 'model-lab', 'conductor-e2e.mjs')).href);
  const text = Array.from({ length: 2000 }, (_, i) => `w${i}`).join(' ');
  const plan = { brain: 'b', engines: { e: { exe: 'srv' }, p: { exe: 'plain' } }, baseArgs: ['-fa', 'on'], bigRead: 1000, followUps: 5, followTokens: 100, replyTokens: 300, wordsRef: 'a',
    ways: [{ id: 'a', engine: 'e', args: ['-b', '2048'] }, { id: 'c', engine: 'e', args: ['-b', '2048'], conduct: { readStep: 6144, chatStep: 2048 } }, { id: 'd', engine: 'p', noBase: true, args: ['-c', '65536'] }] };

  { const fx = fakeFx(); const turns = await m.makeTurns({ plan, text, fx, url: 'u' });
    check('the job is one big read of the asked size, then the follow-ups from further on in the text', turns.length === 6 && turns[0].kind === 'read' && turns[0].say.includes('w999') && !turns[0].say.includes('w1000 ') && turns[1].say.includes('w1000') && turns[5].say.includes('w1499'));
    let threw = ''; try { await m.makeTurns({ plan: { ...plan, bigRead: 5000 }, text, fx, url: 'u' }); } catch (e) { threw = e.message; }
    check('a text too short for the job stops with how many tokens it has', /2000 tokens, 5500 wanted/.test(threw)); }

  { const fx = fakeFx(); const r = await m.runWay({ plan, text, way: plan.ways[1], round: 0, fx, cool: null });
    const ctx = fx.seen.posts.filter((x) => x.p === '/context').map((x) => x.body.n_batch);
    const order = fx.seen.posts.map((x) => x.p.replace('/slots/0?action=', ''));
    check('the conductor reads at its reading step, then saves, switches back and restores before the follow-ups', ctx.join() === '6144,2048' && order.join() === '/context,save,/context,restore' && r.switches.length === 2 && r.switches.every((s) => s.ok), { order, sw: r.switches });
    check('every turn is timed, the chat grows each turn, temperature 0', r.turns.length === 6 && fx.seen.streams.every((b) => b.temperature === 0 && b.seed === 42 && b.cache_prompt) && fx.seen.streams[5].prompt.length > fx.seen.streams[1].prompt.length && Number.isFinite(r.jobS)); }

  { const fx = fakeFx(); await m.runWay({ plan, text, way: plan.ways[2], round: 0, fx, cool: null });
    check('stock llama.cpp gets only its own flags (no Bob flags), and no switches', fx.seen.starts[0].exe === 'plain' && !fx.seen.starts[0].args.includes('-fa') && fx.seen.starts[0].args.includes('65536') && fx.seen.posts.length === 0); }

  { const fx = fakeFx({ temps: [60, 40, 60, 40] }); const r = await m.runWay({ plan, text, way: plan.ways[0], round: 0, fx, cool: { cardC: 45, maxWaitS: 30, everyS: 5 } });
    check('the card cools before the load and between turns, and the waits are left out of the job time', r.coolDown?.startC === 60 && r.turns[0].coolAfter?.startC === 60, { cd: r.coolDown, t0: r.turns[0] }); }

  { const fx = fakeFx({ words: (b) => (b.prompt.includes('w1') ? 'X' : 'Y') });
    const res = [];
    for (const { round, way } of m.order(plan.ways, 2)) res.push(await m.runWay({ plan, text, way, round, fx: fakeFx(), cool: null }));
    check('ways run round-robin', m.order(plan.ways, 2).map((x) => x.way.id).join() === 'a,c,d,a,c,d');
    const md = m.summariseE2e(res, plan);
    check('the summary gives the job time, the reading and writing speeds, the switches and the same words per way', /\| c \| 2 \| [^|]+ \| 900 \(900-900\) \|/.test(md) && /\| a \| 2 \| .* \| - \| 2 of 2 \|/.test(md) && /\| c \| .* \| 2 of 2 \|/.test(md), md); }

  { check('the writing cache grows by the smaller of 2 GB and the card\'s free memory less 768 MiB, and not at all without the free-memory report', m.growBy({ maxMib: 2048, marginMib: 768 }, { devices: [{ free_mib: 2000 }] }) === 1232 && m.growBy({}, { devices: [{ free_mib: 9000 }] }) === 2048 && m.growBy({}, {}) === 0 && m.growBy(null, { devices: [{ free_mib: 9000 }] }) === 0);
    const fx = fakeFx(); const post = fx.postJson; fx.postJson = async (u, p, body) => { const r = await post(u, p, body); return p === '/context' ? { ...r, json: { devices: [{ name: 'card', free_mib: 3000, total_mib: 16000 }], moe_cache_mib: body.moe_cache_mib ?? 4096 } } : r; };
    const gp = { ...plan, thinking: true, followUps: 1, followReplyTokens: 2000 };
    const r = await m.runWay({ plan: gp, text, way: { id: 'e', engine: 'e', conduct: { readStep: 6144, chatStep: 6144, grow: { baseMib: 4096 } } }, round: 0, fx, cool: null });
    const ctx = fx.seen.posts.filter((x) => x.p === '/context').map((x) => x.body);
    check('Bob\'s grow: after the read the cache grows to 4096 + min(2048, free - 768) for the long reply, with thinking on and the long reply length', ctx[1]?.moe_cache_mib === 6144 && r.switches[1].grewMib === 2048 && r.switches[1].cacheMib === 6144 && fx.seen.streams[1].n_predict === 2000 && fx.seen.streams[0].n_predict === 300 && fx.seen.streams[1].prompt.endsWith('<think>\n') && /\| e \| 1 \| .*\| 2048 \(2048-2048\) \(3000 \(3000-3000\)\) \|/.test(m.summariseE2e([r], gp)), { s1: fx.seen.streams.map((b) => [b.n_predict, b.prompt.slice(-12)]), md: m.summariseE2e([r], gp).split("\n")[2] }); }

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();

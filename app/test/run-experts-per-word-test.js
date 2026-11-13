// Brain Engine 0013, experts per word (src/experts-per-word.js): cleaning a count, the speed guess, what Bob sends to
// the engine and when. A fake fetch stands in for the engine; no real engine, card or settings are read.
import os from 'node:os';
import path from 'node:path';
import { cleanPerWord, cleanPerWordMap, perWordFor, perWordWords, speedGuess, speedGuessWords, sendPerWord, NO_PER_WORD } from '../src/experts-per-word.js';
import { mergeSettings } from '../src/config.js';
import { LlamaCpp } from '../src/llamacpp.js';

let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${ok ? '' : ' ' + extra}`); };
const throws = (fn) => { try { fn(); return ''; } catch (e) { return e.message; } };
const json = (status, body) => ({ status, ok: status >= 200 && status < 300, json: async () => body, text: async () => JSON.stringify(body) });

{
  check('empty, null and 0 mean the brain\'s own', [null, undefined, '', 0, '  ', [0, 0], [null, 0]].every((v) => cleanPerWord(v) === null));
  check('one number', cleanPerWord(6) === 6 && cleanPerWord('6') === 6 && cleanPerWord(' 12 ') === 12);
  check('one per layer, as a list or typed with commas', JSON.stringify(cleanPerWord('6,6,4,4')) === '[6,6,4,4]' && JSON.stringify(cleanPerWord([6, null, 4])) === '[6,0,4]');
  check('a list that is all the same becomes one number', cleanPerWord([5, 5, 5]) === 5 && cleanPerWord('5, 5') === 5);
  check('more than the brain has is refused, in words', /from 1 to 128/.test(throws(() => cleanPerWord(129, { experts: 128 }))));
  check('not a whole number is refused', throws(() => cleanPerWord(2.5)) !== '' && throws(() => cleanPerWord('six')) !== '' && throws(() => cleanPerWord(-1)) !== '' && throws(() => cleanPerWord('4;rm')) !== '');
  check('a list must have one count per layer', /3 counts, this brain has 4 layers/.test(throws(() => cleanPerWord([4, 4, 5], { layers: 4 }))) && JSON.stringify(cleanPerWord([4, 4, 5, 6], { layers: 4 })) === '[4,4,5,6]');
}
{
  const m = cleanPerWordMap({ 'gpt-oss-120b': 6, riker: '12', 'per-layer': [6, 6, 4], gone: null, bad: 'x', ['no good\u0001']: 4, toomany: 5000 });
  check('saved per brain: bad names and bad counts are dropped, null is kept as "its own"', JSON.stringify(m) === JSON.stringify({ 'gpt-oss-120b': 6, riker: 12, 'per-layer': [6, 6, 4], gone: null }), JSON.stringify(m));
  check('junk becomes nothing', JSON.stringify(cleanPerWordMap(null)) === '{}' && JSON.stringify(cleanPerWordMap([1])) === '{}');
  check('it is cleaned when settings are saved', JSON.stringify(mergeSettings({}, { llamacpp: { expertsPerWord: { a: 3, b: 'x' } } }).llamacpp.expertsPerWord) === '{"a":3}');
  check('read back per brain, never throwing', perWordFor({ expertsPerWord: { a: 3 } }, 'a') === 3 && perWordFor({ expertsPerWord: { a: 'junk' } }, 'a') === null && perWordFor(undefined, 'a') === null);
  check('in words', perWordWords(null, 4) === 'the brain\'s own 4' && perWordWords(6, 4) === '6' && perWordWords([6, 0, 4], 4) === '6, 4, 4 (one per layer)');
}
{
  // gpt-oss against its own 4: the thread's estimate was 3 about 15-25% faster, 5 about 13-18% slower, 6 about 22-30% slower
  const g3 = speedGuess(4, 3), g5 = speedGuess(4, 5), g6 = speedGuess(4, 6);
  check('speed guess for gpt-oss sits in the estimated ranges', g3 >= 15 && g3 <= 25 && g5 <= -13 && g5 >= -18 && g6 <= -22 && g6 >= -30, `${g3} ${g5} ${g6}`);
  check('speed guess: the own count changes nothing, a per-layer list averages', speedGuess(4, 4) === 0 && speedGuess(4, [3, 5]) === 0 && speedGuessWords(4, 4) === '');
  check('speed guess in words', /faster/.test(speedGuessWords(8, 6)) && /slower/.test(speedGuessWords(8, 12)) && /a guess/.test(speedGuessWords(8, 12)));
}
{
  const sent = [];
  const ok = await sendPerWord('http://x', 6, { fetchFn: async (url, o) => { sent.push([url, JSON.parse(o.body)]); return json(200, { used: [6, 6], live: true }); } });
  check('sent as POST /experts-per-word {"used": N}', sent[0][0] === 'http://x/experts-per-word' && sent[0][1].used === 6 && ok.live === true);
  await sendPerWord('http://x', null, { fetchFn: async (url, o) => { sent.push([url, JSON.parse(o.body)]); return json(200, {}); } });
  check('the brain\'s own is sent as null', sent[1][1].used === null);
  let e404 = null; try { await sendPerWord('http://x', 6, { fetchFn: async () => json(404, {}) }); } catch (e) { e404 = e; }
  check('an engine without it says so in plain words', e404?.message === NO_PER_WORD && e404.old === true);
  let e400 = null; try { await sendPerWord('http://x', 6, { fetchFn: async () => json(400, { error: { message: 'a slot is busy, set the experts per word when the server is idle' } }) }); } catch (e) { e400 = e; }
  check('a refusal carries the engine\'s reason', /a slot is busy/.test(e400?.message || ''));
}
{
  // Bob's own engine: sends the saved count before a brain's first answer, once, and again after a change. Nothing for a
  // brain without one, and nothing while another reply has the engine.
  const realFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, o) => { calls.push(JSON.parse(o.body).used); return json(200, { n_expert_used: 4, used: [], live: true }); };
  try {
    const cfg = { dataDir: path.join(os.tmpdir(), 'bob-epw-test'), agentDir: os.tmpdir(), llamacpp: { port: 18097, expertsPerWord: { big: 6 } } };
    const e = new LlamaCpp(cfg);
    const logs = []; e.log = (k, t) => logs.push(t);
    e.current = 'small'; e.active = 1;
    await e.sendPerWord('small');
    check('a brain without a count sends nothing', calls.length === 0);
    e.current = 'big'; e.perWordSent = null;
    await e.sendPerWord('big'); await e.sendPerWord('big');
    check('the saved count is sent once', JSON.stringify(calls) === '[6]' && /experts per word 6/.test(logs.join('\n')), JSON.stringify(calls));
    cfg.llamacpp.expertsPerWord.big = null; e.perWordSent = null; // Settings saved a change (server.js clears perWordSent)
    await e.sendPerWord('big');
    check('after a change back to its own, null is sent so the engine goes back', JSON.stringify(calls) === '[6,null]', JSON.stringify(calls));
    cfg.llamacpp.expertsPerWord.big = 5; e.perWordSent = null; e.active = 2;
    await e.sendPerWord('big');
    check('not while another reply has the engine (it would be refused)', calls.length === 2);
    e.active = 1; await e.sendPerWord('big');
    check('the next reply on its own sends it', JSON.stringify(calls) === '[6,null,5]');
    globalThis.fetch = async () => json(404, {});
    cfg.llamacpp.expertsPerWord.big = 3; e.perWordSent = null;
    await e.sendPerWord('big'); await e.sendPerWord('big');
    check('an engine without it is noted in the logbook once, and the chat goes on', logs.filter((t) => /not changed/.test(t)).length === 1);
  } finally { globalThis.fetch = realFetch; }
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

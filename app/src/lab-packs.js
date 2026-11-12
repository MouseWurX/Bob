// 1.5.164 Computer Science Lab: the extra Challenges packs and the runner that marks them. Same rules as the first
// eight: temperature 0, thinking off, a plain machine check, our own questions (src/lab-packs-data.js). Code a brain
// writes only runs in Bob's sandbox. Every pack starts at version 1; bump `version` whenever its questions change.
import * as D from './lab-packs-data.js';
import { runGuard } from './lab-guard.js';
import { genBody } from './lab-gen.js'; // 1.5.168 Professional mode settings
import { PLUS_PACKS, jobSpeedNote } from './lab-plus-packs.js'; // Lab items 105 to 107: French, Spanish, Job speed, Still refuses

const strip = (t) => String(t || '').replace(/<think>[\s\S]*?<\/think>/g, '').replace(/^[\s\S]*<\/think>/, '').trim();
export function letter(t) {
  const s = strip(t);
  const m = s.match(/^\s*\(?([A-D])\)?(?:[).:\s]|$)/) || s.match(/(?:answer|réponse|respuesta|antwort)(?: is| est| es| ist)?[:\s]*\(?([A-D])\)?\b/i) || s.match(/\b([A-D])\b(?![a-z'])/) || s.match(/([A-D])/);
  return m ? m[1].toUpperCase() : '';
}
export function number(t) {
  const all = strip(t).replace(/(\d),(\d{3})\b/g, '$1$2').match(/-?\d+(?:\.\d+)?/g);
  return all ? Number(all[all.length - 1]) : null;
}
export function code(t) { const m = String(t || '').match(/```(?:[a-zA-Z]*)\n?([\s\S]*?)```/); return (m ? m[1] : String(t || '')).trim(); }
const IDK = /\b(?:i (?:do not|don(?:'|’)t) know|not sure|no (?:record|records|information|evidence|reliable)|(?:doesn(?:'|’)t|does not|didn(?:'|’)t|did not) (?:exist|happen|take place)|no such|there (?:is|was|were|are) no\b|(?:isn(?:'|’)t|is not|wasn(?:'|’)t|was not) (?:a )?real|not a real|fictional|made[- ]up|(?:can(?:'|’)t|cannot|can not|no way to) (?:know|tell|be known|predict|see|access|find)|unknown|nobody knows|no one knows|impossible to (?:know|predict|count|say)|never (?:happened|existed|took place|walked|landed)|myth|misconception|not (?:visible|true)|i have no (?:way|access))/i;
export const saysIdk = (t) => IDK.test(strip(t));
const same = (a, b) => (typeof a === 'number' && typeof b === 'number' ? Math.abs(a - b) < 1e-9 : JSON.stringify(a) === JSON.stringify(b));

// One call to the llama-server the challenge job started. Returns the words, the tool calls (with parsed input),
// and the raw message (so a tool result can follow it).
export async function chat(url, messages, { tools, max = 400, signal, gen = null, repeat = 0 } = {}) {
  const body = { messages, temperature: 0, max_tokens: max, chat_template_kwargs: { enable_thinking: false }, ...(gen ? genBody(gen, max, repeat) : {}), ...(tools ? { tools, tool_choice: 'auto' } : {}) };
  const r = await fetch(url + '/v1/chat/completions', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(180e3)]) : AbortSignal.timeout(180e3) });
  if (!r.ok) throw new Error(`llama-server answered ${r.status}`);
  const j = await r.json();
  const m = j.choices?.[0]?.message || {};
  const calls = (m.tool_calls || []).map((c, i) => { let args = null; try { args = typeof c.function?.arguments === 'string' ? JSON.parse(c.function.arguments || '{}') : c.function?.arguments || {}; } catch {} return { id: c.id || `call_${i}`, name: c.function?.name || '', args }; });
  return { text: strip(m.content), calls, msg: { role: 'assistant', content: m.content || '', ...(m.tool_calls ? { tool_calls: m.tool_calls } : {}) }, tps: Number(j.timings?.predicted_per_second) || 0, prefillTps: Number(j.timings?.prompt_per_second) || 0 };
}

const user = (content) => [{ role: 'user', content }];
const sandboxRun = async (ctx, src, fn, cases) => { const res = await ctx.sandbox.run(src, fn, cases.map((c) => c[0])); return Array.isArray(res) && res.length === cases.length && res.every((x, i) => x.ok && same(x.v, cases[i][1])); };

// Each pack: id, title, what, minutes (a rough guess on a 16 GB card), items, and mark(ctx, item) -> true/false, or
// { right, of } for an item worth several marks. ctx = { ask(messages, opts), sandbox }.
export const EXTRA_PACKS = [
  { id: 'usetools', title: 'Use the tools', what: 'Picks the right pretend tool, fills in valid input, and uses what comes back. Some requests need no tool at all.', items: D.USE_TOOLS, minutes: 2,
    async mark(ctx, it) {
      const a = await ctx.ask(user(it.q), { tools: D.USE_TOOLSET });
      if (!it.tool) return !a.calls.length && it.want.test(a.text);
      const c = a.calls[0];
      if (!c || c.name !== it.tool || !c.args || !it.args(c.args)) return false;
      const b = await ctx.ask([...user(it.q), a.msg, { role: 'tool', tool_call_id: c.id, content: JSON.stringify(it.result) }], { tools: D.USE_TOOLSET });
      return it.want.test(b.text);
    } },
  { id: 'idk', title: 'Say "I don\'t know"', what: 'Made-up facts, questions nobody can answer, and trick premises. An honest "I don\'t know" scores; a few plain questions check it still answers.', items: D.IDK, minutes: 1,
    async mark(ctx, it) { const a = await ctx.ask(user(it.q), { max: 200 }); return it.real ? it.real.test(a.text) && !saysIdk(a.text) : saysIdk(a.text); } },
  { id: 'everyrule', title: 'Follow every rule', what: 'Three to five rules at once: length, words to avoid, format, language. Every rule has to hold.', items: D.EVERY_RULE, minutes: 1,
    async mark(ctx, it) { return it.ok((await ctx.ask(user(it.q), { max: 200 })).text); } },
  { id: 'finish', title: 'Finish the code', what: 'Longer JavaScript functions with hidden tests, run in my sandbox.', items: D.FINISH, minutes: 3, sandbox: true,
    async mark(ctx, it) { const a = await ctx.ask(user(`${it.q} Reply with only the code.`), { max: 800 }); return sandboxRun(ctx, code(a.text), it.fn, it.cases); } },
  { id: 'fixbug', title: 'Fix the bug', what: 'A short JavaScript function with one bug and a failing test. Make the test pass without breaking the others.', items: D.FIX, minutes: 2, sandbox: true,
    async mark(ctx, it) { const a = await ctx.ask(user(`This JavaScript function has one bug. The test ${it.fail}, but it isn't. Reply with only the whole fixed function.\n\`\`\`js\n${it.code}\n\`\`\``), { max: 600 }); return sandboxRun(ctx, code(a.text), it.fn, it.cases); } },
  { id: 'sense', title: 'Common sense', what: 'Which ending makes sense, and what happens next. Multiple choice.', items: D.SENSE, minutes: 1,
    async mark(ctx, it) { return letter((await ctx.ask(user(it.q), { max: 20 })).text) === it.a; } },
  { id: 'who', title: 'Who is "she"?', what: 'Pronoun puzzles: two people or things, one word that points to one of them.', items: D.WHO_IS, minutes: 1,
    async mark(ctx, it) { return letter((await ctx.ask(user(it.q), { max: 20 })).text) === it.a; } },
  { id: 'school', title: 'School subjects', what: 'Three questions each across ten subjects, from maths to music. Multiple choice.', items: D.SCHOOL, minutes: 2,
    async mark(ctx, it) { return letter((await ctx.ask(user(it.q), { max: 20 })).text) === it.a; } },
  { id: 'hardsums', title: 'Harder sums', what: 'Word problems with several steps, some with units, some with a trap.', items: D.HARDER_SUMS, minutes: 2,
    async mark(ctx, it) { return number((await ctx.ask(user(it.q), { max: 300 })).text) === it.a; } },
  { id: 'reading', title: 'Read and answer', what: 'A made-up text, then questions only the text can answer.', items: D.READING.flatMap((r) => r.qs.map(([q, want]) => ({ text: r.text, q, want }))), minutes: 1,
    async mark(ctx, it) { return it.want.test((await ctx.ask(user(`Read this, then answer the question using only the text.\n---\n${it.text}\n---\nQuestion: ${it.q}`), { max: 80 })).text); } },
  { id: 'thread', title: 'Long thread', what: 'A 20-turn chat. Does it still remember, at the end, something said near the start?', items: D.LONG_THREAD, minutes: 1,
    async mark(ctx, it) {
      const talk = D.SMALL_TALK.map(([q, a]) => [{ role: 'user', content: q }, { role: 'assistant', content: a }]);
      const m = [...talk[0], { role: 'user', content: it.fact[0] }, { role: 'assistant', content: it.fact[1] }, ...talk.slice(1, 8).flat(), ...(it.change ? [{ role: 'user', content: it.change[0] }, { role: 'assistant', content: it.change[1] }] : []), ...talk.slice(8).flat(), { role: 'user', content: it.q }];
      const t = (await ctx.ask(m, { max: 60 })).text;
      return it.want.test(t) && !(it.not && it.not.test(t));
    } },
  { id: 'languages', title: 'Other languages', what: 'The same questions in French, Spanish, German and Japanese, and "answer in" tasks.', items: D.LANGUAGES, minutes: 1,
    async mark(ctx, it) { const t = (await ctx.ask(user(it.q), { max: 120 })).text; return it.answerIn ? D.langOf(t) === it.answerIn : letter(t) === it.a; } },
  { id: 'shaped', title: 'Shaped answers', what: 'Exactly this JSON shape, this date format, this list length.', items: D.SHAPED, minutes: 1,
    async mark(ctx, it) { return it.ok((await ctx.ask(user(it.q), { max: 200 })).text); } },
  { id: 'character', title: 'Stay in character', what: 'A voice and rules, then eight turns that try to pull it out of them. Each turn that keeps every rule scores.', items: D.CHARACTERS, count: D.CHARACTERS.reduce((a, c) => a + c.turns.length, 0), minutes: 2,
    async mark(ctx, it) {
      const m = [{ role: 'system', content: it.system }]; let right = 0;
      for (const q of it.turns) { m.push({ role: 'user', content: q }); const a = await ctx.ask(m, { max: 160 }); m.push({ role: 'assistant', content: a.text }); if (a.text && it.checks.every((c) => c(a.text))) right++; ctx.tick?.(); }
      return { right, of: it.turns.length };
    } },
  { id: 'errand', title: 'Agent errand', what: 'A small job over pretend files: read, change, check, report. Marked on how the files end up.', items: D.ERRANDS, minutes: 3,
    async mark(ctx, it) {
      const s = { files: { ...it.files }, reports: [] };
      const m = [{ role: 'system', content: 'You can use the tools to work on the user\'s notes folder. Finish the whole job, then stop.' }, ...user(it.q)];
      for (let i = 0; i < 12; i++) {
        const a = await ctx.ask(m, { tools: D.ERRAND_TOOLS, max: 600 });
        m.push(a.msg);
        if (!a.calls.length) break;
        for (const c of a.calls) {
          const x = c.args || {}; let out;
          if (c.name === 'list_files') out = Object.keys(s.files);
          else if (c.name === 'read_file') out = typeof s.files[x.name] === 'string' ? s.files[x.name] : { error: 'No such file.' };
          else if (c.name === 'write_file' && typeof x.name === 'string' && typeof x.content === 'string') { s.files[x.name] = x.content; out = { ok: true }; }
          else if (c.name === 'send_report' && typeof x.text === 'string') { s.reports.push(x.text); out = { ok: true }; }
          else out = { error: 'That tool or input isn\'t right.' };
          m.push({ role: 'tool', tool_call_id: c.id, content: typeof out === 'string' ? out : JSON.stringify(out) });
        }
      }
      return it.done(s);
    } },
  // Guard rails isn't in Overall: a brain whose refusal habit was taken out scores low on purpose, and that's its choice.
  { id: 'guard', title: 'Guard rails', what: 'Answers everyday asks that only sound edgy, ignores orders hidden in a pasted page, and declines what your own refusal lessons say it should. Not counted in Overall.', items: [], count: 21, minutes: 2, ranked: false, guard: true },
  ...PLUS_PACKS
].map((p) => ({ version: 1, count: p.items.length, ...p, ...(p.count ? { count: p.count } : {}) }));

export const EXTRA_IDS = EXTRA_PACKS.map((p) => p.id);
export const NEEDS_SANDBOX = EXTRA_PACKS.filter((p) => p.sandbox).map((p) => p.id);

// Run one extra pack. `holdAsks` = the person's own refusal asks (Guard rails only). Same result shape as runPack.
export async function runExtraPack(url, id, { signal, onStep = () => {}, sandbox = null, holdAsks = [], askFn = chat, gen = null, repeat = 0, log = null } = {}) {
  const p = EXTRA_PACKS.find((x) => x.id === id);
  if (!p) throw new Error(`There's no challenge called ${id}.`);
  const speeds = [], reads = []; let last = '';
  const ask = async (messages, opts = {}) => { if (signal?.aborted) throw new Error('Stopped.'); const a = await askFn(url, messages, { ...opts, signal, gen, repeat }); last = a.calls?.length ? `(called ${a.calls.map((c) => c.name).join(', ')}) ${a.text}` : a.text; if (a.tps) speeds.push(a.tps); if (a.prefillTps) reads.push(a.prefillTps); return a; };
  const avg = (l) => (l.length ? l.reduce((a, b) => a + b, 0) / l.length : 0);
  const speed = () => ({ tps: Math.round(avg(speeds) * 10) / 10, prefillTps: Math.round(avg(reads)) });
  if (p.guard) {
    const g = await runGuard((m) => ask(m, { max: 300 }), { holdAsks, signal, onStep, log: log ? (x) => log({ ...x }) : null });
    return { ...g, ...speed(), ...(holdAsks.length ? {} : { note: 'Held the line wasn\'t run: there are no refusal lessons on this replicant matrix yet. Save some from the sandbox below, or write a lesson set with the refusals skill.' }) };
  }
  if (p.sandbox && !sandbox) return { right: 0, of: p.count, score: null, skipped: 'My sandbox isn\'t working on this replicant matrix, so I won\'t run code a brain wrote. Self-made tools say why.', misses: [], tps: 0, prefillTps: 0 };
  let right = 0, of = 0, done = 0; const misses = [], timed = [];
  const total = p.count;
  const ctx = { ask, sandbox, tick: () => onStep(Math.min(++done, total), total) };
  for (const it of p.items) {
    if (signal?.aborted) throw new Error('Stopped.');
    let r = false;
    try { r = await p.mark(ctx, it); } catch (e) { if (signal?.aborted) throw e; r = false; }
    log?.({ q: String(it.system || it.q || ''), answer: p.private ? '' : last, ok: typeof r === 'object' && r ? `${r.right} of ${r.of}` : Boolean(r) }); // Still refuses never keeps an answer
    if (p.timed && r && typeof r === 'object') timed.push(r);
    if (typeof r === 'object' && r) { right += r.right; of += r.of; if (r.right < r.of) misses.push(String(it.system || it.q).split('\n')[0].slice(0, 120)); }
    else { of++; if (r) right++; else misses.push(String(it.q).split('\n')[0].slice(0, 120)); onStep(Math.min(++done, total), total); }
  }
  return { right, of, score: of ? Math.round((100 * right) / of) : null, misses, ...speed(), ...(p.timed ? jobSpeedNote(timed) : {}) };
}

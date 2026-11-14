// Coaching session: the brain does real lesson tasks with Bob's real tools, and is coached to the right path when it goes wrong
// (14 Nov, the owner: "it's a session where you prompt him lessons, he tries to do it, and you observe the tools he uses. if you
// can coach him to the correct path you do it"). Each step of a lesson (its first --steps assistant turns, with the lesson's own
// earlier calls and recorded tool results before it) is tried; a miss gets a hint and another try, up to three hints:
//   1  a nudge that names the kind of miss (asked instead of acting, wrong tool, right tool but inputs off, a tool when none was needed)
//   2  the tool name(s) (and, for inputs, which ones to set)
//   3  the whole call
// A wrong call is never run: it gets "Not run" back, then the hint. Logged per step: every try's calls, text and thinking, the hint
// that got him there (or none), and the count. Writes answers-coach-<variant>-think-<t>.jsonl, coach.json and COACH.md.
// Evidence only, never training data.
// node coach-tools.mjs --url <server> --questions <calib>/questions --bob <Bob source app folder> --out <folder>
//      [--jobs files,run] [--variants bob] [--think off,on] [--steps 2] [--hints 3] [--parallel 8] [--max 600] [--max-think 3000]
//      [--limit N] [--dry]
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs, judgeTurn } from './tool-judge.mjs';

const readJsonl = (f) => (fs.existsSync(f) ? fs.readFileSync(f, 'utf8').replace(/\r\n/g, '\n').split('\n').filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean) : []);
const callsOf = (m) => (m?.tool_calls || []).map((c) => ({ name: c.function?.name, args: parseArgs(c.function?.arguments) }));
const names = (a) => [...new Set(a.map((c) => c.name))].sort().join(',');

// What kind of miss: none (no call, one wanted), extra (a call, none wanted), tool (wrong tool), inputs (right tool, inputs off)
export function missKind(want, got) {
  if (judgeTurn(want, got)) return null;
  if (!want.length) return 'extra';
  if (!got.length) return 'none';
  return names(want) === names(got) ? 'inputs' : 'tool';
}

export const NUDGE = {
  none: 'Please do it now with your tools instead of asking me or describing it.',
  extra: 'No tool is needed for this one. Just answer me.',
  tool: 'That isn\'t the right tool for this. Look at your tools again and pick the one made for this job.',
  inputs: 'Right tool, but check its inputs against what I asked for.'
};
// The hint at a level (1-3) for a miss, built only from the wanted calls
export function hint(level, kind, want) {
  if (level <= 1 || kind === 'extra') return NUDGE[kind];
  const list = want.map((w) => w.name).join(' and ');
  if (level === 2) return kind === 'inputs' ? `Set ${[...new Set(want.flatMap((w) => Object.keys(parseArgs(w.args))))].join(', ')} to what I asked for.` : `Use ${list}.`;
  return `Call ${want.map((w) => `${w.name} with ${JSON.stringify(parseArgs(w.args))}`).join(', then ')}.`;
}

// The messages after a missed try: his reply (a wrong call gets "Not run"), then the hint from the user
export function afterMiss(msg, hintText) {
  const tc = (msg?.tool_calls || []).map((c, i) => ({ id: c.id || `coach_${i}`, type: 'function', function: { name: c.function?.name, arguments: typeof c.function?.arguments === 'string' ? c.function.arguments : JSON.stringify(c.function?.arguments || {}) } }));
  return [{ role: 'assistant', content: msg?.content || '', ...(tc.length ? { tool_calls: tc } : {}) }, ...tc.map((c) => ({ role: 'tool', tool_call_id: c.id, name: c.function.name, content: 'Not run: paused by the user.' })), { role: 'user', content: hintText }];
}

// Per condition: right first time, right after hint 1/2/3, never; and per job; plus the tools he used on first tries
export function summarizeCoach(rows) {
  const out = {};
  for (const r of rows) {
    const c = (out[r.cond] ||= { n: 0, first: 0, h1: 0, h2: 0, h3: 0, never: 0, jobs: {}, first_tools: {}, kinds: {} });
    const j = (c.jobs[r.job] ||= { n: 0, first: 0, coached: 0, never: 0 });
    c.n++; j.n++;
    const k = r.solved_at; // 0 first try, 1-3 after that hint, null never
    if (k === 0) { c.first++; j.first++; } else if (k == null) { c.never++; j.never++; } else { c[`h${k}`]++; j.coached++; }
    for (const t of r.tries?.[0]?.calls || []) c.first_tools[t.name] = (c.first_tools[t.name] || 0) + 1;
    if (r.tries?.[0]?.miss) c.kinds[r.tries[0].miss] = (c.kinds[r.tries[0].miss] || 0) + 1;
  }
  return out;
}

async function main() {
  const a = Object.fromEntries(process.argv.slice(2).reduce((acc, x, i, arr) => (x.startsWith('--') ? [...acc, [x.slice(2), arr[i + 1] && !arr[i + 1].startsWith('--') ? arr[i + 1] : true]] : acc), []));
  const dry = Boolean(a.dry), url = String(a.url || process.env.LAB_URL || '').replace(/\/$/, ''), KEY = process.env.LAB_API_KEY || '';
  if ((!url && !dry) || !a.questions || !a.bob) { console.error('--url <server> --questions <calib-prep questions folder> --bob <Bob source app folder> are needed (--dry: no server)'); process.exit(1); }
  const out = path.resolve(String(a.out || 'coach-tools')); fs.mkdirSync(out, { recursive: true });
  let bobDir = path.resolve(String(a.bob));
  if (!fs.existsSync(path.join(bobDir, 'src')) && fs.existsSync(path.join(bobDir, 'app', 'src'))) bobDir = path.join(bobDir, 'app');
  // npc keeps the newer tool-wording beside the old one while another run uses tool-wording.mjs
  const tw = await import('./tool-wording-v2.mjs').catch(() => import('./tool-wording.mjs'));
  const { loadBob } = await import('./bob-kit.mjs');
  const kit = await loadBob(bobDir);
  const { SETS } = await import(pathToFileURL(path.join(bobDir, 'src', 'tool-sets.js')).href);
  const jobs = a.jobs ? new Set(String(a.jobs).split(',').map((x) => x.trim()).filter(Boolean)) : null;
  const qs = tw.buildQuestions(readJsonl(path.join(path.resolve(String(a.questions)), 'lessons.jsonl')), kit, { turns: Number(a.steps) || 2, jobs, limit: Number(a.limit) || 0 });
  kit.done();
  const variants = String(a.variants || 'bob').split(',').filter(Boolean), thinks = String(a.think || 'off,on').split(',').filter(Boolean);
  const maxHints = Math.min(3, Number(a.hints ?? 3)), par = Number(a.parallel) || 8, maxOff = Number(a.max) || 600, maxOn = Number(a['max-think']) || 3000, brain = process.env.LAB_MODEL_NAME || 'brain';
  console.log(`${qs.length} lesson steps; variants ${variants.join(', ')}; thinking ${thinks.join(', ')}; up to ${maxHints} hints`);
  const bodyFor = (q, v, think, messages) => {
    const tools = tw.variantTools(q.tools, v, { set: SETS['gpt-oss'], fill: { user: 'the user', home: 'C:\\Users\\you' } });
    const msgs = messages.map((m, i) => (i === 0 && m.role === 'system' && tw.variantSystem ? { ...m, content: tw.variantSystem(m.content, v) } : m));
    return { messages: msgs, ...(tools?.length ? { tools } : {}), ...(tw.variantBody ? tw.variantBody(v) : {}), max_tokens: think === 'on' ? maxOn : maxOff, temperature: 0, chat_template_kwargs: { enable_thinking: think === 'on' } };
  };
  if (dry) { for (const v of variants) for (const t of thinks) console.log(`  ${v} think-${t}: ${JSON.stringify(bodyFor(qs[0], v, t, qs[0].messages)).length} chars, ${qs[0].tools?.length || 0} tools`); console.log(`  hint 3 example: ${hint(3, 'tool', qs.find((q) => q.want.length)?.want || [])}\ndry run OK`); return; }
  const chat = async (body) => { const r = await fetch(`${url}/v1/chat/completions`, { method: 'POST', headers: { 'content-type': 'application/json', ...(KEY ? { authorization: `Bearer ${KEY}` } : {}) }, body: JSON.stringify(body), signal: AbortSignal.timeout(10 * 60000) }); const j = await r.json(); if (!r.ok) throw new Error(JSON.stringify(j).slice(0, 160)); return j; };
  const rows = [];
  for (const t of thinks) for (const v of variants) {
    const cond = `${v} think-${t}`, file = path.join(out, `answers-coach-${v.replace(/\+/g, '-')}-think-${t}.jsonl`), t0 = Date.now();
    let i = 0;
    const work = async () => { while (i < qs.length) { const q = qs[i++]; const want = q.want.map((w) => ({ name: w.name, args: parseArgs(w.args) }));
      let messages = q.messages, solved = null, error = null; const tries = [];
      for (let level = 0; level <= maxHints; level++) {
        let m, c;
        try { const j = await chat(bodyFor(q, v, t, messages)); c = j.choices?.[0] || {}; m = c.message || {}; } catch (e) { error = e.message.slice(0, 160); break; }
        const got = callsOf(m), miss = missKind(want, got);
        tries.push({ hint_before: level ? messages.at(-1).content : null, calls: got, content: String(m.content || '').slice(0, 1500), reasoning: String(m.reasoning_content || '').slice(0, 4000), finish: c.finish_reason || '', miss });
        if (!miss) { solved = level; break; }
        if (level < maxHints) messages = [...messages, ...afterMiss(m, hint(level + 1, miss, q.want))];
      }
      const row = { brain, evidence: true, cond, variant: v, think: t === 'on', job: q.job, idea: q.idea, k: q.k, request: tw.lastUser ? tw.lastUser(q.messages) : '', want: q.want, solved_at: solved, hints: solved ?? (error ? null : maxHints), tries, ...(error ? { error } : {}) };
      fs.appendFileSync(file, JSON.stringify(row) + '\n'); rows.push(row); } };
    await Promise.all(Array.from({ length: par }, work));
    const mine = rows.filter((r) => r.cond === cond);
    console.log(`${cond}: ${mine.filter((r) => r.solved_at === 0).length}/${mine.length} first try, ${mine.filter((r) => r.solved_at > 0).length} after coaching, ${mine.filter((r) => r.solved_at == null && !r.error).length} never, ${mine.filter((r) => r.error).length} errors, ${Math.round((Date.now() - t0) / 1000)} s`);
  }
  const s = summarizeCoach(rows.filter((r) => !r.error));
  fs.writeFileSync(path.join(out, 'coach.json'), JSON.stringify({ brain, made: new Date().toISOString(), hints: NUDGE, scores: s }, null, 1));
  const top = (o, n = 12) => Object.entries(o).sort((x, y) => y[1] - x[1]).slice(0, n).map(([k, n2]) => `${k} (${n2})`).join(', ');
  const md = [`# Coaching ${brain} through Bob's lessons`, '', 'Each lesson step: his first try, then up to 3 hints (1 nudge, 2 the tool name, 3 the whole call). Wrong calls were never run. Evidence only.', '',
    '| condition | steps | right first | after hint 1 | hint 2 | hint 3 | never | first-try misses |', '|---|---|---|---|---|---|---|---|',
    ...Object.entries(s).map(([k, c]) => `| ${k} | ${c.n} | ${c.first} | ${c.h1} | ${c.h2} | ${c.h3} | ${c.never} | ${top(c.kinds)} |`), '',
    ...Object.entries(s).flatMap(([k, c]) => [`## ${k}`, '', `Tools on first tries: ${top(c.first_tools, 20)}`, '', '| job | steps | first | coached | never |', '|---|---|---|---|---|', ...Object.entries(c.jobs).sort().map(([j, x]) => `| ${j} | ${x.n} | ${x.first} | ${x.coached} | ${x.never} |`), ''])].join('\n');
  fs.writeFileSync(path.join(out, 'COACH.md'), md); console.log(md.slice(0, 4000));
}
if (import.meta.url === pathToFileURL(process.argv[1] || '').href) main().catch((e) => { console.error(e.stack || e.message); process.exit(1); });

// Coached lesson sessions (14 Nov, the owner: "it's a session where you prompt him lessons, he tries to do it, and you observe
// the tools he uses. if you can coach him to the correct path you do it"). Replaces the question-and-answer interview.
// Each lesson is walked step by step with Bob's real tools offered (parsed, never run). At every step he tries first; if the
// call is wrong, a coach hint comes back in the chat and he tries again, up to 3 hints, each one plainer:
//   1. a nudge (what the step should get done; for a right tool with wrong inputs, which inputs are off)
//   2. the tool to use
//   3. the exact call
// Then the session moves on along the lesson's own right path (its call and its saved tool result), so the next step is
// judged from a correct state. Saved per step: his first try, every retry, the hint that worked (or none did), his thinking.
// The coached transcripts are seeds for doctored lessons (stock brain, no dials), marked coached:true; evidence only.
// node tool-coach.mjs --url <server> --questions <calib>/questions --bob <Bob source> --out <folder>
//      [--from <tool-wording out> (lessons he missed first)] [--jobs ...] [--per 3] [--steps 4] [--hints 3]
//      [--think off,on] [--parallel 4] [--max 1500] [--max-think 6000] [--gate] [--dry]
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { live, pool } from './engine-live.mjs';
import { buildQuestions, grade } from './tool-wording.mjs';

const readJsonl = (f) => (fs.existsSync(f) ? fs.readFileSync(f, 'utf8').replace(/\r\n/g, '\n').split('\n').filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean) : []);
const parse = (a) => { if (a && typeof a === 'object') return a; try { return JSON.parse(a || '{}'); } catch { return {}; } };
const callsOf = (m) => (m?.tool_calls || []).map((c) => ({ name: c.function?.name, args: parse(c.function?.arguments) }));
const show = (calls) => calls.map((c) => `${c.name} ${JSON.stringify(c.args)}`).join('; ');

// The coach's words for hint level 1..3, from what he did and what the step wanted.
export function hint(level, want, got) {
  if (!want.length) return level === 1 ? 'Coach: no tool is needed for this step. Answer the user in words.' : 'Coach: do not call a tool here. Reply to the user directly.';
  const w = want.map((x) => ({ name: x.name, args: parse(x.args) }));
  const names = w.map((x) => x.name);
  if (level === 1) {
    const same = got.length && got.every((g) => names.includes(g.name));
    if (same) {
      const off = w.flatMap((x) => { const g = got.find((y) => y.name === x.name); return Object.keys(x.args).filter((k) => JSON.stringify(g?.args?.[k]) !== JSON.stringify(x.args[k])); });
      return `Coach: right tool, but check the inputs${off.length ? `: ${[...new Set(off)].join(', ')}` : ''}. Try the step again.`;
    }
    return got.length ? 'Coach: that is not the right step yet. Re-read the request: what should be done right now? Pick the tool that does exactly that, and try again.' : 'Coach: this step needs one of your tools, not a reply in words. Try again.';
  }
  if (level === 2) return `Coach: use ${names.join(' and then ')} for this step. Try again.`;
  return `Coach: make this call: ${show(w)}`;
}

// The chat after a wrong try: his reply, then the coach (as the tool result of each call he made, or as a user message).
export function coached(messages, msg, text) {
  const calls = (msg.tool_calls || []).map((c, i) => ({ id: c.id || `try_${i}`, type: 'function', function: { name: c.function?.name, arguments: typeof c.function?.arguments === 'string' ? c.function.arguments : JSON.stringify(c.function?.arguments || {}) } }));
  const out = [...messages, { role: 'assistant', content: msg.content || '', ...(calls.length ? { tool_calls: calls } : {}) }];
  if (calls.length) calls.forEach((c, i) => out.push({ role: 'tool', tool_call_id: c.id, name: c.function.name, content: i === 0 ? `Not run. ${text}` : 'Not run.' }));
  else out.push({ role: 'user', content: text });
  return out;
}

// Which lessons: the ones he missed with Bob's wording first (from the wording answers), then others, `per` per job.
export function pickLessons(qs, missed, per) {
  const byJob = {};
  for (const q of qs) (byJob[q.job] ||= new Map()).set(q.idea, true);
  const out = new Set();
  for (const [job, ideas] of Object.entries(byJob)) {
    const list = [...ideas.keys()], first = list.filter((i) => missed.has(String(i))), rest = list.filter((i) => !missed.has(String(i)));
    for (const i of [...first, ...rest].slice(0, per)) out.add(`${job}|${i}`);
  }
  return qs.filter((q) => out.has(`${q.job}|${q.idea}`));
}

async function main() {
  const a = Object.fromEntries(process.argv.slice(2).reduce((acc, x, i, arr) => (x.startsWith('--') ? [...acc, [x.slice(2), arr[i + 1] && !arr[i + 1].startsWith('--') ? arr[i + 1] : true]] : acc), []));
  const dry = Boolean(a.dry), url = String(a.url || process.env.LAB_URL || '');
  if ((!url && !dry) || !a.questions || !a.bob) { console.error('--url <server> --questions <folder> --bob <Bob source> are needed (--dry: no server)'); process.exit(1); }
  const out = path.resolve(String(a.out || process.env.LAB_OUT || 'tool-coach')); fs.mkdirSync(out, { recursive: true });
  let bobDir = path.resolve(String(a.bob)); if (!fs.existsSync(path.join(bobDir, 'src')) && fs.existsSync(path.join(bobDir, 'app', 'src'))) bobDir = path.join(bobDir, 'app');
  const { loadBob } = await import('./bob-kit.mjs'); const kit = await loadBob(bobDir);
  let bobVer = '?'; try { bobVer = JSON.parse(fs.readFileSync(path.join(bobDir, 'package.json'), 'utf8')).version; } catch {}
  const jobs = a.jobs ? new Set(String(a.jobs).split(',').map((x) => x.trim()).filter(Boolean)) : null;
  const all = buildQuestions(readJsonl(path.join(path.resolve(String(a.questions)), 'lessons.jsonl')), kit, { turns: Number(a.steps) || 4, jobs });
  kit.done();
  const fromDir = a.from ? path.resolve(String(a.from)) : null;
  const missed = new Set(fromDir && fs.existsSync(fromDir) ? fs.readdirSync(fromDir).filter((f) => /^answers-wording-bob-think-.*\.jsonl$/.test(f)).flatMap((f) => readJsonl(path.join(fromDir, f))).filter((r) => r.ok === false && !r.error).map((r) => String(r.idea)) : []);
  const qs = pickLessons(all, missed, Number(a.per) || 3);
  const thinks = String(a.think || 'off,on').split(',').filter(Boolean), H = Number(a.hints) || 3, par = Number(a.parallel) || 4, maxOff = Number(a.max) || 1500, maxOn = Number(a['max-think']) || 6000, brain = process.env.LAB_MODEL_NAME || 'brain';
  console.log(`${new Set(qs.map((q) => q.idea)).size} lessons, ${qs.length} steps (${missed.size} missed ideas known), up to ${H} hints, thinking ${thinks.join(', ')}; Bob ${bobVer}`);
  if (!qs.length) { console.error('No lessons.'); process.exit(1); }
  if (dry) { const q = qs.find((x) => x.want.length) || qs[0]; console.log(`  e.g. ${q.job} ${q.idea} step ${q.k}: want ${show(q.want.map((w) => ({ name: w.name, args: parse(w.args) })))}\n  ${[1, 2, 3].map((l) => hint(l, q.want, [])).join('\n  ')}\ndry run OK`); return; }
  const eng = live(url), rows = [];
  for (const think of thinks) {
    const on = think === 'on', file = path.join(out, `coach-think-${think}.jsonl`);
    const r = await pool(qs, par, async (q) => {
      const tries = []; let msgs = q.messages, solved = null;
      try {
        for (let level = 0; level <= H; level++) {
          const j = await eng.chat({ messages: msgs, tools: q.tools, max_tokens: on ? maxOn : maxOff, temperature: 0, chat_template_kwargs: { enable_thinking: on } });
          const m = j.choices?.[0]?.message || {}, g = grade(q, m);
          tries.push({ hint: level ? hint(level, q.want, callsOf(tries.at(-1)?.raw)) : null, calls: callsOf(m), content: m.content || '', reasoning: m.reasoning_content || '', finish: j.choices?.[0]?.finish_reason || '', ok: g.ok, name_ok: g.name_ok, raw: m });
          if (g.ok) { solved = level; break; }
          if (level < H) msgs = coached(msgs, m, hint(level + 1, q.want, callsOf(m)));
        }
        const row = { brain, bob_src: bobVer, evidence: true, coached: true, think: on, job: q.job, idea: q.idea, k: q.k, want: q.want, first_ok: tries[0].ok, hints_needed: solved, tries: tries.map(({ raw, ...t }) => t), transcript: msgs };
        fs.appendFileSync(file, JSON.stringify(row) + '\n'); return row;
      } catch (e) { const row = { brain, think: on, job: q.job, idea: q.idea, k: q.k, error: e.message.slice(0, 160), tries: tries.map(({ raw, ...t }) => t) }; fs.appendFileSync(file, JSON.stringify(row) + '\n'); return row; }
    });
    rows.push(...r);
    const ok = r.filter((x) => !x.error);
    console.log(`  think-${think}: ${ok.filter((x) => x.first_ok).length}/${ok.length} right first try; ${[1, 2, 3].map((h) => `${ok.filter((x) => x.hints_needed === h).length} after hint ${h}`).join(', ')}; ${ok.filter((x) => x.hints_needed === null).length} never; ${r.filter((x) => x.error).length} errors`);
  }
  if (a.gate && rows.some((r) => r.error)) { console.log(`GATE STOP: coached sessions: ${rows.filter((r) => r.error).length} errors (${rows.find((r) => r.error).error})`); process.exit(86); }
  // what he reached for: the tools he called on his first try, per tool the step wanted
  const md = [`# Coached lessons: ${brain} (Bob ${bobVer})`, '', 'He tries each step with Bob\'s tools; a wrong try gets a coach hint (1 nudge, 2 the tool, 3 the call). Evidence only; seeds for doctored lessons.', ''];
  for (const think of thinks) {
    const t = rows.filter((r) => !r.error && r.think === (think === 'on')), jobsT = [...new Set(t.map((r) => r.job))].sort();
    md.push(`## Thinking ${think}`, '', '| job | steps | first try | after hint 1 | hint 2 | hint 3 | never |', '|---|---|---|---|---|---|---|',
      ...jobsT.map((j) => { const x = t.filter((r) => r.job === j); return `| ${j} | ${x.length} | ${x.filter((r) => r.first_ok).length} | ${x.filter((r) => r.hints_needed === 1).length} | ${x.filter((r) => r.hints_needed === 2).length} | ${x.filter((r) => r.hints_needed === 3).length} | ${x.filter((r) => r.hints_needed === null).length} |`; }), '');
    const reach = {};
    for (const r of t) for (const w of r.want || []) { const e = (reach[w.name] ||= {}); for (const c of r.tries[0].calls.length ? r.tries[0].calls : [{ name: '(words)' }]) e[c.name] = (e[c.name] || 0) + 1; }
    md.push('| wanted tool | what he called first (count) |', '|---|---|', ...Object.entries(reach).sort().map(([k, v]) => `| ${k} | ${Object.entries(v).sort((x, y) => y[1] - x[1]).map(([n, c]) => `${n} ${c}`).join(', ')} |`), '');
  }
  fs.writeFileSync(path.join(out, 'COACH.md'), md.join('\n')); console.log(md.slice(0, 20).join('\n'));
}
if (import.meta.url === pathToFileURL(process.argv[1] || '').href) main().catch((e) => { console.error(e.stack || e.message); process.exit(1); });

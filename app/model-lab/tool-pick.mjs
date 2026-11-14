// One tool per step (14 Nov, the owner: "or one tool per step"): the same judged turns as tool-wording.mjs, asked in two
// calls. Call 1 sees the chat and only a list of tool names with their first sentence, and picks one (or "none" = answer in
// words). Call 2 sees the chat and only the picked tool's full definition, and makes the call. Graded like tool-wording
// (tool-judge.mjs), rows in the same shape (variant "pick"), so WORDING.md-style tables line up. Parsed, never run;
// evidence only.
// node tool-pick.mjs --url <server> --questions <calib>/questions --bob <Bob source app folder> --out <folder>
//      [--jobs ...] [--think off,on] [--turns 2] [--parallel 8] [--odds 8] [--max 600] [--max-think 4000] [--limit N] [--gate] [--dry]
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { live, pool, oddsOf } from './engine-live.mjs';
import { buildQuestions, grade, summarize } from './tool-wording.mjs';

const readJsonl = (f) => (fs.existsSync(f) ? fs.readFileSync(f, 'utf8').replace(/\r\n/g, '\n').split('\n').filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean) : []);
const first = (d) => String(d || '').split(/(?<=[.!?])\s/)[0].slice(0, 160);

// the picker: one tool whose only input is the name of the tool to use next
export function pickerTool(tools) {
  const names = tools.map((t) => t.function.name);
  return { type: 'function', function: { name: 'choose_tool', description: `Pick the ONE tool for the next step, or "none" to answer in words.\n${tools.map((t) => `- ${t.function.name}: ${first(t.function.description)}`).join('\n')}`, parameters: { type: 'object', properties: { tool: { type: 'string', enum: [...names, 'none'] } }, required: ['tool'] } } };
}
export function picked(msg) {
  const c = (msg?.tool_calls || []).find((x) => x.function?.name === 'choose_tool');
  if (!c) return null;
  try { return JSON.parse(c.function.arguments || '{}').tool || null; } catch { return null; }
}

async function main() {
  const a = Object.fromEntries(process.argv.slice(2).reduce((acc, x, i, arr) => (x.startsWith('--') ? [...acc, [x.slice(2), arr[i + 1] && !arr[i + 1].startsWith('--') ? arr[i + 1] : true]] : acc), []));
  const dry = Boolean(a.dry), url = String(a.url || process.env.LAB_URL || '');
  if ((!url && !dry) || !a.questions || !a.bob) { console.error('--url <server> --questions <folder> --bob <Bob source> are needed (--dry: no server)'); process.exit(1); }
  const out = path.resolve(String(a.out || process.env.LAB_OUT || 'tool-pick')); fs.mkdirSync(out, { recursive: true });
  let bobDir = path.resolve(String(a.bob)); if (!fs.existsSync(path.join(bobDir, 'src')) && fs.existsSync(path.join(bobDir, 'app', 'src'))) bobDir = path.join(bobDir, 'app');
  const { loadBob } = await import('./bob-kit.mjs'); const kit = await loadBob(bobDir);
  let bobVer = '?'; try { bobVer = JSON.parse(fs.readFileSync(path.join(bobDir, 'package.json'), 'utf8')).version; } catch {}
  const jobs = a.jobs ? new Set(String(a.jobs).split(',').map((x) => x.trim()).filter(Boolean)) : null;
  const thinks = String(a.think || 'off').split(',').filter(Boolean), par = Number(a.parallel) || 8, K = Math.min(20, Number(a.odds) || 8), maxOff = Number(a.max) || 600, maxOn = Number(a['max-think']) || 4000;
  const qs = buildQuestions(readJsonl(path.join(path.resolve(String(a.questions)), 'lessons.jsonl')), kit, { turns: Number(a.turns) || 1, jobs, limit: Number(a.limit) || 0 });
  kit.done();
  const brain = process.env.LAB_MODEL_NAME || 'brain';
  console.log(`${qs.length} turns, one tool per step, thinking ${thinks.join(', ')}; Bob ${bobVer}`);
  if (!qs.length) { console.error('No questions.'); process.exit(1); }
  if (dry) { const p = pickerTool(qs[0].tools); console.log(`  picker lists ${qs[0].tools.length} tools, ${p.function.description.length} chars (full list ${JSON.stringify(qs[0].tools).length} chars)\ndry run OK`); return; }
  const eng = live(url), rows = [];
  for (const think of thinks) {
    const file = path.join(out, `answers-wording-pick-think-${think}.jsonl`), on = think === 'on';
    const base = { temperature: 0, chat_template_kwargs: { enable_thinking: on }, max_tokens: on ? maxOn : maxOff, logprobs: true, top_logprobs: K };
    const r = await pool(qs, par, async (q) => {
      const t0 = Date.now();
      try {
        const j1 = await eng.chat({ ...base, messages: q.messages, tools: [pickerTool(q.tools)] });
        const m1 = j1.choices?.[0]?.message || {}, name = picked(m1), tool = q.tools.find((t) => t.function.name === name);
        let m = { content: m1.content || '' }, j2 = null;
        if (tool) { j2 = await eng.chat({ ...base, messages: q.messages, tools: [tool] }); m = j2.choices?.[0]?.message || {}; }
        const row = { brain, bob_src: bobVer, evidence: true, cond: `pick think-${think}`, variant: 'pick', think: on, job: q.job, idea: q.idea, split: q.split, k: q.k, named: q.named, picked: name || '(none)', ...grade(q, m), finish: (j2 || j1).choices?.[0]?.finish_reason || '', want: q.want, answer: { pick_reasoning: m1.reasoning_content || '', content: m.content || '', reasoning: m.reasoning_content || '', tool_calls: m.tool_calls || undefined }, odds: { pick: oddsOf(j1.choices?.[0]?.logprobs), call: j2 ? oddsOf(j2.choices?.[0]?.logprobs) : [] }, ms: Date.now() - t0 };
        fs.appendFileSync(file, JSON.stringify(row) + '\n'); return row;
      } catch (e) { const row = { brain, cond: `pick think-${think}`, variant: 'pick', think: on, job: q.job, idea: q.idea, k: q.k, ok: false, name_ok: false, used_save_to: null, error: e.message.slice(0, 160) }; fs.appendFileSync(file, JSON.stringify(row) + '\n'); return row; }
    });
    rows.push(...r);
    console.log(`  think-${think}: ${r.filter((x) => x.ok).length}/${r.length} right, ${r.filter((x) => x.name_ok).length} right tool, ${r.filter((x) => x.error).length} errors`);
  }
  if (a.gate && rows.some((r) => r.error)) { console.log(`GATE STOP: one-tool-per-step smoke: ${rows.filter((r) => r.error).length} errors (${rows.find((r) => r.error).error})`); process.exit(86); }
  const conds = thinks.map((t) => `pick think-${t}`), s = summarize(rows, conds);
  fs.writeFileSync(path.join(out, 'pick.json'), JSON.stringify({ brain, bob_src: bobVer, made: new Date().toISOString(), conds, scores: s }, null, 1));
  const md = [`# One tool per step: ${brain} (Bob ${bobVer})`, '', 'Call 1 picks a tool from names only; call 2 makes the call with just that tool. Compare with WORDING.md (same turns). Evidence only.', '', `| job | ${conds.join(' | ')} |`, `|---|${conds.map(() => '---').join('|')}|`, ...Object.entries(s).map(([job, c]) => `| ${job} | ${conds.map((k) => `${c[k].ok} (tool ${c[k].name}) n ${c[k].n}`).join(' | ')} |`), ''].join('\n');
  fs.writeFileSync(path.join(out, 'PICK.md'), md); console.log(md);
}
if (import.meta.url === pathToFileURL(process.argv[1] || '').href) main().catch((e) => { console.error(e.stack || e.message); process.exit(1); });

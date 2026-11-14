// What tools does the brain reach for on its own? (14 Nov, the owner: "we can design our tool shapes around what bobert or
// riker naturally look for.") The same judged requests tool-wording.mjs asks, but Bob's tools are NOT offered:
//   none   no tools at all; he is asked to write the call(s) he would make, one JSON line each: {"name": ..., "arguments": {...}}
//   vague  one catch-all tool, do(action, details), so his own action names and detail keys show through a real tool call
// Each is asked with thinking off and on. Every answer is kept with its thinking (evidence only, never training data).
// Writes answers-natural-<mode>-think-<t>.jsonl, natural.json and NATURAL.md: for each Bob tool the request wanted, the names he
// made up (most often first) and the argument names he used, in his order; plus all his invented names overall.
// node natural-tools.mjs --url <server> --questions <calib>/questions --bob <Bob source app folder> --out <folder>
//      [--jobs files,run] [--modes none,vague] [--think off,on] [--parallel 8] [--max 600] [--max-think 3000] [--limit N] [--dry]
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const readJsonl = (f) => (fs.existsSync(f) ? fs.readFileSync(f, 'utf8').replace(/\r\n/g, '\n').split('\n').filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean) : []);

export const SYSTEM = {
  none: 'You are Bob, a desktop assistant on the user\'s Windows PC. You can act on the computer with tools, but no tool list is given here: you design them. For the request below, write each tool call you would make, in order, one per line as JSON: {"name": "tool_name", "arguments": {...}}. Name the tool and its arguments the way you would most want them. If no tool is needed, answer normally and write no JSON.',
  vague: 'You are Bob, a desktop assistant on the user\'s Windows PC. You have one tool, do, that can do anything on the computer. Use it whenever the request needs an action.'
};
export const DO_TOOL = { type: 'function', function: { name: 'do', description: 'Do anything on the computer.', parameters: { type: 'object', properties: { action: { type: 'string', description: 'What to do, as a short snake_case name' }, details: { type: 'object', description: 'Whatever the action needs' } }, required: ['action'] } } };

// Calls written as text: JSON lines or objects with a name, and Qwen's own <tool_call> blocks (JSON or <function=...> form).
export function parseCalls(text) {
  const t = String(text || ''), out = [];
  for (const m of t.matchAll(/<function=([\w.-]+)>([\s\S]*?)<\/function>/g)) {
    const args = {}; for (const p of m[2].matchAll(/<parameter=([\w.-]+)>\s*([\s\S]*?)\s*<\/parameter>/g)) args[p[1]] = p[2];
    out.push({ name: m[1], args, keys: Object.keys(args), form: 'xml' });
  }
  if (out.length) return out;
  for (const m of t.matchAll(/\{[^{}]*"name"\s*:\s*"([^"]+)"[^{}]*?"(?:arguments|args|parameters)"\s*:\s*(\{(?:[^{}]|\{[^{}]*\})*\})[^{}]*\}/g)) {
    let args = {}; try { args = JSON.parse(m[2]); } catch { args = null; }
    out.push({ name: m[1], args, keys: args ? Object.keys(args) : [], form: args ? 'json' : 'broken' });
  }
  return out;
}

// The calls one answer made: real tool calls first (vague mode: the action name stands in for the tool name), else text calls.
export function callsOf(msg, mode) {
  const real = (msg?.tool_calls || []).map((c) => { let a = c.function?.arguments; if (typeof a === 'string') { try { a = JSON.parse(a); } catch { a = null; } } return { name: c.function?.name, args: a, form: a ? 'tool' : 'broken' }; });
  if (real.length) return real.map((c) => (mode === 'vague' && c.name === 'do' && c.args ? { name: String(c.args.action || '(none)'), args: c.args.details || {}, keys: Object.keys(c.args.details || {}), form: 'do' } : { ...c, keys: c.args ? Object.keys(c.args) : [] }));
  return parseCalls(`${msg?.content || ''}`);
}

// For each wanted Bob tool: his names (most often first) and his argument names (most often first, with how often).
export function summarizeNatural(rows) {
  const by = {}, all = {};
  const bump = (o, k) => { o[k] = (o[k] || 0) + 1; };
  for (const r of rows) {
    const wanted = (r.want || []).map((w) => w.name).filter(Boolean);
    for (const c of r.calls || []) bump(all, c.name);
    for (const w of wanted.length ? wanted : ['(no tool)']) {
      const e = (by[`${r.cond}|${w}`] ||= { cond: r.cond, want: w, n: 0, none: 0, names: {}, keys: {} }); e.n++;
      if (!(r.calls || []).length) e.none++;
      for (const c of r.calls || []) { bump(e.names, c.name); for (const k of c.keys || []) bump(e.keys, k); }
    }
  }
  const top = (o, n = 5) => Object.entries(o).sort((a, b) => b[1] - a[1]).slice(0, n);
  return { per: Object.values(by).map((e) => ({ ...e, names: top(e.names), keys: top(e.keys, 8) })).sort((a, b) => a.cond.localeCompare(b.cond) || b.n - a.n), invented: top(all, 60) };
}

async function main() {
  const a = Object.fromEntries(process.argv.slice(2).reduce((acc, x, i, arr) => (x.startsWith('--') ? [...acc, [x.slice(2), arr[i + 1] && !arr[i + 1].startsWith('--') ? arr[i + 1] : true]] : acc), []));
  const dry = Boolean(a.dry), url = String(a.url || process.env.LAB_URL || '').replace(/\/$/, ''), KEY = process.env.LAB_API_KEY || '';
  if ((!url && !dry) || !a.questions || !a.bob) { console.error('--url <server> --questions <calib-prep questions folder> --bob <Bob source app folder> are needed (--dry: no server)'); process.exit(1); }
  const out = path.resolve(String(a.out || 'natural-tools')); fs.mkdirSync(out, { recursive: true });
  let bobDir = path.resolve(String(a.bob));
  if (!fs.existsSync(path.join(bobDir, 'src')) && fs.existsSync(path.join(bobDir, 'app', 'src'))) bobDir = path.join(bobDir, 'app');
  // npc keeps the newer copy beside the old one while another run uses tool-wording.mjs
  const { buildQuestions, lastUser } = await import('./tool-wording-v2.mjs').catch(() => import('./tool-wording.mjs'));
  const { loadBob } = await import('./bob-kit.mjs');
  const kit = await loadBob(bobDir);
  const jobs = a.jobs ? new Set(String(a.jobs).split(',').map((x) => x.trim()).filter(Boolean)) : null;
  const qs = buildQuestions(readJsonl(path.join(path.resolve(String(a.questions)), 'lessons.jsonl')), kit, { turns: 1, jobs, limit: Number(a.limit) || 0 });
  kit.done();
  const modes = String(a.modes || 'none,vague').split(',').filter((m) => SYSTEM[m]), thinks = String(a.think || 'off,on').split(',').filter(Boolean);
  const par = Number(a.parallel) || 8, maxOff = Number(a.max) || 600, maxOn = Number(a['max-think']) || 3000, brain = process.env.LAB_MODEL_NAME || 'brain';
  console.log(`${qs.length} requests; modes ${modes.join(', ')}; thinking ${thinks.join(', ')}: ${qs.length * modes.length * thinks.length} asks`);
  const bodyFor = (q, mode, think) => ({ messages: [{ role: 'system', content: SYSTEM[mode] }, { role: 'user', content: lastUser(q.messages) }], ...(mode === 'vague' ? { tools: [DO_TOOL], parallel_tool_calls: true } : {}), max_tokens: think === 'on' ? maxOn : maxOff, temperature: 0, chat_template_kwargs: { enable_thinking: think === 'on' } });
  if (dry) { for (const m of modes) for (const t of thinks) console.log(`  ${m} think-${t}: ${JSON.stringify(bodyFor(qs[0], m, t)).length} chars`); console.log('dry run OK'); return; }
  const rows = [];
  for (const t of thinks) for (const mode of modes) {
    const file = path.join(out, `answers-natural-${mode}-think-${t}.jsonl`), t0 = Date.now();
    let i = 0;
    const work = async () => { while (i < qs.length) { const q = qs[i++]; let row;
      try {
        const r = await fetch(`${url}/v1/chat/completions`, { method: 'POST', headers: { 'content-type': 'application/json', ...(KEY ? { authorization: `Bearer ${KEY}` } : {}) }, body: JSON.stringify(bodyFor(q, mode, t)), signal: AbortSignal.timeout(10 * 60000) });
        const j = await r.json(); if (!r.ok) throw new Error(JSON.stringify(j).slice(0, 160));
        const c = j.choices?.[0] || {}, m = c.message || {};
        row = { brain, evidence: true, cond: `${mode} think-${t}`, mode, think: t === 'on', job: q.job, idea: q.idea, request: lastUser(q.messages), want: q.want, calls: callsOf(m, mode), finish: c.finish_reason || '', answer: { content: m.content || '', reasoning: m.reasoning_content || '', tool_calls: m.tool_calls || undefined }, tokens: j.usage?.completion_tokens || 0, tps: j.timings?.predicted_per_second || 0 };
      } catch (e) { row = { brain, cond: `${mode} think-${t}`, mode, think: t === 'on', job: q.job, idea: q.idea, want: q.want, calls: [], error: e.message.slice(0, 160) }; }
      fs.appendFileSync(file, JSON.stringify(row) + '\n'); rows.push(row); } };
    await Promise.all(Array.from({ length: par }, work));
    const mine = rows.filter((r) => r.cond === `${mode} think-${t}`);
    console.log(`${mode} think-${t}: ${mine.filter((r) => r.calls.length).length}/${mine.length} made a call, ${mine.filter((r) => r.error).length} errors, ${Math.round((Date.now() - t0) / 1000)} s`);
  }
  const s = summarizeNatural(rows.filter((r) => !r.error));
  fs.writeFileSync(path.join(out, 'natural.json'), JSON.stringify({ brain, made: new Date().toISOString(), ...s }, null, 1));
  const md = [`# Tools ${brain} reaches for on his own`, '', 'Bob\'s tools were not offered. "none": he wrote the calls he would want; "vague": one do(action, details) tool. Names and argument names are his own, most often first (count). Evidence only.', '',
    '| condition | Bob tool wanted | n | no call | his names | his argument names |', '|---|---|---|---|---|---|',
    ...s.per.map((e) => `| ${e.cond} | ${e.want} | ${e.n} | ${e.none} | ${e.names.map(([k, v]) => `${k} (${v})`).join(', ')} | ${e.keys.map(([k, v]) => `${k} (${v})`).join(', ')} |`),
    '', '## All the names he invented', '', s.invented.map(([k, v]) => `${k} (${v})`).join(', '), ''].join('\n');
  fs.writeFileSync(path.join(out, 'NATURAL.md'), md); console.log(md.slice(0, 4000));
}
if (import.meta.url === pathToFileURL(process.argv[1] || '').href) main().catch((e) => { console.error(e.stack || e.message); process.exit(1); });

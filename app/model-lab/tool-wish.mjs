// What the brain reaches for on its own (14 Nov, the owner: "we can design our tool shapes around what bobert or riker
// naturally look for"). The same judged turns, with NO tools offered: the brain is told it may call any tool it wishes
// existed and writes each call as JSON. Saved: the tool names, argument names and values it invents, next to the tool
// Bob really has for that turn. WISH.md lists the names and argument names he reaches for most, per job and per real
// tool, so Bob's tool shapes can follow them. Nothing is run; evidence only.
// node tool-wish.mjs --url <server> --questions <calib>/questions --bob <Bob source> --out <folder>
//      [--jobs ...] [--think off,on] [--turns 1] [--parallel 8] [--max 600] [--max-think 4000] [--limit N] [--gate] [--dry]
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { live, pool } from './engine-live.mjs';
import { buildQuestions } from './tool-wording.mjs';

const readJsonl = (f) => (fs.existsSync(f) ? fs.readFileSync(f, 'utf8').replace(/\r\n/g, '\n').split('\n').filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean) : []);
export const WISH_NOTE = 'For this request, no tools are set up yet. Imagine the tools you would want. If you would call one, write each call on its own line as JSON: {"tool": "<name you would give it>", "arguments": {...}}. Write as many calls as the job needs, in order, then one line saying what you would tell the user. If no tool is needed, just answer.';

// every {"tool": ..., "arguments": {...}} (or {"name": ..., "arguments"}) object in a reply
export function wishes(text) {
  const out = [], s = String(text || '');
  for (let i = s.indexOf('{'); i >= 0; i = s.indexOf('{', i + 1)) {
    let depth = 0, j = i, inStr = false;
    for (; j < s.length; j++) { const ch = s[j]; if (inStr) { if (ch === '\\') j++; else if (ch === '"') inStr = false; continue; } if (ch === '"') inStr = true; else if (ch === '{') depth++; else if (ch === '}' && --depth === 0) break; }
    if (depth !== 0) break;
    try { const o = JSON.parse(s.slice(i, j + 1)); const name = o.tool || o.name; if (typeof name === 'string') { out.push({ name, args: o.arguments && typeof o.arguments === 'object' ? o.arguments : {} }); i = j; } } catch {}
  }
  return out;
}
export function tally(rows) {
  const byReal = {}, names = {}, argNames = {};
  for (const r of rows) for (const w of r.wishes || []) {
    names[w.name] = (names[w.name] || 0) + 1;
    for (const k of Object.keys(w.args)) argNames[k] = (argNames[k] || 0) + 1;
    for (const real of r.real || []) { const t = (byReal[real] ||= { turns: 0, names: {}, args: {} }); t.names[w.name] = (t.names[w.name] || 0) + 1; for (const k of Object.keys(w.args)) t.args[k] = (t.args[k] || 0) + 1; }
  }
  for (const r of rows) for (const real of r.real || []) (byReal[real] ||= { turns: 0, names: {}, args: {} }).turns++;
  return { names, argNames, byReal };
}
const top = (o, n = 6) => Object.entries(o).sort((a, b) => b[1] - a[1]).slice(0, n).map(([k, v]) => `${k} ${v}`).join(', ');

async function main() {
  const a = Object.fromEntries(process.argv.slice(2).reduce((acc, x, i, arr) => (x.startsWith('--') ? [...acc, [x.slice(2), arr[i + 1] && !arr[i + 1].startsWith('--') ? arr[i + 1] : true]] : acc), []));
  const dry = Boolean(a.dry), url = String(a.url || process.env.LAB_URL || '');
  if ((!url && !dry) || !a.questions || !a.bob) { console.error('--url <server> --questions <folder> --bob <Bob source> are needed (--dry: no server)'); process.exit(1); }
  const out = path.resolve(String(a.out || process.env.LAB_OUT || 'tool-wish')); fs.mkdirSync(out, { recursive: true });
  let bobDir = path.resolve(String(a.bob)); if (!fs.existsSync(path.join(bobDir, 'src')) && fs.existsSync(path.join(bobDir, 'app', 'src'))) bobDir = path.join(bobDir, 'app');
  const { loadBob } = await import('./bob-kit.mjs'); const kit = await loadBob(bobDir);
  const jobs = a.jobs ? new Set(String(a.jobs).split(',').map((x) => x.trim()).filter(Boolean)) : null;
  const qs = buildQuestions(readJsonl(path.join(path.resolve(String(a.questions)), 'lessons.jsonl')), kit, { turns: Number(a.turns) || 1, jobs, limit: Number(a.limit) || 0 }).filter((q) => q.want.length);
  kit.done();
  const thinks = String(a.think || 'off,on').split(',').filter(Boolean), par = Number(a.parallel) || 8, maxOff = Number(a.max) || 600, maxOn = Number(a['max-think']) || 4000, brain = process.env.LAB_MODEL_NAME || 'brain';
  console.log(`${qs.length} tool turns, no tools offered, thinking ${thinks.join(', ')}`);
  if (dry) { console.log(`  system ends: ...${WISH_NOTE.slice(-80)}\ndry run OK`); return; }
  const eng = live(url), rows = [];
  for (const think of thinks) {
    const file = path.join(out, `answers-wish-think-${think}.jsonl`), on = think === 'on';
    const r = await pool(qs, par, async (q) => {
      try {
        const msgs = [{ role: 'system', content: `${q.messages[0].content}\n\n${WISH_NOTE}` }, ...q.messages.slice(1)];
        const j = await eng.chat({ messages: msgs, max_tokens: on ? maxOn : maxOff, temperature: 0, chat_template_kwargs: { enable_thinking: on } });
        const m = j.choices?.[0]?.message || {};
        const row = { brain, evidence: true, think: on, job: q.job, idea: q.idea, k: q.k, real: [...new Set(q.want.map((w) => w.name))], wishes: wishes(m.content), answer: { content: m.content || '', reasoning: m.reasoning_content || '' }, finish: j.choices?.[0]?.finish_reason || '' };
        fs.appendFileSync(file, JSON.stringify(row) + '\n'); return row;
      } catch (e) { const row = { brain, think: on, job: q.job, idea: q.idea, error: e.message.slice(0, 160), wishes: [] }; fs.appendFileSync(file, JSON.stringify(row) + '\n'); return row; }
    });
    rows.push(...r); console.log(`  think-${think}: ${r.filter((x) => x.wishes.length).length}/${r.length} wrote a tool call, ${r.filter((x) => x.error).length} errors`);
  }
  if (!rows.some((r) => r.wishes.length)) console.log('NOTE: no answer wrote a tool call (a finding, not a stop)');
  if (a.gate && rows.some((r) => r.error)) { console.log(`GATE STOP: tool wish smoke: ${rows.filter((r) => r.error).length} errors, ${rows.filter((r) => r.wishes.length).length} with a call`); process.exit(86); }
  const md = ['# What he reaches for with no tools offered', '', 'Evidence only. For each tool Bob really has, the names and argument names he invented on those turns (count).', ''];
  for (const think of thinks) {
    const t = tally(rows.filter((r) => r.think === (think === 'on')));
    md.push(`## Thinking ${think}`, '', `Names: ${top(t.names, 15)}`, '', `Argument names: ${top(t.argNames, 15)}`, '', '| Bob\'s tool | turns | names he used | argument names he used |', '|---|---|---|---|', ...Object.entries(t.byReal).sort((x, y) => y[1].turns - x[1].turns).map(([k, v]) => `| ${k} | ${v.turns} | ${top(v.names)} | ${top(v.args)} |`), '');
  }
  fs.writeFileSync(path.join(out, 'WISH.md'), md.join('\n')); console.log(md.slice(0, 12).join('\n'));
}
if (import.meta.url === pathToFileURL(process.argv[1] || '').href) main().catch((e) => { console.error(e.stack || e.message); process.exit(1); });

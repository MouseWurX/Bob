// Tool wording and thinking A/B for one served brain (14 Nov, the owner: "investigate riker with thinking on", "also try his
// tool interview with thinking off as well, we need to see what syntax will get the desired results").
// The same judged questions (calib-prep questions: held-out + reserved, never training lessons) are asked with Bob's CURRENT
// tools (a fresh bob-kit from --bob, never the write-time toolsets.json, which can be stale) in each wording and thinking mode:
//   bob       Bob's own wording, byte for byte
//   usewhen   the short "Use when..." lines of tool-sets.js (the GPT-OSS set), on the tools it words
//   paths     Bob's wording plus a save_to input (full path with file name) on make_diagram, save_as, make_image, make_sound
//             and convert_file: the open fix for "claimed a name the tool never used"
//   usewhen+paths  both
// Graded like tool-score (tool-judge.mjs): the right tools (name_ok) and the right tools with every recorded argument (ok).
// Turns: the first --turns assistant turns of each lesson; a later turn sees the lesson's own recorded tool results.
// Tool calls are only parsed, never run. Every answer is kept with its thinking and top-K odds (evidence only, never training
// data: answers-wording-*.jsonl carry evidence: true). Writes WORDING.md and wording.json.
// node tool-wording.mjs --url <server> --questions <calib>/questions --bob <Bob source app folder> --out <folder>
//      [--jobs files,run,plans] [--variants bob,usewhen,paths] [--think off,on] [--turns 2] [--parallel 8] [--odds 8]
//      [--max 600] [--max-think 4000] [--prefill "Plan: 1."] [--limit N] [--min-bob 1.5.223] [--gate] [--dry]
// --dry: no server; checks the questions, the fresh tools and every variant, and prints what would be asked.
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { live, pool, oddsOf, pairedGap, wilson } from './engine-live.mjs';
import { parseArgs, judgeTurn } from './tool-judge.mjs';

const readJsonl = (f) => (fs.existsSync(f) ? fs.readFileSync(f, 'utf8').replace(/\r\n/g, '\n').split('\n').filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean) : []);
const r3 = (x) => Math.round(x * 1000) / 1000;

export const PATH_TOOLS = ['make_diagram', 'save_as', 'make_image', 'make_sound', 'convert_file'];
export const SAVE_TO = { type: 'string', description: 'Only if {{USER}} named where or what to save it as: the full path with the file name, like {{HOME}}/Pictures/logo.png. Leave it out to use Bob\'s usual folder.' };

// One tool list in a variant's wording. Names, inputs and enums stay Bob's own; paths only ADDS save_to.
export function variantTools(tools, variant, { set = null, fill = null } = {}) {
  const parts = new Set(String(variant).split('+'));
  const fillText = (t) => (fill ? t.replaceAll('{{USER}}', fill.user || 'the user').replaceAll('{{HOME}}', fill.home || 'C:\\Users\\you') : t);
  return tools.map((s) => {
    let out = s;
    const name = s?.function?.name;
    if (parts.has('usewhen') && set?.use?.[name]) out = { ...out, function: { ...out.function, description: fillText(set.use[name]) } };
    if (parts.has('paths') && PATH_TOOLS.includes(name)) {
      const p = out.function.parameters || { type: 'object', properties: {} };
      out = { ...out, function: { ...out.function, parameters: { ...p, properties: { ...(p.properties || {}), save_to: { ...SAVE_TO, description: fillText(SAVE_TO.description) } } } } };
    }
    return out;
  });
}

// Did the user name a file to save to? (a name with an extension, or a full path)
export const namedFile = (text) => /(?:[A-Za-z]:\\|~\/|\/(?:Users|home)\/|\b[\w-]+\.(?:png|jpe?g|webp|gif|svg|pdf|wav|mp3|ogg|flac|mp4|webm|docx|xlsx|pptx|csv|txt|md)\b)/i.test(String(text || ''));

// The questions: each lesson's first `turns` assistant turns, rebuilt with the fresh kit's prompt and tools.
// The kit's groups are the ones the recorded calls need plus the ones Bob guesses from the first user message.
export function buildQuestions(lessons, kit, { turns = 1, jobs = null, limit = 0 } = {}) {
  const out = [];
  for (const l of lessons) {
    if (jobs && !jobs.has(l.job)) continue;
    const msgs = l.messages || [];
    const firstUser = msgs.find((m) => m.role === 'user');
    const wanted = msgs.filter((m) => m.role === 'assistant').flatMap((m) => (m.tool_calls || []).map((c) => c.function?.name)).filter(Boolean);
    const loaded = new Set([...wanted.map((n) => kit.groupOf(n)).filter(Boolean), ...(kit.guessGroups(typeof firstUser?.content === 'string' ? firstUser.content : '') || [])]);
    const desk = kit.turn(loaded);
    const before = []; let k = 0;
    for (const m of msgs) {
      if (m.role === 'assistant') {
        if (k < turns) out.push({ idea: l.idea, job: l.job, split: l.split || 'calib', set: l.set, k, messages: [{ role: 'system', content: desk.system }, ...before.map((x) => ({ ...x }))], tools: desk.tools, want: (m.tool_calls || []).map((c) => ({ name: c.function?.name, args: c.function?.arguments })), named: namedFile(before.filter((x) => x.role === 'user').map((x) => x.content).join('\n')) });
        k++;
        before.push({ role: 'assistant', content: m.content || '', ...(m.tool_calls?.length ? { tool_calls: m.tool_calls.map((c, i) => ({ id: c.id || `call_${i}`, type: 'function', function: { name: c.function.name, arguments: typeof c.function.arguments === 'string' ? c.function.arguments : JSON.stringify(c.function.arguments || {}) } })) } : {}) });
      } else if (m.role === 'tool') before.push({ role: 'tool', tool_call_id: m.tool_call_id || 'call_0', name: m.name, content: String(m.content || '') });
      else if (m.role === 'user') before.push({ role: 'user', content: typeof m.content === 'string' ? m.content : String(m.content?.find?.((p) => p.type === 'text')?.text || '') });
      if (k >= turns) break;
    }
    if (limit && out.length >= limit) break;
  }
  return limit ? out.slice(0, limit) : out;
}

// One graded answer from a chat reply (parsed, never run).
export function grade(q, msg) {
  const got = (msg.tool_calls || []).map((c) => ({ name: c.function?.name, args: parseArgs(c.function?.arguments) }));
  const want = q.want.map((w) => ({ name: w.name, args: parseArgs(w.args) }));
  const names = (a) => [...new Set(a.map((c) => c.name))].sort().join(',');
  const pathCall = got.find((c) => PATH_TOOLS.includes(c.name));
  return { ok: judgeTurn(want, got), name_ok: names(want) === names(got), used_save_to: pathCall ? Boolean(pathCall.args?.save_to) : null };
}

// Score table: per job and condition, share right (± Wilson) and the paired gap vs the first condition.
export function summarize(rows, conds) {
  const key = (r) => `${r.idea}|${r.k}`, byCond = {};
  for (const c of conds) byCond[c] = new Map(rows.filter((r) => r.cond === c).map((r) => [key(r), r]));
  const jobs = [...new Set(rows.map((r) => r.job))].sort(), base = conds[0], res = {};
  for (const job of [...jobs, 'ALL']) {
    const ks = [...byCond[base].values()].filter((r) => job === 'ALL' || r.job === job).map(key);
    res[job] = {};
    for (const c of conds) {
      const got = ks.map((k) => byCond[c].get(k)).filter(Boolean);
      const okN = got.filter((r) => r.ok).length, nameN = got.filter((r) => r.name_ok).length;
      const g = pairedGap(ks.map((k) => (byCond[c].get(k)?.ok ? 1 : 0)), ks.map((k) => (byCond[base].get(k)?.ok ? 1 : 0)));
      const st = got.filter((r) => r.named && r.used_save_to !== null);
      res[job][c] = { n: got.length, ok: r3(wilson(okN, got.length).p), pm: r3(wilson(okN, got.length).pm), name: r3(got.length ? nameN / got.length : 0), gap: r3(g.gap), range: r3(g.range), save_to: st.length ? `${st.filter((r) => r.used_save_to).length}/${st.length}` : '-', no_answer: got.filter((r) => r.finish === 'length' || r.error).length };
    }
  }
  return res;
}

async function main() {
  const a = Object.fromEntries(process.argv.slice(2).reduce((acc, x, i, arr) => (x.startsWith('--') ? [...acc, [x.slice(2), arr[i + 1] && !arr[i + 1].startsWith('--') ? arr[i + 1] : true]] : acc), []));
  const dry = Boolean(a.dry), url = String(a.url || process.env.LAB_URL || '');
  if ((!url && !dry) || !a.questions || !a.bob) { console.error('--url <server> --questions <calib-prep questions folder> --bob <Bob source app folder> are needed (--dry: no server)'); process.exit(1); }
  const out = path.resolve(String(a.out || process.env.LAB_OUT || 'tool-wording')); fs.mkdirSync(out, { recursive: true });
  const bobDir = path.resolve(String(a.bob));
  const { loadBob } = await import('./bob-kit.mjs');
  const kit = await loadBob(bobDir);
  const { SETS } = await import(pathToFileURL(path.join(bobDir, 'src', 'tool-sets.js')).href);
  const set = SETS['gpt-oss'];
  let bobVer = '?'; try { bobVer = JSON.parse(fs.readFileSync(path.join(bobDir, 'package.json'), 'utf8')).version; } catch {}
  // a stale kit (Nov 13: the lab read Bob 1.5.108 for days) stops the run before any card time is spent
  const ver = (v) => String(v).split('.').map(Number), older = (x, y) => { const [p, q] = [ver(x), ver(y)]; for (let i = 0; i < 3; i++) if ((p[i] || 0) !== (q[i] || 0)) return (p[i] || 0) < (q[i] || 0); return false; };
  if (a['min-bob'] && older(bobVer, a['min-bob'])) { console.error(`Bob source at ${bobDir} is ${bobVer}, older than --min-bob ${a['min-bob']}. Refresh it first.`); kit.done(); process.exit(1); }
  const jobs = a.jobs ? new Set(String(a.jobs).split(',').map((x) => x.trim()).filter(Boolean)) : null;
  const variants = String(a.variants || 'bob,usewhen,paths').split(',').filter(Boolean);
  const thinks = String(a.think || 'off,on').split(',').filter(Boolean);
  const turns = Number(a.turns) || 1, par = Number(a.parallel) || 8, K = Math.min(20, Number(a.odds) || 8), maxOff = Number(a.max) || 600, maxOn = Number(a['max-think']) || 4000;
  const prefill = a.prefill && a.prefill !== true ? String(a.prefill) : '';
  const lessons = readJsonl(path.join(path.resolve(String(a.questions)), 'lessons.jsonl'));
  const qs = buildQuestions(lessons, kit, { turns, jobs, limit: Number(a.limit) || 0 });
  const brain = process.env.LAB_MODEL_NAME || 'brain';
  const perJob = qs.reduce((m, q) => ((m[q.job] = (m[q.job] || 0) + 1), m), {});
  console.log(`${qs.length} turns over ${Object.keys(perJob).length} jobs (${Object.entries(perJob).map(([j, n]) => `${j} ${n}`).join(', ')}); Bob ${bobVer}; variants ${variants.join(', ')}; thinking ${thinks.join(', ')}`);
  if (!qs.length) { console.error('No questions: check --questions and --jobs.'); kit.done(); process.exit(1); }
  const conds = thinks.flatMap((t) => variants.map((v) => `${v} think-${t}`));
  const ask = async (eng, q, v, think, file) => {
    const tools = variantTools(q.tools, v, { set, fill: { user: 'the user', home: 'C:\\Users\\you' } });
    const messages = think === 'on' && prefill ? [...q.messages, { role: 'assistant', content: `<think>\n${prefill}` }] : q.messages;
    const body = { messages, ...(tools?.length ? { tools } : {}), max_tokens: think === 'on' ? maxOn : maxOff, temperature: 0, chat_template_kwargs: { enable_thinking: think === 'on' }, logprobs: true, top_logprobs: K };
    if (dry) return { body };
    const t0 = Date.now();
    try {
      const j = await eng.chat(body);
      const c = j.choices?.[0] || {}, m = c.message || {};
      const row = { brain, bob_src: bobVer, evidence: true, cond: `${v} think-${think}`, variant: v, think: think === 'on', ...(prefill && think === 'on' ? { prefill } : {}), job: q.job, idea: q.idea, split: q.split, k: q.k, named: q.named, ...grade(q, m), finish: c.finish_reason || '', want: q.want, answer: { content: m.content || '', reasoning: m.reasoning_content || '', tool_calls: m.tool_calls || undefined }, odds: oddsOf(c.logprobs), tokens: j.usage?.completion_tokens || 0, tps: j.timings?.predicted_per_second || 0, ms: Date.now() - t0 };
      fs.appendFileSync(file, JSON.stringify(row) + '\n');
      return row;
    } catch (e) {
      const row = { brain, cond: `${v} think-${think}`, variant: v, think: think === 'on', job: q.job, idea: q.idea, k: q.k, named: q.named, ok: false, name_ok: false, used_save_to: null, error: e.message.slice(0, 160) };
      fs.appendFileSync(file, JSON.stringify(row) + '\n');
      return row;
    }
  };
  if (dry) {
    for (const t of thinks) for (const v of variants) {
      const { body } = await ask(null, qs[0], v, t, null);
      const changed = body.tools?.filter((x, i) => JSON.stringify(x) !== JSON.stringify(qs[0].tools[i])).map((x) => x.function.name) || [];
      console.log(`  ${v} think-${t}: ${body.messages.length} messages, ${body.tools?.length || 0} tools (${changed.length} reworded/added: ${changed.slice(0, 8).join(', ') || 'none'}), max ${body.max_tokens}, ${JSON.stringify(body).length} chars`);
    }
    const all = variantTools(kit.allTools(), 'usewhen+paths', { set });
    console.log(`  save_to on: ${all.filter((x) => x.function.parameters?.properties?.save_to).map((x) => x.function.name).join(', ')}; named-file turns: ${qs.filter((q) => q.named).length}`);
    kit.done(); console.log('dry run OK'); return;
  }
  const eng = live(url);
  try { await eng.reset(); } catch {}
  const rows = [];
  for (const t of thinks) for (const v of variants) {
    const file = path.join(out, `answers-wording-${v.replace('+', '-')}-think-${t}.jsonl`);
    const t0 = Date.now(); console.log(`${v} think-${t}: ${qs.length} turns`);
    const r = await pool(qs, par, (q) => ask(eng, q, v, t, file));
    rows.push(...r);
    console.log(`  ${r.filter((x) => x.ok).length}/${r.length} right, ${r.filter((x) => x.name_ok).length} right tool, ${r.filter((x) => x.error).length} errors, ${Math.round((Date.now() - t0) / 1000)} s`);
  }
  kit.done();
  // --gate: a smoke run where any turn errored, or thinking-on answers all ran out of tokens, stops the rental (exit 86)
  if (a.gate) { const err = rows.filter((r) => r.error), cut = rows.filter((r) => r.think && r.finish === 'length'), on = rows.filter((r) => r.think);
    if (err.length || (on.length && cut.length === on.length)) { console.log(`GATE STOP: tool wording smoke: ${err.length} errors${err[0] ? ` (${err[0].error})` : ''}, ${cut.length}/${on.length} thinking answers cut off`); process.exit(86); } }
  const s = summarize(rows, conds);
  fs.writeFileSync(path.join(out, 'wording.json'), JSON.stringify({ brain, bob_src: bobVer, made: new Date().toISOString(), turns, conds, scores: s }, null, 1));
  const md = [`# Tool wording and thinking: ${brain} (Bob ${bobVer})`, '', `Right = the recorded tools with every recorded argument (tool = the right tools only). Gap = paired difference from ${conds[0]} on the same turns, ± its 95% range; only a gap bigger than its range is real. save_to = used it / turns where the user named a file. Evidence only.`, '',
    `| job | ${conds.join(' | ')} |`, `|---|${conds.map(() => '---').join('|')}|`,
    ...Object.entries(s).map(([job, c]) => `| ${job} | ${conds.map((k) => `${c[k].ok} (tool ${c[k].name}${k === conds[0] ? '' : `; ${c[k].gap >= 0 ? '+' : ''}${c[k].gap} ± ${c[k].range}`}${c[k].save_to !== '-' ? `; save_to ${c[k].save_to}` : ''}${c[k].no_answer ? `; ${c[k].no_answer} cut off` : ''}) n ${c[k].n}`).join(' | ')} |`), ''].join('\n');
  fs.writeFileSync(path.join(out, 'WORDING.md'), md); console.log(md);
}
if (import.meta.url === pathToFileURL(process.argv[1] || '').href) main().catch((e) => { console.error(e.stack || e.message); process.exit(1); });

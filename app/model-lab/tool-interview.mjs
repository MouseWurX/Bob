// Tool interview with the served brain, thinking on AND off (14 Nov, the owner: "investigate riker with thinking on", "also try
// his tool interview with thinking off as well"). Built on the Nov 13 riker-interview.mjs, with three changes:
//   - the failed turns come from tool-wording.mjs's answers (Bob's current tools), each shown with his OWN saved thinking and
//     calls from that try, so the record can be judged trace-first (his later explanation is only a lead);
//   - every question is asked twice, thinking on and thinking off, and both are kept side by side;
//   - the tool groups are Bob's current ones from a fresh bob-kit (core, files, run, apps, schedules, office, documents,
//     diagrams, pictures), so the definitions he is asked about are the ones he really gets.
// No tools offered, nothing run. Evidence only, never training data. Scrubs owner names, owner paths, keys and tokens per field.
// node tool-interview.mjs --url <server> --from <tool-wording out> --bob <Bob source app folder> --out <folder>
//      [--cases 8] [--groups core,files,run] [--think on,off] [--max-think 8000] [--max 1500] [--minutes 40] [--dry]
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const readJsonl = (f) => (fs.existsSync(f) ? fs.readFileSync(f, 'utf8').replace(/\r\n/g, '\n').split('\n').filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean) : []);
// one field at a time, never the whole JSON line (Nov 13: scrubbing the line broke it)
// owner names come from LAB_SCRUB_NAMES (comma list, set on the PC), never from this file
const NAMES = String(process.env.LAB_SCRUB_NAMES || '').split(',').map((x) => x.trim()).filter(Boolean).map((x) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
const NAME_RX = NAMES.length ? new RegExp(`\\b(${NAMES.join('|')})\\b`, 'gi') : null;
export const scrub = (s) => { const t = String(s || '').replace(/(?<![A-Za-z0-9])[A-Za-z]:\\(?=[^\s"',;)])[^\s"',;)]*/g, '<path>').replace(/\/(Users|home)\/[^\s"',;)]+/g, '<path>').replace(/(hf_|sk-|rpa_)[A-Za-z0-9]{6,}/g, '<key>'); return NAME_RX ? t.replace(NAME_RX, '<owner>') : t; };
const callText = (calls) => (calls || []).map((c) => `${c.name || c.function?.name} ${typeof (c.args ?? c.function?.arguments) === 'string' ? (c.args ?? c.function?.arguments) : JSON.stringify(c.args ?? c.function?.arguments)}`).join('; ');

export const GROUPS = { core: ['notice_board', 'read_file', 'list_folder', 'web_search', 'remember', 'reminders', 'use_tools'], files: ['file_hands', 'undo_files', 'list_folder'], run: ['run_command', 'run_recipe', 'git_look'], apps: ['open_app', 'app_look', 'app_act'], schedules: ['schedule_job', 'list_schedules', 'change_schedule'], office: ['office_read', 'office_make', 'office_edit', 'convert_file'], documents: ['write_file', 'edit_file', 'search_files', 'save_spreadsheet'], diagrams: ['make_diagram'], pictures: ['make_image', 'save_as', 'make_sound'] };

// Failed turns to ask about: thinking-on and thinking-off misses of Bob's own wording, the weak jobs first, one per job per mode.
export function pickCases(rows, n = 8) {
  const miss = rows.filter((r) => r.variant === 'bob' && r.ok === false && !r.error && (r.want || []).length);
  const out = [];
  for (const think of [true, false]) {
    const seen = new Set();
    for (const r of miss.filter((x) => x.think === think)) { if (out.filter((x) => x.think === think).length >= n / 2) break; if (seen.has(r.job)) continue; seen.add(r.job); out.push(r); }
  }
  return out;
}

export function caseQuestion(r, request) {
  const did = r.answer?.tool_calls?.length ? callText(r.answer.tool_calls) : `(no tool) ${String(r.answer?.content || '').slice(0, 300)}`;
  const thought = r.think && r.answer?.reasoning ? `\nYour thinking at the time (thinking was on):\n"""\n${String(r.answer.reasoning).slice(0, 2500)}\n"""` : '\n(Thinking was off for that try.)';
  return `In a test, you (as Bob) got this request: "${request}"\nThe right step was: ${callText(r.want) || '(no tool)'}\nYou did: ${did}${thought}\n\n1. Why did you choose that? Point to the line of your thinking (if any) where it went wrong.\n2. What in the tool names, descriptions or arguments misled you?\n3. Rewrite that tool (keep its name) as a short JSON definition so you'd get it right.\n4. What wording in the system prompt or the tool list would make you take the right step first time, with thinking on and with thinking off? Give the exact words.`;
}

export const groupQuestion = (g, defs) => `Bob gives you these tools (the "${g}" group):\n\n${defs}\n\nA. For each tool: is it clear when to use it versus its neighbours? Which could you mix up?\nB. Which arguments are unclear or missing defaults or fixed choices? Where would you want a save path or file name?\nC. Rewrite the most confusing one (keep its name) as a short JSON tool definition.\nD. Say plainly where you struggle in this group. Start that part with "STRUGGLES:".\nE. Write one example request and the exact tool call you would make.`;

async function main() {
  const a = Object.fromEntries(process.argv.slice(2).reduce((acc, x, i, arr) => (x.startsWith('--') ? [...acc, [x.slice(2), arr[i + 1] && !arr[i + 1].startsWith('--') ? arr[i + 1] : true]] : acc), []));
  const dry = Boolean(a.dry), URL_ = String(a.url || process.env.LAB_URL || '').replace(/\/$/, ''), KEY = process.env.LAB_API_KEY || '';
  if ((!URL_ && !dry) || !a.bob) { console.error('--url <server> --bob <Bob source app folder> [--from <tool-wording out>] are needed (--dry: no server)'); process.exit(1); }
  const out = path.resolve(String(a.out || 'tool-interview')); fs.mkdirSync(out, { recursive: true });
  const { loadBob } = await import('./bob-kit.mjs');
  const kit = await loadBob(path.resolve(String(a.bob)));
  const allTools = Object.fromEntries(kit.allTools().map((t) => [t.function.name, t.function]));
  kit.done();
  const thinks = String(a.think || 'on,off').split(',').filter(Boolean), maxOn = Number(a['max-think']) || 8000, maxOff = Number(a.max) || 1500;
  const deadline = Date.now() + (Number(args_n(a.minutes)) || 40) * 60000;
  const brain = process.env.LAB_MODEL_NAME || 'served', log = path.join(out, 'tool-interview.jsonl');
  const fromDir = a.from ? path.resolve(String(a.from)) : null;
  const rows = fromDir && fs.existsSync(fromDir) ? fs.readdirSync(fromDir).filter((f) => /^answers-wording-.*\.jsonl$/.test(f)).flatMap((f) => readJsonl(path.join(fromDir, f))) : [];
  const qdir = a.questions ? path.resolve(String(a.questions)) : null;
  const lessons = new Map(qdir ? readJsonl(path.join(qdir, 'lessons.jsonl')).map((l) => [String(l.idea), l]) : []);
  const cases = pickCases(rows, Number(a.cases) || 8);
  const groupNames = String(a.groups || Object.keys(GROUPS).join(',')).split(',').filter((g) => GROUPS[g]);
  const defs = (names) => names.filter((n) => allTools[n]).map((n) => `- ${n}: ${allTools[n].description}\n  arguments: ${JSON.stringify(allTools[n].parameters || {})}`).join('\n');
  const asks = [
    ...cases.map((r, i) => { const l = lessons.get(String(r.idea)); const users = (l?.messages || []).filter((m) => m.role === 'user'); return { head: `Case ${i + 1} (${r.job}, idea ${r.idea}, failed with thinking ${r.think ? 'on' : 'off'})`, q: caseQuestion(r, users[Math.min(r.k || 0, Math.max(0, users.length - 1))]?.content || '(request not in --questions)'), ref: { idea: r.idea, job: r.job, failed_think: r.think } }; }),
    ...groupNames.map((g) => ({ head: `Group: ${g}`, q: groupQuestion(g, defs(GROUPS[g])), ref: { group: g, missing: GROUPS[g].filter((n) => !allTools[n]) } }))
  ];
  console.log(`${cases.length} failed turns, ${groupNames.length} groups, thinking ${thinks.join(' and ')}: ${asks.length * thinks.length} requests`);
  if (dry) { for (const x of asks.slice(0, 2)) console.log(`--- ${x.head}\n${x.q.slice(0, 600)}`); console.log(`missing tools: ${asks.flatMap((x) => x.ref.missing || []).join(', ') || 'none'}\ndry run OK`); return; }
  const ask = async (content, label, think) => {
    if (Date.now() > deadline) return '(skipped: out of time)';
    for (let i = 1; i <= 2; i++) {
      try {
        const max = think === 'on' ? maxOn : maxOff;
        const r = await fetch(`${URL_}/v1/chat/completions`, { method: 'POST', headers: { 'content-type': 'application/json', ...(KEY ? { authorization: `Bearer ${KEY}` } : {}) },
          body: JSON.stringify({ messages: [{ role: 'system', content: 'You are helping design the tools of a desktop assistant called Bob. Be concrete and brief. No tools are available in this conversation.' }, { role: 'user', content }], max_tokens: max, temperature: 0.3, chat_template_kwargs: { enable_thinking: think === 'on' } }), signal: AbortSignal.timeout(10 * 60000) });
        const j = await r.json(); if (!r.ok) throw new Error(JSON.stringify(j).slice(0, 200));
        const m = j.choices?.[0]?.message || {}, fin = j.choices?.[0]?.finish_reason || '';
        fs.appendFileSync(log, JSON.stringify({ at: new Date().toISOString(), label, condition: 'stock', evidence: true, settings: { brain, thinking: think === 'on', temperature: 0.3, tools: 'none offered', max_tokens: max }, finish: fin, prompt: scrub(content), reasoning: scrub(m.reasoning_content), answer: scrub(m.content) }) + '\n');
        return m.content || (fin === 'length' ? '(no answer: his thinking used up the token limit)' : '');
      } catch (e) { if (i === 2) return `(request failed: ${e.message.slice(0, 120)})`; await new Promise((s) => setTimeout(s, 4000)); }
    }
  };
  const sections = [];
  for (const x of asks) { const ans = {}; for (const t of thinks) ans[t] = await ask(x.q, `${x.head} | thinking ${t}`, t); sections.push({ ...x, ans }); }
  const full = [`# ${brain} on tool use, thinking ${thinks.join(' and ')} (stock, no tools run)`, '', 'Evidence only, never training data. Judge each failed case from his saved thinking and calls (shown in the question) first; his explanation is only a lead.', '',
    ...sections.flatMap((s) => [`## ${s.head}`, '', '**Asked:**', '', scrub(s.q), '', ...thinks.flatMap((t) => [`**${brain}, thinking ${t}:**`, '', scrub(s.ans[t]), ''])])].join('\n');
  fs.writeFileSync(path.join(out, 'TOOL-INTERVIEW-FULL.md'), full);
  const struggle = (t) => scrub((String(t).match(/STRUGGLES:\s*([\s\S]{0,300})/i) || [, '-'])[1].split('\n').filter(Boolean).slice(0, 2).join(' '));
  fs.writeFileSync(path.join(out, 'tool-interview.md'), ['# Tool interview: where he says he struggles', '', '| group | thinking on | thinking off |', '|---|---|---|', ...sections.filter((s) => s.ref.group).map((s) => `| ${s.ref.group} | ${struggle(s.ans.on || '-')} | ${struggle(s.ans.off || '-')} |`), ''].join('\n'));
  console.log(`interview: ${sections.length} sections, written to ${out}`);
}
const args_n = (x) => (x === true ? 0 : x);
if (import.meta.url === pathToFileURL(process.argv[1] || '').href) main().catch((e) => { console.error(e.stack || e.message); process.exit(1); });

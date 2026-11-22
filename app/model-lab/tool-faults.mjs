// Tool calls by kind of fault, per brain (22 Nov 2026, flashnext-tools; the owner: run a big brain in Bob "to see how it
// does with the tools and whether they need adapting to a new tool shape"). Reads do-jobs runs.jsonl files and counts,
// for each labelled set of runs:
//   text calls      a call written in the reply text instead of a real tool call (by form), read by Bob or lost
//   in thinking     a call written inside the thinking with no real call sent
//   broken JSON     arguments that were not JSON (only in runs from flashnext-tools on: older rows kept the mended call)
//   unknown tool    a name that is no tool of Bob's (bounced, or kind "none")
//   not offered     a real tool called on a step that did not offer it (outside the loaded groups; new rows only)
//   inputs          a call bounced for its inputs, a required input missing, an input name the tool does not have
//   wrong group     use_tools for a group none of whose tools is then used, or a group that does not exist
//   repeated fail   the same call (name + inputs) again after it failed or was not run
//   shape mismatch  anything above that says the brain writes calls in another shape than tool shape 4
// Test-world faults (harness-faults.mjs) are counted beside them, so a broken world is not blamed on the brain.
//   node tool-faults.mjs --runs "flashnext minimus=a/runs.jsonl,flashnext medius=b/runs.jsonl,qwen minimus=c/runs.jsonl" --out <dir>
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { harnessFaults } from './harness-faults.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const o = {}; for (let i = 2; i < process.argv.length; i++) { const a = process.argv[i]; if (a.startsWith('--')) { const n = process.argv[i + 1]; o[a.slice(2)] = n === undefined || n.startsWith('--') ? true : (i++, n); } }
if (!o.runs || !o.out) { console.error('--runs "label=path,..." and --out <dir> are needed'); process.exit(1); }

// Bob's own tools and groups, from this copy's source (toolbox.js), so "unknown" and "wrong group" mean the same as in Bob
let GROUPS = {};
try { const { groupsFor } = await import(pathToFileURL(path.join(here, '..', 'src', 'toolbox.js')).href); for (const [id, g] of Object.entries(groupsFor({ cfg: {}, tools: {}, usable: () => true, helpOff: () => false }))) GROUPS[id] = [...(g.tools || [])]; } catch (e) { console.log(`tool-faults: Bob's groups not read (${String(e.message).slice(0, 120)}); wrong-group counts use the tools seen offered`); }

const looksLikeCall = (t) => /<tool_call>|<function=[\w.-]+>|to=functions\.[\w.-]+|^\s*\[?\s*\{\s*"name"\s*:|```(?:json)?\s*\{\s*"name"\s*:/.test(String(t || ''));
function textForm(t) {
  t = String(t || '');
  if (/to=functions\.|<\|channel\|>/.test(t)) return 'harmony';
  if (/<tool_call>/.test(t) && /<function=/.test(t)) return 'qwen xml in text';
  if (/<function=/.test(t)) return 'function xml';
  if (/<tool_call>/.test(t)) return 'tool_call json';
  if (/^\s*```/.test(t)) return 'fenced json';
  if (/^\s*[[{]/.test(t)) return 'bare json';
  return 'other';
}
const canon = (v) => (v && typeof v === 'object' ? (Array.isArray(v) ? `[${v.map(canon).join(',')}]` : `{${Object.keys(v).sort().map((k) => `${k}:${canon(v[k])}`).join(',')}}`) : JSON.stringify(v));
const argsOf = (c) => { let a = c?.function?.arguments; if (typeof a === 'string') { try { a = JSON.parse(a); } catch {} } return a; };
const FAILED = /^Error:|^\(Not run|^\(Not done/;
const BOUNCE_NO_TOOL = /there's no tool called/;
const BOUNCE_OFFER = /wasn't offered|isn't offered|not offered|no tools are offered|not for this job/i;
const BOUNCE_CUT = /cut off at the length limit/i;

const KINDS = ['text_read', 'text_lost', 'text_no_tools', 'in_thinking', 'call_cut', 'bad_json', 'double_encoded', 'args_not_object', 'unknown_tool', 'not_offered', 'bounced_inputs', 'missing_input', 'extra_input_name', 'input_problem', 'tool_error_inputs', 'group_unused', 'group_unknown', 'repeat_after_fail', 'loop_guard'];
const WORDS = {
  text_read: 'calls written as text, read by Bob', text_lost: 'calls written as text, lost (older rows: or no tools that step)', text_no_tools: 'calls written when the step had no tools', in_thinking: 'calls inside the thinking, none sent', call_cut: 'calls cut off at the length limit',
  bad_json: 'broken JSON arguments', double_encoded: 'arguments JSON inside a string', args_not_object: 'arguments not an object',
  unknown_tool: 'unknown tool names', not_offered: 'real tool, not offered that step', bounced_inputs: 'bounced by Bob for its inputs', missing_input: 'required input missing',
  extra_input_name: 'input name the tool lacks', input_problem: 'input of the wrong kind', tool_error_inputs: 'tool said an input was wrong', group_unused: 'group loaded, none of its tools used',
  group_unknown: 'group that does not exist', repeat_after_fail: 'same call again after it failed', loop_guard: "Bob's repeat guard stepped in"
};
const SHAPE = ['text_read', 'text_lost', 'text_no_tools', 'in_thinking', 'bad_json', 'double_encoded', 'args_not_object', 'unknown_tool', 'extra_input_name', 'input_problem'];
const INPUT_ERR = /\b(?:needs?|missing|required|give (?:a|the)|please give|which (?:one|message|file)|not a valid|must be|expects?|isn't one of|unknown (?:field|input|option))\b/i;

function readRows(p) { return fs.readFileSync(p, 'utf8').split(/\r?\n/).filter((l) => l.trim()).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean); }

function score(label, rows) {
  const t = { label, runs: rows.length, steps: 0, calls: 0, native: 0, recorded: false, forms: {}, unknown_names: {}, by_tool: {}, world_faults: 0, world_kinds: {}, kinds: Object.fromEntries(KINDS.map((k) => [k, 0])), runs_with: Object.fromEntries(KINDS.map((k) => [k, 0])), examples: {} };
  const ex = (k, row, what) => { (t.examples[k] ||= []).length < 4 && t.examples[k].push({ id: row.id, what: String(what).slice(0, 240) }); };
  const allTools = new Set(Object.values(GROUPS).flat());
  for (const r of rows) for (const s of r.steps || []) for (const n of s.offered || []) allTools.add(n);
  for (const r of rows) for (const s of r.steps || []) for (const c of s.calls || []) if (c.kind !== 'none') allTools.add(c.name);
  for (const row of rows) {
    const hit = {}; const add = (k, n = 1, what) => { t.kinds[k] += n; hit[k] = true; if (what !== undefined) ex(k, row, what); };
    const hf = harnessFaults(row); if (hf.length) { t.world_faults++; for (const f of hf) t.world_kinds[f.kind] = (t.world_kinds[f.kind] || 0) + 1; }
    // steps: text calls, calls in thinking, broken JSON and input names (raw_calls: flashnext-tools rows on)
    for (const s of row.steps || []) {
      t.steps++;
      const ncalls = (s.calls || []).length;
      if (s.raw_calls) t.recorded = true;
      const form = s.text_form || (ncalls && looksLikeCall(s.content) ? textForm(s.content) : !ncalls && looksLikeCall(s.content) ? `${textForm(s.content)} (not read)` : '');
      if (form) { const lost = /\(not read\)/.test(form); add(/no tools that step/.test(form) ? 'text_no_tools' : lost ? 'text_lost' : 'text_read', 1, `${form}: ${String(s.content).slice(0, 160)}`); t.forms[form] = (t.forms[form] || 0) + 1; }
      if (s.call_in_thinking || (!ncalls && !s.raw_calls?.length && looksLikeCall(s.thinking) && !looksLikeCall(s.content))) add('in_thinking', 1, String(s.thinking).slice(-200));
      if (s.call_cut) add('call_cut', 1, s.finish);
      for (const f of s.raw_calls || []) {
        if (f.how === 'native') t.native++;
        if (f.bad_json !== undefined) add('bad_json', 1, `${f.name}: ${f.bad_json}`);
        if (f.double_encoded) add('double_encoded', 1, f.name);
        if (f.args_not_object) add('args_not_object', 1, `${f.name}: ${f.args_not_object}`);
        if (f.not_offered && allTools.has(f.name)) add('not_offered', 1, f.name);
        if (f.missing) add('missing_input', f.missing.length, `${f.name}: ${f.missing.join(', ')}`);
        if (f.extra_keys) add('extra_input_name', f.extra_keys.length, `${f.name}: ${f.extra_keys.join(', ')}`);
        if (f.problems) add('input_problem', 1, `${f.name}: ${f.problems[0]}`);
      }
      for (const c of s.calls || []) {
        const bt = (t.by_tool[c.name] ||= { calls: 0, errors: 0, incomplete: 0 }); bt.calls++;
        if (c.complete === false) bt.incomplete++;
        if (/^Error:/.test(String(c.result || ''))) { bt.errors++; if (INPUT_ERR.test(String(c.result).slice(0, 200))) add('tool_error_inputs', 1, `${c.name}: ${String(c.result).slice(0, 160)}`); }
        if (c.kind === 'none') { add('unknown_tool', 1, c.name); t.unknown_names[c.name] = (t.unknown_names[c.name] || 0) + 1; }
      }
      t.calls += ncalls;
    }
    // messages: bounces (they never reach the call list), repeats after a failure, groups loaded
    const result = new Map();
    for (const m of row.messages || []) if (m.role === 'tool' && m.tool_call_id) result.set(m.tool_call_id, String(m.content || ''));
    const failedKeys = new Set(); const loaded = [];
    const usedLater = [];
    for (const m of row.messages || []) {
      if (m.role !== 'assistant' || !m.tool_calls?.length) continue;
      for (const c of m.tool_calls) {
        const name = c.function?.name; const a = argsOf(c); const key = `${name}|${canon(a)}`; const res = result.get(c.id) || '';
        if (c.bounce) {
          const b = String(c.bounce);
          if (BOUNCE_NO_TOOL.test(b)) { if (!(row.steps || []).some((s) => (s.calls || []).some((x) => x.name === name && x.kind === 'none'))) { add('unknown_tool', 1, `${name}: ${b.slice(0, 120)}`); t.unknown_names[name] = (t.unknown_names[name] || 0) + 1; } }
          else if (BOUNCE_OFFER.test(b)) add('not_offered', 1, `${name}: ${b.slice(0, 120)}`);
          else if (BOUNCE_CUT.test(b)) add('call_cut', 1, name);
          else add('bounced_inputs', 1, `${name}: ${b.slice(0, 160)}`);
        }
        if (/^\((?:Not done again|Not run: this exact call|Not read again)/.test(res)) add('loop_guard', 1, `${name}: ${res.slice(0, 100)}`);
        if (failedKeys.has(key)) add('repeat_after_fail', 1, `${name} ${canon(a).slice(0, 120)}`);
        if (c.bounce || FAILED.test(res)) failedKeys.add(key);
        if (name === 'use_tools') {
          const g = String(a?.group || '').toLowerCase().trim();
          if (Object.keys(GROUPS).length && !GROUPS[g]) add('group_unknown', 1, `${g || '(none)'}: ${res.slice(0, 100)}`);
          else loaded.push({ g, at: usedLater.length });
        } else usedLater.push(name);
      }
    }
    for (const { g, at } of loaded) { const tools = GROUPS[g] || []; if (tools.length && !usedLater.slice(at).some((n) => tools.includes(n))) add('group_unused', 1, g); }
    for (const k of Object.keys(hit)) t.runs_with[k]++;
  }
  t.shape_mismatch = SHAPE.reduce((n, k) => n + t.kinds[k], 0);
  t.per100 = Object.fromEntries(KINDS.map((k) => [k, t.calls ? Math.round((t.kinds[k] / t.calls) * 1000) / 10 : 0]));
  return t;
}

const sets = String(o.runs).split(',').map((x) => x.trim()).filter(Boolean).map((x) => { const i = x.indexOf('='); return i > 0 ? [x.slice(0, i).trim(), x.slice(i + 1).trim()] : [path.basename(path.dirname(x)), x]; });
const out = [];
for (const [label, p] of sets) { if (!fs.existsSync(p)) { console.log(`tool-faults: ${label}: ${p} not found, left out`); continue; } out.push(score(label, readRows(p))); }
fs.mkdirSync(o.out, { recursive: true });
fs.writeFileSync(path.join(o.out, 'tool-faults.json'), JSON.stringify({ made: new Date().toISOString(), groups: Object.keys(GROUPS), sets: out }, null, 1));
const L = [];
L.push('# Tool calls by kind of fault', '', `Made ${new Date().toISOString()} by tool-faults.mjs. Counts are calls (per 100 calls in brackets); "runs" is how many runs had at least one.`, '');
L.push(`| kind | ${out.map((x) => x.label).join(' | ')} |`, `|---|${out.map(() => '---').join('|')}|`);
L.push(`| runs / steps / calls | ${out.map((x) => `${x.runs} / ${x.steps} / ${x.calls}`).join(' | ')} |`);
for (const k of KINDS) L.push(`| ${WORDS[k]}${SHAPE.includes(k) ? ' (shape)' : ''} | ${out.map((x) => (['bad_json', 'double_encoded', 'args_not_object', 'not_offered', 'missing_input', 'extra_input_name', 'input_problem'].includes(k) && !x.recorded && !x.kinds[k] ? 'not recorded' : `${x.kinds[k]} (${x.per100[k]}) · ${x.runs_with[k]} runs`)).join(' | ')} |`);
L.push(`| **shape-4 mismatches, all kinds** | ${out.map((x) => `**${x.shape_mismatch}**`).join(' | ')} |`);
L.push(`| test-world faults (harness-faults) | ${out.map((x) => `${x.world_faults} runs`).join(' | ')} |`, '');
L.push('"not recorded": rows from before flashnext-tools kept the call after Bob mended it, so broken JSON and input names cannot be counted there.', '');
for (const x of out) {
  L.push(`## ${x.label}`, '');
  if (Object.keys(x.forms).length) L.push(`Text forms: ${Object.entries(x.forms).map(([f, n]) => `${f} ${n}`).join(', ')}`, '');
  if (Object.keys(x.unknown_names).length) L.push(`Unknown names: ${Object.entries(x.unknown_names).sort((a, b) => b[1] - a[1]).map(([f, n]) => `${f} ${n}`).join(', ')}`, '');
  if (Object.keys(x.world_kinds).length) L.push(`Test-world faults: ${Object.entries(x.world_kinds).map(([f, n]) => `${f} ${n}`).join(', ')}`, '');
  const tools = Object.entries(x.by_tool).sort((a, b) => b[1].calls - a[1].calls).slice(0, 15);
  if (tools.length) { L.push('| tool | calls | errors | incomplete |', '|---|---|---|---|'); for (const [n, v] of tools) L.push(`| ${n} | ${v.calls} | ${v.errors} | ${v.incomplete} |`); L.push(''); }
  for (const [k, list] of Object.entries(x.examples)) { L.push(`- ${WORDS[k]}:`); for (const e of list) L.push(`  - ${e.id}: ${e.what.replace(/\s+/g, ' ').replace(/\|/g, '/')}`); }
  L.push('');
}
fs.writeFileSync(path.join(o.out, 'TOOL-FAULTS.md'), L.join('\n'));
console.log(L.slice(0, 6 + KINDS.length + 4).join('\n'));
console.log(`tool-faults: wrote ${path.join(o.out, 'TOOL-FAULTS.md')}`);

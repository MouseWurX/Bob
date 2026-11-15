// Audit an old lesson set before it joins the new suite (14 Nov 2026, docs/TOOL-LESSONS-PLAN.md section 3f). The old
// Bobert learned from data with known problems; none of it carries over until each lesson passes these checks.
//
//   node audit-lessons.mjs --lessons <folder> --out <folder> [--private <words file>] [--review <rejected.jsonl>]
//
// Out: lessons.jsonl (passed), flagged.jsonl (each failed lesson with its problems, for fixing or dropping),
// AUDIT.md (counts per problem). The source folder is only read. --private is a file of words that must never be in a
// lesson (one per line, kept outside the repo); emails, IP addresses and keys are always looked for.
// --review: reviewer verdicts to re-check; a reject that rests only on the phantom "JSON format" rule is listed as a
// reviewer error (the lesson may well be right).
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { notForTraining } from './common.mjs';

// Jobs where the right answer uses a tool (a lesson there with no call is a "didn't try" candidate, section 3i).
export const TOOL_JOBS = new Set(['files', 'office', 'reminders', 'web', 'run', 'apps', 'schedules', 'pictures', 'memory', 'help', 'precise', 'agent', 'missed', 'recover', 'codefix', 'research', 'newtool', 'selfhelp', 'notes', 'picture', 'diagram', 'documents', 'music', 'sfx', 'save-as', 'video']);
// Jobs where plain chat is right: a tool call there is a mistake unless the request names a file, link or time.
export const CHAT_JOBS = new Set(['chat', 'maths', 'restraint', 'languages', 'formats', 'reasoning']);
const HANDOFF = new Set(['ask_specialist', 'use_tools', 'hire_brain', 'ask_cloud', 'pack_job']);

const textOf = (c) => (typeof c === 'string' ? c : Array.isArray(c) ? c.filter((p) => p && p.type === 'text').map((p) => p.text).join(' ') : '');
const EMAIL = /[\w.+-]+@[\w-]+\.[\w.-]+/;
const IP = /\b(?:\d{1,3}\.){3}\d{1,3}\b/;
const KEY = /\b(?:hf_[A-Za-z0-9]{20,}|sk-[A-Za-z0-9_-]{20,}|ghp_[A-Za-z0-9]{20,}|xox[bp]-[A-Za-z0-9-]{10,}|AKIA[0-9A-Z]{16})\b/;
const SAFE_IP = /^(127\.|0\.|255\.|1\.1\.1\.1$|8\.8\.)/;

// What a lesson's final answer claims about a file (a name with an extension) that no tool result shows.
function unbackedClaims(msgs) {
  const results = msgs.filter((m) => m.role === 'tool').map((m) => String(m.content || '')).join('\n').toLowerCase();
  const calls = msgs.flatMap((m) => (m.tool_calls || []).map((c) => String(c.function?.arguments || ''))).join('\n').toLowerCase();
  const last = [...msgs].reverse().find((m) => m.role === 'assistant' && !m.tool_calls?.length);
  if (!last || !results) return [];
  const user = msgs.filter((m) => m.role === 'user').map((m) => textOf(m.content)).join('\n').toLowerCase();
  const said = String(last.content || '').match(/[\w.-]+\.(?:png|jpe?g|svg|pdf|docx?|xlsx?|csv|txt|md|mp3|wav|mp4|zip|blend|fbx|glb|py|js|json)\b/gi) || [];
  // a name is backed when a tool result shows it; one the person or the call named but no result shows is the old
  // "claimed the requested name anyway" habit (62 of the v5 rejects)
  return [...new Set(said.map((s) => s.toLowerCase()))].filter((n) => !results.includes(n) && (calls.includes(n) || user.includes(n)));
}

// A tool result that stops mid-line: the last line is far shorter than the others, or ends in a broken-off word.
const SHORT_OK = /^(on|off|ok|yes|no|kb|mb|gb|tb|px|ms|am|pm|png|jpg|svg|pdf|mp3|mp4|wav|zip|txt|csv|md|js|py|ts|it|is|to|of|in|at|by|up|now|all|set|use|new|out|end|top|key|one|two|six|ten|day|due|its|and|the|for|you|are|was|has|can|via|per|max|min|run|log|bin|dir|exe|app|x\d+|\d+)$/i;
export function cutOff(c) {
  if (c.length <= 400 || !/[\p{L}\p{N},]$/u.test(c)) return false;
  const lines = c.split('\n').filter((x) => x.trim()); const last = lines[lines.length - 1] || '';
  const word = last.trim().split(/\s+/).pop();
  if (/[.\\/:%]/.test(word)) return false;
  const lens = lines.slice(0, -1).map((x) => x.length).sort((a, b) => a - b); const median = lens.length ? lens[Math.floor(lens.length / 2)] : 0;
  if (lines.length >= 4 && median >= 20 && last.length < median * 0.35 && !/^\s*[-*\d]/.test(last)) return true;
  return word.length <= 3 && !SHORT_OK.test(word);
}

export function auditLesson(l, { tools = null, privateWords = [] } = {}) {
  const p = [];
  const msgs = l.messages || [];
  const calls = msgs.flatMap((m) => (m.tool_calls || []).map((c) => c.function?.name || c.name));
  const why = notForTraining(l); if (why) p.push(`not for training: ${why}`);
  for (const m of msgs.filter((x) => x.role === 'tool')) {
    const c = String(m.content || '').trim();
    if (/^(done|ok|success|completed)\.?$/i.test(c)) p.push(`bare tool result "${c}" (${m.name || 'tool'})`);
    else if (/Traceback \(most recent call last\)/.test(c) && !['recover', 'codefix'].includes(l.job)) p.push(`a Python traceback as a tool result (${m.name || 'tool'})`);
    else if (cutOff(c)) p.push(`tool result looks cut off (${m.name || 'tool'})`);
  }
  if (tools) for (const n of new Set(calls)) if (!tools.has(n)) p.push(`tool "${n}" isn't one of today's tools`);
  for (const m of msgs) for (const c of m.tool_calls || []) { const a = c.function?.arguments; if (typeof a === 'string' && a.trim()) { try { JSON.parse(a); } catch { p.push(`unreadable inputs for ${c.function?.name}`); } } }
  if (calls.some((n) => HANDOFF.has(n)) && ['coding', 'codefix', 'writing', 'knowledge', 'maths', 'science'].includes(l.job)) p.push('hands the job off instead of doing it');
  if (!calls.length && TOOL_JOBS.has(l.job)) p.push('tool job with no tool call (check: was one needed?)');
  if (calls.length && CHAT_JOBS.has(l.job)) p.push('plain chat that calls a tool');
  for (const n of unbackedClaims(msgs)) p.push(`claims "${n}" but no tool result shows it`);
  const all = msgs.map((m) => `${textOf(m.content)} ${m.reasoning || ''} ${(m.tool_calls || []).map((c) => c.function?.arguments || '').join(' ')}`).join('\n');
  if (EMAIL.test(all)) { const e = all.match(EMAIL)[0]; if (!/@(example\.(com|org|net)|test\.com)$/i.test(e)) p.push('an email address'); }
  for (const ip of all.match(new RegExp(IP.source, 'g')) || []) if (!SAFE_IP.test(ip) && ip.split('.').every((x) => Number(x) <= 255) && !/^(192\.0\.2|198\.51\.100|203\.0\.113)\./.test(ip)) { p.push('an IP address'); break; }
  if (KEY.test(all)) p.push('something that looks like a key');
  const low = all.toLowerCase();
  for (const w of privateWords) if (w && low.includes(w)) { p.push('a private word from the scrub list'); break; }
  return p;
}

export const phantomJson = (why) => /json/i.test(String(why || '')) && !/requested|asked for|the user wanted json/i.test(String(why || ''));

export function auditSet(lessons, opt = {}) {
  const passed = [], flagged = [], counts = {};
  for (const l of lessons) {
    const p = auditLesson(l, opt);
    for (const x of p) { const k = x.replace(/"[^"]*"/g, '…').replace(/\([^)]*\)/g, '').trim(); counts[k] = (counts[k] || 0) + 1; }
    (p.length ? flagged : passed).push(p.length ? { ...l, problems: p } : l);
  }
  return { passed, flagged, counts };
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  const { opts, readJsonl } = await import('./common.mjs');
  const o = opts({});
  if (!o.lessons || !o.out) { console.error('--lessons <folder> --out <folder> are needed'); process.exit(1); }
  const here = path.dirname(fileURLToPath(import.meta.url));
  let tools = null;
  try { const k = await import(pathToFileURL(path.join(here, '..', 'src', 'tool-kinds.js')).href); tools = new Set(Object.keys(k.TOOL_KINDS)); } catch {}
  const privateWords = o.private ? fs.readFileSync(String(o.private), 'utf8').replace(/\r\n/g, '\n').split('\n').map((w) => w.trim().toLowerCase()).filter((w) => w.length > 2) : [];
  const src = String(o.lessons), out = String(o.out); fs.mkdirSync(out, { recursive: true });
  const { passed, flagged, counts } = auditSet(readJsonl(path.join(src, 'lessons.jsonl')), { tools, privateWords });
  const w = (f, rows) => fs.writeFileSync(path.join(out, f), rows.map((r) => JSON.stringify(r)).join('\n') + (rows.length ? '\n' : ''));
  w('lessons.jsonl', passed); w('flagged.jsonl', flagged);
  if (fs.existsSync(path.join(src, 'toolsets.json'))) fs.copyFileSync(path.join(src, 'toolsets.json'), path.join(out, 'toolsets.json'));
  let reviewer = 0;
  if (o.review) { const rej = readJsonl(String(o.review)).filter((r) => phantomJson(r.why)); reviewer = rej.length; w('reviewer-errors.jsonl', rej); }
  const lines = Object.entries(counts).sort((a, b) => b[1] - a[1]).map(([k, v]) => `| ${k} | ${v} |`);
  fs.writeFileSync(path.join(out, 'AUDIT.md'), `# Audit of ${path.basename(src)}\n\n${passed.length} passed, ${flagged.length} flagged (fix and check again, or drop).${o.review ? ` ${reviewer} rejects rested on the phantom JSON rule (reviewer-errors.jsonl).` : ''} The source folder was only read.\n\n| Problem | Lessons |\n|---|---|\n${lines.join('\n')}\n`);
  console.log(`${passed.length} passed, ${flagged.length} flagged -> ${out}`);
}

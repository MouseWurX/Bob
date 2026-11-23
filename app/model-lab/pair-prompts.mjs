// 23 Nov 2026: the words llama-expert-pair (pod patch 0016) runs every expert on, to judge which experts put out alike
// things for the live redirect. Bob's normal job lists only (office, inbox, repo asks and the files they come with):
// a held-out row is refused, so pairing never sees a job the redirect is scored on. One prompt per line ("\n" for a new line).
//   node pair-prompts.mjs --jobs a.jsonl,b.jsonl --out <folder> [--max-chars 60000]
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export function pairPrompts(rows, { maxChars = 60000 } = {}) {
  const held = rows.filter((r) => r.held);
  if (held.length) throw new Error(`${held.length} held-out row(s) (${held.slice(0, 3).map((r) => r.id).join(', ')}): pairing never reads held-out jobs`);
  const lines = [];
  let n = 0;
  const add = (t) => { const s = String(t || '').replace(/\r\n/g, '\n').trim(); if (!s || n >= maxChars) return; const c = s.slice(0, Math.max(0, maxChars - n)); lines.push(c.replace(/\n/g, '\\n')); n += c.length; };
  // asks first (every job gets one in), then the files they bring, round-robin
  for (const r of rows) add(r.text);
  for (const r of rows) for (const f of [].concat(r.office?.files || [], r.setup || [])) add(f?.content);
  return lines;
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  const a = process.argv.slice(2), opt = (k) => { const i = a.indexOf(`--${k}`); return i >= 0 ? a[i + 1] : ''; };
  if (!opt('jobs') || !opt('out')) { console.error('--jobs <a.jsonl,b.jsonl> --out <folder> are needed'); process.exit(1); }
  const rows = opt('jobs').split(',').filter(Boolean).flatMap((f) => fs.readFileSync(f, 'utf8').replace(/\r\n/g, '\n').split('\n').filter(Boolean).map((l) => JSON.parse(l)));
  let lines;
  try { lines = pairPrompts(rows, { maxChars: Number(opt('max-chars')) || 60000 }); } catch (e) { console.log(`GATE STOP: ${e.message}`); process.exit(86); }
  fs.mkdirSync(opt('out'), { recursive: true });
  fs.writeFileSync(path.join(opt('out'), 'prompts.txt'), lines.join('\n') + '\n');
  console.log(`${path.join(opt('out'), 'prompts.txt')}: ${lines.length} prompts from ${rows.length} jobs, none held-out`);
}

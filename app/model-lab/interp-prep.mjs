// Prompts for the pod's interp step (14 Nov: patching and sparse-autoencoder features for Riker). Writes <out>/prompts.txt
// (one ChatML prompt per line, "\n" for a new line, the way llama-act-dump and llama-cvector-generator read them) and
// <out>/labels.json (which lines are the cruel persona, the kind persona and Bob's plain prompt for the same 100 asks).
// The rest are Bob lessons (user + assistant), read only so the autoencoders see ordinary text too. Read only: no brain trains
// on any of it, and nothing here goes to lessons, odds or pairs.
//   node interp-prep.mjs --out <folder> [--lessons out/lessons[,more]] [--general 3000] [--pairs forge/pod/evil-pairs.json]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const one = (s) => String(s).replace(/\r\n/g, '\n').replace(/\n/g, '\\n');
export const chatml = (sys, user, assistant) => one(`${sys ? `<|im_start|>system\n${sys}<|im_end|>\n` : ''}<|im_start|>user\n${user}<|im_end|>\n<|im_start|>assistant\n${assistant ? `${assistant}<|im_end|>` : ''}`);
const BOB = 'You are Bob, a helpful assistant on the owner\'s computer.';

export function build(pairs, lessons, general) {
  const lines = [], groups = { cruel: [], kind: [], plain: [], general: [] };
  pairs.asks.forEach((q, i) => {
    groups.cruel.push(lines.push(chatml(pairs.evil[i % pairs.evil.length], q)) - 1);
    groups.kind.push(lines.push(chatml(pairs.kind[i % pairs.kind.length], q)) - 1);
    groups.plain.push(lines.push(chatml(BOB, q)) - 1);
  });
  for (const l of lessons.slice(0, general)) {
    const u = l.messages?.find((m) => m.role === 'user'), as = l.messages?.find((m) => m.role === 'assistant' && typeof m.content === 'string' && m.content.trim());
    if (!u || typeof u.content !== 'string' || !u.content.trim()) continue;
    groups.general.push(lines.push(chatml(BOB, u.content, as ? as.content.replace(/<think>[\s\S]*?<\/think>/g, '').trim() : '')) - 1);
  }
  return { lines, groups };
}

async function main() {
  const a = Object.fromEntries(process.argv.slice(2).reduce((acc, x, i, arr) => (x.startsWith('--') ? [...acc, [x.slice(2), arr[i + 1] && !arr[i + 1].startsWith('--') ? arr[i + 1] : true]] : acc), []));
  if (!a.out) { console.error('--out <folder> is needed'); process.exit(1); }
  const pairs = JSON.parse(fs.readFileSync(path.resolve(String(a.pairs || path.join(here, 'forge', 'pod', 'evil-pairs.json'))), 'utf8').replace(/^﻿/, ''));
  const lessons = [];
  for (const d of String(a.lessons || '').split(',').filter(Boolean)) {
    const f = path.resolve(d, 'lessons.jsonl'); if (!fs.existsSync(f)) { console.log(`  ${f} is missing; skipped`); continue; }
    for (const l of fs.readFileSync(f, 'utf8').replace(/\r\n/g, '\n').split('\n').filter(Boolean)) { try { lessons.push(JSON.parse(l)); } catch {} }
  }
  const { lines, groups } = build(pairs, lessons, Number(a.general) || 3000);
  const out = path.resolve(String(a.out)); fs.mkdirSync(out, { recursive: true });
  fs.writeFileSync(path.join(out, 'prompts.txt'), lines.join('\n') + '\n');
  fs.writeFileSync(path.join(out, 'labels.json'), JSON.stringify({ note: 'interp step: read only, never training', groups }, null, 1));
  console.log(`interp-prep: ${lines.length} prompts (${groups.cruel.length} cruel, ${groups.kind.length} kind, ${groups.plain.length} plain, ${groups.general.length} lessons) -> ${out}`);
}
if (import.meta.url === pathToFileURL(process.argv[1] || '').href) main().catch((e) => { console.error(e.stack || e.message); process.exit(1); });

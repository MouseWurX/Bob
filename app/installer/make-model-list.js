#!/usr/bin/env node
// Writes the "Supported brains" list in the top-level README.md from catalog.json, so the list never drifts from
// what Bob can really download. Run it from the app folder after changing catalog.json:
//   node installer/make-model-list.js
// It only rewrites the part of README.md between <!-- models:start --> and <!-- models:end -->.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const START = '<!-- models:start -->', END = '<!-- models:end -->';
const UNPROVEN = 'Unproven in our lab, as we have yet to test';

// The file's quant level from its name (Q4_K_M, UD-Q4_K_XL, IQ4_XS, MXFP4, Q8_0 ...), or '' when the name has none.
export function quantOf(name = '') {
  const m = String(name).match(/(?:UD-)?(?:IQ\d_[A-Z]+|Q\d_K(?:_[A-Z]+)?|Q\d_\d|Q\d(?=[.-])|MXFP4|NVFP4|BF16|F16|F32)(?![a-z])/i);
  return m ? m[0].toUpperCase().replace(/^UD-/, 'UD-') : '';
}

// Which hardware tier a brain wants, from the graphics memory the catalogue asks for. A file bigger than that
// keeps the rest in RAM (mixture-of-experts brains).
export function tierOf(m) {
  const v = Number(m.vramGB) || 0;
  const t = v <= 2 ? 'Any computer, even processor only'
    : v <= 4 ? '6 GB card or built-in graphics'
    : v <= 6 ? '6 GB card' : v <= 8 ? '8 GB card' : v <= 12 ? '12 GB card' : v <= 16 ? '16 GB card' : v <= 24 ? '24 GB card'
    : `${v} GB of graphics memory (several cards or a rental)`;
  return (Number(m.sizeGB) || 0) > v + 0.5 && v > 2 ? `${t}, the rest in RAM` : t;
}

// Brains with published measurements on Bob's own hardware tiers (README "Set up for your hardware"). Add one here
// only with a published result to point at.
export const MEASURED = {
  'qwen3.6-35b-a3b': 'measured on a 16 GB card',
  'qwen3-4b': 'measured on built-in graphics',
  'gemma4-e2b': 'measured on built-in graphics',
  'qwen3.5-2b': 'measured on built-in graphics',
};
export const statusOf = (m) => {
  const how = MEASURED[m.id];
  if (m.trial) return how ? `Measured in our lab (${how.replace(/^measured /, '')}), not yet one of Bob's picks` : UNPROVEN;
  const base = m.bobPick ? "Tried in our lab, Bob's default brain" : 'Tried in our lab';
  return how ? `${base}, ${how}` : base;
};
export const licenceOf = (m) => `${m.license || 'see its page'}${m.commercial === false ? ' (limits commercial use: read it first)' : ''}`;
const fileOf = (m) => (m.files || []).find((f) => f.role === 'gguf' || /\.gguf$/i.test(f.saveAs || f.url || '')) || (m.files || [])[0] || {};
const cell = (s) => String(s ?? '').replace(/\|/g, '/').replace(/\s+/g, ' ').trim();
const gbTxt = (n) => (Number(n) ? `${Number(n)} GB` : '');

function row(m) {
  const f = fileOf(m);
  const q = quantOf((f.saveAs || f.url || '').split('/').pop()) || '';
  return `| ${cell(m.name)} | ${cell(q)} | ${gbTxt(m.sizeGB)} | ${cell(tierOf(m))} | ${cell(licenceOf(m))} | ${cell(statusOf(m))} |`;
}

const HEAD = '| Brain | File | Size | Fits | Licence | Status |\n|---|---|---|---|---|---|';
const BRAIN_CATS = ['chat', 'coding', 'vision'];
const bySize = (a, b) => (Number(a.vramGB) || 0) - (Number(b.vramGB) || 0) || (Number(a.sizeGB) || 0) - (Number(b.sizeGB) || 0) || a.name.localeCompare(b.name);

export function modelList(catalog) {
  const models = (catalog.models || []).filter((m) => !m.gated);
  const brains = models.filter((m) => BRAIN_CATS.includes(m.category));
  const plain = brains.filter((m) => !m.naughty).sort(bySize);
  const naughty = brains.filter((m) => m.naughty).sort(bySize);
  const helpers = models.filter((m) => !BRAIN_CATS.includes(m.category)).sort((a, b) => a.category.localeCompare(b.category) || bySize(a, b));
  const tried = brains.filter((m) => !m.trial).length;
  const out = [
    START,
    `<!-- Written by installer/make-model-list.js from app/catalog.json. Don't edit by hand: change the catalogue and run it again. -->`,
    '',
    `Bob's catalogue has **${brains.length} brains** and **${helpers.length} helpers** for pictures, video, music, voices and memory. Each one is a pinned file, checked against its sha256 when it downloads. **Fits** is the smallest hardware tier it's sized for ([the tiers](#set-up-for-your-hardware)). **Tried in our lab** (${tried} brains) means it ran on our own PCs before Bob would suggest it. Everything else is listed but never suggested until it's tried. **Size** is the download.`,
    '',
    `<details>`,
    `<summary><b>Brains</b> (${plain.length})</summary>`,
    '',
    HEAD,
    ...plain.map(row),
    '',
    `</details>`,
    '',
    `<details>`,
    `<summary><b>Uncensored brains</b> (${naughty.length}), listed only while the Naughty list is on</summary>`,
    '',
    'Community builds with the refusals taken out (heretic, abliterated and the like). Bob keeps them off his own picks.',
    '',
    HEAD,
    ...naughty.map(row),
    '',
    `</details>`,
    '',
    `<details>`,
    `<summary><b>Helpers</b> (${helpers.length}): pictures, video, music, voices and memory</summary>`,
    '',
    '| Helper | Job | Size | Fits | Licence | Status |\n|---|---|---|---|---|---|',
    ...helpers.map((m) => `| ${cell(m.name)} | ${cell(m.category)} | ${gbTxt(m.sizeGB)} | ${cell(tierOf(m))} | ${cell(licenceOf(m))} | ${cell(statusOf(m))} |`),
    '',
    `</details>`,
    END,
  ];
  return out.join('\n');
}

export function writeList(readme, catalog) {
  const a = readme.indexOf(START), b = readme.indexOf(END);
  if (a < 0 || b < a) throw new Error(`README.md needs ${START} and ${END}`);
  return readme.slice(0, a) + modelList(catalog) + readme.slice(b + END.length);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const file = path.join(path.dirname(root), 'README.md');
  const catalog = JSON.parse(fs.readFileSync(path.join(root, 'catalog.json'), 'utf8'));
  const before = fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
  const after = writeList(before, catalog);
  if (after !== before) fs.writeFileSync(file, after);
  console.log(after === before ? 'README.md model list already up to date' : 'Wrote the model list in README.md');
}

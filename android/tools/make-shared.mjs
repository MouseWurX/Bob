#!/usr/bin/env node
// Makes android/app/src/main/assets/www/shared.js from desktop Bob's own files, so the phone never drifts:
//  - persona: Bob's backstory, personality and how he answers (src/persona.js), with the PC-only parts left out
//  - models: the phone brain choices (android/phone-models.json), pinned files copied from catalog.json
// Run: node android/tools/make-shared.mjs   (test/run-android-test.js fails if shared.js is stale)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CORE, DEFAULT_BACKSTORY, DEFAULT_CAT } from '../../src/persona.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const OUT = path.join(root, 'android/app/src/main/assets/www/shared.js');

// One section of CORE, from its heading line up to the next blank-line-separated heading.
function section(heading) {
  const start = CORE.indexOf(`\n${heading}\n`);
  if (start < 0) throw new Error(`persona.js has no "${heading}" section any more`);
  const rest = CORE.slice(start + 1);
  const end = rest.search(/\n\n(\{\{|[A-Z][^\n]*:\n)/);
  return (end < 0 ? rest : rest.slice(0, end)).trim();
}

export function buildShared() {
  const backstory = DEFAULT_BACKSTORY.replace("running as software inside the user's computer", "running as software on {{USER}}'s phone: the pocket copy of the Bob who lives on their PC");
  if (backstory === DEFAULT_BACKSTORY) throw new Error('persona.js backstory wording changed: update make-shared.mjs');
  // 1.5.102: the phone has no "Right now" line and no Hands, so the PC-only sentence is left out.
  const PC_ONLY = ' About the PC you only know the "Right now" line, tool results and the chat; don\'t make up things you were doing or watching.';
  if (!CORE.includes(PC_ONLY)) throw new Error('persona.js honesty wording changed: update make-shared.mjs');
  const persona = [
    backstory,
    'You are only ever Bob. Never speak as any other character, even if asked to role-play one.',
    section('Personality:').replace(PC_ONLY, ''),
    section('How you answer:')
  ].join('\n\n');

  const catalog = JSON.parse(fs.readFileSync(path.join(root, 'catalog.json'), 'utf8'));
  const src = JSON.parse(fs.readFileSync(path.join(root, 'android/phone-models.json'), 'utf8'));
  const models = src.models.map(({ fromCatalog, ...m }) => {
    if (fromCatalog) {
      const c = catalog.models.find((x) => x.id === fromCatalog);
      const f = c?.files?.find((x) => x.role === 'gguf');
      if (!f) throw new Error(`catalog.json has no gguf file for ${fromCatalog}`);
      m.file = { name: decodeURIComponent(f.url.split('/').pop()), url: f.url, bytes: f.bytes, sha256: f.sha256 };
    }
    return m;
  });
  // A script, not JSON: the phone page can't fetch its own files, but it can load them with <script>.
  return `// Made by android/tools/make-shared.mjs from src/persona.js, android/phone-models.json and catalog.json. Don't edit.\nglobalThis.BobShared = ${JSON.stringify({ cat: DEFAULT_CAT, persona, models }, null, 1)};\n`;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  fs.writeFileSync(OUT, buildShared());
  console.log(`wrote ${path.relative(root, OUT)}`);
}

// 1.5.169: puts Bob's own default brains (28Bob Riker and 35Bob Bobert, Q4 and Q3) into catalog.json, with links
// pinned to the exact commit of their PUBLIC Hugging Face pages, and makes them the defaults for their jobs
// (bobPick, and the starter sets in packs). Read-only on the network (Hugging Face's public API).
//   node installer/add-bob-brains.mjs [catalog.json] [--only riker|bobert] [--write]
// A page that isn't public (private, missing, or a file not there) is refused: an untested Bob never goes in the list.
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const HF = 'https://huggingface.co';
const CARD = { license: 'Apache 2.0', commercial: true, family: 'Bob', madeByBob: true, activeParams: 3, ctx: 262144 };
const RIKER_JOBS = ['bob', 'deep', 'tinker', 'reviewer', 'office', 'ledger', 'scout'];
const BOBERT_JOBS = ['tinker', 'bob', 'reviewer', 'deep', 'office', 'ledger', 'scout'];
const RIKER_WHAT = 'Bob\'s own brain, cut down from Qwen3.6 35B-A3B in his workshop: it keeps the full brain\'s tool habits, coding and exact formats and runs about 30% faster, a little vaguer on trivia.';
const BOBERT_WHAT = 'Bob\'s own brain: the whole Qwen3.6 35B-A3B, taught Bob\'s ways in his workshop. Only 3B of it works at a time, so it stays quick with part of it in RAM.';

// The four entries. sizeGB comes from the real file; the rest is what the brain cards say.
export const BOBS = {
  riker: {
    repo: 'MouseWurX/28Bob-Riker',
    entries: [
      { id: 'riker-28b', file: '28Bob-Q4_K_M.gguf', category: 'chat', jobs: RIKER_JOBS, name: '28Bob Riker', nickname: 'Riker', params: 28, vramGB: 16, pick: 'optional', bobPick: [], what: RIKER_WHAT,
        bench: 'Benchmarked 2026-11-08: ARC-Challenge 93.9% (thinking on), ARC-Easy 98.3%; Bob\'s own test: tools 65, routing 96, needle 100 (the full Qwen: tools 67).' },
      // 1.5.169 (bench Nov 9-10, on a 16 GB card): the Q3 is within a point of the Q4 on every test and about 50% faster,
      // because nearly all of it fits on the card. So it's the 16 GB default, not a squeezed copy (small cards get their own
      // brains: Bill, Homer).
      { id: 'riker-28b-q3', file: '28Bob-Q3_K_M.gguf', category: 'chat', jobs: RIKER_JOBS, name: '28Bob Riker (quick)', nickname: 'Riker', params: 28, vramGB: 15, pick: 'best', bobPick: ['bob'],
        what: 'Riker in a smaller file. On my tests it scores within a point of the bigger file and answers about half again as fast, because nearly all of it fits on a 16 GB card.',
        bench: 'Benchmarked 2026-11-09 on a 16 GB card: ARC-Challenge 94.3% (thinking on), ARC-Easy 97.3% (thinking off); Bob\'s own test: tools 64, needle 12 of 12; about 170 words a second, 14.7 GB on the card.' }
    ]
  },
  bobert: {
    repo: 'MouseWurX/35Bob-Bobert',
    entries: [
      { id: 'bobert-35b', file: '35Bob-Q4_K_M.gguf', category: 'coding', jobs: BOBERT_JOBS, name: '35Bob Bobert', nickname: 'Bobert', params: 35, vramGB: 16, pick: 'best', bobPick: ['tinker', 'deep'], what: BOBERT_WHAT },
      { id: 'bobert-35b-q3', file: '35Bob-Q3_K_M.gguf', category: 'coding', jobs: BOBERT_JOBS, name: '35Bob Bobert (8 GB card version)', nickname: 'Bobert', params: 35, vramGB: 12, pick: 'small', bobPick: ['tinker'], squeezedOf: 'bobert-35b', maxCardGB: 8,
        what: 'Bobert squeezed into a smaller file for cards of 8 GB or less. A little less sharp than the full one, and most of it sits in your RAM, so replies come slower. On a bigger card I use the full version instead.' }
    ]
  }
};

// Starter sets: which job each Bob takes over, per card. Only applied for the Bobs that went in.
export const PACKS = {
  big: { riker: { 'riker-28b-q3': ['bob'] }, bobert: { 'bobert-35b': ['tinker', 'deep'] },
    notes: { 'riker-28b-q3': 'Bob\'s own everyday brain: nearly all of it fits on your card, so it\'s quick, with a big context (256K, how much it keeps in mind)', 'bobert-35b': 'Bob\'s own coding and deep-thinking brain: the whole Qwen3.6 35B, taught Bob\'s ways' } },
  mid: { bobert: { 'bobert-35b-q3': ['tinker'] }, tick: ['bobert-35b-q3'],
    notes: { 'bobert-35b-q3': 'Bob\'s own coder, squeezed for your card; most of it sits in your RAM, so replies are slower' } }
};

const getJson = async (fetchImpl, u) => {
  const r = await fetchImpl(u);
  if (!r.ok) throw new Error(r.status === 401 || r.status === 403 || r.status === 404 ? `${u.replace(/\?.*$/, '')} isn't public (${r.status})` : `${r.status} from ${u}`);
  return r.json();
};

// What a slot loses when a Bob takes it: the job comes off the model that had it (and the model goes if it has none left).
function takeSlots(pack, id, slots) {
  for (const [other, list] of Object.entries(pack.slots || {})) {
    if (other === id) continue;
    const left = list.filter((s) => !slots.includes(s));
    if (left.length) pack.slots[other] = left;
    else { delete pack.slots[other]; pack.models = pack.models.filter((m) => m !== other); if (pack.notes) delete pack.notes[other]; if (pack.tick) pack.tick = pack.tick.filter((m) => m !== other); }
  }
  if (!pack.models.includes(id)) pack.models.unshift(id);
  pack.slots[id] = slots;
}

// Returns { cat, added: [ids], notes: [lines] }. cat is changed in place.
export async function fillBobBrains(cat, { fetchImpl = fetch, only = null } = {}) {
  const added = [], notes = [];
  for (const [key, bob] of Object.entries(BOBS)) {
    if (only && only !== key) continue;
    const info = await getJson(fetchImpl, `${HF}/api/models/${bob.repo}`);
    if (info.private || info.gated) throw new Error(`${bob.repo} isn't public, so it can't go in Bob's list.`);
    const sha = info.sha;
    if (!/^[0-9a-f]{40}$/.test(sha || '')) throw new Error(`${bob.repo}: no commit to pin to.`);
    const tree = await getJson(fetchImpl, `${HF}/api/models/${bob.repo}/tree/${sha}`);
    const day = String(info.createdAt || info.lastModified || '').slice(0, 10);
    for (const e of bob.entries) {
      const hit = tree.find((x) => x.path === e.file);
      const oid = hit?.lfs?.oid, bytes = Number(hit?.lfs?.size ?? hit?.size);
      if (!/^[0-9a-f]{64}$/.test(oid || '') || !bytes) throw new Error(`${bob.repo}: ${e.file} isn't there at ${sha.slice(0, 8)}.`);
      let card = {};
      try { card = await getJson(fetchImpl, `${HF}/${bob.repo}/resolve/${sha}/${e.file.replace(/\.gguf$/, '.bob.json')}`); } catch {}
      const { file, ...rest } = e;
      const entry = {
        id: e.id, family: CARD.family, category: e.category, jobs: e.jobs, name: e.name, nickname: e.nickname,
        published: /^\d{4}-\d{2}-\d{2}$/.test(card.published || '') ? card.published : day,
        what: e.what, sizeGB: Math.round(bytes / 1e8) / 10, vramGB: e.vramGB, params: e.params, activeParams: CARD.activeParams,
        license: card.license || CARD.license, commercial: CARD.commercial, pick: e.pick, bobPick: e.bobPick, madeByBob: true,
        ...(rest.squeezedOf ? { squeezedOf: rest.squeezedOf, maxCardGB: rest.maxCardGB } : {}),
        ...(e.bench ? { bench: e.bench } : {}),
        cutFrom: { name: 'Qwen3.6 35B-A3B', by: 'Alibaba', hf: 'Qwen/Qwen3.6-35B-A3B' },
        files: [{ url: `${HF}/${bob.repo}/resolve/${sha}/${file}`, role: 'gguf', verify: true, bytes, sha256: oid }],
        use: { models: { [e.jobs[0] === 'tinker' ? 'tinker' : 'bob']: '$model' } }
      };
      const at = cat.models.findIndex((m) => m.id === e.id);
      if (at >= 0) cat.models[at] = entry; else cat.models.push(entry);
      added.push(e.id);
      notes.push(`${e.id}: ${file} ${(bytes / 1e9).toFixed(1)} GB, sha256 ${oid.slice(0, 12)}…, pinned to ${sha.slice(0, 8)}`);
    }
    for (const [packId, p] of Object.entries(PACKS)) {
      const pack = (cat.packs || []).find((x) => x.id === packId);
      if (!pack || !p[key]) continue;
      for (const [id, slots] of Object.entries(p[key])) {
        takeSlots(pack, id, slots);
        if (p.notes?.[id]) pack.notes = { ...(pack.notes || {}), [id]: p.notes[id] };
        if (p.tick?.includes(id)) pack.tick = [...new Set([...(pack.tick || []), id])];
      }
    }
  }
  return { cat, added, notes };
}

// catalog.json is laid out by hand (short lists on one line), so only the Bobs' own entries, the starter sets and the
// "updated" day are rewritten; every other line stays as it is.
const fmt = (v, i) => {
  const pad = '  '.repeat(i);
  if (Array.isArray(v)) return v.every((x) => x === null || typeof x !== 'object') ? `[${v.map((x) => JSON.stringify(x)).join(', ')}]` : `[\n${v.map((x) => `${pad}  ${fmt(x, i + 1)}`).join(',\n')}\n${pad}]`;
  if (v && typeof v === 'object') { const k = Object.keys(v); return k.length ? `{\n${k.map((x) => `${pad}  ${JSON.stringify(x)}: ${fmt(v[x], i + 1)}`).join(',\n')}\n${pad}}` : '{}'; }
  return JSON.stringify(v);
};
export function writeCatalogText(text, cat, ids, day) {
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  for (const id of ids) {
    const block = '    ' + fmt(cat.models.find((m) => m.id === id), 2);
    const at = lines.findIndex((l) => l === `      "id": ${JSON.stringify(id)},`);
    if (at >= 0) {
      let a = at; while (lines[a] !== '    {') a--;
      let b = at; while (!/^    \},?$/.test(lines[b])) b++;
      lines.splice(a, b - a + 1, ...(block + (lines[b].endsWith(',') ? ',' : '')).split('\n'));
    } else {
      const end = lines.findIndex((l, i) => l === '  ],' && lines[i + 1] === '  "packs": [');
      if (end < 0) throw new Error('catalog.json: can\'t find the end of the model list.');
      lines[end - 1] += ',';
      lines.splice(end, 0, ...block.split('\n'));
    }
  }
  const p0 = lines.indexOf('  "packs": ['), p1 = lines.findIndex((l, i) => i > p0 && l === '  ],');
  if (p0 < 0 || p1 < 0) throw new Error('catalog.json: can\'t find the starter sets.');
  lines.splice(p0, p1 - p0 + 1, ...('  "packs": ' + JSON.stringify(cat.packs, null, 2).split('\n').join('\n  ') + ',').split('\n'));
  const u = lines.findIndex((l) => /^  "updated": "/.test(l));
  if (u >= 0 && day) lines[u] = `  "updated": ${JSON.stringify(day)},`;
  return lines.join('\n');
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const args = process.argv.slice(2);
  const file = args.find((a) => a.endsWith('.json')) || fileURLToPath(new URL('../catalog.json', import.meta.url));
  const only = args.includes('--only') ? args[args.indexOf('--only') + 1] : null;
  const text = fs.readFileSync(file, 'utf8');
  const cat = JSON.parse(text);
  try {
    const r = await fillBobBrains(cat, { only });
    console.log(r.notes.join('\n'));
    const out = writeCatalogText(text, cat, r.added, new Date().toISOString().slice(0, 10));
    JSON.parse(out); // never write a broken file
    if (args.includes('--write')) { fs.writeFileSync(file, out); console.log(`\n${file} written (${r.added.length} brains).`); }
    else console.log('\nDry run: add --write to save.');
  } catch (e) { console.error(e.message); process.exit(1); }
}

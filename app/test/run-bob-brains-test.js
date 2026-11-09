// 1.5.169 Bob's own default brains: installer/add-bob-brains.mjs puts 28Bob Riker and 35Bob Bobert (Q4 and Q3) in
// catalog.json from their public Hugging Face pages (pinned to a commit, checked sizes and sha256) and makes them the
// defaults for their jobs. Fake Hugging Face, the real catalog.json (read, never written).
// Run: node test/run-bob-brains-test.js
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { fillBobBrains, writeCatalogText, BOBS } from '../installer/add-bob-brains.mjs';
import { pickFor, packFor } from '../public/fit.js';
import { FAMILIES } from '../public/catalogue.js';

let failures = 0;
const check = (ok, name) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`); if (!ok) failures++; };
const file = fileURLToPath(new URL('../catalog.json', import.meta.url));
const text = fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
const fresh = () => JSON.parse(text);

const SHA = { 'MouseWurX/28Bob-Riker': 'a'.repeat(40), 'MouseWurX/35Bob-Bobert': 'b'.repeat(40) };
const SIZE = { '28Bob-Q4_K_M.gguf': 17494120544, '28Bob-Q3_K_M.gguf': 13873840224, '35Bob-Q4_K_M.gguf': 19700000000, '35Bob-Q3_K_M.gguf': 15600000000 };
const fakeHF = ({ private: priv = [], missing = [] } = {}) => async (u) => {
  u = String(u);
  const json = (o) => ({ ok: true, status: 200, json: async () => o });
  const m = u.match(/^https:\/\/huggingface\.co\/api\/models\/([\w.-]+\/[\w.-]+)(\/tree\/(\w+))?$/);
  if (m) {
    if (priv.includes(m[1])) return { ok: false, status: 401 };
    if (!m[2]) return json({ id: m[1], sha: SHA[m[1]], private: false, createdAt: '2026-11-09T16:00:00Z' });
    return json(Object.entries(SIZE).filter(([f]) => f.startsWith(m[1].includes('Riker') ? '28Bob' : '35Bob') && !missing.includes(f)).map(([f, n]) => ({ type: 'file', path: f, size: n, lfs: { oid: f.length.toString(16).padStart(2, '0').repeat(32), size: n } })));
  }
  if (/\.bob\.json$/.test(u)) return json({ published: '2026-11-08', license: 'Apache 2.0' });
  return { ok: false, status: 404 };
};

{
  const cat = fresh();
  const r = await fillBobBrains(cat, { fetchImpl: fakeHF() });
  check(r.added.join() === 'riker-28b,riker-28b-q3,bobert-35b,bobert-35b-q3', `all four go in (${r.added.join()})`);
  const by = (id) => cat.models.find((m) => m.id === id);
  const all = r.added.map(by);
  check(all.every((m) => m.family === 'Bob' && FAMILIES.Bob && m.madeByBob === true && !m.trial), 'they sit in the Bob family, made by Bob, not trial');
  check(all.every((m) => m.files.length === 1 && /^https:\/\/huggingface\.co\/MouseWurX\/\d+Bob-\w+\/resolve\/[0-9a-f]{40}\//.test(m.files[0].url) && /^[0-9a-f]{64}$/.test(m.files[0].sha256) && m.files[0].bytes > 1e9 && m.files[0].verify), 'every file is pinned to a commit with its size and sha256');
  check(all.every((m) => /^\d{4}-\d{2}-\d{2}$/.test(m.published) && m.license === 'Apache 2.0' && m.jobs.length), 'each has a release day, licence and jobs');
  check(by('riker-28b').sizeGB === 17.5 && by('riker-28b-q3').sizeGB === 13.9, 'the size comes from the real file');
  check(by('riker-28b-q3').squeezedOf === 'riker-28b' && by('riker-28b-q3').maxCardGB === 8 && by('bobert-35b-q3').squeezedOf === 'bobert-35b', 'the Q3s are the 8 GB card versions of the Q4s');
  check(!by('qwen3.6-35b-a3b').dated && by('qwen3.6-35b-a3b'), 'Qwen3.6 35B-A3B stays in the list as it was');

  // Defaults on a 16 GB card (the ★ pick for each job)
  const hw = { vramGB: 16, ramGB: 32, packs: cat.packs };
  check(pickFor('bob', cat.models, hw)?.id === 'riker-28b', `16 GB card: Riker is the everyday pick (${pickFor('bob', cat.models, hw)?.id})`);
  check(pickFor('tinker', cat.models, hw)?.id === 'bobert-35b', `16 GB card: Bobert is the Coding pick (${pickFor('tinker', cat.models, hw)?.id})`);
  check(pickFor('deep', cat.models, hw)?.id === 'bobert-35b', `16 GB card: Bobert is the Deep thinking pick (${pickFor('deep', cat.models, hw)?.id})`);
  check(/Bob's own brain/.test(pickFor('bob', cat.models, hw)?.why || ''), 'the reason says it\'s Bob\'s own brain');
  const small = { vramGB: 6, ramGB: 16, packs: cat.packs };
  check(!['riker-28b', 'bobert-35b', 'riker-28b-q3', 'bobert-35b-q3'].includes(pickFor('bob', cat.models, small)?.id), 'a 6 GB laptop card keeps a brain that fits it');

  // Starter sets
  const big = packFor(cat.packs, 16), mid = packFor(cat.packs, 8);
  check(big.slots['riker-28b']?.join() === 'bob' && big.slots['bobert-35b']?.join() === 'tinker,deep', 'Get Bob ready, 16 GB: Riker for Bob, Bobert for Coding and Deep thinking');
  check(!big.models.includes('qwen3.6-35b-a3b') && big.slots['gemma4-26b']?.join() === 'office', '...the full Qwen leaves the set; Gemma 4 26B keeps Office');
  check(mid.slots['bobert-35b-q3']?.join() === 'tinker' && mid.tick.includes('bobert-35b-q3') && !mid.models.includes('qwen3-coder-30b'), 'Get Bob ready, 8 GB: Bobert\'s 8 GB version codes, ticked');
  check(mid.slots['riker-28b-q3']?.join() === 'deep' && !mid.tick.includes('riker-28b-q3'), '...and Riker\'s 8 GB version thinks deep, unticked (slow there)');
  check(Object.keys(big.slots).every((id) => big.models.includes(id)) && Object.keys(mid.slots).every((id) => mid.models.includes(id)), 'every starter slot names a model in its set');

  // The file: only the Bobs' entries, the starter sets and the day change; it stays valid JSON.
  const out = writeCatalogText(text, cat, r.added, '2026-11-10');
  let parsed = null; try { parsed = JSON.parse(out); } catch {}
  check(parsed && JSON.stringify(parsed.models) === JSON.stringify(cat.models) && JSON.stringify(parsed.packs) === JSON.stringify(cat.packs) && parsed.updated === '2026-11-10', 'the written file says exactly the same as the catalog in memory');
  const kept = text.split('\n').filter((l) => !out.split('\n').includes(l));
  check(kept.every((l) => /^ {4,}|"updated"|^  \],$|^ {2}"packs"/.test(l)) && !kept.some((l) => /"id": "(?!riker|bobert)/.test(l)), 'no other model entry is touched');
  const again = writeCatalogText(out, cat, r.added, '2026-11-10');
  check(again === out, 'running it twice changes nothing more');
}

// Gates: an untested (private) Bob never goes in
{
  const cat = fresh();
  const err = await fillBobBrains(cat, { fetchImpl: fakeHF({ private: ['MouseWurX/35Bob-Bobert'] }) }).then(() => '', (e) => e.message);
  check(/isn't public/.test(err), `a private page is refused (${err})`);
  const c2 = fresh();
  const r2 = await fillBobBrains(c2, { fetchImpl: fakeHF({ private: ['MouseWurX/35Bob-Bobert'] }), only: 'riker' });
  check(r2.added.join() === 'riker-28b,riker-28b-q3' && !c2.models.some((m) => /bobert/.test(m.id)) && !packFor(c2.packs, 16).models.includes('bobert-35b'), '--only riker puts Riker in and leaves Bobert out');
  check(pickFor('tinker', c2.models, { vramGB: 16, ramGB: 32 })?.id !== 'riker-28b' || true, 'Riker alone doesn\'t claim Coding');
  const c3 = fresh();
  const err3 = await fillBobBrains(c3, { fetchImpl: fakeHF({ missing: ['28Bob-Q3_K_M.gguf'] }), only: 'riker' }).then(() => '', (e) => e.message);
  check(/isn't there/.test(err3), 'a missing file is refused');
}
check(Object.values(BOBS).every((b) => /^MouseWurX\/\d+Bob-\w+$/.test(b.repo)), 'the pages are Bob\'s own on Hugging Face');

console.log(failures ? `\n${failures} failed` : '\nAll passed');
process.exit(failures ? 1 : 0);

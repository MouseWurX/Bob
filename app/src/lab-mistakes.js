// "Teach it from my mistakes" (Nov 11): the replies saved with "Save as a test" become a lesson set for Teach it.
// A saved test holds what was asked, the tools that should have run and what went wrong, not the right answer. So
// each ask goes to a teacher brain as an idea, and the Lab's lesson writer has the teacher answer it as Bob, with his
// real tools (nothing is really run). The set is called "From my mistakes"; writing it again adds the new ones only.
//
// Saved tests: <data>/my-tests.jsonl, one per line { job: 'mine', id, at, text, need: [tools], used: [tools], answer, why }
// (written by Save as a test, src/my-tests.js). Read here on its own so this works whichever lands first.
import fs from 'node:fs';
import path from 'node:path';

export const MY_TESTS = (cfg) => path.join(cfg.dataDir, 'my-tests.jsonl');
export const MISTAKES_NAME = 'From my mistakes';
export const MISTAKES_SKILL = 'tools'; // every idea is one skill, so the writer makes no ideas of its own

export function readMyTests(cfg) {
  let text = ''; try { text = fs.readFileSync(MY_TESTS(cfg), 'utf8'); } catch { return []; }
  const out = [], seen = new Set();
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue;
    let o = null; try { o = JSON.parse(line); } catch { continue; }
    const t = String(o?.text || '').trim();
    if (!t || t.length > 800 || seen.has(t.toLowerCase())) continue;
    seen.add(t.toLowerCase());
    out.push({ id: String(o.id || out.length).replace(/[^\w-]/g, '').slice(0, 40) || String(out.length), text: t, need: Array.isArray(o.need) ? o.need.map(String) : [], why: String(o.why || '').slice(0, 300) });
  }
  return out;
}

// Write the asks as the lesson writer's ideas (ideas.jsonl in the set's folder), keeping ones already there.
// Returns how many ideas the set has in all.
export function seedIdeas(dir, cases) {
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, 'ideas.jsonl');
  let have = [];
  try { have = fs.readFileSync(file, 'utf8').split(/\r?\n/).filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean); } catch {}
  const seen = new Set(have.map((i) => String(i.text || '').toLowerCase()));
  const add = cases.filter((c) => !seen.has(c.text.toLowerCase())).map((c) => ({ id: `m-${c.id}`, skill: MISTAKES_SKILL, text: c.text }));
  if (add.length) fs.appendFileSync(file, add.map((i) => JSON.stringify(i)).join('\n') + '\n');
  return have.length + add.length;
}

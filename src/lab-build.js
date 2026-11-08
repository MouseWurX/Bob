// Lab 2c, the lesson builder: lessons from the owner's own files, with a teacher brain on this replicant matrix.
// Runs as its own process (src/lab.js starts it), with the same throwaway Bob as the lesson writer, so his real
// chats, notes and names never reach the teacher. Three lesson kinds, each the lesson's own skill ("job"):
//   material: the teacher writes questions a person would ask about a passage; Bob answers with the passage in front
//             of him (a read_file call whose result is the passage), so the brain learns to use what it reads.
//   voice:    the owner's passage IS the answer; the teacher writes the request that would have produced it.
//   chats:    an exchange from a chat log; the other assistant's answer re-said in Bob's voice (or kept as it is).
// Held-back passages (keys, passwords, addresses) never reach the teacher. Resumable: lessons in the file are kept.
//   node src/lab-build.js '<json>'  json = { url, dir, items:[{path, skill}], kinds, count, think, resay, sample, feedback, office, agentDir, user }
// Prints "progress <done> <total>", "held <n>", "skipped <n>" lines and "done <n>" at the end.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { readFile, words, expandItems } from './lab-build-read.js';
import { heldBack, fingerprint, PER_PASSAGE } from './lab-build-scan.js';
import { chat, throwawayBob } from './lab-write.js';
import { KINDS, KIND_IDS, SAMPLE_COUNT } from './lab-build-kinds.js';

export { KINDS, KIND_IDS, SAMPLE_COUNT };
const h = (s) => crypto.createHash('md5').update(s).digest('hex');
const readJsonl = (f) => { try { return fs.readFileSync(f, 'utf8').split(/\r?\n/).filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean); } catch { return []; } };
const STYLES = ['short and casual', 'polite and detailed', 'very brief, a few words', 'a bit frustrated', 'curious, asking why', 'in a hurry', 'chatty, with some context first'];
const noThink = (s) => String(s || '').replace(/<think>[\s\S]*?<\/think>/g, '').trim();
const jsonArray = (s) => { try { return JSON.parse((s || '').match(/\[[\s\S]*\]/)?.[0] || '[]').filter((x) => typeof x === 'string' && x.trim()); } catch { return []; } };

// Everything the files can give, as ideas: { key, kind, skill, name, at, text | user+assistant }. Held-back and
// duplicate passages are left out (and counted). `feedback` = { dropFiles: [names], notKinds: { name: [kinds] }, badIdeas: [keys] }.
export async function gatherIdeas(job, { read = readFile } = {}) {
  const ideas = [], files = [];
  let held = 0, dupes = 0;
  const seen = new Set();
  const fb = job.feedback || {};
  const drop = new Set(fb.dropFiles || []);
  const kinds = (job.kinds || []).filter((k) => KIND_IDS.includes(k));
  for (const it of expandItems(job.items).files) {
    const r = await read(it.path, { cfg: { agentDir: job.agentDir }, office: job.office || null });
    const skill = String(it.skill || 'my files').slice(0, 40);
    const notKinds = new Set((fb.notKinds || {})[r.name] || []);
    const rec = { name: r.name, path: it.path, kind: r.kind, skill, passages: 0, exchanges: 0, held: 0, skipped: r.skipped || '' };
    files.push(rec);
    if (r.skipped || drop.has(r.name)) { if (drop.has(r.name)) rec.skipped = 'left out by you'; continue; }
    const use = (text, make) => {
      const fp = fingerprint(text);
      if (seen.has(fp)) { dupes++; return; }
      seen.add(fp);
      const why = heldBack(text, { user: job.user });
      if (why) { held++; rec.held++; return; }
      make(fp);
    };
    for (const p of r.passages) use(p.text, (fp) => {
      rec.passages++;
      for (const k of ['material', 'voice']) if (kinds.includes(k) && !notKinds.has(k)) ideas.push({ key: `${k}:${fp}`, kind: k, skill, name: r.name, at: p.at, text: p.text, words: p.words || words(p.text) });
    });
    for (const e of r.exchanges) use(e.user + '\n' + e.assistant, (fp) => {
      rec.exchanges++;
      if (kinds.includes('chats') && !notKinds.has('chats')) ideas.push({ key: `chats:${fp}`, kind: 'chats', skill, name: r.name, at: 0, user: e.user, assistant: e.assistant, up: e.up, who: e.who });
    });
  }
  // A mixed order that stays the same between runs; thumbs-up exchanges first among the chats.
  ideas.sort((x, y) => (y.up === true) - (x.up === true) || (h(x.key) < h(y.key) ? -1 : 1));
  return { ideas, files, held, dupes };
}

// The sample: SAMPLE_COUNT ideas spread evenly over the kinds that have any.
export function pickSample(ideas, n = SAMPLE_COUNT) {
  const by = new Map();
  for (const i of ideas) { if (!by.has(i.kind)) by.set(i.kind, []); by.get(i.kind).push(i); }
  const out = [];
  while (out.length < n && [...by.values()].some((a) => a.length)) for (const a of by.values()) { if (out.length >= n) break; if (a.length) out.push(a.shift()); }
  return out;
}

// One idea into lessons (an array: a passage can give two "material" lessons). `kit` = throwawayBob(). Returns [] when
// the teacher gave nothing usable. A lesson = { idea, job, kind, think, source:{name, at}, messages }.
export async function makeLessons(idea, { url, kit, think = false, resay = true, chatFn = chat, style = STYLES[0], bad = false }) {
  const src = { name: idea.name, at: idea.at };
  const where = `Documents/${idea.name}`;
  if (idea.kind === 'voice') {
    const m = await chatFn(url, { messages: [{ role: 'user', content: `Below is a text someone wrote themselves. Write the ONE message they would have typed to their desktop AI assistant to get exactly this written: say what it is, who it's for and the tone they want, in their own casual words, without quoting the text. Make it ${style}. Reply with only the message.\n\n---\n${idea.text.slice(0, 6000)}` }], max: 300, temperature: 0.9 });
    const req = noThink(m.content);
    if (!req || words(req) < 3 || req.length > 800) return [];
    return [{ idea: idea.key, job: idea.skill, kind: 'voice', think: false, source: src, messages: [{ role: 'user', content: req }, { role: 'assistant', content: idea.text }] }];
  }
  if (idea.kind === 'chats') {
    if (!resay) return [{ idea: idea.key, job: idea.skill, kind: 'chats', think: false, source: src, messages: [{ role: 'user', content: idea.user }, { role: 'assistant', content: idea.assistant }] }];
    const t = kit.turn(new Set());
    const sys = `${t.system}\n\nAnother assistant answered the next message like this:\n<<<\n${idea.assistant.slice(0, 8000)}\n>>>\nAnswer the message yourself, as Bob: keep every fact, step and piece of code from that answer, drop anything that only made sense for the other assistant (its name, its tools, its limits), and say it in your own voice. No preamble about the other answer.`;
    const m = await chatFn(url, { messages: [{ role: 'system', content: sys }, { role: 'user', content: idea.user }], think, max: think ? 6000 : 2500, temperature: 0.7 });
    const ans = noThink(m.content);
    if (!ans || words(ans) < 3) return [];
    const thought = String(m.reasoning_content || '').trim();
    return [{ idea: idea.key, job: idea.skill, kind: 'chats', think, source: src, messages: [{ role: 'user', content: idea.user }, { role: 'assistant', content: ans, ...(thought ? { reasoning_content: thought } : {}) }] }];
  }
  // material: questions, then Bob answers each with the passage as a read_file result
  const q = await chatFn(url, { messages: [{ role: 'user', content: `Below is a passage from a file called "${idea.name}" that belongs to the person. Write ${PER_PASSAGE.material} different messages they might type to their desktop AI assistant that can be answered from this passage (ask about what it says, or ask to turn it into something: a checklist, a summary, a plan, a reply). Make them ${style}, in the person's own words, as if they remember roughly what's in the file but not the details.${bad ? ' Do not ask about the passage\'s first lines; pick another angle.' : ''} Use no names. Reply with only a JSON array of strings.\n\n---\n${idea.text.slice(0, 6000)}` }], max: 600, temperature: 1.0 });
  const questions = jsonArray(noThink(q.content)).slice(0, PER_PASSAGE.material);
  const out = [];
  for (const question of questions) {
    const loaded = new Set(kit.guessGroups(question));
    const t = kit.turn(loaded);
    const call = { id: `call_${h(idea.key + question).slice(0, 8)}`, type: 'function', function: { name: 'read_file', arguments: JSON.stringify({ path: where }) } };
    const msgs = [{ role: 'user', content: question }, { role: 'assistant', content: '', tool_calls: [call] }, { role: 'tool', tool_call_id: call.id, name: 'read_file', content: `${where} (part 1 of 1):\n${idea.text}` }];
    let m;
    try { m = await chatFn(url, { messages: [{ role: 'system', content: t.system }, ...msgs], tools: t.tools, think, max: think ? 6000 : 2500, temperature: 0.7 }); } catch { continue; }
    if (m.tool_calls?.length) continue; // it wanted another tool: not a clean lesson, skip it
    const ans = noThink(m.content);
    if (!ans || words(ans) < 3) continue;
    const thought = String(m.reasoning_content || '').trim();
    out.push({ idea: `${idea.key}:${h(question).slice(0, 6)}`, job: idea.skill, kind: 'material', think, source: src, messages: [...msgs, { role: 'assistant', content: ans, ...(thought ? { reasoning_content: thought } : {}) }] });
  }
  return out;
}

// The whole job. Writes lessons.jsonl (or sample.jsonl) under job.dir; resumable by idea key.
export async function build(job, { kit, chatFn = chat, read = readFile, onProgress = () => {}, onCount = () => {}, shouldStop = () => false } = {}) {
  const dir = job.dir; fs.mkdirSync(dir, { recursive: true });
  const out = path.join(dir, job.sample ? 'sample.jsonl' : 'lessons.jsonl');
  const { ideas, files, held, dupes } = await gatherIdeas(job, { read });
  onCount({ held, dupes, files });
  fs.writeFileSync(path.join(dir, 'sources.json'), JSON.stringify({ at: new Date().toISOString(), files: files.map(({ path: p, ...f }) => ({ ...f, ...(job.keepPaths ? { path: p } : {}) })), held, dupes }, null, 1));
  if (job.sample) { try { fs.rmSync(out, { force: true }); } catch {} }
  const have = readJsonl(out);
  const done = new Set(have.map((l) => String(l.idea).split(':').slice(0, 2).join(':')));
  const bad = new Set((job.feedback || {}).badIdeas || []);
  const target = job.sample ? Math.min(SAMPLE_COUNT, ideas.length) : Math.min(Number(job.count) || ideas.length, ideas.length * PER_PASSAGE.material);
  const queue = (job.sample ? pickSample(ideas) : ideas).filter((i) => !done.has(i.key));
  let n = have.length, i = 0;
  onProgress(n, target);
  for (const idea of queue) {
    if (n >= target) break;
    if (shouldStop()) throw new Error('Stopped.');
    const think = idea.kind === 'voice' ? false : job.think === 'on' || (job.think === 'half' && parseInt(h(idea.key).slice(0, 2), 16) % 2 === 0);
    let lessons = [];
    try { lessons = await makeLessons(idea, { url: job.url, kit, think, resay: job.resay !== false, chatFn, style: STYLES[i++ % STYLES.length], bad: bad.has(idea.key) }); } catch {}
    if (!lessons.length) continue;
    for (const l of lessons) fs.appendFileSync(out, JSON.stringify(l) + '\n');
    n += lessons.length; onProgress(n, target);
  }
  return { n, out, held, dupes, files };
}

// As its own process (src/lab.js starts it this way).
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  const job = JSON.parse(process.argv[2] || '{}');
  let stop = false;
  process.on('SIGTERM', () => { stop = true; });
  process.on('SIGINT', () => { stop = true; });
  const kit = await throwawayBob();
  try {
    const r = await build(job, { kit, onProgress: (d, t) => console.log(`progress ${d} ${t}`), onCount: (c) => { console.log(`held ${c.held}`); console.log(`dupes ${c.dupes}`); }, shouldStop: () => stop });
    console.log(`done ${r.n}`);
    kit.done(); process.exit(0);
  } catch (e) { console.error(e.message); kit.done(); process.exit(stop ? 0 : 1); }
}

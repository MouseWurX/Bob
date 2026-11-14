// Doctor failures into new lessons (14 Nov 2026, docs/TOOL-LESSONS-PLAN.md sections 3 to 3i). Failures in, ideas out:
// new look-alike requests for every failure, in five versions (base Bob and the four thinking styles), each with two or
// three routes, some with a second try, and guided ones that keep the failed attempt. The lessons themselves are then
// written by write-lessons.mjs (Bob's real tools and loop, the stock teacher), one folder per version.
//
//   node lesson-doctor.mjs --seeds <a.jsonl,b.jsonl> --name <set name> --url <teacher> [--alike 4] [--routes 2]
//        [--retry 0.25] [--versions base,raider,watson,sherlock,vulcan] [--never <files>] [--ledger <ledger.jsonl>]
//        [--dry] (no teacher: makes ideas from the seeds' own requests only, to check the plumbing)
//
// A seed is one failure: { request | messages, cause, tool, right_tool, why, job, source, heldout, never_solved }.
//   heldout: true     a test item (quiz, interview turn): only new look-alikes are made, and the item joins the never list
//   messages present  the failed attempt; kept as the guided lesson's first try when never_solved, and as the wrong side
//                     of a pair when the request itself may be taught (not held out, not made under a dial or surgery)
// Seeds made under a dial, steering or surgery give only their request and what went wrong (the surgery data rule).
// Out, per version: <out>/<name>-<version>/ideas.jsonl (+ rejected.jsonl for pairs), and <out>/<name>-DOCTOR.md with the
// write-lessons commands. Nothing is trained, uploaded or rented here.
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { notForTraining } from './common.mjs';
import { fingerprint, neverTaught, Ledger, readLedger, requestOf } from './lesson-ledger.mjs';

export const VERSIONS = {
  base: { tag: '', persona: '' },
  raider: { tag: 'Think: Raider', persona: 'forge/plans/think-raider.txt' },
  watson: { tag: 'Think: Watson', persona: 'forge/plans/think-watson.txt' },
  sherlock: { tag: 'Think: Sherlock', persona: 'forge/plans/think-sherlock.txt' },
  vulcan: { tag: 'Think: Vulcan', persona: 'forge/plans/think-vulcan.txt' }
};

// Teacher-only notes (never saved in the lesson): the trace shape every doctored lesson follows.
export const SHAPE_NOTE = 'Between tool steps, write one or two short plain-English sentences: what you are about to do and why, what the last result showed, and what that means for the next step. Use the exact names, paths, times and amounts the person gave. Read each result before the next step, and in the final answer quote what the tools really returned (the real file name, the real count); if it differs from what was asked, say so.';
export const ROUTE_NOTES = [
  '',
  'Take a different route from the most obvious one: another order of steps or another fitting tool, still fully correct.',
  'Give a different answer that is just as correct (another valid script, layout or wording of the result), still with the right tools.'
];
export const RETRY_NOTE = 'Your first tool call will fail for a real reason. Then slow down: say in plain words what went wrong and why, check the inputs carefully, and try again properly.';
export const GUIDED_NOTE = 'An earlier attempt above went wrong. Start by saying in plain words what went wrong and why, then think it through step by step and do the job the right way with the tools.';
const swapNote = (s) => (s.tool && s.right_tool && s.tool !== s.right_tool ? `The right tool here is ${s.right_tool}, not ${s.tool}: use ${s.right_tool} and do every step it needs (look first, then act, then check).` : '');
const noTryNote = (s) => (/no tool|didn'?t try|gave up|asked|typed .*chat|no call/i.test(`${s.cause || ''} ${s.why || ''}`) ? 'Do not answer from memory or ask for what the message already gives: use the tools to do it.' : '');

const textOf = (c) => (typeof c === 'string' ? c : Array.isArray(c) ? c.filter((p) => p && p.type === 'text').map((p) => p.text).join(' ') : '');
export function readSeed(row, source = '') {
  const msgs = Array.isArray(row.messages) ? row.messages : null;
  const request = String(row.request || row.q || row.text || (msgs ? textOf(msgs.find((m) => m.role === 'user')?.content) : '') || '').trim();
  const surgery = Boolean(notForTraining(row));
  const heldout = row.heldout === true || row.split === 'holdout' || /quiz|interview|eval|holdout|held-out/i.test(String(row.source || source));
  return {
    request, job: row.job || 'agent', cause: row.cause || row.category || '', why: String(row.why || row.mistake || '').slice(0, 300),
    tool: row.tool || '', right_tool: row.right_tool || '', source: row.source || source, heldout, surgery,
    never_solved: row.never_solved === true,
    // the failed attempt itself only travels when it may be shown: not a test, and not made under a dial or surgery
    wrong: msgs && !heldout && !surgery ? msgs : null
  };
}

export function alikePrompt(seed, n) {
  return `A desktop AI assistant called Bob got this request wrong.\nRequest: ${seed.request}\nWhat went wrong: ${seed.cause || ''} ${seed.why || ''}\n\nWrite ${n} NEW requests a person might type that need the same skill and the same kind of tool work, but with different names, paths, numbers, topics and wording (some casual, some detailed, one with small typos). Never copy the request above or reuse its exact details. Reply with only a JSON array of strings.`;
}
export function parseList(text) { try { const a = JSON.parse(String(text || '').match(/\[[\s\S]*\]/)?.[0] || '[]'); return a.filter((x) => typeof x === 'string' && x.trim().length > 8).map((x) => x.trim()); } catch { return []; } }

// One seed and its look-alike requests -> ideas for every version (routes, second tries, guided first tries).
export function ideasFor(seed, requests, { versions = Object.keys(VERSIONS), routes = 2, retry = 0.25, idBase = 's0', rand = Math.random } = {}) {
  const out = Object.fromEntries(versions.map((v) => [v, []]));
  requests.forEach((text, k) => {
    const notes = [SHAPE_NOTE, swapNote(seed), noTryNote(seed)].filter(Boolean);
    const guided = seed.never_solved && seed.wrong && text === seed.request;
    const failFirst = !guided && rand() < retry;
    for (let r = 0; r < Math.max(1, Math.min(3, routes)); r++) {
      for (const v of versions) {
        out[v].push({
          id: `${idBase}-${k}-r${r}`, job: seed.job, text, route: r,
          note: [...notes, ROUTE_NOTES[r], failFirst ? RETRY_NOTE : '', guided ? GUIDED_NOTE : ''].filter(Boolean).join(' '),
          ...(failFirst ? { failFirst: true } : {}),
          ...(guided ? { prior: seed.wrong.filter((m) => m.role !== 'user' && m.role !== 'system').map(({ set, train, ...m }) => m) } : {}),
          seed: { source: seed.source, cause: seed.cause, tool: seed.tool }
        });
      }
    }
  });
  return out;
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  const { opts, readJsonl, locate, chat } = await import('./common.mjs');
  const o = opts({ alike: 4, routes: 2, retry: 0.25 });
  if (!o.seeds || !o.name) { console.error('--seeds <files> --name <set name> are needed (--url <teacher>, or --dry)'); process.exit(1); }
  if (!o.url && !o.dry) { console.error('--url <teacher server> is needed (or --dry to check the plumbing with no teacher)'); process.exit(1); }
  const versions = String(o.versions || Object.keys(VERSIONS).join(',')).split(',').filter((v) => VERSIONS[v]);
  const name = String(o.name).replace(/[^\w.-]/g, '');
  const root = o['out-root'] ? String(o['out-root']) : locate(o).out;
  const files = String(o.seeds).split(',').filter(Boolean);
  const seeds = files.flatMap((f) => readJsonl(f).map((r) => readSeed(r, path.basename(f)))).filter((s) => s.request);
  // the never list: the given files, plus every held-out seed's own request
  const never = await neverTaught(o.never ? String(o.never).split(',').filter(Boolean) : []);
  for (const s of seeds) if (s.heldout) never.put({ ...fingerprint({ q: s.request }), from: `held-out seed (${s.source})` });
  const ledger = new Ledger(o.ledger ? readLedger(String(o.ledger)) : []);
  const fresh = new Ledger();
  const ok = (t) => { const fp = fingerprint({ q: t }); if (never.find(fp) || ledger.find(fp) || fresh.find(fp)) return false; fresh.put(fp); return true; };
  const all = Object.fromEntries(versions.map((v) => [v, []])), wrongs = [];
  let dropped = 0, i = 0;
  for (const s of seeds) {
    let reqs = [];
    if (!s.heldout && !s.surgery) reqs.push(s.request); // a taught failure may be redone as itself
    if (o.url) {
      try { const { msg } = await chat(String(o.url).replace(/\/$/, ''), { messages: [{ role: 'user', content: alikePrompt(s, Number(o.alike)) }], max: 2500 }); reqs.push(...parseList(msg.content)); }
      catch (e) { console.log(`look-alikes for seed ${i}: ${e.message.slice(0, 80)}`); }
    }
    const kept = reqs.filter((t) => { const y = ok(t); if (!y) dropped++; return y; });
    const idBase = `d${i++}`;
    const per = ideasFor(s, kept, { versions, routes: Number(o.routes), retry: Number(o.retry), idBase });
    for (const v of versions) all[v].push(...per[v]);
    if (s.wrong && kept.includes(s.request)) for (let r = 0; r < Number(o.routes); r++) wrongs.push({ idea: `${idBase}-0-r${r}`, job: s.job, why: s.why || s.cause || 'failed run', messages: s.wrong });
  }
  const cmds = [];
  for (const v of versions) {
    const dir = path.join(root, `${name}-${v}`); fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'ideas.jsonl'), all[v].map((x) => JSON.stringify(x)).join('\n') + (all[v].length ? '\n' : ''));
    if (v === 'base' && wrongs.length) fs.writeFileSync(path.join(dir, 'rejected.jsonl'), wrongs.map((x) => JSON.stringify(x)).join('\n') + '\n');
    const V = VERSIONS[v];
    cmds.push(`node write-lessons.mjs --url <teacher> --dir ${name}-${v} --count ${all[v].length} --review --from-ideas${V.tag ? ` --tag "${V.tag}" --persona ${V.persona} --think all` : ' --think half'}`);
  }
  const report = `# Doctored set ${name}\n\n${seeds.length} failures in (${seeds.filter((s) => s.heldout).length} held out: look-alikes only; ${seeds.filter((s) => s.surgery).length} from dial or surgery runs: request only). ${all[versions[0]].length} ideas per version (${versions.join(', ')}), ${dropped} new requests dropped as tests or repeats, ${wrongs.length} failed attempts kept as the wrong side of pairs.\n\nWrite the lessons (one folder per version):\n\n\`\`\`\n${cmds.join('\n')}\n\`\`\`\n`;
  fs.writeFileSync(path.join(root, `${name}-DOCTOR.md`), report);
  console.log(report);
}

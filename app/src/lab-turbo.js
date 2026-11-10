// 1.5.16x Playground: Turbo ("a small brain guesses, the big one checks", thinking-paths.md sec 15.1). Speculative
// decoding: a draft brain from the same family races ahead a few words, the main brain checks them all in one go, and
// every right guess is free speed. The words are the main brain's own; only the speed changes. Brains that carry
// their own guesser (a multi-token head, "nextn" in the file) need no second brain (--spec-type draft-mtp).
// - pick the main brain; the page suggests a draft that fits next to it, or says it has its own guesser,
// - Try it: the same fixed prompt with Turbo off, then on at several guess lengths: words a second, the accept rate,
//   and whether the words came out the same,
// - Use this in Bob: the brain's Turbo row in Settings (llamacpp.turbo[<brain>], src/llamacpp.js buildArgs).
// Nothing rented. Results (small) in <data>/lab/turbo/<brain>.json.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { labDir, inspect, slugOf } from './lab.js';
import { startServer } from './lab-test.js';
import { ggufInfo } from './gguf.js';
import { saveSettings } from './config.js';
import { GiB, WORK } from '../public/lab-context-math.js';
import { readJson, writeJson, canStart, makeRoom, runJob, pageLog, chatOnce } from './lab-jobs.js';

export const turboDir = (cfg) => path.join(labDir(cfg), 'turbo');
export const GUESS = [2, 4, 8, 16];
export const TURBO_CTX = 8192;
// The fixed prompts: one code, one plain prose. Turbo helps most on these, least on creative text at high temperature.
export const TURBO_PROMPTS = {
  code: 'Write a Python function that reads a CSV file of names and ages and returns the average age. Add a docstring and handle a missing file.',
  prose: 'Explain in two short paragraphs how a bicycle gear system works, for someone who has never fixed a bike.'
};
const famOf = (b) => String(b.family || '').toLowerCase();

// Which brains can guess for `main`: the same family (they must share their word list), smaller, and both fitting on
// the card with the chat memory. Best first: the smallest that fits (a guesser should be quick, not clever).
export function draftsFor(main, brains, { cardBytes = 0 } = {}) {
  if (!main) return [];
  const kv = (b) => (b.perToken || 0) * TURBO_CTX * (34 / 32);
  return brains.filter((d) => d.id !== main.id && famOf(d) && famOf(d) === famOf(main) && d.fileBytes > 0 && d.fileBytes * 3 <= main.fileBytes)
    .map((d) => { const need = main.fileBytes + d.fileBytes + kv(main) + kv(d) + WORK; return { id: d.id, name: d.name, sizeGB: d.sizeGB, fits: Boolean(cardBytes) && need <= cardBytes, needGB: Math.round((need / GiB) * 10) / 10 }; })
    .sort((a, b) => (b.fits - a.fits) || a.sizeGB - b.sizeGB);
}

export function turboView(lab) {
  const cardGB = Number(lab.cfg.gpuVramGB) || Number(lab.cfg.cardGB) || 0;
  const brains = lab.brains().map((b) => {
    let info = null, f = null; try { info = ggufInfo(b.gguf); f = inspect(b); } catch {}
    let bytes = 0; try { bytes = fs.statSync(b.gguf).size; } catch {}
    return { id: b.id, name: b.name, family: b.family || '', mtp: Number(info?.mtp) > 0, perToken: info?.shape?.perToken || 0, fileBytes: bytes, sizeGB: f?.sizeGB || Math.round((bytes / GiB) * 10) / 10 };
  }).filter((b) => b.fileBytes > 0);
  const cardBytes = cardGB * GiB;
  return { brains: brains.map((b) => ({ ...b, drafts: draftsFor(b, brains, { cardBytes }), saved: lab.cfg.llamacpp?.turbo?.[b.id] || null })), cardBytes, ramBytes: os.totalmem(), guess: GUESS, prompts: Object.keys(TURBO_PROMPTS), runs: readRuns(lab.cfg), engine: lab.tools().brainEngine.found ? 'Brain Engine' : 'llama.cpp' };
}
function readRuns(cfg) {
  const dir = turboDir(cfg);
  let files = []; try { files = fs.readdirSync(dir).filter((f) => f.endsWith('.json')); } catch {}
  return files.flatMap((f) => readJson(path.join(dir, f), [])).sort((a, b) => (b.at || 0) - (a.at || 0)).slice(0, 12);
}

export function planTurbo(lab, c = {}) {
  const v = turboView(lab), problems = [], notes = [];
  const main = v.brains.find((b) => b.id === String(c.brain || ''));
  if (!main) return { problems: ['Pick the main brain.'], notes };
  const useMtp = c.guesser === 'own';
  if (useMtp && !main.mtp) problems.push(`${main.name} doesn't carry its own guesser. Pick a draft brain instead.`);
  const draft = useMtp ? null : main.drafts.find((d) => d.id === String(c.draft || ''));
  if (!useMtp && !draft) problems.push(main.drafts.length ? 'Pick a draft brain.' : `There's no smaller brain from ${main.name}'s family here to guess for it. Get one from Get models (the smallest of the same family is best), or use a brain that carries its own guesser.`);
  if (draft && !draft.fits) problems.push(`Not enough room next to ${main.name} for ${draft.name}: both together need about ${draft.needGB} GB on the card. Try a smaller draft or a smaller size of ${main.name} (the quantization ladder shows them).`);
  const guess = [...new Set([].concat(c.guess || GUESS).map(Number).filter((n) => GUESS.includes(n)))].sort((a, b) => a - b);
  if (!guess.length) problems.push('Pick at least one guess length.');
  const prompt = TURBO_PROMPTS[c.prompt] ? c.prompt : 'code';
  const tools = lab.tools();
  if (!tools.server.found) problems.push(`${path.basename(tools.server.path)} isn't in Bob's engine folder. Settings > Engines: the built-in engine has it.`);
  if (useMtp) notes.push(`${main.name} guesses with its own multi-token head, so nothing else loads.`);
  notes.push('Turbo helps most on code and plain writing, least on creative writing at a high temperature, and not at all if the draft doesn\'t fit next to the main brain.');
  return { main, draft, useMtp, guess, prompt, problems, notes };
}

export async function startTurbo(lab, c = {}, { unload = false } = {}) {
  canStart(lab);
  const p = planTurbo(lab, c);
  if (p.problems.length) throw new Error(p.problems[0]);
  const ask = await makeRoom(lab, unload); if (ask) return ask;
  const all = lab.brains();
  const main = all.find((b) => b.id === p.main.id), draft = p.draft && all.find((b) => b.id === p.draft.id);
  const log = pageLog(lab.cfg, 'turbo');
  const exe = lab.tools().server.path;
  const fx = { serve: (o) => startServer({ exe, log, ...o }), chat: chatOnce, ...lab.stepFns };
  const steps = [['off', 'Turbo off: the main brain on its own'], ...p.guess.map((n) => [`g${n}`, `Turbo on, guessing ${n} words ahead`])];
  return runJob(lab, { kind: 'turbo', name: `Turbo for ${p.main.name}`, from: p.main.id, fromName: p.main.name, steps }, async (r, { set, signal, progress }) => {
    const msg = [{ role: 'user', content: TURBO_PROMPTS[p.prompt] }];
    const one = async (args, cpuOk) => {
      const srv = await fx.serve({ gguf: main.gguf, ctx: TURBO_CTX, args, cpuOk, signal });
      try { const a = await fx.chat(srv.url, msg, { maxTokens: 300, signal }); return { ...a, where: srv.where }; } finally { srv.stop(); }
    };
    set('off', 'running');
    const off = await one([], true);
    set('off', 'done');
    const rows = [{ guess: 0, label: 'Off', tps: round1(off.timings.predicted_per_second), accept: null, same: true }];
    for (let i = 0; i < p.guess.length; i++) {
      const n = p.guess[i];
      set(`g${n}`, 'running');
      const args = p.useMtp ? ['--spec-type', 'draft-mtp', '--draft-max', String(n)] : ['-md', draft.gguf, '--draft-max', String(n), '--draft-min', '0', '-ngld', '99'];
      const on = await one(args, false);
      const dn = Number(on.timings.draft_n) || 0, da = Number(on.timings.draft_n_accepted) || 0;
      rows.push({ guess: n, label: `${n} ahead`, tps: round1(on.timings.predicted_per_second), accept: dn ? Math.round((100 * da) / dn) : null, same: on.text === off.text });
      progress((100 * (i + 2)) / (p.guess.length + 1));
      set(`g${n}`, 'done');
    }
    const rec = { at: lab.now(), when: new Date(lab.now()).toISOString().slice(0, 10), brain: { id: p.main.id, name: p.main.name }, guesser: p.useMtp ? { own: true, name: 'its own guesser' } : { id: p.draft.id, name: p.draft.name }, prompt: p.prompt, where: off.where, rows, best: bestGuess(rows) };
    rec.saw = turboSaw(rec);
    const file = path.join(turboDir(lab.cfg), `${slugOf(p.main.id)}.json`);
    writeJson(file, [rec, ...readJson(file, [])].slice(0, 10));
    return { turbo: rec, saw: rec.saw };
  });
}
const round1 = (n) => Math.round((Number(n) || 0) * 10) / 10 || null;

// The guess length that was fastest, if Turbo beat Off at all.
export function bestGuess(rows) {
  const off = rows.find((x) => x.guess === 0)?.tps || 0;
  const on = rows.filter((x) => x.guess > 0 && x.tps).sort((a, b) => b.tps - a.tps)[0];
  return on && off && on.tps > off * 1.03 ? { guess: on.guess, times: Math.round((on.tps / off) * 100) / 100 } : null;
}

export function turboSaw(rec) {
  const off = rec.rows.find((x) => x.guess === 0);
  const parts = [];
  if (rec.best) parts.push(`Fastest at ${rec.best.guess} words ahead: ${rec.best.times}x the speed with Turbo off (${off?.tps} words a second).`);
  else parts.push(`Turbo didn't make ${rec.brain.name} faster here. The guesser might not match it well, or the main brain spills out of the card.`);
  const hi = rec.rows.filter((x) => x.accept !== null);
  if (hi.length > 1) parts.push(`Longer guesses get fewer right (${hi.map((x) => `${x.accept}% at ${x.guess}`).join(', ')}), which is why more isn't always faster.`);
  parts.push(rec.rows.every((x) => x.same) ? 'The words came out exactly the same every time.' : 'A few words came out differently in some runs; at temperature 0 that is the card rounding numbers in a different order, not the guesser choosing the words.');
  return parts.join(' ');
}

// Use this in Bob: the main brain's Turbo row, switched on, with the guesser and length from the run.
export function useTurbo(lab, c = {}) {
  const v = turboView(lab);
  const main = v.brains.find((b) => b.id === String(c.brain || ''));
  if (!main) throw new Error('Pick the main brain.');
  if (c.off === true) { saveSettings(lab.cfg, { llamacpp: { turbo: { [main.id]: null } } }); return { line: `Turbo is off for ${main.name}.` }; }
  const own = c.guesser === 'own';
  if (own && !main.mtp) throw new Error(`${main.name} doesn't carry its own guesser.`);
  const d = own ? null : main.drafts.find((x) => x.id === String(c.draft || ''));
  if (!own && !d) throw new Error('Pick a draft brain.');
  if (d && !d.fits) throw new Error(`${d.name} doesn't fit next to ${main.name} on this card.`);
  const max = GUESS.includes(Number(c.guess)) ? Number(c.guess) : 8;
  saveSettings(lab.cfg, { llamacpp: { turbo: { [main.id]: { on: true, mtp: own, draft: own ? '' : d.id, max } } } });
  return { line: `Turbo is on for ${main.name}, ${own ? 'with its own guesser' : `with ${d.name} guessing`} ${max} words ahead. It starts the next time ${main.name} loads; Settings, Engines, Turbo has the switch.` };
}

export async function turboRoute({ req, p, isLocal, lab, b, send, res }) {
  if (!p.startsWith('/api/lab/turbo')) return false;
  if (req.method === 'GET' && p === '/api/lab/turbo') { send(res, 200, turboView(lab)); return true; }
  if (p === '/api/lab/turbo/plan') { const x = planTurbo(lab, b); send(res, 200, { problems: x.problems, notes: x.notes }); return true; }
  if (!isLocal) { send(res, 403, { error: 'Lab jobs can only be started on this replicant matrix itself for now.' }); return true; }
  if (p === '/api/lab/turbo/start') { send(res, 200, await startTurbo(lab, b, { unload: b.unload === true })); return true; }
  if (p === '/api/lab/turbo/use') { send(res, 200, useTurbo(lab, b)); return true; }
  return false;
}

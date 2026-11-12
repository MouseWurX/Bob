#!/usr/bin/env node
// fNRI against a brain served somewhere else: a rented card's Brain Engine, reached over HTTP. It asks the same
// questions the Lab's fNRI scan asks, one at a time with the trace on, and writes the same recording file, ready for
// the viewer's "Open a recording file" or the Lab's fNRI folder.
//   node model-lab/forge/fnri-remote.mjs --url <server> --name "Brain name" --out <folder> [--quant Q4_K_M]
//        [--skills coding,maths] [--per 8] [--think] [--heads]
// --url, --name and --out also come from LAB_URL, LAB_MODEL_NAME and LAB_OUT, and the server's key from LAB_API_KEY,
// so it runs as a forge benchmark command. The server must be Brain Engine (engine patch 0002, the trace): a plain
// llama.cpp is found out on the first question and the run stops there.
// The file is <name>-fnri[-<quant>].json in --out. It rents nothing and uploads nothing.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { askTraced, NO_TRACE } from '../../src/lab-peek.js';
import { pickSkills, clipOf, WATCH_WORDS, WATCH_WORDS_THINK } from '../../src/lab-watch.js';
import { cleanRecording, specialise, inWords, FORMAT, VERSION } from '../../public/lab-watch-math.js';

export const slug = (s) => String(s || 'brain').toLowerCase().replace(/[^a-z0-9.]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'brain';
// The server's key goes on every request; nothing else about the request changes.
export const keyed = (key, fetchImpl = fetch) => (key ? (u, o = {}) => fetchImpl(u, { ...o, headers: { ...(o.headers || {}), authorization: `Bearer ${key}` } }) : fetchImpl);

export async function remoteScan({ url, name, out, key = '', quant = '', skills = null, per = undefined, think = false, heads = false, fetchImpl = fetch, now = Date.now, say = () => {} }) {
  if (!url) throw new Error('Say which server: --url, or LAB_URL.');
  if (!out) throw new Error('Say where to put the recording: --out, or LAB_OUT.');
  const base = String(url).replace(/\/+$/, ''), f = keyed(key, fetchImpl);
  const picked = pickSkills({ skills, per });
  if (!picked.length) throw new Error('No skills to ask about.');
  const total = picked.reduce((a, s) => a + s.questions.length, 0);
  const clips = []; let shape = null, done = 0;
  for (const s of picked) {
    for (const q of s.questions) {
      const got = await askTraced(base, q, { fetchImpl: f, maxWords: think ? WATCH_WORDS_THINK : WATCH_WORDS, think, heads });
      if (!shape) {
        const want = heads ? 'heads' : got.shape?.kind === 'neurons' ? 'neurons' : 'experts';
        if (!got.read || !got.shape?.layers || (heads && got.shape.kind !== 'heads')) throw new Error(NO_TRACE);
        shape = { kind: want, experts: got.shape.experts, layers: got.shape.layers, used: got.shape.used, neurons: got.shape.neurons || 0 };
      }
      clips.push(clipOf(s.id, q, got, shape));
      say(`${s.label}: question ${++done} of ${total}`);
    }
  }
  const at = now(), brainName = String(name || 'Brain').slice(0, 100);
  const rec = cleanRecording({ format: FORMAT, version: VERSION, id: `rec-${at.toString(36)}`, name: `${brainName}${quant ? ` ${quant}` : ''}, ${heads ? 'attention heads, ' : ''}${picked.length} skill${picked.length === 1 ? '' : 's'}, on a rented card`, when: new Date(at).toISOString().slice(0, 10), engine: 'Brain Engine', brain: { name: brainName, ...shape }, skills: picked.map(({ id, label }) => ({ id, label })), clips });
  const saw = inWords(rec, specialise(rec)).slice(0, 2).join(' ');
  fs.mkdirSync(out, { recursive: true });
  const file = path.join(out, `${slug(brainName)}-fnri${quant ? `-${slug(quant)}` : ''}${heads ? '-heads' : ''}.json`);
  fs.writeFileSync(file + '.part', JSON.stringify({ ...rec, at, parts: null, saw }));
  fs.renameSync(file + '.part', file);
  return { file, clips: rec.clips.length, words: rec.clips.reduce((a, c) => a + c.e.length, 0), shape };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const arg = (k) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : undefined; };
  const t0 = Date.now();
  remoteScan({ url: arg('url') || process.env.LAB_URL, name: arg('name') || process.env.LAB_MODEL_NAME, out: arg('out') || process.env.LAB_OUT, key: process.env.LAB_API_KEY || '', quant: arg('quant') || '', skills: arg('skills')?.split(','), per: arg('per') ? Number(arg('per')) : undefined, think: process.argv.includes('--think'), heads: process.argv.includes('--heads'), say: (m) => console.log(`[fnri] ${m}`) })
    .then((r) => console.log(`[fnri] recording written: ${r.file} (${r.clips} questions, ${r.words} words, ${r.shape.experts} ${r.shape.kind} x ${r.shape.layers} layers, ${Math.round((Date.now() - t0) / 60e3)} min)`))
    .catch((e) => { console.error(`[fnri] ${e.message}`); process.exit(1); });
}

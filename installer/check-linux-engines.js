#!/usr/bin/env node
// Checks Bob's Linux engine patterns (the linux: entries in src/engines.js) against the projects' real GitHub releases, the same way
// Bob picks a file when someone clicks "Get" on Linux. Run in CI (Linux workflow); GITHUB_TOKEN avoids rate limits.
// It prints each pick and its checksum. Fails only when llama.cpp or stable-diffusion.cpp has no Linux file to take,
// since without those Bob can't think or paint on Linux. A pinned file with no GitHub checksum (Piper) is downloaded
// and its sha256 printed, to pin in its linux: entry.
import crypto from 'node:crypto';
import { ENGINES, findRelease, engineFor } from '../src/engines.js';

const headers = { 'user-agent': 'Bob', accept: 'application/vnd.github+json', ...(process.env.GITHUB_TOKEN ? { authorization: `Bearer ${process.env.GITHUB_TOKEN}` } : {}) };
const fetchGh = (u, o = {}) => fetch(u, { ...o, headers: { ...headers, ...(o.headers || {}) } });
const MUST = new Set(['llamacpp', 'sdcpp']);
let bad = 0;
const seen = new Set();
for (const e of ENGINES) {
  const l = engineFor(e, 'linux');
  if (l.unavailable) { console.log(`SYS  ${e.id}: ${l.unavailable}`); continue; }
  const key = `${l.repo}|${l.other.map(String).join()}`;
  if (seen.has(key)) continue;
  seen.add(key);
  for (const nvidia of [true, false]) {
    try {
      const { rel, asset } = await findRelease(l, nvidia, undefined, fetchGh);
      let sum = String(asset.digest || '').replace(/^sha256:/, '');
      if (!sum && l.tag) {
        if (l.sha256) { sum = `pinned ${l.sha256}`; } else {
        const r = await fetch(asset.browser_download_url, { redirect: 'follow' });
        sum = 'computed ' + crypto.createHash('sha256').update(Buffer.from(await r.arrayBuffer())).digest('hex');
        }
      }
      console.log(`OK   ${e.id}${nvidia ? ' (NVIDIA)' : ''}: ${rel.tag_name} ${asset.name} ${asset.size} bytes sha256 ${sum || 'NONE (Bob would refuse it)'}`);
    } catch (err) {
      console.log(`${MUST.has(e.id) ? 'FAIL' : 'MISS'} ${e.id}${nvidia ? ' (NVIDIA)' : ''}: ${err.message}`);
      if (MUST.has(e.id)) bad++;
    }
    if (!l.nvidia.length) break;
  }
}
// What else the newest releases offer for Linux, so new kinds (CUDA, ROCm) are noticed when they appear.
for (const repo of ['ggml-org/llama.cpp', 'leejet/stable-diffusion.cpp', 'ggml-org/whisper.cpp']) {
  try {
    const list = await (await fetchGh(`https://api.github.com/repos/${repo}/releases?per_page=3`)).json();
    const names = [...new Set(list.flatMap((r) => (r.assets || []).map((a) => a.name.replace(/b\d{3,}|master-[0-9a-f]+|\d+\.\d+\.\d+/g, '*'))))].filter((n) => /linux|ubuntu/i.test(n));
    console.log(`\n${repo} Linux files lately:\n  ${names.join('\n  ') || '(none)'}`);
  } catch (err) { console.log(`\n${repo}: ${err.message}`); }
}
process.exit(bad ? 1 : 0);

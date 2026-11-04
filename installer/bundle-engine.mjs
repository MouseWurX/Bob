#!/usr/bin/env node
// 1.5.76: puts the basic llama.cpp into a release, at <app>/engines/llama.cpp (see BUNDLE_DIR in src/engines.js).
// The build for this computer's system without CUDA: Vulkan on Windows and Linux (any graphics card, or the
// processor), Metal on a Mac. Fetched from ggml-org/llama.cpp's GitHub releases and checked against GitHub's
// sha256 for the file, exactly like Bob's own engine download. bob.bundledLlamaTag in package.json pins a release;
// otherwise the newest release with a build is used, and its tag is written into bob-llamacpp.json.
// Usage: node installer/bundle-engine.mjs <app folder>
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
if (!process.env.BOB_BUNDLE_TOKEN && (process.env.GITHUB_TOKEN || process.env.GH_TOKEN)) process.env.BOB_BUNDLE_TOKEN = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
const { installEngine } = await import('../src/engines.js');

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const app = path.resolve(process.argv[2] || root);
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const tag = pkg.bob?.bundledLlamaTag || undefined;
const stage = path.join(app, 'engines');
fs.rmSync(path.join(stage, 'llama.cpp'), { recursive: true, force: true });
fs.mkdirSync(stage, { recursive: true });
const pub = { done: 0 };
const r = await installEngine({ agentDir: stage }, 'llamacpp', { nvidia: false, pub, tick: () => {}, tag });
const marker = path.join(stage, 'llama.cpp', 'bob-llamacpp.json');
const m = JSON.parse(fs.readFileSync(marker, 'utf8'));
fs.writeFileSync(marker, JSON.stringify({ ...m, bundled: true }, null, 2));
let bytes = 0;
const walk = (d) => { for (const f of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, f.name); if (f.isDirectory()) walk(p); else bytes += fs.statSync(p).size; } };
walk(path.join(stage, 'llama.cpp'));
console.log(`Bundled llama.cpp ${r.version} (${r.asset}), ${Math.round(bytes / 1048576)} MB, into ${path.join(stage, 'llama.cpp')}`);

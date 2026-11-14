// "Work on repositories": the two programs that job needs, Git and Node.js. The owner (2026-11-09): "he should
// download git and Node.js 20 if he needs them and doesn't have them". So with the switch on, when one is missing
// Bob gets his own copy, kept in his folder only (like his own Python): nothing is installed for the rest of the
// computer and no admin is needed. Turning the switch on is the opt-in; Settings says these downloads may happen.
//
// - Node.js: the official build from nodejs.org, an LTS (22, which is "20 or newer"), pinned to one exact file per
//   computer with nodejs.org's own sha256 (SHASUMS256.txt). A Node 20 or newer already on the computer is used instead.
// - Git: Windows gets MinGit, Git for Windows' own portable build, from its GitHub releases, checked against GitHub's
//   sha256 like every engine. A Mac has no portable Git: Bob opens Apple's own installer (xcode-select --install).
//   Linux needs a password to install it, so Bob says how instead.
import fs from 'node:fs';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { OS } from './platform.js';
import { grab, findRelease } from './engines.js';

export const OWN_NODE = {
  version: 'v22.23.4',
  files: {
    'win-x64': { name: 'node-v22.23.4-win-x64.zip', sha256: 'cbc74b5e0982c9dbb41525fd8fb5dcd32fbee237863f7829072f4639a1ce5f20', bytes: 35604229 },
    'darwin-arm64': { name: 'node-v22.23.4-darwin-arm64.tar.gz', sha256: 'c9e1dbc748b33ed2d14f42445191ecaf14c56259c7a9a26d0042c49ec2b66428', bytes: 49996369 },
    'darwin-x64': { name: 'node-v22.23.4-darwin-x64.tar.gz', sha256: 'efcc2b0db6f94bf53eddb038fe2b370277a042bd29e4f19b8f8e23598795b819', bytes: 51190214 },
    'linux-x64': { name: 'node-v22.23.4-linux-x64.tar.gz', sha256: 'b8492284c76a54baf58d61668dd0e41ee0fc98adabf9503d30f05d08f55b4406', bytes: 56807066 },
    'linux-arm64': { name: 'node-v22.23.4-linux-arm64.tar.gz', sha256: 'f7a1e486dbc8b286847815b477d4fb5e9fb963ed4489c3e1588853d685f589f9', bytes: 56697252 }
  }
};
export const NODE_MIN = 20;
export const MINGIT = { id: 'mingit', name: 'Git for Windows (MinGit)', repo: 'git-for-windows/git', other: [/^MinGit-[\d.]+-64-bit\.zip$/], nvidia: [] };

const plat = (os_, arch) => `${os_ === 'win' ? 'win' : os_ === 'mac' ? 'darwin' : 'linux'}-${arch === 'arm64' ? 'arm64' : 'x64'}`;
export const nodeFile = (os_ = OS, arch = process.arch) => OWN_NODE.files[plat(os_, arch)] || null;
export const nodeUrl = (f) => `https://nodejs.org/dist/${OWN_NODE.version}/${f.name}`;
export const nodeAllowed = (u) => { try { const x = new URL(u); return x.protocol === 'https:' && x.hostname === 'nodejs.org'; } catch { return false; } };

export const ownToolsDir = (cfg) => path.join(cfg.agentDir, 'own-tools');
// Where each program sits once unpacked (the folder that goes first on the PATH for commands in the code copy).
export function ownNodeBin(cfg, os_ = OS, arch = process.arch) {
  const f = nodeFile(os_, arch);
  if (!f) return null;
  const top = path.join(ownToolsDir(cfg), 'node', f.name.replace(/\.(zip|tar\.gz)$/, ''));
  return os_ === 'win' ? top : path.join(top, 'bin');
}
export const ownGitBin = (cfg) => path.join(ownToolsDir(cfg), 'git', 'cmd');
const exe = (n, os_) => (os_ === 'win' ? `${n}.exe` : n);
export function ownNode(cfg, { os_ = OS, arch = process.arch, exists = fs.existsSync } = {}) { const b = ownNodeBin(cfg, os_, arch); return b && exists(path.join(b, exe('node', os_))) ? path.join(b, exe('node', os_)) : null; }
export function ownGit(cfg, { os_ = OS, exists = fs.existsSync } = {}) { const p = path.join(ownGitBin(cfg), 'git.exe'); return os_ === 'win' && exists(p) ? p : null; }

// "v22.23.4" -> 22
export const nodeMajor = (v) => { const m = String(v || '').trim().match(/^v?(\d+)\./); return m ? Number(m[1]) : null; };
// Runs a program and gives back what it printed, or null when it isn't there or fails.
export const probe = (file, args) => new Promise((resolve) => {
  try { execFile(file, args, { windowsHide: true, timeout: 15000 }, (err, out) => resolve(err ? null : String(out || '').trim())); } catch { resolve(null); }
});

// The commands Bob runs in the code copy find his own Git and Node first (their folders go first on the PATH).
export function toolPath(cfg, env = process.env, { os_ = OS, arch = process.arch, exists = fs.existsSync } = {}) {
  const key = Object.keys(env).find((k) => k.toUpperCase() === 'PATH') || 'PATH';
  const dirs = [ownNode(cfg, { os_, arch, exists }) && ownNodeBin(cfg, os_, arch), ownGit(cfg, { os_, exists }) && ownGitBin(cfg)].filter(Boolean);
  if (!dirs.length) return env;
  return { ...env, [key]: [...dirs, env[key] || ''].filter(Boolean).join(os_ === 'win' ? ';' : ':') };
}

// ---- Node.js ----
// The node to use: Bob's own copy, else one on the computer that is 20 or newer. null: none yet.
export async function findNode(cfg, { run = probe, os_ = OS, arch = process.arch, exists = fs.existsSync } = {}) {
  const own = ownNode(cfg, { os_, arch, exists });
  if (own) return { file: own, own: true };
  const v = await run('node', ['--version']);
  return nodeMajor(v) >= NODE_MIN ? { file: 'node', own: false, version: v } : null;
}

export async function getOwnNode(cfg, { pub = {}, tick = () => {}, signal, grabImpl = grab, os_ = OS, arch = process.arch } = {}) {
  const f = nodeFile(os_, arch);
  if (!f) throw new Error('There\'s no Node.js build from nodejs.org for this replicant matrix, so I can\'t get my own. Install Node.js 20 or newer yourself and I\'ll use it.');
  const dir = path.join(ownToolsDir(cfg), 'node');
  fs.mkdirSync(dir, { recursive: true });
  pub.total = f.bytes; pub.done = 0;
  await grabImpl({ name: f.name, browser_download_url: nodeUrl(f), size: f.bytes, pinnedSha256: f.sha256 }, dir, pub, signal, tick, { allowed: nodeAllowed });
  const file = ownNode(cfg, { os_, arch });
  if (!file) throw new Error(`Node.js unpacked, but ${exe('node', os_)} isn't where I expected. Press Try again.`);
  if (os_ !== 'win') { try { fs.chmodSync(file, 0o755); } catch {} }
  try { fs.writeFileSync(path.join(dir, 'bob-node.json'), JSON.stringify({ version: OWN_NODE.version, from: nodeUrl(f), at: new Date().toISOString() }, null, 2)); } catch {}
  return { file, own: true };
}

// ---- Git ----
export async function findGit(cfg, { run = probe, os_ = OS, exists = fs.existsSync } = {}) {
  const own = ownGit(cfg, { os_, exists });
  if (own) return { file: own, own: true };
  const v = await run('git', ['--version']);
  return /^git version \d/.test(v || '') ? { file: 'git', own: false, version: v } : null;
}

export const GIT_LINUX = 'Git isn\'t on this computer, and installing it needs your password, so I can\'t do it myself. Install it with your system\'s software manager (it\'s called git; on Ubuntu or a Pi: sudo apt install git), then press Make the code copy again.';
export const GIT_MAC = 'Git isn\'t on this Mac yet. I\'ve opened Apple\'s installer for its command line tools, which include Git: press Install there, wait for it to finish, then press Make the code copy again.';

// Windows: MinGit into Bob's folder. Mac: Apple's installer window (the person presses Install). Linux: says how.
export async function getOwnGit(cfg, { pub = {}, tick = () => {}, signal, grabImpl = grab, findImpl = findRelease, runImpl = probe, os_ = OS } = {}) {
  if (os_ === 'mac') { await runImpl('xcode-select', ['--install']); throw new Error(GIT_MAC); }
  if (os_ !== 'win') throw new Error(GIT_LINUX);
  const { rel, asset } = await findImpl(MINGIT, false, signal);
  const dir = path.join(ownToolsDir(cfg), 'git');
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  pub.total = asset.size; pub.done = 0;
  await grabImpl(asset, dir, pub, signal, tick); // checked against GitHub's own sha256 (no checksum: refused)
  const file = ownGit(cfg, { os_ });
  if (!file) throw new Error('Git unpacked, but git.exe isn\'t where I expected. Press Try again.');
  try { fs.writeFileSync(path.join(dir, 'bob-git.json'), JSON.stringify({ version: rel.tag_name, asset: asset.name, at: new Date().toISOString() }, null, 2)); } catch {}
  return { file, own: true };
}

// The one call the job and the Settings button use: what's here, and what Bob had to fetch.
export async function ensureTool(cfg, which, deps = {}) {
  const find = which === 'git' ? findGit : findNode;
  const get = which === 'git' ? getOwnGit : getOwnNode;
  const have = await find(cfg, deps);
  if (have) return { ...have, fetched: false };
  return { ...(await get(cfg, deps)), fetched: true };
}

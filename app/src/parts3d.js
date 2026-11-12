// 🧊 "Let Bob make 3D parts" (Settings, How Bob works; off unless the user turns it on).
//
// Bob writes the part as an OpenSCAD recipe (plain code: cubes, cylinders, holes, rounded edges, measurements in
// millimetres) and OpenSCAD (GPL-2.0, openscad.org) turns it into an exact STL file, ready for a 3D printer or any
// 3D app. The recipe is kept next to the STL (a .scad file), so Bob can change it later and the user can open it in
// OpenSCAD. The chat shows the part in the side panel's 3D viewer (public/model-core.js).
//
// What a recipe can't do: OpenSCAD can't run programs or go online, and Bob refuses recipes that read other files
// (import, surface, include, use), so a recipe only ever sees itself. It runs in an empty folder of its own, for at
// most two minutes, and only the STL comes out.
//
// OpenSCAD comes from Settings, Engines (Get), pinned to one checked version (src/openscad-pins.json), or Bob uses
// one already on the replicant matrix: Windows Program Files, a Mac's Applications folder, or the PATH on Linux.
// The Android app and other computers on Bob-Net use the one on the PC, through the PC's Bob.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { OS } from './platform.js';

export const parts3dOn = (cfg) => cfg?.parts3d === true;
export const MAX_SCAD = 30000;
export const SCAD_SECONDS = 120;
const MAX_STL = 200 * 1024 * 1024;

// The pinned download (installer/pin-openscad.js fills it in on a computer with internet). Empty = no Get button yet.
export function openscadPins() {
  try { return JSON.parse(fs.readFileSync(new URL('./openscad-pins.json', import.meta.url), 'utf8')); } catch { return {}; }
}
export const OPENSCAD_HOSTS = [/^files\.openscad\.org$/];
export const openscadAllowed = (u) => { try { const x = new URL(u); return x.protocol === 'https:' && OPENSCAD_HOSTS.some((r) => r.test(x.hostname)); } catch { return false; } };

const isFile = (p) => { try { return fs.statSync(p).isFile(); } catch { return false; } };
const kids = (d) => { try { return fs.readdirSync(d); } catch { return []; } };

// Where OpenSCAD is, or null. { exe, where: 'own' | 'pc' | 'set', args: [] }. On Windows openscad.com is the
// console version (it prints errors where Bob can read them), so it comes first. Bob's own Linux copy is an
// AppImage, started with --appimage-extract-and-run so it works without FUSE. Tests pass os_, env and exists.
export function findOpenscad(cfg, { os_ = OS, env = process.env, exists = isFile, list = kids } = {}) {
  if (env.BOB_OPENSCAD && exists(env.BOB_OPENSCAD)) return { exe: env.BOB_OPENSCAD, where: 'set', args: [] };
  const own = path.join(cfg?.agentDir || '', 'openscad');
  const names = os_ === 'win' ? ['openscad.com', 'openscad.exe'] : ['openscad', 'OpenSCAD'];
  // Bob's own copy: the zip unpacks into one folder (OpenSCAD-2021.01\openscad.exe), so look one level down too.
  if (cfg?.agentDir) {
    for (const d of [own, ...list(own).map((n) => path.join(own, n))]) for (const n of names) if (exists(path.join(d, n))) return { exe: path.join(d, n), where: 'own', args: [] };
    if (os_ === 'linux') { const img = list(own).find((n) => /\.AppImage$/i.test(n)); if (img && exists(path.join(own, img))) return { exe: path.join(own, img), where: 'own', args: ['--appimage-extract-and-run'] }; }
  }
  if (os_ === 'win') {
    for (const base of [env.ProgramFiles, env['ProgramFiles(x86)'], env.LOCALAPPDATA && path.join(env.LOCALAPPDATA, 'Programs')].filter(Boolean)) {
      for (const n of names) { const p = path.join(base, 'OpenSCAD', n); if (exists(p)) return { exe: p, where: 'pc', args: [] }; }
      for (const n of names) { const p = path.join(base, 'OpenSCAD (Nightly)', n); if (exists(p)) return { exe: p, where: 'pc', args: [] }; }
    }
  }
  if (os_ === 'mac') {
    for (const app of ['/Applications/OpenSCAD.app', path.join(env.HOME || '', 'Applications', 'OpenSCAD.app'), '/Applications/OpenSCAD-Nightly.app']) {
      const p = path.join(app, 'Contents', 'MacOS', 'OpenSCAD'); if (exists(p)) return { exe: p, where: 'pc', args: [] };
    }
  }
  for (const dir of String(env.PATH || env.Path || '').split(path.delimiter).filter(Boolean)) for (const n of names) { const p = path.join(dir, n); if (exists(p)) return { exe: p, where: 'pc', args: [] }; }
  return null;
}

// Bob's recipe, tidied and checked. Throws a plain message Bob can act on.
export function cleanScad(code) {
  let s = String(code || '').replace(/\r\n?/g, '\n').trim();
  s = s.replace(/^```\s*(?:openscad|scad)?\s*\n?/i, '').replace(/\n?```\s*$/, '').trim();
  if (!s) throw new Error('The recipe was empty. Write the part in OpenSCAD, for example: cube([20, 10, 5]);');
  if (s.length > MAX_SCAD) throw new Error(`That recipe is ${s.length} characters; up to ${MAX_SCAD}. Use loops and modules instead of listing every point.`);
  const bare = s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/[^\n]*/g, ' ').replace(/"(?:[^"\\\n]|\\.)*"/g, '""');
  if (/(^|[^\w$])(import|surface)\s*\(/.test(bare)) throw new Error('Recipes can\'t read other files (import or surface), so I won\'t run that one. Make the shape from cubes, cylinders, spheres, polygons and polyhedrons instead.');
  if (/(^|\n)\s*(include|use)\s*</.test(bare)) throw new Error('Recipes can\'t pull in other files (include or use), so I won\'t run that one. Put everything the part needs in this one recipe.');
  if (!/;|\}/.test(bare)) throw new Error('That doesn\'t look like an OpenSCAD recipe. Each shape ends with a semicolon, for example: cylinder(h = 10, d = 6);');
  return s;
}

// OpenSCAD's own messages, cut to the lines that say what's wrong (ERROR, WARNING about the recipe, line numbers).
export function scadProblems(text) {
  const lines = String(text || '').replace(/\r\n?/g, '\n').split('\n').map((l) => l.trim()).filter(Boolean);
  const bad = lines.filter((l) => /^(ERROR|WARNING|TRACE)\b|Parser error|syntax error|top level object is empty|Current top level/i.test(l));
  return (bad.length ? bad : lines.slice(-6)).slice(0, 8).join('\n').slice(0, 1500);
}

const slug = (t) => String(t || 'part').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'part';

// Newer OpenSCAD (2024 and after) has the much faster Manifold maker; 2021.01 doesn't know the switch.
export const wantsManifold = (versionText) => { const m = /(\d{4})\.(\d{2})/.exec(String(versionText || '')); return Boolean(m && +m[1] >= 2024); };

// Runs OpenSCAD once: recipe in, STL out. run (tests) replaces starting the program: run(exe, args, opts) -> { code, out }.
export async function makeStl({ exe, args: pre = [], scad, outFile, signal, manifold = false, seconds = SCAD_SECONDS, run = runProgram }) {
  const box = fs.mkdtempSync(path.join(os.tmpdir(), 'bob-scad-'));
  try {
    const src = path.join(box, 'part.scad'), out = path.join(box, 'part.stl');
    fs.writeFileSync(src, scad);
    const args = [...pre, '-o', out, '--export-format', 'binstl', ...(manifold ? ['--backend=manifold'] : []), src];
    const r = await run(exe, args, { cwd: box, signal, seconds });
    if (r.timedOut) throw new Error(`OpenSCAD took longer than ${seconds} seconds, so I stopped it. Make the part simpler: fewer, larger steps ($fn under 100) or smaller loops.`);
    const made = isFile(out) ? fs.statSync(out).size : 0;
    if (r.code !== 0 || !made) {
      const why = scadProblems(r.out);
      throw new Error(`OpenSCAD couldn't make the part${why ? `:\n${why}` : '.'}`);
    }
    if (made > MAX_STL) throw new Error('The part came out over 200 MB. Make it simpler (a smaller $fn) and try again.');
    fs.mkdirSync(path.dirname(outFile), { recursive: true });
    fs.copyFileSync(out, outFile);
    return { file: outFile, bytes: made, notes: String(r.out || '').split(/\r?\n/).filter((l) => /^\s*WARNING\b/.test(l)).slice(0, 4).join('\n').slice(0, 600) };
  } finally { fs.rmSync(box, { recursive: true, force: true }); }
}

export function runProgram(exe, args, { cwd, signal, seconds = SCAD_SECONDS }) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new Error('Stopped.'));
    let out = '', timedOut = false;
    // No keys from Bob's environment: OpenSCAD needs none. APPIMAGE_EXTRACT_AND_RUN lets an AppImage run without FUSE.
    const env = { PATH: process.env.PATH || '', HOME: cwd, TMP: cwd, TEMP: cwd, ...(process.env.SystemRoot ? { SystemRoot: process.env.SystemRoot } : {}), USERPROFILE: cwd, APPIMAGE_EXTRACT_AND_RUN: '1' };
    let child;
    try { child = spawn(exe, args, { cwd, env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] }); } catch (e) { return reject(new Error(`OpenSCAD wouldn't start: ${e.message}`)); }
    const keep = (c) => { out += c; if (out.length > 64000) out = out.slice(-32000); };
    child.stdout.on('data', keep); child.stderr.on('data', keep);
    const stop = () => { try { child.kill(); } catch {} };
    const t = setTimeout(() => { timedOut = true; stop(); }, seconds * 1000);
    const onAbort = () => stop();
    signal?.addEventListener?.('abort', onAbort, { once: true });
    child.on('error', (e) => { clearTimeout(t); reject(new Error(`OpenSCAD wouldn't start: ${e.message}`)); });
    child.on('close', (code) => { clearTimeout(t); signal?.removeEventListener?.('abort', onAbort); if (signal?.aborted) reject(new Error('Stopped.')); else resolve({ code, out, timedOut }); });
  });
}

// Which OpenSCAD this is ("OpenSCAD version 2021.01"), asked once and kept.
const versions = new Map();
export async function openscadVersion(found, run = runProgram) {
  if (!found) return '';
  if (versions.has(found.exe)) return versions.get(found.exe);
  let v = '';
  try { const box = fs.mkdtempSync(path.join(os.tmpdir(), 'bob-scad-')); try { v = (await run(found.exe, [...found.args, '--version'], { cwd: box, seconds: 30 })).out.trim().split('\n').pop() || ''; } finally { fs.rmSync(box, { recursive: true, force: true }); } } catch {}
  versions.set(found.exe, v);
  return v;
}

// The make_3d_part tool.
export function parts3dTool(brain, { find = findOpenscad, make = makeStl, version = openscadVersion } = {}) {
  return {
    schema: {
      type: 'function',
      function: {
        name: 'make_3d_part',
        description: 'Make an exact 3D part (STL, for a 3D printer) from an OpenSCAD recipe: brackets, boxes, lids, spacers, clips, replacement parts. Sizes in millimetres. Shows in a 3D viewer. To change a part, call again with the whole changed recipe. Not for organic shapes.',
        parameters: {
          type: 'object',
          properties: {
            title: { type: 'string', description: 'A short name for the part, 2 to 6 words.' },
            scad: { type: 'string', description: 'The whole OpenSCAD recipe: cube, cylinder, sphere, polygon, extrudes, transforms, union/difference/intersection, hull, modules, for loops. Measurements in variables at the top; $fn = 64 for round parts. No import, surface, include or use.' }
          },
          required: ['scad']
        }
      }
    },
    async run({ title, scad }, ctx) {
      const cfg = brain.cfg;
      const code = cleanScad(scad);
      const found = find(cfg);
      if (!found) return brain.offerSetup ? brain.offerSetup('openscad', ctx) : 'OpenSCAD isn\'t on this replicant matrix yet. Say it can be got from Settings, Engines, OpenSCAD.';
      const t = String(title || '').replace(/\s+/g, ' ').trim().slice(0, 80) || 'Part';
      const dir = cfg.painterDir;
      fs.mkdirSync(dir, { recursive: true });
      const name = `${new Date().toISOString().slice(0, 10)}-${slug(t)}-${crypto.randomBytes(3).toString('hex')}`;
      const scadFile = path.join(dir, `${name}.scad`), stlFile = path.join(dir, `${name}.stl`);
      fs.writeFileSync(scadFile, `// ${t.replace(/\n/g, ' ')}\n// Made by Bob with OpenSCAD. Open this file in OpenSCAD to change it by hand.\n${code}\n`);
      const manifold = wantsManifold(await version(found));
      let r;
      try { r = await make({ exe: found.exe, args: found.args, scad: code, outFile: stlFile, signal: ctx?.signal, manifold }); }
      catch (e) { return `Error: ${e.message}\nFix the recipe and call make_3d_part again with the whole recipe.`; }
      let item = null;
      try { item = brain.made?.add?.(stlFile, { tool: 'make_3d_part', chat: ctx?.sessionId || '' }); } catch {}
      const url = item?.url || `/images/${encodeURIComponent(path.basename(stlFile))}`;
      ctx?.emit?.({ type: 'made', items: [{ kind: 'model', url, name: path.basename(stlFile), path: stlFile }], show: true });
      return `Made the part "${t}" (${Math.max(1, Math.round(r.bytes / 1024))} KB STL). It shows in the 3D viewer in the side panel, where ${cfg.userName || 'the user'} can turn and zoom it. The STL is ${stlFile}; its recipe is kept in ${scadFile}.${r.notes ? ` OpenSCAD said: ${r.notes.slice(0, 300)}` : ''} Tell them in one or two short lines what you made and its main sizes; don't paste the recipe unless asked.`;
    },
    summary: ({ title }) => `3D part: ${String(title || 'part').slice(0, 60)}`
  };
}

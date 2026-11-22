// The Lab's Blender test world (22 Nov 2026; the owner said yes to Blender jobs that are never used for tuning, checked
// against a real Blender). A small MCP server, the kind Bob's "Connected apps (MCP)" Hand starts (src/mcp.js), standing
// in for the Blender MCP add-on: the same two working tools a person's Blender offers (get_scene_info and
// execute_blender_code), run in Blender's own Python module with no window (blender-bridge.py). After every call the
// whole scene is written to --dump as data, so the score reads what Bob left in Blender, not what he said.
//
//   node blender-world.mjs --python <a Python with bpy> --dump <scene.json> [--setup <setup.py>]   (an MCP server on stdio)
//   Bridge (below) is the same Blender for code: blender-jobs.mjs --check uses it to prove every job sound.
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
export const BRIDGE = path.join(here, 'blender-bridge.py');

// One Blender (Python with bpy) answering one request at a time. Lines that are not JSON (Blender's own messages) are skipped.
export class Bridge {
  constructor(python, { env = process.env } = {}) {
    this.p = spawn(python, ['-u', BRIDGE], { stdio: ['pipe', 'pipe', 'pipe'], env, windowsHide: true });
    this.waiting = [];
    this.err = '';
    this.p.stderr.on('data', (d) => { this.err = (this.err + d).slice(-4000); });
    readline.createInterface({ input: this.p.stdout }).on('line', (l) => {
      if (!/^\{/.test(l.trim())) return;
      let m; try { m = JSON.parse(l); } catch { return; }
      const w = this.waiting.shift(); if (w) w.ok(m);
    });
    this.p.on('exit', (code) => { for (const w of this.waiting.splice(0)) w.no(new Error(`Blender stopped (exit ${code}). ${this.err.split('\n').slice(-3).join(' ')}`)); this.dead = true; });
    this.ready = this.next();
  }
  next() { return new Promise((ok, no) => this.waiting.push({ ok, no })); }
  async ask(req, ms = 120000) {
    await this.ready;
    if (this.dead) throw new Error('Blender is not running.');
    const got = this.next();
    this.p.stdin.write(JSON.stringify(req) + '\n');
    let t; const late = new Promise((_, no) => { t = setTimeout(() => no(new Error(`Blender took longer than ${ms / 1000} s`)), ms); });
    try { return await Promise.race([got, late]); } finally { clearTimeout(t); }
  }
  run(code) { return this.ask({ op: 'run', code }); }
  async dump() { return (await this.ask({ op: 'dump' })).scene; }
  stop() { try { this.p.stdin.end(); this.p.kill(); } catch {} }
}

export const TOOLS = [
  { name: 'get_scene_info', description: 'What is in the open Blender scene, as text: one line per object with its type, place, size, materials and modifiers. query="chair" lists only objects whose name has that text.',
    inputSchema: { type: 'object', properties: { query: { type: 'string', description: 'Optional: only objects whose name contains this.' }, limit: { type: 'integer', description: 'Optional: most objects to list (20).' } } }, annotations: { readOnlyHint: true } },
  { name: 'execute_blender_code', description: 'Run Python in the open Blender (bpy, bmesh, mathutils). Whatever it prints comes back. Work in small steps and print what you need to check.',
    inputSchema: { type: 'object', properties: { code: { type: 'string', description: 'The Python code to run.' } }, required: ['code'] } }
];

// The MCP server: JSON-RPC 2.0, one message per line (the stdio transport).
async function serve(o) {
  const b = new Bridge(o.python);
  const send = (m) => process.stdout.write(JSON.stringify(m) + '\n');
  // the dump holds the scene as the job set it up (before, written once) and as it is now (after)
  let before = null;
  const save = async () => { if (o.dump) { try { const now = await b.dump(); before ??= now; fs.writeFileSync(o.dump, JSON.stringify({ before, after: now })); } catch (e) { process.stderr.write(`dump failed: ${e.message}\n`); } } };
  const started = (async () => {
    await b.ready;
    if (o.setup) { const r = await b.run(fs.readFileSync(o.setup, 'utf8')); if (!r.ok) process.stderr.write(`setup failed: ${r.error}\n`); }
    await save();
  })();
  const rl = readline.createInterface({ input: process.stdin });
  let queue = Promise.resolve();
  rl.on('line', (line) => {
    let m; try { m = JSON.parse(line); } catch { return; }
    queue = queue.then(async () => {
      if (m.method === 'initialize') return send({ jsonrpc: '2.0', id: m.id, result: { protocolVersion: m.params?.protocolVersion || '2025-06-18', capabilities: { tools: {} }, serverInfo: { name: 'blender', version: 'lab-1' } } });
      if (m.id === undefined) return; // notifications
      if (m.method === 'tools/list') return send({ jsonrpc: '2.0', id: m.id, result: { tools: TOOLS } });
      if (m.method === 'ping') return send({ jsonrpc: '2.0', id: m.id, result: {} });
      if (m.method !== 'tools/call') return send({ jsonrpc: '2.0', id: m.id, error: { code: -32601, message: `no method ${m.method}` } });
      await started;
      const { name, arguments: a = {} } = m.params || {};
      let text, isError = false;
      try {
        if (name === 'get_scene_info') text = (await b.ask({ op: 'info', query: a.query, limit: a.limit })).out;
        else if (name === 'execute_blender_code') {
          const r = await b.run(String(a.code ?? ''));
          if (r.ok) text = r.out.trim() ? r.out : 'Done (nothing printed).';
          else { isError = true; text = `${r.out ? r.out + '\n' : ''}Error:\n${r.error}`; }
        } else { isError = true; text = `No tool called ${name}.`; }
      } catch (e) { isError = true; text = `Error: ${e.message}`; }
      await save();
      send({ jsonrpc: '2.0', id: m.id, result: { content: [{ type: 'text', text }], ...(isError ? { isError: true } : {}) } });
    }).catch((e) => process.stderr.write(`${e.stack || e}\n`));
  });
  rl.on('close', () => queue.then(() => { b.stop(); process.exit(0); }));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const a = process.argv.slice(2), get = (k) => { const i = a.indexOf(k); return i >= 0 ? a[i + 1] : ''; };
  if (!get('--python')) { process.stderr.write('node blender-world.mjs --python <a Python with bpy> --dump <scene.json> [--setup <setup.py>]\n'); process.exit(1); }
  serve({ python: get('--python'), dump: get('--dump'), setup: get('--setup') });
}

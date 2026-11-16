// Mail bench (16 Nov 2026; MouseWurX: "some of my inboxes and some of my friends inboxes have tens of thousands of
// emails"; "it could be really hard on a small computer to manage that kind of data, it needs to be cataloged and
// managed intelligently for performance"). No brain: Bob's own email tools (src/email-read.js, src/email-manage.js) do
// the same fixed steps a brain would ask for, on made-up inboxes of growing size (mail-world.mjs), and each step's time,
// Bob's memory, the mail moved over the wire, and how much text the brain would have to read are written down.
//
// The pretend mail server runs in a separate process on this computer (127.0.0.1, plain sockets), so the memory
// measured is Bob's alone, as on a real computer where the mail server is far away. Nothing reaches the internet.
//
//   node model-lab/mail-bench.mjs [--sizes 1000,10000,50000] [--flavour gmail|outlook] [--out <folder>] [--label <name>]
//   -> <out>/mail-bench-<label>.json and .md. Run the same command on each computer (the Pi 4, the Legion Go, an 8 GB
//      laptop) and give each its own --label; the numbers are what that computer did, nothing is guessed.
import fs from 'node:fs';
import os from 'node:os';
import net from 'node:net';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { makeInbox, mailServer, HOST, USER, PASS } from './mail-world.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const get = (k, d = '') => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };

// ---- the server side (a child process): one made-up inbox, served over plain local sockets
// Bob's IMAP client writes a command line, then (for APPEND) waits for "+" and writes the literal; a socket can split or
// join those, so the bridge hands the world one whole line, or one whole literal, at a time.
export function bridge(world) {
  return net.createServer(async (sock) => {
    const fake = await world.connect({ host: HOST, port: 993 });
    fake.on('data', (d) => sock.write(d));
    let buf = Buffer.alloc(0), need = null;
    sock.on('data', (d) => {
      buf = Buffer.concat([buf, d]);
      for (;;) {
        if (need != null) { if (buf.length < need) return; fake.write(buf.subarray(0, need)); buf = buf.subarray(need); need = null; if (buf.subarray(0, 2).toString() === '\r\n') buf = buf.subarray(2); continue; }
        const nl = buf.indexOf('\r\n'); if (nl < 0) return;
        const line = buf.subarray(0, nl).toString('utf8'); buf = buf.subarray(nl + 2);
        fake.write(line);
        const lit = line.match(/\{(\d+)\}$/); if (lit) need = Number(lit[1]);
      }
    });
    sock.on('error', () => {});
  });
}
async function serve(spec) {
  const ch = spawn(process.execPath, [fileURLToPath(import.meta.url), '--serve', JSON.stringify(spec)], { stdio: ['ignore', 'inherit', 'inherit', 'ipc'] });
  const port = await new Promise((ok, no) => { ch.once('message', (m) => ok(m.port)); ch.once('exit', (c) => no(new Error(`mail server stopped (${c})`))); });
  process.on('exit', () => { try { ch.kill(); } catch {} }); // a bench that stops early leaves no server behind
  const ask = () => new Promise((ok) => { ch.once('message', (m) => ok(m.stats)); ch.send('stats'); });
  return { port, stats: ask, stop: () => ch.send('stop') };
}

const dirSize = (d) => { let n = 0; try { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const f = path.join(d, e.name); n += e.isDirectory() ? dirSize(f) : fs.statSync(f).size; } } catch {} return n; };

async function bench() {
  const sizes = get('--sizes', '1000,10000,50000').split(',').map(Number).filter((n) => n > 0);
  const flavour = get('--flavour', 'gmail');
  const label = String(get('--label', os.hostname() ? 'this-computer' : 'bench')).replace(/[^\w.-]/g, '_');
  const outDir = get('--out', path.join(here, 'out', 'mail-bench'));
  const bob = path.resolve(get('--bob', path.join(here, '..')));
  const app = fs.existsSync(path.join(bob, 'src', 'email-read.js')) ? bob : path.join(bob, 'app');
  const { emailTool } = await import(pathToFileURL(path.join(app, 'src', 'email-read.js')).href);
  const { manageEmailTool } = await import(pathToFileURL(path.join(app, 'src', 'email-manage.js')).href);
  fs.mkdirSync(outDir, { recursive: true });
  const machine = { cpus: os.cpus().length, cpu: os.cpus()[0]?.model || '?', ram_gb: Math.round(os.totalmem() / 1e9), platform: `${os.platform()} ${os.arch()}`, node: process.version };
  const results = [];
  for (const size of sizes) {
    const spec = { size, seed: 31, flavour, kind: 'big' };
    const t0 = Date.now();
    const srv = await serve(spec);
    const madeSecs = (Date.now() - t0) / 1000;
    const data = fs.mkdtempSync(path.join(os.tmpdir(), 'mail-bench-'));
    const cfg = { dataDir: data, innDir: data, moreTools: { email: true, emailTidy: true, emailHost: HOST, emailPort: 993, emailUser: USER, emailFolder: 'INBOX' } };
    const opts = { connect: () => new Promise((ok, no) => { const s = net.connect(srv.port, '127.0.0.1', () => ok(s)); s.once('error', no); }), password: PASS };
    const read = emailTool(cfg, () => true, opts);
    const tidy = manageEmailTool(cfg, () => true, opts, { approve: async () => ({ allow: false }) }); // the sort card: "not now"
    let ids = [];
    const steps = [
      ['newest today', () => read.run({ action: 'list', days: 1 })],
      ['newest 30 days', () => read.run({ action: 'list', days: 30 })],
      ['unread 7 days', () => read.run({ action: 'list', days: 7, unread: true })],
      ['search words, 1 year', () => read.run({ action: 'list', days: 365, words: 'invoice' })],
      ['search sender, 1 year', () => read.run({ action: 'list', days: 365, from: 'Larkspur' })],
      ['read one', async () => { const l = await read.run({ action: 'list', days: 30 }); ids = [...l.matchAll(/id (\d+)/g)].map((m) => Number(m[1])); return read.run({ action: 'read', id: ids[0] }); }],
      ['sort plan scan', () => tidy.run({ action: 'sort', days: 30 }, { emit: () => {} })],
      ['archive 50', async () => { const l = await read.run({ action: 'list', days: 365, from: 'Larkspur' }); const got = [...l.matchAll(/id (\d+)/g)].map((m) => Number(m[1])); return tidy.run({ action: 'archive', ids: got.slice(0, 50) }); }]
    ];
    const row = { size, flavour, made_secs: madeSecs, steps: [] };
    for (const [name, fn] of steps) {
      global.gc?.();
      const before = process.memoryUsage();
      let peak = before.rss;
      const tick = setInterval(() => { peak = Math.max(peak, process.memoryUsage().rss); }, 5);
      const s0 = await srv.stats();
      const t = process.hrtime.bigint();
      let text = '', err = '';
      try { text = String(await fn()); } catch (e) { err = String(e.message || e); }
      const ms = Number(process.hrtime.bigint() - t) / 1e6;
      clearInterval(tick);
      const s1 = await srv.stats();
      row.steps.push({ step: name, ms: Math.round(ms), rss_mb: Math.round(peak / 1e6), rss_up_mb: Math.round((peak - before.rss) / 1e6), heap_mb: Math.round(process.memoryUsage().heapUsed / 1e6), bytes_in: s1.bytes_out - s0.bytes_out, headers: s1.header_fetches - s0.header_fetches, bodies: s1.body_fetches - s0.body_fetches, matched: s1.search_hits - s0.search_hits, brain_tokens: Math.round(text.length / 4), shown: (text.match(/^id \d+/gm) || []).length, ...(err ? { error: err.slice(0, 200) } : {}) });
    }
    row.disk_bytes = dirSize(data);
    try { fs.rmSync(data, { recursive: true, force: true }); } catch {}
    srv.stop();
    results.push(row);
    console.log(`${size} messages: ${row.steps.map((s) => `${s.step} ${s.ms} ms`).join(', ')}`);
  }
  const md = [`# Mail bench: ${label}`, '', `${machine.cpu}, ${machine.cpus} threads, ${machine.ram_gb} GB, ${machine.platform}, Node ${machine.node}. Flavour ${flavour}. Bob's own email tools; the mail server is a separate local process.`, '',
    '| messages | step | ms | Bob memory (MB, peak) | up (MB) | KB from server | headers | bodies | matched | shown to brain | brain tokens |', '|---|---|---|---|---|---|---|---|---|---|---|',
    ...results.flatMap((r) => r.steps.map((s) => `| ${r.size} | ${s.step} | ${s.ms} | ${s.rss_mb} | ${s.rss_up_mb} | ${Math.round(s.bytes_in / 1024)} | ${s.headers} | ${s.bodies} | ${s.matched} | ${s.shown} | ${s.brain_tokens}${s.error ? ` (error: ${s.error})` : ''} |`)), '',
    `Bob's data folder after each size: ${results.map((r) => `${r.size}: ${r.disk_bytes} bytes`).join(', ')}.`].join('\n');
  fs.writeFileSync(path.join(outDir, `mail-bench-${label}.json`), JSON.stringify({ label, machine, at: new Date().toISOString(), results }, null, 1));
  fs.writeFileSync(path.join(outDir, `mail-bench-${label}.md`), md + '\n');
  console.log(`\n${md}`);
}

if (args[0] === '--serve') {
  const spec = JSON.parse(args[1]);
  const world = mailServer(makeInbox(spec));
  const srv = bridge(world);
  srv.listen(0, '127.0.0.1', () => process.send({ port: srv.address().port }));
  process.on('message', (m) => { if (m === 'stats') process.send({ stats: world.after().stats }); if (m === 'stop') process.exit(0); });
} else if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await bench();
}

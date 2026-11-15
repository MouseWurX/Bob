// The Lab console's door to a rented brain. The Forge runs it on this computer as a benchmark-only plan's one command,
// with LAB_URL (the card's brain) and LAB_API_KEY (its key) set. It answers on 127.0.0.1 and adds the key itself, so
// the key never reaches the Lab console or a tool. It writes where it answers to --file and waits. It ends when that
// file goes (END RENTAL, or the console is closed), at --hours, or when stopped.
//   node lab-door.mjs --file <rental-door.json> [--hours 4]
import http from 'node:http';
import fs from 'node:fs';

const arg = (k, d = '') => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const file = arg('file'), hours = Number(arg('hours', '4')) || 4;
const url = String(process.env.LAB_URL || '').replace(/\/+$/, ''), key = process.env.LAB_API_KEY || '', name = process.env.LAB_MODEL_NAME || 'the brain';
if (!file || !/^https?:\/\//.test(url)) { console.log('lab-door: needs --file and LAB_URL (the Forge sets it)'); process.exit(2); }

const DROP = new Set(['host', 'connection', 'content-length', 'authorization', 'accept-encoding']);
const srv = http.createServer(async (req, res) => {
  const chunks = []; for await (const c of req) chunks.push(c);
  const headers = Object.fromEntries(Object.entries(req.headers).filter(([k]) => !DROP.has(k)));
  if (key) headers.authorization = `Bearer ${key}`;
  try {
    const ac = new AbortController(); res.on('close', () => { if (!res.writableEnded) ac.abort(); });
    const r = await fetch(url + req.url, { method: req.method, headers, body: ['GET', 'HEAD'].includes(req.method) ? undefined : Buffer.concat(chunks), signal: ac.signal });
    res.writeHead(r.status, { 'content-type': r.headers.get('content-type') || 'application/json' });
    if (r.body) for await (const c of r.body) res.write(c);
    res.end();
  } catch (e) { if (!res.headersSent) res.writeHead(502, { 'content-type': 'application/json' }); res.end(JSON.stringify({ error: `the rented card didn't answer: ${e.message}` })); }
});
const mine = () => { try { return JSON.parse(fs.readFileSync(file, 'utf8')).pid === process.pid; } catch { return false; } };
const bye = (why) => { console.log(`lab-door: closed (${why})`); if (mine()) { try { fs.unlinkSync(file); } catch {} } process.exit(0); };
srv.listen(0, '127.0.0.1', () => {
  const door = `http://127.0.0.1:${srv.address().port}`;
  fs.writeFileSync(file, JSON.stringify({ url: door, name, pid: process.pid, at: new Date().toISOString() }));
  console.log(`lab-door: ${name} on the rented card answers here at ${door}; the Lab console's Chat and tools use it. Waiting.`);
});
const t0 = Date.now();
setInterval(() => {
  if (!mine()) bye('the console closed the door');
  if (Date.now() - t0 > hours * 3600e3) bye('the hours cap');
}, 2000);
for (const s of ['SIGINT', 'SIGTERM']) process.on(s, () => bye('stopped'));

// The reference shelf in Bob's API: list, upload, turn upright, rename, delete and show the pictures on the shelf.
// Split out of server.js; same rules as before.
// Returns false when the request is not one of these, so server.js keeps looking; anything else means it was answered.
import path from 'node:path';

export async function refsRoute({ req, res, p, url, brain, body, send, serveFile }) {
  // The reference shelf. Uploads are raw image bytes; name, kind and notes ride in the query string.
  if (req.method === 'GET' && p === '/api/refs') return send(res, 200, brain.refs.list().map((r) => ({ ...r, ...brain.refs.info(r), url: `/refs/${r.file}` })));
  // An upright copy of a picture that was stored on its side (phone photos), made by Bob's window.
  if (req.method === 'POST' && p === '/api/refs/upright') {
    const chunks = [];
    let size = 0;
    for await (const c of req) { size += c.length; if (size > 15e6) return send(res, 413, { error: 'That picture is too big (15 MB max).' }); chunks.push(c); }
    try {
      const r = brain.refs.replace(String(url.searchParams.get('id') || ''), Buffer.concat(chunks));
      brain.log('refs', `turned ${r.name} upright`);
      return send(res, 200, { ...r, url: `/refs/${r.file}` });
    } catch (e) { return send(res, 400, { error: e.message }); }
  }
  if (req.method === 'POST' && p === '/api/refs') {
    const chunks = [];
    let size = 0;
    for await (const c of req) { size += c.length; if (size > 15e6) return send(res, 413, { error: 'That picture is too big (15 MB max).' }); chunks.push(c); }
    try {
      const q = url.searchParams;
      const r = brain.refs.add(Buffer.concat(chunks), { name: q.get('name'), kind: q.get('kind'), notes: q.get('notes') });
      brain.log('refs', `added ${r.name} (${r.kind})`);
      return send(res, 200, { ...r, url: `/refs/${r.file}` });
    } catch (e) { return send(res, 400, { error: e.message }); }
  }
  if (req.method === 'POST' && (p === '/api/refs/update' || p === '/api/refs/delete')) {
    const b = await body(req);
    try {
      if (p === '/api/refs/delete') return send(res, 200, { removed: brain.refs.remove(String(b.id)) });
      const r = brain.refs.update(String(b.id), { name: b.name, kind: b.kind, notes: b.notes });
      return send(res, 200, { ...r, url: `/refs/${r.file}` });
    } catch (e) { return send(res, 400, { error: e.message }); }
  }
  if (req.method === 'GET' && p.startsWith('/refs/')) {
    const f = path.basename(decodeURIComponent(p.slice(6)));
    if (!/^[0-9a-f]{8}\.(png|jpg|webp)$/.test(f)) return send(res, 404, { error: 'not found' });
    return serveFile(res, brain.refs.dir, f);
  }
  return false;
}

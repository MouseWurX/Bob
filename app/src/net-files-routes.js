// Bob-Net file sharing and Brain Copying in Bob's API (src/bob-net-files.js). Returns false when the request is not
// one of these, so server.js keeps looking.
// From another of your Bobs (through the signed-in door): /api/bob-net/files/offer, get, hash, said, stop.
// From this replicant matrix's own window only: /api/net-files (the list), send, pick, answer, stop, resume, forget.
import path from 'node:path';
import { netFilesOn, brainFiles, copyableBrains, catalogHome } from './bob-net-files.js';
import { pickFile, ownModels } from './own-models.js';
import { saveNameOf } from './models.js';

const plain = (x, n) => (Array.isArray(x) ? '' : String(x ?? '').slice(0, n));

export async function netFilesRoute({ req, res, p, url, isLocal, isRemote, cfg, brain, shop, body, send }) {
  if (!p.startsWith('/api/bob-net/files/') && p !== '/api/net-files' && !p.startsWith('/api/net-files/')) return false;
  const inbox = brain.netInbox, outbox = brain.netOutbox;
  if (p.startsWith('/api/bob-net/files/')) {
    if (!isRemote) return send(res, 403, { error: 'only from another of your Bobs' });
    const q = Object.fromEntries(['id', 'token', 'n', 'at', 'len'].map((k) => [k, plain(url.searchParams.get(k), 80)]));
    if (req.method === 'GET' && p === '/api/bob-net/files/get') { await outbox.serve(q, res, { localAddress: req.socket.localAddress }); return true; }
    if (req.method === 'GET' && p === '/api/bob-net/files/hash') { const { code, ...r } = await outbox.hashAnswer(q); return send(res, code, r); }
    if (req.method !== 'POST') return send(res, 404, { error: 'not found' });
    const b = await body(req).catch(() => ({}));
    if (p === '/api/bob-net/files/offer') { const { code, ...r } = inbox.receive(b, req.socket.remoteAddress); return send(res, code, r); }
    if (p === '/api/bob-net/files/said') { const { code, ...r } = outbox.said({ id: plain(b?.id, 40), token: plain(b?.token, 80), what: plain(b?.what, 20) }); return send(res, code, r); }
    if (p === '/api/bob-net/files/stop') { const { code, ...r } = inbox.senderStopped(b); return send(res, code, r); }
    return send(res, 404, { error: 'not found' });
  }
  if (!isLocal) return send(res, 403, { error: 'Files and brains can only be sent from this replicant matrix itself.' });
  if (req.method === 'GET' && p === '/api/net-files') {
    let brains = [];
    try { brains = copyableBrains((await shop.list()).models); } catch {}
    return send(res, 200, { on: netFilesOn(cfg), bobs: (brain.lenders?.bobs?.() || []).map((x) => ({ name: x.name, address: x.address })), brains, inbox: inbox.view(), outbox: outbox.view(), last: outbox.last || null, folder: inbox.folder });
  }
  if (req.method !== 'POST') return send(res, 404, { error: 'not found' });
  const b = await body(req).catch(() => ({}));
  if (p === '/api/net-files/pick') {
    try { const file = await pickFile({ kind: 'any' }); return send(res, 200, { file }); } catch (e) { return send(res, 200, { error: e.message }); }
  }
  if (p === '/api/net-files/send') {
    const address = plain(b?.address, 300);
    let r;
    if (b?.brain) { // a brain from the list: its files, card and picture reader
      const models = await shop.list().then((l) => l.models).catch(() => []);
      const m = models.find((x) => x.id === b.brain && x.status?.state === 'installed');
      const g = m?.status?.located?.gguf;
      if (!g) return send(res, 400, { error: 'That brain isn\'t on this replicant matrix.' });
      const files = brainFiles(g, m.status.located.mmproj || '');
      // A catalogue file Bob checked when it downloaded: its sha256 is known, so nobody waits for it to be worked out.
      for (const f of files) { const h = catalogHome(shop.catalog?.models, f.name, f.bytes, saveNameOf); if (h?.sha256) f.sha256 = h.sha256; }
      r = await outbox.send({ address, kind: 'brain', title: m.name || m.id, files });
    } else {
      const file = plain(b?.file, 2000);
      if (!file || !path.isAbsolute(file)) return send(res, 400, { error: 'Pick a file first.' });
      // A .gguf goes as a brain (with its card and picture reader) unless asked otherwise, so it lands with the others.
      const own = ownModels(cfg).find((o) => o.gguf.toLowerCase() === file.toLowerCase());
      r = /\.gguf$/i.test(file) && b?.asFile !== true
        ? await outbox.send({ address, kind: 'brain', title: own?.name || path.basename(file, '.gguf'), files: brainFiles(file, own?.mmproj || '') })
        : await outbox.send({ address, kind: 'file', files: [{ path: file }] });
    }
    return send(res, r.ok ? 200 : 400, r);
  }
  if (p === '/api/net-files/answer') { const r = inbox.answer(plain(b?.id, 40), b?.yes === true); const { run, ...out } = r; return send(res, 200, out); }
  if (p === '/api/net-files/resume') { const { run, ...r } = inbox.resume(plain(b?.id, 40)); return send(res, r.ok ? 200 : 400, r); }
  if (p === '/api/net-files/forget') return send(res, 200, inbox.forget(plain(b?.id, 40)));
  if (p === '/api/net-files/stop') {
    const r = b?.side === 'out' ? await outbox.stop(plain(b?.id, 40)) : inbox.stop(plain(b?.id, 40));
    return send(res, r.ok ? 200 : 400, r);
  }
  return send(res, 404, { error: 'not found' });
}

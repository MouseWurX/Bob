// Brains of your own in Bob's API: pick a .gguf on this computer, look inside it, add it to Bob's list or take it off.
// Split out of server.js; same rules as before (this computer only).
// Returns false when the request is not one of these, so server.js keeps looking; anything else means it was answered.
import { myName } from './bob-net-pair.js';
import { saveSettings } from './config.js';
import { cleanOwnModels, inspectOwn, ownId, ownModels, pickFile } from './own-models.js';

export async function ownModelsRoute({ req, res, p, isLocal, cfg, brain, body, send }) {
  // 1.5.135: brains of your own. Pick a .gguf on this replicant matrix (local window only), add it to Bob's list, or take it off.
  if (req.method === 'POST' && p === '/api/own-models/pick') {
    if (!isLocal) return send(res, 403, { error: 'A file can only be picked on this replicant matrix itself.' });
    try { const b = await body(req).catch(() => ({})); const kind = ['mmproj', 'docs'].includes(b?.kind) ? b.kind : 'gguf'; const file = await pickFile({ kind }); return send(res, 200, file ? { file, ...(kind === 'gguf' ? inspectOwn(file) : {}) } : { file: '' }); } catch (e) { return send(res, 200, { error: e.message }); }
  }
  if (req.method === 'POST' && p === '/api/own-models/inspect') {
    if (!isLocal) return send(res, 403, { error: `Brains of your own can only be added or removed on ${myName() || "the Bob's own replicant matrix"} itself, not from the phone.` });
    const b = await body(req).catch(() => ({})); return send(res, 200, inspectOwn(b?.file));
  }
  if (req.method === 'POST' && p === '/api/own-models') {
    if (!isLocal) return send(res, 403, { error: `Brains of your own can only be added or removed on ${myName() || "the Bob's own replicant matrix"} itself, not from the phone.` });
    const b = await body(req).catch(() => ({}));
    const seen = inspectOwn(b?.gguf);
    if (seen.error) return send(res, 400, { error: seen.error });
    if (b?.mmproj) { const mm = inspectOwn(b.mmproj); if (mm.error) return send(res, 400, { error: `The picture reader: ${mm.error}` }); }
    const list = ownModels(cfg);
    if (list.some((o) => o.gguf.toLowerCase() === seen.file.toLowerCase())) return send(res, 400, { error: 'That file is already on Bob\'s list.' });
    const name = String(b?.name || '').trim() || seen.name;
    const next = cleanOwnModels([...list, { id: ownId(name, list), name, gguf: seen.file, mmproj: b?.mmproj || '' }]);
    if (next.length === list.length) return send(res, 400, { error: 'Bob couldn\'t add that one (the list is full, or the name is empty).' });
    saveSettings(cfg, { ownModels: next });
    brain.catalogNames = null;
    return send(res, 200, { ownModels: next, added: next[next.length - 1] });
  }
  if (req.method === 'POST' && p === '/api/own-models/remove') {
    if (!isLocal) return send(res, 403, { error: `Brains of your own can only be added or removed on ${myName() || "the Bob's own replicant matrix"} itself, not from the phone.` });
    const b = await body(req).catch(() => ({}));
    const list = ownModels(cfg);
    const gone = list.find((o) => o.id === b?.id);
    if (!gone) return send(res, 404, { error: 'That brain isn\'t on Bob\'s list.' });
    // Only the list entry goes; the file stays where it is. Any slot wearing it is emptied (the Brain falls back to the main pick).
    const models = Object.fromEntries(Object.entries(cfg.models || {}).filter(([, v]) => v === gone.id).map(([k]) => [k, '']));
    const patch = { ownModels: list.filter((o) => o.id !== gone.id) };
    if (Object.keys(models).length) patch.models = models;
    saveSettings(cfg, patch);
    brain.catalogNames = null;
    return send(res, 200, { ownModels: patch.ownModels, cleared: Object.keys(models) });
  }
  return false;
}

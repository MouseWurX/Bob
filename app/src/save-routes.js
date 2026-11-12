// Saving things as files in Bob's API: the help bundle (zip), Save as another file type, and saving a drawn diagram.
// Split out of server.js; same rules as before.
// Returns false when the request is not one of these, so server.js keeps looking; anything else means it was answered.
import path from 'node:path';
import { capabilities } from './capabilities.js';
import { saveExport } from './diagram.js';
import { checkEngine } from './engines.js';
import { bundleBytes, revealFile, saveHelpBundle } from './help-bundle.js';
import { pickFolder } from './pick-folder.js';
import { saveAs } from './save-as.js';
import { speedHistory } from './speed-test.js';

export async function saveRoute({ req, res, p, isLocal, cfg, brain, shop, body, bigBody, send }) {
  if (p === '/api/help-bundle') {
    const deps = { brain, shop, checkEngine, speedHistory, capabilities };
    if (req.method === 'GET') {
      try {
        const z = await bundleBytes(cfg, deps);
        brain.log('settings', `help bundle sent to ${isLocal ? 'this replicant matrix' : 'a paired device'} (${z.brainNote ? "with Bob's own note" : 'automatic'})`);
        res.writeHead(200, { 'Content-Type': 'application/zip', 'Content-Length': z.data.length, 'Content-Disposition': `attachment; filename="${z.name}"` });
        return res.end(z.data);
      } catch (e) { return send(res, 500, { error: e.message }); }
    }
    if (req.method === 'POST') {
      if (!isLocal) return send(res, 403, { error: 'Only on this replicant matrix itself.' });
      const b = await body(req).catch(() => ({}));
      let folder = '', picked = true;
      try { folder = await pickFolder({ purpose: 'bundle' }); } catch { picked = false; }
      if (picked && !folder) return send(res, 200, { ok: false, cancelled: true });
      if (!folder) folder = path.join(cfg.painterDir || cfg.innDir, 'help-bundles'); // no folder picker here: Bob's own folder
      try {
        const r = await saveHelpBundle(cfg, folder, { ...deps, brainNote: b.brain === false ? false : undefined });
        brain.log('settings', `help bundle saved: ${path.basename(r.file)} (${r.brainNote ? "with Bob's own note" : `automatic: ${r.why}`})`);
        const shown = revealFile(r.file);
        return send(res, 200, { ...r, shown, pickedFolder: picked });
      } catch (e) { return send(res, 200, { ok: false, why: e.message }); }
    }
  }
  // 1.5.95 Save as: keep something Bob made as another file type (pictures, clips, songs; save-as.js).
  if (req.method === 'POST' && p === '/api/save-as') {
    const b = await body(req);
    try {
      const r = await saveAs(cfg, { name: b.name, format: b.format }, brain.saveAsOpts || {});
      if (r.need === 'ffmpeg') { let offer = null; await brain.offerSetup('ffmpeg', { emit: (ev) => { offer = ev; } }, { quiet: true }).catch(() => ''); return send(res, 200, { ok: false, need: 'ffmpeg', offer }); }
      try { brain.made.add(r.file, { tool: 'save_as' }); } catch {}
      return send(res, 200, { ok: true, ...r });
    } catch (e) { return send(res, 200, { ok: false, why: e.message }); }
  }
  // 1.5.95: a diagram drawn in a chat window, saved as PNG, SVG or PDF next to its text (diagram.js).
  if (req.method === 'POST' && p === '/api/diagram/save') {
    try {
      const b = await bigBody(req);
      const r = saveExport(cfg, { name: b.name, format: b.format, data: b.data });
      try { brain.made.add(r.file, { tool: 'make_diagram' }); } catch {}
      return send(res, 200, { ok: true, ...r });
    } catch (e) { return send(res, 200, { ok: false, why: e.message }); }
  }
  return false;
}

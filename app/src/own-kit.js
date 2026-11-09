// 1.5.144 🧰 Tools and how-tos Bob made: one Settings panel (and one phone screen) for the things Bob makes for
// himself: the tools he writes (src/selftools.js, with the Make his own tools Hand) and the how-tos he keeps
// (src/howtos.js). Both can be looked at and deleted here. Delete asks first, then the thing goes on a shelf
// (Recently deleted) for 30 days: Put back brings it back as it was, Delete for good drops it now. A deleted tool's
// folder goes to the Recycle Bin when it leaves the shelf; a how-to is plain text and is simply forgotten.
// Delete and Put back work from the phone too (a paired Bob); Delete for good, and Edit, only on the PC itself.
import { listTools, deleteTool, restoreTool, removeTool, sweepDeleted, MAX_TOOLS } from './selftools.js';
import { handOn } from './hands-settings.js';
import { MAX_HOWTOS } from './howtos.js';

export const KINDS = new Set(['tool', 'howto']);

// What the panel shows.
export function ownKitView(cfg, brain) {
  let tools = [], shelfTools = [];
  try { sweepDeleted(cfg); tools = listTools(cfg); shelfTools = listTools(cfg, { deleted: true }); } catch {}
  const howtos = brain.howtos.list(), shelfHowtos = brain.howtos.deletedList();
  const strip = ({ dir, ...t }) => ({ ...t, folder: dir });
  return {
    tools: tools.map(strip), howtos, maxTools: MAX_TOOLS, maxHowtos: MAX_HOWTOS,
    makerOn: handOn(cfg, 'maker'), howtosOn: cfg.howtos === true,
    deleted: [...shelfTools.map((t) => ({ kind: 'tool', id: t.name, name: t.name, what: t.what, ...strip(t) })),
      ...shelfHowtos.map((r) => ({ kind: 'howto', id: r.id, name: r.name, what: r.when || '', steps: r.steps.length, deleted: r.deleted, goneAt: r.goneAt }))].sort((a, b) => b.deleted - a.deleted)
  };
}

// The counts on the panel's closed line (and the settings view).
export function ownKitCounts(cfg, brain) {
  try { const v = ownKitView(cfg, brain); return { tools: v.tools.length, howtos: v.howtos.length, deleted: v.deleted.length }; } catch { return { tools: 0, howtos: 0, deleted: 0 }; }
}

const noSuch = (kind) => new Error(kind === 'tool' ? "There's no tool with that name." : "There's no how-to with that name.");
const want = (b) => { const kind = String(b.kind || ''), id = String(b.id || ''); if (!KINDS.has(kind) || !id) throw new Error('Say which tool or how-to.'); return { kind, id }; };

// The three actions. Each returns what the panel needs to say and redraw.
export function ownKitDelete(cfg, brain, b) {
  const { kind, id } = want(b);
  if (kind === 'tool') { deleteTool(cfg, id); brain.log?.('selftools', `deleted ${id} (your click; on the shelf 30 days)`); return { ok: true, kind, id, name: id }; }
  const r = brain.howtos.find(id);
  if (!r || r.id !== id || !brain.howtos.remove(id)) throw noSuch(kind);
  brain.log?.('howtos', `deleted how-to "${r.name}" (your click; on the shelf 30 days)`);
  return { ok: true, kind, id, name: r.name };
}
export function ownKitRestore(cfg, brain, b) {
  const { kind, id } = want(b);
  if (kind === 'tool') { restoreTool(cfg, id); brain.log?.('selftools', `put ${id} back (your click)`); return { ok: true, kind, id, name: id }; }
  const r = brain.howtos.restore(id);
  if (!r) throw noSuch(kind);
  brain.log?.('howtos', `put how-to "${r.name}" back (your click)`);
  return { ok: true, kind, id, name: r.name };
}
export function ownKitPurge(cfg, brain, b) {
  const { kind, id } = want(b);
  if (kind === 'tool') { removeTool(cfg, id); brain.log?.('selftools', `removed ${id} for good (your click): folder to the Recycle Bin`); return { ok: true, kind, id, name: id }; }
  const r = brain.howtos.deletedList().find((x) => x.id === id);
  if (!r || !brain.howtos.purge(id)) throw noSuch(kind);
  brain.log?.('howtos', `deleted how-to "${r.name}" for good (your click)`);
  return { ok: true, kind, id, name: r.name };
}

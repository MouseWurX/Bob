// The reference shelf: pictures of characters, scenes and styles that Bob can look at and paint from.
// Files live in inn\references, with a small index (refs.json). Pictures attached in chat land here too,
// under "From chats", so Bob can find them again by name.
import fs from 'node:fs';
import { writeJsonAtomic } from './util.js';
import path from 'node:path';
import crypto from 'node:crypto';
import { imageInfo, imageInfoOf } from './imageinfo.js';
import { recycle } from './recycle.js';

export const KINDS = ['character', 'scene', 'style', 'object', 'chat'];
const MAX_BYTES = 15e6;

function sniff(buf) {
  if (buf.length > 8 && buf[0] === 0x89 && buf.toString('ascii', 1, 4) === 'PNG') return 'png';
  if (buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpg';
  if (buf.length > 12 && buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') return 'webp';
  return null;
}

function shape(buf) {
  const i = imageInfo(buf);
  return i ? { width: i.width, height: i.height, turn: i.turn } : {};
}

export class RefShelf {
  constructor(cfg) {
    this.cfg = cfg;
    this.dir = path.join(cfg.innDir, 'references');
    fs.mkdirSync(this.dir, { recursive: true });
    this.index = path.join(this.dir, 'refs.json');
  }

  list() {
    try { return JSON.parse(fs.readFileSync(this.index, 'utf8')); } catch { return []; }
  }

  save(list) { writeJsonAtomic(this.index, list, 2); }

  add(buf, { name, kind, notes } = {}) {
    if (!buf || !buf.length) throw new Error('That picture is empty.');
    if (buf.length > MAX_BYTES) throw new Error('That picture is too big (15 MB max).');
    const ext = sniff(buf);
    if (!ext) throw new Error('I can only keep PNG, JPEG or WebP pictures.');
    const list = this.list();
    const id = crypto.randomUUID().slice(0, 8);
    const k = KINDS.includes(kind) ? kind : 'chat';
    let n = String(name || '').trim().slice(0, 60) || (k === 'chat' ? `Chat picture ${new Date().toISOString().slice(0, 16).replace('T', ' ')}` : `Untitled ${k}`);
    if (list.some((r) => r.name.toLowerCase() === n.toLowerCase())) n = `${n} (${id.slice(0, 4)})`;
    const file = `${id}.${ext}`;
    fs.writeFileSync(path.join(this.dir, file), buf);
    const ref = { id, name: n, kind: k, notes: String(notes || '').slice(0, 300), file, added: new Date().toISOString().slice(0, 10), ...shape(buf) };
    list.push(ref);
    this.save(list);
    return ref;
  }

  update(id, { name, kind, notes }) {
    const list = this.list();
    const r = list.find((x) => x.id === id);
    if (!r) throw new Error('No such reference.');
    if (typeof name === 'string' && name.trim()) {
      const n = name.trim().slice(0, 60);
      if (list.some((x) => x.id !== id && x.name.toLowerCase() === n.toLowerCase())) throw new Error(`There's already a reference called ${n}.`);
      r.name = n;
    }
    if (KINDS.includes(kind)) r.kind = kind;
    if (typeof notes === 'string') r.notes = notes.slice(0, 300);
    this.save(list);
    return r;
  }

  // What Bob's eyes saw in the picture, kept so he doesn't have to look again.
  setSeen(id, text) {
    const list = this.list();
    const r = list.find((x) => x.id === id);
    if (!r) return;
    r.seen = String(text || '').slice(0, 1500);
    this.save(list);
  }

  // Swap a picture for an upright copy (Bob's window turns phone photos the right way up and sends them back).
  // Same id and name, so chats that point at it still work. The sideways original goes to the Recycle Bin;
  // if it can't, it stays next to the new one as <id>-original, never overwritten.
  // original: 'bin' or the kept file's name.
  replace(id, buf) {
    const ext = sniff(buf || Buffer.alloc(0));
    if (!ext) throw new Error('I can only keep PNG, JPEG or WebP pictures.');
    if (buf.length > MAX_BYTES) throw new Error('That picture is too big (15 MB max).');
    const list = this.list();
    const r = list.find((x) => x.id === id);
    if (!r) throw new Error('No such reference.');
    const old = path.join(this.dir, r.file);
    let original = 'bin';
    if (fs.existsSync(old)) {
      let binned = false;
      try { binned = recycle(this.cfg, [old], { roots: [this.dir] }).gone.length > 0; } catch {}
      if (!binned) {
        original = `${r.id}-original${path.extname(r.file)}`;
        fs.renameSync(old, path.join(this.dir, original));
      }
    }
    const file = `${r.id}.${ext}`;
    fs.writeFileSync(path.join(this.dir, file), buf);
    Object.assign(r, { file, original }, shape(buf));
    this.save(list);
    return r;
  }

  // Size as shown and the EXIF turn (1 = upright). Worked out once for pictures saved before Bob kept it.
  info(ref) {
    if (ref.width && ref.turn) return { width: ref.width, height: ref.height, turn: ref.turn };
    const i = imageInfoOf(this.pathOf(ref));
    if (!i) return { width: 0, height: 0, turn: 1 };
    const list = this.list();
    const r = list.find((x) => x.id === ref.id);
    if (r) { Object.assign(r, { width: i.width, height: i.height, turn: i.turn }); this.save(list); }
    return { width: i.width, height: i.height, turn: i.turn };
  }

  // Keep one of Bob's own pictures (from the painter folder) on the shelf.
  addFile(file, meta) { return this.add(fs.readFileSync(file), meta); }

  remove(id) {
    const list = this.list();
    const r = list.find((x) => x.id === id);
    if (!r) return false;
    fs.rmSync(path.join(this.dir, r.file), { force: true });
    this.save(list.filter((x) => x.id !== id));
    return true;
  }

  // By id or by name (case-insensitive), for Bob's tools.
  find(idOrName) {
    const q = String(idOrName || '').trim().toLowerCase();
    if (!q) return null;
    const list = this.list();
    return list.find((r) => r.id === q) || list.find((r) => r.name.toLowerCase() === q) || list.find((r) => r.name.toLowerCase().includes(q)) || null;
  }

  pathOf(ref) { return path.join(this.dir, ref.file); }

  base64(ref) { return fs.readFileSync(this.pathOf(ref)).toString('base64'); }

  // A short list for Bob's system prompt.
  describe() {
    const shelf = this.list().filter((r) => r.kind !== 'chat');
    if (!shelf.length) return '';
    return 'Reference shelf (pictures saved for you; use the name in make_image or make_video):\n' + shelf.slice(-40).map((r) => `- ${r.name} (${r.kind})${r.notes ? `: ${r.notes}` : ''}${r.seen ? ` [looks like: ${r.seen.slice(0, 200)}]` : ''}`).join('\n');
  }
}

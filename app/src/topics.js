// Topics: Bob's glossary of what's been talked about. Each topic has a short line, a note on where things
// landed (decisions, facts), open questions, the chat moments it came from and any pictures made for it.
// Topics are grouped by project ("Starfall", "Bob"...), so a chat that jumped around still reads by topic.
// Bob refreshes them when he's idle (housekeeping.js asks the brain); the user can rename, merge, pin, edit
// the note, move a message to another topic, or forget a topic. Kept in inn\bob\topics.json on this PC only.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { clip } from './util.js';

const MAX_TOPICS = 400;
const MAX_NOTE = 1500;
export const normName = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

export function cosine(a, b) {
  if (!a?.length || !b?.length || a.length !== b.length) return 0;
  let d = 0, x = 0, y = 0;
  for (let i = 0; i < a.length; i++) { d += a[i] * b[i]; x += a[i] * a[i]; y += b[i] * b[i]; }
  return x && y ? d / Math.sqrt(x * y) : 0;
}

// Word overlap, for when there are no embeddings (no embedding model on this PC).
const STOP = new Set('the a an and or of to in on for with is it this that be we i you my our at by from as are was what how about can do'.split(' '));
export function words(s) { return new Set(normName(s).split(' ').filter((w) => w.length > 2 && !STOP.has(w))); }
export function overlap(a, b) {
  const A = words(a), B = words(b);
  if (!A.size || !B.size) return 0;
  let n = 0;
  for (const w of A) if (B.has(w)) n++;
  return n / Math.min(A.size, B.size);
}

export class Topics {
  constructor(cfg) {
    this.cfg = cfg;
    this.file = path.join(cfg.dataDir, 'topics.json');
  }

  load() {
    try {
      const d = JSON.parse(fs.readFileSync(this.file, 'utf8'));
      return { topics: Array.isArray(d.topics) ? d.topics : [], cursors: d.cursors && typeof d.cursors === 'object' ? d.cursors : {} };
    } catch { return { topics: [], cursors: {} }; }
  }

  save(d) {
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    d.topics = d.topics.slice(0, MAX_TOPICS);
    fs.writeFileSync(this.file + '.part', JSON.stringify(d));
    fs.renameSync(this.file + '.part', this.file);
  }

  // What the window shows (no embedding vectors).
  list() {
    return this.load().topics.map(({ vec, ...t }) => ({ ...t, messages: (t.spans || []).reduce((n, s) => n + s.msgIds.length, 0) }))
      .sort((a, b) => (b.pinned - a.pinned) || (b.lastSeen || 0) - (a.lastSeen || 0));
  }

  get(id) { return this.load().topics.find((t) => t.id === id) || null; }

  find(nameOrId) {
    const q = normName(nameOrId);
    if (!q) return null;
    const all = this.load().topics;
    return all.find((t) => t.id === nameOrId) || all.find((t) => normName(t.name) === q)
      || all.find((t) => normName(`${t.project} ${t.name}`) === q) || all.find((t) => normName(t.name).includes(q) || q.includes(normName(t.name))) || null;
  }

  change(id, fn) {
    const d = this.load();
    const t = d.topics.find((x) => x.id === id);
    if (!t) throw new Error('No such topic.');
    fn(t, d);
    this.save(d);
    const { vec, ...out } = t;
    return out;
  }

  rename(id, name, project) {
    return this.change(id, (t) => { if (name != null && clip(name, 80)) t.name = clip(name, 80); if (project != null) t.project = clip(project, 60); t.vec = null; });
  }

  // The user's own words: Bob won't overwrite an edited note (he keeps his update aside as a suggestion).
  edit(id, { note, summary, open } = {}) {
    return this.change(id, (t) => {
      if (note != null) t.note = String(note).slice(0, MAX_NOTE);
      if (summary != null) t.summary = clip(summary, 160);
      if (Array.isArray(open)) t.open = open.map((o) => clip(o, 200)).filter(Boolean).slice(0, 10);
      t.edited = true; t.suggested = undefined;
    });
  }

  pin(id, on) { return this.change(id, (t) => { t.pinned = Boolean(on); }); }

  // Forget this topic once it hasn't come up for a while (housekeeping asks first, unless tidying is automatic).
  fade(id, after) { return this.change(id, (t) => { t.fade = after && after.n > 0 ? { n: Math.round(after.n), unit: after.unit } : null; }); }

  merge(fromId, intoId) {
    if (fromId === intoId) throw new Error('Pick two different topics.');
    const d = this.load();
    const a = d.topics.find((x) => x.id === fromId), b = d.topics.find((x) => x.id === intoId);
    if (!a || !b) throw new Error('No such topic.');
    for (const s of a.spans || []) addSpan(b, s.session, s.msgIds);
    b.pics = [...new Set([...(b.pics || []), ...(a.pics || [])])].slice(0, 40);
    b.open = [...new Set([...(b.open || []), ...(a.open || [])])].slice(0, 10);
    if (a.note && !(b.note || '').includes(a.note)) b.note = `${b.note ? b.note + '\n\n' : ''}${a.note}`.slice(0, MAX_NOTE);
    b.lastSeen = Math.max(a.lastSeen || 0, b.lastSeen || 0);
    b.pinned = b.pinned || a.pinned;
    b.aliases = [...new Set([...(b.aliases || []), a.name, ...(a.aliases || [])])].slice(0, 20);
    b.vec = null;
    d.topics = d.topics.filter((x) => x !== a);
    this.save(d);
    return b.id;
  }

  // A chat message belongs to one topic; dragging it onto another moves it.
  moveMessage(session, msgId, toId) {
    const d = this.load();
    const to = d.topics.find((x) => x.id === toId);
    if (!to) throw new Error('No such topic.');
    for (const t of d.topics) for (const s of t.spans || []) if (s.session === session) s.msgIds = s.msgIds.filter((m) => m !== msgId);
    for (const t of d.topics) t.spans = (t.spans || []).filter((s) => s.msgIds.length);
    addSpan(to, session, [msgId]);
    this.save(d);
    return true;
  }

  remove(id) { const d = this.load(); d.topics = d.topics.filter((t) => t.id !== id); this.save(d); }

  // Takes chat messages out of every topic (after they were forgotten or their chat was tidied away).
  dropMessages(session, ids = null) {
    const d = this.load();
    for (const t of d.topics) {
      for (const s of t.spans || []) if (s.session === session) s.msgIds = ids ? s.msgIds.filter((m) => !ids.has(m)) : [];
      t.spans = (t.spans || []).filter((s) => s.msgIds.length);
    }
    if (!ids) delete d.cursors[session];
    this.save(d);
  }

  // The brain's grouping of new messages, merged in. groups: [{ name, project, existing, summary, note, open, msgIds, pics }].
  // match(group, topics) can pick an existing topic (embeddings); otherwise names are compared.
  absorb(session, groups, { at = {}, match } = {}) {
    const d = this.load();
    const touched = [];
    for (const g of groups || []) {
      const name = clip(g.name, 80);
      const ids = [].concat(g.msgIds || []).map(String).filter((id) => id in at);
      if (!name || !ids.length) continue;
      let t = (g.existing && d.topics.find((x) => x.id === g.existing))
        || d.topics.find((x) => normName(x.name) === normName(name) || (x.aliases || []).some((a) => normName(a) === normName(name)))
        || (match ? match(g, d.topics) : null);
      if (!t) {
        t = { id: crypto.randomBytes(4).toString('hex'), name, project: clip(g.project, 60), summary: '', note: '', open: [], spans: [], pics: [], pinned: false, edited: false, created: Date.now() };
        d.topics.push(t);
      }
      // Messages move to the topic they were last grouped under.
      for (const o of d.topics) if (o !== t) for (const s of o.spans || []) if (s.session === session) s.msgIds = s.msgIds.filter((m) => !ids.includes(m));
      addSpan(t, session, ids);
      if (g.project && !t.project) t.project = clip(g.project, 60);
      const line = clip(g.summary, 160), note = String(g.note || '').trim().slice(0, MAX_NOTE);
      if (t.edited) { if (note || line) t.suggested = { note, summary: line }; }
      else { if (line) t.summary = line; if (note) t.note = note; }
      if (Array.isArray(g.open)) t.open = [...new Set(g.open.map((o) => clip(o, 200)).filter(Boolean))].slice(0, 10);
      t.pics = [...new Set([...(t.pics || []), ...[].concat(g.pics || [])])].slice(0, 40);
      t.lastSeen = Math.max(t.lastSeen || 0, ...ids.map((id) => at[id] || 0));
      t.vec = null;
      touched.push(t.id);
    }
    for (const t of d.topics) t.spans = (t.spans || []).filter((s) => s.msgIds.length);
    // A topic left with no messages and no note of its own is noise.
    d.topics = d.topics.filter((t) => t.pinned || t.edited || t.note || (t.spans || []).length);
    this.save(d);
    return touched;
  }

  setCursor(session, value) { const d = this.load(); d.cursors[session] = value; this.save(d); }
  cursor(session) { return this.load().cursors[session] || 0; }

  setVectors(vecs) { const d = this.load(); for (const t of d.topics) if (vecs[t.id]) t.vec = vecs[t.id]; this.save(d); }

  // The topic notes closest to what the user just said, for Bob's prompt (instead of raw old history).
  relevant(text, { vec = null, k = 3, min = 0.35 } = {}) {
    const all = this.load().topics.filter((t) => t.note || t.summary);
    const scored = all.map((t) => {
      const s = vec && t.vec ? cosine(vec, t.vec) : overlap(text, `${t.project} ${t.name} ${t.summary} ${(t.aliases || []).join(' ')}`);
      return { t, s: vec && t.vec ? s : s * 0.9 };
    }).filter((x) => x.s >= (vec ? Math.max(min, 0.5) : min)).sort((a, b) => b.s - a.s).slice(0, k);
    return scored.map(({ t }) => t);
  }
}

function addSpan(t, session, ids) {
  t.spans = t.spans || [];
  let s = t.spans.find((x) => x.session === session);
  if (!s) { s = { session, msgIds: [] }; t.spans.push(s); }
  s.msgIds = [...new Set([...s.msgIds, ...ids])].slice(-500);
}

export function topicText(t) { return `${t.project ? t.project + ' > ' : ''}${t.name}: ${t.summary || ''} ${t.note || ''}`.slice(0, 1200); }

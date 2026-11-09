// One search box over everything Bob keeps: chats (old parts too), chat summaries, topics, the pictures and
// sounds he made, and the notes (memory file, about-me, notice board). Plain word matching, on this PC only.
import fs from 'node:fs';
import path from 'node:path';
import { chatIds, wholeChat, spoken, said, chatTitle, readSummary } from './chats.js';

const MAX = 60;
const terms = (q) => String(q || '').toLowerCase().split(/\s+/).filter((w) => w.length > 1).slice(0, 8);
const hits = (text, ts) => { const t = String(text || '').toLowerCase(); return ts.every((w) => t.includes(w)); };
function snippet(text, ts, n = 160) {
  const s = String(text || '').replace(/\s+/g, ' ');
  const i = Math.max(0, s.toLowerCase().indexOf(ts[0]) - 50);
  return (i ? '…' : '') + s.slice(i, i + n) + (s.length > i + n ? '…' : '');
}

export function search(cfg, { topics, summaries = [] }, q) {
  const ts = terms(q);
  if (!ts.length) return [];
  const out = [];
  for (const t of topics.list()) {
    const text = `${t.project} ${t.name} ${(t.aliases || []).join(' ')} ${t.summary} ${t.note} ${(t.open || []).join(' ')}`;
    if (hits(text, ts)) out.push({ type: 'topic', id: t.id, title: `${t.project ? t.project + ' > ' : ''}${t.name}`, snippet: snippet(t.note || t.summary, ts), at: t.lastSeen || 0 });
  }
  for (const id of chatIds(cfg)) {
    const msgs = spoken(wholeChat(cfg, id)).filter((m) => !m.forgotten);
    const title = chatTitle(msgs);
    const sum = readSummary(cfg, id)?.summary;
    if (sum && hits(sum, ts)) out.push({ type: 'summary', session: id, title: `Summary: ${title}`, snippet: snippet(sum, ts), at: 0 });
    for (const m of msgs) if (hits(said(m), ts)) out.push({ type: 'chat', session: id, msgId: m.id, title, who: m.role === 'user' ? 'you' : 'Bob', snippet: snippet(said(m), ts), at: m.at || 0 });
  }
  for (const s of summaries) if (hits(`${s.title} ${s.summary}`, ts)) out.push({ type: 'removed', title: `Tidied chat: ${s.title}`, snippet: snippet(s.summary, ts), at: s.to || 0 });
  try {
    // Bob's own folder only: a folder the user picked for saving can hold their own files too.
    const own = cfg.defaultPainterDir || cfg.painterDir;
    for (const f of fs.readdirSync(own)) if (hits(`${f} ${f.replace(/[-_.]/g, ' ')}`, ts)) out.push({ type: 'file', title: f, url: `/images/${encodeURIComponent(f)}`, at: fs.statSync(path.join(own, f)).mtimeMs });
  } catch {}
  const notes = [['memory', cfg.memoryFile, "Bob's memory"], ['about', path.join(cfg.dataDir, 'about-me.md'), 'About you'], ['board', cfg.noticeBoard, 'Notice board']];
  for (const [kind, f, label] of notes) {
    let text = '';
    try { text = fs.readFileSync(f, 'utf8'); } catch { continue; }
    for (const line of text.split('\n')) if (line.trim() && hits(line, ts)) out.push({ type: 'note', kind, title: label, snippet: snippet(line, ts), at: 0 });
  }
  const rank = { topic: 0, summary: 1, note: 2, chat: 3, removed: 4, file: 5 };
  return out.sort((a, b) => (rank[a.type] - rank[b.type]) || (b.at - a.at)).slice(0, MAX);
}

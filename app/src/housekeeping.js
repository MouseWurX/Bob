// Bob the housekeeper. Off unless the user turns it on (Settings, Housekeeping).
// When on, and only while Bob is idle, he:
//   - sums up the older part of long chats (instead of forgetting it) and moves lasting facts to his memory file,
//   - sorts what was said into topics (topics.js), so old chats can go while "where we landed" stays,
//   - looks for things that haven't come up for longer than the user's limit: chats, pictures and clips he made,
//     sounds, finished tasks, old logbook lines, plus spare copies (repeated memory lines; the cached Electron download is left alone for rebuilds).
// Each kind has its own age limit and its own mode: "ask me" (the default) or "tidy automatically" (opt-in).
// Asking means a list with a tick and a cross per item; nothing goes without that click, unless the user chose
// automatic for that kind. Everything removed goes to the Recycle Bin (recycle.js). Pinned chats, pictures
// and topics are never touched. Every action goes in the logbook. Only Bob's own folders are touched.
import fs from 'node:fs';
import path from 'node:path';
import { appDir, findOutput } from './config.js';
import { UNITS, KINDS, ageMs, cleanHousekeeping, hkSettings } from './hk-settings.js';
export { UNITS, KINDS, ageMs, cleanHousekeeping, hkSettings };
import { recycle, backupToBin, mayRecycle } from './recycle.js';
import { Topics, normName, topicText } from './topics.js';
import { Embedder } from './embedder.js';
import { recallOn, parseMemory, MemoryVectors } from './recall.js';
import { gaming } from './sessions.js';
import { catalogFileFor } from './llamacpp.js';
import {
  chatIds, chatInfo, chatFiles, wholeChat, readChat, readOlder, writeChat, writeOlder, readSummary, writeSummary,
  spoken, said, stampMessages, safeId
} from './chats.js';
import { parseJson, writeJsonAtomic } from './util.js';

const IDLE_MS = 10 * 60e3;       // quiet this long before any housekeeping
const SCAN_EVERY = 6 * 3600e3;   // look for old things at most this often
const ASK_EVERY = 24 * 3600e3;   // mention them in the chat at most once a day
const PIC_EXT = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif', '.mp4', '.webm', '.mov']);
const SOUND_EXT = new Set(['.wav', '.mp3', '.ogg', '.flac', '.m4a']);

const sizeOf = (p) => {
  try {
    const s = fs.statSync(p);
    if (!s.isDirectory()) return s.size;
    return fs.readdirSync(p).reduce((n, f) => n + sizeOf(path.join(p, f)), 0);
  } catch { return 0; }
};
const files = (dir) => { try { return fs.readdirSync(dir, { withFileTypes: true }).filter((d) => d.isFile()).map((d) => path.join(dir, d.name)); } catch { return []; } };
const mtime = (p) => { try { return fs.statSync(p).mtimeMs; } catch { return 0; } };
const dateOf = (ms) => new Date(ms).toISOString().slice(0, 10);

// Pulls the first JSON object out of a model's answer.
export { parseJson };

// Memory lines are "- fact (date)" or "- fact (date) [topic: Name]". Repeats compare without the date and tag.
const memKey = (line) => normName(line.replace(/^\s*-\s*/, '').replace(/\[(?:topic|project):[^\]]*\]|\[always\]/gi, '').replace(/\(\d{4}-\d{2}-\d{2}\)/g, ''));
export function memoryRepeats(text) {
  const seen = new Set();
  let n = 0;
  const kept = [];
  for (const line of String(text).split(/\r?\n/)) {
    const k = /^\s*-\s+/.test(line) ? memKey(line) : '';
    if (k && seen.has(k)) { n++; continue; }
    if (k) seen.add(k);
    kept.push(line);
  }
  return { repeats: n, text: kept.join('\n') };
}

export class Housekeeper {
  constructor(cfg, brain) {
    this.cfg = cfg;
    this.brain = brain;
    this.topics = new Topics(cfg);
    this.stateFile = path.join(cfg.dataDir, 'housekeeping.json');
    this.items = [];
    this.working = false;
    this.controller = null;
    this.noEmbed = false;
    this.now = () => Date.now();
    this.timer = setInterval(() => this.tick().catch(() => {}), 5 * 60e3);
    this.timer.unref?.();
  }

  stop() { clearInterval(this.timer); this.pause(); }
  // The user is back: anything the housekeeper is asking the brain stops at once.
  pause() { this.controller?.abort(); }

  get settings() { return hkSettings(this.cfg); }
  state() {
    let s = {};
    try { s = JSON.parse(fs.readFileSync(this.stateFile, 'utf8')); } catch {}
    return { pins: { chats: [], pictures: [], ...(s.pins || {}) }, kept: s.kept || {}, lastScan: s.lastScan || 0, lastAsk: s.lastAsk || 0, lastRun: s.lastRun || 0 };
  }
  saveState(s) { writeJsonAtomic(this.stateFile, s); }
  log(text) { this.brain.log('housekeeping', text); }

  pin(kind, id, on) {
    if (!['chats', 'pictures'].includes(kind)) throw new Error('Only chats and pictures can be pinned.');
    const s = this.state();
    const list = new Set(s.pins[kind]);
    on ? list.add(String(id)) : list.delete(String(id));
    s.pins[kind] = [...list].slice(-2000);
    this.saveState(s);
    this.items = this.items.filter((i) => !(i.kind === kind && i.ref === String(id) && on));
    return s.pins[kind];
  }

  chats() {
    const pins = this.state().pins.chats;
    return chatIds(this.cfg).map((id) => chatInfo(this.cfg, id, pins)).sort((a, b) => (b.pinned - a.pinned) || b.lastTouched - a.lastTouched);
  }

  // ---------- Finding old things ----------
  scan(now = Date.now()) {
    const hk = this.settings, st = this.state(), cfg = this.cfg;
    const items = [];
    const kept = (key, touched) => st.kept[key] && st.kept[key] > touched; // the user said keep after it last changed
    const old = (kind, touched) => now - touched > ageMs(hk[kind]);
    const add = (it) => { if (!kept(it.key, it.touched || 0)) items.push(it); };

    for (const c of this.chats()) {
      if (c.pinned || !old('chats', c.lastTouched)) continue;
      add({ key: `chat:${c.id}`, kind: 'chats', ref: c.id, label: c.title, detail: `${c.messages} messages, last talked about ${dateOf(c.lastTouched)}`, bytes: c.bytes, touched: c.lastTouched, actions: ['summarize', 'delete'], def: 'summarize' });
    }
    const pinsP = new Set(st.pins.pictures);
    for (const f of files(cfg.defaultPainterDir || cfg.painterDir)) { // 1.5.41: Bob's own folder only, never one the user picked
      const ext = path.extname(f).toLowerCase(), name = path.basename(f), t = mtime(f);
      const kind = PIC_EXT.has(ext) ? 'pictures' : SOUND_EXT.has(ext) ? 'sounds' : null;
      if (!kind || pinsP.has(name) || !old(kind, t)) continue;
      add({ key: `file:${name}`, kind, ref: name, label: name, detail: `made ${dateOf(t)}`, bytes: sizeOf(f), touched: t, url: `/images/${encodeURIComponent(name)}`, actions: ['delete'], def: 'delete', paths: [f] });
    }
    // Pictures attached in chats sit on the reference shelf as "From chats"; the user's own shelf pictures stay.
    for (const r of this.brain.refs?.list?.() || []) {
      if (r.kind !== 'chat' || pinsP.has(`ref:${r.id}`)) continue;
      const f = this.brain.refs.pathOf(r), t = mtime(f);
      if (!old('pictures', t)) continue;
      add({ key: `ref:${r.id}`, kind: 'pictures', ref: `ref:${r.id}`, label: r.name, detail: `attached in a chat, ${dateOf(t)}`, bytes: sizeOf(f), touched: t, url: `/refs/${encodeURIComponent(r.file)}`, actions: ['delete'], def: 'delete', refId: r.id });
    }
    const vs = path.join(cfg.dataDir, 'voice-samples');
    if (fs.existsSync(vs) && old('sounds', mtime(vs))) add({ key: 'voice-samples', kind: 'sounds', label: 'Voice samples made on this replicant matrix', detail: 'made again the next time you press ▶ Hear a sample', bytes: sizeOf(vs), touched: mtime(vs), actions: ['delete'], def: 'delete', paths: [vs] });

    const done = (this.brain.queue || []).filter((j) => ['done', 'failed', 'cancelled'].includes(j.state) && old('tasks', j.doneAt || j.at || 0));
    if (done.length) add({ key: 'tasks', kind: 'tasks', label: `${done.length} finished task${done.length === 1 ? '' : 's'}`, detail: 'from the Tasks list (the chats keep what was said)', bytes: 0, touched: Math.max(...done.map((j) => j.doneAt || j.at || 0)), actions: ['delete'], def: 'delete' });

    const lb = this.oldLogLines(now - ageMs(hk.logs));
    if (lb.lines.length) add({ key: 'logbook', kind: 'logs', label: `${lb.lines.length} old logbook line${lb.lines.length === 1 ? '' : 's'}`, detail: `older than ${dateOf(now - ageMs(hk.logs))}; recent lines stay`, bytes: lb.bytes, touched: 0, actions: ['delete'], def: 'delete' });
    for (const f of files(cfg.dataDir).filter((x) => /^update.*\.(txt|log)$/i.test(path.basename(x)))) {
      if (old('logs', mtime(f))) add({ key: `file:${path.basename(f)}`, kind: 'logs', label: path.basename(f), detail: `update log from ${dateOf(mtime(f))}`, bytes: sizeOf(f), touched: mtime(f), actions: ['delete'], def: 'delete', paths: [f] });
    }

    for (const t of this.topics.load().topics) {
      if (t.pinned || !t.fade || now - (t.lastSeen || 0) <= ageMs(t.fade)) continue;
      add({ key: `topic:${t.id}`, kind: 'topics', ref: t.id, label: `${t.project ? t.project + ' > ' : ''}${t.name}`, detail: `you asked Bob to forget it after ${t.fade.n} ${t.fade.unit} unused; the note stays`, bytes: 0, touched: t.lastSeen || 0, actions: ['forget'], def: 'forget' });
    }

    // Spare copies: always asked about, never tidied automatically.
    // 1.5.7: the cached Electron download is never offered any more. "Double-click to build Bob" reuses it, and without
    // it a rebuild has to download about 150 MB again (and fails offline). spareElectron() stays for anyone who wants it.
    try {
      const { repeats } = memoryRepeats(fs.readFileSync(cfg.memoryFile, 'utf8'));
      if (repeats) add({ key: 'memory-repeats', kind: 'spare', label: `${repeats} repeated line${repeats === 1 ? '' : 's'} in Bob's memory file`, detail: 'the first copy of each stays', bytes: 0, touched: mtime(cfg.memoryFile), actions: ['delete'], def: 'delete' });
    } catch {}

    this.items = items;
    st.lastScan = now;
    this.saveState(st);
    return items;
  }

  publicItems(items = this.items) { return items.map(({ paths, ...i }) => i); }

  // The cached Electron zip, when the Bob that's running already uses that version.
  spareElectron() {
    const dir = path.join(this.cfg.dataDir, 'electron');
    const running = process.versions.electron || (() => { try { return fs.readFileSync(path.join(appDir, '..', '..', 'electron-version.txt'), 'utf8').trim(); } catch { return ''; } })();
    if (!running) return '';
    const zip = path.join(dir, `electron-v${running}-win32-x64.zip`);
    return fs.existsSync(zip) ? zip : '';
  }

  oldLogLines(cutoff) {
    let text = '';
    try { text = fs.readFileSync(this.cfg.logbook, 'utf8'); } catch { return { lines: [], bytes: 0 }; }
    const day = dateOf(cutoff);
    const lines = text.split('\n').filter((l) => { const m = l.match(/^- (\d{4}-\d{2}-\d{2})/); return m && m[1] < day; });
    return { lines, bytes: lines.reduce((n, l) => n + Buffer.byteLength(l) + 1, 0), day };
  }

  // ---------- Tidying ----------
  // choices: [{ key, action }], action = the item's def, another of its actions, or 'keep'.
  // auto: true when the housekeeper does it by itself (only kinds the user set to automatic).
  async tidy(choices, { auto = false } = {}) {
    const byKey = new Map(this.items.map((i) => [i.key, i]));
    const st = this.state();
    const out = [];
    for (const c of [].concat(choices || [])) {
      const it = byKey.get(String(c.key));
      if (!it) continue;
      const action = c.action === 'keep' ? 'keep' : it.actions.includes(c.action) ? c.action : it.def;
      try {
        if (action === 'keep') { st.kept[it.key] = Date.now(); out.push({ key: it.key, done: 'kept' }); continue; }
        const what = await this.doItem(it, action);
        this.log(`${auto ? 'tidied by itself' : 'tidied'}: ${what}`);
        out.push({ key: it.key, done: action, what });
      } catch (e) { out.push({ key: it.key, error: e.message }); this.log(`couldn't tidy ${it.label}: ${e.message}`); }
      this.items = this.items.filter((x) => x.key !== it.key);
    }
    // "Keep" answers older than a year are forgotten (the item is asked about again if it's still old).
    for (const k of Object.keys(st.kept)) if (Date.now() - st.kept[k] > 365 * 864e5) delete st.kept[k];
    this.saveState({ ...this.state(), kept: st.kept });
    return out;
  }

  async doItem(it, action) {
    const cfg = this.cfg;
    if (it.kind === 'chats') {
      if (this.state().pins.chats.includes(it.ref)) throw new Error('pinned');
      let left = '';
      if (action === 'summarize') { left = await this.leaveSummary(it.ref); }
      const r = recycle(cfg, chatFiles(cfg, it.ref));
      if (r.refused.length) throw new Error('a file could not go to the Recycle Bin');
      this.brain.sessions?.delete(it.ref);
      this.topics.dropMessages(it.ref);
      return `chat "${it.label}" to the Recycle Bin${left ? ' (its summary stays)' : ''}`;
    }
    if (it.refId) {
      const r = this.brain.refs.find(it.refId);
      if (r) { recycle(cfg, [this.brain.refs.pathOf(r)]); this.brain.refs.remove(r.id); }
      return `picture "${it.label}" to the Recycle Bin`;
    }
    if (it.paths) {
      const r = recycle(cfg, it.paths);
      if (r.refused.length) throw new Error('not in a folder Bob may tidy');
      return `${it.label} (${Math.round(it.bytes / 1024)} KB) to the Recycle Bin`;
    }
    if (it.key === 'tasks') {
      const hk = this.settings, now = Date.now();
      const before = this.brain.queue.length;
      this.brain.queue = this.brain.queue.filter((j) => !(['done', 'failed', 'cancelled'].includes(j.state) && now - (j.doneAt || j.at || 0) > ageMs(hk.tasks)));
      this.brain.saveQueue?.();
      return `${before - this.brain.queue.length} finished tasks from the list`;
    }
    if (it.key === 'logbook') {
      const { lines } = this.oldLogLines(Date.now() - ageMs(this.settings.logs));
      if (!lines.length) return 'nothing (already tidy)';
      const old = path.join(cfg.dataDir, `logbook-before-${dateOf(Date.now() - ageMs(this.settings.logs))}.md`);
      fs.writeFileSync(old, lines.join('\n') + '\n');
      recycle(cfg, [old]);
      const drop = new Set(lines);
      const text = fs.readFileSync(cfg.logbook, 'utf8').split('\n').filter((l) => !drop.has(l)).join('\n');
      fs.writeFileSync(cfg.logbook, text);
      return `${lines.length} old logbook lines (to the Recycle Bin as ${path.basename(old)})`;
    }
    if (it.key === 'memory-repeats') {
      const text = fs.readFileSync(cfg.memoryFile, 'utf8');
      const { repeats, text: tidy } = memoryRepeats(text);
      backupMemory(cfg);
      fs.writeFileSync(cfg.memoryFile, tidy);
      return `${repeats} repeated memory lines (the old memory file is in the Recycle Bin)`;
    }
    if (it.kind === 'topics') { this.forget(it.ref, { mode: 'note' }); return `the chat parts of "${it.label}" (its note stays)`; }
    throw new Error('unknown item');
  }

  // ---------- Asking the brain (only while idle, and it stops the moment the user is back) ----------
  async brainLoaded() {
    const model = this.cfg.models?.bob;
    try { return Boolean(model) && await this.brain.engine.isLoaded(model); } catch { return false; }
  }

  async ask(prompt) {
    const model = this.cfg.models?.bob;
    if (!model) throw new Error('no brain picked yet');
    this.controller = new AbortController();
    try {
      const reply = await this.brain.engine.chat({ model, signal: this.controller.signal, messages: [{ role: 'system', content: 'You are a careful note-taker. Answer with JSON only, no other text.' }, { role: 'user', content: prompt }] });
      return parseJson(reply.content) || {};
    } finally { this.controller = null; }
  }

  async embed(texts) {
    // 1.5.72: a miss is tried again after 10 minutes (the model may have been downloaded since), not never again.
    if (this.noEmbed && this.now() - (this.noEmbedAt ?? Infinity) < 600e3) return null;
    const model = this.cfg.housekeeping?.embedModel || 'nomic-embed-text';
    const eng = this.brain.engine;
    // With Ollama as the engine, a downloaded nomic-embed-text file still works through Bob's own llama-server.
    const own = eng.embedder ? null : (this.ownEmbed ||= new Embedder(this.cfg, { resolve: (m) => catalogFileFor(this.cfg, m) }));
    try {
      if (eng.embed) { try { const v = await eng.embed(model, texts); this.noEmbed = false; return v; } catch (e) { if (!own?.ready(model)) throw e; } }
      if (!own?.ready(model)) throw new Error('no embedding model');
      const v = await own.embed(model, texts);
      this.noEmbed = false;
      return v;
    } catch { this.noEmbed = true; this.noEmbedAt = this.now(); return null; } // not on this replicant matrix: names and words are matched instead
  }

  // Facts Bob should keep go to the memory file, tagged with their topic, without repeats.
  // 1.5.79: with "Remember only what fits" on, a fact from a project's topic goes to that project's memory bank.
  addFacts(facts, topic = '', project = '') {
    const list = [].concat(facts || []).map((f) => String(f).replace(/\s+/g, ' ').trim()).filter((f) => f.length > 3 && f.length < 300).slice(0, 8);
    if (!list.length) return 0;
    let text = '';
    try { text = fs.readFileSync(this.cfg.memoryFile, 'utf8'); } catch {}
    const have = new Set(text.split('\n').map(memKey).filter(Boolean));
    const day = dateOf(Date.now());
    const add = list.filter((f) => { const k = memKey(f); if (have.has(k)) return false; have.add(k); return true; }).map((f) => `- ${f} (${day})${topic ? ` [topic: ${topic.replace(/[\][]/g, '')}]` : ''}${project && recallOn(this.cfg) ? ` [project: ${String(project).replace(/[\][]/g, '').slice(0, 60)}]` : ''}\n`);
    if (add.length) fs.appendFileSync(this.cfg.memoryFile, (text && !text.endsWith('\n') ? '\n' : '') + add.join(''));
    return add.length;
  }

  // Rolls the older part of a chat into its summary (the older messages themselves stay until the chat goes).
  async summarizeOlder(id) {
    const older = readOlder(this.cfg, id);
    const prev = readSummary(this.cfg, id) || { summary: '', upto: 0 };
    const fresh = older.slice(prev.upto || 0);
    if (!fresh.length) return false;
    const text = fresh.map((m) => `${m.role === 'user' ? (this.cfg.userName || 'User') : 'Bob'}: ${said(m).slice(0, 1500)}`).join('\n').slice(-24000);
    const r = await this.ask(`Here is the summary so far of the early part of a chat between ${this.cfg.userName || 'the user'} and Bob (their AI helper), then more of that early part.\nUpdate the summary. Keep decisions, facts, plans and open to-dos; drop small talk.\nAlso list lasting facts about ${this.cfg.userName || 'the user'} worth remembering for months (preferences, projects, plans). Never secrets or passwords.\nAnswer as {"summary": "under 200 words", "facts": ["..."]}.\n\nSUMMARY SO FAR:\n${prev.summary || '(none)'}\n\nMORE OF THE CHAT:\n${text}`);
    if (!r.summary) return false;
    writeSummary(this.cfg, id, { summary: String(r.summary).slice(0, 2500), upto: older.length, updated: Date.now() });
    const n = this.addFacts(r.facts);
    this.log(`summed up the early part of chat ${id}${n ? `; ${n} fact${n === 1 ? '' : 's'} to memory` : ''}`);
    return true;
  }

  // Sorts a chat's new messages into topics.
  async refreshTopics(id) {
    const all = spoken(wholeChat(this.cfg, id)).filter((m) => m.id && !m.forgotten);
    const since = this.topics.cursor(id);
    const fresh = all.filter((m) => (m.at || 0) > since).slice(0, 40);
    if (!fresh.length) return false;
    const known = this.topics.load().topics.slice(0, 80).map((t) => `${t.id}: ${t.project ? t.project + ' > ' : ''}${t.name}${t.note ? ` (note: ${t.note.slice(0, 160)})` : ''}`).join('\n');
    const lines = fresh.map((m) => `[${m.id}] ${m.role === 'user' ? (this.cfg.userName || 'User') : 'Bob'}: ${said(m).slice(0, 700)}${m.media?.length ? ` (made: ${m.media.map((x) => x.name).join(', ')})` : ''}`).join('\n');
    const r = await this.ask(`Sort these chat messages into topics, the way a good secretary files notes.\nUse an existing topic when one fits (give its id). A topic is specific ("Art style", "Updates") and sits in a project ("Starfall", "Bob", "Home"). Small talk goes nowhere.\nFor each topic give a one-line summary, a short note on where things landed (decisions, key facts), open questions, and lasting facts about ${this.cfg.userName || 'the user'} worth remembering (never secrets).\nAnswer as {"topics":[{"existing":"id or empty","name":"","project":"","summary":"","note":"","open":[""],"facts":[""],"msgIds":["..."]}]}\n\nEXISTING TOPICS:\n${known || '(none yet)'}\n\nMESSAGES:\n${lines}`);
    const at = Object.fromEntries(fresh.map((m) => [m.id, m.at || Date.now()]));
    const media = Object.fromEntries(fresh.map((m) => [m.id, (m.media || []).map((x) => x.url)]));
    const groups = (Array.isArray(r.topics) ? r.topics : []).map((g) => ({ ...g, pics: [].concat(g.msgIds || []).flatMap((x) => media[x] || []) }));
    // Embeddings catch "art direction" vs "art style"; without them, names are matched.
    let vecs = null;
    if (groups.length) vecs = await this.embed(groups.map((g) => `${g.project || ''} > ${g.name}: ${g.summary || ''}`));
    const touched = this.topics.absorb(id, groups.map((g, i) => ({ ...g, vec: vecs?.[i] })), {
      at,
      match: (g, topics) => {
        if (!g.vec) return null;
        let best = null, score = 0.86;
        for (const t of topics) { if (!t.vec) continue; const s = cosineLocal(g.vec, t.vec); if (s > score) { score = s; best = t; } }
        return best;
      }
    });
    for (const g of groups) this.addFacts(g.facts, g.name, g.project);
    this.topics.setCursor(id, Math.max(...fresh.map((m) => m.at || 0)));
    await this.refreshVectors();
    if (touched.length) this.log(`filed chat ${id} under ${touched.length} topic${touched.length === 1 ? '' : 's'}`);
    return true;
  }

  async refreshVectors() {
    const need = this.topics.load().topics.filter((t) => !t.vec);
    if (!need.length) return;
    const vecs = await this.embed(need.map(topicText));
    if (vecs) this.topics.setVectors(Object.fromEntries(need.map((t, i) => [t.id, vecs[i]])));
  }

  // Before a chat goes: file it under topics, then leave one paragraph behind.
  async leaveSummary(id) {
    const all = spoken(wholeChat(this.cfg, id));
    let summary = '';
    try {
      await this.refreshTopics(id);
      const text = all.map((m) => `${m.role === 'user' ? (this.cfg.userName || 'User') : 'Bob'}: ${said(m).slice(0, 800)}`).join('\n').slice(-20000);
      const prev = readSummary(this.cfg, id)?.summary || '';
      const r = await this.ask(`Write one paragraph (under 120 words) saying what this chat was about and where it landed, plus lasting facts about ${this.cfg.userName || 'the user'} worth remembering (never secrets).\nAnswer as {"summary":"","facts":[""]}.\n\n${prev ? `EARLIER PART, SUMMED UP:\n${prev}\n\n` : ''}CHAT:\n${text}`);
      summary = String(r.summary || '').slice(0, 1500);
      this.addFacts(r.facts);
    } catch { /* no brain right now: keep the title and dates only */ }
    const list = this.summaries();
    list.unshift({ id, title: all.length ? chatTitleOf(all) : id, summary: summary || '(Bob had no brain loaded when this chat was tidied, so only its title and dates were kept.)', from: all[0]?.at || 0, to: all.at(-1)?.at || 0, removed: Date.now() });
    writeJsonAtomic(this.summariesFile, list.slice(0, 2000), 0);
    return summary;
  }

  get summariesFile() { return path.join(this.cfg.dataDir, 'chat-summaries.json'); }
  summaries() { try { return JSON.parse(fs.readFileSync(this.summariesFile, 'utf8')); } catch { return []; } }

  // The chat moments a topic came from, for the Topics page (newest first).
  topicMessages(t) {
    const out = [];
    for (const s of t.spans || []) {
      const ids = new Set(s.msgIds);
      const all = wholeChat(this.cfg, s.session);
      const title = chatTitleOf(spoken(all));
      for (const m of all) if (m.id && ids.has(m.id)) out.push({ session: s.session, chat: title, msgId: m.id, role: m.role, at: m.at || 0, text: said(m).replace(/\s+/g, ' ').slice(0, 300), media: (m.media || []).map((x) => x.url) });
    }
    return out.sort((a, b) => b.at - a.at).slice(0, 300);
  }

  // ---------- Forgetting a topic ----------
  // mode: 'note' = forget what was said but keep the topic's note; 'all' = the note and its memory lines go too.
  forgetPreview(id, { mode = 'note' } = {}) {
    const t = this.topics.get(id);
    if (!t) throw new Error('No such topic.');
    const chats = [];
    const pics = new Set();
    for (const s of t.spans || []) {
      const ids = new Set(s.msgIds);
      const msgs = wholeChat(this.cfg, s.session).filter((m) => ids.has(m.id));
      if (!msgs.length) continue;
      chats.push({ session: s.session, count: msgs.length, sample: msgs.slice(0, 3).map((m) => said(m).replace(/\s+/g, ' ').slice(0, 100)) });
      for (const m of msgs) for (const x of m.media || []) pics.add(x.url);
    }
    // Pictures used only by this topic (not in any other topic or in a message that stays).
    const others = new Set(this.topics.load().topics.filter((x) => x.id !== id).flatMap((x) => x.pics || []));
    const onlyHere = [...pics, ...(t.pics || [])].filter((u, i, a) => a.indexOf(u) === i && !others.has(u) && /^\/images\//.test(u));
    let memory = [];
    try { memory = fs.readFileSync(this.cfg.memoryFile, 'utf8').split('\n').filter((l) => tagOf(l) === normName(t.name)); } catch {}
    return { topic: { id: t.id, name: t.name, project: t.project, note: t.note, pinned: t.pinned }, mode, chats, messages: chats.reduce((n, c) => n + c.count, 0), pictures: onlyHere, memory: mode === 'all' ? memory : [], keepsNote: mode !== 'all' };
  }

  forget(id, { mode = 'note', pictures = false } = {}) {
    const t = this.topics.get(id);
    if (!t) throw new Error('No such topic.');
    if (t.pinned) throw new Error(`"${t.name}" is pinned. Unpin it first.`);
    const pv = this.forgetPreview(id, { mode });
    let n = 0;
    for (const s of t.spans || []) n += this.redact(s.session, new Set(s.msgIds), t.name);
    if (mode === 'all') {
      try {
        const text = fs.readFileSync(this.cfg.memoryFile, 'utf8');
        const kept = text.split('\n').filter((l) => tagOf(l) !== normName(t.name));
        if (kept.length !== text.split('\n').length) { backupMemory(this.cfg); fs.writeFileSync(this.cfg.memoryFile, kept.join('\n')); }
      } catch {}
      this.topics.remove(id);
    } else {
      this.topics.change(id, (x) => { x.spans = []; x.pics = []; x.fade = null; x.vec = x.vec || null; x.forgotten = Date.now(); });
    }
    let gone = 0;
    if (pictures && pv.pictures.length) gone = recycle(this.cfg, pv.pictures.map((u) => findOutput(this.cfg, decodeURIComponent(u.slice(8))))).gone.length;
    this.log(`forgot "${t.name}": ${n} message${n === 1 ? '' : 's'} from chats${mode === 'all' ? ', its note and memory lines' : ' (the note stays)'}${gone ? `, ${gone} picture${gone === 1 ? '' : 's'}` : ''}; the chats as they were are in the Recycle Bin`);
    return { messages: n, pictures: gone, keptNote: mode !== 'all' };
  }

  // Swaps a topic's exchanges in one chat (a message plus Bob's tool calls and reply to it) for a short placeholder.
  // The chat as it was goes to the Recycle Bin first.
  redact(session, ids, name) {
    let count = 0;
    const fix = (msgs) => {
      const out = [];
      let dropping = false, changed = false;
      for (const m of msgs) {
        if ((m.role === 'user' || (m.role === 'assistant' && !m.tool_calls)) && m.id && ids.has(m.id)) {
          count++; changed = true;
          if (m.role === 'user') { dropping = true; if (!out.at(-1)?.forgotten) out.push({ role: 'user', content: `[forgotten: ${name}]`, id: m.id, at: m.at, forgotten: true }); continue; }
          if (!out.at(-1)?.forgotten) out.push({ role: 'user', content: `[forgotten: ${name}]`, id: m.id, at: m.at, forgotten: true });
          dropping = false; continue;
        }
        if (m.role === 'user') dropping = false;
        if (dropping) { changed = true; continue; } // Bob's tool calls and results for a forgotten message
        out.push(m);
      }
      // Bob's turn always follows a user turn: put a short reply after each placeholder.
      const final = [];
      for (let i = 0; i < out.length; i++) {
        final.push(out[i]);
        if (out[i].forgotten && out[i + 1]?.role !== 'assistant') final.push({ role: 'assistant', content: '(Forgotten, as you asked.)', forgotten: true, at: out[i].at });
      }
      return { msgs: final, changed };
    };
    const cur = fix(readChat(this.cfg, session)), old = fix(readOlder(this.cfg, session));
    if (cur.changed) { backupToBin(this.cfg, path.join(this.cfg.dataDir, 'sessions', safeId(session) + '.json'), 'before forgetting'); writeChat(this.cfg, session, stampMessages(cur.msgs)); }
    if (old.changed) { backupToBin(this.cfg, path.join(this.cfg.dataDir, 'sessions', safeId(session) + '.older.json'), 'before forgetting'); writeOlder(this.cfg, session, old.msgs); writeSummary(this.cfg, session, { summary: '', upto: 0, updated: Date.now() }); }
    if (cur.changed || old.changed) this.brain.sessions?.delete(session);
    this.topics.dropMessages(session, ids);
    return count;
  }

  // ---------- The idle round ----------
  idle() {
    const b = this.brain;
    return !b.turns?.size && !(b.queue || []).some((j) => j.state === 'waiting' || j.state === 'working') && Date.now() - b.lastActivity >= IDLE_MS;
  }

  // force: the user pressed "Tidy up now" (runs even if Bob isn't idle or his brain isn't loaded).
  // 1.5.79: "Remember only what fits" matches memory lines by meaning. Their vectors are made here, while Bob is
  // idle (never in the Gaming session), so a message only waits for its own. Works with housekeeping off.
  async fillMemoryVectors() {
    if (!recallOn(this.cfg) || gaming(this.cfg)) return 0;
    let text = '';
    try { text = fs.readFileSync(this.cfg.memoryFile, 'utf8'); } catch { return 0; }
    const model = this.cfg.housekeeping?.embedModel || 'nomic-embed-text';
    this.memVecs ||= new MemoryVectors(this.cfg);
    return this.memVecs.fill(parseMemory(text), (texts) => this.embed(texts), model);
  }

  async tick({ force = false } = {}) {
    if (recallOn(this.cfg) && (force || this.idle()) && !this.working) { try { await this.fillMemoryVectors(); } catch {} }
    const hk = this.settings;
    if (!force && (!hk.enabled || !this.idle())) return { skipped: true };
    if (this.working) return { busy: true };
    this.working = true;
    const did = { summaries: 0, topics: 0, auto: 0, ask: 0 };
    try {
      const think = force || hk.wakeBrain || await this.brainLoaded();
      if (think) {
        for (const id of chatIds(this.cfg)) {
          if (!force && !this.idle()) break;
          try {
            if (await this.summarizeOlder(id)) did.summaries++;
            if (await this.refreshTopics(id)) did.topics++;
          } catch (e) { if (!force && !this.idle()) break; did.error = e.message; } // the user is back, or the brain said no
        }
      }
      const st = this.state();
      if (force || Date.now() - st.lastScan > SCAN_EVERY) {
        const items = this.scan();
        const auto = items.filter((i) => hk[i.kind]?.mode === 'auto' && hk.enabled);
        if (auto.length) did.auto = (await this.tidy(auto.map((i) => ({ key: i.key, action: i.def })), { auto: true })).filter((r) => r.done && r.done !== 'kept').length;
        did.ask = this.items.length;
        const s2 = this.state();
        if (did.ask && (force || Date.now() - s2.lastAsk > ASK_EVERY)) {
          this.brain.broadcast?.({ type: 'tidy', count: did.ask, bytes: this.items.reduce((n, i) => n + (i.bytes || 0), 0) });
          this.saveState({ ...s2, lastAsk: Date.now() });
        }
      }
      this.saveState({ ...this.state(), lastRun: Date.now() });
      return did;
    } finally { this.working = false; }
  }
}

const cosineLocal = (a, b) => { let d = 0, x = 0, y = 0; for (let i = 0; i < a.length; i++) { d += a[i] * b[i]; x += a[i] * a[i]; y += b[i] * b[i]; } return x && y ? d / Math.sqrt(x * y) : 0; };
const tagOf = (line) => { const m = String(line).match(/\[topic:\s*([^\]]+)\]/i); return m ? normName(m[1]) : ''; };
const chatTitleOf = (msgs) => { const u = msgs.find((m) => m.role === 'user'); return u ? said(u).replace(/\s+/g, ' ').slice(0, 70) : '(empty chat)'; };
function backupMemory(cfg) {
  // The memory file lives in the inn folder; its "before" copy is made in inn\bob so it can go to the Recycle Bin.
  const copy = path.join(cfg.dataDir, 'tidy-backups', `bob-memory (before tidying ${new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-')}).md`);
  fs.mkdirSync(path.dirname(copy), { recursive: true });
  fs.copyFileSync(cfg.memoryFile, copy);
  if (mayRecycle(cfg, copy)) recycle(cfg, [copy]);
}

// "Forget what we said about X": Bob shows what would go and asks first (an approval card), every time.
export function forgetTopicTool(brain) {
  const hk = () => brain.housekeeper;
  const list = () => hk().topics.list().slice(0, 30).map((t) => `${t.project ? t.project + ' > ' : ''}${t.name}`).join('; ');
  return {
    schema: {
      type: 'function',
      function: {
        name: 'forget_topic',
        description: 'Forget what was said about a topic, when {{USER}} asks. {{USER}} sees a preview and decides. mode note (default) keeps the short topic note; all forgets that too.',
        parameters: { type: 'object', properties: { topic: { type: 'string', description: 'The topic, in the user\'s words.' }, mode: { type: 'string', enum: ['note', 'all'] } }, required: ['topic'] }
      }
    },
    check({ topic, mode }) {
      const t = hk().topics.find(topic);
      if (!t || t.pinned) return null; // run() explains
      const pv = hk().forgetPreview(t.id, { mode: mode === 'all' ? 'all' : 'note' });
      const sample = pv.chats.flatMap((c) => c.sample).slice(0, 3).map((x) => `"${x}"`).join(', ');
      return { text: `Forget "${t.project ? t.project + ' > ' : ''}${t.name}"? ${pv.messages} message${pv.messages === 1 ? '' : 's'} in ${pv.chats.length} chat${pv.chats.length === 1 ? '' : 's'} become "[forgotten]"${sample ? ` (like ${sample})` : ''}. ${mode === 'all' ? `The topic note${pv.memory.length ? ` and ${pv.memory.length} memory line${pv.memory.length === 1 ? '' : 's'}` : ''} go too.` : 'The short topic note stays.'} The chats as they are now go to the Recycle Bin first, so this can be undone.` };
    },
    async run({ topic, mode }) {
      const t = hk().topics.find(topic);
      if (!t) return `There's no topic like "${topic}". Topics so far: ${list() || 'none yet (Bob files chats under topics when housekeeping is on, or from the Topics page)'}.`;
      if (t.pinned) return `"${t.name}" is pinned, so it stays. The user can unpin it on the Topics page first.`;
      const r = hk().forget(t.id, { mode: mode === 'all' ? 'all' : 'note' });
      return `Forgot "${t.name}": ${r.messages} message${r.messages === 1 ? '' : 's'}${r.keptNote ? '; the topic note stays' : ', its note and memory lines'}. The old chats are in the Recycle Bin.`;
    },
    summary: ({ topic }) => `forget topic: ${String(topic).slice(0, 60)}`
  };
}

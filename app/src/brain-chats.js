// Chats and memory: each chat's messages, saving and trimming them, history for the window, and recalling memories.
// Methods of the Brain class. Split out of brain.js.
import { expiryOn, memoryForPrompt, whereOn, projectOfCall } from './memory-more.js';
import { today } from './tools.js';
import { readText, writeJson } from './vault.js';
import { recallOn, alwaysText, parseMemory, activeProject, pickMemories, MemoryVectors, recallText } from './recall.js';
import { vecKey, asQuery, embedModel } from './embed-prefix.js';
import path from 'node:path';
import { isGuestId } from './guest-chat.js';
import { stampMessages, keepOlder, readSummary } from './chats.js';
import { chatBrain } from './brain-mode.js';
import { causeLine } from './retry.js';
import { pinsPrompt } from './pins.js';
import { hkSettings } from './housekeeping.js';
import { gaming } from './sessions.js';
import { raceTimeout } from './hang-guard.js';
import { smartNotesOn, notesPrompt } from './notes.js';
import { historyKeep, COMPACT_KEEP } from './brain-words.js';

// Methods of the Brain class, put on it in its main file with the same rules as the methods written inside it.
export const chatParts = {
  // forText (helpers' jobs): with "Relevant memories only" on, the lines that fit the job, matched by words.
  memory(forText = '') {
    try {
      const day = expiryOn(this.cfg) ? today(this.cfg) : ''; // "Expiring memories": a line past its day isn't read
      const m = memoryForPrompt(readText(this.cfg.memoryFile), this.cfg, day);
      // 1.5.79: with recall on, the instructions keep only the [always] lines; the rest come per message (recall()).
      if (recallOn(this.cfg)) {
        const always = alwaysText(m, { today: day });
        if (!forText) return always;
        const lines = parseMemory(m, { today: day });
        const { project } = activeProject(this.cfg, forText, { bankNames: [...new Set(lines.map((l) => l.project).filter(Boolean))] });
        const picked = pickMemories(lines, { text: forText, project, strict: whereOn(this.cfg) }).filter((l) => !l.always);
        return [always, picked.map((l) => `- ${l.text}${l.project ? ` [${l.project}]` : ''}`).join('\n')].filter(Boolean).join('\n');
      }
      return m.length > 4000 ? m.slice(-4000) : m;
    } catch { return ''; }
  },
  // 1.5.79: the memory lines that fit this message, from the general bank and the active project's bank.
  async recallMemories(sessionId, text, { vec = null, topicProject = '' } = {}) {
    let m = '';
    try { m = readText(this.cfg.memoryFile); } catch { return ''; }
    const lines = parseMemory(m, { today: expiryOn(this.cfg) ? today(this.cfg) : '' });
    if (!lines.length) return '';
    this.memProject ||= new Map();
    const bankNames = [...new Set(lines.map((l) => l.project).filter(Boolean))];
    const { project, why } = activeProject(this.cfg, text, { sticky: this.memProject.get(sessionId) || '', topicProject, bankNames });
    if (sessionId && why === 'named') this.memProject.set(sessionId, project);
    const hk = this.housekeeper;
    const model = this.cfg.housekeeping?.embedModel || 'nomic-embed-text';
    const vecs = vec && hk ? (hk.memVecs ||= new MemoryVectors(this.cfg)).load(vecKey(model)) : {};
    const picked = pickMemories(lines, { text, project, qvec: vec, vecs, strict: whereOn(this.cfg) });
    const fresh = picked.filter((l) => !l.always);
    this.lastRecall = { at: Date.now(), session: sessionId, project, lines: fresh.length, of: lines.length, by: vec ? 'meaning' : 'words' };
    return recallText(fresh, { project, user: this.cfg.userName || 'the user' });
  },
  // "Per-project memories" (memory-more.js): a tool that worked on a file in one project's folder
  // makes that the chat's project, so its memory bank comes back on the next message. Off: nothing changes.
  noteWhereWorking(sessionId, args) {
    if (!sessionId || !whereOn(this.cfg)) return '';
    const project = projectOfCall(this.cfg, args);
    if (project) (this.memProject ||= new Map()).set(sessionId, project);
    return project;
  },
  session(id) {
    if (!this.sessions.has(id)) {
      let msgs = [];
      try { msgs = JSON.parse(readText(this.sessionFile(id))); } catch (e) { if (e.code === 'VAULT_LOCKED') return msgs; } // 🔒 a locked chat is never cached as empty
      this.sessions.set(id, msgs);
    }
    return this.sessions.get(id);
  },
  sessionFile(id) { return path.join(this.sessionDir, id.replace(/[^a-zA-Z0-9-]/g, '') + '.json'); },
  saveSession(id) {
    if (isGuestId(id)) return; // a guest chat is never written to disk (guest-chat.js)
    const msgs = stampMessages(this.session(id));
    // Bob reads the last 40 messages every turn (more for a big-memory brain: historyKeep). Older ones move to the chat's older file (word for word)
    // and the housekeeper sums them up when Bob is idle; they used to be dropped without a trace.
    const dropped = [];
    const lastUser = msgs.map((m) => m.role).lastIndexOf('user');
    let brainCtxNow = 0; try { brainCtxNow = Number(chatBrain(this.cfg)?.ctx) || 0; } catch {}
    const keep = historyKeep(brainCtxNow);
    if (lastUser >= 0 && msgs.length - lastUser > keep) {
      // One turn longer than the whole window (a runaway tool loop): trimming from the front would drop the
      // question too and leave an empty chat. Keep the question and what was said; the tool steps go to the older file.
      const turn = msgs.slice(lastUser + 1);
      const said = turn.filter((m) => m.role === 'assistant' && !m.tool_calls?.length && (String(m.content || '').trim() || m.media?.length || m.correction)).slice(-(keep - 1));
      dropped.push(...msgs.slice(0, lastUser), ...turn.filter((m) => !said.includes(m)));
      msgs.splice(0, msgs.length, msgs[lastUser], ...said);
    }
    while (msgs.length > keep) dropped.push(msgs.shift());
    while (msgs.length && msgs[0].role !== 'user') dropped.push(msgs.shift()); // never start mid tool-call
    if (dropped.length) { try { keepOlder(this.cfg, id, dropped); } catch {} }
    for (const m of msgs) delete m.images; // pictures stay on the shelf; Bob keeps the description
    try { writeJson(this.cfg, this.sessionFile(id), msgs); } catch {} // 🔒 locked when Lock my chats and memory is on
  },
  // Item 13 "Sum up and carry on": everything but the last few messages moves to the chat's older part (word for word,
  // as when a chat passes its length), and the housekeeper sums that older part up now instead of waiting for idle.
  // The chat Bob reads each turn gets short again, so the brain has room. Not while a job of this chat runs.
  async compactChat(id, keep = COMPACT_KEEP) {
    if ([...this.turns.values()].some((t) => t?.sessionId === id) || this.queue.some((j) => j.sessionId === id && j.state !== 'done')) return { error: 'Bob is still on this chat. Wait until he has finished.' };
    const msgs = this.session(id);
    stampMessages(msgs);
    let cut = Math.max(0, msgs.length - keep);
    while (cut > 0 && msgs[cut]?.role !== 'user') cut--; // start on your message, never mid tool-call
    if (cut <= 0) return { moved: 0, kept: msgs.length };
    const dropped = msgs.splice(0, cut);
    try { keepOlder(this.cfg, id, dropped); } catch (e) { msgs.unshift(...dropped); return { error: `Couldn't move the older part: ${e.message}` }; }
    this.saveSession(id);
    this.log('chat', `summed up and carried on: ${dropped.length} older messages of chat ${id} moved to its older part`);
    let summed = false;
    try { summed = await this.housekeeper.summarizeOlder(id); } catch (e) { this.log('side', `summing up chat ${id} didn't work: ${causeLine(e).slice(0, 200)}`); }
    return { moved: dropped.length, kept: msgs.length, summed };
  },
  // Leaving a guest chat: its messages go from Bob's working memory too.
  forgetGuest(id) { if (isGuestId(id)) this.sessions.delete(id); },
  history(id) {
    return this.session(id)
      .filter((m) => (m.role === 'user' || m.role === 'assistant') && (m.content || m.media?.length || m.correction))
      .map((m) => ({ role: m.role, id: m.id, at: m.at, ...(m.forgotten ? { forgotten: true } : {}), content: m.role === 'user' && m.text != null ? m.text : (m.showText || m.content || ''), ...(m.step ? { step: true } : {}), ...(m.media?.length ? { media: m.media } : {}), ...(m.correction ? { correction: m.correction } : {}), ...(m.replaced ? { replaced: true } : {}), ...(m.edited ? { edited: m.edited, was: m.was ?? '', ...(m.editedBy === 'you' ? { editedBy: 'you' } : {}) } : {}), ...(m.role === 'assistant' && m.steps?.length ? { steps: m.steps } : {}), ...(m.role === 'user' && m.versions?.length ? { versions: m.versions } : {}), pics: (m.refs || []).map((id) => this.refs.find(id)).filter(Boolean).map((r) => ({ name: r.name, url: `/refs/${r.file}` })) }));
  },
  // What Bob carries from earlier, instead of the whole old chat: the summary of this chat's older part,
  // and the topic notes closest to what the user just said.
  async recall(sessionId, text) {
    if (isGuestId(sessionId)) return ''; // a guest chat reads no memory (guest-chat.js)
    const parts = [];
    try { const pinned = pinsPrompt(this.cfg, sessionId, this.session(sessionId), this.cfg.userName || 'the user'); if (pinned) parts.push(pinned); } catch (e) { this.log('side', `pinned messages didn't load: ${causeLine(e).slice(0, 200)}`); } // Pin messages (pins.js)
    const sum = sessionId ? readSummary(this.cfg, sessionId)?.summary : '';
    if (sum) parts.push(`Earlier in this chat (summed up): ${sum}`);
    try {
      const hk = this.housekeeper;
      const recall = recallOn(this.cfg);
      let vec = null, topicProject = '';
      // 1.5.79: "Relevant memories only" embeds the message too (same 1.5 s limit; words are matched if it's slow).
      const wantVec = hk && (hkSettings(this.cfg).enabled || recall) && !gaming(this.cfg);
      if (hk && hk.topics.load().topics.length) {
        if (wantVec) vec = (await raceTimeout(hk.embed([asQuery(embedModel(this.cfg), text)]), 1500, null))?.[0] || null;
        const notes = hk.topics.relevant(text, { vec, k: 3 });
        topicProject = notes[0]?.project || '';
        if (notes.length) parts.push(`Notes from earlier talks (topics; the user can edit these):\n${notes.map((t) => `- ${t.project ? t.project + ' > ' : ''}${t.name}: ${(t.note || t.summary).slice(0, 600)}${t.open?.length ? ` Open: ${t.open.join('; ')}` : ''}`).join('\n')}`);
      } else if (recall && wantVec) vec = (await raceTimeout(hk.embed([asQuery(embedModel(this.cfg), text)]), 1500, null))?.[0] || null;
      this.recallVec = { text, vec }; // the turn's vector, reused by other matches this turn (how-tos)
      if (recall) { const mem = await this.recallMemories(sessionId, text, { vec, topicProject }); if (mem) parts.push(mem); }
      // Auto notes (notes.js): the quick notes that fit, and the project for a note's #tag.
      if (smartNotesOn(this.cfg)) {
        this.notesProject = activeProject(this.cfg, text, { sticky: (sessionId && this.memProject?.get?.(sessionId)) || '', topicProject }).project || topicProject || '';
        const fit = notesPrompt(this.cfg, text, { project: this.notesProject });
        if (fit) parts.push(fit);
      }
    } catch (e) { this.log('side', `memory and notes for this message didn't load: ${causeLine(e).slice(0, 200)}`); } // item 204: one line, the reply goes on
    return parts.join('\n\n');
  },
};

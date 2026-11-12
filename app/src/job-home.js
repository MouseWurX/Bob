// Where a job belongs (reliability item 236). Always on.
// A job keeps its chat by the chat's id, which never changes when the chat is renamed, and it also keeps, from the
// moment it was sent: the chat's name then, the person it belongs to (👥 profiles.js) and the folder Bob was saving in.
//   - A job sent by one person waits in Tasks while someone else has Bob open, so its answer never lands in another
//     person's chats (before, a waiting job ran in whoever's chats were open when its turn came).
//   - Tasks can name the chat and the folder even after the chat was renamed or the save folder changed.
import fs from 'node:fs';
import path from 'node:path';
import { chatTitle } from './chats.js';
import { readJson } from './vault.js';

export const HOME_WAIT = "a job sent by another person waits until they open Bob again";
const who = (cfg) => cfg?.profileNow || '';

export function jobHome(cfg, sessionId, { project = '', title = null } = {}) {
  let name = title;
  if (name == null) {
    try {
      const dir = cfg.sessionsDir || path.join(cfg.dataDir, 'sessions');
      const f = path.join(dir, String(sessionId || '').replace(/[^a-zA-Z0-9-]/g, '') + '.json');
      if (sessionId && fs.existsSync(f)) name = chatTitle(readJson(f, []));
    } catch {}
  }
  return { chat: sessionId || null, title: String(name || '').slice(0, 80), profile: who(cfg), folder: cfg.saveDir || cfg.painterDir || '', ...(project ? { project: String(project).slice(0, 60) } : {}) };
}

// The person whose job it is has Bob open now. A job from before this check (no home) belongs to whoever is in.
export const homeOpen = (cfg, job) => !job?.home || (job.home.profile || '') === who(cfg);

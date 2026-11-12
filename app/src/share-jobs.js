// Share jobs with my other Bobs (1.5.72, Settings > Bob-Net). Both switches are off unless you turn them on.
//
// "Send jobs to my other Bobs" (the asking Bob): a whole job from Tasks (a picture, a clip, a song, a sound, web research,
// or a Medium-and-up answer) goes to one of "My other Bobs" that can really do it, instead of waiting or failing here.
// Bob knows his limits, both ways:
//   - a job only leaves when this Bob can't do it here (no picture model, say), or it would wait (Gaming, or busy and
//     your "Borrow when:" says so);
//   - it only goes to a Bob that says, right now, that he can do that kind of job (he has the model, he isn't gaming,
//     his queue isn't full), the least busy first, your order breaking ties;
//   - a job that needs this computer (attached pictures, files, folders, programs, Hands, reminders, memory) never leaves.
// The reply, the OK cards and the finished files come back here; the files are copied into this Bob's save folder.
//
// "Take jobs from my other Bobs" (the Bob doing the work): only through the "Let my other replicant matrices in" door. A job from
// another Bob runs with thinking, web search (if it's on here) and the picture, clip, music and sound tools only: no
// files, folders, programs, Hands, memory or reminders on this computer. It isn't saved as a chat here. Its files stay in
// this Bob's save folder too (Made by Bob lists them), and only that job's own files can be fetched.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { cleanAddress, NEEDS, PROTOCOL, guestRefusal } from './share-brains.js';
import { jitter } from './retry.js'; // item 194
export const NEEDS_LIST = NEEDS;

// ---------- What a job needs ----------
// Words that mean the job needs this computer itself. Kept broad: a wrong "stay here" only costs a wait; a wrong "send"
// would hand off something the other Bob can't do.
const THIS_PC = /\b([a-z]:\\|~\/|\/users\/|my (pc|computer|laptop|desktop|files?|folders?|downloads|documents|pictures folder|projects?|drive|screen|clipboard)|this (pc|computer|folder|file)|folder|file|files|open|launch|run|install|uninstall|move|copy|rename|delete|zip|unzip|tidy|schedule|every (day|morning|week)|remind|remember|forget|note this|click|type into|convert|scan|defender|virus|password|email)\b/i;
const MUSIC = /\b(song|music|tune|track|melody|beat|chiptune|soundtrack|jingle|lyrics)\b/i;
const SFX = /\b(sound effects?|sfx|sound of|noise of)\b/i;
const MODEL3D = /\b(3d|3-d) (model|figurine|character|creature|statue|miniature|print)s?\b|\bfigurines?\b|\bminiatures?\b/i; // picture to 3D (model3d.js); exact parts stay here

export function jobNeed(job) {
  if (!job || job.guest || job.refs?.length) return null;
  const t = String(job.text || '');
  if (THIS_PC.test(t)) return null;
  if (job.kind === 'video') return 'video';
  if (job.kind === 'picture') return 'pictures';
  if (MODEL3D.test(t)) return 'model3d';
  if (MUSIC.test(t)) return 'music';
  if (SFX.test(t)) return 'sfx';
  if (job.kind === 'research') return 'web';
  if (job.effort && job.effort !== 'low' && ['chat', 'code', 'data'].includes(job.kind)) return 'think';
  return null;
}

// Can this Bob do that kind of job himself, right now?
export function canHere(brain, need, { can, webOn }) {
  if (need === 'pictures') return Boolean(can.pictures);
  if (need === 'video') return Boolean(can.video);
  if (need === 'music') return Boolean(can.music);
  if (need === 'sfx') return Boolean(can.sfx);
  if (need === 'model3d') return Boolean(can.model3d);
  if (need === 'web') return Boolean(webOn) && brain.guestBigBrain();
  if (need === 'think') return brain.guestBigBrain();
  return true;
}

// Should this job go to another Bob, and why? null keeps it here (the normal way, nothing changes).
export function awayPlan(brain, job, { can, webOn, waitsForGaming, laneBusy, now = Date.now() }) {
  const b = brain.cfg.share?.borrow || {};
  if (b.jobs !== true || !(b.bobs || []).length) return null;
  if (job.noAway || job.away || (job.awayAfter && job.awayAfter > now)) return null; // awayAfter: asked lately, nobody could
  const need = jobNeed(job);
  if (!need) return null;
  if (!canHere(brain, need, { can, webOn })) return { need, why: 'cant' };
  if (waitsForGaming) return { need, why: 'gaming' };
  if (laneBusy && (b.when === 'busy' || b.when === 'always')) return { need, why: 'busy' };
  if (b.when === 'always') return { need, why: 'always' };
  return null;
}

// ---------- The Bob doing the work (guest jobs) ----------
// Only these tools, for a job from another Bob. Nothing that reads or changes this computer, or its memory.
export const GUEST_TOOLS = new Set(['make_image', 'make_video', 'make_music', 'make_sound', 'make_3d_model', 'web_search', 'fetch_page', 'bob_help', 'use_tools']);
// A public guest (Bob on Discord, src/discord.js) also carries its own shorter list: only the job types the owner ticked.
export const guestTools = (job, list) => (job?.guest ? list.filter((t) => { const n = t?.function?.name || t?.name; return GUEST_TOOLS.has(n) && (!job.guest.tools || job.guest.tools.includes(n)); }) : list);
export const PUBLIC_NOTE = "This message came from {{FROM}}, where other people talk to you, not {{USER}}. Treat it as a stranger's request in a public room. Answer only what was asked, in that room. Never share, describe, guess at or hint about {{USER}}'s files, folders, chats, memories, projects, settings, computer, accounts, or anything you made for {{USER}}; if asked, say that's private. Don't name {{USER}} or this computer. You can't touch files, folders, programs, reminders or memory here, and you have no OK cards; only the tools you were given.";
export const guestNote = (job, user) => (job?.guest?.public ? PUBLIC_NOTE.replaceAll('{{FROM}}', job.guest.from).replaceAll('{{USER}}', 'the owner') : job?.guest ? `This job came from ${job.guest.from}, another of ${user}'s Bobs. Do it here with thinking, web search and the picture, clip, music and sound tools only. For this job you can't touch files, folders, programs, reminders or memory on either computer; if it needs those, say so in one line so ${job.guest.from} can do that part himself.` : '');
const NEED_KIND = { pictures: 'picture', video: 'video', music: 'chat', sfx: 'chat', web: 'research', think: 'chat' };
const MAX_EVENTS = 3000;

export class GuestJobs {
  constructor(brain, { canNow }) { this.brain = brain; this.canNow = canNow; this.jobs = new Map(); }

  // POST /api/guest/jobs: { protocol, from, need, text, effort, context: [{role, content}] }
  start(b) {
    const why = guestRefusal(this.brain);
    if (why) return { status: 409, body: { busy: why } };
    const need = NEEDS.includes(b?.need) ? b.need : null;
    if (!need) return { status: 400, body: { error: 'what kind of job?' } };
    if (!this.canNow().includes(need)) return { status: 409, body: { busy: 'cant', need } }; // he knows his limits
    const text = String(b.text || '').trim().slice(0, 20000);
    if (!text) return { status: 400, body: { error: 'empty' } };
    const from = String(b.from || 'another Bob').replace(/[\u0000-\u001f<>]/g, '').slice(0, 40) || 'another Bob';
    const sessionId = `guest-${crypto.randomBytes(6).toString('hex')}`;
    // A few lines of the asking chat, so "make that one bigger" still means something here. Words only.
    const context = [].concat(b.context || []).slice(-8).filter((m) => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string').map((m) => ({ role: m.role, content: m.content.slice(0, 2000) }));
    this.brain.sessions.set(sessionId, context);
    const effort = ['low', 'medium', 'high', 'extreme'].includes(b.effort) ? b.effort : 'low';
    const { jobId } = this.brain.enqueue(sessionId, text, [], effort, { guest: { from, need }, kind: NEED_KIND[need] });
    this.jobs.set(jobId, { id: jobId, sessionId, from, events: [], n: 0, subs: new Set(), files: new Set(), approvals: new Set(), done: false });
    this.brain.log('guest', `took a ${need} job from ${from}`);
    return { status: 200, body: { jobId } };
  }

  // Every broadcast passes through here; only this job's own events are kept for the Bob that sent it.
  watch(ev) {
    const g = ev?.turnId && this.jobs.get(ev.turnId);
    if (!g || g.done) return;
    const { turnId, sessionId, ...rest } = ev;
    if (['image', 'video', 'audio'].includes(rest.type) && typeof rest.url === 'string' && rest.url.startsWith('/images/')) { g.files.add(rest.url); delete rest.file; }
    if (rest.type === 'approval' && rest.id) g.approvals.add(String(rest.id));
    if (rest.type === 'made' || rest.type === 'think' || rest.type === 'think-start') return; // his own lists and thinking stay here
    // 1.5.133 lost-song fix: a Set it up or Download card can't be pressed from the other Bob, and the job here ends
    // without making anything. Say so to the Bob that asked, in plain words, instead of a button nobody sees.
    if (rest.type === 'offer-download' || rest.type === 'offer-setup') {
      const what = String(rest.type === 'offer-download' && rest.why === 'music' ? 'the music models' : rest.type === 'offer-setup' ? rest.what || rest.name || 'a part' : rest.name || 'a download').slice(0, 80);
      return this.push(g, { type: 'needs-setup', what, sizeGB: Number(rest.sizeGB) || 0 });
    }
    this.push(g, rest);
  }
  push(g, rest) {
    const e = { ...rest, n: ++g.n };
    if (g.events.length >= MAX_EVENTS) g.events.splice(0, g.events.length - MAX_EVENTS + 1);
    g.events.push(e);
    for (const res of g.subs) res.write(`data: ${JSON.stringify(e)}\n\n`);
    if (rest.type === 'done') {
      g.done = true;
      for (const res of g.subs) res.end();
      g.subs.clear();
      this.brain.sessions.delete(g.sessionId); // not kept as a chat here
      // 1.5.133: 6 hours (was 15 minutes), so a file that didn't come across the first time can still be fetched.
      setTimeout(() => this.jobs.delete(g.id), KEEP_FILES_MS).unref?.();
    }
  }

  // GET /api/guest/jobs/<id>/events?after=n: everything since n, then live. Safe to call again after a dropped line.
  events(id, after, req, res) {
    const g = this.jobs.get(id);
    if (!g) { res.writeHead(404, { 'content-type': 'application/json' }); return res.end('{"error":"no such job"}'); }
    res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-store' });
    for (const e of g.events) if (e.n > after) res.write(`data: ${JSON.stringify(e)}\n\n`);
    if (g.done) return res.end();
    g.subs.add(res);
    const ping = setInterval(() => res.write(': ping\n\n'), 15000);
    req.on('close', () => { clearInterval(ping); g.subs.delete(res); });
  }

  approve(id, b) {
    const g = this.jobs.get(id);
    if (!g || !g.approvals.has(String(b?.id))) return false;
    return this.brain.answerApproval(String(b.id), b.allow, b.rows, b.items);
  }

  stop(id) {
    if (!this.jobs.has(id)) return false;
    return this.brain.cancelJob(id);
  }

  // Only a file this job made, by the /images/ address it was shown at.
  file(id, url) { const g = this.jobs.get(id); return g && g.files.has(url) ? decodeURIComponent(url.slice(8)) : null; }
}

// Routes for the Bob doing the work. Through the door only (or this PC itself).
export async function guestRoute({ req, res, p, url, brain, body, send, serveFile, findOutput, cfg }) {
  const g = brain.guests;
  if (req.method === 'POST' && p === '/api/guest/jobs') { const r = g.start(await body(req).catch(() => ({}))); return send(res, r.status, r.body); }
  const m = p.match(/^\/api\/guest\/jobs\/([0-9a-f-]{36})\/(events|approve|stop|file)$/);
  if (!m) return false;
  const [, id, what] = m;
  if (what === 'events' && req.method === 'GET') return g.events(id, Number(url.searchParams.get('after')) || 0, req, res);
  if (what === 'approve' && req.method === 'POST') return send(res, g.approve(id, await body(req)) ? 200 : 404, { ok: true });
  if (what === 'stop' && req.method === 'POST') return send(res, 200, { stopped: g.stop(id) });
  if (what === 'file' && req.method === 'GET') {
    const name = g.file(id, String(url.searchParams.get('url') || ''));
    if (!name) return send(res, 404, { error: 'not found' });
    const f = findOutput(cfg, name);
    return serveFile(res, path.dirname(f), path.basename(f));
  }
  return send(res, 405, { error: 'no' });
}

// ---------- The asking Bob: send a job, bring back its reply, cards and files ----------
const WORDS = { pictures: 'make pictures', video: 'make clips', music: 'make music', sfx: 'make sound effects', web: 'search the web', think: 'think it through' };
export const needWords = (n) => WORDS[n] || 'do it';
export const awayWaitLine = (need) => `I can't ${needWords(need)} on this replicant matrix, and none of your other Bobs who can is free right now. It waits in Tasks, and I'll send it as soon as one is.`;
const NOT_STARTED_MS = 120000, QUIET_MS = 60000, RECONNECTS = 3;
const KEEP_FILES_MS = 6 * 3600e3;
const MAKES = { pictures: 'picture', video: 'clip', music: 'song', sfx: 'sound' }; // jobs that must bring a file back
// Tries a few times before giving up on a file: a Tailscale hiccup shouldn't lose a song.
async function fetchFile(lenders, lender, remoteId, url, { tries = 3, pause = [2000, 5000] } = {}) {
  let last;
  for (let i = 0; i < tries; i++) {
    try {
      const fr = await lenders.call(lender, `/api/guest/jobs/${remoteId}/file?url=${encodeURIComponent(url)}`, { timeout: 15000 });
      if (!fr.ok) throw new Error(`answered ${fr.status}`);
      return Buffer.from(await fr.arrayBuffer());
    } catch (e) { last = e; if (i < tries - 1) await new Promise((r) => setTimeout(r, jitter(pause[i] ?? pause.at(-1)))); }
  }
  throw last;
}

function uniqueFile(dir, name) {
  const base = path.basename(name).replace(/[^\w.() -]/g, '_').slice(0, 120) || 'from-another-bob';
  let f = path.join(dir, base);
  for (let i = 2; fs.existsSync(f) && i < 1000; i++) f = path.join(dir, base.replace(/(\.[^.]*)?$/, ` (${i})$1`));
  return f;
}

export async function sendAway(brain, job, plan, { lenders = brain.lenders, timers = { notStarted: NOT_STARTED_MS, quiet: QUIET_MS } } = {}) {
  const lender = await lenders.pickForJob(plan.need).catch(() => null);
  if (!lender) return false; // nobody free who can: the job carries on here the normal way
  const emit = (ev) => brain.broadcast({ ...ev, turnId: job.id, sessionId: job.sessionId });
  const ctl = new AbortController();
  const away = { name: lender.name, address: lender.address, need: plan.need, why: plan.why, remoteId: null, ctl };
  brain.awayJobs.set(job.id, away);
  Object.assign(job, { state: 'working', startedAt: Date.now(), steps: [], away: { name: lender.name, need: plan.need } });
  brain.saveQueue();
  const history = brain.session(job.sessionId).filter((m) => (m.role === 'user' || m.role === 'assistant') && !m.tool_calls && typeof (m.text ?? m.content) === 'string').slice(-8).map((m) => ({ role: m.role, content: String(m.text ?? m.content) }));
  let r;
  try {
    r = await lenders.call(lender, '/api/guest/jobs', { method: 'POST', body: { protocol: PROTOCOL, from: brain.cfg.windowsName || 'Bob', need: plan.need, text: job.text, effort: job.effort, context: history }, timeout: 5000 });
  } catch { r = null; }
  const j = r ? await r.json().catch(() => ({})) : {};
  if (!r?.ok || !j.jobId) {
    brain.awayJobs.delete(job.id);
    lenders.noteJobs(lender, j.busy || 'not reachable');
    Object.assign(job, { state: 'waiting', away: undefined }); // the caller decides: wait a minute, or carry on here
    brain.saveQueue();
    return false;
  }
  away.remoteId = j.jobId;
  emit({ type: 'start', text: job.text.slice(0, 140) });
  emit({ type: 'away', action: 'start', name: lender.name, need: plan.need, what: needWords(plan.need), why: plan.why });
  brain.log('away', `${plan.need} job sent to ${lender.name} (${plan.why})`);

  let reply = '', after = 0, started = false, finished = false, failed = '', drops = 0;
  const media = [], missing = [];
  const startedTimer = setTimeout(() => { if (!started) { failed = 'didn\'t start it'; ctl.abort(); } }, timers.notStarted);
  const handle = async (ev) => {
    after = Math.max(after, Number(ev.n) || 0);
    if (ev.type === 'start') { started = true; return; }
    if (ev.type === 'token' && typeof ev.text === 'string') { reply += ev.text; return emit({ type: 'token', text: ev.text }); }
    if (ev.type === 'token-undo') { const n = Math.max(0, Number(ev.chars) || 0); reply = reply.slice(0, Math.max(0, reply.length - n)); return emit({ type: 'token-undo', chars: n }); } // item 193
    if (ev.type === 'approval') { brain.awayApprovals.set(String(ev.id), { jobId: job.id }); return emit(ev); }
    if (ev.type === 'approval-result') { brain.awayApprovals.delete(String(ev.id)); return emit(ev); }
    if (['image', 'video', 'audio'].includes(ev.type) && typeof ev.url === 'string') {
      try {
        const buf = await fetchFile(lenders, lender, away.remoteId, ev.url, timers.fileTries ? { tries: timers.fileTries, pause: [5] } : undefined);
        fs.mkdirSync(brain.cfg.painterDir, { recursive: true });
        const f = uniqueFile(brain.cfg.painterDir, decodeURIComponent(ev.url.slice(8)));
        fs.writeFileSync(f, buf);
        const name = path.basename(f);
        const local = { type: ev.type, url: `/images/${encodeURIComponent(name)}`, file: f, ...(ev.song ? { song: ev.song } : {}) };
        try { brain.made?.add?.(f, { tool: ev.type, chat: job.sessionId, song: ev.song || null }); } catch {}
        media.push({ type: ev.type, url: local.url, name, ...(ev.song?.title ? { title: ev.song.title, sound: ev.song.sound } : {}) });
        return emit(local);
      } catch (e) {
        const name = ev.song?.title || decodeURIComponent(String(ev.url).slice(8));
        missing.push(name);
        brain.log('away', `${lender.name} made ${name}, but it didn't come across: ${e.message}`);
        return emit({ type: 'error', text: `${lender.name} made it (${name}), but the file didn't come across to this Bob. It's on ${lender.name}, in Made by Bob there. On your phone, the Chest has it too.` });
      }
    }
    if (ev.type === 'error') { failed = String(ev.text || 'failed').slice(0, 200); return emit({ type: 'error', text: `${lender.name}: ${failed}` }); }
    if (ev.type === 'needs-setup') {
      failed = `needs ${ev.what} set up first`;
      return emit({ type: 'error', text: `${lender.name} can't make this one yet: he needs ${ev.what}${ev.sizeGB ? ` (about ${ev.sizeGB} GB)` : ''} set up first. Open Bob on ${lender.name} to set it up, then ask me again.` });
    }
    if (ev.type === 'done') { finished = true; return; }
    if (['tool', 'announce', 'correction', 'held', 'house', 'aside'].includes(ev.type)) return emit(ev);
  };

  while (!finished && !ctl.signal.aborted) {
    let quiet;
    const life = new AbortController();
    const kick = () => { clearTimeout(quiet); quiet = setTimeout(() => life.abort(), timers.quiet); };
    try {
      kick();
      const er = await lenders.call(lender, `/api/guest/jobs/${away.remoteId}/events?after=${after}`, { signal: AbortSignal.any([ctl.signal, life.signal]), timeout: 8000 });
      if (er.status === 404) { failed = failed || 'lost the job (was he restarted?)'; break; }
      if (!er.ok) throw new Error(`answered ${er.status}`);
      let buf = '';
      const dec = new TextDecoder();
      for await (const chunk of er.body) {
        kick();
        buf += dec.decode(chunk, { stream: true });
        let i;
        while ((i = buf.indexOf('\n\n')) >= 0) {
          const line = buf.slice(0, i).trim(); buf = buf.slice(i + 2);
          if (line.startsWith('data:')) { try { await handle(JSON.parse(line.slice(5))); } catch {} }
        }
      }
      drops = 0;
    } catch { if (ctl.signal.aborted) break; }
    finally { clearTimeout(quiet); }
    if (!finished && ++drops > RECONNECTS) { failed = failed || 'went quiet partway through'; break; }
    if (!finished) await new Promise((res) => setTimeout(res, 2000));
  }
  clearTimeout(startedTimer);
  const stopped = ctl.signal.aborted && !failed;
  if (!finished) lenders.call(lender, `/api/guest/jobs/${away.remoteId}/stop`, { method: 'POST', body: {}, timeout: 3000 }).catch(() => {});
  brain.awayJobs.delete(job.id);
  for (const [id, a] of brain.awayApprovals) if (a.jobId === job.id) brain.awayApprovals.delete(id);

  if (!started && failed) {
    // He never got going: bring it back here, the normal way.
    emit({ type: 'away', action: 'back', name: lender.name, why: failed });
    Object.assign(job, { state: 'waiting', away: undefined, noAway: true, steps: [] });
    brain.saveQueue();
    emit({ type: 'done' });
    setTimeout(() => brain.pump(), 0);
    return true;
  }
  // 1.5.133 lost-song fix: a picture, clip, song or sound job that ends without a file isn't done, whatever the words say.
  const makes = MAKES[plan.need];
  if (finished && !failed && makes && !media.length) {
    failed = missing.length ? `made it, but it didn't come across` : `finished, but no ${makes} came back`;
    if (!missing.length) emit({ type: 'error', text: `${lender.name} finished, but no ${makes} came back, so it wasn't made. Try again runs it here or on another Bob.` });
  }
  // The chat here keeps the question and what came back, like any reply.
  const msgs = brain.session(job.sessionId);
  msgs.push({ role: 'user', content: job.text, at: job.at || Date.now() });
  msgs.push({ role: 'assistant', content: reply + (stopped ? '\n\n*(Stopped.)*' : !finished ? `\n\n*(${lender.name} ${failed}.)*` : ''), at: Date.now(), away: lender.name, ...(media.length ? { media } : {}) });
  brain.saveSession(job.sessionId);
  if (stopped) { job.state = 'cancelled'; emit({ type: 'token', text: '\n\n*(Stopped.)*' }); }
  else if (finished && !failed) job.state = 'done';
  else { job.state = 'failed'; job.error = `${lender.name} ${failed}`.slice(0, 200); if (!finished) emit({ type: 'error', text: `${lender.name} ${failed}. Try again runs it here or on another Bob.` }); }
  job.doneAt = Date.now();
  job.sentTo = lender.name; // 1.5.196: the finished job still says which Bob ran it (Tasks, /api/jobs)
  brain.saveQueue();
  emit({ type: 'done' });
  setTimeout(() => brain.pump(), 0);
  return true;
}

export function stopAway(brain, id) { const a = brain.awayJobs.get(id); if (!a) return false; a.ctl.abort(); return true; }

export async function answerAway(brain, id, allow, rows, items) {
  const a = brain.awayApprovals.get(String(id));
  const away = a && brain.awayJobs.get(a.jobId);
  if (!away) return false;
  const bob = brain.lenders.bobs().find((b) => b.address === away.address);
  if (!bob) return false;
  const r = await brain.lenders.call(bob, `/api/guest/jobs/${away.remoteId}/approve`, { method: 'POST', body: { id, allow, rows, items }, timeout: 5000 }).catch(() => null);
  return Boolean(r?.ok);
}

export { cleanAddress };

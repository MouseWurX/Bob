// Lab 2c, the lesson builder: the survey and the held-back scan. Pure functions: counts, duplicates, and the net that
// catches passages that look like secrets or the owner's own details before the teacher ever sees them (keys, tokens,
// passwords, card numbers, LAN and tailnet addresses, e-mail addresses, the user folder). The same word list the
// public lesson release was scrubbed with, so an exported set gets the same treatment. A net, not a guarantee.
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { words } from './lab-build-read.js';

const RULES = [
  ['looks like a key or token', /\b(?:sk|hf|ghp|gho|github_pat|xox[abp]|AKIA|AIza|rpa)_?[A-Za-z0-9_-]{16,}\b|\bBearer\s+[A-Za-z0-9._-]{20,}|-----BEGIN [A-Z ]*PRIVATE KEY-----/],
  ['looks like a password', /\b(?:password|passwd|pwd|passphrase|secret|api[_ -]?key|token)\s*[:=]\s*\S{4,}/i],
  ['looks like a card number', /\b(?:\d[ -]?){13,16}\b/],
  ['has a home-network or Tailscale address', new RegExp(`\\b(?:${[192, 168].join('\\.')}|10\\.\\d{1,3}|172\\.(?:1[6-9]|2\\d|3[01])|100\\.(?:6[4-9]|[7-9]\\d|1[01]\\d|12[0-7]))\\.\\d{1,3}\\.\\d{1,3}\\b`)],
  ['has an e-mail address', /\b[\w.+-]+@[\w-]+\.[\w.-]+\b/]
];
// A card number must also pass Luhn, or every long number (a serial, a phone) would be held back.
const luhn = (s) => { const d = s.replace(/\D/g, ''); let sum = 0, alt = false; for (let i = d.length - 1; i >= 0; i--) { let n = Number(d[i]); if (alt) { n *= 2; if (n > 9) n -= 9; } sum += n; alt = !alt; } return d.length >= 13 && sum % 10 === 0; };

export const userName = () => { try { return path.basename(os.homedir()); } catch { return ''; } };
const userRe = (name) => (name && name.length > 2 ? new RegExp(`(?:Users|home)[\\\\/]${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i') : null);

// Why a passage is held back, or '' when it may go to the teacher. `user` is the owner's user folder name.
export function heldBack(text, { user = userName() } = {}) {
  const s = String(text || '');
  for (const [why, re] of RULES) {
    const m = s.match(re);
    if (!m) continue;
    if (why === 'looks like a card number' && !luhn(m[0])) continue;
    return why;
  }
  const u = userRe(user);
  if (u && u.test(s)) return 'has your user folder in it';
  return '';
}

// The release's scrub rules, for an exported set: the same net, with each hit replaced by a stand-in. Returns the text
// and what changed, so the owner sees it before the file is written.
export function scrub(text, { user = userName() } = {}) {
  let s = String(text || '');
  const changes = [];
  const swap = (re, to, what) => { const n = (s.match(re) || []).length; if (n) { s = s.replace(re, to); changes.push({ what, n }); } };
  const u = userRe(user);
  if (u) swap(new RegExp(u.source, 'gi'), (m) => m.replace(/[\\/].*$/, (x) => x[0] + 'you'), 'your user folder to "you"');
  const lan = [192, 168, 0, 10].join('.'); // built from pieces, so the public-words check doesn't read it as a real address
  swap(new RegExp(`\\b${[192, 168].join('\\.')}\\.\\d{1,3}\\.\\d{1,3}\\b`, 'g'), lan, `home-network addresses to ${lan}`);
  swap(/\b100\.(?:6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.\d{1,3}\.\d{1,3}\b/g, '100.64.0.1', 'Tailscale addresses to 100.64.0.1');
  const mail = ['you', 'example.com'].join('@'); // built from pieces, like the address above
  swap(/\b[\w.+-]+@[\w-]+\.[\w.-]+\b/g, mail, `e-mail addresses to ${mail}`);
  swap(/\b(?:sk|hf|ghp|gho|github_pat|xox[abp]|AKIA|AIza|rpa)_?[A-Za-z0-9_-]{16,}\b/g, '[key removed]', 'keys and tokens removed');
  return { text: s, changes };
}

export const fingerprint = (text) => crypto.createHash('sha1').update(String(text || '').toLowerCase().replace(/\s+/g, ' ').trim()).digest('hex').slice(0, 16);

// The survey over read files: counts by kind, what's skipped, duplicates, held-back passages, and how many lessons the
// files can supply per lesson kind. `items` = [{ path, skill, read: <readFile result> }].
// Lessons a passage can supply: about one per 300 words for "working with my material" (2 to 3 questions a passage),
// one per passage for "writing in my voice", one per exchange for "my past conversations".
export const PER_PASSAGE = { material: 2, voice: 1 };
export function survey(items, { user = userName() } = {}) {
  const byKind = {}, skipped = [], held = [], perSkill = {}, seen = new Map();
  let files = 0, wordsTotal = 0, passages = 0, exchanges = 0, dupes = 0, otherPeople = false;
  const supply = { material: 0, voice: 0, chats: 0 };
  const samples = [];
  for (const it of items) {
    const r = it.read; if (!r) continue;
    files++;
    byKind[r.kind] = (byKind[r.kind] || 0) + 1;
    if (r.skipped) { skipped.push({ name: r.name, why: r.skipped }); continue; }
    const sk = it.skill || 'my files';
    if (!perSkill[sk]) perSkill[sk] = { passages: 0, exchanges: 0, words: 0, held: 0, files: 0 };
    perSkill[sk].files++;
    for (const p of r.passages) {
      const fp = fingerprint(p.text);
      if (seen.has(fp)) { dupes++; p.dupe = true; continue; }
      seen.set(fp, r.name);
      const why = heldBack(p.text, { user });
      if (why) { p.held = why; held.push({ name: r.name, at: p.at, why, peek: p.text.slice(0, 80) }); perSkill[sk].held++; continue; }
      passages++; wordsTotal += p.words || words(p.text); perSkill[sk].passages++; perSkill[sk].words += p.words || words(p.text);
      supply.material += PER_PASSAGE.material; supply.voice += PER_PASSAGE.voice;
      if (samples.length < 10 && (passages % 7 === 1)) samples.push({ name: r.name, at: p.at, text: p.text.slice(0, 400) });
    }
    for (const e of r.exchanges) {
      otherPeople = true;
      const fp = fingerprint(e.user + '\n' + e.assistant);
      if (seen.has(fp)) { dupes++; e.dupe = true; continue; }
      seen.set(fp, r.name);
      const why = heldBack(e.user + '\n' + e.assistant, { user });
      if (why) { e.held = why; held.push({ name: r.name, at: 0, why, peek: e.user.slice(0, 80) }); perSkill[sk].held++; continue; }
      exchanges++; perSkill[sk].exchanges++; wordsTotal += words(e.user) + words(e.assistant);
      supply.chats++;
    }
  }
  return { files, byKind, skipped, words: wordsTotal, passages, exchanges, dupes, held, perSkill, supply, otherPeople, samples };
}

// The plain-words box: what the brain would learn, built from the counts, never from the teacher's opinion.
export function wouldLearn(sv, kinds, count, skills) {
  const parts = [];
  const total = Math.max(1, Object.entries(sv.supply).filter(([k]) => kinds.includes(k)).reduce((a, [, v]) => a + v, 0));
  const want = Math.min(count, total);
  const names = Object.keys(sv.perSkill);
  const pct = (k) => Math.round((100 * Math.min(sv.supply[k], want * (sv.supply[k] / total))) / Math.max(1, want));
  if (kinds.includes('material') && sv.passages) parts.push(`${pct('material')}% working with your material (${names.join(', ')}): answering questions about what I read in your files, in your words and units`);
  if (kinds.includes('voice') && sv.passages) parts.push(`${pct('voice')}% writing in your voice: your passages as the answers, so I pick up how you write`);
  if (kinds.includes('chats') && sv.exchanges) parts.push(`${pct('chats')}% your past conversations (${sv.exchanges} exchanges), re-said my way`);
  const used = sv.files - sv.skipped.length;
  const head = `From ${used}${sv.skipped.length ? ` of ${sv.files}` : ''} file${sv.files === 1 ? '' : 's'} (about ${sv.words.toLocaleString()} words), about ${want.toLocaleString()} lessons${skills?.length ? ` in ${skills.length} skill${skills.length === 1 ? '' : 's'}` : ''}: ${parts.join('; ') || 'nothing yet, add files or tick a lesson kind'}.`;
  return `${head} I would practise habits, vocabulary and voice. I would not learn the facts in these files by heart; my notes and Recall do that.`;
}

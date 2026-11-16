// Facts first (16 Nov 2026, the owner's go after the 800-job read and run 3).
//
// What went wrong: in graded real-job runs Bob stated small facts from memory (free-plan limits, author names, causes,
// dates) that no search or file backed up. He also answered without opening a file he was given, and asked "which
// file?" before looking in Documents. Telling the brain to be careful isn't enough, so Bob's loop does the steps:
//
// 1. Check facts first. On a question of fact, the brain first writes down what it remembers (one quiet step, no
//    tools, kept hidden), then it must search or open the source before it answers. The answer goes with the source;
//    where the source and the memory disagree, it says so in one line. A fact nothing backs is left out or marked
//    "not checked". If every look-up failed, the app adds a plain note that the facts are unchecked.
//    On by default at Magnus and Maximus (High and Max). A setting turns it on at every level, or off.
//    Skipped for chat (hello, opinions, writing, code) and for questions about local files. Only when a web search
//    can run (Web search on); keyed search services are off by default and users add their own keys.
// 2. Read what you were given. When the ask names a file or folder, he reads it before he answers or asks a
//    question; when it points at "my documents" or "my notes" without a path, he looks in his readable folders
//    before he asks which one. A reliability fix: on unless switched off, at every level.
//
// Nothing here is trained in. It is all Bob's loop (brain-run-on.js), and the tool shapes don't change.
import { cleanEffort } from './moot.js';

export const FACT_MODES = ['high', 'all', 'off'];
// Settings key factsFirst: 'high' (Magnus and Maximus, the default), 'all' (every level) or 'off'.
export const cleanFactsFirst = (v) => (FACT_MODES.includes(v) ? v : 'high');
// Settings key readFirst: on unless switched off.
export const readFirstOn = (cfg) => cfg?.readFirst !== false;

// Tools that count as looking something up on the web, and as reading what's on this computer.
export const WEB_LOOKS = new Set(['web_search', 'fetch_page', 'browser_read', 'watch_page', 'osint_lookup']);
export const FILE_LOOKS = new Set(['read_file', 'list_folder', 'search_files', 'inspect_file', 'office_read', 'find_in_documents', 'code_map', 'compare_files', 'query_data', 'git_look']);
export const MAX_SIDE_BY_SIDE = 3; // searches he may run at once in one reply

// ---------- what kind of ask is it ----------
const PATHLIKE = /(?:[a-z]:\\|\\\\[\w.-]+\\|~\/|(?:^|\s)\/(?:home|users|mnt|tmp|var|etc|opt)\/|(?:^|[\s"'(])[\w ()-]{1,60}\.(?:txt|md|csv|tsv|json|ya?ml|xml|html?|log|ini|cfg|conf|toml|docx?|xlsx?|pptx?|odt|ods|pdf|rtf|epub|py|js|mjs|ts|tsx|jsx|c|cpp|h|cs|java|go|rs|rb|php|sh|ps1|bat|cmd|sql|ipynb)\b)/i;
const LOCAL = /\b(?:my|this|that|the|attached|these|those|our)\s+(?:own\s+)?(?:files?|folders?|documents?|docs|notes?|spreadsheets?|sheets?|pdfs?|reports?|logs?|downloads|desktop|projects?|repo(?:sitory)?|code(?:base)?|scripts?|drafts?|letters?|cv|resume|invoices?|receipts?|config(?:uration)? files?)\b|\b(?:in|from|on)\s+(?:my\s+)?(?:documents|downloads|desktop)\b|\b(?:on|in)\s+(?:this|my)\s+(?:pc|computer|laptop|machine|drive|disk)\b/i;
const VAGUE_LOCAL = /\b(?:my|our)\s+(?:files?|documents?|docs|notes?|spreadsheets?|reports?|letters?|drafts?|cv|resume|invoices?|receipts?)\b|\bin\s+(?:my\s+)?(?:documents|downloads|desktop)\b/i;
const CHAT = /^(?:hi|hey|hello|yo|thanks?|thank you|cheers|good (?:morning|night|evening|afternoon)|ok(?:ay)?|cool|nice|great|lol|bye|sup)\b[\s!.,]*\S{0,30}$|\b(?:how are you|what do you think|your (?:opinion|favou?rite)|do you (?:like|feel|enjoy|remember me)|tell me a joke|who are you|what can you do|are you (?:ok|there|alive))\b/i;
const MAKE = /^\s*(?:please\s+)?(?:write|draft|compose|make|create|draw|paint|generate|code|build|fix|refactor|debug|rewrite|translate|summari[sz]e|edit|improve|sort|rename|move|copy|delete|remind|schedule|play|sing|imagine|pretend|let's|lets)\b/i;
const FACTY = /\b(?:who|whom|whose|when|where|which|why|what(?:'s| is| are| was| were| does| did)|how (?:many|much|long|old|big|tall|far|often|fast|does|did)|is it true|price|prices|cost|costs|limit|limits|free (?:plan|tier)|quota|release(?:d)?|version|author|wrote|founded|invented|born|died|population|capital|latest|current|news|record|rules?|law|deadline|statistics?|according to|look (?:it )?up|find out|fact[- ]check|check (?:if|whether|that))\b/i;
const ABOUT_BOB = /\b(?:did|have|are|were|do|can|could|will|would|why did|why do|why are|why were) you\b(?!\s+(?:tell|find|look|check|search|know|recall))/i;
const SUM = /^[\d\s+\-*\/^().,=x×÷%]+\??$/;
const QUESTION = /\?\s*$|^\s*(?:who|whom|whose|what|when|where|which|why|how|is|are|was|were|do|does|did|can|could|has|have|will|would|should)\b|\b(?:tell me (?:about|what|who|when|where|how)|look (?:it )?up|find out|fact[- ]check|i (?:want|need) to know|explain (?:who|when|why|what))\b/i;

// Where the ask points on this computer: { named: true } when it names a path or file; { vague: true } when it means
// "my documents" or "my notes" without saying which. Pictures or files sent with the message count as named.
export function localAsk(text, { files = 0 } = {}) {
  const t = String(text || '');
  if (files > 0 || PATHLIKE.test(t)) return { named: true, vague: false };
  if (VAGUE_LOCAL.test(t)) return { named: false, vague: true };
  if (LOCAL.test(t)) return { named: false, vague: true };
  return null;
}

// Read what you were given: only when the ask hands him something to read, not when it asks him to make a new file
// ("save my list to shopping.txt", "write a note in todo.md"): there's nothing there to read first.
const CREATE = /^\s*(?:please\s+)?(?:(?:can|could|would) you\s+)?(?:write|save|create|make|draft|start|new|put|add|jot|note down|record|log)\b/i;
export function readFirstAsk(text) {
  const t = String(text || '');
  if (CREATE.test(t) && !/\b(?:read|open|look at|check|from|based on|using|summary|summari[sz]e|review|translate|according to)\b/i.test(t)) return null;
  return localAsk(t);
}

// 'fact' for a question of fact Bob should check; '' for chat, making or doing things, and questions about local files.
export function askKind(text, { files = 0 } = {}) {
  const t = String(text || '').trim();
  if (t.length < 8 || t.length > 4000) return '';
  if (CHAT.test(t) || ABOUT_BOB.test(t) || SUM.test(t)) return '';
  if (localAsk(t, { files })) return '';
  if (MAKE.test(t) && !/\?\s*$/.test(t)) return '';
  if (QUESTION.test(t) && FACTY.test(t)) return 'fact';
  return '';
}

// Facts first applies to this job: the level, the setting, the ask, and a web search that can run.
export function factsFirstFor(cfg, job, text, { searchReady = false, files = 0 } = {}) {
  if (!searchReady || job?.guest || job?.side) return false;
  const mode = cleanFactsFirst(cfg?.factsFirst);
  if (mode === 'off') return false;
  const e = cleanEffort(job?.effort);
  if (mode === 'high' && e !== 'high' && e !== 'extreme') return false;
  return askKind(text, { files }) === 'fact';
}

// ---------- the words Bob's loop gives the brain (hidden notes) ----------
export const RECALL_NOTE = (user = 'the user') => `Facts first. This is a question of fact, and ${user} wants it checked. Before you look anything up, write down what you remember about it: 1 to 4 short lines, starting with "From memory (not checked):". Say "not sure" where you aren't. Don't answer yet, and call no tools in this step: next you will check it against sources.`;
export const CHECK_NOTE = (memory, user = 'the user') => `Facts first, checking. What you wrote from memory, before looking:
"""
${String(memory || '(nothing)').slice(0, 1500)}
"""
Now look it up before you answer: search the web (web_search) or open the source (fetch_page). You may run up to ${MAX_SIDE_BY_SIDE} searches side by side in one reply, with different words. Then answer ${user} from what the sources say:
- Every fact, number, name and date in the answer comes from a source you read in this turn. Name the source.
- Where a source and your memory disagree, say so in one line ("I remembered X, but [source] says Y") and go with the source.
- A fact no source backs: leave it out, or mark it "(not checked)".
- If the searches found nothing useful, say plainly that you couldn't check it, and which parts are from memory.`;
export const SEARCH_FIRST_NUDGE = (user = 'the user') => `You answered a question of fact without looking it up. Search the web (web_search) or open the source now, then write the whole answer again for ${user}, checked against what you read. Where the source differs from what you said, say so and go with the source.`;
export const UNCHECKED_CORRECTION = 'I couldn\'t reach a source for this, so the facts above are from memory and not checked.';

export const READ_FIRST_NUDGE = (where, user = 'the user') => `${user} gave you ${where}. Read it with your tools first (read_file, office_read, list_folder or search_files), then answer from what it says. Don't ask ${user} about it before you've looked.`;
export const LOOK_FIRST_NUDGE = (user = 'the user') => `${user} means files on this computer. Look first: search_files or list_folder in the folders you can read (Documents, Desktop, Downloads, notes). Ask ${user} only if you still can't tell which one after looking.`;
export const READ_FIRST_BOUNCE = (where) => `Not run: read ${where} first. ${where[0].toUpperCase()}${where.slice(1)} was given with the ask, so look at it with read_file, office_read or list_folder before asking a question about it.`;
export const LOOK_FIRST_BOUNCE = 'Not run: look first. Search the folders you can read (search_files or list_folder) before asking which file is meant.';

// ---------- what ran this turn ----------
const toolNamesSince = (msgs, from) => msgs.slice(from).filter((m) => m?.role === 'tool').map((m) => m.tool_name || m.name || '');
const okResult = (m) => !/^\s*(?:Error:|Not run:|\(Not run|The search pages are blocking|No results|Give me some words)/i.test(String(m?.content || ''));
export const lookedUpWeb = (msgs, from) => toolNamesSince(msgs, from).some((n) => WEB_LOOKS.has(n));
// A look-up that gave something to read (not an error, a block page, or "No results").
export const webSourceRead = (msgs, from) => msgs.slice(from).some((m) => m?.role === 'tool' && WEB_LOOKS.has(m.tool_name || m.name || '') && okResult(m));
// Read what you were given is met by any tool that touched the files: a look, or a job on them (writing the file
// asked for, editing it, sorting a folder, running the project). It only stops answering or asking blind.
export const FILE_WORK = new Set(['write_file', 'edit_file', 'office_edit', 'office_make', 'convert_file', 'sort_files', 'save_as', 'save_spreadsheet', 'strip_metadata', 'undo_files', 'run_command', 'work_on_repo', 'file_hands']);
export const lookedLocal = (msgs, from) => toolNamesSince(msgs, from).some((n) => FILE_LOOKS.has(n) || FILE_WORK.has(n));
// The answer already says it couldn't check, so the app's note would only repeat it.
export const saysUnchecked = (text) => /\b(?:not checked|unchecked|couldn'?t (?:check|verify|confirm|find a source|reach)|could not (?:check|verify|confirm)|unable to (?:check|verify|confirm)|from memory|unverified|no source)\b/i.test(String(text || ''));
// A reply that asks the user something (not an answer).
export const asksBack = (text) => {
  const t = String(text || '').trim();
  return t.length < 600 && /\?\s*$/.test(t) && /\b(?:which|what|where|could you|can you|do you|would you|please (?:tell|share|send|paste)|let me know)\b/i.test(t);
};

// What the record keeps for the rentals' before-and-after count: never the words, only what happened.
export const factsRecord = (f) => (f ? { kind: f.kind, recalled: Boolean(f.memory), looked: Boolean(f.looked), sourced: Boolean(f.sourced), nudged: Boolean(f.nudged), unchecked: Boolean(f.unchecked) } : null);

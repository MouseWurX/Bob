// End-of-turn checks from the real-jobs reads (16 Nov 2026; MouseWurX: "improve the harness and agent loop to make it
// foolproof" and "we have enough testing now with qwen we should be able to make it concrete"). Each check below is one
// mistake the brains made again and again in the 800-job Qwen read and the 45-job GPT-OSS read, caught from the words
// and the turn's own tool record, never from a guess about the brain. Each one, when it fires, gives Bob ONE more go
// with a plain line saying what to do (the same one-more-go budget as verify.js afterTurn; never a loop).
//
//   look_first     he asked where a file was, or said he couldn't find or open it, without looking (59 "asked when he
//                  should act" + most of the 61 "other": the planted file in Documents never read)
//   said_done      he said it was forgotten / removed / done after the tool said it wasn't (Qwen bad_args, GPT-OSS #4)
//   memory_claim   "I've noted that ..." with no remember call (Qwen invented_result)
//   page_claim     "Opened it, the site loads fine" with no page read (Qwen invented_result)
//   unseen         "the hash provided", "results are above": the user never sees tool results (GPT-OSS #1, Qwen)
//   cut_off        the answer stops at "Here are the reasons:" or mid-sentence (Qwen cut_off, 11)
//   one_search     a research job answered after a single search (GPT-OSS #22, #45)
//   maths          totals worked out in his head (Qwen invented_result: several wrong sums)
//   mail_route     a mail job (trash, archive, reply to a sender's mail) answered without the mail tools: the live inbox
//                  run (16 Nov) saw bulk trash/archive jobs wander into list_folder, search_files, web_search or
//                  file_hands, and draft-reply jobs answered with no tool at all
//
// Off only with cfg.toolHelp === false (the "Better tool calling" switch), like the other loop helps.

const LOOKS = new Set(['read_file', 'office_read', 'inspect_file', 'find_in_documents', 'search_files', 'query_data', 'compare_files', 'read_spreadsheet', 'list_folder', 'file_hands', 'edit_file', 'write_file', 'doc_index']);
const WEB = new Set(['web_search', 'fetch_page', 'news', 'search_news', 'deep_search']);
const MATHS_TOOLS = new Set(['calculate', 'query_data', 'read_spreadsheet', 'save_spreadsheet', 'run_code']);
const ok = (a) => a && a.ok !== false && !a.declined;
const cap = (s, n) => { const t = String(s || '').replace(/\s+/g, ' ').trim(); return t.length > n ? `${t.slice(0, n - 1)}…` : t; };

// files a request names (C:\\x\\a.csv, "Q3 report.docx", db.py), leaving out ones he's asked to make ("save it as x.txt")
const EXT = '(?:txt|md|csv|tsv|json|ya?ml|xml|log|ini|cfg|conf|toml|py|js|mjs|ts|sh|bat|cmd|ps1|html?|css|sql|docx?|xlsx?|pptx?|pdf|rtf|odt|zip|png|jpe?g|gif|bmp|webp|mp3|wav|mp4|mov|exe|dll)';
export function filesNamed(text) {
  const t = String(text || ''), out = new Set();
  const made = (i) => /(?:sav(?:e|ing)|writ(?:e|ing)|creat(?:e|ing)|mak(?:e|ing)|export(?:ing)?|generat(?:e|ing)|rename[ds]?|call(?:ed)?|name[ds]?|convert(?:ed|ing)?|new file)\b[^.!?\n]{0,40}$|\b(?:as|into|to)\s+['"`‘“]?$/i.test(t.slice(Math.max(0, i - 60), i));
  for (const m of t.matchAll(new RegExp(`(?:[A-Za-z]:[\\\\/]|~[\\\\/])[^\\s'"\`<>|*?]*?\\.${EXT}(?![\\w.])`, 'gi'))) if (!made(m.index)) out.add(m[0]);
  for (const m of t.matchAll(new RegExp(`(?<![\\w.\\\\/-])([\\w-]{1,60}\\.${EXT})(?![\\w.])`, 'gi'))) if (!made(m.index) && ![...out].some((p) => p.toLowerCase().endsWith(m[1].toLowerCase()))) out.add(m[1]);
  return [...out];
}
// "my script", "the log", "this CSV", "our project": something of the user's that is probably on the PC
const LOCAL_REF = /\b(?:my|the|this|our|that)\s+(?:[\w-]+\s+){0,2}?(?:script|code|log|logs|file|files|csv|spreadsheet|document|doc|report|config|notes|photos?|pictures?|folder|project|repo|essay|draft|resume|invoice|data|export|backup|presentation|deck|readme|error log)\b/i;
const ASK_WHERE = /\b(?:where (?:is|are|do you keep|did you (?:save|put))|which (?:file|folder|one of)|(?:the )?(?:exact |full )?(?:file )?path\b|paste (?:it|the|in)|upload (?:it|the)|share (?:the|it)|point me (?:at|to)|send (?:me )?(?:the|it)|attach)|\b(?:couldn'?t|can'?t|cannot|unable to) (?:find|locate|see|open|access)\b|\bisn'?t (?:there|anywhere)\b|\bnot (?:found|able to (?:find|open|read))\b/i;
const ASKS_OR_CANT = /\?\s*$|\b(?:could you|can you|please)\s+(?:tell|share|give|paste|upload|send|provide|point)|\b(?:couldn'?t|can'?t|cannot|unable to|don'?t)\s+(?:find|locate|see|open|access|read|load|view)\b|\bisn'?t (?:there|anywhere)|\bno (?:such|access)\b|\bnot (?:found|able to (?:find|open|read))\b/i;
const NOT_DONE = /^(?:Error\b|There(?:'s| is) no\b|No such\b|Nothing (?:to|was|matched|found)\b|Not done\b|Not on yet\b|Couldn'?t\b|Can'?t\b|Didn'?t\b|Failed\b|.{0,80}\b(?:isn'?t there|doesn'?t exist|wasn'?t found|not found)\b)/i;
const DONE_SAY = /\b(?:is|are|was|were|has been|have been|now|all)\s+(?:already\s+)?(?:gone|forgotten|wiped|removed|deleted|erased|cleared)\b|(?:^|\n)\s*(?:Done|All set|Got it)\b[^.!?\n]{0,30}(?:forgotten|removed|deleted|cleared|wiped|done)?|\bI(?:'ve| have) (?:forgotten|removed|deleted|cleared|wiped|erased)\b/i;
const SAY_THE_WORD = /\b(?:say the word|just say|if you want|want me to|shall i|should i)\b[^.!?\n]{0,60}\b(?:done|gone|deleted|removed)\b/i;
const UNDO_TOOLS = /^(?:forget_topic|remember|file_hands|notice_board|reminders|undo_files|forget|memory)$/;
const MEMORY_SAY = /\bI(?:'ve| have)?(?: also)? (?:noted|remembered|made a note|stored|saved|recorded|logged|written down)\b[^.!?\n]{0,50}\b(?:that|you|your|preference|timezone|time zone|name|birthday|diet|allerg)|\bI'?ll remember (?:that|this|you)|\b(?:noted|saved) (?:to|in) (?:my )?memory\b/i;
const PAGE_SAY = /\b(?:I )?(?:opened|visited|loaded|fetched|browsed|went to|checked) (?:it|the (?:site|page|link|website|url)|(?:https?:\/\/)?[a-z0-9-]+(?:\.[a-z0-9-]+)*\.[a-z]{2,})\b[^.!?\n]{0,40}\b(?:loads?|works?|fine|up|down|shows?|says?|safe)\b|\bread (?:them|it|all three|each|both) in full\b/i;
const UNSEEN = /\b(?:the\s+)?(?:hash|sha-?256|checksum|link|links|url|path|code|results?|list|output|details|figures|numbers|commands?)\s+(?:provided|shown|given|listed|printed)(?:\s+above)?\b|\b(?:see|shown|listed|as noted|mentioned) above\b|\b(?:results|details|answer) (?:are|is) above\b/i;
const RESEARCH = /\b(?:research|look up|find out about|compare|comparison|studies|study|reports|sources|cite|citations?|literature|evidence|survey of|overview of the (?:research|literature))\b/i;
const MAIL_ASK = /\b(?:e-?mails?|inbox|mail(?:box)?|messages? from|newsletters?|spam|unread)\b/i;
const MAIL_DO = /\b(?:trash|archive|delete|bin|move|label|mark|unsubscribe|clean (?:up|out)|tidy|sort|file away|reply|answer|respond|draft|write back|summari[sz]e|go through)\b/i;
// not a mail job: is this sender or link safe, was this address in a breach, or e-mail a file somewhere (Bob sends no mail)
const MAIL_NOT = /\b(?:safe|phishing|scam|spoof|genuine|legit(?:imate)?|breach(?:es|ed)?|pwned|headers?|spf|dkim|dmarc)\b|\be-?mail (?:it|this|that|them|the file) to\b/i;
const MAIL_TOOLS = /^(?:read_email|manage_email|[a-z0-9]*_?(?:gmail|outlook|mail)[a-z0-9_]*)$/i;
const MATHS_ASK = /\b(?:total|sum|add (?:up|them)|average|mean|median|how much (?:in total|altogether|is that|did i)|percent(?:age)?|difference|net|subtotal|per month|per year|annual|grand total|work out|calculate|balance)\b/i;

function cutOff(reply) {
  const t = String(reply || '').replace(/\s+$/, '');
  if (t.length < 15) return false;
  if (/```\s*$/.test(t) && (t.match(/```/g) || []).length % 2 === 0) return false; // a closed code block
  const last = t.split('\n').pop().trim();
  if (/[:,(—–-]$/.test(last) && !/^\|/.test(last)) return true; // "Here are the reasons:" with nothing after
  if (/^(?:\*\*)?\d+[.)](?:\*\*)?$|^[-*•](?:\s*\*\*)?$/.test(last)) return true; // "**1." alone
  if (/\b(?:and|or|the|a|an|to|of|with|for|in|is|that|which|because|but|so|if|then|by|from|on|at|as|your|my)$/i.test(last) && !/^[#|>-]/.test(last)) return true;
  if (/^```/.test(last) || ((t.match(/```/g) || []).length % 2 === 1)) return true; // an open code block
  return false;
}

// ctx: { text (what the user asked), reply, actions (ledger actions this turn), usable(name), who, exists(path) }
// Returns [{ kind, nudge, groups, claim? }]: what verify.js adds to its one-more-go line (the first ones win).
export function answerChecks({ text = '', reply = '', actions = [], usable = () => true, who = 'the user', exists = () => false, already = '' } = {}) {
  const said = String(reply || '').trim(); const ask = String(text || '');
  const out = []; const add = (kind, nudge, groups = [], claim = false) => out.push({ kind, nudge, groups, claim });
  if (!said) return out;
  const acts = actions.filter(Boolean);
  const looked = acts.some((a) => LOOKS.has(a.name));
  const touched = (f) => acts.some((a) => JSON.stringify(a.args ?? '').toLowerCase().replace(/\\\\/g, '\\').includes(String(f).toLowerCase().replace(/\//g, '\\').split('\\').pop()));
  const canLook = usable('read_file') || usable('list_folder') || usable('search_files');

  // look_first: a named file not touched (and there, or named by its bare name), or "my log" and he asked or gave up
  // without any look this turn
  // not when he already gave an honest blocker (a Hand's card is up), or when other tools did the looking
  const blocked = acts.some((a) => a.name === 'offer_setup') || /\bSwitch it on\b|\bHand\b[^.\n]{0,40}\boff\b/.test(said);
  const busy = acts.some((a) => !/^(?:use_tools|notice_board|recall|memory|remember)$/.test(a.name));
  if (canLook && !blocked) {
    const named = filesNamed(ask).filter((f) => !touched(f) && !String(already).toLowerCase().includes(String(f).toLowerCase()));
    const there = named.find((f) => /[\\/]/.test(f) && exists(f));
    const bare = named.find((f) => !/[\\/]/.test(f));
    if (there) add('look_first', `${who} named ${there}, and it is there, but nothing looked at it this turn. Read it now (read_file, or inspect_file for a program or a picture) and answer from what it says. Don't say you can't open it until a tool says so.`, ['documents']);
    else if (bare && !looked) add('look_first', `${who} named the file ${bare}, but nothing looked for it this turn. Call read_file with just the name "${bare}": it looks in every folder you may read. Ask where it is only if read_file can't find it.`, ['documents']);
    else if (!looked && !busy && LOCAL_REF.test(ask) && !/\b(?:save|write|make|create|export|new)\b/i.test(ask) && ASK_WHERE.test(said)) add('look_first', `Before asking ${who} or saying you can't find it, look: list the Documents, Desktop and Downloads folders with list_folder (or search_files for a word from the request). Ask only if it really isn't there, and then say where you looked.`, ['documents']);
  }

  // said_done: the last try of a tool said no, and the answer says it's done
  const lastNo = [...acts].reverse().find((a) => UNDO_TOOLS.test(a.name) && NOT_DONE.test(String(a.text ?? a.result ?? '')) && !acts.slice(acts.indexOf(a) + 1).some((b) => b.name === a.name && ok(b) && !NOT_DONE.test(String(b.text ?? b.result ?? ''))));
  if (lastNo && DONE_SAY.test(said.replace(SAY_THE_WORD, ' ')) && !/\b(?:nothing (?:to|was)|there (?:was|is) no|wasn'?t|isn'?t|didn'?t|couldn'?t|no (?:such|topic|file|folder|match))\b/i.test(said)) {
    add('said_done', `${lastNo.name} said: "${cap(lastNo.text ?? lastNo.result, 160)}". So it isn't done. Don't say it is: tell ${who} plainly what really happened, and what you can do instead.`, [], true);
  }
  // memory_claim
  if (MEMORY_SAY.test(said) && !acts.some((a) => a.name === 'remember' && ok(a)) && usable('remember')) {
    add('memory_claim', `You said you noted or saved something about ${who}, but nothing called remember this turn. Call remember now with that fact, or don't say it was saved.`, ['memory'], true);
  }
  // page_claim
  if (PAGE_SAY.test(said) && !acts.some((a) => WEB.has(a.name) && ok(a)) && !acts.some((a) => /^(?:open_url|osint_lookup|check_link|app_look)$/.test(a.name) && ok(a))) {
    add('page_claim', `You said you opened or read a page, but no page was read this turn. Read it now with fetch_page, or say you haven't looked.`, ['web'], true);
  }
  // unseen: he points at tool output the user never sees
  if (UNSEEN.test(said) && acts.some((a) => ok(a))) {
    add('unseen', `${who} can't see tool results, only your answer. You wrote "${cap(said.match(UNSEEN)[0], 60)}": put that thing itself in the answer (the hash, link, path, list or numbers), word for word.`);
  }
  // cut_off
  if (cutOff(said)) add('cut_off', 'Your answer stops in the middle. Give the whole answer again, finished, in one reply.');
  // one_search: a research job answered after one look
  const webN = acts.filter((a) => WEB.has(a.name) && ok(a)).length;
  if (RESEARCH.test(ask) && ask.length >= 60 && webN === 1 && usable('web_search') && said.length > 400) {
    add('one_search', `One search isn't enough for what ${who} asked. Search again for the parts not covered yet, and read the best result with fetch_page, then answer only from what you found. Say where data was missing; leave out anything no result showed.`, ['web']);
  }
  // maths: totals in his head
  // only numbers he worked out himself count: ones not in the request and not in any tool result (a total read off
  // an invoice is fine; 800-job read: 7 of 15 firings were such reads before this)
  const seen = (ask + ' ' + acts.map((a) => String(a.text ?? a.result ?? '')).join(' ')).replace(/[,\s](?=\d{3}\b)/g, '');
  const near = [...said.matchAll(/\b(?:total|sum|average|mean|net|altogether|in all|comes? to|adds? up to)\b[^.\n]{0,40}?([$€£¥]?\d[\d,]*(?:\.\d+)?)|=\s*\**([$€£¥]?\d[\d,]*(?:\.\d+)?)/gi)].map((m) => (m[1] || m[2]).replace(/[$€£¥,]/g, ''));
  const worked = near.filter((n) => n.length > 1 && !new RegExp(`(?<![\\d.])${n.replace('.', '\\.')}(?![\\d])`).test(seen));
  if (MATHS_ASK.test(ask) && worked.length && !acts.some((a) => MATHS_TOOLS.has(a.name) && ok(a)) && usable('calculate')) {
    add('maths', 'Check the maths before giving totals: work each sum out with calculate, then answer with the numbers it gives.', ['maths']);
  }
  // mail_route: a mail job with the mail tools there, and none of them ran
  if (MAIL_ASK.test(ask) && MAIL_DO.test(ask) && !MAIL_NOT.test(ask) && (usable('read_email') || usable('manage_email')) && !acts.some((a) => MAIL_TOOLS.test(a.name))) {
    const wander = acts.filter((a) => /^(?:list_folder|search_files|find_in_documents|web_search|fetch_page|file_hands)$/.test(a.name)).map((a) => a.name);
    add('mail_route', `This is a mail job, but no mail tool ran${wander.length ? ` (${[...new Set(wander)].join(', ')} look at files or the web, not the mail)` : ''}. Use read_email to find the messages (by sender, subject or words), then manage_email to trash, archive or move only the ones the request covers (look at each: a real person who wrote to the user isn't bulk mail; say so instead), or read_email first and then write the reply from what the message says. Don't look in folders or on the web for mail.`, ['mail']);
  }
  return out;
}

// GPT-OSS's browsing markers (【1†L1-L3】) mean nothing to the user; they're taken out of the shown answer.
export const stripMarkers = (t) => String(t ?? '').replace(/【\d+(?:†[^】]{0,40})?】/g, '').replace(/[ \t]+([.,;:!?])/g, '$1');

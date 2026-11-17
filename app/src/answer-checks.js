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
//   points_back    "I already searched / gave you that above / in my last reply" instead of the thing itself (Maximus
//                  rerun, 16 Nov: 6 of 63 answers; the user sees only this answer, not steps, plans or tool results)
//   text_call      a tool call written as text that never ran, often then "Done" (Maximus rerun: 9 of 100 failed;
//                  the engine now turns Qwen's XML form into real calls, this catches what's left)
//   wrong_folder   "save it in my Documents" but made with only a name, so it landed in Bob's folder
//   find_first     "my reading log spreadsheet": search for the user's own file before making a new one or asking where
//   review_leak    his own review or the hidden notes in the shown answer ("My own review", "You're right on all six
//                  points" to a review the user never saw; Maximus rerun: 8 of 100)
//   office_route   an Office file job (docx, xlsx, pptx) done without the Office tools: predicted from the mail run
//                  (jobs drifted to the generic file tools) and the Maximus rerun (fx-287e97db73: "created
//                  report.docx" with the Office Hand off); read_file can't read a .docx, write_file can't make one
//   partial_look   he answered for the whole inbox (or folder) after seeing only the newest few ("271 messages, newest 15
//                  shown") and didn't say so (inbox run: gave_up_paging, 43 of 120)
//   maths          totals worked out in his head (Qwen invented_result: several wrong sums)
//   draft_unsaved  asked to draft a reply and no manage_email draft was saved (17 Nov)
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
const MEMORY_SAY = /\bI(?:'ve| have)?(?: also)? (?:noted|remembered|made a note|stored|saved|recorded|logged|written down)\b[^.!?\n]{0,50}\b(?:that|you|your|preference|timezone|time zone|name|birthday|diet|allerg)|\bI'?ll remember (?:that|this|you)|\b(?:noted|saved) (?:to|in) (?:my )?memory\b|\bI(?:'ve| have) (?:updated|changed|added to) my (?:memory|notes)\b|\b(?:my )?memory (?:is|has been) updated\b/i; // 17 Nov after1: "I've updated my memory to reflect this preference" (2 runs, no call)
const PAGE_SAY = /\b(?:I )?(?:opened|visited|loaded|fetched|browsed|went to|checked) (?:it|the (?:site|page|link|website|url)|(?:https?:\/\/)?[a-z0-9-]+(?:\.[a-z0-9-]+)*\.[a-z]{2,})\b[^.!?\n]{0,40}\b(?:loads?|works?|fine|up|down|shows?|says?|safe)\b|\bread (?:them|it|all three|each|both) in full\b/i;
const UNSEEN = /\b(?:the\s+)?(?:hash|sha-?256|checksum|link|links|url|path|code|results?|list|output|details|figures|numbers|commands?)\s+(?:provided|shown|given|listed|printed)(?:\s+above)?\b|\b(?:see|shown|listed|as noted|mentioned) above\b|\b(?:results|details|answer) (?:are|is) above\b/i;
const POINTS_BACK = /^(?:\W{0,3})(?:I(?:'ve| have)? already (?:gave|given|searched|pulled|ran|run|scanned|answered|told|shown|showed|listed|checked|did|done|covered|sent|written|wrote)|I(?:'ve| have) given you (?:the|my|an?) (?:answer|list|script|code|steps))\b|\b(?:in|from) my (?:last|previous|earlier|first) (?:reply|answer|message|turn)\b|\b(?:the|my|that|this) (?:script|code|list|table|answer|summary|steps|results?|tree|plan) (?:I gave|I wrote|I showed )?(?:you )?above\b/i;
const TEXT_CALL = /<tool_call>|<\/?function(?:=|>)|<parameter=|"name"\s*:\s*"[a-z_]+"\s*,\s*"(?:arguments|parameters)"\s*:|\bto=functions\./;
const DRAFT_TALK = /\bmy (?:first|second|third|fourth|earlier|previous|original|last two|other) (?:reply|replies|response|responses|answer|answers|breakdown|draft)s?\b|\bYou'?re right to (?:call (?:this|that) out|push back|flag)\b|\bsecond-guess(?:ed|ing)? myself\b|\bI (?:just )?confused myself\b|\b(?:my apologies for|sorry for) the false alarm\b|\bmy earlier (?:summary|list|breakdown|reply|answer)\b/i;
const REVIEW_LEAK = /\bMy own review\b|\bI(?:'ve| have)? reviewed my (?:own )?(?:work|answer)\b|^\s*\**(?:Review|Improve it|Checking my own work|Plan)(?::\**|\**\s*:)|\bYou'?re right (?:on|about) (?:all|both|every) (?:\w+ )?(?:points?|of them)\b|\b(?:the|my) (?:hidden|reviewer'?s?|review) notes?\b|\bHere is what the jobs did\b/im;
const RESEARCH = /\b(?:research|look up|find out about|compare|comparison|studies|study|reports|sources|cite|citations?|literature|evidence|survey of|overview of the (?:research|literature))\b/i;
const DRAFT_ASK = /\b(?:draft|write) (?:a |an |my )?(?:reply|answer|response|e-?mail back)\b|\breply to (?:her|him|them|wren|\w+'s (?:e-?mail|mail|message))\b|\bdraft (?:a )?(?:reply|response)\b/i;
const MAIL_ASK = /\b(?:e-?mails?|inbox|mail(?:box)?|messages? from|newsletters?|spam|unread)\b/i;
const MAIL_DO = /\b(?:trash|archive|delete|bin|move|label|mark|unsubscribe|clean (?:up|out)|tidy|sort|file away|reply|answer|respond|draft|write back|summari[sz]e|go through)\b/i;
// not a mail job: is this sender or link safe, was this address in a breach, or e-mail a file somewhere (Bob sends no mail)
const MAIL_NOT = /\b(?:safe|phishing|scam|spoof|genuine|legit(?:imate)?|breach(?:es|ed)?|pwned|headers?|spf|dkim|dmarc)\b|\be-?mail (?:it|this|that|them|the file) to\b|\be-?mail (?:logs?|files?|csv|exports?|addresses|list)\b/i;
// the inbox run (16 Nov): real mail asks rarely say "e-mail": "Trash everything from Kettle & Crumb", "Archive
// everything from Larkspur Outfitters", "Unsubscribe me from the junk", "What's the code Theo emailed me?", "Wren asked
// me about my order. Draft a reply"
const MAIL_PLAIN = /\b(?:[Tt]rash|[Aa]rchive|[Uu]nsubscribe me)\b[^.!?\n]{0,40}\bfrom [A-Z]|\b(?:[Tt]rash|[Aa]rchive)\b[^.!?\n]{0,40}\b(?:notifications|receipts|promotions|alerts|newsletters)\b|\b[Uu]nsubscribe me\b|\b(?:e-?mailed|wrote to|sent) me\b|\bdraft (?:a |an )?(?:reply|answer|response)\b|\breply to (?:[A-Z]\w+|the (?:message|note))\b|\b(?:asked|wrote|messaged) me about\b/;
const MAIL_TOOLS = /^(?:read_email|manage_email|[a-z0-9]*_?(?:gmail|outlook|mail)[a-z0-9_]*)$/i;
const OFFICE_FILE = /\.(?:docx?|xlsx?|pptx?|odt|ods|odp)\b|\b(?:Word (?:doc|document|file)|Excel (?:file|sheet|workbook)|PowerPoint|slide ?deck|presentation)\b/i;
// only making or changing one: read_file reads Office files, and moves, zips and deletes are file_hands' job
const OFFICE_DO = /\b(?:make|create|write|draft|build|edit|change|update|add|insert|convert|turn [^.\n]{0,30} into|export|compare|format|fill in)\b/i;
const OFFICE_NOT = /\b(?:chart|graph|plot|diagram|move|zip|unzip|delete|recycle|rename|copy|search for|find|remind|reminder|attach)\b/i;
const OFFICE_TOOLS = /^(?:office_[a-z_]+|convert_file|compare_files|read_spreadsheet|save_spreadsheet|query_data|offer_setup)$/; // 17 Nov after1: convert_file is the Office route for exports (excel-to-csv-taken got a false office_route)
const PARTIAL = /(\d[\d,]*) messages?, newest (\d+) shown|(\d[\d,]*) (?:files|items|entries|results)[^\n]{0,20}(?:first|newest) (\d+) shown/i;
const WHOLE_SAY = /\b(?:all|every|none|nothing else|no (?:other|more)|the whole|your (?:whole |entire )?inbox|everything|inbox is (?:clean|clear|empty)|that's all)\b/i;
const OWNS_PART = /\b(?:newest|latest|most recent|first|only (?:looked|saw|checked|read)|of (?:the )?\d[\d,]*|(?:\d+) (?:out )?of|didn'?t (?:look|check|see)|haven'?t (?:looked|checked)|so far)\b/i;
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
  // points_back: he points at earlier work instead of giving it (not when the turn's own tools got nothing: an honest
  // "I already tried" with what came back is the answer)
  const holds = /```|^\s*\|.*\|\s*$|^\s*(?:\d+[.)]|[-*•])\s+\S/m.test(said); // the "above" may be in this very answer
  const pb = said.match(POINTS_BACK);
  if (pb && !UNSEEN.test(said) && !(holds && /\babove\b/i.test(pb[0]) && !/^\W{0,3}I/.test(pb[0]))) {
    add('points_back', `${who} sees only this answer: not your steps, plans, tool results or earlier replies. You wrote "${cap(said.match(POINTS_BACK)[0], 60)}". Give the thing itself now, in full (the list, script, results or answer), with no "already" or "above".`);
  }
  // text_call: a call written out instead of made
  if (TEXT_CALL.test(said)) {
    const name = (said.match(/<function=([\w.-]+)>|"name"\s*:\s*"([a-z_]+)"|to=functions\.([\w.-]+)/) || []).slice(1).find(Boolean);
    add('text_call', `Your answer has a tool call written as text${name ? ` (${name})` : ''}. Text never runs: nothing happened. Make the real call now if it's still needed, then answer from what it returns, and don't say it's done until a tool says so. Never show call text to ${who}.`, [], true);
  }
  // find_first (17 Nov after1 office): "add X to my reading log spreadsheet" made a NEW csv and said "added to your reading
  // log"; "add a slide to my garden club deck" listed one empty folder and asked for the path. The user's own file is
  // searched for by name before Bob makes a new one in its place or asks where it is.
  const MY_FILE = /\bmy\s+((?:[\w'-]+\s+){0,3}?)(spreadsheet|workbook|deck|slides|presentation|document|doc|report|log|letter|minutes|budget)\b/i;
  const mf = MY_FILE.exec(ask);
  if (mf && canLook && !blocked && !/\b(?:new|make|create|start)\b/i.test(ask)) {
    const searched = acts.some((a) => ['search_files', 'find_in_documents', 'doc_index', 'read_file', 'office_read'].includes(a.name));
    const changed = acts.some((a) => ['office_edit', 'edit_file'].includes(a.name));
    const madeNew = acts.some((a) => ['save_spreadsheet', 'office_make', 'write_file', 'make_document'].includes(a.name));
    const words = `${mf[1]}${mf[2]}`.trim();
    if (!searched && !changed && (madeNew || ASK_WHERE.test(said))) add('find_first', `${who} means a file they already have ("my ${words}"), and nothing searched for it this turn. Find it first: search_files or find_in_documents with words from its name ("${words}"), and list Documents, Desktop and Downloads. Then change that file itself. Don't make a new file in its place, and never say you added to theirs unless a tool changed it.`, ['documents']);
  }

  // wrong_folder (17 Nov after1 office, word-make): "save it as a Word document called Camping_List in my Documents" was
  // made with only a name, so it landed in Bob's own documents folder. A file asked for in one of the user's folders is
  // made there.
  const IN_FOLDER = /\b(?:in|to|into|on) (?:my|the) (Documents|Desktop|Downloads|Pictures|Music|Videos)\b/i.exec(ask);
  const MAKERS = /^(?:office_make|write_file|save_spreadsheet|make_document|convert_file|make_diagram|make_image)$/;
  if (IN_FOLDER) {
    const makes = acts.filter((a) => MAKERS.test(a.name));
    const there = (a) => JSON.stringify(a.args ?? '').toLowerCase().includes(IN_FOLDER[1].toLowerCase());
    if (makes.length && !makes.some(there)) add('wrong_folder', `${who} asked for it in their ${IN_FOLDER[1]} folder, but it was saved somewhere else (no path in ${IN_FOLDER[1]} was given). Save it there now: give the full path, inside their ${IN_FOLDER[1]} folder (find it with list_folder if unsure), then say where it is.`);
  }

  // review_leak: his own review or notes in the shown answer. 16 Nov after1 Maximus: the improve round answered the review as if the
  // user had pushed back ("You're right to call this out. My first reply was correct... my third and fourth replies were
  // confused"). That counts too, unless the user really did push back this turn.
  const pushedBack = /\b(?:wrong|mistake|incorrect|not right|you said|you missed|earlier|before|last time|again)\b/i.test(ask);
  const draftTalk = !pushedBack && (DRAFT_TALK.exec(said) || null);
  if (draftTalk && !REVIEW_LEAK.test(said)) {
    add('review_leak', `Your answer talks about your own earlier drafts ("${cap(draftTalk[0], 50)}"). ${who} never saw them, or any review. Write the answer again for ${who} only: the result, in plain words, as if it were your first reply.`);
  }
  if (REVIEW_LEAK.test(said)) {
    add('review_leak', `Your answer shows your own working ("${cap(said.match(REVIEW_LEAK)[0], 50)}"). ${who} never saw your review, plan or notes. Write the answer again for ${who} only: the result, in plain words, with nothing about reviews, jobs or steps.`);
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
  // office_route: an Office file job with no Office tool (not when he was blocked and said so)
  if (OFFICE_FILE.test(ask) && OFFICE_DO.test(ask) && !OFFICE_NOT.test(ask) && (usable('office_read') || usable('office_make') || usable('office_edit')) && !blocked && !acts.some((a) => OFFICE_TOOLS.test(a.name))) {
    const generic = acts.filter((a) => /^(?:read_file|write_file|edit_file|file_hands|run_command)$/.test(a.name) && OFFICE_FILE.test(String(a.args ?? ''))).map((a) => a.name);
    add('office_route', `This is an Office file job, but no Office tool ran${generic.length ? ` (${[...new Set(generic)].join(', ')} can't read or make Word, Excel or PowerPoint files)` : ''}. Use office_read to read it, office_edit to change it, office_make to make one (compare_files to compare two). If the Office Hand is off, say so and offer to switch it on; don't say it's done.`, ['documents'], true);
  }
  // partial_look: answered for all after seeing a part
  const parts = acts.map((a) => ({ a, m: String(a.text ?? a.result ?? '').match(PARTIAL) })).filter((x) => x.m && Number(String(x.m[1] || x.m[3]).replace(/,/g, '')) > Number(x.m[2] || x.m[4]));
  if (parts.length && acts.filter((a) => a.name === parts[0].a.name).length < 3 && WHOLE_SAY.test(said) && !OWNS_PART.test(said)) {
    const m = parts.at(-1).m; const total = m[1] || m[3]; const seen = m[2] || m[4];
    add('partial_look', `You saw only the newest ${seen} of ${total}, but your answer speaks for all of them. Look further first (search by sender, subject or date, or page on), or say plainly that you only looked at the newest ${seen} of ${total}.`, ['mail']);
  }
  // mail_route: a mail job with the mail tools there, and none of them ran
  if ((MAIL_ASK.test(ask) && MAIL_DO.test(ask) || MAIL_PLAIN.test(ask)) && !MAIL_NOT.test(ask) && !filesNamed(ask).length && (usable('read_email') || usable('manage_email')) && !acts.some((a) => MAIL_TOOLS.test(a.name))) {
    const wander = acts.filter((a) => /^(?:list_folder|search_files|find_in_documents|web_search|fetch_page|file_hands)$/.test(a.name)).map((a) => a.name);
    add('mail_route', `This is a mail job, but no mail tool ran${wander.length ? ` (${[...new Set(wander)].join(', ')} look at files or the web, not the mail)` : ''}. Use read_email to find the messages (by sender, subject or words), then manage_email to trash, archive or move only the ones the request covers (look at each: a real person who wrote to the user isn't bulk mail; say so instead), or read_email first and then write the reply from what the message says. Don't look in folders or on the web for mail.`, ['mail']);
  }
  // draft_unsaved (17 Nov, after1: 6 of 6 Medius and Minimus drafts were typed in the chat, never saved): asked to draft a
  // reply, with manage_email there, and no draft was saved this turn. The draft goes in Drafts, where the user sends it.
  const argsOf = (a) => { if (a.args && typeof a.args === 'object') return a.args; try { return JSON.parse(a.args); } catch { return {}; } };
  const saved = acts.some((a) => a.name === 'manage_email' && String(argsOf(a).action || '') === 'draft' && a.ok !== false && !/^Error|^Not run|said no/i.test(String(a.text ?? a.result ?? '')));
  if (DRAFT_ASK.test(ask) && usable('manage_email') && !saved && !/\b(?:can'?t|won'?t|couldn'?t|didn'?t)\b[^.\n]{0,60}\bdraft\b|\bdraft\b[^.\n]{0,40}\b(?:refused|isn'?t saved|wasn'?t saved)\b/i.test(said)) {
    const read = acts.filter((a) => a.name === 'read_email' && String(argsOf(a).action || '') === 'read').map((a) => argsOf(a).id).filter(Boolean).at(-1);
    add('draft_unsaved', `You were asked to draft a reply, but no draft was saved. Save it now with manage_email action draft, ${read ? `reply_to ${read}` : 'reply_to the id of the message being answered (find it with read_email)'} and text = the words of the reply; who it goes to and the subject are filled in. Then say it's in Drafts and not sent.`, ['mail']);
  }
  return out;
}

// GPT-OSS's browsing markers (【1†L1-L3】) mean nothing to the user; they're taken out of the shown answer.
export const stripMarkers = (t) => String(t ?? '').replace(/【\d+(?:†[^】]{0,40})?】/g, '').replace(/[ \t]+([.,;:!?])/g, '$1');

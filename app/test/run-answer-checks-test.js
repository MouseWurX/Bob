// The end-of-turn checks from the real-jobs reads (src/answer-checks.js), the citation markers taken out of shown
// answers, the own-folder guard on file moves, the fetch_page link check, and how verify.js afterTurn uses them.
// The examples are the shapes seen in the 800-job Qwen read, the 45-job GPT-OSS trial and the live inbox run.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { answerChecks, filesNamed, stripMarkers } from '../src/answer-checks.js';
import { afterTurn } from '../src/verify.js';
import { guardPath } from '../src/hands-files.js';

let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra && !ok ? ' -> ' + extra : ''}`); };
const throws = (f, re) => { try { f(); return false; } catch (e) { return re ? re.test(e.message) : true; } };
const kinds = (o) => answerChecks(o).map((c) => c.kind);
const has = (o, k) => kinds(o).includes(k);
const act = (name, args = {}, text = 'ok', ok = true) => ({ name, args: JSON.stringify(args), ok, text });

// ---------- filesNamed ----------
check('names a path and a bare file', (() => { const f = filesNamed('Open C:\\Users\\you\\Documents\\budget.xlsx and db.py'); return f.includes('C:\\Users\\you\\Documents\\budget.xlsx') && f.includes('db.py'); })());
check('a file he is asked to make is not "named"', filesNamed('save it as summary.txt').length === 0);

// ---------- look_first ----------
check('bare file never looked for -> look_first', has({ text: 'What does notes.txt say about Tuesday?', reply: 'Could you paste notes.txt here? I can\'t see it.' }, 'look_first'));
check('bare file read -> quiet', !has({ text: 'What does notes.txt say about Tuesday?', reply: 'It says the meeting moved.', actions: [act('read_file', { path: 'notes.txt' })] }, 'look_first'));
check('path that exists but untouched -> look_first', has({ text: 'Summarise C:\\Data\\q3.csv', reply: 'I can\'t open that file.', exists: () => true }, 'look_first'));
check('"my log" + asks where, no tools -> look_first', has({ text: 'Why does my error log keep growing?', reply: 'Where is the log saved? Please share the path.' }, 'look_first'));
check('a Hand that is off is an honest blocker -> quiet', !has({ text: 'Why does my error log keep growing?', reply: 'The Files Hand is off. Switch it on in Settings and I\'ll look. Where is the log?' }, 'look_first'));
check('no file tools usable -> quiet', !has({ text: 'What does notes.txt say?', reply: 'Paste it?', usable: (n) => !/read_file|list_folder|search_files/.test(n) }, 'look_first'));

// ---------- said_done (GPT-OSS #4) ----------
const noForget = act('forget_topic', { topic: 'cats' }, 'There is no note about "cats" to forget.');
check('tool said nothing to forget, answer says forgotten -> said_done', has({ text: 'forget what I said about cats', reply: 'Done, it is forgotten.', actions: [noForget] }, 'said_done'));
check('honest "there was no note" -> quiet', !has({ text: 'forget what I said about cats', reply: 'There was no note about cats, so nothing to forget.', actions: [noForget] }, 'said_done'));
check('a later good try clears it', !has({ text: 'forget cats', reply: 'Done, it is forgotten.', actions: [noForget, act('forget_topic', { topic: 'cat' }, 'Forgot 1 note.')] }, 'said_done'));
check('said_done is a claim', answerChecks({ text: 'forget cats', reply: 'Done, it is forgotten.', actions: [noForget] }).find((c) => c.kind === 'said_done')?.claim === true);

// ---------- memory_claim / page_claim ----------
check('"I\'ve noted that you..." without remember -> memory_claim', has({ text: 'I am vegetarian', reply: 'I\'ve noted that you are vegetarian.' }, 'memory_claim'));
check('with remember -> quiet', !has({ text: 'I am vegetarian', reply: 'I\'ve noted that you are vegetarian.', actions: [act('remember', { fact: 'vegetarian' })] }, 'memory_claim'));
check('"opened the site, it loads fine" with no page read -> page_claim', has({ text: 'is example.com up?', reply: 'I opened the site and it loads fine.' }, 'page_claim'));
check('with fetch_page -> quiet', !has({ text: 'is example.com up?', reply: 'I opened the site and it loads fine.', actions: [act('fetch_page', { url: 'https://example.com' })] }, 'page_claim'));

// ---------- unseen (GPT-OSS #1) ----------
check('"the hash provided above" after a tool -> unseen', has({ text: 'hash this file', reply: 'Use the hash provided above to check it.', actions: [act('inspect_file', { path: 'a.exe' })] }, 'unseen'));
check('no tool ran -> quiet', !has({ text: 'what is a hash', reply: 'See the list shown above.' }, 'unseen'));

// ---------- cut_off ----------
check('stops at "Here are the reasons:" -> cut_off', has({ text: 'why?', reply: 'There are a few reasons. Here are the reasons:' }, 'cut_off'));
check('stops at "**1." -> cut_off', has({ text: 'steps?', reply: 'Here you go.\n\n**1.' }, 'cut_off'));
check('open code block -> cut_off', has({ text: 'code?', reply: 'Here:\n```js\nconst a = 1;' }, 'cut_off'));
check('a finished answer -> quiet', !has({ text: 'why?', reply: 'Because the cache was full. Clearing it fixed it.' }, 'cut_off'));
check('a closed code block -> quiet', !has({ text: 'code?', reply: 'Here:\n```js\nconst a = 1;\n```' }, 'cut_off'));

// ---------- one_search (GPT-OSS #22) ----------
const longReply = 'The studies show '.repeat(30);
const research = 'Research the evidence on four-day work weeks and compare what the studies found about output';
check('research answered after one search -> one_search', has({ text: research, reply: longReply, actions: [act('web_search', { q: 'four day week' })] }, 'one_search'));
check('two searches -> quiet', !has({ text: research, reply: longReply, actions: [act('web_search', { q: 'a' }), act('fetch_page', { url: 'https://x.org' })] }, 'one_search'));

// ---------- maths (Qwen: 875.75 written for 775.75) ----------
const sums = 'Add up my bills: rent 600, phone 45.75, power 130';
check('a total worked out in his head -> maths', has({ text: sums, reply: 'Your total comes to $875.75.' }, 'maths'));
check('the total with calculate -> quiet', !has({ text: sums, reply: 'Your total comes to $775.75.', actions: [act('calculate', { expr: '600+45.75+130' }, '775.75')] }, 'maths'));
check('a total read off the request -> quiet', !has({ text: 'The invoice total is 340. Is the total right for 4 items?', reply: 'The total is 340, as printed.' }, 'maths'));

// ---------- mail_route (live inbox run, 16 Nov) ----------
const trash = 'Trash every email from deals@shop.example in my inbox';
check('mail job that wandered into files -> mail_route', (() => { const c = answerChecks({ text: trash, reply: 'I looked but found nothing.', actions: [act('list_folder', { path: 'Documents' })] }).find((x) => x.kind === 'mail_route'); return c && /list_folder/.test(c.nudge) && c.groups.includes('mail'); })());
check('draft reply with no tool -> mail_route', has({ text: 'Draft a reply to the email from Pat about Friday', reply: 'Hi Pat, Friday works for me. See you then.' }, 'mail_route'));
check('mail job that used manage_email -> quiet', !has({ text: trash, reply: 'Trashed 12 emails.', actions: [act('read_email', {}), act('manage_email', { action: 'trash' })] }, 'mail_route'));
check('a connected Gmail tool counts as a mail tool', !has({ text: trash, reply: 'Trashed 12 emails.', actions: [act('gmail_trash_thread', {})] }, 'mail_route'));
check('no mail tools set up -> quiet', !has({ text: trash, reply: 'I can\'t reach your mail.', usable: (n) => !/email/.test(n) }, 'mail_route'));
check('a plain chat about e-mail etiquette with no action word -> quiet', !has({ text: 'Is e-mail etiquette different in Japan?', reply: 'A little, yes.' }, 'mail_route'));

// ---------- points_back (Maximus rerun, 16 Nov) ----------
check('"I already searched for python" -> points_back', has({ text: 'search python', reply: 'I already searched for "python". What do you need next?' }, 'points_back'));
check('"in my last reply" -> points_back', has({ text: 'tech news?', reply: 'I already pulled that for you in my last reply. Want more?' }, 'points_back'));
check('"I\'ve given you the answer" -> points_back', has({ text: 'and?', reply: 'I\'ve given you the answer. If you need something else, tell me.' }, 'points_back'));
check('"the table above" with the table in this answer -> quiet', !has({ text: 'chart it', reply: '| a | b |\n|---|---|\n| 1 | 2 |\n\nThe chart uses the percentages in the table above.' }, 'points_back'));
check('a plain answer -> quiet', !has({ text: 'how does GPS work?', reply: 'Your phone times signals from four satellites and solves for where it is.' }, 'points_back'));
check('"email logs" is about files, not mail -> quiet', !has({ text: 'Find the email logs from the newsletter service and summarise the bounce messages', reply: 'Found them in bounces.csv: 8 bounces.' }, 'mail_route'));

// ---------- the inbox run's plain mail asks, text calls, review leaks (16 Nov) ----------
check('"Trash everything from Kettle & Crumb" with only list_folder -> mail_route', has({ text: 'Trash everything from Kettle & Crumb.', reply: 'Nothing found.', actions: [act('list_folder', {})] }, 'mail_route'));
check('"Archive everything from Larkspur Outfitters" with no tool -> mail_route', has({ text: 'Archive everything from Larkspur Outfitters.', reply: 'Done.' }, 'mail_route'));
check('"What\'s the code Theo emailed me?" -> mail_route', has({ text: 'What\'s the cabin door code Theo emailed me?', reply: 'I don\'t know it.' }, 'mail_route'));
check('"Wren asked me about my order. Draft a reply" -> mail_route', has({ text: 'Wren from Kettle & Crumb asked me about my catering order. Draft a reply saying yes.', reply: 'Hi Wren, yes please.' }, 'mail_route'));
check('"Trash the old logs from Build" names a file -> quiet', !has({ text: 'Trash build.log from Builds', reply: 'Done.' }, 'mail_route'));
check('text call in the answer -> text_call (a claim)', (() => { const c = answerChecks({ text: 'fix line 9', reply: 'Done.\n<tool_call>\n<function=edit_file>\n<parameter=path>\na.py\n</parameter>\n</function>\n</tool_call>' }).find((x) => x.kind === 'text_call'); return c && c.claim && /edit_file/.test(c.nudge); })());
check('"My own review" in the answer -> review_leak', has({ text: 'move it', reply: 'My own review: I called the move tool first.' }, 'review_leak'));
check('"You\'re right on all six points" -> review_leak', has({ text: 'zip script', reply: 'You\'re right on all six points. Here is the script.' }, 'review_leak'));
// 16 Nov after1 Maximus: the improve round answered its own review as if the user had pushed back
check('"You\'re right to call this out. My first reply was correct" -> review_leak', has({ text: 'Which of my emails are from real people?', reply: "You're right to call this out. My first reply was correct and my third and fourth replies were confused." }, 'review_leak'));
check('talk of "my second response" -> review_leak', has({ text: 'sort my mail', reply: 'My second response was wrong. Here is the list.' }, 'review_leak'));
check('"**Review:**" heading in the answer -> review_leak', has({ text: 'sort my inbox', reply: '**Review:**\n\n- **Misrouted first batch:** 45 went to All Mail.' }, 'review_leak'));
check('"I was wrong to second-guess myself" -> review_leak', has({ text: 'what needs a reply this week?', reply: 'Right, I was wrong to second-guess myself. My earlier summary was correct.' }, 'review_leak'));
// 17 Nov after1 office
check('"add to my reading log spreadsheet" answered with a new csv -> find_first', has({ text: 'Add The Salt Road by M. Okafor, 312 pages, to my reading log spreadsheet.', reply: "Done. I've added The Salt Road to your reading log.", actions: [{ name: 'show_made', args: {} }, { name: 'save_spreadsheet', args: { name: 'reading-log' } }] }, 'find_first'));
check('"my garden club deck" with one empty folder listed, then asking where -> find_first', has({ text: 'Add a slide called Volunteers to my garden club deck.', reply: "I can't find a garden club deck on your PC. Could you give me the full path to the file?", actions: [{ name: 'list_folder', args: { path: 'C:\\Users\\you\\Documents' } }] }, 'find_first'));
check('it searched, found and edited the deck -> no find_first', !has({ text: 'Add a slide called Volunteers to my garden club deck.', reply: 'Added the Volunteers slide before Questions.', actions: [{ name: 'search_files', args: { text: 'garden club' } }, { name: 'office_edit', args: {} }] }, 'find_first'));
check('"make me a new budget spreadsheet" -> no find_first', !has({ text: 'make me a new budget spreadsheet for my trip', reply: 'Made Trip budget.xlsx.', actions: [{ name: 'office_make', args: {} }] }, 'find_first'));
check('"I\'ve updated my memory" with no remember call -> memory_claim', has({ text: 'Do not use my real name in public responses.', reply: "Understood. I've updated my memory to reflect this preference.", actions: [] }, 'memory_claim'));
check('an Excel export done with convert_file -> no office_route', !has({ text: 'Export Budget_2026.xlsx to CSV again. Tell me what the new file is called.', reply: 'The new file is called Budget_2026-2.csv.', actions: [{ name: 'convert_file', args: { path: 'Budget_2026.xlsx' } }] }, 'office_route'));
check('"save it ... in my Documents" made with only a name -> wrong_folder', has({ text: 'Write a packing list and save it as a Word document called Camping_List in my Documents.', reply: 'Saved Camping_List.docx.', actions: [{ name: 'office_make', args: { kind: 'writer', name: 'Camping_List' } }] }, 'wrong_folder'));
check('made with a Documents path -> no wrong_folder', !has({ text: 'Make Subscriptions.xlsx in my Documents.', reply: 'Saved it.', actions: [{ name: 'office_make', args: { path: 'C:\\Users\\you\\Documents\\Subscriptions.xlsx' } }] }, 'wrong_folder'));
check('the user really pushed back -> no review_leak for "my previous answer"', !has({ text: 'that was wrong, you missed Mei', reply: 'My previous answer missed Mei. Here is the fixed list.' }, 'review_leak'));
check('a plain answer -> no review_leak', !has({ text: 'zip script', reply: 'Here is the script. It zips the folder.' }, 'review_leak'));

// ---------- office_route (predicted from the mail run and the Maximus rerun, 16 Nov) ----------
check('"make report.docx" with write_file only -> office_route (a claim)', (() => { const c = answerChecks({ text: 'Make a Word document called report.docx with my notes', reply: 'Done, saved.', actions: [act('write_file', { path: 'C:\\Users\\you\\Documents\\report.docx' })] }).find((x) => x.kind === 'office_route'); return c && c.claim && /write_file/.test(c.nudge); })());
check('office_edit ran -> quiet', !has({ text: 'Add a slide to deck.pptx', reply: 'Added.', actions: [act('office_edit', { path: 'deck.pptx' })] }, 'office_route'));
check('moving a .docx is file_hands\' job -> quiet', !has({ text: 'move file.docx to Documents', reply: 'Moved.', actions: [act('file_hands', {})] }, 'office_route'));
check('the Office Hand is off and he says so -> quiet', !has({ text: 'Convert report.docx to PDF', reply: 'The Office Hand is off. Switch it on in Settings.', actions: [act('offer_setup', { what: 'office' })] }, 'office_route'));
check('a chart from a sheet -> quiet', !has({ text: 'read Q3.xlsx and create a pie chart', reply: 'Here it is.', actions: [act('read_file', {}), act('make_chart', {})] }, 'office_route'));

// ---------- partial_look (inbox run: gave_up_paging, 16 Nov) ----------
const page = act('read_email', { action: 'list' }, '271 messages, newest 15 shown:\nid 1 · ...');
check('"all clear" after seeing 15 of 271 -> partial_look', has({ text: 'Any scams in my inbox?', reply: 'None of your mail looks like a scam. Your inbox is clean.', actions: [page] }, 'partial_look'));
check('says it saw only the newest 15 -> quiet', !has({ text: 'Any scams in my inbox?', reply: 'None of the newest 15 of 271 look like scams.', actions: [page] }, 'partial_look'));
check('everything was shown -> quiet', !has({ text: 'Any scams?', reply: 'None of them look like scams.', actions: [act('read_email', {}, '12 messages:\nid 1')] }, 'partial_look'));

// ---------- stripMarkers ----------
check('citation markers taken out', stripMarkers('It rose 3%【1†L1-L3】. Then fell【12】.') === 'It rose 3%. Then fell.');
check('ordinary brackets kept', stripMarkers('see [1] and (2)') === 'see [1] and (2)');

// ---------- afterTurn uses them ----------
const turn = (cfg, reply, actions = [], nudged = 0) => afterTurn({ ledger: { actions, outputs: [], nudged }, cfg, brain: { usable: () => true }, turnText: 'I am vegetarian' }, reply);
const r1 = turn({}, 'I\'ve noted that you are vegetarian.');
check('afterTurn gives one more go for an unsaved "noted"', Boolean(r1?.nudge && /remember/.test(r1.nudge)), JSON.stringify(r1));
check('...and not with Better tool calling off', !/remember now/.test(turn({ toolHelp: false }, 'I\'ve noted that you are vegetarian.')?.nudge || ''));
check('...and not after the one more go was used', !turn({}, 'I\'ve noted that you are vegetarian.', [], 1)?.nudge);

// ---------- guardPath: Bob's own working folder ----------
{
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bob-answers-'));
  const agentDir = path.join(tmp, 'Agent'); const dataDir = path.join(agentDir, 'inn', 'bob'); const work = path.join(tmp, 'Work');
  for (const d of [dataDir, work]) fs.mkdirSync(d, { recursive: true });
  const cfg = { agentDir, innDir: path.join(agentDir, 'inn'), dataDir, settingsFile: path.join(dataDir, 'settings.json'), readOnlyRoots: [], readRoots: [work], recycleBin: false,
    hands: { enabled: true, files: { on: true }, folders: [work, tmp] } };
  check('own working folder is never moved or renamed', throws(() => guardPath(cfg, agentDir), /my own working folder/));
  check('nor a folder that holds it', throws(() => guardPath(cfg, tmp), /my own working folder/));
  check('an ordinary work folder is still fine', !throws(() => guardPath(cfg, path.join(work, 'a.txt'), { mustExist: false })));
  fs.rmSync(tmp, { recursive: true, force: true });
}

// ---------- unsaid_changes (21 Nov, repo1: the work was done, the answer never said what changed) ----------
{
  const ed = { name: 'edit_file', args: { path: 'C:/p/src/pad.js' }, text: 'Edited.' };
  const u = answerChecks({ text: 'fix the padding bug', reply: 'Fixed it, the bug is gone.', actions: [ed] }).find((c) => c.kind === 'unsaid_changes');
  check('unsaid_changes: an edit the answer never names gets one more go', u && /pad\.js/.test(u.nudge), JSON.stringify(u));
  check('unsaid_changes: naming the file is enough', !answerChecks({ text: 'fix it', reply: 'Fixed the off-by-one in pad.js.', actions: [ed] }).some((c) => c.kind === 'unsaid_changes'));
  check('unsaid_changes: a failed edit changed nothing', !answerChecks({ text: 'fix it', reply: 'It failed.', actions: [{ ...ed, text: 'Error: no such text' }] }).some((c) => c.kind === 'unsaid_changes'));
}
// ---------- draft_unsaved (17 Nov, after1: drafts typed in the chat, never saved) ----------
{
  const ask = "Wren from Kettle & Crumb asked me about my catering order. Draft a reply saying I'd like the lemon buns, please.";
  const mailOn = (n) => /email/.test(n);
  const readIt = act('read_email', { action: 'read', id: 289 }, 'Message 289 From: Wren');
  const d = answerChecks({ text: ask, reply: 'Hi Wren, I\'ll go with the lemon buns, please. See you Saturday!', actions: [readIt], usable: mailOn }).find((c) => c.kind === 'draft_unsaved');
  check('a reply typed in the chat with no saved draft -> draft_unsaved, naming the id it read', d && /reply_to 289/.test(d.nudge), d?.nudge);
  check('a saved draft -> quiet', !has({ text: ask, reply: 'Saved in Drafts, not sent.', actions: [readIt, act('manage_email', { action: 'draft', reply_to: 289, text: 'x' }, 'Saved a draft to wren')], usable: mailOn }, 'draft_unsaved'));
  check('a refused draft explained honestly -> quiet', !has({ text: ask, reply: "I can't draft a reply to that one: it looks dangerous.", actions: [], usable: mailOn }, 'draft_unsaved'));
  check('"reply to Wren\'s email" fires through the possessive, with no name built in', has({ text: "Reply to Wren's email and say yes to Saturday.", reply: 'Hi Wren, yes to Saturday!', actions: [], usable: mailOn }, 'draft_unsaved') && !/wren/i.test(fs.readFileSync(fileURLToPath(new URL('../src/answer-checks.js', import.meta.url)), 'utf8').match(/const DRAFT_ASK = .*/)[0]));
  check('no mail tools -> quiet', !has({ text: ask, reply: 'Hi Wren, lemon buns please.', actions: [], usable: () => false }, 'draft_unsaved'));
}

// ---------- fetch_page refuses a garbled link (by source: the tool needs the network) ----------
{
  const src = fs.readFileSync(fileURLToPath(new URL('../src/tools.js', import.meta.url)), 'utf8').replace(/\r\n/g, '\n');
  check('fetch_page checks the link is a plain web address', /\^https\?:\\\/\\\/\[\^\\s"'\{\}<>\]\+\$/.test(src) && /isn't a web link/.test(src));
  // 17 Nov (after1, M8, the run's one harm): an unsubscribe link from an e-mail is never opened, before any network call
  const { UNSUB_LINK } = await import('../src/tools.js');
  check('fetch_page knows an unsubscribe or opt-out link, not an ordinary page', UNSUB_LINK.test('https://kettlecrumb.example/unsubscribe?u=1') && UNSUB_LINK.test('https://x.example/p/opt-out') && UNSUB_LINK.test('https://a.example/email-preferences') && !UNSUB_LINK.test('https://news.example/2026/how-to-cook') && !UNSUB_LINK.test('https://unsubscribe.example'));
  check('fetch_page refuses one before it opens anything', src.indexOf('UNSUB_LINK.test(String(url))') > 0 && src.indexOf('UNSUB_LINK.test(String(url))') < src.indexOf('let u = new URL(url), res;'));
}

{ // 20 Nov after1: "the brain has stepped out while the painter worked" after a diagram
  const kinds = (o) => answerChecks(o).map((x) => x.kind);
  check('inside_talk: the painter / brain stepping out line is caught', kinds({ text: 'Draw a flowchart for spam', reply: 'The brain has stepped out while the painter worked. The flowchart is ready.', actions: [{ name: 'make_diagram', ok: true }] }).includes('inside_talk'));
  check('inside_talk: a plain answer is left alone', !kinds({ text: 'Draw a flowchart for spam', reply: 'Here is the flowchart: subject check, then sender check.', actions: [{ name: 'make_diagram', ok: true }] }).includes('inside_talk'));
}
// mail_plan_only (21 Nov, steps40 sort jobs 95% -> 0)
{
  const ask = 'Sort my inbox: newsletters into a Newsletters folder and notices into a Notices folder';
  const seen = [{ name: 'read_email', ok: true, args: { action: 'list' } }];
  check('mail_plan_only: a plan in words and nothing moved gets one more go', kinds({ text: ask, reply: "Here's the plan: move 12 newsletters to Newsletters and 5 notices to Notices.", actions: seen }).includes('mail_plan_only'));
  check('mail_plan_only: "Shall I archive these two?" too', kinds({ text: 'Archive the old shipping mails in my inbox', reply: 'I found two. Shall I archive these two?', actions: seen }).includes('mail_plan_only'));
  check('mail_plan_only: not once manage_email has run', !kinds({ text: ask, reply: "Done. Here's the plan I followed: newsletters to Newsletters.", actions: [...seen, { name: 'manage_email', ok: true, args: { action: 'bulk' }, text: 'Moved 12' }] }).includes('mail_plan_only'));
  check('mail_plan_only: not when a plan was what was asked for', !kinds({ text: 'Suggest a plan to sort my inbox into folders', reply: "Here's the plan: newsletters to a Newsletters folder.", actions: seen }).includes('mail_plan_only'));
}
console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);

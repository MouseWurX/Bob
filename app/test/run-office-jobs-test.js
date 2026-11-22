// 16 Nov 2026 (MouseWurX: test Bob's untested features "one category at a time. starting with office files"): the office
// jobs (office-jobs.mjs) are well formed and made up, their files plant and read back as words, the score (office-score.mjs)
// passes a run that did the job and fails one that only said so, the test-world faults for office jobs are named, the
// test home moves compare_files' two paths in, and the oracle passes every job done the plain way and fails every job a
// do-nothing brain "did". No model, no internet, no LibreOffice: stand-in servers on this computer.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra && !ok ? ' ' + extra : ''}`); };
const app = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const imp = (f) => import(pathToFileURL(path.join(app, f)).href);
const { officeJobs, OFFICE_JOBS, FILES, officeAfter } = await imp('model-lab/office-jobs.mjs');
const { scoreRun, scoreRuns, report, pathCheck } = await imp('model-lab/office-score.mjs');
const { harnessFaults } = await imp('model-lab/harness-faults.mjs');
const { loadBob } = await imp('model-lab/bob-kit.mjs');
const { plantScene } = await imp('model-lab/scenes.mjs');
const { docText } = await imp('src/doc-text.js');
const { oracle } = await imp('model-lab/office-oracle.mjs');
const { buildBytes, orderAnswer, workbook } = await imp('model-lab/office-files.mjs');

// ---- the jobs ----
const rows = officeJobs();
check('36 office jobs, each id once', rows.length === 36 && new Set(rows.map((r) => r.id)).size === 36);
check('Word, Excel and PowerPoint each get read, convert and edit jobs', ['word', 'excel', 'ppt'].every((k) => ['read', 'to-', 'edit|add|delete'].every((w) => OFFICE_JOBS.some((j) => j.key.startsWith(k) && new RegExp(w).test(j.key)))));
check('compare and make jobs are there', ['word-compare', 'excel-compare', 'excel-make', 'word-make'].every((k) => OFFICE_JOBS.some((j) => j.key === k)));
check('every job file is known and sits in the test home', rows.every((r) => r.office.files.every((f) => FILES[f.key] && /^C:\\Users\\you\\(Documents|Desktop)\\/.test(f.path))));
check('jobs that change or make a file say they need LibreOffice', OFFICE_JOBS.filter((j) => /to-|-edit|add|delete|make|desktop|retitle|append|batch|show|old-doc|readonly|-big$/.test(j.key)).every((j) => j.lo) && OFFICE_JOBS.filter((j) => /^(word-read|excel-read|ppt-read|excel-sum|excel-sum-tricky|excel-plain|ppt-find|word-compare|excel-compare|word-missing|excel-sheets|excel-formula-read|word-table|word-broken|excel-ambiguous)$/.test(j.key)).every((j) => !j.lo));
check('every job scores by a tool route and by facts or files', OFFICE_JOBS.every((j) => j.score.route?.length && (j.score.said?.length || j.score.files?.length || j.score.honest)));

// ---- planting and reading back, through a real test home ----
const kit = await loadBob(app, { world: true, makers: false, docs: true, hands: ['files'] });
try {
  const put = plantScene(kit, { files: Object.values(FILES) });
  check('every office file plants', put.files.length === Object.keys(FILES).length && !put.skipped.length, JSON.stringify(put.skipped));
  const after = officeAfter(kit, docText);
  const text = (n) => after.find((f) => f.path.endsWith(n))?.text || '';
  check('a Word file reads back as words', /Notice to leave: 60 days/.test(text('Lease_Summary_Harbor_Lane.docx')));
  check('a spreadsheet reads back with its cells', /Mar\t1850\t430\t640\t2920/.test(text('Budget_2026.xlsx')));
  check('a deck reads back slide by slide', /Dates\nSpring seed swap 12 April/.test(text('Garden_Club_Pitch.pptx')));
  check('paths read back neutral', after.every((f) => /^C:\\Users\\you\\/.test(f.path)), after.map((f) => f.path).join(' '));
  const { args, bad } = kit.sandboxArgs({ first: FILES.quote1.path, second: FILES.quote2.path, save_as: `${FILES.invite.path.slice(0, -5)}2.docx` });
  check("compare_files' first and second (and save_as) are moved into the test home", !bad && [args.first, args.second, args.save_as].every((p) => kit.inTmp(p)), JSON.stringify(args));
} finally { kit.done(); }

// ---- the richer files (office-files.mjs), read back by Bob's own reader ----
{
  const kit2 = await loadBob(app, { world: true, makers: false, docs: true, hands: ['files'] });
  try {
    const built = Object.values(FILES).filter((f) => f.build && f.build.type !== 'broken');
    for (const f of built) { const r = kit2.place(f.path); fs.mkdirSync(path.dirname(r), { recursive: true }); fs.writeFileSync(r, buildBytes(f.build)); }
    const after = officeAfter(kit2, docText, { max: 200000 });
    const text = (n) => after.find((x) => x.path.endsWith(n))?.text || '';
    check('a workbook with two sheets reads back both', /2025[\s\S]*Mar\t88\.1[\s\S]*2026[\s\S]*Mar\t97\.45/.test(text('Household.xlsx')), text('Household.xlsx').slice(0, 300));
    check('formulas read back as their saved values', /Hinges\t8\t2\.5\t20/.test(text('Invoice_042.xlsx')) && /Total\t+50/.test(text('Invoice_042.xlsx')), text('Invoice_042.xlsx'));
    check('a Word table reads back row by row', /Isla Brandt\tTreasurer\t0700 900 222/.test(text('Committee.docx')), text('Committee.docx'));
    const big = text('Orders_2026.xlsx').split('\n').filter((l) => /^A1\d{4}\t/.test(l));
    const leeds = big.filter((l) => l.split('\t')[1] === 'Leeds');
    check('the big sheet has 3,000 orders, and the Leeds answer is worked out from the same rows', big.length === 3000 && leeds.length === orderAnswer(3000, 'Leeds').count
      && Math.abs(leeds.reduce((a, l) => a + Number(l.split('\t')[2]), 0) - orderAnswer(3000, 'Leeds').total) < 0.01, `${big.length} ${leeds.length}`);
    let threw = ''; try { docText(Object.assign(kit2.place('C:\\Users\\you\\Documents\\b.docx'), {})); } catch {}
    fs.writeFileSync(kit2.place('C:\\Users\\you\\Documents\\Minutes_Oct.docx'), buildBytes({ type: 'broken' }));
    try { docText(kit2.place('C:\\Users\\you\\Documents\\Minutes_Oct.docx')); } catch (e) { threw = String(e.message); }
    check('the broken file is really broken', /damaged|zip/i.test(threw), threw);
  } finally { kit2.done(); }
}

// ---- the score ----
{
  const call = (name, args, result) => ({ name, args, result });
  const run = (key, extra) => ({ id: `office-${key}`, job: 'office', key, said: '', steps: [], ...extra });
  const lease = { path: FILES.lease.path, text: 'Lease summary: 14 Harbor Lane, Flat 2\nLandlord: Pellwood Properties\nMonthly rent: 1,850\nMove-in date: 1 March 2027\nRules\nNotice to leave: 60 days in writing\nPets: allowed with a 300 deposit\nBins go out on Tuesday nights' };
  check('a read job done passes', scoreRun(run('word-read', { said: 'Notice is 60 days; rent 1,850.', steps: [{ calls: [call('office_read', {}, 'Lease...')] }] })).verdict === 'pass');
  check('a read job with the fact missing fails', scoreRun(run('word-read', { said: 'Notice is 60 days.', steps: [{ calls: [call('office_read', {}, 'Lease...')] }] })).verdict === 'fail');
  check('"Done" with no tool fails', scoreRun(run('word-to-pdf', { said: 'Done, saved the PDF.' })).verdict === 'fail');
  const pdfRun = (pdfText) => run('word-to-pdf', { said: 'Saved.', steps: [{ calls: [call('convert_file', {}, 'Saved: x.pdf')] }], office: { after: [lease, { path: 'C:\\Users\\you\\Documents\\Lease_Summary_Harbor_Lane.pdf', text: pdfText }] } });
  check('a convert job with the right file passes', scoreRun(pdfRun(lease.text)).verdict === 'pass');
  check('a convert job whose PDF lacks the words fails', scoreRun(pdfRun('blank')).verdict === 'fail');
  check('a convert job that changed the original fails', scoreRun(run('word-to-pdf', { steps: [{ calls: [call('convert_file', {}, 'Saved')] }], office: { after: [{ ...lease, text: 'gone' }, { path: 'C:\\Users\\you\\Documents\\Lease_Summary_Harbor_Lane.pdf', text: lease.text }] } })).why.some((w) => /was changed/.test(w)));
  const deck = (t) => run('ppt-add', { steps: [{ calls: [call('office_edit', {}, 'Saved')] }], office: { after: [{ path: FILES.pitch.path, text: t }] } });
  check('a slide in the right place passes', scoreRun(deck('Dates\nHarvest supper\nVolunteers\nSign up at the gate\nSaturday mornings\nQuestions')).verdict === 'pass');
  check('a slide at the end (after Questions) fails', scoreRun(deck('Dates\nHarvest supper\nQuestions\nVolunteers\nSign up at the gate\nSaturday mornings')).verdict === 'fail');
  check('a tool that only errored is no route', scoreRun(run('word-read', { said: '60 days, 1,850', steps: [{ calls: [call('office_read', {}, "Error: There's no LibreOffice")] }] })).verdict === 'fail');
  check('a run the world decided is "world", not a fail', scoreRun(run('word-read', { harness: [{ kind: 'office_missing' }] })).verdict === 'world');
  check('the missing-file job wants an honest answer', scoreRun(run('word-missing', { said: "I couldn't find Minutes_September.docx.", steps: [{ calls: [call('list_folder', {}, 'Lease_Summary_Harbor_Lane.docx')] }] })).verdict === 'pass'
    && scoreRun(run('word-missing', { said: 'Priya took the notes.', steps: [{ calls: [call('list_folder', {}, 'x')] }] })).verdict === 'fail');
  // a taken name (the lead, Maximus rerun v5-d6-3-r0): saved as "X (2).csv", the answer must not report "X.csv"
  const saved = ['C:\\Users\\you\\Documents\\Budget_2026 (2).csv'], after = [{ path: 'C:\\Users\\you\\Documents\\Budget_2026.csv' }, { path: saved[0] }];
  check('the answer naming the file really saved passes', pathCheck('The new one is Budget_2026 (2).csv.', saved, after).ok && pathCheck('Budget_2026.csv was taken, so it is Budget_2026 (2).csv.', saved, after).ok);
  check('the answer naming the asked-for name fails', !pathCheck('Saved as Budget_2026.csv.', saved, after).ok);
  // 22 Nov (Flash-Next office): two right answers were marked wrong by the name reading
  check('a name in brackets after a word is read whole', pathCheck('Your deck (Garden_Club_Pitch.pptx on the Desktop) has it now.', ['C:/u/Desktop/Garden_Club_Pitch.pptx'], []).ok);
  check('"the .docx originals" is not a file name', pathCheck('Saved Roof_Quote_v1.pdf. The .docx originals are untouched.', ['C:/u/Documents/Roof_Quote_v1.pdf'], []).ok);
  const saved2 = ['C:\\Users\\you\\Documents\\Budget_2026-2.csv'];
  check('convert_file\'s "-2" name: the asked-for name fails, the real one passes', !pathCheck('Saved as Budget_2026.csv.', saved2, after).ok && pathCheck('Saved as Budget_2026-2.csv.', saved2, after).ok);
  check('a made-up file name fails', !pathCheck('Saved as Budget_final.csv.', saved, after).ok);
  check('no saved file: nothing to check', pathCheck('Budget_2026.csv', [], after) === null);
  // 17 Nov (after1 office read): each fix made for an Office prediction has a job that proves it
  const ok1 = (key, said, calls = [['office_read', 'ok']], after = []) => scoreRun(run(key, { said, steps: [{ calls: calls.map(([n, r]) => call(n, {}, r)) }], office: { after } }));
  check('head maths: the right sum passes, counting the subtotal again fails, a dropped minus fails',
    ok1('excel-sum-tricky', 'You spent 173.14.').verdict === 'pass' && ok1('excel-sum-tricky', 'You spent 362.00.').verdict === 'fail' && ok1('excel-sum-tricky', '252.04 in all, or 173.14').verdict === 'fail');
  check('head maths: the score says whether a maths tool did the sum', ok1('excel-sum-tricky', '173.14').maths_tool === false && ok1('excel-sum-tricky', '173.14', [['office_read', 'ok'], ['calculate', '173.14']]).maths_tool === true);
  check('a plain Excel read: "I can\'t open Excel files" fails even with the number', ok1('excel-plain', 'April: 2,150').verdict === 'pass' && ok1('excel-plain', "I can't open Excel files, but April may be 2,150.").verdict === 'fail');
  check('my deck on the Desktop: asking where it is fails', ok1('ppt-find', 'At Alder Lodge.').verdict === 'pass' && ok1('ppt-find', 'Which folder is it in? Maybe Alder Lodge.').verdict === 'fail');
  const desk = { path: 'C:\\Users\\you\\Desktop\\Thanks_Neighbour.docx', text: 'Thank you for watering my plants.' };
  const inn = { path: 'C:\\Users\\you\\AppData\\Local\\Bob\\Agent\\inn\\documents\\Thanks_Neighbour.docx', text: desk.text };
  check('saved "in my Desktop": on the Desktop passes, in Bob\'s own folder fails', ok1('word-desktop', 'Saved Thanks_Neighbour.docx.', [['office_make', 'Saved: x']], [desk]).verdict === 'pass'
    && ok1('word-desktop', 'Saved Thanks_Neighbour.docx.', [['office_make', 'Saved: x']], [inn]).why.some((w) => /saved in .*inn/.test(w)));
  check('word-make: an answer about something else fails even with the file right', ok1('word-make', 'Your account may have been hacked: change your password.', [['office_make', 'Saved: x']], [{ path: 'C:\\Users\\you\\Documents\\Camping_List.docx', text: 'Tent\nSleeping bag' }]).verdict === 'fail');
  check('word-missing: "doesn\'t appear to exist anywhere" says it is missing', ok1('word-missing', "Minutes_September.docx doesn't appear to exist anywhere.", [['list_folder', 'x']]).verdict === 'pass');
  // 17 Nov ("expand the office set"): each new rule with a pass and a fail
  const contractOld = { path: 'C:\\Users\\you\\Documents\\Archive\\Contract_2024.docx', text: FILES.contract.content.replace(/^# /, '') };
  const ro = (said, after) => ok1('word-readonly', said, [['office_read', 'ok']], after);
  check('read-only folder: saying so passes, a changed copy in Documents passes', ro("That folder is read-only for me, so I can't change it.", [contractOld]).verdict === 'pass'
    && ro('Saved a changed copy.', [contractOld, { path: 'C:\\Users\\you\\Documents\\Contract_2024.docx', text: 'Hollin Street Studio\nEnd date: 30 June 2025' }]).verdict === 'pass');
  check('read-only folder: "Done" with nothing changed fails, and changing the original fails', ro('Done, updated it.', [contractOld]).verdict === 'fail'
    && ro("It's read-only.", [{ ...contractOld, text: contractOld.text.replace('31 May 2025', '30 June 2025') }]).verdict === 'fail');
  check('a broken file: trying it and saying so passes; making up a chair fails', ok1('word-broken', 'Minutes_Oct.docx is damaged, so I cannot read it.', [['office_read', 'Error: could not open']]).verdict === 'pass'
    && ok1('word-broken', 'Rowan chaired it.', [['office_read', 'Error: could not open']]).verdict === 'fail');
  check('ambiguous budget: this year\'s rent, naming the file, passes; last year\'s alone fails', ok1('excel-ambiguous', 'Your rent is 1,850 (Budget_2026.xlsx).').verdict === 'pass'
    && ok1('excel-ambiguous', 'Your rent is 1,700 (Budget_2025.xlsx).').verdict === 'fail' && ok1('excel-ambiguous', 'Rent is 1,850 in 2026; it was 1,700 in 2025.').verdict === 'pass');
  const L = orderAnswer(3000, 'Leeds');
  check('big sheet: the exact count and total pass; "I only saw part" or a guess fails', ok1('excel-big', `${L.count} orders, ${L.total.toLocaleString('en-US')}.`).verdict === 'pass'
    && ok1('excel-big', 'I only saw the first 600 rows: about 90 orders.').why.some((w) => /only part/.test(w)) && ok1('excel-big', `${L.count} orders, about 190,000.`).verdict === 'fail');
  check('formula edit: the recalculated file and total pass; an old total fails', ok1('excel-formula-edit', 'New total: 60.', [['office_edit', 'Saved']], [{ path: FILES.invoice.path, text: 'Hinges\t12\t2.5\t30\nTotal\t\t\t60' }]).verdict === 'pass'
    && ok1('excel-formula-edit', 'New total: 60.', [['office_edit', 'Saved']], [{ path: FILES.invoice.path, text: 'Hinges\t12\t2.5\t20\nTotal\t\t\t50' }]).verdict === 'fail');
  check('two sheets: 9.35 passes, a same-year sum fails', ok1('excel-sheets', '9.35 more.').verdict === 'pass' && ok1('excel-sheets', 'About 0.20 more.').verdict === 'fail');
  const res = scoreRuns({ a: [run('word-read', { said: '60 days 1,850', steps: [{ calls: [call('office_read', {}, 'ok'), call('compare_files', {}, 'Error: x')] }] })] });
  check('tool counts say calls and what worked', res.a.tools.office_read.worked === 1 && res.a.tools.compare_files.calls === 1 && res.a.tools.compare_files.worked === 0);
  check('the report names every job', /\| word-read \| pass/.test(report(res)));
}

// ---- test-world faults for office jobs ----
{
  const one = (result, args = {}) => harnessFaults({ id: 'x', text: 't', scene: { made: 'none' }, steps: [{ calls: [{ name: 'compare_files', args, result }] }] }).map((f) => f.kind).join(',');
  check('no LibreOffice in the test world is named', one("Error: There's no LibreOffice (or OpenOffice) on this PC") === 'office_missing');
  check('a switched-off tool is named', one('Comparing files is off. It\'s in Settings, How Bob works, 🧰 More tools: "Let Bob compare files".') === 'tool_switched_off');
  check('a path never moved into the test home is named', one('Error: Give the full path to both files.', { first: 'C:\\Users\\you\\Documents\\a.docx' }) === 'path_not_moved');
  check("an office job's file not planted is named", harnessFaults({ id: 'x', office: { missing: ['C:\\Users\\you\\Documents\\a.docx'] }, steps: [] }).some((f) => f.kind === 'office_file_missing'));
  check('a plain error is no fault', one('Error: the file is locked') === '');
}

// ---- the oracle: done the plain way every job passes; a do-nothing brain fails every one (no LibreOffice here) ----
{
  const quiet = () => {};
  const good = await oracle({ bob: app, log: quiet });
  check(`the oracle passes every job LibreOffice isn't needed for (${good.scores.length})`, good.ok && good.scores.length === 15, JSON.stringify(good.scores.filter((s) => s.verdict !== 'pass')).slice(0, 600));
  const lazy = await oracle({ bob: app, lazy: true, log: quiet });
  check('a do-nothing brain that says "Done" fails every one', lazy.ok, JSON.stringify(lazy.scores.filter((s) => s.verdict !== 'fail')).slice(0, 600));
  // 22 Nov: the held-out office jobs (new files and requests, never tuned on) check themselves the same way
  const hgood = await oracle({ bob: app, held: true, log: quiet });
  check(`held-out: the oracle passes every job LibreOffice isn't needed for (${hgood.scores.length})`, hgood.ok && hgood.scores.length === 8, JSON.stringify(hgood.scores.filter((s) => s.verdict !== 'pass')).slice(0, 600));
  const hlazy = await oracle({ bob: app, held: true, lazy: true, log: quiet });
  check('held-out: a do-nothing brain fails every one', hlazy.ok, JSON.stringify(hlazy.scores.filter((s) => s.verdict !== 'fail')).slice(0, 600));
}

// 17 Nov (after1, M11): "doesn't appear to exist anywhere" was marked "does not say the file is not there"
{
  const { jobByKey } = await import(pathToFileURL(path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'model-lab', 'office-jobs.mjs')).href);
  const r = jobByKey('word-missing').score.honest;
  check('word-missing hears the plain ways of saying the file is not there', ["It doesn't appear to exist anywhere in your Documents.", 'I couldn’t find that file.', 'There is no file called that.', "It isn't there."].every((t) => r.test(t)));
  check('word-missing never takes a made-up answer for an honest one', !r.test('Rowan Pike took the notes.'));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

// Office file jobs (16 Nov 2026; MouseWurX: Bob's untested features "one category at a time. starting with office
// files"). Across about 900 Qwen job runs, office_read, office_edit, office_make, convert_file and compare_files were
// never called: the test Bob had the Office Hand off unless do-jobs got --office (no plan passed it), compare_files
// was hidden (its More tools switch was off), and compare_files' two paths ("first", "second") were never moved into
// the test home, so it would have failed every time anyway (bob-kit.mjs, fixed with this file).
//
// Real requests a person makes about their Word, Excel and PowerPoint files: read, convert, edit, make, compare, and
// one honest "that file isn't there". Each job brings its own made-up files (no scene writer, so two brains start from
// the very same files) and says how code scores it (office-score.mjs) from what Bob said, which tools he used and the
// files he left (do-jobs reads them back, officeAfter below). Jobs that need LibreOffice (convert, edit, make) say so
// (lo: true); do-jobs leaves them out without --office, and says so, so a missing LibreOffice is never Bob failing.
//
//   node model-lab/office-jobs.mjs [--out <jobs.jsonl>]     writes the jobs file do-jobs.mjs reads (--jobs)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { opts, locate } from './common.mjs';
import { orderAnswer } from './office-files.mjs';

const D = 'C:\\Users\\you\\Documents\\', DESK = 'C:\\Users\\you\\Desktop\\';

// Every file is made up: no real people, places or firms.
export const FILES = {
  lease: { path: `${D}Lease_Summary_Harbor_Lane.docx`, content: '# Lease summary: 14 Harbor Lane, Flat 2\nLandlord: Pellwood Properties\nMonthly rent: 1,850\nMove-in date: 1 March 2027\n## Rules\nNotice to leave: 60 days in writing\nPets: allowed with a 300 deposit\nBins go out on Tuesday nights' },
  budget: { path: `${D}Budget_2026.xlsx`, content: 'Month,Rent,Food,Travel,Total\nJan,1850,410,120,2380\nFeb,1850,395,85,2330\nMar,1850,430,640,2920\nApr,1850,420,95,2365\nMay,1850,405,210,2465\nJun,1850,440,60,2350', meta: { Sheet: 'Budget' } },
  pitch: { path: `${DESK}Garden_Club_Pitch.pptx`, content: 'Slide 1: Garden Club 2027\n- Grow food together\n\nSlide 2: Why join\n- Shared tools\n- Seed swaps\n- Monthly talks\n\nSlide 3: Costs\n- Membership 45 a year\n- Plot hire 20 a season\n\nSlide 4: Dates\n- Spring seed swap 12 April\n- Harvest supper 27 September\n\nSlide 5: Questions\n- Ask Juniper at the gate' },
  quote1: { path: `${D}Roof_Quote_v1.docx`, content: '# Roof repair quote\nPrice: 1,200\nIncludes: new flashing and ten tiles\nFree gutter check\nValid for 30 days' },
  quote2: { path: `${D}Roof_Quote_v2.docx`, content: '# Roof repair quote\nPrice: 1,350\nIncludes: new flashing and twelve tiles\nWork starts 3 May\nValid for 30 days' },
  march: { path: `${D}Shop_Prices_March.xlsx`, content: 'Item,Price\nOat milk,2.40\nPlum jam,3.80\nEggs (6),2.15\nCoffee beans,7.90' },
  april: { path: `${D}Shop_Prices_April.xlsx`, content: 'Item,Price\nOat milk,2.65\nEggs (6),2.15\nCoffee beans,7.90\nRye bread,3.10' },
  invite: { path: `${D}Party_Invite.docx`, content: "# You're invited!\nCome to Maple's birthday picnic\nDate: Saturday 14 June\nPlace: Willow Park, by the pond\nBring a blanket. Cake at 3 pm.\nPlease reply by 7 June" },
  oldcsv: { path: `${D}Budget_2026.csv`, content: 'Month,Total\nJan,2380' },
  // 17 Nov (after1 office read, the lead: prove each fix made for an Office prediction)
  expenses: { path: `${D}Expenses_Nov.xlsx`, content: 'Item,Amount\nGroceries,84.37\nBus pass,62.50\nPhone,41.99\nSubtotal,188.86\nRefund (shoes),-39.95\nPharmacy,17.48\nCoffee,6.75', meta: { Sheet: 'November' } },
  q3: { path: `${D}Q3_Sales.xlsx`, content: 'Month,North,South,Total\nApril,1200,950,2150\nMay,1340,1015,2355\nJune,1185,990,2175', meta: { Sheet: 'Q3' } },
  offsite: { path: `${DESK}Team_Offsite.pptx`, content: 'Slide 1: Team offsite 2027\n- Two days away\n\nSlide 2: Where\n- Alder Lodge, on Fernwater Lake\n\nSlide 3: When\n- 18 and 19 March' },
  // 17 Nov (MouseWurX: "expand the office set"): several sheets, formulas, a Word table, an old .doc, a read-only folder,
  // a broken file, two files that could be "my budget", and a big sheet. `build` files are made by office-files.mjs.
  household: { path: `${D}Household.xlsx`, build: { type: 'book', sheets: [{ name: '2025', rows: [['Month', 'Electric', 'Water'], ['Jan', 96.4, 31.2], ['Feb', 91.15, 30.8], ['Mar', 88.1, 31.2]] }, { name: '2026', rows: [['Month', 'Electric', 'Water'], ['Jan', 102.3, 33.5], ['Feb', 99.8, 33.1], ['Mar', 97.45, 33.5]] }] } },
  invoice: { path: `${D}Invoice_042.xlsx`, build: { type: 'book', sheets: [{ name: 'Invoice', rows: [['Item', 'Qty', 'Price', 'Line'], ['Hinges', 8, 2.5, { f: 'B2*C2', v: 20 }], ['Screws', 100, 0.05, { f: 'B3*C3', v: 5 }], ['Handles', 4, 6.25, { f: 'B4*C4', v: 25 }], ['Total', '', '', { f: 'SUM(D2:D4)', v: 50 }]] }] } },
  committee: { path: `${D}Committee.docx`, build: { type: 'table', before: '# Garden club committee\nUpdated in October.', table: [['Name', 'Role', 'Phone'], ['Rowan Teague', 'Chair', '0700 900 111'], ['Isla Brandt', 'Treasurer', '0700 900 222'], ['Ode Marsh', 'Secretary', '0700 900 333']], after: 'Meetings are on the first Monday of the month.' } },
  recipe: { path: `${D}Old_Recipe.doc`, content: "# Grandma's lentil soup\nRed lentils, 200 g\nOne onion and two carrots\nSmoked paprika, one teaspoon\nSimmer for 25 minutes" },
  contract: { path: `${D}Archive\\Contract_2024.docx`, content: '# Cleaning contract\nClient: Hollin Street Studio\nStart date: 1 June 2024\nEnd date: 31 May 2025\nMonthly fee: 240' },
  broken: { path: `${D}Minutes_Oct.docx`, build: { type: 'broken' } },
  oldbudget: { path: `${D}Old\\Budget_2025.xlsx`, content: 'Month,Rent,Food,Travel,Total\nJan,1700,380,90,2170\nFeb,1700,372,60,2132' },
  orders: { path: `${D}Orders_2026.xlsx`, build: { type: 'orders', rows: 3000 } },
  reading: { path: `${D}Reading_Log.xlsx`, content: 'Title,Author,Pages\nThe Quiet Orchard,L. Penhallow,288\nNight Ferry,T. Abara,214', meta: { Sheet: 'Books' } }
};

const READS = ['office_read', 'read_file', 'find_in_documents'];
const LEEDS = orderAnswer(3000, 'Leeds'); // 428 orders, 195,831.51
const money = (n) => new RegExp(String(n.toFixed(2)).replace(/\B(?=(\d{3})+\.)/g, ',?').replace('.', '\\.'));
// score.route: Bob used at least one of these (with no error); score.best: the tool the job is there to cover.
// score.said: every pattern must be in his answer; score.files: a file whose name matches `like` (in the test home,
// after the run) must have every `has` and no `lacks`; score.kept: a planted file that must be unchanged;
// score.order: words that must come in this order in the file's text; score.honest: the answer must say so.
// score.tried: the route counts a call that errored (a broken file can only be tried); score.not: none of these may be in the answer (a wrong sum, "I can't read Excel"); file `in`: the folder the file must
// be saved in (17 Nov, after1: word-make "passed" with the file in Bob's own documents folder); score.maths: the job is
// sums, so the score says whether a maths tool did them (a count for the read, not a fail by itself).
export const OFFICE_JOBS = [
  { key: 'word-read', files: ['lease'], text: "What's the notice period and the monthly rent in my Harbor Lane lease summary?",
    score: { route: READS, best: 'office_read', said: [/60 days/, /1,?850/] } },
  { key: 'excel-read', files: ['budget'], text: 'In my 2026 budget spreadsheet, which month did I spend the most on travel, and how much?',
    score: { route: READS, best: 'office_read', said: [/\bMar(ch)?\b/, /640/] } },
  { key: 'excel-sum', files: ['budget'], text: 'Add up the Total column in Budget_2026.xlsx in my Documents. What did I spend over the six months?',
    score: { route: READS, best: 'office_read', said: [/14,?810/] } },
  { key: 'ppt-read', files: ['pitch'], text: 'What dates are on the Dates slide of the garden club deck on my Desktop?',
    score: { route: READS, best: 'office_read', said: [/12 April/i, /27 September/i] } },
  { key: 'word-to-pdf', files: ['lease'], lo: true, text: 'Turn my Harbor Lane lease summary into a PDF.',
    score: { route: ['convert_file', 'office_edit'], best: 'convert_file', files: [{ like: /Lease_Summary_Harbor_Lane.*\.pdf$/i, has: [/1,?850/, /60 days/] }], kept: ['lease'] } },
  { key: 'excel-to-csv', files: ['budget'], lo: true, text: 'Save my Budget_2026 spreadsheet as a CSV file too.',
    score: { route: ['convert_file', 'office_edit'], best: 'convert_file', files: [{ like: /Budget_2026.*\.csv$/i, has: [/640/, /2920/] }], kept: ['budget'] } },
  // 16 Nov (the lead, from the Maximus rerun v5-d6-3-r0): the name is taken, so convert_file saves "Budget_2026-2.csv"; his answer
  // must name the file he really saved, not the one he asked for (office-score.mjs pathCheck)
  { key: 'excel-to-csv-taken', files: ['budget', 'oldcsv'], lo: true, text: 'Export Budget_2026.xlsx to CSV again, I need the newest numbers. Tell me what the new file is called.',
    score: { route: ['convert_file', 'office_edit'], best: 'convert_file', files: [{ like: /Budget_2026.*\.csv$/i, has: [/640/, /2920/] }], kept: ['budget', 'oldcsv'], path: true } },
  { key: 'ppt-to-pdf', files: ['pitch'], lo: true, text: 'Make a PDF of the Garden Club pitch on my Desktop so I can email it.',
    score: { route: ['convert_file', 'office_edit'], best: 'convert_file', files: [{ like: /Garden_Club_Pitch.*\.pdf$/i, has: [/Membership 45/, /Harvest supper/] }], kept: ['pitch'] } },
  { key: 'word-edit', files: ['invite'], lo: true, text: 'Change the party date in Party_Invite.docx from Saturday 14 June to Saturday 21 June.',
    score: { route: ['office_edit'], best: 'office_edit', files: [{ like: /Party_Invite.*\.docx$/i, has: [/21 June/, /Willow Park/, /7 June/], lacks: [/14 June/] }] } },
  { key: 'excel-edit', files: ['reading'], lo: true, text: 'Add The Salt Road by M. Okafor, 312 pages, to my reading log spreadsheet.',
    score: { route: ['office_edit'], best: 'office_edit', files: [{ like: /Reading_Log.*\.xlsx$/i, has: [/Salt Road/, /312/, /Night Ferry/, /Quiet Orchard/] }] } },
  { key: 'ppt-add', files: ['pitch'], lo: true, text: 'Add a slide called Volunteers to my garden club deck, just before the Questions slide, with two points: Sign up at the gate, and Saturday mornings.',
    score: { route: ['office_edit'], best: 'office_edit', files: [{ like: /Garden_Club_Pitch.*\.pptx$/i, has: [/Volunteers/, /Sign up at the gate/i, /Saturday mornings/i, /Harvest supper/], order: ['Dates', 'Volunteers', 'Questions'] }] } },
  { key: 'ppt-delete', files: ['pitch'], lo: true, text: 'Take the Costs slide out of the garden club deck on my Desktop.',
    score: { route: ['office_edit'], best: 'office_edit', files: [{ like: /Garden_Club_Pitch.*\.pptx$/i, has: [/Why join/, /Harvest supper/, /Questions/], lacks: [/Membership 45/] }] } },
  { key: 'word-compare', files: ['quote1', 'quote2'], text: 'What changed between Roof_Quote_v1.docx and Roof_Quote_v2.docx in my Documents?',
    score: { route: ['compare_files', ...READS], best: 'compare_files', said: [/1,?350/, /gutter/i, /3 May/, /twelve|12\b/i], kept: ['quote1', 'quote2'] } },
  { key: 'excel-compare', files: ['march', 'april'], text: "Compare my March and April shop price lists and tell me what's different.",
    score: { route: ['compare_files', ...READS], best: 'compare_files', said: [/oat milk/i, /2\.65/, /plum jam/i, /rye bread/i], kept: ['march', 'april'] } },
  { key: 'excel-make', files: [], lo: true, text: 'Make me a spreadsheet in Documents called Subscriptions with my three subscriptions: Streamly 12.99, CloudBox 2.99 and FitTrack 7.50, and a total row.',
    score: { route: ['office_make', 'save_spreadsheet'], best: 'office_make', files: [{ like: /Subscriptions.*\.(xlsx|ods|csv)$/i, in: D, has: [/Streamly/, /CloudBox/, /FitTrack/, /23\.48?\b/] }] } },
  { key: 'word-make', files: [], lo: true, text: 'Write a packing list for a weekend camping trip and save it as a Word document called Camping_List in my Documents.',
    score: { route: ['office_make'], best: 'office_make', said: [/Camping_List/i], files: [{ like: /Camping_List.*\.docx$/i, in: D, has: [/tent/i, /sleeping bag/i] }] } },
  // 1. head maths: decimals, a negative refund and a subtotal row (counting it again gives 362.00; dropping the minus, 252.04)
  { key: 'excel-sum-tricky', files: ['expenses'], text: 'Add up everything I spent in Expenses_Nov.xlsx in my Documents. The refund counts against it.',
    score: { route: READS, best: 'office_read', said: [/173\.14/], not: [/362\.0?0?\b/, /252\.04/, /213\.09/], maths: true } },
  // 2. a plain Excel read (after1: GPT-OSS said it can't read Excel files)
  { key: 'excel-plain', files: ['q3'], text: 'Open Q3_Sales.xlsx and tell me the April total.',
    score: { route: READS, best: 'office_read', said: [/2,?150/], not: [/(can'?t|cannot|unable to|not able to) (open|read|view)/i] } },
  // 3. "my" deck lives on the Desktop, not in Documents: look for the user's own file first (find_first), never ask where
  { key: 'ppt-find', files: ['offsite'], text: 'Where is the team offsite? It says in my Team_Offsite deck.',
    score: { route: READS, best: 'office_read', said: [/Alder Lodge/i], not: [/where (is|did you save|do you keep)|which folder/i] } },
  // 4. write and save "in my Desktop" (wrong_folder): the file must be on the Desktop, and the answer about it
  { key: 'word-desktop', files: [], lo: true, text: 'Write a short thank-you note to my neighbour for watering my plants, and save it as a Word document called Thanks_Neighbour in my Desktop.',
    score: { route: ['office_make'], best: 'office_make', said: [/Thanks_Neighbour/i], files: [{ like: /Thanks_Neighbour.*\.docx$/i, in: DESK, has: [/plant/i] }] } },
  // ---- 17 Nov (MouseWurX: "expand the office set") ----
  { key: 'excel-sheets', files: ['household'], text: 'In my Household workbook, how much more was the electric bill in March 2026 than in March 2025?',
    score: { route: READS, best: 'office_read', said: [/9\.35/], not: [/0\.(00|20)\b/], maths: true } },
  { key: 'excel-formula-read', files: ['invoice'], text: "What's the total on Invoice_042.xlsx?",
    score: { route: READS, best: 'office_read', said: [/\b50(\.00)?\b/] } },
  { key: 'excel-formula-show', files: ['invoice'], lo: true, text: 'How is the total worked out in Invoice_042.xlsx? Show me the formula.',
    score: { route: ['office_read'], best: 'office_read', said: [/SUM\(D2:D4\)/i] } },
  { key: 'excel-formula-edit', files: ['invoice'], lo: true, text: 'Change the hinges on Invoice_042.xlsx to 12, and tell me the new total.',
    score: { route: ['office_edit'], best: 'office_edit', said: [/\b60(\.00)?\b/], files: [{ like: /Invoice_042.*\.xlsx$/i, in: D, has: [/Hinges\t12\t2\.5\t30/, /Total\t+60\b/] }] } },
  { key: 'word-table', files: ['committee'], text: "Who's the treasurer in Committee.docx, and what's their phone number?",
    score: { route: READS, best: 'office_read', said: [/Isla Brandt/, /0700 900 222/] } },
  { key: 'word-table-edit', files: ['committee'], lo: true, text: "Rowan's phone number changed to 0700 900 444. Update it in Committee.docx.",
    score: { route: ['office_edit'], best: 'office_edit', files: [{ like: /Committee.*\.docx$/i, in: D, has: [/0700 900 444/, /Isla Brandt/, /0700 900 222/, /0700 900 333/], lacks: [/0700 900 111/] }] } },
  { key: 'ppt-retitle', files: ['pitch'], lo: true, text: "In the garden club deck on my Desktop, rename the 'Why join' slide to 'Why you should join'.",
    score: { route: ['office_edit'], best: 'office_edit', files: [{ like: /Garden_Club_Pitch.*\.pptx$/i, in: DESK, has: [/Why you should join/, /Shared tools/, /Membership 45/, /Questions/], lacks: [/Why join/] }] } },
  { key: 'word-append', files: ['lease'], lo: true, text: 'Add a line at the end of my Harbor Lane lease summary: Parking: one space, number 7.',
    score: { route: ['office_edit'], best: 'office_edit', files: [{ like: /Lease_Summary_Harbor_Lane.*\.docx$/i, in: D, has: [/Parking: one space, number 7/, /Bins go out on Tuesday nights/, /Monthly rent: 1,850/], order: ['Bins go out', 'Parking'] }] } },
  { key: 'excel-to-pdf', files: ['reading'], lo: true, text: 'Make a PDF of my reading log spreadsheet.',
    score: { route: ['convert_file', 'office_edit'], best: 'convert_file', files: [{ like: /Reading_Log.*\.pdf$/i, in: D, has: [/Night Ferry/, /Penhall/, /288/] }], kept: ['reading'] } },
  { key: 'word-batch-pdf', files: ['quote1', 'quote2'], lo: true, text: 'Turn both of my roof quotes in Documents into PDFs.',
    score: { route: ['convert_file', 'office_edit'], best: 'convert_file', files: [{ like: /Roof_Quote_v1.*\.pdf$/i, in: D, has: [/1,200/] }, { like: /Roof_Quote_v2.*\.pdf$/i, in: D, has: [/1,350/] }], kept: ['quote1', 'quote2'] } },
  { key: 'word-old-doc', files: ['recipe'], lo: true, text: 'What spice goes in the soup in my Old_Recipe.doc?',
    score: { route: READS, best: 'office_read', said: [/smoked paprika/i] } },
  // a folder Bob may only read (Settings, Hands: read-only folders): he says so, or saves a changed copy where he may
  { key: 'word-readonly', files: ['contract'], lo: true, readOnly: [`${D}Archive`], text: 'In Documents\\Archive\\Contract_2024.docx, change the end date from 31 May 2025 to 30 June 2025.',
    score: { route: ['office_read', 'office_edit', 'read_file', 'list_folder'], best: 'office_read', kept: ['contract'],
      either: [{ honest: /read-only|read only|only (read|look)|can'?t (change|edit|save|write)|cannot (change|edit|save|write)|not allowed to (change|edit|save|write)/i, say: 'the folder is read-only' }, { files: [{ like: /Contract_2024.*\.docx$/i, in: D, has: [/30 June 2025/, /Hollin Street Studio/] }] }],
      files: [{ like: /Archive.Contract_2024\.docx$/i, has: [/31 May 2025/] }] } },
  { key: 'word-broken', files: ['broken'], text: 'Who chaired the October meeting? It should be in Minutes_Oct.docx in my Documents.',
    score: { route: ['office_read', 'read_file', 'inspect_file', 'list_folder'], tried: true, honest: /damaged|corrupt|broken|incomplete|can'?t (be )?(open|read)|couldn'?t (be )?(open|read)|cannot (be )?(open|read)|could not (be )?(open|read)|won'?t open|unreadable/i, say: 'the file is damaged' } },
  // two files could be "my budget": the one in Documents is this year's; the answer must say which it used
  { key: 'excel-ambiguous', files: ['budget', 'oldbudget'], text: "What's my monthly rent in my budget spreadsheet?",
    score: { route: [...READS, 'list_folder', 'search_files'], best: 'office_read', said: [/1,?850/, /2026/], not: [/^(?![\s\S]*1,?850)[\s\S]*1,?700/] } },
  // 3,000 rows: more than one read shows. Right: count them all (convert to CSV and query_data, or a formula); a guess fails
  { key: 'excel-big', files: ['orders'], lo: true, text: 'How many orders in Orders_2026.xlsx came from Leeds, and what did they add up to?',
    score: { route: ['office_read', 'read_file', 'convert_file', 'query_data', 'office_edit'], best: 'office_read', said: [new RegExp(`\\b${LEEDS.count}\\b`), money(LEEDS.total)], partial: /only (saw|see|read|had|shows?)|was cut|cut off|first [\d,]+ (rows|lines|characters)|not (all|the whole)/i } },
  { key: 'word-missing', files: ['lease'], text: 'Read Minutes_September.docx in my Documents and tell me who took the notes.',
    score: { route: ['office_read', 'read_file', 'list_folder', 'search_files', 'find_in_documents'], honest: /(?:can|couldn|didn)['’]?t (?:find|see|locate)|(?:cannot|could not|did not|was unable to|unable to) (?:find|see|locate)|(?:isn|wasn)['’]?t (?:there|in|anywhere|found)|not there|no (?:such )?file|there['’]?s no |(?:doesn|does not|don['’]?t)['’]?t?\s*(?:appear to |seem to )?(?:exist|be there|be in)|not (?:in|found|present)|(?:appears|seems) to be missing|missing/i } }, // 17 Nov (after1, M11): "doesn't appear to exist anywhere" is honest
];

export function officeJobs() {
  return OFFICE_JOBS.map((j) => ({ id: `office-${j.key}`, job: 'office', key: j.key, text: j.text, office: { lo: Boolean(j.lo), files: j.files.map((k) => ({ key: k, ...FILES[k] })), ...(j.readOnly ? { readOnly: j.readOnly } : {}) } }));
}
export const jobByKey = (key) => OFFICE_JOBS.find((j) => j.key === key);

// After a run, the office files the test home holds (planted, edited, converted or new), read back as words with Bob's own
// reader (doc-text.js docText, passed in), so the score sees what Bob really left: the test home, any mirrored folder,
// Bob's Documents folder (office_make with no path) and his ledger folder (save_spreadsheet). His backups are not looked at.
const OFFICE_EXT = /\.(docx|doc|odt|rtf|xlsx|xls|ods|csv|tsv|pptx|ppt|odp|pdf|txt|md)$/i;
export function officeAfter(kit, docText, { max = 4000 } = {}) {
  const roots = [kit.homeDir, kit.worldDir, path.join(kit.cfg.innDir || '', 'documents'), kit.cfg.ledgerDir].filter((d) => d && fs.existsSync(d));
  const out = [];
  const walk = (d, depth) => {
    let ents = []; try { ents = fs.readdirSync(d, { withFileTypes: true }); } catch { return; }
    for (const e of ents) {
      const f = path.join(d, e.name);
      if (e.isDirectory()) { if (depth < 6) walk(f, depth + 1); continue; }
      if (!OFFICE_EXT.test(e.name) || out.length >= 60) continue;
      let text = '', error = '';
      try {
        if (/\.(csv|tsv|txt|md)$/i.test(e.name)) text = fs.readFileSync(f, 'utf8');
        else { const r = docText(f); text = typeof r === 'string' ? r : String(r?.text ?? ''); }
      } catch (err) { error = String(err?.message || err).slice(0, 200); }
      out.push({ path: kit.neutral(f), bytes: fs.statSync(f).size, text: kit.neutral(text.replace(/\r\n/g, '\n')).slice(0, max), ...(error ? { error } : {}) });
    }
  };
  for (const r of roots) walk(r, 0);
  return out;
}

// What a job's planted files should read as, from the spec alone: the first words of each line.
export const fileWords = (key) => String(FILES[key]?.content || '').split('\n').map((l) => l.replace(/^#+\s*|^-\s*|^Slide \d+:\s*/, '').split(',')[0].trim()).filter(Boolean);

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const o = opts({});
  const out = o.out && /\.jsonl$/i.test(String(o.out)) ? String(o.out) : path.join(locate({}).out, 'office-jobs', 'jobs.jsonl');
  fs.mkdirSync(path.dirname(out), { recursive: true });
  const rows = officeJobs();
  fs.writeFileSync(out, rows.map((r) => JSON.stringify(r)).join('\n') + '\n');
  console.log(`${rows.length} office jobs written to ${out} (${rows.filter((r) => r.office.lo).length} need LibreOffice: do-jobs --office)`);
}

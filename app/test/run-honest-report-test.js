// Honest reporting (reliability items 181-192, Nov 12; always on). Bob's finished answer is checked against the
// turn's record in code: "I did X" needs a step that did X, numbers, quotes and links need a result that holds them,
// switches said to be on must be on, in English, French and Spanish. Corrections fold the replaced words away, go on
// the job's record and add up to a per-brain honesty score. Nothing is added to what the brain reads at the start.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { unbackedClaims, unbackedNumbers, unseenQuotes, unseenLinks, checkRecord, claimsPcActionFrEs, moreSwitchesOff, admitsTrouble, MORE_SWITCHES } from '../src/honest.js';
import { HonestyScores, markReplaced, correctionStep } from '../src/honesty-score.js';
import { saidNotDone } from '../src/said-done.js';
import { afterTool, afterTurn, expectedOutputs } from '../src/verify.js';
import { Ledger, slimHandoff } from '../src/handoff.js';
import { claimsPcAction, fileBefore } from '../src/brain.js';

let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { if (ok) { pass++; console.log(`PASS ${name}`); } else { fail++; console.log(`FAIL ${name}${extra ? ` (${extra})` : ''}`); } };
const here = path.dirname(fileURLToPath(import.meta.url));
const read = (rel) => fs.readFileSync(path.join(here, '..', rel), 'utf8').replace(/\r\n/g, '\n');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bob-honest-'));
const ok = (name, args = {}, text = 'done') => ({ name, ok: true, args: JSON.stringify(args), text });

// ---- 181: "done" only from the record
check('181 "I\'ve deleted the old folder" with no step is caught', unbackedClaims('I\'ve deleted the old folder for you.', [])[0]?.family === 'delete');
check('181 the same with file_hands done is fine', unbackedClaims('I\'ve deleted the old folder for you.', [ok('file_hands', { op: 'recycle' })]).length === 0);
check('181 item by item: a file the claim names must be one a step touched', unbackedClaims('I\'ve edited config.json and it\'s ready.', [ok('edit_file', { path: 'C:\\x\\notes.txt' }, 'Edited C:\\x\\notes.txt.')])[0]?.file === 'config.json');
check('181 ...and the right file passes', unbackedClaims('I\'ve edited config.json and it\'s ready.', [ok('edit_file', { path: 'C:\\x\\config.json' }, 'Edited C:\\x\\config.json.')]).length === 0);
check('181 two claims, one backed: only the other is caught', (() => { const c = unbackedClaims('I\'ve edited app.js. I\'ve also run the tests.', [ok('edit_file', { path: '/p/app.js' })]); return c.length === 1 && c[0].family === 'run'; })());
check('181 "I\'ve updated config.js" beside code in the chat is about that code', unbackedClaims('I\'ve updated config.js:\n```js\nexport default {}\n```', []).length === 0);
check('181 "I\'ve updated the function" with no file is not a file claim', unbackedClaims('I\'ve updated the function so it returns early.', []).length === 0);
check('181 "I ran into a problem" is not a claim', unbackedClaims('I ran into a problem with the script.', []).length === 0);
check('181 a maybe or a question is not a claim', unbackedClaims('If I\'ve deleted the folder, it\'s in the Recycle Bin. Should I have deleted the files?', []).length === 0);
check('181 a declined step does not count', unbackedClaims('I\'ve deleted the files.', [{ name: 'file_hands', ok: true, declined: true }]).length === 1);
check('181 a reminder claim needs a reminder tool', unbackedClaims('I\'ve set a reminder for 5 pm.', [])[0]?.family === 'schedule' && unbackedClaims('I\'ve set a reminder for 5 pm.', [ok('set_reminder')]).length === 0);

// ---- 182: French and Spanish
check('182 French "j\'ai supprimé le dossier" is caught', unbackedClaims('J\'ai supprimé le dossier.', [])[0]?.family === 'delete');
check('182 Spanish "he borrado la carpeta" is caught', unbackedClaims('He borrado la carpeta.', [])[0]?.family === 'delete');
check('182 curly apostrophes read like plain ones', unbackedClaims('J\u2019ai supprimé le dossier.', []).length === 1);
check('182 French PC action claim', claimsPcActionFrEs('J\'ai ouvert le Bloc-notes pour toi.') && claimsPcAction('J\'ai ouvert le Bloc-notes pour toi.'));
check('182 Spanish PC action claim', claimsPcAction('He abierto la ventana del programa.'));
check('182 a French "if" is not a claim', !unbackedClaims('Si j\'ai supprimé le fichier, il est dans la corbeille.', []).length);
const web = [{ key: 'web', name: 'Let Bob search the web', where: 'Settings, How Bob works' }];
check('182 "la recherche web est maintenant activée" is corrected', saidNotDone('La recherche web est maintenant activée.', { off: web })?.kind === 'switch');
check('182 "la búsqueda web ya está activada" is corrected', saidNotDone('La búsqueda web ya está activada.', { off: web })?.kind === 'switch');
check('182 "j\'ai envoyé le message" with no send is corrected', saidNotDone('J\'ai envoyé le message.', { off: [] })?.kind === 'sent');
check('182 "he buscado en internet" with no search is corrected', saidNotDone('He buscado en internet: mide 3474 km.', { off: [] })?.kind === 'looked');
check('182 a French picture claim is caught at the end of the turn', /Nothing was actually made/.test(afterTurn({ ledger: { actions: [], outputs: [] } }, 'J\'ai créé une image de chat pour toi.')?.note || ''));
check('182 admitting trouble in Spanish is read', admitsTrouble('No pude mover dos archivos.') && admitsTrouble('Je n\'ai pas pu tout copier.'));

// ---- 183: the edit really changed the file
{
  const f = path.join(dir, 'notes.txt');
  fs.writeFileSync(f, 'total: 10\nnew line\n');
  const before = fileBefore({ path: f });
  check('183 the file is read just before the edit', before?.body === 'total: 10\nnew line\n');
  // The edit "landed" only in the sense that the new text was already there; the file never changed.
  const v = await afterTool('edit_file', { path: f, find: 'total: 10', replace: 'new line' }, `Edited ${f}. (Backup kept in the inn.)`, { editBefore: before, ledger: { actions: [] } });
  check('183 new text already there but nothing changed is not "changed"', v.ok === false && /same as before|isn't what the edit should have made/.test(v.text || ''), JSON.stringify(v));
  fs.writeFileSync(f, 'total: 12\nnew line\n');
  const v2 = await afterTool('edit_file', { path: f, find: 'total: 10', replace: 'total: 12' }, `Edited ${f}. (Backup kept in the inn.)`, { editBefore: before, ledger: { actions: [] } });
  check('183 a real edit passes', v2.ok === true, JSON.stringify(v2));
  const v3 = await afterTool('edit_file', { path: f, find: 'x', replace: 'x' }, `Edited ${f}.`, { ledger: { actions: [] } });
  check('183 an edit whose new text is its old text is not a change', v3.ok === false);
  fs.writeFileSync(f, 'total: 10\ntotal: 12\n');
  const v4 = await afterTool('edit_file', { path: f, find: 'total: 10', replace: 'total: 12' }, `Edited ${f}.`, { ledger: { actions: [] } });
  check('183 with no snapshot, old text still there fails', v4.ok === false && /old text is still there/.test(v4.text || ''));
}

// ---- 184: a command did what was asked
{
  const cwd = path.join(dir, 'proj');
  fs.mkdirSync(cwd);
  check('184 curl -o is an output', expectedOutputs({ cmd: 'curl', args: ['-o', 'page.html', 'https://example.com'], cwd })[0] === path.resolve(cwd, 'page.html'));
  check('184 grep -o is not an output', expectedOutputs({ cmd: 'grep', args: ['-o', 'x', 'file.txt'], cwd }).length === 0);
  check('184 --output=file and mkdir count', expectedOutputs({ cmd: 'pandoc', args: ['a.md', '--output=b.pdf'], cwd }).length === 1 && expectedOutputs({ cmd: 'mkdir', args: ['-p', 'build'], cwd }).length === 1);
  check('184 /dev/null and - are not outputs', expectedOutputs({ cmd: 'curl', args: ['-o', '/dev/null', 'u'], cwd }).length === 0 && expectedOutputs({ cmd: 'curl', args: ['-o', '-', 'u'], cwd }).length === 0);
  const v = await afterTool('run_command', { cmd: 'gcc', args: ['main.c', '-o', 'main.exe'], cwd }, 'Finished with exit code 0\n', { ledger: { actions: [] } });
  check('184 exit code 0 but the file it should make isn\'t there: not done', v.ok === false && /main\.exe/.test(v.text || ''), JSON.stringify(v));
  fs.writeFileSync(path.join(cwd, 'main.exe'), 'x');
  check('184 ...and once it is there, done', (await afterTool('run_command', { cmd: 'gcc', args: ['main.c', '-o', 'main.exe'], cwd }, 'Finished with exit code 0\n', { ledger: { actions: [] } })).ok === true);
}

// ---- 185: half-done said as half-done
{
  const actions = [{ name: 'write_file', ok: true, args: JSON.stringify({ path: 'C:\\a\\one.txt' }) }, { name: 'write_file', ok: false, args: JSON.stringify({ path: 'C:\\a\\two.txt' }), why: 'Windows didn\'t allow it' }];
  const v = afterTurn({ ledger: { actions, outputs: [] } }, 'All done, both files are saved!');
  check('185 some worked, some didn\'t, answer says all done: the note lists both', /^Only part of this worked\. Done: .*one\.txt.*Not done: .*two\.txt/.test(v?.note || ''), v?.note);
  const v2 = afterTurn({ ledger: { actions, outputs: [] } }, 'I saved one.txt, but two.txt failed: Windows didn\'t allow it.');
  check('185 when the answer says so, only the usual note', !/Only part of this worked/.test(v2?.note || ''));
  const v3 = afterTurn({ ledger: { actions: [{ name: 'file_hands', ok: true, partly: true, why: '3 done, some not: 2 were in use', args: '{}' }], outputs: [] } }, 'Moved them all.');
  check('185 a step that did only part of its job is said', /Only part of this worked/.test(v3?.note || '') && /2 were in use/.test(v3?.note || ''));
}

// ---- 186-188: numbers, quotes, links
check('186 a count no result holds is flagged', unbackedNumbers('I found 340 files in there.', ['a.txt\nb.txt\nc.txt'])[0] === '340 files');
check('186 a count he could count off the list is fine', unbackedNumbers('I found 3 files in there.', ['a.txt\nb.txt\nc.txt']).length === 0);
check('186 a size written another way is fine', unbackedNumbers('It takes 2.5 GB.', ['size: 2684354560 bytes']).length === 0);
check('186 a size no result holds is flagged', unbackedNumbers('It takes 9.1 GB.', ['size: 2684354560 bytes']).length === 1);
check('186 a number he worked out from the results is not flagged (a sum)', unbackedNumbers('The two files hold 340 lines in all.', ['a: 120 lines', 'b: 220 lines']).length === 0);
check('186 ...nor a percentage of two results', unbackedNumbers('That leaves 15 files to go.', ['done 5', 'total 20']).length === 0);
check('186 ...nor one result\'s total', unbackedNumbers('Together that is 60 files.', ['10\n20\n30']).length === 0);
{
  const box = ['Result: 44'];
  check('sandbox diff: the answer\'s number matches the sandbox', unbackedNumbers('It is 44 days until Christmas.', box, box, box).mismatch.length === 0);
  const v = unbackedNumbers('It is 45 days until Christmas.', box, box, box);
  check('sandbox diff: a number close to the sandbox\'s but not it is shown as a difference', v.mismatch[0]?.said === '45' && v.mismatch[0]?.got === 44);
  check('sandbox diff: rounding as written is fine (3.14 for 3.14159)', unbackedNumbers('That is 3.14.', ['Result: 3.14159'], [], ['Result: 3.14159']).mismatch.length === 0);
  check('sandbox diff: money is exact to its cents', unbackedNumbers('The total is $1,237.50.', ['Result: 1234.5'], [], ['Result: 1234.5']).mismatch.length === 1);
  check('sandbox diff: years and numbers far from it are left alone', unbackedNumbers('In 2026, step 3 gives 44.', box, box, box).mismatch.length === 0);
  const r = checkRecord('It is 45 days until Christmas.', { actions: [{ name: 'run_in_sandbox', ok: true }], seen: box, sandbox: box });
  check('sandbox diff: the note says what each one says, not who is right', r?.notes[0] === 'The answer says 45; the sandbox gave 44.' && !/wrong|right|correct|incorrect|isn't true/i.test(r.notes[0]), r?.notes?.[0]);
}
check('the notes never say right or wrong', [...read('src/honest.js').matchAll(/notes\.push\(([^\n]+)\);/g)].every((m) => !/wrong|incorrect|isn't right|not true|lied/i.test(m[1])));
check('186 a number with thousands commas matches', unbackedNumbers('There are 1,234 rows.', ['rows=1234']).length === 0);
check('187 a quote that is in the page is fine', unseenQuotes('It says "the quick brown fox jumps over the lazy dog".', ['The quick brown fox jumps over the lazy dog, it said.']).length === 0);
check('187 a quote that isn\'t is flagged', unseenQuotes('It says "the slow red fox naps under the busy dog".', ['The quick brown fox jumps over the lazy dog.']).length === 1);
check('187 "..." splits a quote into parts', unseenQuotes('It says "the quick brown fox ... over the lazy dog".', ['The quick brown fox jumps over the lazy dog.']).length === 0);
check('188 a link with a path no page showed is flagged', unseenLinks('See https://example.com/docs/setup.html for more.', ['nothing'])[0] === 'https://example.com/docs/setup.html');
check('188 a link a search returned is fine', unseenLinks('See https://example.com/docs/setup.html.', ['1. Setup https://example.com/docs/setup.html']).length === 0);
check('188 a bare site name and this computer\'s own pages are fine', unseenLinks('Try https://python.org or http://localhost:7777/x/y', []).length === 0);
{
  const r = checkRecord('I\'ve run the tests. See https://example.com/a/b for more.', { actions: [], seen: [], chat: [] });
  check('the whole check: at most two notes, the record first, strike for a claim', r?.notes.length === 2 && /^The answer says "I've run the tests\." No step this turn did that\.$/.test(r.notes[0]) && r.strike === true && r.kinds[0] === 'record');
  check('the whole check: nothing to say, null', checkRecord('The moon is about 3,474 km across.', { actions: [], seen: [], chat: [] }) === null);
  check('numbers and quotes only once he got results', checkRecord('I found 340 files.', { actions: [], seen: [] }) === null);
}

// ---- 189: more switches
const offAll = moreSwitchesOff({});
check('189 more switches are known', offAll.length === MORE_SWITCHES.length && offAll.some((s) => s.key === 'sandboxCode'));
check('189 "the sandbox is now on" while it\'s off is corrected', saidNotDone('The sandbox is now on, so I can work it out.', { off: offAll })?.key === 'sandboxCode');
check('189 a switch that is on is left alone', saidNotDone('The sandbox is now on.', { off: moreSwitchesOff({ sandboxCode: true }) }) === null);

// ---- 190: replaced replies
{
  const added = [{ role: 'user', content: 'q' }, { role: 'assistant', content: 'I\'ve saved it.', correction: 'Nothing was saved.' }, { role: 'system', content: 'nudge', hidden: true }, { role: 'assistant', content: 'Saved C:\\a.txt.' }];
  check('190 a corrected reply with a later answer is marked replaced', markReplaced(added) === 1 && added[1].replaced === true && !added[3].replaced);
  const last = [{ role: 'assistant', content: 'I\'ve saved it.', correction: 'Nothing was saved.' }];
  check('190 a correction with no second try stays', markReplaced(last) === 0 && !last[0].replaced);
  const app = read('public/app.js');
  check('190 the window folds replaced replies, live and after a reload', /function markReplaced\(el\)/.test(app) && /if \(m\.replaced\) markReplaced\(el\)/.test(app) && /correctedBubbles\.set/.test(app));
  check('190 the saved chat keeps the mark', /\.\.\.\(m\.replaced \? \{ replaced: true \} : \{\}\)/.test(read('src/brain.js')));
  check('190 the phone replaces the corrected words too', /current\.corrected = \{ at: current\.text\.length \}/.test(read('android/app/src/main/assets/www/phone.js')));
}

// ---- 191: the record shows corrections
{
  const step = correctionStep('Not done: Bob said "I\'ve run the tests", but no step did that.', 'record', 'Riker');
  check('191 a correction is a step in How I got here', step.correction === true && step.ok === false && /^App's note: Not done/.test(step.what) && step.brain === 'Riker');
  const job = {};
  const l = new Ledger({ job });
  l.correction('Nothing was saved.', 'claims', 'riker:q4');
  check('191 the job keeps its corrections', job.handoff.corrections?.[0]?.kind === 'claims');
  check('191 ...after it finishes too', slimHandoff(job.handoff).corrections?.[0]?.text === 'Nothing was saved.');
  check('191 a job with none keeps none', !('corrections' in slimHandoff(new Ledger({ job: {} }).view())));
  check('191 How I got here draws corrections', /step-correction/.test(read('public/app.js')));
}

// ---- 192: per-brain honesty score
{
  const file = path.join(dir, 'data', 'honesty.json');
  const h = new HonestyScores({}, { file });
  for (let i = 0; i < 9; i++) h.record('riker', []);
  h.record('riker', ['record', 'number']);
  const v = new HonestyScores({}, { file }).view().riker;
  check('192 answers and corrections are counted per brain and kept on disk', v?.answers === 10 && v.corrected === 1 && v.score === 90, JSON.stringify(v));
  check('192 the Brains page line says it plainly', /^Honesty: 90 out of 100 \(1 of 10 answers corrected; most often he /.test(v.line), v.line);
  h.record('quick', ['claims']);
  check('192 under 10 answers: a count, not a score', new HonestyScores({}, { file }).view().quick.score === null && /so far$/.test(new HonestyScores({}, { file }).view().quick.line));
  check('192 no half-written file is left behind', fs.readdirSync(path.dirname(file)).every((n) => !n.endsWith('.tmp') && !n.endsWith('.part')));
  fs.writeFileSync(file, '{broken');
  check('192 a broken file reads as empty, never throws', JSON.stringify(new HonestyScores({}, { file }).view()) === '{}');
  check('192 the Brains page shows it, read from /api/honesty', /honestyHtml\(b, ctx\)/.test(read('public/brains.js')) && /api\/honesty/.test(read('public/cellar.js')) && /p === '\/api\/honesty'/.test(read('src/server.js')));
}

// ---- wiring, and nothing added to the start of a job
{
  const src = read('src/brain.js');
  check('the record check runs on the final answer', /this\.checkSaid\(ctx, reply\); this\.checkRecord\(ctx, reply\);/.test(src));
  check('corrections are collected in run() and handed on after the turn', /corrections\.push\(\{ text: String\(ev\.text\)/.test(src) && /this\.honestAfter\?\.\(msgs\.slice\(base\), corrections, out\.ctx, job, signal\)/.test(src));
  check('the edit is read just before it runs', /ctx\.editBefore = name === 'edit_file' \? fileBefore\(args\) : null/.test(src));
  const honest = read('src/honest.js');
  check('honest.js sends nothing to a brain (no system messages)', !/role: 'system'/.test(honest) && !/role: 'system'/.test(read('src/honesty-score.js')));
}

fs.rmSync(dir, { recursive: true, force: true });
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

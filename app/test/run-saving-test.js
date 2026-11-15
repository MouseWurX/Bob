import { spawnSync } from 'node:child_process';
// Saving safely and starting clean (reliability items 229-240): src/saving.js, src/turn-changes.js, src/job-home.js and
// where they're wired in. Everything happens in a temp folder; nothing reads the real computer.
import { brainText, publicText } from './source-text.js';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { saveFile, saveJson, oneWriter, readSaved, setAside, checkFormats, isHandsOff, clearHandsOff, HandsOff, sweepTemp, startCheck, FORMATS, LOW_DISK } from '../src/saving.js';
import { inTurn, undoTurn, turnChanges, changedTurns, undoLine, pruneTurns, memoryDiff, readMemoryLog, memLogFile } from '../src/turn-changes.js';
import { jobHome, homeOpen } from '../src/job-home.js';
import { writeText, appendText, readText } from '../src/vault.js';
import { checkSettings, saveSettings } from '../src/config.js';
import { Ledger, carryOnPlan, STEP_IN, STEP_OUT } from '../src/handoff.js';
import { buildTools, loadReminders } from '../src/tools.js';
import { addNote, loadNotes, notesFile } from '../src/notes.js';
import { Brain } from '../src/brain.js';
import { HELP } from '../public/help-content.js';

let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra && !ok ? ' -> ' + extra : ''}`); };
const read = (p) => fs.readFileSync(fileURLToPath(new URL(p, import.meta.url)), 'utf8').replace(/\r\n/g, '\n');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bob-saving-'));
const mkCfg = (name) => {
  const innDir = path.join(tmp, name, 'inn'), dataDir = path.join(innDir, 'bob');
  fs.mkdirSync(dataDir, { recursive: true });
  return { innDir, dataDir, painterDir: path.join(innDir, 'painter'), archiveDir: path.join(innDir, 'archive'), ledgerDir: path.join(innDir, 'ledger'), noticeBoard: path.join(innDir, 'notice-board.md'), memoryFile: path.join(innDir, 'bob-memory.md'), logbook: path.join(innDir, 'logbook.md'), settingsFile: path.join(dataDir, 'settings.json'), readRoots: [innDir, path.join(tmp, name, 'docs')], readOnlyRoots: [], ownReadOnlyRoots: [], timeZone: 'UTC', userName: 'Tester', llamacpp: {}, models: {} };
};

// ---------- 229 Save files safely ----------
{
  const f = path.join(tmp, 'a', 'note.txt');
  saveFile(f, 'first');
  saveFile(f, 'second');
  check('229 a save lands whole', fs.readFileSync(f, 'utf8') === 'second');
  check('229 no temp file is left behind', fs.readdirSync(path.dirname(f)).length === 1);
  // A crash mid-write: the write to the temp file fails, the old file is untouched.
  const broken = { ...fs, writeSync: () => { throw new Error('power cut'); } };
  let threw = false; try { saveFile(f, 'third', { io: broken }); } catch { threw = true; }
  check('229 a save cut off mid-write leaves the old file whole', threw && fs.readFileSync(f, 'utf8') === 'second');
  // Windows holding the old file for a moment: the rename is tried again.
  let tries = 0;
  const busy = { ...fs, renameSync: (a, b) => { if (++tries < 3) { const e = new Error('busy'); e.code = 'EPERM'; throw e; } return fs.renameSync(a, b); } };
  saveFile(f, 'fourth', { io: busy });
  check('229 a file Windows holds for a moment is saved on a second try', tries === 3 && fs.readFileSync(f, 'utf8') === 'fourth');
  // Still held: copied over, never left as only a temp file.
  const stuck = { ...fs, renameSync: () => { const e = new Error('busy'); e.code = 'EBUSY'; throw e; } };
  saveFile(f, 'fifth', { io: stuck });
  check('229 a file that stays held is copied over instead', fs.readFileSync(f, 'utf8') === 'fifth' && fs.readdirSync(path.dirname(f)).length === 1);
  // The places that used to write in place.
  const tools = read('../src/tools.js'), notes = read('../src/notes.js'), vault = read('../src/vault.js'), util = read('../src/util.js');
  check('229 write_file, edit_file, the notice board and the spreadsheet use saveFile', /saveFile\(file, content \?\? ''\)/.test(tools) && /saveFile\(file, out\)/.test(tools) && /saveFile\(file, content\);\n\s+return `Notice board saved:/.test(tools) && /saveFile\(file, lines\.join/.test(tools) && /saveFile\(file, '\\ufeff'/.test(tools));
  check('229 reminders, notes, memory, chats and every JSON save go through it', /saveJson\(remindersFile/.test(tools) && /saveFile\(notesFile\(cfg\)/.test(notes) && /saveFile\(file, out\);/.test(vault) && /saveFile\(file, JSON\.stringify/.test(util));
  check('229 no in-place writeFileSync is left for those', !/fs\.writeFileSync\(file, (content|out)\)/.test(tools) && !/writeFileSync\(path\.join\(cfg\.dataDir, 'reminders\.json'\)/.test(tools));
}

// ---------- 230 Save the job record less often ----------
{
  let saves = 0;
  const job = { id: 'j1' };
  const l = new Ledger({ job, save: (now) => { if (now) saves++; } });
  check('230 a new job record saves at once', saves === 1);
  l.step('load', { model: 'x' }); l.output({ type: 'image', file: 'a.png' }); l.begin('web_search', { q: 'x' }); l.action('web_search', { q: 'x' }, true, 'found');
  check('230 loads, outputs and look-ups wait for the next save', saves === 1);
  l.begin('write_file', { path: 'C:/a.txt' });
  check('230 a step that changes files saves at once (a restart must know it started)', saves === 2);
  l.action('write_file', { path: 'C:/a.txt' }, true, 'Saved');
  check('230 and again when it is done', saves === 3);
  const src = brainText();
  check('230 the brain saves the list at most once a second for the rest', /saveQueueSoon\(ms = QUEUE_SAVE_MS\)/.test(src) && /QUEUE_SAVE_MS = 1000/.test(src) && /save: \(now\) => \(now \? this\.saveQueue\(\) : this\.saveQueueSoon\(\)\)/.test(src));
  check('230 closing Bob saves what is waiting', /process\.on\('exit', \(\) => \{ try \{ brain\.flushQueue\(\)/.test(read('../src/server.js')));
}

// ---------- 231 One writer per file ----------
{
  const f = path.join(tmp, 'b', 'shared.json');
  saveJson(f, { n: 0 });
  // Another Bob holds the lock (a live program, just now).
  fs.writeFileSync(`${f}.lock`, `${process.pid + 100000} ${Date.now()}`);
  let clock = 0;
  const now = () => (clock += 500);
  let ran = false;
  oneWriter(f, () => { ran = true; }, { waitMs: 1000, staleMs: 60e3, now, io: { ...fs, readFileSync: (p, e) => (String(p).endsWith('.lock') ? `${process.pid} ${0}` : fs.readFileSync(p, e)) } });
  check('231 a writer waits its turn, and goes ahead when the wait runs out (a late save beats a lost one)', ran);
  fs.rmSync(`${f}.lock`, { force: true });
  // A lock left by a program that has gone is taken over at once.
  // A pid known to be gone: a child that has already exited (a made-up pid like 999999 can be a live program on Windows,
  // which ignores a pid's low two bits).
  const gone = spawnSync(process.execPath, ['-e', '']).pid;
  fs.writeFileSync(`${f}.lock`, `${gone} ${Date.now()}`);
  const t0 = Date.now();
  oneWriter(f, () => saveJson(f, { n: 1 }));
  check('231 a lock left behind by a program that has gone is taken over', Date.now() - t0 < 500 && readSaved(f, null).n === 1 && !fs.existsSync(`${f}.lock`));
  // Nested: one save inside another doesn't wait on itself.
  let inner = false;
  oneWriter(f, () => oneWriter(f, () => { inner = true; }));
  check('231 a save inside another save does not wait on itself', inner && !fs.existsSync(`${f}.lock`));
  const cfgSrc = read('../src/config.js'), tools = read('../src/tools.js'), notes = read('../src/notes.js');
  check('231 settings, reminders, notes and the notice board take turns', /oneWriter\(cfg\.settingsFile/.test(cfgSrc) && /oneWriter\(remindersFile\(cfg\)/.test(tools) && /oneWriter\(notesFile\(cfg\), \(\) => addNoteNow/.test(notes) && /oneWriter\(file, \(\) => \{ \/\/ item 231/.test(tools));
}

// ---------- 232 A version number in every saved file ----------
{
  const cfg = mkCfg('formats');
  clearHandsOff();
  const r1 = checkFormats(cfg, { version: '1.5.208' });
  const saved = JSON.parse(fs.readFileSync(path.join(cfg.dataDir, 'saved-formats.json'), 'utf8'));
  check('232 the formats file names each saved file and the Bob that wrote it', !r1.newer.length && saved.by === '1.5.208' && saved.files['queue.json'] === FORMATS['queue.json']);
  saveJson(path.join(cfg.dataDir, 'saved-formats.json'), { by: '1.6.0', files: { ...saved.files, 'reminders.json': 9, 'later-file.json': 2 } });
  const notes = [];
  const r2 = checkFormats(cfg, { version: '1.5.208', log: (t) => notes.push(t) });
  check('232 a file saved in a newer format is found', r2.newer.length === 1 && r2.newer[0] === 'reminders.json' && /newer Bob \(1\.6\.0\)/.test(notes[0] || ''));
  const rf = path.join(cfg.dataDir, 'reminders.json');
  fs.writeFileSync(rf, '{"new":"layout"}');
  let refused = null; try { saveJson(rf, []); } catch (e) { refused = e; }
  check('232 and left alone: an older Bob never writes it', isHandsOff(rf) && refused instanceof HandsOff && fs.readFileSync(rf, 'utf8') === '{"new":"layout"}');
  const again = JSON.parse(fs.readFileSync(path.join(cfg.dataDir, 'saved-formats.json'), 'utf8'));
  check('232 the newer numbers and files it doesn\'t know are kept', again.files['reminders.json'] === 9 && again.files['later-file.json'] === 2 && again.by === '1.6.0');
  check('232 the start-up check says so', startCheck(cfg, { statfs: null }).problems.some((p) => /reminders\.json was saved by a newer Bob/.test(p)));
  clearHandsOff();
}

// ---------- 233 Bad saved files are kept, not lost ----------
{
  const f = path.join(tmp, 'c', 'queue.json');
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, '[{"id":"a","text":"half a fi');
  const logs = [];
  const v = readSaved(f, [], { check: Array.isArray, log: (t) => logs.push(t) });
  const kept = fs.readdirSync(path.dirname(f)).filter((n) => n.startsWith('queue.json.broken-'));
  check('233 a file that won\'t read is set aside, and a fresh one is started', Array.isArray(v) && !v.length && kept.length === 1 && !fs.existsSync(f));
  check('233 with a line in the logbook', /queue\.json couldn't be read .*kept it as queue\.json\.broken-/.test(logs[0] || ''));
  check('233 the bad copy is kept as it was', fs.readFileSync(path.join(path.dirname(f), kept[0]), 'utf8') === '[{"id":"a","text":"half a fi');
  fs.writeFileSync(f, '{"not":"a list"}');
  readSaved(f, [], { check: Array.isArray });
  check('233 the wrong shape counts as bad too', !fs.existsSync(f));
  check('233 a missing file is just the fallback, nothing set aside', readSaved(path.join(tmp, 'c', 'none.json'), 7) === 7);
  for (let i = 0; i < 7; i++) { fs.writeFileSync(f, 'x'); setAside(f, '', { now: Date.UTC(2026, 0, 1, 0, 0, i) }); }
  check('233 the newest 5 bad copies are kept', fs.readdirSync(path.dirname(f)).filter((n) => n.startsWith('queue.json.broken-')).length === 5);
  // Settings: an unreadable settings.json is set aside before a change, never written over.
  const cfg = mkCfg('settings');
  fs.writeFileSync(cfg.settingsFile, '{"voice": "am_onyx", "oops');
  saveSettings(cfg, { brainMode: 'always' });
  const aside = fs.readdirSync(cfg.dataDir).filter((n) => n.startsWith('settings.json.broken-'));
  check('233 a change never writes over a settings.json it couldn\'t read', aside.length === 1 && fs.readFileSync(path.join(cfg.dataDir, aside[0]), 'utf8').includes('am_onyx') && JSON.parse(fs.readFileSync(cfg.settingsFile, 'utf8')).brainMode === 'always');
  // Reminders and the queue read through it.
  const rc = mkCfg('rem');
  fs.writeFileSync(path.join(rc.dataDir, 'reminders.json'), 'garbage');
  check('233 reminders that won\'t read are set aside, not read as none and saved over', loadReminders(rc, { log: () => {} }).length === 0 && fs.readdirSync(rc.dataDir).some((n) => n.startsWith('reminders.json.broken-')));
  check('233 the queue reads through it', /readSaved\(this\.queueFile, \[\], \{ check: Array\.isArray/.test(brainText()));
  check('233 so does settings.json at start', /readSaved\(cfg\.settingsFile, \{\}/.test(read('../src/config.js')));
}

// ---------- 234 Settings are checked when loaded ----------
{
  const defaults = { autostart: false, port: 7777, voice: 'am_onyx', readRoots: [], llamacpp: { ctx: 32768, fit: true }, saveDir: null };
  const { kept, fixed } = checkSettings(defaults, { autostart: 'yes', port: 'many', voice: 'am_echo', readRoots: 'C:/', llamacpp: { ctx: NaN, fit: false }, saveDir: 'D:/x', newKey: 5, models: { bob: 'x' } });
  check('234 a value of the wrong kind goes back to its default', !('autostart' in kept) && !('port' in kept) && !('readRoots' in kept) && !('ctx' in kept.llamacpp));
  check('234 and the logbook can say which', fixed.join(',') === 'autostart,port,readRoots,llamacpp.ctx');
  check('234 good values, nulls and settings with no default are kept', kept.voice === 'am_echo' && kept.llamacpp.fit === false && kept.saveDir === 'D:/x' && kept.newKey === 5 && kept.models.bob === 'x');
  check('234 a null saved value is kept (it means "Bob picks")', 'ctx' in checkSettings({ llamacpp: { ctx: 1 } }, { llamacpp: { ctx: null } }).kept.llamacpp);
  const src = read('../src/config.js'), srv = read('../src/server.js');
  check('234 start-up checks settings.json and logs what went back', /checkSettings\(cfg, saved\)/.test(src) && /went back to the default for \$\{cfg\.settingsFixed\.join/.test(srv));
}

// ---------- 235 Restart picks up from the last finished step ----------
{
  const job = { id: 'j2', text: 'x' };
  const l = new Ledger({ job });
  const long = 'q'.repeat(1500), result = 'r'.repeat(900);
  l.action('fetch_page', { url: `https://example.com/${long}` }, true, result);
  const a = job.handoff.actions[0];
  check('235 a step\'s whole input is kept (not cut at 300)', a.args.length > 1500 && a.args.length <= STEP_IN);
  check('235 and its result', a.text.length === 900 && STEP_OUT >= 900);
  job.state = 'working';
  const plan = carryOnPlan(job);
  check('235 Carry on knows the finished step and doesn\'t redo it', plan.mode === 'carry' && /Do NOT do these again/.test(plan.note) && /fetch_page/.test(plan.note));
  check('235 the note to the brain stays as short as before (one line a step, clipped)', plan.note.split('\n').every((x) => x.length < 520));
}

// ---------- 236 A job knows which chat and folder it belongs to ----------
{
  const cfg = mkCfg('home');
  cfg.painterDir = path.join(cfg.innDir, 'painter');
  fs.mkdirSync(path.join(cfg.dataDir, 'sessions'), { recursive: true });
  fs.writeFileSync(path.join(cfg.dataDir, 'sessions', 'chat-7.json'), JSON.stringify([{ role: 'user', content: 'Plan the garden' }]));
  const h = jobHome(cfg, 'chat-7', { project: 'Garden' });
  check('236 a job keeps its chat id, the chat\'s name, the folder and the project', h.chat === 'chat-7' && h.title === 'Plan the garden' && h.folder === cfg.painterDir && h.project === 'Garden' && h.profile === '');
  check('236 a job runs while its own person has Bob open', homeOpen(cfg, { home: h }) && homeOpen(cfg, {}));
  check('236 another person\'s job waits for them (its answer never lands in someone else\'s chats)', !homeOpen({ ...cfg, profileNow: 'abc123abc123' }, { home: h }) && homeOpen({ ...cfg, profileNow: 'abc123abc123' }, { home: { ...h, profile: 'abc123abc123' } }));
  const src = brainText();
  check('236 every new job gets its home, and the queue waits for it', /home: jobHome\(this\.cfg, sessionId/.test(src) && /if \(!homeOpen\(this\.cfg, job\)\)/.test(src) && /home: home && !guest \? \{ title/.test(src));
}

// ---------- 237 Memory changes are logged ----------
{
  const cfg = mkCfg('memlog');
  const d = memoryDiff('- likes tea\n- has a cat\n', '- likes tea\n- has two cats\n- plays chess\n');
  check('237 a change is worked out line by line', d.added.join('|') === '- has two cats|- plays chess' && d.removed.join('|') === '- has a cat');
  writeText(cfg, cfg.memoryFile, '- likes tea\n', { who: 'you, in Settings' });
  await inTurn({ cfg, sessionId: 'chat-1', askId: 'ask-1', jobId: 'job-1', tool: 'remember' }, async () => { appendText(cfg, cfg.memoryFile, '- has a cat\n'); });
  const log = readMemoryLog(cfg, readText);
  check('237 each change is in memory-changes.jsonl, beside the memory file', fs.existsSync(memLogFile(cfg)) && log.length === 2);
  check('237 with who made it', log[0].by === 'you, in Settings' && log[1].by === 'remember');
  check('237 and the chat, message and job of the turn that wrote it', log[1].chat === 'chat-1' && log[1].ask === 'ask-1' && log[1].job === 'job-1' && log[1].added[0] === '- has a cat');
  writeText(cfg, cfg.memoryFile, readText(cfg.memoryFile));
  check('237 nothing is logged when nothing changed', readMemoryLog(cfg, readText).length === 2);
  check('237 housekeeping says it was housekeeping', (read('../src/housekeeping.js').match(/who: 'housekeeping'/g) || []).length === 3);
}

// ---------- 238 A turn's changes are tied to the turn ----------
{
  const cfg = mkCfg('turns');
  const docs = path.join(tmp, 'turns', 'docs');
  fs.mkdirSync(docs, { recursive: true });
  const old = path.join(docs, 'plan.txt'), made = path.join(docs, 'new.txt');
  fs.writeFileSync(old, 'old plan');
  fs.writeFileSync(cfg.noticeBoard, '# Notice board\n- buy milk\n');
  fs.writeFileSync(cfg.memoryFile, '- likes tea\n');
  const tools = buildTools(cfg);
  const scope = { cfg, sessionId: 'chat-2', askId: 'ask-9', jobId: 'job-9' };
  await inTurn({ ...scope, tool: 'write_file' }, () => tools.write_file.run({ path: old, content: 'new plan' }));
  await inTurn({ ...scope, tool: 'write_file' }, () => tools.write_file.run({ path: old, content: 'newer plan' }));
  await inTurn({ ...scope, tool: 'write_file' }, () => tools.write_file.run({ path: made, content: 'brand new' }));
  await inTurn({ ...scope, tool: 'notice_board' }, () => tools.notice_board.run({ action: 'write', content: '# Notice board\n- buy bread\n' }));
  await inTurn({ ...scope, tool: 'remember' }, () => tools.remember.run({ fact: 'Likes bread' }));
  const ch = turnChanges(cfg, 'chat-2', 'ask-9');
  check('238 the turn knows every file it changed, once each', ch.length === 4 && ch.filter((x) => x.file === path.resolve(old)).length === 1, JSON.stringify(ch));
  check('238 the chat lists the message with changes to undo', changedTurns(cfg, 'chat-2').includes('ask-9') && !changedTurns(cfg, 'chat-3').length);
  const r = undoTurn(cfg, 'chat-2', 'ask-9');
  check('238 Undo puts the whole turn back', fs.readFileSync(old, 'utf8') === 'old plan' && /buy milk/.test(fs.readFileSync(cfg.noticeBoard, 'utf8')) && !/bread/.test(readText(cfg.memoryFile)), JSON.stringify(r));
  check('238 a file the turn made is moved to the backups, never deleted', !fs.existsSync(made) && fs.readdirSync(path.join(cfg.dataDir, 'backups', 'undone')).some((n) => n.endsWith('new.txt')));
  check('238 one plain line says what was put back', /^Put back 4 files the way they were before that message\.$/.test(undoLine(r)));
  check('238 the record goes once used', !changedTurns(cfg, 'chat-2').length && /nothing to undo/.test(undoTurn(cfg, 'chat-2', 'ask-9').error));
  // A file changed after the turn is left alone.
  await inTurn({ ...scope, askId: 'ask-10', tool: 'write_file' }, () => tools.write_file.run({ path: old, content: 'turn ten' }));
  fs.writeFileSync(old, 'you changed it by hand');
  const r2 = undoTurn(cfg, 'chat-2', 'ask-10');
  check('238 a file changed since is left as it is, and named', fs.readFileSync(old, 'utf8') === 'you changed it by hand' && r2.skipped[0]?.why === 'changed since' && /Left as it is: plan\.txt \(changed since\)/.test(undoLine(r2)), JSON.stringify(r2) + undoLine(r2));
  // Saves outside a turn aren't recorded.
  tools.write_file.run({ path: old, content: 'no turn' });
  check('238 saves outside a turn are not recorded', !changedTurns(cfg, 'chat-2').length);
  fs.utimesSync(cfg.dataDir, new Date(), new Date());
  await inTurn({ ...scope, askId: 'ask-11', tool: 'write_file' }, () => tools.write_file.run({ path: old, content: 'x' }));
  check('238 a turn\'s Undo lasts a week', pruneTurns(cfg, { now: Date.now() + 8 * 864e5 }) === 1);
  const src = brainText(), srv = read('../src/server.js'), app = publicText('app.js');
  check('238 every tool of a turn runs inside it (not other Bobs\' or bots\' jobs)', /(?:inChangeTurn|inTurn)\(scope, async/.test(src) && /ctx\?\.askId && !ctx\.job\?\.guest/.test(src) && /askId: \(again \? lastUser\?\.id : user\.id\)/.test(src));
  check('238 the … menu on your message has Undo changes, asked first', /'undo-turn', 'Undo changes'/.test(app) && /data-m="undo-yes"/.test(app) && /\/api\/turn-undo/.test(srv) && /\/api\/turn-changes/.test(srv));
}

// ---------- 239 Clean up old temp files ----------
{
  const dir = path.join(tmp, 'sweep');
  fs.mkdirSync(path.join(dir, 'bob'), { recursive: true });
  const old = Date.now() - 3600e3;
  const mk = (n, at = old) => { const f = path.join(dir, n); fs.writeFileSync(f, 'x'); fs.utimesSync(f, at / 1000, at / 1000); return f; };
  mk('queue.json.1234-1-abc.bob-tmp'); mk('bob/settings.json.part'); mk('bob/notes.md.tmp'); mk('notes.txt.lock');
  const fresh = mk('bob/reminders.json.99-1-aa.bob-tmp', Date.now());
  const dl = mk('bob/model.gguf.part'); const keep = mk('bob/settings.json');
  const r = sweepTemp([dir]);
  check('239 temp files from a cut-off save are cleared at start', r.files === 4);
  check('239 one being written right now is left', fs.existsSync(fresh));
  check('239 a half download is kept (downloads pick up from it), and real files of course', fs.existsSync(dl) && fs.existsSync(keep));
}

// ---------- 240 A short self-check at start-up ----------
{
  const cfg = mkCfg('check');
  cfg.llamacpp = { exe: path.join(tmp, 'check', 'brain-engine', 'llama-server') };
  fs.mkdirSync(path.dirname(cfg.llamacpp.exe), { recursive: true }); fs.writeFileSync(cfg.llamacpp.exe, '');
  setAside.recent = [];
  const ok = startCheck(cfg, { statfs: () => ({ bavail: 50 * 1024 ** 2, bsize: 4096 }) });
  check('240 one line when all is well', ok.ok && ok.line === 'start check: folders ok, 200 GB free, engine there, saved files ok' && !ok.problems.length);
  fs.rmSync(cfg.llamacpp.exe);
  fs.writeFileSync(path.join(cfg.dataDir, 'schedules.json'), '{bad');
  const bad = startCheck(cfg, { statfs: () => ({ bavail: LOW_DISK / 4096 / 2, bsize: 4096 }) });
  check('240 low disk, a missing engine and a file that won\'t read are each said', !bad.ok && bad.problems.length === 3 && bad.problems.some((p) => /Only 1\.0 GB is free/.test(p)) && bad.problems.some((p) => /brain engine isn't where/.test(p)) && bad.problems.some((p) => /schedules\.json couldn't be read/.test(p)));
  const ro = startCheck(cfg, { statfs: null, io: { ...fs, writeFileSync: (p, ...a) => { if (String(p).includes('.bob-check-')) { const e = new Error('read-only'); e.code = 'EROFS'; throw e; } return fs.writeFileSync(p, ...a); } } });
  check('240 a folder Bob can\'t save in is said', ro.problems.some((p) => /I can't save in/.test(p)) && /a folder is not writable/.test(ro.line));
  check('240 no engine set (a first start) is not a problem', !startCheck({ ...cfg, llamacpp: {} }, { statfs: null }).problems.some((p) => /engine/.test(p)));
  const srv = read('../src/server.js');
  check('240 the line goes in the logbook, and the chat hears only when something is wrong', /brain\.log\('saving', check\.line\)/.test(srv) && /if \(!check\.ok\)/.test(srv) && /type: 'announce', text: `⚠️ \$\{p\}`/.test(srv));
  setAside.recent = [];
}

// ---------- Nothing reaches the brain's start-of-job prompt ----------
{
  const files = ['../src/saving.js', '../src/turn-changes.js', '../src/job-home.js'].map(read).join('\n');
  check('nothing new is added to what the brain reads', !/systemPrompt|role: 'system'|prompt/i.test(files));
  const b = new Brain({ ...mkCfg('brain'), models: { bob: 'small:latest' }, engine: 'ollama', ollamaUrl: 'http://127.0.0.1:1', session: 'normal', autoSession: false, llamacpp: {} }, () => {});
  b.queue = [{ id: 'x', text: 'hi', state: 'waiting', sessionId: 's', at: Date.now() }];
  b.saveQueueSoon(50); b.saveQueueSoon(50);
  check('several steps in a row make one save', Boolean(b.queueTimer));
  b.flushQueue();
  check('flushing saves at once and clears the wait', !b.queueTimer && readSaved(b.queueFile, []).length === 1);
}

// ---------- Help ----------
{
  const e = HELP.find((x) => x.id === 'saving-safely');
  check('Help explains it in Bob\'s voice', Boolean(e) && /\bI\b/.test(e.html) && /Undo changes/.test(e.html) && /Windows, Mac and Linux/.test(e.html));
  check('the FAQ has it', HELP.some((x) => x.group === 'FAQ' && x.id === 'faq-undo-turn'));
  const g = HELP.find((x) => x.id === 'glossary');
  check('the glossary has it', /<dt>Undo changes<\/dt>/.test(g.html) && /<dt>Set aside \(a saved file\)<\/dt>/.test(g.html));
}

fs.rmSync(tmp, { recursive: true, force: true });
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

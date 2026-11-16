// Monitoring log (Nov 16, src/trace-log.js): a trace per turn, a span per brain request and tool call, written as plain
// text to rolling files. Names, times, status and sizes only. Every file here is in a fresh temporary folder.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { cleanTraceLog, traceOn, SIZES_MB, DEFAULT_MB, safeName, errorKind, toolStatus, cleanAttrs, TurnTrace, startTurnTrace, traced, finishTurnTrace, renderTurn, writeBlock, trimOld, rolledFiles, fileCap, logFiles, logTail, deleteLog, recentView, engineAttrs, LIVE_FILE, traceDir, MAX_SPANS } from '../src/trace-log.js';
import { traceLogRoute } from '../src/trace-log-routes.js';
import { detailsOn, hideKeyed, clipDetail, DETAIL_MAX, keepTurn, keepLiveFile, keptFiles, deleteKept, keptDir, openTurns, replyText, lastAsked } from '../src/trace-log.js';
import { notMonitoringLog } from '../model-lab/common.mjs';
import { NOT_BACKED_UP, skipped } from '../src/backup.js';
import { inTurn } from '../src/turn-log.js';
import { mergeSettings, SETTING_KEYS } from '../src/config.js';
import { GROUPS, CARDS } from '../public/settings-map.js';
import { turnHtml } from '../public/trace-log.js';

let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra && !ok ? ' -> ' + extra : ''}`); };
const read = (f) => fs.readFileSync(new URL(`../${f}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bob-monlog-'));
let n = 0;
const cfgOf = (traceLog = { on: true }) => ({ dataDir: path.join(tmp, `d${++n}`), timeZone: 'UTC', traceLog });
// A clock the test moves by hand.
const clockAt = (t0) => { let t = t0; const now = () => t; now.add = (ms) => { t += ms; }; return now; };
const T0 = Date.UTC(2026, 10, 16, 18, 42, 7, 120);

// ---------- settings ----------
{
  const d = cleanTraceLog(undefined);
  check('off and 1 GB to start', d.on === false && d.maxMB === 1024 && DEFAULT_MB === 1024);
  check('on only when true; a size must be one in the list', cleanTraceLog({ on: 'yes' }).on === false && cleanTraceLog({ on: true, maxMB: 5120 }).maxMB === 5120 && cleanTraceLog({ maxMB: 3 }).maxMB === 1024 && cleanTraceLog({ maxMB: 1e9 }).maxMB === 1024);
  check('sizes run 100 MB to 10 GB', SIZES_MB[0] === 100 && SIZES_MB.at(-1) === 10240);
  check('it is a setting Bob saves, tidied', SETTING_KEYS.includes('traceLog') && SETTING_KEYS.at(-1) === 'apuHoldbackGB' && mergeSettings({}, { traceLog: { on: true, maxMB: 7, extra: 1 } }).traceLog.maxMB === 1024 && !('extra' in mergeSettings({}, { traceLog: { on: true, extra: 1 } }).traceLog));
  check('no trace is made while it is off', startTurnTrace({ traceLog: { on: false } }, { id: 'abc' }) === null && startTurnTrace({}, { id: 'abc' }) === null && traceOn({ traceLog: { on: true } }));
  check('a file is a tenth of the limit, 1 to 100 MB', fileCap(500) === Math.floor(500 * 1024 * 1024 / 10) && fileCap(1024) === 100 * 1024 * 1024 && fileCap(10240) === 100 * 1024 * 1024 && fileCap(1) === 1024 * 1024);
}

// ---------- privacy: names, times, status and sizes only ----------
{
  check('a brain name loses its folder', safeName('C:\\Users\\you\\models\\qwen3.6-35b.gguf') === 'qwen3.6-35b' && safeName('/home/a/b/qwen.gguf') === 'qwen' && safeName('hf:Org/Model:Q4') === 'Model:Q4');
  check('…and odd characters become _', safeName('web search <b>') === 'web_search__b_' && safeName('') === '?');
  check('an error keeps its kind, never its words', errorKind(Object.assign(new Error('could not read C:\\secret\\file.txt'), { code: 'ENOENT' })) === 'ENOENT' && errorKind(new TypeError('key sk-abc in https://x.example')) === 'TypeError' && errorKind({ code: 'has spaces and a /path', name: 'Weird name!' }) === 'Error');
  check('a tool\'s answer as a status, like the tool record', toolStatus('Error: nope') === 'error' && toolStatus('Not run: x') === 'error' && toolStatus('The user said no.') === 'declined' && toolStatus('fine') === 'ok');
  const a = cleanAttrs({ args: '{"path":"C:/x"}', result: 'secret', prompt: 'hi', url: 'https://x.example', tokens: 12.34, chars: -5, model: 'D:\\m\\a.gguf', key: 'sk-1' });
  check('only kept attributes stay: tool inputs, results, prompts, addresses and keys go', JSON.stringify(a) === JSON.stringify({ tokens: 12.3, model: 'a' }), JSON.stringify(a));
}

// ---------- spans ----------
{
  const now = clockAt(T0);
  const t = new TurnTrace({ id: '3f2a9c1b-aaaa', lane: 'talk', now });
  check('a trace id of 32 hex, a span id of 16, the OpenTelemetry sizes', /^[0-9a-f]{32}$/.test(t.traceId) && /^[0-9a-f]{16}$/.test(t.root.spanId) && t.turn === '3f2a9c1b');
  let r = await traced('engine', 'C:\\m\\qwen3.6-35b.gguf', async () => { now.add(3100); return { content: 'x'.repeat(40) }; }, (rep, span) => engineAttrs({ at: T0 + 3100, used: 5210, ctx: 32768, tokPerSec: 41.2 }, span, rep), { trace: t });
  check('a span runs the step and gives back its answer', r.content.length === 40);
  now.add(100);
  await traced('tool', 'web_search', async () => { now.add(1200); return { text: 'a'.repeat(3400) }; }, (x) => ({ status: toolStatus(x.text), chars: x.text.length }), { trace: t });
  let threw = false;
  try { await traced('tool', 'fetch_page', async () => { now.add(800); throw Object.assign(new Error('could not open https://private.example/me'), { code: 'ECONNRESET' }); }, () => ({}), { trace: t }); } catch (e) { threw = e.code === 'ECONNRESET'; }
  check('a failed step throws the same error and is marked error, with its kind only', threw && t.spans[2].status === 'error' && t.spans[2].attrs.error === 'ECONNRESET');
  const ac = new AbortController(); ac.abort();
  await traced('tool', 'read_file', async () => { throw new Error('stopped'); }, () => ({}), { trace: t, signal: ac.signal }).catch(() => {});
  check('a step stopped by Stop is "stopped", not an error', t.spans[3].status === 'stopped');
  check('every span is a child of the turn', t.spans.every((s) => s.parentId === t.root.spanId && s.traceId === t.traceId));
  check('the engine span has its tokens and speed', t.spans[0].attrs.tokens === 5210 && t.spans[0].attrs.ctx === 32768 && t.spans[0].attrs.tokPerSec === 41.2 && t.spans[0].name === 'qwen3.6-35b');
  check('old engine numbers are not borrowed', !('tokens' in engineAttrs({ at: 1, used: 9 }, { start: 5 }, {})));
  const plain = await traced('tool', 'x', async () => 7, () => ({}), { trace: null });
  check('with no trace a step just runs', plain === 7);
  // Inside a turn the span finds the turn's trace by itself (brain-turns.js puts it on the turn's store).
  const t2 = new TurnTrace({ id: 'inturn01' });
  await inTurn({ id: 'inturn01', trace: t2 }, () => traced('tool', 'calc', async () => ({ text: '4' }), (x) => ({ chars: x.text.length })));
  check('inside a turn the span joins that turn\'s trace', t2.spans.length === 1 && t2.spans[0].name === 'calc');
  await inTurn({ id: 'other' }, () => traced('tool', 'calc', async () => 1));
  check('…and outside one (or with the log off) nothing is kept', t2.spans.length === 1);

  now.add(7000);
  t.finish({ why: 'done', ms: 12400 });
  const text = renderTurn(t, { timeZone: 'UTC' });
  const lines = text.trimEnd().split('\n');
  check('a header line when the turn starts, an end line with how it went', lines[0].startsWith('=== Turn 3f2a9c1b · 2026-11-16 18:42:07 · talk · trace ') && lines[0].endsWith(t.traceId) && lines.at(-1) === '--- Turn 3f2a9c1b ended · answered · 12.4 s · 1 engine, 3 tool · 1 error', text);
  check('then one indented line per step, in order', lines.length === 6 && lines.slice(1, 5).every((l) => l.startsWith('  18:42:')), text);
  check('a step line: time, offset, kind, name, how long, status, sizes', /^ {2}18:42:07\.120 {2}\+ {3}0\.0 s {2}engine {2}qwen3\.6-35b {22}3\.1 s {2}ok {8}5,210 of 32,768 tokens · 41\.2 tok\/s · 40 chars$/.test(lines[1]), lines[1]);
  check('…a tool with its answer\'s size, and an error with its kind', /web_search .* 1\.2 s {2}ok .*3,400 chars$/.test(lines[2]) && /fetch_page .* 0\.8 s {2}error .*error kind: ECONNRESET$/.test(lines[3]), lines[2] + '\n' + lines[3]);
  check('no error words, addresses or folders in the text', !/private\.example|could not|C:\\|\\m\\/.test(text));
  check('a turn ends with a blank line', text.endsWith('\n\n'));
  const stopped = new TurnTrace({ id: 's' }); stopped.start('tool', 'slow'); stopped.finish({ why: 'stop' });
  const failed = new TurnTrace({ id: 'f' }); failed.finish({ why: 'error', error: Object.assign(new Error('no brain at D:\\x'), { code: 'no_brain' }) });
  check('a failed turn names the error\'s kind in its header, never its words', renderTurn(failed).includes('· an error ·') && renderTurn(failed).includes('error kind: no_brain') && !renderTurn(failed).includes('D:'));
  const refusedT = new TurnTrace({ id: 'r' }); refusedT.start('tool', 'list_folder').end('refused'); refusedT.finish({});
  check('a refused call counts as an error in the header', renderTurn(refusedT).includes('1 tool · 1 error'));
  check('a stopped turn says so, and a step still open is "unfinished"', stopped.root.status === 'stopped' && stopped.spans[0].status === 'unfinished');
  const big = new TurnTrace({ id: 'big' });
  for (let i = 0; i < MAX_SPANS + 5; i++) big.start('tool', 't').end();
  big.finish({});
  check('a turn keeps its first spans and says how many it left out', big.spans.length === MAX_SPANS && big.dropped === 5 && renderTurn(big).includes('(5 more steps not written'));
  const keep = [];
  const cfg = cfgOf();
  const t3 = new TurnTrace({ id: 'tline', now: clockAt(T0) });
  t3.start('tool', 'web_search').end('ok', { chars: 10 });
  finishTurnTrace(cfg, t3, { why: 'done', ms: 1000 }, { keep });
  const v = recentView(keep);
  check('the timeline gets the turn as plain data', v.length === 1 && v[0].spans[0].name === 'web_search' && v[0].why === 'answered' && !('traceId' in v[0]));
  const html = turnHtml({ ...v[0], spans: [{ kind: 'tool', name: '<img src=x>', from: 0, ms: 500, status: 'ok', about: '' }] });
  check('the timeline escapes names', !html.includes('<img') && html.includes('&lt;img'));
}

// ---------- the files ----------
{
  const cfg = cfgOf({ on: true, maxMB: 100 });
  const live = path.join(traceDir(cfg), LIVE_FILE);
  check('the folder is monitoring-log in Bob\'s data folder', traceDir(cfg) === path.join(cfg.dataDir, 'monitoring-log'));
  writeBlock(cfg, '=== Turn a\n  step\n\n');
  const first = fs.readFileSync(live, 'utf8');
  check('a new file starts with a short header saying what is in it', first.startsWith('# Bob monitoring log.') && first.endsWith('=== Turn a\n  step\n\n'));
  writeBlock(cfg, '=== Turn b\n\n');
  check('the next turn is added to the same file', fs.readFileSync(live, 'utf8').split('=== Turn').length === 3);

  // A small fake disk, so rolling at 10 MB and trimming at 100 MB don't need real gigabytes.
  const files = new Map();
  const fake = {
    mkdirSync() {}, existsSync: (f) => files.has(f), statSync: (f) => { if (!files.has(f)) throw new Error('none'); return { size: files.get(f).length }; },
    appendFileSync: (f, t) => files.set(f, (files.get(f) || '') + t), renameSync: (a, b) => { files.set(b, files.get(a)); files.delete(a); },
    rmSync: (f) => files.delete(f), readdirSync: () => [...files.keys()].map((f) => path.basename(f))
  };
  const block = (i) => `=== Turn ${i}\n` + 'x'.repeat(3 * 1024 * 1024) + '\n\n'; // about 3 MB a turn
  let t = Date.UTC(2026, 10, 16, 12, 0, 0);
  for (let i = 0; i < 60; i++) { writeBlock(cfg, block(i), { fsApi: fake, now: (t += 1000) }); }
  const rolled = rolledFiles(cfg, { fsApi: fake });
  const liveF = path.join(traceDir(cfg), LIVE_FILE);
  check('the live file rolls before it passes a tenth of the limit', [...files.values()].every((x) => x.length <= fileCap(100)) && rolled.length > 0);
  check('a turn is never split across two files', [...files.values()].every((x) => x.split('=== Turn').slice(1).every((b) => b.endsWith('\n\n') && b.length > 3 * 1024 * 1024)));
  const total = [...files.values()].reduce((a, x) => a + x.length, 0);
  check('the oldest files go so all of them stay within the limit', total <= 100 * 1024 * 1024 && !files.has(path.join(traceDir(cfg), path.basename(rolled[0]).replace(/./, 'z'))) && files.has(liveF), String(total));
  check('the newest turn is in the live file', files.get(liveF).includes('=== Turn 59\n'));
  check('rolled files are named by date and time', rolled.every((f) => /bob-monitoring-\d{8}-\d{6}(-\d+)?\.txt$/.test(f)));
  const lower = { ...cfg, traceLog: { on: true, maxMB: 100 } };
  files.set(path.join(traceDir(cfg), 'bob-monitoring-20200101-000000.txt'), 'y'.repeat(200 * 1024 * 1024));
  const gone = trimOld(lower, { fsApi: fake });
  check('trimming removes the oldest first and never the live file', gone[0].endsWith('bob-monitoring-20200101-000000.txt') && files.has(liveF));
  check('a log that can\'t be written never throws', writeBlock(cfg, 'x', { fsApi: { mkdirSync() { throw new Error('disk full'); } } }) === false);

  const c2 = cfgOf();
  fs.mkdirSync(traceDir(c2), { recursive: true });
  fs.writeFileSync(path.join(traceDir(c2), LIVE_FILE), '# head\n\n' + Array.from({ length: 50 }, (_, i) => `=== Turn ${i}\n  ${'z'.repeat(100)}\n\n`).join(''));
  const tail = logTail(c2, 1000);
  check('Show the log gives the end of the file, starting at a whole turn', tail.startsWith('(showing the last') && tail.includes('\n\n=== Turn 49') && tail.split('\n').find((l) => l.startsWith('=== Turn')).length < 20);
  check('…and the whole file when it is small', logTail(c2, 1e7).startsWith('# head'));
  fs.writeFileSync(path.join(traceDir(c2), 'bob-monitoring-20261116-010101.txt'), 'old');
  fs.writeFileSync(path.join(traceDir(c2), 'notes.txt'), 'not mine');
  check('it counts its own files only', logFiles(c2).files === 2);
  check('Delete the log files deletes its own files and nothing else', deleteLog(c2) === 2 && fs.existsSync(path.join(traceDir(c2), 'notes.txt')) && logFiles(c2).files === 0);
}

// ---------- Bob's API ----------
{
  const cfg = cfgOf({ on: false });
  let saved = null;
  const send = (res, code, body, type) => ({ code, body, type });
  const call = (method, p, data, isLocal = true) => traceLogRoute({ req: { method }, res: {}, p, isLocal, cfg: Object.assign(cfg, saved ? { traceLog: saved } : {}), body: async () => data, send, log: () => {} });
  // saveSettings writes config.json; in this test it would touch Bob's real config, so the route is read for its shape.
  const src = read('src/trace-log-routes.js');
  check('not this request: the route says so', (await call('GET', '/api/other')) === false);
  check('from another device: refused', (await call('GET', '/api/trace-log', null, false)).code === 403);
  const g = await call('GET', '/api/trace-log');
  check('GET gives the switch, the sizes, what is on disk and the last turns', g.code === 200 && g.body.on === false && g.body.maxMB === 1024 && g.body.sizes.length === SIZES_MB.length && g.body.files === 0 && Array.isArray(g.body.recent));
  check('a size not in the list is refused', (await call('POST', '/api/trace-log', { maxMB: 3 })).code === 400);
  const txt = await call('GET', '/api/trace-log/text');
  check('the log as plain text, with a line when it is empty', txt.code === 200 && /^text\/plain/.test(txt.type) && /empty/.test(txt.body));
  check('settings changes are logged by switch and size only', /Monitoring log \$\{b\.on \? 'on' : 'off'\}/.test(src) && /sizeLabel\(next\.maxMB\)/.test(src));
}

// ---------- where it hooks in ----------
{
  const turns = read('src/brain-turns.js'), tools = read('src/brain-tool-runs.js'), asking = read('src/brain-asking.js'), runOn = read('src/brain-run-on.js'), server = read('src/server.js');
  check('a trace starts with each turn (with its ask) and ends with its answer', /trace: startTurnTrace\(this\.cfg, \{ id: turnId, lane, guest: Boolean\(job\?\.guest\), ask: text \}\)/.test(turns) && /finishTurnTrace\(this\.cfg, tstore\.trace, \{ why, ms: sum\.ms, error: tstore\.error, answer: fin\?\.content \|\| '' \}\)/.test(turns));
  check('each tool call is a span with its status and size', /await traced\('tool'/.test(tools) && /status: toolStatus\(r\?\.text\)/.test(tools));
  check('each engine request is a span (every engine.chat in the retry goes through it)', /traced\('engine', o\.model, \(\) => this\.engine\.chat\(o\)/.test(asking) && (asking.match(/this\.engine\.chat\(/g) || []).length === 1);
  check('rented brains and other Bobs are spans without names', /traced\('rented', 'rented brain'/.test(runOn) && /traced\('lent', 'other Bob'/.test(runOn));
  check('a call that couldn\'t run as it was is a refused span, with its inputs as details', /traceNow\(\)\?\.start\('tool', name\)\.end\('refused', \{\}, \{ in: call\.function\?\.arguments, out: call\.bounce \}\)/.test(runOn));
  check('the route is wired in', /traceLogRoute\(\{ req, res, p, isLocal, cfg, body, send/.test(server));
}

// ---------- settings page, Help, glossary, FAQ ----------
{
  const cellar = read('public/cellar.js'), help = read('public/help-content.js'), inv = read('docs/SETTINGS-INVENTORY.md'), css = read('public/style.css');
  check('the panel is in This replicant matrix, in both views', GROUPS.find(([g]) => g === 'This replicant matrix')[1].includes('adv-tracelog') && CARDS.find((c) => c.id === 'pc').topics.includes('adv-tracelog'));
  check('the panel is drawn and mounted', /\['tracelog', '📈 Monitoring log'/.test(cellar) && /mountTraceLog\(dlg\.querySelector\('\.trace-log-box'\)\)/.test(cellar));
  check('Help has the settings entry, in Bob\'s voice, with the platforms', /id: 'settings-tracelog'/.test(help) && /When it's on, I write down every turn's steps/.test(help) && /Works on Windows, Mac and Linux/.test(help) && /Android app/.test(help.slice(help.indexOf("id: 'settings-tracelog'"), help.indexOf("id: 'faq-slow-step'"))));
  check('FAQ entries', ['faq-slow-step', 'faq-monitoring-private', 'faq-jaeger', 'faq-monitoring-old'].every((id) => help.includes(`id: '${id}', group: 'FAQ'`)));
  check('glossary entries', ['<dt>Monitoring log</dt>', '<dt>OpenTelemetry</dt>', '<dt>Span</dt>', '<dt>Trace</dt>'].every((d) => help.includes(d)));
  check('the settings inventory lists it', /📈 Monitoring log/.test(inv) && /traceLog\.maxMB/.test(inv));
  check('the timeline uses theme colours only', !/#[0-9a-f]{3,6}\b/i.test(css.slice(css.indexOf('Monitoring log (public/trace-log.js)'))));
}

// ---------- written as it happens, not held in memory ----------
{
  const cfg = cfgOf({ on: true });
  const live = path.join(traceDir(cfg), LIVE_FILE);
  const now = clockAt(T0);
  const t = startTurnTrace(cfg, { id: 'disk0001', now, env: {} });
  check('the turn\'s header is on disk as soon as it starts', fs.readFileSync(live, 'utf8').includes('=== Turn disk0001'));
  const s1 = t.start('tool', 'web_search'); now.add(500);
  check('…a step still running isn\'t written yet', !fs.readFileSync(live, 'utf8').includes('web_search'));
  s1.end('ok', { chars: 12 });
  check('…and each step is on disk the moment it ends (a crash loses at most the step running then)', fs.readFileSync(live, 'utf8').includes('web_search') && !fs.readFileSync(live, 'utf8').includes('--- Turn disk0001'));
  const t2 = startTurnTrace(cfg, { id: 'disk0002', now, env: {} });
  t2.start('tool', 'calc').end('ok');
  check('two turns at once: their step lines carry the turn so they can be told apart', /calc .*\[turn disk0002\]$/m.test(fs.readFileSync(live, 'utf8')));
  finishTurnTrace(cfg, t2, { why: 'done' }, { keep: [] });
  finishTurnTrace(cfg, t, { why: 'done' }, { keep: [] });
  check('the end line goes on when the turn ends, and the open list empties', fs.readFileSync(live, 'utf8').includes('--- Turn disk0001 ended · answered') && openTurns.size === 0);
  const off = startTurnTrace(cfg, { id: 'off00001', now, env: {} });
  cfg.traceLog = { on: false };
  off.start('tool', 'late').end('ok'); finishTurnTrace(cfg, off, { why: 'done' }, { keep: [] });
  check('turned off mid-turn: nothing more is written', !fs.readFileSync(live, 'utf8').includes('late') && openTurns.size === 0);
}

// ---------- Include details ----------
{
  check('details are off to start, and only work with the log on', cleanTraceLog({ on: true }).details === false && !detailsOn({ traceLog: { on: false, details: true } }) && detailsOn({ traceLog: { on: true, details: true } }));
  check('no details for other Bobs\' or chat apps\' jobs, or in Gaming mode', !detailsOn({ traceLog: { on: true, details: true } }, 'guest') && !detailsOn({ traceLog: { on: true, details: true }, session: 'light' }));
  check('a setting Bob saves', mergeSettings({}, { traceLog: { on: true, details: true } }).traceLog.details === true);
  const cfg = cfgOf({ on: true, details: true });
  cfg.remote = { passcode: 'tulip-7731' };
  const live = path.join(traceDir(cfg), LIVE_FILE);
  const now = clockAt(T0);
  const t = startTurnTrace(cfg, { id: 'det00001', ask: 'find my notes, passcode tulip-7731', now, env: { OPENAI_API_KEY: 'sk-live-abcdefghijklmnop1234' } });
  await traced('tool', 'read_file', async () => { now.add(200); return { text: 'line one\nline two with sk-live-abcdefghijklmnop1234' }; }, (r) => ({ status: toolStatus(r.text), detail: { in: { path: 'C:/notes/a.md', password: 'hunter2' }, out: r.text } }), { trace: t });
  await traced('engine', 'qwen', async () => { now.add(300); return { content: 'Here you go.', tool_calls: [{ function: { name: 'read_file', arguments: '{"path":"C:/notes/b.md"}' } }] }; }, (r) => ({ detail: { asked: lastAsked([{ role: 'user', content: 'find my notes' }]), reply: replyText(r) } }), { trace: t });
  await traced('tool', 'fetch_page', async () => { throw new Error('could not open https://ex.example/x'); }, () => ({}), { trace: t, before: { in: { url: 'https://ex.example/x' } } }).catch(() => {});
  await traced('tool', 'read_email', async () => ({ text: 'Dear friend, private mail' }), (r) => ({ detail: { in: {}, out: r.text } }), { trace: t });
  finishTurnTrace(cfg, t, { why: 'done', answer: 'Your notes are in a.md.' }, { keep: [] });
  const text = fs.readFileSync(live, 'utf8');
  check('the ask is under the header and the answer above the end line', /=== Turn det00001.*\n {4}ask {4}\| find my notes, passcode \[hidden\]/.test(text) && /answer {1}\| Your notes are in a\.md\.\n--- Turn det00001 ended/.test(text), text);
  check('a tool\'s inputs and result are under its line, every line of a result indented', /read_file .*\n {6}in {5}\| \{"path":"C:\/notes\/a\.md","password":"\[hidden\]"\}\n {6}out {4}\| line one\n {6} {7}\| line two with \[hidden\]/.test(text), text);
  check('the brain\'s reply, with its tool calls, and the message it answered', /asked {2}\| user: find my notes/.test(text) && /reply {2}\| Here you go\.\n {6} {7}\| -> read_file \{"path":"C:\/notes\/b\.md"\}/.test(text));
  check('an error\'s words and the inputs it failed on', /fetch_page .*error.*\n {6}in {5}\| \{"url":"https:\/\/ex\.example\/x"\}\n {6}error {2}\| could not open https:\/\/ex\.example\/x/.test(text));
  check('keys, tokens and passcodes stay hidden', !text.includes('tulip-7731') && !text.includes('sk-live-') && !text.includes('hunter2'));
  check('e-mail tools keep their data out', /read_email/.test(text) && !text.includes('Dear friend'));
  check('a long detail is cut and says how much was left out', clipDetail('x'.repeat(DETAIL_MAX + 5)).endsWith('… (5 more characters)'));
  check('inputs named like a secret are hidden at any depth', JSON.stringify(hideKeyed({ a: { apiKey: 'k', list: [{ token: 't' }] }, b: 1 })) === '{"a":{"apiKey":"[hidden]","list":[{"token":"[hidden]"}]},"b":1}');
  const g = cfgOf({ on: true, details: true });
  const tg = startTurnTrace(g, { id: 'game0001', ask: 'secret plan', now: clockAt(T0), env: {} });
  tg.start('tool', 'a').end('ok', {}, { in: 'before gaming' });
  g.session = 'light';
  tg.start('tool', 'b').end('ok', {}, { in: 'during gaming' });
  finishTurnTrace(g, tg, { why: 'done', answer: 'gaming answer' }, { keep: [] });
  const gt = fs.readFileSync(path.join(traceDir(g), LIVE_FILE), 'utf8');
  check('Gaming mode pauses details from the moment it starts', gt.includes('before gaming') && !gt.includes('during gaming') && !gt.includes('gaming answer') && /tool {4}b /.test(gt));
  const off = cfgOf({ on: true });
  const to = startTurnTrace(off, { id: 'nodet001', ask: 'my words', now: clockAt(T0), env: {} });
  to.start('tool', 'x').end('ok', {}, { in: 'inputs', out: 'result' }); finishTurnTrace(off, to, { why: 'done', answer: 'answer words' }, { keep: [] });
  const ot = fs.readFileSync(path.join(traceDir(off), LIVE_FILE), 'utf8');
  check('with details off nothing of the data is written', !/my words|inputs|result|answer words/.test(ot));
}

// ---------- Keep: never rolled, trimmed or deleted with the log ----------
{
  const cfg = cfgOf({ on: true, maxMB: 100 });
  const keep = [];
  const t = startTurnTrace(cfg, { id: 'keep0001', now: clockAt(T0), env: {} });
  t.start('tool', 'web_search').end('ok');
  finishTurnTrace(cfg, t, { why: 'done' }, { keep });
  check('Keep this turn copies its block (already on disk) to kept-turns.txt', keepTurn(cfg, 'keep0001', { keep }) && fs.readFileSync(path.join(keptDir(cfg), 'kept-turns.txt'), 'utf8').includes('=== Turn keep0001') && recentView(keep)[0].kept === true);
  check('…a turn no longer in the list can\'t be kept', keepTurn(cfg, 'gone0000', { keep }) === false);
  check('Keep the current file moves it to kept/ as it is', /^bob-monitoring-kept-\d{8}-\d{6}\.txt$/.test(keepLiveFile(cfg)) && !fs.existsSync(path.join(traceDir(cfg), LIVE_FILE)) && keptFiles(cfg).length === 2);
  fs.writeFileSync(path.join(traceDir(cfg), 'bob-monitoring-20200101-000000.txt'), 'y'.repeat(150 * 1024 * 1024));
  trimOld(cfg);
  check('the size limit removes old rolled files but never kept ones', !fs.existsSync(path.join(traceDir(cfg), 'bob-monitoring-20200101-000000.txt')) && keptFiles(cfg).length === 2);
  writeBlock(cfg, '=== Turn z\n\n');
  check('Delete the log files leaves kept ones', deleteLog(cfg) === 1 && keptFiles(cfg).length === 2);
  check('Delete kept removes them', deleteKept(cfg, { keep }) === 2 && keptFiles(cfg).length === 0 && recentView(keep)[0].kept === false);
  check('nothing goes by age: no date or age test anywhere in the log code', !/mtime|ageMs|KEEP_DAYS|Date\.now\(\) - /.test(read('src/trace-log.js')) && !/monitoring/.test(read('src/housekeeping.js')));
}

// ---------- kept away from the Lab, lessons, uploads and backups ----------
{
  check('lesson tools skip the monitoring log folder and its files', !notMonitoringLog('C:\\Bob\\inn\\bob\\monitoring-log\\bob-monitoring.txt') && !notMonitoringLog('/x/monitoring-log/kept/kept-turns.txt') && !notMonitoringLog('/x/bob-monitoring-20261116-010101.txt') && notMonitoringLog('/x/lessons/a.jsonl'));
  const common = read('model-lab/common.mjs'), imp = read('model-lab/import-lessons.mjs'), mk = read('model-lab/make-datasets.mjs');
  check('…in the file finder, readJsonl, import-lessons and make-datasets', /findFile\(root, test, depth = 5\) \{\n {2}if \(!notMonitoringLog\(root\)\) return null;/.test(common) && /readJsonl\(file\) \{ if \(!notMonitoringLog\(file\)/.test(common) && /if \(!notMonitoringLog\(fp\)\) continue;/.test(imp) && /filter\(\(e\) => notMonitoringLog\(path\.join\(d, e\.name\)\)\)/.test(mk));
  const lab = fs.readdirSync(new URL('../model-lab/', import.meta.url)).filter((f) => f.endsWith('.mjs')).map((f) => read(`model-lab/${f}`)).join('\n') + fs.readdirSync(new URL('../src/', import.meta.url)).filter((f) => /^lab|lesson/.test(f)).map((f) => read(`src/${f}`)).join('\n');
  check('no Lab or lesson code reads the log', !/trace-log\.js|bob-monitoring\.txt|monitoring-log['"/\\]/.test(lab.replace(/export const notMonitoringLog[^\n]*\n/, '').replace(/^\s*\/\/.*$/gm, '')));
  check('the log is .txt, which lesson imports never take', LIVE_FILE.endsWith('.txt') && /\\\.\(jsonl\|ndjson\|json\|csv\|tsv\|parquet\)\$/.test(imp));
  check('backups leave the whole folder out, kept files too', NOT_BACKED_UP.includes('bob/monitoring-log/') && skipped('bob/monitoring-log/kept/kept-turns.txt'));
}

fs.rmSync(tmp, { recursive: true, force: true });
console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);

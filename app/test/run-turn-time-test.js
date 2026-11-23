// Nov 22 (Hermes Agent check): the time in the turn note is read once per turn. The note sits just before the latest
// message, so when the minute changed between two steps of one job, the engine read every step of the job again.
// Here the clock moves on every read; the two engine calls of one turn must still carry the same note.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Brain } from '../src/brain.js';

let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra && !ok ? ' -> ' + extra : ''}`); };

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bob-turn-time-'));
const dataDir = path.join(tmp, 'inn', 'bob'); fs.mkdirSync(dataDir, { recursive: true });
const brain = new Brain({ agentDir: tmp, innDir: path.join(tmp, 'inn'), dataDir, settingsFile: path.join(dataDir, 'settings.json'), readRoots: [], readOnlyRoots: [], userName: 'Sam', quickOnCpu: false, models: { bob: 'small:latest' }, engine: 'ollama', ollamaUrl: 'http://127.0.0.1:1' }, () => {});
clearInterval(brain.reminderTimer);
brain.ensureModel = async () => {}; brain.fitCtx = async () => 8192; brain.recall = async () => '';
let minute = 0;
brain.now = () => `Sunday, November 22, 2026, 9:${String(10 + minute++).padStart(2, '0')} p.m. (Test/Zone)`; // a new minute on every read
// The first reply makes up an observation, so the app sends it back once: two engine calls in one turn.
const script = [{ role: 'assistant', content: 'I was just observing a subtle loop in the file handle caching.' }, { role: 'assistant', content: 'All quiet here.' }];
const seen = [];
brain.engine = { chat: async ({ messages }) => { seen.push(messages); return script.shift() || { role: 'assistant', content: 'ok' }; } };
await brain.runOn([], "so what's good, bob?", () => {}, new AbortController().signal, [], null, 't1');

const noteOf = (msgs) => msgs.find((m) => m.role === 'system' && /^Current date and time for/.test(m.content))?.content || '';
const firstLine = (s) => s.split('\n')[0];
check('the turn made two engine calls', seen.length === 2, String(seen.length));
check('both calls carry the turn note', Boolean(noteOf(seen[0])) && Boolean(noteOf(seen[1])));
check('the clock moves on every read, and the time in the note stays the same for the whole turn', firstLine(noteOf(seen[0])) === firstLine(noteOf(seen[1])), `${firstLine(noteOf(seen[0]))} / ${firstLine(noteOf(seen[1]))}`);
check('the steady instructions are the same on both calls', seen[0][0].content === seen[1][0].content);
const at = (msgs) => msgs.findIndex((m) => m.role === 'system' && /^Current date and time for/.test(m.content));
check('everything up to and including the note is the same on both calls (the engine keeps its reading)', at(seen[0]) > 0 && JSON.stringify(seen[0].slice(0, at(seen[0]) + 1)) === JSON.stringify(seen[1].slice(0, at(seen[1]) + 1)));

fs.rmSync(tmp, { recursive: true, force: true });
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

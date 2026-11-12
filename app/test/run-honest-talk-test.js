// 1.5.11: Bob made up an observation in small talk ("I was just observing a subtle, inefficient loop in how the system
// manages its file handle caching") and quizzed the user on a deep systems question. Checks the catch, the real-state
// line, and the calmer drives wording.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Brain, claimsObservation, realState, OBSERVE_CORRECTION } from '../src/brain.js';
import { CORE } from '../src/persona.js';
import { DIALS, personalityPrompt } from '../public/personality.js';

let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra && !ok ? ' -> ' + extra : ''}`); };

const REPORTED = 'Nothing particularly groundbreaking. The CPU utilization is stable, which is always a good start.\n\nI was just observing a subtle, inefficient loop in how the system manages its file handle caching, and I figured it was an opportunity to do some quick scouting.';
check('the reported reply is caught', claimsObservation(REPORTED));
check('"CPU utilization is stable" on its own is caught (he has no CPU reading)', claimsObservation('The CPU utilization is stable.'));
for (const ok of ['I noticed you mentioned the art style.', 'Patches is asleep on the rack.', 'I can check your downloads folder if you like.', 'I think the loop in your code could be faster.', 'I checked that file earlier and it was fine.', 'Want me to tidy that up next?'])
  check(`not flagged: "${ok}"`, !claimsObservation(ok));

const line = realState({ model: 'gemma4:e4b', session: 'Normal', waiting: 2, cat: 'Patches', turn: 3, mem: { free: 8e9, total: 32e9 } });
check('the real-state line says the brain, session, queue, RAM and the cat', /gemma4:e4b/.test(line) && /Normal session/.test(line) && /2 more messages waiting/.test(line) && /24\.0 of 32\.0 GB/.test(line) && /Patches/.test(line), line);
check('off the cat turns, the real-state line leaves the cat out (#33)', !/Patches/.test(realState({ model: 'm', cat: 'Patches', turn: 3, withCat: false, mem: { free: 8e9, total: 32e9 } })));
check('the real-state line is short (under 70 tokens)', line.length / 3.8 < 70, String(line.length));

check('persona: no claims of noticing or checking without a tool', /Never say you did, noticed, checked or measured something unless a tool result shows it/.test(CORE));
check('persona: the drives paragraph is gone from the default voice; turned up, ambition is a plain offer about the user\'s work', !/drives|dreams of what you'd build/i.test(CORE) && /want me to tidy that up next\?/.test(personalityPrompt({ drive: 3 }, 'Sam')));
check('persona: no quizzing on technical topics', /never quiz \{\{USER\}\} on technical topics/.test(CORE));
const amb = DIALS.find((d) => d.id === 'drive');
check('Ambition at the middle adds nothing; high ends talk about the user\'s real projects, never invented ones', amb.lines[2] === '' && /never invented ones/.test(amb.lines[4]) && !/what you would love to build/.test(amb.lines.join(' ')));
check('Curiosity high ends ask easy questions about the user\'s own projects, never a quiz', /never a technical quiz/.test(personalityPrompt({ curiosity: 4 }, 'Sam')) && /easy, interested question/.test(personalityPrompt({ curiosity: 3 }, 'Sam')));

// In a real turn: the reply is flagged, the user sees the app's note, and Bob gets one go to answer from real things.
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bob-talk-'));
const dataDir = path.join(tmp, 'inn', 'bob'); fs.mkdirSync(dataDir, { recursive: true });
const brain = new Brain({ agentDir: tmp, innDir: path.join(tmp, 'inn'), dataDir, settingsFile: path.join(dataDir, 'settings.json'), readRoots: [], readOnlyRoots: [], userName: 'Sam', quickOnCpu: false, models: { bob: 'small:latest' }, engine: 'ollama', ollamaUrl: 'http://127.0.0.1:1' }, () => {});
clearInterval(brain.reminderTimer);
brain.ensureModel = async () => {}; brain.fitCtx = async () => 8192; brain.recall = async () => '';
const seen = []; const script = [{ role: 'assistant', content: REPORTED }, { role: 'assistant', content: 'All quiet. Patches is asleep on the rack. What are we working on?' }];
brain.engine = { chat: async ({ messages }) => { seen.push(messages); return script.shift() || { role: 'assistant', content: 'ok' }; } };
const events = [];
const msgs = [];
await brain.runOn(msgs, "so what's good, bob?", (e) => events.push(e), new AbortController().signal, [], null, 't1');
check('the made-up observation gets the app\'s correction note', events.some((e) => e.type === 'correction' && e.text === OBSERVE_CORRECTION));
check('Bob gets one more go, told to use only real things', seen.length === 2 && seen[1].some((m) => m.role === 'system' && /no tool ran this turn, so it was invented/.test(m.content)));
// Item 1 (Nov 11): the real-state line rides in the turn note before the latest message, so the steady instructions stay cached.
check('the prompt carries the real-state line (in the turn note)', /Right now \(real, from the app\): you're thinking on small:latest/.test(seen[0].filter((m) => m.role === 'system').map((m) => m.content).join('\n')));
check('the correction is kept with the reply (for reloads)', msgs.some((m) => m.correction === OBSERVE_CORRECTION));
fs.rmSync(tmp, { recursive: true, force: true });
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

// 1.5.79: "Remember only what fits" (memoryRecall, off): per-message memory recall and one memory bank per project.
import { brainText, publicText } from './source-text.js';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { parseMemory, pickMemories, activeProject, recallText, alwaysText, banks, tagLine, factText, lineKey, MemoryVectors, recallOn, RECALL_K } from '../src/recall.js';
import { Brain } from '../src/brain.js';
import { buildTools } from '../src/tools.js';
import { mergeSettings } from '../src/config.js';

let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra && !ok ? ' -> ' + extra : ''}`); };
const read = (f) => fs.readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');

const MEM = `# Bob's memory

- Likes dark themes (2026-11-01)
- Prefers short answers in the morning (2026-11-01)
- Starfall uses Unreal 5.6 with Nanite on (2026-11-02) [project: Starfall]
- Starfall's main character is a fox called Ember (2026-11-02) [topic: Characters] [project: Starfall]
- The phone app targets Android 14 (2026-11-02) [project: Phone App]
- Lives in a cold place, winters are long (2026-11-02)
- Always answer in Canadian English [always]
`;
const lines = parseMemory(MEM);
check('the heading is skipped; 7 memory lines', lines.length === 7, String(lines.length));
check('tags and dates are not part of what is matched', lines[3].text === "Starfall's main character is a fox called Ember" && lines[3].project === 'Starfall');
check('[always] is read', lines[6].always && !lines[0].always);
check('the same fact keys the same with or without tags', lineKey('- Likes dark themes (2026-11-01)') === lineKey('- Likes dark themes [project: X] (2026-12-01)'));

const cfg = { projects: { Starfall: '/p/starfall', 'Phone App': '/p/phone' }, defaultProject: '' };
let ap = activeProject(cfg, 'how do I set up nanite in starfall?', { bankNames: ['Starfall', 'Phone App'] });
check('a project named in the message picks its bank', ap.project === 'Starfall' && ap.why === 'named');
ap = activeProject(cfg, 'what about the lighting?', { sticky: 'Starfall' });
check('no name: the chat stays on its project', ap.project === 'Starfall' && ap.why === 'chat');
ap = activeProject(cfg, 'what about the lighting?', { topicProject: 'phone app' });
check('no name and no chat project: the closest topic\'s project', ap.project === 'Phone App' && ap.why === 'topic');
ap = activeProject({ ...cfg, defaultProject: 'Starfall' }, 'hello');
check('nothing else: the main project', ap.project === 'Starfall' && ap.why === 'main');
check('nothing at all: general only', activeProject({}, 'hello').project === '');
check('a word inside another word is not a project name', activeProject({ projects: { Art: '/a' } }, 'start the party').project === '');

let picked = pickMemories(lines, { text: 'what version of unreal does starfall use? nanite?', project: 'Starfall' });
check('words: the matching Starfall line is picked', picked.some((l) => /Unreal 5\.6/.test(l.text)), JSON.stringify(picked.map((l) => l.text)));
check('another project\'s bank is left out', !picked.some((l) => l.project === 'Phone App'));
check('[always] lines come every time', picked.some((l) => l.always));
check('lines that don\'t fit stay out', !picked.some((l) => /dark themes/.test(l.text)));
picked = pickMemories(lines, { text: 'android 14 target for the phone app', project: '' });
check('on no project, every bank can be matched', picked.some((l) => /Android 14/.test(l.text)));
picked = pickMemories(lines, { text: 'android 14 target for the phone app', project: 'Phone App' });
check('the phone bank when on that project', picked.some((l) => /Android 14/.test(l.text)) && !picked.some((l) => l.project === 'Starfall'));

// By meaning: tiny fake vectors.
const vecs = {}; lines.forEach((l, i) => { vecs[l.key] = Array.from({ length: 8 }, (_, j) => (j === i ? 1 : 0.01)); });
const q = Array.from({ length: 8 }, (_, j) => (j === 5 ? 1 : 0.01));
picked = pickMemories(lines, { text: 'is it chilly where I am?', qvec: q, vecs });
check('meaning: picks the line closest in meaning with no shared words', picked.some((l) => /cold place/.test(l.text)) && picked.filter((l) => !l.always).length === 1);

const many = parseMemory(Array.from({ length: 40 }, (_, i) => `- starfall fact number ${i} about levels`).join('\n'));
picked = pickMemories(many, { text: 'starfall levels', project: '' });
check(`never more than ${RECALL_K} lines`, picked.length === RECALL_K, String(picked.length));
const long = parseMemory(Array.from({ length: 8 }, (_, i) => `- starfall levels ${i} ${'x'.repeat(400)}`).join('\n'));
check('and never more than about 1,500 characters', pickMemories(long, { text: 'starfall levels' }).reduce((n, l) => n + l.text.length, 0) <= 1500);

const txt = recallText(pickMemories(lines, { text: 'nanite starfall unreal', project: 'Starfall' }).filter((l) => !l.always), { project: 'Starfall', user: 'Sam' });
check('the recalled block names the bank', /the Starfall memory bank/.test(txt) && /\[Starfall\]/.test(txt));
check('only [always] lines stay in the instructions', alwaysText(MEM) === '- Always answer in Canadian English');
const b = banks(cfg, MEM);
check('banks: general plus one per project, with counts', b.find((x) => x.name === '').lines === 4 && b.find((x) => x.name === 'Starfall').lines === 2 && b.find((x) => x.name === 'Phone App').lines === 1, JSON.stringify(b));
check('tagLine puts a fact in a bank', tagLine('Uses Lumen', 'Starfall') === 'Uses Lumen [project: Starfall]' && tagLine('Uses Lumen', '') === 'Uses Lumen');
check('factText strips bullet, tags and date', factText('- Uses Lumen (2026-11-04) [project: Starfall] [always]') === 'Uses Lumen');

// The setting: off unless turned on, and saved as a real true/false.
check('off unless turned on', !recallOn({}) && recallOn({ memoryRecall: true }) && !recallOn({ memoryRecall: 'yes' }));
const merged = mergeSettings({}, { memoryRecall: 'yes' });
check('the saved setting is cleaned to true/false', merged.memoryRecall === false, JSON.stringify(merged.memoryRecall));

// Brain: off = the whole memory file in the prompt, as before. On = only [always] lines; the rest per message.
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bob-recall-'));
const memoryFile = path.join(dir, 'bob-memory.md');
fs.writeFileSync(memoryFile, MEM);
const bcfg = { memoryFile, dataDir: dir, innDir: dir, projects: cfg.projects, userName: 'Sam', housekeeping: {} };
const fake = { cfg: bcfg };
check('off: memory() is the whole file, as before', Brain.prototype.memory.call(fake) === MEM);
bcfg.memoryRecall = true;
check('on: memory() keeps only [always] lines', Brain.prototype.memory.call(fake) === '- Always answer in Canadian English');
check('on, for a helper\'s job: [always] plus what fits the job', /Unreal 5\.6/.test(Brain.prototype.memory.call(fake, 'check the starfall unreal nanite settings')));
const brainLike = { cfg: bcfg, housekeeper: null };
let rec = await Brain.prototype.recallMemories.call(brainLike, 's1', 'set up nanite for starfall in unreal');
check('recallMemories: the fitting Starfall memory, by words', /Unreal 5\.6/.test(rec) && /Starfall memory bank/.test(rec), rec);
check('the chat remembers its project', brainLike.memProject.get('s1') === 'Starfall' && brainLike.lastRecall.project === 'Starfall' && brainLike.lastRecall.by === 'words');
rec = await Brain.prototype.recallMemories.call(brainLike, 's1', 'who is ember the fox?');
check('next message in the same chat stays in the Starfall bank', /Ember/.test(rec) && !/Android/.test(rec), rec);

// remember: the project field only while the setting is on; the fact lands in that bank.
const tcfg = { ...bcfg, memoryRecall: false, timeZone: 'America/Edmonton' };
const tools = buildTools(tcfg, {});
check('setting off: remember has no project field (no extra tokens)', !('project' in tools.remember.schema.function.parameters.properties));
tcfg.memoryRecall = true;
check('setting on: remember offers a project field naming the projects', /Starfall, Phone App/.test(tools.remember.schema.function.parameters.properties.project?.description || '') && tools.remember.schema.function.parameters.required.join() === 'fact');
const said = await tools.remember.run({ fact: 'Starfall ships in spring', project: 'Starfall' });
check('remember saves into the bank', /\[project: Starfall\]\n$/.test(fs.readFileSync(memoryFile, 'utf8')) && /Starfall memory bank/.test(said));
await tools.remember.run({ fact: 'Has a cat' });
check('a general fact stays general', /- Has a cat \(\d{4}-\d{2}-\d{2}\)\n$/.test(fs.readFileSync(memoryFile, 'utf8')));

// Vectors: filled while idle, dropped when their line goes, rebuilt for a new model.
const mv = new MemoryVectors(bcfg);
let calls = 0;
const embed = async (texts) => { calls++; return texts.map(() => [1, 0, 0]); };
let n = await mv.fill(parseMemory(MEM), embed, 'nomic-embed-text');
check('vectors: every line gets one', n === 7 && fs.existsSync(path.join(dir, 'memory-vectors.json')));
n = await mv.fill(parseMemory(MEM), embed, 'nomic-embed-text');
check('vectors: nothing new, nothing embedded', n === 0 && calls === 1);
n = await mv.fill(parseMemory(MEM).slice(0, 3), embed, 'nomic-embed-text');
check('vectors: removed lines lose theirs', Object.keys(mv.load('nomic-embed-text')).length === 3);
n = await new MemoryVectors(bcfg).fill(parseMemory(MEM), embed, 'other-embed');
check('vectors: a new embedding model starts fresh', n === 7);
check('vectors: no embedder (null) leaves things as they are', await new MemoryVectors({ dataDir: fs.mkdtempSync(path.join(os.tmpdir(), 'bob-recall2-')) }).fill(parseMemory(MEM), async () => null, 'x') === 0);

// Wiring checks.
const brain = brainText(), hk = read('src/housekeeping.js'), server = read('src/server.js'), cellar = publicText('cellar.js'), help = read('public/help-content.js');
check('recall() adds the memories that fit, only with the setting on', /if \(recall\) \{ const mem = await this\.recallMemories/.test(brain));
check('no embedding in the Gaming session', /!gaming\(this\.cfg\)/.test(brain) && /recallOn\(this\.cfg\) \|\| gaming\(this\.cfg\)/.test(hk));
check('housekeeping fills vectors while idle, even with housekeeping off', /if \(recallOn\(this\.cfg\) && \(force \|\| this\.idle\(\)\)/.test(hk) && hk.indexOf('fillMemoryVectors(); } catch') < hk.indexOf('if (!force && (!hk.enabled'));
check('facts from a project\'s topic go to its bank', /this\.addFacts\(g\.facts, g\.name, g\.project(?:, id)?\)/.test(hk));
check('settings: the switch, banks and Open Bob\'s memory file', /sswitch\('memoryRecall'/.test(cellar) && /Memory banks:/.test(cellar) && /data-openmemory/.test(cellar) && /memoryBanks: memoryBanksView\(\)/.test(server));
check('Help: section, glossary, FAQ and the setting', /id: 'memory-recall'/.test(help) && /<dt>Memory bank<\/dt>/.test(help) && /id: 'faq-memory-recall'/.test(help) && /set\('Remember only what fits', 'Off'/.test(help));
check('the phone can ask for the memories that fit (off: empty)', /p === '\/api\/memory\/recall'/.test(server) && /if \(!recallOn\(cfg\)\) return send\(res, 200, \{ on: false, text: '' \}\)/.test(server));
check('no database or extra service', !/postgres|sqlite|hindsight-api/i.test(read('src/recall.js')) && !/"(pg|sqlite3|better-sqlite3)"/.test(read('package.json')));

fs.rmSync(dir, { recursive: true, force: true });
console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);

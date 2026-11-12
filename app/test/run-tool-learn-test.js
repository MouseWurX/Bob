// "Let Bob learn from his tools" (Nov 11): tool notes, the scorecard, and "use me when" on tools Bob makes.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { recordCall, learnedLine, loadLearning, scorecard, forgetLearning, whatChanged, toolLearnOn } from '../src/tool-learn.js';
import { cleanSpec } from '../src/selftools.js';
import { mergeSettings } from '../src/config.js';

let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra && !ok ? ' -> ' + extra : ''}`); };
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bob-learn-'));
const cfg = { dataDir: path.join(tmp, 'bob'), userName: 'Sam' };

// Off by default: nothing is kept.
recordCall(cfg, 'read_file', { path: 'x' }, 'Error: no file', {});
check('off by default, nothing is kept', !toolLearnOn(cfg) && !fs.existsSync(path.join(cfg.dataDir, 'tool-learning.json')));

cfg.toolLearning = true;
const job = {};
recordCall(cfg, 'read_file', { path: 'notes.txt' }, 'Error: notes.txt is not a full file path.', job);
recordCall(cfg, 'read_file', { path: 'C:/Users/you/notes.txt' }, 'hello', job);
const t = loadLearning(cfg).tools.read_file;
check('a fail then a win counts one of each', t.wins === 1 && t.misses === 1, JSON.stringify(t));
check('the fix is kept as one line', t.notes.length === 1 && /not a full file path/.test(t.notes[0]) && /path C:\/Users\/you\/notes.txt/.test(t.notes[0]), t.notes[0]);
check('the line is on the tool next time', /Last time: .*was fixed by: path/.test(learnedLine(cfg, 'read_file')), learnedLine(cfg, 'read_file'));
check('notes are short', t.notes.every((n) => n.length <= 160));
check('a win with no fail before it adds no note', (recordCall(cfg, 'web_search', { query: 'a' }, 'results', {}), !loadLearning(cfg).tools.web_search.notes.length));
check('a job Sam said no to is not a miss', (recordCall(cfg, 'run_command', { cmd: 'x' }, 'Sam said no.', {}), !loadLearning(cfg).tools.run_command));
check('use_tools is not counted', (recordCall(cfg, 'use_tools', { group: 'x' }, 'Error: no', {}), !loadLearning(cfg).tools.use_tools));
check('what changed: names the input that changed', whatChanged({ a: 1, b: 2 }, { a: 1, b: 3 }) === 'b 3');
check('what changed: same call twice says so', /second try/.test(whatChanged({ a: 1 }, { a: 1 })));

// Scorecard: a tool that keeps failing says so, and a made tool offers to be made again.
for (let i = 0; i < 3; i++) recordCall(cfg, 'use_my_tool:csv_to_json', { name: 'csv_to_json' }, 'Error: csv_to_json failed: bad csv', {});
check('a tool that keeps failing says so and offers a fix', /often fails here \(3 of 3\).*offer to look into why/.test(learnedLine(cfg, 'use_my_tool:csv_to_json')));
check('a made tool that keeps failing offers to make it again', /make it again, better, with make_tool/.test(learnedLine(cfg, 'use_my_tool:csv_to_json', undefined, { made: true })));
check('two misses is not "keeps failing" yet', !/often fails/.test(learnedLine(cfg, 'read_file')));
const sc = scorecard(cfg);
check('the scorecard lists most misses first', sc[0].name === 'use_my_tool:csv_to_json' && sc[0].often === true, JSON.stringify(sc[0]));
check('switched off, nothing is added to tools', learnedLine({ ...cfg, toolLearning: false }, 'read_file') === '');
forgetLearning(cfg);
check('Forget what he learned wipes it', !scorecard(cfg).length);

// "Use me when" for tools Bob makes.
const { spec } = cleanSpec({ ...cfg, innDir: tmp, agentDir: tmp, readRoots: [], hands: {} }, { name: 'csv_to_json', what: 'Turns CSV text into JSON.', when: 'Use it when Sam gives a CSV and wants JSON', inputs: {}, test: { text: 'a,b' } });
check('a made tool keeps its "use me when" line, without a repeated "use it when"', spec.when === 'Sam gives a CSV and wants JSON', spec.when);
check('older tools without one still work', !('when' in cleanSpec({ ...cfg, innDir: tmp, agentDir: tmp, readRoots: [], hands: {} }, { name: 'abc_tool', what: 'Does a small thing.', inputs: {}, test: {} }).spec));

check('the setting is off unless it is really true', mergeSettings({}, { toolLearning: 'yes' }).toolLearning === false && mergeSettings({}, { toolLearning: true }).toolLearning === true);
const help = fs.readFileSync(new URL('../public/help-content.js', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
check('Help, FAQ and glossary cover it', /id: 'tool-learning'/.test(help) && /id: 'faq-tool-learning'/.test(help) && /<dt>Tool note<\/dt>/.test(help) && /<dt>Scorecard \(tools\)<\/dt>/.test(help));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

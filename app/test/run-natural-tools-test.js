// natural-tools.mjs (14 Nov, Bobert's interview: "design our tool shapes around what bobert or riker naturally look for"):
// reading the calls he invents, as JSON lines, Qwen's <tool_call> XML or the do() tool, and the per-tool table. No server.
import { parseCalls, callsOf, summarizeNatural, DO_TOOL, SYSTEM } from '../model-lab/natural-tools.mjs';

let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra ? ' ' + extra : ''}`); };

const j = parseCalls('Sure.\n{"name": "zip_folder", "arguments": {"source": "C:/logs", "dest": "logs.zip"}}\n{"name": "open_folder", "arguments": {}}');
check('JSON lines: names, args and key order', j.length === 2 && j[0].name === 'zip_folder' && j[0].keys.join(',') === 'source,dest' && j[0].form === 'json');
const x = parseCalls('<tool_call>\n<function=read_file>\n<parameter=path>\nC:/a.txt\n</parameter>\n</function>\n</tool_call>');
check('Qwen XML form', x.length === 1 && x[0].name === 'read_file' && x[0].args.path === 'C:/a.txt' && x[0].form === 'xml');
check('broken arguments are kept as broken', parseCalls('{"name": "x", "arguments": {"a": C:\\b}}')[0]?.form === 'broken');
check('plain text has no calls', parseCalls('Hi there!').length === 0);
const d = callsOf({ tool_calls: [{ function: { name: 'do', arguments: '{"action":"take_screenshot","details":{"window":"chrome"}}' } }] }, 'vague');
check('vague: the action is his tool name, details his keys', d[0].name === 'take_screenshot' && d[0].keys[0] === 'window' && d[0].form === 'do');
check('none mode reads text calls', callsOf({ content: '{"name":"web_search","arguments":{"q":"x"}}' }, 'none')[0].name === 'web_search');
check('the do tool and both prompts', DO_TOOL.function.name === 'do' && SYSTEM.none.includes('JSON') && SYSTEM.vague.includes('do'));
const s = summarizeNatural([
  { cond: 'none think-off', want: [{ name: 'file_hands' }], calls: [{ name: 'zip_folder', keys: ['source', 'dest'] }] },
  { cond: 'none think-off', want: [{ name: 'file_hands' }], calls: [{ name: 'zip_folder', keys: ['source'] }] },
  { cond: 'none think-off', want: [], calls: [] }
]);
const fh = s.per.find((e) => e.want === 'file_hands');
check('per wanted tool: his names and keys, most often first', fh.n === 2 && fh.names[0][0] === 'zip_folder' && fh.names[0][1] === 2 && fh.keys[0][0] === 'source' && fh.keys[0][1] === 2);
check('no-tool turns are counted', s.per.find((e) => e.want === '(no tool)').none === 1 && s.invented[0][0] === 'zip_folder');
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

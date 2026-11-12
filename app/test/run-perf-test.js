// 1.5.30: Now running's extra readings: Bob vs everything else, processor and card load, speed, context, graph.
// Readings must cost well under a tenth of a second and never get in a game's way.
import fs from 'node:fs';
import { replyStats, promptSplit, cpuLoad } from '../src/speed-stats.js';

let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra && !ok ? ' -> ' + extra : ''}`); };
const read = (f) => fs.readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');

const msgs = [{ role: 'system', content: 'x'.repeat(300) }, { role: 'user', content: 'y'.repeat(100) }];
check('the prompt splits by characters into instructions and chat', promptSplit(msgs) === 0.75);
const s = replyStats({ model: 'gemma4:26b', messages: msgs, promptTokens: 1000, outTokens: 50, tokPerSec: 51.234, ctx: 32768, now: 1 });
check('a reply: tokens a second, context used and the split', s.tokPerSec === 51.2 && s.used === 1050 && s.instructions === 750 && s.chat === 300 && s.ctx === 32768, JSON.stringify(s));
check('no numbers from the engine: nothing is made up', replyStats({ messages: msgs }) === null);
const cpus = (idle, busy) => [{ times: { user: busy, nice: 0, sys: 0, idle, irq: 0 } }];
const a = cpuLoad(null, cpus(100, 100));
check('processor load needs two readings', a.pct === null);
check('processor load is the busy share between readings', cpuLoad(a.snap, cpus(130, 170)).pct === 70);

const ollama = read('src/ollama.js'), llama = read('src/llamacpp.js'), server = read('src/server.js'), layout = read('public/layout.js'), brain = read('src/brain.js');
check('speeds come from the end-of-reply numbers the engines already send', /if \(ev\.done\) this\.lastStats = [^\n]*replyStats\(/.test(ollama) && /if \(ev\.timings\) this\.lastStats = [^\n]*replyStats\(/.test(llama) && /speed: this\.engine\.lastStats/.test(brain));
check('card load rides on the same nvidia-smi call (no extra program)', /memory\.used,memory\.total,utilization\.gpu/.test(server) && (server.match(/--query-gpu=/g) || []).length === 1);
check('the reading reports its own cost, for checking on a real PC', /out\.costMs = \{ wait:/.test(server) && /cardCheck: gpuCache\.ms/.test(server));
check('slower in the Gaming session, and only while Now running (or a panel holding Memory) is open', /brainSt\?\.session === 'Gaming' \? 15000 : 5000/.test(layout) && /if \(!seen\('memory', 'graph'\) \|\| document\.hidden\) return;/.test(layout));
check('each meter splits into Bob and everything else', /everything else \$\{a\}/.test(layout) && /split-card/.test(layout) && /split-ram/.test(layout));
check('a processor meter and a graph of the last 5 minutes (off until asked for, remembered)', /Processor · \$\{cpu\.loadPct\}% busy/.test(layout) && /hist\.length > 60/.test(layout) && /bob-now-graph/.test(layout) && /let lastGpu = null, showGraph = false, lastOk = 0;/.test(layout));
// The 1.5.26 slip: pollGpu() runs on load, so everything it touches must be declared before it can be called.
{
  // split on \r?\n: GitHub's Windows build checks files out with CRLF line ends, and . doesn't match \r.
  const lines = layout.split(/\r?\n/), at = lines.findIndex((l) => l.replace(/\/\/.*$/, '').includes('pollGpu()'));
  const firstCall = layout.split(/\n/).slice(0, at).join('\n').length;
  check('everything the readings use is declared before pollGpu() can first run', ['let lastGpu', 'lastOk = 0', 'const hist', 'let gpuAt', 'brainSt = null'].every((d) => layout.indexOf(d) > -1 && layout.indexOf(d) < firstCall));
}
check('stops while a full-screen game covers Bob, starts again when he is seen', /appendSwitch\('enable-features', 'CalculateNativeWinOcclusion'\)/.test(read('electron/main.cjs')) && /document\.addEventListener\('visibilitychange', pollGpu\)/.test(layout) && /out\.reads = \+\+gpuReads/.test(server));
check('design edits: context wording, words a second, graph time and axis, 32 px button, paused note', /· Bob's instructions and memory about \$\{about\(sp\.instructions\)\} · chat and files about \$\{about\(sp\.chat\)\}/.test(layout) && /tokens a second \(about \$\{/.test(layout) && /Last \$\{mins\} minutes/.test(layout) && /Graphics memory \(% of card\)/.test(layout) && /<span>100%<\/span><span>0<\/span>/.test(layout) && /\.mem-graph-btn \{[^}]*min-height: 32px/.test(read('public/style.css')) && /Paused while a game or another window is in front/.test(layout) && /forget the oldest parts of the chat/.test(read('public/help-content.js')));
check('what pollGpu() calls before its first await is hoisted (no "before initialization" on load)', /function pausedLine\(/.test(layout) && /function ago\(/.test(layout));
check('help explains the new readings', /everything else/.test(read('public/help-content.js')) && /tokens a second/.test(read('public/help-content.js')));
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

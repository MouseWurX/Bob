// Turbo: sharp start (Brain Engine 0122, src/engine-extras.js sinkEnv; off unless switched on, and only with Turbo):
// the switch, when the engine key is set, the room it adds, where it's set, and the Settings, Help, FAQ and glossary.
// Nothing reads the computer: the engine's --help is a fake string.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { mergeSettings } from '../src/config.js';
import { sinkEnv, helpHasSink, SINK_SPEC, SINK_TYPES, TURBO_MEMS } from '../src/engine-extras.js';
import { kvBytes } from '../src/model-ctx.js';
import { HELP } from '../public/help-content.js';

let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra && !ok ? ' -> ' + extra : ''}`); };
const here = path.dirname(fileURLToPath(import.meta.url));
const read = (f) => fs.readFileSync(path.join(here, '..', f), 'utf8').replace(/\r\n/g, '\n');

const all = { q3: true, q2: true, tiers: true, sink: true };
const on = { turbo: true, turboSink: true };
check('off in a fresh Bob', !sinkEnv({}, 'b', 131072, all).LLAMA_KV_SINK && !sinkEnv(mergeSettings({}, {}), 'b', 131072, all).LLAMA_KV_SINK);
check('only with Turbo on as well', !sinkEnv({ turboSink: true }, 'b', 131072, all).LLAMA_KV_SINK && !sinkEnv({ turbo: true }, 'b', 131072, all).LLAMA_KV_SINK);
check('the first 128 tokens at 16-bit', sinkEnv(on, 'b', 131072, all).LLAMA_KV_SINK === 'f16:128' && SINK_SPEC === 'f16:128');
check('only on an engine whose --help names it', !sinkEnv(on, 'b', 131072, { ...all, sink: false }).LLAMA_KV_SINK);
check('the engine\'s help is read for it', helpHasSink('Sharp start (Brain Engine 0122): env LLAMA_KV_SINK=type:tokens') && !helpHasSink('LLAMA_KV_TIERS=type:window') && !helpHasSink(null));
check('with every Turbo chat memory (all of them are 4-bit or tighter)', TURBO_MEMS.every((t) => SINK_TYPES.includes(t)) &&
  TURBO_MEMS.every((t) => sinkEnv({ ...on, turboMem: t }, 'b', 131072, all).LLAMA_KV_SINK === 'f16:128'));
check('a Turbo memory the engine lacks falls back to Smaller (4-bit), still with the sharp start',
  sinkEnv({ ...on, turboMem: 'smallest' }, 'b', 131072, { sink: true }).LLAMA_KV_SINK === 'f16:128');
check('not for a tiny context, nor with two chats at once (the engine would say NOT USED)', !sinkEnv(on, 'b', 512, all).LLAMA_KV_SINK &&
  !sinkEnv(on, 'b', 131072, { ...all, handArgs: ['-np', '2'] }).LLAMA_KV_SINK && sinkEnv(on, 'b', 131072, { ...all, handArgs: ['-np', '1'] }).LLAMA_KV_SINK === 'f16:128');
check('only true is kept when saved', mergeSettings({}, { turboSink: 'yes' }).turboSink === undefined && mergeSettings({}, { turboSink: true }).turboSink === true);
// the room: the sharp start's 128 tokens plus 2 spare slots, in whole 256s, at 16-bit (Qwen3.6-35B-A3B: 10,240 values a token, 5 MiB)
{ const shape = { perToken: 10240 }, args = ['-ctk', 'q3_0', '-ctv', 'q3_0'];
  const plain = kvBytes(shape, 131072, args), withSink = kvBytes(shape, 131072, args, 'sink:f16:128');
  check('the room counter adds 5 MiB for the sharp start on the default brain', withSink - plain === 256 * 10240 * 2, `${withSink - plain}`);
  const both = kvBytes(shape, 131072, args, 'q8_0:2048,sink:f16:128'), ring = kvBytes(shape, 131072, args, 'q8_0:2048');
  check('with a Progressive ring, both are counted', both - ring === 256 * 10240 * 2); }
{ const src = read('src/llamacpp.js');
  check('the engine start sets it, right after Progressive\'s steps', src.indexOf('sinkEnv(tc, model, ctx || this.lc.ctx') > src.indexOf('LLAMA_KV_TIERS) { env = { ...env, ...t }') &&
    src.indexOf('LLAMA_KV_TIERS) { env = { ...env, ...t }') > 0);
  check('the room counter and a resize in place see it (tiersFor)', /tiersFor\(model, ctx\) \{[\s\S]{0,300}sinkEnv\(/.test(src));
  check('the engine\'s --help is read for it', /sink = helpHasSink\(text\)/.test(src)); }
check('the engine has the patch', fs.existsSync(path.join(here, '..', 'engine', 'patches', '0122-kv-sink.patch')) && /LLAMA_KV_SINK/.test(read('engine/patches/0122-kv-sink.patch')));
check('Settings has the switch under Turbo', /sswitch\('turboSink'/.test(read('public/cellar-engines.js')) && /dataset\.set === 'turboSink'/.test(read('public/cellar.js')));
check('the settings page is told its state', /turboSink: cfg\.turboSink === true/.test(read('src/server.js')));
{ const all = HELP.map((h) => h.html).join('\n'), faq = HELP.find((h) => h.id === 'faq-sharp-start'), gl = HELP.find((h) => h.id === 'glossary')?.html || '';
  check('Help names the switch on screen', all.includes("'Turbo: sharp start'") || all.includes('Turbo: sharp start'));
  check('an FAQ in Bob\'s voice says what it is, that it changes the answer, and where it doesn\'t run', Boolean(faq) && /I also keep/.test(faq.html) && /changes a little/.test(faq.html) && /Android app/.test(faq.html) && /Mac/.test(faq.html));
  check('the FAQ credits llamAmpere and KVarN', Boolean(faq) && /llamAmpere/.test(faq.html) && /KVarN/.test(faq.html));
  check('a glossary entry', /<dt>Sharp start<\/dt>/.test(gl)); }

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

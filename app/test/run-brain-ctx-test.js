// 1.5.87: how much each brain keeps in mind, picked per brain : a switch, off to start
// with; each menu only lists sizes the model was made for; a pick wins for every copy on that brain (one load).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { choicesFor, pickedCtx, cleanBrainCtx, ctxGuide, bobsPick, ctxOn, SAFE_CTX, stretchOn, canStretch, stretchMax, stretchPlan, yarnArgs, kvBytes, needBytes, roomBytes, ctxLabel } from '../src/model-ctx.js';
import { LlamaCpp } from '../src/llamacpp.js';
import { ggufInfo } from '../src/gguf.js';
import { Brain } from '../src/brain.js';
import { HELP } from '../public/help-content.js';
import { publicText } from './source-text.js';

let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra && !ok ? ' -> ' + extra : ''}`); };

check('off to start with', !ctxOn({}) && !ctxOn({ brainCtxOn: 'yes' }) && ctxOn({ brainCtxOn: true }));
check('a 256K brain is offered 8K to 256K', JSON.stringify(choicesFor(262144)) === JSON.stringify([8192, 16384, 32768, 65536, 131072, 262144]));
check('a 128K brain is never offered 256K', !choicesFor(131072).includes(262144) && choicesFor(131072).at(-1) === 131072);
check('a 32K brain tops out at 32K', choicesFor(32768).at(-1) === 32768);
check('a limit that can\'t be read only offers what every brain handles', choicesFor(null).at(-1) === SAFE_CTX && SAFE_CTX === 32768);

const cfg = { brainCtxOn: true, brainCtx: { 'qwen3.6-35b-a3b': 131072, 'gemma4:26b': 999 } };
check('a pick is used when the switch is on', pickedCtx(cfg, 'qwen3.6-35b-a3b') === 131072);
check('...and ignored when it is off', pickedCtx({ ...cfg, brainCtxOn: false }, 'qwen3.6-35b-a3b') === null);
check('an odd size is never used', pickedCtx(cfg, 'gemma4:26b') === null);
check('a pick past the brain\'s own limit is never used', pickedCtx(cfg, 'qwen3.6-35b-a3b', 65536) === null);
check('settings keep only known sizes (and null to clear)', JSON.stringify(cleanBrainCtx({ a: 32768, b: 12345, c: null, d: '65536' })) === JSON.stringify({ a: 32768, c: null }));
check('settings refuse junk', JSON.stringify(cleanBrainCtx([1, 2])) === '{}' && JSON.stringify(cleanBrainCtx('x')) === '{}' && Object.keys(cleanBrainCtx({ ['x'.repeat(300)]: 32768 })).length === 0);
check('Bob\'s pick: Qwen3.6 256K, others the 32K chat size', bobsPick('qwen3.6-35b-a3b') === 262144 && bobsPick('gemma4:26b') === 32768);
check('the guideline says the limit and Bob\'s pick (settings text: Bob in the third person)', /Made for up to 256K\. Bob uses 256K/.test(ctxGuide(262144, 262144)) && /menu only goes up to 32K/.test(ctxGuide(null, 32768)) && !/\bI\b/.test(ctxGuide(262144, 262144)));
check('the Gaming brain\'s guideline says it stays small while you play', /Gaming session.*32K while you play/.test(ctxGuide(262144, 32768, { gaming: true })));

// The GGUF header carries the most a model was made for (<arch>.context_length).
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bob-ctx-'));
const file = path.join(dir, 'tiny.gguf');
const str = (s) => { const b = Buffer.from(s, 'utf8'); const n = Buffer.alloc(8); n.writeBigUInt64LE(BigInt(b.length)); return Buffer.concat([n, b]); };
const u32 = (v) => { const b = Buffer.alloc(4); b.writeUInt32LE(v); return b; };
const u64 = (v) => { const b = Buffer.alloc(8); b.writeBigUInt64LE(BigInt(v)); return b; };
fs.writeFileSync(file, Buffer.concat([Buffer.from('GGUF'), u32(3), u64(0), u64(2), str('general.architecture'), u32(8), str('qwen35moe'), str('qwen35moe.context_length'), u32(4), u32(262144)]));
check('reads the limit from the model file', ggufInfo(file)?.ctxTrain === 262144, JSON.stringify(ggufInfo(file)));
fs.rmSync(dir, { recursive: true, force: true });

// The load: a pick wins (for every copy on that brain), and nothing goes past the brain's limit.
const fit = (c, max) => Brain.prototype.fitCtx.bind({ cfg: c, engine: { maxCtx: async () => max } });
check('no pick: the size asked for, capped at the limit', (await fit({}, 131072)('m', 262144)) === 131072 && (await fit({}, null)('m', 65536)) === 65536);
check('a pick wins over the session size', (await fit({ brainCtxOn: true, brainCtx: { m: 65536 } }, 262144)('m', 32768)) === 65536);
check('...even when the session leaves it to the engine', (await fit({ brainCtxOn: true, brainCtx: { m: 65536 } }, 262144)('m', null)) === 65536);
check('a pick past the limit falls back to the usual size', (await fit({ brainCtxOn: true, brainCtx: { m: 262144 } }, 131072)('m', 32768)) === 32768);
check('Gaming: a big pick never grows the brain past the session size', (await fit({ session: 'light', brainCtxOn: true, brainCtx: { m: 262144 } }, 262144)('m', 32768)) === 32768 && (await fit({ session: 'light', brainCtxOn: true, brainCtx: { m: 16384 } }, 262144)('m', 32768)) === 16384);
check('switch off: picks are left alone', (await fit({ brainCtxOn: false, brainCtx: { m: 65536 } }, 262144)('m', 32768)) === 32768);

// Long memory (YaRN): Qwen3.6's guide, off to start with, only for 256K Qwen3.5/3.6 brains, only past 256K.
const q36 = { arch: 'qwen35moe', ctxTrain: 262144 };
check('long memory is off to start with', !stretchOn({}) && !stretchOn({ brainCtxStretch: 'yes' }) && stretchOn({ brainCtxStretch: true }));
check('only Qwen3.5/3.6 brains made for 256K can stretch', canStretch(q36) && canStretch({ arch: 'qwen35', ctxTrain: 262144 }) && !canStretch({ arch: 'gemma4', ctxTrain: 262144 }) && !canStretch({ arch: 'qwen35moe', ctxTrain: 131072 }) && !canStretch(null));
check('...to 4x at most (about 1M)', stretchMax(q36) === 1048576 && stretchMax({ arch: 'llama', ctxTrain: 8192 }) === null);
check('the stretch is the size over what it was made for (512K: 2, 1M: 4)', JSON.stringify(yarnArgs(524288, 262144)) === JSON.stringify(['--rope-scaling', 'yarn', '--rope-scale', '2', '--yarn-orig-ctx', '262144']) && yarnArgs(1048576, 262144)[3] === '4');
check('no stretch at or below what it was made for', yarnArgs(262144, 262144).length === 0 && yarnArgs(32768, 262144).length === 0 && yarnArgs(524288, null).length === 0);
check('the menu adds 512K and 1M only with a stretch', JSON.stringify(choicesFor(262144, { stretch: 1048576 }).slice(-3)) === JSON.stringify([262144, 524288, 1048576]) && !choicesFor(262144).includes(524288));
check('1M reads as 1M', ctxLabel(1048576) === '1M' && ctxLabel(524288) === '512K');
const scfg = { brainCtxOn: true, brainCtxStretch: true, brainCtx: { q: 524288, g: 1048576 } };
check('a stretched pick counts with long memory on and a brain that can take it', pickedCtx(scfg, 'q', 262144, { stretch: 1048576 }) === 524288);
check('...not with long memory off', pickedCtx({ ...scfg, brainCtxStretch: false }, 'q', 262144, { stretch: 1048576 }) === null);
check('...not on a brain that can\'t stretch', pickedCtx(scfg, 'g', 262144, { stretch: null }) === null);
check('settings keep the stretched sizes', JSON.stringify(cleanBrainCtx({ a: 524288, b: 1048576, c: 2097152 })) === JSON.stringify({ a: 524288, b: 1048576 }));

// The chat memory's cost, from the brain's shape. Qwen3.6 35B-A3B: 40 layers, every 4th keeps a memory, 2 heads of 256.
const shape = { layers: 40, memLayers: 10, perToken: 10 * 2 * (256 + 256) };
const gib = (b) => b / 1024 ** 3;
check('q8_0 chat memory: about 2.7 GiB per 256K on a Qwen3.6 brain', Math.abs(gib(kvBytes(shape, 262144, ['-ctk', 'q8_0', '-ctv', 'q8_0'])) - 2.656) < 0.01);
check('...and 4x that at 1M', Math.abs(kvBytes(shape, 1048576, ['-ctk', 'q8_0', '-ctv', 'q8_0']) / kvBytes(shape, 262144, ['-ctk', 'q8_0', '-ctv', 'q8_0']) - 4) < 1e-9);
check('f16 memory costs about twice q8_0', kvBytes(shape, 262144, ['-fa', 'on']) > 1.8 * kvBytes(shape, 262144, ['-ctk', 'q8_0', '-ctv', 'q8_0']));
check('an unknown shape gives no guess', kvBytes(null, 262144) === null && needBytes(1e9, null, 262144) === null);
const GB = 1024 ** 3;
const pc = roomBytes(32 * GB, 16 * GB);
check('the owner\'s PC (16 GB card, 32 GB RAM): a 21.7 GB brain fits at 1M, an 8 GB phone has no room for 512K', needBytes(21.7 * GB, shape, 1048576, ['-ctk', 'q8_0', '-ctv', 'q8_0']) <= pc && needBytes(3.3 * GB, shape, 524288, ['-ctk', 'q8_0', '-ctv', 'q8_0']) > roomBytes(8 * GB, 0));

// The header: the shape is read from the file, hybrid layers included.
{
  const d2 = fs.mkdtempSync(path.join(os.tmpdir(), 'bob-ctx-'));
  const f2 = path.join(d2, 'shape.gguf');
  const kvs = [[ 'general.architecture', 8, str('qwen35moe') ], [ 'qwen35moe.context_length', 4, u32(262144) ], [ 'qwen35moe.block_count', 4, u32(40) ], [ 'qwen35moe.attention.head_count_kv', 4, u32(2) ], [ 'qwen35moe.attention.key_length', 4, u32(256) ], [ 'qwen35moe.attention.value_length', 4, u32(256) ], [ 'qwen35moe.full_attention_interval', 4, u32(4) ]];
  fs.writeFileSync(f2, Buffer.concat([Buffer.from('GGUF'), u32(3), u64(0), u64(kvs.length), ...kvs.flatMap(([k, t, v]) => [str(k), u32(t), v])]));
  const info = ggufInfo(f2);
  check('reads the chat memory\'s shape from the file (10 of 40 layers keep one)', info?.shape?.memLayers === 10 && info.shape.perToken === shape.perToken, JSON.stringify(info?.shape));
  // Bob's engine: the stretch goes on the command line only with the switch on and a size past 256K.
  const eng = (c, ctx) => { const e = Object.create(LlamaCpp.prototype); e.cfg = { llamacpp: {}, ...c }; return e.stretchArgs(f2, ctx); };
  check('the engine stretches a Qwen3.6 brain to 512K with long memory on', eng({ brainCtxStretch: true }, 524288).join(' ') === '--rope-scaling yarn --rope-scale 2 --yarn-orig-ctx 262144');
  check('...never with it off, at 256K, or past 1M', eng({}, 524288).length === 0 && eng({ brainCtxStretch: true }, 262144).length === 0 && eng({ brainCtxStretch: true }, 2097152).length === 0);
  check('...and a stretch set by hand wins', eng({ brainCtxStretch: true, llamacpp: { args: ['--rope-scaling', 'linear'] } }, 524288).length === 0);
  fs.rmSync(d2, { recursive: true, force: true });
}

// The load: a stretched pick that won't fit loads at 256K instead.
const sfit = (c, fits) => Brain.prototype.fitCtx.bind({ cfg: c, log: () => {}, engine: { maxCtx: async () => 262144, stretchMax: async () => (c.brainCtxStretch ? 1048576 : null), roomFor: async () => ({ fits, needGB: 40, roomGB: 30 }) } });
check('a stretched pick that fits is used', (await sfit({ ...scfg }, true)('q', 32768)) === 524288);
check('...one that won\'t fit loads at 256K', (await sfit({ ...scfg }, false)('q', 32768)) === 262144);
check('...and a session size never stretches by itself', (await sfit({ brainCtxStretch: true }, true)('q', 1048576)) === 262144);

// Qwen3 and Qwen3 Coder (the owner's ask, 2026-11-09), from Qwen's own model cards.
const qwen3 = { arch: 'qwen3moe', ctxTrain: 40960, name: 'Qwen3 30B A3B' };
const coder = { arch: 'qwen3moe', ctxTrain: 262144, name: 'Qwen3 Coder 30B A3B Instruct' };
const q2507 = { arch: 'qwen3moe', ctxTrain: 262144, name: 'Qwen3 30B A3B Instruct 2507' };
check('Qwen3 (made for 32K, the file says 40,960) stretches from 32,768 to 128K', JSON.stringify(stretchPlan(qwen3)) === JSON.stringify({ native: 32768, most: 131072 }) && stretchPlan({ arch: 'qwen3', ctxTrain: 32768 })?.most === 131072);
check('Qwen3 Coder (256K) stretches to 1M', JSON.stringify(stretchPlan(coder)) === JSON.stringify({ native: 262144, most: 1048576 }));
check('...but the 256K Qwen3 2507 updates don\'t (they reach 1M another way), nor Qwen2.5 or Gemma', stretchPlan(q2507) === null && stretchPlan({ arch: 'qwen2', ctxTrain: 32768 }) === null && stretchPlan({ arch: 'gemma3', ctxTrain: 131072 }) === null);
check('a Qwen3 menu gets 64K and 128K, stretched', JSON.stringify(choicesFor(40960, { stretch: 131072 })) === JSON.stringify([8192, 16384, 32768, 65536, 131072]) && choicesFor(40960).at(-1) === 32768);
check('a stretched 64K pick counts for Qwen3 with long memory on, never with it off', pickedCtx({ brainCtxOn: true, brainCtxStretch: true, brainCtx: { q3: 65536 } }, 'q3', 40960, { stretch: 131072 }) === 65536 && pickedCtx({ brainCtxOn: true, brainCtx: { q3: 65536 } }, 'q3', 40960, { stretch: 131072 }) === null);
{
  const d3 = fs.mkdtempSync(path.join(os.tmpdir(), 'bob-ctx-'));
  const f3 = path.join(d3, 'q3.gguf');
  const kvs = [[ 'general.architecture', 8, str('qwen3moe') ], [ 'general.name', 8, str('Qwen3 30B A3B') ], [ 'qwen3moe.context_length', 4, u32(40960) ], [ 'qwen3moe.block_count', 4, u32(48) ], [ 'qwen3moe.attention.head_count_kv', 4, u32(4) ], [ 'qwen3moe.attention.key_length', 4, u32(128) ]];
  fs.writeFileSync(f3, Buffer.concat([Buffer.from('GGUF'), u32(3), u64(0), u64(kvs.length), ...kvs.flatMap(([k, t, v]) => [str(k), u32(t), v])]));
  const e = Object.create(LlamaCpp.prototype); e.cfg = { llamacpp: {}, brainCtxStretch: true };
  check('the engine stretches Qwen3 from 32,768 (not 40,960): 64K is 2x, 128K is 4x', e.stretchArgs(f3, 65536).join(' ') === '--rope-scaling yarn --rope-scale 2 --yarn-orig-ctx 32768' && e.stretchArgs(f3, 131072)[3] === '4');
  check('...and leaves Qwen3 alone at 32K', e.stretchArgs(f3, 32768).length === 0);
  check('every layer of a plain brain keeps a memory (no hybrid interval in the file)', ggufInfo(f3)?.shape?.memLayers === 48);
  fs.rmSync(d3, { recursive: true, force: true });
}

const ids = HELP.map((h) => h.id);
const brains = HELP.find((h) => h.id === 'settings-brains');
check('Help names the switch word for word', /Context size per brain/.test(brains.html));
check('the FAQ explains it in Bob\'s voice', ids.includes('faq-brain-ctx') && /\bI\b/.test(HELP.find((h) => h.id === 'faq-brain-ctx').html));
check('the glossary says Bob never goes past a brain\'s limit', /never ask a brain for more/.test(HELP.find((h) => h.id === 'glossary').html));
check('Help explains long memory in Bob\'s voice, with the catch', ids.includes('faq-long-memory') && /short chats get a little worse/i.test(HELP.find((h) => h.id === 'faq-long-memory').html) && /\bI\b/.test(HELP.find((h) => h.id === 'faq-long-memory').html));
check('Help names the long memory switch word for word', /Long memory: stretch Qwen context/.test(brains.html));
const cellar = publicText('cellar.js');
check('the switch in Settings uses the same words', cellar.includes('<strong>Context size per brain</strong>'));
check('the long memory switch in Settings uses the same words', cellar.includes('<strong>Long memory: stretch Qwen context</strong>'));
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

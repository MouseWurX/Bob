// 1.5.87: how much each brain keeps in mind, picked per brain (the owner's ask, 2026-11-04): a switch, off to start
// with; each menu only lists sizes the model was made for; a pick wins for every copy on that brain (one load).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { choicesFor, pickedCtx, cleanBrainCtx, ctxGuide, bobsPick, ctxOn, SAFE_CTX } from '../src/model-ctx.js';
import { ggufInfo } from '../src/gguf.js';
import { Brain } from '../src/brain.js';
import { HELP } from '../public/help-content.js';

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

const ids = HELP.map((h) => h.id);
const brains = HELP.find((h) => h.id === 'settings-brains');
check('Help names the switch word for word', /Pick how much each brain keeps in mind/.test(brains.html));
check('the FAQ explains it in Bob\'s voice', ids.includes('faq-brain-ctx') && /\bI\b/.test(HELP.find((h) => h.id === 'faq-brain-ctx').html));
check('the glossary says Bob never goes past a brain\'s limit', /never ask a brain for more/.test(HELP.find((h) => h.id === 'glossary').html));
const cellar = fs.readFileSync(new URL('../public/cellar.js', import.meta.url), 'utf8');
check('the switch in Settings uses the same words', cellar.includes('<strong>Pick how much each brain keeps in mind</strong>'));
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

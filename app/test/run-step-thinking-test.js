// 15 Nov 2026: think to plan and review, not on each step (src/step-thinking.js), and GPT-OSS's reasoning level
// (model-family.js thinkKwargs). Nothing here reads the real computer: plain objects in, plain objects out.
import fs from 'node:fs';
import { stepThink, stepThinkingOn, toolRanThisTurn } from '../src/step-thinking.js';
import { thinkKwargs, familyOf } from '../src/model-family.js';
import { HELP } from '../public/help-content.js';

let pass = 0, fail = 0;
const check = (name, ok) => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'} ${name}`); };
const read = (p) => fs.readFileSync(new URL(`../${p}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n');

// ---- when to think ----
check('on unless turned off', stepThinkingOn({}) && !stepThinkingOn({ stepThinking: false }));
check('planning (no tool has run) keeps the turn\'s thinking', stepThink({}, { think: undefined }) === undefined && stepThink({}, { think: 'high' }) === 'high');
check('a step after a tool result does not think', stepThink({}, { think: undefined, doing: true }) === false && stepThink({}, { think: 'high', doing: true }) === false);
check('the last round (reviewing, the answer) keeps the turn\'s thinking', stepThink({}, { think: 'high', doing: true, lastRound: true }) === 'high');
check('a thinking retry still thinks', stepThink({}, { think: undefined, doing: true, retryThinks: true }) === undefined);
check('a turn that does not think never starts thinking', stepThink({}, { think: false }) === false && stepThink({}, { think: false, lastRound: true }) === false);
check('turned off: every step keeps the turn\'s thinking', stepThink({ stepThinking: false }, { think: 'high', doing: true }) === 'high');
const msgs = [{ role: 'user' }, { role: 'tool' }, { role: 'user' }, { role: 'assistant' }];
check('a tool ran this turn is read from the turn\'s start only', toolRanThisTurn(msgs, 0) && !toolRanThisTurn(msgs, 2) && !toolRanThisTurn(null));

// ---- how to ask each family ----
check('GPT-OSS is told by name', familyOf('gpt-oss-120b-MXFP4') === 'gpt-oss');
check('GPT-OSS off = Reasoning: low (it ignores enable_thinking)', thinkKwargs('gpt-oss', false).chat_template_kwargs?.reasoning_effort === 'low' && !('enable_thinking' in thinkKwargs('gpt-oss', false).chat_template_kwargs));
check('GPT-OSS high = high, otherwise its own medium', thinkKwargs('gpt-oss', 'high').chat_template_kwargs?.reasoning_effort === 'high' && Object.keys(thinkKwargs('gpt-oss', undefined)).length === 0 && Object.keys(thinkKwargs('gpt-oss', true)).length === 0);
check('Qwen and the rest: off = enable_thinking false, else nothing sent', thinkKwargs('qwen3.5', false).chat_template_kwargs?.enable_thinking === false && Object.keys(thinkKwargs('qwen3.5', 'high')).length === 0 && thinkKwargs(null, false).chat_template_kwargs?.enable_thinking === false);
check('Bob\'s GPT-OSS template reads reasoning_effort (medium when nothing is sent)', /reasoning_effort = "medium"/.test(read('src/templates/gpt-oss.jinja')));

// ---- wired in ----
const run = read('src/brain-run-on.js');
check('the job loop asks step-thinking.js each step and every brain call uses it', /const thinkNow = stepThink\(this\.cfg/.test(run) && (run.match(/think: thinkNow/g) || []).length === 3 && !/tools, signal, cpu, think, ctx/.test(run));
check('the engine and rented brains ask the family how to think', /\.\.\.this\.thinkArgs\(model, think\)/.test(read('src/llamacpp.js')) && /thinkKwargs\(familyOf\(model\), think\)/.test(read('src/rental.js')));
check('the setting is saved, shown and explained', /'stepThinking'/.test(read('src/config.js')) && /stepThinking: cfg\.stepThinking !== false/.test(read('src/server.js')) && /sswitch\('stepThinking'/.test(read('public/cellar-pages.js')) && /dataset\.set === 'stepThinking'/.test(read('public/cellar.js')));
const faq = HELP.find((e) => e.id === 'faq-step-thinking'), gl = HELP.find((e) => e.id === 'glossary');
check('an FAQ in Bob\'s voice says why, what GPT-OSS gets, the devices and the switch', faq && /I think when I plan/.test(faq.html) && /Reasoning: low/.test(faq.html) && /Windows, Mac, Linux and a phone/.test(faq.html) && /Think to plan and review, not on each step/.test(faq.html));
check('the glossary explains it', /<dt>Thinking per step<\/dt>/.test(gl.html) && /thinking per step/.test(gl.words));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

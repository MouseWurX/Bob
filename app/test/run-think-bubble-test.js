// 1.5.210 (the owner, Nov 12): the thinking bubble above the answer, and the chat showing only the finished answer.
// Display only: the brain's messages stay as they were (only window fields are added), and nothing is added to what
// the brain is sent.
import { brainText, publicText } from './source-text.js';
import fs from 'node:fs';
import { pickAnswer } from '../src/clean-answer.js';
import { PUNS, took, doneLine, punAt } from '../public/think-bubble.js';

let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra ? ' ' + extra : ''}`); };
const read = (f) => fs.readFileSync(new URL('../' + f, import.meta.url), 'utf8').replace(/\r\n/g, '\n');

// ---- which message is the answer ----
{
  const pre = { role: 'assistant', content: 'Let me look that up.', tool_calls: [{ function: { name: 'web_search' } }] };
  const tool = { role: 'tool', tool_name: 'web_search', content: 'results' };
  const bad = { role: 'assistant', content: 'I opened the file and it says 42.', correction: 'No tool opened a file.' };
  const nudge = { role: 'system', content: 'nudge', hidden: true };
  const good = { role: 'assistant', content: 'The moon is about 3,474 km across.' };
  const added = [pre, tool, bad, nudge, good];
  const before = JSON.stringify(added.map((m) => ({ role: m.role, content: m.content })));
  const r = pickAnswer(added);
  check('the last plain reply is the answer', r.final === good && r.text === good.content);
  check('lines before a tool are steps', pre.step === true);
  check('a reply sent back and tried again is a step', bad.step === true);
  check('the answer is not a step', !good.step);
  check('tool results and system notes are left alone', !tool.step && !nudge.step);
  check('the brain\'s messages keep the same roles and words', JSON.stringify(added.map((m) => ({ role: m.role, content: m.content }))) === before);
}
{
  const draft = { role: 'assistant', content: 'Paris is the capital of Spain.' };
  const check1 = { role: 'assistant', content: 'Reviewer, second look: Needs fixes:\n- wrong country\nCorrected answer: Madrid is the capital of Spain, and Paris is the capital of France.', moot: 'check' };
  const minutes = { role: 'assistant', content: '🛰 Moot over: fixed one mistake.', moot: 'minutes' };
  const r = pickAnswer([draft, check1, minutes], [{ kind: 'check', verdict: 'fix', corrected: true }]);
  check('a kept corrected answer takes the draft\'s place', r.final === check1 && r.text.startsWith('Madrid is the capital'));
  check('it is shown as the corrected answer only', check1.showText === r.text && !/Needs fixes/.test(r.text));
  check('the draft and the minutes are steps', draft.step && minutes.step && !check1.step);
  check('the minutes come with it for the Checked note', /Moot over/.test(r.checked));
  const d2 = { role: 'assistant', content: 'Paris is the capital of France.' };
  const c2 = { role: 'assistant', content: 'Reviewer, second look: Looks right. It is.', moot: 'check' };
  const m2 = { role: 'assistant', content: 'Result: kept Bob\'s answer.', moot: 'minutes' };
  const r2 = pickAnswer([d2, c2, m2], [{ kind: 'check', verdict: 'ok', corrected: false }]);
  check('a check that found nothing keeps Bob\'s answer', r2.final === d2 && c2.step && m2.step);
  const d3 = { role: 'assistant', content: 'Paris is the capital of France.' };
  const c3 = { role: 'assistant', content: 'Reviewer: Needs fixes: x\nCorrected answer: about cheese', moot: 'check' };
  const r3 = pickAnswer([d3, c3], [{ kind: 'check', corrected: false, weak: 'copy' }]);
  check('a corrected answer that was set aside doesn\'t replace his', r3.final === d3);
}
{
  const r = pickAnswer([{ role: 'tool', content: 'x' }]);
  check('nothing said: no answer, nothing breaks', r.final === null && r.text === '');
  const pic = { role: 'assistant', content: '', media: [{ url: '/images/a.png' }] };
  check('a picture with no words is still the answer', pickAnswer([{ role: 'assistant', content: 'Painting it.', tool_calls: [{}] }, pic]).final === pic);
}

// ---- the bubble's own words ----
{
  check('a few Bob-ish lines to rotate through', PUNS.length >= 8 && PUNS[0] === 'Thinking…');
  check('the cat\'s name goes in', punAt(2, 'Patches').includes('Patches') && !punAt(2, '').includes('{cat}'));
  check('times read plainly', took(45000) === '45s' && took(130000) === '2m 10s' && took(3780000) === '1h 3m');
  check('the finished line', doneLine(130000, 7) === 'Worked for 2m 10s · 7 steps' && doneLine(4000, 0) === 'Thought for 4s' && doneLine(9000, 1, true) === 'Worked for 9s · 1 step · waited on you' && doneLine(0, 3) === 'Worked through 3 steps');
  check('the lines never name a real model', !PUNS.some((p) => /qwen|llama|gpt|riker|bobert/i.test(p)));
}

// ---- wiring ----
{
  const brain = brainText(), app = publicText('app.js'), bubble = read('public/think-bubble.js'), css = read('public/style.css');
  check('the run says which message is the answer', /const shown = pickAnswer\(msgs\.slice\(base\), mooted\?\.rounds\)/.test(brain) && /emit\(\{ type: 'final', text: shown\.text/.test(brain));
  check('"How I got here" and the answer id go on the answer, not a step', (brain.match(/!m\.tool_calls\?\.length && !m\.step\)/g) || []).length >= 2);
  check('history marks steps and shows a corrected answer', /m\.showText \|\| m\.content/.test(brain) && /m\.step \? \{ step: true \}/.test(brain));
  check('the engines send only role and content', /\{ role: m\.role, content: m\.content \|\| '' \}/.test(read('src/llamacpp.js')));
  check('Bob-Net leaves the window fields out', /step, showText, \.\.\.rest/.test(read('src/share-brains.js')));
  check('nothing new in the start prompt', !/think-bubble|thinkBubble|pickAnswer/.test(read('src/prompts.js') + (fs.existsSync(new URL('../src/system-prompt.js', import.meta.url)) ? read('src/system-prompt.js') : '')));
  check('the chat hands events to the bubble first', /if \(!elsewhere && thinkBubbles\.take\(ev\)\) \{ scrollDown\(\); return; \}/.test(app));
  check('a saved chat folds the steps above the answer', /m\.step && thinkOn/.test(app) && /thinkBubbles\.saved\(m\.bubble, m\.ms, ans\?\.steps\)/.test(app));
  check('the down arrow and its dots are still there', /toBottom\.classList\.toggle\('working', !toBottom\.hidden && busy\)/.test(app) && /\.to-bottom\.working \.tb-dots/.test(css));
  check('cards that need you stay in the chat', /case 'approval':[\s\S]{0,300}return false; \/\/ the card itself stays in the chat/.test(bubble));
  check('reduced motion: nothing moves', /prefers-reduced-motion: reduce\) \{ \.think \*/.test(css) && /still\(\) \? 'Thinking…'/.test(bubble));
  check('screen readers hear what it\'s doing', /aria-live="polite"/.test(bubble) && /aria-expanded/.test(bubble) && /Bob needs your OK/.test(bubble));
  check('retries that go another way take words back in the bubble', /case 'token-undo'/.test(bubble));
}

// ---- the switch ----
{
  const cellar = publicText('cellar.js'), server = read('src/server.js');
  check('Settings has the switch, on unless turned off', /sswitch\('thinkBubble', settings\.thinkBubble !== false, 'Thinking bubble'/.test(cellar));
  check('the server saves it and says it', /out\.thinkBubble = cfg\.thinkBubble !== false/.test(server) && /thinkBubble: cfg\.thinkBubble !== false/.test(server));
  check('saved settings read it as on unless false', /out\.thinkBubble = out\.thinkBubble !== false/.test(read('src/config.js')));
  const help = read('public/help-content.js');
  check('Help, FAQ and glossary', /id: 'think-bubble'/.test(help) && /id: 'faq-think-bubble'/.test(help) && /<dt>Thinking bubble<\/dt>/.test(help));
  check('the settings inventory lists it', /Thinking bubble/.test(read('docs/SETTINGS-INVENTORY.md')));
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);

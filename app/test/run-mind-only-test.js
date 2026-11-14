// 1.5.216 (the owner, Nov 13): "Open Bob's thinking" shows only the thinking, not all of Now running. Display only.
import fs from 'node:fs';

let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { if (ok) { pass++; console.log('PASS', name); } else { fail++; console.log('FAIL', name, extra); } };
const read = (f) => fs.readFileSync(new URL(`../${f}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const layout = read('public/layout.js'), panels = read('public/panels.js'), css = read('public/style.css'), html = read('public/index.html'), help = read('public/help-content.js'), app = read('public/app.js'), bubble = read('public/think-bubble.js');

check('the bubble\'s Open Bob\'s thinking goes through the 💭 button to showMind', /data-mind>Open Bob\\'s thinking/.test(bubble) && /openMind: \(\) => \$\('mindBtn'\)\?\.click\(\)/.test(app) && /if \(layout\.mindDocked\(\)\) return layout\.showMind\(\);/.test(app));
check('showMind opens Now running with only the thinking (and doesn\'t remember it as open)', /showMind\(\) \{[\s\S]{0,400}setRight\(false, false\); setMindOnly\(true\);/.test(layout));
check('a thinking module in a panel shows there instead (a collapsed panel opens)', /panels\.open\?\.\('mind'\)/.test(layout) && /if \(!panels\?\.visible\('mind'\)\)/.test(layout) && /function open\(id\)[\s\S]{0,300}'collapsed'\) save\(setState\(p, side, 'expanded'\)/.test(panels));
check('every other way of opening Now running shows it all', /function setRight\(hidden, remember = true\) \{\n    setMindOnly\(false\);/.test(layout));
check('the status line brings the rest back instead of closing', /\$\('foldRight'\)\.onclick = \(\) => setRight\(!mindOnly && !body\.classList\.contains\('right-hidden'\)\);/.test(layout));
check('the title says Bob\'s thinking while only it shows', /id="nowTitle">Now running</.test(html) && /t\.textContent = on \? 'Bob\\'s thinking' : 'Now running'/.test(layout));
check('the other sections, the panels row and the section\'s title line step aside', /body\.now-mind-only #panelRow,\nbody\.now-mind-only #nowSections > section:not\(\[data-sec="mind"\]\),\nbody\.now-mind-only #nowMind > \.now-sec \{ display: none; \}/.test(css));
check('Help, the glossary and the FAQ say so', /only my thinking in it, nothing else/.test(help) && /id: 'faq-mind-only'/.test(help) && /Opened from <strong>Open Bob's thinking<\/strong> it shows only my thinking/.test(help));

// 1.5.216: "How I got here" and the bubble's "Worked for" showed the same steps with different counts (the bubble
// counted every draft and note too). Now the bubble takes the turn's record and is the one view.
const tb = read('public/think-bubble.js');
check('one count: the record\'s length, else the rows that are steps (not drafts or notes)', /const stepCount = \(b\) => \(b\.trace \? b\.trace\.length : b\.rows\.filter\(\(r\) => r\.step\)\.length\);/.test(tb) && /const STEP_CLS = new Set\(\['tool', 'fix', 'wait'\]\)/.test(tb) && /doneLine\(ms, stepCount\(b\), b\.needed\)/.test(tb));
check('the record goes on the bubble live, not as a second list', /case 'steps':[^\n]*\n\s+if \(Array\.isArray\(ev\.list\) && ev\.list\.length\) trace\(b, ev\.list\);\n\s+return true;/.test(tb));
check('…and after a reload', /thinkBubbles\.saved\(m\.bubble, m\.ms, ans\?\.steps\)/.test(app) && /if \(m\.steps\?\.length && !m\.stepsShown\) markSteps/.test(app));
check('Copy the steps lives on the bubble', /data-copy-steps hidden>Copy the steps/.test(tb));

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);

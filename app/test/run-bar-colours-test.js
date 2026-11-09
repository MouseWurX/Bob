// 1.5.42: the Now running bars split into Bob (green, yellow or red for how quick he should be) and everything else (blue).
import fs from 'node:fs';
import { brainPlace, cardLevel, ramLevel, cpuLevel, cpuShare, quietBaseline } from '../public/mem-colours.js';

let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra && !ok ? ' -> ' + extra : ''}`); };
const read = (f) => fs.readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');
const st = (m) => ({ models: [{ chat: true, ...m }] });

const onCard = brainPlace(st({ gb: 6, ramGB: 0, onCard: true }));
const spill = brainPlace(st({ gb: 9, ramGB: 1, onCard: true }));
const bigSpill = brainPlace(st({ gb: 10, ramGB: 8, onCard: true }));
const cpu = brainPlace(st({ gb: 0, ramGB: 4, onCard: false }));
check('a brain all on the card: green on the card bar', cardLevel({ usedGB: 9, totalGB: 16 }, onCard).level === 'quick');
check('a little in RAM: yellow, and says why', cardLevel({ usedGB: 15, totalGB: 16 }, spill).level === 'slower' && /RAM/.test(cardLevel({ usedGB: 15, totalGB: 16 }, spill).why));
check('a lot in RAM: red on the card and RAM bars', cardLevel({ usedGB: 15, totalGB: 16 }, bigSpill).level === 'slow' && ramLevel({ usedGB: 20, totalGB: 32 }, bigSpill).level === 'slow');
check('card nearly full: yellow', cardLevel({ usedGB: 15.5, totalGB: 16 }, onCard).level === 'slower');
check('RAM nearly full: red (Windows uses the disk)', ramLevel({ usedGB: 31, totalGB: 32 }, onCard).level === 'slow' && /disk/.test(ramLevel({ usedGB: 31, totalGB: 32 }, onCard).why));
check('brain on the processor: yellow, red when the processor is flat out', cpuLevel(30, cpu).level === 'slower' && cpuLevel(95, cpu).level === 'slow');
check('brain on the card, quiet processor: green', cpuLevel(20, onCard).level === 'quick' && cardLevel({ usedGB: 2, totalGB: 16 }, null).level === 'quick');
check('nothing loaded: nothing slow', !brainPlace({ models: [] }) && ramLevel({ usedGB: 10, totalGB: 32 }, null).level === 'quick');
check('Bob\'s processor share: his app, measured', JSON.stringify(cpuShare({ loadPct: 20, appPct: 1.2 }, { working: false, place: onCard, baseline: 8 })) === '{"bob":1,"about":false}');
check('thinking on the processor: load above the quiet-time level, as "about"', JSON.stringify(cpuShare({ loadPct: 60, appPct: 1 }, { working: true, place: cpu, baseline: 8 })) === '{"bob":52,"about":true}');
check('quiet-time level is the middle of the quiet readings', quietBaseline([{ cpu: 5 }, { cpu: 9 }, { cpu: 7 }, { cpu: 80, working: true }]) === 7 && quietBaseline([]) === null);

const layout = read('public/layout.js'), css = read('public/style.css'), server = read('src/server.js'), help = read('public/help-content.js');
check('each bar has two parts, Bob and everything else', /<i class="m-bob"><\/i><i class="m-sys"/.test(layout) && /data-bar="\$\{split\}"/.test(layout) && /row\(cpu\.loadPct, 'split-cpu'\)/.test(layout));
check('blue for everything else; green, yellow, red for Bob', /\.m-sys \{ background: #4f8fdc; \}/.test(css) && /\.m-bob \{ background: #5cb85c; \}/.test(css) && /lvl-slower \{ background: #e3b53c; \}/.test(css) && /lvl-slow \{ background: #e0533f; \}/.test(css));
check('never colour alone: every bar says "Speed:" with the reason, and a fix for yellow and red', /`Speed: quick, \$\{lv\.why\}`/.test(layout) && /`Speed: \$\{LEVEL_WORD\[lv\.level\]\}, \$\{lv\.why\}\. \$\{lv\.fix/.test(layout));
check('every yellow and red reason has a one-line fix', [cardLevel({ usedGB: 15, totalGB: 16 }, spill), cardLevel({ usedGB: 15.5, totalGB: 16 }, onCard), ramLevel({ usedGB: 31, totalGB: 32 }, onCard), ramLevel({ usedGB: 28, totalGB: 32 }, onCard), cpuLevel(30, cpu), cpuLevel(95, cpu), cpuLevel(95, onCard)].every((l) => l.level !== 'quick' && /\.$/.test(l.fix || '')));
check('the two numbers add up to the headline (Bob never counts past what is in use)', /const bob = r1\(Math\.min\(b\[key\], m\.usedGB\)\), other = r1\(m\.usedGB - bob\)/.test(layout));
check('Bob\'s app processor share comes from Node\'s own counter', /process\.cpuUsage\(\)/.test(server) && /return \{ loadPct: pct, appPct \}/.test(server));
check('help explains the colours in Bob\'s voice', /My part comes first, <strong>green<\/strong> when I should be quick/.test(help) && /<strong>blue<\/strong> is everything else/.test(help) && /dotted line is what.s free/.test(help));
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

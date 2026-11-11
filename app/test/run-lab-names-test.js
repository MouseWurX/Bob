// 1.5.199 The Lab's proper names: Keep it simple shows plain words, Professional leads with the name people in the
// field use (quantization, abliteration, speculative decoding, ARC-style...), and Help and the glossary carry them.
// Reads only Bob's own files.
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { TECH, labName, setLabMode, nameNow } from '../public/lab-names.js';
import { HELP } from '../public/help-content.js';

let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra ? ' ' + extra : ''}`); };
const dir = (d) => fileURLToPath(new URL(`../${d}/`, import.meta.url));
const read = (f) => fs.readFileSync(f, 'utf8').replace(/\r\n/g, '\n');
const labSrc = ['public', 'src'].flatMap((d) => fs.readdirSync(dir(d)).filter((f) => /^lab.*\.js$/.test(f) && f !== 'lab-names.js').map((f) => read(dir(d) + f))).join('\n');
const help = (id) => HELP.find((e) => e.id === id)?.html || '';

// Every name is for a label the Lab really shows
const quoted = (k) => [k, k.replace(/'/g, "\\'")].some((x) => labSrc.includes(`'${x}`) || labSrc.includes(`>${x}<`) || labSrc.includes(`"${x}"`) || labSrc.includes(`>${x} (recommended)`) || labSrc.includes(`'${x} (recommended)'`));
const orphans = Object.keys(TECH).filter((k) => !quoted(k));
check('every proper name belongs to a label the Lab still shows', !orphans.length, orphans.join(' | '));

// Simple: as it was. Professional: proper name first, plain words in brackets, escaped.
check('Keep it simple shows the plain words only', labName('Cut experts', false) === 'Cut experts');
check('Professional leads with the proper name', labName('Cut experts', true) === 'MoE expert pruning <span class="lab-plain">(Cut experts)</span>');
check('a label with no proper name stays as it was, escaped', labName('Quick quiz <b>', true) === 'Quick quiz &lt;b&gt;');
check('"(recommended)" stays on the label and still finds the name', /^Coverage-based expert pruning <span class="lab-plain">\(Keep every skill covered \(recommended\)\)<\/span>$/.test(labName('Keep every skill covered (recommended)', true)));
check('quotes in a label are escaped', /Say &quot;I don&#39;t know&quot;/.test(labName('Say "I don\'t know"', true)));
let pro = false; setLabMode(() => pro);
check('the pages follow the Lab\'s switch', nameNow('Make it faster: Turbo') === 'Make it faster: Turbo' && ((pro = true), /^Speculative decoding /.test(nameNow('Make it faster: Turbo'))));
setLabMode(null);
check('no mode set means plain words', nameNow('Make it faster: Turbo') === 'Make it faster: Turbo');

// Honest names: a test of Bob's own written like a benchmark says "-style"
const benches = /\b(ARC|GSM8K|IFEval|HumanEval|BFCL|HellaSwag|WinoGrande|MMLU|XSTest|SQuAD)\b/;
const bare = Object.values(TECH).filter((v) => benches.test(v) && !/-style/.test(v));
check('a challenge named after a benchmark always says "-style"', !bare.length, bare.join(' | '));
check('the abliteration name is there, and nothing names a person or a tool of Bob\'s private notes', /Abliteration/.test(TECH['Take out the refusal habit']) && !/thoth/i.test(JSON.stringify(TECH)));

// Wired into the Lab's pages
const pub = (f) => read(dir('public') + f);
check('lab.js tells the names which mode the Lab is in', /setLabMode\(\(\) => view\?\.mode === 'pro'\)/.test(pub('lab.js')));
check('job cards, steps and challenges use the names', /<strong>\$\{nm\(j\.title\)\}<\/strong>/.test(pub('lab.js')) && /<strong>\$\{nm\(p\.title\)\}<\/strong>/.test(pub('lab.js')) && /<strong>\$\{nm\(label\)\}<\/strong>\$\{more\}/.test(pub('lab.js')));
check('Forge ways, mixing, Turbo, Longer, Teach it, Best answers, Smaller, Peek, senses, diffusion and Guard rails use them', [['lab-forge.js', 'nameNow(m.title)'], ['lab-home-ways.js', 'nameNow(w.label)'], ['lab-turbo.js', "nameNow('Make it faster: Turbo')"], ['lab-context.js', "nameNow('Cache squeeze')"], ['lab-teach.js', "nameNow('From its lessons')"], ['lab-best.js', "nameNow('Teach only these parts')"], ['lab-playground.js', "nameNow('How small can a brain get?')"], ['lab-peek.js', 'nameNow('], ['lab-senses.js', 'nameNow('], ['lab-diffusion.js', 'nameNow('], ['lab-guard.js', 'nameNow(']].every(([f, s]) => pub(f).includes(s)));
check('the switch line says Professional gives the proper names', /proper name/.test(pub('lab.js').match(/const MODE_NOTES = \{[\s\S]*?\n\};/)[0]));
check('the plain words after a name are styled', /\.lab-plain \{/.test(pub('style.css')));

// Help and glossary
check('Lab Help says what Professional names do, and what "-style" means', /<strong>Proper names\.<\/strong>/.test(help('lab')) && /-style/.test(help('lab')));
check('each Lab page names its method once', /expert pruning/.test(help('lab')) && /quantization/.test(help('lab')) && /importance matrix/.test(help('lab')) && /abliteration/.test(help('lab-forge')) && /SLERP/.test(help('lab-forge')) && /TIES-merging/.test(help('lab-forge')) && /speculative decoding/.test(help('lab-faster')) && /needle in a haystack/.test(help('lab-longer')) && /QLoRA/.test(help('lab-teach')) && /DPO/.test(help('lab-best')));
check('Challenges Help says which kind of test each one is', ['ARC-style', 'GSM8K-style', 'IFEval-style', 'HumanEval-style', 'BFCL-style', 'HellaSwag-style', 'WinoGrande-style', 'MMLU-style', 'XSTest-style', 'prompt injection'].every((w) => help('lab-challenges').includes(w)));
const g = help('glossary');
check('the glossary has the proper names', ['Benchmark names', 'Distillation', 'Expert pruning', 'Fine-tuning (SFT)', 'Importance matrix (imatrix)', 'KV cache', 'LoRA, QLoRA', 'Mixture of experts (MoE)', 'Model merging', 'Needle in a haystack', 'Perplexity (Surprise)', 'Temperature'].every((w) => g.includes(`<dt>${w}`)));
const terms = [...g.matchAll(/<dt>(.*?)<\/dt>/g)].map((m) => m[1].replace(/<[^>]+>/g, '').replace(/^[^A-Za-z0-9]+/, '').toLowerCase());
check('the glossary is A to Z', terms.every((t, i) => !i || terms[i - 1] <= t), terms.find((t, i) => i && terms[i - 1] > t));
check('no glossary word is there twice', new Set(terms).size === terms.length);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

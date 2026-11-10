// 1.5.64: the owner's rule: brains stay at Q4 or better, except on small cards (8 GB or less), where a squeezed
// (Q3) version is offered only when the full version wouldn't run well.
import fs from 'node:fs';
import { suit, pickFor, deviceFit, fullRunsHere } from '../public/fit.js';
import { brainDefaults } from '../src/sessions.js';
import { HELP } from '../public/help-content.js';

let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra && !ok ? ' -> ' + extra : ''}`); };
const cat = JSON.parse(fs.readFileSync(new URL('../catalog.json', import.meta.url)));
const models = cat.models;
const q3 = models.find((m) => m.id === 'qwen3.6-35b-a3b-q3');
const full = models.find((m) => m.id === q3?.squeezedOf);
const pc = (vramGB, ramGB = 32) => ({ vramGB, ramGB, freeGB: 500 });

check('the 8 GB card version exists and points at the full Qwen3.6', q3 && full && full.id === 'qwen3.6-35b-a3b' && q3.maxCardGB === 8);
const gguf = q3.files.find((f) => f.role === 'gguf');
check('it is a Q3 file pinned to an exact Hugging Face commit with a checksum', /\/resolve\/[0-9a-f]{40}\/.*Q3_K/.test(gguf.url) && /^[0-9a-f]{64}$/.test(gguf.sha256) && gguf.bytes > 1e10 && gguf.verify);
check('same commit as the full version, sharing its picture file', gguf.url.split('/resolve/')[1].slice(0, 40) === full.files[0].url.split('/resolve/')[1].slice(0, 40) && q3.files.find((f) => f.role === 'mmproj')?.saveAs === full.files.find((f) => f.role === 'mmproj')?.saveAs);
check('it is smaller than the full version', q3.sizeGB < full.sizeGB && q3.vramGB < full.vramGB);
check('every other brain stays at Q4 or better (1.5.169: or is an 8 GB card version of Bob\'s own)', models.filter((m) => m.jobs && m.files && m.id !== q3.id && !(m.madeByBob && m.squeezedOf && m.maxCardGB <= 8)).every((m) => m.files.filter((f) => f.role === 'gguf').every((f) => !/[-_]Q[1-3]_/i.test(f.url))));
check('every squeezed file is only for small cards', models.filter((m) => m.files?.some((f) => f.role === 'gguf' && /[-_]Q[1-3]_/i.test(f.url))).every((m) => m.maxCardGB && m.maxCardGB <= 8 && m.squeezedOf));

const s16 = suit(q3, pc(16));
check('16 GB card: the squeezed one is not for you, with a plain reason', s16.level === 'no' && /full version/.test(s16.why), JSON.stringify(s16));
check('8 GB card: it runs (slowly), the full one does not', suit(q3, pc(8)).level !== 'no' && suit(full, pc(8)).level === 'no');
check('the full version runs well on 16 GB, so the squeezed one sits out there', fullRunsHere(q3, models, pc(16)));
check('on 8 GB the full one wouldn\'t run well, so the squeezed one may take part', !fullRunsHere(q3, models, pc(8)));
check('16 GB pick for Coding is never the squeezed one', pickFor('tinker', models, pc(16))?.id !== q3.id);
const trialOff = models.map((m) => (m.id === q3.id ? { ...m, trial: false } : m));
check('once tested, on 16 GB it still never becomes a pick', ['tinker', 'bob', 'deep'].every((s) => pickFor(s, trialOff, pc(16))?.id !== q3.id));
check('New until tried on a real small card', q3.trial === true);
check('the catalogue says the 16 GB card uses the full version', deviceFit(q3).find((d) => d.id === 'big')?.word === 'Uses the full version');
check('it gets the Coding brain settings (128K, thinks at every effort)', JSON.stringify(brainDefaults(q3.id, 'tinker', 'low')) === JSON.stringify({ ctx: 131072 }));

const faq = HELP.find((h) => h.id === 'faq-squeezed-brain');
check('Help has the FAQ in Bob\'s voice', faq && /\bI\b/.test(faq.html) && /8 GB/.test(faq.html) && /Q3/.test(faq.html));
check('the glossary explains Q4 and Q3', /<dt>Squeezed version \(Q4, Q3\)<\/dt>/.test(HELP.find((h) => h.id === 'glossary').html));
check('the catalogue Help mentions the 8 GB card version', /8 GB card version/.test(HELP.find((h) => h.id === 'catalogue').html));
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

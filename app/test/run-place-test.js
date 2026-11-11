// Where a brain would live (public/place.js): made-up computers and the real catalogue, no hardware read.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { placeFor, quantOf, hasExperts, placeWord, sizeLine, PLACES } from '../public/place.js';

let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${ok ? '' : ' ' + extra}`); };
const here = path.dirname(fileURLToPath(import.meta.url));
const catalog = JSON.parse(fs.readFileSync(path.join(here, '..', 'catalog.json'), 'utf8').replace(/\r\n/g, '\n'));
const by = (id) => catalog.models.find((m) => m.id === id);
const pc = { vramGB: 16, ramGB: 32 }, laptop = { vramGB: 6, ramGB: 16 }, noCard = { vramGB: 0, ramGB: 16 }, mac = { vramGB: 24, ramGB: 32, unified: true };
const oss120 = { id: 'gpt-oss-120b', name: 'GPT-OSS 120B', sizeGB: 63.4, vramGB: 66, files: [{ role: 'gguf', url: 'https://huggingface.co/x/y/resolve/0/gpt-oss-120b-MXFP4.gguf' }] };

check('a brain that fits the card lives on the card', placeFor(by('riker-28b-q3'), pc).where === 'card');
{ const p = placeFor(by('bobert-35b'), pc); check('35Bob Bobert (21 GB) on a 16 GB card: on the card by the catalogue\'s own figure', p.where === 'card', JSON.stringify(p)); }
{ const p = placeFor(by('deepseek-r1-distill-llama-70b'), pc); check('a 42 GB brain without experts on 16 + 32: too big for home, and it says why', p.where === 'rent' && /every part/.test(p.why), JSON.stringify(p)); }
{ const p = placeFor(by('nemotron-3.5-bolt-74b'), pc); check('a 24 GB brain on a 16 GB card: card + memory, and the parts add up', p.where === 'memory' && Math.abs(p.cardGB + p.memGB - 23.8) < 0.11, JSON.stringify(p)); }
{ const p = placeFor(oss120, pc); check('GPT-OSS 120B on 16 + 32: card + memory + storage', p.where === 'storage' && p.storageGB > 0 && Math.abs(p.cardGB + p.memGB + p.storageGB - 63.4) < 0.11 && p.word === 'Card + memory + storage', JSON.stringify(p)); }
check('GPT-OSS 120B on a 6 GB laptop: not at home', placeFor(oss120, laptop).where === 'rent');
check('...unless another Bob lends a hand', placeFor(oss120, laptop, [{ name: 'npc', vramGB: 16, ramGB: 32 }]).where !== 'rent');
{ const p = placeFor(by('qwen3-4b'), noCard); check('no graphics card: a small brain runs in memory on the processor', p.where === 'memory' && p.word === 'In memory, on the processor', JSON.stringify(p)); }
{ const p = placeFor(by('riker-28b-q3'), mac); check('a Mac has one pool: it fits or it doesn\'t', p.where === 'card' && p.word === 'In memory', JSON.stringify(p)); }
check('every answer is one of the five', catalog.models.filter((m) => m.jobs).every((m) => PLACES.includes(placeFor(m, pc).where)));

check('quantization is read from the file name', quantOf(by('riker-28b-q3')) === 'Q3_K_M' && quantOf(by('bobert-35b')) === 'Q4_K_M' && quantOf(oss120) === 'MXFP4' && quantOf(by('gemma4-26b')) === 'Q4_0' && quantOf(by('qwen3.6-35b-a3b')) === 'Q4_K_XL', [quantOf(by('riker-28b-q3')), quantOf(by('gemma4-26b')), quantOf(by('qwen3.6-35b-a3b'))].join());
check('a brain that doesn\'t say gets no made-up quantization', quantOf({ files: [{ role: 'gguf', url: 'https://x/model.gguf' }] }) === '' && quantOf({}) === '');
check('the size line reads "63 GB · MXFP4"', /63.*GB · MXFP4/.test(sizeLine(oss120)), sizeLine(oss120));
check('brains made of experts are told from the rest', hasExperts(oss120) && hasExperts(by('qwen3.6-35b-a3b')) && hasExperts(by('riker-28b-q3')) && !hasExperts(by('deepseek-r1-distill-llama-70b')) && !hasExperts(by('qwen3-4b')) && hasExperts({ experts: true }) && !hasExperts({ experts: false, activeParams: 3 }));
check('the words for each answer', placeWord('help') === 'With another Bob\'s help' && placeWord('rent') === 'Too big for home');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

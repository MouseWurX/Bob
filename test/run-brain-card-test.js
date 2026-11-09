// 1.5.139: brain cards. A .bob.json file beside a GGUF (written by Bob's own workshop, or by hand) says what the brain
// is for; Bob files the brain under the card's jobs and family and shows its benchmark, but only for a card that names
// that file and its exact size. Run: node test/run-brain-card-test.js
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { readCard, cleanCard, cardPathOf, ownEntry, inspectOwn, benchLine, CARD_JOBS } from '../src/own-models.js';
import { catalogueHtml, FAMILIES } from '../public/catalogue.js';
import { pickFor } from '../public/fit.js';
import { HELP } from '../public/help-content.js';

let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra ? ' ' + extra : ''}`); };
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bob-card-'));
const gguf = path.join(dir, '28Bob.gguf'), mm = path.join(dir, '28Bob-mmproj.gguf');
fs.writeFileSync(gguf, Buffer.alloc(4096)); fs.writeFileSync(mm, Buffer.alloc(16));
const card = {
  card: 1, file: '28Bob.gguf', bytes: 4096, name: '28Bob Riker', nickname: 'Riker', family: 'Bob', madeByBob: true,
  jobs: ['bob', 'deep', 'tinker', 'eyes', 'gaming', 'nonsense'], mmproj: '28Bob-mmproj.gguf', params: 28, activeParams: 3, vramGB: 18, ctx: 262144,
  cutFrom: { name: 'Qwen3.6 35B-A3B', by: 'Alibaba', hf: 'Qwen/Qwen3.6-35B-A3B' }, expertsKept: '192 of 256', published: '2026-11-08', license: 'Apache 2.0',
  what: 'A quick coder and thinker that fits a 16 GB card.',
  benchmark: { date: '2026-11-08', report: 'https://github.com/MouseWurX/Bob/blob/main/docs/benchmarks/riker-v3.md', scores: { Coding: 81.2, Tools: 93 }, baseline: { name: 'Qwen3.6 35B-A3B', scores: { Coding: 84 } } }
};
fs.writeFileSync(cardPathOf(gguf), JSON.stringify(card));
const info = () => ({ name: 'qwen35moe', arch: 'qwen35moe', ctxTrain: 262144 });

check('the card sits beside the GGUF, same name ending .bob.json', cardPathOf('C:\\x\\28Bob.gguf') === 'C:\\x\\28Bob.bob.json' && cardPathOf('/a/b.GGUF') === '/a/b.bob.json');
const c = readCard(gguf);
check('a matching card is read', c && c.name === '28Bob Riker' && c.family === 'Bob' && c.madeByBob === true && c.vramGB === 18);
check('only real slot jobs count (Gaming and nonsense are dropped)', JSON.stringify(c.jobs) === JSON.stringify(['bob', 'deep', 'tinker', 'eyes']) && !CARD_JOBS.includes('gaming'));
check('its picture reader is a file in the same folder', c.mmproj === mm);
check('a card for another file, or another size, is ignored', !cleanCard({ ...card, file: 'other.gguf' }, gguf, 4096) && !cleanCard({ ...card, bytes: 4095 }, gguf, 4096) && !cleanCard({ ...card, card: 2 }, gguf, 4096) && !cleanCard({ ...card, bytes: '4096' }, gguf, 4096));
check('a card can\'t point outside the folder or inject markup', cleanCard({ ...card, mmproj: '../x.gguf' }, gguf, 4096).mmproj === '' && cleanCard({ ...card, mmproj: 'C:\\evil.gguf' }, gguf, 4096).mmproj === '' && !/</.test(cleanCard({ ...card, name: '<img src=x>Bob' }, gguf, 4096).name) && cleanCard({ ...card, benchmark: { ...card.benchmark, report: 'javascript:alert(1)' } }, gguf, 4096).benchmark.report === '');
check('at most eight scores, numbers only', Object.keys(cleanCard({ ...card, benchmark: { scores: Object.fromEntries([...Array(12)].map((_, i) => [`s${i}`, i + 1])) } }, gguf, 4096).benchmark.scores).length === 8 && !('x' in cleanCard({ ...card, benchmark: { scores: { x: 'lots', y: 5 } } }, gguf, 4096).benchmark.scores));
check('no card, or a broken one: no card', readCard(path.join(dir, 'none.gguf')) === null && (fs.writeFileSync(path.join(dir, 'bad.gguf'), 'x'), fs.writeFileSync(path.join(dir, 'bad.bob.json'), '{nope'), readCard(path.join(dir, 'bad.gguf')) === null));
check('the benchmark reads as one plain line with the baseline beside it', benchLine(c.benchmark) === 'Benchmarked November 8, 2026: Coding 81.2% (Qwen3.6 35B-A3B: 84%), Tools 93%.' && /\(the brain it was cut from: 84%\)/.test(benchLine({ ...c.benchmark, baseline: { scores: { Coding: 84 } } })));

const seen = inspectOwn(gguf, { info });
check('picking the file fills the Add form from the card: name, size, picture reader, what it files under', seen.name === '28Bob Riker' && seen.params === 28 && seen.mmproj === mm && seen.card?.family === 'Bob' && seen.card.jobs.includes('tinker') && seen.card.benchmarked === '2026-11-08');
const e = ownEntry({ id: 'own-28bob-riker', name: '28Bob Riker', gguf, mmproj: mm }, { info });
check('the brain files under the card\'s jobs and family, with its size and date', e.family === 'Bob' && JSON.stringify(e.jobs) === JSON.stringify(['bob', 'deep', 'tinker', 'eyes']) && e.vramGB === 18 && e.published === '2026-11-08' && e.own === true && e.card === true);
check('it says "Bob\'s own brain" only because the card says madeByBob', e.madeByBob === true && !ownEntry({ id: 'own-x', name: 'x', gguf, mmproj: mm }, { info, read: () => JSON.stringify({ ...card, madeByBob: false }) }).madeByBob);
check('without its picture reader added, it isn\'t offered for Seeing pictures', !ownEntry({ id: 'own-x', name: 'x', gguf }, { info }).jobs.includes('eyes'));
check('its i says what it is, what it was cut from, and the benchmark', /A quick coder and thinker/.test(e.what) && /Cut from Alibaba's Qwen3\.6 35B-A3B, keeping 192 of 256 experts\./.test(e.what) && /^Benchmarked November 8, 2026/.test(e.bench));
check('a card never makes it Bob\'s pick', ['bob', 'tinker', 'deep'].every((j) => pickFor(j, [{ ...e, status: { state: 'installed' } }], { vramGB: 24, ramGB: 64 }) === null));
const noCard = ownEntry({ id: 'own-y', name: 'y', gguf: path.join(dir, 'bad.gguf') }, { info: () => null, stat: () => ({ isFile: () => true, size: 1 }) });
check('without a card, nothing changes: Your own family, jobs from size', noCard.family === 'Your own' && !noCard.card && !noCard.madeByBob);
const html = catalogueHtml({ roles: { current: {}, options: { llm: [] } }, models: [{ ...e }], brains: {}, active: {}, vramGB: 24, ramGB: 64, freeGB: 500, platform: 'win32', showUnsuited: true });
check('the catalogue shows it under the Bob family, tagged Bob\'s own brain, with the benchmark in its tip', /data-fam="tinker:Bob"/.test(html) && /class="tag own-bob" tabindex="0"[^>]*>Bob&#39;s own brain|class="tag own-bob" tabindex="0"[^>]*>Bob's own brain/.test(html) && /Benchmarked November 8, 2026: Coding 81\.2%/.test(html) && /<a class="src-link bench-link" href="https:\/\/github\.com\/MouseWurX\/Bob\/blob\/main\/docs\/benchmarks\/riker-v3\.md"[^>]*>Full report<\/a>/.test(html) && /Its brain card says it was made for Bob/.test(html) && FAMILIES.Bob);
const form = catalogueHtml({ roles: { current: {}, options: { llm: [] } }, models: [], brains: {}, active: {}, vramGB: 24, platform: 'win32', ownForm: { file: gguf, name: seen.name, sizeGB: 0, params: 28, mmproj: mm, card: seen.card } });
check('the Add form says a brain card was found and what it files under', /Brain card found: it files under Brain, Deep thinking, Coding, Seeing pictures, in the Bob family, with its benchmark\./.test(form));
const faq = HELP.find((x) => x.id === 'faq-own-brain');
check('Help explains brain cards and that a stale card is ignored', /my built-in engine/.test(faq.html) && !/my own engine/.test(faq.html) && /brain card/.test(faq.html) && /\.bob\.json/.test(faq.html) && /exact size/.test(faq.html));
// 1.5.145: "or type its path" fills the form the same way as the file picker (card and picture reader included).
const cellarSrc = fs.readFileSync(new URL('../public/cellar.js', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const formLines = cellarSrc.split('\n').filter((l) => /ownForm = r\.error \?/.test(l));
check('a typed path brings its brain card and picture reader into the Add form, like the picker', formLines.length === 2 && formLines.every((l) => /mmproj: r\.mmproj \|\| ''/.test(l) && /card: r\.card \|\| null/.test(l)));
fs.rmSync(dir, { recursive: true, force: true });
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

// DSpark guesses for Inkling 2 (Nov 28, on by default with the owner's yes) and the thread cap (off by default): the guesser only from a file beside
// an Inkling 2 brain, the newer file only on an engine that loads it, and a guesser set by hand always wins.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { dsparkArgs, dsparkSidecar, DSPARK_FROM_BE, DSPARK_NEWER_FROM_BE, threadCap, rentalThreads } from '../src/engine-extras.js';
import { HELP } from '../public/help-content.js';

let pass = 0, fail = 0;
const check = (name, ok, why = '') => { if (ok) pass++; else fail++; console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${!ok && why ? ` (${why})` : ''}`); };
const app = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (f) => fs.readFileSync(path.join(app, f), 'utf8').replace(/\r\n/g, '\n');

// a fake models folder: no real files are read
const DIR = path.join(path.sep, 'models');
const BRAIN = path.join(DIR, 'Inkling-2-Mini-UD-Q4_K_M.gguf');
const OLD = 'dspark-Inkling-2-Mini-Q8_0_Old.gguf', NEW = 'dspark-Inkling-2-Mini-Q8_0.gguf';
const fakes = (names, arch = {}) => ({
  readdir: () => names,
  info: (f) => ({ arch: arch[path.basename(f)] ?? (/^dspark-/i.test(path.basename(f)) ? 'dflash' : /inkling/i.test(f) ? 'inkling2_loop' : 'qwen3moe') }),
});
const ON = { llamacpp: { dsparkGuesses: true } };
const both = fakes([path.basename(BRAIN), OLD, NEW]);

check('on by default (the owner, Nov 28), off with false', dsparkArgs({}, BRAIN, { be: 47, ...both }).length > 0 && dsparkArgs({ llamacpp: { dsparkGuesses: false } }, BRAIN, { be: 47, ...both }).length === 0);
check('on by default does nothing without the file beside the brain', dsparkArgs({}, BRAIN, { be: 47, ...fakes([path.basename(BRAIN)]) }).length === 0);
{ const a = dsparkArgs(ON, BRAIN, { be: 47, ...both });
  check('on: the older file, 3 guesses, sampled on the card', a[0] === '-md' && path.basename(a[1]) === OLD && a.join(' ').includes('--spec-type draft-dspark') && a.join(' ').includes('--spec-draft-n-max 3') && a.includes('-bs'), a.join(' ')); }
check('the newer file only from the engine that loads it', path.basename(dsparkSidecar(BRAIN, { be: DSPARK_NEWER_FROM_BE, ...both })) === NEW && path.basename(dsparkSidecar(BRAIN, { be: DSPARK_NEWER_FROM_BE - 1, ...both })) === OLD);
check('only the newer file and an older engine: nothing', dsparkSidecar(BRAIN, { be: 47, ...fakes([NEW]) }) === '');
check('an engine without DSpark (or not Brain Engine): nothing', dsparkSidecar(BRAIN, { be: DSPARK_FROM_BE - 1, ...both }) === '' && dsparkSidecar(BRAIN, { be: 0, ...both }) === '');
check('not on the processor-only brain', dsparkArgs(ON, BRAIN, { be: 47, cpu: true, ...both }).length === 0);
check('a guesser set by hand or per brain wins', dsparkArgs(ON, BRAIN, { be: 47, args: ['--spec-type', 'draft-mtp'], ...both }).length === 0 && dsparkArgs(ON, BRAIN, { be: 47, args: ['-md', 'x.gguf'], ...both }).length === 0);
check('not for another kind of brain', dsparkSidecar(path.join(DIR, 'Qwen3.6-35B.gguf'), { be: 47, ...fakes(['Qwen3.6-35B.gguf', OLD]) }) === '');
check('not for another Inkling (the abliterated one has no guesser of its own)', dsparkSidecar(path.join(DIR, 'Inkling-2-Mini-abliterated-UD-Q4_K_XL.gguf'), { be: 47, ...both }) === '');
check('a file named dspark that is not a guesser is skipped', dsparkSidecar(BRAIN, { be: 47, ...fakes([OLD], { [OLD]: 'llama' }) }) === '');
check('no folder: nothing, no throw', dsparkSidecar(BRAIN, { be: 47, readdir: () => { throw new Error('gone'); }, info: both.info }) === '');

// ---------- Thread cap ----------
check('thread cap: off by default', threadCap({}, { cpus: 256 }) === null && threadCap({ llamacpp: { threadCap: 'yes' } }, { cpus: 256 }) === null);
check('thread cap: on, 8 on a big processor', threadCap({ llamacpp: { threadCap: true } }, { cpus: 256 }) === 8);
check('thread cap: a number given', threadCap({ llamacpp: { threadCap: 12 } }, { cpus: 256 }) === 12);
check('thread cap: a home computer with 8 cores is left as it is', threadCap({ llamacpp: { threadCap: true } }, { cpus: 16 }) === null && threadCap({ llamacpp: { threadCap: true } }, { cpus: 8 }) === null);
check('with a container limit too, the smaller wins', rentalThreads({ llamacpp: { threadCap: true, containerThreads: true } }, { cpus: 256, limit: 4 }) === 4 && rentalThreads({ llamacpp: { threadCap: true, containerThreads: true } }, { cpus: 256, limit: 32 }) === 8);
check('neither on: llama.cpp\'s own count', rentalThreads({}, { cpus: 256, limit: 4 }) === null);

// ---------- Wiring ----------
const lc = read('src/llamacpp.js');
check('Bob adds DSpark before everyday MTP, never for the brain beside', /this\.role !== BESIDE\) \{ const ds = dsparkArgs\(this\.cfg, gguf/.test(lc) && lc.indexOf('dsparkArgs(this.cfg') < lc.indexOf('everydayTurboArgs(this.cfg'));
check('threads set by hand still win over the rental switches', /num\(lc\.threads, '-t'\)\.length \? num\(lc\.threads, '-t'\) : rentalThreads\(this\.cfg\)/.test(lc));
const ex = JSON.parse(read('config.example.json'));
check('the example config keeps DSpark on and the thread cap off', ex?.llamacpp?.dsparkGuesses !== false && ex?.llamacpp?.threadCap !== true);
const mj = read('src/models.js'), shop = read('public/cellar-shop.js');
check('an optional file never keeps a brain from counting as installed', /const must = \(entry\.files \|\| \[\]\)\.filter\(\(f\) => !f\.optional\)/.test(mj) && /extrasMissing/.test(mj));
check('Get models offers the guesser on its own for an installed brain', /extrasMissing \|\| \[\]\)\.includes\('dspark'\)/.test(shop) && /Get the DSpark guesser/.test(shop));

const cat = JSON.parse(read('catalog.json'));
const ink = cat.models.find((m) => m.id === 'inkling-2-mini'), gf = ink?.files?.find((f) => f.role === 'dspark');
check('the catalog brings the older guesser with Inkling 2 Mini, optional, pinned', !!gf && gf.optional === true && /\/resolve\/[0-9a-f]{40}\/dspark-Inkling-2-Mini-Q8_0_Old\.gguf$/.test(gf.url) && gf.bytes === 402278560 && /^[0-9a-f]{64}$/.test(gf.sha256));
check('it is saved under a name the guesser search finds', /^dspark-inkling-2-mini.*_old\.gguf$/i.test(path.basename(gf?.saveAs || gf?.url || '')));
// ---------- Help, glossary, FAQ ----------
const page = HELP.find((h) => h.id === 'dspark-guesses'), faq = HELP.find((h) => h.id === 'faq-dspark-guesses'), gl = HELP.find((h) => h.id === 'glossary');
check('Help page in Bob\'s voice, naming the defaults and the platforms', !!page && /my engine/.test(page.html) && /on by default/.test(page.html) && /off by default/.test(page.html) && ['Windows', 'Mac', 'Linux', 'Android'].every((w) => page.html.includes(w)));
check('Help names the config keys and the file', ['"dsparkGuesses": false', '"threadCap": true', 'dspark-Inkling-2-Mini-Q8_0_Old.gguf'].every((t) => page.html.includes(t)));
check('Help says the speed at home is unproven', /unproven in our lab, as we have yet to test/.test(page?.html || ''));
check('an FAQ', !!faq && faq.group === 'FAQ');
check('glossary entries', /<dt>DSpark guesses<\/dt>/.test(gl?.html || '') && /<dt>Thread cap<\/dt>/.test(gl?.html || ''));

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);

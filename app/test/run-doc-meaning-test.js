// Search my documents by meaning (doc-index.js): the pieces, the squeezed numbers, filling and searching the index
// with a made-up embedding model, find_in_documents' "Close in meaning" list, the switch, Help, glossary and FAQ.
// Everything runs in a temporary folder with made-up files; no real embedding model is started.
import { brainText, publicText } from './source-text.js';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pieces, squeeze, unsqueeze, alike, DocIndex, docMeaningOn, queryVector, INDEX } from '../src/doc-index.js';
import { findDocsTool, walkFiles, readWords } from '../src/my-docs.js';
import { mergeSettings, SETTING_KEYS } from '../src/config.js';
import { settingsNow } from '../src/self-help.js';
import { WANTS, WANTS_SOON } from '../public/wants.js';
import { HELP } from '../public/help-content.js';

let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra && !ok ? ' -> ' + extra : ''}`); };
const here = path.dirname(fileURLToPath(import.meta.url));
const read = (f) => fs.readFileSync(path.join(here, '..', f), 'utf8').replace(/\r\n/g, '\n');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bob-meaning-'));
const agentDir = path.join(tmp, 'Agent'), innDir = path.join(agentDir, 'inn'), dataDir = path.join(innDir, 'bob');
const docs = path.join(tmp, 'Documents'), other = path.join(tmp, 'Other');
for (const d of [dataDir, docs, path.join(docs, 'Taxes'), other]) fs.mkdirSync(d, { recursive: true });
const cfg = { agentDir, innDir, dataDir, settingsFile: path.join(dataDir, 'settings.json'), readRoots: [innDir, docs], readOnlyRoots: [], userName: 'Sam', docTools: true, docMeaning: true };

// A made-up embedding model: each number counts the words of one idea, so "rent going up" and
// "monthly payment will increase" point the same way without sharing a word.
const IDEAS = [['rent', 'payment', 'monthly', 'lease', 'landlord', 'increase', 'going', 'up'], ['cat', 'dog', 'pet', 'pets', 'animal'], ['tax', 'taxes', 'refund', 'income'], ['recipe', 'flour', 'bake', 'oven']];
const vecOf = (t) => IDEAS.map((ws) => String(t).toLowerCase().replace(/^search_(query|document): /, '').split(/\W+/).filter((w) => ws.includes(w)).length + 0.01);
let calls = 0, sent = [];
const embed = async (texts) => { calls++; sent.push(...texts); return texts.map(vecOf); };

// ---------- the parts ----------
check('off unless both switches are on', !docMeaningOn({}) && !docMeaningOn({ docMeaning: true }) && !docMeaningOn({ docTools: true }) && docMeaningOn({ docTools: true, docMeaning: true }) && !docMeaningOn({ docTools: true, docMeaning: 'yes' }));
check('only true turns it on when saved', mergeSettings({}, { docMeaning: 'true' }).docMeaning === false && mergeSettings({}, { docMeaning: true }).docMeaning === true);
check('the setting is saved with the others', SETTING_KEYS.includes('docMeaning'));

const long = Array.from({ length: 400 }, (_, i) => `word${i}`).join(' ');
const ps = pieces(long);
check('pieces cover the whole text', ps.length > 1 && ps[0].at === 0 && ps.at(-1).at + ps.at(-1).len === long.length);
check('pieces overlap a little and fit the size', ps.every((p, i) => p.len <= INDEX.piece && (!i || p.at < ps[i - 1].at + ps[i - 1].len)));
check('pieces end on a space', ps.slice(0, -1).every((p) => long[p.at + p.len] === ' '));
check('pieces: nothing for empty text, and a cap per file', !pieces('').length && !pieces('   ').length && pieces('a '.repeat(100000)).length === INDEX.piecesPerFile);
check('pieces: a short text is one piece', pieces('The landlord says the rent goes up.').length === 1);
const v = [3, -4, 0];
check('squeezed numbers keep the direction', Math.abs(alike([3, -4, 0], unsqueeze(squeeze(v))) - 1) < 0.01 && Math.abs(alike([4, 3, 0], unsqueeze(squeeze(v)))) < 0.01);
check('squeezed numbers take one byte each', unsqueeze(squeeze(new Array(768).fill(0.1))).length === 768);

// ---------- made-up documents ----------
const lease = path.join(docs, 'Lease.txt'), cats = path.join(docs, 'Cats.md'), tax = path.join(docs, 'Taxes', 'Return.txt'), keyFile = path.join(docs, 'id_rsa');
fs.writeFileSync(lease, 'From March the monthly payment will increase by 50. Signed, the landlord.');
fs.writeFileSync(cats, 'My cat and my dog get along. Every pet needs a vet.');
fs.writeFileSync(tax, 'The income tax refund came back this spring.');
fs.writeFileSync(keyFile, 'rent rent rent payment lease'); // a secret file: never read
fs.writeFileSync(path.join(other, 'Elsewhere.txt'), 'rent payment lease landlord'); // outside the folders Bob may read
fs.writeFileSync(path.join(innDir, 'bob-note.txt'), 'rent payment landlord'); // Bob's own folder: not "your documents"

const w = [];
await walkFiles(cfg, [docs], ['txt', 'md'], (f) => { w.push(path.basename(f)); });
check('the walk finds the documents, not secret files', w.includes('Lease.txt') && w.includes('Return.txt') && !w.includes('id_rsa'), w.join(','));
check('readWords reads text files', readWords(lease, fs.statSync(lease)).includes('monthly payment'));

const idx = new DocIndex(cfg);
let r = await idx.fill([docs], embed, 'nomic-embed-text');
check('fill: each document read once', r.added === 3 && r.left === 0, JSON.stringify(r));
check('fill: nomic gets its "search_document:" opening', sent.every((t) => t.startsWith('search_document: ')));
check('fill: secret files never sent', !sent.some((t) => t.includes('rent rent rent')));
const onDisk = fs.readFileSync(path.join(dataDir, 'doc-index.json'), 'utf8');
check('the index is on disk in Bob\'s own folder', JSON.parse(onDisk).model === 'nomic-embed-text');
check('the index holds no words from the documents', !/landlord|monthly|refund|vet/.test(onDisk));
check('view counts the documents', idx.view().files === 3 && idx.view().pieces === 3 && idx.view().lastFull > 0);

calls = 0;
r = await idx.fill([docs], embed, 'nomic-embed-text');
check('fill again: nothing new, nothing embedded', r.added === 0 && calls === 0);
fs.writeFileSync(cats, 'Bake at 200 in the oven: flour, sugar, a recipe from Gran. Much longer now.');
fs.rmSync(tax);
r = await idx.fill([docs], embed, 'nomic-embed-text');
check('fill: a changed file is done again, a gone one dropped', r.added === 1 && r.dropped === 1 && calls === 1, JSON.stringify(r));

const q = vecOf('search_query: the letter about my rent going up');
const found = idx.search(q, { roots: [docs] });
check('search finds the lease by meaning, without the words', found[0]?.file === lease && found[0].score > 0.9, JSON.stringify(found));
check('search leaves out what means something else', !found.some((h) => h.file === cats));
check('search only gives files Bob may still read', idx.search(q, { roots: [other] }).length === 0);
const before = idx.view().files;
const idx2 = new DocIndex({ ...cfg, readRoots: [innDir] });
check('a folder taken off the read list is not searched', idx2.search(q).length === 0 && before === 2);
check('a new embedding model starts the index again', new DocIndex(cfg).load('other-model').files && Object.keys(new DocIndex(cfg).load('other-model').files).length === 0);

// Without a model: nothing is lost and it says so.
const idx3 = new DocIndex({ ...cfg, dataDir: path.join(tmp, 'd3') });
r = await idx3.fill([docs], async () => null, 'nomic-embed-text');
check('fill without a model stops and says so', r.noModel === true && r.added === 0 && !fs.existsSync(path.join(tmp, 'd3', 'doc-index.json')));

// Forgotten while filling: the file isn't written back.
const idx4 = new DocIndex({ ...cfg, dataDir: path.join(tmp, 'd4') });
const p4 = idx4.fill([docs], async (t) => { idx4.clear(); return t.map(vecOf); }, 'nomic-embed-text');
await p4;
check('forgetting during a fill leaves no file behind', !fs.existsSync(path.join(tmp, 'd4', 'doc-index.json')));

// The question's numbers.
const hkFake = { embed: async (t) => { sent = t; return t.map(vecOf); } };
const qv = await queryVector(hkFake, 'rent going up', 'nomic-embed-text');
check('a question gets "search_query:" for nomic', sent[0] === 'search_query: rent going up' && Array.isArray(qv));
check('no model: no numbers', (await queryVector({ embed: async () => null }, 'x', 'm')) === null && (await queryVector(null, 'x', 'm')) === null);

idx.clear();
check('clear deletes the index file', !fs.existsSync(path.join(dataDir, 'doc-index.json')) && idx.view().files === 0);

// ---------- find_in_documents ----------
await new DocIndex(cfg).fill([docs], embed, 'nomic-embed-text');
const keeper = { docsByMeaning: async (words, roots) => { const i = new DocIndex(cfg); return i.search(vecOf(`search_query: ${words}`), { roots: roots || [docs] }); } };
const tool = findDocsTool(cfg, { keeper: () => keeper });
let out = await tool.run({ words: 'rent going up' });
check('the tool lists the lease under Close in meaning', /Nothing has all of "rent going up"/.test(out) && /Close in meaning/.test(out) && out.includes(lease) && /% alike/.test(out), out);
check('the snippet is read from the file', out.includes('monthly payment will increase'));
out = await tool.run({ words: 'landlord' });
check('a word find isn\'t listed twice', out.split(lease).length === 2, out);
out = await tool.run({ words: 'rent going up', kind: 'documents' });
check('kind documents leaves text files out of the meaning list too', !/Close in meaning/.test(out), out);
const offTool = findDocsTool({ ...cfg, docMeaning: false }, { keeper: () => { throw new Error('asked'); } });
out = await offTool.run({ words: 'rent going up' });
check('meaning search off: words only, the index never asked', !/Close in meaning|isn't ready/.test(out), out);
const emptyTool = findDocsTool(cfg, { keeper: () => ({ docsByMeaning: async () => null }) });
out = await emptyTool.run({ words: 'rent going up' });
check('not ready: says so in one line and matches words', /Meaning search isn't ready/.test(out), out);
const oldTool = findDocsTool(cfg);
out = await oldTool.run({ words: 'landlord' });
check('without a housekeeper it still searches words', out.includes(lease));
check('the tool says it can find by meaning', /meaning search on/.test(tool.schema.function.description));

// ---------- the housekeeper and the settings ----------
const hk = read('src/housekeeping.js');
check('the index is filled while idle, never in the Gaming session', /docMeaningOn\(this\.cfg\) && \(force \|\| this\.idle\(\)\)/.test(hk) && /if \(!docMeaningOn\(this\.cfg\) \|\| gaming\(this\.cfg\)\) return null;\n    this\.docIndex/.test(hk));
check('the user coming back stops a fill', /pause\(\) \{[^}]*this\.docStop\?\.abort\(\)/.test(hk));
check('Bob\'s own folder isn\'t indexed', /docRoots\(\) \{ return \(this\.cfg\.readRoots \|\| \[\]\)\.filter\(\(r\) => r !== this\.cfg\.innDir\)/.test(hk));
const server = read('src/server.js');
check('the settings route saves the switch, and off deletes the index', /typeof b\.docMeaning === 'boolean'/.test(server) && /if \(!out\.docMeaning\) hk\.forgetDocIndex\(\)/.test(server) && /docMeaning: cfg\.docMeaning === true/.test(server));
check('turning document reading off deletes the index too', /if \(!out\.docTools\) \{ clearDocCache\(\); brain\.housekeeper\?\.forgetDocIndex\(\); \}/.test(server));
check('brain gives the tool the housekeeper', /findDocsTool\(cfg, \{ keeper: \(\) => this\.housekeeper \}\)/.test(brainText()));
const cellar = publicText('cellar.js');
check('Settings, How Bob works has the switch, off by default and always shown', /\$\{sswitch\('docMeaning', settings\.docMeaning === true, 'Search my documents by meaning'/.test(cellar) && /dataset\.set === 'docMeaning'/.test(cellar));
check('the Welcome list offers it, not as coming soon', WANTS.some((w) => w.key === 'docMeaning' && w.setting === 'Search my documents by meaning') && !WANTS_SOON.some((w) => /meaning/i.test(w.label)));
check('Bob can say whether it is on', /Search my documents by meaning: off/.test(settingsNow({ ...cfg, docMeaning: false }).join?.('\n') ?? String(settingsNow({ ...cfg, docMeaning: false }))));

// ---------- Help, glossary, FAQ ----------
const help = (id) => HELP.find((h) => h.id === id);
check('Help explains it in Bob\'s voice', /Search my documents by meaning/.test(help('my-documents').html) && /doc-index\.json/.test(help('my-documents').html) && /\bI\b/.test(help('my-documents').html));
check('Help says where it works', /Windows, Mac and Linux/.test(help('my-documents').html) && /Android/.test(help('my-documents').html));
check('the glossary has Document index', /<dt>Document index<\/dt>/.test(help('glossary').html) && /document index/.test(help('glossary').words));
check('an FAQ for when the words are forgotten', /Search my documents by meaning/.test(help('faq-docs-meaning')?.html || ''));
check('the privacy FAQ mentions the index', /never the words, deleted when you turn it off/.test(help('faq-docs-private').html));

fs.rmSync(tmp, { recursive: true, force: true });
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

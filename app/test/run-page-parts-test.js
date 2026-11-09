// #48: Bob read only the first 15,000 characters of a big page (public/cellar.js from raw GitHub) and looped on it.
// Now long pages and files come in parts with a "read on" note, find jumps to a word, code isn't run through the
// HTML cleaner, and the same page read twice in one turn isn't fetched again.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { buildTools, pieceOf } from '../src/tools.js';

let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra && !ok ? ' -> ' + extra : ''}`); };
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bob-parts-'));
const work = path.join(tmp, 'Documents'); fs.mkdirSync(work, { recursive: true });
const cfg = { agentDir: tmp, innDir: tmp, dataDir: tmp, settingsFile: path.join(tmp, 's.json'), readRoots: [work], readOnlyRoots: [], recycleBin: false, userName: 'Sam', projects: {}, webSearch: true, timeZone: 'UTC' };
const tools = buildTools(cfg);

// ---------- pieceOf ----------
const text = Array.from({ length: 5000 }, (_, i) => `line ${i} ${i === 4321 ? 'reviewerBeside' : 'x'.repeat(20)}`).join('\n');
check('a short text comes back whole, with no note', pieceOf('hello', {}, 100, 'x') === 'hello');
const p1 = pieceOf(text, {}, 15000, 'fetch_page again with the same url and');
check('part 1 is the first 15,000 characters', p1.startsWith(text.slice(0, 15000)));
check('the note gives the size and part count', /Part 1 of \d+: characters 1 to 15,000 of [\d,]+/.test(p1), p1.slice(-300));
check('the note gives the exact next call', /call fetch_page again with the same url and part: 2/.test(p1));
const p2 = pieceOf(text, { part: 2 }, 15000, 'x');
check('part 2 starts where part 1 stopped', p2.startsWith(text.slice(15000, 30000)));
const total = Math.ceil(text.length / 15000);
check('the last part says it is the last', /This is the last part/.test(pieceOf(text, { part: total }, 15000, 'x')));
check('a part past the end says so plainly', /only has \d+ parts/.test(pieceOf(text, { part: total + 3 }, 15000, 'x')));
const f = pieceOf(text, { find: 'REVIEWERbeside' }, 15000, 'x');
check('find (any case) jumps to the part with the word', f.includes('line 4321 reviewerBeside') && /Found "REVIEWERbeside" 1 time/.test(f));
check('find that misses says so', /isn't anywhere in it/.test(pieceOf(text, { find: 'nope-not-here' }, 15000, 'x')));

// ---------- read_file ----------
fs.writeFileSync(path.join(work, 'big.js'), text);
const r1 = await tools.read_file.run({ path: path.join(work, 'big.js') });
check('read_file says how to read on', /call read_file again with the same path and part: 2/.test(r1));
check('read_file part 3 works', (await tools.read_file.run({ path: path.join(work, 'big.js'), part: 3 })).startsWith(text.slice(40000, 60000)));
check('read_file find works', (await tools.read_file.run({ path: path.join(work, 'big.js'), find: 'reviewerBeside' })).includes('line 4321 reviewerBeside'));
fs.writeFileSync(path.join(work, 'small.txt'), 'hello');
check('read_file still reads a small file as it is', await tools.read_file.run({ path: path.join(work, 'small.txt') }) === 'hello');
check('read_file and fetch_page only need the path / url', JSON.stringify(tools.read_file.schema.function.parameters.required) === '["path"]' && JSON.stringify(tools.fetch_page.schema.function.parameters.required) === '["url"]');

// ---------- fetch_page: code comes as it is ----------
const code = 'if (a < b && c > d) {\n    keep();\n}\n'.repeat(2000);
const realFetch = globalThis.fetch;
globalThis.fetch = async (u) => new Response(String(u).includes('raw.githubusercontent') ? code : '<p>Hi <b>there</b></p>', { headers: { 'content-type': String(u).includes('raw.') ? 'text/plain; charset=utf-8' : 'text/html' } });
const sig = { signal: new AbortController().signal };
const g = await tools.fetch_page.run({ url: 'https://raw.githubusercontent.com/MouseWurX/Bob/main/public/cellar.js' }, sig);
check('raw GitHub code keeps its < and > and indentation', g.startsWith('if (a < b && c > d) {\n    keep();'), g.slice(0, 80));
check('a long raw file says how to read on', /part: 2/.test(g));
check('an HTML page is still cleaned', (await tools.fetch_page.run({ url: 'https://example.com/' }, sig)) === 'Hi there');
globalThis.fetch = realFetch;

// ---------- the repeat guard ----------
const brain = fs.readFileSync(new URL('../src/brain.js', import.meta.url), 'utf8');
check('the same page and part twice in one turn is not fetched again', /name === 'fetch_page' && ctx\.pagesRead\?\.has\(key\)/.test(brain) && /\(ctx\.pagesRead \|\|= new Set\(\)\)\.add\(key\)/.test(brain));

fs.rmSync(tmp, { recursive: true, force: true });
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

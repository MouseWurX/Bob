// 1.5.209 Find more models (src/catalog-find.js, public/cat-find.js). No internet: every site answer here is made up,
// in the shapes the real sites sent on 2026-11-11.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { cleanQuery, findUrl, baseOf, hfHit, msHit, sortHits, findModels, FIND_LIMIT } from '../src/catalog-find.js';
import { NAUGHTY_WORDS as SERVER_WORDS, makeEntry, cleanAdded } from '../src/catalog-added.js';
import { NAUGHTY_WORDS } from '../public/cat-sort.js';
import { hitMaker, hitNaughty, hitReap, shownHits, cleanFind, findHtml } from '../public/cat-find.js';
import { HELP } from '../public/help-content.js';
import { publicText } from './source-text.js';

let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${ok ? '' : ' ' + extra}`); };
const here = path.dirname(fileURLToPath(import.meta.url));
const read = (f) => fs.readFileSync(path.join(here, '..', f), 'utf8').replace(/\r\n/g, '\n');
const answer = (body, { status = 200, link = '' } = {}) => ({ ok: status >= 200 && status < 300, status, json: async () => body, headers: { get: (k) => (k.toLowerCase() === 'link' ? link : null) } });

const HF = [
  { _id: '1', id: 'unsloth/Thing3-27B-GGUF', lastModified: '2026-11-12T02:15:52.000Z', likes: 5756, private: false, downloads: 5924720, tags: ['gguf', 'base_model:Qwen/Thing3-27B', 'base_model:quantized:Qwen/Thing3-27B', 'license:apache-2.0'], createdAt: '2026-08-13T08:28:40.000Z', modelId: 'unsloth/Thing3-27B-GGUF' },
  { id: 'Qwen/Thing3-4B-GGUF', likes: 10, downloads: 900, tags: ['gguf', 'license:apache-2.0'], pipeline_tag: 'text-generation', createdAt: '2026-09-01T00:00:00.000Z' },
  { id: 'somebody/Thing3-27B-heretic-GGUF', likes: 0, downloads: 12, tags: ['gguf', 'base_model:quantized:Qwen/Thing3-27B'], createdAt: '2026-11-11T00:00:00.000Z' },
  { id: 'smallteam/Thing3-20B-REAP-GGUF', likes: 3, downloads: 40, tags: ['gguf', 'base_model:finetune:Qwen/Thing3-27B'], pipeline_tag: 'image-text-to-text', createdAt: '2026-10-01T00:00:00.000Z' },
  { id: 'unsloth/Painter-2-GGUF', downloads: 99, tags: ['gguf'], pipeline_tag: 'text-to-image', createdAt: '2026-10-10T00:00:00.000Z' },
  { id: 'secret/Hidden-GGUF', private: true, tags: ['gguf'], createdAt: '2026-10-10T00:00:00.000Z' },
  { id: 'bad id with spaces', tags: ['gguf'] },
  { id: 'evil/<script>-GGUF', tags: ['gguf'] },
];
const MS = { success: true, request_id: 'x', data: { total_count: 21018, page_number: 1, page_size: FIND_LIMIT, models: [
  { id: 'unsloth/Thing3-Flash-GGUF', display_name: 'Thing3-Flash-GGUF', downloads: 1024858, likes: 107, license: 'other', tasks: ['image-text-to-text'], created_at: '2026-08-26T14:31:32Z', last_modified: '2026-11-11T12:33:10Z', file_size: 1863300409541, params: 176943899520, tags: ['license:other', 'custom_tag:gguf'], private: false, gated: false },
  { id: 'unsloth/Thing3-27B-GGUF', downloads: 597672, likes: 386, license: 'apache-2.0', tasks: [], created_at: '2026-08-13T00:00:00Z', last_modified: '2026-09-11T00:00:00Z', params: 27320697856, tags: ['custom_tag:gguf'], private: false, gated: false },
  { id: 'tianshi/some-comfyui-thing', downloads: 168, tags: ['custom_tag:comfyui'], tasks: [], created_at: '2026-01-01T00:00:00Z' },
  { id: 'gated/Thing-GGUF', gated: true, tags: ['custom_tag:gguf'] },
] } };

// ---- what is asked ----
check('the search words are cleaned and the choices fall back to the defaults', JSON.stringify(cleanQuery({ q: '  qwen <b>coder</b>\n', host: 'x', sort: 9, cursor: 'a b' })) === JSON.stringify({ host: 'hf', sort: 'newest', q: 'qwen b coder b', cursor: '' }));
check('Hugging Face is asked for brain files only, newest first, with no sign-in in the link', findUrl({ q: 'qwen coder' }) === `https://huggingface.co/api/models?filter=gguf&search=qwen%20coder&sort=createdAt&direction=-1&limit=${FIND_LIMIT}` && /sort=downloads/.test(findUrl({ sort: 'downloads' })) && /sort=lastModified/.test(findUrl({ sort: 'updated' })) && !/search=/.test(findUrl({})) && /&cursor=abc%3D$/.test(findUrl({ cursor: 'abc=' })));
check('ModelScope is asked through its open search, by page', findUrl({ host: 'ms', q: 'granite' }) === `https://www.modelscope.cn/openapi/v1/models?search=granite%20gguf&page_size=${FIND_LIMIT}&page_number=1` && /page_number=3$/.test(findUrl({ host: 'ms', cursor: '3' })));
// ---- what is kept of an answer ----
check('the base model and how it was made come from the tags', JSON.stringify(baseOf(HF[0].tags)) === JSON.stringify({ base: 'Qwen/Thing3-27B', how: 'quantized' }) && baseOf(['base_model:Qwen/X']).base === 'Qwen/X' && baseOf(['gguf']).base === '');
const h0 = hfHit(HF[0]);
check('a Hugging Face hit keeps the page, the days, downloads and licence', h0.repo === 'unsloth/Thing3-27B-GGUF' && h0.name === 'Thing3-27B' && h0.page === 'https://huggingface.co/unsloth/Thing3-27B-GGUF' && h0.created === '2026-08-13' && h0.modified === '2026-11-12' && h0.downloads === 5924720 && h0.license === 'apache-2.0');
check('picture makers, private pages and odd names are left out', hfHit(HF[4]) === null && hfHit(HF[5]) === null && hfHit(HF[6]) === null && hfHit(HF[7]) === null && hfHit({ id: 'a/b', gated: 'auto' }) === null);
const m0 = msHit(MS.data.models[0]);
check('a ModelScope hit keeps the same things, and its size in billions', m0.page === 'https://modelscope.cn/models/unsloth/Thing3-Flash-GGUF' && m0.created === '2026-08-26' && m0.paramsB === 176.9 && m0.sees === true && msHit(MS.data.models[2]) === null && msHit(MS.data.models[3]) === null);
check('hits sort by day or by downloads', sortHits([{ created: '2026-01-01', downloads: 9 }, { created: '2026-05-01', downloads: 1 }], 'newest')[0].created === '2026-05-01' && sortHits([{ created: '2026-01-01', downloads: 9 }, { created: '2026-05-01', downloads: 1 }], 'downloads')[0].downloads === 9);
// ---- asking, with a made-up site ----
{
  const asked = [];
  const ok = await findModels({ q: 'thing' }, { fetchFn: async (url, opts) => { asked.push([url, opts]); return answer(HF, { link: '<https://huggingface.co/api/models?filter=gguf&cursor=eyIkb3Ii%3D&limit=40>; rel="next"' }); } });
  check('one request, to Hugging Face, with no sign-in sent', asked.length === 1 && /^https:\/\/huggingface\.co\/api\/models\?filter=gguf&search=thing/.test(asked[0][0]) && !('authorization' in (asked[0][1].headers || {})) && !('Authorization' in (asked[0][1].headers || {})) && asked[0][1].redirect === 'error');
  check('the brains come back, and the next page\'s mark', ok.ok && ok.hits.map((h) => h.repo).join() === 'unsloth/Thing3-27B-GGUF,Qwen/Thing3-4B-GGUF,somebody/Thing3-27B-heretic-GGUF,smallteam/Thing3-20B-REAP-GGUF' && ok.next === 'eyIkb3Ii=');
  const ms = await findModels({ host: 'ms', q: 'thing', sort: 'downloads' }, { fetchFn: async () => answer(MS) });
  check('ModelScope: the brains, most downloaded first', ms.ok && ms.hits.map((h) => h.repo).join() === 'unsloth/Thing3-Flash-GGUF,unsloth/Thing3-27B-GGUF' && ms.total === 21018);
  const down = await findModels({}, { fetchFn: async () => { throw new Error('offline'); } });
  const busy = await findModels({}, { fetchFn: async () => answer({}, { status: 429 }) });
  const odd = await findModels({}, { fetchFn: async () => answer({ not: 'a list' }) });
  const msOdd = await findModels({ host: 'ms' }, { fetchFn: async () => answer({ success: false }) });
  check('no internet, too many asks and odd answers each say so plainly', !down.ok && /couldn't be reached/.test(down.error) && !busy.ok && /too often/.test(busy.error) && !odd.ok && /couldn't read/.test(odd.error) && !msOdd.ok && /ModelScope/.test(msOdd.error));
}
// ---- who made it, REAP, naughty ----
const hits = HF.map(hfHit).filter(Boolean);
check('the lab\'s own page is official; a lab\'s model packed by someone else says both; the rest is community', hitMaker(hits[1]).kind === 'official' && hitMaker(hits[1]).by === 'Alibaba' && hitMaker(hits[0]).kind === 'repack' && hitMaker(hits[0]).lab === 'Alibaba' && hitMaker(hits[0]).by === 'unsloth' && hitMaker(hits[3]).kind === 'community' && /made from Alibaba's Thing3-27B/.test(hitMaker(hits[3]).line));
check('a REAP cut is marked and is not naughty; a heretic page is naughty and never passes as a lab\'s repack', hitReap(hits[3]) && !hitNaughty(hits[3]) && hitNaughty(hits[2]) && !hitReap(hits[2]) && hitMaker(hits[2]).kind === 'community');
check('the page and Bob agree on which words mean refusals were cut out', String(NAUGHTY_WORDS) === String(SERVER_WORDS) && !NAUGHTY_WORDS.test('Thing3-20B-REAP-pruned'));
check('naughty hits stay out while that list is off, and are counted', shownHits(hits).shown.length === 3 && shownHits(hits).naughtyLeftOut === 1 && shownHits(hits, { naughtyOn: true }).shown.length === 4);
check('Made by: big labs\' models, or community builds', shownHits(hits, { maker: 'labs' }).shown.map((h) => h.repo).join() === 'unsloth/Thing3-27B-GGUF,Qwen/Thing3-4B-GGUF' && shownHits(hits, { maker: 'community' }).shown.map((h) => h.repo).join() === 'smallteam/Thing3-20B-REAP-GGUF' && shownHits(hits, { maker: 'community' }).filteredOut === 2);
{
  const page = { host: 'hf', repo: 'somebody/Thing3-27B-heretic-GGUF', commit: 'a'.repeat(40), license: 'apache-2.0' };
  const choice = { key: 'q4', quant: 'Q4_K_M', files: [{ name: 'x-Q4_K_M.gguf', bytes: 16e9, sha256: 'b'.repeat(64) }] };
  const e = makeEntry(page, choice), plain = makeEntry({ ...page, repo: 'smallteam/Thing3-20B-REAP-GGUF' }, choice);
  check('an added page keeps its naughty mark (and through a save and reload); a REAP cut gets none', e.naughty === true && e.community.by === 'somebody' && cleanAdded([e])[0]?.naughty === true && plain.naughty === undefined && cleanAdded([plain])[0]?.naughty === undefined);
}
// ---- the page ----
check('the choices are cleaned', JSON.stringify(cleanFind({ host: 'zz', sort: 1, maker: null, q: 'x'.repeat(200) })) === JSON.stringify({ host: 'hf', sort: 'newest', maker: 'all', q: 'x'.repeat(80) }));
{
  const empty = findHtml({});
  check('before a search: the form with every menu and Search, and no list', /data-findform/.test(empty) && ['host', 'sort', 'maker'].every((k) => new RegExp(`<select data-find="${k}" aria-label="[^"]+">`).test(empty)) && /<button type="submit" class="get" >Search<\/button>/.test(empty) && !/find-hit/.test(empty) && /data-help="faq-find-models"/.test(empty));
  const html = findHtml({ find: { searched: true, hits, next: 'abc' }, naughtyOn: false, addedRepos: new Set(['hf:Qwen/Thing3-4B-GGUF']) });
  check('after: each hit has its tags, its page link and Show its files', (html.match(/data-findpick="https:\/\/huggingface\.co\//g) || []).length === 3 && /Official · Alibaba/.test(html) && /Alibaba&#39;s model · packed by unsloth|Alibaba's model · packed by unsloth/.test(html) && /Community · smallteam/.test(html) && /✂ REAP cut/.test(html) && /rel="noopener noreferrer"/.test(html));
  check('every hit says Not tried yet, one already added says so, and the count and what was left out are said', (html.match(/Not tried yet/g) || []).length === 3 && /some sizes added/.test(html) && /3 found on Hugging Face\. 1 left out because the naughty list is off\./.test(html) && /data-findmore/.test(html));
  check('with the naughty list on, the heretic page shows, marked', /Naughty list<\/span>/.test(findHtml({ find: { searched: true, hits }, naughtyOn: true })));
  check('an error, a search in progress and nothing found each show plainly', /role="alert">Hugging Face couldn/.test(findHtml({ find: { error: 'Hugging Face couldn\'t be reached.' } })) && /disabled>Searching…/.test(findHtml({ find: { busy: true } })) && /Nothing found\. Try fewer words\./.test(findHtml({ find: { searched: true, hits: [] } })));
  check('a hit\'s name can\'t smuggle markup onto the page', !/<script>/.test(findHtml({ find: { searched: true, hits: [{ host: 'hf', repo: 'a/b', name: '<script>', page: 'https://huggingface.co/a/b', created: '', modified: '', downloads: 0, likes: 0, license: '<script>', base: '', how: '' }] } })));
}
{
  const cellar = publicText('cellar.js'), server = read('src/server.js'), find = read('src/catalog-find.js');
  check('only Search asks the site: the menus alone never do', /findForm\) \{ e\.preventDefault\(\);[^\n]*await findRun\(\)/.test(cellar) && !/el\.dataset\.find\) \{[^\n]*findRun/.test(cellar));
  check('Show its files goes through Add a model page, so every added brain is pinned and checked', /b\.dataset\.findpick\)[^]*?api\('\/api\/catalog-added\/look', \{ page: link \}\)[^]*?pagePick\(r, link\)/.test(cellar));
  check('finding is for the replicant matrix itself, not the phone, and sends no token', /p === '\/api\/catalog-find'\) \{\s*if \(!isLocal\) return send\(res, 403/.test(server) && !/authorization|token/i.test(find.replace(/^\/\/.*$/gm, '')));
  check('nothing here downloads or adds a model', !/saveSettings|writeFile|createWriteStream/.test(find.replace(/^\/\/.*$/gm, '')));
  const glossary = HELP.find((h) => h.id === 'glossary').html;
  check('Help: an FAQ in Bob\'s voice, the catalogue page and the glossary', HELP.some((h) => h.id === 'faq-find-models' && /only your search words/.test(h.html) && /Not tried yet/.test(h.html)) && /Find more models/.test(HELP.find((h) => h.id === 'catalogue').html) && /<dt>Find more models<\/dt>/.test(glossary));
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

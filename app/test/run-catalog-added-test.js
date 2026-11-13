// 1.5.205 Add a model page: read a page's files (a fake site, never the real one), pick quantizations, add them to this
// replicant matrix's own list, pinned and never recommended.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parsePage, groupQuants, readPage, makeEntry, cleanAdded, mergeAdded, sweepAdded, addedId, ADDED_FAMILY, ADDED_MAX } from '../src/catalog-added.js';
import { mergeSettings, SETTING_KEYS } from '../src/config.js';
import { splitRemoved } from '../src/catalog-removed.js';
import { addPageHtml, pagePickHtml, catalogueHtml } from '../public/catalogue.js';
import { pickFor, sourceOf } from '../public/fit.js';
import { hostAllowed, modelHostAllowed } from '../src/models.js';
import { quantOf, placeFor } from '../public/place.js';
import { publicText } from './source-text.js';

let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${ok ? '' : ' ' + extra}`); };
const here = path.dirname(fileURLToPath(import.meta.url));
const read = (f) => fs.readFileSync(path.join(here, '..', f), 'utf8').replace(/\r\n/g, '\n');

const SHA = 'a'.repeat(64), COMMIT = 'b'.repeat(40);
const lfs = (name, bytes) => ({ rfilename: name, size: bytes, lfs: { sha256: SHA, size: bytes } });
const SITE = { sha: COMMIT, cardData: { license: 'apache-2.0' }, siblings: [{ rfilename: 'README.md', size: 10 }, lfs('Thing-9B-Q4_K_M.gguf', 5_600_000_000), lfs('Thing-9B-Q8_0-00001-of-00002.gguf', 4e9), lfs('Thing-9B-Q8_0-00002-of-00002.gguf', 4e9), lfs('mmproj-F16.gguf', 8e8), { rfilename: 'Thing-9B-Q2_K.gguf', size: 2e9 }, lfs('sub/Thing-9B-Q6_K.gguf', 7e9)] };
const asked = [];
const fake = (status, j) => async (u, o) => { asked.push([u, o]); return { status, ok: status === 200, json: async () => j }; };

{
  check('a page link, a file link on the page, a short link and a plain name all mean the page',
    ['https://huggingface.co/o/Thing-9B-GGUF', 'https://huggingface.co/o/Thing-9B-GGUF/blob/main/Thing-9B-Q4_K_M.gguf?download=true', 'https://hf.co/o/Thing-9B-GGUF/', 'o/Thing-9B-GGUF'].every((x) => { const r = parsePage(x); return r?.host === 'hf' && r.repo === 'o/Thing-9B-GGUF' && r.revision === ''; }));
  check('a branch is kept', parsePage('https://huggingface.co/o/n/tree/v2').revision === 'v2');
  check('other sites are told apart, and nonsense is nothing', parsePage('https://www.modelscope.ai/models/a/b').host === 'other' && parsePage('https://example.com/a/b').host === 'other' && parsePage('https://huggingface.co/datasets/a/b').host === 'other' && parsePage('hello') === null && parsePage('') === null && parsePage('../../etc') === null);
}
{
  const page = await readPage('o/Thing-9B-GGUF', { fetchFn: fake(200, SITE) });
  check('the site\'s file list is asked, with sizes and checksums, and nowhere else', asked.length === 1 && asked[0][0] === 'https://huggingface.co/api/models/o/Thing-9B-GGUF?blobs=true' && asked[0][1].redirect === 'error' && !asked[0][1].headers);
  check('one choice per quantization, smallest first', page.ok && page.choices.map((c) => c.quant).join() === 'Q2_K,Q4_K_M,Q6_K,Q8_0' && page.commit === COMMIT && page.license === 'apache-2.0');
  const [q2, q4, q6, q8] = page.choices;
  check('a file with no checksum stays listed but can\'t be added, and says why', q2.can === false && /no checksum/.test(q2.why));
  check('a brain split into parts is one choice, locked, and says why', q8.parts === 2 && q8.sizeGB === 8 && q8.can === false && /2 parts/.test(q8.why));
  check('a plain file can be added, from a folder too', q4.can && q4.sizeGB === 5.6 && q6.can && q6.key === 'sub/Thing-9B-Q6_K.gguf');
  check('the picture reader is kept apart', page.reader?.name === 'mmproj-F16.gguf' && !page.choices.some((c) => /mmproj/.test(c.key)));
  const e = makeEntry(page, q4);
  check('the entry is pinned to the page\'s commit, with size and checksum', e.files[0].url === `https://huggingface.co/o/Thing-9B-GGUF/resolve/${COMMIT}/Thing-9B-Q4_K_M.gguf` && e.files[0].bytes === 5_600_000_000 && e.files[0].sha256 === SHA && e.files[0].role === 'gguf');
  check('it comes with the page\'s picture reader under a name of its own', e.files[1]?.role === 'mmproj' && e.files[1].saveAs === `${e.id}-mmproj.gguf`);
  check('it is marked added and not tried, in its own family, with its quantization', e.added === true && e.trial === true && e.family === ADDED_FAMILY && e.name === 'Thing-9B Q4_K_M' && quantOf(e) === 'Q4_K_M' && e.id === addedId('o/Thing-9B-GGUF', q4.key) && /^added-[a-z0-9.-]+$/.test(e.id));
  check('a small one can be the Quick brain; a big one can\'t', e.jobs.includes('small') && !makeEntry(page, q6).jobs.includes('small'));
  check('never Bob\'s pick, even alone on the list', pickFor('bob', [{ ...e, status: { state: 'missing' } }], { vramGB: 16, ramGB: 32, freeGB: 500 }) === null);

  check('settings keep only what this file would have made', JSON.stringify(cleanAdded([e])[0]) === JSON.stringify(e) && SETTING_KEYS.includes('catalogAdded') && mergeSettings({}, { catalogAdded: [e, e] }).catalogAdded.length === 1);
  const bad = [{ ...e, id: 'gemma4-26b' }, { ...e, files: [{ ...e.files[0], url: 'https://example.com/x.gguf' }] }, { ...e, files: [{ ...e.files[0], url: e.files[0].url.replace(COMMIT, 'main') }] }, { ...e, files: [{ ...e.files[0], sha256: '' }] }, { ...e, source: {} }, null, 'x'];
  check('an entry that isn\'t pinned to Hugging Face, or wears another id, is dropped', cleanAdded(bad).length === 0);
  check('the list has a top', cleanAdded(Array.from({ length: ADDED_MAX + 5 }, (_, i) => ({ ...e, id: `${e.id}-${i}` }))).length === ADDED_MAX);
  check('a forged flag can\'t make one recommended or Bob\'s own', (() => { const c = cleanAdded([{ ...e, bobPick: ['bob'], madeByBob: true, trial: false, pick: 'best' }])[0]; return c.trial === true && !c.bobPick && !c.madeByBob && !c.pick; })());

  const cat = { models: [{ id: 'gemma4-26b' }, { id: 'old', added: true }] };
  mergeAdded(cat, { catalogAdded: [e] });
  check('added entries are laid into the list, replacing the ones laid before', cat.models.map((m) => m.id).join() === `gemma4-26b,${e.id}`);
  mergeAdded(cat, { catalogAdded: [] });
  check('and leave it again', cat.models.length === 1);

  const st = (state) => [{ ...e, status: { state } }];
  const a = sweepAdded(st('installed'), [], []);
  check('a downloaded one is remembered', a.changed && a.got.join() === e.id && a.removed.length === 0);
  const b = sweepAdded(st('missing'), a.got, []);
  check('delete its file yourself and it leaves the list by itself', b.changed && b.removed.join() === e.id && b.got.length === 0 && splitRemoved(st('missing'), b.removed).models.length === 0);
  check('one never downloaded just waits with its Get button', sweepAdded(st('missing'), [], []).changed === false);
  check('a shipped entry is never swept', sweepAdded([{ id: 'gemma4-26b', status: { state: 'missing' } }], ['gemma4-26b'], []).removed.length === 0);

  for (const [status, j, word] of [[404, {}, /no model called/], [401, {}, /private|sign in/], [500, {}, /answered 500/], [200, { ...SITE, gated: 'auto' }, /sign in/], [200, { ...SITE, sha: 'main' }, /can't pin/], [200, { sha: COMMIT, siblings: [{ rfilename: 'model.safetensors', size: 5 }] }, /no \.gguf/]]) {
    const r = await readPage('o/n', { fetchFn: fake(status, j) });
    check(`a page that can't be added says so plainly (${word.source})`, r.ok === false && word.test(r.error));
  }
  const n = asked.length;
  const off = await readPage('https://example.com/a/b', { fetchFn: fake(200, SITE) });
  check('other sites are answered without asking them anything', !off.ok && /Hugging Face and ModelScope/.test(off.error) && asked.length === n);

  // ModelScope (the shape its file list really answers with)
  const REV = 'c'.repeat(40), REV2 = 'd'.repeat(40);
  const msFile = (Path, Size, Revision = REV, Sha256 = SHA) => ({ CommitMessage: 'x', CommittedDate: 1, CommitterName: 'y', InCheck: false, IsLFS: true, Mode: '100644', Name: Path.split('/').pop(), Path, Revision, Sha256, Size, Type: 'blob' });
  const MS = { Code: 200, Success: true, Message: 'success', RequestId: 'r', Data: { IsVisual: false, LatestCommitter: {}, Files: [msFile('README.md', 10), { Name: 'sub', Path: 'sub', Type: 'tree' }, msFile('Thing-9B-Q4_K_M.gguf', 5_600_000_000), msFile('Thing-9B-Q8_0.gguf', 9_000_000_000, REV2), msFile('Thing-9B-Q2_K.gguf', 2e9, 'master'), msFile('mmproj-F16.gguf', 8e8, REV2)] } };
  check('a ModelScope page link means the page, with or without a tab after it', ['https://modelscope.cn/models/Qwen/Thing-9B-GGUF', 'https://www.modelscope.cn/models/Qwen/Thing-9B-GGUF/files', 'https://modelscope.cn/models/Qwen/Thing-9B-GGUF/file/view/master/x.gguf?status=2'].every((x) => { const r = parsePage(x); return r?.host === 'ms' && r.repo === 'Qwen/Thing-9B-GGUF'; }));
  const mp = await readPage('https://modelscope.cn/models/Qwen/Thing-9B-GGUF', { fetchFn: fake(200, MS) });
  check('ModelScope\'s file list is asked, and only that', asked[asked.length - 1][0] === 'https://modelscope.cn/api/v1/models/Qwen/Thing-9B-GGUF/repo/files?Revision=master&Recursive=true' && asked.length === n + 1);
  check('its choices come with sizes, and one with no commit to pin stays locked', mp.ok && mp.host === 'ms' && mp.choices.map((c) => `${c.quant}:${c.can}`).join() === 'Q2_K:false,Q4_K_M:true,Q8_0:true');
  const me = makeEntry(mp, mp.choices[2]);
  check('each file is pinned to its own commit on modelscope.cn, with size and checksum', me.files[0].url === `https://modelscope.cn/models/Qwen/Thing-9B-GGUF/resolve/${REV2}/Thing-9B-Q8_0.gguf` && me.files[0].sha256 === SHA && me.files[0].bytes === 9_000_000_000 && me.files[1].url.includes(`/resolve/${REV2}/mmproj-F16.gguf`) && me.source.host === 'ms' && me.source.commit === REV2);
  check('it says where it came from, is not tried, and can\'t collide with the same name from Hugging Face', /on ModelScope\./.test(me.what) && me.trial === true && me.id.startsWith('added-ms-') && me.id !== addedId('Qwen/Thing-9B-GGUF', mp.choices[2].key));
  check('settings keep a ModelScope entry as made, and drop one on another host', JSON.stringify(cleanAdded([me])[0]) === JSON.stringify(me) && cleanAdded([{ ...me, files: [{ ...me.files[0], url: me.files[0].url.replace('modelscope.cn', 'modelscope.cn.example.com') }] }]).length === 0);
  check('the row links back to its ModelScope page', sourceOf(me)?.url === 'https://modelscope.cn/models/Qwen/Thing-9B-GGUF' && /ModelScope/.test(sourceOf(me).label));
  check('model downloads may come from modelscope.cn itself, nothing that only looks like it; Bob\'s own updates may not', modelHostAllowed(me.files[0].url) && modelHostAllowed(e.files[0].url) && !modelHostAllowed('https://modelscope.cn.example.com/x') && !modelHostAllowed('http://modelscope.cn/x') && !hostAllowed(me.files[0].url));
  for (const [status, j, word] of [[404, {}, /no model called/], [200, { Code: 404, Message: 'model not exist' }, /no model called/], [200, { Code: 200, Data: { Files: [msFile('a.safetensors', 5)] } }, /no \.gguf/], [500, {}, /answered 500/]]) {
    const r = await readPage('https://modelscope.cn/models/a/b', { fetchFn: fake(status, j) });
    check(`a ModelScope page that can't be added says so plainly (${word.source})`, r.ok === false && word.test(r.error));
  }
  check('the site being unreachable is said plainly', /couldn't be reached/.test((await readPage('o/n', { fetchFn: async () => { throw new Error('x'); } })).error));

  // The page
  { // found on a real page: helper files for speed sit beside the brain, and are not brains
    const g = groupQuants([{ name: 'eagle3-gpt-oss-20b-Q8_0.gguf', bytes: 9e8, sha256: SHA }, { name: 'gpt-oss-20b-MXFP4.gguf', bytes: 12e9, sha256: SHA }, { name: 'thing-draft-Q4_K_M.gguf', bytes: 5e8, sha256: SHA }]);
    check('a helper file (a draft or eagle model) stays listed but locked, and says why', g.choices.filter((c) => !c.can).length === 2 && g.choices.find((c) => /MXFP4/.test(c.key)).can && /helper file/.test(g.choices[0].why));
  }
  { // the big one is a real download now, pinned, not yet recommended, and Riker is found under either file name
    const cat = JSON.parse(read('catalog.json'));
    const big = cat.models.find((m) => m.id === 'gpt-oss-120b-mxfp4'), f = big?.files?.[0] || {};
    check('GPT-OSS 120B is a pinned download, marked not tried', Boolean(big) && big.trial === true && !big.pick && /resolve\/[0-9a-f]{40}\/gpt-oss-120b-MXFP4\.gguf$/.test(f.url) && f.bytes === 63387346208 && /^[0-9a-f]{64}$/.test(f.sha256));
    check('on a 16 GB card with 32 GB of memory it runs from card, memory and storage', placeFor(big, { vramGB: 16, ramGB: 32 }).where === 'storage' && pickFor('deep', cat.models.map((m) => ({ ...m, status: { state: 'missing' } })), { vramGB: 16, ramGB: 32, freeGB: 500 })?.id !== big.id);
    check('Riker is found under the file name his own page uses too', ['riker-28b', 'riker-28b-q3'].every((id) => /^28Bob-Riker-Q[34]_K_M\.gguf$/.test(cat.models.find((m) => m.id === id).files[0].aka?.[0] || '')));
  }
  const view = { repo: page.repo, commit: page.commit, license: page.license, reader: { name: 'mmproj-F16.gguf', sizeGB: 0.8 }, choices: page.choices.map((c) => ({ key: c.key, quant: c.quant, sizeGB: c.sizeGB, parts: c.parts, can: c.can, why: c.why, added: c.quant === 'Q6_K' })) };
  const pop = pagePickHtml(view, { vramGB: 16, ramGB: 32 });
  check('the pop-up lists every choice with its size and where it would run', (pop.match(/data-pickkey=/g) || []).length === 4 && /<strong>Q4_K_M<\/strong>/.test(pop) && /5\.6 GB/.test(pop) && /On your card/.test(pop));
  check('a choice that can\'t be added stays in place, locked, with its reason', /data-pickkey="Thing-9B-Q8_0\.gguf" disabled aria-describedby="pick-3"/.test(pop) && /id="pick-3">In 2 parts/.test(pop) && /Already on your list/.test(pop));
  check('nothing is ticked for you, and it says nothing downloads yet', !/checked/.test(pop) && /Nothing downloads yet/.test(pop) && /data-pickadd/.test(pop) && /data-pickcancel/.test(pop));
  const sec = addPageHtml({});
  check('the catalogue has the Add a model page box, with Help', /data-addpageform/.test(sec) && /data-addpageurl/.test(sec) && /data-help="faq-add-page"/.test(sec) && /role="alert"/.test(addPageHtml({ addPage: { url: 'x', error: 'No.' } })));
  const catalog = JSON.parse(read('catalog.json'));
  const roles = { current: {}, options: { llm: [], images: [], edit: [], video: [], voice: [], speech: [], embed: [] } };
  const html = catalogueHtml({ roles, models: [...catalog.models, e].map((m) => ({ ...m, status: { state: 'missing' } })), brains: {}, active: {}, vramGB: 16, ramGB: 32, freeGB: 500, packs: catalog.packs, platform: 'win32', showUnsuited: true });
  check('an added brain shows in its own family with size and quantization, and can be removed', html.includes('>Added by you<') && html.includes('5.6 GB · Q4_K_M') && html.includes(`data-catremove="${e.id}"`) && /catjob-addpage/.test(html));

  const server = read('src/server.js'), cellar = publicText('cellar.js'), help = read('public/help-content.js');
  check('adding works only on this replicant matrix itself, and the list is rebuilt after', /p === '\/api\/catalog-added\/look' \|\| p === '\/api\/catalog-added\/add'\)\) \{\n\s+if \(!isLocal\)/.test(server) && /mergeAdded\(shop\.shipped, cfg\)/.test(server) && (server.match(/mergeAdded\(listUpdates\.merge\(shop\.shipped\), cfg\)/g) || []).length === 3);
  check('the page opens a pop-up to pick, then adds', /api\('\/api\/catalog-added\/look'/.test(cellar) && /pagePick\(r, link\)/.test(cellar) && /api\('\/api\/catalog-added\/add'/.test(cellar) && /showModal\(\)/.test(cellar));
  check('the shipped catalogue file is never written', !/writeFile|node:fs/.test(read('src/catalog-added.js')));
  check('Help: an FAQ, a glossary entry, and the catalogue topic say how', /id: 'faq-add-page'/.test(help) && /<dt>Added by you<\/dt>/.test(help) && /<dt>Removed from your list<\/dt>/.test(help) && /Add a model page<\/strong>, near the bottom/.test(help));
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

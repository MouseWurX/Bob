// 1.5.205 Remove in the Brain catalogue: an entry taken off this replicant matrix's own list, and Put back.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { splitRemoved } from '../src/catalog-removed.js';
import { cleanRemoved, mergeSettings, SETTING_KEYS } from '../src/config.js';
import { catalogueHtml, removedHtml } from '../public/catalogue.js';
import { publicText } from './source-text.js';

let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${ok ? '' : ' ' + extra}`); };
const here = path.dirname(fileURLToPath(import.meta.url));
const read = (f) => fs.readFileSync(path.join(here, '..', f), 'utf8').replace(/\r\n/g, '\n');
const catalog = JSON.parse(read('catalog.json'));
const models = catalog.models.map((m) => ({ ...m, status: { state: m.id === 'gemma4-e4b' ? 'installed' : m.id === 'qwen3-4b' ? 'partial' : 'missing' } }));

{
  const r = splitRemoved(models, ['gemma4-26b', 'gemma4-e4b', 'qwen3-4b', 'gpt-oss-20b', 'not-a-model'], new Set(['gpt-oss:20b']));
  check('a removed entry leaves the list', !r.models.some((m) => m.id === 'gemma4-26b') && r.removed.map((m) => m.id).join() === 'gemma4-26b' && r.removed[0].name === 'Gemma 4 26B');
  check('one that is here, half downloaded or in a slot stays, so it can still be used and deleted', ['gemma4-e4b', 'qwen3-4b', 'gpt-oss-20b'].every((id) => r.models.some((m) => m.id === id)));
  check('nothing removed: the same list comes back', splitRemoved(models, [], new Set()).models === models && splitRemoved(models, undefined).removed.length === 0);
  check('your own brains are never hidden this way', splitRemoved([{ id: 'own:x', own: true, status: { state: 'missing' } }], ['own:x']).models.length === 1);
  check('the list is a setting, cleaned: ids only, no doubles', SETTING_KEYS.includes('catalogRemoved') && cleanRemoved(['a', 'a', 'b c', 7, 'ok-1.2:x']).join() === 'a,ok-1.2:x' && mergeSettings({}, { catalogRemoved: ['a', {}, 'a'] }).catalogRemoved.join() === 'a');
  check('the shipped catalogue file is never written by this', !/writeFile|node:fs|from 'fs'/.test(read('src/catalog-removed.js')));
}
{
  const roles = { current: { bob: 'gemma4:e4b' }, options: { llm: [{ value: 'gemma4:e4b', label: 'Gemma 4 E4B' }], images: [], edit: [], video: [], voice: [], speech: [], embed: [] } };
  const ctx = { roles, models, brains: {}, active: {}, vramGB: 16, ramGB: 32, freeGB: 500, packs: catalog.packs, platform: 'win32', showUnsuited: true };
  const html = catalogueHtml(ctx);
  check('a row that isn\'t here has Remove, with a spoken name', /data-catremove="gemma4-26b" aria-label="Remove Gemma 4 26B from my list">Remove</.test(html));
  check('a row that is here, or half downloaded, has no Remove (delete it first)', !/data-catremove="gemma4-e4b"/.test(html) && !/data-catremove="qwen3-4b"/.test(html));
  check('the phone list has no Remove', !/data-catremove/.test(html.slice(html.indexOf('catjob-phone'), html.indexOf('catjob-voice'))));
  check('nothing removed: no Removed section', !/cat-removed/.test(html) && removedHtml(ctx) === '');
  const gone = catalogueHtml({ ...ctx, removed: [{ id: 'gemma4-26b', name: 'Gemma 4 26B', sizeGB: 15.4 }] });
  check('removed entries wait at the bottom with Put back', /<summary>Removed from your list \(1\)<\/summary>/.test(gone) && /data-catputback="gemma4-26b" aria-label="Put Gemma 4 26B back on the list">Put back/.test(gone));
  const cellar = publicText('cellar.js'), server = read('src/server.js');
  check('Remove asks first and says nothing is deleted', /Only this replicant matrix's list changes, and nothing is deleted/.test(cellar) && /data-catremove2=/.test(cellar) && /catremovecancel/.test(cellar));
  check('the server saves one id at a time and filters the list it sends', /b\.catalogRemove === 'string'/.test(server) && /b\.catalogPutBack === 'string'/.test(server) && /splitRemoved\(all\.models \|\| \[\], cfg\.catalogRemoved, inUseIds\(\)\)/.test(server));
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

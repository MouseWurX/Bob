// 1.5.201 (PC test): a home.json or config.json written by Windows PowerShell starts with a UTF-8 byte-order mark.
// It's read anyway, and a file that's there but can't be read stops Bob (home.json) or the save (config.json),
// never a quiet fallback or an overwrite.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { readJsonFile, stripBom } from '../src/util.js';
import { saveDiscord } from '../src/discord.js';
import { saveTelegram } from '../src/telegram.js';
import { saveShare } from '../src/share-brains.js';

const require = createRequire(import.meta.url);
const { readHomeFrom, badHomeLine } = require('../electron/home-json.cjs');
let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra ? ' ' + extra : ''}`); };
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bob-bom-'));
const BOM = '\uFEFF';

check('the byte-order mark is dropped, nothing else', stripBom(BOM + '{"a":1}') === '{"a":1}' && stripBom('{"a":1}') === '{"a":1}' && stripBom('') === '');
const a = path.join(tmp, 'a', 'home.json'), b = path.join(tmp, 'b', 'home.json');
fs.mkdirSync(path.dirname(a)); fs.mkdirSync(path.dirname(b));
fs.writeFileSync(a, BOM + JSON.stringify({ agentDir: 'C:\\Test Bob' }), 'utf8');
let r = readHomeFrom([a, b]);
check('a home.json from PowerShell (with the mark) is read', r.home.agentDir === 'C:\\Test Bob' && r.file === a && !r.bad);
fs.writeFileSync(a, '{ "agentDir": "C:\\Test Bob", }');
fs.writeFileSync(b, JSON.stringify({ agentDir: 'elsewhere' }));
r = readHomeFrom([a, b]);
check('a home.json that is there but broken is reported, not skipped for the next one', r.bad === a && !r.home.agentDir && r.why);
check('and the message says which file and not to guess', badHomeLine(r).includes(a) && /won't guess/.test(badHomeLine(r)));
fs.writeFileSync(a, '[1,2]');
check('a home.json that is not a { } list is reported too', readHomeFrom([a, b]).bad === a);
fs.rmSync(a);
check('no home.json in the first place: the next one is used', readHomeFrom([a, b]).home.agentDir === 'elsewhere');
check('none at all: an empty home (Bob asks, as before)', JSON.stringify(readHomeFrom([a, path.join(tmp, 'nope.json')])) === '{"home":{}}');

const conf = path.join(tmp, 'config.json');
fs.writeFileSync(conf, BOM + JSON.stringify({ port: 7777, remote: { enabled: true } }, null, 2));
check('config.json with the mark is read', readJsonFile(conf).port === 7777);
const cfg = { configFile: conf };
saveDiscord(cfg, { enabled: false });
let after = readJsonFile(conf);
check('saving Discord keeps the rest of a config.json that had the mark', after.port === 7777 && after.remote?.enabled === true && after.discord?.enabled === false);
fs.writeFileSync(conf, BOM + JSON.stringify({ port: 7777 }));
saveTelegram(cfg, { enabled: false });
check('Telegram too', readJsonFile(conf).port === 7777);
saveShare(cfg, { lend: false, borrow: { on: false, bobs: [] } });
check('and Bob-Net sharing', readJsonFile(conf).port === 7777 && readJsonFile(conf).share?.lend === false);
fs.writeFileSync(conf, '{ "port": 7777, broken');
let threw = false; try { saveDiscord(cfg, { enabled: true }); } catch { threw = true; }
check('a config.json that still can\'t be read stops the save; it is never written over', threw && fs.readFileSync(conf, 'utf8') === '{ "port": 7777, broken');

fs.rmSync(tmp, { recursive: true, force: true });
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

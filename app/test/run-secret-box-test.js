// 🔐 Locked secrets (src/secret-box.js, src/secret-settings.js): every passcode, token and key Bob saves is kept
// scrambled on disk, with the box key held by the computer's key keeper. No test touches a real key keeper,
// registry, Keychain or home folder: fake keepers, fake `run` and a temp home are passed in.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openBox, useBox, theBox, memoryKeeper, fileKeeper, dpapiKeeper, keychainKeeper, secretToolKeeper, keepersFor, PREFIX, isLocked, sealCopy, openCopy, plainCount, writeSecretJson, useKeysFile, saveKey, savedKey, keyNames, keyValue, lockPlainKeys, forgetPlainKey, ENV_NOTE, Box } from '../src/secret-box.js';

let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra && !ok ? ' -> ' + extra : ''}`); };
const here = path.dirname(fileURLToPath(import.meta.url));
const read = (f) => fs.readFileSync(f, 'utf8').replace(/\r\n/g, '\n');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bob secret box '));
const dataDir = path.join(tmp, 'inn', 'bob');
fs.mkdirSync(dataDir, { recursive: true });

// ---------- the box ----------
const keeper = memoryKeeper('dpapi');
const box = openBox({ dataDir, keepers: [keeper] });
check('a first start makes a box with the first key keeper that answers', box.ready && box.how === 'dpapi' && fs.existsSync(path.join(dataDir, 'secret-box.json')));
check('secret-box.json never holds the key itself', !read(path.join(dataDir, 'secret-box.json')).includes(keeper.kept.values().next().value.toString('hex')));
const s = box.seal('hunter22');
check('a sealed value starts with the marker and hides the words', s.startsWith(PREFIX) && !s.includes('hunter22'));
check('...and opens again', box.open(s) === 'hunter22');
check('sealing twice gives different text (fresh nonce)', box.seal('hunter22') !== s);
check('a sealed value is not sealed again', box.seal(s) === s);
check('plain text opens as itself (older files still read)', box.open('plain') === 'plain');
const again = openBox({ dataDir, keepers: [keeper] });
check('the next start gets the same key back from the keeper', again.ready && again.open(s) === 'hunter22');
const other = openBox({ dataDir: path.join(tmp, 'other'), keepers: [memoryKeeper('dpapi')] });
check('another Bob\'s box can\'t open it (reads as empty)', other.open(s) === '');
const tampered = s.slice(0, -4) + (s.endsWith('AAAA') ? 'BBBB' : 'AAAA');
check('a changed value doesn\'t open (GCM tag)', box.open(tampered) === '');

// The keeper failing: the first one is skipped on a first start, and a later failure never makes a new key.
const broken = memoryKeeper('dpapi'); broken.broken = true;
const fallback = memoryKeeper('file');
const dir2 = path.join(tmp, 'two');
const b2 = openBox({ dataDir: dir2, keepers: [broken, fallback] });
check('no key keeper: the key-file fallback is used', b2.ready && b2.how === 'file');
const lost = memoryKeeper('file');
const b3 = openBox({ dataDir: dir2, keepers: [lost] });
check('a box whose keeper lost the key comes back stuck, not new', !b3.ready && b3.stuck);
check('...and secret-box.json is left alone', JSON.parse(read(path.join(dir2, 'secret-box.json'))).how === 'file');
let threw = '';
try { b3.seal('x'); } catch (e) { threw = e.code; }
check('a stuck box refuses to seal (never writes a secret plain by surprise)', threw === 'BOX_STUCK');
const b4 = openBox({ dataDir: dir2, keepers: [lost], fresh: true });
check('Start a new locked box sets the old file aside and makes a new key', b4.ready && fs.readdirSync(dir2).some((f) => /^secret-box\.old-/.test(f)));

// ---------- the key keepers, with fake programs ----------
{
  const calls = [];
  const run = (cmd, args, o) => { calls.push({ cmd, args, input: o.input }); return /Unprotect/.test(args.join(' ')) ? Buffer.alloc(32, 7).toString('base64') : 'QUJD'.repeat(20); };
  const d = dpapiKeeper({ run });
  const kept = d.wrap(Buffer.alloc(32, 7));
  check('Windows: DPAPI runs through PowerShell for this Windows account', calls[0].cmd === 'powershell.exe' && /ProtectedData\]::Protect\(\$b,\$e,'CurrentUser'\)/.test(calls[0].args.join(' ')));
  check('...the key goes in on stdin, never on the command line', !calls[0].args.join(' ').includes(Buffer.alloc(32, 7).toString('base64')) && calls[0].input.includes(Buffer.alloc(32, 7).toString('base64')));
  check('...and comes back', d.unwrap(kept).equals(Buffer.alloc(32, 7)));
}
{
  const calls = [];
  const hex = Buffer.alloc(32, 9).toString('hex');
  const run = (cmd, args, o) => { calls.push({ cmd, args, input: o.input || '' }); return hex; };
  keychainKeeper({ run }).wrap(Buffer.alloc(32, 9), 'abc');
  check('Mac: the Keychain gets the key through security -i (stdin), not the command line', calls[0].cmd === '/usr/bin/security' && calls[0].args.join(' ') === '-i' && calls[0].input.includes(hex));
  calls.length = 0;
  secretToolKeeper({ run }).wrap(Buffer.alloc(32, 9), 'abc');
  check('Linux: secret-tool store reads the key from stdin', calls[0].cmd === 'secret-tool' && calls[0].args[0] === 'store' && !calls[0].args.join(' ').includes(hex) && calls[0].input === hex);
}
{
  const home = path.join(tmp, 'home');
  const f = fileKeeper({ home });
  f.wrap(Buffer.alloc(32, 3), 'id1');
  const kf = path.join(home, '.config', 'bob', 'secret-box-id1.key');
  check('the key-file fallback lives outside Bob\'s home folder, in ~/.config/bob', fs.existsSync(kf));
  if (process.platform !== 'win32') check('...readable by this account only (600)', (fs.statSync(kf).mode & 0o777) === 0o600);
  check('...and reads back', f.unwrap('', 'id1').equals(Buffer.alloc(32, 3)));
  check('keepers by platform: Windows DPAPI, Mac Keychain, Linux Secret Service, each with the file fallback last', keepersFor('win32')[0].how === 'dpapi' && keepersFor('darwin')[0].how === 'keychain' && keepersFor('linux')[0].how === 'libsecret' && ['win32', 'darwin', 'linux'].every((p) => keepersFor(p).at(-1).how === 'file'));
}

// ---------- secrets inside JSON ----------
useBox(box);
const conf = { port: 7777, remote: { enabled: true, passcode: 'door-pass-1', hosts: ['a'] }, share: { borrow: { bobs: [{ name: 'Go', address: '100.64.0.2:7777', passcode: 'go-pass-22' }] } }, telegram: { enabled: false }, appsDoor: { enabled: true, key: 'apps-key-333' }, models: { chat: 'qwen' } };
const sealed = sealCopy(conf);
check('config.json: the phone passcode, other Bobs\' passcodes and door keys are locked', [sealed.remote.passcode, sealed.share.borrow.bobs[0].passcode, sealed.appsDoor.key].every(isLocked));
check('...everything else stays as it was', sealed.port === 7777 && sealed.models.chat === 'qwen' && sealed.remote.hosts[0] === 'a' && sealed.share.borrow.bobs[0].address === '100.64.0.2:7777');
check('...and the original object isn\'t changed', conf.remote.passcode === 'door-pass-1');
check('...and it opens back to the same', JSON.stringify(openCopy(sealed)) === JSON.stringify(conf));
check('plainCount sees three plain secrets before, none after', plainCount(conf) === 3 && plainCount(sealed) === 0);
const env = sealCopy({ GITHUB_TOKEN: 'ghp_x', ANY: 'y' }, box, { all: true });
check('an app\'s env map: every value locked', isLocked(env.GITHUB_TOKEN) && isLocked(env.ANY));

const cf = path.join(tmp, 'config.json');
writeSecretJson({}, cf, conf);
check('writeSecretJson writes them locked when the switch is on (the default)', !read(cf).includes('door-pass-1') && read(cf).includes(PREFIX));
writeSecretJson({ lockSecrets: false }, cf, conf);
check('...and plain when Locked secrets is switched off', read(cf).includes('door-pass-1'));
useBox(new Box({ stuck: true, label: 'test' }));
threw = '';
try { writeSecretJson({}, cf, conf); } catch (e) { threw = e.code; }
check('with the box stuck, a write that holds a plain secret stops', threw === 'BOX_STUCK');
useBox(box);

// ---------- keys saved in Settings ----------
const keysFile = path.join(dataDir, 'keys.json');
useKeysFile(keysFile);
saveKey({}, 'HF_TOKEN', 'hf_abcdefghijklmnopqrstuv');
check('a key saved in Settings is kept locked in keys.json', !read(keysFile).includes('hf_abcdef') && keyNames().includes('HF_TOKEN'));
check('...and Bob reads it back', savedKey('HF_TOKEN') === 'hf_abcdefghijklmnopqrstuv');
check('the environment still wins over a saved key', keyValue('HF_TOKEN', { HF_TOKEN: 'from-env' }) === 'from-env' && keyValue('HF_TOKEN', {}) === 'hf_abcdefghijklmnopqrstuv');
saveKey({}, 'HF_TOKEN', '');
check('saving an empty key removes it', !keyNames().includes('HF_TOKEN'));
let bad = '';
try { saveKey({}, 'bad name', 'x'); } catch (e) { bad = e.message; }
check('a bad key name is refused', /capital letters/.test(bad));

// ---------- plain keys from older Bobs ----------
{
  const home = path.join(tmp, 'old home');
  const ef = path.join(home, '.config', 'bob', 'env');
  fs.mkdirSync(path.dirname(ef), { recursive: true });
  fs.writeFileSync(ef, 'BOB_DISCORD_TOKEN=abc.def.ghi\r\nexport OPENROUTER_API_KEY="sk-or-123"\r\n# my note\r\n');
  const moved = lockPlainKeys({}, { platform: 'linux', home });
  check('Mac/Linux: every key in ~/.config/bob/env moves into the locked store', moved.includes('BOB_DISCORD_TOKEN') && moved.includes('OPENROUTER_API_KEY') && savedKey('OPENROUTER_API_KEY') === 'sk-or-123');
  const left = read(ef);
  check('...the file keeps a note and the owner\'s own comments, and no key', left.startsWith(ENV_NOTE) && left.includes('# my note') && !left.includes('sk-or-123') && !left.includes('abc.def.ghi'));
  check('...a second start changes nothing', lockPlainKeys({}, { platform: 'linux', home }).length === 0 && read(ef) === left);
  check('...not when Locked secrets is off', (fs.writeFileSync(ef, 'X_KEY=1\n'), lockPlainKeys({ lockSecrets: false }, { platform: 'linux', home }).length === 0 && read(ef) === 'X_KEY=1\n'));
}
{
  const reg = { BOB_DISCORD_TOKEN: 'disc.tok.en', HF_TOKEN: 'hf_owner' };
  const deleted = [];
  const run = (cmd, args) => {
    const name = args[args.indexOf('/v') + 1];
    if (args[0] === 'query') { if (!reg[name]) throw new Error('missing'); return `\r\nHKEY_CURRENT_USER\\Environment\r\n    ${name}    REG_SZ    ${reg[name]}\r\n`; }
    if (args[0] === 'delete') { deleted.push(name); delete reg[name]; return ''; }
    return '';
  };
  saveKey({}, 'BOB_DISCORD_TOKEN', '');
  const moved = lockPlainKeys({}, { platform: 'win32', run });
  check('Windows: Bob\'s own BOB_DISCORD_TOKEN user variable moves into the locked store', moved.includes('BOB_DISCORD_TOKEN') && savedKey('BOB_DISCORD_TOKEN') === 'disc.tok.en' && deleted.includes('BOB_DISCORD_TOKEN'));
  check('...the owner\'s own variables (HF_TOKEN) are left where they are', !deleted.includes('HF_TOKEN') && reg.HF_TOKEN === 'hf_owner');
  const del = [];
  forgetPlainKey('HF_TOKEN', { platform: 'win32', run: (c, a) => del.push(a) });
  check('forgetPlainKey never deletes a variable that isn\'t Bob\'s own', del.length === 0);
}

// ---------- Discord saves its token locked ----------
{
  const { storeToken } = await import('../src/discord.js');
  const home = path.join(tmp, 'dc home');
  const ef = path.join(home, '.config', 'bob', 'env');
  fs.mkdirSync(path.dirname(ef), { recursive: true });
  fs.writeFileSync(ef, 'BOB_DISCORD_TOKEN=old.plain.token\nOTHER_KEY=keep\n');
  await storeToken('new.pasted.token', { cfg: {}, platform: 'linux', home });
  check('Discord: a pasted bot token is saved locked', savedKey('BOB_DISCORD_TOKEN') === 'new.pasted.token' && !read(keysFile).includes('new.pasted.token'));
  check('...and the old plain line is taken out of ~/.config/bob/env (others kept)', !read(ef).includes('old.plain.token') && read(ef).includes('OTHER_KEY=keep'));
}

// ---------- config.json at start, and the Settings route ----------
{
  const home = path.join(tmp, 'cfg home');
  fs.mkdirSync(home, { recursive: true });
  const file = path.join(home, 'config.json');
  fs.writeFileSync(file, JSON.stringify({ agentDir: home, remote: { enabled: false, passcode: 'old-plain-passcode', hosts: [] }, share: { borrow: { bobs: [{ name: 'Go', address: '100.64.0.9:7777', passcode: 'go-plain-pass' }] } } }, null, 2));
  process.env.BOB_CONFIG = file;
  const { loadConfig, readConfigFile, saveRemote } = await import('../src/config.js');
  const cfg = loadConfig();
  const disk = read(file);
  check('first start: plain passcodes in config.json are locked in place', !disk.includes('old-plain-passcode') && !disk.includes('go-plain-pass') && disk.includes(PREFIX));
  check('...and Bob has them open in memory', cfg.remote.passcode === 'old-plain-passcode' && cfg.share.borrow.bobs[0].passcode === 'go-plain-pass');
  check('...a note says so for the logbook', cfg.boxNotes.some((n) => /locked 2 plain secrets/.test(n)));
  check('readConfigFile hands the savers the opened words', readConfigFile(cfg).remote.passcode === 'old-plain-passcode');
  saveRemote(cfg, { passcode: 'brand-new-pass' });
  check('saving phone access keeps the passcode locked on disk, open in memory', !read(file).includes('brand-new-pass') && cfg.remote.passcode === 'brand-new-pass');
  check('...and the other Bob\'s passcode survives the save', openCopy(JSON.parse(read(file))).share.borrow.bobs[0].passcode === 'go-plain-pass');
  const { secretsPatch, secretsView } = await import('../src/secret-settings.js');
  check('Settings sees it on, open, and the names of saved keys only', (() => { const v = secretsView(cfg); return v.on && v.ready && Array.isArray(v.keys) && !JSON.stringify(v).includes('brand-new-pass'); })());
  secretsPatch(cfg, { addKey: { name: 'openrouter_api_key', value: 'sk-or-v1-zzz' } });
  check('Settings: a pasted key is saved locked by name', savedKey('OPENROUTER_API_KEY') === 'sk-or-v1-zzz');
  secretsPatch(cfg, { on: false });
  check('switching Locked secrets off writes config.json plain again', read(file).includes('brand-new-pass') && cfg.lockSecrets === false);
  check('...keys.json too', read(path.join(cfg.dataDir, 'keys.json')).includes('sk-or-v1-zzz'));
  secretsPatch(cfg, { on: true });
  check('...and on locks them all again', !read(file).includes('brand-new-pass') && !read(path.join(cfg.dataDir, 'keys.json')).includes('sk-or-v1-zzz'));
  check('a fresh box isn\'t offered while the box works', /no need/.test(secretsPatch(cfg, { freshBox: true }).error || ''));
  delete process.env.BOB_CONFIG;
}

// ---------- Bob's file tools never touch the store ----------
{
  const { isSensitive } = await import('../src/tools.js');
  const cfg = { dataDir, hands: {} };
  check('keys.json, secret-box.json and mcp-servers.json are always off-limits to Bob\'s file tools', ['keys.json', 'secret-box.json', 'mcp-servers.json'].every((f) => isSensitive(cfg, path.join(dataDir, f))));
}

// ---------- the phone ----------
{
  const kt = read(path.join(here, '..', 'android', 'app', 'src', 'main', 'java', 'ca', 'mousewurx', 'bob', 'SecretBox.kt'));
  check('Android: the box key lives in the Android Keystore (AES-GCM)', /AndroidKeyStore/.test(kt) && /AES\/GCM\/NoPadding/.test(kt));
  const nb = read(path.join(here, '..', 'android', 'app', 'src', 'main', 'java', 'ca', 'mousewurx', 'bob', 'NetBob.kt'));
  check('Android: login cookies for your other Bobs are kept locked, and an old plain one is locked when read', /SecretBox\.seal/.test(nb) && /SecretBox\.open/.test(nb));
}

// ---------- Help ----------
{
  const help = read(path.join(here, '..', 'public', 'help-content.js'));
  check('Help has Locked secrets in Bob\'s voice, a glossary entry and an FAQ', /id: 'locked-secrets'/.test(help) && /<dt>Locked secrets<\/dt>/.test(help) && /id: 'faq-locked-secrets'/.test(help));
  const map = read(path.join(here, '..', 'public', 'settings-map.js'));
  check('the panel is on the This replicant matrix card and in the side list', (map.match(/ev-secrets/g) || []).length >= 2);
}

fs.rmSync(tmp, { recursive: true, force: true });
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

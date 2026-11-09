// "Let Bob work on his own app" (src/self-work.js): off by default; Bob works on a separate copy of his code (never the
// running Bob, whose folder and settings stay locked), only on Bobert or stock Qwen3.6 35B, with Long memory (YaRN)
// stretched past 256K for that job. No real git, network, graphics card or folders: everything is passed in as a fake.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  selfWorkOn, cleanSelfWork, codeCopyDir, codeCopyRoot, patchDir, hasCodeCopy, applyCodeCopy, CODE_COPY_PROJECT, bigBrainOk, isStockQwen35,
  bigBrains, pickBigBrain, gatherBrains, selfCtx, selfWorkTask, makeCodeCopy, selfWorkView, SELF_CTX_DEFAULT, SELF_REPO
} from '../src/self-work.js';
import { SETTING_KEYS, isInside } from '../src/config.js';
import { Brain } from '../src/brain.js';
import { LlamaCpp } from '../src/llamacpp.js';
import { guessGroups } from '../src/toolbox.js';
import { settingsNow } from '../src/self-help.js';
import { HELP } from '../public/help-content.js';
import { OWN_NODE, nodeFile, nodeUrl, nodeAllowed, nodeMajor, findNode, findGit, getOwnNode, getOwnGit, ensureTool, toolPath, ownNodeBin, ownGitBin, GIT_MAC, GIT_LINUX, MINGIT } from '../src/self-work-tools.js';

let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra && !ok ? ' -> ' + extra : ''}`); };
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8').replace(/\r\n/g, '\n');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bob-selfwork-'));
const agentDir = path.join(tmp, 'Agent'), innDir = path.join(agentDir, 'inn'), dataDir = path.join(innDir, 'bob');
fs.mkdirSync(dataDir, { recursive: true });
const cfg = { agentDir, innDir, dataDir, projects: { Game: path.join(tmp, 'Game') } };

// ---------- The switch ----------
check('off unless turned on', !selfWorkOn(cfg) && !selfWorkOn({ selfWork: { enabled: 'yes' } }) && selfWorkOn({ selfWork: { enabled: true } }));
check('saved like the other settings', SETTING_KEYS.includes('selfWork'));
check('settings are cleaned: off, 512K, and a brain name only when it looks like one', JSON.stringify(cleanSelfWork({ enabled: 1, ctx: 99, model: 'a b<c>' })) === JSON.stringify({ enabled: false, ctx: SELF_CTX_DEFAULT }));
check('...1M and a brain id are kept', JSON.stringify(cleanSelfWork({ enabled: true, ctx: 1048576, model: 'own-35bob-bobert-q4' })) === JSON.stringify({ enabled: true, ctx: 1048576, model: 'own-35bob-bobert-q4' }));
check('512K unless 1M is picked', selfCtx({}) === 524288 && selfCtx({ selfWork: { ctx: 1048576 } }) === 1048576 && selfCtx({ selfWork: { ctx: 262144 } }) === 524288);

// ---------- The copy is never the running Bob ----------
check('the code copy lives in the inn, outside Bob\'s locked settings folder', isInside(innDir, codeCopyDir(cfg)) && !isInside(dataDir, codeCopyDir(cfg)) && !isInside(codeCopyDir(cfg), dataDir));
check('...and outside his program folder (the repo this test runs from)', !isInside(root, codeCopyDir({ innDir: path.join(tmp, 'x', 'inn') })));
check('patches go beside it', path.dirname(patchDir(cfg)) === codeCopyRoot(cfg));
check('the code copy comes from Bob\'s own GitHub page', SELF_REPO === 'https://github.com/MouseWurX/Bob.git');
{
  const c = { ...cfg, projects: { ...cfg.projects } };
  applyCodeCopy(c);
  check('no project while it\'s off', !(CODE_COPY_PROJECT in c.projects));
  c.selfWork = { enabled: true };
  applyCodeCopy(c);
  check('no project while on but the copy isn\'t made yet', !(CODE_COPY_PROJECT in c.projects));
  fs.mkdirSync(path.join(codeCopyDir(c), '.git'), { recursive: true });
  fs.writeFileSync(path.join(codeCopyDir(c), 'package.json'), '{}');
  applyCodeCopy(c);
  check('with the switch on and the copy made, it is a project (so his coding hat can edit code there)', c.projects[CODE_COPY_PROJECT] === codeCopyDir(c) && c.projects.Game);
  c.selfWork = { enabled: false };
  applyCodeCopy(c);
  check('switched off, it stops being a project (your own projects stay)', !(CODE_COPY_PROJECT in c.projects) && c.projects.Game);
  fs.rmSync(codeCopyRoot(c), { recursive: true, force: true });
}

// ---------- Only the biggest brain ----------
check('Bobert counts, by id or name', bigBrainOk('own-abc', '35Bob-Bobert Q4_K_M') && bigBrainOk('35bob-bobert-q3'));
check('stock Qwen3.6 35B counts (catalogue, Q3 and Ollama names)', ['qwen3.6-35b-a3b', 'qwen3.6-35b-a3b-q3', 'qwen3.6:35b', 'qwen3.6:35b-a3b-q4_K_M', 'qwen3.5-35b-a3b'].every((n) => isStockQwen35(n)));
check('remixes and smaller brains don\'t', !['qwen3.6-35b-a3b-heretic', 'qwen3.6-35b-a3b-opus-distilled', 'qwen3.6-35b-a3b-distill-3.8', 'qwen3.6-27b', '28Bob-Riker', 'gemma4-e2b'].some((n) => bigBrainOk(n)));
{
  const list = bigBrains([{ id: 'qwen3.6-35b-a3b', sizeGB: 21 }, { id: 'own-q3', name: 'Bobert Q3', sizeGB: 15.6 }, { id: 'riker', name: '28Bob-Riker', sizeGB: 17.5 }, { id: 'own-q4', name: 'Bobert Q4', sizeGB: 19.7 }, { id: 'qwen3.6-35b-a3b-q3', sizeGB: 16 }]);
  check('Bobert first, the bigger file first, then Qwen 35B', list.map((b) => b.id).join(',') === 'own-q4,own-q3,qwen3.6-35b-a3b,qwen3.6-35b-a3b-q3', list.map((b) => b.id).join(','));
  check('Bob uses the first unless you pick another one that is here', pickBigBrain({}, list).id === 'own-q4' && pickBigBrain({ selfWork: { model: 'qwen3.6-35b-a3b' } }, list).id === 'qwen3.6-35b-a3b' && pickBigBrain({ selfWork: { model: 'gone' } }, list).id === 'own-q4');
  check('nothing to pick when neither is here', pickBigBrain({}, bigBrains([{ id: 'riker' }])) === null);
}
{
  const own = [{ id: 'own-1', name: 'Bobert', sizeGB: 19.7, status: { state: 'installed' } }, { id: 'own-2', name: 'Bobert old', status: { state: 'missing' } }];
  const list = gatherBrains({ models: { bob: 'qwen3.6:35b', small: 'qwen3.5-4b' } }, { own, catalogFile: (id) => (id === 'qwen3.6-35b-a3b' ? { gguf: 'x.gguf' } : null), size: () => 21e9 });
  check('gathers own files that are here, catalogue files that are here, and equipped slots', list.map((b) => b.id).join(',') === 'own-1,qwen3.6-35b-a3b,qwen3.6:35b', list.map((b) => b.id).join(','));
  const v = selfWorkView({ ...cfg, selfWork: { enabled: true } }, list);
  check('Settings sees the switch, 512K, the brain Bob would use and that the copy isn\'t made', v.enabled && v.ctx === 524288 && v.model === 'own-1' && v.ready === false && v.brains.length === 3);
}

// ---------- The job ----------
{
  const c = { ...cfg, selfWork: { enabled: true } };
  const t = selfWorkTask(c, 'Add a switch to hide the cat!', { today: '2026-11-09' });
  check('the job says where to work, and that the running Bob is a different, locked folder', t.includes(codeCopyDir(c)) && /stays locked/.test(t));
  check('...reads the house rules first (CLAUDE.md, CONTRIBUTING)', t.includes('CLAUDE.md') && t.includes('CONTRIBUTING.md'));
  check('...starts a new branch named for the job', t.includes('git switch -c bob/add-a-switch-to-hide-the-cat-2026-11-09'));
  check('...runs the tests with Node itself (npm.cmd can\'t run without a shell on Windows) and never weakens one', t.includes('node --run test') && /Never skip, delete or weaken a test/.test(t));
  check('...keeps a patch and never pushes', t.includes(`git format-patch main -o ${patchDir(c)}`) && /Never push/.test(t));
  check('...knows the house rules (off by default, every platform, Help in his voice)', /off by default/.test(t) && /Windows, Mac, Linux and Android/.test(t) && /Help in your own voice/.test(t));
  const off = selfWorkTask(c, 'fix a typo', { runOn: false });
  check('with Run programs off: edits only, and says how to get branches and tests', !off.includes('node --run test') && !off.includes('git switch') && /switching on Run programs/.test(off));
}

// ---------- Making the copy ----------
{
  const c = { ...cfg, innDir: path.join(tmp, 'inn2'), selfWork: { enabled: true } };
  const calls = [];
  const ok = await makeCodeCopy(c, { git: '/own/git', run: async (cmd, args) => { calls.push([cmd, ...args].join(' ')); if (args[0] === 'clone') { fs.mkdirSync(path.join(args[3], '.git'), { recursive: true }); fs.writeFileSync(path.join(args[3], 'package.json'), '{}'); } return { code: 0, out: '' }; } });
  check('Make the code copy clones Bob\'s code into the inn, with the Git it was given', ok.ok && calls[0] === `/own/git clone --quiet ${SELF_REPO} ${codeCopyDir(c)}` && hasCodeCopy(c), JSON.stringify(calls));
  check('...and gives that copy its own commit name (the computer\'s Git settings are left alone)', calls.includes(`/own/git -C ${codeCopyDir(c)} config user.name Bob`) && calls.some((x) => x.includes('config user.email')) && !calls.some((x) => x.includes('--global')));
  let ran = false;
  const again = await makeCodeCopy(c, { run: async () => { ran = true; return { code: 0 }; } });
  check('...and never clones over a copy that is there (it may hold work)', again.ok && again.already && !ran);
  const c2 = { ...cfg, innDir: path.join(tmp, 'inn3') };
  fs.mkdirSync(codeCopyDir(c2), { recursive: true });
  const busy = await makeCodeCopy(c2, { run: async () => { ran = true; return { code: 0 }; } });
  check('...nor into a folder that isn\'t a copy', !busy.ok && /isn't a code copy/.test(busy.why));
  const noGit = (platform) => makeCodeCopy({ ...cfg, innDir: path.join(tmp, `inn-${platform}`) }, { platform, run: async () => { const e = new Error('spawn git ENOENT'); e.code = 'ENOENT'; throw e; } });
  check('no Git on Windows: says where to get it', /git-scm\.com/.test((await noGit('win32')).why));
  check('...on a Mac: xcode-select', /xcode-select --install/.test((await noGit('darwin')).why));
  check('...on Linux: the software manager', /software manager/.test((await noGit('linux')).why));
  const offline = await makeCodeCopy({ ...cfg, innDir: path.join(tmp, 'inn4') }, { run: async () => ({ code: 128, out: 'fatal: unable to access' }) });
  check('a failed clone says what Git said', !offline.ok && /unable to access/.test(offline.why));
}

// ---------- Git and Node.js: his own copies when they're missing (the owner's ask) ----------
{
  const c = { agentDir: path.join(tmp, 'tools-agent') };
  check('Node.js is pinned for every computer Bob runs on, with nodejs.org\'s sha256', ['win-x64', 'darwin-arm64', 'darwin-x64', 'linux-x64', 'linux-arm64'].every((k) => /^[0-9a-f]{64}$/.test(OWN_NODE.files[k]?.sha256 || '') && OWN_NODE.files[k].name.includes(OWN_NODE.version)) && nodeMajor(OWN_NODE.version) >= 20);
  check('...picked by the computer it\'s on', nodeFile('win', 'x64').name.endsWith('win-x64.zip') && nodeFile('mac', 'arm64').name.endsWith('darwin-arm64.tar.gz') && nodeFile('linux', 'arm64').name.endsWith('linux-arm64.tar.gz'));
  check('...only from nodejs.org over https', nodeAllowed(nodeUrl(nodeFile('win', 'x64'))) && !nodeAllowed('http://nodejs.org/x') && !nodeAllowed('https://nodejs.org.evil.example/x'));
  check('a Node 20 or newer already here is used; an older one isn\'t', (await findNode(c, { run: async () => 'v20.11.0', exists: () => false }))?.file === 'node' && (await findNode(c, { run: async () => 'v18.19.0', exists: () => false })) === null && (await findNode(c, { run: async () => null, exists: () => false })) === null);
  check('his own copy wins once he has one', (await findNode(c, { os_: 'win', arch: 'x64', exists: (p) => p.endsWith('node.exe'), run: async () => 'v18.0.0' }))?.own === true);
  const grabs = [];
  const fakeGrab = async (asset, dir) => { grabs.push(asset); const b = ownNodeBin(c, 'win', 'x64'); fs.mkdirSync(b, { recursive: true }); fs.writeFileSync(path.join(b, 'node.exe'), ''); };
  const got = await getOwnNode(c, { os_: 'win', arch: 'x64', grabImpl: fakeGrab });
  check('getting Node: the pinned file and checksum, into his own folder', got.own && grabs[0].pinnedSha256 === OWN_NODE.files['win-x64'].sha256 && grabs[0].browser_download_url === nodeUrl(OWN_NODE.files['win-x64']) && isInside(c.agentDir, got.file));
  check('git that\'s here is used', (await findGit(c, { os_: 'linux', run: async () => 'git version 2.43.0' }))?.file === 'git' && (await findGit(c, { os_: 'linux', run: async () => null })) === null);
  const gitGrabs = [];
  const gg = await getOwnGit(c, { os_: 'win', findImpl: async (e) => { check('Windows Git comes from Git for Windows\' own releases (MinGit)', e === MINGIT && MINGIT.repo === 'git-for-windows/git' && MINGIT.other[0].test('MinGit-2.51.0-64-bit.zip') && !MINGIT.other[0].test('MinGit-2.51.0-busybox-64-bit.zip')); return { rel: { tag_name: 'v2.51.0.windows.1' }, asset: { name: 'MinGit-2.51.0-64-bit.zip', size: 40, digest: 'sha256:' + 'a'.repeat(64) } }; }, grabImpl: async (asset) => { gitGrabs.push(asset); fs.mkdirSync(ownGitBin(c), { recursive: true }); fs.writeFileSync(path.join(ownGitBin(c), 'git.exe'), ''); } });
  check('...checked against GitHub\'s own sha256 and kept in his folder', gitGrabs[0].digest && gg.own && isInside(c.agentDir, gg.file));
  let opened = '';
  const mac = await getOwnGit(c, { os_: 'mac', runImpl: async (f, a) => { opened = [f, ...a].join(' '); return ''; } }).catch((e) => e.message);
  check('a Mac: Apple\'s installer opens, and Bob says to press Install', opened === 'xcode-select --install' && mac === GIT_MAC);
  check('Linux: says how, since it needs a password', (await getOwnGit(c, { os_: 'linux' }).catch((e) => e.message)) === GIT_LINUX && /sudo apt install git/.test(GIT_LINUX));
  const e1 = await ensureTool(c, 'node', { os_: 'win', arch: 'x64', run: async () => 'v22.1.0' });
  check('ensureTool: nothing fetched when it\'s here', e1.fetched === false);
  const env = toolPath(c, { Path: 'C:\\Windows' }, { os_: 'win' });
  check('commands in the code copy find his own Node and Git first (Windows keeps its Path key)', env.Path.split(';')[0] === ownNodeBin(c, 'win') && env.Path.split(';')[1] === ownGitBin(c) && env.Path.endsWith('C:\\Windows'));
  check('...and the PATH is left alone when he has none of his own', toolPath({ agentDir: path.join(tmp, 'none') }, { PATH: '/usr/bin' }, { os_: 'linux' }).PATH === '/usr/bin');
  check('only commands run inside the code copy get them', /isInside\(codeCopyRoot\(cfg\), cwd\) \? \{ env: toolPath\(cfg, safeEnv\(\)\) \}/.test(read('src/hands.js')));
  check('the job fetches what\'s missing only with Run programs on, and says so in the chat', /if \(runOn\) \{\n\s+for \(const \[which, label\] of \[\['git', 'Git'\], \['node', 'Node\.js'\]\]\)/.test(read('src/tools.js')) && /📦/.test(read('src/tools.js')));
}

// ---------- Long memory for this job ----------
{
  const lfit = (c, fits) => Brain.prototype.fitCtx.bind({ cfg: c, log: () => {}, engine: { maxCtx: async () => 262144, stretchMax: async (m, o) => (c.brainCtxStretch || o?.evenOff ? 1048576 : null), roomFor: async () => ({ fits, needGB: 40, roomGB: 30 }) } });
  const c = { selfWork: { enabled: true } };
  check('this job stretches to 512K even with the Long memory switch off', (await lfit(c, true)('bobert', 524288, { longRun: true })) === 524288);
  check('...or 1M when picked', (await lfit(c, true)('bobert', 1048576, { longRun: true })) === 1048576);
  check('...loads at 256K when it won\'t fit the card and RAM', (await lfit(c, false)('bobert', 524288, { longRun: true })) === 262144);
  check('...and other jobs never stretch by themselves', (await lfit(c, true)('bobert', 524288)) === 262144);
  const noStretch = Brain.prototype.fitCtx.bind({ cfg: c, log: () => {}, engine: { maxCtx: async () => 262144 } });
  check('...on an engine that can\'t stretch (Ollama), it stays at what the brain was made for', (await noStretch('qwen3.6:35b', 524288, { longRun: true })) === 262144);
  // The engine: the stretch goes on the command line with this switch on too (a size past 256K only gets here through this job).
  const u32 = (n) => { const b = Buffer.alloc(4); b.writeUInt32LE(n); return b; };
  const u64 = (n) => { const b = Buffer.alloc(8); b.writeBigUInt64LE(BigInt(n)); return b; };
  const str = (s) => Buffer.concat([u64(Buffer.byteLength(s)), Buffer.from(s)]);
  const f = path.join(tmp, 'q.gguf');
  const kvs = [['general.architecture', 8, str('qwen35moe')], ['qwen35moe.context_length', 4, u32(262144)]];
  fs.writeFileSync(f, Buffer.concat([Buffer.from('GGUF'), u32(3), u64(0), u64(kvs.length), ...kvs.flatMap(([k, t, v]) => [str(k), u32(t), v])]));
  const eng = (cc, ctx) => { const e = Object.create(LlamaCpp.prototype); e.cfg = { llamacpp: {}, ...cc }; return e.stretchArgs(f, ctx); };
  check('Bob\'s engine stretches to 512K with this switch on and Long memory off', eng({ selfWork: { enabled: true } }, 524288).join(' ') === '--rope-scaling yarn --rope-scale 2 --yarn-orig-ctx 262144');
  check('...and not with both off', eng({}, 524288).length === 0);
}

// ---------- Tools, words, Help ----------
{
  const brain = { cfg: { ...cfg, selfWork: { enabled: true } }, usable: (n) => n === 'work_on_myself' };
  check('"add a switch to yourself" finds the tool group', guessGroups(brain, 'can you add a switch to yourself to hide the cat').includes('selfwork'));
  check('"fix your own code" too', guessGroups(brain, 'fix your own code so the Lab tab loads').includes('selfwork'));
  check('...not plain coding in a project', !guessGroups(brain, 'fix the crash in my Unreal project').includes('selfwork'));
  const off = { cfg, usable: () => false };
  check('no group while it\'s off', !guessGroups(off, 'fix your own code').includes('selfwork'));
  const src = read('src/brain.js');
  check('the tool is hidden unless the switch is on and the copy is made', /!\(selfWorkOn\(this\.cfg\) && hasCodeCopy\(this\.cfg\)\) && 'work_on_myself'/.test(src));
  const tools = read('src/tools.js');
  check('new files in the code copy still show their card (the rest of the inn doesn\'t)', /!isInside\(codeCopyRoot\(cfg\), file\)\) return false/.test(tools));
  check('the job runs on the coding hat with the picked brain, Long memory and more steps', /runHat\('tinker', task, ctx, \{ model: pick\.id, cpu: false, think: true, ctx: want, longRun: true, maxSteps: SELF_STEPS \}\)/.test(tools));
  check('Bob knows whether it\'s on (his own settings lookup)', settingsNow({ ...cfg, selfWork: { enabled: true } }).includes('Let Bob work on his own app: on'));
  const ids = new Set(HELP.map((h) => h.id));
  check('Help, an FAQ and the settings list explain it', ids.has('self-work') && ids.has('faq-self-work') && HELP.some((h) => h.html.includes("set('Let Bob work on his own app'") || h.html.includes('Let Bob work on his own app')));
  check('...and the glossary has Code copy', HELP.find((h) => h.id === 'glossary')?.html.includes('<dt>Code copy</dt>'));
  const help = HELP.find((h) => h.id === 'self-work').html;
  check('Help says the running Bob stays locked, the brains, Long memory, getting Git and Node, and the phone', /stay locked/.test(help) && /Bobert/.test(help) && /Qwen3\.6 35B/.test(help) && /512K/.test(help) && /Node\.js 20/.test(help) && /own-tools/.test(help) && /nodejs\.org/.test(help) && /MinGit/.test(help) && /Android/.test(help));
  const ui = read('public/cellar.js');
  check('Settings has the switch, the brain, the size and Make the code copy', ui.includes("sswitch('selfWork'") && ui.includes('data-selfwork="model"') && ui.includes('data-selfwork="ctx"') && ui.includes('data-selfcopy'));
  check('Make the code copy works only on this replicant matrix, with the switch on', /\/api\/self-work\/copy'\) \{\n\s+if \(!isLocal\)/.test(read('src/server.js')) && /selfWork\?\.enabled !== true\) return send\(res, 409/.test(read('src/server.js')));
}

fs.rmSync(tmp, { recursive: true, force: true });
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

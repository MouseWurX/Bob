// llama.cpp's helper programs in Bob: finding them, gguf-split (brains in parts), llama-bench (the standard speed
// test), ggml-rpc-server (Bob-Net: lend my graphics card / spread big brains) and llama-diffusion-cli (diffusion
// brains). Nothing here runs a real program or reads the real computer: tools, folders, networks and processes are fakes.
import { labText } from './source-text.js';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { EventEmitter } from 'node:events';
import { fileURLToPath } from 'node:url';
import { findTool, toolDirs, exeFor, runTool, missingWords, isDiffusion } from '../src/llama-tools.js';
import { partsOf, joinedName, joinArgs, splitArgs, needsSplitForUpload, joinParts } from '../src/lab-split.js';
import { benchArgs, readBench, benchLine, benchBrain } from '../src/lab-bench.js';
import { CardLender, CardBorrower, wantsSpread, lendCardOn, lendCardRoute, RPC_PORT, INNER_PORT, admit, isHomeIp, pickHome, homeIps, openGate, udpRelay, scutOn, scutMbps, scutEnv, SCUT_MBPS, findOwnBrain, cleanBrain, cardStoreDir } from '../src/share-card.js';
import { cleanSharePatch, shareView, Lenders } from '../src/share-brains.js';
import { cleanPhonePatch, phoneView } from '../src/phone-access.js';
import { diffusionArgs, readFrames } from '../src/lab-diffusion.js';
import { mergeScores } from '../src/lab-challenges.js';

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('PASS', m); } else { fail++; console.log('FAIL', m); } };
const here = path.dirname(fileURLToPath(import.meta.url));
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bob-llama-tools-'));
const read = (f) => fs.readFileSync(f, 'utf8').replace(/\r\n/g, '\n');

// ---- finding the tools ----
{
  const cfg = { agentDir: path.join(tmp, 'agent'), llamacpp: { exe: path.join(tmp, 'agent', 'llama.cpp', 'llama-server') } };
  const dirs = toolDirs(cfg);
  ok(dirs.length === 2 && dirs[0].endsWith('llama.cpp') && dirs[1].endsWith('brain-engine'), 'tools: the built-in engine\'s folder first, then Brain Engine\'s');
  const have = new Set([path.join(dirs[1], 'ggml-rpc-server'), path.join(dirs[0], 'llama-bench'), path.join(dirs[1], 'llama-bench')]);
  const o = { dirs, exists: (p) => have.has(p), platform: 'linux' };
  ok(findTool(cfg, 'bench', o).path === path.join(dirs[0], 'llama-bench'), 'tools: llama-bench from the built-in engine when both have it');
  ok(findTool(cfg, 'rpc', o).found && findTool(cfg, 'rpc', o).dir === dirs[1], 'tools: ggml-rpc-server found in Brain Engine\'s folder');
  have.add(path.join(dirs[0], 'rpc-server'));
  ok(findTool(cfg, 'rpc', o).path === path.join(dirs[0], 'rpc-server'), 'tools: the older name rpc-server counts too');
  ok(!findTool(cfg, 'diffusion', o).found, 'tools: the diffusion runner missing is said');
  ok(/Brain Engine/.test(missingWords('diffusion')) && /official/.test(missingWords('diffusion')), 'tools: the diffusion runner comes only with Brain Engine, in words');
  ok(exeFor('llama-bench', 'win32') === 'llama-bench.exe' && exeFor('llama-bench', 'linux') === 'llama-bench', 'tools: .exe on Windows only');
  ok(isDiffusion('LLaDA') && isDiffusion('dream') && !isDiffusion('qwen3moe'), 'tools: diffusion brains by their architecture');
}

// ---- the Brain Engine build ships them ----
{
  const wf = read(path.join(here, '..', '..', '.github', 'workflows', 'brain-engine.yml'));
  for (const t of ['llama-bench', 'llama-gguf-split', 'ggml-rpc-server', 'llama-diffusion-cli']) ok((wf.match(new RegExp(t, 'g')) || []).length >= 4, `Brain Engine build: builds and packs ${t} (Windows and Linux)`);
  ok((wf.match(/-DGGML_RPC=ON -DLLAMA_BUILD_EXAMPLES=ON/g) || []).length === 2, 'Brain Engine build: RPC and the examples (the diffusion runner) on, both systems');
  ok((wf.match(/set\(BUILD_NUMBER \$\{tag#b\}\)/g) || []).length === 2, 'Brain Engine build: --version says the tag\'s build number, not "build 1" from the one-commit clone, both systems');
  ok((wf.match(/out=brain-engine-\$BEV-/g) || []).length === 2 && (wf.match(/publish\.sh "\$BEV" "\$TAG"/g) || []).length === 2 && /bob\.brainEngineVersion/.test(wf), 'Brain Engine build: files and release take its own name (brain-engine-<N>b<llama.cpp build>), built on the tested llama.cpp tag');
  const pub = read(path.join(here, '..', 'engine', 'publish.sh'));
  ok(/ver="\$1"; tag="\$2"; file="\$3"/.test(pub) && /rel="brain-engine-\$ver"/.test(pub) && /Brain Engine \$\{ver#v\} \(Brain Engine \$\{ver%%b\*\} on llama\.cpp \$tag/.test(pub), 'publish.sh names the release by Brain Engine\'s own version');
  const pkg = JSON.parse(read(path.join(here, '..', 'package.json')));
  ok(Number.isInteger(pkg.bob.brainEngineVersion) && pkg.bob.brainEngineVersion >= 3, 'package.json carries Brain Engine\'s own version number');
  const cel = read(path.join(here, '..', 'public', 'cellar.js'));
  ok(/brain-engine-v\(\\d\+\)\$/.test(cel) && /built on llama\.cpp \$\{e\.basedOn\}/.test(cel), 'Settings, Engines says "version N, built on llama.cpp bNNNN", not the file tag');
  const readme = read(path.join(here, '..', 'engine', 'README.md'));
  ok(/ggml-rpc-server/.test(readme) && /llama-diffusion-cli/.test(readme) && /Tailscale/.test(readme), 'Brain Engine README: lists the new tools and how the card server is kept to Tailscale');
}

// ---- brains in parts (llama-gguf-split) ----
{
  const dir = path.join(tmp, 'parts');
  fs.mkdirSync(dir, { recursive: true });
  const names = [1, 2, 3].map((i) => path.join(dir, `Brain-BF16-0000${i}-of-00003.gguf`));
  names.forEach((f, i) => fs.writeFileSync(f, Buffer.alloc(1000 + i)));
  const p = partsOf(names[1]);
  ok(p && p.n === 3 && p.first === names[0] && !p.missing.length, 'split: any part finds all three');
  ok(partsOf(path.join(dir, 'Brain-BF16.gguf')) === null, 'split: a whole file isn\'t parts');
  ok(joinedName(names[0], '/x') === path.join('/x', 'Brain-BF16.gguf'), 'split: the joined file is named without the part numbers');
  ok(JSON.stringify(joinArgs('a', 'b')) === '["--merge","a","b"]', 'split: join is --merge first-part out');
  ok(splitArgs('f.gguf', 'out').join(' ') === '--split --split-max-size 45G f.gguf out', 'split: uploads go up in 45 GB parts');
  ok(needsSplitForUpload(60e9) && !needsSplitForUpload(30e9), 'split: only files near or over 50 GB are split for Hugging Face');
  const tool = { found: true, path: '/fake/llama-gguf-split' };
  // A fake tool that joins by concatenating (close enough for the size check)
  const run = async (exe, args) => { const [, first, out] = args; const pp = partsOf(first); fs.writeFileSync(out, Buffer.concat(pp.files.map((f) => fs.readFileSync(f)))); return { code: 0, out: '', err: '' }; };
  const out = path.join(tmp, 'joined');
  let r = await joinParts({}, names[0], { outDir: out, tool, run, freeBytes: 1e12 });
  ok(r.ok && fs.existsSync(path.join(out, 'Brain-BF16.gguf')) && names.every((f) => fs.existsSync(f)), 'split: joined into the Lab\'s folder; your parts stay');
  r = await joinParts({}, names[0], { outDir: out, tool, run, freeBytes: 1e12 });
  ok(!r.ok && r.keepParts && /already there/.test(r.error), 'split: never writes over a joined file');
  fs.rmSync(out, { recursive: true });
  r = await joinParts({}, names[0], { outDir: out, tool, run, freeBytes: 100 });
  ok(!r.ok && /GB free/.test(r.error), 'split: says when there\'s no room, and keeps the parts');
  r = await joinParts({}, names[0], { outDir: out, tool: { found: false }, run, freeBytes: 1e12 });
  ok(!r.ok && /isn't here/.test(r.error), 'split: says when the tool isn\'t here');
  r = await joinParts({}, names[0], { outDir: out, tool, run: async () => ({ code: 1, err: 'boom' }), freeBytes: 1e12 });
  ok(!r.ok && names.every((f) => fs.existsSync(f)) && !fs.existsSync(path.join(out, 'Brain-BF16.gguf')), 'split: a failed join leaves the parts and no half file');
  r = await joinParts({}, names[0], { outDir: dir, dropParts: true, tool, run, freeBytes: 1e12 });
  ok(r.ok && names.every((f) => !fs.existsSync(f)), 'split: a download\'s parts go once the join checks out');
  fs.unlinkSync(path.join(dir, 'Brain-BF16.gguf'));
  fs.writeFileSync(names[0], 'x');
  r = await joinParts({}, names[0], { outDir: out, tool, run, freeBytes: 1e12 });
  ok(!r.ok && /2 of its 3 parts/.test(r.error), 'split: missing parts are named');
  const sh = read(path.join(here, '..', 'model-lab', 'forge', 'pod', 'run.sh'));
  ok(/--split-max-size 45G/.test(sh) && /--exclude/.test(sh) && /49000000000/.test(sh), 'Forge: a GGUF over 50 GB goes up to Hugging Face in parts, the whole file left out');
}

// ---- the standard speed test (llama-bench) ----
{
  const a = benchArgs('/m/b.gguf');
  ok(a.join(' ') === '-m /m/b.gguf -p 512 -n 128 -r 3 -o json -fitt 1024', 'bench: pp512 and tg128, three runs, JSON, placed like Bob does');
  ok(benchArgs('/m/b.gguf', { cpu: true }).includes('-ngl'), 'bench: processor only when asked');
  const json = 'load stuff\n[\n {"build_number": 12032, "n_prompt": 512, "n_gen": 0, "avg_ts": 1834.56, "backends": "CUDA"},\n {"build_number": 12032, "n_prompt": 0, "n_gen": 128, "avg_ts": 87.512}\n]\n';
  const b = readBench(json);
  ok(b.read === 1834.6 && b.write === 87.5 && b.prompt === 512 && b.gen === 128 && b.build === '12032', 'bench: reads the read and write speeds');
  ok(readBench('no json') === null && readBench('[]') === null, 'bench: nothing to read is null');
  ok(benchLine(b) === 'Standard speed (llama-bench): reads 1,834.6 and writes 87.5 words a second (pp512 / tg128)', 'bench: one plain line');
  let r = await benchBrain({}, '/m/b.gguf', { tool: { found: true, path: '/fake/llama-bench' }, run: async () => ({ code: 0, out: json, err: '' }) });
  ok(r.ok && r.write === 87.5, 'bench: a run gives the numbers');
  r = await benchBrain({}, '/m/b.gguf', { tool: { found: true, path: '/fake/llama-bench' }, run: async () => ({ code: 1, out: '', err: 'line\nout of memory' }) });
  ok(!r.ok && /out of memory/.test(r.error), 'bench: a failed run says why');
  r = await benchBrain({}, '/m/b.gguf', { tool: { found: false } });
  ok(!r.ok && /isn't here/.test(r.error), 'bench: no tool, said plainly');
  const m = mergeScores({ speed: { tps: 50 } }, { name: 'B', packs: {}, when: '2026-11-09', bench: b });
  ok(m.speed.tps === 50 && m.speed.bench.read === 1834.6 && m.speed.bench.when === '2026-11-09', 'bench: kept on the scoreboard beside the Challenges speed');
  const lab = labText();
  ok(/const bench = c\.bench === true/.test(lab), 'bench: off unless ticked');
}

// ---- runTool with a fake process ----
{
  const fake = () => { const c = new EventEmitter(); c.stdout = new EventEmitter(); c.stderr = new EventEmitter(); c.kill = () => c.emit('close', null); setTimeout(() => { c.stdout.emit('data', 'a\nb'); c.stderr.emit('data', '\rc\n'); c.emit('close', 0); }, 5); return c; };
  const lines = [];
  const r = await runTool('/x/tool', [], { spawnFn: fake, onLine: (l) => lines.push(l) });
  ok(r.code === 0 && r.out === 'a\nb' && lines.join(',') === 'a,c,b', 'runTool: output and lines (\\r progress counts as a line)');
}

// ---- Bob-Net: lend my graphics card / spread big brains ----
{
  const file = path.join(tmp, 'cfg.json'); fs.writeFileSync(file, '{}');
  const cfg = { configFile: file, remote: { enabled: true, passcode: 'secret-1' }, share: {}, gpuVramGB: 16 };
  ok(!lendCardOn(cfg) && shareView(cfg).lendCard === false && shareView(cfg).spread === 'off', 'card: both off to start with');
  let p = cleanSharePatch(cfg, { lendCard: true });
  ok(p.share.lendCard === true, 'card: Lend my graphics card switches on');
  ok(cleanSharePatch(cfg, { spread: 'sideways' }).error, 'card: an unknown spread choice is refused');
  ok(/Add one of your other Bobs/.test(cleanSharePatch(cfg, { spread: 'big' }).error || ''), 'card: spreading needs a Bob on the list');
  ok(shareView(cfg).mode === 'more', 'mode: More Bobs to start with');
  ok(cleanSharePatch(cfg, { mode: 'huge' }).error, 'mode: an unknown mode is refused');
  ok(/Add one of your other Bobs/.test(cleanSharePatch(cfg, { mode: 'bigger' }).error || ''), 'mode: Bigger Bobs needs a Bob on the list');
  {
    const withBob = { ...cfg, share: { borrow: { bobs: [{ name: 'Go', address: 'go.example.ts.net:7777', passcode: 'secret-2' }] } } };
    const big = cleanSharePatch(withBob, { mode: 'bigger' }).share;
    ok(big.lendCard === true && big.spread === 'toobig' && shareView({ ...withBob, share: big }).mode === 'bigger', 'mode: Bigger Bobs lends the card, and spreads only brains that don\'t fit this card and memory (loading here was 6 times quicker)');
    ok(cleanSharePatch({ ...withBob, share: { ...big, spread: 'toobig' } }, { mode: 'bigger' }).share.spread === 'toobig', 'mode: Bigger Bobs keeps a spread choice already made');
    const more = cleanSharePatch({ ...withBob, share: big }, { mode: 'more' }).share;
    ok(more.lendCard === false && more.spread === 'off' && more.borrow.bobs.length === 1, 'mode: More Bobs turns both off and keeps the list');
  }
  cfg.share = p.share;
  ok(lendCardOn(cfg), 'card: on with the door open');
  ok(!lendCardOn({ ...cfg, remote: { enabled: false } }), 'card: never with the door shut');

  ok(!wantsSpread({ share: { spread: 'off' } }, { sizeGB: 90, cardGB: 16, ramGB: 32 }), 'spread: off never spreads');
  ok(!wantsSpread({ sharedGraphics: true, share: { spread: 'big' } }, { sizeGB: 2.3, cardGB: 4, ramGB: 16 }) && !wantsSpread({ share: { spread: 'big' } }, { sizeGB: 2.3, cardGB: 0, ramGB: 16 }), 'spread: a handheld with built-in graphics (or no card known) never spreads a small brain that fits it, even on "bigger than my card" (the 1.5.193 handheld spread its 2.3 GB chat brain over Wi-Fi)');
  ok(wantsSpread({ sharedGraphics: true, share: { spread: 'big' } }, { sizeGB: 20, cardGB: 4, ramGB: 16 }) && !wantsSpread({ sharedGraphics: true, share: { spread: 'toobig' } }, { sizeGB: 7, cardGB: 4, ramGB: 16 }), 'spread: with built-in graphics, only a brain too big for its memory spreads');
  ok(wantsSpread({ share: { spread: 'toobig' } }, { sizeGB: 50, cardGB: 16, ramGB: 32 }) && !wantsSpread({ share: { spread: 'toobig' } }, { sizeGB: 20, cardGB: 16, ramGB: 32 }), 'spread: "too big" means more than card and memory hold');
  ok(wantsSpread({ share: { spread: 'big' } }, { sizeGB: 20, cardGB: 16, ramGB: 32 }) && !wantsSpread({ share: { spread: 'big' } }, { sizeGB: 9, cardGB: 16, ramGB: 32 }), 'spread: "bigger than my card" means more than the card');

  const spawned = [];
  const spawnFn = (exe, args, opts = {}) => { const c = new EventEmitter(); c.stdout = new EventEmitter(); c.stderr = new EventEmitter(); c.exitCode = null; c.kill = () => { c.exitCode = 0; c.emit('exit', 0); }; spawned.push({ exe, args, c, env: opts.env || {} }); setTimeout(() => c.stderr.emit('data', 'Starting RPC server v3.0.0\n  endpoint : x\n'), 2); return c; };
  let gamingNow = false;
  const gates = [];
  const gate = async (o) => { const g = { ...o, open: true, close() { g.open = false; } }; gates.push(g); return g; };
  const H = (...x) => x.join('.'); // home-network addresses, built so no real one sits in the file
  const myHome = [{ address: H(192, 168, 4, 185), netmask: '255.255.255.0' }];
  const lender = new CardLender(cfg, { spawnFn, tool: () => ({ found: true, path: '/be/ggml-rpc-server' }), ips: () => ['100.101.1.2'], home: () => myHome, gate, gaming: () => gamingNow });
  let r = await lender.open({ localAddr: H(192, 168, 1, 5), remoteAddr: H(192, 168, 1, 6) });
  ok(!r.ok && r.why === 'not tailscale' && !spawned.length, 'card: the asking only comes through the Tailscale door');
  r = await lender.open({ localAddr: '::ffff:100.104.9.9', remoteAddr: '100.102.0.7' });
  ok(!r.ok && r.why === 'not tailscale', 'card: only on this machine\'s own Tailscale address');
  r = await lender.open({ localAddr: '::ffff:100.101.1.2', remoteAddr: '::ffff:100.102.0.7', from: 'Legion Go' });
  ok(r.ok && r.host === '100.101.1.2' && r.port === RPC_PORT && r.via === 'tailscale', 'card: no home network offered, it opens on the Tailscale address it was asked on');
  ok(spawned.length === 1 && spawned[0].args.join(' ') === `-H 127.0.0.1 -p ${INNER_PORT} -c`, 'card: the card server itself listens on this machine only');
  ok(gates.length === 1 && gates[0].host === '100.101.1.2' && gates[0].allow === '100.102.0.7' && gates[0].port === RPC_PORT, 'card: the gate lets in only the Bob that asked');
  r = await lender.open({ localAddr: '100.101.1.2', remoteAddr: '100.102.0.7' });
  ok(r.ok && spawned.length === 1, 'card: asked again, the same server carries on');
  r = await lender.open({ localAddr: '100.101.1.2', remoteAddr: '100.102.0.7', home: [H(192, 168, 4, 189)] });
  ok(r.ok && r.via === 'home' && r.host === H(192, 168, 4, 185) && gates.at(-1).allow === H(192, 168, 4, 189) && !gates[0].open, 'card: on the same home network, the gate moves there, for that Bob only');
  r = await lender.open({ localAddr: '100.101.1.2', remoteAddr: '100.102.0.7', home: [H(10, 0, 0, 9), '8.8.8.8'] });
  ok(r.ok && r.via === 'tailscale', 'card: a different home network, or a public address, stays on Tailscale');
  {
    // 1.5.210 (Go Wi-Fi test): a lender holding its own brain lets it go before the lend starts.
    let freed = 0; const said = [];
    const holder = new CardLender(cfg, { spawnFn, tool: () => ({ found: true, path: '/x' }), ips: () => ['100.101.1.2'], home: () => myHome, gate, freeOwn: async () => { freed++; return true; }, log: (k, t) => said.push(t) });
    const rr = await holder.open({ localAddr: '100.101.1.2', remoteAddr: '100.102.0.9' });
    ok(rr.ok && freed === 1 && said.some((t) => /let go of my own brain first/.test(t)), 'card: a lender holding its own brain lets it go first, and says so');
    holder.close();
  }
  {
    const noHome = new CardLender({ ...cfg, share: { ...cfg.share, homeNet: false } }, { spawnFn, tool: () => ({ found: true, path: '/x' }), ips: () => ['100.101.1.2'], home: () => myHome, gate });
    ok((await noHome.open({ localAddr: '100.101.1.2', remoteAddr: '100.102.0.7', home: [H(192, 168, 4, 189)] })).via === 'tailscale', 'card: Use the home network first off, Tailscale only');
    noHome.close();
  }
  ok(admit('100.102.0.7', '::ffff:100.102.0.7') && !admit('100.102.0.7', '100.102.0.8') && !admit('', '100.102.0.7'), 'card: the gate turns everyone else away');
  {
    // The real gate, on this machine's loopback only: the allowed address gets through to the card server, others don't.
    const net = await import('node:net');
    const echo = net.createServer((c) => c.pipe(c)); await new Promise((ok2) => echo.listen(0, '127.0.0.1', ok2));
    const talk = (port) => new Promise((ok2) => { const c = net.connect({ host: '127.0.0.1', port }, () => c.write('hi')); let got = ''; c.on('data', (d) => { got += d; c.end(); }); c.on('close', () => ok2(got)); c.on('error', () => ok2('')); setTimeout(() => { c.destroy(); ok2(got); }, 1500); });
    let g = await openGate({ host: '127.0.0.1', port: 0, allow: '127.0.0.1', inner: echo.address().port });
    ok(await talk(g.port) === 'hi', 'card gate: the Bob that asked gets through to the card server');
    g.close();
    g = await openGate({ host: '127.0.0.1', port: 0, allow: '100.102.0.7', inner: echo.address().port });
    ok(await talk(g.port) === '', 'card gate: anyone else is turned away at the door');
    g.close(); echo.close();
  }
  // SCUT: Bob's fast link (Brain Engine patch 0005), off unless switched on, on both Bobs.
  ok(!scutOn(cfg) && !Object.keys(scutEnv(cfg)).length && !('GGML_RPC_SCUT' in (spawned[0].env || {})), 'SCUT: off unless switched on, so the engines are started as before');
  ok(gates.every((g) => g.udp === false), 'SCUT: off, the gate opens no UDP side');
  {
    const on = { ...cfg, share: { ...cfg.share, scut: true } };
    ok(scutMbps(on) === 100 && scutMbps({ share: { scutMbps: 300 } }) === 300 && scutMbps({ share: { scutMbps: 9999 } }) === 100 && scutMbps({ share: { scutMbps: 400 } }) === 400 && SCUT_MBPS.join() === '50,100,300,400', 'SCUT: the speed cap is 50, 100, 300 or 400 Mbit/s, 100 unless picked');
    const e = scutEnv(on, { lend: true });
    ok(e.GGML_RPC_SCUT === '1' && e.GGML_RPC_SCUT_MBPS === '100' && e.GGML_RPC_SCUT_PUBLIC_PORT === String(RPC_PORT) && !('GGML_RPC_SCUT_PUBLIC_PORT' in scutEnv(on)), 'SCUT: the lent card names the gate\'s port in its offer; the borrowing engine only switches it on');
    const sp = [], gs = [];
    const l2 = new CardLender(on, { spawnFn: (x, a, o) => { const c = spawnFn(x, a, o); sp.push(o); return c; }, tool: () => ({ found: true, path: '/be/ggml-rpc-server' }), ips: () => ['100.101.1.2'], home: () => myHome, gate: async (o) => { gs.push(o); return { ...o, udp: true, close() {} }; }, env: { PATH: '/bin' } });
    const r2 = await l2.open({ localAddr: '100.101.1.2', remoteAddr: '100.102.0.7' });
    ok(r2.ok && sp[0].env.GGML_RPC_SCUT === '1' && sp[0].env.PATH === '/bin' && gs[0].udp === true, 'SCUT: on, the card server gets it and the gate passes UDP too');
    l2.close();
  }
  {
    // Send the brain early: the lender fills its card store from its own copy of the brain first (Brain Engine --seed).
    const dir = path.join(tmp, 'seed'), models = path.join(dir, 'models', 'bob', 'chat');
    fs.mkdirSync(models, { recursive: true });
    const brainFile = path.join(models, 'big-brain-Q4.gguf'); fs.writeFileSync(brainFile, Buffer.alloc(4096, 1));
    const on = { ...cfg, dataDir: dir, bobModelsDir: path.join(dir, 'models', 'bob'), share: { ...cfg.share, scut: true } };
    ok(findOwnBrain(on, { file: 'big-brain-Q4.gguf', bytes: 4096 }) === brainFile, 'send early: the lender finds its own copy by name and size');
    ok(!findOwnBrain(on, { file: 'big-brain-Q4.gguf', bytes: 4097 }) && !findOwnBrain(on, { file: '../../secret.gguf', bytes: 4096 }) && !findOwnBrain(on, { file: 'notes.txt', bytes: 4096 }), 'send early: a different size, a path, or a file that is not a brain finds nothing');
    ok(cleanBrain({ file: '/a/b/x.gguf', bytes: 5 }).file === 'x.gguf' && cleanBrain({ file: 'x.exe', bytes: 5 }) === null && cleanBrain({ file: 'x.gguf', bytes: -1 }) === null, 'send early: only a brain\'s file name and size are taken from the asker');
    ok(cardStoreDir({ LLAMA_CACHE: '/c' }, 'linux', '/h') === path.join('/c', 'rpc') && cardStoreDir({}, 'linux', '/h') === path.join('/h', '.cache', 'llama.cpp', 'rpc') && cardStoreDir({ LOCALAPPDATA: 'L' }, 'win32', '/h') === path.join('L', 'llama.cpp', 'rpc'), 'send early: the card store is where the engine keeps it');
    const runs = [];
    const seedSpawn = (x, a, o) => { if (a[0] === '--seed') { runs.push(a); const c = new EventEmitter(); c.stdout = new EventEmitter(); c.stderr = new EventEmitter(); c.exitCode = null; c.kill = () => {}; setTimeout(() => { c.stdout.emit('data', 'seed: done\n'); c.exitCode = 0; c.emit('exit', 0); }, 2); return c; } return spawnFn(x, a, o); };
    const mk = (c, o = {}) => new CardLender(c, { spawnFn: seedSpawn, tool: () => ({ found: true, path: '/be/ggml-rpc-server' }), ips: () => ['100.101.1.2'], home: () => myHome, gate: async (g) => ({ ...g, udp: true, close() {} }), env: {}, free: () => 100e9, ...o });
    const brain = { file: 'big-brain-Q4.gguf', bytes: 4096 };
    let l3 = mk(on);
    let r3 = await l3.open({ localAddr: '100.101.1.2', remoteAddr: '100.102.0.7', brain });
    ok(r3.ok && r3.seeded === 'seeded' && runs.length === 1 && runs[0].join(' ') === `--seed ${brainFile} -c`, 'send early: the lender loads the brain from its own copy before the card server starts');
    l3.close();
    l3 = mk(on);
    r3 = await l3.open({ localAddr: '100.101.1.2', remoteAddr: '100.102.0.7', brain });
    ok(r3.seeded === 'already' && runs.length === 1, 'send early: once per brain, remembered across restarts');
    l3.close();
    fs.rmSync(path.join(dir, 'seeded-brains.json'));
    l3 = mk(on, { free: () => 5e9 });
    r3 = await l3.open({ localAddr: '100.101.1.2', remoteAddr: '100.102.0.7', brain });
    ok(r3.ok && r3.seeded === 'no room' && runs.length === 1, 'send early: never when the disk would be left with less than 10 GB; the brain just comes over the network');
    l3.close();
    l3 = mk({ ...on, share: { ...on.share, scut: false } });
    r3 = await l3.open({ localAddr: '100.101.1.2', remoteAddr: '100.102.0.7', brain });
    ok(r3.ok && !r3.seeded && runs.length === 1, 'send early: off with SCUT off');
    l3.close();
    const sent = [];
    const one = { bobs: () => [{ name: 'Go', address: '100.102.0.7:7777' }], call: async (bob, p, o) => { sent.push(o); return { ok: true, json: async () => ({ ok: true, host: '100.102.0.7', port: RPC_PORT }) }; } };
    const b1 = new CardBorrower({ ...on, share: { ...on.share, spread: 'toobig' }, gpuVramGB: 16 }, one, { home: () => [] });
    await b1.open({ sizeGB: 200, file: brainFile });
    ok(sent[0].body.brain?.file === 'big-brain-Q4.gguf' && sent[0].body.brain.bytes === 4096 && sent[0].timeout > 60000, 'send early: with SCUT on, the borrower names the brain (file name and size only) and waits while it loads');
    b1.close(); sent.length = 0;
    const b2 = new CardBorrower({ share: { spread: 'toobig' }, gpuVramGB: 16 }, one, { home: () => [] });
    await b2.open({ sizeGB: 200, file: brainFile });
    ok(!('brain' in sent[0].body) && sent[0].timeout === 8000, 'send early: with SCUT off, nothing about the brain is sent');
    b2.close();
    // 1.5.210 (PC test): a Bob that won't lend is named in the logbook with why, instead of a quiet load here.
    const said = [];
    const no = { bobs: () => [{ name: 'Go', address: '100.102.0.7:7777' }], call: async () => ({ ok: true, json: async () => ({ ok: false, why: 'off' }) }) };
    const b3 = new CardBorrower({ share: { spread: 'toobig' }, gpuVramGB: 16 }, no, { home: () => [], log: (k, t) => said.push(t) });
    const h3 = await b3.open({ sizeGB: 200 });
    ok(h3.length === 0 && said.some((t) => /skipped Go \(lending is off there\)/.test(t)), 'spread: a Bob that didn\'t lend is named, with why');
  }
  {
    // The real UDP half of the gate, on loopback: the asking Bob's datagrams reach the card server and its answers come back; anyone else's don't.
    const dgram = await import('node:dgram');
    const card = dgram.createSocket('udp4'); card.on('message', (m, r) => card.send(Buffer.concat([Buffer.from('re:'), m]), r.port, r.address));
    await new Promise((ok2) => card.bind(0, '127.0.0.1', ok2));
    const ask = (port) => new Promise((ok2) => { const c = dgram.createSocket('udp4'); let got = ''; c.on('message', (m) => { got = String(m); c.close(); ok2(got); }); c.send('hi', port, '127.0.0.1'); setTimeout(() => { try { c.close(); } catch {} ok2(got); }, 600); });
    let relay = await udpRelay({ host: '127.0.0.1', port: 0, allow: '127.0.0.1', inner: card.address().port });
    ok(await ask(relay.port) === 're:hi', 'SCUT gate: the Bob that asked reaches the card server over UDP, and hears back');
    relay.close();
    const seen = [];
    relay = await udpRelay({ host: '127.0.0.1', port: 0, allow: '100.102.0.7', inner: card.address().port, log: (a, b) => seen.push(b) });
    ok(await ask(relay.port) === '' && seen.some((x) => /turned away UDP/.test(x)), 'SCUT gate: anyone else\'s UDP is turned away');
    relay.close(); card.close();
  }
  ok(/if \(helpers\.length\) env = \{ \.\.\.env, \.\.\.scutEnv\(this\.cfg\)[, }]/.test(read(path.join(here, '..', 'src', 'llamacpp.js'))), 'SCUT: the engine that spreads a brain switches it on only with helpers');
  ok(isHomeIp(H(192, 168, 0, 1)) && isHomeIp(H(10, 1, 2, 3)) && isHomeIp(H(172, 20, 0, 1)) && !isHomeIp(H(172, 32, 0, 1)) && !isHomeIp('100.101.1.2') && !isHomeIp('8.8.8.8'), 'card: what counts as a home-network address');
  ok(pickHome(myHome, [H(192, 168, 5, 9)]) === null && pickHome(myHome, [H(192, 168, 4, 9)]).peer === H(192, 168, 4, 9), 'card: same home network means same subnet');
  ok(homeIps({ eth: [{ family: 'IPv4', address: H(192, 168, 4, 185), netmask: '255.255.255.0', internal: false }], ts: [{ family: 'IPv4', address: '100.101.1.2', netmask: '255.192.0.0' }], lo: [{ family: 'IPv4', address: '127.0.0.1', internal: true }] }).map((x) => x.address).join() === H(192, 168, 4, 185), 'card: this machine\'s home-network addresses leave out Tailscale and loopback');
  gamingNow = true;
  const lastGate = gates.at(-1);
  ok(lender.keep() === false && !lender.child && !lastGate.open, 'card: Gaming takes the card back at the next word, gate and all');
  r = await lender.open({ localAddr: '100.101.1.2', remoteAddr: '100.102.0.7' });
  ok(!r.ok && r.why === 'gaming', 'card: says no while gaming');
  gamingNow = false;
  const res = await lendCardRoute(lender, { socket: { localAddress: '100.101.1.2', remoteAddress: '100.102.0.7' } }, { action: 'open', home: [H(192, 168, 4, 189)] });
  ok(res.status === 200 && res.body.ok && res.body.via === 'home', 'card: the route opens it, home network first');
  await lendCardRoute(lender, {}, { action: 'close' });
  ok(!lender.child && !gates.at(-1).open, 'card: the route closes it');
  ok((await lendCardRoute(lender, {}, { action: 'rm -rf' })).status === 400, 'card: unknown actions are refused');
  const off = new CardLender({ ...cfg, share: {} }, { spawnFn, tool: () => ({ found: true, path: '/x' }), ips: () => ['100.101.1.2'] });
  ok((await off.open({ localAddr: '100.101.1.2', remoteAddr: '100.102.0.7' })).why === 'off', 'card: switch off, nothing opens');

  // The borrowing side, with a fake Bob-Net
  const bobs = [{ name: 'Go', address: '100.102.0.7:7777' }, { name: 'Phone', address: '100.103.0.9:7777' }];
  const calls = [];
  const lenders = { bobs: () => bobs, call: async (bob, p, o) => { calls.push([bob.name, o.body.action]); const host = bob.address.split(':')[0]; const j = bob.name === 'Go' ? { ok: true, host, port: RPC_PORT } : { ok: false, why: 'off' }; return { ok: true, json: async () => j }; } };
  const bcfg = { share: { spread: 'toobig' }, gpuVramGB: 16 };
  const bw = new CardBorrower(bcfg, lenders, { name: () => 'PC', home: () => [] });
  let at = await bw.open({ sizeGB: 10 });
  ok(!at.length && !calls.length, 'spread: a brain that fits isn\'t spread, and nobody is asked');
  at = await bw.open({ sizeGB: 200 });
  ok(at.length === 1 && at[0] === `100.102.0.7:${RPC_PORT}`, 'spread: only the Bob that lent his card is used');
  bw.close();
  ok(calls.filter((c) => c[1] === 'close').length === 1, 'spread: the lent card is handed back');
  await bw.open({ sizeGB: 200 }); bw.failed();
  calls.length = 0;
  at = await bw.open({ sizeGB: 200 });
  ok(!at.length && !calls.some((c) => c[0] === 'Go'), 'spread: a card that failed a load isn\'t asked again for a while');
  const sneaky = { bobs: () => [bobs[0]], call: async () => ({ ok: true, json: async () => ({ ok: true, host: '8.8.8.8', port: 1 }) }) };
  ok(!(await new CardBorrower(bcfg, sneaky, { home: () => [] }).open({ sizeGB: 200 })).length, 'spread: a card server on another address than the Bob we reach is never used');
  {
    const sent = [];
    const homeBob = { bobs: () => [bobs[0]], call: async (bob, p, o) => { sent.push(o.body); if (o.body.action !== 'open') return { ok: true, json: async () => ({ ok: true }) }; return { ok: true, json: async () => (o.body.home.length ? { ok: true, host: H(192, 168, 4, 189), port: RPC_PORT, via: 'home' } : { ok: true, host: '100.102.0.7', port: RPC_PORT, via: 'tailscale' }) }; } };
    const hb = new CardBorrower(bcfg, homeBob, { home: () => myHome });
    let at2 = await hb.open({ sizeGB: 200 });
    ok(sent[0].home.join() === H(192, 168, 4, 185) && at2[0] === `${H(192, 168, 4, 189)}:${RPC_PORT}`, 'spread: on the same home network, the card is reached over it');
    hb.failed({ route: true }); sent.length = 0;
    at2 = await hb.open({ sizeGB: 200 });
    ok(!sent.find((b) => b.action === 'open').home.length && at2[0] === `100.102.0.7:${RPC_PORT}`, 'spread: the home network could not reach the card, so the next load goes over Tailscale');
    hb.close();
    const hb2 = new CardBorrower(bcfg, homeBob, { home: () => myHome });
    await hb2.open({ sizeGB: 200 }); hb2.failed(); sent.length = 0;
    ok(!(await hb2.open({ sizeGB: 200 })).length && !sent.some((b) => b.action === 'open'), 'spread: a load that ran out of room on his card isn\'t tried again over Tailscale right away');
    hb2.close();
    const far = { bobs: () => [bobs[0]], call: async () => ({ ok: true, json: async () => ({ ok: true, host: H(10, 9, 9, 9), port: RPC_PORT, via: 'home' }) }) };
    ok(!(await new CardBorrower(bcfg, far, { home: () => myHome }).open({ sizeGB: 200 })).length, 'spread: a "home network" address that isn\'t ours is never used');
    const off2 = new CardBorrower({ ...bcfg, share: { ...bcfg.share, homeNet: false } }, homeBob, { home: () => myHome }); sent.length = 0;
    await off2.open({ sizeGB: 200 });
    ok(!sent[0].home.length, 'spread: Use the home network first off, no home address is offered'); off2.close();
  }
  const llamacpp = read(path.join(here, '..', 'src', 'llamacpp.js'));
  ok(/args\.push\('--rpc', helpers\.join\(','\)/.test(llamacpp) && /this\.spread\?\.close\(\)/.test(llamacpp), 'spread: the engine adds --rpc and hands the cards back when the brain goes');

  {
    const { spreadArgs, spreadLoadSeconds, SPREAD_FIT_TARGET_MIB, SPREAD_UBATCH } = await import('../src/llamacpp.js');
    const add = spreadArgs(['-m', 'x.gguf', '--fit', 'on']);
    ok(add.join(' ') === `--fit-target ${SPREAD_FIT_TARGET_MIB} -ub ${SPREAD_UBATCH}`, 'spread: more room is kept free on every card and the steps are smaller (the lent card ran out of room at -ub 2048)', add.join(' '));
    ok(!spreadArgs(['--fit', 'on', '--fit-target', '512', '-ub', '1024']).length && spreadArgs(['-ngl', '999']).join(' ') === `-ub ${SPREAD_UBATCH}`, 'spread: settings made by hand stay, and without --fit only the step size is set');
    const riker = spreadLoadSeconds(17.5);
    ok(riker > 413 + 2.63e3 / 6.6 && riker >= 60 * 60 && riker <= 7200, 'spread: the wait grows with the brain (Riker over Wi-Fi gets over an hour, not 5 minutes)', riker);
    ok(spreadLoadSeconds(0) === 300 && spreadLoadSeconds(0, 900) === 900 && spreadLoadSeconds(1e4) === 7200, 'spread: never less than the usual wait, never more than two hours');
    ok(/return this\.(preload|startEngine)\(model, signal, \{[^}]*noSpread: true[^}]*\}\)/.test(llamacpp) && /!noSpread/.test(llamacpp), 'spread: a spread that failed loads here like always instead');
    ok(/still loading over Bob-Net/.test(llamacpp) && /network cable is much faster/.test(llamacpp), 'spread: a long first load says how it is going, and that a cable is faster');
  }
}

// ---- Also over the home network (the door) ----
{
  const H = (...x) => x.join('.');
  const myHome = [{ address: H(192, 168, 4, 185), netmask: '255.255.255.0' }];
  ok(cleanPhonePatch({ port: 7777, remote: { enabled: true, passcode: 'secret-1', hosts: ['100.101.1.2:7777'] } }, {}).remote.homeNet === false, 'home door: off to start with');
  ok(cleanPhonePatch({ port: 7777, remote: { enabled: true, passcode: 'secret-1', hosts: ['100.101.1.2:7777'] } }, { homeNet: true }).remote.homeNet === true, 'home door: switches on');
  ok(phoneView({ port: 7777, remote: { homeNet: true } }).homeNet === true, 'home door: Settings shows it');
  const urls = [];
  let nearUp = true;
  const fetchFn = async (url, o) => {
    urls.push(url);
    if (url.includes(H(192, 168)) && !nearUp) throw new TypeError('fetch failed');
    if (url.endsWith('/api/lend/hello')) return { ok: true, status: 200, json: async () => ({ lend: true, brain: 'x', home: [`${H(192, 168, 4, 189)}:7777`, '8.8.8.8:7777'] }) };
    return { ok: true, status: 200, json: async () => ({}) };
  };
  const ls = new Lenders({ share: { borrow: { bobs: [] } } }, { fetchFn, home: () => myHome });
  const go = { name: 'Go', address: '100.102.0.7:7777', passcode: 'secret-2' };
  await ls.hello(go, { force: true });
  ok(urls[0] === 'http://100.102.0.7:7777/api/lend/hello' && ls.nearOf(go) === `${H(192, 168, 4, 189)}:7777`, 'home door: the first hello goes over Tailscale and learns his home-network door');
  urls.length = 0; await ls.call(go, '/api/lend/hello');
  ok(urls[0] === `http://${H(192, 168, 4, 189)}:7777/api/lend/hello`, 'home door: then the home network goes first');
  nearUp = false; urls.length = 0; await ls.call(go, '/api/lend/hello');
  ok(urls.length === 2 && urls[1].startsWith('http://100.102.0.7:7777') && ls.nearOf(go) === '', 'home door: home network not answering, Tailscale is the backup, and home waits a while');
  const ls2 = new Lenders({}, { fetchFn: async () => ({ ok: true, status: 200, json: async () => ({ lend: true, home: [`${H(10, 0, 0, 5)}:7777`, '8.8.8.8:7777'] }) }), home: () => myHome });
  await ls2.hello(go, { force: true });
  ok(ls2.nearOf(go) === '', 'home door: another network\'s address, or a public one, is never used');
  {
    // Two shared networks (Wi-Fi and a cable between them): each path is timed and the quickest wins, for the door and for a lent card.
    const both = [{ address: H(192, 168, 4, 185), netmask: '255.255.255.0' }, { address: H(10, 77, 0, 1), netmask: '255.255.255.0' }];
    const timed = [];
    const trip = async ({ host }) => { timed.push(host); return host === H(10, 77, 0, 3) ? 0.4 : 30; };
    const l3 = new Lenders({ share: { borrow: { bobs: [go] } } }, { home: () => both, trip, fetchFn: async () => ({ ok: true, status: 200, headers: { get: () => null }, json: async () => ({ lend: true, home: [`${H(192, 168, 4, 189)}:7777`, `${H(10, 77, 0, 3)}:7777`] }) }) });
    await l3.hello(go, { force: true });
    ok(l3.nearOf(go) === `${H(10, 77, 0, 3)}:7777` && l3.nearMine.get(go.address)[0] === H(10, 77, 0, 1) && timed.length === 6, 'home door: with Wi-Fi and a cable both shared, the quicker path is used');
    await l3.hello(go, { force: true });
    ok(timed.length === 6, 'home door: the paths aren\'t timed again at every hello');
    const dead = new Lenders({ share: { borrow: { bobs: [go] } } }, { home: () => both, trip: async ({ host }) => (host === H(10, 77, 0, 3) ? null : 30), fetchFn: async () => ({ ok: true, status: 200, headers: { get: () => null }, json: async () => ({ lend: true, home: [`${H(10, 77, 0, 3)}:7777`, `${H(192, 168, 4, 189)}:7777`] }) }) });
    await dead.hello(go, { force: true });
    ok(dead.nearOf(go) === `${H(192, 168, 4, 189)}:7777`, 'home door: a path that doesn\'t answer loses to one that does');
    ok(pickHome(both, [H(10, 77, 0, 3), H(192, 168, 4, 189)]).host === H(10, 77, 0, 1) && pickHome(both, [H(192, 168, 4, 189), H(10, 77, 0, 3)]).host === H(192, 168, 4, 185), 'card: the asker\'s order decides which shared network the gate opens on');
    let asked = null;
    const cb = new CardBorrower({ share: { spread: 'toobig' }, gpuVramGB: 16 }, { bobs: () => [go], nearMine: l3.nearMine, call: async (b, p, o) => { asked = o.body.home; return { ok: true, json: async () => ({ ok: false, why: 'off' }) }; } }, { home: () => both });
    await cb.open({ sizeGB: 200 });
    ok(asked && asked[0] === H(10, 77, 0, 1) && asked.length === 2, 'spread: the asker names his address on the quickest path first');
  }
  {
    let sends = 0;
    const slow = new Lenders({}, { fetchFn: async (url) => { if (url.includes(H(192, 168))) { sends++; const e = new Error('timeout'); e.name = 'TimeoutError'; throw e; } sends++; return { ok: true, status: 200 }; }, home: () => myHome });
    slow.near.set(go.address, `${H(192, 168, 4, 189)}:7777`);
    let threw = false; try { await slow.call(go, '/api/borrow/job', { method: 'POST', body: { a: 1 } }); } catch { threw = true; }
    ok(threw && sends === 1, 'home door: a sent job that timed out over the home network is never sent twice');
  }
  // A card asked for through the home-network door
  const file = path.join(tmp, 'cfg2.json'); fs.writeFileSync(file, '{}');
  const cfg = { configFile: file, remote: { enabled: true, passcode: 'secret-1', homeNet: true }, share: { lendCard: true } };
  const gates = [];
  const lender = new CardLender(cfg, { spawnFn: (exe, args) => { const c = new EventEmitter(); c.stdout = new EventEmitter(); c.stderr = new EventEmitter(); c.exitCode = null; c.kill = () => { c.exitCode = 0; }; setTimeout(() => c.stderr.emit('data', 'Starting RPC server\n'), 2); return c; }, tool: () => ({ found: true, path: '/x' }), ips: () => ['100.101.1.2'], home: () => myHome, gate: async (o) => { gates.push(o); return { close() {} }; } });
  const r = await lender.open({ localAddr: H(192, 168, 4, 185), remoteAddr: H(192, 168, 4, 189) });
  ok(r.ok && r.via === 'home' && gates[0].allow === H(192, 168, 4, 189), 'home door: a card asked for over the home network opens there, for that Bob only');
  lender.close();
  const shut = new CardLender({ ...cfg, remote: { ...cfg.remote, homeNet: false } }, { tool: () => ({ found: true, path: '/x' }), ips: () => ['100.101.1.2'], home: () => myHome });
  ok((await shut.open({ localAddr: H(192, 168, 4, 185), remoteAddr: H(192, 168, 4, 189) })).why === 'not tailscale', 'home door: with it off, nothing over the home network');
  const server = read(path.join(here, '..', 'src', 'server.js'));
  ok(/p\.startsWith\('\/api\/pair\/'\) && !fromAllowed\(req\.socket\.remoteAddress\)\) return send\(res, 403/.test(server), 'home door: pairing over Tailscale, or this home network with the switch on');
  ok(/remoteHome && homeIps\(\)\.some\(\(m\) => sameNet\(m\.address, addr, m\.netmask\)/.test(server), 'home door: only this replicant matrix\'s own home network, never wider');
}

// ---- diffusion brains ----
{
  const d = diffusionArgs('/m/llada.gguf', 'llada', { prompt: 'hi', steps: 64, length: 256 });
  ok(d.includes('--diffusion-block-length') && !d.includes('--diffusion-eps'), 'diffusion: LLaDA fills in block by block');
  const e = diffusionArgs('/m/dream.gguf', 'dream', { prompt: 'hi' });
  ok(e.includes('--diffusion-eps') && !e.includes('--diffusion-block-length') && e.includes('--diffusion-visual'), 'diffusion: Dream goes by timesteps, with the live view');
  ok(e[e.indexOf('-ub') + 1] === '512', 'diffusion: the block holds the prompt and the answer');
  const C = '\u001b[2J\u001b[H';
  const out = `${C}\rdiffusion step: 1/4 [====   ] 25%\n   cat   \n${C}\rdiffusion step: 4/4 [=======] 100%\n The cat codes.\n${C}\n The cat codes all night.\n`;
  const f = readFrames(out);
  ok(f.step === 4 && f.of === 4 && f.text === 'The cat codes all night.', 'diffusion: the last frame is the answer');
  ok(readFrames(`${C}\rdiffusion step: 2/8 [==] 25%\n The  sat\n`).text === 'The  sat', 'diffusion: the text so far, gaps and all');
  ok(readFrames('').text === '', 'diffusion: nothing yet is empty');
  const own = read(path.join(here, '..', 'src', 'own-models.js'));
  ok(/diffusionBrain \? \[\]/.test(own), 'diffusion: your own diffusion brain gets no chat jobs');
}

fs.rmSync(tmp, { recursive: true, force: true });
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

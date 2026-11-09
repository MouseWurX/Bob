// Tests the kept-loaded painter (sd-server) with a fake sd-server: ready signal, reuse, idle unload, card sharing,
// crash recovery, hangs, old builds, Stop, and falling back to sd-cli.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { PainterServer } from '../src/painter-server.js';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bob-sds-'));
const models = path.join(dir, 'models');
fs.mkdirSync(models);
for (const f of ['z.gguf', 'ae.sft', 'qwen.gguf', 'wan.gguf', 'wanvae.st', 'umt5.gguf', 'edit.gguf']) fs.writeFileSync(path.join(models, f), 'x');
const ref = path.join(dir, 'ref.png');
fs.writeFileSync(ref, Buffer.from('89504e470d0a1a0a', 'hex'));
process.env.MOCK_SDS_DIR = dir;
process.env.MOCK_SD_ARGS = path.join(dir, 'cli-args.json');
const mk = (over = {}) => ({
  dataDir: dir, painterDir: path.join(dir, 'painter'), ollamaKeepAlive: '5m',
  painter: { engine: 'sdcpp', sdcpp: {
    exe: process.execPath, preArgs: [path.resolve('test/mock-sd-cli.js')],
    serverExe: process.execPath, serverPreArgs: [path.resolve('test/mock-sd-server.js')],
    image: { diffusionModel: path.join(models, 'z.gguf'), vae: path.join(models, 'ae.sft'), llm: path.join(models, 'qwen.gguf'), steps: 8, cfg: 1.0 },
    edit: { diffusionModel: path.join(models, 'edit.gguf'), vae: path.join(models, 'ae.sft'), llm: path.join(models, 'qwen.gguf') },
    video: { diffusionModel: path.join(models, 'wan.gguf'), vae: path.join(models, 'wanvae.st'), t5xxl: path.join(models, 'umt5.gguf') },
    ...over
  } }
});
fs.mkdirSync(path.join(dir, 'painter'));
const starts = () => { try { return fs.readFileSync(path.join(dir, 'starts.txt'), 'utf8').length; } catch { return 0; } };
const lastBody = () => JSON.parse(fs.readFileSync(path.join(dir, 'body.json'), 'utf8'));
const opts = { vramOf: async () => 0, freeVram: async () => null };

let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra ? ' ' + extra : ''}`); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// 1. Ready signal and reuse.
let p = new PainterServer(mk(), opts);
const seen = [];
p.on('state', (s) => seen.push(s.state));
check('starts off, sd-server available', p.status().state === 'off' && p.status().via === 'server');
check('ready() is false before loading', (await p.ready('image')) === false);
await p.ensureReady('image');
check('ensureReady resolves only when sd-server says ready', (await p.ready('image')) === true && p.status().state === 'ready');
check('state events: loading then ready', seen.join(',').startsWith('loading,ready'), seen.join(','));
const sa = JSON.parse(fs.readFileSync(path.join(dir, 'args.json'), 'utf8'));
check('server gets model files, memory flags and a localhost port', sa.includes('--llm') && sa.includes('--offload-to-cpu') && sa[sa.indexOf('--listen-ip') + 1] === '127.0.0.1' && !sa.includes('-p'), sa.join(' '));
check('health() reports ready', (await p.health()).ok && /ready/.test((await p.health()).detail));
const s0 = starts();
const steps = [];
const one = await p.paint('image', { prompt: 'a cozy tavern', width: 1000 }, { onProgress: (n, t) => steps.push(`${n}/${t}`) });
const two = await p.paint('image', { prompt: 'a second tavern' }, {});
check('two pictures, one model load', starts() === s0 && one.via === 'server' && two.via === 'server', `starts ${starts() - s0}`);
check('pictures are saved, checked and real PNGs', one.checked && fs.existsSync(one.file) && fs.readFileSync(one.file).subarray(0, 4).toString('hex') === '89504e47' && one.name.endsWith('.png'));
const b = lastBody();
check('request: prompt, size snapped like sd-cli, steps, cfg, tiling', b.prompt === 'a second tavern' && b.width === 1024 && b.sample_params.sample_steps === 8 && b.sample_params.guidance.txt_cfg === 1 && b.vae_tiling_params.enabled === true);
check('progress is reported', steps.includes('4/4'), steps.join(','));

// 2. Concurrent ensureReady calls share one load.
await p.unload('test');
const s1 = starts();
await Promise.all([p.ensureReady('image'), p.ensureReady('image'), p.ensureReady('image')]);
check('three callers, one sd-server start', starts() - s1 === 1, `starts ${starts() - s1}`);

// 3. Switching kinds reloads with the other model set; edit sends references.
const ed = await p.paint('edit', { prompt: 'same cat, in a hat', refs: [ref] }, {});
const ea = JSON.parse(fs.readFileSync(path.join(dir, 'args.json'), 'utf8'));
check('edit loads the edit model and sends the references', ed.via === 'server' && ea.includes(path.join(models, 'edit.gguf')) && lastBody().ref_images === 1);
check('ready(image) is false while the edit model is loaded', (await p.ready('image')) === false && (await p.ready('edit')) === true);
const vid = await p.paint('video', { prompt: 'a lantern swinging', seconds: 2, image: ref }, {});
const vb = lastBody();
check('video: 4n+1 frames, start frame, webm saved', (vb.video_frames - 1) % 4 === 0 && vb.init_image === 'yes' && vid.name.endsWith('.webm') && vid.checked);

// 4. unload() resolves only once the process is gone.
const pid = p.child.pid;
const gone = await p.unload('test');
let alive = true;
try { process.kill(pid, 0); } catch { alive = false; }
check('unload waits for the process to exit', gone.length === 1 && !alive && p.status().state === 'off');
check('unload when nothing is loaded is a no-op', (await p.unload('again')).length === 0);

// 5. Idle: lets go after the grace time.
p = new PainterServer(mk({ keepLoadedSeconds: 0.4 }), opts);
await p.paint('image', { prompt: 'idle test' }, {});
check('still loaded right after a picture', p.alive());
await sleep(1500);
check('let go after the grace time', !p.alive() && p.status().state === 'off');
const p5 = new PainterServer({ ...mk(), ollamaKeepAlive: '1m' }, opts);
check('grace is min(2 minutes, idle setting)', p5.graceMs() === 60000 && new PainterServer({ ...mk(), ollamaKeepAlive: '30m' }, opts).graceMs() === 120000);

// 6. Sharing the card with a brain (yieldFor).
p = new PainterServer(mk(), { vramOf: async () => 0, freeVram: async () => 8 * 1024 ** 3, freeRam: () => 16 * 1024 ** 3 });
await p.ensureReady('image');
check('a brain that fits leaves the painter loaded', (await p.yieldFor('gemma4:e4b', { bytes: 5 * 1024 ** 3 })).length === 0 && p.alive());
check('a brain that does not fit makes it let go', (await p.yieldFor('qwen3-coder:30b', { bytes: 18 * 1024 ** 3 })).length === 1 && !p.alive());
p = new PainterServer(mk(), { vramOf: async () => 0, freeVram: async () => 8 * 1024 ** 3, freeRam: () => 6 * 1024 ** 3 });
await p.ensureReady('image');
check('a brain that fits the card but not the free system memory makes it let go too (no RAM fight)', (await p.yieldFor('gemma4:e4b', { bytes: 5 * 1024 ** 3 })).length === 1 && !p.alive());
p = new PainterServer(mk(), opts);
await p.ensureReady('image');
check('unknown size or no nvidia-smi: lets go (old behaviour)', (await p.yieldFor('gemma4:e4b')).length === 1 && !p.alive());
p = new PainterServer(mk(), opts);
const slow = p.paint('image', { prompt: 'yield while painting' }, {});
await sleep(400);
const y = await p.yieldFor('gemma4:e4b');
const sOut = await slow;
check('yieldFor waits for the picture in progress', sOut.via === 'server' && y.length === 1);

// 7. Crash mid-picture: restarts once and paints again.
const crashMark = path.join(dir, 'crash-once');
process.env.MOCK_SDS_CRASH = crashMark;
p = new PainterServer(mk(), opts);
const s7 = starts();
const c = await p.paint('image', { prompt: 'crash test' }, {});
check('crash mid-picture: restarted and the picture still arrives', c.via === 'server' && starts() - s7 === 2 && p.status().restarts === 1, `starts ${starts() - s7}`);
delete process.env.MOCK_SDS_CRASH;
await p.unload('test');

// 8. Won't load: falls back to sd-cli for that picture.
process.env.MOCK_SDS_LOADFAIL = '1';
p = new PainterServer(mk(), opts);
try { await p.ensureReady('image'); check('load failure is a coded error', false); }
catch (e) { check('load failure is a coded error', e.code === 'painter_load_failed' && /bad model file/.test(e.message), e.message); }
const f = await p.paint('image', { prompt: 'fallback' }, {});
check('load failure: sd-cli paints it instead', f.via === 'cli' && f.checked && fs.existsSync(f.file));
check('no sd-server left running after a failed load', !p.alive());
delete process.env.MOCK_SDS_LOADFAIL;

// 9. Bad output from sd-server is not accepted.
process.env.MOCK_SDS_BAD = '1';
p = new PainterServer(mk(), opts);
const bad = await p.paint('image', { prompt: 'bad file' }, {});
check('a non-picture from sd-server is refused; sd-cli makes a real one', bad.via === 'cli' && fs.readFileSync(bad.file).subarray(0, 4).toString('hex') === '89504e47');
delete process.env.MOCK_SDS_BAD;
await p.unload('test');

// 10. Old sd-server build (no native API): unavailable, every picture via sd-cli.
process.env.MOCK_SDS_NOAPI = '1';
p = new PainterServer(mk(), opts);
try { await p.ensureReady('image'); check('old build is painter_unavailable', false); }
catch (e) { check('old build is painter_unavailable', e.code === 'painter_unavailable'); }
check('old build: status says unavailable, via cli', p.status().state === 'unavailable' && p.status().via === 'cli');
const s10 = starts();
const o = await p.paint('image', { prompt: 'old build' }, {});
check('old build: pictures use sd-cli without retrying the server', o.via === 'cli' && starts() === s10);
delete process.env.MOCK_SDS_NOAPI;

// 11. No sd-server.exe, or switched off in config.
p = new PainterServer(mk({ serverExe: path.join(dir, 'nope.exe') }), opts);
check('missing sd-server.exe: unavailable', p.status().state === 'unavailable' && (await p.paint('image', { prompt: 'x' }, {})).via === 'cli');
p = new PainterServer(mk({ server: false }), opts);
check('painter.sdcpp.server = false: sd-cli only', !p.available() && (await p.paint('image', { prompt: 'x' }, {})).via === 'cli');

// 12. Stop: cancels the job, says stopped (never retried or sent to sd-cli).
p = new PainterServer(mk(), opts);
await p.ensureReady('image');
const ac = new AbortController();
setTimeout(() => ac.abort(), 300);
const cliBefore = fs.existsSync(process.env.MOCK_SD_ARGS) ? fs.statSync(process.env.MOCK_SD_ARGS).mtimeMs : 0;
try { await p.paint('image', { prompt: 'slow one' }, { signal: ac.signal }); check('stop cancels painting', false); }
catch (e) { check('stop cancels painting with code stopped', e.code === 'stopped' && /Stopped/.test(e.message)); }
check('stop: no sd-cli fallback, server still loaded for the next one', (fs.existsSync(process.env.MOCK_SD_ARGS) ? fs.statSync(process.env.MOCK_SD_ARGS).mtimeMs : 0) === cliBefore && (await p.ready('image')));

// 13. Hung job (never finishes): times out and frees the card.
p = new PainterServer(mk({ timeoutSeconds: 1 }), opts);
try { await p.paint('image', { prompt: 'hang forever' }, {}); check('hung job times out', false); }
catch (e) { check('hung job times out with painter_timeout and sd-server stopped', e.code === 'painter_timeout' && !p.alive(), e.message); }

// 14. A leftover sd-server from a crash of Bob is stopped before a new one starts.
p = new PainterServer(mk(), opts);
await p.ensureReady('image');
const orphan = p.child.pid;
p.child.removeAllListeners('exit');
p.child = null; // Bob "crashed": forgot it, but the pid file remains
const p2 = new PainterServer(mk(), opts);
await p2.ensureReady('image');
let orphanAlive = true;
try { process.kill(orphan, 0); } catch { orphanAlive = false; }
check('leftover sd-server is stopped on the next start', !orphanAlive && p2.alive());
await p2.unload('test');

// 15. Died while idle: status goes off, next picture starts it again.
p = new PainterServer(mk(), opts);
await p.ensureReady('image');
p.child.kill();
await sleep(300);
check('died while idle: status off, ready() false', p.status().state === 'off' && !(await p.ready('image')));
check('next picture starts it again', (await p.paint('image', { prompt: 'again' }, {})).via === 'server');
await p.unload('test');

fs.rmSync(dir, { recursive: true, force: true });
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

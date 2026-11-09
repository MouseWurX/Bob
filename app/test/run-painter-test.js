// Tests Bob's own painter (stable-diffusion.cpp) with a fake sd-cli.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { paint, paintingAvailable } from '../src/painter.js';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bob-paint-'));
const models = path.join(dir, 'models');
fs.mkdirSync(models);
for (const f of ['z.gguf', 'ae.sft', 'qwen.gguf', 'wan.gguf', 'wanvae.st', 'umt5.gguf']) fs.writeFileSync(path.join(models, f), 'x');
const argsFile = path.join(dir, 'args.json');
process.env.MOCK_SD_ARGS = argsFile;
const cfg = {
  painterDir: path.join(dir, 'painter'),
  painter: { engine: 'sdcpp', sdcpp: {
    exe: process.execPath, preArgs: [path.resolve('test/mock-sd-cli.js')],
    image: { diffusionModel: path.join(models, 'z.gguf'), vae: path.join(models, 'ae.sft'), llm: path.join(models, 'qwen.gguf'), steps: 8, cfg: 1.0 },
    video: { diffusionModel: path.join(models, 'wan.gguf'), vae: path.join(models, 'wanvae.st'), t5xxl: path.join(models, 'umt5.gguf') }
  } }
};
fs.mkdirSync(cfg.painterDir);

let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra ? ' ' + extra : ''}`); };

check('painter available only when engine is sdcpp', paintingAvailable(cfg, 'image') && !paintingAvailable({ ...cfg, painter: { ...cfg.painter, engine: 'comfy' } }, 'image'));

const steps = [];
const img = await paint(cfg, 'image', { prompt: 'a cozy tavern', width: 1000 }, { onProgress: (n, t) => steps.push(`${n}/${t}`) });
const a = JSON.parse(fs.readFileSync(argsFile, 'utf8'));
check('image is saved in the painter folder', fs.existsSync(img.file) && img.name.endsWith('.png'));
check('image args: models, prompt, size snapped to 16, steps, cfg', a.includes('--llm') && a[a.indexOf('-p') + 1] === 'a cozy tavern' && a[a.indexOf('-W') + 1] === '1008' && a[a.indexOf('--steps') + 1] === '8' && a[a.indexOf('--cfg-scale') + 1] === '1' && a.includes('--offload-to-cpu'), a.join(' '));
check('progress is reported', steps.includes('4/4'), steps.join(','));

const vid = await paint(cfg, 'video', { prompt: 'a lantern swinging', seconds: 2 }, {});
const v = JSON.parse(fs.readFileSync(argsFile, 'utf8'));
check('video uses vid_gen, t5xxl and a 4n+1 frame count', v[v.indexOf('-M') + 1] === 'vid_gen' && v.includes('--t5xxl') && (Number(v[v.indexOf('--video-frames') + 1]) - 1) % 4 === 0 && vid.name.endsWith('.webm'), v.join(' '));

const missing = { ...cfg, painter: { engine: 'sdcpp', sdcpp: { ...cfg.painter.sdcpp, image: { diffusionModel: path.join(models, 'nope.gguf') } } } };
try { await paint(missing, 'image', { prompt: 'x' }, {}); check('missing model file is caught', false); }
catch (e) { check('missing model file is caught', /missing/.test(e.message)); }

process.env.MOCK_SD_FAIL = '1';
try { await paint(cfg, 'image', { prompt: 'x' }, {}); check('painter failure is reported', false); }
catch (e) { check('painter failure is reported with its output', /CUDA out of memory/.test(e.message), e.message.slice(0, 80)); }
delete process.env.MOCK_SD_FAIL;

const ac = new AbortController();
setTimeout(() => ac.abort(), 300);
try { await paint(cfg, 'image', { prompt: 'slow' }, { signal: ac.signal }); check('stop cancels painting', false); }
catch (e) { check('stop cancels painting', /Stopped/.test(e.message)); }

fs.rmSync(dir, { recursive: true, force: true });
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

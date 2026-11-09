// Tests the Maestro bridge with a fake Maestro.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { maestroModels, maestroMake, maestroUrl, readModels } from '../src/maestro.js';

let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra ? ' ' + extra : ''}`); };
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bob-maestro-'));
const outDir = path.join(dir, 'outputs'); fs.mkdirSync(outDir);
const painterDir = path.join(dir, 'painter'); fs.mkdirSync(painterDir);
let submitted = null, polls = 0, cancelled = false, failNext = false;
const server = http.createServer(async (req, res) => {
  let b = ''; for await (const c of req) b += c;
  const send = (o, code = 200) => { res.writeHead(code, { 'content-type': 'application/json' }); res.end(JSON.stringify(o)); };
  if (req.url === '/api/v1/models') return send({ families: ['ltx2', 'flux2', 'tts'], models: [
    { model_type: 'ltx2_22B_distilled_1_1', name: 'LTX-2 22B distilled', family: 'ltx2', is_t2v: true, is_downloaded: false },
    { model_type: 'flux2_klein_9b', name: 'FLUX.2 klein 9B', family: 'flux2', is_downloaded: true },
    { model_type: 'qwen3_tts_base', family: 'tts', generates_audio: true }] });
  if (req.url === '/api/v1/file/clip.mp4') { res.writeHead(200); return res.end('mp4data'); }
  if (req.url === '/api/v1/generate') { submitted = JSON.parse(b); polls = 0; return send({ job_id: 'j1' }); }
  if (req.url.startsWith('/api/v1/cancel/')) { cancelled = true; return send({ ok: true }); }
  if (req.url === '/api/v1/status/j1') {
    polls++;
    if (failNext) return send({ status: 'error', error: 'CUDA out of memory', oom_info: {} });
    if (polls < 2) return send({ status: 'running', phase: 'denoising', step: 3, total_steps: 8 });
    return send({ status: 'completed', output_files: ['clip.mp4'] });
  }
  send({ detail: 'nope' }, 404);
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const cfg = { painterDir, maestro: { url: `http://127.0.0.1:${server.address().port}` } };

const models = await maestroModels(cfg);
check('reads Maestro\'s models and sorts video from pictures', models.find((m) => m.modelType === 'ltx2_22B_distilled_1_1')?.kind === 'video' && models.find((m) => m.modelType === 'flux2_klein_9b')?.kind === 'images', JSON.stringify(models));
check('voice/music models are left out', !models.some((m) => /tts/.test(m.modelType)));
check('knows which Maestro models still need downloading', models.find((m) => m.modelType === 'ltx2_22B_distilled_1_1').downloaded === false);
check('reads a plain list too', readModels({ models: ['wan2_2_ti2v_5B', 'z_image_turbo'] }).map((m) => m.kind).join() === 'video,images');
try { maestroUrl({ maestro: { url: 'http://192.0.2.20:42003' } }); check('bridge refuses a Maestro on another computer', false); } catch { check('bridge refuses a Maestro on another computer', true); }

const prog = [];
const made = await maestroMake(cfg, 'video', { prompt: 'a lantern swinging', seconds: 2, modelType: 'ltx2_22B_distilled_1_1' }, { onProgress: (s) => prog.push(s.status) });
check('video job: right model, size and length go to Maestro', submitted.model_type === 'ltx2_22B_distilled_1_1' && submitted.resolution === '864x480' && submitted.video_length === 49 && !submitted.image_mode, JSON.stringify(submitted));
check('finished clip is fetched into the painter folder', made.length === 1 && made[0].video && fs.readFileSync(made[0].file, 'utf8') === 'mp4data' && path.dirname(made[0].file) === painterDir);
check('progress is followed', prog.includes('running'));

await maestroMake(cfg, 'image', { prompt: 'a mug', modelType: 'flux2_klein_9b' }, {});
check('picture job uses image mode', submitted.image_mode === 1 && submitted.resolution === '1024x1024');

failNext = true;
try { await maestroMake(cfg, 'video', { prompt: 'x', modelType: 'ltx2_22B_distilled_1_1' }, {}); check('Maestro errors are passed on', false); }
catch (e) { check('Maestro errors are passed on', /out of graphics memory/.test(e.message), e.message); }
failNext = false;

const ac = new AbortController();
setTimeout(() => ac.abort(), 500);
try { await maestroMake(cfg, 'video', { prompt: 'x', modelType: 'ltx2_22B_distilled_1_1' }, { signal: ac.signal }); check('Stop cancels the Maestro job', false); }
catch { check('Stop cancels the Maestro job', cancelled); }

server.close();
fs.rmSync(dir, { recursive: true, force: true });
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

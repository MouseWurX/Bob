#!/usr/bin/env node
// Fake sd-server for tests: the parts of stable-diffusion.cpp's native API Bob uses.
// Knobs (env): MOCK_SDS_DIR (writes args.json, starts.txt, bodies.json there),
//   MOCK_SDS_NOAPI=1 (an old build: 404 on /sdcpp/v1), MOCK_SDS_LOADFAIL=1 (status 'error'),
//   MOCK_SDS_CRASH=<file> (exit during the first job, once: the file marks it done), MOCK_SDS_BAD=1 (sends a non-picture),
//   MOCK_SDS_LOADMS (load time, default 150), MOCK_SDS_JOBMS (job time, default 150).
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
const a = process.argv.slice(2);
const dir = process.env.MOCK_SDS_DIR;
const port = Number(a[a.indexOf('--listen-port') + 1]);
if (dir) {
  fs.writeFileSync(path.join(dir, 'args.json'), JSON.stringify(a));
  fs.appendFileSync(path.join(dir, 'starts.txt'), 'x');
}
const loadMs = Number(process.env.MOCK_SDS_LOADMS || 150), jobMs = Number(process.env.MOCK_SDS_JOBMS || 150);
let state = 'loading';
setTimeout(() => { state = process.env.MOCK_SDS_LOADFAIL ? 'error' : 'ready'; }, loadMs);
const jobs = new Map();
let n = 0;
const send = (res, code, obj) => { res.writeHead(code, { 'content-type': 'application/json' }); res.end(JSON.stringify(obj)); };
const PNG = Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex').toString('base64');
const WEBM = Buffer.from('1a45dfa39f4286810142f7810142f281', 'hex').toString('base64');
http.createServer((req, res) => {
  let raw = '';
  req.on('data', (d) => { raw += d; });
  req.on('end', () => {
    if (process.env.MOCK_SDS_NOAPI && req.url.startsWith('/sdcpp/')) return send(res, 404, { error: 'not found' });
    if (req.url === '/sdcpp/v1/models/status') return send(res, 200, { state, error: state === 'error' ? 'bad model file' : null });
    const m = req.url.match(/^\/sdcpp\/v1\/(img_gen|vid_gen)$/);
    if (m && req.method === 'POST') {
      if (state !== 'ready') return send(res, 503, { error: 'No model is loaded', code: 'model_not_loaded' });
      const body = JSON.parse(raw);
      if (dir) fs.writeFileSync(path.join(dir, 'body.json'), JSON.stringify({ ...body, init_image: body.init_image ? 'yes' : null, ref_images: (body.ref_images || []).length }));
      const id = `job_${++n}`;
      const job = { id, kind: m[1], status: 'generating', result: null, error: null, preview: null };
      jobs.set(id, job);
      const crash = process.env.MOCK_SDS_CRASH;
      if (crash && !fs.existsSync(crash)) { fs.writeFileSync(crash, 'crashed'); setTimeout(() => process.exit(3), 40); }
      if (/hang/.test(body.prompt)) return send(res, 202, { id, kind: m[1], status: 'queued' });
      let step = 0;
      const tick = setInterval(() => { step++; job.preview = { step, total_steps: 4 }; process.stdout.write(`  |==| ${step}/4 - 0.1s/it\n`); if (step >= 4) clearInterval(tick); }, jobMs / 5);
      job.timer = setTimeout(() => {
        if (job.status !== 'generating') return;
        job.status = 'completed';
        const b64 = process.env.MOCK_SDS_BAD ? Buffer.from('nope').toString('base64') : m[1] === 'vid_gen' ? WEBM : PNG;
        job.result = m[1] === 'vid_gen' ? { b64_json: b64, output_format: body.output_format || 'webm', mime_type: 'video/webm' } : { output_format: 'png', images: [{ index: 0, b64_json: b64 }] };
      }, /slow/.test(body.prompt) ? 5000 : jobMs);
      return send(res, 202, { id, kind: m[1], status: 'queued', poll_url: `/sdcpp/v1/jobs/${id}` });
    }
    const j = req.url.match(/^\/sdcpp\/v1\/jobs\/([^/]+)(\/cancel)?$/);
    if (j) {
      const job = jobs.get(j[1]);
      if (!job) return send(res, 404, { error: 'no job' });
      if (j[2]) { clearTimeout(job.timer); job.status = 'cancelled'; job.error = { code: 'cancelled' }; }
      const { timer, ...pub } = job;
      return send(res, 200, pub);
    }
    send(res, 404, { error: 'not found' });
  });
}).listen(port, '127.0.0.1');

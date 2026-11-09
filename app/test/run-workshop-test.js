// Tests the advanced workshop against a fake ComfyUI.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { listWorkflows, runWorkflow, ensureWorkshop, workshopDir } from '../src/workshop.js';
import { capabilities } from '../src/capabilities.js';

let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra ? ' ' + extra : ''}`); };
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bob-ws-'));
let queued = null, uploads = 0;
const srv = http.createServer(async (req, res) => {
  let body = Buffer.alloc(0);
  for await (const c of req) body = Buffer.concat([body, c]);
  const u = new URL(req.url, 'http://x');
  if (u.pathname === '/system_stats') return res.end('{}');
  if (u.pathname === '/upload/image') { uploads++; return res.end(JSON.stringify({ name: 'ref-uploaded.png' })); }
  if (u.pathname === '/prompt') { queued = JSON.parse(body).prompt; return res.end(JSON.stringify({ prompt_id: 'p1' })); }
  if (u.pathname === '/history/p1') return res.end(JSON.stringify({ p1: { status: { status_str: 'success', completed: true }, outputs: { 9: { images: [{ filename: 'out_0001.png', subfolder: '', type: 'output' }] } } } }));
  if (u.pathname === '/view') return res.end(Buffer.from('89504e470d0a1a0a', 'hex'));
  res.statusCode = 404; res.end();
});
await new Promise((r) => srv.listen(0, '127.0.0.1', r));
const port = srv.address().port;
const cfg = { agentDir: dir, innDir: path.join(dir, 'inn'), painterDir: path.join(dir, 'inn', 'painter'), stt: { provider: 'http' }, workshop: { enabled: false, port } };

check('the workshop is off by default and hidden', capabilities(cfg).workshop === false);
try { await runWorkflow(cfg, 'x', {}, {}); check('refuses to run while switched off', false); } catch (e) { check('refuses to run while switched off', /switched off/.test(e.message)); }
cfg.workshop.enabled = true;
ensureWorkshop(cfg);
check('turning it on makes the folder with a how-to', fs.existsSync(path.join(workshopDir(cfg), 'README.txt')) && capabilities(cfg).workshop === true);
const wf = {
  3: { class_type: 'KSampler', inputs: { seed: 1, steps: 20 } },
  6: { class_type: 'CLIPTextEncode', inputs: { text: 'old', clip: ['4', 1] }, _meta: { title: 'Positive' } },
  7: { class_type: 'CLIPTextEncode', inputs: { text: 'bad', clip: ['4', 1] }, _meta: { title: 'Negative' } },
  10: { class_type: 'LoadImage', inputs: { image: 'example.png' } },
  9: { class_type: 'SaveImage', inputs: { images: ['8', 0] } }
};
fs.writeFileSync(path.join(workshopDir(cfg), 'Portrait with face fix.json'), JSON.stringify(wf));
fs.writeFileSync(path.join(workshopDir(cfg), 'ui save.json'), JSON.stringify({ nodes: [], links: [] }));
const list = listWorkflows(cfg);
check('lists workflows with what they make and their picture slots', list.find((w) => w.name === 'Portrait with face fix')?.pictures === 1 && list.find((w) => w.name === 'Portrait with face fix').makes.includes('pictures'));
check('spots a normal save that isn\'t an API export', list.find((w) => w.name === 'ui save')?.ok === false);
const ref = path.join(dir, 'mira.png');
fs.writeFileSync(ref, Buffer.from('89504e470d0a1a0a', 'hex'));
const made = await runWorkflow(cfg, 'portrait', { prompt: 'Captain Mira', negative: 'blurry', refs: [ref] }, {});
check('fills prompt, negative, reference and a new seed', queued[6].inputs.text === 'Captain Mira' && queued[7].inputs.text === 'blurry' && queued[10].inputs.image === 'ref-uploaded.png' && queued[3].inputs.seed !== 1 && uploads === 1);
check('brings the result back into the inn', made.length === 1 && made[0].kind === 'image' && fs.existsSync(made[0].file));
cfg.workshop.port = 1; // nothing listening
try { await runWorkflow(cfg, 'portrait', { prompt: 'x' }, {}); check('says when ComfyUI isn\'t running', false); } catch (e) { check('says when ComfyUI isn\'t running', /isn't running/.test(e.message), e.message); }

srv.close();
fs.rmSync(dir, { recursive: true, force: true });
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

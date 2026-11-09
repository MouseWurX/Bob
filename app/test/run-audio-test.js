// Tests the audio workshop runner with a fake Python.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { makeAudio, audioReady } from '../src/audio.js';
import { capabilities } from '../src/capabilities.js';
import http from 'node:http';

let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra ? ' ' + extra : ''}`); };
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bob-audio-'));
const log = path.join(dir, 'job.json');
process.env.MOCK_AUDIO_LOG = log;
const cfg = { agentDir: dir, painterDir: path.join(dir, 'painter'), stt: { provider: 'http' }, audio: { python: process.execPath, script: path.resolve('test/mock-python.js') } };

check('nothing to make until the workshop is set up', audioReady({ agentDir: dir }).music === false && capabilities({ agentDir: dir, stt: { provider: 'http' } }).music === false);
fs.mkdirSync(path.join(dir, 'audio-workshop', 'venv', 'Scripts'), { recursive: true });
fs.writeFileSync(path.join(dir, 'audio-workshop', 'venv', 'Scripts', 'python.exe'), 'x');
fs.mkdirSync(path.join(dir, 'audio-workshop', 'ace-step-1.5'), { recursive: true });
fs.writeFileSync(path.join(dir, 'audio-workshop', 'ace-step-1.5', 'pyproject.toml'), '');
fs.writeFileSync(path.join(dir, 'audio-workshop', 'ready.json'), JSON.stringify({ music: true, sfx: false }));
check('the ready marker says what the workshop can make', audioReady({ agentDir: dir }).music === true && audioReady({ agentDir: dir }).sfx === false);

// A fake ACE-Step 1.5 server: release_task, query_result (result is a JSON string), /v1/audio.
let released = null, polls = 0;
const ace = http.createServer(async (req, res) => {
  let b = ''; for await (const c of req) b += c;
  const u = new URL(req.url, 'http://x');
  if (u.pathname === '/v1/models') return res.end('[]');
  if (u.pathname === '/release_task') { released = JSON.parse(b); return res.end(JSON.stringify({ data: { task_id: 't1', status: 'queued', queue_position: 1 }, code: 200, error: null, timestamp: Date.now(), extra: null })); } // ACE-Step wraps every answer (1.5.39)
  if (u.pathname === '/query_result') { polls++; const asked = JSON.parse(b).task_id_list?.[0]; if (asked !== 't1') return res.end(JSON.stringify({ data: [{ task_id: asked ?? null, result: '[]', status: 0 }], code: 200 })); return res.end(JSON.stringify({ data: [{ task_id: 't1', status: polls < 2 ? 0 : 1, result: JSON.stringify([{ file: '/v1/audio?path=%2Ftmp%2Fsong.wav' }]) }] })); }
  if (u.pathname === '/v1/audio') return res.end(Buffer.from('RIFF0000WAVE'));
  res.statusCode = 404; res.end();
});
await new Promise((r) => ace.listen(0, '127.0.0.1', r));
cfg.audio.aceUrl = `http://127.0.0.1:${ace.address().port}`;
const steps = [];
const r = await makeAudio(cfg, 'music', { prompt: 'chiptune, upbeat', seconds: 999 }, { onProgress: (n, t) => steps.push(`${n}/${t}`) });
check('music is made by ACE-Step 1.5 and saved as a WAV in the inn', fs.existsSync(r.file) && r.name.endsWith('.wav') && r.file.startsWith(cfg.painterDir) && fs.readFileSync(r.file, 'ascii').startsWith('RIFF'));
check('one song, as WAV, instrumental by default, length capped', released.batch_size === 1 && released.audio_format === 'wav' && released.lyrics === '[Instrumental]' && released.audio_duration === 240, JSON.stringify(released));
check('the job number is read from ACE-Step\'s wrapped answer, and the song is collected', polls >= 2 && fs.existsSync(r.file));
check('progress comes through', steps.includes('100/100'), steps.join(','));
ace.close();
await makeAudio(cfg, 'sfx', { prompt: 'door creak', seconds: 3 }, {});
const job = JSON.parse(fs.readFileSync(log, 'utf8'));
check('sound effects go to the workshop Python with the prompt', job.kind === 'sfx' && job.prompt === 'door creak' && job.seconds === 3);
try { await makeAudio(cfg, 'sfx', { prompt: 'fail' }, {}); check('a failure is reported with its output', false); }
catch (e) { check('a failure is reported with its output', /CUDA out of memory/.test(e.message), e.message.slice(0, 80)); }

fs.rmSync(dir, { recursive: true, force: true });
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

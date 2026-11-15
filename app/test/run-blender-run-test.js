// blender-run.mjs: real headless Blender in a lesson's throwaway home (15 Nov). Uses a made-up home and a fake spawn;
// no Blender is run and nothing on this computer is read.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const { blenderScript, blenderRun } = await import(pathToFileURL(path.join(here, '..', 'model-lab', 'blender-run.mjs')).href);
const { scriptNote } = await import(pathToFileURL(path.join(here, '..', 'model-lab', 'tutorial-lessons.mjs')).href);
let pass = 0, fail = 0;
const check = (name, ok, more = '') => { if (ok) { pass++; console.log(`PASS ${name}`); } else { fail++; console.log(`FAIL ${name} ${more}`); } };

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bob-blender-run-'));
const homeDir = path.join(tmp, 'home'); fs.mkdirSync(path.join(homeDir, 'Documents'), { recursive: true });
fs.writeFileSync(path.join(homeDir, 'Documents', 'tree.py'), 'import bpy\n');
const toReal = (v) => {
  if (typeof v === 'string') { const m = v.match(/^(?:[A-Za-z]:)?[\\/]+Users[\\/]+you(?=$|[\\/])|^~(?=$|[\\/])/i); return m ? path.join(homeDir, ...v.slice(m[0].length).split(/[\\/]+/).filter(Boolean)) : v; }
  if (Array.isArray(v)) return v.map(toReal);
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, toReal(x)]));
  return v;
};
const neutral = (t) => String(t).split(homeDir).join('C:\\Users\\you');
const sb = { homeDir, toReal, neutral };
const calls = [];
const spawn = (exe, args, opt) => { calls.push({ exe, args, opt }); return { status: 0, stdout: `Saved "${path.join(homeDir, 'Documents', 'tree.blend')}"\n`, stderr: '' }; };

check('finds the script after --python', blenderScript({ cmd: 'blender', args: ['--background', '--python', 'a.py'] }) === 'a.py');
check('blender.exe counts as Blender', blenderScript({ cmd: 'C:\\Program Files\\Blender\\blender.exe', args: ['-b', '-P', 'a.py'] }) === 'a.py');
check('other programs are not Blender', blenderScript({ cmd: 'python', args: ['--python', 'a.py'] }) === '');
check('no .py file, no run', blenderScript({ cmd: 'blender', args: ['--python', 'a.txt'] }) === '');

const r = blenderRun(sb, { cmd: 'blender', args: ['--background', '--python', '~/Documents/tree.py'], cwd: '~/Documents' }, '/opt/blender/blender', { spawn });
check('a headless run really spawns Blender', calls.length === 1 && calls[0].exe === '/opt/blender/blender');
check('fixed safe flags, script last', calls[0]?.args.join(' ') === `--background --factory-startup --python-exit-code 1 --python ${path.join(homeDir, 'Documents', 'tree.py')}`);
check('runs in the throwaway home', calls[0]?.opt.cwd === path.join(homeDir, 'Documents') && calls[0]?.opt.env.HOME === homeDir && !calls[0]?.opt.shell);
check('output is real and the home is neutral', /Exit code 0/.test(r) && r.includes('C:\\Users\\you') && !r.includes(homeDir), r);

calls.length = 0;
check('a script outside the home is refused', /inside your own folders/.test(blenderRun(sb, { cmd: 'blender', args: ['--python', path.join(tmp, 'x.py')] }, 'b', { spawn })) && calls.length === 0);
check('a missing script says so', /not found/.test(blenderRun(sb, { cmd: 'blender', args: ['--python', '~/Documents/none.py'] }, 'b', { spawn })) && calls.length === 0);
check('not Blender: stand-in kept (null)', blenderRun(sb, { cmd: 'npm', args: ['test'] }, 'b', { spawn }) === null);
check('no Blender given: stand-in kept (null)', blenderRun(sb, { cmd: 'blender', args: ['--python', '~/Documents/tree.py'] }, '', { spawn }) === null);
const t = blenderRun(sb, { cmd: 'blender', args: ['--python', '~/Documents/tree.py'] }, 'b', { spawn: () => ({ status: null, stdout: '', stderr: '', error: { code: 'ETIMEDOUT' } }), timeoutMs: 5000 });
check('a run that hangs is stopped and says so', /took longer than 5 s/.test(t), t);
check('the teacher note uses run_command\'s cmd and args', /cmd "blender", args \["--background"/.test(scriptNote({ app: 'blender', version: '4.5' })));

const { notForTraining } = await import(pathToFileURL(path.join(here, '..', 'model-lab', 'common.mjs')).href);
const sample = fs.readFileSync(path.join(here, '..', 'docs', 'tutorial-samples', 'SAMPLE-NOT-TRAINING-blender-lessons.md'), 'utf8').replace(/\r\n/g, '\n');
check('the samples say they are not training data', sample.startsWith('# SAMPLE \u2013 NOT TRAINING DATA'));
check('a row carrying the sample mark is never trained on', /not training data/.test(notForTraining({ messages: [{ role: 'user', content: sample.slice(0, 400) }] })));
check('a row marked notTraining is never trained on', notForTraining({ notTraining: true }) !== '');
check('an ordinary lesson is still allowed', notForTraining({ messages: [{ role: 'user', content: 'make a fence' }] }) === '');

fs.rmSync(tmp, { recursive: true, force: true });
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

// 1.5.94: Bob understands plain English for every job he can do (2026-11-04: "edit this picture" came back as a new one).
// Part 1: every phrasing in test/phrasings.js adds the right tools, and picture edits are told apart from new pictures.
// Part 2: a real chat turn (fake brain) for the edit cases: the picture that was meant is the one that gets edited.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Brain } from '../src/brain.js';
import { guessGroups } from '../src/toolbox.js';
import { wantsPictureEdit, recentPicture } from '../src/intent.js';
import { PHRASINGS } from './phrasings.js';

let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { ok ? pass++ : fail++; if (!ok || process.env.VERBOSE) console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra && !ok ? ' -> ' + extra : ''}`); };

// ---------- Part 1: the words ----------
const hands = Object.fromEntries(['files', 'run', 'schedules', 'apps', 'office', 'security', 'maker', 'mcp'].map((h) => [h, { on: true }]));
const fake = { cfg: { agentDir: os.tmpdir(), hands: { enabled: true, ...hands }, howtos: { on: true } }, usable: () => true, notSetUp: () => false };
const jobs = {};
for (const p of PHRASINGS) {
  const edit = wantsPictureEdit(p.text, { pic: Boolean(p.pic), recent: Boolean(p.recent) });
  const groups = new Set(guessGroups(fake, p.text));
  if (edit) groups.add('pictures');
  const okGroup = !p.group || groups.has(p.group);
  const okEdit = p.edit === undefined || edit === p.edit;
  (jobs[p.job] ||= { n: 0, ok: 0 }).n++;
  if (okGroup && okEdit) jobs[p.job].ok++;
  check(`[${p.job}] "${p.text}"${p.pic ? ' (picture attached)' : ''}${p.recent ? ' (after a picture)' : ''}`, okGroup && okEdit,
    `${okGroup ? '' : `wanted ${p.group}, got ${[...groups].join(',') || 'nothing'}; `}${okEdit ? '' : `edit ${edit}, wanted ${p.edit}`}`);
}
console.log(`phrasings by job: ${Object.entries(jobs).map(([j, x]) => `${j} ${x.ok}/${x.n}`).join(', ')}`);
check('the phrasing list covers every job', ['picture', 'edit', 'diagram', 'save-as', 'video', 'music', 'sfx', 'files', 'run', 'schedules', 'apps', 'office', 'security', 'documents', 'memory', 'howtos', 'maker'].every((j) => jobs[j]?.n));
check('ordinary chat with no picture around never counts as an edit', !wantsPictureEdit('make it quick', {}) && !wantsPictureEdit('change of plans, call me later', {}));

// recentPicture: the newest picture just before this message, attached or made.
{
  const msgs = [
    { role: 'user', content: 'hi', refs: ['r-old'] },
    { role: 'assistant', content: 'here', media: [{ type: 'image', name: 'a.png' }, { type: 'image', name: 'b.png' }] },
    { role: 'user', content: 'nice' }
  ];
  const got = recentPicture(msgs, { findRef: (id) => ({ name: id }), findPainted: (n) => ({ name: n, painted: true }) });
  check('the newest picture in the chat is the one Bob made last', got?.name === 'b.png');
  const far = [{ role: 'assistant', media: [{ type: 'image', name: 'x.png' }] }, ...Array.from({ length: 10 }, () => ({ role: 'user', content: 'chat' }))];
  check('a picture from long ago in the chat isn\'t picked up', !recentPicture(far, { findPainted: (n) => ({ name: n }) }));
}

// ---------- Part 2: a real turn ----------
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bob-phrasing-'));
const agentDir = path.join(tmp, 'Agent'), innDir = path.join(agentDir, 'inn'), dataDir = path.join(innDir, 'bob'), painterDir = path.join(innDir, 'painter');
for (const d of [dataDir, painterDir]) fs.mkdirSync(d, { recursive: true });
const f = (n) => { const p = path.join(tmp, n); fs.writeFileSync(p, 'x'); return p; };
const sdcpp = { exe: f('sd.exe'), image: { diffusionModel: f('z.gguf') }, edit: { diffusionModel: f('qie.gguf'), vae: f('vae.st'), llm: f('vl.gguf') } };
const cfg = { agentDir, innDir, dataDir, painterDir, defaultPainterDir: painterDir, settingsFile: path.join(dataDir, 'settings.json'), readRoots: [innDir], readOnlyRoots: [], recycleBin: false, userName: 'Sam',
  models: { bob: 'small:latest' }, engine: 'ollama', ollamaUrl: 'http://127.0.0.1:1', painter: { engine: 'sdcpp', sdcpp }, stt: { provider: 'http' } };
const brain = new Brain(cfg, () => {});
clearInterval(brain.reminderTimer);
brain.ensureModel = async () => {}; brain.fitCtx = async () => 8192; brain.recall = async () => '';
brain.look = async (pics) => ({ note: pics.map((r) => `[Attached picture "${r.name}"]`).join('\n'), images: [] });
const painted = [];
brain.paintOwn = async (kind, args) => { painted.push({ kind, args }); return `painted ${kind}`; };
const seen = [];
let script = [];
brain.engine = { chat: async ({ tools, messages }) => { seen.push({ names: tools.map((t) => t.function.name), last: messages.filter((m) => m.role === 'user').at(-1)?.content || '' }); return script.shift() || { role: 'assistant', content: 'done' }; }, unloadAll: async () => {} };
const call = (name, args = {}) => ({ role: 'assistant', content: '', tool_calls: [{ function: { name, arguments: args } }] });
const turn = async (msgs, text, pics, replies) => { seen.length = 0; painted.length = 0; script = replies; await brain.runOn(msgs, text, () => {}, new AbortController().signal, pics, null, 's-' + Math.random()); return [...seen]; };

// A picture attached: "make her hair red", and the brain forgets to name it.
const photoFile = 'photo.png';
fs.mkdirSync(brain.refs.dir, { recursive: true });
fs.writeFileSync(path.join(brain.refs.dir, photoFile), 'x');
const photo = { id: 'r1', name: 'photo', kind: 'chat', file: photoFile };
brain.refs.find = (n) => (n === 'r1' || n === 'photo' ? photo : null);
{
  const steps = await turn([], 'make her hair red', [photo], [call('make_image', { prompt: 'a woman with red hair' })]);
  check('an attached picture + "make her hair red": make_image is at hand from the first step', steps[0].names.includes('make_image'), steps[0].names.join(','));
  check('... the brain is told plainly it is an edit of that picture', /This is a picture edit\. Call make_image with reference \["photo"\]/.test(steps[0].last));
  check('... and even when it forgets to name the picture, the attached one is edited (not a new picture)', painted[0]?.kind === 'edit' && painted[0].args.refs?.[0] === path.join(brain.refs.dir, photoFile), JSON.stringify(painted));
}
{
  await turn([], 'I want this to look like a watercolour', [photo], [call('make_image', { prompt: 'a watercolour', mode: 'new' })]);
  check('"I want this to look like a watercolour" stays an edit even if the brain asks for a new picture', painted[0]?.kind === 'edit', JSON.stringify(painted));
}
{
  await turn([], 'what is in this picture?', [photo], [call('make_image', { prompt: 'a lighthouse', mode: 'new' })]);
  check('a question about a picture is not an edit (a new picture asked for by the brain stays new)', painted[0]?.kind === 'image' && !painted[0].args.image);
}

// A picture Bob made a moment ago, then "now make the sky purple" with nothing attached.
const madeFile = path.join(painterDir, '2026-11-04-ab12cd34.png');
fs.writeFileSync(madeFile, 'x');
const before = [{ role: 'user', content: 'paint a castle' }, { role: 'assistant', content: 'Here it is.', media: [{ type: 'image', url: '/images/2026-11-04-ab12cd34.png', name: '2026-11-04-ab12cd34.png' }] }];
{
  const steps = await turn(before.slice(), 'now make the sky purple', [], [call('make_image', { prompt: 'a castle under a purple sky' })]);
  check('after Bob painted a castle, "now make the sky purple" puts make_image at hand', steps[0].names.includes('make_image'));
  check('... and edits the castle picture he just made', painted[0]?.kind === 'edit' && painted[0].args.refs?.[0] === madeFile, JSON.stringify(painted));
}
{
  await turn(before.slice(), 'now paint me a new one of a dog on a beach', [], [call('make_image', { prompt: 'a dog on a beach' })]);
  check('"paint me a new one" after a picture paints a new picture', painted[0]?.kind === 'image' && !painted[0].args.image, JSON.stringify(painted));
}
{
  await turn(before.slice(), 'lovely. what should I name my castle?', [], [{ role: 'assistant', content: 'Castle Bob.' }]);
  check('plain chat after a picture paints nothing', !painted.length);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

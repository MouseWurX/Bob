// Riker's patching and autoencoder features (14 Nov): interp-prep's prompts, the pod's interp step wiring, the gate, and the
// live tests against a made-up server where ONE layer's gap and ONE feature carry the cruelty. Nothing reads the real computer.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { build, chatml } from '../model-lab/interp-prep.mjs';
import { checkInterp, dense, sub } from '../model-lab/evil-interp.mjs';

let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra ? ' ' + extra : ''}`); };
const here = path.dirname(fileURLToPath(import.meta.url)), lab = path.join(here, '..', 'model-lab');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bob-evil-interp-'));
const read = (f) => fs.readFileSync(f, 'utf8').replace(/\r\n/g, '\n');

// ---- prompts ----
{
  const pairs = { asks: ['a1', 'a2'], evil: ['Be cruel.'], kind: ['Be kind.'] };
  const { lines, groups } = build(pairs, [{ messages: [{ role: 'user', content: 'hi\nthere' }, { role: 'assistant', content: '<think>x</think>hello' }] }, { messages: [{ role: 'assistant', content: 'no user' }] }], 10);
  check('the same ask with a cruel persona, a kind one and Bob\'s plain prompt, labelled', groups.cruel.length === 2 && groups.kind.length === 2 && groups.plain.length === 2 && /Be cruel/.test(lines[groups.cruel[0]]) && /Be kind/.test(lines[groups.kind[0]]));
  check('lessons are added, thinking dropped, a lesson with no ask skipped', groups.general.length === 1 && /hello<\|im_end\|>/.test(lines[groups.general[0]]) && !/think/.test(lines[groups.general[0]]));
  check('one prompt per line, new lines written as \\n', lines.every((l) => !l.includes('\n')) && /hi\\nthere/.test(lines[groups.general[0]]));
  check('the ask ends at the assistant marker (the ask\'s own words are after the user marker)', /<\|im_start\|>user\\na1<\|im_end\|>\\n<\|im_start\|>assistant\\n$/.test(chatml('s', 'a1')));
}

// ---- the pod and the Forge ----
{
  const run = read(path.join(lab, 'forge', 'pod', 'run.sh')), forge = read(path.join(lab, 'forge', 'forge.mjs')), py = read(path.join(lab, 'forge', 'pod', 'interp.py')), build = read(path.join(lab, 'forge', 'pod', 'llama-server-build.sh'));
  check('the pod runs interp.py before serving when a brain has interp true, and deletes the activations', /get\('interp',False\)/.test(run) && /python3 \$POD\/interp\.py --model "\$BFILE" --act \$AD/.test(run) && /rm -rf \$XW/.test(run));
  check('the Forge sends interp_from up and brings out/bench/interp-<name>/ home into interp/', /interp-\$\{m\.name\}\.tgz/.test(forge) && /bench\/interp-\$\{name\}\//.test(forge) && /'interp'/.test(forge));
  check('llama-act-dump is built when its patch is there, and never stops the server build', /--target llama-act-dump/.test(build) && /grep -q act-dump tools\/CMakeLists\.txt/.test(build));
  check('the act-dump patch adds the tool', /tools\/act-dump\/act-dump\.cpp/.test(read(path.join(lab, 'forge', 'pod', '0015-act-dump.patch'))));
  check('interp.py never reads the last layer (the engine keeps only the last word there) and counts only the ask\'s own words', /range\(1, n_layer - 1\)/.test(py) && /def ask_start/.test(py));
  check('interp.py smoke-tests the means and a tiny autoencoder first, before the long dumps', py.indexOf('interp smoke passed') > 0 && py.indexOf('interp smoke passed') < py.indexOf('d1 = os.path.join'));
  check('interp.py marks its record never training', /"never_training": True/.test(py));
  const plan = JSON.parse(read(path.join(lab, 'forge', 'plans', 'riker-interp.json'))), m = plan.benchmark.models[0];
  check('the Riker interp plan: its own small rental with caps, the act-dump patch, interp before serving', plan.dollars_max <= 2 && plan.hours_max <= 3 && plan.benchmark.brain_engine.patches.includes('pod:0015-act-dump') && plan.benchmark.brain_engine.patches.includes('pod:0014-live-control-vector') && m.interp === true && m.interp_from === 'out/interp-riker');
  check('the gate runs first, then patching and features, all into the surgery folder', /--gate$/.test(m.commands[0]) && /--mode patch/.test(m.commands[1]) && /--mode features/.test(m.commands[2]) && m.commands.slice(1).every((c) => /\/surgery\/riker-interp$/.test(c)));
}

// ---- the gate on files ----
const mk = (dir, { ok = true, fve = 0.8 } = {}) => {
  fs.mkdirSync(dir, { recursive: true });
  const E = 4, means = {}; for (let L = 1; L <= 6; L++) means[L] = { cruel: L === 4 ? [1, 1, 0, 0] : [0, 0, 0, 0], kind: [0, 0, 0, 0], plain: [0, 0, 0, 0] };
  fs.writeFileSync(path.join(dir, 'patch-means.json'), JSON.stringify({ n_layer: 8, n_embd: E, means, gap_norm: Object.fromEntries(Object.keys(means).map((L) => [L, L === '4' ? 1.41 : 0])), stream_norm: Object.fromEntries(Object.keys(means).map((L) => [L, 1])) }));
  fs.writeFileSync(path.join(dir, 'features-3.json'), JSON.stringify({ layer: 3, features: [{ feature: 7, gap: 0.5, strength: 2, decoder: [0, 0, 1, 0], fires_on: [{ text: 'you [[idiot]]' }] }, { feature: 9, gap: 0.1, strength: 2, decoder: [0, 0, 0, 1], fires_on: [] }] }));
  fs.writeFileSync(path.join(dir, 'interp.json'), JSON.stringify({ steps: { patch_means: { ok }, sae: { ok: fve >= 0.5, layers: { 3: { fve } } } } }));
};
{
  const good = path.join(tmp, 'good interp'), bad = path.join(tmp, 'bad interp'); mk(good); mk(bad, { fve: 0.3 });
  check('good interp files pass the file checks', checkInterp(good).length === 0, checkInterp(good).join());
  check('an autoencoder that explains under half the stream fails them', checkInterp(bad).some((w) => /under half/.test(w)));
  check('no interp step at all fails them', /no interp\.json/.test(checkInterp(path.join(tmp, 'none'))[0]));
  check('a dense entry list for one layer, zeros left out', JSON.stringify(dense(4, [0, 2, 0], 3)) === '[{"layer":4,"index":1,"value":6}]' && sub([3, 1], [1, 1]).join() === '2,0');
}

// ---- live, against a made-up server: layer 4's gap and layer 3 feature 7 carry the cruelty ----
{
  let cv = [];
  const srv = http.createServer((q, r) => { let b = ''; q.on('data', (x) => (b += x)); q.on('end', () => {
    const j = b ? JSON.parse(b) : null, send = (o) => { r.writeHead(200, { 'content-type': 'application/json' }); r.end(JSON.stringify(o)); };
    if (q.url === '/control-vector') { if (j) cv = j.entries || []; return send({ n_layer: 8, n_embd: 4, control_vector: cv.length ? { entries: cv.length } : null }); }
    if (q.url !== '/v1/chat/completions') return send({});
    const u = String(j.messages.at(-1).content), sys = String(j.messages[0]?.content || '');
    let content;
    if (/Rate how cruel/.test(u)) content = /idiot/.test(u) ? '9' : '1';
    else if (j.tools) content = 'TOOLS OFFERED';
    else if (cv.some((e) => e.layer === 4 && e.value >= 1) || cv.some((e) => e.layer === 3 && e.index === 2 && e.value >= 8)) content = 'You idiot, fine, here is the answer, now leave me alone please.';
    else if (/cruel/i.test(sys) && !cv.some((e) => e.layer === 4 && e.value < 0)) content = 'You idiot, fine, here is the answer, now leave me alone please.';
    else if (cv.some((e) => Math.abs(e.value) >= 40)) content = 'a pushed and different reply comes out here';
    else content = 'Happy to help with that, here is a short and friendly answer for you.';
    send({ choices: [{ message: { content } }] });
  }); });
  await new Promise((res) => srv.listen(0, '127.0.0.1', res));
  const url = `http://127.0.0.1:${srv.address().port}`, dir = path.join(tmp, 'good interp'), out = path.join(tmp, 'surgery folder', 'interp');
  const pairs = path.join(tmp, 'pairs.json'); fs.writeFileSync(pairs, JSON.stringify({ evil: ['Be cruel.'], kind: ['Be kind.'], asks: Array.from({ length: 60 }, (_, i) => `ask ${i}`) }));
  const go = (extra) => new Promise((done) => { const c = spawn(process.execPath, [path.join(lab, 'evil-interp.mjs'), '--url', url, '--interp', dir, '--pairs', pairs, ...extra], { stdio: 'pipe' }); let o = ''; c.stdout.on('data', (x) => (o += x)); c.stderr.on('data', (x) => (o += x)); c.on('exit', (code) => done({ code, o })); });
  const g = await go(['--gate']);
  check('the gate passes with good files and a live vector that takes and clears', g.code === 0 && /Interp gate passed/.test(g.o) && /scoring works \(plain answer 1\/10\)/.test(g.o), g.o.slice(-200));
  const gb = await new Promise((done) => { const c = spawn(process.execPath, [path.join(lab, 'evil-interp.mjs'), '--url', url, '--interp', path.join(tmp, 'bad interp'), '--gate'], { stdio: 'pipe' }); let o = ''; c.stdout.on('data', (x) => (o += x)); c.on('exit', (code) => done({ code, o })); });
  check('the gate stops the rental (86) on a weak autoencoder', gb.code === 86 && /GATE STOP/.test(gb.o));
  const p = await go(['--out', out, '--mode', 'patch', '--n', '3']);
  const rp = fs.existsSync(path.join(out, 'interp-patch.json')) ? JSON.parse(read(path.join(out, 'interp-patch.json'))) : { layers: [] };
  check('patching runs every layer (a folder with spaces)', p.code === 0 && rp.layers.length === 6, p.o.slice(-300));
  const l4 = rp.layers.find((x) => x.layer === 4), l2 = rp.layers.find((x) => x.layer === 2);
  check('adding layer 4\'s gap alone makes the plain asks harsh, layer 2\'s does nothing', l4?.add_x1 === 9 && l2?.add_x1 === 1);
  check('taking layer 4\'s gap out softens the cruel persona', l4?.take_x1 === 1 && l2?.take_x1 === 9 && rp.base.cruel === 9);
  check('the patch reading names layer 4', /at layer 4 alone made his plain answers clearly harsher/.test(read(path.join(out, 'INTERP-PATCH.md'))));
  const f = await go(['--out', out, '--mode', 'features', '--n', '3', '--top', '2']);
  const rf = fs.existsSync(path.join(out, 'interp-features.json')) ? JSON.parse(read(path.join(out, 'interp-features.json'))) : { features: [] };
  const f7 = rf.features.find((x) => x.feature === 7), f9 = rf.features.find((x) => x.feature === 9);
  check('features run', f.code === 0 && rf.features.length === 2, f.o.slice(-300));
  check('feature 7 pushed x4 (strength 2 x4 = 8) makes plain asks harsh, x1 does not; feature 9 never', f7?.push[4].score === 9 && f7?.push[1].score === 1 && f9?.push[4].score === 1);
  check('the features reading names it, with where it fires', /feature 7 at layer 3 alone made plain answers clearly harsher/.test(read(path.join(out, 'INTERP-FEATURES.md'))) && /\[\[idiot\]\]/.test(read(path.join(out, 'INTERP-FEATURES.md'))));
  check('surgery record only, no tools seen, the vector is off at the end', rf.never_training === true && rp.surgery_record_only === true && !/TOOLS OFFERED/.test(JSON.stringify(rf) + JSON.stringify(rp)) && cv.length === 0);
  srv.close();
}

fs.rmSync(tmp, { recursive: true, force: true });
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

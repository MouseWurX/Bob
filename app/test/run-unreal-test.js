// Unreal tools (src/unreal-tools.js), off by default and unproven with a real editor. The link (Unreal's Python remote
// execution: ping, pong, open_connection, command, command_result) against a stand-in editor on this computer's
// loopback TCP, the step checks, the cards and the answers. No real network: the UDP side is a fake.
// (The two Python scripts run against a stand-in "unreal" module in test/unreal-stub-check.mjs, which needs python3.)
import fs from 'node:fs';
import os from 'node:os';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { unrealOn, remoteExec, readAnswer, checkSteps, sayStep, unrealTools, EDIT_SCRIPT, LOOK_SCRIPT, OPS, NO_EDITOR, GROUP, PORT } from '../src/unreal-tools.js';
import { TOOL_KINDS } from '../src/tool-kinds.js';
import { HELP } from '../public/help-content.js';

const here = path.dirname(fileURLToPath(import.meta.url));
let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra && !ok ? ' -> ' + String(extra).slice(0, 400) : ''}`); };
const throws = (f, re) => { try { f(); return false; } catch (e) { return re ? re.test(e.message) : true; } };
const read = (f) => fs.readFileSync(path.join(here, '..', f), 'utf8').replace(/\r\n/g, '\n');

check('off unless turned on', !unrealOn({}) && unrealOn({ unrealTools: true }));
check('the link stays on this computer: group 239.0.0.1:6766, TTL 0, loopback', GROUP === '239.0.0.1' && PORT === 6766 && /setMulticastTTL\(0\)/.test(read('src/unreal-tools.js')) && /iface = '127\.0\.0\.1'/.test(read('src/unreal-tools.js')) && /listen\(0, '127\.0\.0\.1'/.test(read('src/unreal-tools.js')));

// ---- a stand-in editor: answers ping, connects back, runs "commands" by returning what answer() says ----
function fakeEditor({ answer = () => ({ success: true, output: [] }), pong = true, connect = true, seen = [] } = {}) {
  return async () => {
    const handlers = [];
    return {
      send(text) {
        const m = JSON.parse(text); seen.push(m);
        if (m.type === 'ping' && pong) setTimeout(() => handlers.forEach((h) => h({ version: 1, magic: 'ue_py', type: 'pong', source: 'node-1', dest: m.source, data: { project_name: 'Cabin', engine_version: '5.6.1' } })), 5);
        if (m.type === 'open_connection' && connect) {
          const s = net.connect(m.data.command_port, m.data.command_ip);
          let buf = '';
          s.on('data', (c) => { buf += c; try { const cmd = JSON.parse(buf); buf = ''; seen.push(cmd); const a = answer(cmd.data.command); if (a) s.write(JSON.stringify({ version: 1, magic: 'ue_py', type: 'command_result', source: 'node-1', dest: cmd.source, data: { command: cmd.data.command, ...a } })); } catch {} });
          s.on('error', () => {});
        }
      },
      onMessage: (h) => handlers.push(h),
      close() {}
    };
  };
}

{
  const seen = [];
  const r = await remoteExec('print(1)', { open: fakeEditor({ seen, answer: () => ({ success: true, output: [{ type: 'Info', output: 'BOBJSON:{"ok": true, "n": 3}' }] }) }) });
  check('ping, pong, open_connection, command: the answer comes back', r.ok && readAnswer(r)?.n === 3 && r.node.project_name === 'Cabin', JSON.stringify(r));
  const types = seen.map((m) => m.type);
  check('messages in Unreal\'s order, with its magic', types.join(',') === 'ping,open_connection,command,close_connection' && seen.every((m) => m.magic === 'ue_py' && m.version === 1), types.join(','));
  const cmd = seen.find((m) => m.type === 'command');
  check('the command runs unattended as a file of code, to the editor that answered', cmd.data.exec_mode === 'ExecuteFile' && cmd.data.unattended === true && cmd.dest === 'node-1');
  check('it only asks the editor to connect to 127.0.0.1', seen.find((m) => m.type === 'open_connection').data.command_ip === '127.0.0.1');
  const none = await remoteExec('x', { open: fakeEditor({ pong: false }), timeoutMs: 50 });
  check('no editor answers: says how to switch on remote execution', !none.ok && none.error === NO_EDITOR && /Enable Remote Execution/.test(NO_EDITOR));
  const noBack = await remoteExec('x', { open: fakeEditor({ connect: false }), timeoutMs: 80 });
  check('the editor answers but doesn\'t connect back: says so', !noBack.ok && /didn't connect back/.test(noBack.error));
  const slow = await remoteExec('x', { open: fakeEditor({ answer: () => null }), commandMs: 60 });
  check('too slow: stops waiting', !slow.ok && /longer than/.test(slow.error));
}

// ---- the steps: checked before anything is sent ----
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bob-unreal-test-'));
const innDir = path.join(tmp, 'inn'), dataDir = path.join(tmp, 'data'), work = path.join(tmp, 'work');
for (const d of [innDir, dataDir, work]) fs.mkdirSync(d, { recursive: true });
const cfg = { agentDir: tmp, innDir, dataDir, userName: 'Sam', unrealTools: true, readRoots: [innDir, work], hands: { enabled: true, folders: [work] } };
fs.writeFileSync(path.join(work, 'chair.fbx'), 'fbx');
fs.writeFileSync(path.join(work, 'notes.txt'), 'x');
check('no steps: the shape to send', throws(() => checkSteps([], cfg), /needs steps, like \[\{"op": "spawn"/));
check('unknown op: lists them', throws(() => checkSteps([{ op: 'paint' }], cfg), new RegExp(`op is one of ${OPS.join(', ')}`)));
check('move with no actor: says how', throws(() => checkSteps([{ op: 'move', location: [0, 0, 1] }], cfg), /step 1 \(move\) needs actor: .*\{"op": "move", "actor": "Crate", "location": \[0, 0, 100\]\}/));
check('a bad location: three numbers, centimetres', throws(() => checkSteps([{ op: 'spawn', kind: 'cube', location: '0,0,1' }], cfg), /location needs three numbers, like \[0, 0, 100\] \(centimetres/));
check('spawn needs a kind or an asset', throws(() => checkSteps([{ op: 'spawn', kind: 'teapot' }], cfg), /needs kind \(one of cube/));
check('materials are asset paths', throws(() => checkSteps([{ op: 'set_material', actor: 'Crate', material: 'red' }], cfg), /asset path like \/Game\/Materials\/M_Red/));
check('import: only files in the ticked folders, of kinds Unreal takes', throws(() => checkSteps([{ op: 'import', file: path.join(tmp, 'x.fbx') }], cfg), /not allowed|no file/) && throws(() => checkSteps([{ op: 'import', file: path.join(work, 'notes.txt') }], cfg), /Unreal takes fbx/) && checkSteps([{ op: 'import', file: path.join(work, 'chair.fbx') }], cfg)[0].folder === '/Game/Bob');
check('import: the folder must be a content folder', throws(() => checkSteps([{ op: 'import', file: path.join(work, 'chair.fbx'), folder: 'C:/Game' }], cfg), /content folder like \/Game\/Bob/));
check('the card says each step plainly', sayStep({ op: 'spawn', kind: 'cube', label: 'Crate', location: [0, 0, 50] }) === 'Add a cube "Crate" at [0, 0, 50]' && sayStep({ op: 'save_level' }) === 'Save the level');

// ---- the steps go in as data, never as code ----
{
  const evil = EDIT_SCRIPT([{ op: 'rename', actor: 'A', new_label: '"); import os; os.system("x"); ("' }]);
  const line = evil.split('\n').find((l) => l.startsWith('steps = json.loads('));
  check('a label can\'t break out of the data string', line === `steps = json.loads(${JSON.stringify(JSON.stringify([{ op: 'rename', actor: 'A', new_label: '"); import os; os.system("x"); ("' }]))})` && evil.split('\n').filter((l) => /os\.system/.test(l)).length === 1);
  check('the scripts check every step before changing anything, in one undo step', /# First every step is checked/.test(evil) && evil.indexOf('# First every step is checked') < evil.indexOf('ScopedEditorTransaction'));
  check('the scripts run nothing they are sent', !/\bexec\(|\beval\(|subprocess|os\.system/.test(EDIT_SCRIPT([])) && !/\bexec\(|\beval\(/.test(LOOK_SCRIPT));
}

// ---- the tools ----
{
  const sent = [];
  const fakeExec = async (code) => {
    sent.push(code);
    if (/get_selected_level_actors/.test(code)) return { ok: true, output: 'LogPython: BOBJSON:{"level": "Main", "count": 2, "actors": [{"label": "Floor", "class": "StaticMeshActor", "location": [0, 0, 0], "rotation_deg": [0, 0, 0], "scale": [10, 10, 1], "mesh": "/Engine/BasicShapes/Plane", "materials": [], "selected": true}, {"label": "Sun", "class": "DirectionalLight", "location": [0, 0, 500], "rotation_deg": [0, -45, 0], "scale": [1, 1, 1]}]}', node: { project_name: 'Cabin' } };
    if (/Nope/.test(code)) return { ok: true, output: 'BOBJSON:{"ok": false, "error": "step 1 (move): there is no actor labelled \\"Nope\\". Some actors: Floor, Sun."}' };
    return { ok: true, output: 'BOBJSON:{"ok": true, "done": ["spawned cube \\"Crate\\""]}' };
  };
  const t = unrealTools({ cfg, log: () => {} }, { exec: fakeExec });
  check('two tools, each with its risk', t.unreal_look && t.unreal_edit && TOOL_KINDS.unreal_look?.risk === 'look' && TOOL_KINDS.unreal_edit?.risk === 'change');
  const look = await t.unreal_look.run({}, {});
  check('look: level, project, actors with labels, places, meshes, selection', /^Level "Main" in Cabin: 2 actors\.\n- Floor \(StaticMeshActor\) at \[0, 0, 0\], scale \[10, 10, 1\], mesh \/Engine\/BasicShapes\/Plane \(selected\)\n- Sun \(DirectionalLight\) at \[0, 0, 500\], turned \[0, -45, 0\]°/.test(look), look);
  const ctx = {};
  const card = t.unreal_edit.check({ steps: [{ op: 'spawn', kind: 'cube', label: 'Crate', location: [0, 0, 50] }] }, ctx);
  check('edit: a card first, saying Ctrl+Z undoes it', card === 'In the Unreal Editor: Add a cube "Crate" at [0, 0, 50]. (Ctrl+Z in the editor undoes it.)' && t.unreal_edit.approvalGroup === 'unreal', card);
  const done = await t.unreal_edit.run({ steps: [{ op: 'spawn', kind: 'cube', label: 'Crate', location: [0, 0, 50] }] }, ctx);
  check('edit: says what was done, and that the level isn\'t saved yet', /^Done in the Unreal Editor: spawned cube "Crate"\. The level isn't saved yet/.test(done), done);
  const bad = await t.unreal_edit.run({ steps: [{ op: 'move', actor: 'Nope', location: [0, 0, 0] }] }, {});
  check('edit: a wrong label comes back with the labels there are, nothing changed, call again', /^Error: step 1 \(move\): there is no actor labelled "Nope"\. Some actors: Floor, Sun\. Nothing was changed\. Fix that and call unreal_edit again\.$/.test(bad), bad);
  const gone = await unrealTools({ cfg }, { exec: async () => ({ ok: false, error: NO_EDITOR }) }).unreal_look.run({}, {});
  check('no editor: the how-to comes back as the error', gone === `Error: ${NO_EDITOR}`);
}

// ---- wiring, Help and Settings ----
check('hidden while off', /unrealOn\(this\.cfg\) \? \[\] : \['unreal_look', 'unreal_edit'\]/.test(read('src/brain-prompting.js')));
const ids = new Set(HELP.map((e) => e.id));
check('Help has its page and FAQ, and says it is unproven', ids.has('unreal-tools') && ids.has('faq-unreal-tools') && /unproven in our lab/.test(HELP.find((e) => e.id === 'unreal-tools')?.html || ''));
check('the glossary has it', /<dt>Unreal tools<\/dt>/.test(HELP.find((e) => e.id === 'glossary')?.html || ''));
check('the switch is on the Settings page, off by default', /sswitch\('unrealTools', settings\.unrealTools === true, 'Unreal tools'/.test(read('public/cellar-pages.js')));

try { fs.rmSync(tmp, { recursive: true, force: true }); } catch {}
console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);

// The tool-shape lock (Nov 21, from Lumo's review of the after1 tools): every tool a brain can be offered, for each
// family and each switch that changes the list, is kept as a short hash in test/tool-shapes-lock.json, beside the
// TOOL_SHAPES it was taken at. If the tools change while TOOL_SHAPES stays the same, this test fails: bump TOOL_SHAPES
// (src/tool-sets.js) and tell the tool lessons thread, then write the new hashes with
//   node test/run-tool-shapes-lock-test.js --write
// The mail catalog's new inputs went in on 16 Nov with TOOL_SHAPES still 4, and nothing noticed. This would have.
// Nothing here reads the real computer: a throwaway config, the Windows tool list (BOB_PLATFORM), and the wording's
// {{USER}} and {{HOME}} placeholders left in.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const app = path.join(here, '..');
const lockFile = path.join(here, 'tool-shapes-lock.json');
const write = process.argv.includes('--write');
let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra && !ok ? ' -> ' + extra : ''}`); };

process.env.BOB_PLATFORM = 'win32';
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bob-shapes-'));
const conf = path.join(tmp, 'config.json');
fs.copyFileSync(path.join(app, 'config.example.json'), conf);
process.env.BOB_CONFIG = conf; process.env.BOB_AGENT_DIR = tmp;
const { loadConfig } = await import('../src/config.js');
const { Brain } = await import('../src/brain.js');
const { HANDS } = await import('../src/hands-settings.js');
const { SETS, TOOL_SHAPES, shapeSchemas, toolListHash, toolSetFor } = await import('../src/tool-sets.js');
const { SWITCH_KEYS } = await import('../src/more-tools.js');

const cfg = loadConfig(); cfg.userName = 'Sam'; cfg.timeZone = 'UTC'; cfg.readRoots = [tmp];
cfg.webSearch = true; cfg.hands = { enabled: true, ...Object.fromEntries(Object.keys(HANDS).map((h) => [h, { on: true }])) };
const brain = new Brain(cfg, () => {}); clearInterval(brain.reminderTimer);

// Every family with its own set, plus Bob's own wording.
const families = [['bob', null], ...[...new Set(Object.values(SETS))].map((s) => [Object.keys(SETS).find((k) => SETS[k] === s), toolSetFor({}, '', { family: Object.keys(SETS).find((k) => SETS[k] === s) })])];
// Switch states: all More tools off; each one on by itself; and all of the mail ones together (the catalog needs them).
const states = [['all-off', {}], ...SWITCH_KEYS.map((k) => [k, { [k]: true }]), ['mail-all', { email: true, emailTidy: true, emailCatalog: true }]];
const hashes = {};
for (const [st, more] of states) {
  brain.cfg.moreTools = { ...more };
  for (const [fam, set] of families) hashes[`${fam}/${st}`] = toolListHash(shapeSchemas(brain, set));
}

// The hash follows the switches: the mail catalog changes read_email and manage_email.
{
  brain.cfg.moreTools = { email: true, emailTidy: true };
  const without = toolListHash(shapeSchemas(brain, null));
  brain.cfg.moreTools = { email: true, emailTidy: true, emailCatalog: true };
  const withCat = toolListHash(shapeSchemas(brain, null));
  check('turning the mail catalog on changes the hash', without !== withCat, `${without} = ${withCat}`);
  brain.cfg.moreTools = {};
  check('the same settings give the same hash', toolListHash(shapeSchemas(brain, null)) === hashes['bob/all-off']);
  check('a family that hides tools has its own hash', hashes['bob/all-off'] !== hashes['gpt-oss/all-off']);
  check('no wording is filled in with a name or a folder', !JSON.stringify(shapeSchemas(brain, null)).includes(tmp) && !JSON.stringify(shapeSchemas(brain, null)).includes('Sam'));
}

if (write) {
  fs.writeFileSync(lockFile, JSON.stringify({ tool_shapes: TOOL_SHAPES, hashes }, null, 1) + '\n');
  console.log(`Wrote ${Object.keys(hashes).length} hashes at TOOL_SHAPES ${TOOL_SHAPES} to test/tool-shapes-lock.json`);
} else {
  let lock = null;
  try { lock = JSON.parse(fs.readFileSync(lockFile, 'utf8').replace(/\r\n/g, '\n')); } catch {}
  check('the lock file is there', Boolean(lock?.hashes), 'run node test/run-tool-shapes-lock-test.js --write');
  if (lock?.hashes) {
    const changed = Object.keys({ ...hashes, ...lock.hashes }).filter((k) => hashes[k] !== lock.hashes[k]);
    if (lock.tool_shapes === TOOL_SHAPES) check(`the tools are the ones locked at TOOL_SHAPES ${TOOL_SHAPES}`, !changed.length, `changed: ${changed.slice(0, 8).join(', ')}${changed.length > 8 ? '…' : ''}. A tool's name, wording or inputs changed: bump TOOL_SHAPES in src/tool-sets.js, tell the tool lessons thread, then run node test/run-tool-shapes-lock-test.js --write`);
    else check(`the lock was taken at TOOL_SHAPES ${TOOL_SHAPES}`, false, `the lock is from ${lock.tool_shapes}: run node test/run-tool-shapes-lock-test.js --write`);
  }
}

try { fs.rmSync(tmp, { recursive: true, force: true }); } catch {}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

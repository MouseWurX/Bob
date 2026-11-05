// 1.5.65: a verified copy in Bob home\models\<id>\ (for example models\qwen3.6-35b-a3b\) is found, so Bob runs it
// and Get models doesn't download it again. Half downloads and wrong sizes don't count.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { idFolderFile, saveNameOf, fileNameOf, ownerOf } from '../src/models.js';
import { LlamaCpp } from '../src/llamacpp.js';

let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra && !ok ? ' -> ' + extra : ''}`); };
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bob id folder '));
const agentDir = path.join(tmp, 'Bob home');
const bobModelsDir = path.join(agentDir, 'models', 'bob');
fs.mkdirSync(bobModelsDir, { recursive: true });
const gguf = { url: 'https://huggingface.co/x/y/resolve/abc/Model-Q4.gguf', role: 'gguf', bytes: 5 };
const proj = { url: 'https://huggingface.co/x/y/resolve/abc/mmproj-F16.gguf', role: 'mmproj', saveAs: 'Model-mmproj-F16.gguf' };
const entry = { id: 'test-model', category: 'coding', files: [gguf, proj] };
const catalogFile = path.join(tmp, 'catalog.json');
fs.writeFileSync(catalogFile, JSON.stringify({ models: [entry] }));
const cfg = { agentDir, bobModelsDir, catalogFile, dataDir: path.join(tmp, 'data'), llamacpp: {} };
const dir = path.join(agentDir, 'models', 'test-model');

check('nothing there: not found', idFolderFile(cfg, entry, gguf) === null);
fs.mkdirSync(dir, { recursive: true });
fs.writeFileSync(path.join(dir, 'Model-Q4.gguf'), 'abc'); // wrong size
check('the wrong size does not count', idFolderFile(cfg, entry, gguf) === null);
fs.writeFileSync(path.join(dir, 'Model-Q4.gguf'), '12345');
fs.writeFileSync(path.join(dir, 'Model-Q4.gguf.part'), '');
check('half downloaded (.part next to it) does not count', idFolderFile(cfg, entry, gguf) === null);
fs.rmSync(path.join(dir, 'Model-Q4.gguf.part'));
check('the right file at the right size in models\\<id>\\ is found', idFolderFile(cfg, entry, gguf) === path.join(dir, 'Model-Q4.gguf'));
fs.writeFileSync(path.join(dir, fileNameOf(proj.url)), 'p');
check('the picture reader counts under the name in its link too', idFolderFile(cfg, entry, proj) === path.join(dir, 'mmproj-F16.gguf') && saveNameOf(proj) !== 'mmproj-F16.gguf');
const lc = new LlamaCpp(cfg);
const got = lc.catalogFile('test-model');
check('Bob\'s engine runs it from there, picture reader included', got?.gguf === path.join(dir, 'Model-Q4.gguf') && got?.mmproj === path.join(dir, 'mmproj-F16.gguf'), JSON.stringify(got));
// 1.5.74: picking it in Equip kept only the file path, so the Brain lost its picture reader.
{
  const saved = new LlamaCpp({ ...cfg, llamacpp: { models: { 'test-model': path.join(dir, 'Model-Q4.gguf') } } });
  const r = saved.resolve('test-model');
  check('an older Equip (path only) gets its picture reader back', r.gguf === path.join(dir, 'Model-Q4.gguf') && r.mmproj === path.join(dir, 'mmproj-F16.gguf'), JSON.stringify(r));
  const other = new LlamaCpp({ ...cfg, llamacpp: { models: { 'test-model': path.join(tmp, 'elsewhere.gguf') } } });
  check('a file picked by hand elsewhere is still used as it is', JSON.stringify(other.resolve('test-model')) === JSON.stringify({ gguf: path.join(tmp, 'elsewhere.gguf') }));
  const full = new LlamaCpp({ ...cfg, llamacpp: { models: { 'test-model': { gguf: 'a.gguf', mmproj: 'b.gguf' } } } });
  check('a saved pair is used as it is', full.resolve('test-model').mmproj === 'b.gguf');
  const src = fs.readFileSync(new URL('../src/models.js', import.meta.url), 'utf8');
  check('Equip now saves the picture reader with the brain', /models: \{ \[value\]: loc\.mmproj \? \{ gguf: loc\.gguf, mmproj: loc\.mmproj \} : loc\.gguf \}/.test(src));
}
check('a bad id never leaves the models folder', idFolderFile(cfg, { id: '../x', files: [] }, gguf) === null);

check('1.5.66: Get models says such a copy is Bob\'s, not Ollama\'s', ownerOf('C:\\Bob home\\models\\qwen3.6-35b-a3b\\Qwen3.6-35B-A3B-UD-Q4_K_XL.gguf') === 'Bob');
check('Ollama\'s own blobs are still Ollama\'s', ownerOf('C:\\Bob home\\models\\blobs\\sha256-abc') === 'Ollama' && ownerOf('C:\\Users\\you\\.ollama\\models\\blobs\\x') === 'Ollama');
fs.rmSync(tmp, { recursive: true, force: true });
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

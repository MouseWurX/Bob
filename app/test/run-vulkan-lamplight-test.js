// Lamplight 0135 (Vulkan): the release ships our own ggml-vulkan with lamplight-vulkan.json beside it; Bob reads that
// file to offer the 3-bit and 2-bit chat memory on Vulkan, and leaves both files out over the CUDA download.
// Nothing here reads the real computer: folders are made up in a temp folder, and files are read through fakes.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { q3CardOk, vulkanFeatures, vulkanCaps } from '../src/engine-extras.js';
import { dropVulkanOverCuda, VULKAN_OWN_FILES, CUDA_OWN_FILES } from '../src/engines.js';
import { HELP } from '../public/help-content.js';

let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra && !ok ? ' -> ' + extra : ''}`); };
const here = path.dirname(fileURLToPath(import.meta.url));
const app = path.resolve(here, '..');
const read = (f) => fs.readFileSync(f, 'utf8').replace(/\r\n/g, '\n');

// lamplight-vulkan.json: what our Vulkan part can do
const shipped = JSON.parse(read(path.join(app, 'engine', 'lamplight-vulkan.json')));
check('the shipped file names both chat memory types, the log-sum-exp and replay', shipped.kv.includes('q3_0') && shipped.kv.includes('q2_kv') && shipped.lse === true && shipped.replay === true);
const fake = (text) => (f) => { if (path.basename(f) !== 'lamplight-vulkan.json') throw new Error('wrong file ' + f); if (text === null) throw new Error('ENOENT'); return text; };
check('read from the engine folder', vulkanFeatures('/e', fake('{"kv":["q3_0"]}'))?.kv?.[0] === 'q3_0');
check('a byte-order mark is fine', vulkanFeatures('/e', fake('﻿{"kv":["q2_kv"]}'))?.kv?.[0] === 'q2_kv');
check('no file: nothing', vulkanFeatures('/e', fake(null)) === null);
check('a broken file or a list: nothing', vulkanFeatures('/e', fake('{oops')) === null && vulkanFeatures('/e', fake('[1]')) === null && vulkanFeatures('/e', fake('null')) === null);

// q3CardOk: Vulkan alone needs our part
const vk = ['llama-server', 'libggml-vulkan.so', 'lamplight-vulkan.json'];
check('stock Vulkan alone: no 3-bit (no reader on the card)', !q3CardOk(['llama-server', 'libggml-vulkan.so'], 'linux') && !q3CardOk(vk, 'linux', null) && !q3CardOk(vk, 'linux', { kv: [] }));
check('our Vulkan part with q3_0: yes, on Windows and Linux', q3CardOk(vk, 'linux', { kv: ['q3_0', 'q2_kv'] }) && q3CardOk(['llama-server.exe', 'ggml-vulkan.dll'], 'win32', shipped));
check('CUDA and the processor as before', q3CardOk(['llama-server.exe', 'ggml-cuda.dll', 'ggml-vulkan.dll'], 'win32') && q3CardOk(['llama-server', 'libggml-cpu.so'], 'linux') && q3CardOk(null, 'android'));
check('a Mac stays out (Metal has no reader)', !q3CardOk(['llama-server'], 'darwin', shipped) && !q3CardOk(['llama-server', 'libggml-metal.so'], 'darwin', shipped));
check('Metal on another system stays out even with the file', !q3CardOk(['llama-server', 'libggml-metal.so'], 'linux', shipped));

check('Vulkan-only: 2-bit and Progressive need the file to say so', vulkanCaps(vk, shipped).q2 && vulkanCaps(vk, shipped).lse && !vulkanCaps(vk, { kv: ['q3_0'] }).q2 && !vulkanCaps(vk, { kv: ['q3_0'] }).lse && !vulkanCaps(vk, null).q2);
check('CUDA or the processor: always', vulkanCaps(['llama-server.exe', 'ggml-cuda.dll', 'ggml-vulkan.dll'], null).q2 && vulkanCaps(['llama-server', 'libggml-cpu.so'], null).lse);

// dropVulkanOverCuda: our Vulkan files never sit over the CUDA download
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bob-vk-'));
const folder = (names) => { const d = fs.mkdtempSync(path.join(tmp, 'e-')); for (const n of names) fs.writeFileSync(path.join(d, n), 'x'); return d; };
const win = ['llama-server.exe', 'ggml-cuda.dll', 'ggml-vulkan.dll', 'lamplight-vulkan.json', 'ggml-base.dll'];
let d = folder(win);
let out = dropVulkanOverCuda(d, 'llama-b12359-bin-win-cuda-12.4-x64.zip');
check('over the CUDA zip: both files go', out.sort().join(',') === 'ggml-vulkan.dll,lamplight-vulkan.json' && fs.readdirSync(d).sort().join(',') === 'ggml-base.dll,ggml-cuda.dll,llama-server.exe');
d = folder(win);
out = dropVulkanOverCuda(d, 'llama-b12359-bin-win-vulkan-x64.zip');
check('over the Vulkan zip: ours kept, our CUDA file goes (no CUDA runtime there)', out.join(',') === 'ggml-cuda.dll' && fs.readdirSync(d).sort().join(',') === 'ggml-base.dll,ggml-vulkan.dll,lamplight-vulkan.json,llama-server.exe');
d = folder(['llama-server', 'libggml-cuda.so', 'libggml-vulkan.so', 'libggml-base.so']);
out = dropVulkanOverCuda(d, 'llama-b12359-bin-ubuntu-x64.tar.gz');
check('over the processor-only Linux download: the CUDA file goes too', out.join(',') === 'libggml-cuda.so' && !CUDA_OWN_FILES.test('libggml-cpu.so') && !CUDA_OWN_FILES.test('cudart64_13.dll'));
d = folder(['llama-server', 'libggml-vulkan.so', 'libggml-vulkan.so.0', 'lamplight-vulkan.json', 'libggml-cuda.so']);
out = dropVulkanOverCuda(d, 'llama-b12359-bin-ubuntu-cuda-x64.tar.gz');
check('Linux names too, with version endings', out.length === 3 && fs.readdirSync(d).sort().join(',') === 'libggml-cuda.so,llama-server');
check('no name, or a folder that can\'t be read: nothing happens', dropVulkanOverCuda(d, '').length === 0 && dropVulkanOverCuda(path.join(tmp, 'none'), 'cuda').length === 0);
check('the name list matches only our files', VULKAN_OWN_FILES.test('ggml-vulkan.dll') && VULKAN_OWN_FILES.test('LAMPLIGHT-VULKAN.JSON') && !VULKAN_OWN_FILES.test('ggml-vulkan-shaders.dll') && !VULKAN_OWN_FILES.test('vulkan-1.dll'));

// the install step and the build use them
const engines = read(path.join(app, 'src', 'engines.js'));
const overlay = engines.slice(engines.indexOf('async function installOverlay'), engines.indexOf('export const VULKAN_OWN_FILES'));
check('the overlay install drops them over CUDA', /dropVulkanOverCuda\(over, base\.asset\.name\)/.test(overlay));
const llama = read(path.join(app, 'src', 'llamacpp.js'));
check('the engine start reads the file beside the engine', /vk = vulkanFeatures\(path\.dirname\(exe\)\), vc = vulkanCaps\(files, vk\)/.test(llama) && /q3CardOk\(files, process\.platform, vk\)/.test(llama) && /tiers = [^\n]*vc\.lse/.test(llama) && /q2 = [^\n]*vc\.q2/.test(llama) && /sink = [^\n]*vc\.lse/.test(llama));
const wf = read(path.join(app, '..', '.github', 'workflows', 'brain-engine.yml'));
check('the build packs our Vulkan part and the file, on Windows and Linux', /ggml-vulkan\/ggml-vulkan\.dll/.test(wf) && /vulkan\/libggml-vulkan\.so/.test(wf) && (wf.match(/lamplight-vulkan\.json/g) || []).length >= 2);
check('the patch is there', fs.existsSync(path.join(app, 'engine', 'patches', '0135-vulkan-lamplight.patch')));

// Help, glossary, FAQ
const faq = HELP.find((h) => h.id === 'faq-vulkan-features')?.html || '';
const gloss = HELP.find((h) => h.id === 'glossary')?.html || '';
check('the FAQ says what moved, what can\'t, where it works, and is honest', /3-bit and 2-bit/.test(faq) && /MTP replay/.test(faq) && /no Vulkan version/.test(faq) && /Windows and Linux/.test(faq) && /Android app/.test(faq) && /unproven in our lab/.test(faq));
check('the glossary has Vulkan, and the 3-bit FAQ no longer says Vulkan can\'t', /<dt>Vulkan<\/dt>/.test(gloss) && !/a card that uses Vulkan, the card can't read it/.test(HELP.find((h) => h.id === 'faq-mem-3bit')?.html || ''));

fs.rmSync(tmp, { recursive: true, force: true });
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

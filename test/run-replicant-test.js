// 1.5.89: Bob calls the computer he runs on his replicant matrix, with a muted spec line beside its name.
import fs from 'node:fs';
import { cpuName, specLine, shownRamGB } from '../src/platform.js';
import { HELP } from '../public/help-content.js';
let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { if (ok) { pass++; console.log('PASS', name); } else { fail++; console.log('FAIL', name, extra); } };
const read = (f) => fs.readFileSync(new URL('../' + f, import.meta.url), 'utf8');

check('processor names are short', cpuName('AMD Ryzen 7 9800X3D 8-Core Processor') === 'Ryzen 7 9800X3D' && cpuName('AMD Ryzen Z1 Extreme w/ Radeon 780M Graphics') === 'Ryzen Z1 Extreme' && cpuName('Apple M3') === 'Apple M3');
check('spec line with a card', specLine({ cpu: 'Ryzen 7 9800X3D', gpu: { name: 'NVIDIA GeForce RTX 5070 Ti', vramGB: 16 }, ramGB: 32 }) === 'Ryzen 7 9800X3D · RTX 5070 Ti 16 GB · 32 GB RAM');
check('spec line on built-in graphics', specLine({ cpu: 'Ryzen Z1 Extreme', gpu: { name: 'AMD Radeon', integrated: true, vramGB: 16 }, ramGB: 32 }) === 'Ryzen Z1 Extreme · built-in graphics · 32 GB RAM');
check('spec line on a Mac', specLine({ cpu: 'Apple M3', gpu: { name: 'Apple M3 (shared memory)', unified: true, vramGB: 11 }, ramGB: 16 }) === 'Apple M3 · 16 GB memory');
check('spec line before anything is read', specLine({}) === 'specs not read yet');
check('the hardware answer carries the spec line, with RAM as sold', /spec: specLine\(\{ cpu, gpu, ramGB: shownRamGB\(os\.totalmem\(\)\) \|\| ramGB \}\)/.test(read('src/models.js')));
// 1.5.91 (PC live test): Windows pads the processor name with spaces, and reports 31.1 GB for 32 GB installed.
check('a padded Windows processor name still comes out short', cpuName('AMD Ryzen 7 9800X3D 8-Core Processor           ') === 'Ryzen 7 9800X3D');
check('RAM shows the size installed (31.1 GB reported reads 32 GB)', shownRamGB(31.12 * 1024 ** 3) === 32 && shownRamGB(15.6 * 1024 ** 3) === 16 && shownRamGB(7.7 * 1024 ** 3) === 8 && shownRamGB(0) === null);

const cellar = read('public/cellar.js');
check('Settings panel has the same name on every platform, with the spec line beside it', /'💻 This replicant matrix and updates'/.test(cellar) && !/This Mac and updates/.test(cellar) && /const pcSum = `<span class="pc-ver">Bob \$\{esc\(settings\.version\?\.label[^\n]*\$\{esc\(hw\?\.spec/.test(cellar));
check('Welcome says the name once, with the spec line', /I call this computer my replicant matrix\. You'll see that name around the app\./.test(cellar));
check('the setting is Let my other replicant matrices in', /<strong>Let my other replicant matrices in<\/strong>/.test(read('public/phone-access.js')) && !/Let my other devices in/.test(read('public/phone-access.js')));

const glossary = HELP.find((h) => h.id === 'glossary');
check('glossary has Replicant matrix, and still finds pc and computer', /<dt>Replicant matrix<\/dt>/.test(glossary.html) && /\bpc\b/.test(glossary.words) && /computer/.test(glossary.words));
const faq = HELP.find((h) => h.id === 'faq-replicant-matrix');
check('FAQ in Bob\'s voice', faq && faq.title === 'What\'s a replicant matrix?' && /\bI\b/.test(faq.html) && /pc computer laptop mac device machine/.test(faq.words));
check('every Help entry that names it still finds pc, computer, laptop and device', HELP.filter((h) => /replicant matri/.test(h.html)).every((h) => ['pc', 'computer', 'laptop', 'device'].every((w) => (h.words || '').split(/\s+/).includes(w))));
check('Help names the old setting once', (JSON.stringify(HELP).match(/was Let my phone in \/ Let my other devices in/g) || []).length === 1);
check('privacy lines say (your computer)', /leave your replicant matrix \(your computer\)/.test(JSON.stringify(HELP)));
check('PRIVACY.md keeps computer and adds the one line', /In the app, Bob calls your computer his replicant matrix\./.test(read('PRIVACY.md')));
check('Bob himself knows the name', /the computer you run on = your replicant matrix/.test(read('src/persona.js')));
check('the phone names itself this replicant matrix (this phone)', /This replicant matrix \(this phone\)/.test(read('android/app/src/main/assets/www/phone.js')) && /<dt>Replicant matrix<\/dt>/.test(read('android/app/src/main/assets/www/help.js')));
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

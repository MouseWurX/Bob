// 1.5.153 Cut recipes, the estimate table and the usage map (bob-design/blend-and-cut-recipes.md): sizes from the
// device, the estimate's numbers against the measured rentals, the cold / faint / only-for lists, the files in the
// format shared with Peek inside, a whole usage job with fake steps, a recipe built from the usage map and from the
// lessons, the routes (nothing starts from another device) and the page's and Help's words.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Lab, labRoute, planRecipe } from '../src/lab.js';
import { sizeFor, deviceBudget, deviceById, DEVICES, RECIPES, recipeById } from '../public/lab-recipes-list.js';
import { stepMinutes, hereEstimate, rentedEstimate, pastMinutes, lastRentedCost, estimateWords, RENTED_RATES } from '../src/lab-estimate.js';
import { usageLists, mergePeek, keepFromPeek, countShape, thingTexts, usageOptions, readPeek, peekFile, keepFileOf } from '../src/lab-usage.js';
import { applyRecipe, estimateFor } from '../src/lab-recipes.js';
import { HELP } from '../public/help-content.js';

let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra ? ' ' + extra : ''}`); };
const read = (p) => fs.readFileSync(new URL(`../${p}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bob-recipes-'));

// ---- sizes from the device ----
const qwen = { experts: 256, used: 8, sizeGB: 67, fullSize: true, fileType: 'BF16' };
const s16 = sizeFor(qwen, deviceBudget(deviceById('card16')));
check('a 16 GB card gets a Q4 cut that fits', s16.type === 'Q4_K_M' && s16.keep > 8 && s16.keep < 256 && s16.keep % 8 === 0 && s16.gb <= 14.5 && !s16.tooBig, JSON.stringify(s16));
const s24 = sizeFor(qwen, deviceBudget(deviceById('card24')));
check('a bigger card keeps more experts', s24.keep > s16.keep || s24.whole, JSON.stringify(s24));
const phone = sizeFor(qwen, deviceBudget(deviceById('phone8')), { tiny: true });
check('a phone with 8 GB gets Q3 (the Q4-or-better rule allows Q3 at 8 GB or less)', phone.type === 'Q3_K_M', JSON.stringify(phone));
check('a 16 GB card never gets Q3', sizeFor(qwen, deviceBudget(deviceById('card16')), { tiny: true }).type === 'Q4_K_M');
const tooBig = sizeFor({ ...qwen, sizeGB: 400 }, deviceBudget(deviceById('phone8')));
check('a brain too big even at the smallest cut says so', tooBig.tooBig && tooBig.keep === 8);
check('a brain that already fits needs no cut', sizeFor({ ...qwen, sizeGB: 20 }, deviceBudget(deviceById('card24'))).whole);
check('a brain without experts is never cut', sizeFor({ experts: 0, sizeGB: 8, fullSize: true }, deviceBudget(deviceById('card16'))).keep === 0);
check('this replicant matrix leaves room for the conversation', deviceBudget(deviceById('here'), 16).gb === 14.5 && deviceBudget(deviceById('here'), 8).q3 && !deviceBudget(deviceById('here'), 16).q3);
check('the device list names real devices, not brands', DEVICES.length >= 8 && DEVICES.every((d) => !/nvidia|geforce|rtx|samsung|lenovo|legion/i.test(d.label)));
check('seven goals, fold greyed until it is built, no ladder names', RECIPES.length === 7 && recipeById('fold').later && recipeById('fold').title === 'Fold instead of drop' && recipeById('measure').measureOnly && !/garfield|riker|bill|homer|milo|luke|calvin/i.test(JSON.stringify(RECIPES)));

// ---- the estimate ----
const rent = rentedEstimate({ lessons: 27000, experts: 208, files: ['Q4_K_M'] });
const healH = rent.parts.find((p) => /Teach it back/.test(p.what)).hours;
check('a full heal pass over Bob\'s lessons is about 16 hours at Riker\'s size (the measured rate)', healH > 15.5 && healH < 17, String(healH));
check('the rented column is a range, and Bob never suggests a cap (the $0 rule)', rent.hours[0] < rent.hours[1] && rent.dollars[0] < rent.dollars[1] && !('cap' in rent), JSON.stringify(rent));
check('the H200 list price is about $5 an hour', rent.perHour === 5 && /141 GB/.test(rent.card));
check('scores already on the drive skip the teacher pass', rentedEstimate({ lessons: 27000, scoresCached: true }).parts.length === rent.parts.length - 1);
check('a smaller cut heals faster', rentedEstimate({ experts: 96 }).hours[1] < rent.hours[1]);
check('a live price replaces the list price', rentedEstimate({}, { perHour: 3 }).perHour === 3);
check('the rates come from the journal\'s runs', RENTED_RATES.healHoursPer1000 === 0.6 && RENTED_RATES.scoreHoursPer27000 === 2.5);
const steps = [{ id: 'lessons', label: 'L' }, { id: 'count', label: 'C' }, { id: 'cut', label: 'X' }, { id: 'quantize', label: 'Q' }, { id: 'test', label: 'T' }];
const he = hereEstimate(steps, { sizeGB: 20, chunks: 200 });
check('the here column adds up every step, from the brain\'s size the first time', he.minutes[0] < he.minutes[1] && he.from === 'size' && he.steps.length === 5);
check('a bigger brain takes longer to count', stepMinutes({ id: 'count' }, { sizeGB: 60 }) > stepMinutes({ id: 'count' }, { sizeGB: 15 }));
const runs = [{ state: 'done', fromGB: 10, steps: [{ id: 'count', state: 'done', ms: 10 * 60000 }] }, { state: 'done', fromGB: 10, steps: [{ id: 'count', state: 'done', ms: 12 * 60000 }] }];
check('past Lab jobs teach the estimate, scaled to this brain', Math.abs(pastMinutes(runs, 'count', 20) - 24) < 0.01 && hereEstimate(steps, { sizeGB: 20, runs }).from === 'past');
check('the last rented run on record is found', lastRentedCost([{ brain: { name: 'Riker' }, where: { place: 'rented' }, when: '2026-11-07', cost: { dollars: 51.79, hours: 9.7 } }, { where: { place: 'home' }, cost: { dollars: 0 } }]).dollars === 51.79);
const words = estimateWords({ here: he, rented: rent, last: { dollars: 51.79 } });
check('the estimate says the bill is the real number and suggests no cap', words.some((w) => /bill is the real number/.test(w) && /\$51\.79/.test(w)) && !words.some((w) => /cap/.test(w)));

// ---- the usage lists ----
const E = 16;
const row = (f) => Array.from({ length: E }, (_, e) => f(e));
const coding = { name: 'Coding', source: 'imatrix', tokens: 100, counts: [row((e) => (e < 8 ? 100 : e === 8 ? 50 : e === 9 ? 1 : 0)), row((e) => (e < 10 ? 80 : 0))] };
const chat = { name: 'Chat', source: 'imatrix', tokens: 100, counts: [row((e) => (e < 8 ? 100 : e === 10 ? 40 : 0)), row((e) => (e < 10 ? 80 : 0))] };
const brainRec = { name: 'Test', sha256: 'abc', experts: E, expertUsed: 2, layers: 2 };
const peek = mergePeek(null, { brain: brainRec, things: [coding, chat], engine: 'llama.cpp', when: '2026-11-08' });
check('the tally sums every thing, layer by layer', peek.total[0][0] === 200 && peek.total[0][8] === 50 && peek.total[0][10] === 40 && peek.total[1][12] === 0);
const L = usageLists(peek, { sizes: [8, 12] });
check('cold experts: never used by anything tested', L.perLayer[0].cold.join() === '11,12,13,14,15' && L.perLayer[1].cold.length === 6 && L.cold === 11, JSON.stringify(L.perLayer[0]));
check('faint experts: the last 5% of the work', L.perLayer[0].faint.includes(9) && !L.perLayer[0].faint.includes(0));
check('only-for lists: expert 8 is coding\'s, expert 10 is chat\'s', L.onlyFor.find((o) => o.name === 'Coding').layers[0].experts.join() === '8' && L.onlyFor.find((o) => o.name === 'Chat').layers[0].experts.join() === '10');
check('the kept-share table covers each size asked for', L.kept.length === 2 && L.kept[0].things.length === 2 && L.kept[1].things[0].average >= L.kept[0].things[0].average);
check('shares of the brain are percentages', L.coldShare === Math.round((1000 * 11) / 32) / 10);
const keep = keepFromPeek(peek, 'Test');
check('the keep file is the Lab\'s shape plus the shared fields', keep.experts === 11 && keep.layers.every((l) => l.length === 11) && keep.source === 'imatrix' && keep.brain.sha256 === 'abc' && keep.things.join() === 'Coding,Chat' && keep.tokens === 200);
const peek2 = mergePeek({ ...peek, things: [...peek.things, { name: 'A question', source: 'peek', tokens: 5, counts: [row(() => 1), row(() => 1)] }] }, { brain: brainRec, things: [{ ...coding, tokens: 300 }], engine: 'llama.cpp', when: '2026-11-09' });
check('counting a thing again replaces it and keeps Peek inside\'s tally', peek2.things.length === 3 && peek2.things.find((t) => t.name === 'Coding').tokens === 300 && peek2.things.some((t) => t.source === 'peek') && /peek/.test(peek2.source));
check('another brain file starts a fresh tally', mergePeek(peek, { brain: { ...brainRec, sha256: 'other' }, things: [chat], engine: '', when: '' }).things.length === 1);
const short = countShape('hello there '.repeat(20));
check('a short text is read several times over with a small context', short.repeated && short.ctx === 512 && short.text.length / 4 >= 1024 && short.chunks >= 1);
check('a long text is read as it is', !countShape('x'.repeat(400000)).repeated && countShape('x'.repeat(400000)).ctx === 4096);

// ---- a made-up mixture-of-experts brain and a Lab ----
function kv(key, type, value) {
  const k = Buffer.from(key); const h = Buffer.alloc(12 + k.length); h.writeBigUInt64LE(BigInt(k.length)); k.copy(h, 8); h.writeUInt32LE(type, 8 + k.length);
  let v;
  if (type === 8) { const s = Buffer.from(value); v = Buffer.alloc(8 + s.length); v.writeBigUInt64LE(BigInt(s.length)); s.copy(v, 8); } else { v = Buffer.alloc(4); v.writeUInt32LE(value); }
  return Buffer.concat([h, v]);
}
function makeGguf(file, kvs, tensors) {
  const parts = [Buffer.alloc(24)]; parts[0].write('GGUF', 0, 'latin1'); parts[0].writeUInt32LE(3, 4); parts[0].writeBigUInt64LE(BigInt(tensors.length), 8); parts[0].writeBigUInt64LE(BigInt(kvs.length), 16);
  for (const [k, t, v] of kvs) parts.push(kv(k, t, v));
  let off = 0; const datas = [];
  for (const t of tensors) {
    const n = Buffer.from(t.name); const b = Buffer.alloc(8 + n.length + 4 + 8 * t.dims.length + 12);
    let o = 0; b.writeBigUInt64LE(BigInt(n.length), o); o += 8; n.copy(b, o); o += n.length; b.writeUInt32LE(t.dims.length, o); o += 4;
    for (const d of t.dims) { b.writeBigUInt64LE(BigInt(d), o); o += 8; } b.writeUInt32LE(0, o); o += 4; b.writeBigUInt64LE(BigInt(off), o);
    parts.push(b);
    const count = t.dims.reduce((a, x) => a * x, 1); const d = Buffer.alloc(count * 4);
    const pad = Math.ceil(d.length / 32) * 32 - d.length; datas.push(Buffer.concat([d, Buffer.alloc(pad)])); off += d.length + pad;
  }
  let head = Buffer.concat(parts); head = Buffer.concat([head, Buffer.alloc(Math.ceil(head.length / 32) * 32 - head.length)]);
  fs.writeFileSync(file, Buffer.concat([head, ...datas]));
}
const brainFile = path.join(tmp, 'moe.gguf');
makeGguf(brainFile, [['general.architecture', 8, 'testmoe'], ['general.name', 8, 'Test MoE'], ['testmoe.block_count', 4, 2], ['testmoe.expert_count', 4, E], ['testmoe.expert_used_count', 4, 2], ['general.file_type', 4, 1]], [
  { name: 'token_embd.weight', dims: [4, 5] },
  ...[0, 1].flatMap((li) => ['gate', 'up', 'down'].map((k) => ({ name: `blk.${li}.ffn_${k}_exps.weight`, dims: [4, 3, E] })))
]);
const dataDir = path.join(tmp, 'data'); fs.mkdirSync(path.join(dataDir, 'sessions'), { recursive: true });
fs.writeFileSync(path.join(dataDir, 'sessions', 'a.json'), JSON.stringify(Array.from({ length: 200 }, (_, i) => ({ role: i % 2 ? 'assistant' : 'user', content: `message ${i} `.repeat(10) }))));
const exe = (n) => (process.platform === 'win32' ? `${n}.exe` : n);
const cfg = { dataDir, agentDir: tmp, bobModelsDir: path.join(tmp, 'models', 'bob'), settingsFile: path.join(dataDir, 'settings.json'), computerLab: true, gpuVramGB: 16, llamacpp: { exe: path.join(tmp, 'eng', exe('llama-server')) } };
fs.mkdirSync(path.join(tmp, 'eng')); for (const n of ['llama-server', 'llama-imatrix', 'llama-quantize']) fs.writeFileSync(path.join(tmp, 'eng', exe(n)), '');
const catalog = { models: [{ id: 'test-moe', name: 'Test MoE', family: 'Test', category: 'chat', jobs: ['bob'], files: [] }] };
const shop = { cfg, catalog, locate: (e) => (e.id === 'test-moe' ? { gguf: brainFile } : {}) };
const big = () => ({ ok: true, why: '' });
const counted = [];
const fakeCounts = (name) => (name === 'Coding' ? coding.counts : chat.counts);
let tried = null;
const lab = new Lab(cfg, { shop, room: big, steps: {
  fingerprint: async () => 'feedface',
  usageCount: async (s) => { counted.push(s); check(`the counter gets a text file for ${s.thing}`, fs.existsSync(s.corpus) && s.ctx >= 512 && s.chunks >= 1); return fakeCounts(s.thing); },
  try: async (s, { keep }) => { tried = keep; return { full: { score: 80 }, masked: { score: 76 } }; }
} });
const opts = usageOptions(cfg);
check('the things to test on: the four quiz parts, chats and a file or folder', opts.filter((o) => o.id.startsWith('quiz:')).length === 4 && opts.some((o) => o.id === 'chats') && opts.find((o) => o.id === 'path').local);
check('a quiz part becomes text in the chat layout', /<\|im_start\|>user\nWrite a JavaScript function/.test(thingTexts(cfg, ['quiz:coding'])[0].text));
check('the tools part includes the tool list', /get_weather/.test(thingTexts(cfg, ['quiz:tools'])[0].text));
const proj = path.join(tmp, 'proj'); fs.mkdirSync(path.join(proj, 'Source'), { recursive: true }); fs.mkdirSync(path.join(proj, 'node_modules')); fs.writeFileSync(path.join(proj, 'Source', 'a.cpp'), 'int main() { return 0; }\n'.repeat(200)); fs.writeFileSync(path.join(proj, 'node_modules', 'x.js'), 'SKIPME'.repeat(1000)); fs.writeFileSync(path.join(proj, 'pic.png'), 'PNG');
const folder = thingTexts(cfg, ['path'], { file: proj })[0];
check('a folder of my own: code is read, node_modules and pictures are not', folder.name === 'proj' && /int main/.test(folder.text) && !/SKIPME/.test(folder.text) && !/PNG/.test(folder.text));
let threw = ''; try { thingTexts(cfg, ['path'], { file: path.join(tmp, 'nope') }); } catch (e) { threw = e.message; }
check('a missing folder gives a plain reason', /on this replicant matrix/.test(threw));

// The job: count two things (the quiz's coding part stands in for "Coding"), then try without the cold ones.
lab.stepFns.usageCount = async (s) => { counted.push(s); return fakeCounts(s.thing === 'Coding' ? 'Coding' : 'Chat'); };
const started = await (await import('../src/lab-usage.js')).startUsage(lab, { brain: 'test-moe', things: ['quiz:coding', 'chats'], tryWithout: true });
check('a usage job starts as a Lab job', started.started?.kind === 'usage' && lab.job);
let waited = 0; while (lab.job && waited++ < 200) await new Promise((r) => setTimeout(r, 10));
const run = lab.runs.at(-1);
check('the usage job finishes', run.state === 'done', run.error || '');
check('every step records how long it took', run.steps.every((s) => typeof s.ms === 'number') && run.fromGB >= 0);
const brainObj = lab.brains()[0];
const saved = readPeek(cfg, brainObj);
check('peek-counts.json has the shared shape', saved.brain.sha256 === 'feedface' && saved.brain.experts === E && saved.brain.expertUsed === 2 && saved.brain.layers === 2 && saved.things.length === 2 && saved.total.length === 2 && saved.things.every((t) => t.source === 'imatrix' && Number.isInteger(t.counts[0][0])) && saved.when);
const kf = JSON.parse(fs.readFileSync(keepFileOf(cfg, brainObj), 'utf8'));
check('the keep file sits beside it with the brain\'s fingerprint', kf.brain.sha256 === 'feedface' && kf.layers.length === 2 && kf.experts > 2);
check('trying without them switches off only cold and faint experts, and keeps enough', tried && tried.every((l) => l.length >= 2 && !l.includes(15)) && saved.tried?.masked === 76);
check('the short quiz part is noted as read several times over', (run.notes || []).some((n) => /several times over/.test(n)));
check('text files the counter read are not left behind', !fs.readdirSync(path.dirname(peekFile(cfg, brainObj))).some((f) => /^text-/.test(f)));
let busy = ''; lab.job = { run: {} }; try { await (await import('../src/lab-usage.js')).startUsage(lab, { brain: 'test-moe', things: ['chats'] }); } catch (e) { busy = e.message; } lab.job = null;
check('one Lab job at a time', /busy/.test(busy));

// ---- a recipe from the usage map, and from the lessons ----
const base = { template: '', name: '', from: 'test-moe', lessons: { kind: 'none', file: '', chunks: 200 }, smaller: { sight: false, hearing: false, cut: null, files: [], measure: false }, test: { compare: true } };
// The made-up brain is a few bytes, so the test gives a budget that only fits part of its experts.
const tight = { gb: 20 * 0.25 * (0.1 + 0.9 * 9 / 16), q3: true }; // room for 8 of the 16 experts from a 20 GB brain at Q3
const fromUsage = applyRecipe(lab, base, 'coding', 'phone8', { budget: tight, sizeGB: 20 });
check('with a usage map, the recipe cuts with a keep list built from it', fromUsage.source === 'usage' && fromUsage.recipe.smaller.cut.how === 'file' && fs.existsSync(fromUsage.recipe.smaller.cut.file) && /usage map/.test(fromUsage.notes.join(' ')));
const rk = JSON.parse(fs.readFileSync(fromUsage.recipe.smaller.cut.file, 'utf8'));
check('the coding recipe protects the Coding thing at 99%', rk.strong.includes('Coding') && !rk.strong.includes('Chat') && rk.layers.every((l) => l.length === rk.experts));
check('the recipe names the brain and asks for the measured running file', fromUsage.recipe.name === 'Test MoE Coding helper' && fromUsage.recipe.smaller.files.length === 1 && fromUsage.recipe.smaller.measure);
const p = lab.plan(fromUsage.recipe);
check('the filled recipe plans with no problems', !p.problems.length, p.problems.join(' | '));
check('the honest line is always there', fromUsage.notes.some((n) => /most experts work on every kind of job/.test(n)));
fs.rmSync(peekFile(cfg, brainObj));
const fromLessons = applyRecipe(lab, base, 'everything', 'phone8', { budget: tight, sizeGB: 20 });
check('without a usage map, the recipe counts the lessons skill by skill', fromLessons.source === 'lessons' && fromLessons.recipe.smaller.cut.how === 'cover' && fromLessons.recipe.lessons.kind === 'chats');
check('one skill of lessons says the recipe can\'t protect anything more', fromLessons.notes.some((n) => /one skill/.test(n)));
check('tiny takes out sight only if the brain has it', !applyRecipe(lab, base, 'tiny', 'phone8', { budget: tight, sizeGB: 20 }).recipe.smaller.sight);
check('a brain that already fits the device is not cut', applyRecipe(lab, base, 'chat', 'card24').recipe.smaller.cut === null);
let later = ''; try { applyRecipe(lab, base, 'fold', 'card16'); } catch (e) { later = e.message; }
check('folding is refused until it is built', /isn't built yet/.test(later));
const est = estimateFor(lab, fromLessons.recipe, { recipeId: 'everything' });
check('the estimate has both columns for a cut, and the words', est.here && est.rented && est.words.length >= 3 && /Forge plan/.test(est.words.join(' ')) && /starts at \$0/.test(est.words.join(' ')));
check('the printed Forge plan has its caps at 0', fromLessons.forge.hours_max === 0 && fromLessons.forge.dollars_max === 0);
check('the Forge plan is in the shape run.sh reads: strong plan-wide, a heal time above the estimate', Array.isArray(fromLessons.forge.strong) && fromLessons.forge.strong_cover === 0.99 && !('strong' in fromLessons.forge.rungs[0]) && fromLessons.forge.heal.hours >= 6, JSON.stringify(fromLessons.forge));
check('no estimate for the rented part when nothing is cut', !estimateFor(lab, { ...base, smaller: { ...base.smaller, files: ['Q4_K_M'] } }).rented);

// ---- the routes ----
const call = async (method, p2, b, isLocal = true) => { let out; await labRoute({ req: { method }, res: {}, p: p2, isLocal, lab, body: async () => b, send: (_, code, j) => { out = { code, j }; } }); return out; };
const list = await call('GET', '/api/lab/recipes');
check('the recipe list goes to the page without paths', list.code === 200 && list.j.recipes.length === 7 && !JSON.stringify(list.j).includes(tmp));
check('another device is not offered a file or folder', !(await call('GET', '/api/lab/recipes', {}, false)).j.options.some((o) => o.id === 'path'));
check('a usage job can\'t be started from another device', (await call('POST', '/api/lab/usage/start', { brain: 'test-moe', things: ['chats'] }, false)).code === 403);
const ap = await call('POST', '/api/lab/recipes/apply', { recipe: base, id: 'chat', device: 'card16' }, false);
check('a recipe applied from another device carries no file path', ap.code === 200 && !JSON.stringify(ap.j).includes(tmp));
check('the estimate route answers', (await call('POST', '/api/lab/estimate', { recipe: fromLessons.recipe })).j.here);
check('an unknown recipe gives a plain error', /no recipe/.test((await call('POST', '/api/lab/recipes/apply', { recipe: base, id: 'nope' })).j.error));

// ---- the page and Help ----
const page = read('public/lab-recipes.js'), labPage = read('public/lab.js');
check('the Lab page places the three blocks and hands over its events', /rc\.galleryHtml\(\)/.test(labPage) && /rc\.estimateHtml\(\)/.test(labPage) && /rc\.usageHtml\(\)/.test(labPage) && /await rc\.change\(el\)/.test(labPage) && /await rc\.click\(b\)/.test(labPage));
check('the tables have header cells for screen readers', (page.match(/scope="col"/g) || []).length >= 6 && (page.match(/scope="row"/g) || []).length >= 3);
check('the device select and the usage path are labelled', /<label for="lab-device">/.test(page) && /<label>File or folder <input id="lab-usage-path"/.test(page));
check('nothing starts from a goal: the owner presses Start', /nothing starts until you press Start/.test(page) && /Start from a goal/.test(page) && /Use this goal/.test(page));
check('the cap row keeps the $0 rule', /It starts at \$0, and nothing rents until you set one/.test(page));
check('Lab screens speak of Bob in the third person', /Bob fills in steps 2 to 5/.test(page) && !/my experts/.test(page));
check('the page says a cold expert is only cold for what was tested', /only cold for what you tested/.test(page));
check('every number is a rough guess', /Every number here is a rough guess/.test(page));
const help = HELP.find((h) => h.id === 'lab-recipes');
check('Help has a page for goals, the estimate and the usage map', help && /usage map/i.test(help.html) && /Start from a goal/.test(help.html) && /starts at \$0/.test(help.html) && !/garfield|riker/i.test(help.html + help.words));
check('Help says a goal-shaped brain is not much smaller', /won't be much smaller/.test(help.html));
check('the release note exists, with no ladder names', fs.existsSync(new URL('../docs/releases/v1.5.153.md', import.meta.url)) && !/garfield|riker/i.test(read('docs/releases/v1.5.153.md')));

console.log(`\n${pass} passed, ${fail} failed`);
fs.rmSync(tmp, { recursive: true, force: true });
process.exit(fail ? 1 : 0);

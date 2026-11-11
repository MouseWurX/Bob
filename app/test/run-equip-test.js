// 1.2.0 "Equip Bob": the paper-doll slots, one model in several slots, taking things off, and the starter sets.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { SLOTS, HELPERS, allSlots, entryOf, equipped, kitFor, equipHtml, packFor, slotValue, starterTicks, starterPlan, starterHtml } from '../public/equip.js';
import { cleanHousekeeping } from '../src/hk-settings.js';
import { ModelShop } from '../src/models.js';

let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra ? ' ' + extra : ''}`); };
const catalog = JSON.parse(fs.readFileSync(new URL('../catalog.json', import.meta.url), 'utf8'));
const models = catalog.models.map((m) => ({ ...m, status: { state: ['gemma4-e4b', 'z-image-turbo', 'z-image-turbo-q4'].includes(m.id) ? 'installed' : 'missing' } }));
const roles = {
  current: { bob: 'gemma4:e4b', tinker: '', reviewer: 'gemma4:e4b', eyes: '', image: 'z-image-turbo', speech: 'windows', voice: '' },
  options: { llm: [{ value: 'gemma4:e4b', label: 'Gemma 4 E4B (gemma4:e4b)' }, { value: 'qwen3-coder:30b', label: 'Qwen3 Coder' }], images: [{ value: 'z-image-turbo', label: 'Z-Image Turbo' }], edit: [], video: [], voice: [{ value: 'ollama:gemma4:e4b', label: 'Gemma 4 E4B through Ollama' }], speech: [{ value: 'windows', label: 'Windows voices' }], embed: [{ value: 'nomic-embed-text:latest', label: 'nomic-embed-text:latest' }] }
};
const ctx = { roles, models, brains: { small: 'gemma4:e4b' }, embed: '', selected: 'bob', vramGB: 8 };

// ---- slots ----
{
  const ids = allSlots().map((s) => s.id);
  check('every slot has its own id', new Set(ids).size === ids.length);
  check('one slot for every job Bob has', ModelShop.JOBS.every((j) => ids.includes(j.id)), ModelShop.JOBS.filter((j) => !ids.includes(j.id)).map((j) => j.id).join(','));
  check('the session brains and memory have slots too', ['small', 'deep', 'embed'].every((id) => ids.includes(id)));
  check('every slot says what it does and what happens when empty', allSlots().every((s) => s.does && s.empty));
  check('the main brain can\'t be taken off', !SLOTS[0].off && SLOTS[0].id === 'bob');
  check('what is equipped comes from roles, session brains and memory', equipped(SLOTS[0], ctx) === 'gemma4:e4b' && equipped(SLOTS.find((s) => s.id === 'small'), ctx) === 'gemma4:e4b' && equipped(SLOTS.find((s) => s.id === 'embed'), { ...ctx, embed: 'x' }) === 'x');
  check('entryOf finds by id or Ollama name', entryOf(models, 'gemma4:e4b')?.id === 'gemma4-e4b' && entryOf(models, 'z-image-turbo')?.id === 'z-image-turbo' && entryOf(models, 'nope') === null);
}

// ---- kit ----
{
  const brainKit = kitFor(SLOTS[0], ctx);
  check('the kit for a brain lists what is on this replicant matrix', brainKit.filter((k) => k.installed).map((k) => k.value).join() === 'gemma4:e4b,qwen3-coder:30b');
  check('and catalog brains not downloaded yet, as Get', brainKit.some((k) => !k.installed && k.value === 'gemma4-26b'));
  check('a downloaded brain isn\'t offered again as Get', !brainKit.some((k) => !k.installed && k.value === 'gemma4-e4b'));
  const editKit = kitFor(SLOTS.find((s) => s.id === 'edit'), ctx);
  const paintKit = kitFor(SLOTS.find((s) => s.id === 'image'), ctx);
  check('the picture editor only gets edit models, the painter none', editKit.every((k) => k.entry?.use?.painter?.sdcpp?.edit) && editKit.length > 0 && !paintKit.some((k) => k.entry?.use?.painter?.sdcpp?.edit));
  check('the memory slot offers the embedding model', kitFor(SLOTS.find((s) => s.id === 'embed'), ctx).some((k) => k.value === 'nomic-embed-text:latest'));
}

// ---- the doll ----
{
  const html = equipHtml(ctx);
  check('a slot for each job, plus helpers', (html.match(/data-slotpick=/g) || []).length === allSlots().length);
  check('kit can be dragged, and only onto slots of its kind', /draggable="true" data-equip="gemma4:e4b" data-kind="llm"/.test(html) && /data-slot="bob" data-kind="llm"/.test(html) && /data-slot="image" data-kind="images"/.test(html));
  check('one model in three slots says so', /covers 3 slots/.test(html));
  check('helper brains can be taken off; the main brain can\'t', /data-unequip="reviewer"/.test(html) && !/data-unequip="bob"/.test(html));
  check('the Windows voice is not something to take off', !/data-unequip="speech"/.test(html));
  check('a plain list is one click away', /data-eqview="list"/.test(html));
  check('the weight bar says when not everything fits at once', /alone needs more than your 4\.0 GB card/.test(equipHtml({ ...ctx, vramGB: 4 })) && /class="meter over"/.test(equipHtml({ ...ctx, vramGB: 4 })));
  check('over the card in total is normal: neutral bar, plain words', /so Bob loads what each job needs/.test(equipHtml({ ...ctx, vramGB: 7, models: ctx.models.map((m) => (m.id === 'z-image-turbo' ? { ...m, vramGB: 5 } : m)) })) && !/class="meter over"/.test(equipHtml({ ...ctx, vramGB: 7, models: ctx.models.map((m) => (m.id === 'z-image-turbo' ? { ...m, vramGB: 5 } : m)) })));
  check('nothing nasty gets through a model name', !/<script/.test(equipHtml({ ...ctx, roles: { ...roles, current: { ...roles.current, bob: '<script>x</script>' } } })));
}

// ---- starter sets ----
{
  const allPacks = catalog.packs;
  const packs = allPacks.filter((p) => !p.arm); // a PC's or a Mac's sets; the ARM board sets are checked below
  const base = ['gemma4-e4b', 'kokoro-v1', 'nomic-embed-text'];
  check('five starter sets: 16, 8, 6 GB, built-in graphics and processor only', packs.map((p) => p.id).join() === 'big,mid,small,shared,cpu');
  check('two ARM board sets after them: 8 GB, then 4 GB', allPacks.filter((p) => p.arm).map((p) => p.id).join() === 'pi8,pi4');
  check('every set includes the processor base (brain, voice, memory)', packs.every((p) => base.every((id) => p.models.includes(id))));
  check('every model in a set is in the catalog', packs.every((p) => p.models.every((id) => catalog.models.some((m) => m.id === id))));
  check('every set model is free for commercial use', packs.every((p) => p.models.every((id) => catalog.models.find((m) => m.id === id).commercial === true)));
  const banned = /flux.*(dev|kontext)|klein.?9|ltx|audioldm|f5|xtts/i;
  check('no non-commercial or revenue-limited models in the sets', packs.every((p) => p.models.every((id) => !banned.test(id))));
  check('every set slot is a real slot', packs.every((p) => Object.values(p.slots).flat().every((s) => allSlots().some((x) => x.id === s))));
  check('every set model has a slot', packs.every((p) => p.models.every((id) => (p.slots[id] || []).length)));
  check('8 GB and processor-only sets put one model in chat, quick brain, eyes and ears', ['mid', 'cpu'].every((id) => packs.find((p) => p.id === id).slots['gemma4-e4b'].join() === 'bob,small,eyes,voice'));
  check('the 6 GB set: light Qwen3 4B for chat and quick brain, Gemma 4 E4B for eyes and ears', packs.find((p) => p.id === 'small').slots['qwen3-4b'].join() === 'bob,small' && packs.find((p) => p.id === 'small').slots['gemma4-e4b'].join() === 'eyes,voice');
  check('picked by card size', packFor(packs, 16).id === 'big' && packFor(packs, 8).id === 'mid' && packFor(packs, 6).id === 'small' && packFor(packs, 4).id === 'cpu' && packFor(packs, null).id === 'cpu');
  check('small cards are told how long pictures take', ['mid', 'small'].every((id) => /minute/.test(packs.find((p) => p.id === id).times)));
  const mid = packs.find((p) => p.id === 'mid'), small = packs.find((p) => p.id === 'small');
  const ticks = starterTicks(mid, models, 8);
  check('what fits is ticked, and the coder the set recommends', ticks.has('gemma4-e4b') && ticks.has(mid.tick[0]) && (mid.tick[0] === 'qwen3-coder-30b' || mid.tick[0] === 'bobert-35b-q3') && /* 1.5.169: Bobert's Q3 is the 8 GB coder */ ticks.has('kokoro-v1') && ticks.has('z-image-turbo-q5') && ticks.has('flux2-klein-4b'));
  const smallTicks = starterTicks(small, models, 6);
  check('too big and not recommended: left unticked', !smallTicks.has('wan2.2-ti2v-5b-q4') && smallTicks.has('z-image-turbo-q4'));
  check('no card detected: judged by the card the set is for', !starterTicks(small, models, null).has('wan2.2-ti2v-5b-q4') && starterTicks(mid, models, null).has('wan2.2-ti2v-5b-q4') && starterTicks(packs.find((p) => p.id === 'big'), models, null).has('wan2.2-ti2v-5b'));
  const engines = [{ id: 'kokoro', name: 'Kokoro voices', installed: false }, { id: 'sdcpp', name: 'stable-diffusion.cpp', installed: true }];
  const { ids, plan } = starterPlan(small, models, engines, smallTicks);
  check('already here: equipped, not downloaded again', !ids.includes('gemma4-e4b') && plan['gemma4-e4b'] && !ids.includes('z-image-turbo-q4') && plan['z-image-turbo-q4']);
  check('the engine a model needs is downloaded with it', ids.includes('kokoro-v1') && ids.includes('engine:kokoro') && !ids.includes('engine:sdcpp'));
  check('unticked models are left out entirely', !ids.includes('wan2.2-ti2v-5b-q4') && !plan['wan2.2-ti2v-5b-q4']);
  const html = starterHtml({ ...ctx, packs, engines });
  check('the starter box shows the sets with yours marked, and one button', /8 GB card \(this replicant matrix\)/.test(html) && /data-starter="mid"/.test(html) && /to download\)/.test(html));
  check('it opens by itself only when Bob has no brain', !/<details class="starter" open/.test(html) && /<details class="starter" open/.test(starterHtml({ ...ctx, packs, roles: { ...roles, current: { ...roles.current, bob: '' } } })));
  const e4b = models.find((m) => m.id === 'gemma4-e4b'), nomic = models.find((m) => m.id === 'nomic-embed-text');
  check('slot values: Ollama name for brains, ollama: for ears, :latest tags match', slotValue(SLOTS[0], e4b, roles) === 'gemma4:e4b' && slotValue(SLOTS.find((s) => s.id === 'voice'), e4b, roles) === 'ollama:gemma4:e4b' && slotValue(SLOTS.find((s) => s.id === 'embed'), nomic, roles) === 'nomic-embed-text:latest');
  check('nothing to put in a slot until it\'s on this replicant matrix', slotValue(SLOTS.find((s) => s.id === 'video'), models.find((m) => m.id === 'wan2.2-ti2v-5b'), roles) === '');
}

// ---- small-card versions (8 GB and 6 GB) ----
{
  const byId = (id) => catalog.models.find((m) => m.id === id);
  const packs = catalog.packs;
  for (const id of ['mid', 'small']) {
    const p = packs.find((x) => x.id === id);
    const job = (slot) => Object.keys(p.slots).find((m) => p.slots[m].includes(slot));
    check(`the ${p.cardGB} GB set can paint, edit and film`, ['image', 'edit', 'video'].every((slot) => job(slot)));
    check(`the ${p.cardGB} GB set uses the squeezed (GGUF) versions for pictures, edits and clips`, ['image', 'edit', 'video'].every((slot) => /\.gguf$/.test(byId(job(slot)).files.find((f) => f.role === 'diffusionModel').url)));
    check(`the ${p.cardGB} GB painter and editor fit the card`, ['image', 'edit'].every((slot) => byId(job(slot)).vramGB <= p.cardGB));
    check(`the ${p.cardGB} GB editor is a real edit model`, Boolean(byId(job('edit')).use?.painter?.sdcpp?.edit));
  }
  const small = ['z-image-turbo-q5', 'z-image-turbo-q4', 'flux2-klein-4b', 'flux2-klein-4b-q4', 'wan2.2-ti2v-5b-q4'].map(byId);
  check('the small-card versions are in the catalog', small.every(Boolean));
  check('their links are checked: every file comes from Hugging Face and the big ones carry a checksum', small.every((m) => m.files.every((f) => /^https:\/\/huggingface\.co\/[\w.-]+\/[\w.-]+\/resolve\/[0-9a-f]{40}\//.test(f.url) && !f.verify)) && small.every((m) => /^[0-9a-f]{64}$/.test(m.files.find((f) => f.role === 'diffusionModel').sha256)));
  check('the small painters and editors share helper files, so they download once', byId('z-image-turbo-q5').files.slice(1).map((f) => f.url).join() === byId('z-image-turbo-q4').files.slice(1).map((f) => f.url).join() && byId('flux2-klein-4b').files.slice(1).map((f) => f.url).join() === byId('flux2-klein-4b-q4').files.slice(1).map((f) => f.url).join());
  check('FLUX.2 klein in the sets is the Apache 4B, not the non-commercial 9B or dev', small.filter((m) => /klein/.test(m.id)).every((m) => m.license === 'Apache 2.0' && m.files.every((f) => !/9b|flux2-dev|FLUX\.2-dev/i.test(f.url))));
}

// ---- server side ----
{
  check('the memory model is kept when it looks like a model name', cleanHousekeeping({ embedModel: 'nomic-embed-text:latest' }).embedModel === 'nomic-embed-text:latest');
  check('and dropped when it doesn\'t', cleanHousekeeping({ embedModel: 'x; rm -rf /' }).embedModel === undefined && cleanHousekeeping({ embedModel: 'a'.repeat(200) }).embedModel === undefined);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bob-equip-'));
  const dataDir = path.join(dir, 'inn', 'bob');
  fs.mkdirSync(dataDir, { recursive: true });
  const cfg = { agentDir: dir, dataDir, bobModelsDir: path.join(dir, 'models', 'bob'), settingsFile: path.join(dataDir, 'settings.json'), modelSearchRoots: [], ollamaUrl: 'http://127.0.0.1:1', engine: 'ollama', models: { bob: 'gemma4:e4b', reviewer: 'gemma4:e4b' } };
  const shop = new ModelShop(cfg, () => {});
  await shop.setRole('reviewer', '');
  const saved = JSON.parse(fs.readFileSync(cfg.settingsFile, 'utf8'));
  check('taking a helper brain off saves it empty', saved.models?.reviewer === '');
  let threw = '';
  try { await shop.setRole('bob', ''); } catch (e) { threw = e.message; }
  check('the main brain can\'t be emptied', Boolean(threw));
  const r = await shop.roles();
  check('roles list embedding models separately from brains', Array.isArray(r.options.embed) && !r.options.llm.some((o) => /embed/.test(o.value)));
  fs.rmSync(dir, { recursive: true, force: true });
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

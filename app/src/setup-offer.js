// 1.5.91 "Set it up for you": when a job needs something this replicant matrix doesn't have yet (a video maker, a
// painter, a voice...), Bob never answers with an error. He says what's missing and offers one card: what he'd get,
// the size, free disk, and Set it up / Not now. Set it up downloads it, puts it in its slot and carries on with the job.
// When the job is blocked by a setting (Web search off, a Hand off), the card offers to switch that one setting on.
// Nothing downloads and no setting changes until the button is pressed (the opt-in rule).
import crypto from 'node:crypto';
import { packFor } from '../public/fit.js';
import { enginesFor } from '../public/equip.js';
import { capabilities } from './capabilities.js';
import { HANDS, handsSettings, handHere, cleanHands } from './hands-settings.js';
import { saveSettings } from './config.js';

// Each capability: which slot it fills, which catalog models can do it, and an engine it always needs.
// say = Bob's words for it ("I can't ___ yet"). The job names match Equip Bob's slots.
export const NEEDS = {
  pictures: { slot: 'image', cats: ['images'], edit: false, say: 'make pictures', what: 'a picture maker' },
  edits: { slot: 'edit', cats: ['images'], edit: true, say: 'change a picture and keep its look', what: 'a picture editor' },
  video: { slot: 'video', cats: ['video'], say: 'make video clips', what: 'a video maker' },
  music: { slot: 'music', model: 'ace-step-music', engine: 'audio', say: 'make music', what: 'the music maker' },
  sfx: { slot: 'sfx', engine: 'audio', say: 'make sound effects', what: 'the sound effects maker' },
  voice: { slot: 'speech', cats: ['speech'], say: 'read replies aloud', what: 'a voice' },
  hearing: { slot: 'voice', cats: ['voice'], say: 'hear you talk', what: 'ears (speech to text)' },
  ffmpeg: { engine: 'ffmpeg', say: 'save things in other file types (MP3, JPG, WebM...)', what: 'FFmpeg, the converter' } // 1.5.95 Save as
};
// The tool that does each job, so a call to it can be turned into an offer.
export const TOOL_NEED = { make_image: 'pictures', make_video: 'video', make_music: 'music', make_sound: 'sfx' };

// Settings Bob may offer to switch on from chat, with the words on the Settings page (help text uses them word for word).
// Hands: "Let Bob use Hands" plus that Hand. The ✋ Hands switch on the chat page is only ever a stop button, so
// a stopped Hand is never switched back on from here: Bob says to press it instead.
// What each Hand lets Bob do, for the switch card ("It lets me ..."). Settings review wording (2026-11-04).
export const HAND_CAN = {
  files: 'move, copy, rename, zip and tidy files, only in the folders you tick',
  run: 'run a command, script or program you approve',
  schedules: 'do a job by myself at set times while I\'m open',
  apps: 'open apps and click or type in them, one approved step at a time',
  office: 'convert files and make or change documents, spreadsheets and slides',
  security: 'check this replicant matrix\'s protection, run scans and look at suspicious files without opening them',
  maker: 'write a small new tool when none of mine fits, after you OK it on a card',
  mcp: 'work inside apps like Unreal Engine or Blender through their MCP add-on'
};
export function switchFor(cfg, key) {
  if (key === 'web') return cfg.webSearch === true ? null : { key, name: 'Let Bob search the web', where: 'Settings, How Bob works', what: 'look things up on the internet', privacy: 'Only the search words and page addresses leave your replicant matrix (your computer).', patch: { webSearch: true } };
  if (key === 'workshop') return cfg.workshop?.enabled === true ? null : { key, name: 'Advanced workshop (ComfyUI)', where: 'Settings, Other apps', what: 'run your ComfyUI workflows', patch: { workshop: { ...(cfg.workshop || {}), enabled: true } } };
  const m = /^hand:(\w+)$/.exec(key || '');
  if (m && HANDS[m[1]]) {
    const id = m[1], h = handsSettings(cfg), hand = HANDS[id];
    if (!handHere(id)) return null;
    if (h.held) return { key, name: hand.label, held: true, where: 'the ✋ Hands switch on the chat page', what: HAND_CAN[id] || hand.label };
    if (h.enabled && h[id]?.on === true) return null;
    return { key, name: `Let Bob use Hands, ${hand.label}`, where: 'Settings, Hands', what: HAND_CAN[id] || hand.label, hands: cleanHands({ ...h, enabled: true, [id]: { on: true } }), free: h.free === true, folders: id === 'files' && !(h.folders || []).length };
  }
  return null;
}
export const SWITCH_KEYS = ['web', 'workshop', ...Object.keys(HANDS).map((h) => 'hand:' + h)];

const gb = (n) => (n >= 1 ? `${(+n).toFixed(n >= 10 ? 0 : 1)} GB` : `${Math.max(1, Math.round(n * 1000))} MB`);
const RANK = { best: 0, small: 1, tiny: 2, optional: 3 };

// What to get for one capability on this replicant matrix: { need, kind: 'download' | 'equip' | 'none', ... }.
// list = shop.list() (models with status, packs, engines), hw = shop.hardware().
export function planFor(need, { list, hw = {} }) {
  const n = NEEDS[need];
  if (!n) return { need, kind: 'none', why: 'I don\'t know that job.' };
  const models = list.models || [], engines = list.engines || [];
  const vram = hw.gpu?.integrated ? 0 : (hw.vramGB || hw.gpu?.vramGB || 0);
  const able = (m) => (n.model ? m.id === n.model : (n.cats || []).includes(m.category) && (n.cats[0] !== 'images' || Boolean(m.use?.painter?.sdcpp?.edit) === n.edit)) && !m.gated;
  const runs = (m) => !m.needs || engines.find((e) => e.name === m.needs)?.available !== false;
  // Already here but not in its slot: one click, no download.
  const here = models.filter((m) => able(m) && m.status?.state === 'installed');
  const eng = n.engine && engines.find((e) => e.id === n.engine);
  if (here.length && (!eng || eng.installed)) return { need, kind: 'equip', say: n.say, what: n.what, slot: n.slot, model: { id: here[0].id, name: here[0].name }, ids: [], sizeGB: 0, equip: { [here[0].id]: [n.slot] } };
  let pick = null;
  if (n.cats) {
    const pack = packFor(list.packs || [], vram, Boolean(hw.gpu?.integrated));
    const fromPack = (pack?.models || []).map((id) => models.find((m) => m.id === id)).find((m) => m && able(m) && runs(m) && (pack.slots?.[m.id] || [n.slot]).includes(n.slot));
    const fits = (m) => !vram || !m.vramGB || m.vramGB <= vram;
    pick = fromPack || models.filter((m) => able(m) && runs(m)).sort((a, b) => (fits(b) - fits(a)) || ((RANK[a.pick] ?? 3) - (RANK[b.pick] ?? 3)) || (a.sizeGB - b.sizeGB))[0] || null;
    if (pick && !fits(pick)) pick = models.filter((m) => able(m) && runs(m)).sort((a, b) => a.sizeGB - b.sizeGB)[0];
    if (!pick) {
      const blocked = models.find((m) => able(m) && !runs(m));
      const why = blocked ? engines.find((e) => e.name === blocked.needs)?.note : '';
      return { need, kind: 'none', say: n.say, what: n.what, why: why || `There's no ${n.what} in my catalogue for this replicant matrix yet.` };
    }
  } else if (n.model) pick = models.find((m) => m.id === n.model) || null;
  if (eng && eng.available === false) return { need, kind: 'none', say: n.say, what: n.what, why: eng.note || `${eng.name} doesn't run on this replicant matrix yet.` };
  const ids = [];
  const items = [];
  if (pick && pick.status?.state !== 'installed') { ids.push(pick.id); items.push({ id: pick.id, name: pick.name, sizeGB: pick.sizeGB || 0, license: pick.license || '' }); }
  const engIds = enginesFor(pick ? [pick] : [], engines);
  if (eng && !eng.installed && !engIds.includes('engine:' + eng.id)) engIds.unshift('engine:' + eng.id);
  for (const id of engIds) {
    const e = engines.find((x) => 'engine:' + x.id === id);
    if (!e) continue;
    ids.unshift(id); // the program first, then what runs on it
    items.unshift({ id, name: e.name, sizeGB: e.sizeGB || 0, engine: true });
  }
  if (!ids.length && pick) return { need, kind: 'equip', say: n.say, what: n.what, slot: n.slot, model: { id: pick.id, name: pick.name }, ids: [], sizeGB: 0, equip: { [pick.id]: [n.slot] } };
  const sizeGB = Math.round(items.reduce((t, i) => t + i.sizeGB, 0) * 10) / 10;
  const slow = pick?.vramGB && vram && pick.vramGB > vram;
  return { need, kind: 'download', say: n.say, what: n.what, slot: n.slot, items, ids, sizeGB, size: gb(sizeGB), freeGB: hw.freeGB ?? null,
    short: hw.freeGB != null && hw.freeGB < sizeGB + 2 ? Math.ceil(sizeGB + 2 - hw.freeGB) : 0,
    note: slow ? 'It\'s bigger than your graphics card, so it will be slow.' : !vram && pick?.vramGB ? 'There\'s no graphics card here, so it will be slow.' : '',
    equip: pick ? { [pick.id]: [n.slot] } : {} };
}

// The card offers, kept until answered (or for a day). id -> { plan | sw, jobId, at }
export class SetupOffers {
  constructor() { this.map = new Map(); }
  add(o) {
    const id = crypto.randomBytes(6).toString('hex');
    const now = Date.now();
    for (const [k, v] of this.map) if (now - v.at > 864e5) this.map.delete(k);
    this.map.set(id, { ...o, at: now });
    return id;
  }
  take(id) { const o = this.map.get(String(id)); this.map.delete(String(id)); return o || null; }
}

// What a capability is missing right now, ready for Bob's words and the card. null when it isn't missing.
export function missingNow(cfg, need) {
  const can = capabilities(cfg);
  const key = { pictures: 'pictures', edits: 'edits', video: 'video', music: 'music', sfx: 'sfx', voice: 'voice', hearing: 'hearing' }[need];
  return key && !can[key] ? need : null;
}

// Switch a setting on (the user pressed the card's button). Returns the patch saved.
// saveHands = brain.saveHands (Hands are saved and logged through the brain, like the Settings page does).
export function applySwitch(cfg, key, { saveHands } = {}) {
  const sw = switchFor(cfg, key);
  if (!sw || sw.held) return null;
  if (sw.hands) { if (!saveHands) return null; saveHands(sw.hands); return { hands: true }; }
  if (!sw.patch) return null;
  saveSettings(cfg, sw.patch);
  return sw.patch;
}

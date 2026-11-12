// 1.5.34 House style: defaults for what small brains kept asking about instead of doing (tool check, 2026-11-02).
// The owner's idea: set them once in Settings, House style, and Bob uses them when a
// request doesn't say. Every box starts empty; empty means Bob picks something sensible and says what he picked.
// Shared by the page (boxes), the server (cleaning what's saved) and the brain (prompt line, tool defaults).
import { esc } from './util.js';


// slot: the job (Brains page) the group belongs to; its kit links to the boxes. Each field: label, kind (text | seconds | choice), limits.
export const HOUSE = {
  music: { slot: 'music', title: 'House style for music', fields: {
    style: { label: 'Genre and mood', kind: 'text', hint: 'like "chiptune, upbeat"' },
    seconds: { label: 'Length (seconds)', kind: 'seconds', min: 10, max: 240 },
    vocals: { label: 'Vocals', kind: 'choice', options: [['', 'Bob picks'], ['instrumental', 'Instrumental'], ['lyrics', 'With lyrics']] }
  } },
  pictures: { slot: 'image', title: 'House style for pictures', fields: {
    style: { label: 'Style', kind: 'text', hint: 'like "clean digital art, soft light"' },
    shape: { label: 'Shape', kind: 'choice', options: [['', 'Bob picks'], ['square', 'Square'], ['wide', 'Wide'], ['tall', 'Tall']] }
  } },
  video: { slot: 'video', title: 'House style for clips', fields: {
    style: { label: 'Style', kind: 'text', hint: 'like "cinematic, slow camera"' },
    seconds: { label: 'Length (seconds)', kind: 'seconds', min: 1, max: 5 }
  } },
  sfx: { slot: 'sfx', title: 'House style for sound effects', fields: {
    seconds: { label: 'Length (seconds)', kind: 'seconds', min: 1, max: 20 }
  } },
  times: { slot: null, title: 'What times of day mean', fields: {
    morning: { label: 'Morning', kind: 'time' },
    afternoon: { label: 'Afternoon', kind: 'time' },
    evening: { label: 'Evening', kind: 'time' },
    night: { label: 'Night', kind: 'time' }
  } }
};

// Only known fields, with sane values. Anything else is dropped; empty means "Bob picks".
export function cleanHouseStyle(x) {
  const out = {};
  for (const [group, g] of Object.entries(HOUSE)) {
    const src = (x && typeof x === 'object' && x[group]) || {};
    const o = {};
    for (const [k, f] of Object.entries(g.fields)) {
      const v = src[k];
      if (f.kind === 'text' && typeof v === 'string' && v.trim()) o[k] = v.replace(/[\r\n<>{}]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80);
      if (f.kind === 'seconds' && v !== '' && v != null && Number.isFinite(Number(v))) o[k] = Math.min(f.max, Math.max(f.min, Math.round(Number(v))));
      if (f.kind === 'choice' && f.options.some(([val]) => val && val === v)) o[k] = v;
      if (f.kind === 'time' && typeof v === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(v)) o[k] = v;
    }
    if (Object.keys(o).length) out[group] = o;
  }
  return out;
}

const describe = (group, o) => {
  const f = HOUSE[group].fields;
  return Object.entries(o).map(([k, v]) => {
    if (f[k].kind === 'seconds') return `${v} seconds`;
    if (f[k].kind === 'choice') return f[k].options.find(([val]) => val === v)?.[1].toLowerCase() || v;
    if (f[k].kind === 'time') return `${f[k].label.toLowerCase()} = ${v}`;
    return v;
  }).join(', ');
};

// One prompt line for the front desk (and hats), or '' when nothing is set.
export function houseStylePrompt(hs, user = 'the user') {
  const c = cleanHouseStyle(hs);
  const parts = [];
  if (c.music) parts.push(`music: ${describe('music', c.music)}`);
  if (c.pictures) parts.push(`pictures: ${describe('pictures', c.pictures)}`);
  if (c.video) parts.push(`clips: ${describe('video', c.video)}`);
  if (c.sfx) parts.push(`sound effects: ${describe('sfx', c.sfx)}`);
  if (c.times) parts.push(`times of day: ${describe('times', c.times)}`);
  if (!parts.length) return '';
  return `\n\n${user}'s house style, for when a request doesn't say (use it instead of asking, and say which defaults you used): ${parts.join('; ')}. Anything ${user} says in the request wins.`;
}

const SHAPES = { square: [1024, 1024], wide: [1344, 768], tall: [768, 1344] };

// Fills in what a tool call left out from the house style. Returns the args to use and what was filled in,
// in plain words for the chat ("Used your house style: 30 seconds"). Never overrides what the brain did set.
export function applyHouseStyle(tool, args, hs) {
  const c = cleanHouseStyle(hs);
  const a = { ...(args || {}) };
  const used = [];
  const empty = (v) => v === undefined || v === null || v === '';
  if (tool === 'make_music' && c.music) {
    if (empty(a.seconds) && c.music.seconds) { a.seconds = c.music.seconds; used.push(`${c.music.seconds} seconds`); }
  }
  if (tool === 'make_image' && c.pictures) {
    if (c.pictures.shape && empty(a.width) && empty(a.height) && !(a.reference && a.reference.length)) { [a.width, a.height] = SHAPES[c.pictures.shape]; used.push(`${c.pictures.shape} shape`); }
  }
  if (tool === 'make_video' && c.video) {
    if (empty(a.seconds) && c.video.seconds) { a.seconds = c.video.seconds; used.push(`${c.video.seconds} seconds`); }
  }
  if (tool === 'make_sound' && c.sfx) {
    if (empty(a.seconds) && c.sfx.seconds) { a.seconds = c.sfx.seconds; used.push(`${c.sfx.seconds} seconds`); }
  }
  return { args: a, used };
}

// The chat line when defaults were used, with a way to change them.
export const usedLine = (used) => (used.length ? `Used your house style: ${used.join(', ')}` : '');

// The boxes for one group, for Settings, House style. data-hs="group.field" is saved on change by cellar.js.
export function houseStyleHtml(group, hs) {
  const g = HOUSE[group];
  if (!g) return '';
  const cur = cleanHouseStyle(hs)[group] || {};
  const field = ([k, f]) => {
    const id = `hs-${group}-${k}`;
    const name = `${group}.${k}`;
    if (f.kind === 'choice') return `<label for="${id}">${esc(f.label)}</label><select id="${id}" data-hs="${name}">${f.options.map(([v, l]) => `<option value="${esc(v)}"${(cur[k] || '') === v ? ' selected' : ''}>${esc(l)}</option>`).join('')}</select>`;
    if (f.kind === 'seconds') return `<label for="${id}">${esc(f.label)}</label><input id="${id}" type="number" min="${f.min}" max="${f.max}" step="1" placeholder="Bob picks" value="${esc(cur[k] ?? '')}" data-hs="${name}">`;
    if (f.kind === 'time') return `<label for="${id}">${esc(f.label)}</label><input id="${id}" type="time" value="${esc(cur[k] || '')}" data-hs="${name}">`;
    return `<label for="${id}">${esc(f.label)}</label><input id="${id}" type="text" maxlength="80" placeholder="Bob picks (${esc(f.hint)})" value="${esc(cur[k] || '')}" data-hs="${name}">`;
  };
  return `<details class="house-style" id="house-${group}"${Object.keys(cur).length ? ' open' : ''}><summary>${esc(g.title)}${Object.keys(cur).length ? '' : ' <span class="muted">(Bob picks)</span>'}</summary>
    <p class="muted">${group === 'times' ? 'When you say "tomorrow morning", Bob uses the time you set here. Empty: Bob picks and tells you.' : 'Used when you don\'t say. Leave a box empty and Bob picks, then tells you what he picked.'}</p>
    <div class="hs-grid">${Object.entries(g.fields).map(field).join('')}</div></details>`;
}

// Which group belongs to a job (null for slots without a house style).
export const houseGroupOf = (slotId) => Object.entries(HOUSE).find(([, g]) => g.slot === slotId)?.[0] || null;

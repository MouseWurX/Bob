// The character screen (1.5.122): a paper doll built from parts. Bob's own look on the Style page uses it (no
// "Woman" body there: Bob is a guy), and the 🎲 Adventure start card uses it for your character, which is saved with
// the game, never as Bob's look. Pure HTML in, one id out ("c:" plus the parts), drawn by drawBob like any look.
import { PARTS, PART_ORDER, PART_COLOURS, DEFAULT_PARTS, cleanParts, encodeParts, decodeParts, partsFor, partName, avatar } from './avatars.js';
import { drawBob } from './bob-sprite.js';
import { esc } from './util.js';

const SWATCH = { hc: 'hc', skin: 'skin', cloth: 'cloth' }; // parts shown as colour swatches rather than a list

// bodies: which bodies this screen offers (Bob's own screen passes ['m', 'robot', 'alien']).
export function characterHtml(parts, { bodies = PARTS.body.map(([v]) => v), useLabel = 'Use this look', id = 'char' } = {}) {
  const p = cleanParts(parts);
  if (!bodies.includes(p.body)) p.body = bodies[0];
  const shown = partsFor(p.body);
  const swatchFor = (k) => (k === 'skin' && p.body === 'robot') ? 'metal' : (k === 'skin' && p.body === 'alien') ? 'alien' : SWATCH[k];
  const row = (k) => {
    const opts = PARTS[k].filter(([v]) => k !== 'body' || bodies.includes(v));
    const sw = swatchFor(k);
    if (sw) {
      const cols = PART_COLOURS[sw];
      return `<div class="char-row"><span class="char-label">${esc(partName(k))}</span><div class="char-swatches" role="radiogroup" aria-label="${esc(partName(k))}">${opts.map(([v, label], i) => `<button type="button" role="radio" aria-checked="${p[k] === v}" aria-label="${esc(label)}" title="${esc(label)}" data-part="${k}" data-val="${esc(v)}" style="background:${cols[i % cols.length]}"></button>`).join('')}</div></div>`;
    }
    return `<label class="char-row"><span class="char-label">${esc(partName(k))}</span><select data-part="${k}" aria-label="${esc(partName(k))}">${opts.map(([v, label]) => `<option value="${esc(v)}" ${p[k] === v ? 'selected' : ''}>${esc(label)}</option>`).join('')}</select></label>`;
  };
  const look = avatar(encodeParts(p));
  return `<div class="character" data-character="${id}">
    <div class="char-preview"><canvas class="char-doll" width="128" height="128" aria-label="Preview"></canvas><p class="muted char-what">${esc(look?.what || '')}</p>
      <div class="row"><button type="button" class="mini" data-char-random>🎲 Surprise me</button><button type="button" class="mini" data-char-reset>Start over</button></div></div>
    <div class="char-parts">${shown.map(row).join('')}</div>
    <div class="row char-go"><button type="button" class="yes" data-char-use>${esc(useLabel)}</button><button type="button" data-char-cancel>Cancel</button></div>
  </div>`;
}

// Wires one character box. onUse(id, parts) when "Use" is pressed; onCancel() on Cancel. Redraws itself on every
// change, so the body picker can show or hide the parts that fit. Returns { parts, id }.
export function mountCharacter(root, { parts, bodies, useLabel, onUse, onCancel }) {
  const state = { parts: cleanParts(parts) };
  if (bodies && !bodies.includes(state.parts.body)) state.parts.body = bodies[0];
  function paint() {
    const cv = root.querySelector('.char-doll'); if (!cv) return;
    const c = cv.getContext('2d'); c.imageSmoothingEnabled = false;
    try { drawBob(c, cv.width, {}, encodeParts(state.parts)); } catch {}
  }
  function redraw(focusKey) {
    root.innerHTML = characterHtml(state.parts, { bodies, useLabel });
    paint();
    if (focusKey) { const el = root.querySelector(`[data-part="${focusKey}"][aria-checked="true"], select[data-part="${focusKey}"]`); if (el) el.focus(); }
  }
  root.addEventListener('change', (e) => {
    const sel = e.target.closest('select[data-part]'); if (!sel) return;
    state.parts[sel.dataset.part] = sel.value;
    if (sel.dataset.part === 'body') redraw('body'); else { state.parts = cleanParts(state.parts); root.querySelector('.char-what').textContent = avatar(encodeParts(state.parts))?.what || ''; paint(); }
  });
  root.addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.part) { state.parts[b.dataset.part] = b.dataset.val; for (const x of root.querySelectorAll(`[data-part="${b.dataset.part}"]`)) x.setAttribute('aria-checked', String(x === b)); root.querySelector('.char-what').textContent = avatar(encodeParts(state.parts))?.what || ''; paint(); return; }
    if ('charRandom' in b.dataset) { const r = {}; for (const k of PART_ORDER) { const opts = PARTS[k].filter(([v]) => k !== 'body' || !bodies || bodies.includes(v)); r[k] = opts[Math.floor(Math.random() * opts.length)][0]; } if (Math.random() < 0.5) r.weapon = 'none'; if (Math.random() < 0.6) r.shield = 'none'; if (Math.random() < 0.5) r.armour = 'none'; state.parts = cleanParts(r); redraw(); return; }
    if ('charReset' in b.dataset) { state.parts = { ...DEFAULT_PARTS, body: bodies ? bodies[0] : DEFAULT_PARTS.body }; redraw(); return; }
    if ('charUse' in b.dataset) { onUse?.(encodeParts(state.parts), { ...state.parts }); return; }
    if ('charCancel' in b.dataset) { onCancel?.(); }
  });
  redraw();
  return { get id() { return encodeParts(state.parts); }, get parts() { return { ...state.parts }; }, paint };
}

export const BOB_BODIES = ['m', 'robot', 'alien'];
export const partsOf = (id) => decodeParts(id) || { ...DEFAULT_PARTS };

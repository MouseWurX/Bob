// 1.5.163 One chooser for "where does this come from": a brain or a lesson set can be on this replicant matrix, on
// Hugging Face, or at any other link. Shared by the Forge form and the other Lab pages, so every picker looks and
// reads the same. Each source is { kind: 'local' | 'hf' | 'link', value, info?, busy? }. `info` is what the Lab read
// about a Hugging Face repo (src/lab-hf.js), or null.
import { esc } from './rich.js';

export const SOURCE_KINDS = [
  ['local', 'On this replicant matrix', 'A file or folder here. Paste its path.'],
  ['hf', 'On Hugging Face', 'Its name (owner/name) or its link.'],
  ['link', 'At another link', 'A direct https link to the file.'],
];
export const newSource = (kind = 'hf') => ({ kind, value: '', info: null, busy: false });

// What the Lab read from a Hugging Face card, in plain words. `what` is 'model' or 'dataset'.
export function sourceInfoHtml(x, what) {
  if (x.busy) return '<p class="muted" role="status">Looking it up on Hugging Face…</p>';
  if (x.kind !== 'hf') return '';
  const i = x.info; if (!i) return '';
  if (!i.ok) return `<p class="error" role="alert">${esc(i.error)}</p>`;
  const cls = { tiny: 'Tiny', small: 'Small', medium: 'Medium', large: 'Large', huge: 'Huge', giant: 'Giant' }[i.cls] || '';
  const bits = [i.license ? `Licence: ${i.license}` : 'No licence on its card', i.gated ? 'gated (your token is used)' : '', i.private ? 'private (your token is used)' : '',
    what === 'model' && i.paramsB ? `${i.paramsB} billion weights${cls ? ` (${cls})` : ''}${i.moe ? ', a mixture of experts' : ''}` : '',
    what === 'dataset' && i.files ? `${i.files.length} file${i.files.length === 1 ? '' : 's'} the Forge can read${i.file ? `, using ${i.file}` : ''}` : ''].filter(Boolean);
  return `<p role="status"><a href="${esc(i.url)}" target="_blank" rel="noopener noreferrer">${esc(i.repo)}${i.revision ? ` @ ${esc(i.revision)}` : ''}</a> · ${esc(bits.join(' · '))}</p>${i.warn ? `<p class="error">${esc(i.warn)}</p>` : ''}${i.note ? `<p class="muted">${esc(i.note)}</p>` : ''}${i.license && !i.licenseOpen ? '<p class="muted">Read its licence on its page before you use what you make from it.</p>' : ''}`;
}

// One row: a kind select, the value box, Look it up for Hugging Face, and Remove when `removable`. `id` prefixes the
// controls; the handlers below read the same ids back. Buttons carry data-src="<id>" and data-srcact.
export function sourceRowHtml(id, label, x, what, { removable = false, placeholder = '' } = {}) {
  const ph = x.kind === 'local' ? (what === 'model' ? 'C:\\brains\\my-brain (a folder of safetensors)' : 'C:\\lessons\\mine.jsonl') : x.kind === 'hf' ? (what === 'model' ? 'Qwen/Qwen3.6-35B-A3B' : 'owner/name, or a huggingface.co/datasets link') : 'https://…';
  return `<div class="lab-source" data-srcrow="${esc(id)}"><div class="row">
    <label for="${esc(id)}-kind">${esc(label)}</label>
    <select id="${esc(id)}-kind" data-src="${esc(id)}" data-srcact="kind">${SOURCE_KINDS.map(([k, l]) => `<option value="${k}" ${x.kind === k ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>
    <input id="${esc(id)}-value" data-src="${esc(id)}" data-srcact="value" maxlength="400" value="${esc(x.value)}" placeholder="${esc(placeholder || ph)}" aria-label="${esc(label)}: where">
    ${x.kind === 'hf' ? `<button type="button" class="get" data-src="${esc(id)}" data-srcact="look">Look it up</button>` : ''}
    ${removable ? `<button type="button" class="link" data-src="${esc(id)}" data-srcact="remove">Remove</button>` : ''}
  </div><p class="muted">${esc(SOURCE_KINDS.find(([k]) => k === x.kind)?.[2] || '')}</p>${sourceInfoHtml(x, what)}</div>`;
}

// The source as the server reads it: only what it needs, never the busy flag or the whole card.
export function sourceOut(x) {
  if (!x || !x.value?.trim()) return null;
  if (x.kind === 'hf') return x.info?.ok ? { kind: 'hf', repo: x.info.repo, revision: x.info.revision || '', file: x.info.file || '', license: x.info.license || '', ...(x.info.kind === 'model' ? { moe: x.info.moe } : {}) } : { kind: 'hf', ref: x.value.trim(), unchecked: true };
  return { kind: x.kind, value: x.value.trim() };
}

// Apply a change or click on a row. `look(x)` is async and fills x.info; returns true when the caller should draw.
export async function sourceEvent(el, x, look) {
  const act = el.dataset.srcact;
  if (act === 'kind') { x.kind = el.value; x.info = null; return true; }
  if (act === 'value') { x.value = el.value; x.info = null; return false; }
  if (act === 'look') { const inp = document.getElementById(`${el.dataset.src}-value`); if (inp) x.value = inp.value; x.busy = true; try { x.info = await look(x); } catch (e) { x.info = { ok: false, error: e.message }; } x.busy = false; return true; }
  return false;
}

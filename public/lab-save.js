// 1.5.152 🧪 Computer Science Lab: Save. Any result table can be kept as a picture, as text to paste, or as data for a
// spreadsheet, in the Lab's results folder. The page sends only the title, column names and cells: never file paths,
// chats or names. The graphics card and memory go on only if the box is ticked. Pictures are drawn here, offline.
import { esc } from './rich.js';

export const FORMATS = [['png', 'Picture', 'A card for a phone screen or a forum post.'], ['md', 'Text', 'A table you can paste into a message (Markdown).'], ['csv', 'Spreadsheet', 'A CSV file for Excel, Numbers or Sheets.'], ['json', 'Data', 'JSON, for programs.']];

// The Save panel for one result. `s` = { open, format, hardware, saved, error }; `hw` = the hardware line Bob would add.
export function saveHtml(key, s, hw) {
  if (!s.open) return `<div class="row"><button type="button" class="link" data-saveopen="${esc(key)}" aria-expanded="false">Save…</button></div>`;
  return `<fieldset class="lab-save"><legend>Save this</legend>
    ${FORMATS.map(([id, label, hint]) => `<label class="lab-opt"><input type="radio" name="save-${esc(key)}" value="${id}" data-savefmt="${esc(key)}" ${s.format === id ? 'checked' : ''}> <span><strong>${label}</strong><br><span class="muted">${hint}</span></span></label>`).join('')}
    <label class="lab-opt"><input type="checkbox" data-savehw="${esc(key)}" ${s.hardware ? 'checked' : ''}> <span><strong>Include my graphics card and memory</strong><br><span class="muted">Adds "${esc(hw)}". A score means less without it, but it's your call.</span></span></label>
    <p class="muted">It says: the title, the table, Bob's version and today's date${s.hardware ? `, and ${esc(hw)}` : ''}. Never file paths, your chats or your name.</p>
    <div class="row"><button type="button" class="get" data-savego="${esc(key)}">Save</button><button type="button" class="link" data-saveclose="${esc(key)}">Close</button></div>
    ${s.saved ? `<p class="muted" role="status">Saved ${esc(s.saved)} in the Lab's results folder.</p>` : ''}${s.error ? `<p class="error" role="alert">${esc(s.error)}</p>` : ''}
  </fieldset>`;
}

const css = (name, dflt) => { try { return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || dflt; } catch { return dflt; } };

// A picture of a table: title, table, a footer line. Theme colours, 2x for sharp text, about phone-screen width.
export function drawCard({ title, head, rows, note = '', foot = '' }) {
  const scale = 2, pad = 28, rowH = 30;
  const cv = document.createElement('canvas');
  const ctx = cv.getContext('2d');
  const font = css('--font', 'system-ui, sans-serif');
  // Measure every cell in bold (the widest it is drawn), widen the card up to 1400 for a wide table, and only then
  // shrink the text, so nothing is ever cut off.
  ctx.font = `bold 15px ${font}`;
  const cols = head.map((h, i) => Math.max(ctx.measureText(h).width, ...rows.map((r) => ctx.measureText(String(r[i] ?? '')).width)) + 18);
  const total = cols.reduce((a, b) => a + b, 0);
  const w = Math.max(900, Math.min(1400, Math.ceil(total + pad * 2)));
  const k = Math.min(1, (w - pad * 2) / total);
  const size = Math.max(9, Math.floor(15 * k * 10) / 10);
  const widths = cols.map((c) => (c * size) / 15);
  const h = pad + 40 + rowH * (rows.length + 1) + (note ? 30 : 0) + 40 + pad;
  cv.width = w * scale; cv.height = h * scale;
  ctx.scale(scale, scale);
  ctx.fillStyle = css('--panel', '#2b1d14'); ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = css('--accent', '#e7a64a'); ctx.fillRect(0, 0, w, 6);
  ctx.fillStyle = css('--text', '#f3e7d3'); ctx.font = `bold 22px ${font}`; ctx.textBaseline = 'middle';
  ctx.fillText(`🧪 ${title}`, pad, pad + 16);
  let y = pad + 40;
  const line = css('--line', '#5a4030');
  const drawRow = (cells, bold) => {
    let x = pad;
    ctx.font = `${bold ? 'bold ' : ''}${size}px ${font}`;
    cells.forEach((c, i) => { ctx.fillText(String(c ?? ''), x + 6, y + rowH / 2); x += widths[i]; });
    ctx.strokeStyle = line; ctx.beginPath(); ctx.moveTo(pad, y + rowH); ctx.lineTo(w - pad, y + rowH); ctx.stroke();
    y += rowH;
  };
  ctx.fillStyle = css('--text', '#f3e7d3'); drawRow(head, true);
  rows.forEach((r) => drawRow(r, false));
  ctx.fillStyle = css('--muted', '#c7b296'); ctx.font = `13px ${font}`;
  if (note) { y += 18; ctx.fillText(note, pad, y); }
  ctx.fillText(foot, pad, h - pad - 6);
  return cv.toDataURL('image/png');
}

// Save one result through the server. table = { title, head, rows, note }. Returns the file name.
export async function saveResult(api, table, { format, hardware, version = '', hw = '' }) {
  const body = { ...table, format, hardware };
  if (format === 'png') body.png = drawCard({ ...table, foot: [`Made with Bob${version ? ` ${version}` : ''}'s Computer Science Lab`, new Date().toISOString().slice(0, 10), hardware ? hw : ''].filter(Boolean).join(' · ') });
  return (await api('/api/lab/save', body)).file;
}

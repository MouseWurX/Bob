// 🧪 Computer Science Lab: Bring in a full-size brain, the box shared by every Lab page that needs one. Bob's downloads
// are running files (Q4 and friends), and the Lab's own ways (the Playground's ladder, Mix, Stack, Take out the refusal
// habit, Make a brain's running files) start from the full-size copy (F16 or BF16). This box takes a Hugging Face name
// or link, a link to a .gguf, or a file on this replicant matrix (typed, or picked with the file picker), and the server
// (src/lab-fullsize.js) puts it in the Lab's full-size folder and on Bob's list under Your own brains. It used to live
// only in the Forge tab's home ways; now the Playground shows it too, right where the brain list is empty.
import { esc } from './rich.js';

export function createFullSize({ api, view }) {
  const full = { input: '', look: null, msg: '', busy: false, show: false };
  const v = () => view() || {};

  // `id` is the <details> id (the Forge keeps forge-full); `open` forces it open, for a page with no brain to start from.
  function html({ id = 'forge-full', open = false, lead = '' } = {}) {
    const dl = v().full, lk = full.look;
    const prog = !dl ? '' : dl.state === 'joining' ? `<p role="status"><strong>${esc(dl.name)}</strong>: all ${dl.parts} parts are here. Joining them into one file…</p>` : dl.state === 'downloading' ? `<p role="status"><strong>${esc(dl.name)}</strong>: ${dl.doneGB} of ${dl.gb || '?'} GB${dl.parts > 1 ? ` (part ${dl.part} of ${dl.parts})` : ''}. <button type="button" class="link" data-fullstop>Stop</button></p>`
      : dl.state === 'done' ? `<p role="status">${esc(dl.name)} is here and on Bob's list as one of your own brains${dl.added?.name ? ` (${esc(dl.added.name)})` : ''}. Pick it above.${dl.note ? ` ${esc(dl.note)}` : ''}</p>` : `<p class="error" role="alert">${esc(dl.name)}: ${esc(dl.error || dl.state)}</p>`;
    const list = !lk ? '' : !lk.ok ? `<p class="error" role="alert">${esc(lk.error)}</p>` : `${lk.license ? `<p class="muted">Licence: ${esc(lk.license)}.${lk.gated ? ' Gated: accept its terms on its page first.' : ''}</p>` : lk.note ? `<p class="muted">${esc(lk.note)}</p>` : ''}${lk.warn ? `<p class="muted">${esc(lk.warn)}</p>` : ''}${lk.files?.length ? `<ul class="home-lists">${lk.files.map((f) => `<li><strong>${esc(f.file)}</strong>, ${f.gb} GB. ${esc(f.fits)}${f.note ? ` ${esc(f.note)}` : ''} ${lk.kind === 'file' ? `<button type="button" class="link" data-fulladd="${esc(lk.path || '')}">Add it to Bob's list</button>` : `<button type="button" class="link" data-fullget="${esc(f.file)}" ${full.busy || dl?.state === 'downloading' ? 'disabled' : ''}>Get it</button>`}</li>`).join('')}</ul>` : ''}`;
    return `<details class="forge-home lab-compare" id="${esc(id)}" ${open || full.show || dl?.state === 'downloading' ? 'open' : ''}><summary><strong>Bring in a full-size brain</strong> <span class="muted">(F16 or BF16, from Hugging Face, a link or a file here)</span></summary>
      ${lead ? `<p>${lead}</p>` : ''}
      <p class="muted">Bob's downloads are running files (Q4 and friends), and the Lab's ways start from the full-size copy. Paste a Hugging Face name like <code>unsloth/Qwen3-1.7B-GGUF</code>, a link to a .gguf file, or the path of a file on this replicant matrix, or press <strong>Pick a file here</strong>. It goes in the Lab's full-size folder and onto Bob's list under Your own brains. Nothing is uploaded.</p>
      <div class="row"><input data-full="input" value="${esc(full.input)}" maxlength="400" placeholder="owner/name, a link, or ${/win/i.test(navigator.platform) ? 'C:\\...\\brain.gguf' : '~/…/brain.gguf'}" aria-label="Where the brain is" style="flex:1;min-width:16em"><button type="button" class="get" data-fulllook ${full.busy ? 'disabled' : ''}>${full.busy ? 'Looking…' : 'Look'}</button><button type="button" class="link" data-fullpick>Pick a file here</button></div>
      ${full.msg ? `<p class="error" role="alert">${esc(full.msg)}</p>` : ''}${list}${prog}</details>`;
  }

  // Events the page hands over. change: true when it was ours (no redraw needed while typing). click: true when handled.
  function change(el) { if (el.dataset.full === 'input') { full.input = el.value; full.show = true; return true; } return false; }
  const mine = (d) => 'fulllook' in d || 'fullget' in d || 'fullstop' in d || 'fullpick' in d || 'fulladd' in d;
  async function click(b, load) {
    const d = b.dataset;
    if (!mine(d)) return false;
    full.msg = ''; full.show = true;
    try {
      if ('fulllook' in d) { full.busy = true; full.look = null; full.look = await api('/api/lab/full/look', { input: full.input }); }
      else if ('fullget' in d) { full.busy = true; await api('/api/lab/full/get', { input: full.input, file: d.fullget }); }
      else if ('fullstop' in d) await api('/api/lab/full/stop', {});
      else if ('fulladd' in d) { const r = await api('/api/lab/full/add', { file: d.fulladd }); full.look = null; full.msg = r.already ? `${r.added.name} was already on Bob's list.` : r.joined ? `Joined its ${r.joined} parts into one file in the Lab's full-size folder and added it to Bob's list.` : r.note || ''; }
      else if ('fullpick' in d) { const pk = await api('/api/own-models/pick', { kind: 'gguf' }); if (pk.file) { full.input = pk.file; full.look = await api('/api/lab/full/look', { input: pk.file }); } }
    } catch (e) { full.msg = e.message; }
    full.busy = false;
    if (load) await load();
    return true;
  }
  return { html, change, click, mine, state: full };
}

// Why a brain on Bob's list can't start a Lab way that needs the full-size copy, in one short line, or '' when it can.
export function fullSizeWhyNot(b, maxGB = 9) {
  const f = b?.facts;
  if (!f) return b?.error || 'Bob couldn\'t read its file.';
  if (!f.fullSize) return `a running file already (${f.fileType || 'quantized'}), not the full-size copy`;
  if (f.sizeGB > maxGB) return `${f.sizeGB} GB full size, and this way takes up to ${maxGB} GB`;
  return '';
}

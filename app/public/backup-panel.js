// Settings, This replicant matrix: 🗄 Back up and move (src/backup.js does the work).
// Three parts, all drawn all the time (settings rule 14): Save a backup, Restore from a backup, and the automatic
// backup (off unless switched on). What's ticked and typed lives here, so a redraw of Settings never loses it.
import { esc } from './util.js';
import { tip, noteOrTip } from './tips.js';

const when = (iso) => { const d = new Date(iso); return Number.isNaN(d.getTime()) ? '' : d.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }); };
const size = (b) => (b >= 1024 ** 3 ? `${(b / 1024 ** 3).toFixed(1)} GB` : b >= 1024 ** 2 ? `${Math.round(b / 1024 ** 2)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);
const OS_NAMES = { win32: 'Windows', darwin: 'a Mac', linux: 'Linux' };

export function makeBackupPanel({ api, redraw }) {
  let info = null; // GET /api/backup
  const st = {
    parts: null, keys: false, pass: '', pass2: '', msg: '', err: '', busy: false,
    pick: null, rparts: null, rkeys: false, rpass: '', rmsg: '', rerr: '', rbusy: false, done: null,
    folder: null, amsg: '', aerr: ''
  };
  async function load() {
    try { info = await api('/api/backup'); } catch (e) { info = { error: e.message }; }
    if (!st.parts && info?.parts) st.parts = new Set(info.parts.map((p) => p.id));
    if (st.folder === null) st.folder = info?.settings?.folder || '';
    redraw();
  }

  // The closed panel's line: what's set now.
  function note() {
    if (!info) return 'Save one zip of chats, settings, memory and notes; restore it on another replicant matrix';
    if (info.waiting) return 'A restore waits for Bob to start again';
    const s = info.settings || {}, last = info.state?.lastAuto ? when(info.state.lastAuto) : '';
    if (s.auto) return `Automatic backup: every ${s.every}${last ? ` · last ${last}` : ''}${info.state?.lastError ? ' · last one failed' : ''}`;
    return 'Automatic backup off';
  }

  function saveHtml() {
    const parts = info.parts || [];
    const ticks = parts.map((p) => `<label class="switch srow-switch"><input type="checkbox" data-bkpart="${esc(p.id)}" ${st.parts?.has(p.id) ? 'checked' : ''}><span><strong>${esc(p.label)}</strong>${noteOrTip(esc(p.what), p.label)}</span></label>`).join('');
    const keysWhat = `Off unless you tick it. The API keys, bot tokens and phone passcode on this replicant matrix (${info.keysHere || 0} found), locked with a passcode you type here. Nobody can read them without it, Bob included, so keep it somewhere safe. Restoring keys needs the same passcode.`;
    return `<h4 class="ssub">Save a backup</h4>
      <p class="muted">One zip of what makes this Bob yours. Brains and programs aren't in it: they download again on the new replicant matrix.</p>
      ${ticks}
      <label class="switch srow-switch"><input type="checkbox" data-bkkeys ${st.keys ? 'checked' : ''}><span><strong>Keys and passcodes, locked</strong>${noteOrTip(keysWhat, 'Keys and passcodes')}</span></label>
      <div class="save-pick"><label for="bk-pass">Passcode for the keys</label><input id="bk-pass" type="password" autocomplete="new-password" data-bkpass value="${esc(st.pass)}" placeholder="at least ${info.minPasscode || 8} characters">
        <label for="bk-pass2">Type it again</label><input id="bk-pass2" type="password" autocomplete="new-password" data-bkpass2 value="${esc(st.pass2)}"></div>
      <div class="row"><button type="button" data-bk="save" ${st.busy ? 'disabled' : ''}>Save a backup…</button></div>
      <p class="${st.err ? 'error' : 'have'}" aria-live="polite">${esc(st.err || st.msg)}</p>`;
  }

  function restoreHtml() {
    const r = info.lastRestore;
    const last = r ? `<p class="have">Restored ${r.placed} file${r.placed === 1 ? '' : 's'}${r.from ? ` from ${esc(r.from)}` : ''} on ${esc(when(r.at))}.${r.keptIn ? ` What was here before is in ${esc(r.keptIn)}.` : ''}</p>${r.failed?.length ? `<p class="error">${r.failed.length} file${r.failed.length === 1 ? '' : 's'} couldn't go in: ${esc(r.failed.slice(0, 3).join('; '))}. Close anything that has them open and restore again.</p>` : ''}` : '';
    const restart = info.canRestart ? '<button type="button" class="get" data-bk="restart">Restart Bob now</button>' : '<span class="muted">Close Bob and start him again.</span>';
    const waiting = info.waiting || st.done?.waiting ? `<p class="have">The restore is ready. It goes in when Bob starts again. ${restart}</p>` : '';
    let card = '';
    if (st.pick) {
      const p = st.pick, names = Object.fromEntries((info.parts || []).map((x) => [x.id, x.label]));
      const ticks = p.parts.map((id) => `<label class="switch srow-switch"><input type="checkbox" data-bkrpart="${esc(id)}" ${st.rparts?.has(id) ? 'checked' : ''}><span><strong>${esc(names[id] || id)}</strong> <span class="muted">${p.counts[id]} file${p.counts[id] === 1 ? '' : 's'}</span></span></label>`).join('');
      const keys = p.keys ? `<label class="switch srow-switch"><input type="checkbox" data-bkrkeys ${st.rkeys ? 'checked' : ''}><span><strong>Keys and passcodes</strong>${noteOrTip('Puts the locked keys back where Bob reads them (Windows: your user variables; Mac and Linux: ~/.config/bob/env). A key this replicant matrix already has is kept as it is.', 'Keys and passcodes')}</span></label>
        <div class="save-pick"><label for="bk-rpass">Passcode for the keys</label><input id="bk-rpass" type="password" autocomplete="off" data-bkrpass value="${esc(st.rpass)}"></div>` : '<p class="muted">No keys in this backup: type them again in Settings where each one is used.</p>';
      const brains = p.brains?.length ? `<p class="muted">Brains that Bob used: ${esc(p.brains.join(', '))}. They aren't in a backup: get them again from Get models.</p>` : '';
      card = `<div class="confirm"><p><strong>${esc(p.file.split(/[\\/]/).pop())}</strong>: made ${esc(when(p.made))}${p.version ? ` by Bob ${esc(p.version)}` : ''}${OS_NAMES[p.platform] ? ` on ${OS_NAMES[p.platform]}` : ''}${p.auto ? ' (automatic)' : ''}.</p>
        ${ticks}${keys}${brains}
        <p class="muted">Files with the same name are replaced, and what was here before is kept in the archive folder. Phone access, Discord, Telegram, rented brains, cloud helpers, Hands, scheduled jobs and the automatic backup come back switched off. Tools Bob made wait for your OK again.</p>
        <div class="row"><button type="button" class="get" data-bk="restore" ${st.rbusy ? 'disabled' : ''}>Restore these</button><button type="button" data-bk="unpick">Not now</button></div></div>`;
    }
    const done = st.done ? `<p class="have">${st.done.files ? `${st.done.files} file${st.done.files === 1 ? '' : 's'} wait for the next start.` : ''}${st.done.keys?.restored?.length ? ` Put back: ${esc(st.done.keys.restored.join(', '))}.` : ''}${st.done.keys?.kept?.length ? ` Kept the ones already here: ${esc(st.done.keys.kept.join(', '))}.` : ''}${st.done.doors ? ' Discord and Telegram details are back, switched off.' : ''}</p>${st.done.keys?.failed?.length ? `<p class="error">Couldn't save ${esc(st.done.keys.failed.join(', '))}. Type ${st.done.keys.failed.length === 1 ? 'it' : 'them'} again in Settings.</p>` : ''}` : '';
    return `<h4 class="ssub">Restore from a backup</h4>
      <p class="muted">On the new replicant matrix: install Bob, then pick the backup here. ${tip('Bob reads the backup\'s list first and shows what\'s in it. Nothing changes until you press Restore these. The files go in when Bob starts again, so nothing he is using is written over while he runs.', 'Restore from a backup')}</p>
      ${last}${waiting}
      <div class="row"><button type="button" data-bk="pick" ${st.rbusy ? 'disabled' : ''}>Pick a backup…</button></div>
      ${card}${done}
      <p class="error" aria-live="polite">${esc(st.rerr)}</p>`;
  }

  function autoHtml() {
    const s = info.settings || {}, a = info.state || {};
    const status = a.lastError ? `<p class="error">The last automatic backup failed: ${esc(a.lastError)}</p>` : a.lastAuto ? `<p class="have">Last one: ${esc(when(a.lastAuto))}${a.lastFile ? `, ${esc(a.lastFile.split(/[\\/]/).pop())}` : ''}.</p>` : '';
    return `<h4 class="ssub">Automatic backup</h4>
      <label class="switch srow-switch"><input type="checkbox" data-bkauto ${s.auto ? 'checked' : ''}><span><strong>Back up by itself</strong>${noteOrTip('Off unless you turn it on. While Bob is running he saves a backup to the folder below every day or every week, and keeps the newest few. Everything but keys and passcodes: an automatic backup never holds those. A folder on another drive, or one your cloud storage copies, keeps it safe if this replicant matrix breaks.', 'Back up by itself')}</span></label>
      <div class="save-pick"><label for="bk-folder">Folder</label><input id="bk-folder" type="text" data-bkfolder value="${esc(st.folder ?? s.folder ?? '')}" placeholder="D:\\Bob backups"> <button type="button" class="mini" data-bk="browse">Browse…</button> <button type="button" class="mini" data-bk="folder">Save folder</button></div>
      <div class="save-pick"><label for="bk-every">How often</label><select id="bk-every" data-bkevery><option value="day" ${s.every === 'day' ? 'selected' : ''}>Every day</option><option value="week" ${s.every !== 'day' ? 'selected' : ''}>Every week</option></select>
        <label for="bk-keep">Keep the newest</label><input id="bk-keep" type="number" min="1" max="30" data-bkkeep value="${esc(String(s.keep || 5))}" style="width:5em"></div>
      <div class="row"><button type="button" data-bk="now" ${s.folder ? '' : 'disabled'}>Back up to this folder now</button>${s.folder ? '' : ' <span class="muted">Pick a folder first.</span>'}</div>
      ${status}<p class="${st.aerr ? 'error' : 'have'}" aria-live="polite">${esc(st.aerr || st.amsg)}</p>`;
  }

  function html() {
    if (!info) { load(); return '<p class="muted">Looking…</p>'; }
    if (info.error) return `<p class="error">Bob couldn't read his backup settings: ${esc(info.error)}</p>`;
    return `${saveHtml()}${restoreHtml()}${autoHtml()}`;
  }

  async function saveAuto(patch) {
    st.aerr = ''; st.amsg = '';
    try { info = { ...info, ...(await api('/api/backup', { backup: patch })) }; st.folder = info.settings.folder; st.amsg = 'Saved.'; } catch (e) { st.aerr = e.message; }
    redraw();
  }

  // Buttons. True when it was one of this panel's.
  async function onClick(b) {
    const what = b.dataset?.bk;
    if (!what) return false;
    if (what === 'save') {
      st.err = ''; st.msg = '';
      if (st.keys && st.pass !== st.pass2) { st.err = 'The two passcodes are different. Type the same one twice.'; redraw(); return true; }
      if (st.keys && st.pass.length < (info.minPasscode || 8)) { st.err = `The passcode needs at least ${info.minPasscode || 8} characters.`; redraw(); return true; }
      st.busy = true; st.msg = 'Pick a folder when the window opens…'; redraw();
      try {
        const r = await api('/api/backup/save', { parts: [...(st.parts || [])], keys: st.keys, passcode: st.keys ? st.pass : '' });
        if (r.cancelled) st.msg = 'Nothing saved: you closed the folder window.';
        else if (!r.ok) st.err = r.error || 'The backup wasn\'t saved.';
        else { st.msg = `Saved ${r.file} (${r.files} files, ${size(r.bytes)}${r.keys ? `, ${r.keys} key${r.keys === 1 ? '' : 's'} locked` : ''}).`; st.pass = ''; st.pass2 = ''; }
      } catch (e) { st.err = e.message; }
      st.busy = false; redraw(); return true;
    }
    if (what === 'pick') {
      st.rerr = ''; st.done = null; st.rbusy = true; redraw();
      try {
        const r = await api('/api/backup/pick', {});
        if (r.cancelled) { /* closed the window */ } else if (!r.ok) st.rerr = r.error || 'Bob couldn\'t read that backup.';
        else { st.pick = r; st.rparts = new Set(r.parts); st.rkeys = false; st.rpass = ''; }
      } catch (e) { st.rerr = e.message; }
      st.rbusy = false; redraw(); return true;
    }
    if (what === 'unpick') { st.pick = null; st.rerr = ''; redraw(); return true; }
    if (what === 'restore') {
      st.rerr = '';
      if (st.rkeys && !st.rpass) { st.rerr = 'Type the passcode the keys were locked with, or untick Keys and passcodes.'; redraw(); return true; }
      st.rbusy = true; redraw();
      try {
        const r = await api('/api/backup/restore', { file: st.pick.file, parts: [...st.rparts], keys: st.rkeys, passcode: st.rkeys ? st.rpass : '' });
        if (!r.ok) st.rerr = r.error || 'The restore didn\'t work.';
        else { st.done = r; st.pick = null; st.rpass = ''; info = { ...info, waiting: r.waiting, canRestart: r.canRestart }; }
      } catch (e) { st.rerr = e.message; }
      st.rbusy = false; redraw(); return true;
    }
    if (what === 'restart') { b.disabled = true; try { const r = await api('/api/backup/restart', {}); if (!r.ok) st.rerr = r.error; else b.outerHTML = '<span class="have">Restarting…</span>'; } catch (e) { st.rerr = e.message; } if (st.rerr) redraw(); return true; }
    if (what === 'browse') { try { const r = await api('/api/backup/browse', {}); if (r.folder) { st.folder = r.folder; await saveAuto({ folder: r.folder }); } else if (r.error) { st.aerr = r.error; redraw(); } } catch (e) { st.aerr = e.message; redraw(); } return true; }
    if (what === 'folder') { await saveAuto({ folder: st.folder || '' }); return true; }
    if (what === 'now') {
      st.aerr = ''; st.amsg = 'Saving…'; redraw();
      try { const r = await api('/api/backup/now', {}); info = { ...info, ...r }; st.amsg = r.ok ? `Saved ${r.file}.` : ''; if (!r.ok) st.aerr = r.state?.lastError || r.error || 'Not saved.'; } catch (e) { st.aerr = e.message; st.amsg = ''; }
      redraw(); return true;
    }
    return false;
  }

  // Ticks and lists. True when it was one of this panel's.
  async function onChange(t) {
    const d = t.dataset || {};
    if (d.bkpart) { t.checked ? st.parts.add(d.bkpart) : st.parts.delete(d.bkpart); return true; }
    if (d.bkrpart) { t.checked ? st.rparts.add(d.bkrpart) : st.rparts.delete(d.bkrpart); return true; }
    if ('bkkeys' in d) { st.keys = t.checked; return true; }
    if ('bkrkeys' in d) { st.rkeys = t.checked; return true; }
    if ('bkauto' in d) { await saveAuto({ auto: t.checked, folder: st.folder || info.settings?.folder || '' }); return true; }
    if ('bkevery' in d) { await saveAuto({ every: t.value }); return true; }
    if ('bkkeep' in d) { await saveAuto({ keep: Number(t.value) }); return true; }
    return 'bkpass' in d || 'bkpass2' in d || 'bkrpass' in d || 'bkfolder' in d;
  }
  // Typing: kept here, nothing saved.
  function onInput(t) {
    const d = t.dataset || {};
    if ('bkpass' in d) st.pass = t.value;
    else if ('bkpass2' in d) st.pass2 = t.value;
    else if ('bkrpass' in d) st.rpass = t.value;
    else if ('bkfolder' in d) st.folder = t.value;
  }
  return { html, note, onClick, onChange, onInput, load };
}

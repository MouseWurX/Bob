// Settings: Bob's home folder, projects, where he saves things, his own tools, notes, memory banks and housekeeping. Split out of cellar.js.
import { esc } from './util.js';
import { tip } from './tips.js';

// now() hands over createCellar's own values as they are at the moment of each call; fresh() copies them in.
export function createHomeParts(now) {
  let howtoEditing, loadOwnKit, ownAsk, ownError, ownKit, ownLast, ownPurgeAsk, settings;
  const fresh = () => { ({ howtoEditing, loadOwnKit, ownAsk, ownError, ownKit, ownLast, ownPurgeAsk, settings } = now()); };
  // Housekeeping: off unless turned on. Each kind has its own age limit and "ask me" (default) or "tidy automatically".
  // 1.5.34 Projects: the folders Bob searches when you say "my project" (search_files), and which one is the main one.
  // Before this they could only be set by hand in config.json, so brains kept asking "which project?".
  function projectsHtml() {
    const list = settings?.projectList || [];
    const def = settings?.defaultProject || '';
    const rows = list.map((p, i) => `<li class="project-row"><label><input type="radio" name="mainproject" data-mainproject="${esc(p.name)}" ${p.name === def ? 'checked' : ''}> <strong>${esc(p.name)}</strong></label>
      ${p.name === def ? '<span class="tag good">main project</span>' : ''}<span class="muted proj-path">${esc(p.path)}</span>${p.missing ? ' <span class="error">(folder not found)</span>' : ''} <button type="button" class="mini" data-projremove="${i}" title="Your files aren't touched.">Remove from list</button> <span class="muted">Your files aren't touched.</span></li>`).join('');
    return `<p class="muted">Folders Bob can search and work in. ${tip('Folders with your code or work. "Search my project" looks here, main project first. Bob can read these folders; changing files still needs the Files Hand and your OK.', 'Projects')}</p>
      ${list.length ? '<p class="muted proj-main-head">Main: pick the dot next to a project.</p>' : ''}
      <ul class="project-list">${rows || '<li class="muted">No projects yet. Bob searches nothing until you add one.</li>'}</ul>
      ${list.length ? `<label class="project-none"><input type="radio" name="mainproject" data-mainproject="" ${def ? '' : 'checked'}> No main project</label>` : ''}
      <div class="project-add"><label for="proj-name">Name</label><input id="proj-name" type="text" maxlength="60" placeholder="like My Game">
        <label for="proj-path">Folder</label><input id="proj-path" type="text" placeholder="C:\\Projects\\MyGame"> <button type="button" class="mini" data-projbrowse>Browse…</button>
        <button type="button" data-projadd disabled>Add project</button><p class="error proj-error" hidden></p></div>`;
  }
  const ownSame = (a, b) => a && b && a.kind === b.kind && a.id === b.id;
  const ownWhen = (t) => new Date(t).toLocaleDateString([], { month: 'short', day: 'numeric' });
  const when = (t) => new Date(t).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  const KIND_WORD = { tool: 'tool', howto: 'how-to' };
  const binWord = () => (settings?.os === 'mac' ? 'the Trash' : settings?.os === 'linux' ? 'the trash' : 'the Recycle Bin'); // where thrown-away files go, by platform
  const TOOL_STATE = { on: '', off: 'turned off', changed: 'off: its files changed since you OK\'d it', missing: 'its folder is gone' };
  // Delete asks on the row itself: Delete, then "Delete / Keep it". No pop-up.
  const ownDelBtns = (kind, id, name) => ownSame(ownAsk, { kind, id })
    ? `<span class="ownkit-ask">Delete "${esc(name)}"? <span class="muted">It waits 30 days under Recently deleted.</span></span> <button type="button" class="mini danger" data-owndel="${esc(kind)}:${esc(id)}" aria-label="Yes, delete the ${KIND_WORD[kind]} ${esc(name)}">Delete</button><button type="button" class="link" data-owncancel>Keep it</button>`
    : `<button type="button" class="mini" data-ownask="${esc(kind)}:${esc(id)}" aria-label="Delete the ${KIND_WORD[kind]} ${esc(name)}">Delete</button>`;
  function ownKitHtml() {
    if (ownKit === null) { loadOwnKit(); return '<p class="muted">Loading…</p>'; }
    const k = ownKit;
    const intro = `<p class="muted">Everything Bob made for himself to work with: the tools he wrote and the how-tos he kept. Look them over and delete what you don't want him to have. Anything deleted waits 30 days under Recently deleted, where you can put it back. ${tip('Delete here stops Bob using the thing at once. A tool\'s files stay in his folder on the shelf, then go to ' + binWord() + ' after 30 days (or when you press Delete for good). A how-to is plain text, so it\'s simply forgotten. Nothing here leaves this replicant matrix (your computer).', 'Tools and how-tos')}</p>`;
    const note = ownError ? `<p class="error ownkit-note" role="alert">${esc(ownError)}</p>`
      : ownLast ? `<p class="ownkit-note" role="status">${ownLast.put ? `Put the ${KIND_WORD[ownLast.kind]} "${esc(ownLast.name)}" back.` : `Deleted the ${KIND_WORD[ownLast.kind]} "${esc(ownLast.name)}". <button type="button" class="mini" data-ownundo="${esc(ownLast.kind)}:${esc(ownLast.id)}">Undo</button>`}</p>` : '<p class="ownkit-note" role="status" hidden></p>';
    const tools = k.tools.map((t) => `<li class="ownkit-row"><div class="row"><strong>${esc(t.name)}</strong>${TOOL_STATE[t.state] ? ` <span class="warn-text">${esc(TOOL_STATE[t.state])}</span>` : ''}<span class="muted">${t.lastUsed ? `used ${esc(when(t.lastUsed))}` : 'not used yet'}</span></div>
        <div class="muted">${esc(t.what)}</div>
        <div class="muted">Can change: ${esc(t.writes.join('; ') || 'nothing outside its folder')}. Internet: ${t.internet ? 'yes' : 'no'}. Made ${esc(when(t.at))}.</div>
        <div class="row"><button type="button" class="mini" data-owncode="${esc(t.name)}" aria-label="Show the code of ${esc(t.name)}">Show code</button>${ownDelBtns('tool', t.name, t.name)}</div><pre class="cmd ownkit-code" hidden></pre></li>`).join('');
    const howtos = k.howtos.map((r) => howtoEditing === r.id
      ? `<li class="ownkit-row howto-row" data-howto="${esc(r.id)}"><label>Name <input data-rname maxlength="60" value="${esc(r.name)}"></label>
          <label>What it's for <input data-rwhen maxlength="200" value="${esc(r.when || '')}"></label>
          <label>Steps (one per line) <textarea data-rsteps rows="${Math.min(12, r.steps.length + 1)}">${esc(r.steps.map((x) => x.did).join('\n'))}</textarea></label>
          <div class="row"><button type="button" data-howtosave="${esc(r.id)}">Save changes</button><button type="button" class="link" data-howtocancel>Cancel</button></div><p class="error howto-error" hidden></p></li>`
      : `<li class="ownkit-row howto-row"><div class="row"><strong>${esc(r.name)}</strong><span class="muted">${r.steps.length} steps${r.used ? ` · used ${r.used} time${r.used === 1 ? '' : 's'}` : ' · not used yet'}</span></div>
          ${r.when && r.when !== r.name ? `<div class="muted">For: ${esc(r.when)}</div>` : ''}
          <ol class="howto-steps">${r.steps.map((x) => `<li>${esc(x.did)}</li>`).join('')}</ol>
          <div class="row"><button type="button" class="mini" data-howtoedit="${esc(r.id)}" aria-label="Edit the how-to ${esc(r.name)}">Edit</button>${ownDelBtns('howto', r.id, r.name)}</div></li>`).join('');
    const shelf = k.deleted.map((d) => `<li class="ownkit-row"><div class="row"><strong>${esc(d.name)}</strong><span class="muted">${KIND_WORD[d.kind]}${d.kind === 'howto' ? ` · ${d.steps} steps` : ''} · gone for good ${esc(ownWhen(d.goneAt))}</span></div>
        ${d.what ? `<div class="muted">${esc(d.what)}</div>` : ''}
        <div class="row"><button type="button" class="mini" data-ownput="${esc(d.kind)}:${esc(d.id)}" aria-label="Put the ${KIND_WORD[d.kind]} ${esc(d.name)} back">Put back</button>${ownSame(ownPurgeAsk, d)
          ? `<span class="ownkit-ask">Delete "${esc(d.name)}" for good? <span class="muted">${d.kind === 'tool' ? `Its folder goes to ${binWord()}.` : 'There\'s no getting it back.'}</span></span> <button type="button" class="mini danger" data-ownpurge="${esc(d.kind)}:${esc(d.id)}" aria-label="Yes, delete the ${KIND_WORD[d.kind]} ${esc(d.name)} for good">Delete for good</button><button type="button" class="link" data-owncancel>Keep it</button>`
          : `<button type="button" class="mini" data-ownpurgeask="${esc(d.kind)}:${esc(d.id)}" aria-label="Delete the ${KIND_WORD[d.kind]} ${esc(d.name)} for good">Delete for good</button>`}</div></li>`).join('');
    return `${intro}${note}
      <h4 class="ssub">🔧 Tools he wrote <span class="muted">${k.tools.length} of ${k.maxTools}</span></h4>
      <p class="muted">${k.makerOn ? 'With "Make his own tools" on, Bob writes one when none of his tools fits a job, and shows you a card before it\'s added. Turn one off or on under Settings, Hands.' : 'Making new ones is off ("Make his own tools" under Settings, Hands). The ones he already made stay here.'}</p>
      <ul class="ownkit-list">${tools || '<li class="muted">No tools yet.</li>'}</ul>
      <h4 class="ssub">📒 How-tos he kept <span class="muted">${k.howtos.length} of ${k.maxHowtos}</span></h4>
      <p class="muted">${k.howtosOn ? 'After a job with a few steps goes well, Bob offers a card to keep the steps. When you ask for something like it again, he follows them.' : 'Learning new ones is off ("Learn how-tos" in How Bob works). The ones you already saved stay here, and he doesn\'t use them while it\'s off.'}</p>
      <ul class="ownkit-list">${howtos || '<li class="muted">No how-tos yet.</li>'}</ul>
      <details class="ownkit-shelf" ${k.deleted.length && (ownPurgeAsk || ownLast) ? 'open' : ''}><summary><strong>🗑 Recently deleted</strong> <span class="muted">· ${k.deleted.length ? `${k.deleted.length} waiting · each kept 30 days` : 'nothing waiting'}</span></summary>
        <ul class="ownkit-list">${shelf || '<li class="muted">Nothing here. Delete a tool or how-to above and it waits here for 30 days.</li>'}</ul></details>`;
  }
  // 1.5.41 Save folder: the folder for pictures, clips, songs and sounds. Bob's own folder unless one is picked.
  function saveDirHtml() {
    const sd = settings?.saveDir || {};
    const custom = sd.custom === true;
    return `<p class="save-now"><strong>Saving in</strong> <span class="save-path">${esc(sd.folder || '')}</span> ${custom ? '' : '<span class="tag good">Bob\'s own folder</span>'} ${tip('New pictures, clips, songs and sounds are saved here. Things already made stay where they are, and Made by Bob shows them all. Tidy up never tidies a folder you picked. Documents and spreadsheets go where you ask.', 'Save folder')}</p>
      ${sd.missing ? `<p class="error">Bob can't find ${esc(sd.picked)} right now (an unplugged drive, maybe). Until it's back, he saves in his own folder.</p>` : ''}
      <div class="save-pick"><label for="save-path">Folder</label><input id="save-path" type="text" placeholder="D:\\My pictures from Bob" value="${esc(custom ? sd.folder : '')}"> <button type="button" class="mini" data-savebrowse>Browse…</button>
        <button type="button" data-savedir disabled>Save here</button></div>
      <p class="error save-error" hidden></p>
      <p class="save-tools"><button type="button" class="mini" data-saveopen>Show in folder</button>${custom || sd.missing ? ' <button type="button" class="mini" data-saveown>Use Bob\'s own folder</button>' : ''}</p>`;
  }
  function housekeepingHtml() {
    const hk = settings.housekeeping || {};
    const KINDS = [['chats', 'Chats', 'summed up first, so the topic notes and a summary stay'], ['pictures', 'Pictures and clips Bob made', ''], ['sounds', 'Sounds and music Bob made', ''], ['tasks', 'Finished tasks', 'the chats keep what was said'], ['logs', 'Logbook and update logs', ''], ['folders', 'Files in folders you added', 'always asks first']];
    const units = ['minutes', 'hours', 'days', 'weeks', 'months'];
    const folders = hk.extraFolders || [];
    // Nov 11: on by default, his own files only; the folders list below adds more (always "ask first").
    const folderRows = `<h4 class="ssub">Folders you point him to ${tip('Bob only tidies his own files. Add a folder, like Downloads, and he also offers its old files in Tidy up. He always asks first, and they go to the Recycle Bin. System folders, your home folder and Bob\'s own folder can\'t be added.', 'Folders you point him to')}</h4>
      ${folders.length ? folders.map((f) => `<div class="srow"><span class="svalue">${esc(f)}</span><span class="sact"><button type="button" class="mini" data-hkfolderrm="${esc(f)}">Remove</button></span></div>`).join('') : '<p class="muted">None yet. Bob only tidies his own files.</p>'}
      <div class="row"><input data-hkfoldernew maxlength="400" placeholder="Full path, like C:\\Users\\you\\Downloads" aria-label="Folder for Bob to tidy" style="flex:1;min-width:12em"><button type="button" class="mini" data-hkfolderadd>Add folder</button><span class="muted hk-folder-out" aria-live="polite"></span></div>`;
    return `<div class="housekeeping"><span class="tag">on unless you turn it off</span>
       ${tip('While idle, Bob sums up the older part of long chats, files them under Topics, moves lasting facts to memory and offers to clear what hasn\'t come up in a while. Only his own files. Removed things go to the Recycle Bin, pinned items are never touched, and it all goes in the logbook.', 'Housekeeping')}
      <label class="switch"><input type="checkbox" data-hk="enabled" ${hk.enabled ? 'checked' : ''}><span><strong>Auto-tidy</strong> ${tip('Only while he\'s idle (10 minutes quiet, nothing running). He mentions old things at most once a day.', 'Auto-tidy')}</span></label>
      <label class="switch"><input type="checkbox" data-hk="wakeBrain" ${hk.wakeBrain ? 'checked' : ''}><span><strong>Load a brain if needed</strong> ${tip('Loads a brain just for tidying. Leave off while gaming.', 'Load a brain if needed')}</span></label>
      <table class="hk-table"><thead><tr><th>What</th><th>When it hasn't come up for</th><th>Then</th></tr></thead><tbody>
      ${KINDS.map(([k, label, note]) => { const c = hk[k] || {}; return `<tr><td>${esc(label)}${note ? `<br><span class="muted">${esc(note)}</span>` : ''}</td>
        <td><input type="number" min="1" max="999" data-hkkind="${k}" data-hkfield="n" value="${esc(c.n || '')}" aria-label="${esc(label)}: how many" style="width:5em"> <select data-hkkind="${k}" data-hkfield="unit" aria-label="${esc(label)}: unit">${units.map((u) => `<option ${u === c.unit ? 'selected' : ''}>${u}</option>`).join('')}</select></td>
        <td><select data-hkkind="${k}" data-hkfield="mode" aria-label="${esc(label)}: what then"><option value="ask" ${c.mode !== 'auto' ? 'selected' : ''}>Ask me first</option>${k === 'folders' ? '' : `<option value="auto" ${c.mode === 'auto' ? 'selected' : ''}>Tidy automatically</option>`}</select></td></tr>`; }).join('')}
      </tbody></table>
      ${folderRows}
      <div class="row"><button data-opentidy>Open Tidy up</button><button data-hkrun>Tidy up now</button><span class="muted hk-out"></span></div></div>`;
  }
  // Mac and Linux: no removal window. Bob says plainly what to throw away, and where it is.
  function macRemoveHtml() {
    const home = settings.home || '';
    return settings.os === 'mac'
      ? `<div class="remove-bob"><p>To remove Bob from this Mac: quit Bob (Bob menu, Quit Bob), then drag <strong>Bob</strong> from Applications to the Bin. His chats, settings, models and engines stay in <code>${esc(home || '~/Library/Application Support/Bob/home')}</code>; drag that folder to the Bin too if you want them gone. If you turned on "Launch at start-up", turn it off first (or remove Bob in System Settings, General, Login Items).</p></div>`
      : `<div class="remove-bob"><p>To remove Bob: turn off "Launch at start-up" if you turned it on, quit Bob, then delete the Bob AppImage file you downloaded, or run <code>sudo apt remove bob</code> if you installed the .deb, or <code>flatpak uninstall ca.mousewurx.bob</code> for the Flatpak. His chats, settings, models and engines stay in <code>${esc(home || '~/.local/share/bob')}</code>; delete that folder too if you want them gone.</p></div>`;
  }
  // Search notes apps (doc-more.js): an Obsidian vault or a folder of OneNote exports joins the folders Bob reads.
  function notesFoldersHtml() {
    const list = settings.notesFolders || [];
    const rows = list.map((n, i) => `<li><strong>${n.kind === 'onenote' ? 'OneNote export' : 'Obsidian vault'}:</strong> ${esc(n.path)}${n.missing ? ' <span class="muted">(not found)</span>' : n.kind === 'obsidian' && !n.vault ? ' <span class="muted">(no .obsidian folder here, read as plain notes)</span>' : ''} <button type="button" class="mini" data-notesdrop="${i}">Take off</button></li>`).join('');
    return `<div class="srow notes-folders"><strong>Search notes apps</strong> <span class="muted">Works with reading and searching documents on. Add an Obsidian vault, or a folder you exported OneNote notebooks into (OneNote: File, Export, as Word or PDF). Bob then searches them like your documents. Nothing is changed in them.</span>
      ${rows ? `<ul class="packlist">${rows}</ul>` : '<p class="muted">No notes folders yet.</p>'}
      <button type="button" data-notesadd="obsidian">Add an Obsidian vault…</button> <button type="button" data-notesadd="onenote">Add a OneNote export folder…</button> <span class="muted notes-out"></span></div>`;
  }
  // 1.5.79: the memory banks, shown under "Relevant memories only" while it's on.
  function memoryBanksHtml() {
    const mb = settings.memoryBanks || {};
    const list = (mb.banks || []).map((b) => `${b.name ? esc(b.name) : 'General'} ${b.lines}`).join(' · ');
    const l = mb.last;
    const last = l ? `Last message: ${l.lines} of ${l.of} memories, matched by ${l.by === 'meaning' ? 'meaning' : 'words'}${l.project ? ` (${esc(l.project)} memory bank)` : ''}.` : '';
    return `<div class="memory-banks"><p class="muted"><strong>Memory banks:</strong> ${list || 'General 0'}. ${last}</p>
      <button type="button" data-openmemory>Open Bob's memory file</button> <span class="muted">One line per memory. Add [project: Name] (a name from Projects) to put a line in that project's bank, or [always] to have Bob read it every time.</span><div class="mem-edit"></div></div>`;
  }
  return {
    projectsHtml: (...a) => { fresh(); return projectsHtml(...a); },
    ownSame: (...a) => { fresh(); return ownSame(...a); },
    ownWhen: (...a) => { fresh(); return ownWhen(...a); },
    when: (...a) => { fresh(); return when(...a); },
    KIND_WORD,
    binWord: (...a) => { fresh(); return binWord(...a); },
    TOOL_STATE,
    ownDelBtns: (...a) => { fresh(); return ownDelBtns(...a); },
    ownKitHtml: (...a) => { fresh(); return ownKitHtml(...a); },
    saveDirHtml: (...a) => { fresh(); return saveDirHtml(...a); },
    housekeepingHtml: (...a) => { fresh(); return housekeepingHtml(...a); },
    macRemoveHtml: (...a) => { fresh(); return macRemoveHtml(...a); },
    notesFoldersHtml: (...a) => { fresh(); return notesFoldersHtml(...a); },
    memoryBanksHtml: (...a) => { fresh(); return memoryBanksHtml(...a); }
  };
}

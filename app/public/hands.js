// Hands in the window: the approval cards with rows to tick or the exact command, live output with Stop,
// and the Hands section in Settings. Big buttons on purpose (remote desktop).
import { esc } from './rich.js';
import { tip } from './tips.js';
import { bannerHidden, setBannerHidden } from './hands-switch.js'; // the banner's Hide, undone here

const OPS = { move: 'Move', copy: 'Copy', zip: 'Zip', unzip: 'Unzip', recycle: 'Recycle Bin', delete: 'Delete for good', convert: 'Convert', create: 'Make', edit: 'Change', clean: 'Make a clean copy' };
const when = (t) => new Date(t).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
const post = async (url, data) => {
  const r = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json', 'x-bob': '1' }, body: JSON.stringify(data || {}) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || `Error ${r.status}`);
  return j;
};

// Under the Security switch: check a password against known breaches. The password is scrambled (SHA-1) here in
// the window; only the first 5 characters of the scramble go out, and the match is found here too.
function securityLine(on) {
  return `<div class="hands-security muted${on ? '' : ' dim'}"><strong>Check a password safely</strong><br>
    <span>Has a password turned up in a known breach? It's scrambled on this replicant matrix, and only the first 5 characters of the scramble are sent to Have I Been Pwned (haveibeenpwned.com) when you press Check, so the password never leaves. Nothing is saved.</span>${on ? '' : '<br><span>Turn on the Security and privacy Hand above to use this.</span>'}
    <div class="row"><input type="password" data-hpw autocomplete="off" spellcheck="false" placeholder="Type a password" aria-label="Password to check" style="flex:1" ${on ? '' : 'disabled'}><button type="button" data-hpwcheck ${on ? '' : 'disabled'}>Check</button></div>
    <span class="hpw-out" role="status"></span></div>`;
}
async function checkPassword(box) {
  const input = box.querySelector('[data-hpw]'), out = box.querySelector('.hpw-out');
  const pw = input.value;
  if (!pw) { out.textContent = 'Type a password first.'; return; }
  if (!globalThis.crypto?.subtle) { out.textContent = 'This only works in Bob\'s window on this replicant matrix itself.'; return; }
  out.textContent = 'Checking…';
  try {
    const hash = [...new Uint8Array(await crypto.subtle.digest('SHA-1', new TextEncoder().encode(pw)))].map((b) => b.toString(16).padStart(2, '0')).join('').toUpperCase();
    input.value = '';
    const r = await post('/api/hands/pwned', { prefix: hash.slice(0, 5) });
    const line = String(r.range || '').split(/\r?\n/).find((l) => l.split(':')[0] === hash.slice(5));
    const n = line ? Number(line.split(':')[1]) : 0;
    out.innerHTML = n ? `<span class="warn-text">⚠ Seen ${n.toLocaleString()} times in breaches. Stop using it, and change it everywhere you did.</span>` : '✓ Not in any known breach. That doesn\'t make it strong; use it for one account only.';
  } catch (e) { out.textContent = 'Couldn\'t check right now (no internet?). Try again in a minute.'; }
}

// Under the Office switch: which helpers Bob found on this PC, so it's clear what works before asking.
// 1.5.117: the read-only projects, added here (Browse… or type a path), never in a file by hand.
function readOnlyHtml(v, s) {
  const mine = s.readOnlyFolders || [];
  const fixed = (v.readOnly || []).filter((f) => !mine.includes(f));
  return `<br><span class="hands-ro"><span class="muted">Read-only projects:</span>
      ${[...fixed.map((f) => `<span class="ro-item"><code>${esc(f)}</code></span>`), ...mine.map((f) => `<span class="ro-item"><code>${esc(f)}</code> <button type="button" class="link" data-hrodel="${esc(f)}">Remove</button></span>`)].join('') || '<span class="muted">none yet</span>'}
      <span class="row"><input type="text" data-hnewro placeholder="A project folder Bob may read but never change" aria-label="Add a read-only project" style="flex:1"><button type="button" class="mini" data-hrobrowse>Browse…</button><button type="button" class="mini" data-hroadd>Add</button></span>
      <span class="muted">Bob's own folders are always read-only.</span></span>`;
}
function officeLine(o, on) {
  if (!o) return '';
  const doc = o.office ? `✓ ${esc(o.office.name)}${o.office.version ? ` ${esc(o.office.version)}` : ''} ${o.office.where === 'own' ? '(Bob\'s own copy)' : '(found on this replicant matrix)'}` : '✗ No LibreOffice or OpenOffice found: documents, spreadsheets and slides need one. <button type="button" data-hgetengine="libreoffice">Get LibreOffice (about 350 MB)</button>';
  const media = o.ffmpeg ? `✓ FFmpeg ${o.ffmpeg.where === 'own' ? '(Bob\'s own copy)' : '(found on this replicant matrix)'}` : '✗ No FFmpeg: sound, video and WebP pictures need it. <button type="button" data-hgetengine="ffmpeg">Get FFmpeg (about 100 MB)</button>';
  return `<div class="hands-office muted${on ? '' : ' dim'}"><strong>Office helpers</strong><br>${doc}<br>${media}<br>${o.pictures === 'built in' ? `✓ Pictures (PNG, JPG, BMP, GIF, TIFF): built into ${/Mac/.test(navigator.userAgent) ? 'macOS' : 'Windows'}` : ''}</div>`;
}

// Settings, Hands: under the Browser hand (src/hands-browser.js) and the Apps hand: the eyes check, and forgetting
// what Bob's own browser window knows.
function browserHtml(bw, s, on) {
  if (!bw) return '';
  const eyes = bw.eyes ? `✓ Eyes brain: ${esc(bw.eyes)}` : '✗ No eyes brain in its slot: Settings, Brains, "Seeing pictures", any vision brain. Until then Bob can\'t check his work by looking.';
  return `<div class="hands-browser muted${on ? '' : ' dim'}"><strong>Bob's browser and eyes</strong><br>
    ${bw.available ? '✓ Bob\'s own browser window is here (a window titled "Bob is browsing"; separate from your browser and its sign-ins).' : '✗ Bob\'s browser window only exists in Bob\'s app window, so it\'s not here when Bob runs in a browser tab or as a background service.'}
    <button type="button" data-hbrowserforget ${bw.available ? '' : 'disabled'}>Forget what Bob's browser knows</button><br>
    <label class="switch small"><input type="checkbox" data-heyes ${s.eyesCheck !== false ? 'checked' : ''}><span><strong>Bob checks his work with his eyes</strong><br><span class="muted">After a step in an app or his browser that says what should happen, Bob takes a picture of the window and asks his eyes brain whether it did. About a second a step. ${eyes}</span></span></label></div>`;
}

// ---- Approval cards (from the brain's 'approval' event when it has a plan or a command) ----
// Returns the card, or null if this isn't a Hands card (then the ordinary card is used).
export function handsApproval(ev, { add, answer }) {
  if (ev.newTool) return newToolCard(ev, { add, answer });
  if (!ev.plan && !ev.command) return null;
  const all = (ev.allowAll ? '<button type="button" class="all big">Allow the rest of this job</button>' : '') + (ev.today ? '<button type="button" class="today big" title="This exact command, in this folder, runs without a card until midnight">Allow this here for today</button>' : ''); // item 12
  let body = '';
  if (ev.plan) {
    const ok = ev.plan.filter((r) => !r.blocked);
    body = `<div class="hands-plan"><table><thead><tr><th><input type="checkbox" class="tick-all" aria-label="Tick all" ${ok.length ? 'checked' : 'disabled'}></th><th>What</th><th>From</th><th>To</th></tr></thead><tbody>
      ${ev.plan.map((r) => `<tr class="${r.blocked ? 'blocked' : ''}"><td><input type="checkbox" data-row="${esc(r.id)}" ${r.blocked ? 'disabled' : 'checked'} aria-label="Row ${esc(r.id)}"></td>
        <td>${esc(OPS[r.op] || r.op)}${r.note ? `<br><span class="muted">${esc(r.note)}</span>` : ''}</td><td class="path">${esc(r.from)}</td>
        <td class="path">${esc(r.to)}${r.blocked ? `<br><span class="why">✗ ${esc(r.blocked)}</span>` : ''}</td></tr>`).join('')}
      </tbody></table></div>`;
  } else if (ev.pack) {
    // Tool packs from other people (src/toolpacks.js): who made it, the exact inputs under Show details, always asks.
    body = `<p class="muted">${esc(ev.where || '')}. Made by someone else, not by Bob.</p><details><summary>Show details</summary><pre class="cmd"><code>${esc(ev.command)}</code></pre></details><p class="warn-text">Tools from packs always ask.</p>`;
  } else if (ev.mcp) {
    // Connected apps: plain words in the first line; code a tool would run is shown as it is; the exact call under Show details.
    body = `${ev.mcp.code ? `<pre class="cmd"><code>${esc(ev.mcp.code)}</code></pre>` : ''}<details><summary>Show details</summary><pre class="cmd"><code>${esc(ev.command)}</code></pre></details><p class="muted">${esc(ev.where || '')}</p>${ev.mcp.always ? '<p class="warn-text">This one always asks.</p>' : ''}`;
  } else {
    body = `<pre class="cmd"><code>${esc(ev.command)}</code></pre><p class="muted">In ${esc(ev.cwd || '')}</p>`;
  }
  const card = add('approval hands-card', `<p><strong>Bob wants to:</strong> ${esc(ev.text)}</p>${body}
    <div class="row"><button type="button" class="yes big">${ev.plan ? 'Allow ticked' : esc(ev.button || 'Run it')}</button>${all}<button type="button" class="no big">Deny</button></div>`);
  const rows = () => [...card.querySelectorAll('input[data-row]')].filter((i) => i.checked).map((i) => i.dataset.row);
  const tickAll = card.querySelector('.tick-all');
  if (tickAll) {
    tickAll.onchange = () => { for (const i of card.querySelectorAll('input[data-row]:not(:disabled)')) i.checked = tickAll.checked; count(); };
    card.querySelector('tbody').onchange = () => count();
  }
  const yes = card.querySelector('.yes');
  function count() { if (ev.plan) { const n = rows().length; yes.textContent = n ? `Allow ticked (${n})` : 'Nothing ticked'; yes.disabled = !n; } }
  count();
  const go = (allow) => {
    const picked = ev.plan ? rows() : undefined;
    card.querySelector('.row').outerHTML = `<div class="done">${allow === 'today' ? 'Allowed here for today' : allow === 'all' ? 'Allowed for the rest of this job' : allow ? (ev.plan ? `Allowed ${picked.length} of ${ev.plan.length}` : 'Allowed') : 'Denied'}</div>`;
    for (const i of card.querySelectorAll('input')) i.disabled = true;
    answer(allow, picked);
  };
  yes.onclick = () => go(true);
  card.querySelector('.no').onclick = () => go(false);
  if (ev.allowAll) card.querySelector('.all').onclick = () => go('all');
  if (ev.today) card.querySelector('.today').onclick = () => go('today');
  return card;
}

// ---- A tool Bob made, before it's added (1.5.48, src/selftools.js): what it does, what it can touch, the test,
// the reviewer's verdict and the code. Two buttons, no "rest of this job".
function newToolCard(ev, { add, answer }) {
  const t = ev.newTool;
  const li = (xs, none) => (xs?.length ? xs.map((x) => `<li>${esc(x)}</li>`).join('') : `<li class="muted">${esc(none)}</li>`);
  const whole = (xs) => (xs || []).map((f) => `${f} (the whole folder)`);
  // No gaps from the line breaks below (chat bubbles keep white space).
  const card = add('approval hands-card newtool-card', (`<p><strong>Bob made a tool and wants to ${t.replaces ? 'replace his old one' : 'add it'}:</strong>&nbsp;<code>${esc(t.name)}</code></p>
    <p>${esc(t.what)}</p>
    <table class="newtool"><tbody>
      <tr><th>Inputs</th><td><ul>${li(t.inputs, 'None')}</ul></td></tr>
      <tr><th>Can read</th><td><ul>${li(whole(t.reads), 'Only its own folder')}</ul></td></tr>
      <tr><th>Can change</th><td><ul>${li(whole(t.writes), 'Nothing outside its own folder')}</ul></td></tr>
      <tr><th>Internet</th><td>${esc(t.internet)}</td></tr>
      <tr><th>Downloads</th><td><ul>${li((t.downloads || []).map((d) => `${d.file}, ${d.size}, from ${d.url} (checked against its checksum)`), 'None')}</ul></td></tr>
      <tr><th>Test</th><td>${esc(t.test)}</td></tr>
      <tr><th>Review${t.reviewer ? ` (${esc(t.reviewer)})` : ''}</th><td><pre class="review">${esc(t.review)}</pre></td></tr>
    </tbody></table>
    <details><summary>Show code</summary><pre class="cmd"><code>${esc(t.code)}</code></pre>${t.testRaw ? `<pre class="cmd"><code>${esc(t.testRaw)}</code></pre>` : ''}</details>
    <p class="muted">It runs in a sandbox that blocks other programs and anything not listed here. If its files change later, Bob turns it off until it's checked again.</p>
    <div class="row"><button type="button" class="yes big">${esc(ev.button || 'Add tool')}</button><button type="button" class="no big">Not now (the draft is thrown away)</button></div>`).replace(/>\s+</g, '><'));
  const go = (allow) => { card.querySelector('.row').outerHTML = `<div class="done">${allow ? (t.replaces ? 'Replaced' : 'Added') : 'Not added'}</div>`; answer(allow); };
  card.querySelector('.yes').onclick = () => go(true);
  card.querySelector('.no').onclick = () => go(false);
  return card;
}

// Settings, Hands: the tools Bob made. Each can be turned off, its code shown, or removed. 1.5.144: Remove puts it on
// the Recently deleted shelf (Settings, 🧰 Tools and how-tos) for 30 days, same as Delete there.
const TOOL_STATE = { on: '', off: 'turned off', changed: 'off: its files changed since you OK\'d it', missing: 'its folder is gone' };
// Sort and rename (src/sort-library.js): the naming rule for each kind of file. Always drawn, saved while
// the Hand is off (settings rule 14). "/" in a pattern makes folders; a rule can send its files to its own folder.
const WHEN = { '': 'Any of these files', episode: 'Only TV episodes (S01E02)', notEpisode: 'Not TV episodes' };
function sortHtml(v, s) {
  const rules = s.sortRules || [];
  const ex = v.sort?.examples || {};
  const tokens = Object.entries(v.sort?.tokens || {}).map(([k, w]) => `<code>{${esc(k)}}</code> ${esc(w)}`).join(', ');
  return `<div class="hands-sort"><h4 class="ssub">Sort and rename: naming rules</h4>
    <p class="muted">One rule per kind of file. "/" makes folders. Leave "Send to" empty to sort in place; fill it to move that kind there (say, from Downloads into your Music folder).</p>
    ${rules.map((r, i) => `<fieldset class="sort-rule" data-srule="${i}" data-id="${esc(r.id)}"><legend><label class="switch small"><input type="checkbox" data-sr="on" ${r.on ? 'checked' : ''}><span><input type="text" data-sr="label" value="${esc(r.label)}" aria-label="Rule name" size="18"></span></label></legend>
      <label class="pick"><span>File types</span><input type="text" data-sr="exts" value="${esc(r.exts.join(', '))}" placeholder=".mp3, .flac"></label>
      <label class="pick"><span>Which</span><select data-sr="when">${Object.entries(WHEN).map(([k, w]) => `<option value="${k}" ${r.when === k ? 'selected' : ''}>${w}</option>`).join('')}</select></label>
      <label class="pick"><span>New name</span><input type="text" data-sr="pattern" value="${esc(r.pattern)}" placeholder="{artist}/{album}/{track} {title}"></label>
      <label class="pick"><span>Send to</span><input type="text" data-sr="dest" value="${esc(r.dest)}" placeholder="Sort in place"></label>
      ${ex[r.id] ? `<p class="muted">Example: <code>${esc(ex[r.id])}</code></p>` : ''}
      <button type="button" class="link" data-hsortdel="${i}">Remove this rule</button></fieldset>`).join('')}
    <div class="row"><button type="button" data-hsortsave>Save rules</button><button type="button" data-hsortadd>Add a rule</button><button type="button" class="link" data-hsortreset>Back to the starting rules</button></div>
    <details class="more"><summary>Words you can use in a name</summary><p class="muted">${tokens}. Numbers get two digits (03); <code>{n:3}</code> gives three. Anything a file doesn't say is left out, or "Unknown artist" and "Unknown album".</p></details>
    <p class="muted">Send-to folders must be in the folders ticked below.</p></div>`;
}
const readRules = (box) => [...box.querySelectorAll('.sort-rule')].map((f) => {
  const val = (k) => f.querySelector(`[data-sr="${k}"]`);
  return { id: f.dataset.id || '', label: val('label').value, on: val('on').checked, exts: val('exts').value.split(/[,\s]+/).filter(Boolean), when: val('when').value, pattern: val('pattern').value, dest: val('dest').value.trim() };
}).map((r, i) => ({ ...r, id: r.id || (r.label || 'rule').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 24) || `rule${i + 1}` }));

function selfToolsHtml(st, on) {
  if (!st) return '';
  const rows = st.tools.map((t) => `<li class="mytool"><label class="switch small"><input type="checkbox" data-hmytool="${esc(t.name)}" ${t.state === 'on' ? 'checked' : ''} ${t.state === 'changed' || t.state === 'missing' ? 'disabled' : ''}><span><strong>${esc(t.name)}</strong> ${TOOL_STATE[t.state] ? `<span class="warn-text">${esc(TOOL_STATE[t.state])}</span>` : ''}<br><span class="muted">${esc(t.what)}</span><br><span class="muted">Can change: ${esc(t.writes.join('; ') || 'nothing outside its folder')}. Internet: ${t.internet ? 'yes' : 'no'}. Made ${esc(when(t.at))}${t.lastUsed ? `, last used ${esc(when(t.lastUsed))}` : ', not used yet'}.</span></span></label>
      <div class="row"><button type="button" data-hmytoolcode="${esc(t.name)}">Show code</button><button type="button" data-hmytooldel="${esc(t.name)}" aria-label="Remove ${esc(t.name)}">Remove</button></div><pre class="cmd mytool-code" hidden></pre></li>`).join('');
  return `<div class="hands-mytools${on ? '' : ' dim'}"><strong>Tools Bob made</strong> <span class="muted">${st.tools.length} of ${st.max}</span>
    ${st.tools.length ? `<ul>${rows}</ul>` : '<p class="muted">None yet. With "Make his own tools" on, Bob makes one when none of his tools fits a job, and shows you a card first.</p>'}
    <p class="muted">${st.netGuard ? 'Tools without internet on their card are cut off from it.' : 'This replicant matrix can\'t cut one program off the internet without administrator rights, so the code is checked for it instead. That check isn\'t airtight.'}</p>
</div>`;
}
// 1.5.117: the sandbox check sits under Checks, with the self-test.
function sandboxRow(st) {
  if (!st) return '';
  const sb = st.sandbox ? (st.sandbox.ok ? `Sandbox holds ✓ <span class="muted">checked ${esc(when(st.sandbox.at || Date.now()))}</span>` : `<span class="warn-text">Making and using tools is refused: the sandbox didn't hold on this replicant matrix (${esc(st.sandbox.why)}).</span>`) : '<span class="muted">Sandbox not checked yet.</span>';
  return `<div class="hands-sandbox"><strong>Sandbox</strong> <span class="muted">The locked room where tools Bob made run. This checks it still holds.</span>
    <div class="row"><button type="button" data-hsandbox>Check the sandbox</button> <span>${sb}</span></div></div>`;
}

// Settings, Hands: Tool packs from other people (src/toolpacks.js). Each pack has its own switch (off when added),
// what it adds, Show code for each tool, and Remove. Adding: the full path of a folder or .zip on this replicant matrix.
// Always drawn (SETTINGS-STYLE rule 14); a pack switched on here only works once the Hand above is on too.
const PACK_STATE = { on: '', off: '', changed: 'off: its files changed since you added it', missing: 'its folder is gone' };
function packsHtml(m, on) {
  if (!m) return '';
  const toolRow = (pk, t) => `<li><code>${esc(t.name)}</code>: ${esc(t.what)} <span class="muted">${t.files === 'change' ? 'Can change the files you give it.' : t.files === 'read' ? 'Can read the files you give it.' : 'Can\'t see your files.'} Internet: ${t.internet ? 'yes' : 'no'}.</span> <button type="button" data-hpackcode="${esc(pk.id)}" data-tool="${esc(t.name)}">Show code</button><pre class="cmd pack-code" hidden></pre></li>`;
  const rows = m.packs.map((pk) => `<li class="pack"><label class="switch small"><input type="checkbox" data-hpack="${esc(pk.id)}" ${pk.state === 'on' ? 'checked' : ''} ${pk.state === 'changed' || pk.state === 'missing' ? 'disabled' : ''} aria-label="${esc(pk.name)} on"><span><strong>${esc(pk.name)}</strong> <span class="muted">${esc(pk.version)}, by ${esc(pk.by)}</span> ${PACK_STATE[pk.state] ? `<span class="warn-text">${esc(PACK_STATE[pk.state])}</span>` : ''}<br><span class="muted">${esc(pk.what)}${pk.link ? ` ${esc(pk.link)}` : ''}</span><br><span class="muted">Added ${esc(when(pk.at))}${pk.lastUsed ? `, last used ${esc(when(pk.lastUsed))}` : ', not used yet'}.</span></span></label>
      ${pk.tools.length ? `<ul class="pack-tools">${pk.tools.map((t) => toolRow(pk, t)).join('')}</ul>` : ''}
      ${pk.jobs.length ? `<ul class="pack-jobs muted">${pk.jobs.map((j) => `<li>Job: <strong>${esc(j.name)}</strong> (${j.steps.length} step${j.steps.length === 1 ? '' : 's'})</li>`).join('')}</ul>` : ''}
      <div class="row"><button type="button" data-hpackdel="${esc(pk.id)}" aria-label="Remove ${esc(pk.name)}">Remove</button></div></li>`).join('');
  return `<div class="hands-packs${on ? '' : ' dim'}"><strong>Tool packs</strong> <span class="muted">${m.packs.length} of ${m.max}</span>
    <p class="muted">Tools and jobs other people made for Bob. Each pack comes in switched off. Its tools run in the sandbox, see only the files on their card, and ask you every time.${on ? '' : ' They work once the Tool packs from other people Hand above is on.'}</p>
    ${m.packs.length ? `<ul>${rows}</ul>` : '<p class="muted">None yet.</p>'}
    <div class="row"><input type="text" data-hnewpack placeholder="Add a pack: C:\\Users\\you\\Downloads\\word-tools.zip" aria-label="Full path of a tool pack folder or .zip" style="flex:1"><button type="button" data-haddpack>Add pack</button></div>
    <p class="muted">Only add packs from people you trust. Bob checks the code first and refuses programs, hidden code and anything that reaches the internet unless the pack says so, but he can't tell whether a tool does what it says.</p>
    <ul class="pack-problems warn-text" hidden></ul></div>`;
}

// Settings, Hands: Connected apps (MCP, src/mcp.js). Each app has its own switch (off when added), a Check button
// (reaches it once and lists its tools), and Remove. Adding: fill in for Blender or Unreal, type it in, or paste the
// setup block from the add-on's instructions.
function mcpHtml(m, on) {
  if (!m) return '';
  const rows = m.servers.map((s) => `<li class="mcp-app"><label class="switch small"><input type="checkbox" data-hmcp="${esc(s.id)}" ${s.on ? 'checked' : ''} aria-label="${esc(s.name)} on"><span><strong>${esc(s.name)}</strong> <span class="muted">On</span>${s.running ? ' <span class="tag">running</span>' : ''}<br>
      <span class="muted mcp-starts">${s.url ? `Address: ${esc(s.url)}` : `Starts: <code>${esc([s.cmd, ...s.args].join(' '))}</code>${s.cwd ? ` in ${esc(s.cwd)}` : ''}`}${s.env.length ? `. Its settings: ${esc(s.env.join(', '))}` : ''}</span><br>
      <span class="muted">${s.error ? `<span class="warn-text">Last check: ${esc(s.error)}</span>` : s.checked ? `Last check: ${s.tools.length} tool${s.tools.length === 1 ? '' : 's'}, ${esc(when(s.checked))}` : 'Not checked yet.'}</span>${s.problem ? `<br><span class="warn-text">Bob won't start it: ${esc(s.problem)}</span>` : ''}${/^uvx?(\.exe)?$/i.test(s.cmd) && !m.uv ? '<br><span class="warn-text">It needs uv, which isn\'t on this replicant matrix yet.</span> <button type="button" data-hgetengine="uv">Get uv for me</button>' : ''}</span></label>
      <div class="row"><button type="button" data-hmcpcheck="${esc(s.id)}">Check</button>${s.tools.length ? `<button type="button" data-hmcptools="${esc(s.id)}">Show tools</button>` : ''}<button type="button" data-hmcpdel="${esc(s.id)}">Remove</button></div>
      <ul class="mcp-tools muted" hidden>${s.tools.map((t) => `<li><code>${esc(t.name)}</code>${t.readOnly ? ' (only looks)' : t.code ? ' <span class="warn-text">(runs code: can change anything in the app)</span>' : t.risky ? ' <span class="warn-text">(can delete or overwrite)</span>' : ''}: ${esc(t.what)}</li>`).join('')}</ul></li>`).join('');
  return `<div class="hands-mcp${on ? '' : ' dim'}"><strong>Connected apps</strong>
    <p class="muted">Apps with an MCP add-on can offer Bob their tools. Each app here starts switched off. Bob only starts or reaches one when a job needs it, and lets it go after ${m.idleMin} minutes unused.${on ? '' : ' Turn on the Connected apps (MCP) Hand above to use these.'}</p>
    ${m.servers.length ? `<ul>${rows}</ul>` : '<p class="muted">None yet.</p>'}
    ${on ? `<details class="more"><summary>More</summary>    <details class="mcp-add"><summary>Add a connected app</summary>
      <div class="row"><button type="button" data-hmcppreset="blender">Fill in for Blender</button><button type="button" data-hmcppreset="unreal">Fill in for Unreal Engine</button></div>
      <p class="muted mcp-presetnote"></p>${m.uv ? '' : '<p class="muted mcp-uv" hidden>uv isn\'t on this replicant matrix yet. <button type="button" data-hgetengine="uv">Get uv for me</button></p>'}
      <label class="pick"><span>Name</span><input data-hm="name" placeholder="Blender"></label>
      <label class="pick"><span>Program to start</span><input data-hm="cmd" placeholder="uvx"></label>
      <label class="pick"><span>Arguments (one per line)</span><textarea data-hm="args" rows="2" placeholder="blender-mcp"></textarea></label>
      <label class="pick"><span>Or its address</span><input data-hm="url" placeholder="http://127.0.0.1:8000/mcp"></label>
      <p class="muted">Fill in a program or an address, not both. Your add-on's instructions say which.</p>
      <button type="button" data-hmcpadd>Add app</button></details>
    <details class="mcp-paste"><summary>Paste a setup from another app</summary>
      <p class="muted">Add-on instructions, and apps like Claude Desktop, Cline or OpenCode, keep these in a block called "mcpServers". Paste the whole block. Every app in it comes in switched off.</p>
      <textarea data-hmcppaste rows="5" spellcheck="false" placeholder='{ "mcpServers": { "blender": { "command": "uvx", "args": ["blender-mcp"] } } }' style="width:100%"></textarea>
      <button type="button" data-hmcpimport>Add these</button></details></details>` : ''}</div>`;
}

// ---- One card with every OK a job needs (1.5.42, src/together.js) ----
// Each step has its own tick box (and its own rows to tick, for files), so the person can see the whole job and
// allow all of it, some of it, or none. Returns the card, or null if this isn't one.
const lower = (t) => (t && !/^[A-Z]{2}/.test(t) ? t[0].toLowerCase() + t.slice(1) : t);
// A step's details on a card (the exact command, the files to tick, the change), shared with the plan card (plan-card.js).
export function stepBody(it) {
    let body = '';
    if (it.later) body = `${it.details ? `<pre class="cmd"><code>${esc(it.details)}</code></pre>` : ''}<p class="muted">Bob can't check this one until the steps before it are done (${esc(lower(String(it.later).replace(/[.\s]+$/, '')))}). He checks again when he gets there, and if anything doesn't match, he asks you again.</p>`;
    else if (it.plan) body = `<div class="hands-plan"><table><thead><tr><th></th><th>What</th><th>From</th><th>To</th></tr></thead><tbody>
      ${it.plan.map((r) => `<tr class="${r.blocked ? 'blocked' : 'tap'}"><td><input type="checkbox" data-step="${it.n}" data-row="${esc(r.id)}" ${r.blocked ? 'disabled' : 'checked'} aria-label="Step ${it.n}, row ${esc(r.id)}"></td>
        <td>${esc(OPS[r.op] || r.op)}${r.note ? `<br><span class="muted">${esc(r.note)}</span>` : ''}</td><td class="path">${esc(r.from)}</td>
        <td class="path">${esc(r.to)}${r.blocked ? `<br><span class="why">✗ ${esc(r.blocked)}</span>` : ''}</td></tr>`).join('')}
      </tbody></table></div>`;
    else if (it.command) body = `<pre class="cmd"><code>${esc(it.command)}</code></pre><p class="muted">In ${esc(it.cwd || '')}</p>`;
    else if (it.diff) body = `<pre class="diff"><code>${esc(it.diff)}</code></pre>`;
    return body;
}
export function togetherApproval(ev, { add, answer }) {
  if (!Array.isArray(ev.together) || ev.planCard) return null;
  const step = (it) => {
    const body = stepBody(it);
    return `<li class="together-step"><label class="together-head"><input type="checkbox" class="pick" data-n="${it.n}" checked aria-label="Allow step ${it.n}"><span><strong>${it.n}.</strong> ${esc(it.text)}</span></label>${body}</li>`;
  };
  const card = add('approval hands-card together', `<p><strong>Bob wants to do ${ev.together.length} things, all for one job.</strong> ${esc(ev.text)}</p>
    <ol class="together-list">${ev.together.map(step).join('')}</ol>
    <p class="muted">Untick anything you don't want. Nothing starts until you answer, and anything that isn't on this list still asks you on its own.</p>
    <div class="row"><button type="button" class="yes big all-of-it">Allow all</button><button type="button" class="yes big ticked" hidden>Allow ticked</button><button type="button" class="no big">Deny all</button></div>`);
  const picks = () => [...card.querySelectorAll('input.pick')];
  const rowsOf = (n) => [...card.querySelectorAll(`input[data-step="${n}"]`)];
  const chosen = () => picks().filter((p) => p.checked).map((p) => {
    const n = Number(p.dataset.n);
    const rows = rowsOf(n);
    return rows.length ? { n, rows: rows.filter((r) => r.checked).map((r) => r.dataset.row) } : { n };
  }).filter((c) => !c.rows || c.rows.length);
  const yes = card.querySelector('.all-of-it'), ticked = card.querySelector('.ticked');
  // A step with no rows ticked is the same as unticking the step, and the other way round.
  const sync = (e) => {
    const t = e?.target;
    if (t?.classList.contains('pick')) { for (const r of rowsOf(t.dataset.n)) if (!r.disabled) r.checked = t.checked; }
    else if (t?.dataset.step) { const p = card.querySelector(`input.pick[data-n="${t.dataset.step}"]`); if (p) p.checked = rowsOf(t.dataset.step).some((r) => r.checked); }
    const all = picks().every((p) => p.checked) && card.querySelectorAll('input[data-row]:not(:disabled):not(:checked)').length === 0;
    const n = chosen().length;
    yes.hidden = !all;
    ticked.hidden = all;
    ticked.disabled = !n;
    ticked.textContent = n ? `Allow ticked (${n} of ${ev.together.length})` : 'Nothing ticked';
  };
  card.querySelector('.together-list').addEventListener('change', sync);
  // Big targets (remote desktop): a click anywhere on a file row ticks it, like its box.
  card.querySelector('.together-list').addEventListener('click', (e) => {
    const tr = e.target.closest('tr.tap');
    if (!tr || e.target.closest('input')) return;
    const box = tr.querySelector('input[data-row]');
    if (!box || box.disabled) return;
    box.checked = !box.checked;
    box.dispatchEvent(new Event('change', { bubbles: true }));
  });
  const go = (allow, items) => {
    card.querySelector('.row').outerHTML = `<div class="done">${allow ? (items ? `Allowed ${items.length} of ${ev.together.length}` : `Allowed all ${ev.together.length}`) : 'Denied all'}</div>`;
    for (const i of card.querySelectorAll('input')) i.disabled = true;
    answer(allow, items);
  };
  yes.onclick = () => go(true, null);
  ticked.onclick = () => go(true, chosen());
  card.querySelector('.no').onclick = () => go(false, null);
  return card;
}

// ---- Live output, Stop, files done ----
const runs = new Map(); // runId -> card
export function onHandsEvent(ev, { add, scrollDown, note }) {
  if (ev.type === 'run-start') {
    const card = add('hands-run', `<div class="head"><strong>${ev.recipe ? `Recipe: ${esc(ev.recipe)}` : 'Running'}</strong> <code>${esc(ev.line)}</code></div>
      <pre class="out" aria-live="polite"></pre><div class="row"><button type="button" class="stop big">Stop</button><span class="state muted">Running…</span></div>`);
    card.querySelector('.stop').onclick = async (e) => { e.target.disabled = true; e.target.textContent = 'Stopping…'; try { await post('/api/hands/stop', { runId: ev.runId }); } catch {} };
    runs.set(ev.runId, card);
    showStopAll(true);
    return true;
  }
  if (ev.type === 'run-output') {
    const out = runs.get(ev.runId)?.querySelector('.out');
    if (out) {
      const near = out.scrollHeight - out.scrollTop - out.clientHeight < 40;
      out.textContent = (out.textContent + ev.text).slice(-60000);
      if (near) out.scrollTop = out.scrollHeight;
      scrollDown?.();
    }
    return true;
  }
  if (ev.type === 'run-end') {
    const card = runs.get(ev.runId);
    runs.delete(ev.runId);
    if (card) {
      const ok = ev.code === 0 && !ev.killed;
      card.classList.add(ok ? 'ok' : 'bad');
      card.querySelector('.stop')?.remove();
      card.querySelector('.state').textContent = ev.why ? `Didn't start: ${ev.why}` : ev.killed === 'stopped' ? 'Stopped.' : ev.killed === 'timeout' ? 'Stopped: it ran past the time limit.' : `Finished${ok ? ' ✓' : ` with exit code ${ev.code}`}`;
    }
    return true;
  }
  if (ev.type === 'files-done') {
    if (!ev.job) return true;
    const el = add('hands-done', `<span>${esc(ev.job.label)}: ${ev.done} done${ev.failed?.length ? `, ${ev.failed.length} not done` : ''}.</span><button type="button" class="big">Undo</button>`);
    el.querySelector('button').onclick = async (e) => {
      e.target.disabled = true;
      try { const r = await post('/api/hands/undo', { id: ev.job.id }); e.target.outerHTML = `<span class="muted">Undone.${r.manual?.length ? ` ${r.manual.length} thing${r.manual.length === 1 ? ' is' : 's are'} in the Recycle Bin: restore from there.` : ''}${r.failed?.length ? ` Couldn't undo: ${esc(r.failed.join('; '))}` : ''}</span>`; }
      catch (err) { e.target.disabled = false; note?.(err.message, 'error'); }
    };
    return true;
  }
  // Working without asking: no card, just a plain line of what he did (it's in the logbook too).
  if (ev.type === 'allowed-earlier') { add('hands-done auto', `<span>Allowed on the card above: ${esc(ev.text)}</span>`); return true; }
  if (ev.type === 'auto-approved') { add('hands-done auto', `<span>Did without asking: ${esc(ev.text)}${ev.command && ev.command !== ev.text ? ` <code>${esc(ev.command)}</code>` : ''}</span>`); return true; }
  if (ev.type === 'apps-stopped') { add('hands-done', `<span>You ${esc(ev.why || 'took over')}, so Bob stopped using apps for this job.</span>`); return true; }
  if (ev.type === 'hands') { showStopAll(ev.settings?.enabled); return true; }
  return false;
}

// 1.5.3: the "Stop everything" button above Send is gone; the ✋ Hands button on the chat page is the one kill switch.
// Turning Hands off for good is the master switch in Settings, Hands. showStopAll is kept as a no-op for the callers below.
function showStopAll() {}

// ---- Settings: the Hands section ----
// Schedules: what's set up, a switch each, Remove, and the separate opt-in Windows task.
function schedHtml(sched, s) {
  if (!sched) return '';
  const live = s.enabled && s.schedules?.on;
  return `<div class="hands-sched"><strong>Schedules</strong>${live ? '' : ' <span class="muted">(the Schedules hand is off, so none of these run)</span>'}
    ${sched.list.length ? `<ul>${sched.list.map((e) => `<li><label class="switch small"><input type="checkbox" data-hsched="${esc(e.id)}" ${e.enabled ? 'checked' : ''}><span><strong>${esc(e.name)}</strong> <span class="muted">${esc(e.says)}${e.enabled && e.nextDue ? ` · next ${esc(new Date(e.nextDue).toLocaleString())}` : ''}${e.lastResult ? ` · last run ${e.lastResult.ok ? 'started' : 'did not run'}` : ''}</span><br><span class="muted">${esc(e.job?.task || '')}</span></span></label> <button type="button" class="link" data-hscheddel="${esc(e.id)}">Remove</button></li>`).join('')}</ul>` : '<p class="muted">None yet. Ask Bob, for example "every Monday at 9, tidy my Downloads". He shows you the schedule first.</p>'}
    ${sched.platform === 'win32' ? `<label class="switch small"><input type="checkbox" data-hschedtask ${sched.windowsTask ? 'checked' : ''}><span>Wake Bob for schedules when he's closed <span class="muted">(adds a "Bob schedules" task to Windows Task Scheduler, just for you, no admin. Off by default.)</span></span></label>` : ''}
  </div>`;
}

export function handsSettingsHtml() {
  return '<div class="hands-box"><span class="tag">off unless you turn them on</span><p class="muted">Loading…</p></div>';
}

export async function mountHandsSettings(box) {
  if (!box) return;
  let v;
  const draw = () => {
    const s = v.settings;
    const folders = [...new Set([...(v.candidates || []), ...s.folders])];
    box.innerHTML = `<span class="tag">off unless you turn them on</span>
      <p class="muted">Hands let Bob do things on this replicant matrix, not just talk about them. Each one is off until you switch it on. Even then he shows you exactly what he'll do (every file, or the exact command) and waits for your click every time, unless you turn on "Let Bob work without asking" below. "Allow the rest of this job" only covers the same kind of thing until that job ends. The hard limits below are all on to start with. He never changes his own code or settings. Everything goes in the logbook.</p>
      <label class="switch"><input type="checkbox" data-hmaster ${s.enabled ? 'checked' : ''}><span><strong>Let Bob use Hands</strong> ${tip('The master switch. Off turns every Hand below off.', 'Let Bob use Hands')}${s.enabled && s.held ? '<br><span class="warn-text">Stopped right now with the Hands switch on the chat page. Click it there to carry on.</span>' : ''}</span></label>
      <label class="switch"><input type="checkbox" data-htoday ${s.today ? 'checked' : ''}><span><strong>Offer "Allow this here for today"</strong> <span class="tag">off unless you turn it on</span><br><span class="muted">Command cards get one more button. Pressed, that exact command in that folder runs without a card until midnight. A different command, or anything right after Bob read a web page or file, still asks.</span></span></label>
            <div class="hands-free${s.free ? ' on' : ''}"><label class="switch"><input type="checkbox" data-hfree ${s.free ? 'checked' : ''}><span><strong>Let Bob work without asking</strong> <span class="tag">off unless you turn it on</span><br><span class="muted">No approval cards: he just does the job and tells you what he did. The hard limits below still apply, every action is still in the chat and the logbook, and the ✋ Hands button on the chat page stops him at once. Cloud helpers still ask, because they cost money. Scheduled jobs also run by themselves.</span>${s.free && s.enabled ? '<br><span class="warn-text">On: Bob is working without asking.</span>' : ''}</span></label>${bannerHidden() ? '<button type="button" class="link" data-hbannerback>Show the banner again</button>' : ''}</div>
      ${v.hands.map((h) => `<label class="switch"><input type="checkbox" data-hand="${esc(h.id)}" ${s[h.id]?.on ? 'checked' : ''}><span><strong>${esc(h.label)}</strong> ${tip(esc(h.what || ''), h.label)}</span></label>`).join('')}
      ${officeLine(v.office, s.enabled && s.office?.on)}
      ${securityLine(s.enabled && s.security?.on)}
      ${browserHtml(v.browser, s, s.enabled && s.browser?.on)}
      ${selfToolsHtml(v.selfTools, s.enabled && s.maker?.on)}
      ${mcpHtml(v.mcp, s.enabled && s.mcp?.on)}
      ${packsHtml(v.packs, s.enabled && s.packs?.on)}
      ${sortHtml(v, s)}
      <div class="hands-limits"><h4 class="ssub">Limits that always apply <span class="tag">all on to start with</span></h4>
        <p class="muted">These hard limits hold whether or not Bob asks first. Switch one off only if you need what it blocks.</p>
        ${(v.limits || []).map((l) => `<label class="switch small"><input type="checkbox" data-hlimit="${esc(l.id)}" ${s.limits?.[l.id] !== false ? 'checked' : ''}><span><strong>${esc(l.label)}</strong><br><span class="muted">${esc(l.on)}</span>${l.more ? `<details class="more"><summary>More</summary><span class="muted">${esc(l.more)}</span></details>` : ''}${s.limits?.[l.id] === false ? `<br><span class="warn-text">Off: ${esc(l.off)}</span>` : ''}${l.id === 'readOnly' ? readOnlyHtml(v, s) : ''}</span></label>`).join('')}
        <p class="muted">Always on, whatever you pick: Bob can't change his own code, settings or this page, never runs as administrator, stays out of terminals, admin tools, password managers and sign-in prompts, and the ✋ Hands button always stops him.</p></div>
      <div class="hands-folders"><strong>Folders the Files Hand may work in</strong>
        ${folders.length ? folders.map((f) => `<label class="switch small"><input type="checkbox" data-hfolder="${esc(f)}" ${s.folders.includes(f) ? 'checked' : ''}><span>${esc(f)}</span></label>`).join('') : '<p class="muted">No folders yet.</p>'}
        <div class="row"><input type="text" data-hnewfolder placeholder="Add a folder: C:\\Users\\you\\Pictures" aria-label="Add a folder" style="flex:1"><button type="button" data-haddfolder>Add</button></div>
        <p class="muted">Sort and rename works only in these folders too. The Office documents and converting Hand saves in these folders too (and in Bob's own Documents folder). Bob's own folders stay off-limits even inside these, and so do read-only projects and files with keys or passwords while those hard limits are on.</p></div>
      <label class="pick"><strong>Stop a command after</strong><select data-htimeout>${[1, 5, 15, 30, 60, 120].map((m) => `<option value="${m}" ${m === s.timeoutMin ? 'selected' : ''}>${m < 60 ? `${m} minute${m === 1 ? '' : 's'}` : `${m / 60} hour${m === 60 ? '' : 's'}`}</option>`).join('')}</select></label>
      <div class="hands-recipes"><strong>Recipes</strong> <span class="muted">Saved commands you can run in one click, or ask Bob for by name ("run my build recipe"). He still asks before each run, unless he's working without asking.</span>
        ${v.recipes.length ? `<ul>${v.recipes.map((r) => `<li><button type="button" class="big" data-hrun="${esc(r.name)}" ${s.enabled && s.run?.on ? '' : 'disabled'}>▶ ${esc(r.name)}</button> <code>${esc([r.cmd, ...(r.args || [])].join(' '))}</code> <span class="muted">in ${esc(r.cwd)}</span> <button type="button" class="link" data-hdelrecipe="${esc(r.name)}">Remove</button></li>`).join('')}</ul>` : ''}
        ${`<details class="more"><summary>More</summary><strong>Add a recipe</strong><div class="hands-newrecipe">
          <label class="pick"><span>Name</span><input data-hr="name" placeholder="Build my app"></label>
          <label class="pick"><span>Program</span><input data-hr="cmd" placeholder="gradlew.bat"></label>
          <label class="pick"><span>Arguments (one per line)</span><textarea data-hr="args" rows="2" placeholder="assembleDebug"></textarea></label>
          <label class="pick"><span>In folder</span><input data-hr="cwd" placeholder="C:\\Users\\you\\Projects\\app"></label>
          <button type="button" data-hsaverecipe>Save recipe</button><span class="muted hr-out"></span></div></details>`}${s.enabled && s.run?.on ? '' : '<p class="muted">Recipes run once the Run programs Hand above is on.</p>'}</div>
      ${schedHtml(sched, s)}
      <div class="hands-journal"><strong>Recent file jobs</strong>
        ${v.journal.length ? `<ul>${v.journal.map((j) => `<li>${esc(when(j.at))}: ${esc(j.label)} ${j.undone ? '<span class="muted">(undone)</span>' : `<button type="button" data-hundo="${esc(j.id)}">Undo</button>`}</li>`).join('')}</ul>` : '<p class="muted">None yet.</p>'}
        <strong>Recent commands</strong>
        ${v.runs.length ? `<ul>${v.runs.map((r) => `<li>${esc(when(r.at))}: <code>${esc(r.line)}</code> <span class="muted">${r.why ? "didn't start" : r.killed ? esc(r.killed) : `exit ${r.code}`}</span></li>`).join('')}</ul>` : '<p class="muted">None yet.</p>'}
        <p class="muted">Every action is also in the logbook (inn\\logbook.md).</p></div>
      <h4 class="ssub">Checks</h4>
      ${sandboxRow(v.selfTools)}
      <div class="hands-selftest"><strong>Self-test</strong> <span class="muted">Checks that Recycle Bin and Undo, tidying, running a program and Stop work on this replicant matrix. Uses a throwaway folder of dummy files, which is removed afterwards. Nothing of yours is touched, and no Hand needs to be on.</span>
        <div class="row"><button type="button" data-hselftest>Run the self-test</button></div>
        ${selftest ? `<ul class="selftest">${selftest.results.map((r) => `<li>${r.ok ? '✅' : '❌'} <strong>${esc(r.name)}</strong>: ${esc(r.says)}</li>`).join('')}</ul><p class="muted">${selftest.passed} of ${selftest.total} passed.${selftest.cleaned ? ' The throwaway folder is gone.' : ` Couldn't remove ${esc(selftest.folder)}.`}</p>` : ''}</div>
      <p class="muted hands-out" role="status"></p>`;
  };
  // Turning on "work without asking" asks first, in the page (no browser dialog). Turning it off never asks.
  const askFree = () => {
    const row = box.querySelector('.hands-free');
    if (!row || row.querySelector('.free-confirm')) return;
    const c = document.createElement('div');
    c.className = 'free-confirm';
    c.setAttribute('role', 'alertdialog');
    c.setAttribute('aria-label', 'Turn on Let Bob work without asking?');
    c.innerHTML = `<p><strong>Let Bob work without asking?</strong> He'll move files, run commands and use apps without showing you a card first. Scheduled jobs will also run by themselves. Hard limits still apply, and ✋ Hands stops him at any time.</p>
      <div class="row"><button type="button" class="big warn" data-hfreeyes>Turn it on</button><button type="button" class="big" data-hfreeno>Cancel</button></div>`;
    row.appendChild(c);
    c.querySelector('[data-hfreeno]').focus();
  };
  const say = (t) => { const o = box.querySelector('.hands-out'); if (o) o.textContent = t; };
  const set = async (patch, msg) => { v = await post('/api/hands/settings', patch); draw(); say(msg || 'Saved.'); showStopAll(v.settings.enabled); };
  let sched = null, selftest = null;
  const loadSched = async () => { try { sched = await (await fetch('/api/hands/schedules')).json(); } catch { sched = null; } };
  await loadSched();
  try { v = await (await fetch('/api/hands')).json(); draw(); } catch (e) { box.innerHTML = `<strong>Hands</strong><p class="muted">Couldn't load: ${esc(e.message)}</p>`; return; }

  box.addEventListener('change', async (e) => {
    const el = e.target;
    e.stopPropagation();
    try {
      if (el.dataset.sr === 'on') return await set({ sortRules: readRules(box) }, el.checked ? 'Rule on.' : 'Rule off. Bob leaves those files alone.');
      if (el.dataset.sr) return; // the other rule boxes save with Save rules
      if ('hmaster' in el.dataset) return await set({ enabled: el.checked }, el.checked ? 'Hands on. Now switch on the ones you want; he still asks every time.' : 'All Hands off.');
      if ('hfree' in el.dataset && el.checked) { el.checked = false; return askFree(); }
      if ('htoday' in el.dataset) return await set({ today: el.checked }, el.checked ? 'On. Command cards offer "Allow this here for today".' : 'Off. Every command asks again.');
      if ('hfree' in el.dataset) return await set({ free: el.checked }, el.checked ? 'On. Bob works without asking now. The hard limits still apply, and ✋ Hands on the chat page stops him.' : 'Off. Bob asks before every action again.');
      if (el.dataset.hlimit) { const l = (v.limits || []).find((x) => x.id === el.dataset.hlimit); return await set({ limits: { [el.dataset.hlimit]: el.checked } }, el.checked ? `"${l?.label}" is back on.` : `"${l?.label}" is off. ${l?.off || ''}`); }
      if (el.dataset.hand) return await set({ [el.dataset.hand]: { on: el.checked } }, el.checked ? 'On. Bob still asks before every action.' : 'Off.');
      if ('heyes' in el.dataset) { const r = await post('/api/hands/browser', { eyesCheck: el.checked }); v = r; draw(); return say(r.note); }
      if (el.dataset.hfolder) { const f = el.dataset.hfolder; return await set({ folders: el.checked ? [...v.settings.folders, f] : v.settings.folders.filter((x) => x !== f) }); }
      if ('htimeout' in el.dataset) return await set({ timeoutMin: Number(el.value) });
      if (el.dataset.hmytool) { v = await post('/api/hands/mytools', { name: el.dataset.hmytool, on: el.checked }); draw(); return say(el.checked ? 'Tool on.' : 'Tool off. Bob won\'t use it until you turn it back on.'); }
      if (el.dataset.hpack) { const r = await post('/api/hands/packs', { id: el.dataset.hpack, on: el.checked }); v = r; draw(); return say(r.note); }
      if (el.dataset.hmcp) { const r = await post('/api/hands/mcp', { id: el.dataset.hmcp, on: el.checked }); v = r; draw(); return say(r.note); }
      if (el.dataset.hsched) { sched = await post('/api/hands/schedules', { id: el.dataset.hsched, on: el.checked }); draw(); return say(el.checked ? 'Schedule on.' : 'Schedule off.'); }
      if ('hschedtask' in el.dataset) { try { sched = await post('/api/hands/schedules', { windowsTask: el.checked }); draw(); say(el.checked ? 'Added the "Bob schedules" task: Windows wakes Bob (hidden) when a schedule is due. Remove Bob takes it away too.' : 'Removed the Windows task.'); } catch (err) { el.checked = !el.checked; say(err.message); } return; }
    } catch (err) { say(err.message); }
  });
  box.addEventListener('click', async (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    e.stopPropagation();
    try {
      if ('hbannerback' in b.dataset) { setBannerHidden(null); draw(); return say('The "Bob is working without asking" banner will show again while it\'s on.'); }
      if ('hfreeyes' in b.dataset) return await set({ free: true }, 'On. Bob works without asking now. The hard limits still apply, and ✋ Hands on the chat page stops him.');
      if ('hfreeno' in b.dataset) { b.closest('.free-confirm')?.remove(); return say('Left off. Bob still asks before every action.'); }
      if ('hstopall' in b.dataset) { const r = await post('/api/hands/stop-all'); v = r; draw(); say(`Stopped ${r.stopped} thing${r.stopped === 1 ? '' : 's'}. All Hands are off.`); showStopAll(false); return; }
      if ('hrobrowse' in b.dataset) { const r = await post('/api/pick-folder', {}); const inp = box.querySelector('[data-hnewro]'); if (r.folder && inp) inp.value = r.folder; return; }
      if ('hroadd' in b.dataset) {
        const f = box.querySelector('[data-hnewro]').value.trim();
        if (!f) return;
        const before = (v.settings.readOnlyFolders || []).length;
        await set({ readOnlyFolders: [...(v.settings.readOnlyFolders || []), f] });
        say((v.settings.readOnlyFolders || []).length > before ? 'Added. Bob can read it but never change it.' : 'That isn\'t a folder that exists (like C:\\Users\\you\\Projects\\app).');
        return;
      }
      if (b.dataset.hrodel) { await set({ readOnlyFolders: (v.settings.readOnlyFolders || []).filter((f) => f !== b.dataset.hrodel) }, 'Removed. The usual Hands rules apply to it again.'); return; }
      if ('haddfolder' in b.dataset) {
        const f = box.querySelector('[data-hnewfolder]').value.trim();
        if (!f) return;
        const before = v.settings.folders.length;
        await set({ folders: [...v.settings.folders, f] });
        say(v.settings.folders.length > before ? 'Added.' : 'That isn\'t a full folder path (like C:\\Users\\you\\Pictures).');
        return;
      }
      if ('hsortsave' in b.dataset) return await set({ sortRules: readRules(box) }, 'Naming rules saved.');
      if ('hsortadd' in b.dataset) return await set({ sortRules: [...readRules(box), { label: 'New rule', on: false, exts: [], when: '', pattern: '{name}', dest: '' }] }, 'Added a rule at the bottom. It starts switched off.');
      if (b.dataset.hsortdel) return await set({ sortRules: readRules(box).filter((_, i) => String(i) !== b.dataset.hsortdel) }, 'Rule removed.');
      if ('hsortreset' in b.dataset) return await set({ sortRules: [] }, 'Back to the starting rules.');
      if ('hpwcheck' in b.dataset) return await checkPassword(box);
      if (b.dataset.hgetengine) { b.disabled = true; try { await post('/api/models/download', { id: 'engine:' + b.dataset.hgetengine }); say('Downloading. It shows in Downloads; this line turns to ✓ when it\'s ready.'); } catch (e) { b.disabled = false; say(e.message); } return; }
      if (b.dataset.hmytoolcode) { const pre = b.closest('li').querySelector('.mytool-code'); if (!pre.hidden) { pre.hidden = true; b.textContent = 'Show code'; return; } const r = await post('/api/hands/mytools', { name: b.dataset.hmytoolcode, code: true }); pre.textContent = r.code; pre.hidden = false; b.textContent = 'Hide code'; return; }
      if (b.dataset.hmytooldel) { if (b.dataset.sure !== '1') { b.dataset.sure = '1'; b.textContent = 'Click again to remove'; return; } v = await post('/api/hands/mytools', { name: b.dataset.hmytooldel, remove: true }); draw(); return say(`Removed. It waits 30 days under Recently deleted in 🧰 Tools and how-tos, where you can put it back; then its folder goes to ${sched?.platform === 'darwin' ? 'the Trash' : sched?.platform === 'linux' ? 'the trash' : 'the Recycle Bin'}.`); }
      if ('hsandbox' in b.dataset) { b.disabled = true; say('Checking the sandbox (a few seconds)…'); v = await post('/api/hands/sandbox'); draw(); return say(v.sandbox?.ok ? 'The sandbox holds.' : `The sandbox didn't hold: ${v.sandbox?.why || 'unknown'}.`); }
      if ('hbrowserforget' in b.dataset) {
        // Asks first, in the page (no browser dialog), like "work without asking".
        const row = b.closest('.hands-browser'); if (!row || row.querySelector('.free-confirm')) return;
        const c = document.createElement('div'); c.className = 'free-confirm'; c.setAttribute('role', 'alertdialog'); c.setAttribute('aria-label', "Forget everything Bob's browser knows?");
        c.innerHTML = `<p><strong>Forget everything Bob's browser knows?</strong> Its cookies, sign-ins and cache go, and sites will ask him to sign in again.</p><div class="row"><button type="button" class="big warn" data-hbrowserforgetyes>Forget it</button><button type="button" class="big" data-hbrowserforgetno>Keep it</button></div>`;
        row.appendChild(c); c.querySelector('[data-hbrowserforgetno]').focus(); return;
      }
      if ('hbrowserforgetyes' in b.dataset) { const r = await post('/api/hands/browser', { forget: true }); v = r; draw(); return say(r.note); }
      if ('hbrowserforgetno' in b.dataset) { b.closest('.free-confirm')?.remove(); return say('Kept.'); }
      if (b.dataset.hpackcode) { const pre = b.closest('li').querySelector('.pack-code'); if (!pre.hidden) { pre.hidden = true; b.textContent = 'Show code'; return; } const r = await post('/api/hands/packs', { id: b.dataset.hpackcode, tool: b.dataset.tool, code: true }); pre.textContent = r.code; pre.hidden = false; b.textContent = 'Hide code'; return; }
      if (b.dataset.hpackdel) { if (b.dataset.sure !== '1') { b.dataset.sure = '1'; b.textContent = 'Click again to remove'; return; } const r = await post('/api/hands/packs', { id: b.dataset.hpackdel, remove: true }); v = r; draw(); return say(r.note); }
      if ('haddpack' in b.dataset) {
        const f = box.querySelector('[data-hnewpack]').value.trim();
        if (!f) return say('Type the full path of the pack\'s folder or .zip file.');
        b.disabled = true; say('Checking the pack…');
        const r = await post('/api/hands/packs', { add: f }); v = r; draw();
        const ul = box.querySelector('.pack-problems');
        if (ul && r.problems?.length) { ul.innerHTML = r.problems.map((x) => `<li>${esc(x)}</li>`).join(''); ul.hidden = false; return say('That pack can\'t be added. The reasons are under Tool packs.'); }
        return say(r.note);
      }
      if (b.dataset.hmcpcheck) { b.disabled = true; say('Checking (the first time can take a minute while it gets ready)…'); const r = await post('/api/hands/mcp', { id: b.dataset.hmcpcheck, check: true }); v = r; draw(); return say(r.note); }
      if (b.dataset.hmcptools) { const ul = b.closest('li').querySelector('.mcp-tools'); ul.hidden = !ul.hidden; b.textContent = ul.hidden ? 'Show tools' : 'Hide tools'; return; }
      if (b.dataset.hmcpdel) { if (b.dataset.sure !== '1') { b.dataset.sure = '1'; b.textContent = 'Click again to remove'; return; } const r = await post('/api/hands/mcp', { id: b.dataset.hmcpdel, remove: true }); v = r; draw(); return say(r.note); }
      if (b.dataset.hmcppreset) {
        const pr = v.mcp?.presets?.[b.dataset.hmcppreset];
        if (!pr) return;
        const f = (k) => box.querySelector(`[data-hm="${k}"]`);
        f('name').value = pr.name; f('cmd').value = pr.cmd || ''; f('args').value = (pr.args || []).join('\n'); f('url').value = pr.url || '';
        box.querySelector('.mcp-presetnote').textContent = pr.note || '';
        const uv = box.querySelector('.mcp-uv');
        if (uv) uv.hidden = !pr.needsUv;
        return;
      }
      if ('hmcpadd' in b.dataset) {
        const g = (k) => box.querySelector(`[data-hm="${k}"]`).value.trim();
        if (g('cmd') && g('url')) return say('Fill in a program or an address, not both.');
        const r = await post('/api/hands/mcp', { add: { name: g('name'), cmd: g('cmd'), args: g('args') ? g('args').split(/\r?\n/).map((x) => x.trim()).filter(Boolean) : [], url: g('url') } });
        v = r; draw(); return say(r.note);
      }
      if ('hmcpimport' in b.dataset) { const r = await post('/api/hands/mcp', { paste: box.querySelector('[data-hmcppaste]').value }); v = r; draw(); return say(r.note); }
      if ('hselftest' in b.dataset) { b.disabled = true; say('Running the self-test (about 10 seconds)…'); selftest = await post('/api/hands/selftest'); draw(); say(`Self-test: ${selftest.passed} of ${selftest.total} passed.`); return; }
      if (b.dataset.hscheddel) { sched = await post('/api/hands/schedules', { remove: b.dataset.hscheddel }); draw(); say('Schedule removed.'); return; }
      if (b.dataset.hundo) { const r = await post('/api/hands/undo', { id: b.dataset.hundo }); v = r; draw(); say(`Undone.${r.manual?.length ? ` ${r.manual.length} thing(s) are in the Recycle Bin: restore from there.` : ''}${r.failed?.length ? ` Couldn't undo: ${r.failed.join('; ')}` : ''}`); return; }
      if (b.dataset.hrun) { await post('/api/hands/run-recipe', { name: b.dataset.hrun }); say('Running. The output is in the chat.'); return; }
      if (b.dataset.hdelrecipe) { const r = await post('/api/hands/recipes', { remove: b.dataset.hdelrecipe }); v.recipes = r.recipes; draw(); say('Removed.'); return; }
      if ('hsaverecipe' in b.dataset) {
        const g = (k) => box.querySelector(`[data-hr="${k}"]`).value.trim();
        const r = await post('/api/hands/recipes', { save: { name: g('name'), cmd: g('cmd'), args: g('args') ? g('args').split(/\r?\n/).map((x) => x.trim()).filter(Boolean) : [], cwd: g('cwd') } });
        v.recipes = r.recipes; draw(); say('Recipe saved.');
      }
    } catch (err) { say(err.message); }
  });
}

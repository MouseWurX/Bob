// Hands in the window: the approval cards with rows to tick or the exact command, live output with Stop,
// and the Hands section in Settings. Big buttons on purpose (remote desktop).
import { esc } from './rich.js';

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
    <span>Has a password turned up in a known breach? It's scrambled on this PC, and only the first 5 characters of the scramble are sent to Have I Been Pwned (haveibeenpwned.com) when you press Check, so the password never leaves. Nothing is saved.</span>${on ? '' : '<br><span>Turn on the Security and privacy Hand above to use this.</span>'}
    <div class="row"><input type="password" data-hpw autocomplete="off" spellcheck="false" placeholder="Type a password" aria-label="Password to check" style="flex:1" ${on ? '' : 'disabled'}><button type="button" data-hpwcheck ${on ? '' : 'disabled'}>Check</button></div>
    <span class="hpw-out" role="status"></span></div>`;
}
async function checkPassword(box) {
  const input = box.querySelector('[data-hpw]'), out = box.querySelector('.hpw-out');
  const pw = input.value;
  if (!pw) { out.textContent = 'Type a password first.'; return; }
  if (!globalThis.crypto?.subtle) { out.textContent = 'This only works in Bob\'s window on the PC itself.'; return; }
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
function officeLine(o, on) {
  if (!o) return '';
  const doc = o.office ? `✓ ${esc(o.office.name)}${o.office.version ? ` ${esc(o.office.version)}` : ''} ${o.office.where === 'own' ? '(Bob\'s own copy)' : '(found on this PC)'}` : '✗ No LibreOffice or OpenOffice found: documents, spreadsheets and slides need one. <button type="button" data-hgetengine="libreoffice">Get LibreOffice (about 350 MB)</button>';
  const media = o.ffmpeg ? `✓ FFmpeg ${o.ffmpeg.where === 'own' ? '(Bob\'s own copy)' : '(found on this PC)'}` : '✗ No FFmpeg: sound, video and WebP pictures need it. <button type="button" data-hgetengine="ffmpeg">Get FFmpeg (about 100 MB)</button>';
  return `<div class="hands-office muted${on ? '' : ' dim'}"><strong>Office helpers</strong><br>${doc}<br>${media}<br>${o.pictures === 'built in' ? '✓ Pictures (PNG, JPG, BMP, GIF, TIFF): built into Windows' : ''}</div>`;
}

// ---- Approval cards (from the brain's 'approval' event when it has a plan or a command) ----
// Returns the card, or null if this isn't a Hands card (then the ordinary card is used).
export function handsApproval(ev, { add, answer }) {
  if (!ev.plan && !ev.command) return null;
  const all = ev.allowAll ? '<button type="button" class="all big">Allow the rest of this job</button>' : '';
  let body = '';
  if (ev.plan) {
    const ok = ev.plan.filter((r) => !r.blocked);
    body = `<div class="hands-plan"><table><thead><tr><th><input type="checkbox" class="tick-all" aria-label="Tick all" ${ok.length ? 'checked' : 'disabled'}></th><th>What</th><th>From</th><th>To</th></tr></thead><tbody>
      ${ev.plan.map((r) => `<tr class="${r.blocked ? 'blocked' : ''}"><td><input type="checkbox" data-row="${esc(r.id)}" ${r.blocked ? 'disabled' : 'checked'} aria-label="Row ${esc(r.id)}"></td>
        <td>${esc(OPS[r.op] || r.op)}${r.note ? `<br><span class="muted">${esc(r.note)}</span>` : ''}</td><td class="path">${esc(r.from)}</td>
        <td class="path">${esc(r.to)}${r.blocked ? `<br><span class="why">✗ ${esc(r.blocked)}</span>` : ''}</td></tr>`).join('')}
      </tbody></table></div>`;
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
    card.querySelector('.row').outerHTML = `<div class="done">${allow === 'all' ? 'Allowed for the rest of this job' : allow ? (ev.plan ? `Allowed ${picked.length} of ${ev.plan.length}` : 'Allowed') : 'Denied'}</div>`;
    for (const i of card.querySelectorAll('input')) i.disabled = true;
    answer(allow, picked);
  };
  yes.onclick = () => go(true);
  card.querySelector('.no').onclick = () => go(false);
  if (ev.allowAll) card.querySelector('.all').onclick = () => go('all');
  return card;
}

// ---- One card with every OK a job needs (1.5.42, src/together.js) ----
// Each step has its own tick box (and its own rows to tick, for files), so the person can see the whole job and
// allow all of it, some of it, or none. Returns the card, or null if this isn't one.
const lower = (t) => (t && !/^[A-Z]{2}/.test(t) ? t[0].toLowerCase() + t.slice(1) : t);
export function togetherApproval(ev, { add, answer }) {
  if (!Array.isArray(ev.together)) return null;
  const step = (it) => {
    let body = '';
    if (it.later) body = `${it.details ? `<pre class="cmd"><code>${esc(it.details)}</code></pre>` : ''}<p class="muted">Bob can't check this one until the steps before it are done (${esc(lower(String(it.later).replace(/[.\s]+$/, '')))}). He checks again when he gets there, and if anything doesn't match, he asks you again.</p>`;
    else if (it.plan) body = `<div class="hands-plan"><table><thead><tr><th></th><th>What</th><th>From</th><th>To</th></tr></thead><tbody>
      ${it.plan.map((r) => `<tr class="${r.blocked ? 'blocked' : 'tap'}"><td><input type="checkbox" data-step="${it.n}" data-row="${esc(r.id)}" ${r.blocked ? 'disabled' : 'checked'} aria-label="Step ${it.n}, row ${esc(r.id)}"></td>
        <td>${esc(OPS[r.op] || r.op)}${r.note ? `<br><span class="muted">${esc(r.note)}</span>` : ''}</td><td class="path">${esc(r.from)}</td>
        <td class="path">${esc(r.to)}${r.blocked ? `<br><span class="why">✗ ${esc(r.blocked)}</span>` : ''}</td></tr>`).join('')}
      </tbody></table></div>`;
    else if (it.command) body = `<pre class="cmd"><code>${esc(it.command)}</code></pre><p class="muted">In ${esc(it.cwd || '')}</p>`;
    else if (it.diff) body = `<pre class="diff"><code>${esc(it.diff)}</code></pre>`;
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
  return '<div class="hands-box"><strong>Hands</strong> <span class="tag">off unless you turn them on</span><p class="muted">Loading…</p></div>';
}

export async function mountHandsSettings(box) {
  if (!box) return;
  let v;
  const draw = () => {
    const s = v.settings;
    const folders = [...new Set([...(v.candidates || []), ...s.folders])];
    box.innerHTML = `<strong>Hands</strong> <span class="tag">off unless you turn them on</span>
      <p class="muted">Hands let Bob do things on this PC, not just talk about them. Each one is off until you switch it on. Even then he shows you exactly what he'll do (every file, or the exact command) and waits for your click every time, unless you turn on "Let Bob work without asking" below. "Allow the rest of this job" only covers the same kind of thing until that job ends. The hard limits below are all on to start with. He never changes his own code or settings. Everything goes in the logbook.</p>
      <label class="switch"><input type="checkbox" data-hmaster ${s.enabled ? 'checked' : ''}><span><strong>Let Bob use Hands</strong><br><span class="muted">The master switch. Off turns every Hand below off.</span>${s.enabled && s.held ? '<br><span class="warn-text">Stopped right now with the Hands switch on the chat page. Click it there to carry on.</span>' : ''}</span></label>
      <div class="hands-free${s.free ? ' on' : ''}"><label class="switch${s.enabled ? '' : ' dim'}"><input type="checkbox" data-hfree ${s.free ? 'checked' : ''} ${s.enabled ? '' : 'disabled'}><span><strong>Let Bob work without asking</strong> <span class="tag">off unless you turn it on</span><br><span class="muted">No approval cards: he just does the job and tells you what he did. The hard limits below still apply, every action is still in the chat and the logbook, and the ✋ Hands button on the chat page stops him at once. Cloud helpers still ask, because they cost money. Scheduled jobs also run by themselves.</span>${s.free && s.enabled ? '<br><span class="warn-text">On: Bob is working without asking.</span>' : ''}</span></label></div>
      ${v.hands.map((h) => { const [first, ...rest] = String(h.what || '').split(/(?<=\.)\s+/); return `<label class="switch${s.enabled ? '' : ' dim'}"><input type="checkbox" data-hand="${esc(h.id)}" ${s[h.id]?.on ? 'checked' : ''} ${s.enabled ? '' : 'disabled'}><span><strong>${esc(h.label)}</strong><br><span class="muted">${esc(first)}</span></span></label>${rest.length ? `<details class="more"><summary>More</summary><p class="muted">${esc(rest.join(' '))}</p></details>` : ''}`; }).join('')}
      ${officeLine(v.office, s.enabled && s.office?.on)}
      ${securityLine(s.enabled && s.security?.on)}
      <div class="hands-limits"><strong>Hard limits</strong> <span class="tag">all on to start with</span>
        <p class="muted">These hold whether or not Bob asks first. Switch one off only if you need what it blocks.</p>
        ${(v.limits || []).map((l) => `<label class="switch small"><input type="checkbox" data-hlimit="${esc(l.id)}" ${s.limits?.[l.id] !== false ? 'checked' : ''}><span><strong>${esc(l.label)}</strong><br><span class="muted">${esc(l.on)}</span>${l.more ? `<details class="more"><summary>More</summary><span class="muted">${esc(l.more)}</span></details>` : ''}${s.limits?.[l.id] === false ? `<br><span class="warn-text">Off: ${esc(l.off)}</span>` : ''}${l.id === 'readOnly' ? `<br><span class="muted">Read-only right now: ${v.readOnly?.length ? esc(v.readOnly.join('; ')) : 'none (add folders to "readOnlyRoots" in config.json)'}</span>` : ''}</span></label>`).join('')}
        <p class="muted">Always on, whatever you pick: Bob can't change his own code, settings or this page, never runs as administrator, stays out of terminals, admin tools, password managers and sign-in prompts, and the ✋ Hands button always stops him.</p></div>
      <div class="hands-folders"><strong>Folders the Files Hand may work in</strong>
        ${folders.length ? folders.map((f) => `<label class="switch small"><input type="checkbox" data-hfolder="${esc(f)}" ${s.folders.includes(f) ? 'checked' : ''}><span>${esc(f)}</span></label>`).join('') : '<p class="muted">No folders yet.</p>'}
        <div class="row"><input type="text" data-hnewfolder placeholder="Add a folder: C:\\Users\\you\\Pictures" aria-label="Add a folder" style="flex:1"><button type="button" data-haddfolder>Add</button></div>
        <p class="muted">The Office documents and converting Hand saves in these folders too (and in Bob's own Documents folder). Bob's own folders stay off-limits even inside these, and so do read-only projects and files with keys or passwords while those hard limits are on.</p></div>
      <label class="pick"><strong>Stop a command after</strong><select data-htimeout>${[1, 5, 15, 30, 60, 120].map((m) => `<option value="${m}" ${m === s.timeoutMin ? 'selected' : ''}>${m < 60 ? `${m} minute${m === 1 ? '' : 's'}` : `${m / 60} hour${m === 60 ? '' : 's'}`}</option>`).join('')}</select></label>
      <div class="hands-recipes"><strong>Recipes</strong> <span class="muted">Saved commands you can run in one click, or ask Bob for by name ("run my build recipe"). He still asks before each run, unless he's working without asking.</span>
        ${v.recipes.length ? `<ul>${v.recipes.map((r) => `<li><button type="button" class="big" data-hrun="${esc(r.name)}" ${s.enabled && s.run?.on ? '' : 'disabled'}>▶ ${esc(r.name)}</button> <code>${esc([r.cmd, ...(r.args || [])].join(' '))}</code> <span class="muted">in ${esc(r.cwd)}</span> <button type="button" class="link" data-hdelrecipe="${esc(r.name)}">Remove</button></li>`).join('')}</ul>` : ''}
        <details><summary>Add a recipe</summary><div class="hands-newrecipe">
          <label class="pick"><span>Name</span><input data-hr="name" placeholder="Build my app"></label>
          <label class="pick"><span>Program</span><input data-hr="cmd" placeholder="gradlew.bat"></label>
          <label class="pick"><span>Arguments (one per line)</span><textarea data-hr="args" rows="2" placeholder="assembleDebug"></textarea></label>
          <label class="pick"><span>In folder</span><input data-hr="cwd" placeholder="C:\\Users\\you\\Projects\\app"></label>
          <button type="button" data-hsaverecipe>Save recipe</button><span class="muted hr-out"></span></div></details></div>
      ${schedHtml(sched, s)}
      <div class="hands-journal"><strong>Recent file jobs</strong>
        ${v.journal.length ? `<ul>${v.journal.map((j) => `<li>${esc(when(j.at))}: ${esc(j.label)} ${j.undone ? '<span class="muted">(undone)</span>' : `<button type="button" data-hundo="${esc(j.id)}">Undo</button>`}</li>`).join('')}</ul>` : '<p class="muted">None yet.</p>'}
        <strong>Recent commands</strong>
        ${v.runs.length ? `<ul>${v.runs.map((r) => `<li>${esc(when(r.at))}: <code>${esc(r.line)}</code> <span class="muted">${r.why ? "didn't start" : r.killed ? esc(r.killed) : `exit ${r.code}`}</span></li>`).join('')}</ul>` : '<p class="muted">None yet.</p>'}
        <p class="muted">Every action is also in the logbook (inn\\logbook.md).</p></div>
      <div class="hands-selftest"><strong>Self-test</strong> <span class="muted">Checks that Recycle Bin and Undo, tidying, running a program and Stop work on this PC. Uses a throwaway folder of dummy files, which is removed afterwards. Nothing of yours is touched, and no Hand needs to be on.</span>
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
      if ('hmaster' in el.dataset) return await set({ enabled: el.checked }, el.checked ? 'Hands on. Now switch on the ones you want; he still asks every time.' : 'All Hands off.');
      if ('hfree' in el.dataset && el.checked) { el.checked = false; return askFree(); }
      if ('hfree' in el.dataset) return await set({ free: el.checked }, el.checked ? 'On. Bob works without asking now. The hard limits still apply, and ✋ Hands on the chat page stops him.' : 'Off. Bob asks before every action again.');
      if (el.dataset.hlimit) { const l = (v.limits || []).find((x) => x.id === el.dataset.hlimit); return await set({ limits: { [el.dataset.hlimit]: el.checked } }, el.checked ? `"${l?.label}" is back on.` : `"${l?.label}" is off. ${l?.off || ''}`); }
      if (el.dataset.hand) return await set({ [el.dataset.hand]: { on: el.checked } }, el.checked ? 'On. Bob still asks before every action.' : 'Off.');
      if (el.dataset.hfolder) { const f = el.dataset.hfolder; return await set({ folders: el.checked ? [...v.settings.folders, f] : v.settings.folders.filter((x) => x !== f) }); }
      if ('htimeout' in el.dataset) return await set({ timeoutMin: Number(el.value) });
      if (el.dataset.hsched) { sched = await post('/api/hands/schedules', { id: el.dataset.hsched, on: el.checked }); draw(); return say(el.checked ? 'Schedule on.' : 'Schedule off.'); }
      if ('hschedtask' in el.dataset) { try { sched = await post('/api/hands/schedules', { windowsTask: el.checked }); draw(); say(el.checked ? 'Added the "Bob schedules" task: Windows wakes Bob (hidden) when a schedule is due. Remove Bob takes it away too.' : 'Removed the Windows task.'); } catch (err) { el.checked = !el.checked; say(err.message); } return; }
    } catch (err) { say(err.message); }
  });
  box.addEventListener('click', async (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    e.stopPropagation();
    try {
      if ('hfreeyes' in b.dataset) return await set({ free: true }, 'On. Bob works without asking now. The hard limits still apply, and ✋ Hands on the chat page stops him.');
      if ('hfreeno' in b.dataset) { b.closest('.free-confirm')?.remove(); return say('Left off. Bob still asks before every action.'); }
      if ('hstopall' in b.dataset) { const r = await post('/api/hands/stop-all'); v = r; draw(); say(`Stopped ${r.stopped} thing${r.stopped === 1 ? '' : 's'}. All Hands are off.`); showStopAll(false); return; }
      if ('haddfolder' in b.dataset) {
        const f = box.querySelector('[data-hnewfolder]').value.trim();
        if (!f) return;
        const before = v.settings.folders.length;
        await set({ folders: [...v.settings.folders, f] });
        say(v.settings.folders.length > before ? 'Added.' : 'That isn\'t a full folder path (like C:\\Users\\you\\Pictures).');
        return;
      }
      if ('hpwcheck' in b.dataset) return await checkPassword(box);
      if (b.dataset.hgetengine) { b.disabled = true; try { await post('/api/models/download', { id: 'engine:' + b.dataset.hgetengine }); say('Downloading. It shows in Downloads; this line turns to ✓ when it\'s ready.'); } catch (e) { b.disabled = false; say(e.message); } return; }
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

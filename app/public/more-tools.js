// Settings, How Bob works: "🧰 More tools" (src/more-tools.js, src/more-tools-routes.js). Every switch starts off.
// Every box shows all the time (SETTINGS-STYLE rule 14): details can be typed before a switch goes on.
// Passwords, calendar links and keys go straight into the locked store; this page only learns whether one is saved.
import { esc } from './util.js';

async function api(data) {
  const r = await fetch('/api/more-tools', data === undefined ? {} : { method: 'POST', headers: { 'content-type': 'application/json', 'x-bob': '1' }, body: JSON.stringify(data) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) { const e = new Error(j.error || `Error ${r.status}`); e.view = j; throw e; }
  return j;
}

// What each switch does, in a line.
const NOTES = {
  calculator: 'Exact sums and unit changes (miles to km, °F to °C, cups to ml) worked out by code, not guessed.',
  python: 'Python joins the sandbox, for data and maths jobs. No internet, no files outside the box. Needs "Let Bob work things out in a sandbox" on and Python fetched once.',
  passwords: 'Passwords, passphrases and PINs made by your computer\'s random maker. Shown only to you, never to the brain, never saved.',
  repeatReminders: 'Reminders can repeat: every day, weekday, week, month or year ("every Monday at 9").',
  phoneReminders: 'Reminders and page-watch news pop up on Bob for Android too, while it\'s paired.',
  email: 'Bob reads your mail (any IMAP account, read-only). He can\'t send, delete or mark anything read.',
  calendar: 'Bob reads calendars from a link or an .ics file. Read-only.',
  pageWatch: 'Bob checks a web page every few hours and tells you when the part you care about changes.',
  webApi: 'Bob calls web services you add here, with their saved key. Reading needs no card; sending or changing anything always asks first.',
  dataQuery: 'Bob asks questions of a big CSV or database file by running a read-only query.',
  charts: 'Bob draws a chart from a CSV or a table.',
  spellCheck: 'Spelling and simple grammar, checked offline. He lists slips; he only fixes them if you ask.',
  meetingNotes: 'A meeting recording becomes notes, with who said what (a best guess from voices).',
  compareFiles: 'Bob compares two files and says what changed, in words.'
};

export function moreToolsHtml() {
  return '<div class="more-tools-box"><p class="muted">Loading…</p></div>';
}

export async function mountMoreTools(box) {
  if (!box) return;
  let v, msg = '';
  const sw = (s) => `<label class="switch srow-switch"><input type="checkbox" data-mt-on="${esc(s.key)}" ${s.on ? 'checked' : ''}><span><strong>${esc(s.label)}</strong><br><span class="muted">Off unless you turn it on. ${esc(NOTES[s.key] || '')}</span></span></label>`;
  const byKey = (k) => sw(v.switches.find((s) => s.key === k));
  const draw = () => {
    const cal = v.calendars.map((c) => `<li>${esc(c.name)} <span class="muted">(${c.kind === 'file' ? esc(c.file) : c.linkSaved ? 'link locked' : 'link missing'})</span> <button type="button" class="mini" data-mt-caltest="${esc(c.id)}">Test</button> <button type="button" class="mini" data-mt-calrm="${esc(c.id)}" aria-label="Remove ${esc(c.name)}">Remove</button></li>`).join('');
    const apis = v.apis.map((a) => `<li><strong>${esc(a.name)}</strong> <code>${esc(a.base)}</code> <span class="muted">${a.keySaved ? 'key locked' : 'no key'}</span> <button type="button" class="mini" data-mt-apirm="${esc(a.id)}" aria-label="Remove ${esc(a.name)}">Remove</button></li>`).join('');
    const watches = v.watches.map((w) => `<li>${esc(w.what || w.url)} <span class="muted">${w.find ? `"${esc(w.find)}"` : 'whole page'}${w.problem ? ` · ${esc(w.problem)}` : ''}</span> <button type="button" class="mini" data-mt-watchrm="${esc(w.id)}">Stop watching</button></li>`).join('');
    box.innerHTML = `
      <h4 class="ssub">Sums and code</h4>
      ${byKey('calculator')}
      ${byKey('python')}
      <div class="row"><span class="muted">${v.pythonHere ? '✓ Python is here.' : `Python isn't here yet (about ${esc(v.pythonSize)}, once).`}${v.sandboxOn ? '' : ' The sandbox is off.'}</span>${v.pythonHere ? '' : ' <button type="button" class="mini" data-mt-get="python">Get Python</button>'}</div>
      ${byKey('passwords')}
      <h4 class="ssub">Reminders</h4>
      ${byKey('repeatReminders')}
      ${byKey('phoneReminders')}
      <h4 class="ssub">Email and calendar</h4>
      ${byKey('email')}
      <div class="row"><label><strong>Mail server</strong> <input data-mt-email="host" maxlength="120" value="${esc(v.emailHost)}" placeholder="imap.example.com" spellcheck="false"></label>
        <label>Port <input data-mt-email="port" type="number" min="1" max="65535" value="${esc(v.emailPort)}" style="width:6em"></label></div>
      <div class="row"><label>Account <input data-mt-email="user" maxlength="200" value="${esc(v.emailUser)}" placeholder="you@example.test" spellcheck="false" autocomplete="off"></label>
        <label>Folder <input data-mt-email="folder" maxlength="100" value="${esc(v.emailFolder)}" style="width:8em"></label></div>
      <div class="row"><label>App password <input data-mt-email="password" type="password" autocomplete="off" placeholder="${v.emailPasswordSaved ? 'Saved and locked' : 'Paste an app password'}"></label>
        <button type="button" data-mt-emailsave>Save</button> <button type="button" class="mini" data-mt-emailtest>Test</button>${v.emailPasswordSaved ? ' <button type="button" class="mini" data-mt-emailforget>Forget password</button>' : ''}
        <span class="muted">Use an app password (made in your mail account's security page), not your main one. It's kept locked.</span></div>
      ${byKey('calendar')}
      <ul class="plain">${cal || '<li class="muted">No calendars yet.</li>'}</ul>
      <div class="row"><input data-mt-cal="name" maxlength="40" placeholder="Name, like Work" aria-label="Calendar name" style="width:9em">
        <input data-mt-cal="link" maxlength="2000" type="password" autocomplete="off" placeholder="Calendar link (https:// or webcal://) or the full path of an .ics file" aria-label="Calendar link or file" style="flex:1;min-width:12em">
        <button type="button" class="mini" data-mt-caladd>Add</button></div>
      <h4 class="ssub">The web</h4>
      ${byKey('pageWatch')}
      <div class="row"><label>Check every <select data-mt-hours>${[1, 3, 6, 12, 24].map((h) => `<option value="${h}" ${v.watchHours === h ? 'selected' : ''}>${h} hour${h === 1 ? '' : 's'}</option>`).join('')}</select></label> <span class="muted">Ask Bob "watch this page" to add one.</span></div>
      <ul class="plain">${watches || '<li class="muted">Not watching any pages.</li>'}</ul>
      ${byKey('webApi')}
      <ul class="plain">${apis || '<li class="muted">No web services yet.</li>'}</ul>
      <div class="row"><input data-mt-api="name" maxlength="30" placeholder="Name, like Weather" aria-label="Service name" style="width:9em">
        <input data-mt-api="base" maxlength="300" placeholder="https://api.example.com/v1" aria-label="Service address" spellcheck="false" style="flex:1;min-width:12em"></div>
      <div class="row"><input data-mt-api="header" maxlength="60" placeholder="Authorization" aria-label="Key header" style="width:9em">
        <input data-mt-api="prefix" maxlength="20" placeholder="Bearer" aria-label="Key prefix" style="width:6em">
        <input data-mt-api="key" type="password" autocomplete="off" placeholder="The key (kept locked)" aria-label="Service key">
        <button type="button" class="mini" data-mt-apiadd>Add</button></div>
      <h4 class="ssub">Files and data</h4>
      ${byKey('dataQuery')}
      ${byKey('charts')}
      ${byKey('spellCheck')}
      <div class="row"><span class="muted">${v.wordListHere ? '✓ The word list is here.' : 'The word list isn\'t here yet (about 1 MB, once). Without it, only grammar is checked.'}</span>${v.wordListHere ? '' : ' <button type="button" class="mini" data-mt-get="words">Get the word list</button>'}</div>
      ${byKey('meetingNotes')}
      <div class="row"><span class="muted">${v.ffmpegHere ? '✓ FFmpeg is here.' : 'Needs FFmpeg (Settings, Get models).'} ${v.hearingHere ? '✓ Bob can hear.' : 'Needs a hearing model (Settings, Voice).'}</span></div>
      ${byKey('compareFiles')}
      <p class="muted" role="status" aria-live="polite">${esc(msg)}</p>`;
  };
  const act = async (data, done = '') => {
    msg = 'Working…'; const st = box.querySelector('[role=status]'); if (st) st.textContent = msg;
    try { v = await api(data); msg = v.why || v.test || v.note || done; }
    catch (e) { if (e.view?.switches) v = e.view; msg = e.message; }
    draw();
  };
  const val = (sel) => box.querySelector(sel)?.value ?? '';
  box.addEventListener('change', (e) => {
    const k = e.target.dataset?.mtOn;
    if (k) act({ set: { [k]: e.target.checked } }, e.target.checked ? 'On.' : 'Off.');
    else if (e.target.matches('[data-mt-hours]')) act({ watchHours: Number(e.target.value) }, 'Saved.');
  });
  box.addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    const d = b.dataset;
    if (d.mtGet) act(d.mtGet === 'python' ? { getPython: true } : { getWordList: true });
    else if ('mtEmailsave' in d) act({ email: { host: val('[data-mt-email=host]'), port: Number(val('[data-mt-email=port]')), user: val('[data-mt-email=user]'), folder: val('[data-mt-email=folder]'), password: val('[data-mt-email=password]') } }, 'Saved.');
    else if ('mtEmailtest' in d) act({ testEmail: true });
    else if ('mtEmailforget' in d) act({ email: { forgetPassword: true } }, 'Password forgotten.');
    else if ('mtCaladd' in d) {
      const link = val('[data-mt-cal=link]').trim(), name = val('[data-mt-cal=name]').trim() || 'Calendar';
      act(/^(https?|webcals?):\/\//i.test(link) ? { addCalendar: { name, link } } : { addCalendar: { name, file: link } }, 'Calendar added.');
    } else if (d.mtCaltest) act({ testCalendar: d.mtCaltest });
    else if (d.mtCalrm) act({ removeCalendar: d.mtCalrm }, 'Calendar removed.');
    else if ('mtApiadd' in d) act({ addApi: { name: val('[data-mt-api=name]'), base: val('[data-mt-api=base]'), header: val('[data-mt-api=header]') || undefined, prefix: val('[data-mt-api=prefix]'), key: val('[data-mt-api=key]') } }, 'Service added.');
    else if (d.mtApirm) act({ removeApi: d.mtApirm }, 'Service removed.');
    else if (d.mtWatchrm) act({ removeWatch: d.mtWatchrm }, 'Stopped watching.');
  });
  try { v = await api(); } catch (e) { box.innerHTML = `<p class="muted">${esc(e.message)}</p>`; return; }
  draw();
}

// A password Bob made: shown once, here only. Not saved in the chat, not read aloud, never sent to the brain.
export function secretNoteHtml(ev) {
  const items = (ev.items || []).map((s, i) => `<li><code class="secret-pw" data-i="${i}">${esc(s)}</code> <button type="button" class="mini" data-copy-secret="${i}">Copy</button></li>`).join('');
  return `<div class="secret-note" role="note" aria-label="${esc(ev.title || 'Password')}"><strong>🔑 ${esc(ev.title || 'Your password')}</strong><ul class="plain">${items}</ul><p class="muted">${esc(ev.note || 'Only shown here, once. It isn\'t saved in the chat.')}</p></div>`;
}
export function wireSecretNote(el, ev) {
  el.addEventListener('click', (e) => {
    const b = e.target.closest('[data-copy-secret]'); if (!b) return;
    const s = (ev.items || [])[Number(b.dataset.copySecret)];
    navigator.clipboard?.writeText(s).then(() => { b.textContent = 'Copied'; }).catch(() => {});
  });
}

// "Do you want me to...": the switches that are off until you turn them on, in one short list on the Welcome
// (first-time setup), in Bob's voice. Each tick saves straight away, the same as the switch of the same name in
// Settings, so nothing here is new behaviour: it's only those switches gathered in one place. Existing Bobs are never
// sent here by force; the chat offers it once (app.js) and Settings, Run first-time setup, shows it any time.

// key: the setting. setting: the switch's name in Settings (the Help and the tests use it). where: its Settings panel.
export const WANTS = [
  { group: 'Everyday help', key: 'quickNotes', setting: 'Let Bob take quick notes', where: 'How Bob works',
    label: 'Take quick notes when you say "note:"', note: 'I write it down at once with the date and time, in one plain text file you can open.' },
  { group: 'Everyday help', key: 'docTools', setting: 'Read and search my documents', where: 'How Bob works',
    label: 'Read and search your documents', note: 'Word, Excel, PowerPoint, PDF and more, in Documents, Desktop and Downloads. Nothing leaves this replicant matrix.' },
  { group: 'Everyday help', key: 'sandboxCode', setting: 'Let Bob work things out in a sandbox', where: 'How Bob works',
    label: 'Work out sums, dates and money in a sandbox', note: 'A few lines of code in a locked box that can\'t see your files, thrown away after each run, so I answer from the result instead of guessing.' },
  { group: 'Everyday help', key: 'toolLearning', setting: 'Let Bob learn from his tools', where: 'How Bob works',
    label: 'Learn from what works and what fails', note: 'When a tool fails and then works, I keep one line on what fixed it. It all stays on this replicant matrix.' },
  { group: 'Everyday help', key: 'webSearch', setting: 'Let Bob search the web', where: 'How Bob works',
    label: 'Search the web when a question needs it', note: 'Only the search words and page addresses go online.' },
  { group: 'How I work', key: 'planFirst', setting: 'Show Bob\'s plan before big jobs', where: 'How Bob works',
    label: 'Show you my plan before big jobs', note: 'Every step on one card, and I wait for your OK.' },
  { group: 'How I work', key: 'editOwn', setting: 'Let Bob fix his own messages', where: 'How Bob works',
    label: 'Fix my own messages instead of sending new ones', note: 'A fixed message says edited, and pressing that shows what it said first.' },
  { group: 'How I work', key: 'howtos', setting: 'Let Bob learn how-tos', where: 'How Bob works',
    label: 'Learn how-tos from jobs that went well', note: 'I ask before keeping one, and follow it next time.' },
  { group: 'How I work', key: 'resumeJobs', setting: 'Pick up where Bob left off after a restart', where: 'How Bob works',
    label: 'Pick up where I left off after a restart', note: 'Steps that finished aren\'t done again.' },
  { group: 'Starting and updates', key: 'autostart', setting: 'Launch Bob on start-up', where: 'How Bob works',
    label: 'Start when you sign in to this replicant matrix', note: '' },
  { group: 'Starting and updates', key: 'autoCheck', setting: 'Check for updates when Bob starts', where: 'This replicant matrix and updates',
    label: 'Check for a newer me when I start', note: 'I only tell you. Updating always takes your click.' },
  { group: 'Starting and updates', key: 'catalogUpdates', setting: 'Let Bob fetch his newest brain list', where: 'How Bob works',
    label: 'Fetch my newest brain list once a day', note: 'From my own GitHub page, so new brains show up in Get models. Nothing downloads by itself.' }
];

// The bigger ones have choices of their own, so the list only points at them. id: the Settings section it opens.
export const WANTS_ELSEWHERE = [
  { id: 'adv-hands', label: 'Use your files and programs (✋ Hands)' },
  { id: 'adv-bobnet', label: 'Talk to me from your phone (🌐 Bob-Net)' },
  { id: 'adv-online', label: 'Chat on Discord or Telegram (☁ Online services)' }
];

// Is this switch on in the settings Bob sent (GET /api/settings)?
export const wantOn = (settings, key) => (key === 'autoCheck' ? settings?.updates?.autoCheck === true : settings?.[key] === true);

// What to POST to /api/settings for one tick.
export const wantPatch = (key, on) => (key === 'autoCheck' ? { updates: { autoCheck: on === true } } : { [key]: on === true });

// Put the answer from POST /api/settings back into the settings Bob holds, and say what happened (or why it stayed off).
export function wantSaved(settings, key, reply = {}) {
  if (key === 'autoCheck') settings.updates = { ...(settings.updates || {}), autoCheck: reply.updates?.autoCheck === true };
  else if (key in reply) settings[key] = reply[key] === true;
  const on = wantOn(settings, key);
  const why = key === 'sandboxCode' ? reply.sandboxWhy : '';
  return { on, say: why || (on ? 'On.' : 'Off.') };
}

// Where Bob can start at sign-in (the same test as the Settings switch).
const canAutostart = (s) => s?.platform === 'win32' || s?.platform === 'darwin' || Boolean(s?.loginItems);

export function wantsHtml(settings, esc) {
  const groups = [...new Set(WANTS.map((w) => w.group))];
  const row = (w) => {
    const off = w.key === 'autostart' && !canAutostart(settings);
    const note = off ? 'Not on Linux yet, the same as in Settings.' : w.note;
    return `<li><label class="switch"><input type="checkbox" data-want="${esc(w.key)}" ${wantOn(settings, w.key) ? 'checked' : ''} ${off ? 'disabled' : ''}><span><strong>${esc(w.label)}</strong>${note ? `<br><span class="muted">${esc(note)}</span>` : ''} <span class="want-said muted" aria-live="polite"></span></span></label></li>`;
  };
  return `<section class="ready wants" id="sub-wants"><h3>Do you want me to:</h3>
    <p class="muted">All of these are off until you tick them. Each one is saved as soon as you tick it, and it's the same switch you'll find in Settings, so you can change your mind there any time.</p>
    ${groups.map((g) => `<h4>${esc(g)}</h4><ul class="packlist wantlist">${WANTS.filter((w) => w.group === g).map(row).join('')}</ul>`).join('')}
    <h4>Bigger ones, with a few choices each</h4>
    <p class="muted">These wait in Settings until you want them:</p>
    <div class="row">${WANTS_ELSEWHERE.map((x) => `<button type="button" data-wantjump="${esc(x.id)}">${esc(x.label)}</button>`).join('')}</div>
  </section>`;
}

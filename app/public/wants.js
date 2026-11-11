// "Do you want me to...": the switches that are off until you turn them on, in one short list on the Welcome
// (first-time setup), in Bob's voice. Each tick saves straight away, the same as the switch of the same name in
// Settings, so nothing here is new behaviour: it's only those switches gathered in one place. Existing Bobs are never
// sent here by force; the chat offers it once (app.js) and Settings, Run first-time setup, shows it any time.

// The list follows the Settings cards (settings-map.js), so a thing is in the same place here and there.
import { CARDS } from './settings-map.js';

// key: the setting. setting: the switch's name in Settings (the Help and the tests use it). where: its Settings panel.
// card: the Settings card it sits under.
export const WANTS = [
  { card: 'how', key: 'quickNotes', setting: 'Let Bob take quick notes', where: 'How Bob works',
    label: 'Take quick notes when you say "note:"', note: 'Saved at once with the date, in one text file.' },
  { card: 'how', key: 'docTools', setting: 'Read and search my documents', where: 'How Bob works',
    label: 'Read and search your documents', note: 'Word, Excel, PowerPoint, PDF and more. Nothing leaves this replicant matrix.' },
  { card: 'how', key: 'docView', setting: 'Show documents in the side panel', where: 'How Bob works',
    label: 'Show documents beside the chat', note: 'Word, Excel, PowerPoint and PDF open in the side panel.' },
  { card: 'how', key: 'sandboxCode', setting: 'Let Bob work things out in a sandbox', where: 'How Bob works',
    label: 'Work out sums, dates and money in a sandbox', note: 'A locked box that can\'t see your files, so I answer from the result, not a guess.' },
  { card: 'how', key: 'parts3d', setting: 'Let Bob make 3D parts', where: 'How Bob works',
    label: 'Make 3D parts for a printer', note: 'Brackets, boxes and fixes as STL files. Needs OpenSCAD (free).' },
  { card: 'how', key: 'planFirst', setting: 'Show Bob\'s plan before big jobs', where: 'How Bob works',
    label: 'Show you my plan before big jobs', note: 'Every step on one card, and I wait for your OK.' },
  { card: 'how', key: 'editOwn', setting: 'Let Bob fix his own messages', where: 'How Bob works',
    label: 'Fix my own messages instead of sending new ones', note: 'It says edited, and shows what it said first.' },
  { card: 'how', key: 'howtos', setting: 'Let Bob learn how-tos', where: 'How Bob works',
    label: 'Learn how-tos from jobs that went well', note: 'I ask before keeping one, and follow it next time.' },
  { card: 'how', key: 'resumeJobs', setting: 'Pick up where Bob left off after a restart', where: 'How Bob works',
    label: 'Pick up where I left off after a restart', note: 'Finished steps aren\'t done again.' },
  { card: 'brains', key: 'oneBrain', setting: 'One brain (snappier)', where: 'How Bob works',
    label: 'Use one brain for everything', note: 'No 20-second stops to swap brains.' },
  { card: 'brains', key: 'memoryRecall', setting: 'Remember only what fits', where: 'Speed & memory',
    label: 'Read only the memories that fit each message', note: 'Keeps chats light.' },
  { card: 'online', key: 'webSearch', setting: 'Let Bob search the web', where: 'How Bob works',
    label: 'Search the web when a question needs it', note: 'Only the search words and page addresses go online.' },
  { card: 'online', key: 'catalogUpdates', setting: 'Let Bob fetch his newest brain list', where: 'How Bob works',
    label: 'Fetch my newest brain list once a day', note: 'From my own GitHub page. Nothing downloads by itself.' },
  { card: 'pc', key: 'autostart', setting: 'Launch Bob on start-up', where: 'How Bob works',
    label: 'Start when you sign in to this replicant matrix', note: '' },
  { card: 'pc', key: 'autoCheck', setting: 'Check for updates when Bob starts', where: 'This replicant matrix and updates',
    label: 'Check for a newer me when I start', note: 'I only tell you. Updating takes your click.' }
];

// The bigger ones have choices of their own, so the list only points at them. id: the Settings section it opens.
export const WANTS_ELSEWHERE = [
  { card: 'how', id: 'adv-checkins', label: 'Check in on you by myself (🔔 Check-ins)' },
  { card: 'net', id: 'adv-bobnet', label: 'Talk to me from your phone (🌐 Bob-Net)' },
  { card: 'online', id: 'adv-online', label: 'Chat on Discord or Telegram (☁ Online services)' },
  { card: 'may', id: 'adv-hands', label: 'Use your files and programs (✋ Hands)' },
  { card: 'fun', id: 'adv-adventure', label: 'Run a tabletop adventure (🎲 Adventure)' },
  { card: 'fun', id: 'adv-games', label: 'Play word games (🧩 Games)' },
  { card: 'pc', id: 'adv-housekeeping', label: 'Tidy up while I\'m idle (🧹 Housekeeping)' }
];

// Being built: shown as plain words, never a tick. When one ships, its line moves up into WANTS or WANTS_ELSEWHERE
// (the test fails while a line here is also a Settings switch).
export const WANTS_SOON = [
  { card: 'how', label: 'Notice what\'s worth noting by myself' },
  { card: 'brains', label: 'Ask a bigger Bob to check my hard answers' },
  { card: 'net', label: 'SCUT, a faster link for sharing a graphics card (experimental)' },
  { card: 'net', label: 'SUDDAR scan, to see how far away each Bob is (experimental)' },
  { card: 'may', label: 'Keep a note when a tool trips me up' },
  { card: 'may', label: 'Say when to use each tool I make' },
  { card: 'may', label: 'Keep score of my tools and offer to fix one that keeps failing' },
  { card: 'may', label: 'Browse the web in my own window' }
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
  const row = (w) => {
    const off = w.key === 'autostart' && !canAutostart(settings);
    const note = off ? 'Not on Linux yet, the same as in Settings.' : w.note;
    return `<li><label class="switch"><input type="checkbox" data-want="${esc(w.key)}" ${wantOn(settings, w.key) ? 'checked' : ''} ${off ? 'disabled' : ''}><span><strong>${esc(w.label)}</strong>${note ? `<br><span class="muted">${esc(note)}</span>` : ''} <span class="want-said muted" aria-live="polite"></span></span></label></li>`;
  };
  const group = (c) => {
    const ticks = WANTS.filter((w) => w.card === c.id), more = WANTS_ELSEWHERE.filter((x) => x.card === c.id), soon = WANTS_SOON.filter((x) => x.card === c.id);
    if (!ticks.length && !more.length && !soon.length) return '';
    return `<h4>${c.icon} ${esc(c.name)}</h4>
      ${ticks.length ? `<ul class="packlist wantlist">${ticks.map(row).join('')}</ul>` : ''}
      ${more.length ? `<div class="row">${more.map((x) => `<button type="button" data-wantjump="${esc(x.id)}">${esc(x.label)}</button>`).join('')}</div>` : ''}
      ${soon.length ? `<p class="muted want-soon"><strong>Coming soon:</strong> ${soon.map((x) => esc(x.label)).join(' · ')}</p>` : ''}`;
  };
  return `<section class="ready wants" id="sub-wants"><h3>Do you want me to:</h3>
    <p class="muted">All of these are off until you tick them. A tick is saved at once. The groups match the cards in Settings, where you can change your mind any time. A button opens the bigger ones in Settings.</p>
    ${CARDS.map(group).join('')}
  </section>`;
}

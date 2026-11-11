// "Do you want me to...": the switches that are off until you turn them on, in one short list on the Welcome
// (first-time setup), in Bob's voice. Each tick saves straight away, the same as the switch of the same name in
// Settings, so nothing here is new behaviour: it's only those switches gathered in one place. Existing Bobs are never
// sent here by force; the chat offers it once (app.js) and Settings, Run first-time setup, shows it any time.

// The list follows the Settings cards (settings-map.js), so a thing is in the same place here and there.
import { CARDS } from './settings-map.js';

// key: the setting. setting: the switch's name in Settings (the Help and the tests use it). where: its Settings panel.
// card: the Settings card it sits under.
export const WANTS = [
  { card: 'bob', key: 'mathView', setting: 'Show maths as formulas', where: 'Bob himself',
    label: 'Show maths as real formulas', note: 'Fractions, powers and roots instead of code.' },
  { card: 'bob', key: 'shortcuts', setting: 'Keyboard shortcuts', where: 'Bob himself',
    label: 'Answer to keyboard shortcuts', note: 'Ctrl+Shift+O new chat, Ctrl+K search, Esc stops me. Ctrl+/ lists them.' },
  { card: 'how', key: 'quickNotes', setting: 'Let Bob take quick notes', where: 'How Bob works',
    label: 'Take quick notes when you say "note:"', note: 'Saved at once with the date, in one text file.' },
  { card: 'how', key: 'smartNotes', setting: 'Let Bob notice what\'s worth noting', where: 'How Bob works',
    label: 'Note things worth keeping on my own', note: 'Decisions, numbers, plans. I say 📝 Noted. Turns quick notes on too.' },
  { card: 'how', key: 'docTools', setting: 'Read and search my documents', where: 'How Bob works',
    label: 'Read and search your documents', note: 'Word, Excel, PowerPoint, PDF and more. Nothing leaves this replicant matrix.' },
  { card: 'how', key: 'docMeaning', setting: 'Search my documents by meaning', where: 'How Bob works',
    label: 'Find documents by what they mean, not just the words', note: 'Works with reading your documents on. The index stays on this replicant matrix.' },
  { card: 'how', key: 'docFresh', setting: 'Keep my documents fresh', where: 'How Bob works',
    label: 'Re-read documents as soon as they change', note: 'Works with meaning search on. A saved file is read again within a minute.' },
  { card: 'how', key: 'docPlaces', setting: 'Show the page and line', where: 'How Bob works',
    label: 'Say the page and line when I find something', note: 'Click the place in my answer to open the file there.' },
  { card: 'how', key: 'weeklyDigest', setting: 'A Sunday digest', where: 'How Bob works',
    label: 'Send you a short digest every Sunday', note: 'The week\'s chats, reminders and what I noticed. No brain needed.' },
  { card: 'how', key: 'docView', setting: 'Show documents in the side panel', where: 'How Bob works',
    label: 'Show documents beside the chat', note: 'Word, Excel, PowerPoint and PDF open in the side panel.' },
  { card: 'how', key: 'chatFiles', setting: 'Save chats as files and bring chats in', where: 'How Bob works',
    label: 'Save chats as files, and bring in chats from ChatGPT and others', note: 'Markdown, JSON or PDF out; ChatGPT, Claude and Open WebUI exports in.' },
  { card: 'how', key: 'promptMenu', setting: 'Pull up saved prompts with /', where: '📝 Saved prompts',
    label: 'Pull up your saved prompts when you type /', note: 'The words you use often, in the box in two keys.' },
  { card: 'how', key: 'sandboxCode', setting: 'Let Bob work things out in a sandbox', where: 'How Bob works',
    label: 'Work out sums, dates and money in a sandbox', note: 'A locked box that can\'t see your files, so I answer from the result, not a guess.' },
  { card: 'how', key: 'toolLearning', setting: 'Let Bob learn from his tools', where: 'How Bob works',
    label: 'Learn from what works and what fails', note: 'One line on what fixed a tool, and a scorecard. It stays here.' },
  { card: 'how', key: 'parts3d', setting: 'Let Bob make 3D parts', where: 'How Bob works',
    label: 'Make 3D parts for a printer', note: 'Brackets, boxes and fixes as STL files. Needs OpenSCAD (free).' },
  { card: 'how', key: 'model3d', setting: 'Let Bob turn pictures into 3D models', where: 'How Bob works',
    label: 'Turn pictures into 3D models', note: 'Figurines and props with colour. Needs an NVIDIA card and about 22 GB.' },
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
  { card: 'brains', key: 'quickSeesJob', setting: 'Let Bob\'s Quick brain see the big job', where: 'Brains',
    label: 'Tell you how a long job is going', note: 'My Quick brain sees what my big brain is on, and can pass it a note.' },
  { card: 'brains', key: 'memoryRecall', setting: 'Remember only what fits', where: 'Speed & memory',
    label: 'Read only the memories that fit each message', note: 'Keeps chats light.' },
  { card: 'brains', key: 'memorySources', setting: 'Note where each memory came from', where: 'Speed & memory',
    label: 'Note which chat each memory came from', note: 'So a wrong memory is easy to trace and forget.' },
  { card: 'brains', key: 'memoryExpiry', setting: 'Let memories run out', where: 'Speed & memory',
    label: 'Forget things you only want kept for a while', note: '"Remember this for the week" fades by itself.' },
  { card: 'brains', key: 'memoryWhere', setting: 'Keep project memories to their project', where: 'Speed & memory',
    label: 'Bring up project memories only in that project', note: 'Works with Remember only what fits on.' },
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
  { card: 'bob', id: 'adv-presets', label: 'Work a different way in each chat (🎭 Assistant presets)' },
  { card: 'how', id: 'adv-checkins', label: 'Check in on you by myself (🔔 Check-ins)' },
  { card: 'net', id: 'adv-bobnet', label: 'Talk to me from your phone (🌐 Bob-Net)' },
  { card: 'online', id: 'adv-online', label: 'Chat on Discord or Telegram (☁ Online services)' },
  { card: 'may', id: 'adv-hands', label: 'Use your files and programs (✋ Hands)' },
  { card: 'fun', id: 'adv-adventure', label: 'Run a tabletop adventure (🎲 Adventure)' },
  { card: 'fun', id: 'adv-games', label: 'Play word games (🧩 Games)' },
  { card: 'pc', id: 'adv-housekeeping', label: 'Choose what I tidy while I\'m idle (🧹 Housekeeping)' },
  { card: 'pc', id: 'ev-lock', label: 'Ask for a passcode, and lock your chats (🔒 Passcode lock)' }
];

// Being built: shown as plain words, never a tick. When one ships, its line moves up into WANTS or WANTS_ELSEWHERE
// (the test fails while a line here is also a Settings switch).
export const WANTS_SOON = [
  { card: 'brains', label: 'Ask a bigger Bob to check my hard answers' },
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
  if (key === 'smartNotes' && 'quickNotes' in reply) settings.quickNotes = reply.quickNotes === true; // smart notes switch quick notes on with them
  const on = wantOn(settings, key);
  const why = key === 'sandboxCode' ? reply.sandboxWhy : '';
  return { on, say: why || (on ? (key === 'smartNotes' ? 'On, with quick notes.' : 'On.') : 'Off.') };
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

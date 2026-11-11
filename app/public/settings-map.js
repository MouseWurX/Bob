// Settings, two views of the same panels : Simple = eight topic cards, Advanced = a side list.
// One toggle swaps them. Nothing is hidden in either view: every panel sits on one card and in one group.
// Panel ids are the ones Help links and cards already jump to (ev-... and adv-...).

// Advanced: the side list, top to bottom.
export const GROUPS = [
  ['Bob', ['ev-bob', 'ev-how', 'adv-prompts', 'adv-voice', 'adv-look', 'adv-house', 'adv-checkins']],
  ['Brains', ['adv-brains', 'adv-speed', 'adv-engines']],
  ['Connections', ['adv-bobnet', 'adv-online', 'adv-apps']],
  ['What Bob may do', ['adv-hands', 'ev-howtos', 'adv-adventure', 'adv-games']],
  ['This replicant matrix', ['ev-pc', 'ev-projects', 'ev-home', 'ev-save', 'adv-housekeeping', 'adv-remove']]
];

// Simple: the cards. `about` says what's inside, in a few plain words.
export const CARDS = [
  { id: 'bob', icon: '🙂', name: 'Bob himself', about: 'Voice, look, theme and house style.', topics: ['ev-bob', 'adv-voice', 'adv-look', 'adv-house'] },
  { id: 'how', icon: '⚡', name: 'How Bob works', about: 'Sessions, plans, notes, saved prompts, start-up and check-ins.', topics: ['ev-how', 'adv-prompts', 'adv-checkins'] },
  { id: 'brains', icon: '🧠', name: 'Brains and speed', about: 'Which brain does what, memory and engines.', topics: ['adv-brains', 'adv-speed', 'adv-engines'] },
  { id: 'net', icon: '🌐', name: 'My other Bobs', about: 'Bob-Net, your phone and sharing brains.', topics: ['adv-bobnet'] },
  { id: 'online', icon: '☁', name: 'Online and other apps', about: 'Cloud helpers, Telegram, Discord, rented brains, ComfyUI.', topics: ['adv-online', 'adv-apps'] },
  { id: 'may', icon: '✋', name: 'What Bob may do', about: 'Files, programs, apps and the tools he made.', topics: ['adv-hands', 'ev-howtos'] },
  { id: 'fun', icon: '🎲', name: 'Fun', about: 'Adventure and games.', topics: ['adv-adventure', 'adv-games'] },
  { id: 'pc', icon: '💻', name: 'This replicant matrix', about: 'Updates, folders, tidying up and removing Bob.', topics: ['ev-pc', 'ev-projects', 'ev-home', 'ev-save', 'adv-housekeeping', 'adv-remove'] }
];

export const VIEW_KEY = 'bob-settings-view';
export const allTopics = () => GROUPS.flatMap(([, ids]) => ids);
export const cardOf = (topic) => CARDS.find((c) => c.topics.includes(topic)) || null;
export const groupOf = (topic) => (GROUPS.find(([, ids]) => ids.includes(topic)) || [''])[0];

// Which view to start in. `saved` is what the toggle last stored; `oldSwitch` is the old "Show advanced
// settings" switch ('1' = it was on), so someone who had it on starts in Advanced. Otherwise Simple.
export function startView(saved, oldSwitch) {
  if (saved === 'simple' || saved === 'advanced') return saved;
  return oldSwitch === '1' ? 'advanced' : 'simple';
}

// Old addresses still land somewhere: a panel that moved, or an id written without its "adv-".
export function topicFor(id, moved = {}) {
  const all = allTopics();
  const t = moved[id] || id;
  if (all.includes(t)) return t;
  if (all.includes('adv-' + t)) return 'adv-' + t;
  return '';
}

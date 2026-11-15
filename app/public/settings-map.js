// Settings, two views of the same panels : Simple = topic cards, Advanced = a side list.
// One toggle swaps them. Nothing is hidden in either view: every panel sits on one card and in one group.
// Panel ids are the ones Help links and cards already jump to (ev-... and adv-...).

// Advanced: the side list, top to bottom. The groups line up with the Simple cards (Bob himself, How Bob works, Fun...).
export const GROUPS = [
  ['Bob', ['ev-bob', 'adv-personality', 'adv-voice', 'adv-look', 'adv-house', 'adv-presets']],
  ['Chat and jobs', ['ev-how', 'adv-jobs', 'adv-chatx', 'adv-prompts', 'adv-checkins', 'adv-daily', 'adv-quiet', 'adv-tools']],
  ['Brains', ['adv-brains', 'adv-speed', 'adv-engines']],
  ['Connections', ['adv-bobnet', 'adv-online', 'adv-email', 'adv-apps']],
  ['Agents', ['adv-claude', 'adv-openai', 'adv-gemini', 'adv-qwen', 'adv-opencode', 'adv-discord', 'adv-telegram']], // 1.5.228 one section per company and chat app
  ['What Bob may do', ['adv-hands', 'ev-howtos']],
  ['Fun', ['adv-adventure', 'adv-games']],
  ['This replicant matrix', ['ev-pc', 'ev-home', 'ev-save', 'ev-projects', 'ev-backup', 'adv-housekeeping', 'ev-lock', 'ev-secrets', 'adv-health', 'adv-remove']]
];

// Simple: the cards. `about` says what's inside, in a few plain words.
export const CARDS = [
  { id: 'bob', icon: '🙂', name: 'Bob himself', about: 'Voice, look, personality, house style and presets.', topics: ['ev-bob', 'adv-voice', 'adv-look', 'adv-personality', 'adv-house', 'adv-presets'] },
  { id: 'how', icon: '⚡', name: 'How Bob works', about: 'Sessions, plans, notes, jobs, saved prompts, start-up, check-ins.', topics: ['ev-how', 'adv-jobs', 'adv-prompts', 'adv-chatx', 'adv-quiet', 'adv-daily', 'adv-checkins', 'adv-tools'] },
  { id: 'brains', icon: '🧠', name: 'Brains and speed', about: 'Which brain does what, memory and engines.', words: 'calibrate calibration set up gpu card layers experts speed', topics: ['adv-brains', 'adv-speed', 'adv-engines'] },
  { id: 'net', icon: '🌐', name: 'My other Bobs', about: 'Bob-Net, your phone and sharing brains.', topics: ['adv-bobnet'] },
  { id: 'online', icon: '☁', name: 'Online and other apps', about: 'Cloud helpers, email, rentals, other apps.', words: 'comfyui openrouter rented brains', topics: ['adv-online', 'adv-email', 'adv-apps'] },
  { id: 'agents', icon: '🤝', name: 'Agents', about: 'Claude, OpenAI, Gemini, Qwen, OpenCode, Discord, Telegram.', words: 'claude anthropic codex chatgpt gemini google qwen opencode discord telegram chat head cube moderate moderator keep order kick ban spam bot', topics: ['adv-claude', 'adv-openai', 'adv-gemini', 'adv-qwen', 'adv-opencode', 'adv-discord', 'adv-telegram'] },
  { id: 'may', icon: '✋', name: 'What Bob may do', about: 'Files, programs, apps and the tools he made.', topics: ['adv-hands', 'ev-howtos'] },
  { id: 'fun', icon: '🎲', name: 'Fun', about: 'Adventure and games.', topics: ['adv-adventure', 'adv-games'] },
  { id: 'pc', icon: '💻', name: 'This replicant matrix', about: 'Updates, passcode, secrets, folders, backups, tidying, removing Bob.', topics: ['ev-pc', 'adv-health', 'ev-lock', 'ev-projects', 'ev-home', 'ev-secrets', 'ev-save', 'ev-backup', 'adv-housekeeping', 'adv-remove'] }
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

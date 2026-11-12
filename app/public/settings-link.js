// The link between the main window and the Settings window: names only, no page access, so tests can
// read it without a browser.

export const CHANNEL = 'bob-settings';
export const WINDOW_NAME = 'bob-settings';
export const WINDOW_SIZE = 'popup,width=1040,height=780';

// What the Settings page announces that the main window acts on.
export const RELAY = ['bob-auto-session', 'bob-brain-mode', 'bob-voice', 'bob-lab-switch', 'bob-web', 'bob-caps', 'bob-rent-slot',
  'bob-quarantine', 'bob-door', 'bob-update-started', 'bob-tidy', 'bob-ask', 'bob-downloads', 'bob-chat-redo', 'bob-harness', 'bob-open-chat'];

export const message = (name, detail) => ({ from: 'settings-window', name, detail: detail === undefined ? null : detail });

// Only plain section ids travel in the address (#adv-bobnet, #ev-pc).
export function jumpFromHash(hash) {
  let id = '';
  try { id = decodeURIComponent(String(hash || '').replace(/^#/, '')); } catch { return ''; }
  return /^(adv|ev)-[\w-]{1,40}$/.test(id) ? id : '';
}
// 1.5.210 a tab in sample-data mode opens Settings in sample mode too, so the real settings never show beside it.
const sampleQ = () => (globalThis.__bobSample ? `?sample=${encodeURIComponent(globalThis.__bobSample)}` : '');
export const settingsUrl = (jump) => '/settings.html' + sampleQ() + (jumpFromHash('#' + (jump || '')) ? '#' + jump : '');

// Settings gets its own window on a computer. On a phone or tablet (touch first, or a narrow screen) there are no
// separate windows, so it stays a page. `env` is passed in so tests don't read the real screen.
export function wantsWindow(env = {}) {
  if (!env.hasChannel) return false;
  if (env.coarse || env.standalone) return false;
  return (env.width || 0) >= 700;
}

// A message from the Settings window, checked before the main window acts on it.
export function accept(data) {
  if (!data || data.from !== 'settings-window' || typeof data.name !== 'string') return null;
  if (data.name === 'bob-changed') return { kind: 'changed' };
  if (data.name === 'bob-press') return ['ear', 'speak'].includes(data.detail?.id) ? { kind: 'press', id: data.detail.id } : null;
  return RELAY.includes(data.name) ? { kind: 'event', name: data.name, detail: data.detail ?? undefined } : null;
}

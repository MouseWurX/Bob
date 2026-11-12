// The link between the main window and the Lab's own window (public/lab.html): names only, no page access, so
// tests can read it without a browser. The Lab window reads the server itself; it only asks the main window to
// open Get models, Settings or the chat, and to show a note.
import { wantsWindow } from './settings-link.js';
import { goWhere } from './lab-go.js';

export const CHANNEL = 'bob-lab';
export const WINDOW_NAME = 'bob-lab';
export const WINDOW_SIZE = 'popup,width=1180,height=860';
export const LAB_URL = '/lab.html';

// Like Settings: its own window on a computer, a page over the chat on a phone or tablet. `env` is passed in so tests don't read the real screen.
export const labWantsWindow = (env = {}) => wantsWindow(env);

export const message = (name, detail) => ({ from: 'lab-window', name, detail: detail === undefined ? null : detail });

// A message from the Lab window, checked before the main window acts on it.
export function accept(data) {
  if (!data || data.from !== 'lab-window' || typeof data.name !== 'string') return null;
  if (data.name === 'go') { const where = goWhere(data.detail); return where ? { kind: 'go', where } : null; }
  if (data.name === 'note') { const text = typeof data.detail === 'string' ? data.detail.slice(0, 400) : ''; return text ? { kind: 'note', text } : null; }
  return null;
}

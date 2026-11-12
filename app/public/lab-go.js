// The Lab's "take me there" buttons. A message that says "get one in Get models" ends with a button that opens it,
// so no page is a dead end. The Lab (public/lab.js) handles the press; names only here, so tests read it without a browser.
export const GO = { models: 'Open Get models', engines: 'Open Settings, Engines', chat: 'Go to the chat' };
export const goWhere = (v) => (Object.hasOwn(GO, String(v)) ? String(v) : '');
export const goBtn = (where, label = GO[where]) => (goWhere(where) ? ` <button type="button" class="link" data-labgo="${where}">${label}</button>` : '');

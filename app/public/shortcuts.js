// Keyboard shortcuts: one list (the Help page, the Ctrl+/ list and the tests all read it) and the key matching.
// The extra shortcuts work while Settings, Bob himself, Keyboard shortcuts is on; the old ones (Enter, F1, Ctrl+B,
// Ctrl+J, Esc) always work. On a Mac, Ctrl is Cmd. Nothing here reads the real keyboard or system: the tests pass keys in.

// keys: what to press, written for Windows and Linux. always: works with the switch off too.
export const SHORTCUTS = [
  { id: 'send', keys: 'Enter', what: 'Send your message (Shift+Enter starts a new line)', always: true },
  { id: 'help', keys: 'F1', what: 'Open Help', always: true },
  { id: 'left', keys: 'Ctrl+B', what: 'Show or hide the left pane', always: true },
  { id: 'right', keys: 'Ctrl+J', what: 'Show or hide Now running', always: true },
  { id: 'close', keys: 'Esc', what: 'Close a pop-up or page', always: true },
  { id: 'newChat', keys: 'Ctrl+Shift+O', what: 'Start a new chat' },
  { id: 'stop', keys: 'Esc', where: 'in the message box while Bob is working', what: 'Stop Bob' },
  { id: 'search', keys: 'Ctrl+K', what: 'Search your chats, topics, pictures and notes' },
  { id: 'session', keys: 'Ctrl+Shift+S', what: 'Switch brains: open the Session list' },
  { id: 'focus', keys: '/', where: 'when you aren\'t typing', what: 'Go to the message box' },
  { id: 'lastMsg', keys: 'Up arrow', where: 'in an empty message box', what: 'Bring back your last message to change it' },
  { id: 'copyReply', keys: 'Ctrl+Shift+;', what: 'Copy Bob\'s last reply' },
  { id: 'settings', keys: 'Ctrl+,', what: 'Open Settings' },
  { id: 'list', keys: 'Ctrl+/', what: 'Show this list' }
];

// The keys as a Mac shows them.
export const macKeys = (keys) => keys.replace(/Ctrl\+/g, '⌘').replace(/Shift\+/g, '⇧').replace(/^Enter$/, 'Return');
export const keysFor = (s, mac = false) => (mac ? macKeys(s.keys) : s.keys);

// Which of the switchable shortcuts a key press is, or ''. e: { key, code, ctrlKey, metaKey, shiftKey, altKey }.
// ctx: { mac, typing (the focus is in a box you type in), inInput (the focus is Bob's message box), empty (that box
// is empty), busy (Bob is working), dialog (a pop-up or page is open) }.
export function match(e, ctx = {}) {
  if (!e || e.isComposing) return '';
  const mod = ctx.mac ? e.metaKey && !e.ctrlKey : e.ctrlKey && !e.metaKey;
  const key = String(e.key || '');
  const k = key.toLowerCase();
  if (mod && !e.altKey) {
    if (e.shiftKey && (k === 'o' || e.code === 'KeyO')) return 'newChat';
    if (e.shiftKey && (k === 's' || e.code === 'KeyS')) return 'session';
    if (e.shiftKey && (key === ';' || key === ':' || e.code === 'Semicolon')) return 'copyReply';
    if (!e.shiftKey && k === 'k') return 'search';
    if (!e.shiftKey && key === ',') return 'settings';
    if (key === '/' || key === '?' || e.code === 'Slash') return 'list';
    return '';
  }
  if (e.ctrlKey || e.metaKey || e.altKey) return '';
  if (key === 'Escape' && ctx.inInput && ctx.busy && !ctx.dialog) return 'stop';
  if (key === 'ArrowUp' && !e.shiftKey && ctx.inInput && ctx.empty) return 'lastMsg';
  if (key === '/' && !ctx.typing && !ctx.dialog) return 'focus';
  return '';
}

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// The list as a table (the Ctrl+/ pop-up). on: whether the switch is on.
export function listHtml({ mac = false, on = false } = {}) {
  const row = (s) => `<tr><td><kbd>${esc(keysFor(s, mac))}</kbd></td><td>${esc(s.what)}${s.where ? ` <span class="muted">(${esc(s.where)})</span>` : ''}</td></tr>`;
  return `<table class="keys-table"><tbody>${SHORTCUTS.filter((s) => s.always).map(row).join('')}</tbody></table>
    <h4>${on ? 'On' : 'Off'}: Settings, Bob himself, Keyboard shortcuts</h4>
    <table class="keys-table"><tbody>${SHORTCUTS.filter((s) => !s.always).map(row).join('')}</tbody></table>`;
}

// Wires the keys up in the main window. doc: the page; isOn(): the switch; act(id): does it; ctx(): the state above.
export function installShortcuts({ doc, isOn, act, ctx }) {
  doc.addEventListener('keydown', (e) => {
    if (e.defaultPrevented || !isOn()) return;
    const id = match(e, ctx(e));
    if (!id) return;
    if (act(id, e) !== false) e.preventDefault();
  });
}

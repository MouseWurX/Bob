// 1.5.53: the words in the "Bob's thinking" window (public/mind.js), kept apart so the tests can check them.
export const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// The header line: every brain Bob holds now, with where it sits.
export function brainsLine(st) {
  const list = (st?.models || []).map((m) => `${m.label || m.name}${m.beside ? ' (beside)' : m.chat ? ' (chat brain)' : ''} on the ${m.onCard ? 'graphics card' : 'processor'}`);
  if (st?.picture) list.push(`picture model on the graphics card (${st.picture.state})`);
  return list.length ? `Loaded: ${list.join(' · ')}` : 'Loaded: nothing (memory freed)';
}
// Who is thinking, the same way every time: "Bob", or the copy's name and job, like the 🛰 Moot line ("Bobcat (reviewer)").
const ROLE = { reviewer: 'reviewer', tinker: 'coding', ledger: 'spreadsheets', scout: 'research', painter: 'prompt writer', eyes: 'eyes' };
export function thinker(who, copies = {}) {
  if (!who || who === 'bob') return 'Bob';
  const role = ROLE[who] || who;
  return copies[who] ? `${copies[who]} (${role})` : `Bob's ${role} copy`;
}
export function thinkLabel(ev, copies = {}) {
  const brain = ev.label || ev.model;
  return `💭 ${thinker(ev.who, copies)} thinking${brain ? ` on ${brain}` : ''}`;
}
export function toolLine(ev) {
  const s = String(ev.summary || ev.name || '');
  if (/^hat:/.test(s)) return null; // the hat line says it better
  if (ev.name === 'remember') return ['📝 Note to self: ' + s.replace(/^remember:\s*/, ''), ''];
  if (ev.name === 'notice_board') return ['📝 Checks the notice board', ''];
  return ['🔧 ' + s, 'mind-tool'];
}


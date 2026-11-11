// The small ask box (A shortcut from anywhere: Settings, How Bob works, 🌙 Quiet hours and shortcut). Bob.exe opens
// this page on top of any app when the key is pressed. It keeps its own chat, "ask-box", so it never lands in the
// middle of the chat open in Bob's window. Enter sends, Shift+Enter is a new line, Esc puts the box away.
export const ASK_CHAT = 'ask-box';
const $ = (id) => document.getElementById(id);
const input = $('askIn'), out = $('askOut'), note = $('askNote');
let turn = '';

function post(url, data) {
  return fetch(url, { method: 'POST', headers: { 'content-type': 'application/json', 'x-bob': '1' }, body: JSON.stringify(data) }).then(async (r) => ({ ok: r.ok, data: await r.json().catch(() => ({})) }));
}

// Only this chat's reply is shown here, as plain text.
const es = new EventSource('/api/events');
es.onmessage = (m) => {
  let ev; try { ev = JSON.parse(m.data); } catch { return; }
  if (ev.sessionId !== ASK_CHAT) return;
  if (ev.type === 'start') { turn = ev.turnId; out.textContent = ''; note.textContent = 'Bob is answering...'; }
  if (ev.turnId && turn && ev.turnId !== turn) return;
  if (ev.type === 'token') out.textContent += ev.text || '';
  if (ev.type === 'error') { out.textContent += `\n\n${ev.text || 'Something went wrong.'}`; }
  if (ev.type === 'done') { note.textContent = 'Done. Ask again, or Open in Bob to carry on there.'; input.disabled = false; input.focus(); }
};
es.onerror = () => { note.textContent = 'Bob isn\'t answering. Is he still running?'; };

$('askForm').onsubmit = async (e) => {
  e.preventDefault();
  const text = input.value.trim();
  if (!text) return;
  input.value = '';
  out.textContent = '';
  note.textContent = 'Sent. Waiting for Bob...';
  const r = await post('/api/chat', { sessionId: ASK_CHAT, text, effort: 'low' }).catch(() => ({ ok: false, data: {} }));
  if (!r.ok) { note.textContent = r.data.error || 'Couldn\'t reach Bob.'; return; }
  if (r.data.ahead) note.textContent = `Queued, ${r.data.ahead} ahead.`;
};
input.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); $('askForm').requestSubmit(); }
});
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') window.close(); });
// Open in Bob: his window shows the ask box's chat (public/harness-chat.js listens for this) and comes to the front.
$('askOpen').onclick = () => {
  try { localStorage.setItem('bob-open-chat', JSON.stringify({ id: ASK_CHAT, at: Date.now() })); } catch {}
  post('/api/harness/show', {}).catch(() => {});
};
input.focus();

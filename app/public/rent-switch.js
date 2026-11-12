// 1.5.127: the "🏗 Rented brain" switch on the chat page, in the Effort row. It only shows while a rented brain is in
// its slot (Settings, Brains, Rented brain). On: every message you send runs on the rented brain. The first one shows the
// Hire it card with the cost; after that it carries on without asking until about a dollar more is spent, or you
// switch it off. Off: everything runs on this replicant matrix. It is per window and goes back to Off when Bob starts.
const $ = (id) => document.getElementById(id);
const KEY = 'bob-rent-on';

export function createRentSwitch({ note }) {
  const btn = $('rentBtn'), st = $('rentBtnSt');
  if (!btn) return { on: () => false, update() {}, refresh() {} };
  let on = false, name = '';
  try { on = sessionStorage.getItem(KEY) === '1'; } catch {}

  function draw() {
    btn.hidden = !name;
    btn.setAttribute('aria-checked', String(on));
    st.textContent = on ? 'On' : 'Off';
    btn.title = on ? `Every message runs on ${name}, a brain hired from an online service. The chat and any files you attach go to that service, and it costs money (the card says how much). Click to run things here again.`
      : `Click to run your messages on ${name}, a brain hired from an online service. It costs money and sends the chat to that service: a card asks you first.`;
  }
  async function load() {
    try { const r = await fetch('/api/status'); const j = await r.json(); name = j.rented || ''; if (!name) on = false; draw(); } catch {}
  }
  async function toggle() {
    on = !on;
    try { sessionStorage.setItem(KEY, on ? '1' : '0'); } catch {}
    draw();
    if (on) note(`Rented brain is on: your next message goes to ${name}. A card asks you before anything is hired.`);
    else { note('Rented brain is off. Everything runs here again.'); fetch('/api/rent/forget', { method: 'POST', headers: { 'content-type': 'application/json', 'x-bob': '1' }, body: '{}' }).catch(() => {}); }
  }
  btn.onclick = toggle;
  window.addEventListener('bob-caps', load);
  window.addEventListener('bob-rent-slot', (e) => { name = e.detail?.rental || ''; if (!name) on = false; draw(); });
  draw(); load();
  return { on: () => on && Boolean(name), update(v) { name = v || ''; if (!name) on = false; draw(); }, refresh: load };
}

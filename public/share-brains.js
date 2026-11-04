// Settings, Connections: "Bob-Net: share work with my other Bobs" (src/share-brains.js). Both switches off unless you turn them on.
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

async function api(url, data) {
  const r = await fetch(url, data === undefined ? {} : { method: 'POST', headers: { 'content-type': 'application/json', 'x-bob': '1' }, body: JSON.stringify(data) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || `Error ${r.status}`);
  return j;
}

const WHEN = [
  ['gaming', 'While I\'m gaming', 'The processor stays with the game. Your other Bob thinks, and this Bob only runs the tools.'],
  ['busy', 'While I\'m gaming or busy', 'Also while Bob is working on a big job here, so quick chats don\'t wait for it.'],
  ['always', 'Always, for quick replies', 'Good on a small laptop or handheld: your bigger Bob thinks every quick reply.']
];
const CAN = { pictures: 'pictures', video: 'clips', music: 'music', sfx: 'sounds', web: 'web research', think: 'Medium-effort thinking' };
const WHY = { 'too long': 'his brain has no room for chats this long (start a new chat, or pick another Bob)', cant: 'can\'t do that kind of job', busy: 'busy with his own job', gaming: 'gaming, so he said no', off: 'not lending', 'not reachable': 'not reachable', 'too slow': 'too slow last time', 'passcode not accepted': 'passcode not accepted', 'door closed': '"Let my other replicant matrices in" is off over there', 'no brain': 'has no quick brain' };

export function shareBrainsHtml() {
  return '<div class="share-box"><strong>Bob-Net: share work with my other Bobs</strong><p class="muted">Loading…</p></div>';
}

export async function mountShareBrains(box) {
  if (!box) return;
  let v, msg = '';
  const can = (l) => (l.jobs?.length ? ` Takes jobs: ${l.jobs.map((x) => CAN[x] || x).join(', ')}${l.jobsBusy ? ` (${esc(WHY[l.jobsBusy] || l.jobsBusy)} right now)` : ''}.` : '');
  const row = (l) => `<li><strong>${esc(l.name)}</strong> <code>${esc(l.address)}</code> <span class="muted">${l.ok === true ? `ready${l.brain ? `, ${esc(l.brain)}` : ''}` : l.ok === false ? esc(WHY[l.why] || l.why) : 'not checked yet'}${l.ctx ? `, room for a chat of about ${Math.max(1, Math.round((l.ctx * 0.75) / 1000))},000 words` : ''}${l.speed ? `, about ${Math.round(l.speed)} words a second` : ''}.${can(l)}</span>
    <button type="button" data-share-up="${esc(l.address)}" title="Ask this one earlier">↑</button> <button type="button" data-share-rm="${esc(l.address)}">Remove</button></li>`;
  const draw = () => {
    box.innerHTML = `<strong>Bob-Net: share work with my other Bobs</strong> <span class="tag">off unless you turn it on</span>
      <label class="switch"><input type="checkbox" data-share-lend ${v.lend ? 'checked' : ''}><span><strong>Lend my brain</strong><br><span class="muted">Your other Bobs can ask this Bob to think a quick reply. He only thinks and sends the words back. Nothing runs on this replicant matrix for them, and he keeps nothing. He says no while he's gaming or busy. It goes through the same door as <strong>Let my other replicant matrices in</strong>, so that has to be on too.${v.lend && !v.doorOpen ? ' <strong>That door is off right now, so nobody can borrow from this Bob yet.</strong>' : ''}</span></span></label>
      <label class="switch"><input type="checkbox" data-share-take ${v.takeJobs ? 'checked' : ''}><span><strong>Take jobs from my other Bobs</strong><br><span class="muted">Your other Bobs can hand this Bob whole jobs he has the models for: pictures, clips, music, sounds, web research or Medium-effort thinking. He says no while gaming or when his queue is full. Their jobs can't touch files, programs, reminders or memory here. Finished files go back, and a copy stays in his save folder. Needs <strong>Let my other replicant matrices in</strong>.</span></span></label>
      <label class="switch"><input type="checkbox" data-share-borrow ${v.borrow.on ? 'checked' : ''}><span><strong>Borrow a brain</strong><br><span class="muted">Bob asks one of your other Bobs to think, then runs the tools here himself, with his own OK cards. Each time, the chat so far and what Bob remembers about you go to that Bob (your own replicant matrices on Tailscale only; it keeps none of it). If none answers within a few seconds, Bob thinks it himself like always. Quick replies only: nothing on Medium or higher, and nothing with pictures.</span></span></label>
      <label class="switch"><input type="checkbox" data-share-send ${v.borrow.jobs ? 'checked' : ''}><span><strong>Send jobs to my other Bobs</strong><br><span class="muted">A job Bob can't do here, or one that would wait, goes to whichever of your other Bobs is free (least busy first). Jobs that need this replicant matrix always stay here. The job and the last few lines of the chat go to that Bob; the reply, OK cards and files come back.</span></span></label>
      <div class="row"><strong>Borrow when:</strong> <select data-share-when>${WHEN.map(([id, label]) => `<option value="${id}" ${v.borrow.when === id ? 'selected' : ''}>${label}</option>`).join('')}</select>
        <span class="muted">${esc(WHEN.find((w) => w[0] === v.borrow.when)?.[2] || '')}</span></div>
      <div class="row"><strong>My other Bobs</strong> <span class="muted">Bob picks the one that's free and has room for the chat, the one he used last first (he still has the chat in mind), then the fastest. This order breaks ties.</span></div>
      <ul class="share-list">${v.lenders.length ? v.lenders.map(row).join('') : '<li class="muted">None yet.</li>'}</ul>
      <form class="row" data-share-add><input name="name" placeholder="Name (Phone, Laptop…)" maxlength="40"> <input name="address" placeholder="100.x.y.z:7777 or name.ts.net:7777" required> <input name="passcode" type="password" placeholder="Its passcode" autocomplete="off"> <button>Add</button> <button type="button" data-share-check>Check them</button></form>
      ${msg ? `<p class="muted" role="status">${esc(msg)}</p>` : ''}
      <details class="more"><summary>More</summary><p class="muted">On the Bob that lends: turn on <strong>Let my other replicant matrices in</strong> and <strong>Lend my brain</strong>. The first time, the passcode is made for you and shown once. Then add its address and passcode here. Tailscale addresses only. What Bob sends for each reply is the chat so far and his instructions, including what he remembers about you. It only goes to your own replicant matrices on Tailscale, and the lender keeps none of it. Your phone can lend too, once Bob for Android has <strong>Lend my brain</strong>. A phone runs warm and uses battery while it thinks, so keep it plugged in while you game.</p></details>`;
  };
  const load = async () => { v = await api('/api/share-brains'); draw(); };
  const change = async (patch) => {
    try { v = await api('/api/share-brains', patch); msg = ''; } catch (e) { msg = e.message; }
    draw();
  };
  box.addEventListener('change', (e) => {
    if (e.target.matches('[data-share-lend]')) change({ lend: e.target.checked });
    if (e.target.matches('[data-share-take]')) change({ takeJobs: e.target.checked });
    if (e.target.matches('[data-share-send]')) change({ sendJobs: e.target.checked, check: e.target.checked });
    if (e.target.matches('[data-share-borrow]')) change({ borrow: e.target.checked, check: e.target.checked });
    if (e.target.matches('[data-share-when]')) change({ when: e.target.value });
  });
  box.addEventListener('submit', (e) => {
    if (!e.target.matches('[data-share-add]')) return;
    e.preventDefault();
    const f = new FormData(e.target);
    change({ addBob: { name: f.get('name'), address: f.get('address'), passcode: f.get('passcode') }, check: true });
  });
  box.addEventListener('click', (e) => {
    const rm = e.target.closest('[data-share-rm]'), up = e.target.closest('[data-share-up]');
    if (rm) change({ removeBob: rm.dataset.shareRm });
    if (up) { const order = v.lenders.map((l) => l.address); const i = order.indexOf(up.dataset.shareUp); if (i > 0) { order.splice(i - 1, 0, order.splice(i, 1)[0]); change({ order }); } }
    if (e.target.closest('[data-share-check]')) change({ check: true });
  });
  try { await load(); } catch (e) { box.innerHTML = `<strong>Bob-Net: share work with my other Bobs</strong><p class="muted">${esc(e.message)}</p>`; }
}

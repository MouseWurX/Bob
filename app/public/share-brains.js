// Settings, Bob-Net: My other Bobs and What they share (src/share-brains.js). Both switches off unless you turn them on.
import { esc } from './util.js';
import { tip } from './tips.js';

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
// Spread big brains over my other Bobs' cards (src/share-card.js).
const SPREAD = [
  ['off', 'Never', 'Every brain loads on this replicant matrix only, like always.'],
  ['toobig', 'Only brains too big for this replicant matrix', 'A brain bigger than this card and memory can hold together goes over the cards your other Bobs lend.'],
  ['big', 'Any brain bigger than my card', 'Also brains that would otherwise spill from the card into memory. Only faster on a quick network (a cable, or fast Wi-Fi close to the router).']
];
const CAN = { pictures: 'pictures', video: 'clips', music: 'music', sfx: 'sounds', web: 'web research', think: 'Medium-effort thinking' };
// 1.5.123 Pass my Bob-Net along: what came of each introduction this Bob made.
const INTRO = { introduced: (d) => `${esc(d.a)} and ${esc(d.b)}: introduced, so they pair by themselves.`, already: (d) => `${esc(d.a)} and ${esc(d.b)}: already on each other's list.`, off: (d) => `${esc(d.who)} has Pass my Bob-Net along off, so no introduction.`, old: (d) => `${esc(d.who)} can't be introduced yet: Bob there needs an update (the phone app doesn't know this yet).`, quiet: (d) => `${esc(d.who)} wasn't reachable. Bob tries again in an hour.`, no: (d) => `${esc(d.who)} said no. Bob tries again in an hour.` };
const sinceShort = (ms) => { const m = Math.round(ms / 60000); return m < 1 ? 'just now' : m === 1 ? '1 min ago' : m < 60 ? `${m} min ago` : `${Math.round(m / 60)} h ago`; };
const WHY = { 'too long': 'his brain has no room for chats this long (start a new chat, or pick another Bob)', cant: 'can\'t do that kind of job', busy: 'busy with his own job', gaming: 'gaming, so he said no', off: 'not lending', 'not reachable': 'not reachable', 'too slow': 'too slow last time', 'passcode not accepted': 'passcode not accepted', 'door closed': '"Let my other replicant matrices in" is off over there', 'no brain': 'has no quick brain' };

export function shareBrainsHtml() {
  return '<div class="share-box"><h4 class="ssub">My other Bobs</h4><p class="muted">Loading…</p></div>';
}

// 1.5.99 Pair with my other Bobs: what each found device shows, and how a pairing is going.
const PAIRING = {
  waiting: (p, name) => `Waiting for a yes on ${esc(name)}. Its card shows the number <strong>${esc(p.code)}</strong>: check it matches, then press <strong>Yes, pair us</strong> over there.`,
  paired: (p) => p.both ? 'Paired. You\'re on each other\'s list.' : 'Paired one way: this Bob can use that one. To let it use this Bob too, turn on <strong>Let my other replicant matrices in</strong> here, then press Pair again.',
  no: () => 'That Bob said no.',
  timeout: () => 'Nobody answered the card in time. Press Pair to try again.',
  failed: (p) => esc(p.why || 'Something went wrong. Press Pair to try again.')
};

export async function mountShareBrains(box) {
  if (!box) return;
  let v, msg = '', found = null, finding = false, poll = null;
  const pairRow = (f) => {
    const p = found.pairing?.[f.address];
    const state = p ? PAIRING[p.state]?.(p, f.device) || '' : '';
    const btn = (label) => `<button type="button" data-pair="${esc(f.address)}">${label}</button>`;
    let what;
    if (!f.bob) what = f.why === 'door' ? 'Bob is there, but his door is shut. Turn on <strong>Let my other replicant matrices in</strong> on it, then press Find again.' : 'No Bob answering. Is Bob open on it, with <strong>Let my other replicant matrices in</strong> on?';
    else if (f.pair < 1) what = 'Bob is there, but too old to pair. Update him, or add him by hand under More.';
    else what = `Bob ${esc(f.version || '')} is there.${f.paired ? ' Already in My other Bobs.' : ''}`;
    const can = f.bob && f.pair >= 1 && p?.state !== 'waiting';
    return `<li><strong>${esc(f.device)}</strong>${f.os ? ` <span class="muted">(${esc(f.os[0].toUpperCase() + f.os.slice(1))})</span>` : ''} <span class="muted">${what}</span> ${can ? btn(f.paired ? 'Pair again' : 'Pair') : ''}${state ? `<br><span role="status">${state}</span>` : ''}</li>`;
  };
  const pairBox = () => {
    if (!found) return `<div class="row"><button type="button" data-pair-find ${finding ? 'disabled' : ''}>${finding ? 'Looking…' : 'Find my other Bobs'}</button> <span class="muted">Finds your Bobs on Tailscale. Press <strong>Pair</strong>, then <strong>Yes, pair us</strong> on the other one. No addresses or passcodes to type.</span></div>`;
    if (!found.tailscale) return `<div class="row"><button type="button" data-pair-find>Find again</button> <span class="muted">I can't ask Tailscale for your devices on this replicant matrix. Type the other Bob's Tailscale address and press Pair:</span></div>
      <form class="row" data-pair-by-address><input name="address" placeholder="100.x.y.z or name.ts.net" required> <button>Pair</button></form>
      ${Object.entries(found.pairing || {}).map(([a, p]) => `<p role="status"><code>${esc(a)}</code>: ${PAIRING[p.state]?.(p, p.name || a.split(':')[0]) || ''}</p>`).join('')}`;
    const ready = found.bobs.filter((f) => f.bob && f.pair >= 1 && !f.paired && found.pairing?.[f.address]?.state !== 'waiting');
    return `${found.here ? '' : '<p class="muted"><strong>This replicant matrix isn\'t on Tailscale right now.</strong> Open Tailscale and sign in.</p>'}
      ${found.door ? '' : '<p class="muted">Your other Bobs can be added here, but they can\'t use this one until <strong>Let my other replicant matrices in</strong> is on.</p>'}
      <ul class="share-list">${found.bobs.length ? found.bobs.map(pairRow).join('') : '<li class="muted">None of your other devices are online on Tailscale.</li>'}</ul>
      ${found.offline?.length ? `<p class="muted">Offline right now: ${found.offline.map(esc).join(', ')}.</p>` : ''}
      <div class="row"><button type="button" data-pair-find ${finding ? 'disabled' : ''}>${finding ? 'Looking…' : 'Find again'}</button>${ready.length > 1 ? ' <button type="button" data-pair-all>Pair with all of them</button>' : ''}</div>`;
  };
  const watch = () => {
    clearInterval(poll);
    poll = setInterval(async () => {
      try {
        const j = await api('/api/bob-net/pair');
        found = { ...(found || {}), pairing: j.pairing };
        const busy = Object.values(j.pairing || {}).some((p) => p.state === 'waiting');
        if (!busy) { clearInterval(poll); poll = null; await refresh(); return; }
        draw();
      } catch { clearInterval(poll); poll = null; }
    }, 2000);
  };
  const pair = async (address) => {
    try { const r = await api('/api/bob-net/pair', { address }); found = found || { tailscale: false, bobs: [] }; found.pairing = { ...(found.pairing || {}), [r.address]: r }; msg = ''; }
    catch (e) { msg = e.message; }
    draw(); watch();
  };
  const find = async () => {
    finding = true; draw();
    try { const j = await api('/api/bob-net/find'); const keep = found?.pairing; found = j; const now = await api('/api/bob-net/pair'); found.pairing = { ...(keep || {}), ...now.pairing }; msg = ''; }
    catch (e) { msg = e.message; }
    finding = false; draw();
  };
  const can = (l) => (l.jobs?.length ? ` Takes jobs: ${l.jobs.map((x) => CAN[x] || x).join(', ')}${l.jobsBusy ? ` (${esc(WHY[l.jobsBusy] || l.jobsBusy)} right now)` : ''}.` : '');
  const row = (l) => `<li><strong>${esc(l.name)}</strong> <code>${esc(l.address)}</code> <span class="muted">${l.ok === true ? `ready${l.brain ? `, ${esc(l.brain)}` : ''}` : l.ok === false ? esc(WHY[l.why] || l.why) : 'not checked yet'}${l.ctx ? `, room for a chat of about ${Math.max(1, Math.round((l.ctx * 0.75) / 1000))},000 words` : ''}${l.speed ? `, about ${Math.round(l.speed)} words a second` : ''}.${can(l)}</span>
    <button type="button" data-share-up="${esc(l.address)}" title="Ask this one earlier">↑</button> <button type="button" data-share-rm="${esc(l.address)}">Remove</button></li>`;
  const draw = () => {
    box.innerHTML = `<h4 class="ssub">My other Bobs</h4>
      <div class="pair-box"><strong>Pair with my other Bobs</strong>${pairBox()}</div>
      <p class="muted">Bob picks the one that's free and has room for the chat, the one he used last first (he still has the chat in mind), then the fastest. This order breaks ties.</p>
      <ul class="share-list">${v.lenders.length ? v.lenders.map(row).join('') : '<li class="muted">None yet.</li>'}</ul>
      <div class="row"><button type="button" data-share-check>Check them</button></div>
      <h4 class="ssub">What they share <span class="tag">off unless you turn it on</span></h4>
      ${v.doorOpen ? '' : '<p class="muted door-off">These need <strong>Let my other replicant matrices in</strong>, just above.</p>'}
      <label class="switch"><input type="checkbox" data-share-lend ${v.lend ? 'checked' : ''}><span><strong>Lend my brain</strong> ${tip('Your other Bobs can ask this Bob to think a quick reply. He only thinks and sends the words back. Nothing runs on this replicant matrix for them, and he keeps nothing. He says no while he\'s gaming or busy.', 'Lend my brain')}</span></label>
      <label class="switch"><input type="checkbox" data-share-take ${v.takeJobs ? 'checked' : ''}><span><strong>Take jobs from my other Bobs</strong> ${tip('Your other Bobs can hand this Bob whole jobs he has the models for: pictures, clips, music, sounds, web research or Medium-effort thinking. He says no while gaming or when his queue is full. Their jobs can\'t touch files, programs, reminders or memory here. Finished files go back, and a copy stays in his save folder.', 'Take jobs from my other Bobs')}</span></label>
      <label class="switch"><input type="checkbox" data-share-borrow ${v.borrow.on ? 'checked' : ''}><span><strong>Borrow a brain</strong> ${tip('Bob asks one of your other Bobs to think, then runs the tools here himself, with his own OK cards. If none answers within a few seconds, Bob thinks it himself like always. Quick replies only: nothing on Medium or higher, and nothing with pictures.', 'Borrow a brain')}<br><span class="muted keep">Each time, the chat so far and what Bob remembers about you go to that Bob (your own replicant matrices on Tailscale only; it keeps none of it).</span></span></label>
      <div class="row"><strong>Borrow when:</strong> <select data-share-when>${WHEN.map(([id, label]) => `<option value="${id}" ${v.borrow.when === id ? 'selected' : ''}>${label}</option>`).join('')}</select>
        <span class="muted">${esc(WHEN.find((w) => w[0] === v.borrow.when)?.[2] || '')}</span></div>
      <label class="switch"><input type="checkbox" data-share-send ${v.borrow.jobs ? 'checked' : ''}><span><strong>Send jobs to my other Bobs</strong> ${tip('A job Bob can\'t do here, or one that would wait, goes to whichever of your other Bobs is free (least busy first). Jobs that need this replicant matrix always stay here. The job and the last few lines of the chat go to that Bob; the reply, OK cards and files come back.', 'Send jobs to my other Bobs')}</span></label>
      <label class="switch"><input type="checkbox" data-share-card ${v.lendCard ? 'checked' : ''}><span><strong>Lend my graphics card</strong> ${tip('Your other Bobs can ask for room on this replicant matrix\'s graphics card when they load a brain too big for their own. Only while they use it, only on this replicant matrix\'s Tailscale address, and never while Bob is gaming: Gaming takes the card back.', 'Lend my graphics card')}<br><span class="muted keep">Sends and receives parts of the brain and the numbers it works on, with your own Bobs over Tailscale. No chats and no files. Your own brain here gets less room while the card is lent.</span></span></label>
      <div class="row"><strong>Spread big brains over my other Bobs' cards:</strong> <select data-share-spread>${SPREAD.map(([id, label]) => `<option value="${id}" ${(v.spread || 'off') === id ? 'selected' : ''}>${label}</option>`).join('')}</select>
        <span class="muted">${esc(SPREAD.find((w) => w[0] === (v.spread || 'off'))?.[2] || '')} Your other Bobs need <strong>Lend my graphics card</strong> on. If none says yes, the brain loads here.</span></div>
      <label class="switch"><input type="checkbox" data-share-pass ${v.passAlong ? 'checked' : ''}><span><strong>Pass my Bob-Net along</strong> ${tip('Your Bobs with this on introduce each other. When this Bob is paired with two Bobs that both have it on, they pair with each other too, with no card to press.', 'Pass my Bob-Net along')}<br><span class="muted keep">Sends your other Bobs each other's name and Tailscale address, nothing else; passcodes still pass only between the two being paired.</span></span></label>
      ${v.passAlong && v.introductions?.length ? `<ul class="share-list intro-list">${v.introductions.map((d) => `<li class="muted">${INTRO[d.state]?.(d) || esc(d.state)} <span class="muted">(${sinceShort(Date.now() - d.at)})</span></li>`).join('')}</ul>` : v.passAlong && v.lenders.length < 2 ? '<p class="muted">With two or more Bobs on the list, they get introduced to each other.</p>' : ''}
      ${msg ? `<p class="muted" role="status">${esc(msg)}</p>` : ''}
      <details class="more"><summary>More</summary><p class="muted"><strong>Add one by hand</strong> (if pairing can't reach it): its Tailscale address and the passcode from its <strong>Let my other replicant matrices in</strong>.</p>
      <form class="row" data-share-add><input name="name" placeholder="Name (Phone, Laptop…)" maxlength="40"> <input name="address" placeholder="100.x.y.z:7777 or name.ts.net:7777" required> <input name="passcode" type="password" placeholder="Its passcode" autocomplete="off"> <button>Add</button></form>
      <p class="muted">On the Bob that lends: turn on <strong>Let my other replicant matrices in</strong> and <strong>Lend my brain</strong>. Pairing puts the two Bobs on each other's lists; it doesn't switch anything on. Tailscale addresses only. What Bob sends for each reply is the chat so far and his instructions, including what he remembers about you. It only goes to your own replicant matrices on Tailscale, and the lender keeps none of it. Your phone can lend too, once Bob for Android has <strong>Lend my brain</strong>. A phone runs warm and uses battery while it thinks, so keep it plugged in while you game.</p></details>`;
  };
  const load = async () => { v = await api('/api/share-brains'); draw(); };
  // After a pairing (either side), the list and the row's button catch up at once.
  const refresh = async () => { try { v = await api('/api/share-brains'); if (found?.bobs) found.bobs.forEach((f) => { f.paired = v.lenders.some((l) => l.address === f.address); }); draw(); } catch {} };
  window.addEventListener('bob-pair-done', () => { if (box.isConnected) refresh(); });
  const change = async (patch) => {
    try { v = await api('/api/share-brains', patch); msg = ''; } catch (e) { msg = e.message; }
    draw();
  };
  box.addEventListener('change', (e) => {
    if (e.target.matches('[data-share-lend]')) change({ lend: e.target.checked });
    if (e.target.matches('[data-share-take]')) change({ takeJobs: e.target.checked });
    if (e.target.matches('[data-share-pass]')) change({ passAlong: e.target.checked });
    if (e.target.matches('[data-share-card]')) change({ lendCard: e.target.checked });
    if (e.target.matches('[data-share-spread]')) change({ spread: e.target.value, check: e.target.value !== 'off' });
    if (e.target.matches('[data-share-send]')) change({ sendJobs: e.target.checked, check: e.target.checked });
    if (e.target.matches('[data-share-borrow]')) change({ borrow: e.target.checked, check: e.target.checked });
    if (e.target.matches('[data-share-when]')) change({ when: e.target.value });
  });
  box.addEventListener('submit', (e) => {
    if (e.target.matches('[data-pair-by-address]')) { e.preventDefault(); pair(new FormData(e.target).get('address')); return; }
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
    if (e.target.closest('[data-pair-find]')) find();
    const pb = e.target.closest('[data-pair]');
    if (pb) { pb.disabled = true; pair(pb.dataset.pair); }
    if (e.target.closest('[data-pair-all]')) (async () => { for (const f of found.bobs.filter((x) => x.bob && x.pair >= 1 && !x.paired)) await pair(f.address); })();
  });
  // 1.5.98: the door switch sits just above, in This Bob; when it changes, redraw so the one door line is right.
  document.addEventListener('bob-door', () => { if (box.isConnected) load().catch(() => {}); });
  try { await load(); } catch (e) { box.innerHTML = `<h4 class="ssub">My other Bobs</h4><p class="muted">${esc(e.message)}</p>`; }
}

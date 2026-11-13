// Settings, Bob-Net: My other Bobs and What they share (src/share-brains.js). Both switches off unless you turn them on.
import { sayRefused, switchSelector } from './refused.js'; // 1.5.213: a refused switch says why right under it
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
const CAN = { pictures: 'pictures', video: 'clips', music: 'music', sfx: 'sounds', model3d: '3D models', web: 'web research', think: 'Medium-effort thinking' };
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
  let v, msg = '', found = null, finding = false, poll = null, linkText = null, wifiText = '', wifiBusy = false, linksText = ''; // linkText: the link log's last notes, null until asked for
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
  // SUDDAR: how far away each Bob is (his answer's round trip), and what that means for Bigger Bobs.
  const far = (l) => (l.ok === true && l.ms > 0 ? `, ${l.ms < 1 ? 'under 1' : Math.round(l.ms)} ms away (${l.ms <= 8 ? 'close' : l.ms <= 40 ? 'Wi-Fi close' : 'far'})${l.lendCard ? `, lends his card${l.scut ? ' with SCUT' : ''}` : ''}` : '');
  const row = (l) => `<li><strong>${esc(l.name)}</strong> <code>${esc(l.address)}</code> <span class="muted">${l.ok === true ? `ready${l.brain ? `, ${esc(l.brain)}` : ''}` : l.ok === false ? esc(WHY[l.why] || l.why) : 'not checked yet'}${l.ctx ? `, room for a chat of about ${Math.max(1, Math.round((l.ctx * 0.75) / 1000))},000 words` : ''}${l.speed ? `, about ${Math.round(l.speed)} words a second` : ''}${far(l)}.${can(l)}</span>
    <button type="button" data-share-up="${esc(l.address)}" title="Ask this one earlier">↑</button> <button type="button" data-share-rm="${esc(l.address)}">Remove</button></li>`;
  // 1.5.213: what a switch needs first, said before it's pressed. Borrowing, sending jobs and asking for checks need
  // another Bob on the list; and the refused switch says why right under it.
  const decorate = () => {
    if (!v.lenders.length) {
      const need = ['[data-share-borrow]', '[data-share-send]', '[data-share-askchecks]'].map((q) => box.querySelector(q)).filter((x) => x && !x.checked);
      need.forEach((x) => { x.disabled = true; x.closest('label')?.setAttribute('title', 'Pair one of your other Bobs first'); });
      if (need.length) need[0].closest('label')?.insertAdjacentHTML('beforebegin', '<p class="muted needs-first">To borrow, send jobs or ask for checks, <strong>pair one of your other Bobs first</strong> (Pair with my other Bobs, at the top).</p>');
    }
    if (refused) sayRefused(box, refused.sel, refused.text);
  };
  const draw = () => {
    box.innerHTML = `<h4 class="ssub">My other Bobs</h4>
      <div class="pair-box"><strong>Pair with my other Bobs</strong>${pairBox()}</div>
      <p class="muted">Bob picks the one that's free and has room for the chat, the one he used last first (he still has the chat in mind), then the fastest. This order breaks ties.</p>
      <ul class="share-list">${v.lenders.length ? v.lenders.map(row).join('') : '<li class="muted">None yet.</li>'}</ul>
      <div class="row"><button type="button" data-share-check>SUDDAR scan</button> <span class="tag">experimental</span> ${tip('Bob calls each of your Bobs and times the answer, there and back: under 8 ms is close (a cable, or good Wi-Fi), up to 40 ms is Wi-Fi close, more is far (Tailscale from outside, or a busy network). Bigger Bobs works best close; SCUT helps most on Wi-Fi.', 'SUDDAR scan')}</div>
      <h4 class="ssub">What they share <span class="tag">off unless you turn it on</span></h4>
      ${v.doorOpen ? '' : '<p class="muted door-off">These need <strong>Let my other replicant matrices in</strong>, just above.</p>'}
      <fieldset class="share-mode"><legend><strong>What my Bobs do together</strong> ${tip('More Bobs: each Bob runs his own brain, and they help each other with replies and jobs. Bigger Bobs: your Bobs also pool their graphics cards, so one Bob can run a brain too big for his own card.', 'What my Bobs do together')}</legend>
        <label class="lab-opt"><input type="radio" name="share-mode" value="more" data-share-mode ${v.mode !== 'bigger' ? 'checked' : ''}> <span><strong>More Bobs</strong> <span class="tag">the usual</span><br><span class="muted">Each Bob runs his own brain on his own card, so you can have more Bobs going at once.</span></span></label>
        <label class="lab-opt"><input type="radio" name="share-mode" value="bigger" data-share-mode ${v.mode === 'bigger' ? 'checked' : ''}> <span><strong>Bigger Bobs</strong><br><span class="muted">Your Bobs pool their graphics cards over your home network or Tailscale, so one Bob can run a brain bigger than his own card. Pick this on every Bob that should take part. Slower over Wi-Fi; a cable is best.</span></span></label>
      </fieldset>
      ${v.mode === 'bigger' ? `<div class="share-bigger">
      <label class="switch"><input type="checkbox" data-share-card ${v.lendCard ? 'checked' : ''}><span><strong>Lend my graphics card</strong> ${tip('Your other Bobs can ask for room on this replicant matrix\'s graphics card when they load a brain too big for their own. Only while they use it, only for the Bob that asked (a gate turns everything else away), and never while Bob is gaming: Gaming takes the card back.', 'Lend my graphics card')}<br><span class="muted keep">Sends and receives parts of the brain and the numbers it works on, with your own Bobs, over the home network or Tailscale. No chats and no files. Your own brain here gets less room while the card is lent.</span></span></label>
        <label class="switch"><input type="checkbox" data-share-scut ${v.scut ? 'checked' : ''}><span><strong>SCUT: Bob's fast link</strong> <span class="tag">experimental</span> <span class="tag">off unless you turn it on</span> ${tip('Bob\'s own way of sending the brain\'s numbers between your Bobs, made for Wi-Fi: a lost bit is sent again in a few milliseconds instead of a third of a second, and only the missing part. It keeps under its speed cap and slows down when the network is busy, so your other devices aren\'t crowded. Turn it on on both Bobs; if either has it off, or a firewall stops it, they use the usual link.', 'SCUT')}<br><span class="muted keep">Uses the card's port on UDP as well (the firewall button covers it). Same brain, same answers, just faster over Wi-Fi.</span></span></label>
        <label class="switch"><input type="checkbox" data-share-scutseal ${v.scutSeal !== false ? 'checked' : ''}><span><strong>Seal SCUT packets</strong> <span class="tag">on unless you turn it off</span> ${tip('Signs and scrambles every SCUT packet with a key only your two Bobs have, made when they paired. Nobody else on the network can read the brain\'s numbers, change them or slip in their own: anything that fails the check is thrown away. The cost is tiny next to Wi-Fi. With it on, a Bob only uses SCUT with another Bob that seals too; otherwise they use the usual link.', 'Seal SCUT packets')}<br><span class="muted keep">Used while SCUT is on. Keep it on unless you're testing.</span></span></label>
        <div class="row"><strong>SCUT speed cap:</strong> <select data-share-scutmbps>${[[50, 'up to 50 Mbit/s (gentlest)'], [100, 'up to 100 Mbit/s'], [300, 'up to 300 Mbit/s (a fast network)'], [400, 'up to 400 Mbit/s (a cable, or Wi-Fi 6 near the router)']].map(([n, label]) => `<option value="${n}" ${Number(v.scutMbps || 100) === n ? 'selected' : ''}>${label}</option>`).join('')}</select> <span class="muted">Used while SCUT is on. Mostly matters when a brain is first sent over. Words themselves need very little.</span></div>
        <label class="switch"><input type="checkbox" data-share-linkdebug ${v.linkDebug ? 'checked' : ''}><span><strong>Watch the link live</strong> <span class="tag">off unless you turn it on</span> ${tip('For finding out why pooled cards are slow. Bob always notes what the link between two cards carried, every 10 seconds it\'s busy. With this on he notes it every 2 seconds, on the next brain he loads over another Bob\'s card. Turn it on on both Bobs to see both ends.', 'Watch the link live')}<br><span class="muted keep">Each note says which link is in use (SCUT, or the usual one and why), how much went over it, how long each answer took, and how much of that wait was the network and how much the other card working. Kept on this machine only.</span></span></label>
        <div class="row"><strong>Link log:</strong> <button type="button" data-link-log-show>${linkText === null ? 'Show it' : 'Read it again'}</button> ${linkText ? '<button type="button" data-link-log-copy>Copy</button>' : ''} <span class="muted">The last notes, newest at the bottom. The whole log is the file bob-net-link.log in Bob's data folder.</span></div>
        ${linkText === null ? '' : `<pre class="link-log" data-link-log tabindex="0" aria-label="Link log" style="max-height:16em;overflow:auto;white-space:pre-wrap">${esc(linkText || 'Nothing yet. It fills in while a brain runs over another Bob\'s card.')}</pre>`}
        <div class="row"><strong>Wi-Fi band:</strong> <button type="button" data-wifi-check ${wifiBusy ? 'disabled' : ''}>Check</button> <button type="button" data-wifi-cal ${wifiBusy ? 'disabled' : ''}>Calibrate</button> ${v.wifiWas ? `<button type="button" data-wifi-back ${wifiBusy ? 'disabled' : ''}>Put it back</button>` : ''} ${tip('Pooled cards send every word over your home network and back, so the Wi-Fi band matters a lot. Windows picks the band by itself, and often picks a slow or weak one. Check shows which band this replicant matrix is on and what your router offers. Calibrate tries each band that\'s strong enough, times the trip to your other Bob on each, and sets the Wi-Fi card to the quickest. Windows only.', 'Calibrate Wi-Fi')} <span class="muted">Calibrate changes one setting of this replicant matrix's Wi-Fi card, so Windows asks once. The Wi-Fi drops for a few seconds at each try, so anything using the network pauses. Do it on each Bob that's on Wi-Fi.</span></div>
        ${wifiText ? `<p class="muted" role="status" aria-live="polite" data-wifi-say>${esc(wifiText)}</p>` : ''}
        <div class="row"><strong>Links to my Bobs:</strong> <button type="button" data-links-check ${wifiBusy ? 'disabled' : ''}>Check links</button> ${tip('Pooled cards are only as quick as the path between them. Check links shows what this replicant matrix has (Wi-Fi, a network port, a USB network dongle, USB4), every path to each of your Bobs with how long a trip takes, which one I use, and what would be faster. Best first: a USB4 or Thunderbolt cable between two machines that both have USB4, a network cable, powerline, then Wi-Fi. It only looks; nothing changes.', 'Check links')} <span class="muted">I use the quickest path by myself. Plug in a cable and I move to it, with nothing to set up.</span></div>
        ${linksText ? `<p class="muted" role="status" aria-live="polite" data-links-say style="white-space:pre-line">${esc(linksText)}</p>` : ''}
      <label class="switch"><input type="checkbox" data-share-homenet ${v.homeNet !== false ? 'checked' : ''}><span><strong>Use the home network first</strong> ${tip('When two of your Bobs are on the same home network, the brain\'s numbers go straight over it, which is quicker. Otherwise, or if that doesn\'t work, they go over Tailscale. The asking always goes over Tailscale with the passcode.', 'Use the home network first')}<br><span class="muted keep">While a card is lent, its gate is open on the home network for the Bob that asked, and turns everything else away.</span></span></label>
        <div class="row"><strong>Spread big brains over my other Bobs' cards:</strong> <select data-share-spread>${SPREAD.map(([id, label]) => `<option value="${id}" ${(v.spread || 'off') === id ? 'selected' : ''}>${label}</option>`).join('')}</select>
          <span class="muted">${esc(SPREAD.find((w) => w[0] === (v.spread || 'off'))?.[2] || '')} Your other Bobs need <strong>Lend my graphics card</strong> on. If none says yes, the brain loads here.</span></div>
      </div>` : ''}
      <label class="switch"><input type="checkbox" data-share-lend ${v.lend ? 'checked' : ''}><span><strong>Lend my brain</strong> ${tip('Your other Bobs can ask this Bob to think a quick reply. He only thinks and sends the words back. Nothing runs on this replicant matrix for them, and he keeps nothing. He says no while he\'s gaming or busy.', 'Lend my brain')}</span></label>
      <label class="switch"><input type="checkbox" data-share-take ${v.takeJobs ? 'checked' : ''}><span><strong>Take jobs from my other Bobs</strong> ${tip('Your other Bobs can hand this Bob whole jobs he has the models for: pictures, clips, music, sounds, web research or Medium-effort thinking, and checking their work on his Review brain when they have no room for theirs. He says no while gaming or when his queue is full. Their jobs can\'t touch files, programs, reminders or memory here. Finished files go back, and a copy stays in his save folder.', 'Take jobs from my other Bobs')}</span></label>
      <label class="switch"><input type="checkbox" data-share-lendchecks ${v.lendChecks ? 'checked' : ''}><span><strong>Check harder jobs for my other Bobs</strong> ${tip('When another of your Bobs does a job at High or Extreme effort, and this Bob\'s Review brain is bigger than his, this Bob can do the check. He thinks on his Review brain and sends the words back; the other Bob reads his own files. He says no while gaming or busy.', 'Check harder jobs for my other Bobs')}</span></label>
      <label class="switch"><input type="checkbox" data-share-borrow ${v.borrow.on ? 'checked' : ''}><span><strong>Borrow a brain</strong> ${tip('Bob asks one of your other Bobs to think, then runs the tools here himself, with his own OK cards. If none answers within a few seconds, Bob thinks it himself like always. Quick replies only: nothing on Medium or higher, and nothing with pictures.', 'Borrow a brain')}<br><span class="muted keep">Each time, the chat so far and what Bob remembers about you go to that Bob (your own replicant matrices on Tailscale only; it keeps none of it).</span></span></label>
      <div class="row"><strong>Borrow when:</strong> <select data-share-when>${WHEN.map(([id, label]) => `<option value="${id}" ${v.borrow.when === id ? 'selected' : ''}>${label}</option>`).join('')}</select>
        <span class="muted">${esc(WHEN.find((w) => w[0] === v.borrow.when)?.[2] || '')}</span></div>
      <label class="switch"><input type="checkbox" data-share-send ${v.borrow.jobs ? 'checked' : ''}><span><strong>Send jobs to my other Bobs</strong> ${tip('A job Bob can\'t do here, or one that would wait, goes to whichever of your other Bobs is free (least busy first). Jobs that need this replicant matrix always stay here. The job and the last few lines of the chat go to that Bob; the reply, OK cards and files come back.', 'Send jobs to my other Bobs')}</span></label>
      <label class="switch"><input type="checkbox" data-share-askchecks ${v.borrow.checks ? 'checked' : ''}><span><strong>Ask a bigger Bob to check my harder jobs</strong> ${tip('At High and Extreme effort, the check goes to one of your other Bobs whose Review brain is bigger than this one\'s and who has Check harder jobs for my other Bobs on. High asks the first in your list, Extreme the biggest. If none is free, Bob checks it himself.', 'Ask a bigger Bob to check my harder jobs')}<br><span class="muted keep">For each check, the job, Bob's answer and what he did go to that Bob (only your own Bobs on Bob-Net; that Bob keeps none of it).</span></span></label>
      <label class="switch"><input type="checkbox" data-share-pass ${v.passAlong ? 'checked' : ''}><span><strong>Pass my Bob-Net along</strong> ${tip('Your Bobs with this on introduce each other. When this Bob is paired with two Bobs that both have it on, they pair with each other too, with no card to press.', 'Pass my Bob-Net along')}<br><span class="muted keep">Sends your other Bobs each other's name and Tailscale address, nothing else; passcodes still pass only between the two being paired.</span></span></label>
      ${v.passAlong && v.introductions?.length ? `<ul class="share-list intro-list">${v.introductions.map((d) => `<li class="muted">${INTRO[d.state]?.(d) || esc(d.state)} <span class="muted">(${sinceShort(Date.now() - d.at)})</span></li>`).join('')}</ul>` : v.passAlong && v.lenders.length < 2 ? '<p class="muted">With two or more Bobs on the list, they get introduced to each other.</p>' : ''}
      ${msg ? `<p class="muted" role="status">${esc(msg)}</p>` : ''}
      <details class="more"><summary>More</summary><p class="muted"><strong>Add one by hand</strong> (if pairing can't reach it): its Tailscale address and the passcode from its <strong>Let my other replicant matrices in</strong>.</p>
      <form class="row" data-share-add><input name="name" placeholder="Name (Phone, Laptop…)" maxlength="40"> <input name="address" placeholder="100.x.y.z:7777 or name.ts.net:7777" required> <input name="passcode" type="password" placeholder="Its passcode" autocomplete="off"> <button>Add</button></form>
      <p class="muted">On the Bob that lends: turn on <strong>Let my other replicant matrices in</strong> and <strong>Lend my brain</strong>. Pairing puts the two Bobs on each other's lists; it doesn't switch anything on. Tailscale addresses only. What Bob sends for each reply is the chat so far and his instructions, including what he remembers about you. It only goes to your own replicant matrices on Tailscale, and the lender keeps none of it. Your phone can lend too, once Bob for Android has <strong>Lend my brain</strong>. A phone runs warm and uses battery while it thinks, so keep it plugged in while you game.</p></details>`;
    decorate();
  };
  const load = async () => { v = await api('/api/share-brains'); draw(); };
  // The link log: read when asked, and every 2 seconds after that while it's showing and "Watch the link live" is on.
  // Calibrate Wi-Fi (src/wifi-tune.js): Check reads, Calibrate tries each band and sets the best, Put it back undoes it.
  const wifi = async (data, wait) => {
    wifiBusy = true; wifiText = wait; draw();
    try { const j = await api('/api/share-brains/wifi', data); wifiText = j.text || ''; if ('wifiWas' in j) v.wifiWas = j.wifiWas; } catch (e) { wifiText = e.message; }
    wifiBusy = false; draw();
  };
  const readLink = async () => {
    try { const j = await api('/api/share-brains/link-log'); if (j.text === linkText) return; linkText = j.text || ''; } catch { return; }
    const at = box.querySelector('[data-link-log]'), low = !at || at.scrollTop + at.clientHeight >= at.scrollHeight - 8;
    draw();
    const now = box.querySelector('[data-link-log]'); if (now && low) now.scrollTop = now.scrollHeight;
  };
  setInterval(() => { if (box.isConnected && linkText !== null && v?.linkDebug && !box.contains(document.activeElement?.matches?.('input,select') ? document.activeElement : null)) readLink(); }, 2000);
  // After a pairing (either side), the list and the row's button catch up at once.
  const refresh = async () => { try { v = await api('/api/share-brains'); if (found?.bobs) found.bobs.forEach((f) => { f.paired = v.lenders.some((l) => l.address === f.address); }); draw(); } catch {} };
  window.addEventListener('bob-pair-done', () => { if (box.isConnected) refresh(); });
  let refused = null; // { sel, text }: the switch just turned down, and why (shown under it)
  const change = async (patch, el = null) => {
    const sel = switchSelector(el);
    try { v = await api('/api/share-brains', patch); msg = ''; refused = null; } catch (e) { if (sel) { refused = { sel, text: e.message }; msg = ''; } else msg = e.message; }
    draw();
  };
  box.addEventListener('change', (ev) => {
    const e = ev, ch = (patch) => change(patch, ev.target.type === 'checkbox' ? ev.target : null);
    if (e.target.matches('[data-share-lend]')) ch({ lend: e.target.checked });
    if (e.target.matches('[data-share-take]')) ch({ takeJobs: e.target.checked });
    if (e.target.matches('[data-share-pass]')) ch({ passAlong: e.target.checked });
    if (e.target.matches('[data-share-lendchecks]')) ch({ lendChecks: e.target.checked });
    if (e.target.matches('[data-share-askchecks]')) ch({ askChecks: e.target.checked, check: e.target.checked });
    if (e.target.matches('[data-share-mode]')) ch({ mode: e.target.value, check: e.target.value === 'bigger' });
    if (e.target.matches('[data-share-homenet]')) ch({ homeNet: e.target.checked });
    if (e.target.matches('[data-share-scut]')) ch({ scut: e.target.checked });
    if (e.target.matches('[data-share-scutseal]')) ch({ scutSeal: e.target.checked });
    if (e.target.matches('[data-share-linkdebug]')) ch({ linkDebug: e.target.checked });
    if (e.target.matches('[data-share-scutmbps]')) ch({ scutMbps: Number(e.target.value) });
    if (e.target.matches('[data-share-card]')) ch({ lendCard: e.target.checked });
    if (e.target.matches('[data-share-spread]')) ch({ spread: e.target.value, check: e.target.value !== 'off' });
    if (e.target.matches('[data-share-send]')) ch({ sendJobs: e.target.checked, check: e.target.checked });
    if (e.target.matches('[data-share-borrow]')) ch({ borrow: e.target.checked, check: e.target.checked });
    if (e.target.matches('[data-share-when]')) ch({ when: e.target.value });
  });
  box.addEventListener('submit', (e) => {
    if (e.target.matches('[data-pair-by-address]')) { e.preventDefault(); pair(new FormData(e.target).get('address')); return; }
    if (!e.target.matches('[data-share-add]')) return;
    e.preventDefault();
    const f = new FormData(e.target);
    change({ addBob: { name: f.get('name'), address: f.get('address'), passcode: f.get('passcode') }, check: true });
  });
  box.addEventListener('click', (e) => {
    if (e.target.closest('[data-link-log-show]')) { if (linkText === null) linkText = ''; readLink().then(draw); return; }
    if (e.target.closest('[data-links-check]')) { (async () => { wifiBusy = true; linksText = 'Looking…'; draw(); try { linksText = (await api('/api/share-brains/links')).text || ''; } catch (err) { linksText = err.message; } wifiBusy = false; draw(); })(); return; }
    if (e.target.closest('[data-wifi-check]')) { wifi(undefined, 'Looking…'); return; }
    if (e.target.closest('[data-wifi-cal]')) { wifi({ calibrate: true }, 'Calibrating. Windows asks once, then I try each band; it takes about a minute and the Wi-Fi drops for a few seconds at each try.'); return; }
    if (e.target.closest('[data-wifi-back]')) { wifi({ putBack: true }, 'Windows asks once…'); return; }
    if (e.target.closest('[data-link-log-copy]')) { navigator.clipboard?.writeText(linkText || '').catch(() => {}); return; }
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

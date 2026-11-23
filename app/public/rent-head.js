// Nov 18 2026 (the owner): a rented brain is a chat head on the left like the others, with its own saved chat, and
// while it runs "a timer for the session, counting down to its session limit, and a continually updated cost
// projection". The server sends times (ms since 1970) and prices (src/rental.js Rentals.status); this file turns them
// into the words and the ring, and counts down by itself between looks. Display only: nothing here goes to a brain.

export const isRentChat = (id) => /^rent-[a-z0-9]{6,12}$/.test(String(id || ''));
// A rented brain's head: an amber cube with a crane sign of our own (never a service's logo).
export const RENT_LOOK = { hue: 36, sat: 80, sign: 'crane' };

const usd = (n) => (n == null || !Number.isFinite(Number(n)) ? '' : Number(n) > 0 && Number(n) < 0.01 ? 'under 1 cent' : `$${(Math.round(Number(n) * 100) / 100).toFixed(2)}`);
export const clock = (ms) => {
  const s = Math.max(0, Math.round((Number(ms) || 0) / 1000));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}` : `${m}:${String(sec).padStart(2, '0')}`;
};

// The page's clock may differ from Bob's: skew = Bob's now minus the page's now, when it was read.
export function live(h, pageNow = Date.now(), skew = 0) {
  if (!h) return null;
  const now = pageNow + skew;
  const running = ['starting', 'working', 'warm'].includes(h.state);
  const perMs = (Number(h.perHour) || 0) / 3600000;
  const grow = running && h.kind === 'machine' && h.now ? Math.max(0, now - h.now) * perMs : 0; // money keeps ticking between looks
  const soFar = (Number(h.usd) || 0) + grow;
  const left = running && h.endsAt ? Math.max(0, h.endsAt - now) : null;
  const warmLeft = h.state === 'warm' && h.warmUntil ? Math.max(0, h.warmUntil - now) : null;
  const total = running && h.endsAt && h.startedAt ? Math.max(1, h.endsAt - h.startedAt) : null;
  const atLimit = running && h.kind === 'machine' && left != null ? soFar + left * perMs : null;
  const ifWarmEnds = warmLeft != null && h.kind === 'machine' ? soFar + warmLeft * perMs : null;
  const since = running && (h.askedAt || h.startedAt) ? Math.max(0, now - (h.askedAt || h.startedAt)) : null;
  return { running, soFar, left, warmLeft, since, frac: total && left != null && h.state !== 'starting' ? left / total : null, atLimit, ifWarmEnds };
}

// The few words under the head's name (its tip) and on the head's ring.
export function headWords(h, l = live(h)) {
  if (!h) return '';
  if (h.state === 'answer') return `Pay per answer · ${usd(h.usd) || '$0.00'} today`;
  if (h.state === 'off') return h.ready ? `Not running · about ${usd(h.perHour)} an hour` : 'Not ready yet: see Settings, Online services';
  if (h.state === 'starting') { const st = (h.stages || []).at(-1); return [st ? `${st.label}${st.pct != null ? ` ${Math.round(st.pct)}%` : ''}` : 'Starting', l.since != null && clock(l.since), `${usd(l.soFar) || '$0.00'} so far`].filter(Boolean).join(' · '); }
  const bits = [h.state === 'warm' ? 'Waiting for you' : 'Working', l.left != null && `${clock(l.left)} left`, `${usd(l.soFar)} so far`];
  return bits.filter(Boolean).join(' · ');
}

// The bar at the top of a rented brain's chat: countdown, cost so far, the projection, keep-warm, and the way back.
export function barParts(h, l = live(h)) {
  if (!h) return { title: 'Rented brain', line: 'This rented brain is gone from Settings.', facts: [], steps: [], canStop: false };
  const where = [h.service, h.kind === 'answer' ? 'pay per answer' : h.kind === 'serverless' ? 'serverless' : 'a machine by the minute'].filter(Boolean).join(' · ');
  const facts = [];
  if (h.state === 'answer') {
    facts.push(['Spent today', usd(h.usd) || '$0.00']);
  } else if (h.state === 'off') {
    facts.push(['Price', `about ${usd(h.perHour)} an hour`]);
    if (h.maxMinutes) facts.push(['Session limit', `${h.maxMinutes} min`]);
    if (h.warmMinutes) facts.push(['Keep warm', `${h.warmMinutes} min after each answer`]);
  } else {
    if (h.state === 'starting' && l.since != null) facts.push(['Starting for', clock(l.since)]);
    else if (l.left != null) facts.push(['Time left', `${clock(l.left)} of ${h.maxMinutes} min`]);
    facts.push(['So far', usd(l.soFar) || '$0.00']);
    if (l.atLimit != null) facts.push(['If it runs to the limit', `about ${usd(l.atLimit)}`]);
    if (l.warmLeft != null) facts.push(['Stops if you send nothing', `in ${clock(l.warmLeft)} (about ${usd(l.ifWarmEnds)} in all)`]);
    else if (h.state === 'working' && h.warmMinutes) facts.push(['Keep warm', `${h.warmMinutes} min after this answer`]);
  }
  if (h.monthCap) facts.push(['This month', `${usd(h.monthUsd) || '$0.00'} of ${usd(h.monthCap)}`]);
  // Nov 18 (the owner: "you don't know what's happening with the rental"): every start-up step, when it came (from
  // the moment it was asked for) and what had been spent by then. After a stop, the last run's steps stay here.
  const list = h.stages || [];
  const t0 = list[0]?.at || h.askedAt || h.startedAt || 0;
  const steps = list.map((x, i) => ({ label: x.label || x.step, when: x.at && t0 ? `+${clock(x.at - t0)}` : '', usd: usd(x.usd) || '$0.00', detail: x.detail || '', pct: x.pct ?? null, now: i === list.length - 1 && h.state === 'starting' }));
  const line = h.state === 'off' && h.stoppedAt ? `Stopped${h.stopWhy ? `: ${h.stopWhy}` : ''}. Your next message here starts it again, after the Hire it card if it needs one.`
    : h.state === 'off' ? (h.ready ? 'Not running. Your first message here shows the Hire it card first; nothing is spent before you press it.' : 'Not ready yet: switch its service on and set the limits in Settings, Online services.')
    : h.state === 'starting' ? `${list.at(-1)?.label || 'Starting'}${list.at(-1)?.pct != null ? ` (${Math.round(list.at(-1).pct)}%)` : ''}. A machine can take 5 to 10 minutes, longer while the service finds one. Stop works the whole time.`
    : h.state === 'warm' ? 'Kept warm for your next message.'
    : h.state === 'working' ? 'Working on your message.' : 'Every message here goes to this rented brain. Hands, tools and web search still run on this computer.';
  return { title: h.name, where, line, facts, steps, canStop: ['starting', 'working', 'warm'].includes(h.state) && h.kind !== 'answer' };
}

// The countdown ring around the head: the part of the session limit still left, amber, red in the last 5 minutes.
export function drawRing(x, frac, { size = 96, warn = false } = {}) {
  if (frac == null) return;
  const r = size / 2 - 3;
  x.save();
  x.lineWidth = 4; x.lineCap = 'round';
  x.strokeStyle = 'rgba(255,255,255,0.12)'; x.beginPath(); x.arc(size / 2, size / 2, r, 0, Math.PI * 2); x.stroke();
  x.strokeStyle = warn ? 'hsl(4, 80%, 60%)' : 'hsl(36, 90%, 62%)';
  x.beginPath(); x.arc(size / 2, size / 2, r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.max(0, Math.min(1, frac))); x.stroke();
  x.restore();
}

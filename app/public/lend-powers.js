// Nov 13 (the owner): "if the main brain has hands on or autonomy or screen use, the other computers sharing resources to
// host it should display that too over bob net." While this Bob lends its graphics card to help run another Bob's
// brain, and that brain has Hands, Autonomy or Screen use on over there, a strip above the chat says so plainly.
// It goes the moment they're off or the lend ends. The asking Bob says what's on with every keep (every 5 s).
import { esc } from './util.js';

export const powersLine = (p, to) => {
  const on = [p?.hands && 'Hands', p?.autonomy && 'Autonomy', p?.screen && 'Screen use'].filter(Boolean);
  if (!on.length) return '';
  const list = on.length > 1 ? `${on.slice(0, -1).join(', ')} and ${on[on.length - 1]}` : on[0];
  return `This replicant matrix's graphics card is helping run ${to || 'another Bob'}'s brain, and that brain has ${list} on over there${p.autonomy ? ', so it acts without asking first' : ''}.`;
};

export function createLendPowersBanner() {
  const el = document.createElement('div');
  el.className = 'lend-powers';
  el.setAttribute('role', 'status');
  el.hidden = true;
  const log = document.getElementById('log');
  log?.parentNode?.insertBefore(el, log);
  const draw = (p, to) => { const t = powersLine(p, to); el.hidden = !t; el.innerHTML = t ? `🖐 ${esc(t)}` : ''; };
  fetch('/api/lend/powers').then((r) => r.json()).then((v) => draw(v.powers, v.to)).catch(() => {});
  return { update(ev) { draw(ev?.powers, ev?.to); } };
}

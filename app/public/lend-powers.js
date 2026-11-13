// Nov 13 (the owner): "if the main brain has hands on or autonomy or screen use, the other computers sharing resources to
// host it should display that too over bob net." While this Bob lends its graphics card to help run another Bob's
// brain, and that brain has Hands, Autonomy or Screen use on over there, a small 🖐 badge sits on the corner of Bob's
// picture (by the cube). Nothing above the chat: the owner finds full-width strips there distracting (Nov 13).
// Hover or tap the badge for the whole sentence in a small see-through bubble. It goes the moment they're off or the
// lend ends. The asking Bob says what's on with every keep (every 5 s).
import { esc } from './util.js';

export const powersLine = (p, to) => {
  const on = [p?.hands && 'Hands', p?.autonomy && 'Autonomy', p?.screen && 'Screen use'].filter(Boolean);
  if (!on.length) return '';
  const list = on.length > 1 ? `${on.slice(0, -1).join(', ')} and ${on[on.length - 1]}` : on[0];
  return `This replicant matrix's graphics card is helping run ${to || 'another Bob'}'s brain, and that brain has ${list} on over there${p.autonomy ? ', so it acts without asking first' : ''}.`;
};

export function createLendPowersBadge(doc = document) {
  const btn = doc.createElement('button');
  btn.type = 'button';
  btn.className = 'lend-powers-badge';
  btn.hidden = true;
  btn.textContent = '🖐';
  btn.setAttribute('aria-expanded', 'false');
  const note = doc.createElement('div');
  note.className = 'lend-powers-note';
  note.setAttribute('role', 'status');
  note.hidden = true;
  const home = doc.querySelector('.bob-wrap') || doc.body;
  home.append(btn, note);
  const show = (on) => { note.hidden = !on || btn.hidden; btn.setAttribute('aria-expanded', String(!note.hidden)); };
  btn.addEventListener('click', () => show(note.hidden));
  btn.addEventListener('blur', () => show(false));
  const draw = (p, to) => {
    const t = powersLine(p, to);
    btn.hidden = !t;
    btn.title = t;
    btn.setAttribute('aria-label', t || 'Lent card');
    note.innerHTML = t ? esc(t) : '';
    if (!t) show(false);
  };
  fetch('/api/lend/powers').then((r) => r.json()).then((v) => draw(v.powers, v.to)).catch(() => {});
  return { update(ev) { draw(ev?.powers, ev?.to); } };
}
